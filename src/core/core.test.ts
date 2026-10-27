/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyScore, MAX_RETAKES_ALLOWED } from './gradingEngine';
import { validateStructuredReport, extractJsonFromText } from './reportValidator';
import { assembleLessonPrompt } from './promptEngine';
import { LessonItem, StructuredReport } from '../types';

test('Grading Engine: Scenario Q - exact threshold classification', () => {
  // Below 50% -> not_passed
  const res49 = classifyScore(49, 100);
  assert.equal(res49.grade, 'not_passed');
  assert.equal(res49.isPassing, false);
  assert.equal(res49.gradeLabelRu, 'Не зачтено');

  // Exactly 50% -> passed
  const res50 = classifyScore(50, 100);
  assert.equal(res50.grade, 'passed');
  assert.equal(res50.isPassing, true);
  assert.equal(res50.gradeLabelRu, 'Зачтено');

  // Exactly 69.9% -> passed
  const res69 = classifyScore(69.9, 100);
  assert.equal(res69.grade, 'passed');

  // Exactly 70% -> good
  const res70 = classifyScore(70, 100);
  assert.equal(res70.grade, 'good');
  assert.equal(res70.gradeLabelRu, 'Хорошо');

  // Exactly 80% -> excellent
  const res80 = classifyScore(80, 100);
  assert.equal(res80.grade, 'excellent');
  assert.equal(res80.gradeLabelRu, 'Отлично');

  // 100% -> excellent
  const res100 = classifyScore(100, 100);
  assert.equal(res100.grade, 'excellent');
});

test('Grading Engine: Scenario R - Retake tracking and 3-retake intervention limit', () => {
  // Attempt 1 (Initial failure) -> Retake #1 available
  const att1 = classifyScore(40, 100, 1);
  assert.equal(att1.canRetake, true);
  assert.equal(att1.requiresIntervention, false);

  // Attempt 2 (First retake failure) -> Retake #2 available
  const att2 = classifyScore(45, 100, 2);
  assert.equal(att2.canRetake, true);
  assert.equal(att2.requiresIntervention, false);

  // Attempt 3 (Second retake failure) -> Retake #3 available
  const att3 = classifyScore(48, 100, 3);
  assert.equal(att3.canRetake, true);
  assert.equal(att3.requiresIntervention, false);

  // Attempt 4 (Third retake failure, retakesUsed = 3) -> requires mentor intervention!
  const att4 = classifyScore(45, 100, 4);
  assert.equal(att4.canRetake, false);
  assert.equal(att4.requiresIntervention, true);
  assert.match(att4.messageRu, /Исчерпан лимит из 3 пересдач/);
});

