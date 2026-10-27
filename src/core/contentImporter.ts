/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ModuleItem,
  TopicItem,
  LessonItem,
  SkillItem,
  RelationItem,
  ExamDefinition,
  ExamTicketItem,
  ImportDiffRecord,
  ImportSummaryResult,
  DatabaseState,
} from '../types';

// Simple fast SHA-256 equivalent in browser / node
export async function computeSha256(text: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const msgUint8 = new TextEncoder().encode(text);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback: simple djb2 / hash if crypto subtle unavailable
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

export interface ParsedImportPayload {
  modules?: ModuleItem[];
  topics?: TopicItem[];
  lessons?: LessonItem[];
  skills?: SkillItem[];
  relations?: RelationItem[];
  exams?: ExamDefinition[];
  rawFiles?: Array<{ name: string; content: string; size: number }>;
}

export function parseLessonIdFromFilenameOrContent(filename: string, content: string): {
  moduleId: string;
  topicId: string;
  lessonCode: string;
} | null {
  // Try filename first: e.g. M01-T01-U01.md or M01-T01-U01_87c59720.md
  const fileMatch = filename.match(/(M\d{2})-(T\d{2})-(U\d{2})/i);
  if (fileMatch) {
    const m = fileMatch[1].toUpperCase();
    const t = `${m}-${fileMatch[2].toUpperCase()}`;
    const u = `${t}-${fileMatch[3].toUpperCase()}`;
    return { moduleId: m, topicId: t, lessonCode: u };
  }

  // Try content headers: e.g. # УЧЕБНЫЙ ПРОМПТ M01-T01-U01
  const contentMatch = content.match(/(M\d{2})-(T\d{2})-(U\d{2})/i);
  if (contentMatch) {
    const m = contentMatch[1].toUpperCase();
    const t = `${m}-${contentMatch[2].toUpperCase()}`;
    const u = `${t}-${contentMatch[3].toUpperCase()}`;
    return { moduleId: m, topicId: t, lessonCode: u };
  }

  return null;
}

export function parseExamTicketsFromMarkdown(content: string, moduleId: string = 'M01'): ExamTicketItem[] {
  const tickets: ExamTicketItem[] = [];
  const regex = /##\s+Билет\s+([A-Za-z0-9_-]+)\s*[—–-]\s*([A-Za-z0-9_-]+)[\s\S]*?1\.\s*\*\*Теория 1\.\*\*\s*([^\n]+)[\s\S]*?2\.\s*\*\*Теория 2\.\*\*\s*([^\n]+)[\s\S]*?3\.\s*\*\*Практика\.\*\*\s*([^\n]+)/gi;

  let match;
  while ((match = regex.exec(content)) !== null) {
    const ticketId = match[1].trim();
    const topicId = match[2].trim();
    const theory1 = match[3].trim();
    const theory2 = match[4].trim();
    const practical = match[5].trim();

    tickets.push({
      ticketId,
      topicId,
      theory1,
      theory2,
      practical,
      weightTheory1: 30,
      weightTheory2: 30,
      weightPractical: 40,
    });
  }

  return tickets;
}

export async function analyzeImportPayload(
  arg1: any,
  arg2: any
): Promise<ImportSummaryResult> {
  const currentState: DatabaseState = (arg1 && arg1.users) ? arg1 : arg2;
  const payload: ParsedImportPayload = (arg1 && arg1.users) ? arg2 : arg1;
  const diffs: ImportDiffRecord[] = [];
  let newCount = 0;
  let existingCount = 0;
  let unchangedCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  let modulesCreated = 0;
  let topicsCreated = 0;
  let lessonsCreated = 0;
  let lessonsUpdated = 0;
  let skillsCreated = 0;
  let relationsCreated = 0;
  let examQuestionsCount = 0;

  // 1. Analyze Modules
  if (payload.modules) {
    for (const m of payload.modules) {
      const existing = currentState.modules.find((mod) => mod.id === m.id || mod.code === m.code);
      if (!existing) {
        newCount++;
        modulesCreated++;
        diffs.push({
          entityType: 'module',
          entityId: m.code,
          entityTitle: m.title,
          status: 'new',
          details: `Создание дисциплины ${m.code}`,
        });
      } else {
        existingCount++;
        if (existing.title === m.title && existing.status === m.status) {
          unchangedCount++;
          diffs.push({
            entityType: 'module',
            entityId: m.code,
            entityTitle: m.title,
            status: 'unchanged',
            details: 'Без изменений (идентичная запись)',
          });
        } else {
          updatedCount++;
          diffs.push({
            entityType: 'module',
            entityId: m.code,
            entityTitle: m.title,
            status: 'needs_update',
            details: 'Обновление атрибутов дисциплины',
          });
        }
      }
    }
  }

  // 2. Analyze Topics
  if (payload.topics) {
    for (const t of payload.topics) {
      const existing = currentState.topics.find((top) => top.id === t.id || top.code === t.code);
      if (!existing) {
        newCount++;
        topicsCreated++;
        diffs.push({
          entityType: 'topic',
          entityId: t.code,
          entityTitle: t.title,
          status: 'new',
          details: `Создание темы ${t.code}`,
        });
      } else {
        existingCount++;
        if (existing.title === t.title && existing.status === t.status) {
          unchangedCount++;
          diffs.push({
            entityType: 'topic',
            entityId: t.code,
            entityTitle: t.title,
            status: 'unchanged',
            details: 'Без изменений (идентичная тема)',
          });
        } else {
          updatedCount++;
          diffs.push({
            entityType: 'topic',
            entityId: t.code,
            entityTitle: t.title,
            status: 'needs_update',
            details: 'Обновление заголовка или описания темы',
          });
        }
      }
    }
  }

  // 3. Analyze Lessons
  if (payload.lessons) {
    for (const l of payload.lessons) {
      const existing = currentState.lessons.find((les) => les.id === l.id || les.code === l.code);
      const incomingHash = await computeSha256(l.promptTemplate || '');

      if (!existing) {
        newCount++;
        lessonsCreated++;
        diffs.push({
          entityType: 'lesson',
          entityId: l.code,
          entityTitle: l.title,
          status: 'new',
          details: `Новый урок (${(l.promptTemplate || '').length} симв. в промпте, статус: ${l.status || 'draft'})`,
        });
      } else {
        existingCount++;
        const currentHash = existing.contentHash || (await computeSha256(existing.promptTemplate || ''));
        if (currentHash === incomingHash && existing.title === l.title) {
          unchangedCount++;
          diffs.push({
            entityType: 'lesson',
            entityId: l.code,
            entityTitle: l.title,
            status: 'unchanged',
            details: 'Полное совпадение промпта и метаданных (дубликат пропущен)',
          });
        } else {
          updatedCount++;
          lessonsUpdated++;
          diffs.push({
            entityType: 'lesson',
            entityId: l.code,
            entityTitle: l.title,
            status: 'needs_update',
            details: `Обновление содержимого: разница хеша промпта (${currentHash.slice(0, 8)} -> ${incomingHash.slice(0, 8)})`,
          });
        }
      }
    }
  }

  // 4. Analyze Skills
  if (payload.skills) {
    for (const s of payload.skills) {
      const existing = currentState.skills?.find((sk) => sk.id === s.id);
      if (!existing) {
        newCount++;
        skillsCreated++;
        diffs.push({
          entityType: 'skill',
          entityId: s.code,
          entityTitle: s.name,
          status: 'new',
          details: `Новая компетенция для темы ${s.topicId}`,
        });
      } else {
        existingCount++;
        unchangedCount++;
      }
    }
  }

  // 5. Analyze Relations
  if (payload.relations) {
    for (const r of payload.relations) {
      const existing = currentState.relations?.find(
        (rel) => rel.fromId === r.fromId && rel.toId === r.toId && rel.type === r.type
      );
      if (!existing) {
        newCount++;
        relationsCreated++;
        diffs.push({
          entityType: 'relation',
          entityId: `${r.fromId} -> ${r.toId}`,
          entityTitle: `${r.type}: ${r.fromId} -> ${r.toId}`,
          status: 'new',
          details: `Межпредметная связь / пререквизит`,
        });
      } else {
        existingCount++;
        unchangedCount++;
      }
    }
  }

  // 6. Analyze Exams
  if (payload.exams) {
    for (const ex of payload.exams) {
      examQuestionsCount += (ex.tickets?.length || 0) * 3;
      diffs.push({
        entityType: 'exam',
        entityId: ex.id,
        entityTitle: ex.title,
        status: currentState.exams?.find((e) => e.id === ex.id) ? 'needs_update' : 'new',
        details: `${ex.tickets?.length || 0} билетов (${examQuestionsCount} вопросов), статус: ${ex.status}`,
      });
    }
  }

  return {
    totalAnalyzed: diffs.length,
    newCount,
    existingCount,
    unchangedCount,
    updatedCount,
    errorCount,
    modulesCreated,
    topicsCreated,
    lessonsCreated,
    lessonsUpdated,
    skillsCreated,
    relationsCreated,
    examQuestionsCount,
    diffs,
  };
}

export function commitImportPayload(
  arg1: any,
  arg2: any,
  options: {
    conflictResolution?: string;
    actorId?: string;
    actorName?: string;
  }
): DatabaseState {
  const currentState: DatabaseState = (arg1 && arg1.users) ? arg1 : arg2;
  const payload: ParsedImportPayload = (arg1 && arg1.users) ? arg2 : arg1;
  const next = {
    ...currentState,
    modules: currentState.modules || [],
    topics: currentState.topics || [],
    lessons: currentState.lessons || [],
    skills: currentState.skills || [],
    relations: currentState.relations || [],
    exams: currentState.exams || [],
    auditLogs: currentState.auditLogs || [],
  };
  const now = new Date().toISOString();

  // 1. Commit Modules
  if (payload && payload.modules) {
    const modulesMap = new Map((next.modules || []).map((m) => [m.id, m]));
    for (const m of payload.modules) {
      if (!modulesMap.has(m.id)) {
        modulesMap.set(m.id, { ...m, updatedAt: now });
      } else if (options.conflictResolution !== 'keep_existing') {
        const ex = modulesMap.get(m.id)!;
        modulesMap.set(m.id, { ...ex, ...m, updatedAt: now });
      }
    }
    next.modules = Array.from(modulesMap.values()).sort((a, b) => a.order - b.order);
  }

  // 2. Commit Topics
  if (payload.topics) {
    const topicsMap = new Map(next.topics.map((t) => [t.id, t]));
    for (const t of payload.topics) {
      if (!topicsMap.has(t.id)) {
        topicsMap.set(t.id, { ...t, updatedAt: now });
      } else if (options.conflictResolution !== 'keep_existing') {
        const ex = topicsMap.get(t.id)!;
        topicsMap.set(t.id, { ...ex, ...t, updatedAt: now });
      }
    }
    next.topics = Array.from(topicsMap.values()).sort((a, b) => a.order - b.order);
  }

  // 3. Commit Lessons
  if (payload.lessons) {
    const lessonsMap = new Map(next.lessons.map((l) => [l.id, l]));
    for (const l of payload.lessons) {
      if (!lessonsMap.has(l.id)) {
        lessonsMap.set(l.id, {
          ...l,
          status: l.status || 'draft',
          version: l.version || '1.0',
          updatedAt: now,
        });
      } else if (options.conflictResolution !== 'keep_existing') {
        const ex = lessonsMap.get(l.id)!;
        const versionHistory = Array.isArray(ex.versionHistory) ? [...ex.versionHistory] : [];
        if (ex.promptTemplate !== l.promptTemplate) {
          versionHistory.unshift({
            version: ex.version || '1.0',
            promptText: ex.promptTemplate,
            authorId: options.actorId,
            authorName: options.actorName,
            changelog: 'Замена из импортированного файла',
            createdAt: now,
            status: ex.status,
          });
        }
        lessonsMap.set(l.id, {
          ...ex,
          ...l,
          versionHistory,
          updatedAt: now,
        });
      }
    }
    next.lessons = Array.from(lessonsMap.values()).sort((a, b) => a.order - b.order);
  }

  // 4. Commit Skills
  if (payload.skills) {
    const skillsMap = new Map((next.skills || []).map((s) => [s.id, s]));
    for (const s of payload.skills) {
      skillsMap.set(s.id, s);
    }
    next.skills = Array.from(skillsMap.values());
  }

  // 5. Commit Relations
  if (payload.relations) {
    const existingKeys = new Set(
      (next.relations || []).map((r) => `${r.fromId}|${r.toId}|${r.type}`)
    );
    const addedRelations = [...(next.relations || [])];
    for (const r of payload.relations) {
      const key = `${r.fromId}|${r.toId}|${r.type}`;
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        addedRelations.push(r);
      }
    }
    next.relations = addedRelations;
  }

  // 6. Commit Exams
  if (payload.exams) {
    const examsMap = new Map((next.exams || []).map((e) => [e.id, e]));
    for (const ex of payload.exams) {
      examsMap.set(ex.id, ex);
    }
    next.exams = Array.from(examsMap.values());
  }

  // Audit log entry
  next.auditLogs.unshift({
    id: `audit-${Date.now()}`,
    actorId: options.actorId,
    actorName: options.actorName,
    action: 'IMPORT_CONTENT_COMMIT',
    targetType: 'CURRICULUM',
    targetId: 'MULTIPLE_ENTITIES',
    reason: `Применение импорта: конфликтный режим "${options.conflictResolution}"`,
    timestamp: now,
  });

  return next;
}

