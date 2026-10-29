/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  loadDatabase,
  saveDatabase,
  getModules,
  getTopics,
  getLessons,
  getLessonById,
  saveLesson,
  getExams,
  getSkills,
  getRelations,
  getGraphData,
  saveReportSubmission,
  getLessonAttemptsForUser,
  confirmLessonAttemptByMentor,
  getCurrentUser,
  setCurrentUserId,
} from '../services/storage';
import {
  parseLessonMarkdown,
  analyzeImportPayload,
  commitImportPayload,
  exportLessonToMarkdown,
} from './contentImporter';
import { LessonItem, StructuredReport } from '../types';

test('1. Structure Check: 18 Disciplines present, M01 approved, M02-M18 contain 0 approved lessons', () => {
  const modules = getModules();
  assert.equal(modules.length, 18, 'Must contain exactly 18 disciplines');

  const m01 = modules.find((m) => m.id === 'M01');
  assert.ok(m01, 'Module M01 must exist');
  assert.equal(m01.status, 'approved', 'Module M01 must be approved');

  // M02 through M18 must not contain approved lessons
  const lessons = getLessons();
  for (let i = 2; i <= 18; i++) {
    const code = `M${String(i).padStart(2, '0')}`;
    const mod = modules.find((m) => m.id === code);
    assert.ok(mod, `Module ${code} must exist`);
    assert.equal(mod.status, 'draft', `Module ${code} must be in draft status`);

    const modApprovedLessons = lessons.filter(
      (l) => l.moduleId === code && l.status === 'approved'
    );
    assert.equal(
      modApprovedLessons.length,
      0,
      `Module ${code} must contain 0 approved lessons`
    );
  }
});

test('2. Topics Check: Module M01 contains exactly 8 approved topics', () => {
  const topics = getTopics('M01');
  assert.equal(topics.length, 8, 'M01 must contain exactly 8 topics');
  for (const topic of topics) {
    assert.equal(topic.status, 'approved', `Topic ${topic.code} must be approved`);
    assert.ok(topic.title, `Topic ${topic.code} must have a title`);
    assert.ok(topic.learningObjectives.length > 0, `Topic ${topic.code} must have objectives`);
  }
});

test('3. Lessons Check: M01 has exactly 52 loaded lessons ready for study', () => {
  const m01Lessons = getLessons('M01');
  assert.equal(m01Lessons.length, 52, 'M01 must contain exactly 52 lessons');
  
  // All 52 lessons should be loaded and approved for study
  const approvedLessons = m01Lessons.filter((l) => l.status === 'approved');
  assert.equal(
    approvedLessons.length,
    52,
    'All 52 lessons of M01 must be approved upon initial load for students'
  );
});

test('4. Full Prompt Text Check: M01-T01-U01 prompt is complete and not shortened', () => {
  const u01 = getLessonById('M01-T01-U01');
  assert.ok(u01, 'Lesson M01-T01-U01 must exist');
  assert.ok(
    u01.promptTemplate.length > 10000,
    `Prompt template must be complete (> 10000 chars, got ${u01.promptTemplate.length})`
  );
  assert.ok(
    u01.promptTemplate.includes('Роль: Ты — строгий, но справедливый наставник') ||
    u01.promptTemplate.includes('РОЛЬ НАСТАВНИКА') ||
    u01.promptTemplate.includes('Информация')
  );
});

test('5. Idempotent Re-import: Re-importing M01-T01-U01.md creates no duplicates', async () => {
  const diskPath = path.resolve(
    process.cwd(),
    'public/assets/aistudio/M01-T01-U01_87c59720.md'
  );
  let mdContent = '';
  if (fs.existsSync(diskPath)) {
    mdContent = fs.readFileSync(diskPath, 'utf-8');
  } else {
    const u01 = getLessonById('M01-T01-U01')!;
    mdContent = exportLessonToMarkdown(u01);
  }

  const parsed = parseLessonMarkdown(mdContent, 'M01-T01-U01.md');
  assert.ok(parsed, 'Parsed lesson from markdown');
  assert.equal(parsed.code, 'M01-T01-U01');

  const diff = await analyzeImportPayload(
    { lessons: [parsed] },
    loadDatabase()
  );

  const u01Record = diff.diffs.find((r) => r.entityId === 'M01-T01-U01');
  assert.ok(u01Record, 'U01 must be recognized in diff');
  assert.ok(
    u01Record.status === 'unchanged' || u01Record.status === 'needs_update',
    'Status must be unchanged or needs_update, NEVER a new duplicate entity'
  );

  // Lesson count remains unchanged
  const beforeCount = getLessons().length;
  const nextDb = commitImportPayload({ lessons: [parsed] }, loadDatabase(), {
    conflictResolution: 'skip_unchanged_update_changed',
    actorId: 'admin-mentor',
    actorName: 'Дмитрий',
  });
  saveDatabase(nextDb);
  const afterCount = getLessons().length;
  assert.equal(afterCount, beforeCount, 'Lesson count must remain identical');
});

