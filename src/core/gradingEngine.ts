/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GradeClassification } from '../types';

export interface GradeResult {
  score: number;
  maxScore: number;
  percentage: number;
  grade: GradeClassification;
  gradeLabelRu: string;
  isPassing: boolean;
  canRetake: boolean;
  requiresIntervention: boolean;
  messageRu: string;
}

export const MAX_RETAKES_ALLOWED = 3;

/**
 * Classifies an assessment score according to the official NEXUS Academy rules:
 * - Below 50% — Не зачтено
 * - 50% to below 70% — Зачтено (inclusive of 50)
 * - 70% to below 80% — Хорошо (inclusive of 70)
 * - 80% to 100% — Отлично (inclusive of 80)
 */
export function classifyScore(score: number, maxScore: number, attemptNumber: number = 1): GradeResult {
  if (maxScore <= 0) {
    throw new Error('Максимальный балл должен быть строго больше 0');
  }
  const safeScore = Math.max(0, Math.min(score, maxScore));
  const percentage = Math.round((safeScore / maxScore) * 1000) / 10; // 1 decimal place

  let grade: GradeClassification;
  let gradeLabelRu: string;
  let isPassing = false;

  if (percentage < 50) {
    grade = 'not_passed';
    gradeLabelRu = 'Не зачтено';
    isPassing = false;
  } else if (percentage < 70) {
    grade = 'passed';
    gradeLabelRu = 'Зачтено';
    isPassing = true;
  } else if (percentage < 80) {
    grade = 'good';
    gradeLabelRu = 'Хорошо';
    isPassing = true;
  } else {
    grade = 'excellent';
    gradeLabelRu = 'Отлично';
    isPassing = true;
  }

  // Attempt 1 is original; attempts 2, 3, 4 are retakes 1, 2, 3
  const retakesUsed = Math.max(0, attemptNumber - 1);
  const reachedRetakeLimit = retakesUsed >= MAX_RETAKES_ALLOWED;
  const requiresIntervention = !isPassing && reachedRetakeLimit;
  const canRetake = !isPassing && !reachedRetakeLimit;

  let messageRu = '';
  if (isPassing) {
    messageRu = `Аттестация успешно пройдена с результатом ${percentage}% (${gradeLabelRu}).`;
  } else if (requiresIntervention) {
    messageRu = `Исчерпан лимит из ${MAX_RETAKES_ALLOWED} пересдач (попытка №${attemptNumber}). Требуется согласование с главным ментором.`;
  } else {
    messageRu = `Результат ${percentage}% ниже проходного порога (50%). Доступно пересдач: ${MAX_RETAKES_ALLOWED - retakesUsed}.`;
  }

  return {
    score: safeScore,
    maxScore,
    percentage,
    grade,
    gradeLabelRu,
    isPassing,
    canRetake,
    requiresIntervention,
    messageRu,
  };
}
