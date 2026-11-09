import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { assembleLessonPrompt } from './promptEngine';
import { validateStructuredReport } from './reportValidator';

const fixtureDir = 'tests/fixtures/three-lesson';
const fixtures = fs.readdirSync(fixtureDir).sort().map(f => JSON.parse(fs.readFileSync(path.join(fixtureDir, f), 'utf8')));
const lessons = ['M01-T01-U01','M01-T01-U02','M01-T02-U01'];

test('three lessons: isolated reports, precise carryover, permissions and persistence', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-three-'));
  const dbFile = path.join(dir, 'db.json');
  const db = JSON.parse(fs.readFileSync('data/nexus_academy.json', 'utf8'));
  for (const lesson of db.lessons) lesson.status = 'draft';
  fs.writeFileSync(dbFile, JSON.stringify(db));
  const port = 20000 + Math.floor(Math.random() * 20000), base = `http://127.0.0.1:${port}`;
  const passwords: Record<string,string> = {mentor:'mentor-integration-password', test_three:'test-three-password-123', test_other:'test-other-password-123'};
  const server = spawn(process.execPath, ['--import','tsx','--import','./tests/captcha-fixture.mjs','server.ts'], {env:{...process.env,NODE_ENV:'production',PORT:String(port),NEXUS_DATA_FILE:dbFile,NEXUS_MENTOR_PASSWORD:passwords.mentor,NEXUS_STUDENT_PASSWORD:'student-integration-password'},stdio:'pipe'});
  async function call(url:string, who?:string, data?:unknown) {
    const headers:Record<string,string> = {};
    if (who) headers.Authorization = 'Basic ' + Buffer.from(`${who}:${passwords[who]}`).toString('base64');
    if (data !== undefined) Object.assign(headers, {'Content-Type':'application/json',Origin:base});
    const res = await fetch(base+url,{method:data === undefined ? 'GET':'POST',headers,...(data === undefined ? {} : {body:JSON.stringify(data)})});
    const raw = await res.text(); let body:any; try { body=JSON.parse(raw); } catch { body=raw; }
    return {status:res.status,body};
  }
  try {
    let ready=false; for(let i=0;i<300;i++) { try { await fetch(base+'/api/health'); ready=true; break; } catch { await delay(100); } }
    assert.ok(ready);
    assert.equal((await call('/api/db')).status,401);
    for (const who of ['test_three','test_other']) assert.equal((await call('/api/mentor/users','mentor',{username:who,displayName:who,password:passwords[who]})).status,201);
    assert.equal((await call('/api/content/batch','test_three',{action:'publish',lessonIds:lessons})).status,403);
    assert.equal((await call('/api/content/batch','mentor',{action:'publish',lessonIds:lessons})).status,200);
    assert.equal((await call('/api/db','test_three')).body.lessons.length,3);
    assert.equal((await call('/api/snapshots','test_three',{lessonId:lessons[1],prompt:'early'})).status,403);
    for (let i=0;i<3;i++) {
      const state=(await call('/api/db','test_three')).body;
      const lesson=state.lessons.find((x:any)=>x.code===lessons[i]); assert.ok(lesson);
      const previous=lesson.previousLessonId || null;
      const previousAttempt=state.lessonAttempts.find((x:any)=>x.lessonId===previous);
      const prompt=assembleLessonPrompt({lesson,previousLessonId:previous,previousLessonReport:previousAttempt?.structuredReport || null,unresolvedGaps:state.knowledgeGaps.filter((g:any)=>g.status==='needs-review'),pendingHomework:state.homework.filter((h:any)=>h.lessonId===previous || ['assigned','submitted','needs_revision','not_submitted'].includes(h.status))});
      if(i===1) { assert.equal(prompt.carryoverHomeworkCount,4); for(const hw of fixtures[0].homework) assert.ok(prompt.fullPromptText.includes(hw.description)); }
      if(i===2) { assert.equal(prompt.carryoverHomeworkCount,4); for(const instruction of fixtures[1].nextLessonInstructions.mandatoryRechecks) assert.ok(prompt.fullPromptText.includes(instruction)); assert.match(prompt.fullPromptText,/M01-T01-U01:Q05/); assert.match(prompt.fullPromptText,/M01-T01-U02:Q05/); }
      const snapshot=await call('/api/snapshots','test_three',{lessonId:lessons[i],prompt:prompt.fullPromptText}); assert.equal(snapshot.status,200,JSON.stringify(snapshot.body));
      const report=structuredClone(fixtures[i]);
      assert.equal(validateStructuredReport(JSON.stringify(report),lessons[i]).valid,true);
      const original=await call('/api/reports','test_three',{lessonId:lessons[i],snapshotId:snapshot.body.id,rawText:JSON.stringify(report)});
      assert.equal(original.status,400); assert.match(original.body.error,/Демонстрационный/);
      report.studentNotes='Данные теста в изолированной временной базе.';
      const request={lessonId:lessons[i],snapshotId:snapshot.body.id,rawText:JSON.stringify(report)};
      assert.equal((await call('/api/reports','test_other',request)).status,400);
      assert.equal((await call('/api/reports','test_three',{...request,rawText:'{invalid'})).status,400);
      const result=await call('/api/reports','test_three',request); assert.equal(result.status,200,JSON.stringify(result.body));
      assert.equal((await call('/api/reports','test_three',request)).body.duplicate,true);
      const after=(await call('/api/db','test_three')).body;
      assert.equal(after.lessonAttempts.length,i+1);
      assert.equal(after.lessonAttempts[0].score,[12,11,12][i]);
      assert.equal(after.lessonAttempts[0].structuredReport.assessment.questions.length,8);
      assert.equal(after.homework.filter((h:any)=>h.lessonId===lessons[i] && h.status==='assigned').length,[4,3,3][i]);
      if(i===1) {
        assert.equal(after.knowledgeGaps.filter((g:any)=>g.status==='needs-review').length,5);
        assert.equal(after.homework.find((h:any)=>h.id==='M01-T01-U01-HW03').status,'needs_revision');
        assert.equal(after.knowledgeGaps.find((g:any)=>g.sourceLessonId===lessons[0] && g.sourceQuestionId==='Q05').status,'needs-review');
        assert.equal(after.lessonAttempts[0].structuredReport.assessment.questions[0].questionText,fixtures[i].assessment.questions[0].questionText);
      }
      if(i===2) {
        assert.equal(after.knowledgeGaps.filter((g:any)=>g.status==='needs-review').length,4);
        assert.equal(after.homework.find((h:any)=>h.id==='M01-T01-U01-HW03').status,'checked');
        const old=after.knowledgeGaps.filter((g:any)=>g.sourceLessonId===lessons[0] && g.sourceQuestionId==='Q05'); assert.ok(old.length); assert.ok(old.every((g:any)=>g.status==='resolved' && g.resolutionSource==='student_self_report' && g.recheckHistory.at(-1).status==='resolved_preliminary'));
        const open=after.knowledgeGaps.filter((g:any)=>g.sourceLessonId===lessons[1] && g.sourceQuestionId==='Q06'); assert.ok(open.length); assert.ok(open.every((g:any)=>g.status==='needs-review'));
        assert.ok(after.homework.find((h:any)=>h.id==='M01-T01-U01-HW03').reviewHistory.length===2);
      }
    }
    const finalState = (await call('/api/db','test_three')).body;
    const next = db.lessons.find((x:any) => x.previousLessonId === lessons[2]);
    assert.ok(next);
    const nextPrompt = assembleLessonPrompt({lesson:next, previousLessonId:lessons[2], previousLessonReport:finalState.lessonAttempts[0].structuredReport, unresolvedGaps:finalState.knowledgeGaps.filter((g:any)=>g.status==='needs-review'), pendingHomework:finalState.homework.filter((h:any)=>h.lessonId===lessons[2] || ['assigned','submitted','needs_revision','not_submitted'].includes(h.status))});
    for (const instruction of fixtures[2].nextLessonInstructions.mandatoryRechecks) assert.ok(nextPrompt.fullPromptText.includes(instruction));
    for (const hw of fixtures[2].homework) assert.ok(nextPrompt.fullPromptText.includes(hw.description));
    for (const instruction of fixtures[2].nextLessonInstructions.homeworkChecks) assert.ok(nextPrompt.fullPromptText.includes(instruction));
    assert.equal((await call('/api/db','test_other')).body.lessonAttempts.length,0);
    assert.equal((await call('/api/db','test_other')).body.homework.length,0);
    assert.equal((await call('/api/mentor/users','test_three')).status,403);
    assert.equal((await call('/api/db','mentor')).body.lessonAttempts.filter((x:any)=>lessons.includes(x.lessonId)).length >= 3,true);
  } finally { server.kill(); fs.rmSync(dir,{recursive:true,force:true}); }
});
