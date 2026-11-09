import type {PoolClient} from 'pg';
/** Stages exam definitions and tickets only; submitted assessments require a separate migration. */
export async function importLegacyAssessmentDefinitions(db:PoolClient,source:any,courseId:string,mentorId:string,ownTransaction=true){
 if(!Array.isArray(source?.exams))throw new Error('Отсутствуют определения контрольных и экзаменов.');
 const allowed=['id','moduleId','title','type','status','tickets','theoryUniqueCount','practicalUniqueCount','rubrics','updatedAt','afterTopic','contentPath'];
 const ticketAllowed=['ticketId','topicId','title','theory1','theory2','practical','weightTheory1','weightTheory2','weightPractical'];
 for(const exam of source.exams){for(const key of Object.keys(exam))if(!allowed.includes(key))throw new Error(`Неизвестное поле экзамена ${key}.`);for(const key of Object.keys(exam.rubrics||{}))if(!['failMaxExclusive','passMaxExclusive','goodMaxExclusive'].includes(key))throw new Error(`Неизвестное поле критериев ${key}.`);for(const ticket of exam.tickets||[])for(const key of Object.keys(ticket))if(!ticketAllowed.includes(key))throw new Error(`Неизвестное поле билета ${key}.`);}
 if(ownTransaction)await db.query('BEGIN');try{
  const owner=await db.query('SELECT 1 FROM course_mentors WHERE course_id=$1 AND mentor_id=$2',[courseId,mentorId]);if(!owner.rowCount)throw new Error('Ментор не назначен в целевой курс.');
  if((await db.query('SELECT 1 FROM course_exams WHERE course_id=$1 LIMIT 1',[courseId])).rowCount)throw new Error('Определения аттестаций уже существуют.');
  let tickets=0;
  for(const e of source.exams){await db.query(`INSERT INTO course_exams(course_id,id,module_id,title,definition_type,status,after_topic_id,theory_unique_count,practical_unique_count,rubric_fail_max_exclusive,rubric_pass_max_exclusive,rubric_good_max_exclusive,legacy_content_path,legacy_updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[courseId,e.id,e.moduleId,e.title,e.type,e.status,e.afterTopic||null,e.theoryUniqueCount??null,e.practicalUniqueCount??null,e.rubrics?.failMaxExclusive??null,e.rubrics?.passMaxExclusive??null,e.rubrics?.goodMaxExclusive??null,e.contentPath||null,e.updatedAt||null]);
   for(const t of e.tickets||[]){await db.query(`INSERT INTO exam_tickets(course_id,exam_id,id,title,topic_id,theory_1,theory_2,practical,weight_theory_1,weight_theory_2,weight_practical) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[courseId,e.id,t.ticketId,t.title||null,t.topicId||null,t.theory1,t.theory2,t.practical,t.weightTheory1??null,t.weightTheory2??null,t.weightPractical??null]);tickets++;}}
  if(ownTransaction)await db.query('COMMIT');return {definitions:source.exams.length,tickets};
 }catch(error){if(ownTransaction)await db.query('ROLLBACK');throw error}
}
