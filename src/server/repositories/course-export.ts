import JSZip from 'jszip';import type {PoolClient} from 'pg';import {requireMentor} from './courses';import {readCurriculum} from './curriculum-read';import {readModuleGraph} from './module-graph';

/** Export a consistent snapshot without including students, results, or credentials. */
export async function exportCourse(db:PoolClient,actor:string,courseId:string){
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');try{
  await requireMentor(db,actor,courseId,'can_manage_content');const curriculum=await readCurriculum(db,actor,courseId,false),graph=await readModuleGraph(db,actor,courseId);
  const course=(await db.query('SELECT id,title,status,curriculum_profile FROM courses WHERE id=$1',[courseId])).rows[0];
  const versions=(await db.query('SELECT lesson_id,id,version_label,prompt_text,author_id,author_display_name,changelog,status,created_at FROM lesson_versions WHERE course_id=$1 ORDER BY lesson_id,created_at,id',[courseId])).rows;
  const exams=(await db.query('SELECT * FROM course_exams WHERE course_id=$1 ORDER BY id',[courseId])).rows;const tickets=(await db.query('SELECT * FROM exam_tickets WHERE course_id=$1 ORDER BY exam_id,id',[courseId])).rows;
  const zip=new JSZip();zip.file('course.json',JSON.stringify({format:'rozephyr-course-v1',course,curriculum,graph,versions,exams,tickets},null,2));
  for(const lesson of curriculum.lessons)if(/^[a-zA-Z0-9_-]{1,80}$/.test(lesson.id)&&typeof lesson.prompt_text==='string')zip.file(`lessons/${lesson.id}.md`,lesson.prompt_text);
  const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});await db.query('COMMIT');return bytes;
 }catch(error){await db.query('ROLLBACK');throw error}
}