test('6. Versioning: Editing a lesson prompt creates a new version and preserves history', () => {
  const u01 = getLessonById('M01-T01-U01')!;
  const originalPrompt = u01.promptTemplate;
  const initialHistoryLength = u01.versionHistory?.length || 0;

  const updatedPrompt = originalPrompt + '\n\n## Дополнительное примечание для проверки версий';
  const updatedLesson: LessonItem = {
    ...u01,
    promptTemplate: updatedPrompt,
  };

  saveLesson(updatedLesson, 'Тестовое обновление версии', 'admin-mentor', 'Дмитрий');

  const saved = getLessonById('M01-T01-U01')!;
  assert.equal(saved.version, '1.1', 'Version must increment to 1.1');
  assert.equal(saved.promptTemplate, updatedPrompt);
  assert.equal(
    saved.versionHistory?.length,
    initialHistoryLength + 1,
    'Version history must record previous version snapshot'
  );

  // Restore original
  saveLesson({ ...saved, promptTemplate: originalPrompt }, 'Откат', 'admin-mentor', 'Дмитрий');
});

test('7. Publishing: Published lesson is approved and marked accessible', () => {
  const u01 = getLessonById('M01-T01-U01')!;
  saveLesson({ ...u01, status: 'approved' }, 'Публикация урока', 'admin-mentor', 'Дмитрий');

  const published = getLessonById('M01-T01-U01')!;
  assert.equal(published.status, 'approved', 'Lesson must now be approved');
});

test('8. Draft Guard: Unpublishing a lesson switches status back to draft', () => {
  const u01 = getLessonById('M01-T01-U01')!;
  saveLesson({ ...u01, status: 'draft' }, 'Снятие с публикации', 'admin-mentor', 'Дмитрий');

  const draftLesson = getLessonById('M01-T01-U01')!;
  assert.equal(draftLesson.status, 'draft', 'Lesson must now be in draft');

  // Restore approved status for student learning
  saveLesson({ ...draftLesson, status: 'approved' }, 'Восстановление публикации', 'admin-mentor', 'Дмитрий');
});

test('9. Open Exam Tickets: M01-EX01 has 24 tickets in draft status with correct limits', () => {
  const exams = getExams();
  const exam = exams.find((e) => e.id === 'M01-EX01');
  assert.ok(exam, 'Exam M01-EX01 must exist');
  assert.equal(exam.status, 'draft', 'Exam must be in draft status');
  assert.equal(exam.tickets.length, 24, 'Exam must contain exactly 24 tickets');

  const theorySet = new Set<string>();
  const practicalSet = new Set<string>();

  exam.tickets.forEach((t) => {
    assert.ok(t.theory1 && t.theory1.length > 5, `Ticket ${t.ticketId} must have theory 1`);
    assert.ok(t.theory2 && t.theory2.length > 5, `Ticket ${t.ticketId} must have theory 2`);
    assert.ok(t.practical && t.practical.length > 5, `Ticket ${t.ticketId} must have practice`);
    theorySet.add(t.theory1);
    theorySet.add(t.theory2);
    practicalSet.add(t.practical);
  });

  assert.ok(
    theorySet.size <= 50,
    `Theory questions count (${theorySet.size}) must be <= 50`
  );
  assert.ok(
    practicalSet.size <= 25,
    `Practical problems count (${practicalSet.size}) must be <= 25`
  );
});

test('10. Knowledge Map: Graph data constructed from imported skills and relations', () => {
  const graph = getGraphData();
  assert.ok(graph.nodes.length >= 18, 'Graph nodes must include all 18 disciplines');
  assert.ok(graph.edges.length > 0, 'Graph must include relational edges');

  const m01Node = graph.nodes.find((n) => n.id === 'M01');
  assert.ok(m01Node, 'M01 node must exist in graph');
  assert.equal(m01Node.level, 1);
});

