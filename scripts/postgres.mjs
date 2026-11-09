import {parseSource, checksum, loadSnapshot, verifySnapshot, backupSource} from '../src/server/import-verification.mjs';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {parse} from 'dotenv';import pg from 'pg';
const config=process.env.NEXUS_POSTGRES_CONFIG || '.env.postgres';
const action=process.argv[2];
if(action==='setup'){
 if(!fs.existsSync(config)) fs.writeFileSync(config,`POSTGRES_USER=nexus\nPOSTGRES_DB=nexus\nPOSTGRES_PASSWORD=${crypto.randomBytes(30).toString('base64url')}\nPOSTGRES_APP_USER=nexus_app\nPOSTGRES_APP_PASSWORD=${crypto.randomBytes(30).toString('base64url')}\n`,{mode:0o600,flag:'wx'});
 const result=spawnSync('docker',['compose','up','-d','--wait'],{stdio:'inherit'});process.exit(result.status??1);
}
if(action==='validate') {
 const source=process.argv[3]||'data/nexus_academy.json'; const bytes=fs.readFileSync(source); const data=parseSource(bytes);
 console.log(`Исходный JSON корректен: ${Object.values(data).filter(Array.isArray).length} коллекций; SHA-256 ${checksum(bytes)}.`);process.exit(0);
}
if(!fs.existsSync(config)) throw new Error('Сначала выполните npm run db:setup.');
let c=parse(fs.readFileSync(config));
if(!c.POSTGRES_APP_PASSWORD) { fs.appendFileSync(config,`POSTGRES_APP_USER=nexus_app\nPOSTGRES_APP_PASSWORD=${crypto.randomBytes(30).toString('base64url')}\n`,{mode:0o600}); c=parse(fs.readFileSync(config)); }
const url=`postgresql://${encodeURIComponent(c.POSTGRES_USER)}:${encodeURIComponent(c.POSTGRES_PASSWORD)}@127.0.0.1:55432/${encodeURIComponent(c.POSTGRES_DB)}`;
function backup() {
 const dir=process.env.NEXUS_BACKUP_DIR||'data/backups';fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const dest=path.join(dir,`postgres-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomBytes(4).toString('hex')}.dump`);
 const temp=dest+'.tmp';const fd=fs.openSync(temp,'wx',0o600);
 const result=spawnSync('docker',['compose','exec','-T','postgres','pg_dump','-U',c.POSTGRES_USER,'-d',c.POSTGRES_DB,'-Fc'],{stdio:['ignore',fd,'inherit']});fs.closeSync(fd);
 if(result.status!==0 || fs.statSync(temp).size===0){fs.rmSync(temp,{force:true});throw new Error('Не удалось создать резервную копию PostgreSQL.');}
 fs.renameSync(temp,dest);return dest;
}
if(action==='backup'){console.log('Резервная копия PostgreSQL: '+backup());process.exit(0);}
if(action==='restore'){
 if(!process.argv[3] || process.argv[4]!=='--confirm') throw new Error('Укажите файл и --confirm; сначала остановите приложение.');
 const input=process.argv[3];if(!fs.statSync(input).isFile())throw new Error('Файл резервной копии не найден.');
 const lockClient=new pg.Client({connectionString:url,connectionTimeoutMillis:10000});await lockClient.connect();
 try {const lock=await lockClient.query('SELECT pg_try_advisory_lock($1::bigint) AS acquired',['8243057713382']);if(!lock.rows[0].acquired)throw new Error('Приложение использует эту базу. Остановите его перед восстановлением.');
  console.log('Резервная копия перед восстановлением: '+backup());
  const fd=fs.openSync(input,'r');const result=spawnSync('docker',['compose','exec','-T','postgres','pg_restore','-U',c.POSTGRES_USER,'-d',c.POSTGRES_DB,'--clean','--if-exists','--no-owner','--single-transaction'],{stdio:[fd,'inherit','inherit']});fs.closeSync(fd);if(result.status!==0)throw new Error('Восстановление не выполнено; транзакция отменена.');await grantApplicationAccess(lockClient);console.log('PostgreSQL восстановлена.');
 }finally{await lockClient.end()}process.exit(0);
}
if(action==='serve'){
 const appUrl=`postgresql://${encodeURIComponent(c.POSTGRES_APP_USER)}:${encodeURIComponent(c.POSTGRES_APP_PASSWORD)}@127.0.0.1:55432/${encodeURIComponent(c.POSTGRES_DB)}`;
 const env={...process.env,NEXUS_STORAGE:'postgres',NEXUS_DATABASE_URL:appUrl};
 const result=spawnSync(process.execPath,['--import','tsx','server.ts'],{stdio:'inherit',env});process.exit(result.status??1);
}
async function grantApplicationAccess(client) {
 if(!/^[a-z_][a-z0-9_]{0,62}$/.test(c.POSTGRES_APP_USER) || !/^[A-Za-z0-9_-]{30,100}$/.test(c.POSTGRES_APP_PASSWORD) || !/^[a-z_][a-z0-9_]{0,62}$/.test(c.POSTGRES_DB)) throw new Error('Некорректная конфигурация роли приложения.');
 const role=await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[c.POSTGRES_APP_USER]);
 if(!role.rowCount) await client.query(`CREATE ROLE "${c.POSTGRES_APP_USER}" LOGIN PASSWORD '${c.POSTGRES_APP_PASSWORD}'`);
 else await client.query(`ALTER ROLE "${c.POSTGRES_APP_USER}" WITH LOGIN PASSWORD '${c.POSTGRES_APP_PASSWORD}'`);
 await client.query(`GRANT CONNECT ON DATABASE "${c.POSTGRES_DB}" TO "${c.POSTGRES_APP_USER}"`);
 await client.query(`GRANT USAGE ON SCHEMA public TO "${c.POSTGRES_APP_USER}"`);
 await client.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON nexus_state_meta,nexus_entities TO "${c.POSTGRES_APP_USER}"`);
 await client.query(`GRANT SELECT ON nexus_schema_migrations TO "${c.POSTGRES_APP_USER}"`);
}
if(action==='permissions') {const client=new pg.Client({connectionString:url});await client.connect();try{await grantApplicationAccess(client);console.log('Роль приложения настроена с ограниченными правами.')}finally{await client.end()}process.exit(0);}
if(!['migrate','validate','verify'].includes(action)) throw new Error('Доступные команды: setup, validate, migrate, verify, permissions, serve, backup, restore.');
const source=process.argv[3]||'data/nexus_academy.json';
const bytes=fs.readFileSync(source);const data=parseSource(bytes);
if(action==='validate') {console.log(`Исходный JSON корректен: ${Object.values(data).filter(Array.isArray).length} коллекций; SHA-256 ${checksum(bytes)}.`);process.exit(0);}
const client=new pg.Client({connectionString:url,connectionTimeoutMillis:10000});await client.connect();
try {
 if(action==='verify') {await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');try{verifySnapshot(data,await loadSnapshot(client));await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error}console.log('Данные PostgreSQL полностью совпадают с исходным JSON.');process.exitCode=0;}
 else {
 await client.query('BEGIN');
 await client.query(fs.readFileSync('db/001_initial.sql','utf8'));
 const lock=await client.query('SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired',['8243057713382']); if(!lock.rows[0].acquired) throw new Error('База используется сервером; миграция отменена.');
 const meta=await client.query('SELECT initialized FROM nexus_state_meta WHERE singleton FOR UPDATE');if(meta.rows[0].initialized) throw new Error('В PostgreSQL уже есть данные: повторная миграция отменена.');
 const backup=backupSource(bytes,process.env.NEXUS_BACKUP_DIR || 'data/backups');
 console.log(`Резервная копия исходного файла: ${backup}`);
 const arrays=Object.entries(data).filter(([,v])=>Array.isArray(v));const props=Object.fromEntries(Object.entries(data).filter(([,v])=>!Array.isArray(v)));props.__collections=arrays.map(([k])=>k);
 for(const [key,values] of arrays) if(values.length) await client.query('INSERT INTO nexus_entities(collection,position,data) SELECT $1,(ord-1)::integer,item FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS a(item,ord)',[key,JSON.stringify(values)]);
 await client.query('UPDATE nexus_state_meta SET properties=$1::jsonb,initialized=true,updated_at=now() WHERE singleton',[JSON.stringify(props)]);
 for(const [key,values] of arrays){const r=await client.query('SELECT count(*)::integer AS n FROM nexus_entities WHERE collection=$1',[key]);if(r.rows[0].n!==values.length)throw new Error(`Количество записей ${key} не совпадает.`);}
 verifySnapshot(data,await loadSnapshot(client));
 if(checksum(fs.readFileSync(source)) !== checksum(bytes)) throw new Error('Исходный JSON изменился во время импорта; операция отменена.');
 await grantApplicationAccess(client);
 await client.query('COMMIT');console.log('Данные полностью сверены и скопированы в PostgreSQL; исходный JSON не изменён.');
 }
}catch(error){if(action==='migrate') await client.query('ROLLBACK');throw error}finally{await client.end()}
