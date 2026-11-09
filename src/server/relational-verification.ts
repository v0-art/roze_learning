import type {PoolClient} from 'pg';
import {readLegacyFile} from './legacy-file-reader.mjs';

/** Verify identities and the original content before committing a staged import. */
export async function verifyLegacyStage(db: PoolClient, source: any, courseId: string, root = process.cwd()) {
 const collections: Array<[string, string, any[]]> = [
  ['modules','course_modules',source.modules], ['topics','course_topics',source.topics],
  ['lessons','course_lessons',source.lessons], ['skills','course_skills',source.skills],
  ['graphNodes','course_graph_nodes',source.graphNodes], ['graphEdges','course_graph_edges',source.graphEdges],
  ['relations','course_knowledge_relations',source.relations], ['moduleRelations','course_relations',source.moduleRelations || []],
  ['exams','course_exams',source.exams], ['libraryFiles','course_library_files',source.libraryFiles],
  ['lessonAttempts','lesson_attempts',source.lessonAttempts || []], ['knowledgeGaps','knowledge_gaps',source.knowledgeGaps || []],
  ['homework','homework_assignments',(source.homework || []).filter((h:any)=>h.userId)],
  ['assessments','course_assessments',source.assessments || []], ['messages','course_messages',source.messages],
  ['notifications','course_notifications',source.notifications], ['auditLogs','course_audit_events',source.auditLogs],
 ];
 for (const [name, table, records] of collections) {
  if (!Array.isArray(records)) throw new Error(`Проверка переноса: отсутствует коллекция ${name}.`);
  // Table names are constants above; course and record values remain SQL parameters.
  const idColumn=table==='course_audit_events'?'legacy_id':'id';
  const {rows} = await db.query(`SELECT ${idColumn} AS id FROM ${table} WHERE course_id=$1`,[courseId]);
  const expected=records.map((item:any)=>item.id).sort();
  if (JSON.stringify(rows.map(row=>row.id).sort())!==JSON.stringify(expected)) throw new Error(`Проверка переноса: не совпадают записи ${name}.`);
 }
 const prompts=await db.query("SELECT lesson_id,prompt_text FROM lesson_versions WHERE course_id=$1 AND id='current'",[courseId]);
 const byLesson=new Map(prompts.rows.map(row=>[row.lesson_id,row.prompt_text]));
 for(const lesson of source.lessons) if(byLesson.get(lesson.id)!==(lesson.promptTemplate||'')) throw new Error(`Проверка переноса: не совпадает текст урока ${lesson.id}.`);
 const files=await db.query('SELECT id,file_bytes,checksum_sha256,legacy_checksum_sha256,integrity_matches_legacy FROM course_library_files WHERE course_id=$1',[courseId]);
 const byFile=new Map(files.rows.map(row=>[row.id,row]));
 for(const file of source.libraryFiles){
  const actual=readLegacyFile(file,root),stored=byFile.get(file.id);
  if(!stored || !stored.file_bytes.equals(actual.bytes) || stored.checksum_sha256.toString('hex')!==actual.actual || (stored.legacy_checksum_sha256?.toString('hex')??null)!==actual.recorded || stored.integrity_matches_legacy!==actual.matches)
   throw new Error(`Проверка переноса: не совпадает файл ${file.id}.`);
 }
 const reports=await db.query('SELECT id,original_report_bytes FROM lesson_attempts WHERE course_id=$1',[courseId]);
 const byAttempt=new Map(reports.rows.map(row=>[row.id,row.original_report_bytes]));
 for(const attempt of source.lessonAttempts||[]) if(!byAttempt.get(attempt.id)?.equals(Buffer.from(attempt.rawReport,'utf8'))) throw new Error(`Проверка переноса: не совпадает отчёт ${attempt.id}.`);
 return {collections:collections.length,lessons:source.lessons.length,files:source.libraryFiles.length,reports:(source.lessonAttempts||[]).length};
}
