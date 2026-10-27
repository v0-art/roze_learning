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
  } = options;

  const isFirstLessonOfCourse = lesson.code === 'M01-T01-U01';
  let carryoverBlock = '';
  let carryoverRecheckCount = 0;
  let carryoverHomeworkCount = 0;

  if (!isFirstLessonOfCourse && (previousLessonReport || unresolvedGaps.length > 0 || pendingHomework.length > 0)) {
    const rechecks: string[] = [];

    // 1. Mandatory rechecks from previous lesson report
    if (previousLessonReport?.nextLessonInstructions?.mandatoryRechecks) {
      previousLessonReport.nextLessonInstructions.mandatoryRechecks.forEach((item) => {
        if (item && !rechecks.includes(item)) {
          rechecks.push(item);
        }
      });
    }

    // 2. Question errors requiring recheck
    if (previousLessonReport?.assessment?.questions) {
      previousLessonReport.assessment.questions
        .filter((q) => q.needsRecheck || q.result === 'incorrect')
        .forEach((q) => {
          const text = `Ошибка в ${q.questionId}: ${q.feedback}`;
          if (!rechecks.includes(text)) {
            rechecks.push(text);
          }
        });
    }

    // 3. Persistent unresolved gaps
    unresolvedGaps
      .filter((gap) => gap.status === 'needs-review')
      .forEach((gap) => {
        const text = `[Устранить пробел]: ${gap.description} (навык: ${gap.skillId})`;
        if (!rechecks.includes(text)) {
          rechecks.push(text);
        }
      });

    carryoverRecheckCount = rechecks.length;

    // 4. Homework to check
    const hwChecks: string[] = [];
    if (previousLessonReport?.nextLessonInstructions?.homeworkChecks) {
      previousLessonReport.nextLessonInstructions.homeworkChecks.forEach((hw) => {
        if (!hwChecks.includes(hw)) hwChecks.push(hw);
      });
    }
    pendingHomework.forEach((hw) => {
      const hwText = `Проверить ДЗ "${hw.title}": ${hw.description}`;
      if (!hwChecks.includes(hwText)) hwChecks.push(hwText);
    });
    carryoverHomeworkCount = hwChecks.length;

    carryoverBlock = `
================================================================================
>>> БЛОК ПРЕЕМСТВЕННОСТИ И ВХОДНОГО КОНТРОЛЯ (CARRYOVER BLOCK) <<<
ПРЕДЫДУЩИЙ УРОК: ${previousLessonId || 'Предыдущее занятие'}
================================================================================
ИНСТРУКЦИЯ ДЛЯ ПРЕПОДАВАТЕЛЯ CHATGPT:
Перед началом изложения нового материала урока ${lesson.code} ОБЯЗАТЕЛЬНО проведите входной контроль.
ЗАПРЕЩЕНО давать подсказки во время входного тестирования!

1. ОБЯЗАТЕЛЬНЫЕ ПОВТОРНЫЕ ПРОВЕРКИ И ОШИБКИ ПРОШЛОГО УРОКА (${carryoverRecheckCount} шт.):
${
  rechecks.length > 0
    ? rechecks.map((r, i) => `   [${i + 1}] ${r}`).join('\n')
    : '   - Нет критических ошибок из предыдущего занятия.'
}

2. ПРОВЕРКА ДОМАШНЕГО ЗАДАНИЯ (${carryoverHomeworkCount} шт.):
${
  hwChecks.length > 0
    ? hwChecks.map((h, i) => `   [${i + 1}] ${h}`).join('\n')
    : '   - Домашнее задание отсутствует.'
}
${
  mentorSpecialNotes.length > 0
    ? `\n3. СПЕЦИАЛЬНЫЕ УКАЗАНИЯ ГЛАВНОГО МЕНТОРА:\n${mentorSpecialNotes.map((n) => `   * ${n}`).join('\n')}`
    : ''
}
================================================================================
`.trim();
  }

  const structuredReportSchemaExample = `
{
  "schemaVersion": "1.0",
  "lessonId": "${lesson.code}",
  "lessonStatus": "completed",
  "coveredTopics": [
    ${lesson.objectives.map((o) => `"${o}"`).join(',\n    ')}
  ],
  "assessment": {
    "maxScore": 100,
    "earnedScore": 85,
    "questions": [
      {
        "questionId": "Q01",
        "skillIds": ["${lesson.relatedSkillIds[0] || 'core-skill'}"],
        "result": "correct",
        "feedback": "Верно сформулировано определение и свойства",
        "needsRecheck": false
      }
    ]
  },
  "homework": [
    {
      "id": "HW01",
      "title": "Практическое задание по теме урока",
      "description": "Описание домашнего задания для самостоятельного закрепления"
    }
  ],
  "knowledgeGaps": [],
  "strongSkills": [
    {
      "skillId": "${lesson.relatedSkillIds[0] || 'core-skill'}",
      "description": "Уверенное владение ключевыми концепциями темы"
    }
  ],
  "nextLessonInstructions": {
    "mandatoryRechecks": [],
    "homeworkChecks": ["Проверить домашнее задание HW01"],
    "additionalChecks": []
  },
  "studentNotes": ""
}
`.trim();

  const fullPromptParts: string[] = [];

  // Part 1: System prompt & General rules
  fullPromptParts.push(`### РОЛЬ И РЕЖИМ РАБОТЫ В NEXUS ACADEMY
Ты — ведущий преподаватель и строгий научный наставник Академии информационной безопасности и телекоммуникаций NEXUS.
Я — студент программы профессиональной подготовки.
Преподавай на академическом, строгом техническом русском языке. Избегай размытых формулировок и банальностей.
Каждая тема должна опираться на математические и физические основы, реальные стандарты (ITU-T, IEEE, IETF, ГОСТ) и инженерную практику.`);

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
Расчётная длительность: ~${lesson.durationEstimateMinutes} минут.

ЦЕЛИ ЗАНЯТИЯ:
${lesson.objectives.map((obj, i) => `${i + 1}. ${obj}`).join('\n')}

СВЯЗАННЫЕ НАВЫКИ ДИСЦИПЛИНЫ:
${lesson.relatedSkillIds.map((sid) => `- ${sid}`).join('\n')}

МАТЕРИАЛ И ЗАДАНИЯ УРОКА:
${lesson.promptTemplate}`);

  // Part 5: Structured Export Contract
  fullPromptParts.push(`### ОБЯЗАТЕЛЬНЫЙ ФИНАЛЬНЫЙ ЭКСПОРТ (ВЕРСИЯ ПРОТОКОЛА 1.0)
В самом конце занятия, после опроса и выдачи домашнего задания, выдай СТРОГО ДВЕ ЧАСТИ:
1. Текстовое резюме занятия на русском языке с подробным разбором успехов и ошибок.
2. Машиночитаемый блок JSON строго в формате:
\`\`\`json
${structuredReportSchemaExample}
\`\`\`
ВАЖНО:
- Поле "earnedScore" не должно превышать "maxScore".
- В "mandatoryRechecks" ОБЯЗАТЕЛЬНО внеси все темы, где студент ошибся или допустил неточности.
- Не выводи никаких посторонних символов внутри блока \`\`\`json ... \`\`\`.`);

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
