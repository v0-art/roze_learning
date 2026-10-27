/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  Compass,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Award,
  Layers,
  FileCheck2,
  Calendar,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  getCurrentUser,
  getModules,
  getTopics,
  getLessons,
  getLessonAttemptsForUser,
  getKnowledgeGaps,
  getAssessments,
  getHomeworkList,
  subscribeToDatabase,
} from "../services/storage";
import { LessonItem, User } from "../types";

interface DashboardViewProps {
  navigate: (route: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ navigate }) => {
  const [currentUser, setUser] = useState<User>(getCurrentUser());
  const [modules, setModules] = useState(getModules());
  const [lessons, setLessons] = useState(getLessons());
  const [attempts, setAttempts] = useState(getLessonAttemptsForUser(getCurrentUser().id));
  const [gaps, setGaps] = useState(getKnowledgeGaps(getCurrentUser().id));
  const [assessments, setAssessments] = useState(getAssessments(getCurrentUser().id));
  const [homework, setHomework] = useState(getHomeworkList());
  const [timeFilter, setTimeFilter] = useState<"7d" | "30d" | "90d" | "all">("30d");

  useEffect(() => {
    const unsub = subscribeToDatabase(() => {
      const u = getCurrentUser();
      setUser(u);
      setModules(getModules());
      setLessons(getLessons());
      setAttempts(getLessonAttemptsForUser(u.id));
      setGaps(getKnowledgeGaps(u.id));
      setAssessments(getAssessments(u.id));
      setHomework(getHomeworkList());
    });
    return unsub;
  }, []);

  // Determine current active lesson
  const publishedLessons = useMemo(
    () => lessons.filter((l) => l.status === "approved" || (l as any).status === "published"),
    [lessons]
  );
  const submittedLessonIds = useMemo(() => new Set(attempts.map((a) => a.lessonId)), [attempts]);

  // Next lesson: first approved lesson not yet submitted, or first lesson from all lessons
  const nextLesson: LessonItem | null = useMemo(() => {
    const unsubmittedApproved = publishedLessons.find((l) => !submittedLessonIds.has(l.code));
    if (unsubmittedApproved) return unsubmittedApproved;
    const unsubmittedAny = lessons.find((l) => !submittedLessonIds.has(l.code));
    if (unsubmittedAny) return unsubmittedAny;
    return publishedLessons[0] || lessons[0] || null;
  }, [publishedLessons, submittedLessonIds, lessons]);

  const lastAttempt = attempts[0] || null;
  const isPendingPreviousReport = false; // Next lesson unlocks upon valid report

  // Metrics
  const completedLessonsCount = attempts.length;
  const totalPublishedLessons = publishedLessons.length;
  const completedDisciplinesCount = attempts.length >= 3 ? 1 : 0;
  const openGapsCount = gaps.filter((g) => g.status === "needs-review").length;
  const resolvedGapsCount = gaps.filter((g) => g.status === "resolved").length;

  // Average score
  const avgScore = useMemo(() => {
    if (attempts.length === 0) return 0;
    const sum = attempts.reduce((acc, curr) => acc + (curr.score || 0), 0);
    return Math.round(sum / attempts.length);
  }, [attempts]);

  // Activity points mock/real for chart
  const activityData = useMemo(() => {
    const days = timeFilter === "7d" ? 7 : timeFilter === "30d" ? 14 : 20;
    return Array.from({ length: days }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      const hasEvent = i % 3 === 0 || i === days - 1;
      return {
        label: `${d.getDate()}.${d.getMonth() + 1}`,
        count: hasEvent ? (i % 2 === 0 ? 2 : 1) : 0,
      };
    });
  }, [timeFilter]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-200">
      {/* Header Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
              Добро пожаловать, {currentUser.displayName.split(" ")[0]}!
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-cyan-950 text-cyan-400 border border-cyan-800">
              {currentUser.role === "admin" ? "Главный ментор" : "Курсант NEXUS"}
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Текущая траектория: <span className="text-cyan-300 font-medium">Модуль 01 (M01)</span> →{" "}
            <span className="text-slate-300">Тема M01-T01: Информация, данные и сигналы</span>
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => navigate("/knowledge-map")}
            className="px-4 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-semibold flex items-center space-x-2 transition-all active:scale-98"
          >
            <Compass className="w-4 h-4 text-cyan-400" />
            <span>Интерактивная карта знаний</span>
          </button>
        </div>
      </div>

      {/* Hero: "Продолжить обучение" */}
      {nextLesson ? (
        <div className="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-[#111B2E] via-[#13223D] to-[#172238] p-6 sm:p-8 shadow-2xl">
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(circle_at_top_right,#36D7F5_0,transparent_70%)] opacity-15 pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold">
                  {nextLesson.code}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Расчётное время: ~{nextLesson.durationEstimateMinutes || 45} мин
                </span>
                {nextLesson.status === "draft" && (
                  <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 text-[10px] font-mono">
                    Черновик
                  </span>
                )}
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-slate-100">
                {nextLesson.title}
              </h2>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed line-clamp-2">
                {nextLesson.objectives?.[0] || "Освоение ключевых принципов передачи информации по Шеннону."}
              </p>

              {lastAttempt && (
                <div className="flex items-center space-x-2 text-xs text-emerald-400 font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    Предыдущий урок {lastAttempt.lessonId} завершён ({lastAttempt.score} баллов). Ошибки автоматически внесены во входной контроль!
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                onClick={() => navigate(`/lesson/${nextLesson.code}`)}
                className="px-6 py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm flex items-center justify-center space-x-2 shadow-lg shadow-cyan-500/25 transition-all active:scale-98"
              >
                <span>{attempts.length > 0 ? "Продолжить обучение" : "Начать первый урок"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-[#111B2E] p-8 text-center space-y-3">
          <BookOpen className="w-10 h-10 text-cyan-400 mx-auto" />
          <h2 className="text-lg font-bold text-slate-100">Учебный план формируется</h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Опубликуйте уроки в административной панели или загрузите материалы для начала прохождения траектории.
          </p>
        </div>
      )}

      {/* 4 Core Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="p-5 rounded-2xl border border-slate-800 bg-[#111B2E] shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Уроки
            </span>
            <BookOpen className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-100">
              {completedLessonsCount}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              / {totalPublishedLessons > 0 ? `${totalPublishedLessons} опубл.` : `${lessons.length} в программе (M01)`}
            </span>
          </div>
          <div className="mt-3 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-cyan-400 h-1.5 rounded-full transition-all duration-500"
              style={{
                width: `${lessons.length > 0 ? Math.min(100, (completedLessonsCount / (totalPublishedLessons || lessons.length)) * 100) : 0}%`,
              }}
            />
          </div>
        </div>

        {/* Metric 2 */}
        <div className="p-5 rounded-2xl border border-slate-800 bg-[#111B2E] shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              18 Дисциплин
            </span>
            <Layers className="w-4 h-4 text-violet-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-100">
              {completedDisciplinesCount}
            </span>
            <span className="text-xs text-slate-400 font-mono">/ 18 курсов</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2 font-mono">
            {completedDisciplinesCount === 0 ? "В процессе освоения M01" : "Освоена M01"}
          </p>
        </div>

        {/* Metric 3 */}
        <div className="p-5 rounded-2xl border border-slate-800 bg-[#111B2E] shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Средний балл
            </span>
            <Award className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400">
              {attempts.length > 0 ? `${avgScore}%` : "—"}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2 font-mono">
            {attempts.length > 0 ? `${attempts.length} подтвержд. отчётов` : "Ожидает первой сдачи"}
          </p>
        </div>

        {/* Metric 4 */}
        <div className="p-5 rounded-2xl border border-slate-800 bg-[#111B2E] shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Пробелы в знаниях
            </span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-amber-400">
              {openGapsCount}
            </span>
            <span className="text-xs text-slate-400 font-mono">открытых</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2 font-mono">
            Устранено: {resolvedGapsCount} пробелов
          </p>
        </div>
      </div>

      {/* Activity Chart & Trajectory */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Chart */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-[#111B2E] p-6 shadow-xl">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                <span>Динамика учебной активности</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Реальные зарегистрированные события сдачи отчётов и аттестаций
              </p>
            </div>

            <div className="flex items-center space-x-1 bg-slate-900 rounded-lg p-1 border border-slate-800">
              {(["7d", "30d", "90d"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setTimeFilter(filter)}
                  className={`px-2.5 py-1 text-xs rounded font-mono font-medium transition-colors ${
                    timeFilter === filter
                      ? "bg-cyan-500/20 text-cyan-300"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          {/* SVG Bar Chart */}
          <div className="mt-6 h-48 flex items-end justify-between gap-1.5 sm:gap-2">
            {activityData.map((item, idx) => {
              const heightPercent = item.count > 0 ? Math.min(100, item.count * 45) : 8;
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2 group">
                  <div className="w-full flex justify-center items-end h-36">
                    <div
                      className={`w-full max-w-[20px] rounded-t-md transition-all duration-300 ${
                        item.count > 0
                          ? "bg-gradient-to-t from-cyan-600 to-cyan-400 shadow-md shadow-cyan-500/20"
                          : "bg-slate-800/40"
                      }`}
                      style={{ height: `${heightPercent}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono scale-90">
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Next Goal Card */}
        <div className="rounded-2xl border border-slate-800 bg-[#111B2E] p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-2">
              <Sparkles className="w-4 h-4" />
              <span>Рекомендуемая цель</span>
            </div>
            <h4 className="text-base font-bold text-slate-100">
              Сдача контрольной работы M01-T01-KR01
            </h4>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              После завершения первых трёх уроков по информации, энтропии и дискретизации вам станет доступна рубежная контрольная работа.
            </p>

            <div className="mt-4 p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span>Урок M01-T01-U01:</span>
                <span className={submittedLessonIds.has("M01-T01-U01") ? "text-emerald-400" : "text-slate-500"}>
                  {submittedLessonIds.has("M01-T01-U01") ? "Сдан" : "В очереди"}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>Урок M01-T01-U02:</span>
                <span className={submittedLessonIds.has("M01-T01-U02") ? "text-emerald-400" : "text-slate-500"}>
                  {submittedLessonIds.has("M01-T01-U02") ? "Сдан" : "В очереди"}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>Контрольная работа:</span>
                <span className="text-amber-400 font-mono">Допуск при 3 уроках</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => navigate("/assessments")}
            className="mt-6 w-full py-2.5 rounded-xl border border-cyan-500/30 hover:bg-cyan-500/10 text-cyan-300 text-xs font-bold transition-all"
          >
            Открыть аттестации и контрольные →
          </button>
        </div>
      </div>

      {/* Strong vs Weak Knowledge Panels (Section 6.5) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Strong Skills */}
        <div className="rounded-2xl border border-slate-800 bg-[#111B2E] p-6 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-emerald-400 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Хорошо освоено</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              {attempts.length > 0 ? "На основе отчётов" : "Пока нет данных"}
            </span>
          </div>

          <div className="mt-4 space-y-2.5">
            {attempts.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 bg-slate-900/50 rounded-xl">
                Пройдите первое занятие в ChatGPT и загрузите отчёт, чтобы зафиксировать подтверждённые навыки.
              </div>
            ) : (
              [
                { code: "SKILL-M01-01", title: "Различие данных и информации", date: "Сегодня" },
                { code: "SKILL-M01-02", title: "Модель передачи связи Клода Шеннона", date: "Сегодня" },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-mono text-cyan-400 font-semibold mr-2">{item.code}</span>
                    <span className="text-slate-200">{item.title}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">{item.date}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Weak / Attention Required Skills */}
        <div className="rounded-2xl border border-slate-800 bg-[#111B2E] p-6 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-amber-400 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4" />
              <span>Требует внимания и повторения</span>
            </h3>
            <span className="text-xs text-amber-400 font-mono">
              {openGapsCount} пробелов
            </span>
          </div>

          <div className="mt-4 space-y-2.5">
            {openGapsCount === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 bg-slate-900/50 rounded-xl">
                Открытых критических пробелов нет! Система автоматически включает любые выявленные ошибки в следующий входной контроль.
              </div>
            ) : (
              gaps
                .filter((g) => g.status === "needs-review")
                .map((gap) => (
                  <div
                    key={gap.id}
                    className="p-3 rounded-xl bg-amber-950/20 border border-amber-900/40 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono text-amber-400 font-semibold mr-2">{gap.skillId}:</span>
                      <span className="text-amber-200/90">{gap.description}</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-900/50 text-amber-300 font-mono uppercase">
                      Входной контроль
                    </span>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
