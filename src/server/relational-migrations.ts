import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import type {PoolClient} from 'pg';
const files=['002_relational_core.sql','003_relational_details.sql','004_relational_operations.sql','005_course_details.sql','006_graph_and_exam_metadata.sql','007_graph_document.sql','008_notifications.sql','009_learning_results.sql','010_assessment_results.sql','011_history_completeness.sql','012_role_suspension.sql','013_library_versions.sql','014_lesson_version_pointer.sql','015_course_profiles.sql','016_activity_history.sql','017_archived_exam_tickets.sql','018_v3_content_contract.sql','019_v3_sessions.sql','020_v3_assessment_settings.sql','021_v3_homework_source_key.sql','022_v3_gap_source_key.sql','023_v3_remedial_kind.sql'];
/** Applies a complete ordered set atomically. A previously applied migration is immutable. */
export async function applyRelationalMigrations(db:PoolClient,directory='db'):Promise<number>{
 const scripts=files.map(name=>{const sql=fs.readFileSync(path.join(directory,name),'utf8');return {name,sql,hash:crypto.createHash('sha256').update(sql).digest('hex')}});
 await db.query('BEGIN');try{
  await db.query("SELECT pg_advisory_xact_lock(hashtext('rozephyr-relational-schema'))");
  await db.query('CREATE TABLE IF NOT EXISTS relational_schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  const existing=await db.query('SELECT name,checksum FROM relational_schema_migrations');
  for(const row of existing.rows){const script=scripts.find(s=>s.name===row.name);if(!script || script.hash!==row.checksum)throw new Error(`Несовпадение применённой миграции ${row.name}.`)}
  let applied=0;
  for(const script of scripts){if(existing.rows.some(row=>row.name===script.name))continue;await db.query(script.sql);await db.query('INSERT INTO relational_schema_migrations(name,checksum) VALUES($1,$2)',[script.name,script.hash]);applied++;}
  await db.query('COMMIT');return applied;
 }catch(error){await db.query('ROLLBACK');throw error}
}
