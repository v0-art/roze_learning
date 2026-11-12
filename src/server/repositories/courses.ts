import type { PoolClient } from 'pg';

/** Actor IDs come exclusively from the authenticated server session, never the request body. */
export class AccessDenied extends Error { constructor() {super('Доступ к операции запрещён.');} }
async function hasRole(db:PoolClient, actorId:string, role:string):Promise<boolean> {
  const r=await db.query(`SELECT 1 FROM platform_accounts a JOIN platform_account_roles r ON r.account_id=a.id
    WHERE a.id=$1 AND a.active AND a.archived_at IS NULL AND r.role=$2 AND r.enabled`,[actorId,role]);return !!r.rowCount;
}
async function inTransaction<T>(db:PoolClient, fn:()=>Promise<T>, ownTransaction=true):Promise<T>{
  if(ownTransaction)await db.query('BEGIN');try{const value=await fn();if(ownTransaction)await db.query('COMMIT');return value}catch(error){if(ownTransaction)await db.query('ROLLBACK');throw error}
}
export async function grantMentorRole(db:PoolClient, administratorId:string, accountId:string):Promise<void>{
  await inTransaction(db,async()=>{if(!await hasRole(db,administratorId,'administrator'))throw new AccessDenied();
    const account=await db.query('SELECT id FROM platform_accounts WHERE id=$1 AND active AND archived_at IS NULL FOR UPDATE',[accountId]);if(!account.rowCount)throw new Error('Учётная запись не найдена.');
    await db.query("INSERT INTO platform_account_roles(account_id,role) VALUES($1,'mentor') ON CONFLICT(account_id,role) DO UPDATE SET enabled=true",[accountId]);});
}
export async function revokeMentorRole(db:PoolClient,administratorId:string,accountId:string):Promise<void>{
 await inTransaction(db,async()=>{if(!await hasRole(db,administratorId,'administrator'))throw new AccessDenied();
  const result=await db.query("UPDATE platform_account_roles SET enabled=false WHERE account_id=$1 AND role='mentor'",[accountId]);
  if(!result.rowCount)throw new Error('Ментор не найден.');});
}
export async function createCourse(db:PoolClient, mentorId:string, id:string, title:string, ownTransaction=true):Promise<void>{
  if(!id.trim() || !title.trim()) throw new Error('Укажите код и название курса.');
  await inTransaction(db,async()=>{if(!await hasRole(db,mentorId,'mentor'))throw new AccessDenied();
    await db.query('INSERT INTO courses(id,title,owner_id) VALUES($1,$2,$3)',[id,title,mentorId]);
    await db.query(`INSERT INTO course_mentors(course_id,mentor_id,can_manage_content,can_manage_mentors,can_manage_students,can_review)
      VALUES($1,$2,true,true,true,true)`,[id,mentorId]);},ownTransaction);
}
export async function requireMentor(db:PoolClient, actorId:string, courseId:string, permission:'can_manage_mentors'|'can_manage_students'|'can_manage_content'|'can_review'){
  const column={can_manage_mentors:'can_manage_mentors',can_manage_students:'can_manage_students',can_manage_content:'can_manage_content',can_review:'can_review'}[permission];
  const r=await db.query(`SELECT 1 FROM course_mentors cm JOIN platform_accounts a ON a.id=cm.mentor_id
     JOIN platform_account_roles role ON role.account_id=a.id AND role.role='mentor' AND role.enabled
     WHERE cm.course_id=$1 AND cm.mentor_id=$2 AND cm.${column} AND a.active AND a.archived_at IS NULL`,[courseId,actorId]);if(!r.rowCount)throw new AccessDenied();
}
export async function addMentorToCourse(db:PoolClient, actorId:string, courseId:string, mentorId:string):Promise<void>{
  await inTransaction(db,async()=>{await requireMentor(db,actorId,courseId,'can_manage_mentors');if(!await hasRole(db,mentorId,'mentor'))throw new Error('Ментор не найден или отключён.');
    await db.query(`INSERT INTO course_mentors(course_id,mentor_id,can_review) VALUES($1,$2,true) ON CONFLICT DO NOTHING`,[courseId,mentorId]);});
}
export async function inviteMentorByUsername(db:PoolClient,actorId:string,courseId:string,username:unknown){
 if(typeof username!=='string'||!/^[a-z][a-z0-9_-]{2,31}$/.test(username))throw Object.assign(new Error('Некорректный логин ментора.'),{code:'INVALID_INPUT'});
 await requireMentor(db,actorId,courseId,'can_manage_mentors');
 const found=await db.query("SELECT a.id FROM platform_accounts a JOIN platform_account_roles r ON r.account_id=a.id AND r.role='mentor' AND r.enabled WHERE lower(a.username)=lower($1) AND a.active AND a.archived_at IS NULL",[username]);
 if(!found.rowCount)throw Object.assign(new Error('Ментор не найден.'),{code:'NOT_FOUND'});await addMentorToCourse(db,actorId,courseId,found.rows[0].id);return {id:found.rows[0].id};
}
export async function updateMentorPermissions(db:PoolClient,actorId:string,courseId:string,mentorId:string,permissions:{manageContent:unknown;manageMentors:unknown;manageStudents:unknown;review:unknown}){
 if(Object.values(permissions).some(value=>typeof value!=='boolean'))throw Object.assign(new Error('Некорректные права.'),{code:'INVALID_INPUT'});
 await inTransaction(db,async()=>{await requireMentor(db,actorId,courseId,'can_manage_mentors');const course=await db.query('SELECT owner_id FROM courses WHERE id=$1',[courseId]);
  if(course.rows[0]?.owner_id===mentorId&&Object.values(permissions).some(value=>value!==true))throw Object.assign(new Error('Права владельца курса нельзя ограничить.'),{code:'INVALID_INPUT'});
  const result=await db.query('UPDATE course_mentors SET can_manage_content=$3,can_manage_mentors=$4,can_manage_students=$5,can_review=$6 WHERE course_id=$1 AND mentor_id=$2',[courseId,mentorId,permissions.manageContent,permissions.manageMentors,permissions.manageStudents,permissions.review]);
  if(!result.rowCount)throw Object.assign(new Error('Ментор курса не найден.'),{code:'NOT_FOUND'});
  await db.query("INSERT INTO course_audit_events(course_id,actor_id,action,target_type,target_id,reason) VALUES($1,$2,'UPDATE_MENTOR_PERMISSIONS','MENTOR',$3,$4)",[courseId,actorId,mentorId,`content=${permissions.manageContent}, mentors=${permissions.manageMentors}, students=${permissions.manageStudents}, review=${permissions.review}`]);
 });
}
export async function enrollStudent(db:PoolClient, actorId:string, courseId:string, studentId:string, mentorId:string, ownTransaction=true):Promise<void>{
  await inTransaction(db,async()=>{await requireMentor(db,actorId,courseId,'can_manage_students');if(!await hasRole(db,studentId,'student'))throw new Error('Ученик не найден или отключён.');
    await db.query('INSERT INTO course_students(course_id,student_id) VALUES($1,$2) ON CONFLICT(course_id,student_id) DO UPDATE SET active=true',[courseId,studentId]);
    await db.query('INSERT INTO student_mentors(course_id,student_id,mentor_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[courseId,studentId,mentorId]);},ownTransaction);
}
/** Deactivate membership without deleting results, reports or mentor assignment history. */
export async function archiveCourseStudent(db:PoolClient,actorId:string,courseId:string,studentId:string):Promise<void>{
 await inTransaction(db,async()=>{await requireMentor(db,actorId,courseId,'can_manage_students');
  const result=await db.query('UPDATE course_students SET active=false WHERE course_id=$1 AND student_id=$2 AND active',[courseId,studentId]);
  if(!result.rowCount)throw Object.assign(new Error('Ученик не найден в курсе.'),{code:'NOT_FOUND'});
 });
}
export async function listAccessibleCourses(db:PoolClient, actorId:string):Promise<Array<{id:string;title:string;status:string}>>{
  const r=await db.query(`SELECT DISTINCT c.id,c.title,c.status FROM courses c JOIN platform_accounts a ON a.id=$1 AND a.active AND a.archived_at IS NULL
    WHERE EXISTS(SELECT 1 FROM course_mentors m JOIN platform_account_roles r ON r.account_id=m.mentor_id AND r.role='mentor' AND r.enabled WHERE m.course_id=c.id AND m.mentor_id=a.id)
       OR EXISTS(SELECT 1 FROM course_students s JOIN platform_account_roles r ON r.account_id=s.student_id AND r.role='student' AND r.enabled WHERE s.course_id=c.id AND s.student_id=a.id AND s.active)
    ORDER BY c.title,c.id`,[actorId]);return r.rows;
}
export async function requireStudentAccess(db:PoolClient, actorId:string, courseId:string, studentId:string){
  const r=await db.query(`SELECT 1 FROM platform_accounts a WHERE a.id=$1 AND a.active AND a.archived_at IS NULL AND
    (EXISTS(SELECT 1 FROM course_students s JOIN platform_account_roles r ON r.account_id=s.student_id AND r.role='student' AND r.enabled WHERE s.course_id=$2 AND s.student_id=$3 AND s.active AND s.student_id=a.id)
      OR EXISTS(SELECT 1 FROM student_mentors sm JOIN course_mentors cm ON cm.course_id=sm.course_id AND cm.mentor_id=sm.mentor_id
        JOIN platform_account_roles r ON r.account_id=cm.mentor_id AND r.role='mentor' AND r.enabled
        JOIN course_students s ON s.course_id=sm.course_id AND s.student_id=sm.student_id AND s.active
        WHERE sm.course_id=$2 AND sm.student_id=$3 AND sm.mentor_id=a.id AND cm.can_review))`,[actorId,courseId,studentId]);
  if(!r.rowCount)throw new AccessDenied();
}
export async function listStudentAttempts(db:PoolClient, actorId:string, courseId:string, studentId:string){
  await requireStudentAccess(db,actorId,courseId,studentId);
  const result=await db.query(`SELECT a.id,a.lesson_id,a.status,a.score,a.max_score,a.submitted_at,a.mentor_confirmed,
    l.title AS lesson_title,t.id AS topic_id,t.title AS topic_title,m.id AS module_id,m.title AS module_title
    FROM lesson_attempts a JOIN course_lessons l ON l.course_id=a.course_id AND l.id=a.lesson_id
    JOIN course_topics t ON t.course_id=l.course_id AND t.id=l.topic_id
    JOIN course_modules m ON m.course_id=t.course_id AND m.id=t.module_id
    WHERE a.course_id=$1 AND a.student_id=$2 ORDER BY a.submitted_at DESC NULLS LAST,a.id DESC`,[courseId,studentId]);return result.rows;
}
export async function readStudentAttempt(db:PoolClient,actorId:string,courseId:string,studentId:string,attemptId:string){
 await requireStudentAccess(db,actorId,courseId,studentId);
 const attempt=await db.query(`SELECT a.id,a.lesson_id,a.status,a.score,a.max_score,a.reported_earned_score,a.reported_max_score,a.mentor_confirmed,a.mentor_feedback,a.submitted_at,a.original_report_bytes,l.title AS lesson_title,t.id AS topic_id,t.title AS topic_title,m.id AS module_id,m.title AS module_title
  FROM lesson_attempts a JOIN course_lessons l ON l.course_id=a.course_id AND l.id=a.lesson_id JOIN course_topics t ON t.course_id=l.course_id AND t.id=l.topic_id JOIN course_modules m ON m.course_id=t.course_id AND m.id=t.module_id
  WHERE a.course_id=$1 AND a.student_id=$2 AND a.id=$3`,[courseId,studentId,attemptId]);
 if(!attempt.rowCount)return null;
 const questions=await db.query(`SELECT question_id,result,feedback,student_answer,earned_points,max_points,needs_recheck FROM lesson_question_results WHERE attempt_id=$1 ORDER BY question_id`,[attemptId]);
 const data=attempt.rows[0];return {...data,original_report:data.original_report_bytes?.toString('utf8')??null,original_report_bytes:undefined,questions:questions.rows};
}
export async function courseMembership(db:PoolClient, actorId:string, courseId:string):Promise<'mentor'|'student'> {
  const result=await db.query(`SELECT EXISTS(SELECT 1 FROM course_mentors m JOIN platform_account_roles r ON r.account_id=m.mentor_id AND r.role='mentor' AND r.enabled WHERE m.course_id=$2 AND m.mentor_id=a.id) AS mentor,
    EXISTS(SELECT 1 FROM course_students s JOIN platform_account_roles r ON r.account_id=s.student_id AND r.role='student' AND r.enabled WHERE s.course_id=$2 AND s.student_id=a.id AND s.active) AS student
    FROM platform_accounts a WHERE a.id=$1 AND a.active AND a.archived_at IS NULL`,[actorId,courseId]);
  if(result.rows[0]?.mentor)return 'mentor';if(result.rows[0]?.student)return 'student';throw new AccessDenied();
}
export async function listCourseModules(db:PoolClient,actorId:string,courseId:string){
  await courseMembership(db,actorId,courseId);
  const result=await db.query(`SELECT DISTINCT m.id,m.title,m.short_description,m.position FROM course_modules m
    WHERE m.course_id=$1 ORDER BY m.position`,[courseId]);return result.rows;
}
export async function listModuleTopics(db:PoolClient,actorId:string,courseId:string,moduleId:string){
 await courseMembership(db,actorId,courseId);
 const result=await db.query(`SELECT t.id,t.module_id,t.title,t.description,t.position FROM course_topics t
  WHERE t.course_id=$1 AND t.module_id=$2 ORDER BY t.position,t.id`,[courseId,moduleId]);return result.rows;
}
export async function listTopicLessons(db:PoolClient,actorId:string,courseId:string,topicId:string){
 const membership=await courseMembership(db,actorId,courseId);
 const result=await db.query(`SELECT l.id,l.topic_id,l.title,l.position,l.status,l.duration_minutes,l.previous_lesson_id,
   EXISTS(SELECT 1 FROM lesson_attempts a WHERE a.course_id=l.course_id AND a.student_id=$3 AND a.lesson_id=l.id AND a.status='completed') AS completed,
   CASE WHEN $4='mentor' OR l.previous_lesson_id IS NULL THEN false ELSE NOT EXISTS(SELECT 1 FROM lesson_attempts a WHERE a.course_id=l.course_id AND a.student_id=$3 AND a.lesson_id=l.previous_lesson_id AND a.status='completed') END AS locked
   FROM course_lessons l WHERE l.course_id=$1 AND l.topic_id=$2 AND ($4='mentor' OR l.status='published') ORDER BY l.position,l.id`,[courseId,topicId,actorId,membership]);return result.rows;
}
export async function listAssignedStudents(db:PoolClient,actorId:string,courseId:string){
  await requireMentor(db,actorId,courseId,'can_review');
  const result=await db.query(`SELECT a.id,a.display_name FROM student_mentors sm JOIN course_students s ON s.course_id=sm.course_id AND s.student_id=sm.student_id AND s.active
    JOIN platform_accounts a ON a.id=s.student_id AND a.active AND a.archived_at IS NULL
    WHERE sm.course_id=$1 AND sm.mentor_id=$2 ORDER BY a.display_name,a.id`,[courseId,actorId]);return result.rows;
}
export async function listCourseRoster(db:PoolClient,actorId:string,courseId:string){
  await requireMentor(db,actorId,courseId,'can_manage_students');
  return (await db.query(`SELECT a.id,a.username,a.display_name,s.active AS enrolled,a.active AS account_active,s.enrolled_at,ARRAY(SELECT sm.mentor_id FROM student_mentors sm WHERE sm.course_id=s.course_id AND sm.student_id=s.student_id ORDER BY sm.mentor_id) AS mentor_ids
   FROM course_students s JOIN platform_accounts a ON a.id=s.student_id WHERE s.course_id=$1 ORDER BY a.display_name,a.id`,[courseId])).rows;
}
export async function listCourseMentors(db:PoolClient,actorId:string,courseId:string){
  try{await requireMentor(db,actorId,courseId,'can_manage_mentors')}catch(error){if(!(error instanceof AccessDenied))throw error;await requireMentor(db,actorId,courseId,'can_manage_students')}
  return (await db.query(`SELECT a.id,a.username,a.display_name,a.active,r.enabled,cm.can_manage_content,cm.can_manage_mentors,cm.can_manage_students,cm.can_review,(c.owner_id=a.id) AS is_owner
   FROM course_mentors cm JOIN platform_accounts a ON a.id=cm.mentor_id JOIN platform_account_roles r ON r.account_id=a.id AND r.role='mentor' JOIN courses c ON c.id=cm.course_id WHERE cm.course_id=$1 ORDER BY a.display_name,a.id`,[courseId])).rows;
}
export async function listOwnMentors(db:PoolClient,studentId:string,courseId:string){
  await requireStudentAccess(db,studentId,courseId,studentId);
  return (await db.query(`SELECT a.id,a.display_name FROM student_mentors sm JOIN course_mentors cm ON cm.course_id=sm.course_id AND cm.mentor_id=sm.mentor_id
   JOIN platform_accounts a ON a.id=sm.mentor_id AND a.active AND a.archived_at IS NULL JOIN platform_account_roles r ON r.account_id=a.id AND r.role='mentor' AND r.enabled
   WHERE sm.course_id=$1 AND sm.student_id=$2 ORDER BY a.display_name,a.id`,[courseId,studentId])).rows;
}
export async function readCourseLesson(db:PoolClient,actorId:string,courseId:string,lessonId:string){
  const membership=await courseMembership(db,actorId,courseId);
  const result=await db.query(`SELECT l.id,l.title,l.status,l.previous_lesson_id,l.current_version FROM course_lessons l WHERE l.course_id=$1 AND l.id=$2`,[courseId,lessonId]);
  const lesson=result.rows[0];if(!lesson || (membership==='student'&&lesson.status!=='published'))return null;
  if(membership==='student'&&lesson.previous_lesson_id){
    const completed=await db.query(`SELECT 1 FROM lesson_attempts WHERE course_id=$1 AND student_id=$2 AND lesson_id=$3 AND status='completed' LIMIT 1`,[courseId,actorId,lesson.previous_lesson_id]);
    if(!completed.rowCount)throw new AccessDenied();
  }
  return lesson;
}
