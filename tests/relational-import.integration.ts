import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';import {parse} from 'dotenv';import pg from 'pg';
import {importRelationalDatabase} from '../src/server/relational-import';
import {authenticateAccount} from '../src/server/repositories/accounts';

test('import requires stopped source and a separate empty target, preserving source',{timeout:90000},async()=>{
 const c=parse(fs.readFileSync('.env.postgres'));const prefix=`postgresql://${encodeURIComponent(c.POSTGRES_USER)}:${encodeURIComponent(c.POSTGRES_PASSWORD)}@127.0.0.1:55432/`;
 const admin=new pg.Client({connectionString:prefix+encodeURIComponent(c.POSTGRES_DB)});await admin.connect();const suffix=crypto.randomBytes(5).toString('hex');const sourceName='nexus_src_'+suffix,targetName='nexus_dst_'+suffix;
 await admin.query(`CREATE DATABASE "${sourceName}"`);await admin.query(`CREATE DATABASE "${targetName}"`);
 const sourcePool=new pg.Pool({connectionString:prefix+sourceName}),targetPool=new pg.Pool({connectionString:prefix+targetName});const source=await sourcePool.connect(),target=await targetPool.connect(),lock=await sourcePool.connect();
 try{
  await source.query(fs.readFileSync('db/001_initial.sql','utf8'));const data=JSON.parse(fs.readFileSync('data/nexus_academy.json','utf8'));const entries=Object.entries(data).filter(([,value])=>Array.isArray(value));const props=Object.fromEntries(Object.entries(data).filter(([,value])=>!Array.isArray(value)));props.__collections=entries.map(([key])=>key);
  for(const [key,value] of entries)await source.query('INSERT INTO nexus_entities(collection,position,data) SELECT $1,(ord-1)::int,item FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS t(item,ord)',[key,JSON.stringify(value)]);
  await source.query('UPDATE nexus_state_meta SET initialized=true,properties=$1::jsonb WHERE singleton',[JSON.stringify(props)]);
  const credentials={mentorPassword:'mentor-test-password-123',studentPassword:'student-test-password-123',adminPassword:'admin-test-password-123'};
  await lock.query('SELECT pg_advisory_lock($1::bigint)',['8243057713382']);await assert.rejects(importRelationalDatabase(source,target,credentials,true),/используется сервером/);await lock.query('SELECT pg_advisory_unlock($1::bigint)',['8243057713382']);
  await assert.rejects(importRelationalDatabase(source,target,credentials,false),/не принято отдельное решение/);
  const result=await importRelationalDatabase(source,target,credentials,true);assert.equal(result.verification.lessons,data.lessons.length);assert.equal(result.unownedHomeworkExcluded,4);assert.deepEqual(await authenticateAccount(target,'mentor',credentials.mentorPassword),{id:'admin-mentor',roles:['mentor']});assert.equal((await source.query('SELECT count(*)::int n FROM nexus_entities')).rows[0].n,entries.reduce((sum,[,items])=>sum+(items as any[]).length,0));await assert.rejects(importRelationalDatabase(source,target,credentials,true),/отдельной и пустой/);
 }finally{source.release();target.release();lock.release();await Promise.all([sourcePool.end(),targetPool.end()]);await admin.query(`DROP DATABASE "${sourceName}"`);await admin.query(`DROP DATABASE "${targetName}"`);await admin.end()}
});
