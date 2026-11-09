import type {PoolClient} from 'pg';

/** Stage only the curriculum in a separate target. It is not a complete user-data migration. */
export async function importLegacyCurriculum(db:PoolClient,source:any,courseId:string,mentorId:string,ownTransaction=true) {
 const kinds=['modules','topics','lessons','skills'];
 for(const key of kinds) if(!Array.isArray(source?.[key])) throw new Error(`Отсутствует коллекция ${key}.`);
 const allowed:Record<string,string[]>={
  modules:['id','code','order','title','shortDescription','introduction','topicsCount','publishedLessonsCount','prerequisites','status','whyItMatters','whatIsStudied','futureApplications','updatedAt'],
  topics:['id','moduleId','code','order','title','description','learningObjectives','skillsTaught','status','controlWorkId','updatedAt'],
  lessons:['id','moduleId','topicId','code','order','title','durationEstimateMinutes','prerequisites','objectives','relatedSkillIds','status','version','promptTemplate','previousLessonId','nextLessonId','versionHistory','contentHash','updatedAt'],
  skills:['id','code','description','lessonId','moduleId','name','status','topicId'],
 };
 for(const key of kinds) for(const row of source[key]) {
  if(!row || typeof row!=='object' || Array.isArray(row))throw new Error(`Некорректная запись ${key}.`);
  for(const field of Object.keys(row)) if(!allowed[key].includes(field))throw new Error(`Неизвестное поле ${key}.${field}: перенос остановлен.`);
  if(row.code && row.code!==row.id)throw new Error(`В ${key} код и ID различаются: необходима отдельная миграция.`);
 }
 if(ownTransaction)await db.query('BEGIN');try{
  const owner=await db.query('SELECT 1 FROM course_mentors WHERE course_id=$1 AND mentor_id=$2',[courseId,mentorId]);if(!owner.rowCount)throw new Error('Ментор не назначен в целевой курс.');
  const existing=await db.query('SELECT 1 FROM course_modules WHERE course_id=$1 LIMIT 1',[courseId]);if(existing.rowCount)throw new Error('Целевой курс уже содержит модули.');
  for(const m of source.modules)await db.query(`INSERT INTO course_modules(course_id,id,title,short_description,introduction,why_it_matters,what_is_studied,status,position,legacy_topics_count,legacy_published_lessons_count,legacy_updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[courseId,m.id,m.title,m.shortDescription||'',m.introduction||'',m.whyItMatters||'',m.whatIsStudied||'',m.status,m.order,m.topicsCount??null,m.publishedLessonsCount??null,m.updatedAt||null]);
  for(const m of source.modules){for(const [i,id] of (m.prerequisites||[]).entries())await db.query('INSERT INTO module_prerequisites VALUES($1,$2,$3,$4)',[courseId,m.id,id,i]);for(const [i,text] of (m.futureApplications||[]).entries())await db.query('INSERT INTO module_applications VALUES($1,$2,$3,$4)',[courseId,m.id,i,text]);}
  for(const t of source.topics)await db.query(`INSERT INTO course_topics(course_id,module_id,id,title,description,status,position,control_work_id,legacy_updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[courseId,t.moduleId,t.id,t.title,t.description||'',t.status,t.order,t.controlWorkId||null,t.updatedAt||null]);
  for(const t of source.topics)for(const [i,text] of (t.learningObjectives||[]).entries())await db.query('INSERT INTO topic_objectives VALUES($1,$2,$3,$4)',[courseId,t.id,i,text]);
  for(const l of source.lessons)await db.query(`INSERT INTO course_lessons(course_id,topic_id,id,title,position,status,duration_minutes,current_version,content_hash,legacy_updated_at,previous_lesson_id,next_lesson_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[courseId,l.topicId,l.id,l.title,l.order,l.status,l.durationEstimateMinutes??null,l.version||null,l.contentHash||null,l.updatedAt||null,l.previousLessonId||null,l.nextLessonId||null]);
  for(const l of source.lessons){
   for(const [i,text] of (l.objectives||[]).entries())await db.query('INSERT INTO lesson_objectives VALUES($1,$2,$3,$4)',[courseId,l.id,i,text]);
   for(const [i,id] of (l.prerequisites||[]).entries())await db.query('INSERT INTO lesson_prerequisites VALUES($1,$2,$3,$4)',[courseId,l.id,id,i]);
   await db.query(`INSERT INTO lesson_versions(course_id,lesson_id,id,prompt_text,version_label,author_id,status) VALUES($1,$2,'current',$3,$4,$5,$6)`,[courseId,l.id,l.promptTemplate||'',l.version||'1.0',mentorId,l.status]);
   await db.query("UPDATE course_lessons SET current_lesson_version_id='current' WHERE course_id=$1 AND id=$2",[courseId,l.id]);
   for(const [i,v] of (l.versionHistory||[]).entries()){
    for(const field of Object.keys(v))if(!['version','promptText','authorId','authorName','changelog','createdAt','status'].includes(field))throw new Error(`Неизвестное поле истории урока ${field}.`);
    if(v.authorId && v.authorId!==mentorId)throw new Error('Обнаружен другой автор версии; назначьте его ментором перед переносом.');
    await db.query(`INSERT INTO lesson_versions(course_id,lesson_id,id,prompt_text,version_label,author_id,author_display_name,changelog,created_at,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[courseId,l.id,`history-${i}`,v.promptText||'',v.version||'1.0',mentorId,v.authorName||null,v.changelog||null,v.createdAt||new Date().toISOString(),v.status||'draft']);
   }
  }
  for(const s of source.skills)await db.query(`INSERT INTO course_skills(course_id,id,module_id,topic_id,lesson_id,title,description,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[courseId,s.id,s.moduleId,s.topicId||null,s.lessonId||null,s.name,s.description||'',s.status]);
  for(const t of source.topics)for(const [i,id] of (t.skillsTaught||[]).entries())await db.query('INSERT INTO topic_skills VALUES($1,$2,$3,$4)',[courseId,t.id,id,i]);
  for(const l of source.lessons)for(const [i,id] of (l.relatedSkillIds||[]).entries())await db.query('INSERT INTO lesson_skills VALUES($1,$2,$3,$4)',[courseId,l.id,id,i]);
  if(ownTransaction)await db.query('COMMIT');return Object.fromEntries(kinds.map(k=>[k,source[k].length]));
 }catch(error){if(ownTransaction)await db.query('ROLLBACK');throw error}
}
