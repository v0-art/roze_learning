import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { moduleConnections, topicConnections } from './knowledgeMap';

const data = JSON.parse(fs.readFileSync('data/nexus_academy.json', 'utf8'));

test('map derives distinct links from curriculum, at each level separately', () => {
  const modules = moduleConnections(data.modules, data.topics, data.relations);
  assert.equal(data.modules.length, 18);
  assert.ok(modules.some(link => link.from === 'M01' && link.to === 'M03'));
  assert.equal(new Set(modules.map(link => `${link.from}|${link.to}`)).size, modules.length);
  assert.ok(modules.every(link => link.from !== link.to && /^M\d{2}$/.test(link.from) && /^M\d{2}$/.test(link.to)));
  const topics = data.topics.filter((topic: any) => topic.moduleId === 'M01');
  const links = topicConnections(topics, data.relations);
  assert.equal(topics.length, 8);
  assert.ok(links.some(link => link.from === 'M01-T01' && link.to === 'M01-T02'));
  assert.equal(new Set(links.map(link => `${link.from}|${link.to}`)).size, links.length);
  assert.ok(links.every(link => topics.some((topic: any) => topic.id === link.from) && topics.some((topic: any) => topic.id === link.to)));
  assert.deepEqual(topicConnections([], data.relations), []);
});
