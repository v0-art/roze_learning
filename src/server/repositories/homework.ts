import crypto from 'node:crypto';import type {PoolClient} from 'pg';import {AccessDenied,requireStudentAccess} from './courses';
const invalid=()=>Object.assign(new Error('Некорректные данные задания.'),{code:'INVALID_INPUT'});
const missing=()=>Object.assign(new Error('Домашнее задание не найдено.'),{code:'NOT_FOUND'});
export async function listStudentHomework(db:PoolClient,actor:string,courseId:string,studentId:string){
 await requireStudentAccess(db,actor,courseId,studentId);
 return (await db.query(`SELECT h.id,h.title,h.description,h.status,h.student_answer,h.ai_feedback,h.mentor_feedback,h.assigned_at,h.submitted_at,h.verified_at,a.lesson_id,t.module_id,l.topic_id
  FROM homework_assignments h JOIN lesson_attempts a ON a.id=h.attempt_id AND a.course_id=h.course_id AND a.student_id=h.student_id
  JOIN course_lessons l ON l.course_id=a.course_id AND l.id=a.lesson_id JOIN course_topics t ON t.course_id=l.course_id AND t.id=l.topic_id
  WHERE h.course_id=$1 AND h.student_id=$2 ORDER BY h.assigned_at DESC NULLS LAST,a.submitted_at DESC NULLS LAST,h.id DESC`,[courseId,studentId])).rows;
}
export async function submitHomework(db:PoolClient,student:string,courseId:string,id:string,answer:unknown){
 if(typeof answer!=='string'||!answer.trim()||answer.length>20000)throw invalid();
 await db.query('BEGIN');try{
  await requireStudentAccess(db,student,courseId,student);
  const current=await db.query('SELECT status FROM homework_assignments WHERE course_id=$1 AND student_id=$2 AND id=$3 FOR UPDATE',[courseId,student,id]);if(!current.rowCount)throw missing();
  if(current.rows[0].status==='verified')throw invalid();const submission=crypto.randomUUID();
  await db.query('INSERT INTO homework_submissions(id,course_id,student_id,homework_id,answer) VALUES($1,$2,$3,$4,$5)',[submission,courseId,student,id,answer.trim()]);
  await db.query("UPDATE homework_assignments SET student_answer=$4,status='submitted',submitted_at=now() WHERE course_id=$1 AND student_id=$2 AND id=$3",[courseId,student,id,answer.trim()]);
  await db.query('COMMIT');return {id:submission};
 }catch(error){await db.query('ROLLBACK');throw error}
}
export async function reviewHomework(db:PoolClient,mentor:string,courseId:string,student:string,id:string,status:unknown,feedback:unknown){
 if(mentor===student)throw new AccessDenied();if(!['verified','needs_revision'].includes(status as string)||typeof feedback!=='string'||!feedback.trim()||feedback.length>20000)throw invalid();
 await db.query('BEGIN');try{
  await requireStudentAccess(db,mentor,courseId,student);
  const current=await db.query('SELECT status,checked_by_self_report,ai_feedback,checked_lesson_id FROM homework_assignments WHERE course_id=$1 AND student_id=$2 AND id=$3 FOR UPDATE',[courseId,student,id]);if(!current.rowCount)throw missing();
  const submission=await db.query('SELECT id FROM homework_submissions WHERE course_id=$1 AND student_id=$2 AND homework_id=$3 ORDER BY submitted_at DESC,id DESC LIMIT 1',[courseId,student,id]);if(!submission.rowCount&&!(current.rows[0].checked_by_self_report&&current.rows[0].ai_feedback))throw invalid();
  if(submission.rowCount)await db.query("INSERT INTO homework_reviews(id,course_id,student_id,submission_id,reviewer_id,source,decision,feedback) VALUES($1,$2,$3,$4,$5,'mentor',$6,$7)",[crypto.randomUUID(),courseId,student,submission.rows[0].id,mentor,status,feedback.trim()]);
  const history=await db.query('SELECT COALESCE(max(position)+1,0)::int AS n FROM homework_review_history WHERE course_id=$1 AND student_id=$2 AND homework_id=$3',[courseId,student,id]);
  await db.query("INSERT INTO homework_review_history(course_id,student_id,homework_id,position,checked_lesson_id,status,feedback,needs_revision,source,recorded_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'mentor',now())",[courseId,student,id,history.rows[0].n,current.rows[0].checked_lesson_id,status,feedback.trim(),status==='needs_revision']);
  await db.query("UPDATE homework_assignments SET status=$4,mentor_feedback=$5,verified_at=CASE WHEN $4='verified' THEN now() ELSE NULL END WHERE course_id=$1 AND student_id=$2 AND id=$3",[courseId,student,id,status,feedback.trim()]);
  await db.query(`INSERT INTO course_messages(course_id,id,sender_id,recipient_id,subject,content) VALUES($1,$2,$3,$4,$5,$6)`,[courseId,crypto.randomUUID(),mentor,student,`Домашнее задание ${id}`,feedback.trim()]);
  await db.query(`INSERT INTO course_audit_events(course_id,actor_id,action,target_type,target_id,reason,previous_value,new_value) VALUES($1,$2,'MENTOR_REVIEW_HOMEWORK','HOMEWORK',$3,$4,$5,$6)`,[courseId,mentor,id,feedback.trim(),current.rows[0].status,status]);
  await db.query('COMMIT');return {success:true};
 }catch(error){await db.query('ROLLBACK');throw error}
}
