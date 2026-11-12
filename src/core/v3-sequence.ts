export type V3ItemKind='lesson'|'control_work'|'exam'|'remedial';
export type V3PlanItem={id:string;kind:V3ItemKind;position:number;required:boolean;blocksNext:boolean};
export type V3ItemProgress={id:string;completed:boolean;passed:boolean;mentorOverride:boolean;attemptsUsed:number;extraAttempts:number};
export type V3Access={available:boolean;reason:'available'|'unpublished'|'prerequisite'|'attempts_exhausted';blockedBy?:string};

/** One access decision for an explicitly ordered plan. Nothing is derived from IDs. */
export function decideV3Access(plan:V3PlanItem[],progress:V3ItemProgress[],targetId:string):V3Access{
 const ordered=[...plan].sort((a,b)=>a.position-b.position);const target=ordered.findIndex(item=>item.id===targetId);
 if(target<0)return {available:false,reason:'unpublished'};
 if(new Set(ordered.map(item=>item.id)).size!==ordered.length||new Set(ordered.map(item=>item.position)).size!==ordered.length)throw new Error('План содержит повторные позиции или идентификаторы.');
 const byId=new Map(progress.map(item=>[item.id,item]));
 for(const item of ordered.slice(0,target)){
  const state=byId.get(item.id);if(!item.required)continue;
  if((item.kind==='lesson'||item.kind==='remedial')&&!state?.completed)return {available:false,reason:'prerequisite',blockedBy:item.id};
  if((item.kind==='control_work'||item.kind==='exam')&&item.blocksNext&&!state?.passed&&!state?.mentorOverride)return {available:false,reason:'prerequisite',blockedBy:item.id};
 }
 const item=ordered[target],state=byId.get(item.id);
 if((item.kind==='control_work'||item.kind==='exam')&&state&&!state.passed&&state.attemptsUsed>=4+state.extraAttempts)return {available:false,reason:'attempts_exhausted',blockedBy:item.id};
 return {available:true,reason:'available'};
}
