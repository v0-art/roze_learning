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
  expectedLessonId?: string,
  options: {nexusRules?: boolean} = {}
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

  // Schema version check (v1.0 baseline and v1.1 extended entry-control per ТЗ v2.0)
  if (!parsed.schemaVersion || typeof parsed.schemaVersion !== 'string') {
    errors.push('Поле "schemaVersion" обязательно (ожидается "1.0" или "1.1").');
  } else if (parsed.schemaVersion !== '1.0' && parsed.schemaVersion !== '1.1') {
    errors.push(`Неподдерживаемая версия схемы: "${parsed.schemaVersion}". Поддерживается: "1.0" и "1.1".`);
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
    if (typeof maxScore !== 'number' || !Number.isFinite(maxScore) || maxScore <= 0) {
      errors.push('assessment.maxScore должен быть положительным числом больше нуля.');
    }
    if (typeof earnedScore !== 'number' || !Number.isFinite(earnedScore) || earnedScore < 0) {
      errors.push('assessment.earnedScore должен быть неотрицательным числом.');
    }
    if (typeof maxScore === 'number' && typeof earnedScore === 'number' && earnedScore > maxScore) {
      errors.push(`Набранный балл (${earnedScore}) не может превышать максимальный (${maxScore}).`);
    }
    if (!Array.isArray(questions)) {
      errors.push('assessment.questions должен быть массивом результатов ответов.');
    }
  }

  for (const key of ['homework', 'knowledgeGaps', 'strongSkills']) {
    if (!Array.isArray(parsed[key])) errors.push(`Поле "${key}" должно быть массивом.`);
  }
  if (!parsed.nextLessonInstructions || ['mandatoryRechecks', 'homeworkChecks', 'additionalChecks'].some(k => !Array.isArray(parsed.nextLessonInstructions[k]))) {
    errors.push('Необходимы все три массива nextLessonInstructions.');
  }
  if (Array.isArray(parsed.assessment?.questions)) {
    const ids = new Set<string>();
    for (const q of parsed.assessment.questions) {
      if (!q || typeof q.questionId !== 'string' || !q.questionId.trim() || ids.has(q.questionId) || !Array.isArray(q.skillIds) || !['correct', 'partial', 'incorrect'].includes(q.result) || typeof q.feedback !== 'string' || typeof q.needsRecheck !== 'boolean') errors.push('Некорректный или повторяющийся результат вопроса.');
      if (q?.questionId) ids.add(q.questionId);
    }
  }
  // The approved lesson drafts U01/U02 define eight independent 0/1/2 questions.
  if (options.nexusRules !== false && ['M01-T01-U01', 'M01-T01-U02'].includes(String(parsed.lessonId || '').trim().toUpperCase()) && parsed.lessonStatus === 'completed' && Array.isArray(parsed.assessment?.questions)) {
    const questions = parsed.assessment.questions;
    const expected = Array.from({length: 8}, (_, i) => `Q${String(i + 1).padStart(2, '0')}`);
    if (questions.length !== 8 || expected.some(id => !questions.some((q: any) => q?.questionId === id))) errors.push('Для урока требуются все восемь результатов Q01–Q08.');
    if (parsed.assessment.maxScore !== 16) errors.push('Максимум диагностического теста должен составлять 16 баллов.');
    const points: Record<string, number> = {correct: 2, partial: 1, incorrect: 0};
    if (questions.every((q: any) => q && q.result in points) && questions.reduce((total: number, q: any) => total + points[q.result], 0) !== parsed.assessment.earnedScore) errors.push('Сумма баллов не совпадает с результатами 0/1/2 отдельных вопросов.');
    if (questions.some((q: any) => q && q.result !== 'correct' && (!q.needsRecheck || typeof q.feedback !== 'string' || !q.feedback.trim()))) errors.push('Для каждого неверного или частичного ответа необходимы разбор и обязательная повторная проверка.');
    if (Array.isArray(parsed.nextLessonInstructions?.mandatoryRechecks) && questions.some((q: any) => q && q.result !== 'correct' && !parsed.nextLessonInstructions.mandatoryRechecks.some((r: any) => typeof r === 'string' && r.includes(q.questionId)))) errors.push('Для каждого неверного или частичного ответа требуется отдельный вопрос повторной проверки с исходным ID.');
  }
  for (const key of ['knowledgeGaps', 'strongSkills']) {
    if (Array.isArray(parsed[key]) && parsed[key].some((item: any) => !item || typeof item.skillId !== 'string' || !item.skillId.trim() || typeof item.description !== 'string' || !item.description.trim())) errors.push(`Некорректные данные в ${key}.`);
  }
  for (const key of ['mandatoryRechecks', 'homeworkChecks', 'additionalChecks']) {
    if (Array.isArray(parsed.nextLessonInstructions?.[key]) && parsed.nextLessonInstructions[key].some((item: any) => typeof item !== 'string')) errors.push(`Элементы ${key} должны быть строками.`);
  }

  if (Array.isArray(parsed.homework)) {
    const ids = new Set<string>();
    for (const h of parsed.homework) {
      if (!h || typeof h.id !== 'string' || !h.id.trim() || ids.has(h.id) || typeof h.title !== 'string' || !h.title.trim() || typeof h.description !== 'string' || !h.description.trim()) errors.push('Некорректное или повторяющееся домашнее задание.');
      if (h?.id) ids.add(h.id);
    }
  }
  if (parsed.schemaVersion === '1.1') {
    const e = parsed.entryControl;
    if (!e || typeof e.previousLessonId !== 'string' || !Array.isArray(e.homeworkResults) || !Array.isArray(e.recheckResults)) errors.push('Для версии 1.1 необходим полный блок entryControl.');
    else {
      const ids = new Set<string>();
      for (const h of e.homeworkResults) {
        if (!h || typeof h.homeworkId !== 'string' || !h.homeworkId.trim() || ids.has(h.homeworkId) || !['checked', 'needs_revision', 'not_submitted'].includes(h.status) || typeof h.feedback !== 'string' || (h.status !== 'not_submitted' && !h.feedback.trim())) errors.push('Некорректный результат проверки ДЗ.');
        if (h && ((h.errors !== undefined && (!Array.isArray(h.errors) || h.errors.some((x: any) => typeof x !== 'string'))) || (h.skillIds !== undefined && (!Array.isArray(h.skillIds) || h.skillIds.some((x: any) => typeof x !== 'string'))) || (h.needsRevision !== undefined && typeof h.needsRevision !== 'boolean'))) errors.push('Некорректные подробности проверки ДЗ.');
        if (h?.homeworkId) ids.add(h.homeworkId);
      }
      const recheckKeys = new Set<string>();
      for (const q of e.recheckResults) {
        const validQuestion = typeof q?.sourceQuestionId === 'string' && q.sourceQuestionId.trim();
        const validGap = typeof q?.sourceGapId === 'string' && q.sourceGapId.trim();
        const qualified = typeof q?.sourceQuestionId === 'string' ? q.sourceQuestionId.match(/^(M\d{2}-T\d{2}-U\d{2}):(Q\d+)$/) : null;
        if (qualified && q.sourceLessonId && q.sourceLessonId !== qualified[1]) errors.push('Исходный урок не соответствует идентификатору вопроса.');
        const key = validGap ? `gap:${q.sourceGapId}` : `${qualified?.[1] || q?.sourceLessonId || e.previousLessonId}:${qualified?.[2] || q?.sourceQuestionId}`;
        if (recheckKeys.has(key)) errors.push('Повторный результат одной проверки указан несколько раз.');
        recheckKeys.add(key);
        if (!q || (!validQuestion && !validGap) || (q.sourceLessonId !== undefined && (typeof q.sourceLessonId !== 'string' || !q.sourceLessonId.trim())) || !['persists', 'resolved', 'resolved_preliminary'].includes(q.status) || typeof q.evidence !== 'string' || !q.evidence.trim()) errors.push('Некорректный результат повторной проверки.');
      }
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
            ...(typeof q.questionText === 'string' ? {questionText: sanitizeString(q.questionText, 5000)} : {}),
            ...(typeof q.studentAnswer === 'string' ? {studentAnswer: sanitizeString(q.studentAnswer, 5000)} : {}),
            ...(typeof q.pointsAwarded === 'number' && Number.isFinite(q.pointsAwarded) ? {pointsAwarded: q.pointsAwarded} : {}),
            ...(typeof q.maxPoints === 'number' && Number.isFinite(q.maxPoints) ? {maxPoints: q.maxPoints} : {}),
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
    ...(parsed.schemaVersion === '1.1' ? { entryControl: {
      previousLessonId: sanitizeString(parsed.entryControl.previousLessonId, 64),
      homeworkResults: parsed.entryControl.homeworkResults.map((h: any) => ({homeworkId: sanitizeString(h.homeworkId, 64), status: h.status, feedback: sanitizeString(h.feedback, 2000), ...(typeof h.evidence === 'string' ? {evidence: sanitizeString(h.evidence, 5000)} : {}), ...(Array.isArray(h.errors) ? {errors: h.errors.map((x: string) => sanitizeString(x, 1000))} : {}), ...(Array.isArray(h.skillIds) ? {skillIds: h.skillIds.map((x: string) => sanitizeString(x, 64))} : {}), ...(typeof h.needsRevision === 'boolean' ? {needsRevision: h.needsRevision} : {})})),
      recheckResults: parsed.entryControl.recheckResults.map((q: any) => { const qualified = typeof q.sourceQuestionId === 'string' ? q.sourceQuestionId.match(/^(M\d{2}-T\d{2}-U\d{2}):(Q\d+)$/) : null; return ({...(q.sourceQuestionId ? {sourceQuestionId: sanitizeString(qualified?.[2] || q.sourceQuestionId, 64)} : {}), ...((qualified || q.sourceLessonId) ? {sourceLessonId: sanitizeString(qualified?.[1] || q.sourceLessonId, 64)} : {}), ...(q.sourceGapId ? {sourceGapId: sanitizeString(q.sourceGapId, 64)} : {}), status: q.status, evidence: sanitizeString(q.evidence, 2000)}); }),
    }} : {}),
  };

  return {
    valid: true,
    report: cleanReport,
    rawText: rawInput,
    source: rawInput.includes('```') ? 'markdown_fence' : 'parsed_json',
  };
}
