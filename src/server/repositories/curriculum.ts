import crypto from 'node:crypto';import type {PoolClient} from 'pg';import {requireMentor} from './courses';
const invalid=()=>Object.assign(new Error('Некорректные данные учебного плана.'),{code:'INVALID_INPUT'});
function validate(input:{id:unknown;title:unknown;position:unknown}){
 if(typeof input.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(input.id)||typeof input.title!=='string'||!input.title.trim()||input.title.length>200||!Number.isInteger(input.position)||Number(input.position)<0||Number(input.position)>100000)throw invalid();
 return {id:input.id,title:input.title.trim(),position:Number(input.position)};
}
export async function createModule(db:PoolClient,actor:string,courseId:string,input:{id:unknown;title:unknown;position:unknown}){
 const x=validate(input);await db.query('BEGIN');try{await requireMentor(db,actor,courseId,'can_manage_content');await db.query('SELECT 1 FROM courses WHERE id=$1 FOR UPDATE',[courseId]);await db.query("INSERT INTO course_modules(course_id,id,title,position,status) VALUES($1,$2,$3,$4,'draft')",[courseId,x.id,x.title,x.position]);await db.query('COMMIT');return {id:x.id}}catch(error){await db.query('ROLLBACK');throw error}
}
export async function createTopic(db:PoolClient,actor:string,courseId:string,moduleId:string,input:{id:unknown;title:unknown;position:unknown}){
 const x=validate(input);await db.query('BEGIN');try{await requireMentor(db,actor,courseId,'can_manage_content');await db.query("INSERT INTO course_topics(course_id,module_id,id,title,position,status) VALUES($1,$2,$3,$4,$5,'draft')",[courseId,moduleId,x.id,x.title,x.position]);await db.query('COMMIT');return {id:x.id}}catch(error){await db.query('ROLLBACK');throw error}
}
export async function createLesson(db:PoolClient,actor:string,courseId:string,topicId:string,input:{id:unknown;title:unknown;position:unknown;prompt:unknown;previousLessonId:unknown}){
 const x=validate(input);if(typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>500000||(input.previousLessonId!==null&&input.previousLessonId!==undefined&&(typeof input.previousLessonId!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(input.previousLessonId))))throw invalid();
 await db.query('BEGIN');try{await requireMentor(db,actor,courseId,'can_manage_content');const versionId=crypto.randomUUID();
  await db.query("INSERT INTO course_lessons(course_id,topic_id,id,title,position,status,previous_lesson_id,current_version) VALUES($1,$2,$3,$4,$5,'draft',$6,'1.0')",[courseId,topicId,x.id,x.title,x.position,input.previousLessonId||null]);
  await db.query("INSERT INTO lesson_versions(course_id,lesson_id,id,prompt_text,version_label,author_id,status) VALUES($1,$2,$3,$4,'1.0',$5,'draft')",[courseId,x.id,versionId,input.prompt,actor]);await db.query('UPDATE course_lessons SET current_lesson_version_id=$3 WHERE course_id=$1 AND id=$2',[courseId,x.id,versionId]);
  await db.query("INSERT INTO course_audit_events(course_id,actor_id,action,target_type,target_id,reason) VALUES($1,$2,'CREATE_LESSON','LESSON',$3,$4)",[courseId,actor,x.id,x.title]);await db.query('COMMIT');return {id:x.id,versionId,status:'draft'};
 }catch(error){await db.query('ROLLBACK');throw error}
}
