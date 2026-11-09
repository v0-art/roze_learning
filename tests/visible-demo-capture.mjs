import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parse} from 'dotenv';
import {chromium} from 'playwright';
const base='http://127.0.0.1:3100', userId='local-visible-demo-student';
const dbFile='data/visible-demo/database.json', out='artifacts/rozephyr-three-lessons';
const secrets=parse(fs.readFileSync('.env.visible-demo'));
const ids=['M01-T01-U01','M01-T01-U02','M01-T02-U01'];
const files=fs.readdirSync('tests/fixtures/visible-demo').sort();
const saveState = state => {
  const db=JSON.parse(fs.readFileSync(dbFile,'utf8'));
  const obj={state,userId};
  for(const key of ['lessonAttempts','knowledgeGaps','homework','promptSnapshots','assessments']) obj[key]=db[key].filter(x=>x.userId===userId);
  assert.equal(obj.lessonAttempts.length,state);
  fs.writeFileSync(`data/visible-demo/state-${state}.json`,JSON.stringify(obj,null,2),{mode:0o600});
  return obj;
};
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try {
 const student=await browser.newContext({viewport:{width:1440,height:900},permissions:['clipboard-read','clipboard-write']});
 const page=await student.newPage();
 async function login(p,name,password) {
  await p.goto(base+'/'); await p.getByRole('button',{name:'Войти',exact:true}).click();
  await p.getByLabel('Логин').fill(name); await p.getByLabel('Пароль').fill(password);
  await p.getByLabel('Код с картинки').fill('Ab3cDe'); await p.getByRole('button',{name:'Войти',exact:true}).click();
  if(name==='demo') await p.getByRole('button',{name:'Пропустить'}).click();
  await p.getByRole('navigation',{name:name==='demo'?'Навигация ученика':'Навигация ментора'}).waitFor();
 }
 async function shot(name){await page.waitForTimeout(500);await page.screenshot({path:path.join(out,name),fullPage:true});}
 async function dashboard(name){await page.goto(base+'/dashboard');await page.getByText('ДЕМО · СИНТЕТИЧЕСКИЕ ДАННЫЕ').waitFor();await shot(name);}
 async function lesson(index) {
   await page.goto(base+'/lesson/'+ids[index]); await page.getByRole('button',{name:'Скопировать промпт'}).click(); await page.getByText('Скопировано в буфер!').waitFor();
   const report=JSON.parse(fs.readFileSync(path.join('tests/fixtures/visible-demo',files[index]),'utf8'));
   await page.getByPlaceholder('Вставьте сюда финальный JSON отчёт из ChatGPT...').fill(JSON.stringify(report));
   await page.getByRole('button',{name:'Проверить и сохранить результат'}).click(); await page.getByRole('button',{name:'Подтвердить и внести в систему'}).click();
   await page.getByText('Отчёт успешно импортирован и проверен схемой!').waitFor();
 }
 async function prompt(index,filename) {
  await page.goto(base+'/lesson/'+ids[index]); const area=page.locator('textarea[readonly]').first(); await area.waitFor();
  const text=await area.inputValue(); fs.writeFileSync(path.join(out,filename.replace('.png','.txt')),text);
  await area.evaluate(el=>{const n=el.value.indexOf('БЛОК ПРЕЕМСТВЕННОСТИ'); if(n>=0){el.focus();el.setSelectionRange(n,n);el.scrollTop=el.scrollHeight*n/el.value.length;}});
  await shot(filename); return text;
 }
 await login(page,'demo',secrets.NEXUS_DEMO_PASSWORD); saveState(0); await dashboard('00_student_before.png');
 await lesson(0); const first=saveState(1); assert.equal(first.homework.length,4); assert.equal(first.knowledgeGaps.filter(x=>x.status==='needs-review').length,3);
 await dashboard('01_student_after_first.png'); const secondPrompt=await prompt(1,'01_next_lesson_prompt.png'); for(const id of ['HW01','HW02','HW03','HW04','Q02','Q05','Q06']) assert.ok(secondPrompt.includes(id),id);
 await lesson(1); const second=saveState(2); assert.equal(second.knowledgeGaps.filter(g=>g.status==='needs-review').length,5); assert.equal(second.homework.filter(h=>h.lessonId===ids[0]&&h.status==='checked').length,3); assert.equal(second.homework.find(h=>h.id===ids[0]+'-HW03').status,'needs_revision');
 await dashboard('02_student_after_second.png'); await page.goto(base+'/homework'); await page.getByText('Проверено ИИ').first().waitFor(); await shot('02_homework_results.png');
 const thirdPrompt=await prompt(2,'02_third_lesson_prompt.png'); assert.ok(thirdPrompt.includes('M01-T01-U01-HW03'));
 await lesson(2); const third=saveState(3); assert.equal(third.knowledgeGaps.filter(g=>g.status==='needs-review').length,4); assert.equal(third.lessonAttempts.reduce((sum,x)=>sum+x.score,0),35); assert.equal(third.homework.length,10); assert.equal(third.homework.filter(h=>h.status==='checked').length,7); assert.equal(third.homework.filter(h=>h.status==='assigned').length,3);
 const old=third.knowledgeGaps.filter(g=>g.sourceLessonId===ids[0] && g.sourceQuestionId==='Q05'); assert.ok(old.length && old.every(g=>g.status==='resolved'&&g.resolutionSource==='student_self_report')); assert.ok(third.knowledgeGaps.some(g=>g.sourceLessonId===ids[1]&&g.sourceQuestionId==='Q06'&&g.status==='needs-review'));
 await dashboard('03_student_after_third.png'); await page.goto(base+'/homework'); await page.getByText('Проверено ИИ').first().waitFor(); await shot('03_homework_overview.png');
 await page.goto(base+'/progress'); await page.getByRole('heading',{name:'Аналитика прогресса и освоения компетенций'}).waitFor(); await shot('03_progress_and_gaps.png');
 await page.goto(base+'/knowledge-map'); await page.getByRole('button',{name:/Модуль M01:/}).waitFor(); await shot('03_knowledge_map.png');
 const admin=await browser.newContext({viewport:{width:1440,height:900}}); const ap=await admin.newPage(); await login(ap,'mentor',secrets.NEXUS_MENTOR_PASSWORD);
 await ap.goto(base+'/admin/reports'); await ap.getByText('Демонстрационный ученик').first().waitFor(); await ap.screenshot({path:path.join(out,'03_mentor_student_profile.png'),fullPage:true});
 await ap.goto(base+'/admin'); await ap.getByRole('region',{name:'Управление демонстрацией'}).waitFor();
 for(const n of [0,1,2,3]) {await ap.getByRole('button',{name:`${n} уроков`,exact:true}).click();await ap.getByRole('status').getByText(`Показано состояние после ${n} уроков. Обновите страницу ученика.`).waitFor();const db=await (await ap.request.get(base+'/api/db')).json();assert.equal(db.lessonAttempts.filter(x=>x.userId===userId).length,n);}
 console.log('UI: три отчёта импортированы, четыре состояния переключаются, снимки созданы.');
} finally { await browser.close(); }
