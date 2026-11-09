import crypto from 'node:crypto';import {promisify} from 'node:util';import type {PoolClient} from 'pg';
const scrypt=promisify(crypto.scrypt);const FAKE_SALT=Buffer.alloc(32,0x7d);const FAKE_HASH=Buffer.alloc(64,0x47);
/** Run only during the explicit migration/bootstrap, not on each server start. */
export async function bootstrapAdministrator(db:PoolClient,id:string,username:string,password:string,ownTransaction=true):Promise<void>{
 if(!/^[a-z][a-z0-9_-]{2,31}$/.test(username)||!/^[a-zA-Z0-9_-]{1,80}$/.test(id)||password.length<16||password.length>256)throw new Error('Некорректные данные администратора.');
 const salt=crypto.randomBytes(32),hash=await scrypt(password,salt,64) as Buffer;
 if(ownTransaction)await db.query('BEGIN');try{
  await db.query("SELECT pg_advisory_xact_lock(hashtext('rozephyr-administrator-bootstrap'))");
  const existing=await db.query("SELECT 1 FROM platform_account_roles WHERE role='administrator' LIMIT 1");if(existing.rowCount)throw new Error('Администратор уже создан.');
  await db.query('INSERT INTO platform_accounts(id,username,display_name) VALUES($1,$2,$3)',[id,username,'Администратор']);
  await db.query("INSERT INTO platform_account_roles(account_id,role) VALUES($1,'administrator')",[id]);
  await db.query('INSERT INTO platform_credentials(account_id,password_salt,password_hash) VALUES($1,$2,$3)',[id,salt,hash]);if(ownTransaction)await db.query('COMMIT');
 }catch(error){if(ownTransaction)await db.query('ROLLBACK');throw error}
}
export async function authenticateAccount(db:PoolClient,username:string,password:string):Promise<{id:string;roles:string[]} | null>{
 if(typeof username!=='string'||typeof password!=='string'||username.length>64||password.length>256)return null;
 const result=await db.query(`SELECT a.id,c.password_salt,c.password_hash,c.password_algorithm FROM platform_accounts a JOIN platform_credentials c ON c.account_id=a.id
    WHERE lower(a.username)=lower($1) AND a.active AND a.archived_at IS NULL`,[username]);
 const row=result.rows[0];const salt=row?.password_algorithm==='scrypt' && Buffer.isBuffer(row.password_salt)?row.password_salt:FAKE_SALT;
 const expected=row?.password_algorithm==='scrypt' && Buffer.isBuffer(row.password_hash) && row.password_hash.length===64?row.password_hash:FAKE_HASH;
 const actual=await scrypt(password,salt,64) as Buffer;if(!crypto.timingSafeEqual(actual,expected)||!row)return null;
 const roles=await db.query('SELECT role FROM platform_account_roles WHERE account_id=$1 AND enabled ORDER BY role',[row.id]);return {id:row.id,roles:roles.rows.map(r=>r.role)};
}
/** A password change revokes every existing session in the same transaction. */
export async function changeAccountPassword(db:PoolClient,accountId:string,currentPassword:unknown,newPassword:unknown){
 if(typeof currentPassword!=='string'||currentPassword.length>256||typeof newPassword!=='string'||newPassword.length<16||newPassword.length>256||newPassword===currentPassword)throw Object.assign(new Error('Новый пароль должен содержать от 16 до 256 символов и отличаться от прежнего.'),{code:'INVALID_INPUT'});
 await db.query('BEGIN');try{
  const result=await db.query(`SELECT c.password_salt,c.password_hash,c.password_algorithm FROM platform_credentials c JOIN platform_accounts a ON a.id=c.account_id WHERE a.id=$1 AND a.active AND a.archived_at IS NULL FOR UPDATE OF c`,[accountId]);
  const row=result.rows[0],salt=row?.password_algorithm==='scrypt'&&Buffer.isBuffer(row.password_salt)?row.password_salt:FAKE_SALT,expected=row?.password_algorithm==='scrypt'&&Buffer.isBuffer(row.password_hash)&&row.password_hash.length===64?row.password_hash:FAKE_HASH;
  const actual=await scrypt(currentPassword,salt,64) as Buffer;if(!row||!crypto.timingSafeEqual(actual,expected))throw Object.assign(new Error('Неверный текущий пароль.'),{code:'INVALID_INPUT'});
  const nextSalt=crypto.randomBytes(32),hash=await scrypt(newPassword,nextSalt,64) as Buffer;await db.query('UPDATE platform_credentials SET password_salt=$2,password_hash=$3,updated_at=now() WHERE account_id=$1',[accountId,nextSalt,hash]);await db.query('UPDATE account_sessions SET revoked_at=now() WHERE account_id=$1 AND revoked_at IS NULL',[accountId]);await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error}
}
