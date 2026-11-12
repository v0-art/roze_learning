import crypto from 'node:crypto';import fs from 'node:fs';import path from 'node:path';import type {PoolClient} from 'pg';import JSZip from 'jszip';
import {requireStudentAccess,AccessDenied} from './courses';import {decideV3Access,type V3PlanItem,type V3ItemProgress} from '../../core/v3-sequence';import {validateV3} from '../v3-contracts';
const invalid=(message:string)=>Object.assign(new Error(message),{code:'INVALID_INPUT'});
const missing=(message:string)=>Object.assign(new Error(message),{code:'NOT_FOUND'});

async function published(db:PoolClient,courseId:string,id:string){
 const result=await db.query(`SELECT e.kind,r.revision,r.content,r.assets FROM v3_content_entities e JOIN v3_content_revisions r ON r.course_id=e.course_id AND r.entity_id=e.id AND r.revision=e.published_revision WHERE e.course_id=$1 AND e.id=$2`,[courseId,id]);return result.rows[0];
}
/** Require explicit module order for multi-module courses; a single module needs no ordering. */
type CoursePlanItem=V3PlanItem&{moduleId:string;topicIds:string[]};
export async function readV3Plan(db:PoolClient,courseId:string):Promise<CoursePlanItem[]>{
 const rows=(await db.query(`SELECT r.content,m.position AS legacy_position,mr.content->'content'->>'position' AS v3_position FROM v3_content_entities e JOIN v3_content_revisions r ON r.course_id=e.course_id AND r.entity_id=e.id AND r.revision=e.published_revision LEFT JOIN course_modules m ON m.course_id=e.course_id AND m.id=r.content->>'moduleId' LEFT JOIN v3_content_entities me ON me.course_id=e.course_id AND me.id=r.content->>'moduleId' AND me.kind='module' LEFT JOIN v3_content_revisions mr ON mr.course_id=me.course_id AND mr.entity_id=me.id AND mr.revision=me.published_revision WHERE e.course_id=$1 AND e.kind='curriculum_plan'`,[courseId])).rows;
 for(const row of rows){const value=row.v3_position??row.legacy_position;row.module_position=value===null?null:Number(value);if(row.module_position!==null&&(!Number.isSafeInteger(row.module_position)||row.module_position<0))throw invalid('Некорректная позиция модуля.')}
 if(new Set(rows.map(row=>row.content.moduleId)).size!==rows.length)throw invalid('Для модуля опубликовано несколько учебных планов.');
 if(rows.length>1&&(rows.some(row=>row.module_position===null)||new Set(rows.map(row=>row.module_position)).size!==rows.length))throw invalid('Задайте уникальные позиции опубликованных модулей в content.position.');
 rows.sort((a,b)=>(a.module_position??0)-(b.module_position??0));
 const result:CoursePlanItem[]=[];for(const row of rows){validateV3('curriculum-plan.schema.json',row.content);if(new Set(row.content.items.map((item:any)=>item.position)).size!==row.content.items.length)throw invalid('В учебном плане повторяются позиции.');for(const item of [...row.content.items].sort((a:any,b:any)=>a.position-b.position))result.push({...item,moduleId:row.content.moduleId,position:result.length+1})}
 const assessments=await db.query(`SELECT e.id,r.content FROM v3_content_entities e JOIN v3_content_revisions r ON r.course_id=e.course_id AND r.entity_id=e.id AND r.revision=e.published_revision WHERE e.course_id=$1 AND e.kind IN ('control_work','exam')`,[courseId]);for(const row of assessments.rows){const item=result.find(value=>value.id===row.id);if(item&&item.blocksNext!==row.content.content?.blocksNext)throw invalid(`Блокировка в опубликованном плане не совпадает с аттестацией ${row.id}; ментору нужно обновить план.`)}return result;
}
async function progress(db:PoolClient,courseId:string,student:string):Promise<V3ItemProgress[]>{
 const rows=(await db.query(`SELECT s.item_id,s.item_kind,count(r.session_id)::int attempts,BOOL_OR(r.report->>'status' IN ('completed','failed')) completed,BOOL_OR(r.report->>'status'<>'incomplete' AND r.report->'result'->>'grade' IN ('passed','good','excellent')) passed FROM v3_sessions s LEFT JOIN v3_reports r ON r.session_id=s.id WHERE s.course_id=$1 AND s.student_id=$2 GROUP BY s.item_id,s.item_kind`,[courseId,student])).rows;
 const decisions=(await db.query(`SELECT item_id,decision,count(*)::int n FROM v3_mentor_decisions WHERE course_id=$1 AND student_id=$2 GROUP BY item_id,decision`,[courseId,student])).rows;
 const result:V3ItemProgress[]=rows.map(row=>({id:row.item_id,completed:!!row.completed,passed:!!row.passed,attemptsUsed:row.attempts,mentorOverride:decisions.some(d=>d.item_id===row.item_id&&d.decision==='allow_progress'),extraAttempts:decisions.find(d=>d.item_id===row.item_id&&d.decision==='allow_extra_attempt')?.n||0}));
 for(const item of decisions)if(!result.some(row=>row.id===item.item_id))result.push({id:item.item_id,completed:false,passed:false,attemptsUsed:0,mentorOverride:decisions.some(d=>d.item_id===item.item_id&&d.decision==='allow_progress'),extraAttempts:decisions.find(d=>d.item_id===item.item_id&&d.decision==='allow_extra_attempt')?.n||0});return result;
}
export async function readV3StudentPlan(db:PoolClient,actor:string,courseId:string,student:string){
 await requireStudentAccess(db,actor,courseId,student);const plan=await readV3Plan(db,courseId),state=await progress(db,courseId,student);
 const rows=(await db.query(`SELECT e.id,e.kind,r.content FROM v3_content_entities e JOIN v3_content_revisions r ON r.course_id=e.course_id AND r.entity_id=e.id AND r.revision=e.published_revision WHERE e.course_id=$1`,[courseId])).rows;const visible=new Map(rows.map(row=>[row.id,row]));
 return plan.map(item=>{const content=visible.get(item.id),access=content?decideV3Access(plan,state,item.id):{available:false,reason:'unpublished'};return {...item,title:content?.content.title||'',access,progress:state.find(value=>value.id===item.id)||null}});
}
export async function readV3StudentCourse(db:PoolClient,actor:string,courseId:string,student:string){
 await requireStudentAccess(db,actor,courseId,student);
 const legacy=await db.query('SELECT EXISTS(SELECT 1 FROM course_lessons WHERE course_id=$1) AS has_lessons',[courseId]);
 const count=await db.query("SELECT count(*)::int AS n FROM v3_content_entities WHERE course_id=$1 AND kind='curriculum_plan' AND published_revision IS NOT NULL",[courseId]);
 if(!count.rows[0].n||legacy.rows[0].has_lessons)return {enabled:false,items:[],modules:[],topics:[],regulations:[]};
 const items=await readV3StudentPlan(db,actor,courseId,student);
 const entities=(await db.query(`SELECT e.id,e.kind,r.content FROM v3_content_entities e JOIN v3_content_revisions r ON r.course_id=e.course_id AND r.entity_id=e.id AND r.revision=e.published_revision WHERE e.course_id=$1 AND e.kind IN ('module','topic','regulation') ORDER BY e.id`,[courseId])).rows;
 const moduleIds=new Set(entities.filter(e=>e.kind==='module').map(e=>e.id));
 if(items.some((item:any)=>!moduleIds.has(item.moduleId)))throw invalid('Для опубликованного плана ментору необходимо опубликовать соответствующий модуль.');
 const moduleOrder=new Map([...new Set(items.map(item=>item.moduleId))].map((id,index)=>[id,index]));
 const modules=entities.filter(e=>e.kind==='module').map(e=>({id:e.id,title:e.content.title})).sort((a,b)=>(moduleOrder.get(a.id)??Number.MAX_SAFE_INTEGER)-(moduleOrder.get(b.id)??Number.MAX_SAFE_INTEGER)||a.id.localeCompare(b.id));
 return {enabled:true,items,modules,topics:entities.filter(e=>e.kind==='topic').map(e=>({id:e.id,title:e.content.title,moduleId:e.content.moduleId})),regulations:entities.filter(e=>e.kind==='regulation').map(e=>({id:e.id,title:e.content.title}))};
}
export async function readV3StudentOverview(db:PoolClient,actor:string,courseId:string,student:string){
 await requireStudentAccess(db,actor,courseId,student);
 const homework=await db.query(`SELECT h.id,h.source_item_id,h.title,h.description,h.status,max(r.received_at) AS issued_at FROM v3_homework h LEFT JOIN v3_sessions s ON s.course_id=h.course_id AND s.student_id=h.student_id AND s.item_id=h.source_item_id LEFT JOIN v3_reports r ON r.session_id=s.id WHERE h.course_id=$1 AND h.student_id=$2 GROUP BY h.course_id,h.student_id,h.source_item_id,h.id ORDER BY issued_at DESC NULLS LAST,h.id DESC`,[courseId,student]);
 const reports=await db.query(`SELECT s.id,s.item_id,s.item_kind,s.attempt_number,r.received_at,r.report,revision.content->>'title' AS title FROM v3_sessions s JOIN v3_reports r ON r.session_id=s.id JOIN v3_content_revisions revision ON revision.course_id=s.course_id AND revision.entity_id=s.item_id AND revision.revision=s.item_revision WHERE s.course_id=$1 AND s.student_id=$2 ORDER BY r.received_at DESC,s.id DESC`,[courseId,student]);
 const gaps=await db.query(`SELECT g.id,g.source_item_id,g.description,g.status,origin.created_at FROM v3_knowledge_gaps g LEFT JOIN LATERAL (SELECT MIN(r.received_at) AS created_at FROM v3_sessions s JOIN v3_reports r ON r.session_id=s.id CROSS JOIN LATERAL jsonb_array_elements(r.report->'knowledgeGaps') AS entry WHERE s.course_id=g.course_id AND s.student_id=g.student_id AND s.item_id=g.source_item_id AND entry->>'gapId'=g.id) origin ON true WHERE g.course_id=$1 AND g.student_id=$2 ORDER BY origin.created_at DESC NULLS LAST,g.id DESC`,[courseId,student]);
 return {homework:homework.rows,reports:reports.rows,gaps:gaps.rows};
}
export async function readV3ExamBanks(db:PoolClient,actor:string,courseId:string,student:string){
 await requireStudentAccess(db,actor,courseId,student);
 const plan=await readV3Plan(db,courseId);
 const rows=await db.query(`SELECT e.id,e.kind,r.content,bank.content AS bank FROM v3_content_entities e JOIN v3_content_revisions r ON r.course_id=e.course_id AND r.entity_id=e.id AND r.revision=e.published_revision JOIN v3_content_entities be ON be.course_id=e.course_id AND be.id=r.content->'content'->>'assessmentBankId' AND be.kind='assessment_bank' JOIN v3_content_revisions bank ON bank.course_id=be.course_id AND bank.entity_id=be.id AND bank.revision=be.published_revision WHERE e.course_id=$1 AND e.kind IN ('exam','control_work') ORDER BY e.id`,[courseId]);
 const ids=new Set(plan.filter(item=>['exam','control_work'].includes(item.kind)).map(item=>item.id));
 return rows.rows.filter(row=>ids.has(row.id)).map(row=>({id:row.id,kind:row.kind,title:row.content.title,tickets:row.bank.content.tickets}));
}
export async function createV3Session(db:PoolClient,student:string,courseId:string,itemId:string,regulationId:string){
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');try{
  await requireStudentAccess(db,student,courseId,student);await db.query('SELECT 1 FROM course_students WHERE course_id=$1 AND student_id=$2 FOR UPDATE',[courseId,student]);
  const existing=await db.query(`SELECT s.id FROM v3_sessions s LEFT JOIN v3_reports r ON r.session_id=s.id WHERE s.course_id=$1 AND s.student_id=$2 AND s.item_id=$3 AND r.session_id IS NULL ORDER BY s.created_at DESC LIMIT 1`,[courseId,student,itemId]);if(existing.rowCount){await db.query('COMMIT');return {id:existing.rows[0].id,existing:true}}
  const plan=await readV3Plan(db,courseId),decision=decideV3Access(plan,await progress(db,courseId,student),itemId);if(!decision.available)throw new AccessDenied();
  const item=await published(db,courseId,itemId),regulation=await published(db,courseId,regulationId);const planItem=plan.find(i=>i.id===itemId);
  if(!item||!planItem||item.kind!==planItem.kind)throw missing('Мероприятие не опубликовано.');if(!regulation||regulation.kind!=='regulation')throw missing('Регламент не опубликован.');
  const regulationPath=regulation.content.content?.textPath,regulationText=typeof regulationPath==='string'?regulation.assets[regulationPath]:regulation.content.content?.text;
  if(typeof regulationText!=='string'||!regulationText.trim())throw invalid('Текст опубликованного регламента отсутствует.');
  const legacy=await db.query(`SELECT EXISTS(SELECT 1 FROM homework_assignments WHERE course_id=$1 AND student_id=$2 AND status IN ('assigned','submitted','needs_revision','not_submitted')) OR EXISTS(SELECT 1 FROM knowledge_gaps WHERE course_id=$1 AND student_id=$2 AND status='needs-review') AS pending`,[courseId,student]);
  if(legacy.rows[0].pending)throw invalid('Сначала необходимо перенести открытые ДЗ и пробелы прежнего формата.');
  const home=(await db.query(`SELECT id AS "homeworkId",source_item_id AS "sourceItemId",title || E'\\n' || description AS description,status FROM v3_homework WHERE course_id=$1 AND student_id=$2 AND status<>'checked' ORDER BY source_item_id,id`,[courseId,student])).rows;
  const gaps=(await db.query(`SELECT source_item_id AS "sourceItemId",question_id AS "questionId",prompt FROM v3_rechecks WHERE course_id=$1 AND student_id=$2 AND status='open' ORDER BY source_item_id,question_id`,[courseId,student])).rows;
  const prior=(await db.query(`SELECT s.item_id,r.report->'result'->>'earnedScore' AS score,r.report->'result'->>'maxScore' AS maximum FROM v3_sessions s JOIN v3_reports r ON r.session_id=s.id WHERE s.course_id=$1 AND s.student_id=$2 ORDER BY r.received_at DESC LIMIT 3`,[courseId,student])).rows;
  const id=crypto.randomUUID(),context={sessionId:id,openHomework:home,mandatoryRechecks:gaps,relevantSkills:item.content.content?.skillIds||[],priorSummary:prior.map(x=>`${x.item_id}: ${x.score}/${x.maximum}`).join('; ')};validateV3('session-context.schema.json',context);
  let ticket:any=null,bankRevision:number|null=null;
  if(item.kind==='exam'||item.kind==='control_work'){const bank=await published(db,courseId,item.content.content.assessmentBankId);if(!bank||bank.kind!=='assessment_bank')throw invalid('Банк билетов не опубликован.');const tickets=bank.content.content.tickets;if(!Array.isArray(tickets)||!tickets.length)throw invalid('В банке нет билетов.');const used=await db.query('SELECT ticket_id FROM v3_sessions WHERE course_id=$1 AND student_id=$2 AND item_id=$3 AND ticket_id IS NOT NULL',[courseId,student,itemId]);const already=new Set(used.rows.map(row=>row.ticket_id)),unused=tickets.filter((value:any)=>!already.has(value.ticketId)),available=unused.length?unused:tickets;ticket=available[crypto.randomInt(available.length)];bankRevision=bank.revision}
  const attempts=await db.query('SELECT count(*)::int n FROM v3_sessions WHERE course_id=$1 AND student_id=$2 AND item_id=$3',[courseId,student,itemId]);const attempt=attempts.rows[0].n+1;
  const zip=new JSZip(),files=['START_HERE.md','regulation.md','activity.md','context.json','report.schema.json'];
  zip.file('START_HERE.md','Прочитайте manifest.json, regulation.md, activity.md, context.json и файлы content/. Следуйте регламенту и по схеме report.schema.json после занятия верните session-result.zip с report.json либо report.json. Для каждого ошибочного или частично верного ответа обязательно укажите исходный вопрос в questionText или разбор ошибки в feedback. По возможности также сохраните ответ ученика в studentAnswer; не выдумывайте отсутствующие данные.');
  zip.file('report.schema.json',fs.readFileSync(path.join(process.cwd(),'contracts/rozephyr-v1/schemas/report.schema.json'),'utf8'));
  zip.file('regulation.md',regulationText);zip.file('context.json',JSON.stringify(context,null,2));
  let instructions=`# ${item.content.title}\n\nВид: ${item.kind}\nИдентификатор: ${itemId}\n`;
  const assetFiles=new Map<string,string>();for(const [index,[name,text]] of Object.entries(item.assets as Record<string,string>).entries()){const file=`content/${index+1}.md`;zip.file(file,text);files.push(file);assetFiles.set(name,file)}
  const blocks=item.content.content?.blocks;if(Array.isArray(blocks)){instructions+='\n## Блоки занятия в заданном порядке\n';for(const block of [...blocks].sort((a:any,b:any)=>a.order-b.order)){const file=assetFiles.get(block.textPath);if(!file)throw invalid('Текст блока занятия отсутствует.');instructions+=`\n${block.order}. ${block.role} · ${block.blockId}: ${file}`}}
  else for(const [name,file] of assetFiles)instructions+=`\n- ${file} (${name})`;
  zip.file('activity.md',instructions);
  if(ticket){const file='assessment/assignment.md';zip.file(file,`# Билет ${ticket.ticketId}\n\nВерсия банка: ${bankRevision}\n\n1. ${ticket.theory1}\n\n2. ${ticket.theory2}\n\n3. ${ticket.practical}\n\nРубрика:\n${JSON.stringify(item.content.content.rubric,null,2)}`);files.push(file)}
  const manifest={format:'rozephyr-session',formatVersion:'1.0',sessionId:id,studentRef:crypto.randomUUID(),courseId,itemId,itemType:item.kind,itemRevision:item.revision,regulationRevision:String(regulation.revision),createdAt:new Date().toISOString(),files};validateV3('session-manifest.schema.json',manifest);zip.file('manifest.json',JSON.stringify(manifest,null,2));
  const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),hash=crypto.createHash('sha256').update(bytes).digest();
  await db.query(`INSERT INTO v3_sessions(id,course_id,student_id,item_id,item_kind,item_revision,regulation_id,regulation_revision,attempt_number,ticket_id,bank_revision,context,package_bytes,package_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[id,courseId,student,itemId,item.kind,item.revision,regulationId,regulation.revision,attempt,ticket?.ticketId||null,bankRevision,JSON.stringify(context),bytes,hash]);
  await db.query('COMMIT');return {id,existing:false};
 }catch(error){await db.query('ROLLBACK');throw error}
}
export async function readV3Session(db:PoolClient,actor:string,courseId:string,student:string,id:string){
 await requireStudentAccess(db,actor,courseId,student);const result=await db.query('SELECT package_bytes FROM v3_sessions WHERE id=$1 AND course_id=$2 AND student_id=$3',[id,courseId,student]);if(!result.rowCount)throw missing('Сессия не найдена.');return result.rows[0].package_bytes as Buffer;
}
