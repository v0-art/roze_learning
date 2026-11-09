import type {PoolClient} from 'pg';import {requireStudentAccess} from './courses';

/** The student and assigned reviewing mentors see only that student's notifications. */
export async function listStudentNotifications(db:PoolClient,actor:string,courseId:string,student:string){
 await requireStudentAccess(db,actor,courseId,student);
 return (await db.query(`SELECT id,title,description,event_type,related_entity_id,status,score,max_score,created_at
  FROM course_notifications WHERE course_id=$1 AND student_id=$2 ORDER BY created_at DESC,id`,[courseId,student])).rows;
}
