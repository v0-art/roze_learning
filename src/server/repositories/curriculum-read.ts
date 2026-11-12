import type {PoolClient} from 'pg';import {courseMembership} from './courses';

/** Read curriculum from typed tables. Students never receive unpublished prompt text. */
export async function readCurriculum(db:PoolClient,actor:string,courseId:string,ownTransaction=true){
 if(ownTransaction)await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');try{
 const role=await courseMembership(db,actor,courseId),mentor=role==='mentor';
 const modules=await db.query(`SELECT m.id,m.title,m.short_description,m.introduction,m.why_it_matters,m.what_is_studied,m.status,m.position,
  ARRAY(SELECT prerequisite_module_id FROM module_prerequisites WHERE course_id=m.course_id AND module_id=m.id ORDER BY position) AS prerequisites,
  ARRAY(SELECT description FROM module_applications WHERE course_id=m.course_id AND module_id=m.id ORDER BY position) AS applications
  FROM course_modules m WHERE m.course_id=$1 ORDER BY m.position,m.id`,[courseId]);
 const topics=await db.query(`SELECT t.id,t.module_id,t.title,t.description,t.status,t.position,t.control_work_id,
  ARRAY(SELECT description FROM topic_objectives WHERE course_id=t.course_id AND topic_id=t.id ORDER BY position) AS objectives,
  ARRAY(SELECT skill_id FROM topic_skills WHERE course_id=t.course_id AND topic_id=t.id ORDER BY position) AS skills
  FROM course_topics t WHERE t.course_id=$1 ORDER BY t.module_id,t.position,t.id`,[courseId]);
 const lessons=await db.query(`SELECT l.id,l.topic_id,t.module_id,l.title,l.position,l.status,l.duration_minutes,l.previous_lesson_id,l.next_lesson_id,l.current_version,l.current_lesson_version_id,
  CASE WHEN $2 THEN false ELSE EXISTS(SELECT 1 FROM prompt_snapshots s WHERE s.course_id=l.course_id AND s.student_id=$3 AND s.lesson_id=l.id) END AS started,
  CASE WHEN $2 THEN v.prompt_text ELSE NULL END AS prompt_text,
  ARRAY(SELECT description FROM lesson_objectives WHERE course_id=l.course_id AND lesson_id=l.id ORDER BY position) AS objectives,
  ARRAY(SELECT prerequisite_lesson_id FROM lesson_prerequisites WHERE course_id=l.course_id AND lesson_id=l.id ORDER BY position) AS prerequisites,
  ARRAY(SELECT skill_id FROM lesson_skills WHERE course_id=l.course_id AND lesson_id=l.id ORDER BY position) AS skills
  FROM course_lessons l JOIN course_topics t ON t.course_id=l.course_id AND t.id=l.topic_id
  LEFT JOIN lesson_versions v ON v.course_id=l.course_id AND v.lesson_id=l.id AND v.id=COALESCE(l.current_lesson_version_id,'current')
  WHERE l.course_id=$1 AND ($2 OR l.status='published') ORDER BY t.module_id,t.position,l.position,l.id`,[courseId,mentor,actor]);
 const skills=await db.query('SELECT id,module_id,topic_id,lesson_id,title,description,status FROM course_skills WHERE course_id=$1 ORDER BY module_id,topic_id,lesson_id,id',[courseId]);
 const relations=await db.query('SELECT id,source_node_id,target_node_id,relation_type,description FROM course_knowledge_relations WHERE course_id=$1 ORDER BY id',[courseId]);
 const nodes=await db.query('SELECT id,code,title,description,level,module_id,topic_id,position_x,position_y,status FROM course_graph_nodes WHERE course_id=$1 ORDER BY id',[courseId]);
 const edges=await db.query('SELECT id,source_node_id,target_node_id,edge_type,label FROM course_graph_edges WHERE course_id=$1 ORDER BY id',[courseId]);
 if(ownTransaction)await db.query('COMMIT');return {modules:modules.rows,topics:topics.rows,lessons:lessons.rows,skills:skills.rows,relations:relations.rows,graphNodes:nodes.rows,graphEdges:edges.rows};
 }catch(error){if(ownTransaction)await db.query('ROLLBACK');throw error}
}
