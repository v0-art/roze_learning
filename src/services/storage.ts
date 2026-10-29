/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  User,
  ModuleItem,
  TopicItem,
  LessonItem,
  SkillItem,
  RelationItem,
  ExamDefinition,
  LibraryFileItem,
  LessonAttempt,
  KnowledgeGap,
  HomeworkItem,
  AssessmentRecord,
  AdminNotification,
  AuditLogItem,
  MessageItem,
  GraphNode,
  GraphEdge,
  StructuredReport,
} from '../types';
import seedData from '../../data/nexus_academy.json' with { type: 'json' };

const DB_KEY = 'nexus_academy_db_v6';
const CURRENT_USER_KEY = 'nexus_academy_current_user_id';

export interface DatabaseState {
  users: User[];
  modules: ModuleItem[];
  topics: TopicItem[];
  lessons: LessonItem[];
  skills: SkillItem[];
  relations: RelationItem[];
  exams: ExamDefinition[];
  libraryFiles: LibraryFileItem[];
  lessonAttempts: LessonAttempt[];
  knowledgeGaps: KnowledgeGap[];
  homework: HomeworkItem[];
  assessments: AssessmentRecord[];
  notifications: AdminNotification[];
  auditLogs: AuditLogItem[];
  messages: MessageItem[];
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
}

type Listener = () => void;
const listeners: Set<Listener> = new Set();

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error('Listener error', e);
    }
  });
}

export function subscribeToDatabase(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let inMemoryDb: DatabaseState | null = null;
let isSyncingWithServer = false;

// Initial fallback state (seeded from data/nexus_academy.json)
function getInitialState(): DatabaseState {
  const seed = seedData as unknown as DatabaseState;
  return {
    ...seed,
    users: [
      {
        id: 'student-alexey',
        email: 'alexey.student@nexus.academy',
        displayName: 'Алексей Смирнов',
        role: 'student',
        avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
        createdAt: '2026-10-15T09:00:00.000Z',
        lastSeenAt: '2026-10-27T08:00:00.000Z',
      },
      {
        id: 'admin-mentor',
        email: 'dmitry.mentor@nexus.academy',
        displayName: 'Дмитрий Волков (Главный ментор)',
        role: 'admin',
        avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=120&q=80',
        createdAt: '2026-09-01T08:00:00.000Z',
        lastSeenAt: '2026-10-27T08:00:00.000Z',
      },
    ],
    modules: Array.isArray(seed.modules) ? [...seed.modules] : [],
    topics: Array.isArray(seed.topics) ? [...seed.topics] : [],
    lessons: Array.isArray(seed.lessons) ? [...seed.lessons] : [],
    skills: Array.isArray(seed.skills) ? [...seed.skills] : [],
    relations: Array.isArray(seed.relations) ? [...seed.relations] : [],
    exams: Array.isArray(seed.exams) ? [...seed.exams] : [],
    libraryFiles: Array.isArray(seed.libraryFiles) ? [...seed.libraryFiles] : [],
    lessonAttempts: Array.isArray(seed.lessonAttempts) ? [...seed.lessonAttempts] : [],
    knowledgeGaps: Array.isArray(seed.knowledgeGaps) ? [...seed.knowledgeGaps] : [],
    homework: Array.isArray(seed.homework) ? [...seed.homework] : [],
    assessments: Array.isArray(seed.assessments) ? [...seed.assessments] : [],
    notifications: Array.isArray(seed.notifications) ? [...seed.notifications] : [],
    auditLogs: Array.isArray(seed.auditLogs) ? [...seed.auditLogs] : [],
    messages: Array.isArray(seed.messages) ? [...seed.messages] : [],
    graphNodes: Array.isArray(seed.graphNodes) ? [...seed.graphNodes] : [],
    graphEdges: Array.isArray(seed.graphEdges) ? [...seed.graphEdges] : [],
  };
}

// Background sync from server
export async function syncDatabaseFromServer(): Promise<DatabaseState | null> {
  if (typeof window === 'undefined') return null;
  if (isSyncingWithServer) return inMemoryDb;

  try {
    isSyncingWithServer = true;
    const res = await fetch('/api/db');
    if (res.ok) {
      const serverData = await res.json();
      if (serverData && Array.isArray(serverData.modules)) {
        inMemoryDb = serverData as DatabaseState;
        try {
          localStorage.setItem(DB_KEY, JSON.stringify(serverData));
        } catch {
          // ignore localStorage quota errors
        }
        notifyListeners();
        return serverData;
      }
    }
  } catch (err) {
    // server might be starting up or in test environment
  } finally {
    isSyncingWithServer = false;
  }
  return null;
}

// Immediately trigger initial sync
if (typeof window !== 'undefined') {
  syncDatabaseFromServer();
}

export function loadDatabase(): DatabaseState {
  if (inMemoryDb) {
    return inMemoryDb;
  }

  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(DB_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && Array.isArray(parsed.modules) && parsed.modules.length > 0) {
          const seed = getInitialState();
          // Self-heal: ensure lessons array is populated with at least seed lessons
          if (!Array.isArray(parsed.lessons) || parsed.lessons.length < seed.lessons.length) {
            parsed.lessons = seed.lessons;
          } else {
            const hasAnyApproved = parsed.lessons.some((l: any) => l.moduleId === 'M01' && l.status === 'approved');
            if (!hasAnyApproved) {
              parsed.lessons = seed.lessons;
            }
          }
          if (!Array.isArray(parsed.topics) || parsed.topics.length < seed.topics.length) {
            parsed.topics = seed.topics;
          }
          if (!Array.isArray(parsed.skills) || parsed.skills.length < seed.skills.length) {
            parsed.skills = seed.skills;
          }
          if (!Array.isArray(parsed.exams) || parsed.exams.length < seed.exams.length) {
            parsed.exams = seed.exams;
          }
          inMemoryDb = parsed;
          return inMemoryDb as DatabaseState;
        }
      }
    } catch (e) {
      console.warn('Could not read from localStorage, using initial state', e);
    }
  }

  inMemoryDb = getInitialState();
  return inMemoryDb;
}

