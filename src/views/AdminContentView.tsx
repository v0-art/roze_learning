/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FolderTree,
  FileCode,
  BookOpen,
  Layers,
  Award,
  Upload,
  Download,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  History,
  GitCompare,
  Eye,
  Edit3,
  Maximize2,
  Minimize2,
  Save,
  Send,
  Archive,
  Trash2,
  Plus,
  RefreshCw,
  FolderArchive,
  ChevronRight,
  ChevronDown,
  FileText,
  ShieldAlert,
  Sparkles,
  Copy,
  ExternalLink,
  HelpCircle,
  FileDown,
} from 'lucide-react';
import {
  getModules,
  getTopics,
  getLessons,
  getLessonById,
  saveLesson,
  saveTopic,
  saveModule,
  batchUpdateLessonStatus,
  getSkills,
  getExams,
  getAuditLogs,
  getCurrentUser,
  subscribeToDatabase,
  loadDatabase,
  saveDatabase,
} from '../services/storage';
import {
  analyzeImportPayload,
  commitImportPayload,
  parseLessonIdFromFilenameOrContent,
  parseExamTicketsFromMarkdown,
  computeSha256,
  ParsedImportPayload,
} from '../core/contentImporter';
import {
  ModuleItem,
  TopicItem,
  LessonItem,
  ContentStatus,
  PromptVersionRecord,
  ImportSummaryResult,
} from '../types';

interface AdminContentViewProps {
  navigate?: (route: string) => void;
}

