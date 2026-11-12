import type {PoolClient} from 'pg';import {courseMembership} from './courses';

/** Project only published, explicitly described content. Unknown relation shapes are reported. */
export async function readV3Graph(db:PoolClient,actor:string,courseId:string){
 await courseMembership(db,actor,courseId);
 const legacy=await db.query('SELECT EXISTS(SELECT 1 FROM course_lessons WHERE course_id=$1) AS present',[courseId]);
 if(legacy.rows[0].present)return {enabled:false,modules:[],topics:[],skills:[],relations:[],edges:[],unsupportedRelations:0};
 const rows=(await db.query(`SELECT e.id,e.kind,r.content FROM v3_content_entities e JOIN v3_content_revisions r ON r.course_id=e.course_id AND r.entity_id=e.id AND r.revision=e.published_revision WHERE e.course_id=$1 AND e.kind IN ('module','topic','lesson','skill','relation') ORDER BY e.id`,[courseId])).rows;
 const modules=rows.filter(r=>r.kind==='module'),topics=rows.filter(r=>r.kind==='topic'),lessons=rows.filter(r=>r.kind==='lesson'),skills=rows.filter(r=>r.kind==='skill'),relations=rows.filter(r=>r.kind==='relation');
 if(!modules.length)return {enabled:false,modules:[],topics:[],skills:[],relations:[],edges:[],unsupportedRelations:0};
 const visible=new Set([...modules,...topics,...skills].map(row=>row.id)),moduleIds=new Set(modules.map(row=>row.id));
 const normalized:any[]=[],edges:any[]=[];let unsupportedRelations=0;
 for(const row of relations){const c=row.content.content||{},from=c.fromId??c.source,to=c.toId??c.target,type=c.type??c.relation;
  if(typeof from!=='string'||typeof to!=='string'||!visible.has(from)||!visible.has(to)||typeof type!=='string'){unsupportedRelations++;continue}
  if(['prerequisite','application','application-to-module','competence'].includes(type))normalized.push({id:row.id,fromId:from,toId:to,type,description:typeof c.description==='string'?c.description:''});
  if(moduleIds.has(from)&&moduleIds.has(to)&&['prerequisite','application','complementary','capstone-integration'].includes(type))edges.push({id:row.id,source:from,target:to,relation:type,displayTier:c.displayTier==='overview'?'overview':'focus',label:typeof c.label==='string'?c.label:row.content.title,knowledgeTransfers:Array.isArray(c.knowledgeTransfers)?c.knowledgeTransfers.filter((t:any)=>typeof t?.sourceKnowledge==='string'&&typeof t?.targetApplication==='string'):[],evidenceStatus:'expert-proposed-extension',evidenceNote:typeof c.evidenceNote==='string'?c.evidenceNote:'',approvalStatus:'approved',isAccessGate:false,directionality:type==='complementary'?'undirected':'source-to-target'});
  else if(!['prerequisite','application','application-to-module','competence'].includes(type))unsupportedRelations++;
 }
 return {enabled:true,unsupportedRelations,
  modules:modules.map((row,index)=>{const c=row.content.content||{},description=typeof c.description==='string'?c.description:'';return {id:row.id,code:row.id,order:Number.isFinite(c.position)?c.position:index,title:row.content.title,shortDescription:description,introduction:description,topicsCount:topics.filter(t=>t.content.moduleId===row.id).length,publishedLessonsCount:lessons.filter(l=>l.content.moduleId===row.id).length,prerequisites:[],status:'published',whyItMatters:typeof c.goal==='string'?c.goal:''}}),
  topics:topics.filter(row=>moduleIds.has(row.content.moduleId)).map((row,index)=>{const c=row.content.content||{};return {id:row.id,moduleId:row.content.moduleId,code:row.id,order:Number.isFinite(c.position)?c.position:index,title:row.content.title,description:typeof c.description==='string'?c.description:'',learningObjectives:Array.isArray(c.learningGoals)?c.learningGoals.filter((v:unknown)=>typeof v==='string'):[],skillsTaught:[],status:'published'}}),
  skills:skills.map(row=>{const c=row.content.content||{};return {id:row.id,code:row.id,name:row.content.title,description:typeof c.description==='string'?c.description:'',topicId:row.content.topicIds?.[0]||'',moduleId:row.content.moduleId||'',lessonId:typeof c.lessonId==='string'?c.lessonId:'',status:'published'}}),relations:normalized,edges};
}
