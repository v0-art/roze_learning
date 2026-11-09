import crypto from 'node:crypto';import type {PoolClient} from 'pg';import {AccessDenied,requireMentor} from './courses';import {importLegacyCurriculum} from './legacy-curriculum';import {importLegacyGraph} from './legacy-graph';import {importLegacyAssessmentDefinitions} from './legacy-assessments';
const invalid=(message:string)=>Object.assign(new Error(message),{code:'INVALID_INPUT'});
const permitted:Record<string,string[]>={modules:['id','code','title','status','order'],topics:['id','code','moduleId','title','order','status'],skills:['id','code','name','description','topicId','moduleId','lessonId'],relations:['fromId','toId','type'],lessons:['id','code','topicId','title','status','order','durationEstimate','promptVersion','previousLessonId','nextLessonId','skillIds','promptTemplate'],assessments:['id','type','status','afterTopic','contentPath','tickets','theoryUniqueCount','practicalUniqueCount']};

/** Imports the approved NEXUS draft package into an empty course, preserving its source bytes. */
export async function importDraftCourse(db:PoolClient,actor:string,courseId:string,fileName:unknown,rawText:unknown){
 await requireMentor(db,actor,courseId,'can_manage_content');
 if(typeof fileName!=='string'||!fileName.trim()||fileName.length>180||/[\\/\x00-\x1f]/.test(fileName)||!fileName.toLowerCase().endsWith('.json')||typeof rawText!=='string'||Buffer.byteLength(rawText,'utf8')>4_000_000)throw invalid('Выберите JSON-пакет размером до 4 МБ.');
 let source:any;try{source=JSON.parse(rawText)}catch{throw invalid('Не удалось прочитать JSON-пакет.')}
 if(!source||typeof source!=='object'||Array.isArray(source)||source.format!=='NEXUS-Academy-content-draft'||source.formatVersion!=='1.0')throw invalid('Формат пакета не поддерживается.');
 const allowed=['format','formatVersion','warning','moduleId','lessonCount','lessonStatus',...Object.keys(permitted)];for(const key of Object.keys(source))if(!allowed.includes(key))throw invalid(`Неизвестное поле пакета: ${key}.`);
 for(const [kind,fields] of Object.entries(permitted)){
  const rows=source[kind];if(!Array.isArray(rows)||rows.length>5000)throw invalid(`Некорректный раздел ${kind}.`);
  for(const row of rows){if(!row||typeof row!=='object'||Array.isArray(row))throw invalid(`Некорректная запись ${kind}.`);for(const field of Object.keys(row))if(!fields.includes(field))throw invalid(`Неизвестное поле ${kind}.${field}.`);}
 }
 if(source.lessonCount!==source.lessons.length)throw invalid('Количество уроков не совпадает с описанием пакета.');
 const moduleIds=new Set(source.modules.map((m:any)=>m.id)),topics=new Map<string,any>(source.topics.map((t:any)=>[t.id,t]));
 for(const row of [...source.modules,...source.topics,...source.skills,...source.lessons,...source.assessments])if(typeof row.id!=='string'||!/^[a-zA-Z0-9_-]{1,120}$/.test(row.id))throw invalid('Пакет содержит некорректный идентификатор.');
 for(const row of source.topics)if(!moduleIds.has(row.moduleId))throw invalid('Тема ссылается на отсутствующий модуль.');
 const lessons=source.lessons.map((l:any)=>{const topic=topics.get(l.topicId);if(!topic)throw invalid('Урок ссылается на отсутствующую тему.');if(typeof l.promptTemplate!=='string'||l.promptTemplate.length>500000||!Array.isArray(l.skillIds))throw invalid('Некорректное содержимое урока.');return {id:l.id,code:l.code,moduleId:topic.moduleId,topicId:l.topicId,order:l.order,title:l.title,durationEstimateMinutes:l.durationEstimate,prerequisites:[],objectives:[],relatedSkillIds:l.skillIds,status:'draft',version:l.promptVersion,promptTemplate:l.promptTemplate,previousLessonId:l.previousLessonId||null,nextLessonId:l.nextLessonId||null,versionHistory:[]}});
 const skills=source.skills.map((s:any)=>({...s,status:'draft'}));
 const nodes=[...source.modules.map((m:any)=>({id:m.id,code:m.code,title:m.title,description:'',level:1,moduleId:m.id,status:'draft'})),...source.topics.map((t:any)=>({id:t.id,code:t.code,title:t.title,description:'',level:2,moduleId:t.moduleId,topicId:t.id,status:'draft'})),...skills.map((s:any)=>({id:s.id,code:s.code,title:s.name,description:s.description||'',level:3,moduleId:s.moduleId,topicId:s.topicId||null,status:'draft'}))];
 const nodeIds=new Set(nodes.map((n:any)=>n.id));const relations=source.relations.map((r:any)=>{if(!nodeIds.has(r.fromId)||!nodeIds.has(r.toId)||!['prerequisite','application','application-to-module','competence'].includes(r.type))throw invalid('Некорректная связь в пакете.');return {id:`import-${crypto.createHash('sha256').update(JSON.stringify([r.fromId,r.toId,r.type])).digest('hex').slice(0,24)}`,fromId:r.fromId,toId:r.toId,type:r.type,description:''}});
 const exams=source.assessments.map((e:any)=>{const moduleId=e.id.match(/^(M\d{2})/)?.[1]||e.afterTopic?.match(/^(M\d{2})/)?.[1];if(!moduleId||!moduleIds.has(moduleId)||!['control','exam'].includes(e.type)||!Array.isArray(e.tickets||[])||(e.tickets||[]).length>5000)throw invalid('Аттестация ссылается на неизвестный модуль или содержит некорректные билеты.');return {id:e.id,moduleId,title:e.id,type:e.type,status:'draft',afterTopic:e.afterTopic||null,contentPath:e.contentPath||null,tickets:e.tickets||[],theoryUniqueCount:e.theoryUniqueCount??null,practicalUniqueCount:e.practicalUniqueCount??null}});
 await db.query('BEGIN');try{
  await requireMentor(db,actor,courseId,'can_manage_content');await db.query('SELECT 1 FROM courses WHERE id=$1 FOR UPDATE',[courseId]);
  if((await db.query('SELECT 1 FROM course_modules WHERE course_id=$1 LIMIT 1',[courseId])).rowCount)throw invalid('Импорт доступен только в пустой курс.');
  const curriculum=await importLegacyCurriculum(db,{modules:source.modules,topics:source.topics,lessons,skills},courseId,actor,false);
  const graph=await importLegacyGraph(db,{graphNodes:nodes,graphEdges:[],relations,moduleRelations:[]},courseId,false);
  const assessment=await importLegacyAssessmentDefinitions(db,{exams},courseId,actor,false);
  const bytes=Buffer.from(rawText,'utf8'),fileId=crypto.randomUUID();await db.query(`INSERT INTO course_library_files(course_id,id,filename,mime_type,file_bytes,checksum_sha256,linked_entity,file_type,status,uploaded_by) VALUES($1,$2,$3,'application/json',$4,$5,'GLOBAL','json','active',$6)`,[courseId,fileId,fileName.trim(),bytes,crypto.createHash('sha256').update(bytes).digest(),actor]);
  await db.query("UPDATE courses SET curriculum_profile='nexus-v1' WHERE id=$1",[courseId]);
  await db.query("INSERT INTO course_audit_events(course_id,actor_id,action,target_type,target_id,reason) VALUES($1,$2,'IMPORT_DRAFT_COURSE','COURSE',$1,$3)",[courseId,actor,fileName.trim()]);
  await db.query('COMMIT');return {curriculum,relations:graph.relations,assessments:assessment.definitions,tickets:assessment.tickets,sourceFileId:fileId,warning:'Уроки и аттестации сохранены как черновики. Материалы по внешним ссылкам нужно загрузить отдельно.'};
 }catch(error:any){await db.query('ROLLBACK');if(error instanceof AccessDenied||error?.code==='INVALID_INPUT'||error?.code==='23503'||error?.code==='23505')throw error;throw invalid('Пакет не прошёл проверку структуры и связей.')}
}
