import pg from 'pg';
import {applyRelationalMigrations} from '../src/server/relational-migrations';
import {configureRelationalRuntimeRole} from '../src/server/relational-permissions';
import {bootstrapAdministrator} from '../src/server/repositories/accounts';

const {PGHOST,PGPORT,PGDATABASE,PGUSER,PGPASSWORD,NEXUS_RELATIONAL_APP_USER,NEXUS_RELATIONAL_APP_PASSWORD,NEXUS_INITIAL_ADMIN_PASSWORD}=process.env;
if(!PGHOST||!PGPORT||!PGDATABASE||!PGUSER||!PGPASSWORD||!NEXUS_RELATIONAL_APP_USER||!NEXUS_RELATIONAL_APP_PASSWORD||!NEXUS_INITIAL_ADMIN_PASSWORD)throw new Error('Не заданы параметры инициализации.');
if([PGPASSWORD,NEXUS_RELATIONAL_APP_PASSWORD,NEXUS_INITIAL_ADMIN_PASSWORD].some(value=>! /^[A-Za-z0-9_-]{32,100}$/.test(value)||value.startsWith('replace_with_'))||new Set([PGPASSWORD,NEXUS_RELATIONAL_APP_PASSWORD,NEXUS_INITIAL_ADMIN_PASSWORD]).size!==3)throw new Error('Нужны три разных случайных пароля из 32–100 символов base64url.');
const pool=new pg.Pool({host:PGHOST,port:Number(PGPORT),database:PGDATABASE,user:PGUSER,password:PGPASSWORD,connectionTimeoutMillis:10000});const db=await pool.connect();
try{
 await applyRelationalMigrations(db);
 const state=await db.query("SELECT (SELECT count(*)::int FROM platform_accounts) accounts,(SELECT count(*)::int FROM platform_account_roles WHERE role='administrator') admins");
 if(!state.rows[0].admins){if(state.rows[0].accounts)throw new Error('В существующей базе нет администратора; автоматическое создание остановлено.');await bootstrapAdministrator(db,'platform-admin','admin',NEXUS_INITIAL_ADMIN_PASSWORD)}
 await configureRelationalRuntimeRole(db,NEXUS_RELATIONAL_APP_USER,NEXUS_RELATIONAL_APP_PASSWORD);
 console.log('Схема и роль приложения подготовлены. Существующие пользователи не изменены.');
}finally{db.release();await pool.end()}
