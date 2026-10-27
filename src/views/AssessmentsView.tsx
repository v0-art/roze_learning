/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  Award,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCcw,
  ShieldAlert,
  ArrowRight,
  FileCheck2,
  Sparkles,
} from "lucide-react";
import {
  getAssessments,
  saveAssessmentRecord,
  getCurrentUser,
  subscribeToDatabase,
} from "../services/storage";
import { classifyScore, MAX_RETAKES_ALLOWED } from "../core/gradingEngine";
import { AssessmentRecord } from "../types";

interface AssessmentsViewProps {
  navigate: (route: string) => void;
}

export const AssessmentsView: React.FC<AssessmentsViewProps> = ({ navigate }) => {
  const [currentUser, setUser] = useState(getCurrentUser());
  const [records, setRecords] = useState<AssessmentRecord[]>(getAssessments(getCurrentUser().id));
  const [activeTab, setActiveTab] = useState<"take" | "history">("take");

  // Assessment Simulator state
  const [targetType, setTargetType] = useState<"control_work" | "exam">("control_work");
  const [theory1Score, setTheory1Score] = useState(25);
  const [theory2Score, setTheory2Score] = useState(25);
  const [practicalScore, setPracticalScore] = useState(30);
  const [answerNotes, setAnswerNotes] = useState("");
  const [lastSubmissionResult, setLastSubmissionResult] = useState<AssessmentRecord | null>(null);

  useEffect(() => {
    const unsub = subscribeToDatabase(() => {
      const u = getCurrentUser();
      setUser(u);
      setRecords(getAssessments(u.id));
    });
    return unsub;
  }, []);

  const totalScore = theory1Score + theory2Score + practicalScore;
  const maxScore = 100;

  // Determine current attempt number for this target
  const targetId = targetType === "control_work" ? "M01-T01-KR01" : "M01-EX01";
  const targetTitle =
    targetType === "control_work"
      ? "Контрольная работа M01-T01: Основы теории информации"
      : "Экзамен по дисциплине M01: Информация и вычисления";

  const pastAttemptsForTarget = records.filter((r) => r.targetId === targetId);
  const nextAttemptNumber = pastAttemptsForTarget.length + 1;

  const currentGradeEvaluation = classifyScore(totalScore, maxScore, nextAttemptNumber);

  const handleSubmit = () => {
    const record: AssessmentRecord = {
      id: `ass-${Date.now()}`,
      userId: currentUser.id,
      targetId,
      targetTitle,
      type: targetType,
      attemptNumber: nextAttemptNumber,
      score: totalScore,
      maxScore,
      percentage: currentGradeEvaluation.percentage,
      grade: currentGradeEvaluation.grade,
      verificationStatus: "self_reported",
      requiresIntervention: currentGradeEvaluation.requiresIntervention,
      timestamp: new Date().toISOString(),
      details: {
        theory1Score,
        theory2Score,
        practicalScore,
        answersNotes: answerNotes,
      },
    };

    const saved = saveAssessmentRecord(record, currentUser);
    setLastSubmissionResult(saved);
    setAnswerNotes("");
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
              Раздел 15 ТЗ: Аттестации и экзамены
            </span>
            <span className="text-xs text-slate-400 font-mono">Строгая шкала 50/70/80 • Лимит 3 пересдач</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 mt-1 flex items-center space-x-2.5">
            <Award className="w-7 h-7 text-cyan-400" />
            <span>Аттестационный центр NEXUS</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Сдача рубежных контрольных работ и официальных экзаменов по утверждённой оценочной шкале.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab("take")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "take"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Сдача аттестации
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "history"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            История попыток ({records.length})
          </button>
        </div>
      </div>

      {/* Mandatory Intervention Banner if Limit reached (Section 15.7) */}
      {currentGradeEvaluation.requiresIntervention && (
        <div className="p-4 rounded-xl bg-rose-950/70 border border-rose-700 text-rose-200 flex items-start space-x-3 shadow-xl animate-pulse">
          <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold text-sm text-rose-100">
              ВНИМАНИЕ: Исчерпан лимит из 3 пересдач для {targetTitle}!
            </p>
            <p className="text-rose-200 leading-relaxed">
              Согласно политике обучения, после третьей неудачной пересдачи автоматический допуск блокируется. Главному ментору отправлено экстренное уведомление для назначения индивидуальной консультации.
            </p>
          </div>
        </div>
      )}

      {/* Main Tab: Take Assessment */}
      {activeTab === "take" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Config & Scoring */}
          <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-[#111B2E] p-6 shadow-xl space-y-6">
            <div className="space-y-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Выберите вид контроля:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTargetType("control_work")}
                  className={`p-4 rounded-xl text-left border transition-all ${
                    targetType === "control_work"
                      ? "bg-cyan-500/10 border-cyan-500/50 shadow-md shadow-cyan-500/10"
                      : "bg-slate-900 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <span className="font-mono text-xs font-bold text-cyan-400 block">
                    M01-T01-KR01
                  </span>
                  <span className="text-sm font-bold text-slate-100 mt-1 block">
                    Рубежная контрольная работа
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
                    По теме M01-T01 (Информация и модель связи)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetType("exam")}
                  className={`p-4 rounded-xl text-left border transition-all ${
                    targetType === "exam"
                      ? "bg-cyan-500/10 border-cyan-500/50 shadow-md shadow-cyan-500/10"
                      : "bg-slate-900 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <span className="font-mono text-xs font-bold text-violet-400 block">
                    M01-EX01
                  </span>
                  <span className="text-sm font-bold text-slate-100 mt-1 block">
                    Итоговый экзамен по модулю
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
                    2 теоретических вопроса + 1 расчётная задача
                  </span>
                </button>
              </div>
            </div>

            {/* Assessment Sliders */}
            <div className="pt-4 border-t border-slate-800/80 space-y-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Баллы за выполнение заданий (Попытка #{nextAttemptNumber}):
              </h3>

              {/* Theory 1 */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-slate-300">Вопрос 1 (Теория):</span>
                  <span className="font-mono text-cyan-400 font-bold">{theory1Score} / 30 б.</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={theory1Score}
                  onChange={(e) => setTheory1Score(Number(e.target.value))}
                  className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Theory 2 */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-slate-300">Вопрос 2 (Теория / Формулы):</span>
                  <span className="font-mono text-cyan-400 font-bold">{theory2Score} / 30 б.</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={theory2Score}
                  onChange={(e) => setTheory2Score(Number(e.target.value))}
                  className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Practical Task */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-slate-300">Задание 3 (Практический расчёт / схема):</span>
                  <span className="font-mono text-cyan-400 font-bold">{practicalScore} / 40 б.</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="40"
                  value={practicalScore}
                  onChange={(e) => setPracticalScore(Number(e.target.value))}
                  className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {/* Answer Notes */}
            <div className="pt-2">
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Пояснительная записка / обоснование ответов (для аудита ментора):
              </label>
              <textarea
                value={answerNotes}
                onChange={(e) => setAnswerNotes(e.target.value)}
                placeholder="Укажите ход рассуждений или формулы..."
                rows={4}
                className="w-full rounded-lg bg-[#090F1C] border border-slate-800 p-3 text-xs text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
              />
            </div>

            {/* Action */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400 font-mono">
                Итоговый балл: <span className="font-bold text-slate-200">{totalScore} / 100</span>
              </span>

              <button
                onClick={handleSubmit}
                disabled={currentGradeEvaluation.requiresIntervention}
                className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center space-x-2 shadow-lg shadow-cyan-500/20 active:scale-98 transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                <span>Зафиксировать результат аттестации</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Real-Time Live Grade Evaluation Panel */}
          <div className="rounded-2xl border border-slate-800 bg-[#111B2E] p-6 shadow-xl flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Классификация оценки
                </span>
                <span className="font-mono text-xs text-slate-400">Попытка #{nextAttemptNumber}</span>
              </div>

              {/* Big Score Radial/Box */}
              <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 text-center space-y-2">
                <p className="text-4xl sm:text-5xl font-extrabold font-mono text-cyan-400">
                  {currentGradeEvaluation.percentage}%
                </p>
                <div className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase font-mono">
                  {currentGradeEvaluation.gradeLabelRu}
                </div>
                <p className="text-xs text-slate-400 font-mono">
                  {currentGradeEvaluation.isPassing ? "Порог успешности (50%) преодолён" : "Ниже проходного порога"}
                </p>
              </div>

              {/* Policy explanation */}
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-2">
                <p className="font-semibold text-slate-300">Правило пересдач (Раздел 15.7 ТЗ):</p>
                <p className="text-slate-400 leading-relaxed">
                  {currentGradeEvaluation.messageRu}
                </p>
              </div>

              {/* Rubric reminders */}
              <div className="text-[11px] text-slate-400 space-y-1 font-mono">
                <div className="flex justify-between">
                  <span>Отлично (80-100%):</span>
                  <span className={totalScore >= 80 ? "text-emerald-400 font-bold" : ""}>✓</span>
                </div>
                <div className="flex justify-between">
                  <span>Хорошо (70-79%):</span>
                  <span className={totalScore >= 70 && totalScore < 80 ? "text-cyan-400 font-bold" : ""}>✓</span>
                </div>
                <div className="flex justify-between">
                  <span>Зачтено (50-69%):</span>
                  <span className={totalScore >= 50 && totalScore < 70 ? "text-slate-200 font-bold" : ""}>✓</span>
                </div>
                <div className="flex justify-between">
                  <span>Не зачтено (&lt;50%):</span>
                  <span className={totalScore < 50 ? "text-rose-400 font-bold" : ""}>✓</span>
                </div>
              </div>
            </div>

            {lastSubmissionResult && (
              <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800 text-xs text-emerald-200">
                Результат попытки сохранён! Уведомление ментору отправлено.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* History of Assessment Records */
        <div className="rounded-2xl border border-slate-800 bg-[#111B2E] p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span>Протокол всех аттестационных попыток</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">Всего записей: {records.length}</span>
          </div>

          {records.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-slate-900/50 rounded-xl">
              Пока нет зафиксированных попыток рубежного контроля или экзаменов.
            </div>
          ) : (
            records.map((rec) => (
              <div key={rec.id} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-bold text-cyan-400">{rec.targetId}</span>
                      <span className="text-sm font-bold text-slate-200">{rec.targetTitle}</span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Попытка №{rec.attemptNumber} • {new Date(rec.timestamp).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-base font-mono font-bold text-slate-100">
                      {rec.score} / {rec.maxScore} ({rec.percentage}%)
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                        rec.percentage >= 50
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                          : "bg-rose-950 text-rose-400 border border-rose-800"
                      }`}
                    >
                      {rec.grade}
                    </span>
                  </div>
                </div>

                {rec.feedback && (
                  <p className="text-xs text-slate-300 p-2.5 rounded bg-slate-950/60 border border-slate-800/80">
                    <span className="text-slate-400 font-semibold">Отзыв ментора: </span>
                    {rec.feedback}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
