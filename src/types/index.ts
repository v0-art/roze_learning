/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'student' | 'admin';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  avatarUrl?: string;
  createdAt: string;
  lastSeenAt: string;
}

export type ContentStatus = 'draft' | 'under_review' | 'published' | 'archived';

export type LessonAvailabilityStatus =
  | 'not_published'
  | 'locked'
  | 'available'
  | 'in_progress'
  | 'pending_report'
  | 'submitted'
  | 'completed'
  | 'needs_review';

export type SkillMasteryStatus =
  | 'locked'
  | 'available'
  | 'in_progress'
  | 'studied'
  | 'needs_review'
  | 'confirmed';

export interface ModuleItem {
  id: string;
  code: string; // e.g. "M01"
  order: number;
  title: string;
  shortDescription: string;
  introduction: string;
  topicsCount: number;
  publishedLessonsCount: number;
  prerequisites: string[];
  status: ContentStatus;
  whyItMatters?: string;
  whatIsStudied?: string;
  futureApplications?: string[];
  updatedAt?: string;
}

export interface TopicItem {
  id: string;
  moduleId: string; // "M01"
  code: string; // "M01-T01"
  order: number;
  title: string;
  description: string;
  learningObjectives: string[];
  skillsTaught: string[];
  status: ContentStatus;
  controlWorkId?: string;
  updatedAt?: string;
}

export interface PromptVersionRecord {
  version: string; // e.g. "1.0", "1.1"
  promptText: string;
  authorId: string;
  authorName: string;
  changelog: string;
  createdAt: string;
  status: ContentStatus;
}

export interface LessonItem {
  id: string; // "M01-T01-U01"
  moduleId: string;
  topicId: string;
  code: string;
  order: number;
  title: string;
  durationEstimateMinutes: number;
  prerequisites: string[];
  objectives: string[];
  relatedSkillIds: string[];
  status: ContentStatus;
  version: string;
  promptTemplate: string;
  moduleInstructions?: string;
  generalRules?: string;
  previousLessonId?: string | null;
  nextLessonId?: string | null;
  versionHistory?: PromptVersionRecord[];
  contentHash?: string;
  updatedAt?: string;
}

export interface SkillItem {
  id: string; // "skill-m01-t01-u01-01"
  code: string;
  name: string;
  description: string;
  topicId: string;
  moduleId: string;
  lessonId: string;
  status?: ContentStatus;
}

export interface RelationItem {
  id: string;
  fromId: string;
  toId: string;
  type: 'prerequisite' | 'application' | 'application-to-module' | 'competence';
  description?: string;
}

// Structured ChatGPT Report schema
export interface QuestionResult {
  questionId: string;
  skillIds: string[];
  result: 'correct' | 'incorrect' | 'partial';
  feedback: string;
  needsRecheck: boolean;
}

export interface HomeworkItem {
  id: string;
  lessonId: string;
  title: string;
  description: string;
  skillIds?: string[];
  status?: 'assigned' | 'submitted' | 'verified' | 'rejected';
  studentAnswer?: string;
  mentorFeedback?: string;
  assignedAt?: string;
  verifiedAt?: string;
}

export interface KnowledgeGap {
  id: string;
  userId: string;
  skillId: string;
  skillName?: string;
  description: string;
  sourceLessonId: string;
  status: 'needs-review' | 'resolved';
  mandatoryNextCheck: boolean;
  createdAt: string;
  resolvedAt?: string;
}

export interface StrongSkill {
  id: string;
  skillId: string;
  skillName?: string;
  description: string;
  confirmedDate: string;
  verifiedByMentor: boolean;
}

export interface NextLessonInstructions {
  mandatoryRechecks: string[];
  homeworkChecks: string[];
  additionalChecks: string[];
}

export interface StructuredReport {
  schemaVersion: string;
  lessonId: string;
  lessonStatus: 'completed' | 'needs-review' | 'in-progress';
  coveredTopics: string[];
  assessment: {
    maxScore: number;
    earnedScore: number;
    questions: QuestionResult[];
  };
  homework: Array<{
    id: string;
    title: string;
    description: string;
  }>;
  knowledgeGaps: Array<{
    skillId: string;
    description: string;
    status: 'needs-review' | 'resolved';
    mandatoryNextCheck: boolean;
  }>;
  strongSkills: Array<{
    skillId: string;
    description: string;
  }>;
  nextLessonInstructions: NextLessonInstructions;
  studentNotes?: string;
}

export interface LessonAttempt {
  id: string;
  userId: string;
  lessonId: string;
  promptVersion: string;
  promptSnapshot: string;
  status: 'started' | 'submitted' | 'mentor_confirmed';
  rawReport?: string;
  structuredReport?: StructuredReport;
  score?: number;
  maxScore?: number;
  mentorFeedback?: string;
  mentorConfirmed: boolean;
  startedAt: string;
  submittedAt?: string;
  confirmedAt?: string;
}

