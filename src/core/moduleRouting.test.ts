import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { layoutModuleRoutes } from './moduleRouting';
const graph = JSON.parse(fs.readFileSync('data/module_graph_v1.json','utf8'));

test('all routes use unique ports, do not overlap or pass through cards',()=>{
  const layout=layoutModuleRoutes(graph.nodes.map((n:any)=>n.id),graph.edges);
  assert.equal(layout.routes.size,97);
  const ports = new Set<string>();
  const segments:{id:string,axis:'x'|'y',fixed:number,start:number,end:number}[]=[];
  for (const [id,points] of layout.routes) {
    for (const point of [points[0],points[points.length-1]]) {const key=`${point.x},${point.y}`; assert.ok(!ports.has(key),`shared port ${id}`); ports.add(key);}
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i]; assert.ok(a.x===b.x||a.y===b.y,`non-orthogonal ${id}`);
      if(a.x===b.x && a.y===b.y)continue;
      const vertical=a.x===b.x;
      const segment={id,axis:vertical?'x' as const:'y' as const,fixed:vertical?a.x:a.y,start:Math.min(vertical?a.y:a.x,vertical?b.y:b.x),end:Math.max(vertical?a.y:a.x,vertical?b.y:b.x)};
      for(const n of layout.nodes) {
        const crosses = vertical ? segment.fixed>n.x && segment.fixed<n.x+190 && segment.start<n.y+70 && segment.end>n.y : segment.fixed>n.y && segment.fixed<n.y+70 && segment.start<n.x+190 && segment.end>n.x;
        assert.ok(!crosses,`${id} crosses ${n.id}`);
      }
      segments.push(segment);
    }
  }
  for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
    const a=segments[i],b=segments[j]; if(a.id===b.id||a.axis!==b.axis||a.fixed!==b.fixed)continue;
    assert.ok(Math.min(a.end,b.end)-Math.max(a.start,b.start)<=1e-7,`overlap ${a.id} / ${b.id}`);
  }
  assert.deepEqual([...layout.routes], [...layoutModuleRoutes(graph.nodes.map((n:any)=>n.id),graph.edges).routes]);
});


test('adjacent-row connections use the shortest orthogonal route, with no detour',()=>{
  const ids=graph.nodes.map((node:any)=>node.id), layout=layoutModuleRoutes(ids,graph.edges);
  for(const edge of graph.edges){
    const source=ids.indexOf(edge.source),target=ids.indexOf(edge.target);
    if(Math.abs(Math.floor(source/6)-Math.floor(target/6))!==1)continue;
    const points=layout.routes.get(edge.id)!;
    assert.equal(points.length,4,edge.id);
    const length=points.slice(1).reduce((sum,point,i)=>sum+Math.abs(point.x-points[i].x)+Math.abs(point.y-points[i].y),0);
    const shortest=Math.abs(points[0].x-points.at(-1)!.x)+Math.abs(points[0].y-points.at(-1)!.y);
    assert.ok(Math.abs(length-shortest)<1e-6,edge.id);
  }
});

test('every connection uses only top or bottom card edges',()=>{
  const ids=graph.nodes.map((node:any)=>node.id), layout=layoutModuleRoutes(ids,graph.edges);
  const nodes=new Map(layout.nodes.map(node=>[node.id,node]));
  for(const edge of graph.edges){
    const points=layout.routes.get(edge.id)!;
    const source=nodes.get(edge.source)!, target=nodes.get(edge.target)!;
    for (const [point,node] of [[points[0],source],[points.at(-1)!,target]] as const) {
      assert.ok(point.y===node.y || point.y===node.y+70, `${edge.id}: wrong side`);
      assert.ok(point.x>node.x && point.x<node.x+190, `${edge.id}: port outside card`);
    }
    assert.equal(points[0].x,points[1].x,`${edge.id}: source must be vertical`);
    assert.equal(points.at(-1)!.x,points.at(-2)!.x,`${edge.id}: target must be vertical`);
  }
});
