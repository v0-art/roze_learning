import type { ModuleItem, RelationItem, TopicItem } from '../types';

export interface MapConnection {
  from: string;
  to: string;
}

/** Only relations explicitly present in the curriculum are shown. */
export function moduleConnections(modules: ModuleItem[], topics: TopicItem[], relations: RelationItem[]): MapConnection[] {
  const moduleIds = new Set(modules.map(module => module.id));
  const topicModules = new Map(topics.map(topic => [topic.id, topic.moduleId]));
  const links = new Map<string, MapConnection>();
  const add = (from: string | undefined, to: string | undefined) => {
    if (!from || !to || from === to || !moduleIds.has(from) || !moduleIds.has(to)) return;
    links.set(`${from}|${to}`, {from, to});
  };
  for (const module of modules) {
    for (const previous of module.prerequisites || []) add(previous, module.id);
    for (const next of module.futureApplications || []) add(module.id, next);
  }
  for (const relation of relations) {
    add(moduleIds.has(relation.fromId) ? relation.fromId : topicModules.get(relation.fromId),
      moduleIds.has(relation.toId) ? relation.toId : topicModules.get(relation.toId));
  }
  return [...links.values()];
}

export function topicConnections(topics: TopicItem[], relations: RelationItem[]): MapConnection[] {
  const ids = new Set(topics.map(topic => topic.id));
  const links = new Map<string, MapConnection>();
  for (const relation of relations) {
    if (relation.fromId === relation.toId || !ids.has(relation.fromId) || !ids.has(relation.toId)) continue;
    links.set(`${relation.fromId}|${relation.toId}`, {from: relation.fromId, to: relation.toId});
  }
  return [...links.values()];
}
