/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  BookOpen,
  ArrowLeft,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  History,
  ShieldCheck,
  FileCheck2,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import {
  getLessonById,
  getLessonAttemptsForUser,
  getKnowledgeGaps,
  getHomeworkList,
  saveReportSubmission,
  getCurrentUser,
  subscribeToDatabase,
} from "../services/storage";
import { assembleLessonPrompt } from "../core/promptEngine";
import { PromptViewer } from "../components/PromptViewer";
import { ReportImporter } from "../components/ReportImporter";
import { LessonItem, StructuredReport, LessonAttempt } from "../types";

interface LessonViewProps {
  lessonId: string;
  navigate: (route: string) => void;
}

export const LessonView: React.FC<LessonViewProps> = ({ lessonId, navigate }) => {
  const [lesson, setLesson] = useState<LessonItem | undefined>(getLessonById(lessonId));
  const [currentUser, setUser] = useState(getCurrentUser());
  const [attempts, setAttempts] = useState<LessonAttempt[]>(
    getLessonAttemptsForUser(getCurrentUser().id, lessonId)
  );
  const [allUserAttempts, setAllUserAttempts] = useState<LessonAttempt[]>(
    getLessonAttemptsForUser(getCurrentUser().id)
  );
  const [gaps, setGaps] = useState(getKnowledgeGaps(getCurrentUser().id));
  const [homework, setHomework] = useState(getHomeworkList());
  const [activeTab, setActiveTab] = useState<"workspace" | "history">("workspace");
  const [submissionSuccess, setSubmissionSuccess] = useState(false);

  useEffect(() => {
    const u = getCurrentUser();
    setUser(u);
    setLesson(getLessonById(lessonId));
    setAttempts(getLessonAttemptsForUser(u.id, lessonId));
    setAllUserAttempts(getLessonAttemptsForUser(u.id));
    setGaps(getKnowledgeGaps(u.id));
    setHomework(getHomeworkList());

    const unsub = subscribeToDatabase(() => {
      const updatedUser = getCurrentUser();
      setUser(updatedUser);
      setLesson(getLessonById(lessonId));
      setAttempts(getLessonAttemptsForUser(updatedUser.id, lessonId));
      setAllUserAttempts(getLessonAttemptsForUser(updatedUser.id));
      setGaps(getKnowledgeGaps(updatedUser.id));
      setHomework(getHomeworkList());
    });
    return unsub;
  }, [lessonId]);

  // Find previous lesson report for carryover
  const prevLessonCode = lesson?.code === "M01-T01-U02" ? "M01-T01-U01" : lesson?.code === "M01-T01-U03" ? "M01-T01-U02" : null;
  const prevAttempt = useMemo(() => {
    if (!prevLessonCode) return null;
    return allUserAttempts.find((a) => a.lessonId === prevLessonCode) || null;
  }, [prevLessonCode, allUserAttempts]);

  // Assemble the prompt deterministically
  const assembledPrompt = useMemo(() => {
    if (!lesson) return null;
    return assembleLessonPrompt({
      lesson,
      previousLessonReport: prevAttempt?.structuredReport || null,
      previousLessonId: prevLessonCode,
      unresolvedGaps: gaps.filter((g) => g.status === "needs-review"),
      pendingHomework: homework.filter((h) => h.status === "assigned"),
    });
  }, [lesson, prevAttempt, prevLessonCode, gaps, homework]);

  if (!lesson) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-xl font-bold text-slate-200">Урок {lessonId} не найден</h2>
        <button
          onClick={() => navigate("/course")}
          className="mt-4 px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-bold text-xs"
        >
          Вернуться к каталогу курсов
        </button>
      </div>
    );
  }

  // Guard: if lesson is draft or archived and user is student, do not allow opening (Test 8)
  if (lesson.status !== 'approved' && lesson.status !== 'published' && currentUser.role === 'student') {
    return (
      <div className="max-w-md mx-auto my-24 p-8 rounded-2xl border border-amber-800 bg-amber-950/40 text-center space-y-4">
        <Clock className="w-12 h-12 text-amber-400 mx-auto" />
        <h2 className="text-xl font-bold text-slate-100">Урок ожидает публикации</h2>
        <p className="text-xs text-amber-200 leading-relaxed">
          Урок <strong className="font-mono text-cyan-400">{lesson.code}</strong> находится в статусе «{lesson.status === 'draft' ? 'Черновик' : 'В архиве'}» и проходит редакционную проверку наставником. Доступ откроется после официального утверждения.
        </p>
        <button
          onClick={() => navigate("/course")}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors"
        >
          Вернуться к каталогу курсов
        </button>
      </div>
    );
  }

  const latestAttempt = attempts[0] || null;

  const handleReportConfirmed = (report: StructuredReport, rawText: string) => {
    if (!assembledPrompt) return;
    saveReportSubmission({
      userId: currentUser.id,
      lessonId: lesson.code,
      report,
      rawText,
      promptSnapshot: assembledPrompt.fullPromptText,
    });
    setSubmissionSuccess(true);
    setTimeout(() => setSubmissionSuccess(false), 5000);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-200">
      {/* Top Breadcrumb & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => navigate(`/course/${lesson.moduleId}`)}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title="Назад к дисциплине"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex items-center space-x-2">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                {lesson.code}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {lesson.moduleId} → {lesson.topicId}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-100 mt-1">
              {lesson.title}
            </h1>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {latestAttempt ? (
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-800 text-xs font-mono">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-300 font-bold">Сдан: {latestAttempt.score} / {latestAttempt.maxScore}</span>
              {latestAttempt.mentorConfirmed ? (
                <span className="text-[10px] text-cyan-400 uppercase font-semibold">(Подтверждён ментором)</span>
              ) : (
                <span className="text-[10px] text-amber-400 uppercase font-semibold">(Заявлен)</span>
              )}
            </div>
          ) : (
            <span className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-mono font-medium">
              Статус: Доступен для прохождения
            </span>
          )}
        </div>
      </div>

      {/* Success banner */}
      {submissionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-950/80 border border-emerald-700 text-emerald-200 flex items-center justify-between text-xs animate-in slide-in-from-top duration-300 shadow-xl">
          <div className="flex items-center space-x-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <div>
              <p className="font-bold text-slate-100">Отчёт успешно импортирован и проверен схемой!</p>
              <p className="text-emerald-300">
                Результаты занесены в базу данных. Входной контроль для следующего урока автоматически сформирован.
              </p>
            </div>
          </div>
          {lesson.code === "M01-T01-U01" && (
            <button
              onClick={() => navigate("/lesson/M01-T01-U02")}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs flex items-center space-x-1.5"
            >
              <span>Перейти к уроку U02</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Lesson Objectives & Specs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="md:col-span-2 p-5 rounded-2xl border border-slate-800 bg-[#111B2E] shadow-xl">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center space-x-1.5">
            <BookOpen className="w-4 h-4 text-cyan-400" />
            <span>Цели и результаты обучения (Learning Objectives)</span>
          </h3>
          <ul className="space-y-2 text-xs text-slate-300">
            {lesson.objectives.map((obj, i) => (
              <li key={i} className="flex items-start space-x-2">
                <span className="font-mono text-cyan-400 font-bold mt-0.5">{i + 1}.</span>
                <span>{obj}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-5 rounded-2xl border border-slate-800 bg-[#111B2E] shadow-xl flex flex-col justify-between space-y-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center space-x-1.5">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span>Параметры урока</span>
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800 text-slate-300">
                <span>Длительность:</span>
                <span className="font-mono font-bold text-slate-100">~{lesson.durationEstimateMinutes} мин</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800 text-slate-300">
                <span>Формат:</span>
                <span className="font-mono text-cyan-400">Внешний ChatGPT диалог</span>
              </div>
              <div className="flex justify-between py-1 text-slate-300">
                <span>Протокол отчёта:</span>
                <span className="font-mono text-slate-100">NEXUS JSON v1.0</span>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => setActiveTab(activeTab === "workspace" ? "history" : "workspace")}
              className="w-full py-2 px-3 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs text-slate-200 font-medium flex items-center justify-center space-x-1.5 transition-colors"
            >
              <History className="w-3.5 h-3.5" />
              <span>{activeTab === "workspace" ? `История попыток (${attempts.length})` : "Вернуться к уроку"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace (Step 1 -> Step 2 -> Step 3) */}
      {activeTab === "workspace" ? (
        <div className="space-y-8">
          {/* Step 1: Prompt viewer */}
          {assembledPrompt && <PromptViewer assembledPrompt={assembledPrompt} />}

          {/* Step 3: Report importer */}
          <ReportImporter currentLessonId={lesson.code} onReportConfirmed={handleReportConfirmed} />
        </div>
      ) : (
        /* History of Attempts for this Lesson */
        <div className="rounded-2xl border border-slate-800 bg-[#111B2E] p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
              <History className="w-4 h-4 text-cyan-400" />
              <span>История попыток и сдачи отчётов по уроку {lesson.code}</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">Всего попыток: {attempts.length}</span>
          </div>

          {attempts.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-slate-900/50 rounded-xl">
              По этому уроку ещё не было сдано ни одного отчёта.
            </div>
          ) : (
            attempts.map((att, idx) => (
              <div key={att.id} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-bold text-cyan-400">Попытка #{attempts.length - idx}</span>
                    <span className="text-xs text-slate-400">({new Date(att.startedAt).toLocaleString()})</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-mono font-bold text-slate-100">
                      {att.score} / {att.maxScore} баллов
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-semibold ${
                        att.mentorConfirmed
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                          : "bg-amber-950 text-amber-400 border border-amber-800"
                      }`}
                    >
                      {att.mentorConfirmed ? "Подтверждено ментором" : "Заявлено студентом"}
                    </span>
                  </div>
                </div>

                {att.mentorFeedback && (
                  <div className="p-3 rounded-lg bg-indigo-950/40 border border-indigo-800/60 text-xs text-indigo-200">
                    <span className="font-semibold text-indigo-300">Комментарий ментора: </span>
                    {att.mentorFeedback}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Next Lesson Recommendation Footer */}
      {attempts.length > 0 && lesson.code === "M01-T01-U01" && (
        <div className="p-5 rounded-2xl border border-cyan-500/40 bg-cyan-950/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-cyan-400">
              <Sparkles className="w-4 h-4" />
              <span>Следующий урок разблокирован!</span>
            </div>
            <p className="text-sm font-bold text-slate-100 mt-1">
              M01-T01-U02 — Источники информации, энтропия Хартли и Шеннона
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Все выявленные ошибки из отчёта автоматически внесены во входной контроль.
            </p>
          </div>

          <button
            onClick={() => navigate("/lesson/M01-T01-U02")}
            className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center justify-center space-x-2 transition-all shadow-md shadow-cyan-500/20 active:scale-98"
          >
            <span>Перейти к M01-T01-U02</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
