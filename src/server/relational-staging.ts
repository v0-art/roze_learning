import type {PoolClient} from 'pg';import {bootstrapAdministrator} from './repositories/accounts';import {createCourse,enrollStudent} from './repositories/courses';import {importLegacyAccounts} from './repositories/legacy-accounts';import {importLegacyCurriculum} from './repositories/legacy-curriculum';import {importLegacyGraph} from './repositories/legacy-graph';import {importLegacyLibrary} from './repositories/legacy-library';import {importLegacyAssessmentDefinitions} from './repositories/legacy-assessments';import {importLegacyCommunications} from './repositories/legacy-communications';import {importLegacyActivities} from './repositories/legacy-activities';
import {verifyLegacyStage} from './relational-verification';

/**
 * Stages the supported legacy dataset atomically in a separate relational target.
 * It deliberately rejects data without a tested mapping and never switches the server.
 */
export async function stageLegacyCourse(db:PoolClient,source:any,credentials:{mentorPassword:string;studentPassword:string;adminPassword:string},root=process.cwd(),excludedUnownedHomeworkIds:string[]=[]){
 const known=['users','modules','topics','lessons','skills','relations','exams','libraryFiles','lessonAttempts','knowledgeGaps','homework','assessments','notifications','auditLogs','messages','graphNodes','graphEdges','moduleRelations','moduleGraphDocument','promptSnapshots','assessmentRetakeGrants','authAccounts'];
 if(!source||typeof source!=='object'||Array.isArray(source))throw new Error('Некорректная исходная база.');
 for(const key of Object.keys(source))if(!known.includes(key))throw new Error(`Нет сопоставления для коллекции ${key}.`);
 for(const key of ['assessments','assessmentRetakeGrants'])if(!Array.isArray(source[key]||[]))throw new Error(`Некорректная коллекция ${key}.`);
 if(!Array.isArray(source.homework))throw new Error('Отсутствует коллекция ДЗ.');
 for(const h of source.homework)if(!h.userId&&!excludedUnownedHomeworkIds.includes(h.id))throw new Error('Для ДЗ без владельца не принято отдельное решение.');
 if(!Array.isArray(source.users)||source.users.some((u:any)=>!['admin-mentor','student-alexey'].includes(u.id)))throw new Error('Для дополнительных пользователей требуется явное назначение курсов.');
 if(!source.users.some((u:any)=>u.id==='admin-mentor'))throw new Error('Не найден текущий ментор.');
 if(typeof credentials.adminPassword!=='string'||credentials.adminPassword.length<16)throw new Error('Укажите пароль нового администратора.');
 if(new Set([credentials.adminPassword,credentials.mentorPassword,credentials.studentPassword]).size!==3)throw new Error('Пароли администратора, ментора и ученика должны различаться.');
 const courseId='legacy-course',mentorId='admin-mentor';
 await db.query('BEGIN');try{
  await importLegacyAccounts(db,{...source,authAccounts:source.authAccounts||[]},credentials,false);
  await bootstrapAdministrator(db,'platform-admin','admin',credentials.adminPassword,false);
  await createCourse(db,mentorId,courseId,'Существующий курс',false);
  await db.query("UPDATE courses SET curriculum_profile='nexus-v1' WHERE id=$1",[courseId]);
  if(source.users.some((u:any)=>u.id==='student-alexey'))await enrollStudent(db,mentorId,courseId,'student-alexey',mentorId,false);
  const curriculum=await importLegacyCurriculum(db,source,courseId,mentorId,false);
  const graph=await importLegacyGraph(db,{...source,moduleRelations:source.moduleRelations||[]},courseId,false);
  const assessments=await importLegacyAssessmentDefinitions(db,source,courseId,mentorId,false);
  const library=await importLegacyLibrary(db,source,courseId,mentorId,root,false);
  const communications=await importLegacyCommunications(db,source,courseId,mentorId,false);
  const activities=await importLegacyActivities(db,{...source,lessonAttempts:source.lessonAttempts||[],knowledgeGaps:source.knowledgeGaps||[],promptSnapshots:source.promptSnapshots||[]},courseId,false,excludedUnownedHomeworkIds);
  const verification=await verifyLegacyStage(db,source,courseId,root);
  await db.query('COMMIT');return {curriculum,graph,assessments,library,communications,activities,verification,unownedHomeworkExcluded:source.homework.filter((item:any)=>!item.userId).length};
 }catch(error){await db.query('ROLLBACK');throw error}
}
