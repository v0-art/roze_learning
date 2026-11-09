import {Router} from 'express';
import type {Pool} from 'pg';
import crypto from 'node:crypto';
import svgCaptcha from 'svg-captcha';
import {authenticateAccount,changeAccountPassword} from './repositories/accounts';
import {createAccountSession,revokeAccountSession} from './repositories/sessions';
import {relationalSessionIdentity} from './relational-auth';
import {createCourseRouter} from './course-routes';

/** Separate opt-in router. Do not mount alongside the legacy API as its authentication. */
export function createRelationalApi(pool:Pool,options:{secureCookie?:boolean;cookieName?:string;cookiePath?:string;challenge?:()=>{text:string;data:string}}={}){
 const router=Router(),challenges=new Map<string,{answer:Buffer;ip:string;expires:number}>(),attempts=new Map<string,{count:number;expires:number}>(),captchaRequests=new Map<string,{count:number;expires:number}>();
 const digest=(value:string)=>crypto.createHash('sha256').update(value).digest();
 const cookieName=options.cookieName||'nexus_session',cookiePrefix=`${cookieName}=`;
 const cookieOptions={httpOnly:true,sameSite:'strict' as const,secure:options.secureCookie===true,path:options.cookiePath||'/'};
 const token=(req:any)=>{const found=(req.headers.cookie||'').split(';').map((x:string)=>x.trim()).filter((x:string)=>x.startsWith(cookiePrefix));return found.length===1?found[0].slice(cookiePrefix.length):null};
 const sameOrigin=(req:any)=>{try{return !!req.get('origin')&&!!req.get('host')&&new URL(req.get('origin')).host===req.get('host')}catch{return false}};
 router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()});
 router.use((req,res,next)=>{if(!['GET','HEAD'].includes(req.method)&&(!sameOrigin(req)||!req.is('application/json')))return res.sendStatus(403);next()});
 router.get('/captcha',(req,res)=>{
  const now=Date.now(),ip=req.ip||'unknown';for(const [id,c] of challenges)if(c.expires<=now)challenges.delete(id);for(const [key,v] of attempts)if(v.expires<=now)attempts.delete(key);for(const [key,v] of captchaRequests)if(v.expires<=now)captchaRequests.delete(key);
  if((attempts.get(ip)?.count||0)>=10)return res.status(429).json({error:'Слишком много попыток входа.'});
  const current=captchaRequests.get(ip);if(current&&current.count>=40)return res.status(429).json({error:'Слишком много запросов.'});captchaRequests.set(ip,{count:(current?.count||0)+1,expires:current?.expires||now+10*60_000});
  if(challenges.size>=5000)return res.status(503).json({error:'Сервис проверки временно занят.'});
  const challenge=options.challenge?options.challenge():svgCaptcha.create({size:6,ignoreChars:'0o1i',noise:2,color:false,inverse:true,width:250,height:80,fontSize:60});
  const id=crypto.randomBytes(32).toString('hex');challenges.set(id,{answer:digest(challenge.text.toLowerCase()),ip,expires:now+5*60_000});return res.json({token:id,svg:challenge.data});
 });
 router.post('/auth/login',async(req,res)=>{
  const now=Date.now(),ip=req.ip||'unknown';let limit=attempts.get(ip);if(limit&&limit.expires<=now){attempts.delete(ip);limit=undefined}if(limit&&limit.count>=10)return res.status(429).json({error:'Слишком много попыток входа.'});
  if(typeof req.body?.username!=='string'||typeof req.body?.password!=='string'||req.body.username.length>64||req.body.password.length>256)return res.status(400).json({error:'Укажите логин и пароль.'});
  const id=typeof req.body?.captchaToken==='string'?req.body.captchaToken:'',challenge=challenges.get(id);challenges.delete(id);
  const answer=typeof req.body?.captcha==='string'&&req.body.captcha.length<=32?req.body.captcha.trim().toLowerCase():'';
  const fail=()=>{const entry=limit||{count:0,expires:now+15*60_000};entry.count++;attempts.set(ip,entry)};
  if(!challenge||challenge.ip!==ip||challenge.expires<=now||!answer||!crypto.timingSafeEqual(challenge.answer,digest(answer))){fail();return res.status(400).json({error:'Неверный или устаревший код с картинки.'})}
  let db;try{
   db=await pool.connect();const identity=await authenticateAccount(db,req.body.username,req.body.password);if(!identity||identity.roles.length===0){fail();return res.status(401).json({error:'Неверный логин или пароль.'})}
   const old=token(req);if(old)await revokeAccountSession(db,old);const session=await createAccountSession(db,identity.id);attempts.delete(ip);res.cookie(cookieName,session,{...cookieOptions,maxAge:12*60*60_000});return res.json({roles:identity.roles});
  }catch{return res.status(503).json({error:'Не удалось выполнить вход.'})}finally{db?.release()}
 });
 router.post('/auth/logout',async(req,res)=>{let db;try{db=await pool.connect();const value=token(req);if(value)await revokeAccountSession(db,value);res.clearCookie(cookieName,cookieOptions);return res.json({success:true})}catch{return res.status(503).json({error:'Не удалось выполнить выход.'})}finally{db?.release()}});
 router.use(relationalSessionIdentity(pool,cookieName));
 router.get('/auth/me',(req:any,res)=>res.json(req.identity));
 router.post('/auth/password',async(req:any,res)=>{let db;try{db=await pool.connect();await changeAccountPassword(db,req.identity.id,req.body?.currentPassword,req.body?.newPassword);res.clearCookie(cookieName,cookieOptions);return res.json({success:true})}catch(error:any){if(error?.code==='INVALID_INPUT')return res.status(400).json({error:error.message});return res.status(503).json({error:'Не удалось изменить пароль.'})}finally{db?.release()}});
 router.use(createCourseRouter(pool));
 return router;
}