export function saveDatabase(db: DatabaseState): void {
  inMemoryDb = db;

  // 1. Optimistic write to localStorage
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (e) {
      console.warn('Could not save to localStorage', e);
    }

    // 2. Persistent write to server disk
    fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(db),
    }).catch((err) => {
      console.warn('Server sync failed:', err);
    });
  }

  notifyListeners();
}

let activeUserId: string | null = null;

// ---------------- User Management ----------------
export function getCurrentUser(): User {
  const db = loadDatabase();
  const targetId =
    activeUserId ||
    (typeof window !== 'undefined' ? localStorage.getItem(CURRENT_USER_KEY) : null);
  if (targetId) {
    const found = db.users.find((u) => u.id === targetId);
    if (found) return found;
  }
  return db.users.find((u) => u.role === 'admin') || db.users[0] || getInitialState().users[0];
}

export function setCurrentUserId(userId: string): void {
  activeUserId = userId;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CURRENT_USER_KEY, userId);
    } catch {}
  }
  notifyListeners();
}

export function getAllUsers(): User[] {
  return loadDatabase().users;
}

// ---------------- Modules Management ----------------
export function getModules(): ModuleItem[] {
  return loadDatabase().modules;
}

export function getModuleById(idOrCode: string): ModuleItem | undefined {
  return loadDatabase().modules.find((m) => m.id === idOrCode || m.code === idOrCode);
}

export function saveModule(moduleItem: ModuleItem): void {
  const db = loadDatabase();
  const idx = db.modules.findIndex((m) => m.id === moduleItem.id || m.code === moduleItem.code);
  const now = new Date().toISOString();
  const updatedItem = { ...moduleItem, updatedAt: now };

  if (idx >= 0) {
    db.modules[idx] = updatedItem;
  } else {
    db.modules.push(updatedItem);
  }
  db.modules.sort((a, b) => a.order - b.order);
  saveDatabase(db);
}

// ---------------- Topics Management ----------------
export function getTopics(moduleId?: string): TopicItem[] {
  const all = loadDatabase().topics;
  if (!moduleId) return all;
  return all.filter((t) => t.moduleId === moduleId);
}

export function getTopicById(idOrCode: string): TopicItem | undefined {
  return loadDatabase().topics.find((t) => t.id === idOrCode || t.code === idOrCode);
}

