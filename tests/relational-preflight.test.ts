import {test} from 'node:test';import assert from 'node:assert/strict';import {analyzeRelationalMigration} from '../src/server/relational-preflight.mjs';
test('migration preflight finds missing owners and accepts relations between topics and modules',()=>{
 const source={users:[{id:'s1'}],modules:[{id:'M01'}],topics:[{id:'M01-T01',moduleId:'M01'}],lessons:[{id:'M01-T01-U01',moduleId:'M01',topicId:'M01-T01'}],skills:[],relations:[{fromId:'M01-T01',toId:'M01'}],homework:[{id:'h1'},{id:'h2',userId:'unknown'}]};
 const before=structuredClone(source),report=analyzeRelationalMigration(source);
 assert.equal(report.issues.homeworkWithoutOwner,1);assert.equal(report.issues.homeworkUnknownOwner,1);assert.equal(report.issues.relationsWithUnknownEntity,0);assert.equal(report.requiresExplicitAssignment,true);const opted=analyzeRelationalMigration(source,{omitUnownedHomework:true});assert.equal(opted.unownedHomeworkExcluded,1);assert.equal(opted.requiresExplicitAssignment,false);assert.equal(report.readyToSwitch,false);assert.deepEqual(source,before);
});