test('Report Validator: Scenario E & F - validates clean JSON, markdown fences and rejects errors', () => {
  const sampleJson = {
    schemaVersion: '1.0',
    lessonId: 'M01-T01-U01',
    lessonStatus: 'completed',
    coveredTopics: ['Информация', 'Данные', 'Сообщение'],
    assessment: {
      maxScore: 100,
      earnedScore: 80,
      questions: [
        {
          questionId: 'Q01',
          skillIds: ['skill-info'],
          result: 'incorrect',
          feedback: 'Различие информации и данных',
          needsRecheck: true,
        },
      ],
    },
    homework: [
      {
        id: 'HW01',
        title: 'Анализ сообщения',
        description: 'Рассчитать энтропию дискретного источника',
      },
    ],
    knowledgeGaps: [
      {
        skillId: 'skill-info',
        description: 'Различие информации и данных',
        status: 'needs-review',
        mandatoryNextCheck: true,
      },
    ],
    strongSkills: [
      {
        skillId: 'skill-message',
        description: 'Понятие сообщения',
      },
    ],
    nextLessonInstructions: {
      mandatoryRechecks: ['Проверить определение информации'],
      homeworkChecks: ['Проверить ДЗ HW01'],
      additionalChecks: [],
    },
    studentNotes: '<script>alert("xss")</script>Все понятно',
  };

  // Valid plain JSON
  const outcome1 = validateStructuredReport(JSON.stringify(sampleJson), 'M01-T01-U01');
  assert.equal(outcome1.valid, true);
  if (outcome1.valid) {
    assert.equal(outcome1.report.assessment.earnedScore, 80);
    assert.equal(outcome1.report.homework.length, 1);
    // Verifies XSS is stripped
    assert.doesNotMatch(outcome1.report.studentNotes || '', /<script>/);
  }

  // Valid markdown-wrapped JSON
  const wrappedJson = 'Вот мой отчет:\n```json\n' + JSON.stringify(sampleJson, null, 2) + '\n```\nСпасибо!';
  const outcome2 = validateStructuredReport(wrappedJson, 'M01-T01-U01');
  assert.equal(outcome2.valid, true);

  // Invalid JSON (Scenario F)
  const brokenJson = '{ schemaVersion: 1.0, broken... }';
  const outcomeBroken = validateStructuredReport(brokenJson, 'M01-T01-U01');
  assert.equal(outcomeBroken.valid, false);
  if (!outcomeBroken.valid) {
    assert.ok(outcomeBroken.errors.length > 0);
  }

  // Mismatched lessonId
  const outcomeMismatch = validateStructuredReport(JSON.stringify(sampleJson), 'M01-T01-U02');
  assert.equal(outcomeMismatch.valid, false);
  if (!outcomeMismatch.valid) {
    assert.match(outcomeMismatch.errors.join(' '), /не совпадает с текущим уроком/);
  }

  // Earned score exceeding maxScore
  const invalidScoreJson = { ...sampleJson, assessment: { maxScore: 50, earnedScore: 80, questions: [] } };
  const outcomeOverScore = validateStructuredReport(JSON.stringify(invalidScoreJson));
  assert.equal(outcomeOverScore.valid, false);
  if (!outcomeOverScore.valid) {
    assert.match(outcomeOverScore.errors.join(' '), /не может превышать/);
  }
});

test('Prompt Assembly: Scenario G & H - Carryover engine preserves all mandatory rechecks and homework', () => {
  const lesson1: LessonItem = {
    id: 'M01-T01-U01',
    moduleId: 'M01',
    topicId: 'M01-T01',
    code: 'M01-T01-U01',
    order: 1,
    title: 'Информация, данные и сообщения',
    durationEstimateMinutes: 45,
    prerequisites: [],
    objectives: ['Освоить различие информации и данных'],
    relatedSkillIds: ['skill-info-basics'],
    status: 'published',
    version: '1.0',
    promptTemplate: 'Теоретический блок 1...',
    moduleInstructions: 'Инструкция модуля 1',
    generalRules: 'Общие правила курса',
  };

  // Scenario 1: First lesson has no carryover block
  const prompt1 = assembleLessonPrompt({ lesson: lesson1 });
  assert.equal(prompt1.hasCarryover, false);
  assert.doesNotMatch(prompt1.fullPromptText, /БЛОК ПРЕЕМСТВЕННОСТИ/);

  // Scenario 2: Second lesson (M01-T01-U02) with 3 mandatory rechecks and 1 homework
  const lesson2: LessonItem = {
    ...lesson1,
    id: 'M01-T01-U02',
    code: 'M01-T01-U02',
    title: 'Источники информации и энтропия',
  };

  const prevReport: StructuredReport = {
    schemaVersion: '1.0',
    lessonId: 'M01-T01-U01',
    lessonStatus: 'completed',
    coveredTopics: ['Информация'],
    assessment: {
      maxScore: 100,
      earnedScore: 75,
      questions: [
        {
          questionId: 'Q01',
          skillIds: ['skill-info-basics'],
          result: 'incorrect',
          feedback: 'Ошибка в понятии непрерывного сигнала',
          needsRecheck: true,
        },
      ],
    },
    homework: [
      {
        id: 'HW01',
        title: 'Разбор SMS протокола',
        description: 'Выделить информационный объем PDU',
      },
    ],
    knowledgeGaps: [
      {
        skillId: 'skill-diff',
        description: 'Различие данных и информации',
        status: 'needs-review',
        mandatoryNextCheck: true,
      },
    ],
    strongSkills: [],
    nextLessonInstructions: {
      mandatoryRechecks: [
        'Повторить определение Шенноновской энтропии',
        'Проверить различие информации и данных',
        'Проверить формулу Хартли',
      ],
      homeworkChecks: ['Проверить домашнее задание HW01'],
      additionalChecks: [],
    },
  };

  const prompt2 = assembleLessonPrompt({
    lesson: lesson2,
    previousLessonReport: prevReport,
    previousLessonId: 'M01-T01-U01',
    pendingHomework: [
      {
        id: 'HW01',
        lessonId: 'M01-T01-U01',
        title: 'Разбор SMS протокола',
        description: 'Выделить информационный объем PDU',
      },
    ],
  });

  // Verify carryover block exists
  assert.equal(prompt2.hasCarryover, true);
  assert.match(prompt2.fullPromptText, /БЛОК ПРЕЕМСТВЕННОСТИ/);

  // Scenario G check: ALL 3 mandatory rechecks exist in the assembled prompt (Zero loss of errors!)
  assert.match(prompt2.fullPromptText, /Повторить определение Шенноновской энтропии/);
  assert.match(prompt2.fullPromptText, /Проверить различие информации и данных/);
  assert.match(prompt2.fullPromptText, /Проверить формулу Хартли/);
  assert.match(prompt2.fullPromptText, /Ошибка в Q01: Ошибка в понятии непрерывного сигнала/);

  // Scenario H check: Homework transfer check
  assert.match(prompt2.fullPromptText, /Разбор SMS протокола/);
});