export function saveTopic(topicItem: TopicItem): void {
  const db = loadDatabase();
  const idx = db.topics.findIndex((t) => t.id === topicItem.id || t.code === topicItem.code);
  const now = new Date().toISOString();
  const updatedItem = { ...topicItem, updatedAt: now };

  if (idx >= 0) {
    db.topics[idx] = updatedItem;
  } else {
    db.topics.push(updatedItem);
  }
  db.topics.sort((a, b) => a.order - b.order);
  saveDatabase(db);
}

// ---------------- Lessons Management ----------------
export function getLessons(filter?: string | {
  moduleId?: string;
  topicId?: string;
  includeUnpublished?: boolean;
}): LessonItem[] {
  const db = loadDatabase();
  let list = db.lessons || [];
  const user = getCurrentUser();

  const filterObj = typeof filter === 'string' ? { moduleId: filter } : filter;

  // If student and not explicitly requested to include unpublished, show approved lessons
  if (user.role === 'student' && !filterObj?.includeUnpublished) {
    list = list.filter((l) => l.status === 'approved' || (l as any).status === 'published');
  }

  if (filterObj?.moduleId) {
    list = list.filter((l) => l.moduleId === filterObj.moduleId);
  }
  if (filterObj?.topicId) {
    list = list.filter((l) => l.topicId === filterObj.topicId);
  }

  return list.sort((a, b) => a.order - b.order);
}

export function getLessonById(idOrCode: string): LessonItem | undefined {
  return loadDatabase().lessons.find((l) => l.id === idOrCode || l.code === idOrCode);
}

export function saveLesson(
  lesson: LessonItem,
  changelog?: string,
  bumpMinorOrOptions?: boolean | string | { bumpMajor?: boolean; bumpMinor?: boolean; authorId?: string; authorName?: string },
  bumpMajorOrAuthorName?: boolean | string
): LessonItem {
  const db = loadDatabase();
  const currentUser = getCurrentUser();
  const now = new Date().toISOString();
  const idx = db.lessons.findIndex((l) => l.id === lesson.id || l.code === lesson.code);

  let newVersion = lesson.version || '1.0';
  const existing = idx >= 0 ? db.lessons[idx] : null;

  let shouldBumpMajor = false;
  let shouldBumpMinor = false;
  let authorId = currentUser.id;
  let authorName = currentUser.displayName;

  if (typeof bumpMinorOrOptions === 'boolean') {
    shouldBumpMinor = bumpMinorOrOptions;
    shouldBumpMajor = Boolean(bumpMajorOrAuthorName);
  } else if (typeof bumpMinorOrOptions === 'object' && bumpMinorOrOptions !== null) {
    shouldBumpMajor = Boolean(bumpMinorOrOptions.bumpMajor);
    shouldBumpMinor = Boolean(bumpMinorOrOptions.bumpMinor);
    if (bumpMinorOrOptions.authorId) authorId = bumpMinorOrOptions.authorId;
    if (bumpMinorOrOptions.authorName) authorName = bumpMinorOrOptions.authorName;
  } else if (typeof bumpMinorOrOptions === 'string') {
    authorId = bumpMinorOrOptions;
    if (typeof bumpMajorOrAuthorName === 'string') {
      authorName = bumpMajorOrAuthorName;
    }
  }

  if (existing) {
    if (shouldBumpMajor) {
      const major = parseInt(existing.version.split('.')[0] || '1', 10);
      newVersion = `${major + 1}.0`;
    } else if (shouldBumpMinor || (existing.promptTemplate !== lesson.promptTemplate && changelog)) {
      const parts = (existing.version || '1.0').split('.');
      const major = parseInt(parts[0] || '1', 10);
      const minor = parseInt(parts[1] || '0', 10);
      newVersion = `${major}.${minor + 1}`;
    }

    const versionHistory = Array.isArray(existing.versionHistory) ? [...existing.versionHistory] : [];
    if (existing.promptTemplate !== lesson.promptTemplate || changelog) {
      versionHistory.unshift({
        version: existing.version || '1.0',
        promptText: existing.promptTemplate,
        authorId,
        authorName,
        changelog: changelog || 'Редактирование текста промпта',
        createdAt: now,
        status: existing.status,
      });
    }

    const updatedLesson: LessonItem = {
      ...existing,
      ...lesson,
      version: newVersion,
      versionHistory,
      updatedAt: now,
    };
    db.lessons[idx] = updatedLesson;

    db.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      actorId: currentUser.id,
      actorName: currentUser.displayName,
      action: 'UPDATE_LESSON',
      targetType: 'LESSON',
      targetId: lesson.code,
      reason: changelog || `Обновление урока ${lesson.code} до версии ${newVersion}`,
      timestamp: now,
    });

    saveDatabase(db);
    return updatedLesson;
  } else {
    const newLesson: LessonItem = {
      ...lesson,
      status: lesson.status || 'draft',
      version: lesson.version || '1.0',
      versionHistory: [
        {
          version: '1.0',
          promptText: lesson.promptTemplate,
          authorId: currentUser.id,
          authorName: currentUser.displayName,
          changelog: changelog || 'Создание нового урока',
          createdAt: now,
          status: lesson.status || 'draft',
        },
      ],
      updatedAt: now,
    };
    db.lessons.push(newLesson);

    db.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      actorId: currentUser.id,
      actorName: currentUser.displayName,
      action: 'CREATE_LESSON',
      targetType: 'LESSON',
      targetId: lesson.code,
      reason: changelog || `Создание урока ${lesson.code}`,
      timestamp: now,
    });

    saveDatabase(db);
    return newLesson;
  }
}