export const AdminContentView: React.FC<AdminContentViewProps> = ({ navigate }) => {
  const [modules, setModules] = useState<ModuleItem[]>(getModules());
  const [topics, setTopics] = useState<TopicItem[]>(getTopics());
  const [lessons, setLessons] = useState<LessonItem[]>(getLessons({ includeUnpublished: true }));
  const [currentUser, setCurrentUser] = useState(getCurrentUser());

  // Tree selection state
  const [selectedType, setSelectedType] = useState<'module' | 'topic' | 'lesson'>('lesson');
  const [selectedId, setSelectedId] = useState<string>('M01-T01-U01');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ContentStatus>('all');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    M01: true,
    'M01-T01': true,
    'M01-T02': true,
  });

  // Batch selection state (Section 15)
  const [selectedLessonIds, setSelectedLessonIds] = useState<string[]>([]);

  // Lesson Editor State (Section 6)
  const [editorText, setEditorText] = useState('');
  const [editorTitle, setEditorTitle] = useState('');
  const [editorStatus, setEditorStatus] = useState<ContentStatus>('draft');
  const [editorChangelog, setEditorChangelog] = useState('');
  const [editorMode, setEditorMode] = useState<'edit' | 'preview' | 'split'>('edit');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);
  const [bumpMinor, setBumpMinor] = useState(false);
  const [bumpMajor, setBumpMajor] = useState(false);

  // Modals
  const [showImportModal, setShowImportModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [comparedVersion, setComparedVersion] = useState<PromptVersionRecord | null>(null);

  // Import Modal State (Section 5)
  const [importRawText, setImportRawText] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [importSummary, setImportSummary] = useState<ImportSummaryResult | null>(null);
  const [importAnalyzing, setImportAnalyzing] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const [conflictMode, setConflictMode] = useState<'skip_unchanged_update_changed' | 'keep_existing' | 'overwrite_all'>('skip_unchanged_update_changed');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to DB changes
  useEffect(() => {
    const unsub = subscribeToDatabase(() => {
      setModules(getModules());
      setTopics(getTopics());
      setLessons(getLessons({ includeUnpublished: true }));
      setCurrentUser(getCurrentUser());
    });
    return unsub;
  }, []);

  // Sync editor when selected lesson changes
  const activeLesson = useMemo(() => {
    return lessons.find((l) => l.id === selectedId || l.code === selectedId);
  }, [lessons, selectedId]);

  const activeTopic = useMemo(() => {
    return topics.find((t) => t.id === selectedId || t.code === selectedId);
  }, [topics, selectedId]);

  const activeModule = useMemo(() => {
    return modules.find((m) => m.id === selectedId || m.code === selectedId);
  }, [modules, selectedId]);

  useEffect(() => {
    if (selectedType === 'lesson' && activeLesson) {
      setEditorText(activeLesson.promptTemplate || '');
      setEditorTitle(activeLesson.title || '');
      setEditorStatus(activeLesson.status || 'draft');
      setEditorChangelog('');
      setBumpMinor(false);
      setBumpMajor(false);
    }
  }, [selectedId, selectedType, activeLesson]);

  // Toggle tree node expansion
  const toggleExpand = (id: string) => {
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Filtered Tree
  const filteredModules = useMemo(() => {
    return modules.filter((m) => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      if (m.title.toLowerCase().includes(q) || m.code.toLowerCase().includes(q)) return true;
      const modTopics = topics.filter((t) => t.moduleId === m.id);
      return modTopics.some((t) => {
        if (t.title.toLowerCase().includes(q) || t.code.toLowerCase().includes(q)) return true;
        const topLessons = lessons.filter((l) => l.topicId === t.id);
        return topLessons.some((l) => l.title.toLowerCase().includes(q) || l.code.toLowerCase().includes(q));
      });
    });
  }, [modules, topics, lessons, searchQuery, statusFilter]);

  // Save current lesson
  const handleSaveLesson = (publishImmediate: boolean = false) => {
    if (!activeLesson) return;
    const targetStatus = publishImmediate ? 'published' : editorStatus;
    const updated = saveLesson(
      {
        ...activeLesson,
        title: editorTitle,
        promptTemplate: editorText,
        status: targetStatus,
      },
      editorChangelog || (publishImmediate ? 'Публикация урока' : 'Сохранение изменений промпта'),
      bumpMinor,
      bumpMajor
    );

    setSaveSuccessNotice(true);
    setTimeout(() => setSaveSuccessNotice(false), 3000);
  };

  // Batch actions
  const handleBatchPublish = () => {
    if (selectedLessonIds.length === 0) return;
    batchUpdateLessonStatus(selectedLessonIds, 'publish', 'Массовая публикация уроков');
    setSelectedLessonIds([]);
  };

  const handleBatchArchive = () => {
    if (selectedLessonIds.length === 0) return;
    batchUpdateLessonStatus(selectedLessonIds, 'archive', 'Массовое архивирование уроков');
    setSelectedLessonIds([]);
  };

  const handleBatchDraft = () => {
    if (selectedLessonIds.length === 0) return;
    batchUpdateLessonStatus(selectedLessonIds, 'draft', 'Снятие с публикации (в черновик)');
    setSelectedLessonIds([]);
  };

  // Export current lesson to markdown
  const handleExportLessonMd = () => {
    if (!activeLesson) return;
    const blob = new Blob([activeLesson.promptTemplate], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeLesson.code}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle file import drag / select
  const handleFileAnalysis = async (file: File) => {
    setImportFileName(file.name);
    setImportAnalyzing(true);
    setImportSummary(null);

    const text = await file.text();
    setImportRawText(text);

    const db = loadDatabase();
    let payload: ParsedImportPayload = {};

    try {
      if (file.name.endsWith('.json')) {
        const json = JSON.parse(text);
        if (json.modules || json.lessons || json.topics) {
          payload = {
            modules: json.modules,
            topics: json.topics,
            lessons: json.lessons,
            skills: json.skills,
            relations: json.relations,
            exams: json.assessments?.filter((a: any) => a.type === 'exam' || a.tickets),
          };
        }
      } else if (file.name.endsWith('.md')) {
        // Individual lesson or exam
        const parsedLesson = parseLessonIdFromFilenameOrContent(file.name, text);
        if (parsedLesson) {
          payload = {
            lessons: [
              {
                id: parsedLesson.lessonCode,
                code: parsedLesson.lessonCode,
                moduleId: parsedLesson.moduleId,
                topicId: parsedLesson.topicId,
                order: parseInt(parsedLesson.lessonCode.slice(-2), 10) || 1,
                title: parsedLesson.lessonCode,
                durationEstimateMinutes: 120,
                prerequisites: [],
                objectives: [],
                relatedSkillIds: [],
                status: 'draft',
                version: '1.0',
                promptTemplate: text,
              },
            ],
          };
        } else if (file.name.includes('ticket') || file.name.includes('EX01')) {
          const tickets = parseExamTicketsFromMarkdown(text, 'M01');
          payload = {
            exams: [
              {
                id: 'M01-EX01',
                moduleId: 'M01',
                title: 'Открытый экзаменационный банк M01-EX01 (24 билета)',
                type: 'exam',
                status: 'draft',
                tickets,
                theoryUniqueCount: 48,
                practicalUniqueCount: 24,
              },
            ],
          };
        }
      }

      const summary = await analyzeImportPayload(payload, db);
      setImportSummary(summary);
    } catch (err: any) {
      alert(`Ошибка анализа файла: ${err.message}`);
    } finally {
      setImportAnalyzing(false);
    }
  };

  // Commit Import
  const handleCommitImport = async () => {
    if (!importSummary || !importRawText) return;
    const db = loadDatabase();
    let payload: ParsedImportPayload = {};

    if (importFileName.endsWith('.json')) {
      const json = JSON.parse(importRawText);
      payload = {
        modules: json.modules,
        topics: json.topics,
        lessons: json.lessons,
        skills: json.skills,
        relations: json.relations,
        exams: json.assessments?.filter((a: any) => a.type === 'exam' || a.tickets),
      };
    } else {
      const parsed = parseLessonIdFromFilenameOrContent(importFileName, importRawText);
      if (parsed) {
        payload = {
          lessons: [
            {
              id: parsed.lessonCode,
              code: parsed.lessonCode,
              moduleId: parsed.moduleId,
              topicId: parsed.topicId,
              order: parseInt(parsed.lessonCode.slice(-2), 10) || 1,
              title: parsed.lessonCode,
              durationEstimateMinutes: 120,
              prerequisites: [],
              objectives: [],
              relatedSkillIds: [],
              status: 'draft',
              version: '1.0',
              promptTemplate: importRawText,
            },
          ],
        };
      }
    }

    const nextDb = commitImportPayload(payload, db, {
      conflictMode,
      actorId: currentUser.id,
      actorName: currentUser.displayName,
    });

    // Also add to library
    const sha = await computeSha256(importRawText);
    nextDb.libraryFiles.unshift({
      id: `lib-${Date.now()}`,
      name: importFileName || 'imported_content.txt',
      type: importFileName.endsWith('.json') ? 'json' : 'markdown',
      sizeBytes: new Blob([importRawText]).size,
      checksumSha256: sha,
      uploadedAt: new Date().toISOString(),
      uploadedBy: currentUser.displayName,
      linkedEntity: payload.lessons?.[0]?.code || 'M01',
      version: '1.0',
      status: 'active',
    });

    saveDatabase(nextDb);
    setImportSuccess(true);
    setTimeout(() => {
      setImportSuccess(false);
      setShowImportModal(false);
      setImportSummary(null);
    }, 1500);
  };

  return (
    <div className={`p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 ${isFullscreen ? 'fixed inset-0 z-50 bg-[#090F1C] overflow-y-auto max-w-none' : ''}`}>
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 font-semibold tracking-wider">
              CMS Учебных материалов
            </span>
            <span className="text-xs text-slate-400">• Управление курсом, промптами и версиями</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight mt-1 flex items-center space-x-2">
            <BookOpen className="w-6 h-6 text-cyan-400" />
            <span>Учебная программа и редактор промптов</span>
          </h1>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center space-x-1.5 transition-all shadow-md shadow-cyan-500/20 active:scale-98"
          >
            <Upload className="w-4 h-4" />
            <span>Импортировать материалы</span>
          </button>

          {navigate && (
            <>
              <button
                onClick={() => navigate('/admin/content/library')}
                className="px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center space-x-1.5 transition-colors"
              >
                <FolderArchive className="w-4 h-4 text-cyan-400" />
                <span>Библиотека файлов</span>
              </button>

              <button
                onClick={() => navigate('/admin/exams')}
                className="px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center space-x-1.5 transition-colors"
              >
                <Award className="w-4 h-4 text-amber-400" />
                <span>Банк экзаменов (24)</span>
              </button>
            </>
          )}

          <a
            href="/api/export/curriculum/zip"
            download="nexus_curriculum_full.zip"
            className="px-3 py-2 rounded-xl border border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-300 text-xs font-medium flex items-center space-x-1.5 transition-colors"
            title="Выгрузить всю программу в ZIP архив"
          >
            <Download className="w-3.5 h-3.5" />
            <span>ZIP Экспорт</span>
          </a>
        </div>
      </div>

      {/* Main Grid: Left Tree & Right Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Pane: Course Tree (cols 4) */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-800 bg-[#111B2E] p-4 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <FolderTree className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-slate-100">Дерево курса</h2>
            </div>
            <span className="text-[11px] font-mono text-cyan-400">
              {lessons.length} уроков
            </span>
          </div>

          {/* Search & Filter */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Поиск по коду, теме или уроку..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center space-x-1 overflow-x-auto text-[10px]">
              {(['all', 'draft', 'published', 'archived'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2 py-1 rounded-md transition-colors ${
                    statusFilter === st
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {st === 'all' ? 'Все' : st === 'draft' ? 'Черновики' : st === 'published' ? 'Опубл.' : 'Архив'}
                </button>
              ))}
            </div>
          </div>

          {/* Batch Actions Toolbar (Section 15) */}
          {selectedLessonIds.length > 0 && (
            <div className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-800/80 space-y-2">
              <div className="flex items-center justify-between text-xs text-cyan-300 font-medium">
                <span>Выбрано: {selectedLessonIds.length} уроков</span>
                <button
                  onClick={() => setSelectedLessonIds([])}
                  className="text-[10px] text-slate-400 hover:text-slate-200 underline"
                >
                  Снять выбор
                </button>
              </div>
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={handleBatchPublish}
                  className="flex-1 py-1 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-[10px] font-bold"
                >
                  Опубликовать
                </button>
                <button
                  onClick={handleBatchDraft}
                  className="flex-1 py-1 px-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-[10px] font-bold"
                >
                  В черновик
                </button>
                <button
                  onClick={handleBatchArchive}
                  className="flex-1 py-1 px-2 rounded-lg bg-rose-900 hover:bg-rose-800 text-rose-200 text-[10px] font-medium"
                >
                  Архивировать
                </button>
              </div>
            </div>
          )}

          {/* Tree Structure */}
          <div className="max-h-[620px] overflow-y-auto space-y-1.5 pr-1 font-mono text-xs">
            {filteredModules.map((m) => {
              const isExpanded = !!expandedNodes[m.id];
              const modTopics = topics.filter((t) => t.moduleId === m.id);
              const modLessons = lessons.filter((l) => l.moduleId === m.id);
              const pubCount = modLessons.filter((l) => l.status === 'published').length;

              return (
                <div key={m.id} className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                  {/* Module Item Header */}
                  <div
                    onClick={() => {
                      setSelectedType('module');
                      setSelectedId(m.id);
                      toggleExpand(m.id);
                    }}
                    className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                      selectedType === 'module' && selectedId === m.id
                        ? 'bg-cyan-500/10 border-l-2 border-cyan-400'
                        : 'hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      )}
                      <span className="font-bold text-slate-200">{m.code}</span>
                      <span className="truncate text-slate-300 font-sans text-xs">{m.title}</span>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-semibold uppercase ${
                          m.status === 'approved' || m.status === 'published'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-amber-950 text-amber-400 border border-amber-800'
                        }`}
                      >
                        {m.status === 'approved' ? 'Утверждён' : m.status}
                      </span>
                    </div>
                  </div>

                  {/* Topics List under Module */}
                  {isExpanded && (
                    <div className="pl-4 pr-1 py-1 space-y-1 border-t border-slate-800/40 bg-slate-950/20">
                      {modTopics.length === 0 ? (
                        <div className="p-2 text-[11px] text-slate-500 italic">
                          Темы дисциплины в разработке
                        </div>
                      ) : (
                        modTopics.map((t) => {
                          const topicLessons = lessons.filter((l) => l.topicId === t.id);
                          const isTopicExpanded = !!expandedNodes[t.id];

                          return (
                            <div key={t.id} className="rounded-lg overflow-hidden">
                              <div
                                onClick={() => {
                                  setSelectedType('topic');
                                  setSelectedId(t.id);
                                  toggleExpand(t.id);
                                }}
                                className={`p-2 flex items-center justify-between cursor-pointer rounded-lg transition-colors ${
                                  selectedType === 'topic' && selectedId === t.id
                                    ? 'bg-cyan-500/15 text-cyan-300 font-semibold'
                                    : 'hover:bg-slate-800/40 text-slate-300'
                                }`}
                              >
                                <div className="flex items-center space-x-1.5 truncate">
                                  {isTopicExpanded ? (
                                    <ChevronDown className="w-3 h-3 text-cyan-400 shrink-0" />
                                  ) : (
                                    <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
                                  )}
                                  <span className="font-bold text-[11px] text-cyan-400">{t.code}</span>
                                  <span className="truncate text-[11px] font-sans">{t.title}</span>
                                </div>
                                <span className="text-[10px] text-slate-500 shrink-0 ml-1">
                                  {topicLessons.length} ур.
                                </span>
                              </div>

                              {/* Lessons list under Topic */}
                              {isTopicExpanded && (
                                <div className="pl-4 pr-1 py-1 space-y-0.5 border-l border-slate-800/80 ml-2">
                                  {topicLessons.map((l) => {
                                    const isSelected = selectedType === 'lesson' && selectedId === l.id;
                                    const isBatchChecked = selectedLessonIds.includes(l.id);

                                    return (
                                      <div
                                        key={l.id}
                                        className={`p-1.5 rounded-md flex items-center justify-between group transition-colors ${
                                          isSelected
                                            ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30'
                                            : 'hover:bg-slate-800/60 text-slate-400 hover:text-slate-200'
                                        }`}
                                      >
                                        <div
                                          onClick={() => {
                                            setSelectedType('lesson');
                                            setSelectedId(l.id);
                                          }}
                                          className="flex items-center space-x-1.5 truncate cursor-pointer flex-1"
                                        >
                                          <FileCode className={`w-3 h-3 shrink-0 ${isSelected ? 'text-cyan-400' : 'text-slate-500'}`} />
                                          <span className="font-bold text-[10px] shrink-0">{l.code}</span>
                                          <span className="truncate text-[10px] font-sans">{l.title}</span>
                                        </div>

                                        <div className="flex items-center space-x-1 shrink-0 ml-1">
                                          <span
                                            className={`text-[8px] px-1 py-0.2 rounded font-semibold uppercase ${
                                              l.status === 'published'
                                                ? 'bg-emerald-950 text-emerald-400'
                                                : l.status === 'archived'
                                                ? 'bg-slate-800 text-slate-400'
                                                : 'bg-amber-950 text-amber-400'
                                            }`}
                                          >
                                            {l.status === 'published' ? 'Опубл.' : l.status === 'draft' ? 'Черновик' : 'Архив'}
                                          </span>

                                          <input
                                            type="checkbox"
                                            checked={isBatchChecked}
                                            onChange={(e) => {
                                              e.stopPropagation();
                                              if (e.target.checked) {
                                                setSelectedLessonIds([...selectedLessonIds, l.id]);
                                              } else {
                                                setSelectedLessonIds(selectedLessonIds.filter((id) => id !== l.id));
                                              }
                                            }}
                                            className="w-3 h-3 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0 cursor-pointer"
                                            title="Выбрать для массовых действий"
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Pane: Workspace Editor (cols 8) */}
        <div className="lg:col-span-8 space-y-6">
          {selectedType === 'lesson' && activeLesson ? (
            /* Lesson Editor (Section 6) */
            <div className="rounded-2xl border border-slate-800 bg-[#111B2E] p-6 shadow-xl space-y-6">
              {/* Lesson Meta Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/80">
                      {activeLesson.code}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-semibold ${
                        editorStatus === 'published'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : editorStatus === 'archived'
                          ? 'bg-slate-800 text-slate-400 border border-slate-700'
                          : 'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}
                    >
                      {editorStatus === 'published' ? 'Опубликован' : editorStatus === 'draft' ? 'Черновик' : 'В архиве'}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      Версия: <strong className="text-slate-100">{activeLesson.version || '1.0'}</strong>
                    </span>
                  </div>

                  <input
                    type="text"
                    value={editorTitle}
                    onChange={(e) => setEditorTitle(e.target.value)}
                    className="w-full text-base sm:text-lg font-bold text-slate-100 bg-transparent border-b border-transparent hover:border-slate-700 focus:border-cyan-500 focus:outline-none transition-colors"
                    placeholder="Название урока..."
                  />
                  <p className="text-xs text-slate-400">
                    Тема: <span className="font-mono text-cyan-400">{activeLesson.topicId}</span> • Модуль: <span className="font-mono text-cyan-400">{activeLesson.moduleId}</span>
                  </p>
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setShowHistoryModal(true)}
                    className="p-2 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs flex items-center space-x-1"
                    title="История редакций"
                  >
                    <History className="w-3.5 h-3.5 text-cyan-400" />
                    <span>История ({activeLesson.versionHistory?.length || 1})</span>
                  </button>

                  <button
                    onClick={handleExportLessonMd}
                    className="p-2 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs flex items-center space-x-1"
                    title="Экспортировать в Markdown"
                  >
                    <FileDown className="w-3.5 h-3.5 text-slate-400" />
                    <span>Экспорт .md</span>
                  </button>

                  <button
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className="p-2 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs"
                    title={isFullscreen ? 'Свернуть' : 'Полный экран'}
                  >
                    {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Editor Mode Tabs & Stats */}
              <div className="flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center space-x-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800">
                  <button
                    onClick={() => setEditorMode('edit')}
                    className={`px-3 py-1 rounded-md transition-colors ${
                      editorMode === 'edit' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'hover:text-slate-200'
                    }`}
                  >
                    Редактор
                  </button>
                  <button
                    onClick={() => setEditorMode('preview')}
                    className={`px-3 py-1 rounded-md transition-colors ${
                      editorMode === 'preview' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'hover:text-slate-200'
                    }`}
                  >
                    Предпросмотр
                  </button>
                  <button
                    onClick={() => setEditorMode('split')}
                    className={`px-3 py-1 rounded-md hidden md:block transition-colors ${
                      editorMode === 'split' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'hover:text-slate-200'
                    }`}
                  >
                    Разделить
                  </button>
                </div>

                <div className="font-mono text-[11px] text-slate-400 space-x-3">
                  <span>{editorText.length} символов</span>
                  <span>~{editorText.split(/\s+/).filter(Boolean).length} слов</span>
                </div>
              </div>

              {/* Editor Workspace */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Textarea */}
                {(editorMode === 'edit' || editorMode === 'split') && (
                  <div className={editorMode === 'edit' ? 'col-span-2' : ''}>
                    <textarea
                      value={editorText}
                      onChange={(e) => setEditorText(e.target.value)}
                      rows={isFullscreen ? 28 : 18}
                      className="w-full p-4 rounded-xl border border-slate-800 bg-[#0A101D] text-slate-200 font-mono text-xs leading-relaxed focus:outline-none focus:border-cyan-500 selection:bg-cyan-500 selection:text-slate-950 resize-y"
                      placeholder="Текст учебного промпта..."
                    />
                  </div>
                )}

                {/* Markdown Preview */}
                {(editorMode === 'preview' || editorMode === 'split') && (
                  <div
                    className={`p-4 rounded-xl border border-slate-800 bg-[#0A101D] text-slate-200 text-xs overflow-y-auto ${
                      editorMode === 'preview' ? 'col-span-2 h-[420px]' : 'h-[360px]'
                    }`}
                  >
                    <div className="prose prose-invert prose-cyan max-w-none text-xs leading-relaxed space-y-2 whitespace-pre-wrap font-sans">
                      {editorText}
                    </div>
                  </div>
                )}
              </div>

              {/* Version & Publication Options Box */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1">
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Обоснование изменений (Audit Reason / Changelog):
                    </label>
                    <input
                      type="text"
                      value={editorChangelog}
                      onChange={(e) => setEditorChangelog(e.target.value)}
                      placeholder="Например: Исправлена формулировка в фрагменте 3 теории..."
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-950 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="flex items-center space-x-3 text-xs text-slate-300">
                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bumpMinor}
                        onChange={(e) => {
                          setBumpMinor(e.target.checked);
                          if (e.target.checked) setBumpMajor(false);
                        }}
                        className="rounded border-slate-700 bg-slate-900 text-cyan-500"
                      />
                      <span>Версия +0.1</span>
                    </label>

                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bumpMajor}
                        onChange={(e) => {
                          setBumpMajor(e.target.checked);
                          if (e.target.checked) setBumpMinor(false);
                        }}
                        className="rounded border-slate-700 bg-slate-900 text-cyan-500"
                      />
                      <span>Мажорная +1.0</span>
                    </label>
                  </div>
                </div>

                {/* Action Buttons Footer */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleSaveLesson(false)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold flex items-center space-x-1.5 transition-colors"
                    >
                      <Save className="w-4 h-4 text-cyan-400" />
                      <span>Сохранить черновик</span>
                    </button>

                    {editorStatus === 'published' ? (
                      <button
                        onClick={() => {
                          setEditorStatus('draft');
                          handleSaveLesson(false);
                        }}
                        className="px-4 py-2 rounded-xl border border-amber-800 bg-amber-950/40 hover:bg-amber-900/40 text-amber-300 text-xs font-semibold transition-colors"
                      >
                        Снять с публикации (в черновик)
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSaveLesson(true)}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold flex items-center space-x-1.5 transition-all shadow-md shadow-emerald-600/20"
                      >
                        <Send className="w-4 h-4" />
                        <span>Опубликовать урок для курсантов</span>
                      </button>
                    )}
                  </div>

                  {saveSuccessNotice && (
                    <span className="text-xs text-emerald-400 font-medium flex items-center space-x-1 animate-pulse">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Изменения сохранены в постоянной базе данных!</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : selectedType === 'topic' && activeTopic ? (
            /* Topic Editor */
            <div className="rounded-2xl border border-slate-800 bg-[#111B2E] p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <span className="text-xs font-mono text-cyan-400 font-bold">{activeTopic.code}</span>
                  <h3 className="text-lg font-bold text-slate-100">{activeTopic.title}</h3>
                </div>
                <span className="text-xs font-mono text-emerald-400 uppercase font-semibold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                  {activeTopic.status}
                </span>
              </div>

              <div className="space-y-3 text-xs text-slate-300">
                <p><strong>Описание:</strong> {activeTopic.description}</p>
                <div>
                  <strong>Учебные цели темы:</strong>
                  <ul className="list-disc list-inside mt-1 space-y-1 text-slate-400">
                    {activeTopic.learningObjectives?.map((obj, i) => (
                      <li key={i}>{obj}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800">
                <h4 className="text-xs font-bold text-slate-200 mb-2">Уроки темы ({lessons.filter((l) => l.topicId === activeTopic.id).length}):</h4>
                <div className="space-y-1 font-mono text-xs">
                  {lessons.filter((l) => l.topicId === activeTopic.id).map((l) => (
                    <div
                      key={l.id}
                      onClick={() => {
                        setSelectedType('lesson');
                        setSelectedId(l.id);
                      }}
                      className="p-2 rounded-lg bg-slate-900/60 hover:bg-slate-800 cursor-pointer flex items-center justify-between text-slate-300"
                    >
                      <span className="text-cyan-400 font-bold">{l.code}</span>
                      <span className="font-sans truncate flex-1 mx-2">{l.title}</span>
                      <span className="text-[10px] text-slate-500 uppercase">{l.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Module Editor */
            <div className="rounded-2xl border border-slate-800 bg-[#111B2E] p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <span className="text-xs font-mono text-cyan-400 font-bold">{activeModule?.code}</span>
                  <h3 className="text-lg font-bold text-slate-100">{activeModule?.title}</h3>
                </div>
                <span className="text-xs font-mono text-cyan-400 uppercase font-semibold bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800">
                  {activeModule?.status}
                </span>
              </div>

              <div className="space-y-3 text-xs text-slate-300">
                <p><strong>Паспорт дисциплины:</strong> {activeModule?.shortDescription}</p>
                <p><strong>Почему это важно:</strong> {activeModule?.whyItMatters}</p>
                <p><strong>Что изучается:</strong> {activeModule?.whatIsStudied}</p>
              </div>

              <div className="pt-3 border-t border-slate-800">
                <h4 className="text-xs font-bold text-slate-200 mb-2">Утверждённые темы ({topics.filter((t) => t.moduleId === activeModule?.id).length}):</h4>
                <div className="space-y-1 font-mono text-xs">
                  {topics.filter((t) => t.moduleId === activeModule?.id).map((t) => (
                    <div
                      key={t.id}
                      onClick={() => {
                        setSelectedType('topic');
                        setSelectedId(t.id);
                      }}
                      className="p-2 rounded-lg bg-slate-900/60 hover:bg-slate-800 cursor-pointer flex items-center justify-between text-slate-300"
                    >
                      <span className="text-cyan-400 font-bold">{t.code}</span>
                      <span className="font-sans truncate flex-1 mx-2">{t.title}</span>
                      <span className="text-[10px] text-emerald-400 uppercase">{t.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ----------------- MODAL: IMPORT MATERIALS (Section 5) ----------------- */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-700 bg-[#111B2E] p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Upload className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-slate-100">Импортировать учебные материалы</h3>
              </div>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportSummary(null);
                }}
                className="text-slate-400 hover:text-slate-200 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Drag & Drop Upload Zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileAnalysis(e.dataTransfer.files[0]);
                }
              }}
              className="p-8 border-2 border-dashed border-slate-700 hover:border-cyan-500/80 rounded-2xl bg-slate-900/40 text-center cursor-pointer transition-colors space-y-2"
            >
              <Upload className="w-8 h-8 text-cyan-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-200">
                Перетащите файл сюда или нажмите для выбора
              </p>
              <p className="text-xs text-slate-400">
                Поддерживаются: JSON (полный импорт), Markdown отдельного урока (.md) или билетов экзамена
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.md,.zip"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileAnalysis(e.target.files[0]);
                  }
                }}
              />
            </div>

            {importAnalyzing && (
              <div className="p-4 text-center text-xs text-cyan-400 animate-pulse font-mono">
                Анализ структуры и контрольных сумм файла...
              </div>
            )}

            {/* Import Preview Table & Metrics (Section 5.3) */}
            {importSummary && (
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">Новые уроки</span>
                    <strong className="text-emerald-400 text-base">{importSummary.lessonsCreated}</strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">Обновления</span>
                    <strong className="text-amber-400 text-base">{importSummary.lessonsUpdated}</strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">Дубликаты / Без изм.</span>
                    <strong className="text-slate-300 text-base">{importSummary.unchangedCount}</strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">Компетенции / связи</span>
                    <strong className="text-cyan-400 text-base">{importSummary.skillsCreated + importSummary.relationsCreated}</strong>
                  </div>
                </div>

                {/* Diff Table */}
                <div className="border border-slate-800 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-800/80 text-xs">
                  {importSummary.diffs.map((d, i) => (
                    <div key={i} className="p-2.5 flex items-center justify-between">
                      <div className="flex items-center space-x-2 truncate">
                        <span className="font-mono text-[11px] font-bold text-slate-300">{d.entityId}</span>
                        <span className="text-slate-400 truncate font-sans">{d.entityTitle}</span>
                      </div>
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded uppercase font-semibold shrink-0 ml-2 ${
                          d.status === 'new'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : d.status === 'needs_update'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {d.status === 'new' ? 'Новый' : d.status === 'needs_update' ? 'Обновление' : 'Без изм.'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Conflict Mode Selection */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-300 pt-2 border-t border-slate-800">
                  <span>Режим обработки конфликтов:</span>
                  <select
                    value={conflictMode}
                    onChange={(e: any) => setConflictMode(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-100 text-xs focus:outline-none"
                  >
                    <option value="skip_unchanged_update_changed">Пропускать дубликаты, обновлять изменённые (Рекомендуется)</option>
                    <option value="keep_existing">Оставить текущие версии (только новые)</option>
                    <option value="overwrite_all">Перезаписать всё полностью</option>
                  </select>
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportSummary(null);
                }}
                className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 text-xs font-medium"
              >
                Отмена
              </button>

              {importSummary && (
                <button
                  onClick={handleCommitImport}
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all shadow-md shadow-cyan-500/20"
                >
                  {importSuccess ? 'Импортировано!' : 'Подтвердить и сохранить в базу'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ----------------- MODAL: VERSION HISTORY (Section 6.2) ----------------- */}
      {showHistoryModal && activeLesson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-[#111B2E] p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <History className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-slate-100">
                  История версий промпта {activeLesson.code}
                </h3>
              </div>
              <button onClick={() => setShowHistoryModal(false)} className="text-slate-400 hover:text-slate-200">
                ✕
              </button>
            </div>

            <div className="space-y-2.5">
              {/* Current Version */}
              <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-800/80 flex items-center justify-between">
                <div>
                  <span className="font-mono text-xs font-bold text-cyan-400">
                    Версия {activeLesson.version || '1.0'} (Текущая)
                  </span>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Статус: <span className="uppercase text-cyan-300 font-semibold">{activeLesson.status}</span>
                  </p>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {activeLesson.updatedAt ? new Date(activeLesson.updatedAt).toLocaleString() : 'Исходная'}
                </span>
              </div>

              {/* Historical records */}
              {activeLesson.versionHistory?.map((vh, i) => (
                <div key={i} className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-slate-200">Версия {vh.version}</span>
                      <span className="text-[10px] text-slate-400">({vh.authorName})</span>
                    </div>
                    <p className="text-slate-400 text-[11px] mt-0.5">{vh.changelog}</p>
                  </div>

                  <button
                    onClick={() => {
                      setComparedVersion(vh);
                      setShowCompareModal(true);
                    }}
                    className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium flex items-center space-x-1"
                  >
                    <GitCompare className="w-3 h-3 text-cyan-400" />
                    <span>Сравнить</span>
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-800 text-right">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-medium"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- MODAL: VERSION COMPARE / DIFF (Section 6.1) ----------------- */}
      {showCompareModal && comparedVersion && activeLesson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-4xl rounded-2xl border border-slate-700 bg-[#111B2E] p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <GitCompare className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-slate-100">
                  Сравнение версий: v{comparedVersion.version} ↔ v{activeLesson.version || '1.0'}
                </h3>
              </div>
              <button onClick={() => setShowCompareModal(false)} className="text-slate-400 hover:text-slate-200">
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="space-y-1">
                <span className="text-slate-400 block font-sans font-semibold">
                  Предыдущая версия ({comparedVersion.version}):
                </span>
                <textarea
                  readOnly
                  rows={20}
                  value={comparedVersion.promptText}
                  className="w-full p-3 rounded-xl border border-slate-800 bg-slate-950 text-slate-300 resize-none text-[11px] leading-relaxed"
                />
              </div>

              <div className="space-y-1">
                <span className="text-cyan-400 block font-sans font-semibold">
                  Текущая версия ({activeLesson.version || '1.0'}):
                </span>
                <textarea
                  readOnly
                  rows={20}
                  value={activeLesson.promptTemplate}
                  className="w-full p-3 rounded-xl border border-cyan-900/60 bg-slate-950 text-slate-200 resize-none text-[11px] leading-relaxed"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                onClick={() => {
                  setEditorText(comparedVersion.promptText);
                  setShowCompareModal(false);
                  setShowHistoryModal(false);
                }}
                className="px-3.5 py-1.5 rounded-lg border border-amber-800 bg-amber-950/40 text-amber-300 text-xs font-semibold"
              >
                Восстановить текст версии {comparedVersion.version}
              </button>

              <button
                onClick={() => setShowCompareModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-medium"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
