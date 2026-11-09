import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';import {parse} from 'dotenv';import pg from 'pg';import {createPostgresStore} from '../src/server/postgres-sync';

test('PostgreSQL: JSON round trip, transactional writes and exclusive writer', {timeout:60000}, async () => {
 const c=parse(fs.readFileSync('.env.postgres'));const dbName='nexus_test_'+crypto.randomBytes(6).toString('hex');const base=`postgresql://${encodeURIComponent(c.POSTGRES_USER)}:${encodeURIComponent(c.POSTGRES_PASSWORD)}@127.0.0.1:55432/`;
 const admin=new pg.Client({connectionString:base+encodeURIComponent(c.POSTGRES_DB)});await admin.connect();await admin.query(`CREATE DATABASE "${dbName}"`);const client=new pg.Client({connectionString:base+dbName});await client.connect();
 let store:ReturnType<typeof createPostgresStore>|undefined,second:ReturnType<typeof createPostgresStore>|undefined;
 try {await client.query(fs.readFileSync('db/001_initial.sql','utf8'));await client.query("UPDATE nexus_state_meta SET initialized=true, properties='{\"__collections\":[]}'::jsonb");store=createPostgresStore(base+dbName);
 const source=JSON.parse(fs.readFileSync('data/nexus_academy.json','utf8'));assert.equal(store.write(source),true);assert.deepEqual(store.read(),source);
 second=createPostgresStore(base+dbName);assert.throws(()=>second!.read(),/уже используется/);await second.close();second=undefined;
 const amended=structuredClone(source);amended.users.push({id:'test-only',displayName:'Test'});assert.equal(store.write(amended),true);assert.deepEqual(store.read(),amended);
 }finally{if(second)await second.close();if(store)await store.close();await client.end();await admin.query(`DROP DATABASE "${dbName}"`);await admin.end();}
});