export function batchUpdateLessonStatus(
  lessonIds: string[],
  action: 'publish' | 'archive' | 'draft',
  reason?: string
): void {
  const db = loadDatabase();
  const currentUser = getCurrentUser();
  const now = new Date().toISOString();

  let targetStatus: 'draft' | 'published' | 'archived' = 'draft';
  if (action === 'publish') targetStatus = 'published';
  if (action === 'archive') targetStatus = 'archived';

  db.lessons = db.lessons.map((l) => {
    if (lessonIds.includes(l.id) || lessonIds.includes(l.code)) {
      return { ...l, status: targetStatus, updatedAt: now };
    }
    return l;
  });

  db.auditLogs.unshift({
    id: `audit-${Date.now()}`,
    actorId: currentUser.id,
    actorName: currentUser.displayName,
    action: `BATCH_${action.toUpperCase()}`,
    targetType: 'LESSON_BATCH',
    targetId: `${lessonIds.length} уроков`,
    reason: reason || `Массовое изменение статуса на ${targetStatus} для ${lessonIds.length} уроков`,
    timestamp: now,
  });

  saveDatabase(db);
}

// ---------------- Skills & Relations Management ----------------
export function getSkills(filter?: { moduleId?: string; topicId?: string }): SkillItem[] {
  const db = loadDatabase();
  let list = db.skills || [];
  if (filter?.moduleId) list = list.filter((s) => s.moduleId === filter.moduleId);
  if (filter?.topicId) list = list.filter((s) => s.topicId === filter.topicId);
  return list;
}

export function saveSkill(skill: SkillItem): void {
  const db = loadDatabase();
  if (!db.skills) db.skills = [];
  const idx = db.skills.findIndex((s) => s.id === skill.id || s.code === skill.code);
  if (idx >= 0) {
    db.skills[idx] = skill;
  } else {
    db.skills.push(skill);
  }
  saveDatabase(db);
}

export function getRelations(): RelationItem[] {
  return loadDatabase().relations || [];
}

export function saveRelation(relation: RelationItem): void {
  const db = loadDatabase();
  if (!db.relations) db.relations = [];
  const idx = db.relations.findIndex((r) => r.id === relation.id);
  if (idx >= 0) {
    db.relations[idx] = relation;
  } else {
    db.relations.push(relation);
  }
  saveDatabase(db);
}

export function deleteRelation(relationId: string): void {
  const db = loadDatabase();
  if (!db.relations) return;
  db.relations = db.relations.filter((r) => r.id !== relationId);
  saveDatabase(db);
}

// ---------------- Exams Management ----------------
export function getExams(moduleId?: string): ExamDefinition[] {
  const db = loadDatabase();
  let list = db.exams || [];
  if (moduleId) list = list.filter((e) => e.moduleId === moduleId);
  return list;
}

