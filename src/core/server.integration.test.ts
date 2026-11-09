import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { assembleLessonPrompt } from './promptEngine';

const mentorPassword = 'mentor-integration-password';
const studentPassword = 'student-integration-password';

test('server: permissions, lesson continuity and assessment review persist', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-'));
  const dbFile = path.join(dir, 'db.json');
  fs.copyFileSync('data/nexus_academy.json', dbFile);
  const isolatedDb = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  delete isolatedDb.moduleRelations; delete isolatedDb.moduleGraphDocument;
  for (const lesson of isolatedDb.lessons) lesson.status = 'draft';
  fs.writeFileSync(dbFile, JSON.stringify(isolatedDb));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['--import', 'tsx', '--import', './tests/captcha-fixture.mjs', 'server.ts'], {
    cwd: process.cwd(), env: {...process.env, NODE_ENV: 'production', PORT: String(port), NEXUS_DATA_FILE: dbFile, NEXUS_MENTOR_PASSWORD: mentorPassword, NEXUS_STUDENT_PASSWORD: studentPassword}, stdio: 'pipe',
  });
  async function call(url: string, role?: 'mentor' | 'student', data?: unknown) {
    const headers: Record<string, string> = {};
    if (role) headers.Authorization = 'Basic ' + Buffer.from(`${role}:${role === 'mentor' ? mentorPassword : studentPassword}`).toString('base64');
    if (data !== undefined) Object.assign(headers, {'Content-Type': 'application/json', Origin: base});
    const response = await fetch(base + url, {method: data === undefined ? 'GET' : 'POST', headers, ...(data === undefined ? {} : {body: JSON.stringify(data)})});
    const body = await response.text();
    try { return {status: response.status, body: JSON.parse(body)}; } catch { return {status: response.status, body}; }
  }
  try {
    let ready = false;
    for (let i = 0; i < 300; i++) {
      try { await fetch(base + '/api/health'); ready = true; break; } catch { await delay(100); }
    }
    assert.ok(ready, 'temporary server must start');
    assert.equal((await call('/api/db')).status, 401);
    const makeLogin = (captchaToken:string, captcha:string, username='student', password=studentPassword) => fetch(base + '/api/auth/login', {method:'POST', headers:{Origin:base, 'Content-Type':'application/json'}, body:JSON.stringify({username,password,captchaToken,captcha})});
    assert.equal((await makeLogin('', '')).status,400);
    const badChallenge = (await call('/api/captcha')).body;
    assert.equal((await makeLogin(badChallenge.token, 'wrong')).status,400);
    assert.equal((await makeLogin(badChallenge.token, 'Ab3cDe')).status,400);
    const challenge = (await call('/api/captcha')).body;
    const sessionLogin = await makeLogin(challenge.token, 'Ab3cDe');
    assert.equal((await makeLogin(challenge.token, 'Ab3cDe')).status,400);
    assert.equal(sessionLogin.status, 200);
    const sessionCookie = sessionLogin.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await fetch(base + '/api/db', {headers:{Cookie:sessionCookie}})).status, 200);
    assert.equal((await fetch(base + '/api/auth/logout', {method:'POST', headers:{Origin:base, 'Content-Type':'application/json', Cookie:sessionCookie}, body:'{}'})).status, 200);
    assert.equal((await fetch(base + '/api/db', {headers:{Cookie:sessionCookie}})).status, 401);

    const injectionChallenge = (await call('/api/captcha')).body;
    const injectionLogin = await makeLogin(injectionChallenge.token, 'Ab3cDe', "' OR 1=1 --", "' OR 1=1 --");
    assert.equal(injectionLogin.status, 401);
    assert.equal(injectionLogin.headers.get('set-cookie'), null);
    assert.equal((await call('/api/profile', 'student', {avatar: 'data:image/svg+xml;base64,PHN2Zz4='})).status, 400);
    const inherited = await fetch(base + '/api/db', {headers: {Authorization: 'Basic ' + Buffer.from('constructor:').toString('base64')}});
    assert.equal(inherited.status, 401);
    assert.equal((await call('/api/db', 'student', {modules: [], lessons: []})).status, 403);
    assert.equal((await call('/api/content/batch', 'student', {action: 'publish', lessonIds: ['M01-T01-U01']})).status, 403);
    assert.equal((await call('/api/db', 'student')).body.lessons.length, 0);
    const createStudent = await call('/api/mentor/users', 'mentor', {username: 'student_two', displayName: 'Test Student Two', password: 'second-integration-password'});
    assert.equal(createStudent.status, 201);
    assert.equal((await call('/api/mentor/users', 'student', {username: 'illegal', displayName: 'No', password: 'long-enough-password'})).status, 403);
    assert.equal((await call('/api/db', 'mentor')).body.authAccounts, undefined);
    const sourceGraph = JSON.parse(fs.readFileSync('data/module_graph_v1.json', 'utf8'));
    const beforeGraph = (await call('/api/db', 'mentor')).body;
    assert.equal((await call('/api/module-graph/preview', 'student', sourceGraph)).status, 403);
    const previewGraph = await call('/api/module-graph/preview', 'mentor', sourceGraph);
    assert.equal(previewGraph.status, 200);
    assert.equal(previewGraph.body.changes.filter((c:any) => c.action === 'add').length, 97);
    const importedGraph = await call('/api/module-graph/import', 'mentor', {graph:sourceGraph,revision:previewGraph.body.revision});
    assert.equal(importedGraph.status, 200); assert.equal(importedGraph.body.count, 97);
    const repeatGraph = await call('/api/module-graph/preview', 'mentor', sourceGraph);
    assert.equal(repeatGraph.body.changes.filter((c:any) => c.action === 'unchanged').length, 97);
    assert.equal((await call('/api/module-graph', 'student')).body.edges.length, 0);
    const approvedEdge = {...sourceGraph.edges[0], approvalStatus:'approved'};
    assert.equal((await call('/api/module-graph/update', 'student', {revision:repeatGraph.body.revision,edge:approvedEdge})).status, 403);
    assert.equal((await call('/api/module-graph/update', 'mentor', {revision:repeatGraph.body.revision,edge:approvedEdge})).status, 200);
    assert.equal((await call('/api/module-graph', 'student')).body.edges.length, 1);
    const conflictGraph = await call('/api/module-graph/preview', 'mentor', sourceGraph);
    assert.equal(conflictGraph.body.changes.filter((c:any) => c.action === 'conflict').length, 1);
    assert.equal((await call('/api/module-graph/import', 'mentor', {graph:sourceGraph,revision:conflictGraph.body.revision})).status, 409);
    const afterGraph = (await call('/api/db', 'mentor')).body;
    assert.deepEqual(afterGraph.skills,beforeGraph.skills); assert.deepEqual(afterGraph.relations,beforeGraph.relations);
    assert.deepEqual(afterGraph.lessonAttempts,beforeGraph.lessonAttempts); assert.deepEqual(afterGraph.homework,beforeGraph.homework);
    assert.equal((await call('/api/module-graph/export', 'mentor')).body.edges.length,97);

    const secondAuth = 'Basic ' + Buffer.from('student_two:second-integration-password').toString('base64');
    const secondDb = await fetch(base + '/api/db', {headers: {Authorization: secondAuth}});
    assert.equal(secondDb.status, 200);
    assert.equal((await secondDb.json()).currentUserId, createStudent.body.userId);
    const libraryContent = Buffer.from('Библиотека: тестовый файл').toString('base64');
    const libraryItem = {name:'test-library.txt', linkedEntity:'M01-T01', contentBase64:libraryContent};
    assert.equal((await call('/api/library/save', 'student', libraryItem)).status,403);
    const addedFile = await call('/api/library/save','mentor',libraryItem);
    assert.equal(addedFile.status,200);
    const downloaded = await call('/api/library/download/'+addedFile.body.id,'mentor');
    assert.equal(downloaded.body,'Библиотека: тестовый файл');
    assert.equal((await call('/api/library/save','mentor',{id:addedFile.body.id,name:'renamed.txt',linkedEntity:'M01-EX01'})).status,200);
    assert.equal((await call('/api/library/save','mentor',{id:addedFile.body.id,name:'../secret.txt',linkedEntity:'GLOBAL'})).status,400);
    assert.equal((await call('/api/library/archive','student',{id:addedFile.body.id})).status,403);
    assert.equal((await call('/api/library/archive','mentor',{id:addedFile.body.id})).status,200);
    assert.equal((await call('/api/library/download/'+addedFile.body.id,'mentor')).status,404);
    const removed = await call('/api/mentor/users','mentor',{username:'to_archive',displayName:'Temporary pupil',password:'temporary-pupil-password'});
    assert.equal(removed.status,201);
    assert.equal((await call('/api/mentor/users/archive','student',{userId:removed.body.userId})).status,403);
    assert.equal((await call('/api/mentor/users/archive','mentor',{userId:removed.body.userId})).status,200);
    const removedAuth = 'Basic '+Buffer.from('to_archive:temporary-pupil-password').toString('base64');
    assert.equal((await fetch(base+'/api/db',{headers:{Authorization:removedAuth}})).status,401);
    assert.ok(!(await call('/api/mentor/users','mentor')).body.some((a:any)=>a.userId===removed.body.userId));
    const hostileText = "<img src=x onerror=alert(1)> ' OR 1=1 --";
    const sent = await call('/api/messages', 'mentor', {recipientId: createStudent.body.userId, content: hostileText});
    assert.equal(sent.status, 201);
    assert.ok(!(await call('/api/messages/inbox', 'student')).body.some((m: any) => m.id === sent.body.id));
    const secondInbox = await fetch(base + '/api/messages/inbox', {headers: {Authorization: secondAuth}}).then(r => r.json());
    assert.equal(secondInbox.find((m: any) => m.id === sent.body.id).content, hostileText);
    assert.equal((await call('/api/messages/read', 'student', {id: sent.body.id})).status, 404);
    assert.equal((await call('/api/messages', 'student', {recipientId: createStudent.body.userId, content:'Hello mentor'})).status, 201);
    assert.ok((await call('/api/messages/inbox', 'mentor')).body.some((m: any) => m.content === 'Hello mentor' && m.recipientId === 'admin-mentor'));


    assert.equal((await call('/api/content/batch', 'mentor', {action: 'publish', lessonIds: ['M01-T01-U01', 'M01-T01-U02']})).status, 200);
    assert.equal((await call('/api/snapshots', 'student', {lessonId: 'M01-T01-U02', prompt: 'early'})).status, 403);
    const initial = (await call('/api/db', 'student')).body;
    const u01 = initial.lessons.find((l: any) => l.code === 'M01-T01-U01');
    const prompt1 = assembleLessonPrompt({lesson: u01});
    assert.equal(prompt1.hasCarryover, false);
    assert.equal((await call('/api/snapshots', 'student', {lessonId: 'M01-T01-U01', prompt: 'tampered'})).status, 409);
    const snap = await call('/api/snapshots', 'student', {lessonId: 'M01-T01-U01', prompt: prompt1.fullPromptText});
    const demo = JSON.parse(fs.readFileSync('public/assets/aistudio/NEXUS_M01_T01_U01_DEMO_report_e461a5fb.json', 'utf8'));
    const submission = {lessonId: 'M01-T01-U01', snapshotId: snap.body.id, rawText: JSON.stringify(demo)};
    assert.equal((await call('/api/reports', 'student', submission)).status, 400);
    demo.studentNotes = 'Isolated test fixture'; submission.rawText = JSON.stringify(demo);
    const inconsistent = structuredClone(demo); inconsistent.assessment.earnedScore = 13;
    assert.equal((await call('/api/reports', 'student', {...submission, rawText: JSON.stringify(inconsistent)})).status, 400);
    const saved = await call('/api/reports', 'student', submission);
    assert.equal(saved.status, 200);
    assert.equal((await call('/api/reports', 'student', submission)).body.duplicate, true);
    let student = (await call('/api/db', 'student')).body;
    assert.equal(student.homework.length, 4);
    assert.ok(student.homework.every((h: any) => h.status === 'assigned'));
    assert.equal(student.knowledgeGaps.length, 3);
    const disk = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    disk.knowledgeGaps.push({id:'old-gap-fixture', userId:'student-alexey', skillId:'old-skill', description:'Historical unresolved mechanism', sourceLessonId:'M00-T01-U01', status:'needs-review', mandatoryNextCheck:true, createdAt:new Date().toISOString()});
    fs.writeFileSync(dbFile, JSON.stringify(disk));
    student = (await call('/api/db', 'student')).body;
    const u02 = student.lessons.find((l: any) => l.code === 'M01-T01-U02');
    const prompt2 = assembleLessonPrompt({lesson: u02, previousLessonId: 'M01-T01-U01', previousLessonReport: student.lessonAttempts[0].structuredReport, unresolvedGaps: student.knowledgeGaps, pendingHomework: student.homework});
    assert.equal(prompt2.carryoverHomeworkCount, 4);
    assert.equal(prompt2.carryoverRecheckCount, 4);
    assert.ok(prompt2.fullPromptText.includes('old-gap-fixture'));
    for (const item of demo.homework) assert.ok(prompt2.fullPromptText.includes(item.description));
    for (const id of ['Q02', 'Q05', 'Q06']) assert.ok(prompt2.fullPromptText.includes(id));
    const snap2 = await call('/api/snapshots', 'student', {lessonId: 'M01-T01-U02', prompt: prompt2.fullPromptText});
    const report2 = {...demo, lessonId: 'M01-T01-U02', schemaVersion: '1.1', homework: [1, 2, 3].map(n => ({id: `M01-T01-U02-HW0${n}`, title: `Synthetic task ${n}`, description: `Test condition ${n}`})), entryControl: {previousLessonId: 'M01-T01-U01', homeworkResults: [{homeworkId: 'M01-T01-U01-HW01', status: 'checked', feedback: 'Explained', errors: ['Minor error'], skillIds: ['skill-m01-t01-u01-01'], needsRevision: false}], recheckResults: [{sourceQuestionId: 'Q02', status: 'resolved', evidence: 'Explained with new example'}, {sourceQuestionId: 'Q05', status: 'persists', evidence: 'Incorrect'}, {sourceGapId: 'old-gap-fixture', sourceLessonId: 'M00-T01-U01', status: 'resolved', evidence: 'Explained old mechanism'}]}};
    assert.equal((await call('/api/reports', 'student', {lessonId: 'M01-T01-U02', snapshotId: snap2.body.id, rawText: JSON.stringify(report2)})).status, 200);
    student = (await call('/api/db', 'student')).body;
    assert.equal(student.homework.filter((h: any) => h.status === 'checked').length, 1);
    assert.equal(student.homework.filter((h: any) => h.lessonId === 'M01-T01-U01' && h.status === 'assigned').length, 3);
    assert.equal(student.homework.filter((h: any) => h.lessonId === 'M01-T01-U02' && h.status === 'assigned').length, 3);
    assert.equal(student.homework.find((h: any) => h.id === 'M01-T01-U01-HW01').reviewHistory[0].checkedLessonId, 'M01-T01-U02');
    assert.deepEqual(student.homework.find((h: any) => h.id === 'M01-T01-U01-HW01').reviewHistory[0].errors, ['Minor error']);
    assert.equal(student.knowledgeGaps.find((g: any) => g.id === 'old-gap-fixture').status, 'resolved');
    const oldGaps = student.knowledgeGaps.filter((g: any) => g.sourceLessonId === 'M01-T01-U01');
    assert.equal(oldGaps.find((g: any) => g.sourceQuestionId === 'Q02').status, 'resolved');
    assert.equal(oldGaps.find((g: any) => g.sourceQuestionId === 'Q05').status, 'needs-review');
    assert.equal(oldGaps.find((g: any) => g.sourceQuestionId === 'Q06').status, 'needs-review');
    assert.equal(student.lessonAttempts.find((a: any) => a.lessonId === 'M01-T01-U01').score, 12);
    assert.equal(student.lessonAttempts.find((a: any) => a.lessonId === 'M01-T01-U01').maxScore, 16);
    const other = await fetch(base + '/api/db', {headers: {Authorization: secondAuth}}).then(r => r.json());
    assert.equal(other.lessonAttempts.length, 0);
    assert.equal(other.homework.length, 0);
    assert.equal(other.knowledgeGaps.length, 0);
    const steal = await fetch(base + '/api/homework', {method: 'POST', headers: {Authorization: secondAuth, 'Content-Type': 'application/json', Origin: base}, body: JSON.stringify({id: 'M01-T01-U01-HW01', answer: 'unauthorized'})});
    assert.equal(steal.status, 400);
    assert.equal((await call('/api/mentor/users/update', 'mentor', {userId: createStudent.body.userId, active: false})).status, 200);
    assert.equal((await fetch(base + '/api/db', {headers: {Authorization: secondAuth}})).status, 401);

    assert.equal((await call('/api/mentor/homework', 'student', {homeworkId: 'M01-T01-U01-HW02', userId: 'student-alexey', status: 'verified', feedback: 'x'})).status, 403);
    assert.equal((await call('/api/mentor/homework', 'mentor', {homeworkId: 'M01-T01-U01-HW02', userId: 'student-alexey', status: 'needs_revision', feedback: 'Explain solution'})).status, 200);
    assert.equal((await call('/api/mentor/review', 'student', {attemptId: saved.body.id, score: 10, feedback: '', reason: 'attempt'})).status, 403);
    assert.equal((await call('/api/mentor/review', 'mentor', {attemptId: saved.body.id, score: 10, feedback: 'Reviewed', reason: 'Correction'})).status, 200);
    assert.equal((await call('/api/db', 'student')).body.lessonAttempts.find((a: any) => a.id === saved.body.id).score, 10);
    assert.ok((await call('/api/messages/inbox', 'student')).body.some((m: any) => m.content === 'Reviewed'));
    assert.ok((await call('/api/messages/inbox', 'student')).body.some((m: any) => m.content === 'Explain solution'));
    assert.equal((await call('/api/assessments', 'student', {targetId: 'M01-EX01', theory1Score: 10, theory2Score: 10, practicalScore: 10, answersNotes: 'report'})).status, 400);
    const admin = (await call('/api/db', 'mentor')).body;
    admin.exams.find((e: any) => e.id === 'M01-EX01').status = 'published';
    admin.exams.find((e: any) => e.id === 'M01-KR01').status = 'published';
    assert.equal((await call('/api/db', 'mentor', admin)).status, 200);
    assert.equal((await call('/api/db', 'mentor', admin)).status, 409);
    const control = await call('/api/assessments', 'student', {targetId: 'M01-KR01', theory1Score: 30, theory2Score: 30, practicalScore: 35, answersNotes: 'Control report'});
    assert.equal(control.status, 200);
    assert.ok((await call('/api/db', 'mentor')).body.notifications.some((n: any) => n.eventType === 'control_work' && n.relatedEntityId === control.body.id));

    for (let i = 0; i < 4; i++) assert.equal((await call('/api/assessments', 'student', {targetId: 'M01-EX01', theory1Score: 10, theory2Score: 10, practicalScore: 10, answersNotes: 'actual assessment report'})).status, 200);
    assert.equal((await call('/api/assessments', 'student', {targetId: 'M01-EX01', theory1Score: 30, theory2Score: 30, practicalScore: 40, answersNotes: 'fifth attempt'})).status, 403);
    const updatedAdmin = (await call('/api/db', 'mentor')).body;
    assert.equal(updatedAdmin.notifications.filter((n: any) => n.relatedEntityId && updatedAdmin.assessments.some((a: any) => a.id === n.relatedEntityId && a.targetId === 'M01-EX01') && !n.title.startsWith('Требуется третья пересдача')).length, 4);
    assert.ok(updatedAdmin.notifications.some((n: any) => n.title.startsWith('Требуется третья пересдача')));
    const assessmentId = updatedAdmin.assessments.find((a: any) => a.targetId === 'M01-EX01').id;
    assert.equal((await call('/api/mentor/retake', 'student', {userId: 'student-alexey', targetId: 'M01-EX01', reason: 'try'})).status, 403);
    assert.equal((await call('/api/mentor/retake', 'mentor', {userId: 'student-alexey', targetId: 'M01-EX01', reason: 'Mentor decision'})).status, 200);
    assert.equal((await call('/api/assessments', 'student', {targetId: 'M01-EX01', theory1Score: 30, theory2Score: 30, practicalScore: 40, answersNotes: 'additional report'})).status, 200);
    assert.equal((await call('/api/mentor/assessment', 'mentor', {assessmentId, status: 'mentor_confirmed', feedback: 'Reviewed'})).status, 200);
    assert.equal((await call('/api/db', 'student')).body.assessments.find((a: any) => a.id === assessmentId).verificationStatus, 'mentor_confirmed');
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      const exited = new Promise(resolve => server.once('exit', resolve));
      server.kill('SIGTERM');
      await exited;
    }
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
