import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateTaskIds,nextTaskId} from '../public/task-ids.js';
import {normalize,saveTask,removeItem,restoreItem} from '../public/model.js';

const task=(id,extra={})=>({id,title:`Task ${id}`,projectId:'p',owner:'',status:'To do',priority:'Low',group:'QA',start:'',end:'',backlog:false,parentId:'',dependencies:[],customValues:{},...extra});

test('a fresh workspace numbers tasks and subtasks sequentially from 1 across projects',()=>{
  const state=normalize({projects:[{id:'p'},{id:'other'}],tasks:[]});
  assert.equal(nextTaskId(state),'1');
  saveTask(state,task(nextTaskId(state)));
  saveTask(state,task(nextTaskId(state),{parentId:'1'}));
  saveTask(state,task(nextTaskId(state),{projectId:'other'}));
  assert.deepEqual(state.tasks.map(t=>t.id),['1','2','3']);
  assert.equal(state.tasks[1].parentId,'1');assert.equal(state.nextTaskNumber,'4');
});

test('numeric migration preserves nested tasks, dependencies, recovery links, and user-entered references',()=>{
  const state={tasks:[task('QA-abc'),task('QA-def',{parentId:'QA-abc',dependencies:['QA-abc'],description:'QA-abc remains plain text',customValues:{ref:'QA-abc'}})],trash:[{tasks:[task('ORB-50',{parentId:'QA-def'})],links:[{taskId:'QA-def',dependency:'ORB-50'}]}]};
  assert.equal(migrateTaskIds(state),true);
  assert.deepEqual(state.tasks.map(t=>t.id),['1','2']);assert.equal(state.tasks[1].parentId,'1');assert.deepEqual(state.tasks[1].dependencies,['1']);
  assert.equal(state.trash[0].tasks[0].id,'3');assert.equal(state.trash[0].tasks[0].parentId,'2');
  assert.deepEqual(state.trash[0].links,[{taskId:'2',dependency:'3'}]);
  assert.equal(state.tasks[1].description,'QA-abc remains plain text');assert.equal(state.tasks[1].customValues.ref,'QA-abc');
  const copy=structuredClone(state);assert.equal(migrateTaskIds(state),false);assert.deepEqual(state,copy);
});

test('new numbers do not collide with existing numbers or unresolved recovery references',()=>{
  const state={tasks:[task('QA-legacy'),task('1'),task('5',{dependencies:['9']})],trash:[]};
  migrateTaskIds(state);
  assert.deepEqual(state.tasks.map(t=>t.id),['10','1','5']);
  assert.deepEqual(state.tasks[2].dependencies,['9']);assert.equal(nextTaskId(state),'11');
});

test('deletion, Trash recovery, and reload never renumber tasks or reuse prior numbers',()=>{
  let state=normalize({projects:[{id:'p'}],tasks:[]});
  saveTask(state,task(nextTaskId(state)));saveTask(state,task(nextTaskId(state),{parentId:'1'}));
  removeItem(state,'task','1');assert.equal(nextTaskId(state),'3');
  state=normalize(JSON.parse(JSON.stringify(state)));saveTask(state,task(nextTaskId(state)));
  restoreItem(state,state.trash[0].id);
  assert.deepEqual(state.tasks.map(t=>t.id),['3','1','2']);assert.equal(nextTaskId(state),'4');
  removeItem(state,'task','3');state.trash=[];
  state=normalize(JSON.parse(JSON.stringify(state)));assert.equal(nextTaskId(state),'4');
});

test('number generation stays exact beyond the JavaScript safe integer range',()=>{
  const state={tasks:[task('9007199254740992')],trash:[],nextTaskNumber:'9007199254740993'};
  assert.equal(nextTaskId(state),'9007199254740993');
  saveTask(state,task(nextTaskId(state)));assert.equal(nextTaskId(state),'9007199254740994');
});
