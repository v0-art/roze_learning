import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';import {parse} from 'dotenv';import pg from 'pg';
test('relational foundation enforces course memberships and cross-course references',{timeout:60000},async()=>{
 const c=parse(fs.readFileSync('.env.postgres'));const prefix=`postgresql://${encodeURIComponent(c.POSTGRES_USER)}:${encodeURIComponent(c.POSTGRES_PASSWORD)}@127.0.0.1:55432/`;const admin=new pg.Client({connectionString:prefix+encodeURIComponent(c.POSTGRES_DB)});await admin.connect();const name='nexus_rel_'+crypto.randomBytes(5).toString('hex');await admin.query(`CREATE DATABASE "${name}"`);const db=new pg.Client({connectionString:prefix+name});await db.connect();
 try{await db.query(fs.readFileSync('db/002_relational_core.sql','utf8'));await db.query(fs.readFileSync('db/003_relational_details.sql','utf8'));await db.query(fs.readFileSync('db/004_relational_operations.sql','utf8'));await db.query(fs.readFileSync('db/005_course_details.sql','utf8'));await db.query(fs.readFileSync('db/006_graph_and_exam_metadata.sql','utf8'));await db.query(fs.readFileSync('db/007_graph_document.sql','utf8'));await db.query(fs.readFileSync('db/008_notifications.sql','utf8'));await db.query(fs.readFileSync('db/009_learning_results.sql','utf8'));await db.query(fs.readFileSync('db/010_assessment_results.sql','utf8'));await db.query(fs.readFileSync('db/011_history_completeness.sql','utf8'));await db.query(fs.readFileSync('db/012_role_suspension.sql','utf8'));await db.query(fs.readFileSync('db/013_library_versions.sql','utf8'));await db.query(fs.readFileSync('db/014_lesson_version_pointer.sql','utf8'));await db.query(fs.readFileSync('db/015_course_profiles.sql','utf8'));
 await db.query("INSERT INTO platform_accounts(id,username,display_name) VALUES ('m1','mentor1','Mentor'),('m2','mentor2','Mentor 2'),('s1','student1','Student')");
 await db.query("INSERT INTO platform_account_roles(account_id,role) VALUES ('m1','mentor'),('m2','mentor'),('s1','student')");
 await db.query("INSERT INTO courses(id,title,owner_id) VALUES ('c1','Course 1','m1'),('c2','Course 2','m2')");
 await db.query("INSERT INTO course_mentors(course_id,mentor_id) VALUES ('c1','m1'),('c1','m2'),('c2','m2')");
 await db.query("INSERT INTO course_students(course_id,student_id) VALUES ('c1','s1')");
 await db.query("INSERT INTO student_mentors(course_id,student_id,mentor_id) VALUES ('c1','s1','m1'),('c1','s1','m2')");
 await assert.rejects(db.query("INSERT INTO student_mentors(course_id,student_id,mentor_id) VALUES ('c2','s1','m2')"),/foreign key/);
 await assert.rejects(db.query("INSERT INTO course_mentors(course_id,mentor_id) VALUES ('c1','s1')"),/foreign key/);
 await assert.rejects(db.query("INSERT INTO courses(id,title,owner_id) VALUES ('bad','Bad course','s1')"),/foreign key/);
 await db.query("INSERT INTO course_modules(course_id,id,title,position) VALUES ('c1','M01','Module',1)");
 await assert.rejects(db.query("INSERT INTO course_topics(course_id,module_id,id,title,position) VALUES ('c2','M01','T01','Bad topic',1)"),/foreign key/);
 const columns=await db.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND data_type IN ('json','jsonb')");assert.equal(columns.rows[0].n,0);
 }finally{await db.end();await admin.query(`DROP DATABASE "${name}"`);await admin.end()}
});
