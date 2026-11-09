import pg from 'pg';
import {config} from 'dotenv';
import {importRelationalDatabase} from '../src/server/relational-import';

// Credentials and connection strings are supplied through the environment, never arguments.
config({quiet:true});
const required=['NEXUS_SOURCE_DATABASE_URL','NEXUS_TARGET_DATABASE_URL','NEXUS_MENTOR_PASSWORD','NEXUS_STUDENT_PASSWORD','NEXUS_ADMIN_PASSWORD'];
for(const name of required)if(!process.env[name])throw new Error(`Не задана переменная ${name}.`);
const sourcePool=new pg.Pool({connectionString:process.env.NEXUS_SOURCE_DATABASE_URL,connectionTimeoutMillis:10000});
const targetPool=new pg.Pool({connectionString:process.env.NEXUS_TARGET_DATABASE_URL,connectionTimeoutMillis:10000});
let source:pg.PoolClient|undefined,target:pg.PoolClient|undefined;
try{
 source=await sourcePool.connect();target=await targetPool.connect();
 const result=await importRelationalDatabase(source,target,{mentorPassword:process.env.NEXUS_MENTOR_PASSWORD!,studentPassword:process.env.NEXUS_STUDENT_PASSWORD!,adminPassword:process.env.NEXUS_ADMIN_PASSWORD!},process.env.NEXUS_EXCLUDE_UNOWNED_HOMEWORK==='1');
 console.log(`Копирование в отдельную базу проверено. Уроков: ${result.verification.lessons}, файлов: ${result.verification.files}, отчётов: ${result.verification.reports}, исключено ДЗ без ученика: ${result.unownedHomeworkExcluded}. Рабочий сервер не переключён.`);
}finally{source?.release();target?.release();await sourcePool.end();await targetPool.end()}
