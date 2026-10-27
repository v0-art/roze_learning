/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { FileCheck2, CheckCircle2, Clock, Send, Sparkles, AlertCircle } from "lucide-react";
import { getHomeworkList, submitHomeworkAnswer, getCurrentUser, subscribeToDatabase } from "../services/storage";
import { HomeworkItem } from "../types";

export const HomeworkView: React.FC = () => {
  const [currentUser, setUser] = useState(getCurrentUser());
  const [homework, setHomework] = useState<HomeworkItem[]>(getHomeworkList());
  const [selectedHwId, setSelectedHwId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [successMsg, setSuccessMsg] = useState(false);

  useEffect(() => {
    const unsub = subscribeToDatabase(() => {
      setUser(getCurrentUser());
      setHomework(getHomeworkList());
    });
    return unsub;
  }, []);

  const selectedHw = homework.find((h) => h.id === selectedHwId) || homework[0] || null;

  const handleSubmit = () => {
    if (!selectedHw || !answerText.trim()) return;
    submitHomeworkAnswer(selectedHw.id, answerText, currentUser);
    setSuccessMsg(true);
    setAnswerText("");
    setTimeout(() => setSuccessMsg(false), 4000);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
              Раздел 14 ТЗ
            </span>
            <span className="text-xs text-slate-400 font-mono">Домашние задания из ChatGPT уроков</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 mt-1 flex items-center space-x-2.5">
            <FileCheck2 className="w-7 h-7 text-cyan-400" />
            <span>Журнал домашних заданий</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Задания, выданные в конце уроков ChatGPT. Решения проверяются ментором и переносятся во входной контроль следующего занятия.
          </p>
        </div>
      </div>

      {homework.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-[#111B2E] p-12 text-center space-y-3">
          <Clock className="w-10 h-10 text-slate-500 mx-auto" />
          <h3 className="text-base font-bold text-slate-200">Домашние задания пока не назначены</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Пройдите занятие в ChatGPT (например, M01-T01-U01) и импортируйте отчёт. Все назначенные задания автоматически появятся здесь.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List */}
          <div className="rounded-2xl border border-slate-800 bg-[#111B2E] p-5 shadow-xl space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 pb-2 border-b border-slate-800">
              Список заданий ({homework.length})
            </h3>
            <div className="space-y-2">
              {homework.map((hw) => (
                <div
                  key={hw.id}
                  onClick={() => setSelectedHwId(hw.id)}
                  className={`p-3 rounded-xl cursor-pointer transition-all ${
                    (selectedHw?.id === hw.id)
                      ? "bg-cyan-500/10 border border-cyan-500/40"
                      : "bg-slate-900/60 border border-slate-800 hover:bg-slate-800/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-cyan-400">{hw.lessonId}</span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase ${
                        hw.status === "verified"
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                          : hw.status === "submitted"
                          ? "bg-cyan-950 text-cyan-300 border border-cyan-800"
                          : "bg-amber-950 text-amber-400 border border-amber-800"
                      }`}
                    >
                      {hw.status || "Назначено"}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-200 mt-1">{hw.title}</h4>
                </div>
              ))}
            </div>
          </div>

          {/* Active Homework Inspector / Submitter */}
          {selectedHw && (
            <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-[#111B2E] p-6 shadow-xl space-y-5">
              <div>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                  Урок: {selectedHw.lessonId}
                </span>
                <h2 className="text-xl font-bold text-slate-100 mt-2">{selectedHw.title}</h2>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
                  {selectedHw.description}
                </p>
              </div>

              {selectedHw.studentAnswer ? (
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                    Ваш отправленный ответ:
                  </span>
                  <p className="text-xs text-slate-200 font-mono whitespace-pre-wrap">
                    {selectedHw.studentAnswer}
                  </p>
                  {selectedHw.mentorFeedback && (
                    <div className="mt-3 p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300">
                      <span className="font-bold">Рецензия ментора: </span>
                      {selectedHw.mentorFeedback}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block text-xs font-medium text-slate-300">
                    Ваш ответ на домашнее задание:
                  </label>
                  <textarea
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    placeholder="Вставьте текст ответа, расчётов или ссылку на репозиторий..."
                    rows={6}
                    className="w-full rounded-lg bg-[#090F1C] border border-slate-800 p-3 text-xs text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                  />
                  <button
                    onClick={handleSubmit}
                    disabled={!answerText.trim()}
                    className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center space-x-2 transition-all active:scale-98 disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    <span>Отправить на проверку ментору</span>
                  </button>
                </div>
              )}

              {successMsg && (
                <div className="p-3 rounded-lg bg-emerald-950/80 border border-emerald-700 text-emerald-200 text-xs">
                  Ответ успешно отправлен на проверку наставнику!
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
