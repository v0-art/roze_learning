import crypto from 'node:crypto';
import type {PoolClient} from 'pg';

const TOKEN_PATTERN=/^[a-f0-9]{64}$/;
const digest=(token:string)=>crypto.createHash('sha256').update(token,'utf8').digest();

/** The bearer token is returned once; PostgreSQL stores only its hash. */
export async function createAccountSession(db:PoolClient,accountId:string,lifetimeSeconds=12*60*60):Promise<string>{
 if(!Number.isInteger(lifetimeSeconds)||lifetimeSeconds<1||lifetimeSeconds>30*24*60*60)throw new Error('Некорректный срок сессии.');
 const token=crypto.randomBytes(32).toString('hex');
 const result=await db.query(`INSERT INTO account_sessions(token_hash,account_id,expires_at)
  SELECT $1,id,now()+$3*interval '1 second' FROM platform_accounts WHERE id=$2 AND active AND archived_at IS NULL RETURNING account_id`,[digest(token),accountId,lifetimeSeconds]);
 if(!result.rowCount)throw new Error('Учётная запись недоступна.');
 return token;
}

/** Roles are loaded on every request, so grants and revocations take effect immediately. */
export async function findAccountSession(db:PoolClient,token:unknown):Promise<{id:string;roles:string[]}|null>{
 if(typeof token!=='string'||!TOKEN_PATTERN.test(token))return null;
 const result=await db.query(`SELECT a.id,COALESCE(array_agg(r.role ORDER BY r.role) FILTER (WHERE r.role IS NOT NULL),'{}') AS roles
  FROM account_sessions s JOIN platform_accounts a ON a.id=s.account_id
  LEFT JOIN platform_account_roles r ON r.account_id=a.id AND r.enabled
  WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND a.active AND a.archived_at IS NULL GROUP BY a.id`,[digest(token)]);
 return result.rows[0]??null;
}

export async function revokeAccountSession(db:PoolClient,token:unknown):Promise<void>{
 if(typeof token!=='string'||!TOKEN_PATTERN.test(token))return;
 await db.query('UPDATE account_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL',[digest(token)]);
}

export async function revokeAllAccountSessions(db:PoolClient,accountId:string):Promise<void>{
 await db.query('UPDATE account_sessions SET revoked_at=now() WHERE account_id=$1 AND revoked_at IS NULL',[accountId]);
}
