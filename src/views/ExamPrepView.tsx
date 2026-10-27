/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Award, BookOpen, CheckCircle2, ChevronRight, FileText, Filter, HelpCircle, Info, Sparkles } from "lucide-react";
import { EXAM_TICKETS_M01 } from "../data/seedData";
import { ExamTicket } from "../types";

interface ExamPrepViewProps {
  navigate: (route: string) => void;
}

export const ExamPrepView: React.FC<ExamPrepViewProps> = ({ navigate }) => {
  const [selectedTicketId, setSelectedTicketId] = useState<string>("M01-EX01-T01");
  const [selectedModule, setSelectedModule] = useState<string>("M01");

  const ticket = EXAM_TICKETS_M01.find((t) => t.id === selectedTicketId) || EXAM_TICKETS_M01[0];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
              Раздел 15.4 ТЗ: Открытый банк экзаменов
            </span>
            <span className="text-xs text-slate-400 font-mono">24 билета • Без скрытых вопросов</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 mt-1 flex items-center space-x-2.5">
            <Award className="w-7 h-7 text-cyan-400" />
            <span>Подготовка к экзамену: M01-EX01</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Все билеты, теоретические вопросы и практические задания открыты студентам для глубокой подготовки.
          </p>
        </div>

        <button
          onClick={() => navigate("/assessments")}
          className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center space-x-2 transition-all active:scale-98"
        >
          <span>Сдать экзамен / рубежный контроль</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Official Grading Rubric (Section 15.5) */}
      <div className="p-5 rounded-2xl border border-slate-800 bg-[#111B2E] shadow-xl">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center space-x-2">
          <Info className="w-4 h-4 text-cyan-400" />
          <span>Официальная шкала оценивания экзамена (Пороговые значения включительно):</span>
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-800/50">
            <span className="text-rose-400 font-bold font-mono text-sm">&lt; 50%</span>
            <p className="font-bold text-slate-200 mt-0.5">Не зачтено</p>
            <p className="text-[11px] text-slate-400 mt-0.5">До 3 пересдач</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-700">
            <span className="text-slate-300 font-bold font-mono text-sm">50% — 69%</span>
            <p className="font-bold text-slate-200 mt-0.5">Зачтено</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Базовый уровень</p>
          </div>
          <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-800/60">
            <span className="text-cyan-400 font-bold font-mono text-sm">70% — 79%</span>
            <p className="font-bold text-cyan-200 mt-0.5">Хорошо</p>
            <p className="text-[11px] text-cyan-300/80 mt-0.5">Твёрдые знания</p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60">
            <span className="text-emerald-400 font-bold font-mono text-sm">80% — 100%</span>
            <p className="font-bold text-emerald-200 mt-0.5">Отлично</p>
            <p className="text-[11px] text-emerald-300/80 mt-0.5">Глубокое понимание</p>
          </div>
        </div>
      </div>

      {/* Tickets Browser */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ticket Selector */}
        <div className="rounded-2xl border border-slate-800 bg-[#111B2E] p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Список билетов ({EXAM_TICKETS_M01.length})
            </h4>
            <span className="text-[11px] text-cyan-400 font-mono">Модуль M01</span>
          </div>

          <div className="max-h-[480px] overflow-y-auto space-y-1.5 pr-1">
            {EXAM_TICKETS_M01.map((t) => (
              <div
                key={t.id}
                onClick={() => setSelectedTicketId(t.id)}
                className={`p-3 rounded-xl cursor-pointer transition-all flex items-center justify-between text-xs ${
                  selectedTicketId === t.id
                    ? "bg-cyan-500/10 border border-cyan-500/40 text-cyan-300 shadow-md"
                    : "bg-slate-900/60 border border-slate-800 text-slate-300 hover:bg-slate-800/60"
                }`}
              >
                <div>
                  <span className="font-mono font-bold mr-2 text-cyan-400">Билет #{t.ticketNumber}</span>
                  <span className="text-[11px] text-slate-400">({t.topicCodes.join(", ")})</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </div>
            ))}
          </div>
        </div>

        {/* Selected Ticket Card */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-[#111B2E] p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div>
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                Экзаменационный билет #{ticket.ticketNumber}
              </span>
              <h3 className="text-xl font-bold text-slate-100 mt-2">
                Дисциплина M01: Информация, математика и основы вычислений
              </h3>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 font-mono block">Темы: {ticket.topicCodes.join(", ")}</span>
              <span className="text-xs text-cyan-400 font-mono font-semibold">100 баллов максимум</span>
            </div>
          </div>

          <div className="space-y-4">
            {/* Theory Question 1 */}
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono text-cyan-400">
                  Вопрос 1 (Теория • 30 баллов):
                </span>
                <span className="text-[11px] text-slate-400 font-mono">Глубокое теоретическое обоснование</span>
              </div>
              <p className="text-sm text-slate-200 leading-relaxed font-medium">
                {ticket.theoryQuestion1}
              </p>
            </div>

            {/* Theory Question 2 */}
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono text-cyan-400">
                  Вопрос 2 (Теория • 30 баллов):
                </span>
                <span className="text-[11px] text-slate-400 font-mono">Математический аппарат</span>
              </div>
              <p className="text-sm text-slate-200 leading-relaxed font-medium">
                {ticket.theoryQuestion2}
              </p>
            </div>

            {/* Practical Task */}
            <div className="p-4 rounded-xl bg-cyan-950/20 border border-cyan-800/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono text-cyan-300">
                  Задание 3 (Инженерная практика • 40 баллов):
                </span>
                <span className="text-[11px] text-cyan-400/80 font-mono">Расчётная задача / код</span>
              </div>
              <p className="text-sm text-slate-100 leading-relaxed font-medium">
                {ticket.practicalTask}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
