import crypto from 'node:crypto';import type {PoolClient} from 'pg';
import {assembleLessonPrompt} from '../../core/promptEngine';import {validateStructuredReport} from '../../core/reportValidator';import {readCourseLesson,requireStudentAccess,AccessDenied} from './courses';

/** Assemble on the server from typed course and student records, then preserve the exact prompt. */
export async function createLessonSnapshot(db:PoolClient,student:string,courseId:string,lessonId:string){
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');try{
  await requireStudentAccess(db,student,courseId,student);
  const permitted=await readCourseLesson(db,student,courseId,lessonId);if(!permitted)throw Object.assign(new Error('Урок недоступен.'),{code:'NOT_FOUND'});
  const result=await db.query(`SELECT l.id,l.title,l.duration_minutes,l.previous_lesson_id,v.id AS version_id,v.version_label,v.prompt_text,c.curriculum_profile
   FROM course_lessons l JOIN lesson_versions v ON v.course_id=l.course_id AND v.lesson_id=l.id AND v.id=COALESCE(l.current_lesson_version_id,'current')
   JOIN courses c ON c.id=l.course_id
   WHERE l.course_id=$1 AND l.id=$2 AND l.status='published'`,[courseId,lessonId]);
  if(!result.rowCount)throw Object.assign(new Error('Опубликованная версия не найдена.'),{code:'NOT_FOUND'});const row=result.rows[0];
  const fallback=lessonId.match(/^(.*-U)(\d+)$/);const previous=row.previous_lesson_id||(fallback&&Number(fallback[2])>1?`${fallback[1]}${String(Number(fallback[2])-1).padStart(fallback[2].length,'0')}`:null);
  let previousReport:any=null,feedback:string|null=null;
  if(previous){const attempts=await db.query(`SELECT original_report_bytes,mentor_feedback FROM lesson_attempts WHERE course_id=$1 AND student_id=$2 AND lesson_id=$3 AND status='completed' ORDER BY submitted_at DESC,id DESC LIMIT 1`,[courseId,student,previous]);if(!attempts.rowCount)throw new AccessDenied();const a=attempts.rows[0];if(!a.original_report_bytes)throw new Error('Предыдущий отчёт отсутствует в базе.');const parsed=validateStructuredReport(a.original_report_bytes.toString('utf8'),previous,{nexusRules:row.curriculum_profile==='nexus-v1'});if(parsed.valid===false)throw new Error('Предыдущий отчёт не удалось проверить.');previousReport=parsed.report;feedback=a.mentor_feedback;}
  const objectives=await db.query('SELECT description FROM lesson_objectives WHERE course_id=$1 AND lesson_id=$2 ORDER BY position',[courseId,lessonId]);
  const skills=await db.query('SELECT skill_id FROM lesson_skills WHERE course_id=$1 AND lesson_id=$2 ORDER BY position',[courseId,lessonId]);
  const gaps=await db.query(`SELECT g.id,g.description,g.status,g.source_question_id AS "sourceQuestionId",a.lesson_id AS "sourceLessonId" FROM knowledge_gaps g JOIN lesson_attempts a ON a.id=g.source_attempt_id WHERE g.course_id=$1 AND g.student_id=$2 AND g.status='needs-review' ORDER BY g.created_at,g.id`,[courseId,student]);
  const homework=await db.query(`SELECT h.id,h.title,h.description,h.status,h.student_answer AS "studentAnswer",a.lesson_id AS "lessonId" FROM homework_assignments h JOIN lesson_attempts a ON a.id=h.attempt_id WHERE h.course_id=$1 AND h.student_id=$2 AND (a.lesson_id=$3 OR h.status IN ('assigned','submitted','needs_revision','not_submitted')) ORDER BY h.assigned_at,h.id`,[courseId,student,previous]);
  const lesson:any={code:row.id,title:row.title,durationEstimateMinutes:row.duration_minutes,version:row.version_label,promptTemplate:row.prompt_text,objectives:objectives.rows.map(x=>x.description),relatedSkillIds:skills.rows.map(x=>x.skill_id)};
  const prompt=assembleLessonPrompt({lesson,previousLessonId:previous,previousLessonReport:previousReport,unresolvedGaps:gaps.rows as any,pendingHomework:homework.rows as any,mentorSpecialNotes:feedback?[feedback]:[],nexusRules:row.curriculum_profile==='nexus-v1'});
  const id=crypto.randomUUID(),sourceHash=crypto.createHash('sha256').update(JSON.stringify({promptTemplate:row.prompt_text,generalRules:'',moduleInstructions:''})).digest();
  await db.query('INSERT INTO prompt_snapshots(id,course_id,lesson_id,lesson_version_id,student_id,prompt_text,source_sha256) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,courseId,lessonId,row.version_id,student,prompt.fullPromptText,sourceHash]);
  await db.query('COMMIT');return {id,...prompt};
 }catch(error){await db.query('ROLLBACK');throw error}
}
