/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage for Node environment
class MockLocalStorage {
  private store: Record<string, string> = {};
  getItem(key: string) {
    return this.store[key] || null;
  }
  setItem(key: string, value: string) {
    this.store[key] = String(value);
  }
  removeItem(key: string) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

(global as any).localStorage = new MockLocalStorage();

import {
  saveReportSubmission,
  getLessonAttemptsForUser,
  getKnowledgeGaps,
  confirmLessonAttemptByMentor,
  resetDatabaseToSeed,
  getAllUsers,
} from '../services/storage';
import { StructuredReport } from '../types';

test('Storage: Scenario I & J - Student Data Isolation and Persistence', () => {
  resetDatabaseToSeed();

  const reportStudentA: StructuredReport = {
    schemaVersion: '1.0',
    lessonId: 'M01-T01-U01',
    lessonStatus: 'completed',
    coveredTopics: ['Информация'],
    assessment: {
      maxScore: 100,
      earnedScore: 88,
      questions: [],
    },
    homework: [
      {
        id: 'HW01',
        title: 'Задание А',
        description: 'Текст задания',
      },
    ],
    knowledgeGaps: [
      {
        skillId: 'skill-diff',
        description: 'Пробел студента А',
        status: 'needs-review',
        mandatoryNextCheck: true,
      },
    ],
    strongSkills: [],
    nextLessonInstructions: {
      mandatoryRechecks: [],
      homeworkChecks: [],
      additionalChecks: [],
    },
  };

  // Student A submits report
  const attA = saveReportSubmission({
    userId: 'student-alexey',
    lessonId: 'M01-T01-U01',
    report: reportStudentA,
    rawText: JSON.stringify(reportStudentA),
    promptSnapshot: 'prompt snapshot',
  });

  assert.ok(attA.id);
  assert.equal(attA.score, 88);
  assert.equal(attA.mentorConfirmed, false);

  // Scenario J: Student B tries to retrieve attempts -> Must receive empty list!
  const attemptsStudentB = getLessonAttemptsForUser('student-boris');
  assert.equal(attemptsStudentB.length, 0);

  // Scenario J: Student B tries to retrieve gaps -> Must receive empty list!
  const gapsStudentB = getKnowledgeGaps('student-boris');
  assert.equal(gapsStudentB.length, 0);

  // Student A gets their own attempt
  const attemptsStudentA = getLessonAttemptsForUser('student-alexey');
  assert.equal(attemptsStudentA.length, 1);
  assert.equal(attemptsStudentA[0].id, attA.id);

  // Scenario K: Admin reviews and confirms attempt
  const adminUser = getAllUsers().find((u) => u.role === 'admin')!;
  assert.ok(adminUser);
  confirmLessonAttemptByMentor(attA.id, adminUser, 90, 'Отличная работа!', 'Подтверждено наставником');

  // Verify attempt is now mentor_confirmed with updated score
  const updatedAttemptsA = getLessonAttemptsForUser('student-alexey');
  assert.equal(updatedAttemptsA[0].mentorConfirmed, true);
  assert.equal(updatedAttemptsA[0].score, 90);
  assert.equal(updatedAttemptsA[0].mentorFeedback, 'Отличная работа!');
});
