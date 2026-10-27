/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StructuredReport } from '../types';

export interface ValidationSuccess {
  valid: true;
  report: StructuredReport;
  rawText: string;
  source: 'parsed_json' | 'markdown_fence' | 'manual_fallback';
}

export interface ValidationFailure {
  valid: false;
  errors: string[];
  rawText: string;
}

export type ValidationOutcome = ValidationSuccess | ValidationFailure;

/**
 * Sanitizes plain string to prevent XSS and strip executable tags
 */
export function sanitizeString(input: unknown, maxLength: number = 2000): string {
  if (typeof input !== 'string') return '';
  const sanitized = input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/[<>]/g, (char) => (char === '<' ? '&lt;' : '&gt;'))
    .trim();
  return sanitized.slice(0, maxLength);
}

/**
 * Strips Markdown code block wrapping if student copied ```json ... ```
 */
export function extractJsonFromText(rawText: string): string {
  const trimmed = rawText.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}

/**
 * Strictly validates a structured lesson report matching the NEXUS Academy protocol
 */
export function validateStructuredReport(
  rawInput: string,
  expectedLessonId?: string
): ValidationOutcome {
  const errors: string[] = [];
  if (!rawInput || typeof rawInput !== 'string' || rawInput.trim().length === 0) {
    return {
      valid: false,
      errors: ['Входные данные пусты. Вставьте JSON-отчёт или результат занятия.'],
      rawText: rawInput || '',
    };
  }

  const cleanedJson = extractJsonFromText(rawInput);
  let parsed: any;
  try {
    parsed = JSON.parse(cleanedJson);
  } catch (err: any) {
    return {
      valid: false,
      errors: [
        'Не удалось разобрать JSON. Убедитесь, что отчёт скопирован целиком и содержит валидный синтаксис JSON.',
        `Ошибка парсинга: ${err?.message || 'Неверный формат'}`,
      ],
      rawText: rawInput,
    };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      valid: false,
      errors: ['Корневой элемент отчёта должен быть объектом JSON.'],
      rawText: rawInput,
    };
  }

  // Schema version check
  if (!parsed.schemaVersion || typeof parsed.schemaVersion !== 'string') {
    errors.push('Поле "schemaVersion" обязательно (ожидается "1.0").');
  } else if (parsed.schemaVersion !== '1.0') {
    errors.push(`Неподдерживаемая версия схемы: "${parsed.schemaVersion}". Поддерживается: "1.0".`);
  }

  // Lesson ID check
  if (!parsed.lessonId || typeof parsed.lessonId !== 'string') {
    errors.push('Поле "lessonId" обязательно.');
  } else if (expectedLessonId && parsed.lessonId.trim().toUpperCase() !== expectedLessonId.trim().toUpperCase()) {
    errors.push(`Идентификатор урока в отчёте (${parsed.lessonId}) не совпадает с текущим уроком (${expectedLessonId}).`);
  }

  // Lesson status check
  const allowedStatuses = ['completed', 'needs-review', 'in-progress'];
  if (!parsed.lessonStatus || !allowedStatuses.includes(parsed.lessonStatus)) {
    errors.push(`Поле "lessonStatus" должно быть одним из: ${allowedStatuses.join(', ')}.`);
  }

  // Covered topics
  if (!Array.isArray(parsed.coveredTopics)) {
    errors.push('Поле "coveredTopics" должно быть массивом строк.');
  }

  // Assessment check
  if (!parsed.assessment || typeof parsed.assessment !== 'object') {
    errors.push('Поле "assessment" обязательно и должно быть объектом.');
  } else {
    const { maxScore, earnedScore, questions } = parsed.assessment;
    if (typeof maxScore !== 'number' || maxScore <= 0) {
      errors.push('assessment.maxScore должен быть положительным числом больше нуля.');
    }
    if (typeof earnedScore !== 'number' || earnedScore < 0) {
      errors.push('assessment.earnedScore должен быть неотрицательным числом.');
    }
    if (typeof maxScore === 'number' && typeof earnedScore === 'number' && earnedScore > maxScore) {
      errors.push(`Набранный балл (${earnedScore}) не может превышать максимальный (${maxScore}).`);
    }
    if (!Array.isArray(questions)) {
      errors.push('assessment.questions должен быть массивом результатов ответов.');
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      rawText: rawInput,
    };
  }

  // Build clean sanitized report
  const cleanReport: StructuredReport = {
    schemaVersion: sanitizeString(parsed.schemaVersion, 10),
    lessonId: sanitizeString(parsed.lessonId, 32).toUpperCase(),
    lessonStatus: parsed.lessonStatus,
    coveredTopics: Array.isArray(parsed.coveredTopics)
      ? parsed.coveredTopics.map((t: any) => sanitizeString(t, 200)).filter(Boolean)
      : [],
    assessment: {
      maxScore: Number(parsed.assessment.maxScore),
      earnedScore: Number(parsed.assessment.earnedScore),
      questions: Array.isArray(parsed.assessment.questions)
        ? parsed.assessment.questions.map((q: any) => ({
            questionId: sanitizeString(q.questionId, 64) || 'Q',
            skillIds: Array.isArray(q.skillIds)
              ? q.skillIds.map((s: any) => sanitizeString(s, 64)).filter(Boolean)
              : [],
            result: ['correct', 'incorrect', 'partial'].includes(q.result) ? q.result : 'incorrect',
            feedback: sanitizeString(q.feedback, 1000),
            needsRecheck: Boolean(q.needsRecheck),
          }))
        : [],
    },
    homework: Array.isArray(parsed.homework)
      ? parsed.homework.map((hw: any, idx: number) => ({
          id: sanitizeString(hw.id, 64) || `HW${idx + 1}`,
          title: sanitizeString(hw.title, 200) || 'Домашнее задание',
          description: sanitizeString(hw.description, 2000),
        }))
      : [],
    knowledgeGaps: Array.isArray(parsed.knowledgeGaps)
      ? parsed.knowledgeGaps.map((kg: any) => ({
          skillId: sanitizeString(kg.skillId, 64) || 'general-gap',
          description: sanitizeString(kg.description, 500),
          status: kg.status === 'resolved' ? 'resolved' : 'needs-review',
          mandatoryNextCheck: kg.mandatoryNextCheck !== false,
        }))
      : [],
    strongSkills: Array.isArray(parsed.strongSkills)
      ? parsed.strongSkills.map((sk: any) => ({
          skillId: sanitizeString(sk.skillId, 64),
          description: sanitizeString(sk.description, 500),
        }))
      : [],
    nextLessonInstructions: {
      mandatoryRechecks: Array.isArray(parsed.nextLessonInstructions?.mandatoryRechecks)
        ? parsed.nextLessonInstructions.mandatoryRechecks.map((r: any) => sanitizeString(r, 500)).filter(Boolean)
        : [],
      homeworkChecks: Array.isArray(parsed.nextLessonInstructions?.homeworkChecks)
        ? parsed.nextLessonInstructions.homeworkChecks.map((h: any) => sanitizeString(h, 500)).filter(Boolean)
        : [],
      additionalChecks: Array.isArray(parsed.nextLessonInstructions?.additionalChecks)
        ? parsed.nextLessonInstructions.additionalChecks.map((a: any) => sanitizeString(a, 500)).filter(Boolean)
        : [],
    },
    studentNotes: sanitizeString(parsed.studentNotes, 2000),
  };

  return {
    valid: true,
    report: cleanReport,
    rawText: rawInput,
    source: rawInput.includes('```') ? 'markdown_fence' : 'parsed_json',
  };
}
