/** Read-only checks before migration to the typed relational schema. */
export function analyzeRelationalMigration(db, options = {}) {
 const collections=['users','modules','topics','lessons','skills','relations','exams','libraryFiles','lessonAttempts','knowledgeGaps','homework','assessments','messages','notifications','auditLogs','promptSnapshots','moduleRelations'];
 const counts=Object.fromEntries(collections.map(key=>[key,Array.isArray(db[key])?db[key].length:0]));
 const records=key=>Array.isArray(db[key])?db[key]:[];
 const ids=key=>new Set(records(key).flatMap(r=>[r.id,r.code]).filter(x=>typeof x==='string'));
 const users=ids('users'),modules=ids('modules'),topics=ids('topics'),lessons=ids('lessons'),skills=ids('skills'),nodes=ids('graphNodes');
 const graphEntities=new Set([...modules,...topics,...lessons,...skills,...nodes]);
 const duplicate=(key,field='id')=>{const seen=new Set();let count=0;for(const row of records(key)){const v=row[field];if(typeof v==='string'){if(seen.has(v)) count++;else seen.add(v)}}return count};
 const noUser=records('homework').filter(h=>!h.userId).length;
 const badUser=(key,field)=>records(key).filter(r=>r[field] && !users.has(r[field])).length;
 const issues={
  homeworkWithoutOwner:noUser,
  homeworkUnknownOwner:badUser('homework','userId'),
  attemptsUnknownStudent:badUser('lessonAttempts','userId'),
  gapsUnknownStudent:badUser('knowledgeGaps','userId'),
  duplicateUserIds:duplicate('users'),duplicateModuleIds:duplicate('modules'),duplicateTopicIds:duplicate('topics'),duplicateLessonIds:duplicate('lessons'),
  topicsWithoutModule:records('topics').filter(t=>!modules.has(t.moduleId)).length,
  lessonsWithoutTopic:records('lessons').filter(l=>!topics.has(l.topicId)).length,
  lessonsWithoutModule:records('lessons').filter(l=>!modules.has(l.moduleId)).length,
  skillsWithoutModule:records('skills').filter(s=>!modules.has(s.moduleId)).length,
  skillsWithUnknownLesson:records('skills').filter(s=>s.lessonId&&!lessons.has(s.lessonId)).length,
  relationsWithUnknownEntity:records('relations').filter(r=>!graphEntities.has(r.fromId)||!graphEntities.has(r.toId)).length,
  filesWithoutStoredBytes:records('libraryFiles').filter(f=>!f.contentBase64&&!f.contentPath).length,
 };
 return {counts,issues,unownedHomeworkPolicy: options.omitUnownedHomework ? 'exclude_from_target' : 'undecided',unownedHomeworkExcluded:options.omitUnownedHomework ? noUser : 0,requiresExplicitAssignment: noUser>0 && !options.omitUnownedHomework,readyToSwitch:false};
}
