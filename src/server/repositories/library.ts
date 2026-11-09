import crypto from 'node:crypto';import type {PoolClient} from 'pg';import {requireMentor} from './courses';
const invalid=()=>Object.assign(new Error('Некорректные данные файла.'),{code:'INVALID_INPUT'});
const missing=()=>Object.assign(new Error('Файл не найден.'),{code:'NOT_FOUND'});
async function binding(db:PoolClient,courseId:string,value:unknown){
 if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(value))throw invalid();
 if(value==='GLOBAL')return value;
 if(!(await db.query(`SELECT 1 FROM course_modules WHERE course_id=$1 AND id=$2 UNION ALL SELECT 1 FROM course_topics WHERE course_id=$1 AND id=$2 UNION ALL SELECT 1 FROM course_lessons WHERE course_id=$1 AND id=$2 UNION ALL SELECT 1 FROM course_exams WHERE course_id=$1 AND id=$2 LIMIT 1`,[courseId,value])).rowCount)throw invalid();return value;
}
export async function listCourseFiles(db:PoolClient,actor:string,courseId:string){
 await requireMentor(db,actor,courseId,'can_manage_content');
 return (await db.query(`SELECT id,filename,file_type,octet_length(file_bytes) AS size_bytes,linked_entity,encode(checksum_sha256,'hex') AS checksum_sha256,integrity_matches_legacy,created_at FROM course_library_files WHERE course_id=$1 AND status='active' ORDER BY linked_entity,filename,id`,[courseId])).rows;
}
export async function addCourseFile(db:PoolClient,actor:string,courseId:string,input:{name:string;linkedEntity:string;contentBase64:string}){
 if(typeof input.name!=='string'||!input.name.trim()||input.name.length>180||/[\\/\x00-\x1f]/.test(input.name)||typeof input.contentBase64!=='string'||input.contentBase64.length>11184812||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.contentBase64))throw invalid();
 const extension=input.name.toLowerCase().split('.').pop(),bytes=Buffer.from(input.contentBase64,'base64');if(!['json','md','txt','pdf','zip'].includes(extension||'')||!bytes.length||bytes.length>8388608)throw invalid();
 await db.query('BEGIN');try{
  await requireMentor(db,actor,courseId,'can_manage_content');const linked=await binding(db,courseId,input.linkedEntity),id=crypto.randomUUID();
  await db.query(`INSERT INTO course_library_files(course_id,id,filename,mime_type,file_bytes,checksum_sha256,linked_entity,file_type,status,uploaded_by) VALUES($1,$2,$3,'application/octet-stream',$4,$5,$6,$7,'active',$8)`,[courseId,id,input.name.trim(),bytes,crypto.createHash('sha256').update(bytes).digest(),linked,extension,actor]);
  await db.query('COMMIT');return {id};
 }catch(error){await db.query('ROLLBACK');throw error}
}
export async function archiveCourseFile(db:PoolClient,actor:string,courseId:string,id:string){
 await db.query('BEGIN');try{await requireMentor(db,actor,courseId,'can_manage_content');const result=await db.query("UPDATE course_library_files SET status='archived',archived_at=now() WHERE course_id=$1 AND id=$2 AND status='active'",[courseId,id]);if(!result.rowCount)throw missing();await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error}
}
export async function updateCourseFile(db:PoolClient,actor:string,courseId:string,id:string,input:{name:string;linkedEntity:string;contentBase64?:string}){
 if(typeof input.name!=='string'||!input.name.trim()||input.name.length>180||/[\\/\x00-\x1f]/.test(input.name))throw invalid();
 const extension=input.name.toLowerCase().split('.').pop();if(!['json','md','txt','pdf','zip'].includes(extension||''))throw invalid();
 let bytes:Buffer|undefined;if(input.contentBase64!==undefined){if(typeof input.contentBase64!=='string'||input.contentBase64.length>11184812||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.contentBase64))throw invalid();bytes=Buffer.from(input.contentBase64,'base64');if(!bytes.length||bytes.length>8388608)throw invalid()}
 await db.query('BEGIN');try{
  await requireMentor(db,actor,courseId,'can_manage_content');const linked=await binding(db,courseId,input.linkedEntity);
  const old=await db.query("SELECT * FROM course_library_files WHERE course_id=$1 AND id=$2 AND status='active' FOR UPDATE",[courseId,id]);if(!old.rowCount)throw missing();
  await db.query(`INSERT INTO course_library_file_versions(course_id,file_id,filename,file_type,linked_entity,file_bytes,checksum_sha256,changed_by) SELECT course_id,id,filename,file_type,linked_entity,file_bytes,checksum_sha256,$3 FROM course_library_files WHERE course_id=$1 AND id=$2`,[courseId,id,actor]);
  const contents=bytes||old.rows[0].file_bytes,checksum=bytes?crypto.createHash('sha256').update(bytes).digest():old.rows[0].checksum_sha256;
  await db.query('UPDATE course_library_files SET filename=$3,file_type=$4,linked_entity=$5,file_bytes=$6,checksum_sha256=$7,integrity_matches_legacy=CASE WHEN legacy_checksum_sha256 IS NULL THEN NULL ELSE legacy_checksum_sha256=$7 END,updated_at=now() WHERE course_id=$1 AND id=$2',[courseId,id,input.name.trim(),extension,linked,contents,checksum]);
  await db.query('COMMIT');return {id};
 }catch(error){await db.query('ROLLBACK');throw error}
}
export async function readCourseFile(db:PoolClient,actor:string,courseId:string,id:string){
 await requireMentor(db,actor,courseId,'can_manage_content');const result=await db.query("SELECT filename,file_bytes FROM course_library_files WHERE course_id=$1 AND id=$2 AND status='active'",[courseId,id]);if(!result.rowCount)throw missing();return result.rows[0] as {filename:string;file_bytes:Buffer};
}
