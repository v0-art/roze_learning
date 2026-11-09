import type {PoolClient} from 'pg';
const invalid=()=>Object.assign(new Error('Некорректные данные профиля.'),{code:'INVALID_INPUT'});
export async function getProfile(db:PoolClient,actor:string){
 const result=await db.query('SELECT id,username,display_name,email,avatar_url FROM platform_accounts WHERE id=$1 AND active AND archived_at IS NULL',[actor]);
 if(!result.rowCount)throw Object.assign(new Error('Профиль недоступен.'),{code:'NOT_FOUND'});return result.rows[0];
}
export async function updateProfile(db:PoolClient,actor:string,displayName:unknown,avatarUrl:unknown){
 if(typeof displayName!=='string'||!displayName.trim()||displayName.length>200)throw invalid();
 if(avatarUrl!==undefined&&avatarUrl!==null&&(typeof avatarUrl!=='string'||avatarUrl.length>700000||!/^data:image\/(png|jpeg|webp);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(avatarUrl)))throw invalid();
 const result=avatarUrl===undefined?await db.query('UPDATE platform_accounts SET display_name=$2 WHERE id=$1 AND active AND archived_at IS NULL RETURNING id,username,display_name,email,avatar_url',[actor,displayName.trim()]):await db.query('UPDATE platform_accounts SET display_name=$2,avatar_url=$3 WHERE id=$1 AND active AND archived_at IS NULL RETURNING id,username,display_name,email,avatar_url',[actor,displayName.trim(),avatarUrl]);
 if(!result.rowCount)throw Object.assign(new Error('Профиль недоступен.'),{code:'NOT_FOUND'});return result.rows[0];
}
