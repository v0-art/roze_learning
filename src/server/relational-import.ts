import type {PoolClient} from 'pg';
import {loadSnapshot} from './import-verification.mjs';
import {applyRelationalMigrations} from './relational-migrations';
import {stageLegacyCourse} from './relational-staging';

/** Copy from a stopped legacy server to a separate, empty database; never switch the live server. */
export async function importRelationalDatabase(source:PoolClient,target:PoolClient,credentials:{mentorPassword:string;studentPassword:string;adminPassword:string},omitOwnerless:boolean,root=process.cwd()){
 await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{
  const lock=await source.query('SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired',['8243057713382']);
  if(!lock.rows[0].acquired)throw new Error('Исходная база используется сервером. Остановите сервер перед переносом.');
  const tables=await target.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  if(tables.rowCount)throw new Error('Целевая база должна быть отдельной и пустой.');
  const data=await loadSnapshot(source);
  const ownerless=data.homework.filter((item:any)=>!item.userId);
  if(ownerless.length && !omitOwnerless)throw new Error('Для ДЗ без владельца не принято отдельное решение.');
  await applyRelationalMigrations(target);
  const result=await stageLegacyCourse(target,data,credentials,root,ownerless.map((item:any)=>item.id));
  await source.query('COMMIT');return result;
 }catch(error){await source.query('ROLLBACK');throw error}
}
