import crypto from 'node:crypto';import {promisify} from 'node:util';import type {PoolClient} from 'pg';
const scrypt=promisify(crypto.scrypt);
/** A legacy admin-mentor becomes a mentor, never a platform administrator. */
export async function importLegacyAccounts(db:PoolClient,source:any,defaults:{mentorPassword:string;studentPassword:string},ownTransaction=true){
 if(!Array.isArray(source?.users)||!Array.isArray(source?.authAccounts))throw new Error('Отсутствуют данные учётных записей.');
 if([defaults.mentorPassword,defaults.studentPassword].some(p=>typeof p!=='string'||p.length<16||p.length>256))throw new Error('Не заданы прежние пароли учётных записей.');
 const userFields=['id','email','displayName','role','avatarUrl','createdAt','lastSeenAt','isDemo'];
 const accountFields=['username','userId','role','active','salt','passwordHash','archivedAt'];
 for(const u of source.users){for(const k of Object.keys(u))if(!userFields.includes(k))throw new Error(`Неизвестное поле users.${k}.`);if(!['admin','student'].includes(u.role))throw new Error('Неизвестная роль в прежней базе.');}
 if(new Set(source.authAccounts.map((a:any)=>a.userId)).size!==source.authAccounts.length)throw new Error('Для пользователя найдено несколько учётных записей.');
 for(const a of source.authAccounts){for(const k of Object.keys(a))if(!accountFields.includes(k))throw new Error(`Неизвестное поле authAccounts.${k}.`);if(!source.users.some((u:any)=>u.id===a.userId))throw new Error('Учётная запись не связана с пользователем.');}
 if(ownTransaction)await db.query('BEGIN');try{
  if((await db.query('SELECT 1 FROM platform_accounts WHERE id=$1 OR id=$2 LIMIT 1',['admin-mentor','student-alexey'])).rowCount)throw new Error('Прежние пользователи уже импортированы.');
  for(const u of source.users){
   if(u.isDemo)throw new Error('Демонстрационную учётную запись нельзя переносить в рабочую базу.');
   const account=source.authAccounts.find((a:any)=>a.userId===u.id);
   if(account && ['admin-mentor','student-alexey'].includes(u.id))throw new Error('Найдена дублирующаяся встроенная учётная запись.');
   let username:string,salt:Buffer|undefined,hash:Buffer|undefined,active=true;
   if(u.id==='admin-mentor'||u.id==='student-alexey'){
    username=u.id==='admin-mentor'?'mentor':'student';salt=crypto.randomBytes(32);hash=await scrypt(u.id==='admin-mentor'?defaults.mentorPassword:defaults.studentPassword,salt,64) as Buffer;
   }else if(account){
    if(typeof account.username!=='string'||!/^[a-z][a-z0-9_-]{2,31}$/.test(account.username)||!['student','admin'].includes(account.role)||!/^([0-9a-f]{2}){32}$/i.test(account.salt)||!/^([0-9a-f]{2}){64}$/i.test(account.passwordHash))throw new Error('Некорректные данные прежней учётной записи.');
    if(account.role!==u.role)throw new Error('Роль пользователя и учётной записи не совпадает.');
    username=account.username;salt=Buffer.from(account.salt,'hex');hash=Buffer.from(account.passwordHash,'hex');active=account.active===true&&!account.archivedAt;
   }else {username='legacy_'+crypto.createHash('sha256').update(u.id).digest('hex').slice(0,20);active=false;}
   await db.query(`INSERT INTO platform_accounts(id,username,display_name,email,avatar_url,last_seen_at,active,created_at,archived_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[u.id,username,u.displayName,u.email||null,u.avatarUrl||null,u.lastSeenAt||null,active,u.createdAt||new Date().toISOString(),account?.archivedAt||null]);
   await db.query('INSERT INTO platform_account_roles(account_id,role) VALUES($1,$2)',[u.id,u.role==='admin'?'mentor':'student']);
   if(salt&&hash)await db.query('INSERT INTO platform_credentials(account_id,password_salt,password_hash) VALUES($1,$2,$3)',[u.id,salt,hash]);
  }
  if(ownTransaction)await db.query('COMMIT');return {users:source.users.length};
 }catch(error){if(ownTransaction)await db.query('ROLLBACK');throw error}
}
