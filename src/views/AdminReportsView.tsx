/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  FileCheck2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Check,
  Search,
  Filter,
  Eye,
  MessageSquare,
  ShieldAlert,
} from "lucide-react";
import {
  getAllLessonAttempts,
  confirmLessonAttemptByMentor,
  getAssessments,
  confirmAssessmentByMentor,
  getCurrentUser,
  subscribeToDatabase,
} from "../services/storage";
import { LessonAttempt, AssessmentRecord } from "../types";

export const AdminReportsView: React.FC = () => {
  const [currentUser, setUser] = useState(getCurrentUser());
  const [attempts, setAttempts] = useState<LessonAttempt[]>(getAllLessonAttempts());
  const [assessments, setAssessments] = useState<AssessmentRecord[]>(getAssessments());
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [mentorComment, setMentorComment] = useState("");
  const [correctedScore, setCorrectedScore] = useState<number | "">("");
  const [auditReason, setAuditReason] = useState("");
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

  useEffect(() => {
    const unsub = subscribeToDatabase(() => {
      setUser(getCurrentUser());
      setAttempts(getAllLessonAttempts());
      setAssessments(getAssessments());
    });
    return unsub;
  }, []);

  const selectedAttempt = attempts.find((a) => a.id === selectedAttemptId) || attempts[0] || null;

  const handleApprove = () => {
    if (!selectedAttempt) return;
    const finalScore = typeof correctedScore === "number" ? correctedScore : selectedAttempt.score;
    confirmLessonAttemptByMentor(
      selectedAttempt.id,
      currentUser,
      finalScore,
      mentorComment || "Отчёт проверен и утверждён наставником.",
      auditReason || "Штатная верификация отчёта"
    );
    setFeedbackSuccess(true);
    setMentorComment("");
    setCorrectedScore("");
    setAuditReason("");
    setTimeout(() => setFeedbackSuccess(false), 3000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-violet-950 text-violet-400 border border-violet-800">
              Раздел 16.4 & 16.5 ТЗ: Входящие отчёты ментора
            </span>
            <span className="text-xs text-slate-400 font-mono">Все КР, экзамены и уроки появляются независимо от балла</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 mt-1 flex items-center space-x-2.5">
            <FileCheck2 className="w-7 h-7 text-cyan-400" />
            <span>Входящие отчёты и протоколы аттестаций</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Проверка представленных результатов, аудит самоотчётов ChatGPT, утверждение официальных баллов.
          </p>
        </div>
      </div>

      {attempts.length === 0 && assessments.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-[#111B2E] p-12 text-center space-y-3">
          <FileCheck2 className="w-10 h-10 text-slate-500 mx-auto" />
          <h3 className="text-base font-bold text-slate-200">Входящих отчётов пока нет</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Как только студент завершит занятие в ChatGPT или сдаст контрольную работу, запись немедленно появится здесь.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Inbox list */}
          <div className="rounded-2xl border border-slate-800 bg-[#111B2E] p-5 shadow-xl space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 pb-2 border-b border-slate-800">
              Очередь на проверку ({attempts.length + assessments.length})
            </h3>

            <div className="space-y-2 max-h-[550px] overflow-y-auto">
              {attempts.map((att) => (
                <div
                  key={att.id}
                  onClick={() => setSelectedAttemptId(att.id)}
                  className={`p-3.5 rounded-xl cursor-pointer transition-all ${
                    selectedAttempt?.id === att.id
                      ? "bg-cyan-500/10 border border-cyan-500/40"
                      : "bg-slate-900/60 border border-slate-800 hover:bg-slate-800/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-cyan-400">{att.lessonId}</span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold uppercase ${
                        att.mentorConfirmed
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                          : "bg-amber-950 text-amber-400 border border-amber-800"
                      }`}
                    >
                      {att.mentorConfirmed ? "Подтверждён" : "Самоотчёт"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 font-medium mt-1">Курсант: Алексей Смирнов</p>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    Балл: {att.score} / {att.maxScore} • {new Date(att.submittedAt || att.startedAt).toLocaleTimeString()}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Active Report Inspector */}
          {selectedAttempt && (
            <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-[#111B2E] p-6 shadow-xl space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                      {selectedAttempt.lessonId}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      Курсант: Алексей Смирнов
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-100 mt-2">
                    Детальный отчёт по занятию {selectedAttempt.lessonId}
                  </h2>
                </div>

                <div className="text-right">
                  <span className="text-2xl font-mono font-extrabold text-cyan-400 block">
                    {selectedAttempt.score} / {selectedAttempt.maxScore}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {selectedAttempt.mentorConfirmed ? "Утверждено ментором" : "Заявлено студентом"}
                  </span>
                </div>
              </div>

              {/* Questions breakdown if structured */}
              {selectedAttempt.structuredReport?.assessment?.questions && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Ответы на вопросы опроса:
                  </h4>
                  <div className="space-y-2">
                    {selectedAttempt.structuredReport.assessment.questions.map((q, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs flex justify-between items-start">
                        <div>
                          <span className="font-mono font-bold text-cyan-400 mr-2">{q.questionId}:</span>
                          <span className="text-slate-200">{q.feedback}</span>
                        </div>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase ml-2 ${
                          q.result === "correct" ? "bg-emerald-950 text-emerald-400" : "bg-rose-950 text-rose-400"
                        }`}>
                          {q.result}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Carryover rechecks */}
              {selectedAttempt.structuredReport?.nextLessonInstructions?.mandatoryRechecks && (
                <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/40 space-y-1.5 text-xs">
                  <span className="font-semibold text-amber-300 block">
                    Выявленные ошибки (перенесены во входной контроль):
                  </span>
                  {selectedAttempt.structuredReport.nextLessonInstructions.mandatoryRechecks.map((r, i) => (
                    <p key={i} className="text-amber-200/90">• {r}</p>
                  ))}
                </div>
              )}

              {/* Mentor Action Form with Audit Trail (Section 16.5) */}
              <div className="pt-4 border-t border-slate-800 space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
                  Решение наставника и аудит:
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      Скорректировать балл (если требуется):
                    </label>
                    <input
                      type="number"
                      placeholder={String(selectedAttempt.score)}
                      value={correctedScore}
                      onChange={(e) => setCorrectedScore(e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      Обоснование для аудита (Audit Reason):
                    </label>
                    <input
                      type="text"
                      placeholder="Например: Проверено решение ДЗ..."
                      value={auditReason}
                      onChange={(e) => setAuditReason(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Комментарий для студента:
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Укажите рекомендации или замечания по изученному материалу..."
                    value={mentorComment}
                    onChange={(e) => setMentorComment(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 font-mono"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-[11px] text-slate-400">
                    Каждое действие логируется с фиксацией автора и метки времени.
                  </span>

                  <button
                    onClick={handleApprove}
                    className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center space-x-2 shadow-lg shadow-emerald-500/20 active:scale-98 transition-all"
                  >
                    <Check className="w-4 h-4" />
                    <span>Утвердить результат занятия</span>
                  </button>
                </div>

                {feedbackSuccess && (
                  <div className="p-3 rounded-lg bg-emerald-950 text-emerald-300 text-xs border border-emerald-800">
                    Результат занятия успешно подтверждён и занесён в аудит!
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
