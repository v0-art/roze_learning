/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Copy, Check, Download, Sparkles, ExternalLink } from "lucide-react";
import { AssembledPrompt } from "../core/promptEngine";

interface PromptViewerProps {
  assembledPrompt: AssembledPrompt;
  onCopied?: () => void;
}

export const PromptViewer: React.FC<PromptViewerProps> = ({ assembledPrompt, onCopied }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(assembledPrompt.fullPromptText);
      setCopied(true);
      if (onCopied) onCopied();
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error("Clipboard copy failed:", err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([assembledPrompt.fullPromptText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `NEXUS_Prompt_${assembledPrompt.lessonId}_v${assembledPrompt.version}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-[#111B2E] p-4 sm:p-6 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 text-xs font-mono font-semibold rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
              Шаг 1
            </span>
            <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
              <span>Сформированный промпт занятия</span>
              <span className="text-xs font-normal text-slate-400 font-mono">v{assembledPrompt.version}</span>
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Промпт собран детерминированно из правил курса, контекста модуля, входного контроля и протокола отчёта.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleDownload}
            className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/60 text-slate-300 hover:text-white hover:bg-slate-700/60 text-xs font-medium flex items-center space-x-1.5 transition-all"
            title="Скачать промпт как текстовый файл"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Скачать TXT</span>
          </button>

          <button
            onClick={handleCopy}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center space-x-2 transition-all shadow-md active:scale-98 ${
              copied
                ? "bg-emerald-500 text-slate-950 shadow-emerald-500/20"
                : "bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/25 ring-1 ring-cyan-300"
            }`}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? "Скопировано в буфер!" : "Скопировать промпт"}</span>
          </button>
        </div>
      </div>

      {assembledPrompt.hasCarryover && (
        <div className="mt-4 p-3 rounded-lg bg-cyan-950/40 border border-cyan-800/50 flex items-start space-x-2.5">
          <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-semibold text-cyan-300">Встроен блок преемственности (Carryover): </span>
            <span className="text-slate-300">
              {assembledPrompt.carryoverRecheckCount} обязательных повторных проверок ошибок и{" "}
              {assembledPrompt.carryoverHomeworkCount} домашних заданий из предыдущего занятия.
            </span>
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 font-mono">
        <span>Объём: {assembledPrompt.characterCount.toLocaleString()} символов ({assembledPrompt.wordCount} слов)</span>
        <span className="text-cyan-400 font-medium">Готов к передаче в ChatGPT</span>
      </div>

      <div className="mt-3 relative">
        <textarea
          readOnly
          value={assembledPrompt.fullPromptText}
          rows={12}
          className="w-full rounded-lg bg-[#090F1C] border border-slate-800/90 p-3.5 font-mono text-xs text-slate-300 leading-relaxed focus:outline-none focus:ring-1 focus:ring-cyan-500/40 resize-y"
        />
      </div>

      <div className="mt-4 p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-6 h-6 rounded-md bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 flex items-center justify-center text-xs font-bold font-mono">
            2
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-200">Шаг 2: Пройдите занятие в ChatGPT</p>
            <p className="text-[11px] text-slate-400">
              Вставьте скопированный промпт в диалог на chatgpt.com. Платформа не эмулирует чат.
            </p>
          </div>
        </div>

        <a
          href="https://chatgpt.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center space-x-1.5 shadow-md shadow-indigo-600/25 transition-all active:scale-98"
        >
          <span>Открыть ChatGPT</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
};
