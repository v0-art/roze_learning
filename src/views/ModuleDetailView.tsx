/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Layers, CheckCircle2, Award, Clock, FileText, Sparkles } from "lucide-react";
import { getModuleById, getTopics, getLessons, subscribeToDatabase, getLessonAttemptsForUser, getCurrentUser } from "../services/storage";
import { ModuleItem, TopicItem, LessonItem } from "../types";

interface ModuleDetailViewProps {
  moduleId: string;
  navigate: (route: string) => void;
}

export const ModuleDetailView: React.FC<ModuleDetailViewProps> = ({ moduleId, navigate }) => {
  const [module, setModule] = useState<ModuleItem | undefined>(getModuleById(moduleId));
  const [topics, setTopics] = useState<TopicItem[]>(getTopics(moduleId));
  const [lessons, setLessons] = useState<LessonItem[]>(getLessons());
  const [attempts, setAttempts] = useState(getLessonAttemptsForUser(getCurrentUser().id));

  useEffect(() => {
    const unsub = subscribeToDatabase(() => {
      setModule(getModuleById(moduleId));
      setTopics(getTopics(moduleId));
      setLessons(getLessons());
      setAttempts(getLessonAttemptsForUser(getCurrentUser().id));
    });
    return unsub;
  }, [moduleId]);

  if (!module) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-xl font-bold text-slate-200">Модуль {moduleId} не найден</h2>
        <button
          onClick={() => navigate("/course")}
          className="mt-4 px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-bold text-xs"
        >
          Вернуться к каталогу курсов
        </button>
      </div>
    );
  }

  const moduleLessons = lessons.filter((l) => l.moduleId === moduleId);
  const submittedLessonIds = new Set(attempts.map((a) => a.lessonId));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center space-x-3 pb-4 border-b border-slate-800">
        <button
          onClick={() => navigate("/course")}
          className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          title="Назад к каталогу"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div>
          <div className="flex items-center space-x-2">
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
              {module.code}
            </span>
            <span className="text-xs text-slate-400 font-mono">Дисциплина #{module.order} из 18</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 mt-1">
            {module.title}
          </h1>
        </div>
      </div>

      {/* Why it matters & What is studied */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="p-6 rounded-2xl border border-slate-800 bg-[#111B2E] shadow-xl space-y-2">
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
            <Sparkles className="w-4 h-4" />
            <span>Зачем это нужно инженеру (Why It Matters)</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            {module.whyItMatters || module.shortDescription}
          </p>
        </div>

        <div className="p-6 rounded-2xl border border-slate-800 bg-[#111B2E] shadow-xl space-y-2">
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-violet-400">
            <BookOpen className="w-4 h-4" />
            <span>Что изучается (What Is Studied)</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            {module.whatIsStudied || module.introduction}
          </p>
        </div>
      </div>

      {/* Topics List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2">
          <h2 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            <span>Утверждённые темы дисциплины ({topics.length})</span>
          </h2>
          <span className="text-xs text-slate-400 font-mono">
            {module.code === "M01" ? "8 тем утверждено" : "Формируется"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {topics.map((topic) => {
            const topicLessons = moduleLessons.filter((l) => l.topicId === topic.code);
            return (
              <div
                key={topic.id}
                className="rounded-2xl border border-slate-800 bg-[#111B2E] p-5 shadow-xl space-y-4 hover:border-slate-700 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-cyan-400 border border-slate-800">
                        {topic.code}
                      </span>
                      <h3 className="text-base font-bold text-slate-100">{topic.title}</h3>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{topic.description}</p>
                  </div>

                  {topic.controlWorkId && (
                    <button
                      onClick={() => navigate("/assessments")}
                      className="px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-950/20 text-amber-300 hover:bg-amber-950/40 text-xs font-semibold flex items-center space-x-1.5 transition-colors self-start sm:self-center"
                    >
                      <Award className="w-3.5 h-3.5" />
                      <span>Рубежный контроль: {topic.controlWorkId}</span>
                    </button>
                  )}
                </div>

                {/* Lessons in topic */}
                {topicLessons.length > 0 && (
                  <div className="pt-3 border-t border-slate-800/80 space-y-2">
                    <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold font-mono">
                      Опубликованные уроки:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {topicLessons.map((les) => {
                        const isSubmitted = submittedLessonIds.has(les.code);
                        return (
                          <div
                            key={les.id}
                            onClick={() => navigate(`/lesson/${les.code}`)}
                            className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 cursor-pointer transition-all flex items-center justify-between group"
                          >
                            <div>
                              <div className="flex items-center space-x-1.5">
                                <span className="font-mono text-[11px] font-bold text-cyan-400">{les.code}</span>
                                {isSubmitted && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                              </div>
                              <p className="text-xs text-slate-200 font-medium group-hover:text-cyan-300 line-clamp-1 mt-0.5">
                                {les.title}
                              </p>
                            </div>
                            <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
