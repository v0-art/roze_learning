import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyScore } from './gradingEngine';
import { validateStructuredReport } from './reportValidator';
import { assembleLessonPrompt } from './promptEngine';

const demo = JSON.parse(fs.readFileSync('public/assets/aistudio/NEXUS_M01_T01_U01_DEMO_report_e461a5fb.json', 'utf8'));
const data = JSON.parse(fs.readFileSync('data/nexus_academy.json', 'utf8'));

test('AT-01: draft lessons require separate publication', () => {
  assert.equal(data.modules.length, 18);
  assert.equal(data.topics.length, 8);
  assert.ok(data.lessons.every((lesson: any) => ['draft', 'published', 'archived'].includes(lesson.status)));
  assert.ok(data.lessons.some((lesson: any) => lesson.status === 'draft')); // Current publication decisions belong to the mentor.
});

test('AT-20: classify scores before rounding', () => {
  assert.equal(classifyScore(49.99, 100).grade, 'not_passed');
  assert.equal(classifyScore(50, 100).grade, 'passed');
  assert.equal(classifyScore(70, 100).grade, 'good');
  assert.equal(classifyScore(80, 100).grade, 'excellent');
});

test('AT-10/11: U02 retains four assignments, three errors and additional checks', () => {
  const outcome = validateStructuredReport(JSON.stringify(demo), 'M01-T01-U01');
  assert.ok(outcome.valid);
  const lesson = data.lessons.find((l: any) => l.code === 'M01-T01-U02');
  const result = assembleLessonPrompt({lesson, previousLessonId: 'M01-T01-U01', previousLessonReport: outcome.report});
  assert.equal(result.carryoverHomeworkCount, 4);
  assert.equal(result.carryoverRecheckCount, 3);
  for (const hw of demo.homework) assert.ok(result.fullPromptText.includes(hw.description));
  for (const check of demo.nextLessonInstructions.additionalChecks) assert.ok(result.fullPromptText.includes(check));
});

test('AT-14/16: v1.1 keeps actual entry results while v1.0 invents none', () => {
  const report = {...demo, schemaVersion: '1.1', entryControl: {previousLessonId: 'M01-T01-U01', homeworkResults: [{homeworkId: 'M01-T01-U01-HW01', status: 'checked', feedback: 'Объяснение представлено'}], recheckResults: [{sourceQuestionId: 'Q05', status: 'persists', evidence: 'Ответ неверный'}]}};
  const parsed = validateStructuredReport(JSON.stringify(report), 'M01-T01-U01');
  assert.ok(parsed.valid);
  if (parsed.valid) assert.equal(parsed.report.entryControl?.homeworkResults[0].status, 'checked');
  const old = validateStructuredReport(JSON.stringify(demo), 'M01-T01-U01');
  if (old.valid) assert.equal(old.report.entryControl, undefined);
});


test('U01 rejects missing questions, inconsistent score and lost rechecks', () => {
  const report = structuredClone(demo);
  report.assessment.earnedScore = 13;
  assert.equal(validateStructuredReport(JSON.stringify(report), 'M01-T01-U01').valid, false);
  report.assessment.earnedScore = 12;
  report.assessment.questions.pop();
  assert.equal(validateStructuredReport(JSON.stringify(report), 'M01-T01-U01').valid, false);
  const missingRecheck = structuredClone(demo);
  missingRecheck.nextLessonInstructions.mandatoryRechecks = missingRecheck.nextLessonInstructions.mandatoryRechecks.filter((r: string) => !r.includes('Q05'));
  assert.equal(validateStructuredReport(JSON.stringify(missingRecheck), 'M01-T01-U01').valid, false);
});

test('first lesson preserves official prompt and does not invent a past or 85/100', () => {
  const lesson = data.lessons.find((l: any) => l.code === 'M01-T01-U01');
  const result = assembleLessonPrompt({lesson});
  assert.equal(result.hasCarryover, false);
  assert.ok(result.fullPromptText.includes(lesson.promptTemplate));
  assert.doesNotMatch(result.fullPromptText, /"earnedScore": 85/);
  assert.match(result.fullPromptText, /0, 1 или 2 балла/);
});


test('the synthetic U01 fixture has 12 of 16, five correct and three rechecks', () => {
  const outcome = validateStructuredReport(JSON.stringify(demo), 'M01-T01-U01');
  assert.ok(outcome.valid);
  assert.equal(outcome.report.assessment.earnedScore, 12);
  assert.equal(outcome.report.assessment.maxScore, 16);
  assert.equal(outcome.report.assessment.questions.filter(q => q.result === 'correct').length, 5);
  assert.equal(outcome.report.assessment.questions.filter(q => q.result === 'partial').length, 2);
  assert.equal(outcome.report.assessment.questions.filter(q => q.result === 'incorrect').length, 1);
  assert.equal(outcome.report.homework.length, 4);
});
