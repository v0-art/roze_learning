import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {parse} from 'dotenv';
const root = process.cwd();
const dir = path.join(root,'data/visible-demo');
const dbPath = path.join(dir,'database.json');
const envPath = path.join(root,'.env.visible-demo');
const demoId = 'local-visible-demo-student';
const ids = ['M01-T01-U01','M01-T01-U02','M01-T02-U01'];
const command = process.argv[2] || 'start';
if (!['init','start'].includes(command)) throw new Error('Используйте init или start');
if (!fs.existsSync(dbPath)) {
  const db=JSON.parse(fs.readFileSync(path.join(root,'data/nexus_academy.json'),'utf8'));
  if(ids.some(id=>!db.lessons.some(l=>l.code===id))) throw new Error('Нет необходимых уроков.');
  fs.mkdirSync(dir,{recursive:true});
  const secret=()=>crypto.randomBytes(24).toString('base64url');
  const mentor=secret(), student=secret(), demo=secret();
  const env=`NEXUS_MENTOR_PASSWORD=${mentor}\nNEXUS_STUDENT_PASSWORD=${student}\nNEXUS_DEMO_PASSWORD=${demo}\n`;
  fs.writeFileSync(envPath,env,{mode:0o600,flag:'wx'});
  const salt=crypto.randomBytes(32), now=new Date().toISOString();
  db.users=[{id:'admin-mentor',displayName:'Демонстрационный ментор',email:'mentor@localhost',role:'admin',createdAt:now,lastSeenAt:now},{id:demoId,displayName:'Демонстрационный ученик',email:'demo@localhost',role:'student',isDemo:true,createdAt:now,lastSeenAt:now}];
  db.authAccounts=[{username:'demo',userId:demoId,role:'student',active:true,salt:salt.toString('hex'),passwordHash:crypto.scryptSync(demo,salt,64).toString('hex')}];
  for(const key of ['lessonAttempts','knowledgeGaps','homework','assessments','notifications','auditLogs','messages','promptSnapshots','assessmentRetakeGrants']) db[key]=[];
  for(const lesson of db.lessons) lesson.status=ids.includes(lesson.code)?'published':'draft';
  db.visibleDemo=true;
  fs.writeFileSync(dbPath,JSON.stringify(db,null,2),{mode:0o600});
  console.log('Демо-база создана. Локальные пароли записаны в .env.visible-demo.');
}
if(command!=='init') {
  const secrets=parse(fs.readFileSync(envPath));
  const env={...process.env,...secrets,NEXUS_STORAGE:'json',NEXUS_VISIBLE_DEMO:'1',NEXUS_HOST:'127.0.0.1',PORT:'3100',NEXUS_DATA_FILE:dbPath,NODE_ENV:'production'};
  delete env.NEXUS_DEMO_PASSWORD;
  const args=['--import','tsx'];
  args.push('server.ts');
  const child=spawn(process.execPath,args,{env,stdio:'inherit'});
  process.on('SIGINT',()=>child.kill('SIGINT')); process.on('SIGTERM',()=>child.kill('SIGTERM'));
  child.on('exit',code=>process.exit(code ?? 0));
}
