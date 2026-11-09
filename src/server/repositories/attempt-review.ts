import crypto from 'node:crypto';import type {PoolClient} from 'pg';import {AccessDenied,requireStudentAccess} from './courses';

export async function reviewLessonAttempt(db:PoolClient,mentor:string,courseId:string,student:string,attemptId:string,score:unknown,feedback:unknown,reason:unknown){
 if(mentor===student)throw new AccessDenied();
 if(typeof score!=='number'||!Number.isFinite(score)||score<0||typeof feedback!=='string'||feedback.length>20000||typeof reason!=='string'||!reason.trim()||reason.length>4000)throw Object.assign(new Error('Некорректное решение.'),{code:'INVALID_INPUT'});
 await db.query('BEGIN');try{
  await requireStudentAccess(db,mentor,courseId,student);
  const result=await db.query('SELECT lesson_id,score,max_score FROM lesson_attempts WHERE course_id=$1 AND student_id=$2 AND id=$3 FOR UPDATE',[courseId,student,attemptId]);
  if(!result.rowCount)throw Object.assign(new Error('Отчёт не найден.'),{code:'NOT_FOUND'});
  const old=result.rows[0];if(old.max_score===null||score>Number(old.max_score))throw Object.assign(new Error('Баллы вне диапазона.'),{code:'INVALID_INPUT'});
  await db.query('UPDATE lesson_attempts SET score=$4,mentor_feedback=$5,mentor_confirmed=true,confirmed_at=now() WHERE course_id=$1 AND student_id=$2 AND id=$3',[courseId,student,attemptId,score,feedback]);
  await db.query('INSERT INTO course_messages(course_id,id,sender_id,recipient_id,subject,content) VALUES($1,$2,$3,$4,$5,$6)',[courseId,crypto.randomUUID(),mentor,student,`Отчёт ${old.lesson_id}`,feedback.trim()||'Ментор подтвердил отчёт.']);
  await db.query("INSERT INTO course_audit_events(course_id,actor_id,action,target_type,target_id,reason,previous_value,new_value) VALUES($1,$2,'MENTOR_CONFIRM_ATTEMPT','LESSON_ATTEMPT',$3,$4,$5,$6)",[courseId,mentor,attemptId,reason.trim(),old.score===null?null:String(old.score),String(score)]);
  await db.query('COMMIT');return {success:true};
 }catch(error){await db.query('ROLLBACK');throw error}
}
