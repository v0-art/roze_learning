import type {RequestHandler} from 'express';
import type {Pool} from 'pg';
import {findAccountSession} from './repositories/sessions';

/** Resolve identity from a server-issued cookie; never trust a client-supplied account id. */
export function relationalSessionIdentity(pool:Pool,cookieName='nexus_session'):RequestHandler {
 return async (req:any,res,next)=>{
  const cookies=(req.headers.cookie||'').split(';').map((item:string)=>item.trim());
  const prefix=`${cookieName}=`;const matches=cookies.filter((item:string)=>item.startsWith(prefix));
  if(matches.length!==1)return res.status(401).json({error:'Требуется вход.'});
  let db;
  try{
   db=await pool.connect();
   const identity=await findAccountSession(db,matches[0].slice(prefix.length));
   if(!identity)return res.status(401).json({error:'Сессия недействительна.'});
   req.identity=identity;next();
  }catch{res.status(503).json({error:'Не удалось проверить сессию.'});}
  finally{db?.release();}
 };
}
