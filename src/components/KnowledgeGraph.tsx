/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Search,
  Filter,
  CheckCircle2,
  Lock,
  Clock,
  AlertCircle,
  Sparkles,
  ArrowRight,
  ListFilter,
  Layers,
  Info,
  X,
  Compass,
} from "lucide-react";
import { GraphNode, GraphEdge, SkillMasteryStatus } from "../types";

interface KnowledgeGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onSelectNode?: (node: GraphNode) => void;
  onNavigateToModule?: (moduleId: string) => void;
  onNavigateToLesson?: (lessonId: string) => void;
}

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({
  nodes,
  edges,
  onSelectNode,
  onNavigateToModule,
  onNavigateToLesson,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>("M01");
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.8);
  const [pan, setPan] = useState({ x: 40, y: 30 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"graph" | "list">("graph");

  const svgRef = useRef<SVGSVGElement | null>(null);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  // Filtered nodes
  const filteredNodes = useMemo(() => {
    return nodes.filter((n) => {
      const matchSearch =
        searchQuery.trim() === "" ||
        n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchLevel = levelFilter === "all" || n.level === levelFilter;
      const matchStatus = statusFilter === "all" || (n.status || "available") === statusFilter;

      return matchSearch && matchLevel && matchStatus;
    });
  }, [nodes, searchQuery, levelFilter, statusFilter]);

  const filteredNodeIds = useMemo(
    () => new Set(filteredNodes.map((n) => n.id)),
    [filteredNodes]
  );

  // Edges that connect visible nodes
  const visibleEdges = useMemo(() => {
    return edges.filter(
      (e) => filteredNodeIds.has(e.from) && filteredNodeIds.has(e.to)
    );
  }, [edges, filteredNodeIds]);

  // Connected edges to selected or hovered node
  const activeFocusId = hoveredNodeId || selectedNodeId;
  const connectedNodeIds = useMemo(() => {
    if (!activeFocusId) return new Set<string>();
    const set = new Set<string>([activeFocusId]);
    edges.forEach((e) => {
      if (e.from === activeFocusId) set.add(e.to);
      if (e.to === activeFocusId) set.add(e.from);
    });
    return set;
  }, [activeFocusId, edges]);

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoom = (delta: number) => {
    setZoom((prev) => Math.max(0.4, Math.min(2.5, prev + delta)));
  };

  const handleFitToScreen = () => {
    setZoom(0.8);
    setPan({ x: 40, y: 30 });
  };

  const getStatusColor = (status?: SkillMasteryStatus) => {
    switch (status) {
      case "confirmed":
        return { border: "#10b981", bg: "#064e3b", text: "#34d399", label: "Подтверждено" };
      case "studied":
      case "in_progress":
        return { border: "#06b6d4", bg: "#164e63", text: "#38bdf8", label: "В процессе" };
      case "available":
        return { border: "#64748b", bg: "#1e293b", text: "#94a3b8", label: "Доступно" };
      case "needs_review":
        return { border: "#f59e0b", bg: "#78350f", text: "#fbbf24", label: "Требует внимания" };
      case "locked":
      default:
        return { border: "#334155", bg: "#0f172a", text: "#64748b", label: "Заблокировано" };
    }
  };

  const getNodeDims = (node: GraphNode) => {
    if (node.level === 1) return { w: 200, h: 64 };
    if (node.level === 2) return { w: 220, h: 60 };
    return { w: 160, h: 48 };
  };

  return (
    <div className="relative w-full h-[700px] rounded-2xl border border-slate-800 bg-[#070C18] overflow-hidden flex flex-col shadow-2xl select-none">
      {/* Top Toolbar */}
      <div className="z-10 px-4 py-3 border-b border-slate-800/80 bg-[#090F1C]/90 backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-cyan-400">
            <Compass className="w-5 h-5 text-cyan-400 animate-pulse" />
            <span className="font-bold text-sm tracking-wide text-slate-100 uppercase font-mono">
              Flight Route: Карта знаний
            </span>
          </div>

          <div className="hidden sm:flex items-center space-x-1 pl-3 border-l border-slate-800">
            <button
              onClick={() => setViewMode("graph")}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                viewMode === "graph"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              2D Граф
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                viewMode === "list"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Иерархический список
            </button>
          </div>
        </div>

        {/* Filters and search */}
        <div className="flex items-center space-x-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по коду или теме..."
              className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 w-36 sm:w-48"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Level Filter */}
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
          >
            <option value="all">Все уровни (Полная карта)</option>
            <option value="1">Уровень 1: 18 Модулей (Магистрали)</option>
            <option value="2">Уровень 2: 8 Тем M01 (Коридоры)</option>
            <option value="3">Уровень 3: Компетенции и навыки</option>
          </select>

          {/* Zoom controls */}
          {viewMode === "graph" && (
            <div className="flex items-center space-x-1 pl-2 border-l border-slate-800">
              <button
                onClick={() => handleZoom(0.15)}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                title="Приблизить"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleZoom(-0.15)}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                title="Отдалить"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleFitToScreen}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                title="По размеру экрана"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Graph Canvas */}
      {viewMode === "graph" ? (
        <div
          className="relative flex-1 cursor-grab active:cursor-grabbing overflow-hidden"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Subtle Grid Backdrop */}
          <div
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, #36D7F5 1px, transparent 0)",
              backgroundSize: "40px 40px",
            }}
          />

          <svg
            ref={svgRef}
            className="w-full h-full"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              transition: isDragging ? "none" : "transform 0.1s ease-out",
            }}
          >
            <defs>
              {/* Gradients and Filters for Flight Route aesthetics */}
              <linearGradient id="routeGradientCyan" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#36D7F5" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#9478FF" stopOpacity="0.8" />
              </linearGradient>

              <linearGradient id="routeGradientDimmed" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#334155" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#1e293b" stopOpacity="0.2" />
              </linearGradient>

              {/* Directional Flight-Route Arrowhead Markers */}
              <marker
                id="flightArrowCyan"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#36D7F5" />
              </marker>

              <marker
                id="flightArrowDimmed"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto"
              >
                <path d="M 0 2 L 8 5 L 0 8 z" fill="#334155" />
              </marker>

              <filter id="glowCyan" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Flight-Route Edges (Curved Bézier Great-Circle Arcs) */}
            <g className="edges-layer">
              {visibleEdges.map((edge) => {
                const source = nodes.find((n) => n.id === edge.from);
                const target = nodes.find((n) => n.id === edge.to);
                if (!source || !target) return null;

                const sDims = getNodeDims(source);
                const tDims = getNodeDims(target);
                const sx = source.x + sDims.w / 2;
                const sy = source.y + sDims.h / 2;
                const tx = target.x + tDims.w / 2;
                const ty = target.y + tDims.h / 2;

                // Aviation great-circle arc: perpendicular normal vector
                const dx = tx - sx;
                const dy = ty - sy;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const nx = -dy / dist;
                const ny = dx / dist;
                const arcHeight = Math.min(80, Math.max(30, dist * 0.22));

                const cx1 = sx + dx * 0.35 + nx * arcHeight;
                const cy1 = sy + dy * 0.35 + ny * arcHeight;
                const cx2 = sx + dx * 0.65 + nx * arcHeight;
                const cy2 = sy + dy * 0.65 + ny * arcHeight;

                const pathData = `M ${sx} ${sy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${tx} ${ty}`;

                const isConnected =
                  !activeFocusId ||
                  edge.from === activeFocusId ||
                  edge.to === activeFocusId;

                const strokeColor = isConnected ? "url(#routeGradientCyan)" : "#1e293b";
                const strokeWidth = isConnected ? 2.5 : 1;
                const strokeDash = edge.type === "related" ? "4 4" : undefined;

                return (
                  <g key={edge.id} className="transition-all duration-200">
                    {/* Shadow / glow path */}
                    {isConnected && (
                      <path
                        d={pathData}
                        fill="none"
                        stroke="#36D7F5"
                        strokeWidth={6}
                        strokeOpacity={0.15}
                        filter="url(#glowCyan)"
                      />
                    )}
                    {/* Main Oriented Flight Path */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      strokeDasharray={strokeDash}
                      markerEnd={isConnected ? "url(#flightArrowCyan)" : "url(#flightArrowDimmed)"}
                      className={isConnected ? "animate-pulse" : ""}
                    />
                    {/* Moving pulse light on active route */}
                    {isConnected && (
                      <circle r="3" fill="#36D7F5" filter="url(#glowCyan)">
                        <animateMotion
                          path={pathData}
                          dur="4s"
                          repeatCount="indefinite"
                        />
                      </circle>
                    )}
                  </g>
                );
              })}
            </g>

            {/* Flight-Route Nodes */}
            <g className="nodes-layer">
              {filteredNodes.map((node) => {
                const isSelected = selectedNodeId === node.id;
                const isHovered = hoveredNodeId === node.id;
                const isConnected = !activeFocusId || connectedNodeIds.has(node.id);
                const statusStyle = getStatusColor(node.status);
                const { w: width, h: height } = getNodeDims(node);

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNodeId(node.id);
                      if (onSelectNode) onSelectNode(node);
                    }}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    className="cursor-pointer transition-transform duration-150"
                    opacity={isConnected ? 1 : 0.25}
                  >
                    {/* Glowing highlight for active/selected node */}
                    {(isSelected || isHovered) && (
                      <rect
                        x="-3"
                        y="-3"
                        width={width + 6}
                        height={height + 6}
                        rx="12"
                        fill="none"
                        stroke="#36D7F5"
                        strokeWidth="2"
                        filter="url(#glowCyan)"
                      />
                    )}

                    {/* Node Card Rectangle */}
                    <rect
                      x="0"
                      y="0"
                      width={width}
                      height={height}
                      rx="10"
                      fill={node.level === 1 ? "#111B2E" : "#0E1626"}
                      stroke={isSelected ? "#36D7F5" : statusStyle.border}
                      strokeWidth={isSelected ? 2 : 1}
                      className="shadow-xl"
                    />

                    {/* Level 1 Accent Bar */}
                    {node.level === 1 && (
                      <rect
                        x="0"
                        y="0"
                        width="4"
                        height={height}
                        rx="2"
                        fill={isSelected ? "#36D7F5" : "#9478FF"}
                      />
                    )}

                    {/* Status Dot */}
                    <circle
                      cx={node.level === 1 ? 16 : 14}
                      cy="16"
                      r="4"
                      fill={statusStyle.border}
                    />

                    {/* Code Badge */}
                    <text
                      x={node.level === 1 ? 26 : 24}
                      y="19"
                      fill="#94A6BF"
                      fontSize="10"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      {node.code}
                    </text>

                    {/* Title */}
                    <text
                      x="14"
                      y={node.level === 3 ? "32" : "38"}
                      fill="#F1F5FA"
                      fontSize={node.level === 1 ? "11.5" : node.level === 2 ? "11" : "10"}
                      fontWeight="600"
                    >
                      {node.title.length > 25 ? node.title.slice(0, 23) + "…" : node.title}
                    </text>

                    {/* Subtitle / Status text */}
                    <text
                      x="14"
                      y={node.level === 1 ? "53" : node.level === 2 ? "51" : "42"}
                      fill={statusStyle.text}
                      fontSize="8.5"
                    >
                      {statusStyle.label}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      ) : (
        /* Accessible List View Fallback (Mobile-friendly, WCAG AA) */
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 divide-y divide-slate-800">
          <div className="pb-3 text-xs text-slate-400">
            Отображается {filteredNodes.length} элементов учебного маршрута. Нажмите для инспекции:
          </div>
          {filteredNodes.map((n) => {
            const st = getStatusColor(n.status);
            return (
              <div
                key={n.id}
                onClick={() => setSelectedNodeId(n.id)}
                className={`py-3 px-3 rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                  selectedNodeId === n.id ? "bg-cyan-950/40 border border-cyan-800/60" : "hover:bg-slate-900"
                }`}
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-bold text-cyan-400">{n.code}</span>
                    <span className="text-xs uppercase px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                      {n.level === 1 ? "Дисциплина" : "Навык"}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold text-slate-100 mt-0.5">{n.title}</h4>
                  <p className="text-xs text-slate-400 line-clamp-1">{n.description}</p>
                </div>

                <div className="text-right">
                  <span
                    className="text-xs px-2 py-0.5 rounded font-mono font-medium"
                    style={{ backgroundColor: st.bg, color: st.text }}
                  >
                    {st.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selected Node Side Inspector Drawer */}
      {selectedNode && (
        <div className="absolute right-0 top-14 bottom-0 w-80 sm:w-96 bg-[#111B2E]/95 backdrop-blur-md border-l border-slate-800 p-5 shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200 z-20">
          <div>
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                  {selectedNode.code}
                </span>
                <h3 className="text-base font-bold text-slate-100 mt-2">{selectedNode.title}</h3>
                <span className="text-xs text-slate-400 font-mono">
                  {selectedNode.level === 1 ? "Дисциплина (Уровень 1)" : "Компетенция (Уровень 3)"}
                </span>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <h5 className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  Описание:
                </h5>
                <p className="text-xs text-slate-300 leading-relaxed">{selectedNode.description}</p>
              </div>

              {/* Prerequisites */}
              <div>
                <h5 className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5 flex items-center space-x-1">
                  <span>Предшествующие знания (Prerequisites):</span>
                </h5>
                {selectedNode.prerequisites && selectedNode.prerequisites.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedNode.prerequisites.map((prId) => (
                      <button
                        key={prId}
                        onClick={() => setSelectedNodeId(prId)}
                        className="px-2 py-1 rounded bg-slate-900 border border-slate-700/80 text-cyan-300 text-[11px] font-mono hover:border-cyan-500 transition-colors"
                      >
                        {prId}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Базовый узел (нет зависимостей)</p>
                )}
              </div>

              {/* Future Applications */}
              <div>
                <h5 className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
                  Где применяется далее (Future Applications):
                </h5>
                {selectedNode.futureApplications && selectedNode.futureApplications.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedNode.futureApplications.map((faId) => (
                      <button
                        key={faId}
                        onClick={() => setSelectedNodeId(faId)}
                        className="px-2 py-1 rounded bg-slate-900 border border-slate-700/80 text-violet-300 text-[11px] font-mono hover:border-violet-400 transition-colors"
                      >
                        {faId}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Конечный синтез программы</p>
                )}
              </div>

              {/* Status */}
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
                <span className="text-slate-400">Статус освоения: </span>
                <span className="font-semibold text-cyan-400 font-mono">
                  {getStatusColor(selectedNode.status).label}
                </span>
              </div>
            </div>
          </div>

          {/* Action button */}
          <div className="pt-4 border-t border-slate-800 mt-6">
            {selectedNode.level === 1 ? (
              <button
                onClick={() => {
                  if (onNavigateToModule) onNavigateToModule(selectedNode.id);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center justify-center space-x-2 shadow-lg shadow-cyan-500/20 transition-all active:scale-98"
              >
                <span>Открыть дисциплину {selectedNode.code}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => {
                  if (onNavigateToLesson) onNavigateToLesson("M01-T01-U01");
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center justify-center space-x-2 shadow-lg shadow-cyan-500/20 transition-all active:scale-98"
              >
                <span>Изучить в уроке M01-T01-U01</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
