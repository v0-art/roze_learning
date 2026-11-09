import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {parse} from 'dotenv';import pg from 'pg';
test('JSON migration verifies complete content and rejects duplicates and corruption',{timeout:90000},async()=>{
 const config=parse(fs.readFileSync('.env.postgres'));const suffix=crypto.randomBytes(5).toString('hex'), dbName=`nexus_imp_${suffix}`, role=`nexus_role_${suffix}`;
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-import-')),source=path.join(root,'source.json'),cfg=path.join(root,'env');fs.copyFileSync('data/nexus_seed.json',source);
 fs.writeFileSync(cfg,`POSTGRES_USER=${config.POSTGRES_USER}\nPOSTGRES_PASSWORD=${config.POSTGRES_PASSWORD}\nPOSTGRES_DB=${dbName}\nPOSTGRES_APP_USER=${role}\nPOSTGRES_APP_PASSWORD=${crypto.randomBytes(30).toString('base64url')}\n`);
 const connection=`postgresql://${encodeURIComponent(config.POSTGRES_USER)}:${encodeURIComponent(config.POSTGRES_PASSWORD)}@127.0.0.1:55432/${encodeURIComponent(config.POSTGRES_DB)}`,admin=new pg.Client({connectionString:connection});await admin.connect();await admin.query(`CREATE DATABASE "${dbName}"`);
 const run=(...args:string[])=>spawnSync(process.execPath,['scripts/postgres.mjs',...args],{env:{...process.env,NEXUS_POSTGRES_CONFIG:cfg,NEXUS_BACKUP_DIR:path.join(root,'backup')},encoding:'utf8'});
 try{assert.equal(run('validate',source).status,0);const migration=run('migrate',source);assert.equal(migration.status,0,migration.stderr);assert.equal(run('verify',source).status,0);assert.notEqual(run('migrate',source).status,0);
 const saved=JSON.parse(fs.readFileSync(source,'utf8'));saved.modules[0].title='Изменено для проверки';fs.writeFileSync(source,JSON.stringify(saved));assert.notEqual(run('verify',source).status,0);fs.writeFileSync(source,'{не json');assert.notEqual(run('validate',source).status,0);
 const backups=fs.readdirSync(path.join(root,'backup'));assert.equal(backups.filter(f=>f.endsWith('.json')).length,1);assert.equal(backups.filter(f=>f.endsWith('.sha256')).length,1);
 }finally{await admin.query(`DROP DATABASE "${dbName}"`);await admin.query(`DROP ROLE IF EXISTS "${role}"`);await admin.end();fs.rmSync(root,{recursive:true,force:true})}
});
