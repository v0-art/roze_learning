import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Maximize2, X } from 'lucide-react';
import type { ModuleItem, RelationItem, SkillItem, TopicItem } from '../types';
import { moduleConnections, topicConnections } from '../core/knowledgeMap';
import { ModuleOverview } from './ModuleOverview';
import { getCurrentUser } from '../services/storage';
import type {ModuleRelation} from '../core/moduleGraph';

interface KnowledgeGraphProps {
  modules: ModuleItem[];
  topics: TopicItem[];
  relations: RelationItem[];
  skills: SkillItem[];
  onExit: () => void;
  moduleGraphEdges?: ModuleRelation[];
  mentor?: boolean;
}

type MapItem = { id: string; title: string; description?: string };
type PositionedItem = MapItem & { x: number; y: number };

const CARD_WIDTH = 176;
const CARD_HEIGHT = 72;
const STEP_X = 250;
const STEP_Y = 168;
const MARGIN = 24;
const NODE_COLORS = ['#c6a7f4', '#91b8ed', '#81cbd1', '#e5a9ca', '#d4b478', '#a8c993', '#e39b91', '#ad9ee5', '#78b6ca', '#d1a4d8', '#9dc9bc', '#e0ba92', '#adbee4', '#d59cb1', '#a3c5e5', '#c5bf89', '#96ceb0', '#d0a6b9'];

// Orthogonal segments with small rounded elbows, like parallel cables in a tray.
function cablePath(points: {x: number; y: number}[]) {
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1], corner = points[i], next = points[i + 1];
    const before = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const after = Math.hypot(next.x - corner.x, next.y - corner.y);
    if (!before || !after) { path += ` L ${corner.x} ${corner.y}`; continue; }
    const radius = Math.min(7, before / 2, after / 2);
    const x1 = corner.x + (previous.x - corner.x) * radius / before;
    const y1 = corner.y + (previous.y - corner.y) * radius / before;
    const x2 = corner.x + (next.x - corner.x) * radius / after;
    const y2 = corner.y + (next.y - corner.y) * radius / after;
    path += ` L ${x1} ${y1} Q ${corner.x} ${corner.y} ${x2} ${y2}`;
  }
  const last = points[points.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}


