import crypto from 'node:crypto';import type {PoolClient} from 'pg';import {validateModuleGraph} from '../../core/moduleGraph';import {AccessDenied,requireMentor,listCourseModules} from './courses';

export async function readModuleGraph(db:PoolClient,actor:string,courseId:string){
 const modules=await listCourseModules(db,actor,courseId),visible=new Set(modules.map(m=>m.id));
 // Only mentors with content permission may inspect unapproved draft links.
 let mentor=false;try{await requireMentor(db,actor,courseId,'can_manage_content');mentor=true}catch(error){if(!(error instanceof AccessDenied))throw error}
 const result=await db.query(`SELECT id,source_module_id,target_module_id,relation_type,approval_status,display_tier,label,evidence_status,evidence_note,is_access_gate,directionality FROM course_relations WHERE course_id=$1 AND ($2 OR approval_status='approved') ORDER BY id`,[courseId,mentor]);
 const relations=result.rows.filter(row=>visible.has(row.source_module_id)&&visible.has(row.target_module_id));
 const transfers=await db.query('SELECT relation_id,position,concept,explanation FROM relation_knowledge_transfers WHERE course_id=$1 ORDER BY relation_id,position',[courseId]);const byId=new Map<string,Array<{concept:string;explanation:string}>>();
 for(const row of transfers.rows){const values=byId.get(row.relation_id)||[];values.push({concept:row.concept,explanation:row.explanation});byId.set(row.relation_id,values)}
 return {modules,relations:relations.map(row=>({...row,knowledge_transfers:byId.get(row.id)||[]}))};
}
export async function decideModuleRelation(db:PoolClient,actor:string,courseId:string,id:string,status:unknown){
 if(!['proposed','approved','rejected'].includes(status as string))throw Object.assign(new Error('Некорректное решение.'),{code:'INVALID_INPUT'});
 await db.query('BEGIN');try{await requireMentor(db,actor,courseId,'can_manage_content');const old=await db.query('SELECT approval_status FROM course_relations WHERE course_id=$1 AND id=$2 FOR UPDATE',[courseId,id]);if(!old.rowCount)throw Object.assign(new Error('Связь не найдена.'),{code:'NOT_FOUND'});
  await db.query('UPDATE course_relations SET approval_status=$3 WHERE course_id=$1 AND id=$2',[courseId,id,status]);await db.query("INSERT INTO course_audit_events(course_id,actor_id,action,target_type,target_id,previous_value,new_value) VALUES($1,$2,'MODULE_RELATION_DECISION','MODULE_RELATION',$3,$4,$5)",[courseId,actor,id,old.rows[0].approval_status,status]);await db.query('COMMIT');return {id,status};
 }catch(error){await db.query('ROLLBACK');throw error}
}
export async function addModuleRelation(db:PoolClient,actor:string,courseId:string,input:{source:unknown;target:unknown;relation:unknown;label:unknown;transfers:unknown}){
 const {source,target,relation,label,transfers}=input;
 if(typeof source!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(source)||typeof target!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(target)||source===target||!['prerequisite','application','complementary','capstone-integration'].includes(relation as string)||typeof label!=='string'||label.length>500||!Array.isArray(transfers)||transfers.length>50||transfers.some(t=>!t||typeof t.concept!=='string'||!t.concept.trim()||t.concept.length>2000||typeof t.explanation!=='string'||t.explanation.length>2000))throw Object.assign(new Error('Некорректная связь.'),{code:'INVALID_INPUT'});
 await db.query('BEGIN');try{await requireMentor(db,actor,courseId,'can_manage_content');await db.query('SELECT 1 FROM courses WHERE id=$1 FOR UPDATE',[courseId]);const id=crypto.randomUUID();await db.query(`INSERT INTO course_relations(course_id,id,source_module_id,target_module_id,relation_type,description,approval_status,label,is_access_gate,directionality) VALUES($1,$2,$3,$4,$5,'','proposed',$6,false,$7)`,[courseId,id,source,target,relation,label.trim(),relation==='complementary'?'undirected':'source-to-target']);
  for(const [i,t] of transfers.entries())await db.query('INSERT INTO relation_knowledge_transfers(course_id,relation_id,position,concept,explanation) VALUES($1,$2,$3,$4,$5)',[courseId,id,i,t.concept.trim(),t.explanation.trim()]);
  await db.query("INSERT INTO course_audit_events(course_id,actor_id,action,target_type,target_id,reason) VALUES($1,$2,'CREATE_MODULE_RELATION','MODULE_RELATION',$3,$4)",[courseId,actor,id,label.trim()]);await db.query('COMMIT');return {id,status:'proposed'};
 }catch(error){await db.query('ROLLBACK');throw error}
}
async function parseGraph(db:PoolClient,actor:string,courseId:string,rawText:unknown){
 await requireMentor(db,actor,courseId,'can_manage_content');if(typeof rawText!=='string'||Buffer.byteLength(rawText,'utf8')>4_000_000)throw Object.assign(new Error('Размер графа не должен превышать 4 МБ.'),{code:'INVALID_INPUT'});
 let graph:any;try{graph=JSON.parse(rawText)}catch{throw Object.assign(new Error('Не удалось прочитать JSON-граф.'),{code:'INVALID_INPUT'})}
 const modules=await db.query('SELECT id FROM course_modules WHERE course_id=$1 ORDER BY position,id',[courseId]);const errors=validateModuleGraph(graph,modules.rows.map(row=>row.id));if(errors.length)throw Object.assign(new Error(errors.slice(0,5).join(' ')),{code:'INVALID_INPUT'});if(graph.edges.length>5000)throw Object.assign(new Error('Слишком много связей.'),{code:'INVALID_INPUT'});return graph;
}
export async function previewModuleGraph(db:PoolClient,actor:string,courseId:string,rawText:unknown){
 const graph=await parseGraph(db,actor,courseId,rawText);const count=await db.query('SELECT count(*)::int n FROM course_relations WHERE course_id=$1',[courseId]);return {nodes:graph.nodes.length,edges:graph.edges.length,existing:count.rows[0].n,canImport:count.rows[0].n===0};
}
export async function importModuleGraph(db:PoolClient,actor:string,courseId:string,fileName:unknown,rawText:unknown){
 if(typeof fileName!=='string'||!fileName.trim()||fileName.length>180||/[\\/\x00-\x1f]/.test(fileName)||!fileName.toLowerCase().endsWith('.json'))throw Object.assign(new Error('Укажите имя JSON-файла.'),{code:'INVALID_INPUT'});
 const graph=await parseGraph(db,actor,courseId,rawText);await db.query('BEGIN');try{await requireMentor(db,actor,courseId,'can_manage_content');await db.query('SELECT 1 FROM courses WHERE id=$1 FOR UPDATE',[courseId]);
  const currentModules=await db.query('SELECT id FROM course_modules WHERE course_id=$1',[courseId]);const validation=validateModuleGraph(graph,currentModules.rows.map(row=>row.id));if(validation.length)throw Object.assign(new Error('Состав модулей изменился. Повторите проверку.'),{code:'CONFLICT'});
  if((await db.query('SELECT 1 FROM course_relations WHERE course_id=$1 LIMIT 1',[courseId])).rowCount)throw Object.assign(new Error('В курсе уже есть межпредметные связи.'),{code:'INVALID_INPUT'});
  for(const e of graph.edges){await db.query(`INSERT INTO course_relations(course_id,id,source_module_id,target_module_id,relation_type,description,approval_status,display_tier,label,evidence_status,evidence_note,is_access_gate,directionality) VALUES($1,$2,$3,$4,$5,'','proposed',$6,$7,$8,$9,false,$10)`,[courseId,e.id,e.source,e.target,e.relation,e.displayTier,e.label,e.evidenceStatus,e.evidenceNote,e.directionality]);for(const [i,t] of e.knowledgeTransfers.entries())await db.query('INSERT INTO relation_knowledge_transfers(course_id,relation_id,position,concept,explanation) VALUES($1,$2,$3,$4,$5)',[courseId,e.id,i,t.sourceKnowledge,t.targetApplication]);}
  const bytes=Buffer.from(rawText as string,'utf8');await db.query(`INSERT INTO course_library_files(course_id,id,filename,mime_type,file_bytes,checksum_sha256,linked_entity,file_type,status,uploaded_by) VALUES($1,$2,$3,'application/json',$4,$5,'GLOBAL','json','active',$6)`,[courseId,crypto.randomUUID(),fileName.trim(),bytes,crypto.createHash('sha256').update(bytes).digest(),actor]);
  await db.query("INSERT INTO course_audit_events(course_id,actor_id,action,target_type,target_id,reason) VALUES($1,$2,'IMPORT_MODULE_GRAPH','COURSE',$1,$3)",[courseId,actor,fileName.trim()]);await db.query('COMMIT');return {count:graph.edges.length};
 }catch(error){await db.query('ROLLBACK');throw error}
}
export async function decideModuleRelations(db:PoolClient,actor:string,courseId:string,ids:unknown,status:unknown){
 if(!Array.isArray(ids)||!ids.length||ids.length>5000||ids.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,120}$/.test(id))||new Set(ids).size!==ids.length||!['approved','rejected'].includes(status as string))throw Object.assign(new Error('Некорректный список связей.'),{code:'INVALID_INPUT'});
 await db.query('BEGIN');try{await requireMentor(db,actor,courseId,'can_manage_content');const existing=await db.query('SELECT id FROM course_relations WHERE course_id=$1 AND id=ANY($2::text[]) FOR UPDATE',[courseId,ids]);if(existing.rowCount!==ids.length)throw Object.assign(new Error('Некоторые связи не найдены.'),{code:'INVALID_INPUT'});
  await db.query('UPDATE course_relations SET approval_status=$3 WHERE course_id=$1 AND id=ANY($2::text[])',[courseId,ids,status]);await db.query("INSERT INTO course_audit_events(course_id,actor_id,action,target_type,target_id,reason,new_value) VALUES($1,$2,'MODULE_RELATION_BATCH_DECISION','COURSE',$1,$3,$4)",[courseId,actor,`Связей: ${ids.length}`,status]);await db.query('COMMIT');return {count:ids.length,status};
 }catch(error){await db.query('ROLLBACK');throw error}
}
