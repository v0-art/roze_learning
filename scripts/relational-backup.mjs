import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {parse} from 'dotenv';

const admin=parse(fs.readFileSync(process.env.NEXUS_POSTGRES_CONFIG||'.env.postgres'));
const app=parse(fs.readFileSync(process.env.NEXUS_RELATIONAL_CONFIG||'.env.relational'));
const url=new URL(process.env.NEXUS_RELATIONAL_DATABASE_URL||app.NEXUS_RELATIONAL_DATABASE_URL);
const database=decodeURIComponent(url.pathname.slice(1));
if(url.protocol!=='postgresql:'||url.hostname!=='127.0.0.1'||url.port!=='55432'||!/^[a-z_][a-z0-9_]{0,62}$/.test(database))throw new Error('Резервирование поддерживает только локальную базу Docker проекта.');
if(!/^[a-z_][a-z0-9_]{0,62}$/.test(admin.POSTGRES_USER||''))throw new Error('Некорректная учётная запись PostgreSQL.');
const dir=process.env.NEXUS_BACKUP_DIR||'data/backups';fs.mkdirSync(dir,{recursive:true,mode:0o700});
const dest=path.join(dir,`relational-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomBytes(4).toString('hex')}.dump`),temp=dest+'.tmp';
const fd=fs.openSync(temp,'wx',0o600);
let result;try{result=spawnSync(process.env.NEXUS_DOCKER||'docker',['compose','exec','-T','postgres','pg_dump','-U',admin.POSTGRES_USER,'-d',database,'-Fc'],{stdio:['ignore',fd,'inherit']})}finally{fs.closeSync(fd)}
if(result.error||result.status!==0||fs.statSync(temp).size===0){fs.rmSync(temp,{force:true});throw new Error('Не удалось создать резервную копию PostgreSQL.',{cause:result.error})}
fs.renameSync(temp,dest);console.log('Резервная копия рабочей базы: '+dest);