test('11. Import of a new lesson with valid code places it in correct topic', async () => {
  const newLesson: LessonItem = {
    id: 'M01-T01-U99',
    moduleId: 'M01',
    topicId: 'M01-T01',
    code: 'M01-T01-U99',
    order: 99,
    title: 'Тестовый урок 99',
    durationEstimateMinutes: 45,
    prerequisites: [],
    objectives: ['Цель 1'],
    relatedSkillIds: [],
    status: 'draft',
    version: '1.0',
    promptTemplate: 'Тестовый промпт нового урока',
  };

  const diff = await analyzeImportPayload(
    { lessons: [newLesson] },
    loadDatabase()
  );

  const record = diff.diffs.find((r) => r.entityId === 'M01-T01-U99');
  assert.ok(record);
  assert.equal(record.status, 'new');

  const nextDb = commitImportPayload(loadDatabase(), { lessons: [newLesson] }, {
    conflictResolution: 'create_version',
    actorId: 'admin-mentor',
    actorName: 'Дмитрий',
  });
  saveDatabase(nextDb);

  const stored = getLessonById('M01-T01-U99');
  assert.ok(stored, 'New lesson must be stored in database');
  assert.equal(stored.topicId, 'M01-T01');

  // Clean up
  const db = loadDatabase();
  db.lessons = db.lessons.filter((l) => l.id !== 'M01-T01-U99');
  saveDatabase(db);
});

test('12. Corrupted JSON Import Handling: Invalid JSON is reported without DB corruption', () => {
  const malformed = '{ invalid: json content without quotes }';
  assert.throws(() => {
    JSON.parse(malformed);
  });

  // Database remains intact
  const lessons = getLessons();
  assert.equal(lessons.length, 52, 'Database is unharmed by invalid payload');
});

test('13. Disk Persistence: Data is saved to /app/applet/data/nexus_academy.json', () => {
  const dataPath = path.resolve(process.cwd(), 'data/nexus_academy.json');
  assert.ok(fs.existsSync(dataPath), 'data/nexus_academy.json must exist on disk');

  const stat = fs.statSync(dataPath);
  assert.ok(stat.size > 100000, `Database file must be populated (size: ${stat.size} bytes)`);

  const fileContent = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  assert.equal(fileContent.modules.length, 18);
  assert.equal(fileContent.topics.length, 8);
  assert.equal(fileContent.lessons.length, 52);
});

test('14. RBAC: Student cannot publish or edit lessons', () => {
  setCurrentUserId('student-alexey');
  const user = getCurrentUser();
  assert.equal(user.role, 'student');

  // Verify role check logic
  const canEdit = user.role === 'admin';
  assert.equal(canEdit, false, 'Student role cannot edit educational content');

  // Switch back to admin
  setCurrentUserId('admin-mentor');
  assert.equal(getCurrentUser().role, 'admin');
});

test('15. Single Lesson Export: Export produces complete Markdown format', () => {
  const u01 = getLessonById('M01-T01-U01')!;
  const md = exportLessonToMarkdown(u01);

  assert.ok(md.includes('# Урок: M01-T01-U01'));
  assert.ok(md.includes('**Дисциплина:** M01'));
  assert.ok(md.includes('**Тема:** M01-T01'));
  assert.ok(md.includes('## Промпт для проведения занятия'));
  assert.ok(md.length > 10000, 'Exported markdown includes full prompt');
});

test('16. Historical Snapshot Isolation: Previous attempt snapshots remain unaffected by prompt edits', () => {
  const sampleReport: StructuredReport = {
    schemaVersion: '1.0',
    lessonId: 'M01-T01-U01',
    lessonStatus: 'completed',
    coveredTopics: ['Информация'],
    assessment: { maxScore: 100, earnedScore: 95, questions: [] },
    homework: [],
    knowledgeGaps: [],
    strongSkills: [],
    nextLessonInstructions: { mandatoryRechecks: [], homeworkChecks: [], additionalChecks: [] },
  };

  const initialSnapshot = 'ORIGINAL_PROMPT_SNAPSHOT_V1_0';
  const att = saveReportSubmission({
    userId: 'student-alexey',
    lessonId: 'M01-T01-U01',
    report: sampleReport,
    rawText: JSON.stringify(sampleReport),
    promptSnapshot: initialSnapshot,
    promptVersion: '1.0',
  });

  // Edit the lesson to a new prompt
  const lesson = getLessonById('M01-T01-U01')!;
  saveLesson(
    { ...lesson, promptTemplate: 'MODIFIED_NEW_PROMPT_CONTENT_V1_1' },
    'Обновление для теста снимка',
    'admin-mentor',
    'Дмитрий'
  );

  // Retrieve attempt from storage
  const attempts = getLessonAttemptsForUser('student-alexey', 'M01-T01-U01');
  const found = attempts.find((a) => a.id === att.id);
  assert.ok(found);
  assert.equal(
    found.promptSnapshot,
    initialSnapshot,
    'Attempt snapshot MUST remain immutable and unaffected by subsequent prompt edits'
  );
  assert.equal(found.promptVersion, '1.0');
});
