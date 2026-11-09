export type RelationKind = 'prerequisite' | 'application' | 'complementary' | 'capstone-integration';
export type Approval = 'proposed' | 'approved' | 'rejected';
export interface ModuleRelation {
  id: string; source: string; target: string; relation: RelationKind; displayTier: 'overview' | 'focus';
  label: string; knowledgeTransfers: {sourceKnowledge: string; targetApplication: string}[];
  evidenceStatus: 'mentioned-in-passport-v0.6' | 'expert-proposed-extension'; evidenceNote: string;
  approvalStatus: Approval; isAccessGate: false; directionality: 'source-to-target' | 'undirected';
}
export interface ModuleGraphDocument { nodes: {id: string}[]; edges: ModuleRelation[]; [key: string]: unknown }
export function validateModuleGraph(input: any, moduleIds: string[]): string[] {
  const errors: string[] = [];
  if (!input || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) return ['Требуются массивы nodes и edges.'];
  const ids = new Set(moduleIds), nodes = input.nodes.map((n: any) => n?.id);
  if (nodes.length !== ids.size || new Set(nodes).size !== ids.size || nodes.some((id: string) => !ids.has(id))) errors.push('Узлы не совпадают с ID существующих модулей.');
  const seen = new Set<string>();
  for (const e of input.edges) {
    if (!e || typeof e !== 'object') { errors.push('Некорректное ребро.'); continue; }
    if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target || e.id !== `${e.source}__${e.target}` || seen.has(e.id)) errors.push(`Некорректный или повторный ID: ${e.id}`);
    seen.add(e.id);
    if (!['prerequisite','application','complementary','capstone-integration'].includes(e.relation) || !['focus','overview'].includes(e.displayTier) || !['proposed','approved','rejected'].includes(e.approvalStatus) || !['mentioned-in-passport-v0.6','expert-proposed-extension'].includes(e.evidenceStatus) || e.isAccessGate !== false || e.directionality !== (e.relation === 'complementary' ? 'undirected' : 'source-to-target')) errors.push(`${e.id}: некорректная семантика.`);
    if (typeof e.label !== 'string' || !e.label.trim() || typeof e.evidenceNote !== 'string' || !e.evidenceNote.trim() || !Array.isArray(e.knowledgeTransfers) || !e.knowledgeTransfers.length || e.knowledgeTransfers.some((t: any) => typeof t.sourceKnowledge !== 'string' || !t.sourceKnowledge.trim() || typeof t.targetApplication !== 'string' || !t.targetApplication.trim())) errors.push(`${e.id}: не заполнено объяснение.`);
  }
  return errors;
}
export function graphDiff(existing: ModuleRelation[], incoming: ModuleRelation[]) {
  const byId = new Map(existing.map(e => [e.id, e]));
  return incoming.map(edge => {
    const old = byId.get(edge.id);
    if (!old) return {id: edge.id, action:'add' as const, reason:'Новая связь'};
    if (JSON.stringify(old) === JSON.stringify(edge)) return {id: edge.id, action:'unchanged' as const, reason:'Без изменений'};
    if (old.approvalStatus !== 'proposed') return {id: edge.id, action:'conflict' as const, reason:'Ментор уже принял решение; требуется подтверждение замены.'};
    return {id: edge.id, action:'update' as const, reason:'Данные предложения изменились'};
  });
}
export function graphPath(edges: ModuleRelation[], from: string, to = 'M18'): ModuleRelation[] {
  const queue: {id:string; path:ModuleRelation[]}[] = [{id:from,path:[]}], seen = new Set([from]);
  while (queue.length) { const item=queue.shift()!; if (item.id===to) return item.path; for (const edge of edges) if (edge.source===item.id && edge.relation !== 'complementary' && !seen.has(edge.target)) { seen.add(edge.target); queue.push({id:edge.target,path:[...item.path,edge]}); } }
  return [];
}
