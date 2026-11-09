/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  Users,
  FileCheck2,
  AlertTriangle,
  Award,
  Clock,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  BookOpen,
} from "lucide-react";
import {
  getAllUsers,
  getAllLessonAttempts,
  getNotifications,
  getAssessments,
  getAuditLogs,
  subscribeToDatabase,
  syncDatabaseFromServer,
} from "../services/storage";

interface AdminOverviewViewProps {
  navigate: (route: string) => void;
}

export const AdminOverviewView: React.FC<AdminOverviewViewProps> = ({ navigate }) => {
  const [demo, setDemo] = useState<{state: number; available: number[]} | null>(null);
  const [demoMessage, setDemoMessage] = useState('');
  const [demoPrompt, setDemoPrompt] = useState('');
  const showDemoPrompt = async () => { const response = await fetch('/api/demo/next-prompt'); const result = await response.json(); if (response.ok) setDemoPrompt(result.prompt); else setDemoMessage(result.error || 'Не удалось подготовить просмотр.'); };
  useEffect(() => { fetch('/api/demo/status').then(r => r.ok ? r.json() : null).then(setDemo).catch(() => {}); }, []);
  const changeDemo = async (state: number) => {
    const response = await fetch('/api/demo/state', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({state})});
    if (!response.ok) { setDemoMessage('Не удалось переключить демонстрацию.'); return; }
    setDemo({...demo!, state}); setDemoPrompt(''); await syncDatabaseFromServer(); setDemoMessage(`Показано состояние после ${state} уроков. Обновите страницу ученика.`);
  };
  const [users, setUsers] = useState(getAllUsers());
  const [attempts, setAttempts] = useState(getAllLessonAttempts());
  const [notifications, setNotifications] = useState(getNotifications());
  const [assessments, setAssessments] = useState(getAssessments());
  const [auditLogs, setAuditLogs] = useState(getAuditLogs());

  useEffect(() => {
    const unsub = subscribeToDatabase(() => {
      setUsers(getAllUsers());
      setAttempts(getAllLessonAttempts());
      setNotifications(getNotifications());
      setAssessments(getAssessments());
      setAuditLogs(getAuditLogs());
    });
    return unsub;
  }, []);

  const students = users.filter((u) => u.role === "student");
  const unconfirmedAttempts = attempts.filter((a) => !a.mentorConfirmed);
  const interventionAlerts = notifications.filter((n) => n.eventType === "retake_alert");
  const pendingAssessments = assessments.filter((a) => a.verificationStatus !== "mentor_confirmed");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-200">
      {demo && <section className="rounded-2xl border border-amber-400/40 bg-amber-950/20 p-5" aria-label="Управление демонстрацией">
        <h2 className="text-lg font-bold text-amber-200">ДЕМО · СИНТЕТИЧЕСКИЕ ДАННЫЕ</h2>
        <p className="mt-1 text-sm text-slate-300">Отдельная локальная база. Состояние демонстрационного ученика: {demo.state} из 3 уроков.</p>
        <div className="mt-3 flex flex-wrap gap-2">{[0,1,2,3].map(n => <button key={n} disabled={!demo.available.includes(n)} onClick={() => void changeDemo(n)} className={`rounded-lg border px-4 py-2 text-sm ${n === demo.state ? 'border-amber-300 bg-amber-200 text-slate-950' : 'border-slate-600 text-slate-200'} disabled:opacity-40`}>{n} уроков</button>)}</div>
        <button onClick={() => void showDemoPrompt()} disabled={demo.state !== 3} className="mt-3 rounded-lg border border-amber-400/50 px-3 py-2 text-sm text-amber-100 disabled:opacity-40">Предпросмотр следующего урока (только ментор)</button>
        {demoPrompt && <label className="mt-3 block text-sm text-amber-100">M01-T02-U02 · черновик, ученику не открыт<textarea readOnly value={demoPrompt} className="mt-2 block h-64 w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-xs text-slate-200" /></label>}
        {demoMessage && <p role="status" className="mt-2 text-sm text-amber-200">{demoMessage}</p>}
      </section>}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-violet-950 text-violet-400 border border-violet-800">
              Рабочее место наставника (Раздел 16 ТЗ)
            </span>
            <span className="text-xs text-slate-400 font-mono">Главный ментор Rozephyr</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 mt-1 flex items-center space-x-2.5">
            <Users className="w-7 h-7 text-violet-400" />
            <span>Панель управления и надзора за обучением</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Контроль успеваемости курсантов, валидация отчётов ChatGPT, утверждение рубежных работ и аудит оценок.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => navigate("/admin/reports")}
            className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center space-x-1.5 shadow-md shadow-cyan-500/20 transition-all"
          >
            <FileCheck2 className="w-4 h-4" />
            <span>Входящие отчёты ({unconfirmedAttempts.length + pendingAssessments.length})</span>
          </button>

          <button onClick={() => navigate("/admin/users")} className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold">Ученики</button>
          <button
            onClick={() => navigate("/admin/content")}
            className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center space-x-1.5 transition-all"
          >
            <BookOpen className="w-4 h-4 text-violet-400" />
            <span>Учебный план</span>
          </button>
        </div>
      </div>

      {/* 4 Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl border border-slate-800 bg-[#20172f] shadow-xl">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Курсантов</span>
          <p className="text-3xl font-extrabold font-mono text-slate-100 mt-2">{students.length}</p>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">1 активный в M01</p>
        </div>

        <div className="p-5 rounded-2xl border border-slate-800 bg-[#20172f] shadow-xl">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Ожидают проверки</span>
          <p className="text-3xl font-extrabold font-mono text-cyan-400 mt-2">{unconfirmedAttempts.length}</p>
          <p className="text-[11px] text-slate-400 mt-1 font-mono">Отчёты занятий</p>
        </div>

        <div className="p-5 rounded-2xl border border-slate-800 bg-[#20172f] shadow-xl">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Аттестации / КР</span>
          <p className="text-3xl font-extrabold font-mono text-violet-400 mt-2">{assessments.length}</p>
          <p className="text-[11px] text-slate-400 mt-1 font-mono">Сданные работы</p>
        </div>

        <div className="p-5 rounded-2xl border border-slate-800 bg-[#20172f] shadow-xl">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Требуют внимания</span>
          <p className={`text-3xl font-extrabold font-mono mt-2 ${interventionAlerts.length > 0 ? "text-rose-400" : "text-emerald-400"}`}>
            {interventionAlerts.length}
          </p>
          <p className="text-[11px] text-slate-400 mt-1 font-mono">Лимиты пересдач</p>
        </div>
      </div>

      {/* Review Queue & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Review Queue */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-[#20172f] p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
              <FileCheck2 className="w-4 h-4 text-cyan-400" />
              <span>Очередь верификации отчётов и аттестаций</span>
            </h3>
            <button
              onClick={() => navigate("/admin/reports")}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold"
            >
              Все отчёты →
            </button>
          </div>

          {unconfirmedAttempts.length === 0 && pendingAssessments.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-slate-900/40 rounded-xl">
              Очередь рецензирования пуста. Все сданные результаты подтверждены наставником.
            </div>
          ) : (
            <div className="space-y-3">
              {unconfirmedAttempts.map((att) => (
                <div
                  key={att.id}
                  onClick={() => navigate("/admin/reports")}
                  className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 cursor-pointer transition-all flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-bold text-cyan-400">{att.lessonId}</span>
                      <span className="text-xs text-slate-300 font-semibold">{users.find(u => u.id === att.userId)?.displayName || att.userId}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 uppercase">
                        Самоотчёт
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Заявлен результат: {att.score} / {att.maxScore} баллов.
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Audit Trail Snippet */}
        <div className="rounded-2xl border border-slate-800 bg-[#20172f] p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Журнал аудита (Audit Trail)</span>
            </h3>
          </div>

          <div className="space-y-3 max-h-72 overflow-y-auto">
            {auditLogs.slice(0, 6).map((log) => (
              <div key={log.id} className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>{log.actorName.split(" ")[0]}</span>
                  <span>{new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p className="font-mono font-bold text-cyan-300 mt-0.5">{log.action}</p>
                <p className="text-slate-400 text-[11px] mt-0.5">{log.reason}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
