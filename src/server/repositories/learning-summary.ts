import type {PoolClient} from 'pg';
import {requireStudentAccess} from './courses';

/** Reported coverage and gap history remain attributed to the selected student and course. */
export async function readLearningSummary(db:PoolClient,actor:string,courseId:string,studentId:string){
 await requireStudentAccess(db,actor,courseId,studentId);
 const gaps=await db.query(`SELECT g.id,g.description,g.status,g.created_at,a.lesson_id
   FROM knowledge_gaps g JOIN lesson_attempts a ON a.id=g.source_attempt_id AND a.course_id=g.course_id AND a.student_id=g.student_id
   WHERE g.course_id=$1 AND g.student_id=$2 ORDER BY g.created_at DESC NULLS LAST,g.id DESC`,[courseId,studentId]);
 const materials=await db.query(`SELECT a.id AS attempt_id,a.lesson_id,a.submitted_at,a.mentor_confirmed,t.position,t.description
   FROM report_covered_topics t JOIN lesson_attempts a ON a.id=t.attempt_id
   WHERE a.course_id=$1 AND a.student_id=$2 AND a.status='completed'
   ORDER BY a.submitted_at DESC NULLS LAST,a.id DESC,t.position`,[courseId,studentId]);
 return {gaps:gaps.rows,materials:materials.rows};
}