export function getExamById(id: string): ExamDefinition | undefined {
  return (loadDatabase().exams || []).find((e) => e.id === id);
}

export function saveExam(exam: ExamDefinition): void {
  const db = loadDatabase();
  if (!db.exams) db.exams = [];
  const idx = db.exams.findIndex((e) => e.id === exam.id);
  const now = new Date().toISOString();
  const updated = { ...exam, updatedAt: now };

  if (idx >= 0) {
    db.exams[idx] = updated;
  } else {
    db.exams.push(updated);
  }
  saveDatabase(db);
}

// ---------------- Library Files ----------------
export function getLibraryFiles(): LibraryFileItem[] {
  return loadDatabase().libraryFiles || [];
}

export function addLibraryFile(file: LibraryFileItem): void {
  const db = loadDatabase();
  if (!db.libraryFiles) db.libraryFiles = [];
  db.libraryFiles.unshift(file);
  saveDatabase(db);
}

// ---------------- Student Reports & Attempts ----------------
export function getLessonAttemptsForUser(userId: string, lessonId?: string): LessonAttempt[] {
  const db = loadDatabase();
  return db.lessonAttempts.filter(
    (a) => a.userId === userId && (!lessonId || a.lessonId === lessonId)
  );
}

export interface ReportSubmissionParams {
  userId: string;
  lessonId: string;
  report: StructuredReport;
  rawText: string;
  promptSnapshot?: string;
  promptVersion?: string;
}

