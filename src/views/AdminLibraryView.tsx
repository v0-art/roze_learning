/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  FolderArchive,
  FileText,
  FileCode,
  Download,
  Eye,
  RefreshCw,
  Search,
  Upload,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Copy,
  ExternalLink,
} from 'lucide-react';
import {
  getLibraryFiles,
  addLibraryFile,
  loadDatabase,
  saveDatabase,
  getCurrentUser,
  subscribeToDatabase,
} from '../services/storage';
import { LibraryFileItem } from '../types';

interface AdminLibraryViewProps {
  navigate?: (route: string) => void;
}

export const AdminLibraryView: React.FC<AdminLibraryViewProps> = ({ navigate }) => {
  const [files, setFiles] = useState<LibraryFileItem[]>(getLibraryFiles());
  const [searchQuery, setSearchQuery] = useState('');
  const [previewFile, setPreviewFile] = useState<LibraryFileItem | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToDatabase(() => {
      setFiles(getLibraryFiles());
    });
    return unsub;
  }, []);

  const filteredFiles = files.filter((f) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      f.name.toLowerCase().includes(q) ||
      f.checksumSha256.toLowerCase().includes(q) ||
      f.linkedEntity.toLowerCase().includes(q)
    );
  });

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
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
              Раздел 8 ТЗ
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight mt-1 flex items-center space-x-2">
            <FolderArchive className="w-6 h-6 text-cyan-400" />
            <span>Библиотека материалов и первоисточников</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Реестр исходных JSON-манифестов, Markdown-паспортов уроков и открытых экзаменационных билетов с фиксацией SHA-256.
          </p>
        </div>

        {/* Global actions */}
        <div className="flex items-center space-x-2">
          <a
            href="/api/export/curriculum/zip"
            download="nexus_backup_full.zip"
            className="px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 transition-colors"
          >
            <Download className="w-4 h-4 text-cyan-400" />
            <span>Скачать полный ZIP архив</span>
          </a>
        </div>
      </div>

      {/* Search & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Поиск по имени файла, SHA-256 или объекту..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-800 bg-[#111B2E] text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Всего зарегистрировано документов: <strong className="text-cyan-400">{files.length}</strong>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-800 bg-[#111B2E] overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/80 border-b border-slate-800 text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
              <tr>
                <th className="px-4 py-3">Документ</th>
                <th className="px-4 py-3">Тип</th>
                <th className="px-4 py-3">Размер</th>
                <th className="px-4 py-3">Привязка</th>
                <th className="px-4 py-3">Контрольная сумма SHA-256</th>
                <th className="px-4 py-3">Дата загрузки</th>
                <th className="px-4 py-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredFiles.map((f) => (
                <tr key={f.id} className="hover:bg-slate-900/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center space-x-2">
                      {f.type === 'json' ? (
                        <FileCode className="w-4 h-4 text-amber-400 shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-cyan-400 shrink-0" />
                      )}
                      <span className="font-sans font-bold text-slate-100">{f.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 uppercase text-[10px] text-slate-400">{f.type}</td>
                  <td className="px-4 py-3 text-slate-300">{formatBytes(f.sizeBytes)}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded bg-slate-900 text-cyan-300 border border-slate-800 text-[11px]">
                      {f.linkedEntity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center space-x-1.5 text-slate-400 group">
                      <span className="truncate max-w-[140px] text-[10px]">{f.checksumSha256}</span>
                      <button
                        onClick={() => handleCopyHash(f.checksumSha256)}
                        className="text-slate-500 hover:text-cyan-400 transition-colors"
                        title="Скопировать хеш SHA-256"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      {copiedHash === f.checksumSha256 && (
                        <span className="text-[9px] text-emerald-400">Скопировано!</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-[11px] font-sans">
                    {new Date(f.uploadedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right font-sans">
                    <div className="flex items-center justify-end space-x-1.5">
                      <a
                        href={`/api/library/download/${f.id}`}
                        download={f.name}
                        className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center space-x-1"
                        title="Скачать исходный файл"
                      >
                        <Download className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Скачать</span>
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
