/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  FileCheck2,
  CheckCircle2,
  Clock,
  Send,
  AlertCircle,
  HelpCircle,
  BookOpen,
  Filter,
  Check,
  RotateCcw,
  UserCheck,
  MessageSquare,
  ShieldCheck,
  Edit3,
} from "lucide-react";
import {
  getHomeworkList,
  submitHomeworkAnswer,
  verifyHomeworkItem,
  getCurrentUser,
  getAllUsers,
  subscribeToDatabase,
  syncDatabaseFromServer,
} from "../services/storage";
import { HomeworkItem, User } from "../types";

const homeworkKey = (hw: HomeworkItem) => `${hw.userId || ''}:${hw.id}`;

export const HomeworkView: React.FC = () => {
  const [currentUser, setUser] = useState<User>(getCurrentUser());
  const [homework, setHomework] = useState<HomeworkItem[]>(getHomeworkList());
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedLessonFilter, setSelectedLessonFilter] = useState<string>("all");
  
  // Independent answer state for EACH individual assignment
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Editing state for already submitted assignments
  const [editingHwIds, setEditingHwIds] = useState<Record<string, boolean>>({});
  // Mentor feedback state for each assignment
  const [mentorFeedbacks, setMentorFeedbacks] = useState<Record<string, string>>({});
  // Feedback alerts
  const [notificationMsg, setNotificationMsg] = useState<{ id: string; text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    const unsub = subscribeToDatabase(() => {
      setUser(getCurrentUser());
      setHomework(getHomeworkList());
    });
    return unsub;
  }, []);

  // Sync draft answers with already submitted answers
  useEffect(() => {
    const initialAnswers: Record<string, string> = {};
    homework.forEach((hw) => {
      if (hw.studentAnswer) {
        initialAnswers[homeworkKey(hw)] = hw.studentAnswer;
      }
    });
    setAnswers((prev) => ({ ...initialAnswers, ...prev }));
  }, [homework]);

  const isMentor = currentUser.role === "admin";

  // The mentor first chooses a student; the outline then follows the course hierarchy.
  const studentHomework = isMentor ? homework.filter(h => h.userId === selectedStudentId) : homework;
  const lessonIds = Array.from(new Set(studentHomework.map(h => h.lessonId))).sort();
  const outline = Array.from(new Set(lessonIds.map(id => id.split('-')[0]))).map(moduleId => {
    const topicIds = Array.from(new Set(lessonIds.filter(id => id.startsWith(moduleId + '-')).map(id => id.split('-').slice(0, 2).join('-'))));
    return {moduleId, topics: topicIds.map(topicId => ({topicId, lessons:lessonIds.filter(id => id.startsWith(topicId + '-'))}))};
  });
  const filteredHomework = selectedLessonFilter === 'all' ? studentHomework : studentHomework.filter(h=>h.lessonId === selectedLessonFilter);

  // Metrics
  const totalCount = studentHomework.length;
  const verifiedCount = studentHomework.filter((h) => h.status === "verified").length;
  const submittedCount = studentHomework.filter((h) => h.status === "submitted").length;
  const pendingCount = studentHomework.filter((h) => h.status === "assigned" || !h.status).length;

  const showNotification = (id: string, text: string, type: "success" | "error" = "success") => {
    setNotificationMsg({ id, text, type });
    setTimeout(() => {
      setNotificationMsg((curr) => (curr?.id === id ? null : curr));
    }, 4000);
  };

  // Submit answer for a single specific assignment
  const handleSingleSubmit = async (hw: HomeworkItem) => {
    const hwId = hw.id, key = homeworkKey(hw);
    const text = (answers[key] || "").trim();
    if (!text) {
      showNotification(key, "Поле ответа не может быть пустым. Введите решение задачи.", "error");
      return;
    }

    const response = await fetch('/api/homework', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id: hwId, answer: text})});
    if (!response.ok) { showNotification(key, 'Не удалось сохранить ответ.', 'error'); return; }
    await syncDatabaseFromServer();
    setEditingHwIds((prev) => ({ ...prev, [key]: false }));
    showNotification(key, "Ответ сохранён для входной проверки следующего урока.");
  };

  // Batch submit all answered assignments
  const handleBatchSubmit = async () => {
    let count = 0;
    for (const hw of filteredHomework) {
      const text = (answers[homeworkKey(hw)] || '').trim();
      if (!text || hw.status === 'verified' || hw.status === 'checked') continue;
      const response = await fetch('/api/homework', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id: hw.id, answer: text})});
      if (!response.ok) { showNotification('global', `Не удалось сохранить ${hw.id}. Сохранено: ${count}.`, 'error'); await syncDatabaseFromServer(); return; }
      count++;
    }
    await syncDatabaseFromServer();
    showNotification('global', count ? `Сохранено ответов: ${count}` : 'Нет заполненных ответов.', count ? 'success' : 'error');
  };

  // Mentor verification handler
  const handleMentorVerify = async (hw: HomeworkItem, status: 'verified' | 'assigned') => {
    const key = homeworkKey(hw);
    const feedback = (mentorFeedbacks[key] || '').trim();
    if (!hw.userId || !feedback) { showNotification(key, 'Для проверки нужны владелец задания и комментарий.', 'error'); return; }
    const response = await fetch('/api/mentor/homework', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({homeworkId: hw.id, userId: hw.userId, status: status === 'verified' ? 'verified' : 'needs_revision', feedback})});
    if (!response.ok) { showNotification(key, 'Не удалось сохранить решение.', 'error'); return; }
    await syncDatabaseFromServer();
    showNotification(key, status === 'verified' ? 'Задание зачтено ментором.' : 'Задание возвращено на доработку.');
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
              Раздел 14 ТЗ
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Ответы автоматически включаются в промпт следующего урока для проверки моделью
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 mt-1 flex items-center space-x-2.5">
            <FileCheck2 className="w-7 h-7 text-cyan-400" />
            <span>Журнал домашних заданий</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
            Заполните решение по каждому заданию. Ваши ответы автоматически встраиваются во <strong>входной контроль следующего урока</strong>, и модель ChatGPT проверит их в начале занятия. Ментор имеет режим аудита для просмотра решений.
          </p>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-3">
          {!isMentor && <button
            onClick={handleBatchSubmit}
            className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center space-x-2 shadow-lg shadow-cyan-500/20 transition-all active:scale-98"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Сохранить все заполненные</span>
          </button>}
        </div>
      </div>

      {notificationMsg?.id === "global" && (
        <div className={`p-4 rounded-xl text-xs font-medium border ${
          notificationMsg.type === "error" ? "bg-rose-950/80 border-rose-800 text-rose-200" : "bg-emerald-950/80 border-emerald-800 text-emerald-200"
        }`}>
          {notificationMsg.text}
        </div>
      )}

      {/* 4 Status Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl border border-slate-800 bg-[#20172f]">
          <span className="text-xs text-slate-400 uppercase font-semibold">Всего заданий</span>
          <div className="mt-1 text-2xl font-extrabold font-mono text-slate-100">{totalCount}</div>
        </div>
        <div className="p-4 rounded-2xl border border-amber-800/40 bg-amber-950/10">
          <span className="text-xs text-amber-300 uppercase font-semibold">Ожидают решения</span>
          <div className="mt-1 text-2xl font-extrabold font-mono text-amber-400">{pendingCount}</div>
        </div>
        <div className="p-4 rounded-2xl border border-cyan-800/40 bg-cyan-950/10">
          <span className="text-xs text-cyan-300 uppercase font-semibold">Готово к проверке моделью</span>
          <div className="mt-1 text-2xl font-extrabold font-mono text-cyan-400">{submittedCount}</div>
        </div>
        <div className="p-4 rounded-2xl border border-emerald-800/40 bg-emerald-950/10">
          <span className="text-xs text-emerald-300 uppercase font-semibold">Проверено и зачтено</span>
          <div className="mt-1 text-2xl font-extrabold font-mono text-emerald-400">{verifiedCount}</div>
        </div>
      </div>

      {isMentor && <label className="block rounded-xl border border-slate-700 bg-[#20172f] p-4 text-sm">Выберите ученика
        <select aria-label="Выберите ученика" value={selectedStudentId} onChange={e=>{setSelectedStudentId(e.target.value);setSelectedLessonFilter('all');}} className="ml-3 rounded-lg border border-slate-600 bg-slate-900 p-2"><option value="">Выберите ученика</option>{getAllUsers().filter(u=>u.role==='student').map(u=><option key={u.id} value={u.id}>{u.displayName}</option>)}</select>
      </label>}
      {(!isMentor || selectedStudentId) && <nav aria-label="Оглавление домашних заданий" className="rounded-2xl border border-slate-700 bg-[#20172f] p-4">
        <h2 className="mb-3 font-semibold">Оглавление заданий</h2>
        <button onClick={()=>setSelectedLessonFilter('all')} className={`rounded-lg px-3 py-2 text-sm ${selectedLessonFilter==='all'?'bg-violet-500/30':'hover:bg-slate-800'}`}>Все задания ({studentHomework.length})</button>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{outline.map(group=><details key={group.moduleId} open className="rounded-lg border border-slate-700 p-2"><summary className="cursor-pointer font-medium">{group.moduleId}</summary>{group.topics.map(topic=><details key={topic.topicId} open className="ml-3 mt-2"><summary className="cursor-pointer text-sm text-slate-300">{topic.topicId}</summary>{topic.lessons.map(id=><button key={id} onClick={()=>setSelectedLessonFilter(id)} className={`ml-3 mt-1 block rounded px-2 py-1 text-sm ${selectedLessonFilter===id?'bg-violet-500/40':'hover:bg-slate-800'}`}>{id} · {studentHomework.filter(h=>h.lessonId===id).length}</button>)}</details>)}</details>)}</div>
      </nav>}

      {/* List of assignments */}
      {filteredHomework.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-[#20172f] p-12 text-center space-y-3">
          <Clock className="w-10 h-10 text-slate-500 mx-auto" />
          <h3 className="text-base font-bold text-slate-200">{isMentor && !selectedStudentId ? "Выберите ученика" : "Домашние задания пока не назначены"}</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Пройдите занятие в ChatGPT (например, M01-T01-U01) и импортируйте отчёт. Все назначенные задания автоматически появятся здесь.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredHomework.map((hw, idx) => {
            const key = homeworkKey(hw);
            const isEditing = !isMentor && (editingHwIds[key] || !hw.studentAnswer);
            const currentAnswer = answers[key] ?? (hw.studentAnswer || "");

            let statusBadge = (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-amber-950 text-amber-400 border border-amber-800/80 flex items-center space-x-1">
                <Clock className="w-3 h-3" />
                <span>Ожидает решения</span>
              </span>
            );

            if (hw.status === "checked" || hw.status === "needs_revision" || hw.status === "not_submitted") {
              statusBadge = (
                <span className="px-2.5 py-0.5 rounded-full text-xs bg-cyan-950 text-cyan-300 border border-cyan-800">
                  {hw.status === 'checked' ? 'Проверено ИИ' : hw.status === 'needs_revision' ? 'Нужна доработка' : 'Не представлено'} — самоотчёт
                </span>
              );
            } else if (hw.status === "verified") {
              statusBadge = (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/80 flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Зачтено моделью / ментором</span>
                </span>
              );
            } else if (hw.status === "submitted") {
              statusBadge = (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-cyan-950 text-cyan-300 border border-cyan-800/80 flex items-center space-x-1">
                  <Send className="w-3 h-3" />
                  <span>Готово к проверке в след. уроке</span>
                </span>
              );
            }

            return (
              <div
                key={key}
                className="rounded-2xl border border-slate-800 bg-[#20172f] p-6 shadow-xl space-y-5 transition-all hover:border-slate-700/80"
              >
                {/* Top Bar of the Assignment */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-800">
                  <div className="flex items-center space-x-2.5">
                    <span className="px-2 py-0.5 rounded bg-slate-900 text-cyan-400 border border-cyan-900/60 font-mono text-xs font-bold">
                      {hw.lessonId}
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-300">
                      {hw.id}
                    </span>
                    {isMentor && <span className="text-xs text-violet-300">{getAllUsers().find(user => user.id === hw.userId)?.displayName || hw.userId}</span>}
                    <span className="text-slate-500">•</span>
                    <span className="text-xs font-semibold text-slate-400">
                      Задание {idx + 1}
                    </span>
                  </div>
                  <div>{statusBadge}</div>
                </div>

                {/* Assignment Title & Prompt Requirements */}
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
                    <BookOpen className="w-4 h-4 text-cyan-400" />
                    <span>{hw.title}</span>
                  </h3>
                  <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-xs sm:text-sm text-slate-300 leading-relaxed font-sans">
                    <div className="text-[11px] uppercase tracking-wider font-semibold text-cyan-400 mb-1">
                      Условия и требования к решению:
                    </div>
                    {hw.description}
                  </div>
                </div>

                {/* Notification for this specific card */}
                {notificationMsg?.id === key && (
                  <div className={`p-3 rounded-xl text-xs font-medium border ${
                    notificationMsg.type === "error"
                      ? "bg-rose-950/80 border-rose-800 text-rose-200"
                      : "bg-emerald-950/80 border-emerald-800 text-emerald-200"
                  }`}>
                    {notificationMsg.text}
                  </div>
                )}

                {/* INDIVIDUAL ANSWER FIELD FOR THIS SPECIFIC ASSIGNMENT */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5">
                      <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Ваш персональный ответ на Задание {idx + 1}:</span>
                    </label>
                    <span className="text-[11px] font-mono text-slate-500">
                      Символов: {currentAnswer.length}
                    </span>
                  </div>

                  {isEditing ? (
                    <div className="space-y-3">
                      <textarea
                        value={currentAnswer}
                        onChange={(e) =>
                          setAnswers((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        rows={5}
                        placeholder={`Введите подробный ответ на Задание ${idx + 1}: расчёты, формулы, обоснования и выводы...`}
                        className="w-full rounded-xl bg-[#110d1b] border border-slate-800 p-4 text-xs sm:text-sm text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500/50 leading-relaxed resize-y transition-all"
                      />
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] text-slate-400">
                          {hw.status === "verified"
                            ? "Задание уже проверено ментором. Повторная отправка обновит статус."
                            : "Ответ будет сохранён индивидуально для этого задания."}
                        </span>
                        <div className="flex items-center space-x-2">
                          {hw.studentAnswer && (
                            <button
                              onClick={() =>
                                setEditingHwIds((prev) => ({ ...prev, [key]: false }))
                              }
                              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
                            >
                              Отмена
                            </button>
                          )}
                          <button
                            onClick={() => handleSingleSubmit(hw)}
                            className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center space-x-1.5 shadow-lg shadow-cyan-500/20 transition-all active:scale-98"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>
                              {hw.studentAnswer ? "Обновить решение" : "Сдать это задание"}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 font-mono">
                          Отправленное решение курсантом:
                        </span>
                        {!isMentor && <button
                          onClick={() =>
                            setEditingHwIds((prev) => ({ ...prev, [key]: true }))
                          }
                          className="text-xs text-cyan-400 hover:text-cyan-300 font-bold flex items-center space-x-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Редактировать ответ</span>
                        </button>}
                      </div>
                      <p className="text-xs sm:text-sm text-slate-200 font-mono whitespace-pre-wrap leading-relaxed bg-[#110d1b] p-3.5 rounded-lg border border-slate-800/80">
                        {hw.studentAnswer}
                      </p>
                    </div>
                  )}
                </div>

                {/* Mentor Feedback Block */}
                {hw.mentorFeedback && (
                  <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/60 space-y-1.5 text-xs text-emerald-200 animate-in fade-in">
                    <div className="flex items-center space-x-1.5 font-bold text-emerald-300">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>Рецензия наставника:</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed font-sans pl-5">
                      {hw.mentorFeedback}
                    </p>
                  </div>
                )}

                {/* Mentor Audit & Supervisor Controls (Admin Mode) */}
                {isMentor && hw.studentAnswer && (
                  <div className="p-4 rounded-xl bg-slate-900/90 border border-cyan-800/40 space-y-3 mt-4">
                    <div className="flex items-center space-x-2 text-xs font-bold text-cyan-300">
                      <UserCheck className="w-4 h-4" />
                      <span>Режим аудита наставника (просмотр и супервайзинг решения {hw.id})</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Основная проверка проводится моделью во входном контроле следующего урока. Здесь наставник может оставить примечание или принудительно подтвердить/вернуть задание при необходимости.
                    </p>
                    <input
                      type="text"
                      placeholder="Укажите основание решения наставника..."
                      value={mentorFeedbacks[key] ?? (hw.mentorFeedback || "")}
                      onChange={(e) =>
                        setMentorFeedbacks((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className="w-full rounded-lg bg-[#110d1b] border border-slate-800 p-2.5 text-xs text-slate-200 font-sans focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                    />
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleMentorVerify(hw, "verified")}
                        className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center space-x-1 transition-all"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Отметить зачтённым</span>
                      </button>
                      <button
                        onClick={() => handleMentorVerify(hw, "assigned")}
                        className="px-4 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs flex items-center space-x-1 transition-all"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Вернуть на доработку</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
