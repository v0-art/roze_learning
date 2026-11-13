import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import type {Pool} from 'pg';
import {createRelationalApi} from '../src/server/relational-api';
import {configureCaddyProxy} from '../src/server/proxy';

test('forwarded addresses are not trusted unless the Caddy deployment enables them',()=>{
 const direct=express();configureCaddyProxy(direct,false);assert.equal(direct.get('trust proxy'),false);
 const proxied=express();configureCaddyProxy(proxied,true);assert.equal(proxied.get('trust proxy'),1);
});

test('proxy isolates login limits by client and discards forged forwarding headers',{timeout:30000},async()=>{
 const app=express();configureCaddyProxy(app,true);app.use(express.json());app.use('/api',createRelationalApi({} as Pool,{challenge:()=>({text:'abc234',data:'<svg/>'})}));
 const backend=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>backend.once('listening',resolve));const addr=backend.address();assert.ok(addr&&typeof addr==='object');
 // The gateway models Caddy's explicit header_up: it always replaces incoming X-Forwarded-For.
 const gateway=http.createServer((req,res)=>{const headers={...req.headers,'x-forwarded-for':req.socket.remoteAddress||''};const upstream=http.request({host:'127.0.0.1',port:addr.port,path:req.url,method:req.method,headers},response=>{res.writeHead(response.statusCode||500,response.headers);response.pipe(res)});upstream.on('error',()=>res.writeHead(502).end());req.pipe(upstream)});
 gateway.listen(0,'0.0.0.0');await new Promise<void>(resolve=>gateway.once('listening',resolve));const proxy=gateway.address();assert.ok(proxy&&typeof proxy==='object');const proxyPort=proxy.port,origin=`http://127.0.0.1:${proxyPort}`;
 async function call(localAddress:string,path:string,body?:unknown,forwarded?:string){return new Promise<{status:number;body:any}>((resolve,reject)=>{const data=body===undefined?undefined:JSON.stringify(body);const req=http.request({host:'127.0.0.1',port:proxyPort,localAddress,path:'/api'+path,method:data?'POST':'GET',headers:{...(data?{'content-type':'application/json','content-length':Buffer.byteLength(data),origin}:{}),...(forwarded?{'x-forwarded-for':forwarded}:{})}},res=>{const chunks:Buffer[]=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode||0,body:JSON.parse(Buffer.concat(chunks).toString())}))});req.on('error',reject);req.end(data)})}
 try{
  for(let i=0;i<10;i++){const captcha=await call('127.0.0.2','/captcha');assert.equal(captcha.status,200);const result=await call('127.0.0.2','/auth/login',{username:'student',password:'bad',captchaToken:captcha.body.token,captcha:'incorrect'});assert.equal(result.status,400)}
  assert.equal((await call('127.0.0.2','/captcha')).status,429);
  assert.equal((await call('127.0.0.3','/captcha',undefined,'127.0.0.2')).status,200);
 }finally{await new Promise<void>(resolve=>gateway.close(()=>resolve()));await new Promise<void>(resolve=>backend.close(()=>resolve()))}
});
