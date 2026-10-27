/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  Layers,
  Award,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  ShieldCheck,
  Calendar,
  Flame,
  FileCheck2,
} from "lucide-react";
import {
  getCurrentUser,
  getLessonAttemptsForUser,
  getKnowledgeGaps,
  getAssessments,
  getModules,
  subscribeToDatabase,
} from "../services/storage";

export const ProgressView: React.FC = () => {
  const [currentUser, setUser] = useState(getCurrentUser());
  const [attempts, setAttempts] = useState(getLessonAttemptsForUser(getCurrentUser().id));
  const [gaps, setGaps] = useState(getKnowledgeGaps(getCurrentUser().id));
  const [assessments, setAssessments] = useState(getAssessments(getCurrentUser().id));
  const [modules, setModules] = useState(getModules());

  useEffect(() => {
    const unsub = subscribeToDatabase(() => {
      const u = getCurrentUser();
      setUser(u);
      setAttempts(getLessonAttemptsForUser(u.id));
      setGaps(getKnowledgeGaps(u.id));
      setAssessments(getAssessments(u.id));
      setModules(getModules());
    });
    return unsub;
  }, []);

  const openGaps = gaps.filter((g) => g.status === "needs-review");
  const resolvedGaps = gaps.filter((g) => g.status === "resolved");

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
              Раздел 12 ТЗ: Аналитика
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Разделение формального прохождения и доказанного владения
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 mt-1 flex items-center space-x-2.5">
            <TrendingUp className="w-7 h-7 text-cyan-400" />
            <span>Аналитика прогресса и освоения компетенций</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Платформа строго отделяет завершение урока от фактического подтверждения навыков и отслеживает устранение пробелов.
          </p>
        </div>
      </div>

      {/* Top 3 High-Level Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="p-5 rounded-2xl border border-slate-800 bg-[#111B2E] shadow-xl">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
            <span>Пройдено уроков</span>
            <Layers className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold font-mono text-slate-100">{attempts.length}</span>
            <span className="text-xs text-slate-400 font-mono">занятий сдано</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2 font-mono">
            {attempts.filter((a) => a.mentorConfirmed).length} подтверждено ментором
          </p>
        </div>

        <div className="p-5 rounded-2xl border border-slate-800 bg-[#111B2E] shadow-xl">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
            <span>Пробелы и исправления</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold font-mono text-amber-400">{openGaps.length}</span>
            <span className="text-xs text-slate-400 font-mono">входной контроль</span>
          </div>
          <p className="text-[11px] text-emerald-400 mt-2 font-mono">
            {resolvedGaps.length} успешно устранено
          </p>
        </div>

        <div className="p-5 rounded-2xl border border-slate-800 bg-[#111B2E] shadow-xl">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
            <span>Учебный стрик</span>
            <Flame className="w-4 h-4 text-orange-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold font-mono text-orange-400">
              {attempts.length > 0 ? "1 день" : "0 дней"}
            </span>
            <span className="text-xs text-slate-400 font-mono">подтвержд. активности</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2 font-mono">
            Учитывает только реальные загруженные отчёты
          </p>
        </div>
      </div>

      {/* Completion vs Mastery Separation (Section 12.1 & 12.2) */}
      <div className="p-6 rounded-2xl border border-slate-800 bg-[#111B2E] shadow-xl space-y-4">
        <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          <span>Разделение статуса: Формальное завершение vs Доказанное владение</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <span className="text-xs font-semibold text-cyan-300 block">
              1. Статус прохождения (Completion):
            </span>
            <p className="text-xs text-slate-400 leading-relaxed">
              Фиксирует открытие материалов, копирование промпта, отправку отчёта и сдачу домашних заданий. Не гарантирует автоматическое освоение всех концепций.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <span className="text-xs font-semibold text-emerald-300 block">
              2. Подтверждённое владение (Mastery):
            </span>
            <p className="text-xs text-slate-400 leading-relaxed">
              Фиксируется только при безошибочном ответе на контрольные вопросы, успешном прохождении повторного входного контроля и подтверждении рецензией наставника.
            </p>
          </div>
        </div>
      </div>

      {/* Gaps Resolution History */}
      <div className="rounded-2xl border border-slate-800 bg-[#111B2E] p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>Реестр пробелов в знаниях (Knowledge Gaps Registry)</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono">Всего записей: {gaps.length}</span>
        </div>

        {gaps.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 bg-slate-900/40 rounded-xl">
            В данный момент пробелов не зарегистрировано. Любые ошибки тестирования в уроках ChatGPT автоматически заносятся в этот реестр.
          </div>
        ) : (
          <div className="space-y-2.5">
            {gaps.map((gap) => (
              <div
                key={gap.id}
                className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-cyan-400 font-bold">{gap.skillId}</span>
                    <span className="text-slate-400 text-[11px]">Из урока: {gap.sourceLessonId}</span>
                  </div>
                  <p className="text-slate-200 mt-1 font-medium">{gap.description}</p>
                </div>

                <div className="text-right">
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                      gap.status === "resolved"
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                        : "bg-amber-950 text-amber-400 border border-amber-800"
                    }`}
                  >
                    {gap.status === "resolved" ? "Устранено" : "Входной контроль"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
