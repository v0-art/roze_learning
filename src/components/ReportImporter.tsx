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
  onReportConfirmed: (report: StructuredReport, rawText: string) => Promise<void>;
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
      lessonId: "M01-T01-U01",
      lessonStatus: "completed",
      coveredTopics: [
        "Информация в бытовом и формальном смысле",
        "Данные и контекст",
        "Сообщение и физический носитель",
        "Формы представления",
        "Кодирование и интерпретация",
        "Источник и получатель сообщения",
        "Системный разбор передачи сообщений",
      ],
      assessment: {
        maxScore: 16,
        earnedScore: 12,
        questions: [
          {
            questionId: "Q01",
            skillIds: ["skill-m01-t01-u01-01"],
            result: "correct",
            feedback: "Что понимают под информацией и обязана ли она быть истинной? Информация — сведения об объектах, явлениях или событиях; сведения не обязательно истинны.",
            needsRecheck: false,
          },
          {
            questionId: "Q02",
            skillIds: ["skill-m01-t01-u01-01"],
            result: "partial",
            feedback: "Что такое данные? Данные не ограничены числами; возможны текст, изображения и иные формы представления.",
            needsRecheck: true,
          },
          {
            questionId: "Q03",
            skillIds: ["skill-m01-t01-u01-01"],
            result: "correct",
            feedback: "Чем сообщение отличается от его физического носителя? Содержание сообщения и материальный носитель не тождественны.",
            needsRecheck: false,
          },
          {
            questionId: "Q04",
            skillIds: ["skill-m01-t01-u01-01"],
            result: "correct",
            feedback: "На экране написано «25». Смысл задаётся соглашениями, контекстом и единицами измерения.",
            needsRecheck: false,
          },
          {
            questionId: "Q05",
            skillIds: ["skill-m01-t01-u01-02"],
            result: "incorrect",
            feedback: "Красный индикатор не обязательно означает аварию: значение индикатора определяется правилами конкретной системы.",
            needsRecheck: true,
          },
          {
            questionId: "Q06",
            skillIds: ["skill-m01-t01-u01-02"],
            result: "partial",
            feedback: "Отличие кодирования от шифрования: обычное кодирование задаёт представление, а шифрование предназначено для защиты конфиденциальности.",
            needsRecheck: true,
          },
          {
            questionId: "Q07",
            skillIds: ["skill-m01-t01-u01-02"],
            result: "correct",
            feedback: "Получение сообщения не удостоверяет истинность и актуальность его содержания (сообщение могло устареть).",
            needsRecheck: false,
          },
          {
            questionId: "Q08",
            skillIds: ["skill-m01-t01-u01-02"],
            result: "correct",
            feedback: "Объём цифровой записи и содержательная значимость — разные характеристики сообщения.",
            needsRecheck: false,
          },
        ],
      },
      homework: [
        {
          id: "M01-T01-U01-HW01",
          title: "SMS «Встреча в 18:00»",
          description: "Разберите SMS «Встреча в 18:00»: укажите содержание сообщения, данные и форму их представления, отправителя и получателя; объясните возможную неоднозначность. Каждый вывод обоснуйте.",
        },
        {
          id: "M01-T01-U01-HW02",
          title: "Сохранение фотографии",
          description: "Разберите сохранение фотографии: какие сведения может содержать изображение, какими данными они представлены, какова роль пользователя и компьютера и обязательно ли сохранение файла означает передачу сообщения другому человеку. Каждый вывод обоснуйте.",
        },
        {
          id: "M01-T01-U01-HW03",
          title: "Дисплей «25»",
          description: "На примере дисплея с записью «25» объясните возможные значения записи, роль контекста и единиц измерения, отличие представления данных от их интерпретации. Приведите не менее двух возможных трактовок.",
        },
        {
          id: "M01-T01-U01-HW04",
          title: "Терминология",
          description: "Своими словами объясните информацию, данные, сообщение, представление информации, кодирование и интерпретацию. Для каждого понятия приведите собственный пример, не повторяющий примеры лекции.",
        },
      ],
      knowledgeGaps: [
        {
          skillId: "skill-m01-t01-u01-01",
          description: "Q02 (1/2). Нечисловые формы данных: текст и изображения.",
          status: "needs-review",
          mandatoryNextCheck: true,
        },
        {
          skillId: "skill-m01-t01-u01-02",
          description: "Q05 (0/2). Зависимость значения индикатора от правил системы.",
          status: "needs-review",
          mandatoryNextCheck: true,
        },
        {
          skillId: "skill-m01-t01-u01-02",
          description: "Q06 (1/2). Различие цели представления (кодирование) и конфиденциальности (шифрование).",
          status: "needs-review",
          mandatoryNextCheck: true,
        },
      ],
      strongSkills: [
        {
          skillId: "skill-m01-t01-u01-01",
          description: "Информация, различие сообщения и носителя, роль контекста (Q01, Q03, Q04).",
        },
        {
          skillId: "skill-m01-t01-u01-02",
          description: "Ограничения получения сообщений и отличие объёма записи от смысла (Q07, Q08).",
        },
      ],
      nextLessonInstructions: {
        mandatoryRechecks: [
          "Q02 / данные: Объясните, почему текст «Готово» и фотография также могут быть данными, хотя не являются числом.",
          "Q05 / правила кодирования: На приборе появился жёлтый индикатор. Какие сведения нужны, чтобы надёжно определить его значение?",
          "Q06 / кодирование и шифрование: Сопоставьте преобразование текста в UTF-8 и шифрование сообщения.",
        ],
        homeworkChecks: [
          "M01-T01-U01-HW01. SMS «Встреча в 18:00»",
          "M01-T01-U01-HW02. Сохранение фотографии",
          "M01-T01-U01-HW03. Дисплей «25»",
          "M01-T01-U01-HW04. Терминология",
        ],
        additionalChecks: [
          "Цепочка «источник → формирование сообщения → передача → получение → интерпретация».",
          "Различие между сообщением и физическим сигналом.",
        ],
      },
      studentNotes: "ДЕМОНСТРАЦИОННАЯ СИМУЛЯЦИЯ: Отчёт первого урока M01-T01-U01. Домашние задания назначены в банк ДЗ.",
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

  const handleFinalSubmit = async () => {
    if (validation && validation.valid) {
      try { await onReportConfirmed(validation.report, validation.rawText); } catch (err) { alert(err instanceof Error ? err.message : "Ошибка сохранения отчёта."); return; }
      setShowPreviewModal(false);
      setInputText("");
      setValidation(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-[#20172f] p-4 sm:p-6 shadow-xl">
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
          className="w-full rounded-lg bg-[#110d1b] border border-slate-800 p-3.5 font-mono text-xs text-slate-200 leading-relaxed focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
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
          Результат урока фиксируется по <span className="text-cyan-400 font-medium">отчёту ИИ-преподавателя</span> (самоотчёт). Ручного подтверждения ментором для ежедневных уроков не требуется.
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
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-[#20172f] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
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

              {validation.report.entryControl && <div className="p-3 rounded-xl bg-slate-900 text-xs text-slate-200">
                <p className="font-semibold">Входной контроль предыдущего урока: самоотчёт</p>
                {validation.report.entryControl.homeworkResults.map(h => <p key={h.homeworkId}>{h.homeworkId}: {h.status} — {h.feedback}</p>)}
                {validation.report.entryControl.recheckResults.map(q => <p key={q.sourceGapId || `${q.sourceLessonId || ''}:${q.sourceQuestionId}`}>{q.sourceGapId || q.sourceQuestionId}: {q.status} — {q.evidence}</p>)}
              </div>}
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
