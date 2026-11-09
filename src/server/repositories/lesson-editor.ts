import crypto from 'node:crypto';import type {PoolClient} from 'pg';import {requireMentor} from './courses';
const invalid=()=>Object.assign(new Error('Некорректные данные урока.'),{code:'INVALID_INPUT'});
const missing=()=>Object.assign(new Error('Урок не найден.'),{code:'NOT_FOUND'});
export async function getEditableLesson(db:PoolClient,actor:string,courseId:string,id:string){
 await requireMentor(db,actor,courseId,'can_manage_content');const result=await db.query("SELECT l.id,l.title,l.status,v.id AS version_id,v.version_label,v.prompt_text FROM course_lessons l JOIN lesson_versions v ON v.course_id=l.course_id AND v.lesson_id=l.id AND v.id=COALESCE(l.current_lesson_version_id,'current') WHERE l.course_id=$1 AND l.id=$2",[courseId,id]);if(!result.rowCount)throw missing();return result.rows[0];
}
export async function editLesson(db:PoolClient,actor:string,courseId:string,id:string,input:{title:unknown;prompt:unknown;version:unknown;expectedVersionId:unknown}){
 if(typeof input.title!=='string'||!input.title.trim()||input.title.length>200||typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>500000||typeof input.version!=='string'||!input.version.trim()||input.version.length>64||typeof input.expectedVersionId!=='string'||!input.expectedVersionId)throw invalid();
 await db.query('BEGIN');try{
  await requireMentor(db,actor,courseId,'can_manage_content');const found=await db.query("SELECT COALESCE(current_lesson_version_id,'current') AS version_id FROM course_lessons WHERE course_id=$1 AND id=$2 FOR UPDATE",[courseId,id]);if(!found.rowCount)throw missing();
  if(found.rows[0].version_id!==input.expectedVersionId)throw Object.assign(new Error('Урок уже изменён.'),{code:'CONFLICT'});
  const versionId=crypto.randomUUID();await db.query("INSERT INTO lesson_versions(course_id,lesson_id,id,prompt_text,version_label,author_id,status) VALUES($1,$2,$3,$4,$5,$6,'draft')",[courseId,id,versionId,input.prompt,input.version.trim(),actor]);
  const hash=crypto.createHash('sha256').update(JSON.stringify({promptTemplate:input.prompt,generalRules:'',moduleInstructions:''})).digest('hex');
  await db.query("UPDATE course_lessons SET title=$3,status='draft',current_version=$4,current_lesson_version_id=$5,content_hash=$6 WHERE course_id=$1 AND id=$2",[courseId,id,input.title.trim(),input.version.trim(),versionId,hash]);
  await db.query("INSERT INTO course_audit_events(course_id,actor_id,action,target_type,target_id,reason) VALUES($1,$2,'EDIT_LESSON','LESSON',$3,$4)",[courseId,actor,id,`Версия ${input.version.trim()}`]);await db.query('COMMIT');return {id,versionId,status:'draft'};
 }catch(error){await db.query('ROLLBACK');throw error}
}
export async function publishLesson(db:PoolClient,actor:string,courseId:string,id:string,expectedVersionId:unknown){
 if(typeof expectedVersionId!=='string'||!expectedVersionId)throw invalid();await db.query('BEGIN');try{
  await requireMentor(db,actor,courseId,'can_manage_content');const found=await db.query("SELECT COALESCE(current_lesson_version_id,'current') AS version_id FROM course_lessons WHERE course_id=$1 AND id=$2 FOR UPDATE",[courseId,id]);if(!found.rowCount)throw missing();if(found.rows[0].version_id!==expectedVersionId)throw Object.assign(new Error('Урок уже изменён.'),{code:'CONFLICT'});
  const version=await db.query("UPDATE lesson_versions SET status='published' WHERE course_id=$1 AND lesson_id=$2 AND id=$3 AND length(trim(prompt_text))>0 RETURNING id",[courseId,id,expectedVersionId]);if(!version.rowCount)throw invalid();
  await db.query("UPDATE course_lessons SET status='published',current_lesson_version_id=$3 WHERE course_id=$1 AND id=$2",[courseId,id,expectedVersionId]);await db.query("INSERT INTO course_audit_events(course_id,actor_id,action,target_type,target_id,reason) VALUES($1,$2,'PUBLISH_LESSON','LESSON',$3,$4)",[courseId,actor,id,expectedVersionId]);await db.query('COMMIT');return {id,status:'published'};
 }catch(error){await db.query('ROLLBACK');throw error}
}
