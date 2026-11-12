import crypto from 'node:crypto';import type {PoolClient} from 'pg';import {AccessDenied,requireMentor,requireStudentAccess} from './courses';
const invalid=(message:string)=>Object.assign(new Error(message),{code:'INVALID_INPUT'});
export async function addV3Decision(db:PoolClient,mentor:string,courseId:string,student:string,itemId:string,decision:unknown,reason:unknown){
 if(mentor===student||!['allow_extra_attempt','allow_progress'].includes(decision as string)||typeof reason!=='string'||!reason.trim()||reason.length>4000)throw invalid('Укажите решение и его причину.');
 await db.query('BEGIN');try{await requireStudentAccess(db,mentor,courseId,student);const item=await db.query("SELECT kind FROM v3_content_entities WHERE course_id=$1 AND id=$2",[courseId,itemId]);if(!item.rowCount||!['control_work','exam'].includes(item.rows[0].kind))throw invalid('Аттестация не найдена.');const id=crypto.randomUUID();await db.query('INSERT INTO v3_mentor_decisions(id,course_id,student_id,item_id,mentor_id,decision,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,courseId,student,itemId,mentor,decision,reason.trim()]);await db.query('COMMIT');return {id}}catch(error){await db.query('ROLLBACK');throw error}
}
export async function listV3Notifications(db:PoolClient,mentor:string,courseId:string){
 await requireMentor(db,mentor,courseId,'can_review');return (await db.query(`SELECT n.id,n.event_type,n.created_at,n.read_at,s.id AS session_id,s.item_id,s.item_kind,s.student_id,s.attempt_number,r.report->'result' AS result FROM v3_mentor_notifications n JOIN v3_sessions s ON s.id=n.session_id LEFT JOIN v3_reports r ON r.session_id=s.id JOIN student_mentors sm ON sm.course_id=s.course_id AND sm.student_id=s.student_id AND sm.mentor_id=n.mentor_id WHERE n.mentor_id=$1 AND s.course_id=$2 ORDER BY n.created_at DESC,n.id`,[mentor,courseId])).rows;
}
export async function readV3Notification(db:PoolClient,mentor:string,courseId:string,id:string){
 await requireMentor(db,mentor,courseId,'can_review');const result=await db.query(`UPDATE v3_mentor_notifications n SET read_at=COALESCE(read_at,now()) FROM v3_sessions s,student_mentors sm WHERE n.id=$1 AND n.mentor_id=$2 AND n.session_id=s.id AND s.course_id=$3 AND sm.course_id=s.course_id AND sm.student_id=s.student_id AND sm.mentor_id=n.mentor_id RETURNING n.id`,[id,mentor,courseId]);if(!result.rowCount)throw new AccessDenied();return {id};
}
