import type {PoolClient} from 'pg';
import {requireStudentAccess} from './courses';

/** Account sign-ins and completed lessons by day; account sign-ins are not course-specific. */
export async function readStudentActivity(db:PoolClient,actor:string,courseId:string,studentId:string,timeZone:unknown){
 await requireStudentAccess(db,actor,courseId,studentId);
 if(typeof timeZone!=='string'||timeZone.length>100||!/^[A-Za-z0-9_+\-/]+$/.test(timeZone))throw Object.assign(new Error('Некорректный часовой пояс.'),{code:'INVALID_INPUT'});
 if(!(await db.query('SELECT 1 FROM pg_timezone_names WHERE name=$1 LIMIT 1',[timeZone])).rowCount)throw Object.assign(new Error('Неизвестный часовой пояс.'),{code:'INVALID_INPUT'});
 const result=await db.query(`WITH bounds AS (SELECT (now() AT TIME ZONE $3)::date AS today),
   days AS (SELECT (today-offset_days)::date AS day FROM bounds CROSS JOIN generate_series(0,29) AS offset_days),
   logins AS (SELECT (s.created_at AT TIME ZONE $3)::date AS day,count(*)::int AS count FROM account_sessions s CROSS JOIN bounds b
      WHERE s.account_id=$2 AND s.created_at>=((b.today-29)::timestamp AT TIME ZONE $3) AND s.created_at<=now() GROUP BY 1),
   lessons AS (SELECT (a.submitted_at AT TIME ZONE $3)::date AS day,count(DISTINCT a.lesson_id)::int AS count FROM lesson_attempts a CROSS JOIN bounds b
      WHERE a.course_id=$1 AND a.student_id=$2 AND a.status='completed' AND a.submitted_at>=((b.today-29)::timestamp AT TIME ZONE $3) AND a.submitted_at<=now() GROUP BY 1)
   SELECT to_char(d.day,'YYYY-MM-DD') AS day,coalesce(l.count,0)::int AS logins,coalesce(c.count,0)::int AS lessons
   FROM days d LEFT JOIN logins l USING(day) LEFT JOIN lessons c USING(day) ORDER BY d.day`,[courseId,studentId,timeZone]);
 return {timeZone,days:result.rows};
}
