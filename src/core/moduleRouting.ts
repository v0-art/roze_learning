import type { ModuleRelation } from './moduleGraph';

type Point = {x:number; y:number};
type Node = {id:string; x:number; y:number};
export interface ModuleRouting {nodes:Node[]; routes:Map<string, Point[]>; width:number; height:number}
const CARD_WIDTH = 190, CARD_HEIGHT = 70, MARGIN = 40, GAP_X = 90, LANE = 4;

/** Stable orthogonal routing: distinct ports, horizontal lanes and vertical channels. */
export function layoutModuleRoutes(moduleIds:string[], edges:ModuleRelation[]):ModuleRouting {
  const indices = new Map(moduleIds.map((id,index)=>[id,index]));
  const ordered = [...edges].filter(e=>indices.has(e.source) && indices.has(e.target) && e.source!==e.target).sort((a,b)=>(Number(a.displayTier !== 'overview')-Number(b.displayTier !== 'overview')) || a.id.localeCompare(b.id));
  const ports = Array.from({length:6},()=>[] as string[]);
  const lanes = Array.from({length:3},()=>[] as string[]);
  const channels = Array.from({length:6},()=>[] as string[]);
  for(const edge of ordered) {
    const a=indices.get(edge.source)!, b=indices.get(edge.target)!, ar=Math.floor(a/6), br=Math.floor(b/6);
    ports[a%6].push(`${edge.id}:source`); ports[b%6].push(`${edge.id}:target`);
    if(ar===br) lanes[ar].push(`${edge.id}:source`);
    else if(ar!==br) {
      lanes[br>ar?ar:ar-1].push(`${edge.id}:source`);
      if (Math.abs(br-ar)>1) {
        lanes[br>ar?br-1:br].push(`${edge.id}:target`);
        const sourceCol=a%6, targetCol=b%6;
        const gap=targetCol<sourceCol ? sourceCol-1 : sourceCol;
        channels[gap].push(edge.id);
      }
    }
  }
  const rowY:number[]=[MARGIN];
  for(let row=1;row<3;row++) rowY[row]=rowY[row-1]+CARD_HEIGHT+Math.max(80,24+lanes[row-1].length*LANE);
  const stepX=CARD_WIDTH+Math.max(GAP_X,24+Math.max(0,...channels.map(c=>c.length))*LANE);
  const nodes=moduleIds.map((id,index)=>({id,x:MARGIN+(index%6)*stepX,y:rowY[Math.floor(index/6)]}));
  const byId=new Map(nodes.map(n=>[n.id,n]));
  const laneY=(row:number,key:string)=>rowY[row]+CARD_HEIGHT+12+(lanes[row].indexOf(key)+1)*LANE;
  const portX=(node:Node,col:number,key:string)=>node.x+8+(CARD_WIDTH-16)*(ports[col].indexOf(key)+1)/(ports[col].length+1);
  const routes=new Map<string,Point[]>();
  for(const edge of ordered) {
    const a=indices.get(edge.source)!,b=indices.get(edge.target)!, ar=Math.floor(a/6),br=Math.floor(b/6),from=byId.get(edge.source)!,to=byId.get(edge.target)!;
    const x1=portX(from,a%6,`${edge.id}:source`),x2=portX(to,b%6,`${edge.id}:target`);
    if(ar===br) {
      const y=laneY(ar,`${edge.id}:source`);
      routes.set(edge.id,[{x:x1,y:from.y+CARD_HEIGHT},{x:x1,y},{x:x2,y},{x:x2,y:to.y+CARD_HEIGHT}]);
    } else {
      const down=br>ar, sourceLane=laneY(down?ar:ar-1,`${edge.id}:source`);
      const start={x:x1,y:from.y+(down?CARD_HEIGHT:0)}, end={x:x2,y:to.y+(down?0:CARD_HEIGHT)};
      if(Math.abs(br-ar)===1) {
        // Between adjacent rows the direct orthogonal path never crosses a card.
        routes.set(edge.id,[start,{x:x1,y:sourceLane},{x:x2,y:sourceLane},end]);
      } else {
        const targetLane=laneY(down?br-1:br,`${edge.id}:target`);
        const sourceCol=a%6, targetCol=b%6;
        const gap=targetCol<sourceCol ? sourceCol-1 : sourceCol;
        const gapStart=MARGIN+gap*stepX+CARD_WIDTH;
        const channelX=gapStart+12+(channels[gap].indexOf(edge.id)+1)*LANE;
        routes.set(edge.id,[start,{x:x1,y:sourceLane},{x:channelX,y:sourceLane},{x:channelX,y:targetLane},{x:x2,y:targetLane},end]);
      }
    }
  }
  const width=MARGIN*2+(Math.min(6,Math.max(1,moduleIds.length))-1)*stepX+CARD_WIDTH+Math.max(GAP_X,24+Math.max(0,...channels.map(c=>c.length))*LANE);
  const height=rowY[2]+CARD_HEIGHT+Math.max(40,24+lanes[2].length*LANE)+MARGIN;
  return {nodes,routes,width,height};
}
export function pointsToPath(points:Point[]):string {return points.map((point,index)=>`${index?'L':'M'} ${point.x} ${point.y}`).join(' ');}

/** Leave a small visual break where a horizontal cable crosses a vertical one. */
export function crossingGaps(routes:Map<string,Point[]>):Map<string,Point[]> {
  const gaps=new Map<string,Point[]>();
  const segments=[...routes].flatMap(([id,points])=>points.slice(1).map((b,i)=>({id,a:points[i],b})));
  for(const h of segments) {
    if(h.a.y!==h.b.y || h.a.x===h.b.x)continue;
    for(const v of segments) {
      if(v.id===h.id || v.a.x!==v.b.x || v.a.y===v.b.y)continue;
      const x=v.a.x,y=h.a.y;
      if(x>Math.min(h.a.x,h.b.x) && x<Math.max(h.a.x,h.b.x) && y>Math.min(v.a.y,v.b.y) && y<Math.max(v.a.y,v.b.y)) {
        const list=gaps.get(h.id)||[];list.push({x,y});gaps.set(h.id,list);
      }
    }
  }
  return gaps;
}
