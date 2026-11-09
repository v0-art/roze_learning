import crypto from 'node:crypto';import type {PoolClient} from 'pg';import {AccessDenied} from './courses';

// A message is visible only while its student and assigned mentor are active in this course.
const pair=`EXISTS(SELECT 1 FROM student_mentors sm
 JOIN course_students s ON s.course_id=sm.course_id AND s.student_id=sm.student_id AND s.active
 JOIN course_mentors cm ON cm.course_id=sm.course_id AND cm.mentor_id=sm.mentor_id
 JOIN platform_accounts st ON st.id=sm.student_id AND st.active AND st.archived_at IS NULL
 JOIN platform_accounts mt ON mt.id=sm.mentor_id AND mt.active AND mt.archived_at IS NULL
 JOIN platform_account_roles sr ON sr.account_id=st.id AND sr.role='student' AND sr.enabled
 JOIN platform_account_roles mr ON mr.account_id=mt.id AND mr.role='mentor' AND mr.enabled
 WHERE sm.course_id=$1 AND ((sm.student_id=$2 AND sm.mentor_id=$3) OR (sm.student_id=$3 AND sm.mentor_id=$2)))`;
async function requirePair(db:PoolClient,courseId:string,actor:string,other:string){if(!(await db.query(`SELECT 1 WHERE ${pair}`,[courseId,actor,other])).rowCount)throw new AccessDenied()}
export async function listMessages(db:PoolClient,actor:string,courseId:string){
 // Membership check prevents outsiders from using an empty inbox to enumerate courses.
 const member=await db.query(`SELECT 1 FROM course_students s JOIN platform_accounts a ON a.id=s.student_id AND a.active AND a.archived_at IS NULL JOIN platform_account_roles r ON r.account_id=a.id AND r.role='student' AND r.enabled WHERE s.course_id=$1 AND s.student_id=$2 AND s.active UNION ALL SELECT 1 FROM course_mentors m JOIN platform_accounts a ON a.id=m.mentor_id AND a.active AND a.archived_at IS NULL JOIN platform_account_roles r ON r.account_id=a.id AND r.role='mentor' AND r.enabled WHERE m.course_id=$1 AND m.mentor_id=$2 LIMIT 1`,[courseId,actor]);if(!member.rowCount)throw new AccessDenied();
 const result=await db.query(`SELECT m.id,m.sender_id,m.recipient_id,m.subject,m.content,m.created_at,m.read_at,sender.display_name AS sender_name,recipient.display_name AS recipient_name FROM course_messages m JOIN platform_accounts sender ON sender.id=m.sender_id JOIN platform_accounts recipient ON recipient.id=m.recipient_id WHERE m.course_id=$1 AND (m.sender_id=$2 OR m.recipient_id=$2) AND ${pair.replaceAll('$3','CASE WHEN m.sender_id=$2 THEN m.recipient_id ELSE m.sender_id END')} ORDER BY m.created_at DESC,m.id`,[courseId,actor]);return result.rows;
}
export async function sendMessage(db:PoolClient,actor:string,courseId:string,recipient:string,content:unknown){
 if(typeof content!=='string'||!content.trim()||content.length>4000)throw Object.assign(new Error('Некорректное сообщение.'),{code:'INVALID_INPUT'});
 await db.query('BEGIN');try{await requirePair(db,courseId,actor,recipient);const id=crypto.randomUUID();await db.query('INSERT INTO course_messages(course_id,id,sender_id,recipient_id,content) VALUES($1,$2,$3,$4,$5)',[courseId,id,actor,recipient,content.trim()]);await db.query('COMMIT');return {id}}catch(error){await db.query('ROLLBACK');throw error}
}
export async function markMessageRead(db:PoolClient,actor:string,courseId:string,id:string){
 const message=await db.query('SELECT sender_id FROM course_messages WHERE course_id=$1 AND id=$2 AND recipient_id=$3',[courseId,id,actor]);if(!message.rowCount)throw Object.assign(new Error('Сообщение не найдено.'),{code:'NOT_FOUND'});await requirePair(db,courseId,actor,message.rows[0].sender_id);await db.query('UPDATE course_messages SET read_at=COALESCE(read_at,now()) WHERE course_id=$1 AND id=$2 AND recipient_id=$3',[courseId,id,actor]);
}
