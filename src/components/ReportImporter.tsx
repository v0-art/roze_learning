/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Sparkles,
  ArrowRight,
  Info,
  Check,
} from "lucide-react";
import { validateStructuredReport, ValidationOutcome } from "../core/reportValidator";
import { StructuredReport } from "../types";

interface ReportImporterProps {
  currentLessonId: string;
  onReportConfirmed: (report: StructuredReport, rawText: string) => void;
}

export const ReportImporter: React.FC<ReportImporterProps> = ({ currentLessonId, onReportConfirmed }) => {
  const [inputText, setInputText] = useState("");
  const [validation, setValidation] = useState<ValidationOutcome | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const handleValidate = () => {
    const outcome = validateStructuredReport(inputText, currentLessonId);
    setValidation(outcome);
    if (outcome.valid) {
      setShowPreviewModal(true);
    }
  };

  const handleInsertSampleTemplate = () => {
    const sample: StructuredReport = {
      schemaVersion: "1.0",
      lessonId: currentLessonId,
      lessonStatus: "completed",
      coveredTopics: [
        "Различие данных, информации и сообщения",
        "Шесть звеньев модели связи Клода Шеннона",
        "Шумы и помехи в канале передачи",
      ],
      assessment: {
        maxScore: 100,
        earnedScore: 85,
        questions: [
          {
            questionId: "Q01",
            skillIds: ["skill-info-data-diff"],
            result: "correct",
            feedback: "Чётко разграничены синтаксис данных и семантика информации.",
            needsRecheck: false,
          },
          {
            questionId: "Q02",
            skillIds: ["skill-shannon-model"],
            result: "correct",
            feedback: "Верно названы все 6 блоков схемы Шеннона.",
            needsRecheck: false,
          },
          {
            questionId: "Q03",
            skillIds: ["skill-noise-impact"],
            result: "incorrect",
            feedback: "Студент смешал аддитивный белый гауссов шум (AWGN) и импульсные помехи.",
            needsRecheck: true,
          },
        ],
      },
      homework: [
        {
          id: "HW01",
          title: "Модель связи оптоволоконной линии DWDM",
          description: "Составить детальную схему модели Шеннона для линии DWDM с разбором точек перехвата.",
        },
      ],
      knowledgeGaps: [
        {
          skillId: "skill-noise-impact",
          description: "Классификация физических шумов в канале связи",
          status: "needs-review",
          mandatoryNextCheck: true,
        },
      ],
      strongSkills: [
        {
          skillId: "skill-info-data-diff",
          description: "Уверенное понимание сущности информации по Шеннону",
        },
      ],
      nextLessonInstructions: {
        mandatoryRechecks: [
          "Проверить классификацию шумов: отличие гауссова шума от импульсных помех",
        ],
        homeworkChecks: [
          "Проверить домашнее задание HW01: модель DWDM",
        ],
        additionalChecks: [],
      },
      studentNotes: "Занятие прошло продуктивно. Материал по Шеннону усвоен.",
    };

    setInputText(JSON.stringify(sample, null, 2));
    setValidation(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setInputText(content);
      const outcome = validateStructuredReport(content, currentLessonId);
      setValidation(outcome);
      if (outcome.valid) {
        setShowPreviewModal(true);
      }
    };
    reader.readAsText(file);
  };

  const handleFinalSubmit = () => {
    if (validation && validation.valid) {
      onReportConfirmed(validation.report, validation.rawText);
      setShowPreviewModal(false);
      setInputText("");
      setValidation(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-[#111B2E] p-4 sm:p-6 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 text-xs font-mono font-semibold rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
              Шаг 3
            </span>
            <h3 className="text-base font-bold text-slate-100">
              Импорт структурированного отчёта занятия
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Вставьте блок JSON или отчёт, сгенерированный ChatGPT в конце урока.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleInsertSampleTemplate}
            className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/60 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 text-xs font-medium flex items-center space-x-1.5 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Вставить образец отчёта</span>
          </button>

          <label className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/60 text-slate-300 hover:text-white hover:bg-slate-700/60 text-xs font-medium flex items-center space-x-1.5 cursor-pointer transition-all">
            <Upload className="w-3.5 h-3.5" />
            <span>Загрузить .json</span>
            <input type="file" accept=".json,.txt,.md" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-xs font-medium text-slate-300 mb-1.5">
          Текст отчёта (JSON или блок ```json ... ```):
        </label>
        <textarea
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            if (validation) setValidation(null);
          }}
          placeholder="Вставьте сюда финальный JSON отчёт из ChatGPT..."
          rows={10}
          className="w-full rounded-lg bg-[#090F1C] border border-slate-800 p-3.5 font-mono text-xs text-slate-200 leading-relaxed focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
        />
      </div>

      {validation && !validation.valid && (
        <div className="mt-3 p-3.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
          <div className="flex items-center space-x-2 font-semibold text-rose-200 mb-1">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>Ошибки валидации отчёта:</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-[11px] text-rose-300/90">
            {validation.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <span className="text-[11px] text-slate-400">
          Данные сохраняются в статусе <span className="text-amber-400 font-medium">«Заявлено студентом»</span> до подтверждения ментором.
        </span>

        <button
          onClick={handleValidate}
          disabled={!inputText.trim()}
          className="px-5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center justify-center space-x-2 transition-all shadow-md shadow-cyan-500/20 active:scale-98 disabled:opacity-50 disabled:pointer-events-none"
        >
          <FileCode className="w-4 h-4" />
          <span>Проверить и сохранить результат</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {showPreviewModal && validation && validation.valid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-[#111B2E] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-slate-100">
                  Подтверждение импорта отчёта: {validation.report.lessonId}
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                Валидация пройдена
              </span>
            </div>

            <div className="mt-4 space-y-4">
              <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">Заявленный результат тестирования:</p>
                  <p className="text-2xl font-bold font-mono text-cyan-400 mt-0.5">
                    {validation.report.assessment.earnedScore} / {validation.report.assessment.maxScore}{" "}
                    <span className="text-sm font-normal text-slate-400">
                      ({Math.round((validation.report.assessment.earnedScore / validation.report.assessment.maxScore) * 100)}%)
                    </span>
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs uppercase px-2 py-1 rounded bg-slate-800 text-slate-300 font-mono">
                    {validation.report.lessonStatus}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Результаты ответов ({validation.report.assessment.questions.length}):
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {validation.report.assessment.questions.map((q, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs flex items-start justify-between"
                    >
                      <div>
                        <span className="font-mono font-bold text-slate-300 mr-2">{q.questionId}:</span>
                        <span className="text-slate-300">{q.feedback}</span>
                      </div>
                      <span
                        className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ml-2 whitespace-nowrap ${
                          q.result === "correct"
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                            : "bg-rose-950 text-rose-400 border border-rose-800"
                        }`}
                      >
                        {q.result}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 text-xs">
                  <p className="font-semibold text-slate-300 mb-1.5 flex items-center space-x-1.5">
                    <span>Выданное ДЗ ({validation.report.homework.length}):</span>
                  </p>
                  {validation.report.homework.length === 0 ? (
                    <p className="text-slate-500 text-[11px]">Нет ДЗ</p>
                  ) : (
                    validation.report.homework.map((h, i) => (
                      <p key={i} className="text-slate-300 text-[11px]">
                        • <span className="font-medium text-cyan-300">{h.title}</span>: {h.description}
                      </p>
                    ))
                  )}
                </div>

                <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 text-xs">
                  <p className="font-semibold text-amber-300 mb-1.5 flex items-center space-x-1.5">
                    <span>Обязательный входной контроль на след. урок:</span>
                  </p>
                  {validation.report.nextLessonInstructions.mandatoryRechecks.length === 0 ? (
                    <p className="text-slate-500 text-[11px]">Нет критических повторов</p>
                  ) : (
                    validation.report.nextLessonInstructions.mandatoryRechecks.map((r, i) => (
                      <p key={i} className="text-amber-200/90 text-[11px]">
                        • {r}
                      </p>
                    ))
                  )}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-cyan-950/30 border border-cyan-800/40 text-[11px] text-cyan-300 flex items-start space-x-2">
                <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>
                  После подтверждения система автоматически подготовит следующий урок и внесёт ошибки прошлого урока в новый промпт.
                </span>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-medium transition-colors"
              >
                Отмена
              </button>

              <button
                onClick={handleFinalSubmit}
                className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center space-x-1.5 shadow-md shadow-emerald-500/20 active:scale-98"
              >
                <Check className="w-4 h-4" />
                <span>Подтвердить и внести в систему</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
