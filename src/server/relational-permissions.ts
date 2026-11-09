import type {PoolClient} from 'pg';

const tables=['platform_accounts','platform_account_roles','platform_credentials','account_sessions','courses','course_mentors','course_students','student_mentors','course_modules','course_topics','course_lessons','lesson_versions','prompt_snapshots','lesson_attempts','homework_assignments','lesson_question_results','knowledge_gaps','gap_rechecks','course_library_files','course_relations','homework_submissions','homework_reviews','course_exams','exam_tickets','course_messages','course_audit_events','course_skills','skill_relations','course_assessments','module_prerequisites','module_applications','topic_objectives','lesson_objectives','lesson_prerequisites','relation_knowledge_transfers','topic_skills','lesson_skills','course_graph_nodes','course_graph_node_details','course_graph_edges','course_knowledge_relations','course_graph_documents','course_graph_sources','course_graph_semantics','course_graph_rules','course_graph_declared_counts','course_graph_document_modules','course_notifications','lesson_question_skills','report_covered_topics','report_strong_skills','report_gap_descriptions','report_next_instructions','report_homework_definitions','report_entry_controls','report_homework_checks','report_homework_check_details','report_recheck_results','homework_review_history','homework_review_details','assessment_retake_grants','homework_skills','course_library_file_versions'];
const marker='rozephyr-relational-runtime-v1';

/** Provision only a dedicated marked login; never upgrade an unrelated existing role. */
export async function configureRelationalRuntimeRole(db:PoolClient,username:string,password:string){
 if(!/^[a-z_][a-z0-9_]{2,62}$/.test(username)||!/^[A-Za-z0-9_-]{32,100}$/.test(password))throw new Error('Некорректные учётные данные роли приложения.');
 await db.query('BEGIN');try{
  const database=(await db.query('SELECT current_database() AS name')).rows[0].name;if(!/^[a-zA-Z0-9_]{1,63}$/.test(database))throw new Error('Некорректное имя базы.');
  const existing=await db.query(`SELECT r.oid,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolbypassrls,shobj_description(r.oid,'pg_authid') AS marker,
   EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid) AS has_membership FROM pg_roles r WHERE r.rolname=$1`,[username]);
  if(existing.rowCount){const row=existing.rows[0];if(row.marker!==marker||row.rolsuper||row.rolcreatedb||row.rolcreaterole||row.rolreplication||row.rolbypassrls||row.has_membership)throw new Error('Существующая роль не является выделенной ролью приложения.');await db.query(`ALTER ROLE "${username}" LOGIN PASSWORD '${password}'`)}
  else{await db.query(`CREATE ROLE "${username}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD '${password}'`);await db.query(`COMMENT ON ROLE "${username}" IS '${marker}'`)}
  const available=await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename=ANY($1::text[])",[tables]);if(available.rowCount!==tables.length)throw new Error('Реляционная схема подготовлена не полностью.');
  await db.query(`GRANT CONNECT ON DATABASE "${database}" TO "${username}"`);await db.query(`GRANT USAGE ON SCHEMA public TO "${username}"`);
  await db.query(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "${username}"`);
  await db.query(`GRANT SELECT,INSERT,UPDATE ON ${tables.map(name=>`"${name}"`).join(',')} TO "${username}"`);
  await db.query(`GRANT SELECT ON relational_schema_migrations TO "${username}"`);
  for(const table of ['course_audit_events','course_library_file_versions']){const result=await db.query('SELECT pg_get_serial_sequence($1,$2) AS name',[`public.${table}`,'id']);const sequence=result.rows[0]?.name;if(typeof sequence!=='string'||!/^public\.[a-z_][a-z0-9_]*$/.test(sequence))throw new Error('Не найдена последовательность таблицы.');await db.query(`GRANT USAGE,SELECT ON SEQUENCE ${sequence} TO "${username}"`)}
  await db.query('COMMIT');return {username,database};
 }catch(error){await db.query('ROLLBACK');throw error}
}
