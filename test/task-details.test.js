import test from 'node:test';
import assert from 'node:assert/strict';
import { descriptionParts, descriptionHTML } from '../public/task-details.js';
import { migrateTaskIds } from '../public/task-ids.js';
import { normalize, removeItem, restoreItem } from '../public/model.js';

test('descriptions retain their exact text while linking HTTP, HTTPS, and www addresses',()=>{
  const text='QA notes\nhttps://example.com/review?a=1&b=2\nHTTP://localhost:3001/test and www.example.com/docs.';
  const parts=descriptionParts(text);
  assert.equal(parts.map(part=>part.text).join(''),text);
  assert.deepEqual(parts.filter(part=>part.href).map(part=>part.href),['https://example.com/review?a=1&b=2','http://localhost:3001/test','https://www.example.com/docs']);
  assert.equal((descriptionHTML(text).match(/target="_blank" rel="noopener noreferrer"/g)||[]).length,3);
});

test('link boundaries exclude prose punctuation and preserve balanced URL brackets',()=>{
  const text='See (https://example.com/wiki/QA_(test)). Next: https://example.com/results?qa=yes, then https://example.com/run#!section.';
  const parts=descriptionParts(text);
  assert.equal(parts.map(part=>part.text).join(''),text);
  assert.deepEqual(parts.filter(part=>part.href).map(part=>part.text),['https://example.com/wiki/QA_(test)','https://example.com/results?qa=yes','https://example.com/run#!section']);
});

test('description rendering escapes markup and never creates executable links',()=>{
  const text='<img src=x onerror="alert(1)"> javascript:alert(1) data:text/html,test mailto:qa@example.com https://example.com/"onclick="x';
  const html=descriptionHTML(text);
  assert.doesNotMatch(html,/<img|<script|href="(?:javascript|data|mailto):|"onclick=/);
  assert.match(html,/&lt;img/);assert.match(html,/href="https:\/\/example.com\/"/);
  assert.equal(descriptionParts('https:// www. qa@www.example.com').filter(part=>part.href).length,0);
});

test('Numeric ID migration preserves tasks, dependencies and Trash recovery links',()=>{
  const base={projectId:'p',title:'QA testing',status:'To do',group:'Discovery',start:'',end:'',backlog:true,description:'Reference ORB-101',customValues:{reference:'ORB-101'}};
  const s=normalize({projects:[{id:'p',name:'QA'}],tasks:[]});
  s.tasks=[{...base,id:'ORB-101',dependencies:[]},{...base,id:'ORB-102',dependencies:['ORB-101']}];
  removeItem(s,'task','ORB-101');
  assert.equal(migrateTaskIds(s),true);
  assert.equal(s.tasks[0].id,'1');assert.equal(s.trash[0].tasks[0].id,'2');
  assert.deepEqual(s.trash[0].links,[{taskId:'1',dependency:'2'}]);
  restoreItem(s,s.trash[0].id);
  assert.deepEqual(s.tasks.find(task=>task.id==='1').dependencies,['2']);
  assert.equal(s.tasks[0].description,'Reference ORB-101');assert.deepEqual(s.tasks[0].customValues,{reference:'ORB-101'});
  const copy=structuredClone(s);assert.equal(migrateTaskIds(s),false);assert.deepEqual(s,copy);
});

test('Numeric migration handles mixed legacy IDs without collisions or misdirecting links',()=>{
  const s={tasks:[{id:'ORB-101',dependencies:[]},{id:'QA-101',dependencies:['ORB-101']},{id:'QA-101-2',dependencies:['QA-101']},{id:'ORB-101-3',dependencies:['ORB-101']}],trash:[]};
  migrateTaskIds(s);
  assert.equal(new Set(s.tasks.map(task=>task.id)).size,4);
  assert.ok(s.tasks.every(task=>/^[1-9]\d*$/.test(task.id)));
  assert.equal(s.tasks[1].id,'2');assert.deepEqual(s.tasks[1].dependencies,[s.tasks[0].id]);
  assert.deepEqual(s.tasks[2].dependencies,['2']);assert.deepEqual(s.tasks[3].dependencies,[s.tasks[0].id]);
  assert.equal(migrateTaskIds(s),false);
});
