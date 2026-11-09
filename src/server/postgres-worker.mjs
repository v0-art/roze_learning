import {parentPort, workerData} from 'node:worker_threads';
import pg from 'pg';
import fs from 'node:fs';
const {Client}=pg;
const client = new Client({connectionString:workerData.url, connectionTimeoutMillis:10000});
const lockId = '8243057713382';
let ready;
async function initialize() {
  await client.connect();
  // Only one compatibility server can perform read/modify/write operations.
  const lock = await client.query('SELECT pg_try_advisory_lock($1::bigint) AS acquired',[lockId]);
  if (!lock.rows[0].acquired) throw new Error('Эта база уже используется другим сервером совместимости.');
  const version = await client.query('SELECT version FROM nexus_schema_migrations WHERE version = 1');
  if (!version.rowCount) throw new Error('Схема не подготовлена. Сначала выполните миграцию.');
  const meta = await client.query('SELECT initialized FROM nexus_state_meta WHERE singleton');
  if (!meta.rows[0]?.initialized) throw new Error('База не заполнена. Сначала выполните миграцию из JSON.');
}
ready=initialize();
ready.catch(() => {});
async function read(){
 const [meta,records]=await Promise.all([client.query('SELECT properties FROM nexus_state_meta WHERE singleton'),client.query('SELECT collection, data FROM nexus_entities ORDER BY collection, position')]);
 const db=meta.rows[0].properties;
 for(const key of db.__collections || []) db[key]=[];
 delete db.__collections;
 for(const row of records.rows) (db[row.collection] ||= []).push(row.data);
 return db;
}
async function write(db){
 const arrays=Object.entries(db).filter(([,v])=>Array.isArray(v)); const props=Object.fromEntries(Object.entries(db).filter(([,v])=>!Array.isArray(v))); props.__collections=arrays.map(([k])=>k);
 await client.query('BEGIN');
 try {
  await client.query('DELETE FROM nexus_entities');
  for (const [key,values] of arrays) if(values.length) await client.query('INSERT INTO nexus_entities(collection,position,data) SELECT $1,(ord-1)::integer,item FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS a(item,ord)',[key,JSON.stringify(values)]);
  await client.query('UPDATE nexus_state_meta SET properties=$1::jsonb,updated_at=now() WHERE singleton',[JSON.stringify(props)]);
  await client.query('COMMIT'); return true;
 } catch(e){await client.query('ROLLBACK'); throw e;}
}
parentPort.on('message', async ({action,db,signal,port})=>{
 const flag=new Int32Array(signal);
 try {await ready; const value=action==='read'?await read():action==='write'?await write(db):null;port.postMessage({value});}
 catch(error){port.postMessage({error:error instanceof Error?error.message:String(error)});}
 finally{Atomics.store(flag,0,1);Atomics.notify(flag,0);port.close();}
});