export interface GraphNode {
  id: string;
  code: string;
  title: string;
  description: string;
  level: 1 | 2 | 3; // 1: Discipline, 2: Topic, 3: Skill
  moduleId: string;
  topicId?: string;
  x: number;
  y: number;
  prerequisites: string[]; // Node IDs
  futureApplications: string[]; // Node IDs
  status?: SkillMasteryStatus;
  confirmed?: boolean;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: 'prerequisite' | 'application' | 'related' | 'interdisciplinary';
  label?: string;
}

export type AssessmentType = 'daily' | 'control_work' | 'exam' | 'retake';
export type GradeClassification = 'not_passed' | 'passed' | 'good' | 'excellent';

export interface AssessmentRecord {
  id: string;
  userId: string;
  targetId: string; // e.g. M01-T01-KR01 or M01-EX01
  targetTitle: string;
  type: AssessmentType;
  attemptNumber: number;
  score: number;
  maxScore: number;
  percentage: number;
  grade: GradeClassification;
  verificationStatus: 'self_reported' | 'mentor_confirmed' | 'needs_correction';
  feedback?: string;
  requiresIntervention?: boolean;
  timestamp: string;
  details?: {
    theory1Score?: number;
    theory2Score?: number;
    practicalScore?: number;
    answersNotes?: string;
  };
}

export interface ExamTicketItem {
  ticketId: string; // e.g. "M01-EX01-B01"
  topicId: string;  // e.g. "M01-T01"
  theory1: string;
  theory2: string;
  practical: string;
  weightTheory1?: number; // e.g. 30
  weightTheory2?: number; // e.g. 30
  weightPractical?: number; // e.g. 40
}

export interface ExamDefinition {
  id: string; // e.g. "M01-EX01"
  moduleId: string;
  title: string;
  type: 'exam' | 'control';
  status: ContentStatus;
  afterTopic?: string;
  contentPath?: string;
  tickets: ExamTicketItem[];
  theoryUniqueCount?: number;
  practicalUniqueCount?: number;
  rubrics?: {
    failMaxExclusive: number; // 50
    passMaxExclusive: number; // 70
    goodMaxExclusive: number; // 80
  };
  updatedAt?: string;
}

export interface ExamTicket {
  id: string;
  ticketNumber: number;
  moduleId: string;
  theoryQuestion1: string;
  theoryQuestion2: string;
  practicalTask: string;
  topicCodes: string[];
}

export interface LibraryFileItem {
  id: string;
  name: string;
  type: 'json' | 'markdown' | 'zip' | 'schema';
  sizeBytes: number;
  checksumSha256: string;
  uploadedAt: string;
  uploadedBy: string;
  linkedEntity: string; // e.g. "M01", "M01-T01-U01", "GLOBAL"
  version: string;
  status: 'active' | 'archived' | 'superseded';
  contentPreview?: string;
  contentPath?: string;
}

export interface ImportDiffRecord {
  entityType: 'module' | 'topic' | 'lesson' | 'skill' | 'relation' | 'exam';
  entityId: string;
  entityTitle: string;
  status: 'new' | 'existing' | 'unchanged' | 'needs_update' | 'error' | 'unknown_dep';
  details: string;
  diff?: string;
}

export interface ImportSummaryResult {
  totalAnalyzed: number;
  newCount: number;
  existingCount: number;
  unchangedCount: number;
  updatedCount: number;
  errorCount: number;
  modulesCreated: number;
  topicsCreated: number;
  lessonsCreated: number;
  lessonsUpdated: number;
  skillsCreated: number;
  relationsCreated: number;
  examQuestionsCount: number;
  diffs: ImportDiffRecord[];
}

export interface AdminNotification {
  id: string;
  eventType: 'control_work' | 'exam' | 'retake_alert' | 'critical_gap' | 'student_message' | 'report_submitted';
  title: string;
  description: string;
  studentId: string;
  studentName: string;
  relatedEntityId: string;
  status: 'unread' | 'read' | 'approved' | 'returned_for_correction' | 'archived';
  score?: number;
  maxScore?: number;
  createdAt: string;
}

export interface AuditLogItem {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  reason?: string;
  timestamp: string;
  previousValue?: string;
  newValue?: string;
}

export interface MessageItem {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  recipientId: string;
  subject: string;
  content: string;
  contextRef?: {
    type: 'lesson' | 'topic' | 'assessment' | 'homework' | 'gap';
    id: string;
    title: string;
  };
  resolved: boolean;
  createdAt: string;
}