// Storage and User Isolation Tests (Scenarios I, J, K)
test('Storage: Scenario I & J - Student Data Isolation, Attempts, and Admin Review', async () => {
  // Mock localStorage for Node test runner
  class MockStore {
    private map: Record<string, string> = {};
    getItem(k: string) { return this.map[k] || null; }
    setItem(k: string, v: string) { this.map[k] = String(v); }
    removeItem(k: string) { delete this.map[k]; }
    clear() { this.map = {}; }
  }
  (globalThis as any).localStorage = new MockStore();

  const {
    resetDatabaseToSeed,
    saveReportSubmission,
    getLessonAttemptsForUser,
    getKnowledgeGaps,
    confirmLessonAttemptByMentor,
    getAllUsers,
  } = await import('../services/storage');

  resetDatabaseToSeed();

  const sampleReport: StructuredReport = {
    schemaVersion: '1.0',
    lessonId: 'M01-T01-U01',
    lessonStatus: 'completed',
    coveredTopics: ['Информация'],
    assessment: { maxScore: 100, earnedScore: 82, questions: [] },
    homework: [{ id: 'HW01', title: 'ДЗ 1', description: 'Описание' }],
    knowledgeGaps: [{ skillId: 's1', description: 'Пробел А', status: 'needs-review', mandatoryNextCheck: true }],
    strongSkills: [],
    nextLessonInstructions: { mandatoryRechecks: [], homeworkChecks: [], additionalChecks: [] },
  };

  // Student A submits
  const attA = saveReportSubmission({
    userId: 'student-alexey',
    lessonId: 'M01-T01-U01',
    report: sampleReport,
    rawText: JSON.stringify(sampleReport),
    promptSnapshot: 'snapshot',
  });

  assert.ok(attA.id);
  assert.equal(attA.score, 82);

  // Student B isolation check
  const bAttempts = getLessonAttemptsForUser('student-boris');
  assert.equal(bAttempts.length, 0);

  const bGaps = getKnowledgeGaps('student-boris');
  assert.equal(bGaps.length, 0);

  // Student A gets own attempts
  const aAttempts = getLessonAttemptsForUser('student-alexey');
  assert.equal(aAttempts.length, 1);

  // Scenario K: Admin confirms
  const admin = getAllUsers().find((u) => u.role === 'admin')!;
  confirmLessonAttemptByMentor(attA.id, admin, 90, 'Отлично', 'Проверено');

  const aAttemptsUpdated = getLessonAttemptsForUser('student-alexey');
  assert.equal(aAttemptsUpdated[0].mentorConfirmed, true);
  assert.equal(aAttemptsUpdated[0].score, 90);
});
