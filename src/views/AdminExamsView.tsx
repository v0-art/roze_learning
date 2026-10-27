/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Award,
  CheckCircle2,
  Clock,
  Edit3,
  Plus,
  Save,
  Send,
  Download,
  Search,
  ArrowLeft,
  FileText,
  AlertTriangle,
  HelpCircle,
  Sliders,
} from 'lucide-react';
import {
  getExams,
  saveExam,
  getCurrentUser,
  subscribeToDatabase,
} from '../services/storage';
import { ExamDefinition, ExamTicketItem } from '../types';

interface AdminExamsViewProps {
  navigate?: (route: string) => void;
}

export const AdminExamsView: React.FC<AdminExamsViewProps> = ({ navigate }) => {
  const [exams, setExams] = useState<ExamDefinition[]>(getExams());
  const [activeExamId, setActiveExamId] = useState<string>('M01-EX01');
  const [selectedTicketId, setSelectedTicketId] = useState<string>('M01-EX01-B01');
  const [searchQuery, setSearchQuery] = useState('');
  const [saveNotice, setSaveNotice] = useState(false);

  // Edit ticket state
  const [theory1, setTheory1] = useState('');
  const [theory2, setTheory2] = useState('');
  const [practical, setPractical] = useState('');
  const [weightT1, setWeightT1] = useState(30);
  const [weightT2, setWeightT2] = useState(30);
  const [weightP, setWeightP] = useState(40);

  useEffect(() => {
    const unsub = subscribeToDatabase(() => {
      setExams(getExams());
    });
    return unsub;
  }, []);

  const currentExam = exams.find((e) => e.id === activeExamId) || exams[0];

  const activeTicket = currentExam?.tickets?.find((t) => t.ticketId === selectedTicketId) || currentExam?.tickets?.[0];

  useEffect(() => {
    if (activeTicket) {
      setTheory1(activeTicket.theory1);
      setTheory2(activeTicket.theory2);
      setPractical(activeTicket.practical);
      setWeightT1(activeTicket.weightTheory1 || 30);
      setWeightT2(activeTicket.weightTheory2 || 30);
      setWeightP(activeTicket.weightPractical || 40);
    }
  }, [activeTicket, selectedTicketId]);

  // Compute unique counts
  const uniqueTheoryCount = currentExam ? new Set(currentExam.tickets.flatMap((t) => [t.theory1, t.theory2])).size : 0;
  const uniquePracticalCount = currentExam ? new Set(currentExam.tickets.map((t) => t.practical)).size : 0;

  const handleSaveTicket = () => {
    if (!currentExam || !activeTicket) return;
    const updatedTickets = currentExam.tickets.map((t) => {
      if (t.ticketId === activeTicket.ticketId) {
        return {
          ...t,
          theory1,
          theory2,
          practical,
          weightTheory1: weightT1,
          weightTheory2: weightT2,
          weightPractical: weightP,
        };
      }
      return t;
    });

    saveExam({
      ...currentExam,
      tickets: updatedTickets,
      theoryUniqueCount: uniqueTheoryCount,
      practicalUniqueCount: uniquePracticalCount,
    });

    setSaveNotice(true);
    setTimeout(() => setSaveNotice(false), 2500);
  };

  const handleTogglePublishExam = () => {
    if (!currentExam) return;
    const nextStatus = currentExam.status === 'published' ? 'draft' : 'published';
    saveExam({
      ...currentExam,
      status: nextStatus,
    });
  };

  const filteredTickets = currentExam?.tickets.filter((t) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.ticketId.toLowerCase().includes(q) ||
      t.theory1.toLowerCase().includes(q) ||
      t.theory2.toLowerCase().includes(q) ||
      t.practical.toLowerCase().includes(q)
    );
  }) || [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            {navigate && (
              <button
                onClick={() => navigate('/admin/content')}
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center space-x-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Назад к редактору курса</span>
              </button>
            )}
            <span className="text-xs text-slate-500">•</span>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 font-semibold tracking-wider">
              Раздел 11 ТЗ
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight mt-1 flex items-center space-x-2">
            <Award className="w-6 h-6 text-amber-400" />
            <span>Управление экзаменационными банками и билетами</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Контроль открытого банка билетов (24 билета: ровно 2 теоретических вопроса + 1 практическая задача).
          </p>
        </div>

        {/* Global actions */}
        <div className="flex items-center space-x-2">
          {currentExam && (
            <button
              onClick={handleTogglePublishExam}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md flex items-center space-x-1.5 ${
                currentExam.status === 'published'
                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-slate-950 shadow-emerald-600/20'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{currentExam.status === 'published' ? 'Снять с публикации (в черновик)' : 'Утвердить и опубликовать экзамен'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Constraints & Limits Verification Card (Section 11) */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
        <div className="p-3.5 rounded-xl bg-[#111B2E] border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Всего билетов</span>
            <strong className="text-slate-100 text-lg font-mono">{currentExam?.tickets?.length || 0}</strong>
          </div>
          <span className="text-[10px] text-cyan-400 font-mono">Требуется: 24</span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#111B2E] border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Уникальных теор. вопросов</span>
            <strong className="text-emerald-400 text-lg font-mono">{uniqueTheoryCount}</strong>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Лимит: ≤ 50</span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#111B2E] border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Уникальных задач</span>
            <strong className="text-emerald-400 text-lg font-mono">{uniquePracticalCount}</strong>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Лимит: ≤ 25</span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#111B2E] border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Статус экзамена</span>
            <strong className={`text-xs uppercase font-mono px-2 py-0.5 rounded ${
              currentExam?.status === 'published'
                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                : 'bg-amber-950 text-amber-400 border border-amber-800'
            }`}>
              {currentExam?.status === 'published' ? 'Опубликован' : 'Черновик наставника'}
            </strong>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">Шкала 50/70/80</span>
        </div>
      </div>

      {/* Main Grid: Ticket Selector & Ticket Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Tickets List */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-800 bg-[#111B2E] p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <span className="text-xs font-bold text-slate-100">Список билетов ({filteredTickets.length})</span>
            <span className="text-[11px] text-cyan-400 font-mono">{currentExam?.id}</span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Поиск по номеру или вопросу..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="max-h-[520px] overflow-y-auto space-y-1 font-mono text-xs pr-1">
            {filteredTickets.map((t) => {
              const isSelected = activeTicket?.ticketId === t.ticketId;
              return (
                <div
                  key={t.ticketId}
                  onClick={() => setSelectedTicketId(t.ticketId)}
                  className={`p-2.5 rounded-xl cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                      : 'hover:bg-slate-800/60 text-slate-300 bg-slate-900/40 border border-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-cyan-400 text-xs">{t.ticketId}</span>
                    <span className="text-[10px] text-slate-500">{t.topicId}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate mt-1 font-sans">
                    1. {t.theory1}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Ticket Content & Weight Editor */}
        <div className="lg:col-span-8 rounded-2xl border border-slate-800 bg-[#111B2E] p-6 shadow-xl space-y-6">
          {activeTicket ? (
            <>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <span className="text-xs font-mono font-bold text-cyan-400">{activeTicket.ticketId}</span>
                  <h3 className="text-base font-bold text-slate-100">Тема: {activeTicket.topicId}</h3>
                </div>
                <div className="text-right text-xs font-mono text-slate-400">
                  Сумма баллов: <strong className="text-slate-100">{weightT1 + weightT2 + weightP}</strong> / 100
                </div>
              </div>

              {/* Theory Question 1 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <label className="font-bold flex items-center space-x-1.5">
                    <FileText className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Вопрос 1 (Теория)</span>
                  </label>
                  <div className="flex items-center space-x-1 font-mono">
                    <span>Вес:</span>
                    <input
                      type="number"
                      value={weightT1}
                      onChange={(e) => setWeightT1(parseInt(e.target.value, 10) || 0)}
                      className="w-14 px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-center text-xs"
                    />
                    <span>баллов</span>
                  </div>
                </div>
                <textarea
                  rows={3}
                  value={theory1}
                  onChange={(e) => setTheory1(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-800 bg-slate-950 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 leading-relaxed"
                />
              </div>

              {/* Theory Question 2 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <label className="font-bold flex items-center space-x-1.5">
                    <FileText className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Вопрос 2 (Теория)</span>
                  </label>
                  <div className="flex items-center space-x-1 font-mono">
                    <span>Вес:</span>
                    <input
                      type="number"
                      value={weightT2}
                      onChange={(e) => setWeightT2(parseInt(e.target.value, 10) || 0)}
                      className="w-14 px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-center text-xs"
                    />
                    <span>баллов</span>
                  </div>
                </div>
                <textarea
                  rows={3}
                  value={theory2}
                  onChange={(e) => setTheory2(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-800 bg-slate-950 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 leading-relaxed"
                />
              </div>

              {/* Practical Task */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <label className="font-bold flex items-center space-x-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Задание 3 (Инженерная практика / расчетная задача)</span>
                  </label>
                  <div className="flex items-center space-x-1 font-mono">
                    <span>Вес:</span>
                    <input
                      type="number"
                      value={weightP}
                      onChange={(e) => setWeightP(parseInt(e.target.value, 10) || 0)}
                      className="w-14 px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-center text-xs"
                    />
                    <span>баллов</span>
                  </div>
                </div>
                <textarea
                  rows={3}
                  value={practical}
                  onChange={(e) => setPractical(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-800 bg-slate-950 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 leading-relaxed"
                />
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <button
                  onClick={handleSaveTicket}
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center space-x-1.5 transition-all shadow-md shadow-cyan-500/20"
                >
                  <Save className="w-4 h-4" />
                  <span>Сохранить билет {activeTicket.ticketId}</span>
                </button>

                {saveNotice && (
                  <span className="text-xs text-emerald-400 font-medium flex items-center space-x-1 animate-pulse">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Билет сохранён в постоянной базе!</span>
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-xs text-slate-400">
              Выберите билет из списка слева для просмотра и редактирования
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
