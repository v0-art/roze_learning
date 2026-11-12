import type {PoolClient} from 'pg';
import {requireMentor} from './courses';
import {readV3Content,validateV3} from '../v3-contracts';
import JSZip from 'jszip';
import crypto from 'node:crypto';
import fs from 'node:fs';import path from 'node:path';

const invalid=(message:string)=>Object.assign(new Error(message),{code:'INVALID_INPUT'});
function decode(input:unknown):Buffer{
 if(typeof input!=='string'||input.length>11_184_812||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input))throw invalid('Ожидается ZIP-пакет в base64.');
 return Buffer.from(input,'base64');
}
async function changes(db:PoolClient,courseId:string,entries:Awaited<ReturnType<typeof readV3Content>>['entries']){
 const result=[];
 for(const entry of entries){
  const found=await db.query(`SELECT e.kind,r.revision,r.content_sha256 FROM v3_content_entities e LEFT JOIN LATERAL (SELECT revision,content_sha256 FROM v3_content_revisions WHERE course_id=e.course_id AND entity_id=e.id ORDER BY revision DESC LIMIT 1) r ON true WHERE e.course_id=$1 AND e.id=$2`,[courseId,entry.id]);
  if(found.rowCount&&found.rows[0].kind!==entry.kind)throw invalid(`ID ${entry.id} уже относится к другому типу.`);
  const row=found.rows[0];const unchanged=row?.content_sha256&&Buffer.from(row.content_sha256).equals(entry.hash);
  result.push({id:entry.id,kind:entry.kind,action:!row?'create':unchanged?'unchanged':'update',revision:unchanged?row.revision:(row?.revision||0)+1});
 }
 return result;
}
async function checkReferences(db:PoolClient,courseId:string,entries:Awaited<ReturnType<typeof readV3Content>>['entries']){
 const local=new Map(entries.map(entry=>[entry.id,entry.kind]));
 async function exists(id:string,kinds:string[]){if(local.has(id))return kinds.includes(local.get(id)!);const result=await db.query(`SELECT kind FROM v3_content_entities WHERE course_id=$1 AND id=$2 UNION ALL SELECT 'module' FROM course_modules WHERE course_id=$1 AND id=$2 UNION ALL SELECT 'topic' FROM course_topics WHERE course_id=$1 AND id=$2 UNION ALL SELECT 'lesson' FROM course_lessons WHERE course_id=$1 AND id=$2 UNION ALL SELECT 'skill' FROM course_skills WHERE course_id=$1 AND id=$2`,[courseId,id]);return result.rows.some(row=>kinds.includes(row.kind))}
 for(const entry of entries){const v=entry.value;
  if(v.moduleId&&entry.kind!=='module'&&!await exists(v.moduleId,['module']))throw invalid(`Отсутствует модуль ${v.moduleId}.`);
  for(const id of v.topicIds||[])if(!await exists(id,['topic']))throw invalid(`Отсутствует тема ${id}.`);
  for(const id of v.content?.skillIds||[])if(!await exists(id,['skill']))throw invalid(`Отсутствует навык ${id}.`);
  for(const ticket of v.content?.tickets||[])if(ticket.topicId&&!await exists(ticket.topicId,['topic']))throw invalid(`Отсутствует тема билета ${ticket.topicId}.`);
  if(v.content?.assessmentBankId&&!await exists(v.content.assessmentBankId,['assessment_bank']))throw invalid(`Отсутствует банк ${v.content.assessmentBankId}.`);
  if(entry.kind==='curriculum_plan')for(const item of v.items)if(!await exists(item.id,[item.kind]))throw invalid(`В плане отсутствует мероприятие ${item.id}.`);
 }
}
export async function previewV3Content(db:PoolClient,actor:string,courseId:string,encoded:unknown){
 await requireMentor(db,actor,courseId,'can_manage_content');
 const pack=await readV3Content(decode(encoded));await checkReferences(db,courseId,pack.entries);const warnings=pack.entries.filter(entry=>entry.kind==='curriculum_plan'&&entry.value.courseId!==courseId).map(entry=>`План ${entry.id}: в файле указан курс ${entry.value.courseId}; пакет сохраняется в выбранном курсе ${courseId}, исходный идентификатор остаётся в содержимом.`);const provisional=pack.entries.filter(entry=>['control_work','exam'].includes(entry.kind)&&entry.value.content?.rubric?.draftOnly===true).map(entry=>entry.id);if(provisional.length)warnings.push(`Тестовые критерии в аттестациях ${provisional.join(', ')}: перед публикацией нужна утверждённая редакция.`);return {packageId:pack.manifest.packageId,changes:await changes(db,courseId,pack.entries),warnings};
}
export async function listV3Content(db:PoolClient,actor:string,courseId:string){
 await requireMentor(db,actor,courseId,'can_manage_content');
 const rows=await db.query(`SELECT e.id,e.kind,e.published_revision AS "publishedRevision",r.revision AS "latestRevision",COALESCE(r.content->>'title',e.id) AS title,r.content->>'moduleId' AS "moduleId",r.content->'topicIds' AS "topicIds" FROM v3_content_entities e JOIN LATERAL (SELECT revision,content FROM v3_content_revisions WHERE course_id=e.course_id AND entity_id=e.id ORDER BY revision DESC LIMIT 1) r ON true WHERE e.course_id=$1 ORDER BY e.kind,e.id`,[courseId]);
 return rows.rows;
}
/** Build a reviewable initial plan using explicitly selected existing content. */
export async function previewV3Starter(db:PoolClient,actor:string,courseId:string,input:any){
 await requireMentor(db,actor,courseId,'can_manage_content');
 const {moduleId,lessonId,planId,required}=input||{};
 if([moduleId,lessonId,planId].some(v=>typeof v!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(v))||typeof required!=='boolean')throw invalid('Выберите модуль, занятие и обязательность; укажите код плана.');
 const found=await db.query(`SELECT e.id,e.kind,r.content FROM v3_content_entities e JOIN LATERAL (SELECT content FROM v3_content_revisions WHERE course_id=e.course_id AND entity_id=e.id ORDER BY revision DESC LIMIT 1) r ON true WHERE e.course_id=$1 AND e.id=ANY($2::text[])`,[courseId,[moduleId,lessonId,planId]]);
 const module=found.rows.find(row=>row.id===moduleId&&row.kind==='module'),lesson=found.rows.find(row=>row.id===lessonId&&row.kind==='lesson');if(!module||!lesson||lesson.content.moduleId!==moduleId)throw invalid('Выбранное занятие не относится к модулю.');
 if(found.rows.some(row=>row.id===planId))throw invalid('Код плана уже используется. Начальный план не заменяет существующий.');
 const existingPlan=await db.query(`SELECT 1 FROM v3_content_entities e JOIN LATERAL (SELECT content FROM v3_content_revisions WHERE course_id=e.course_id AND entity_id=e.id ORDER BY revision DESC LIMIT 1) r ON true WHERE e.course_id=$1 AND e.kind='curriculum_plan' AND r.content->>'moduleId'=$2`,[courseId,moduleId]);if(existingPlan.rowCount)throw invalid('Для этого модуля уже есть учебный план.');
 const regulations=await db.query("SELECT id FROM v3_content_entities WHERE course_id=$1 AND kind='regulation'",[courseId]);if(regulations.rowCount!>1)throw invalid('В курсе несколько регламентов; выберите один перед началом работы.');
 const zip=new JSZip(),entries:any[]=[{id:planId,kind:'curriculum_plan',path:'plan.json'}];const plan={format:'rozephyr-curriculum-plan',formatVersion:'1.0',courseId,moduleId,items:[{id:lessonId,kind:'lesson',position:1,required,blocksNext:false,topicIds:lesson.content.topicIds}]};zip.file('plan.json',JSON.stringify(plan,null,2));
 if(!regulations.rowCount){const id='ROZEPHYR-REGULATION-3';if(found.rows.some(row=>row.id===id)||(await db.query('SELECT 1 FROM v3_content_entities WHERE course_id=$1 AND id=$2',[courseId,id])).rowCount)throw invalid('Код стандартного регламента занят другой сущностью.');entries.push({id,kind:'regulation',path:'regulation.json'});zip.file('regulation.json',JSON.stringify({id,kind:'regulation',title:'Регламент Rozephyr Learning 3.0',version:1,status:'draft',content:{textPath:'regulation.md'}},null,2));zip.file('regulation.md',fs.readFileSync(path.join(process.cwd(),'contracts/rozephyr-v1/docs/01_REGULATION_V3.md'),'utf8'))}
 zip.file('manifest.json',JSON.stringify({format:'rozephyr-content',formatVersion:'1.0',packageId:`starter-${crypto.randomUUID()}`,scope:'mixed',createdAt:new Date().toISOString(),source:'mentor-starter-plan',entries},null,2));
 const encoded=(await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'})).toString('base64');return {...await previewV3Content(db,actor,courseId,encoded),zipBase64:encoded,expected:{id:planId,revision:0}};
}
/** Prepare an additive revision of a plan; the import checks the revision again under lock. */
export async function previewV3PlanItem(db:PoolClient,actor:string,courseId:string,input:any){
 await requireMentor(db,actor,courseId,'can_manage_content');const {planId,itemId,position,required,replaceExisting=false}=input||{};
 if([planId,itemId].some(v=>typeof v!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(v))||!Number.isSafeInteger(position)||position<1||position>100000||typeof required!=='boolean'||typeof replaceExisting!=='boolean')throw invalid('Выберите план и мероприятие, укажите позицию и обязательность.');
 const result=await db.query(`SELECT e.id,e.kind,r.revision,r.content FROM v3_content_entities e JOIN LATERAL (SELECT revision,content FROM v3_content_revisions WHERE course_id=e.course_id AND entity_id=e.id ORDER BY revision DESC LIMIT 1) r ON true WHERE e.course_id=$1 AND e.id=ANY($2::text[])`,[courseId,[planId,itemId]]);
 const plan=result.rows.find(row=>row.id===planId&&row.kind==='curriculum_plan'),item=result.rows.find(row=>row.id===itemId&&['lesson','remedial','control_work','exam'].includes(row.kind));
 if(!plan||!item||item.content.moduleId!==plan.content.moduleId)throw invalid('Мероприятие не найдено или относится к другому модулю.');
 const existing=plan.content.items.some((value:any)=>value.id===itemId);if(existing!==replaceExisting)throw invalid(existing?'Мероприятие уже присутствует; выберите изменение существующего.':'Мероприятие отсутствует; выберите добавление нового.');if(plan.content.items.some((value:any)=>value.id!==itemId&&value.position===position))throw invalid('Позиция уже присутствует в плане.');
 const blocksNext=['lesson','remedial'].includes(item.kind)?false:item.content.content?.blocksNext;if(typeof blocksNext!=='boolean')throw invalid('Для аттестации не задана блокировка.');
 const replacement={id:item.id,kind:item.kind,position,required,blocksNext,topicIds:item.content.topicIds};const next={...plan.content,items:replaceExisting?plan.content.items.map((value:any)=>value.id===itemId?replacement:value):[...plan.content.items,replacement]};const zip=new JSZip();zip.file('plan.json',JSON.stringify(next,null,2));zip.file('manifest.json',JSON.stringify({format:'rozephyr-content',formatVersion:'1.0',packageId:`plan-${crypto.randomUUID()}`,scope:'mixed',createdAt:new Date().toISOString(),source:'mentor-plan-editor',entries:[{id:planId,kind:'curriculum_plan',path:'plan.json'}]},null,2));
 const encoded=(await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'})).toString('base64');return {...await previewV3Content(db,actor,courseId,encoded),zipBase64:encoded,expected:{id:planId,revision:plan.revision}};
}
export async function readV3AssessmentDraft(db:PoolClient,actor:string,courseId:string,id:string){
 await requireMentor(db,actor,courseId,'can_manage_content');const result=await db.query(`SELECT e.kind,r.revision,r.content FROM v3_content_entities e JOIN LATERAL (SELECT revision,content FROM v3_content_revisions WHERE course_id=e.course_id AND entity_id=e.id ORDER BY revision DESC LIMIT 1) r ON true WHERE e.course_id=$1 AND e.id=$2 AND e.kind IN ('control_work','exam')`,[courseId,id]);if(!result.rowCount)throw Object.assign(new Error('Аттестация не найдена.'),{code:'NOT_FOUND'});const row=result.rows[0];return {id,revision:row.revision,rubric:row.content.content.rubric,blocksNext:row.content.content.blocksNext};
}
export async function previewV3AssessmentRules(db:PoolClient,actor:string,courseId:string,id:string,input:any){
 await requireMentor(db,actor,courseId,'can_manage_content');if(!input||typeof input.rubric!=='object'||!input.rubric||Array.isArray(input.rubric)||typeof input.blocksNext!=='boolean'||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||Buffer.byteLength(JSON.stringify(input.rubric),'utf8')>100000)throw invalid('Укажите рубрику, редакцию и признак блокировки.');
 const current=await db.query(`SELECT e.kind,r.revision,r.content,r.assets FROM v3_content_entities e JOIN LATERAL (SELECT revision,content,assets FROM v3_content_revisions WHERE course_id=e.course_id AND entity_id=e.id ORDER BY revision DESC LIMIT 1) r ON true WHERE e.course_id=$1 AND e.id=$2 AND e.kind IN ('control_work','exam')`,[courseId,id]);if(!current.rowCount)throw Object.assign(new Error('Аттестация не найдена.'),{code:'NOT_FOUND'});const row=current.rows[0];if(row.revision!==input.expectedRevision)throw Object.assign(new Error('Материал изменён; откройте критерии заново.'),{code:'CONFLICT'});const value={...row.content,content:{...row.content.content,rubric:input.rubric,blocksNext:input.blocksNext}};
 const zip=new JSZip();for(const [name,text] of Object.entries(row.assets as Record<string,string>))zip.file(name,text);zip.file('assessment.json',JSON.stringify(value,null,2));zip.file('manifest.json',JSON.stringify({format:'rozephyr-content',formatVersion:'1.0',packageId:`assessment-${crypto.randomUUID()}`,scope:'item',createdAt:new Date().toISOString(),source:'mentor-assessment-editor',entries:[{id,kind:row.kind,path:'assessment.json'}]},null,2));const encoded=(await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'})).toString('base64');return {...await previewV3Content(db,actor,courseId,encoded),zipBase64:encoded,expected:{id,revision:row.revision}};
}
/** Read-only inventory; missing legacy control rules must never be assigned implicitly. */
export async function previewV3Migration(db:PoolClient,actor:string,courseId:string){
 await requireMentor(db,actor,courseId,'can_manage_content');
 const counts=await db.query(`SELECT
  (SELECT count(*)::int FROM course_modules WHERE course_id=$1) AS modules,
  (SELECT count(*)::int FROM course_topics WHERE course_id=$1) AS topics,
  (SELECT count(*)::int FROM course_lessons WHERE course_id=$1) AS lessons,
  (SELECT count(*)::int FROM lesson_versions WHERE course_id=$1) AS lesson_versions,
  (SELECT count(*)::int FROM exam_tickets WHERE course_id=$1 AND archived_at IS NULL) AS tickets,
  (SELECT count(*)::int FROM prompt_snapshots WHERE course_id=$1) AS snapshots,
  (SELECT count(*)::int FROM lesson_attempts WHERE course_id=$1) AS attempts,
  (SELECT count(*)::int FROM homework_assignments WHERE course_id=$1 AND status IN ('assigned','submitted','needs_revision','not_submitted')) AS open_homework,
  (SELECT count(*)::int FROM knowledge_gaps WHERE course_id=$1 AND status='needs-review') AS open_gaps`,[courseId]);
 const assessments=await db.query(`SELECT e.id,e.title,e.definition_type,e.status,s.max_score,s.theory_1_weight,s.theory_2_weight,s.practical_weight,s.blocks_next,(s.exam_id IS NOT NULL) AS settings_saved FROM course_exams e LEFT JOIN v3_assessment_settings s ON s.course_id=e.course_id AND s.exam_id=e.id WHERE e.course_id=$1 ORDER BY e.module_id,e.id`,[courseId]);
 return {counts:counts.rows[0],assessments:assessments.rows,ready:false};
}
export async function saveV3AssessmentSettings(db:PoolClient,actor:string,courseId:string,id:string,input:any){
 const score=input?.maxScore,weights=[input?.theory1,input?.theory2,input?.practical],blocks=input?.blocksNext;
 if(score!==null&&(typeof score!=='number'||!Number.isFinite(score)||score<=0||score>1_000_000))throw invalid('Укажите положительный максимальный балл.');
 if(!(blocks===null||typeof blocks==='boolean'))throw invalid('Выберите режим блокировки или оставьте его не заданным.');
 if(!weights.every(value=>value===null)&&!(score!==null&&weights.every(value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0)&&Number.isSafeInteger(score)&&weights.reduce((a,b)=>a+b,0)===score))throw invalid('Укажите все три целых веса с суммой, равной максимуму, либо оставьте все веса пустыми.');
 await db.query('BEGIN');try{
  await requireMentor(db,actor,courseId,'can_manage_content');
  const found=await db.query('SELECT 1 FROM course_exams WHERE course_id=$1 AND id=$2 FOR UPDATE',[courseId,id]);if(!found.rowCount)throw Object.assign(new Error('Аттестация не найдена.'),{code:'NOT_FOUND'});
  await db.query(`INSERT INTO v3_assessment_settings(course_id,exam_id,max_score,theory_1_weight,theory_2_weight,practical_weight,blocks_next,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
   ON CONFLICT(course_id,exam_id) DO UPDATE SET max_score=EXCLUDED.max_score,theory_1_weight=EXCLUDED.theory_1_weight,theory_2_weight=EXCLUDED.theory_2_weight,practical_weight=EXCLUDED.practical_weight,blocks_next=EXCLUDED.blocks_next,updated_by=EXCLUDED.updated_by,updated_at=now()`,[courseId,id,score,...weights,blocks,actor]);
  await db.query("INSERT INTO course_audit_events(course_id,actor_id,action,target_type,target_id,new_value) VALUES($1,$2,'SET_V3_ASSESSMENT_RULES','EXAM',$3,$4)",[courseId,actor,id,JSON.stringify({maxScore:score,weights,blocksNext:blocks})]);
  await db.query('COMMIT');return {id};
 }catch(error){await db.query('ROLLBACK');throw error}
}
export async function importV3Content(db:PoolClient,actor:string,courseId:string,encoded:unknown,expected?:unknown,autoPublish=false){
 await requireMentor(db,actor,courseId,'can_manage_content');const pack=await readV3Content(decode(encoded));
 if(autoPublish){const drafts=pack.entries.filter(entry=>['control_work','exam'].includes(entry.kind)&&entry.value.content?.rubric?.draftOnly===true).map(entry=>entry.id);if(drafts.length)throw invalid(`Архив содержит тестовые критерии аттестаций: ${drafts.join(', ')}. Загрузите исправленный архив с утверждёнными правилами.`)}
 if(expected!==undefined&&(!expected||typeof expected!=='object'||typeof (expected as any).id!=='string'||!Number.isSafeInteger((expected as any).revision)||(expected as any).revision<0||!pack.entries.some(entry=>['curriculum_plan','control_work','exam'].includes(entry.kind)&&entry.id===(expected as any).id)))throw invalid('Некорректная проверка редакции.');
 await db.query('BEGIN');try{
  await requireMentor(db,actor,courseId,'can_manage_content');await db.query('SELECT 1 FROM courses WHERE id=$1 FOR UPDATE',[courseId]);
  if(expected){const value=expected as {id:string;revision:number},current=await db.query('SELECT COALESCE(max(revision),0)::int AS revision FROM v3_content_revisions WHERE course_id=$1 AND entity_id=$2',[courseId,value.id]);if(current.rows[0].revision!==value.revision)throw Object.assign(new Error('Материал изменён после проверки. Повторите предварительный просмотр.'),{code:'CONFLICT'})}
  await checkReferences(db,courseId,pack.entries);const diff=await changes(db,courseId,pack.entries);
  for(let i=0;i<pack.entries.length;i++){
   const entry=pack.entries[i],change=diff[i];if(change.action==='unchanged')continue;
   if(change.action==='create')await db.query('INSERT INTO v3_content_entities(course_id,id,kind) VALUES($1,$2,$3)',[courseId,entry.id,entry.kind]);
   const content=entry.kind==='curriculum_plan'?entry.value:{...entry.value,version:change.revision,status:'draft'};
   await db.query('INSERT INTO v3_content_revisions(course_id,entity_id,revision,kind,content,assets,content_sha256,author_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[courseId,entry.id,change.revision,entry.kind,JSON.stringify(content),JSON.stringify(entry.assets),entry.hash,actor]);
  }
  if(diff.some(item=>item.action!=='unchanged'))await db.query("INSERT INTO course_audit_events(course_id,actor_id,action,target_type,target_id,reason) VALUES($1,$2,'IMPORT_V3_CONTENT','COURSE',$1,$3)",[courseId,actor,pack.manifest.packageId]);
  const publication=autoPublish?await publishEligibleInTransaction(db,actor,courseId,pack.entries.map(entry=>entry.id)):undefined;
  if(publication?.skipped.length)throw invalid(`Пакет не опубликован: ${publication.skipped.map(item=>`${item.id}: ${item.reason}`).join(' ')}`);
  await db.query('COMMIT');return {packageId:pack.manifest.packageId,changes:diff,publication};
 }catch(error){await db.query('ROLLBACK');throw error}
}
/** Publish latest structurally valid revisions, leaving unapproved assessments and their plans as drafts. */
async function publishEligibleInTransaction(db:PoolClient,actor:string,courseId:string,ids?:string[]){
 const rows=(await db.query(`SELECT e.id,e.kind,e.published_revision,r.revision,r.content FROM v3_content_entities e JOIN LATERAL (SELECT revision,content FROM v3_content_revisions WHERE course_id=e.course_id AND entity_id=e.id ORDER BY revision DESC LIMIT 1) r ON true WHERE e.course_id=$1 ORDER BY CASE WHEN e.kind='curriculum_plan' THEN 1 ELSE 0 END,e.id`,[courseId])).rows;
 const selected=ids?new Set(ids):null,published:string[]=[],skipped:Array<{id:string;reason:string}>=[];
 for(const row of rows){
  if(selected&&!selected.has(row.id))continue;
  if(row.published_revision===row.revision)continue;
  try{validateV3(row.kind==='curriculum_plan'?'curriculum-plan.schema.json':'content-entity.schema.json',row.content)}catch{skipped.push({id:row.id,reason:'Редакция не соответствует схеме.'});continue}
  if(['control_work','exam'].includes(row.kind)&&row.content.content?.rubric?.draftOnly===true){skipped.push({id:row.id,reason:'Критерии аттестации не утверждены.'});continue}
  if(['control_work','exam'].includes(row.kind)){
   const plans=await db.query(`SELECT r.content FROM v3_content_entities e JOIN v3_content_revisions r ON r.course_id=e.course_id AND r.entity_id=e.id AND r.revision=e.published_revision WHERE e.course_id=$1 AND e.kind='curriculum_plan'`,[courseId]);
   if(plans.rows.some(plan=>plan.content.items.some((item:any)=>item.id===row.id&&item.blocksNext!==row.content.content?.blocksNext))){skipped.push({id:row.id,reason:'Блокировка не совпадает с опубликованным планом.'});continue}
  }
  if(row.kind==='curriculum_plan'){
   const assessmentItems=row.content.items.filter((item:any)=>['control_work','exam'].includes(item.kind));
   if(assessmentItems.length){const assessments=await db.query(`SELECT e.id,r.content FROM v3_content_entities e JOIN v3_content_revisions r ON r.course_id=e.course_id AND r.entity_id=e.id AND r.revision=e.published_revision WHERE e.course_id=$1 AND e.id=ANY($2::text[])`,[courseId,assessmentItems.map((item:any)=>item.id)]);const byId=new Map(assessments.rows.map(item=>[item.id,item.content]));const blocked=assessmentItems.filter((item:any)=>!byId.has(item.id)||byId.get(item.id)?.content?.rubric?.draftOnly===true||byId.get(item.id)?.content?.blocksNext!==item.blocksNext);if(blocked.length){skipped.push({id:row.id,reason:`Проверьте правила аттестаций: ${blocked.map((item:any)=>item.id).join(', ')}.`});continue}}
  }
  await db.query('UPDATE v3_content_entities SET published_revision=$3 WHERE course_id=$1 AND id=$2',[courseId,row.id,row.revision]);
  await db.query("INSERT INTO course_audit_events(course_id,actor_id,action,target_type,target_id,new_value) VALUES($1,$2,'PUBLISH_V3_CONTENT','CONTENT',$3,$4)",[courseId,actor,row.id,String(row.revision)]);published.push(row.id);
 }
 return {published,skipped};
}
export async function publishAllV3Content(db:PoolClient,actor:string,courseId:string){
 await db.query('BEGIN');try{await requireMentor(db,actor,courseId,'can_manage_content');await db.query('SELECT 1 FROM courses WHERE id=$1 FOR UPDATE',[courseId]);const result=await publishEligibleInTransaction(db,actor,courseId);await db.query('COMMIT');return result}catch(error){await db.query('ROLLBACK');throw error}
}
export async function publishV3Content(db:PoolClient,actor:string,courseId:string,id:string,revision:unknown){
 if(!Number.isInteger(revision)||Number(revision)<1)throw invalid('Некорректная редакция.');
 await db.query('BEGIN');try{await requireMentor(db,actor,courseId,'can_manage_content');const content=await db.query('SELECT kind,content FROM v3_content_revisions WHERE course_id=$1 AND entity_id=$2 AND revision=$3',[courseId,id,revision]);if(!content.rowCount)throw Object.assign(new Error('Редакция не найдена.'),{code:'NOT_FOUND'});if(['control_work','exam'].includes(content.rows[0].kind)&&content.rows[0].content.content?.rubric?.draftOnly===true)throw invalid('В рубрике указаны тестовые критерии draftOnly. Сначала загрузите утверждённую редакцию.');if(content.rows[0].kind==='curriculum_plan'){const assessmentIds=content.rows[0].content.items.filter((item:any)=>['control_work','exam'].includes(item.kind)).map((item:any)=>item.id);if(assessmentIds.length){const drafts=await db.query(`SELECT e.id,r.content FROM v3_content_entities e JOIN LATERAL (SELECT content FROM v3_content_revisions WHERE course_id=e.course_id AND entity_id=e.id ORDER BY CASE WHEN revision=e.published_revision THEN 0 ELSE 1 END,revision DESC LIMIT 1) r ON true WHERE e.course_id=$1 AND e.id=ANY($2::text[])`,[courseId,assessmentIds]);const blocked=drafts.rows.filter(row=>row.content.content?.rubric?.draftOnly===true).map(row=>row.id);if(blocked.length)throw invalid(`В плане есть аттестации с тестовыми критериями: ${blocked.join(', ')}. Загрузите утверждённые редакции.`);const inconsistent=drafts.rows.filter(row=>content.rows[0].content.items.find((item:any)=>item.id===row.id)?.blocksNext!==row.content.content?.blocksNext).map(row=>row.id);if(inconsistent.length)throw invalid(`Блокировка в плане не совпадает с аттестацией: ${inconsistent.join(', ')}. Обновите позицию плана.`)}}const updated=await db.query('UPDATE v3_content_entities SET published_revision=$3 WHERE course_id=$1 AND id=$2 RETURNING id',[courseId,id,revision]);if(!updated.rowCount)throw Object.assign(new Error('Редакция не найдена.'),{code:'NOT_FOUND'});await db.query("INSERT INTO course_audit_events(course_id,actor_id,action,target_type,target_id,new_value) VALUES($1,$2,'PUBLISH_V3_CONTENT','CONTENT',$3,$4)",[courseId,actor,id,String(revision)]);await db.query('COMMIT');return {id,revision}}catch(error){await db.query('ROLLBACK');throw error}
}
export async function exportV3Content(db:PoolClient,actor:string,courseId:string):Promise<Buffer>{
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');try{
  await requireMentor(db,actor,courseId,'can_manage_content');
  const rows=(await db.query(`SELECT e.id,e.kind,r.content,r.assets FROM v3_content_entities e JOIN LATERAL (SELECT content,assets FROM v3_content_revisions WHERE course_id=e.course_id AND entity_id=e.id ORDER BY revision DESC LIMIT 1) r ON true WHERE e.course_id=$1 ORDER BY e.id`,[courseId])).rows;
  if(!rows.length)throw invalid('В курсе нет материалов формата 3.0.');
  const zip=new JSZip(),assets=new Map<string,string>(),entries=[];
  for(const [i,row] of rows.entries()){
   const sourceAssets=row.assets as Record<string,string>;
   function relocate(node:any):any{if(Array.isArray(node))return node.map(relocate);if(node&&typeof node==='object')return Object.fromEntries(Object.entries(node).map(([key,value])=>{if(key==='textPath'&&typeof value==='string'&&Object.hasOwn(sourceAssets,value)){const text=sourceAssets[value],name=`texts/${crypto.createHash('sha256').update(text).digest('hex')}.md`;assets.set(name,text);return [key,name]}return [key,relocate(value)]}));return node}
   const entityPath=`entities/${i+1}.json`;entries.push({id:row.id,kind:row.kind,path:entityPath});zip.file(entityPath,JSON.stringify(relocate(row.content),null,2));
  }
  for(const [name,text] of assets)zip.file(name,text);
  zip.file('manifest.json',JSON.stringify({format:'rozephyr-content',formatVersion:'1.0',packageId:`export-${crypto.randomUUID()}`,scope:'mixed',createdAt:new Date().toISOString(),source:'rozephyr-learning',entries},null,2));
  const result=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});await db.query('COMMIT');return result;
 }catch(error){await db.query('ROLLBACK');throw error}
}
