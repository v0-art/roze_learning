/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LessonItem, KnowledgeGap, HomeworkItem, StructuredReport } from '../types';

export interface PromptAssemblyOptions {
  lesson: LessonItem;
  previousLessonReport?: StructuredReport | null;
  previousLessonId?: string | null;
  unresolvedGaps?: KnowledgeGap[];
  pendingHomework?: HomeworkItem[];
  mentorSpecialNotes?: string[];
  nexusRules?: boolean;
}

export interface AssembledPrompt {
  lessonId: string;
  version: string;
  fullPromptText: string;
  hasCarryover: boolean;
  carryoverRecheckCount: number;
  carryoverHomeworkCount: number;
  wordCount: number;
  characterCount: number;
}

/**
 * Deterministically assemble the prompt for ChatGPT without any AI generation
 */
export function assembleLessonPrompt(options: PromptAssemblyOptions): AssembledPrompt {
  const {
    lesson,
    previousLessonReport,
    previousLessonId,
    unresolvedGaps = [],
    pendingHomework = [],
    mentorSpecialNotes = [],
    nexusRules = true,
  } = options;

  const isFirstLessonOfCourse = nexusRules ? lesson.code === 'M01-T01-U01' : !previousLessonId && !previousLessonReport && unresolvedGaps.length === 0 && pendingHomework.length === 0;
  let carryoverBlock = '';
  let carryoverRecheckCount = 0;
  let carryoverHomeworkCount = 0;

  if (!isFirstLessonOfCourse && (previousLessonReport || unresolvedGaps.length > 0 || pendingHomework.length > 0)) {
    const rechecks: string[] = [];
    const coveredQuestions = new Set<string>();
    const previousCode = previousLessonReport?.lessonId || previousLessonId || '';
    const questionKey = (text: string, defaultLesson: string) => {
      const qualified = text.match(/(M\d{2}-T\d{2}-U\d{2}):(Q\d+)/);
      if (qualified) return `${qualified[1]}:${qualified[2]}`;
      const question = text.match(/\bQ\d{2}\b/);
      return question ? `${defaultLesson}:${question[0]}` : '';
    };
    for (const item of previousLessonReport?.nextLessonInstructions?.mandatoryRechecks || []) {
      if (!rechecks.includes(item)) rechecks.push(item);
      const key = questionKey(item, previousCode);
      if (key) coveredQuestions.add(key);
    }
    for (const q of previousLessonReport?.assessment?.questions || []) {
      const key = `${previousCode}:${q.questionId}`;
      if ((q.result !== 'correct' || q.needsRecheck) && !coveredQuestions.has(key)) {
        coveredQuestions.add(key);
        rechecks.push(`${q.questionId}: ${q.feedback}`);
      }
    }
    for (const gap of unresolvedGaps.filter(g => g.status === 'needs-review')) {
      const key = gap.sourceQuestionId ? `${gap.sourceLessonId}:${gap.sourceQuestionId}` : questionKey(gap.description, gap.sourceLessonId);
      if (!key || !coveredQuestions.has(key)) {
        if (key) coveredQuestions.add(key);
        rechecks.push(`[Пробел ${gap.id}; урок ${gap.sourceLessonId}] ${gap.description}`);
      }
    }
    carryoverRecheckCount = rechecks.length;
    const byId = new Map<string, string>();
    for (const hw of previousLessonReport?.homework || []) byId.set(hw.id, `${hw.id}. ${hw.title}: ${hw.description}`);
    const completedHomework = new Set<string>();
    for (const hw of pendingHomework) {
      if (hw.status === 'checked' || hw.status === 'verified') { byId.delete(hw.id); completedHomework.add(hw.id); continue; }
      const text = `${hw.id}. ${hw.title}: ${hw.description}` + (hw.studentAnswer ? `\nОтвет ученика: ${hw.studentAnswer}` : '\nОтвет не приложен: запросите решение у ученика.');
      byId.set(hw.id, text);
    }
    const extraChecks: string[] = [];
    for (const check of previousLessonReport?.nextLessonInstructions?.homeworkChecks || []) {
      const id = check.match(/M\d{2}-T\d{2}-U\d{2}-HW\d+/)?.[0];
      if (id && byId.has(id)) byId.set(id, `${byId.get(id)}\nУказание к проверке: ${check}`);
      else if (!id || !completedHomework.has(id)) extraChecks.push(check);
    }
    const hwChecks = [...byId.values(), ...extraChecks];
    carryoverHomeworkCount = hwChecks.length;
    const additionalChecks = previousLessonReport?.nextLessonInstructions?.additionalChecks || [];

    carryoverBlock = `
================================================================================
>>> БЛОК ПРЕЕМСТВЕННОСТИ И ВХОДНОГО КОНТРОЛЯ (CARRYOVER BLOCK) <<<
ПРЕДЫДУЩИЙ УРОК: ${previousLessonId || 'Предыдущее занятие'}
================================================================================
ИНСТРУКЦИЯ ДЛЯ ПРЕПОДАВАТЕЛЯ CHATGPT:
Перед началом изложения нового материала урока ${lesson.code} ОБЯЗАТЕЛЬНО проведите входной контроль.
ЗАПРЕЩЕНО давать подсказки во время входного тестирования! Сначала проверьте все ДЗ, затем все ошибки и другие знания. После ответов выполните разбор.
В итоговом отчёте schemaVersion 1.1 добавьте entryControl: previousLessonId, homeworkResults (homeworkId, status: checked / needs_revision / not_submitted, feedback, при наличии errors, skillIds, needsRevision) и recheckResults (sourceQuestionId и sourceLessonId для вопроса, либо sourceGapId для старого пробела, status: persists / resolved, evidence). Указывайте только фактические результаты; если задания нет, укажите not_submitted. Это самоотчёт, а не подтверждение ментором.

1. ПРОВЕРКА ДОМАШНЕГО ЗАДАНИЯ (${carryoverHomeworkCount} шт.):
${
  hwChecks.length > 0
    ? hwChecks.map((h, i) => `   [${i + 1}] ${h}`).join('\n')
    : '   - Домашнее задание отсутствует.'
}

2. ОБЯЗАТЕЛЬНЫЕ ПОВТОРНЫЕ ПРОВЕРКИ И ОШИБКИ ПРОШЛОГО УРОКА (${carryoverRecheckCount} шт.):
${
  rechecks.length > 0
    ? rechecks.map((r, i) => `   [${i + 1}] ${r}`).join('\n')
    : '   - Нет критических ошибок из предыдущего занятия.'
}

3. ФАКТИЧЕСКИ ИЗУЧЕННЫЕ ТЕМЫ:
${previousLessonReport?.coveredTopics?.map(t => `   - ${t}`).join('\n') || '   - Сведения отсутствуют.'}

4. СИЛЬНЫЕ СТОРОНЫ (ПРЕДВАРИТЕЛЬНЫЙ САМООТЧЁТ):
${previousLessonReport?.strongSkills?.map(s => `   - ${s.skillId}: ${s.description}`).join('\n') || '   - Сведения отсутствуют.'}

5. ДРУГИЕ КЛЮЧЕВЫЕ ЗНАНИЯ:
${additionalChecks.length ? additionalChecks.map((a, i) => `   [${i + 1}] ${a}`).join('\n') : '   - Нет дополнительных указаний.'}
${
  mentorSpecialNotes.length > 0
    ? `\n6. СПЕЦИАЛЬНЫЕ УКАЗАНИЯ ГЛАВНОГО МЕНТОРА:\n${mentorSpecialNotes.map((n) => `   * ${n}`).join('\n')}`
    : ''
}
================================================================================
`.trim();
  }

  const fullPromptParts: string[] = [];

  // Course rules are included only when actually provided by the lesson configuration.
  if (lesson.generalRules) fullPromptParts.push(`### ОБЩИЕ ПРАВИЛА КУРСА\n${lesson.generalRules}`);

  // Part 2: Module instructions
  if (lesson.moduleInstructions) {
    fullPromptParts.push(`### КОНТЕКСТ МОДУЛЯ
${lesson.moduleInstructions}`);
  }

  // Part 3: Carryover block if exists
  if (carryoverBlock) {
    fullPromptParts.push(carryoverBlock);
  }

  // Part 4: Official Lesson Content
  fullPromptParts.push(`### ПЛАН ЗАНЯТИЯ: ${lesson.code} — ${lesson.title}
Расчётная длительность: ${typeof lesson.durationEstimateMinutes === 'number' ? `~${lesson.durationEstimateMinutes} минут` : 'не указана'}.

ЦЕЛИ ЗАНЯТИЯ:
${lesson.objectives.map((obj, i) => `${i + 1}. ${obj}`).join('\n')}

СВЯЗАННЫЕ НАВЫКИ ДИСЦИПЛИНЫ:
${lesson.relatedSkillIds.map((sid) => `- ${sid}`).join('\n')}

МАТЕРИАЛ И ЗАДАНИЯ УРОКА:
${lesson.promptTemplate}`);

  // Extend the original source contract without adding a competing fake example.
  fullPromptParts.push(`### УТОЧНЕНИЕ К ФИНАЛЬНОМУ ОТЧЁТУ
Сохрани структуру JSON из официального материала занятия. Заполняй её только фактами проведённого диалога. Не подставляй вымышленные оценки, ответы или ДЗ.
${nexusRules && ['M01-T01-U01', 'M01-T01-U02'].includes(lesson.code) ? 'Для этого занятия: восемь вопросов Q01–Q08, каждый оценивается в 0, 1 или 2 балла; сумма от 0 до 16 — диагностический результат, не оценка экзамена. Для каждого ответа на 0 или 1 балл укажи needsRecheck: true и конкретный разбор.' : ''}
${carryoverBlock ? 'Для следующего урока используй schemaVersion 1.1 и добавь entryControl из блока преемственности к полной структуре официального отчёта; это уточнение заменяет номер версии 1.0 в примере исходного урока. Статусы и результаты входной проверки указывай только по фактическим ответам.' : 'Используй schemaVersion 1.0, указанный в официальном материале.'}
Отчёт передаёт ученик вручную; структурная корректность не подтверждает реальность обучения.`);

  const fullPromptText = fullPromptParts.join('\n\n');
  const wordCount = fullPromptText.split(/\s+/).filter(Boolean).length;
  const characterCount = fullPromptText.length;

  return {
    lessonId: lesson.code,
    version: lesson.version || '1.0',
    fullPromptText,
    hasCarryover: Boolean(carryoverBlock),
    carryoverRecheckCount,
    carryoverHomeworkCount,
    wordCount,
    characterCount,
  };
}