export function exportLessonToMarkdown(lesson: LessonItem): string {
  return [
    `# Урок: ${lesson.code}`,
    '',
    `**Дисциплина:** ${lesson.moduleId}`,
    `**Тема:** ${lesson.topicId}`,
    `**Название:** ${lesson.title}`,
    `**Длительность:** ${lesson.durationEstimateMinutes} минут`,
    `**Статус:** ${lesson.status}`,
    `**Версия:** ${lesson.version || '1.0'}`,
    '',
    '## Цели урока',
    ...(lesson.objectives || []).map((o) => `- ${o}`),
    '',
    '## Пререквизиты',
    ...(lesson.prerequisites || []).map((p) => `- ${p}`),
    '',
    '## Промпт для проведения занятия',
    '```markdown',
    lesson.promptTemplate,
    '```',
    '',
  ].join('\n');
}

export function parseLessonMarkdown(content: string, filename: string = 'lesson.md'): LessonItem {
  const meta = parseLessonIdFromFilenameOrContent(filename, content);
  const code = meta.lessonCode || 'M01-T01-U01';
  const moduleId = meta.moduleId || code.split('-')[0] || 'M01';
  const topicId = meta.topicId || code.split('-').slice(0, 2).join('-') || 'M01-T01';

  let title = 'Урок';
  const titleMatch = content.match(/^#\s+(.+)$/m) || content.match(/\*\*Название:\*\*\s*(.+)$/m);
  if (titleMatch) {
    title = titleMatch[1].trim();
  }

  let promptTemplate = content;
  const promptMatch = content.match(/## Промпт для проведения занятия\s*```(?:markdown)?\n([\s\S]*?)```/);
  if (promptMatch) {
    promptTemplate = promptMatch[1];
  }

  return {
    id: code,
    code,
    moduleId,
    topicId,
    order: 1,
    title,
    durationEstimateMinutes: 45,
    prerequisites: [],
    objectives: [],
    relatedSkillIds: [],
    status: 'draft',
    version: '1.0',
    promptTemplate,
  };
}