function wrapTitle(title: string): string[] {
  const lines: string[] = [];
  for (const word of title.split(/\s+/)) {
    const last = lines.length - 1;
    if (last < 0 || `${lines[last]} ${word}`.length > 21) lines.push(word);
    else lines[last] += ` ${word}`;
  }
  if (lines.length > 2) return [lines[0], `${lines[1].slice(0, 19)}…`];
  return lines;
}

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ modules, topics, relations, skills, onExit,moduleGraphEdges,mentor }) => {
  const [moduleId, setModuleId] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [panelSide, setPanelSide] = useState<'left' | 'right'>('right');
  const [hovered, setHovered] = useState<string | null>(null);
  const [camera, setCamera] = useState({ scale: 1, x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const svgPoint = (svg: SVGSVGElement, clientX: number, clientY: number) => {
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(matrix.inverse());
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = svgPoint(svg, event.clientX, event.clientY);
      if (!point) return;
      setCamera(current => {
        const scale = Math.max(0.5, Math.min(5, current.scale * Math.exp(-event.deltaY * 0.0015)));
        const ratio = scale / current.scale;
        return { scale, x: point.x - (point.x - current.x) * ratio, y: point.y - (point.y - current.y) * ratio };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [moduleId, topics, modules]);
  const activeModule = modules.find(module => module.id === moduleId);
  const moduleTopics = useMemo(() => topics.filter(topic => topic.moduleId === moduleId).sort((a, b) => a.order - b.order), [topics, moduleId]);
  const items: MapItem[] = moduleId
    ? moduleTopics.map(topic => ({id: topic.id, title: topic.title, description: topic.description}))
    : [...modules].sort((a, b) => a.order - b.order).map(module => ({id: module.id, title: module.title}));
  const links = moduleId ? topicConnections(moduleTopics, relations) : moduleConnections(modules, topics, relations);
  const columns = Math.min(moduleId ? 4 : 6, Math.max(1, items.length));
  const rows = Math.ceil(items.length / columns);
  const width = MARGIN * 2 + (columns - 1) * STEP_X + CARD_WIDTH;
  const height = MARGIN * 2 + (rows - 1) * STEP_Y + CARD_HEIGHT;
  const positioned: PositionedItem[] = items.map((item, index) => ({...item, x: MARGIN + (index % columns) * STEP_X, y: MARGIN + Math.floor(index / columns) * STEP_Y}));
  const positions = new Map(positioned.map(item => [item.id, item]));
  const colors = new Map(positioned.map((item, index) => [item.id, NODE_COLORS[index % NODE_COLORS.length]]));
  const focus = hovered || selectedTopic;
  const topic = topics.find(item => item.id === selectedTopic);
  const topicSkills = skills.filter(skill => skill.topicId === selectedTopic);
  const topicRelations = relations.filter(relation => relation.fromId === selectedTopic || relation.toId === selectedTopic).map(relation => {
    const otherId = relation.fromId === selectedTopic ? relation.toId : relation.fromId;
    const otherModule = modules.find(item => item.id === otherId);
    const otherTopic = topics.find(item => item.id === otherId);
    if (!otherModule && !otherTopic) return null;
    const crossSubject = otherModule ? otherModule.id !== moduleId : otherTopic?.moduleId !== moduleId;
    const label = relation.type === 'prerequisite' ? (relation.toId === selectedTopic ? 'Предварительная тема' : 'Основа для') : relation.fromId === selectedTopic ? 'Применяется в' : 'Связано с';
    const description = relation.description && !/^Связь между\s/i.test(relation.description) ? relation.description : '';
    return {id: relation.id, name: `${otherId} · ${otherModule?.title || otherTopic?.title}`, crossSubject, label, description};
  }).filter((relation): relation is NonNullable<typeof relation> => relation !== null);
  const selectTopic = (id: string, element: SVGGElement) => {
    const node = element.getBoundingClientRect();
    const graph = svgRef.current?.getBoundingClientRect();
    setPanelSide(graph && node.left + node.width / 2 > graph.left + graph.width / 2 ? 'left' : 'right');
    setSelectedTopic(id);
  };

  const enterModule = (id: string) => {
    setModuleId(id);
    setSelectedTopic(null);
    setHovered(null);
    setCamera({ scale: 1, x: 0, y: 0 });
  };
  const backToModules = () => {
    setModuleId(null);
    setSelectedTopic(null);
    setHovered(null);
    setCamera({ scale: 1, x: 0, y: 0 });
  };

  if (!moduleId) return <ModuleOverview modules={modules} onEnter={enterModule} onExit={onExit} admin={mentor??(getCurrentUser().role === 'admin')} suppliedEdges={moduleGraphEdges} />;

  return <section className="relative flex h-full w-full flex-col overflow-hidden bg-[#100b19]">
    <div className="z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-[#1a1328] px-4 py-3">
      <div className="flex items-center gap-3">
        <button onClick={onExit} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:border-cyan-400" aria-label="Выйти из карты"><ArrowLeft size={15} /> Кабинет</button>
        {moduleId && <button onClick={backToModules} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:border-cyan-400" aria-label="Вернуться к модулям"><ArrowLeft size={15} /> Все модули</button>}
        <div>
          <h2 className="font-semibold text-slate-100">{activeModule ? `${activeModule.code} · ${activeModule.title}` : 'Модули курса'}</h2>
          <p className="mt-1 text-xs text-slate-400">{activeModule ? 'Темы модуля и связи между ними' : 'Выберите модуль, чтобы увидеть его темы и связи'}</p>
        </div>
      </div>
      <button type="button" onClick={() => setCamera({ scale: 1, x: 0, y: 0 })} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:border-cyan-400" title="Показать всю карту"><Maximize2 size={15} /> Вся карта</button>
    </div>

    {items.length === 0 ? <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-slate-400">Для этого модуля темы пока не загружены.</div> : <>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#100b19]" style={{backgroundImage: 'radial-gradient(circle at 1px 1px, #4a385d 1px, transparent 0)', backgroundSize: '32px 32px'}}>
        <svg
          ref={svgRef}
          viewBox={`${-width * 0.25} ${-height * 0.25} ${width * 1.5} ${height * 1.5}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={moduleId ? 'Карта тем модуля' : 'Карта модулей курса'}
          className="block h-full w-full touch-none"
          onPointerDown={event => {
            if (event.button !== 0 || (event.target as Element).closest('[data-map-node]')) return;
            const point = svgPoint(event.currentTarget, event.clientX, event.clientY);
            if (!point) return;
            dragRef.current = { x: point.x, y: point.y, panX: camera.x, panY: camera.y };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => {
            if (!dragRef.current) return;
            const point = svgPoint(event.currentTarget, event.clientX, event.clientY);
            if (point) setCamera(current => ({ ...current, x: dragRef.current!.panX + point.x - dragRef.current!.x, y: dragRef.current!.panY + point.y - dragRef.current!.y }));
          }}
          onPointerUp={event => { dragRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
          onPointerCancel={() => { dragRef.current = null; }}
        >
          <defs>{positioned.map(item => <marker key={item.id} id={`map-arrow-${item.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9 z" fill={colors.get(item.id)} /></marker>)}</defs>
          <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
          {links.map(link => {
            const from = positions.get(link.from), to = positions.get(link.to);
            if (!from || !to) return null;
            const outgoing = links.filter(edge => edge.from === link.from);
            const incoming = links.filter(edge => edge.to === link.to);
            const outIndex = outgoing.findIndex(edge => edge.to === link.to);
            const inIndex = incoming.findIndex(edge => edge.from === link.from);
            const port = (index: number, count: number) => CARD_WIDTH * (index + 1) / (count + 1);
            const x1 = from.x + port(outIndex, outgoing.length);
            const x2 = to.x + port(inIndex, incoming.length);
            const direction = to.y >= from.y ? 1 : -1;
            const y1 = direction === 1 ? from.y + CARD_HEIGHT : from.y;
            const y2 = to.y === from.y ? to.y + CARD_HEIGHT : direction === 1 ? to.y : to.y + CARD_HEIGHT;
            const lane1 = y1 + direction * (12 + (outIndex % 12) * 4);
            const lane2 = y2 - direction * (12 + (inIndex % 12) * 4);
            const channelX = from.x + CARD_WIDTH + 12 + (outIndex % 12) * 4;
            const points = to.y === from.y
              ? [{x:x1,y:y1}, {x:x1,y:lane1}, {x:x2,y:lane1}, {x:x2,y:y2}]
              : [{x:x1,y:y1}, {x:x1,y:lane1}, {x:channelX,y:lane1}, {x:channelX,y:lane2}, {x:x2,y:lane2}, {x:x2,y:y2}];
            const active = focus === link.from || focus === link.to;
            return <path key={`${link.from}-${link.to}`} data-map-edge d={cablePath(points)} fill="none" stroke={colors.get(link.to)} strokeWidth={active ? 2.6 : 1.5} strokeLinecap="round" strokeLinejoin="round" opacity={focus && !active ? 0.15 : 0.8} markerEnd={`url(#map-arrow-${link.to})`} />;
          })}
          {positioned.map(item => {
            const highlighted = focus === item.id || Boolean(focus && links.some(link => (link.from === focus && link.to === item.id) || (link.to === focus && link.from === item.id)));
            return <g key={item.id} data-map-node role="button" tabIndex={0} aria-label={`${moduleId ? 'Тема' : 'Модуль'} ${item.id}: ${item.title}`} onMouseEnter={() => setHovered(item.id)} onMouseLeave={() => setHovered(null)} onClick={event => moduleId ? selectTopic(item.id, event.currentTarget) : enterModule(item.id)} onKeyDown={event => {if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); moduleId ? selectTopic(item.id, event.currentTarget) : enterModule(item.id);}}} className="cursor-pointer" opacity={focus && !highlighted ? 0.65 : 1}>
              <title>{item.id}: {item.title}</title>
              <rect x={item.x} y={item.y} width={CARD_WIDTH} height={CARD_HEIGHT} rx="10" fill="#20172f" stroke={highlighted ? '#c6b3f5' : '#685671'} strokeWidth={highlighted ? 2 : 1} />
              <rect x={item.x} y={item.y} width="4" height={CARD_HEIGHT} rx="2" fill={colors.get(item.id)} />
              <text x={item.x + 15} y={item.y + 18} fill="#e0d2ff" fontSize="12" fontWeight="700">{item.id}</text>
              <text x={item.x + 15} y={item.y + 36} fill="#f8f3fb" fontSize="11" fontWeight="600">{wrapTitle(item.title).map((line, index) => <tspan key={index} x={item.x + 15} dy={index ? 13 : 0}>{line}</tspan>)}</text>
              {!moduleId && <text x={item.x + 15} y={item.y + 64} fill="#b6a9c5" fontSize="10">Открыть темы →</text>}
            </g>;
          })}
          </g>
        </svg>
        {topic && <aside aria-label="Сведения о теме" className={`absolute bottom-3 top-3 z-20 w-[min(34rem,calc(100%-1.5rem))] overflow-y-auto rounded-2xl border border-violet-300/20 bg-[#1a1328]/95 p-6 sm:p-8 text-slate-100 shadow-2xl backdrop-blur-sm ${panelSide === 'left' ? 'left-3' : 'right-3'}`}>
          <div className="flex items-start justify-between gap-3"><div><p className="text-base font-semibold tracking-wider text-violet-300">{topic.code}</p><h3 className="mt-1 text-xl font-semibold leading-snug">{topic.title}</h3></div><button onClick={() => setSelectedTopic(null)} aria-label="Закрыть сведения о теме" className="rounded-lg p-1 text-slate-300 hover:bg-white/10"><X size={20} /></button></div>
          <section className="mt-5"><h4 className="text-base font-semibold text-violet-200">О теме</h4><p className="mt-2 text-base leading-relaxed text-slate-300">{topic.description || 'Описание темы пока не заполнено.'}</p></section>
          {topic.learningObjectives?.length > 0 && <section className="mt-5"><h4 className="text-base font-semibold text-violet-200">Цели изучения</h4><ul className="mt-2 list-disc space-y-1 pl-4 text-base text-slate-300">{topic.learningObjectives.map(objective => <li key={objective}>{objective}</li>)}</ul></section>}
          {topicSkills.length > 0 && <section className="mt-5"><h4 className="text-base font-semibold text-violet-200">Что изучается</h4><ul className="mt-2 space-y-3">{topicSkills.map(skill => <li key={skill.id} className="text-base text-slate-300"><span className="font-medium text-slate-100">{skill.name}</span>{skill.description && <p className="mt-1 leading-relaxed">{skill.description}</p>}</li>)}</ul></section>}
          <section className="mt-5"><h4 className="text-base font-semibold text-violet-200">Межпредметные связи</h4>{topicRelations.some(link => link.crossSubject) ? <ul className="mt-2 space-y-3">{topicRelations.filter(link => link.crossSubject).map(link => <li key={link.id} className="text-base text-slate-300"><span className="text-base text-violet-300">{link.label}</span><p className="mt-1 font-medium text-slate-100">{link.name}</p><p className="mt-1">{link.description || 'Пояснение связи ещё не заполнено в учебном плане.'}</p></li>)}</ul> : <p className="mt-2 text-base text-slate-400">Связи с другими дисциплинами пока не указаны.</p>}</section>
          {topicRelations.some(link => !link.crossSubject) && <section className="mt-5"><h4 className="text-base font-semibold text-violet-200">Связи с темами модуля</h4><ul className="mt-2 space-y-2">{topicRelations.filter(link => !link.crossSubject).map(link => <li key={link.id} className="text-base text-slate-300"><span className="text-base text-violet-300">{link.label}</span><p>{link.name}</p>{link.description && <p className="mt-1">{link.description}</p>}</li>)}</ul></section>}
        </aside>}
      </div>
    </>}
  </section>;
};