export function saveReportSubmission(
  arg1: string | ReportSubmissionParams,
  arg2?: string,
  arg3?: string,
  arg4?: StructuredReport,
  arg5?: string,
  arg6?: string
): LessonAttempt {
  let userId: string;
  let lessonId: string;
  let rawReport: string;
  let structuredReport: StructuredReport;
  let promptSnapshot: string;
  let promptVersion: string;

  if (typeof arg1 === 'object') {
    userId = arg1.userId;
    lessonId = arg1.lessonId;
    structuredReport = arg1.report;
    rawReport = arg1.rawText || (typeof arg1.report === 'object' ? JSON.stringify(arg1.report) : '');
    promptSnapshot = arg1.promptSnapshot || '';
    promptVersion = arg1.promptVersion || '1.0';
  } else {
    userId = arg1;
    lessonId = arg2!;
    rawReport = arg3 || '';
    structuredReport = arg4!;
    promptSnapshot = arg5 || '';
    promptVersion = arg6 || '1.0';
  }

  const db = loadDatabase();
  const now = new Date().toISOString();
  const user = db.users.find((u) => u.id === userId) || getCurrentUser();

  const attempt: LessonAttempt = {
    id: `att-${Date.now()}`,
    userId,
    lessonId,
    promptVersion: promptVersion || '1.0',
    promptSnapshot: promptSnapshot || '',
    status: 'submitted',
    rawReport,
    structuredReport,
    score: structuredReport?.assessment?.earnedScore ?? 0,
    maxScore: structuredReport?.assessment?.maxScore ?? 100,
    mentorConfirmed: false,
    startedAt: now,
    submittedAt: now,
  };

  db.lessonAttempts.unshift(attempt);

  // Save Knowledge Gaps
  if (structuredReport.knowledgeGaps) {
    for (const g of structuredReport.knowledgeGaps) {
      if (g.status === 'needs-review') {
        db.knowledgeGaps.unshift({
          id: `gap-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          userId,
          skillId: g.skillId,
          description: g.description,
          sourceLessonId: lessonId,
          status: 'needs-review',
          mandatoryNextCheck: g.mandatoryNextCheck ?? true,
          createdAt: now,
        });
      }
    }
  }

  // Save Homework
  if (structuredReport.homework) {
    for (const hw of structuredReport.homework) {
      db.homework.unshift({
        id: hw.id || `hw-${Date.now()}`,
        lessonId,
        title: hw.title,
        description: hw.description,
        status: 'assigned',
        assignedAt: now,
      });
    }
  }

  // Admin notification
  db.notifications.unshift({
    id: `notif-${Date.now()}`,
    eventType: 'report_submitted',
    title: `Новый отчёт по занятию ${lessonId}`,
    description: `Курсант ${user.displayName} загрузил отчёт ChatGPT: результат ${attempt.score} / ${attempt.maxScore}.`,
    studentId: userId,
    studentName: user.displayName,
    relatedEntityId: attempt.id,
    status: 'unread',
    score: attempt.score,
    maxScore: attempt.maxScore,
    createdAt: now,
  });

  saveDatabase(db);
  return attempt;
}

export function updateMentorReview(
  attemptId: string,
  score: number,
  mentorFeedback: string,
  auditReason: string
): void {
  const db = loadDatabase();
  const mentor = getCurrentUser();
  const now = new Date().toISOString();

  const attempt = db.lessonAttempts.find((a) => a.id === attemptId);
  if (attempt) {
    const prevScore = attempt.score;
    attempt.score = score;
    attempt.mentorFeedback = mentorFeedback;
    attempt.mentorConfirmed = true;
    attempt.confirmedAt = now;

    db.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      actorId: mentor.id,
      actorName: mentor.displayName,
      action: 'MENTOR_REVIEW_REPORT',
      targetType: 'LESSON_ATTEMPT',
      targetId: attempt.id,
      reason: auditReason || `Проверка отчёта по уроку ${attempt.lessonId}. Изменение балла с ${prevScore} на ${score}.`,
      timestamp: now,
      previousValue: `${prevScore}`,
      newValue: `${score}`,
    });

    saveDatabase(db);
  }
}

// ---------------- Other Getters & Operations ----------------
export function getAllLessonAttempts(): LessonAttempt[] {
  return loadDatabase().lessonAttempts;
}

export function confirmLessonAttemptByMentor(
  attemptId: string,
  mentorOrFeedback?: any,
  scoreOrFeedback?: any,
  feedbackOrReason?: any,
  auditReason?: any
): void {
  const db = loadDatabase();
  const attempt = db.lessonAttempts.find((a) => a.id === attemptId);
  if (!attempt) return;

  const now = new Date().toISOString();
  let mentorUser = getCurrentUser();
  let newScore = attempt.score;
  let feedback = '';
  let reason = '';

  if (typeof mentorOrFeedback === 'object' && mentorOrFeedback !== null && mentorOrFeedback.id) {
    // Called as: (attemptId, adminUser, score, mentorFeedback, auditReason)
    mentorUser = mentorOrFeedback;
    if (typeof scoreOrFeedback === 'number') {
      newScore = scoreOrFeedback;
    }
    if (typeof feedbackOrReason === 'string') {
      feedback = feedbackOrReason;
    }
    if (typeof auditReason === 'string') {
      reason = auditReason;
    }
  } else if (typeof mentorOrFeedback === 'string') {
    // Called as: (attemptId, mentorFeedback, scoreAdjustment)
    feedback = mentorOrFeedback;
    if (typeof scoreOrFeedback === 'number') {
      newScore = scoreOrFeedback;
    }
  }

  const prevScore = attempt.score;
  attempt.score = newScore;
  attempt.mentorFeedback = feedback;
  attempt.mentorConfirmed = true;
  attempt.status = 'mentor_confirmed';
  attempt.confirmedAt = now;

  db.auditLogs.unshift({
    id: `audit-${Date.now()}`,
    actorId: mentorUser.id,
    actorName: mentorUser.displayName,
    action: 'MENTOR_CONFIRM_ATTEMPT',
    targetType: 'LESSON_ATTEMPT',
    targetId: attempt.id,
    reason: reason || `Подтверждение ментором отчёта по занятию ${attempt.lessonId}. Итоговый балл: ${attempt.score} (ранее: ${prevScore}).`,
    timestamp: now,
    previousValue: `${prevScore}`,
    newValue: `${attempt.score}`,
  });

  saveDatabase(db);
}

export function getAssessments(userId?: string): AssessmentRecord[] {
  const db = loadDatabase();
  const list = db.assessments || [];
  if (!userId) return list;
  return list.filter((a) => a.userId === userId);
}

export function saveAssessmentRecord(record: AssessmentRecord): void {
  const db = loadDatabase();
  if (!db.assessments) db.assessments = [];
  const existingIdx = db.assessments.findIndex((a) => a.id === record.id);
  if (existingIdx >= 0) {
    db.assessments[existingIdx] = record;
  } else {
    db.assessments.unshift(record);
  }
  saveDatabase(db);
}

export function confirmAssessmentByMentor(
  assessmentId: string,
  verifiedStatus: 'mentor_confirmed' | 'needs_correction',
  mentorFeedback?: string
): void {
  const db = loadDatabase();
  const mentor = getCurrentUser();
  const now = new Date().toISOString();
  if (!db.assessments) db.assessments = [];
  const assessment = db.assessments.find((a) => a.id === assessmentId);
  if (assessment) {
    assessment.verificationStatus = verifiedStatus;
    if (mentorFeedback) {
      assessment.feedback = mentorFeedback;
    }
    db.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      actorId: mentor.id,
      actorName: mentor.displayName,
      action: 'MENTOR_CONFIRM_ASSESSMENT',
      targetType: 'ASSESSMENT',
      targetId: assessment.id,
      reason: `Верификация ментором аттестации ${assessment.targetTitle} (${assessment.targetId}): статус ${verifiedStatus}.`,
      timestamp: now,
    });
    saveDatabase(db);
  }
}

export function submitHomeworkAnswer(homeworkId: string, studentAnswer: string): void {
  const db = loadDatabase();
  const hw = db.homework.find((h) => h.id === homeworkId);
  if (hw) {
    hw.studentAnswer = studentAnswer;
    hw.status = 'submitted';
    saveDatabase(db);
  }
}

export function getKnowledgeGaps(userId: string): KnowledgeGap[] {
  return loadDatabase().knowledgeGaps.filter((g) => g.userId === userId);
}

export function getHomeworkList(): HomeworkItem[] {
  return loadDatabase().homework;
}

export function getNotifications(): AdminNotification[] {
  return loadDatabase().notifications;
}

export function getAuditLogs(): AuditLogItem[] {
  return loadDatabase().auditLogs;
}

export function getGraphNodes(): GraphNode[] {
  return loadDatabase().graphNodes;
}

export function getGraphEdges(): GraphEdge[] {
  return loadDatabase().graphEdges;
}

export function getGraphData(): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const db = loadDatabase();
  if (db.graphNodes && db.graphNodes.length > 0) {
    return { nodes: db.graphNodes, edges: db.graphEdges || [] };
  }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  db.modules.forEach((m, idx) => {
    nodes.push({
      id: m.id,
      code: m.code,
      title: m.title,
      description: m.description,
      level: 1,
      moduleId: m.id,
      x: 120 + (idx % 6) * 190,
      y: 90 + Math.floor(idx / 6) * 170,
      prerequisites: m.prerequisites || [],
      futureApplications: m.futureApplications || [],
      status: m.status === 'approved' ? 'mastered' : 'not_started',
    });
  });

  db.topics.forEach((t, idx) => {
    nodes.push({
      id: t.id,
      code: t.code,
      title: t.title,
      description: t.description,
      level: 2,
      moduleId: t.moduleId,
      topicId: t.id,
      x: 100 + (idx % 4) * 210,
      y: 360 + Math.floor(idx / 4) * 160,
      prerequisites: [],
      futureApplications: [],
      status: t.status === 'approved' ? 'mastered' : 'not_started',
    });
    edges.push({
      id: `edge-${t.id}-${t.moduleId}`,
      from: t.moduleId,
      to: t.id,
      type: 'interdisciplinary',
    });
  });

  db.skills.forEach((s, idx) => {
    nodes.push({
      id: s.id,
      code: s.code,
      title: s.name,
      description: s.description,
      level: 3,
      moduleId: s.moduleId,
      topicId: s.topicId,
      x: 70 + (idx % 8) * 150,
      y: 600 + Math.floor(idx / 8) * 130,
      prerequisites: [],
      futureApplications: [],
      status: 'in_progress',
    });
  });

  db.relations.forEach((r, idx) => {
    edges.push({
      id: r.id || `rel-edge-${idx}`,
      from: r.fromId,
      to: r.toId,
      type: (r.type as any) || 'prerequisite',
      label: r.description,
    });
  });

  return { nodes, edges };
}

export function resetDatabaseToSeed(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(DB_KEY);
    // Reload from server
    syncDatabaseFromServer();
  }
}

