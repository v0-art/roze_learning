import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { graphDiff, graphPath, validateModuleGraph } from './moduleGraph';
const graph = JSON.parse(fs.readFileSync('data/module_graph_v1.json','utf8'));
const ids = graph.nodes.map((n:any)=>n.id);
test('module graph source: counts, connected overview, acyclic prerequisites and meaningful transfers',()=>{
  assert.deepEqual(validateModuleGraph(graph,ids),[]);
  assert.equal(new Set(ids).size,18); assert.equal(new Set(graph.edges.map((e:any)=>e.id)).size,97);
  const counts=(key:string)=>Object.fromEntries([...new Set(graph.edges.map((e:any)=>e[key]))].map(x=>[x,graph.edges.filter((e:any)=>e[key]===x).length]));
  assert.deepEqual(counts('relation'),{'prerequisite':40,'application':36,'complementary':4,'capstone-integration':17});
  assert.deepEqual(counts('displayTier'),{overview:22,focus:75});
  assert.equal(graph.edges.filter((e:any)=>e.evidenceStatus==='mentioned-in-passport-v0.6').length,67);
  assert.equal(graph.edges.filter((e:any)=>e.evidenceStatus==='expert-proposed-extension').length,30);
  assert.equal(graph.edges.filter((e:any)=>e.target==='M18' && e.relation==='capstone-integration').length,17);
  const seen=new Set(['M01']); let size=0; while(size!==seen.size){size=seen.size;for(const e of graph.edges.filter((e:any)=>e.displayTier==='overview')) {if(seen.has(e.source))seen.add(e.target);if(seen.has(e.target))seen.add(e.source);}} assert.equal(seen.size,18);
  const visiting=new Set<string>(),done=new Set<string>();function visit(id:string){assert.ok(!visiting.has(id),'cycle');if(done.has(id))return;visiting.add(id);for(const e of graph.edges.filter((e:any)=>e.relation==='prerequisite' && e.source===id))visit(e.target);visiting.delete(id);done.add(id);} ids.forEach(visit);
  assert.ok(graphPath(graph.edges,'M01').length>0);
  assert.ok(graph.edges.every((e:any)=>e.approvalStatus==='proposed' && e.knowledgeTransfers.every((t:any)=>t.sourceKnowledge && t.targetApplication)));
});
test('idempotent import preview and explicit mentor conflict',()=>{
 assert.equal(graphDiff([],graph.edges).filter(e=>e.action==='add').length,97);
 assert.equal(graphDiff(graph.edges,graph.edges).filter(e=>e.action==='unchanged').length,97);
 const saved=structuredClone(graph.edges);saved[0].approvalStatus='approved';
 assert.equal(graphDiff(saved,graph.edges)[0].action,'conflict');
});
