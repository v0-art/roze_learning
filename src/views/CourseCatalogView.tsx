/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { BookOpen, Layers, ArrowRight, Search, CheckCircle2, Lock, Clock, Filter } from "lucide-react";
import { getModules, subscribeToDatabase, getLessonAttemptsForUser, getCurrentUser } from "../services/storage";
import { ModuleItem } from "../types";

interface CourseCatalogViewProps {
  navigate: (route: string) => void;
}

export const CourseCatalogView: React.FC<CourseCatalogViewProps> = ({ navigate }) => {
  const [modules, setModules] = useState<ModuleItem[]>(getModules());
  const [attempts, setAttempts] = useState(getLessonAttemptsForUser(getCurrentUser().id));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    const unsub = subscribeToDatabase(() => {
      setModules(getModules());
      setAttempts(getLessonAttemptsForUser(getCurrentUser().id));
    });
    return unsub;
  }, []);

  const filteredModules = useMemo(() => {
    return modules.filter((m) => {
      const matchSearch =
        search === "" ||
        m.title.toLowerCase().includes(search.toLowerCase()) ||
        m.code.toLowerCase().includes(search.toLowerCase()) ||
        m.shortDescription.toLowerCase().includes(search.toLowerCase());

      const matchStatus = statusFilter === "all" || m.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [modules, search, statusFilter]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "published":
        return { label: "Опубликован", color: "bg-emerald-950 text-emerald-400 border-emerald-800" };
      case "under_review":
        return { label: "На рецензии", color: "bg-amber-950 text-amber-400 border-amber-800" };
      case "draft":
      default:
        return { label: "В разработке", color: "bg-slate-800 text-slate-400 border-slate-700" };
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800/80">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight flex items-center space-x-3">
            <BookOpen className="w-7 h-7 text-cyan-400" />
            <span>Учебная программа: 18 Дисциплин</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Фундаментальная подготовка инженера телекоммуникаций и информационной безопасности от математических основ до проектирования защищённых сетей.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по курсу..."
              className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 w-44 sm:w-56"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
          >
            <option value="all">Все статусы</option>
            <option value="published">Опубликованные</option>
            <option value="under_review">На рецензии</option>
            <option value="draft">В разработке</option>
          </select>
        </div>
      </div>

      {/* Grid of 18 Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredModules.map((module) => {
          const badge = getStatusBadge(module.status);
          const isModule1 = module.code === "M01";
          const progressPercent = isModule1 ? Math.min(100, Math.round((attempts.length / 3) * 100)) : 0;

          return (
            <div
              key={module.id}
              onClick={() => navigate(`/course/${module.id}`)}
              className="group rounded-2xl border border-slate-800 bg-[#111B2E] p-5 shadow-xl hover:border-cyan-500/40 hover:shadow-cyan-500/10 cursor-pointer transition-all duration-200 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/80">
                    {module.code}
                  </span>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-medium ${badge.color}`}>
                    {badge.label}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-100 group-hover:text-cyan-300 transition-colors mt-3">
                  {module.title}
                </h3>

                <p className="text-xs text-slate-400 mt-2 line-clamp-3 leading-relaxed">
                  {module.shortDescription}
                </p>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-800/80">
                <div className="flex items-center justify-between text-xs text-slate-400 font-mono mb-2">
                  <span>Темы: {module.topicsCount}</span>
                  <span>Опубл. уроков: {module.publishedLessonsCount}</span>
                </div>

                {isModule1 && (
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden mb-3">
                    <div
                      className="bg-cyan-400 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-500 font-mono">
                    {module.prerequisites.length > 0
                      ? `Пререквизиты: ${module.prerequisites.join(", ")}`
                      : "Базовый модуль"}
                  </span>
                  <span className="text-xs font-bold text-cyan-400 flex items-center space-x-1 group-hover:translate-x-1 transition-transform">
                    <span>Открыть</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
