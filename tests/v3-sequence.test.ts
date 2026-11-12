import {test} from 'node:test';import assert from 'node:assert/strict';import {decideV3Access,type V3PlanItem} from '../src/core/v3-sequence';
const plan:V3PlanItem[]=[{id:'lesson-A',kind:'lesson',position:1,required:true,blocksNext:true},{id:'control',kind:'control_work',position:2,required:true,blocksNext:true},{id:'lesson-B',kind:'lesson',position:3,required:true,blocksNext:true}];
test('explicit sequence distinguishes blocked and optional controls',()=>{
 assert.deepEqual(decideV3Access(plan,[],'control'),{available:false,reason:'prerequisite',blockedBy:'lesson-A'});
 const state=[{id:'lesson-A',completed:true,passed:false,mentorOverride:false,attemptsUsed:1,extraAttempts:0}];
 assert.equal(decideV3Access(plan,state,'control').available,true);assert.equal(decideV3Access(plan,state,'lesson-B').available,false);
 assert.equal(decideV3Access(plan.map(x=>x.id==='control'?{...x,blocksNext:false}:x),state,'lesson-B').available,true);
 assert.equal(decideV3Access(plan,[...state,{id:'control',completed:true,passed:false,mentorOverride:true,attemptsUsed:4,extraAttempts:0}],'lesson-B').available,true);
 assert.equal(decideV3Access(plan,[...state,{id:'control',completed:true,passed:false,mentorOverride:false,attemptsUsed:4,extraAttempts:0}],'control').reason,'attempts_exhausted');
 assert.equal(decideV3Access(plan.map(x=>x.id==='control'?{...x,blocksNext:false}:x),[...state,{id:'control',completed:true,passed:false,mentorOverride:false,attemptsUsed:4,extraAttempts:0}],'lesson-B').available,true);
});
