import crypto from 'node:crypto';
import {promisify} from 'node:util';
import type {PoolClient} from 'pg';
import {AccessDenied} from './courses';

const scrypt=promisify(crypto.scrypt);
type NewAccount={id:string;username:string;displayName:string;password:string};
export async function listMentors(db:PoolClient,actorId:string){
 const grant=await db.query("SELECT 1 FROM platform_accounts a JOIN platform_account_roles r ON r.account_id=a.id WHERE a.id=$1 AND a.active AND a.archived_at IS NULL AND r.role='administrator' AND r.enabled",[actorId]);if(!grant.rowCount)throw new AccessDenied();
 return (await db.query("SELECT a.id,a.username,a.display_name,a.active,r.enabled FROM platform_accounts a JOIN platform_account_roles r ON r.account_id=a.id AND r.role='mentor' ORDER BY a.display_name,a.id")).rows;
}
async function insertAccount(db:PoolClient,input:NewAccount,role:'mentor'|'student'){
 if(typeof input.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(input.id)||typeof input.username!=='string'||!/^[a-z][a-z0-9_-]{2,31}$/.test(input.username)||typeof input.displayName!=='string'||!input.displayName.trim()||input.displayName.length>200||typeof input.password!=='string'||input.password.length<16||input.password.length>256)throw Object.assign(new Error('Некорректные данные учётной записи.'),{code:'INVALID_INPUT'});
 const salt=crypto.randomBytes(32),hash=await scrypt(input.password,salt,64) as Buffer;
 await db.query('INSERT INTO platform_accounts(id,username,display_name) VALUES($1,$2,$3)',[input.id,input.username,input.displayName.trim()]);
 await db.query('INSERT INTO platform_account_roles(account_id,role) VALUES($1,$2)',[input.id,role]);
 await db.query('INSERT INTO platform_credentials(account_id,password_salt,password_hash) VALUES($1,$2,$3)',[input.id,salt,hash]);
}
/** Administrator grants platform access but gains no course access. */
export async function createMentorAccount(db:PoolClient,actorId:string,input:NewAccount){
 await db.query('BEGIN');try{
  const grant=await db.query(`SELECT 1 FROM platform_accounts a JOIN platform_account_roles r ON r.account_id=a.id
    WHERE a.id=$1 AND a.active AND a.archived_at IS NULL AND r.role='administrator' AND r.enabled FOR SHARE OF a,r`,[actorId]);
  if(!grant.rowCount)throw new AccessDenied();
  await insertAccount(db,input,'mentor');await db.query('COMMIT');return {id:input.id};
 }catch(error){await db.query('ROLLBACK');throw error}
}
/** A student belongs to the selected course and is assigned to an active course mentor. */
export async function createStudentAccount(db:PoolClient,actorId:string,courseId:string,mentorId:string,input:NewAccount){
 await db.query('BEGIN');try{
  const grant=await db.query(`SELECT 1 FROM course_mentors cm JOIN platform_accounts a ON a.id=cm.mentor_id
   JOIN platform_account_roles r ON r.account_id=a.id AND r.role='mentor' AND r.enabled
   WHERE cm.course_id=$1 AND cm.mentor_id=$2 AND cm.can_manage_students AND a.active AND a.archived_at IS NULL FOR SHARE OF cm,a,r`,[courseId,actorId]);
  if(!grant.rowCount)throw new AccessDenied();
  const assignee=await db.query(`SELECT 1 FROM course_mentors cm JOIN platform_accounts a ON a.id=cm.mentor_id
   JOIN platform_account_roles r ON r.account_id=a.id AND r.role='mentor' AND r.enabled
   WHERE cm.course_id=$1 AND cm.mentor_id=$2 AND a.active AND a.archived_at IS NULL FOR SHARE OF cm,a,r`,[courseId,mentorId]);
  if(!assignee.rowCount)throw Object.assign(new Error('Ментор курса не найден.'),{code:'INVALID_INPUT'});
  await insertAccount(db,input,'student');
  await db.query('INSERT INTO course_students(course_id,student_id) VALUES($1,$2)',[courseId,input.id]);
  await db.query('INSERT INTO student_mentors(course_id,student_id,mentor_id) VALUES($1,$2,$3)',[courseId,input.id,mentorId]);
  await db.query('COMMIT');return {id:input.id};
 }catch(error){await db.query('ROLLBACK');throw error}
}
