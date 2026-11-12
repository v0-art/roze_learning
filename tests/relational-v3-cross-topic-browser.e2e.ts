import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {parse} from 'dotenv';
import pg from 'pg';
import JSZip from 'jszip';
import {spawn,type ChildProcess} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {applyRelationalMigrations} from '../src/server/relational-migrations';
import {configureRelationalRuntimeRole} from '../src/server/relational-permissions';
import {createCourse,enrollStudent} from '../src/server/repositories/courses';
import {createAccountSession} from '../src/server/repositories/sessions';
import {importV3Content,publishV3Content} from '../src/server/repositories/v3-content';

test('AT-17: browser carries four homework tasks and gaps across topic boundary',{timeout:120000},async()=>{
 const c=parse(fs.readFileSync('.env.postgres')),prefix=`postgresql://${encodeURIComponent(c.POSTGRES_USER)}:${encodeURIComponent(c.POSTGRES_PASSWORD)}@127.0.0.1:${process.env.NEXUS_TEST_POSTGRES_PORT||'55432'}/`;
 const admin=new pg.Client({connectionString:prefix+encodeURIComponent(c.POSTGRES_DB)});await admin.connect();
 const suffix=crypto.randomBytes(5).toString('hex'),name='nexus_cross_ui_'+suffix,role='nexus_cross_r_'+suffix,password=crypto.randomBytes(32).toString('base64url');
 await admin.query(`CREATE DATABASE "${name}"`);const pool=new pg.Pool({connectionString:prefix+name}),db=await pool.connect();let server:ChildProcess|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try{
  await applyRelationalMigrations(db);await db.query("INSERT INTO platform_accounts(id,username,display_name) VALUES('mentor','mentor','Mentor'),('student','student','Student')");
  await db.query("INSERT INTO platform_account_roles(account_id,role) VALUES('mentor','mentor'),('student','student')");await createCourse(db,'mentor','course1','Проверка трёх занятий');await enrollStudent(db,'mentor','course1','student','mentor');
  const pack=await JSZip.loadAsync(fs.readFileSync('tests/fixtures/v3-m01-full/M01_FULL_52_LESSONS_2_CONTROLS_EXAM_TEST.zip'));
  const plan=JSON.parse(await pack.file('curriculum-plan.json')!.async('string'));plan.items=plan.items.filter((item:any)=>['M01-T01-U01','M01-T01-U02','M01-T02-U01'].includes(item.id));pack.file('curriculum-plan.json',JSON.stringify(plan));
  await importV3Content(db,'mentor','course1',(await pack.generateAsync({type:'nodebuffer'})).toString('base64'));
  for(const id of ['M01','M01-T01','M01-T02','M01-T01-U01','M01-T01-U02','M01-T02-U01','M01-PLAN','ROZEPHYR-REGULATION-3.0'])await publishV3Content(db,'mentor','course1',id,1);
  const token=await createAccountSession(db,'student');await configureRelationalRuntimeRole(db,role,password);db.release();
  const port=22000+Math.floor(Math.random()*15000),base=`http://127.0.0.1:${port}`,runtime=`postgresql://${encodeURIComponent(role)}:${encodeURIComponent(password)}@127.0.0.1:${process.env.NEXUS_TEST_POSTGRES_PORT||'55432'}/${name}`;
  server=spawn(process.execPath,['--import','tsx','server.ts'],{env:{...process.env,PORT:String(port),NODE_ENV:'production',NEXUS_STORAGE:'relational',NEXUS_RELATIONAL_DATABASE_URL:runtime},stdio:'pipe'});
  for(let i=0;i<200;i++){if(server.exitCode!==null)throw new Error('Сервер остановился');try{if((await fetch(base+'/api/health')).ok)break}catch{}await delay(100)}
  browser=await chromium.launch({headless:true});const context=await browser.newContext();await context.addCookies([{name:'rozephyr_relational_session',value:token,url:base}]);const page=await context.newPage();
  await page.goto(base+'/dashboard');await page.getByRole('button',{name:'Перейти к занятиям'}).click();
  const download=async()=>{const [file]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Скачать архив'}).click()]);return JSZip.loadAsync(fs.readFileSync((await file.path())!))};
  const save=async(archive:JSZip,id:string,entryControl:any,result:any,gaps:any[],nextContext:any)=>{const issued=JSON.parse(await archive.file('manifest.json')!.async('string'));const value={format:'rozephyr-result',formatVersion:'1.0',sessionId:issued.sessionId,itemId:id,itemType:'lesson',status:'completed',submittedAt:new Date().toISOString(),source:'external_ai_user_submitted',entryControl,result,knowledgeGaps:gaps,strongSkills:[],nextContext};await page.getByLabel('Отчёт о занятии').fill(JSON.stringify(value));await page.getByRole('button',{name:'Сохранить отчёт'}).click();await page.getByText('Отчёт сохранён.').waitFor()};
  const empty={homeworkResults:[],recheckResults:[]},homework=Array.from({length:4},(_,i)=>({homeworkId:`HW0${i+1}`,title:`ДЗ ${i+1}`,description:`Условие ${i+1}`}));
  await save(await download(),'M01-T01-U01',empty,{earnedScore:1,maxScore:2,questions:[{questionId:'Q05',result:'partial',pointsAwarded:1,maxPoints:2,questionText:'Первый вопрос',studentAnswer:'Ответ',feedback:'Разобрать ошибку'}]},[{gapId:'Q05',description:'Пробел',status:'open'}],{mandatoryRechecks:['Q05'],homework});
  await page.getByRole('button',{name:'Мои курсы',exact:true}).click();await page.getByRole('button',{name:/Проверка трёх занятий/}).click();await page.getByText('M01 ·',{exact:false}).first().click();await page.getByText('M01-T01 ·',{exact:false}).first().click();await page.getByRole('button',{name:/M01-T01-U02 ·/}).click();
  const second=await download(),context2=JSON.parse(await second.file('context.json')!.async('string'));assert.equal(context2.openHomework.length,4);assert.match(context2.mandatoryRechecks[0].prompt,/Первый вопрос/);
  await save(second,'M01-T01-U02',{homeworkResults:homework.map((item,i)=>({homeworkId:item.homeworkId,sourceItemId:'M01-T01-U01',status:i<2?'checked':'not_submitted',feedback:i<2?'Проверено':'Не выполнено'})),recheckResults:[{sourceItemId:'M01-T01-U01',sourceQuestionId:'Q05',status:'resolved',evidence:'Исправлено'}]},{earnedScore:2,maxScore:2,questions:[{questionId:'Q01',result:'correct',pointsAwarded:2,maxPoints:2}]},[],{mandatoryRechecks:[],homework:[]});
  await page.getByText('M01-T02 ·',{exact:false}).first().click();await page.getByRole('button',{name:/M01-T02-U01 ·/}).click();const third=await download(),context3=JSON.parse(await third.file('context.json')!.async('string'));
  assert.deepEqual(context3.openHomework.map((item:any)=>item.homeworkId).sort(),['HW03','HW04']);assert.equal(context3.mandatoryRechecks.length,0);
  await save(third,'M01-T02-U01',{homeworkResults:homework.slice(2).map(item=>({homeworkId:item.homeworkId,sourceItemId:'M01-T01-U01',status:'not_submitted',feedback:'Не выполнено'})),recheckResults:[]},{earnedScore:2,maxScore:2,questions:[{questionId:'Q01',result:'correct',pointsAwarded:2,maxPoints:2}]},[],{mandatoryRechecks:[],homework:[]});
  const gaps=await pool.query("SELECT status FROM v3_knowledge_gaps WHERE course_id='course1' AND student_id='student' AND source_item_id='M01-T01-U01' AND id='Q05'");assert.equal(gaps.rows[0].status,'resolved');assert.equal((await pool.query('SELECT count(*)::int n FROM v3_reports')).rows[0].n,3);await context.close();
 }finally{try{db.release()}catch{}if(browser)await browser.close();if(server&&server.exitCode===null){const done=new Promise(resolve=>server!.once('exit',resolve));server.kill('SIGTERM');await done}await pool.end();await admin.query(`DROP DATABASE "${name}"`);await admin.query(`DROP ROLE IF EXISTS "${role}"`);await admin.end()}
});
