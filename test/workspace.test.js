import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalize, applySettings, removeItem, restoreItem, statusKind, customDisplay, validateSettings, priorityColor } from '../public/model.js';
const seed = JSON.parse(await readFile(new URL('../seed.json', import.meta.url)));
const workspace = () => normalize(structuredClone(seed));

test('migrates existing workspaces without losing task data', () => {
  const s = workspace();
  assert.equal(s.tasks.length, seed.tasks.length);
  assert.equal(s.settings.options.owner.length, 4);
  assert.deepEqual(s.tasks[0].customValues, {});
  assert.deepEqual(normalize(structuredClone(s)), s);
});
test('renaming statuses preserves assignments and completion semantics', () => {
  const s = workspace(), settings = structuredClone(s.settings);
  settings.options.status.find(o => o.label === 'Done').label = 'Approved';
  applySettings(s, settings);
  assert.equal(s.tasks[0].status, 'Approved');
  assert.equal(statusKind(s, 'Approved'), 'done');
  assert.equal(s.tasks[0].progress, 100);
});
test('removing a QA Owner clears active and deleted task assignments', () => {
  const s = workspace();
  removeItem(s, 'task', s.tasks[0].id);
  const settings = structuredClone(s.settings);
  settings.options.owner = settings.options.owner.filter(o => o.label !== 'Alex Morgan');
  applySettings(s, settings);
  assert.equal(s.trash[0].tasks[0].owner, '');
  assert.ok(s.tasks.every(t => t.owner !== 'Alex Morgan'));
});
test('group renames preserve all tasks in timeline groups', () => {
  const s = workspace(), settings = structuredClone(s.settings);
  settings.options.group[0].label = 'Planning';
  applySettings(s, settings);
  assert.equal(s.tasks.filter(t => t.group === 'Planning').length, 4);
  assert.ok(s.tasks.every(t => settings.options.group.some(o => o.label === t.group)));
});
test('empty QA Owner persists through settings updates, reload normalization, and restoration', () => {
  const s=workspace(),task=s.tasks[0];task.owner='';
  removeItem(s,'task',task.id);
  const next=structuredClone(s.settings);next.options.owner[0].label='QA Manager';
  applySettings(s,next);restoreItem(s,s.trash[0].id);
  assert.equal(s.tasks.find(t=>t.id===task.id).owner,'');
  assert.equal(normalize(JSON.parse(JSON.stringify(s))).tasks.find(t=>t.id===task.id).owner,'');
  const empty=structuredClone(s.settings);empty.options.owner=[];applySettings(s,empty);
  assert.ok(s.tasks.every(t=>t.owner===''));
});
test('priority colors persist after renaming and support custom options', () => {
  const s=workspace();assert.equal(new Set(s.settings.options.priority.map(o=>o.color)).size,3);
  const next=structuredClone(s.settings),high=next.options.priority.find(o=>o.label==='High');
  const ids=s.tasks.filter(t=>t.priority==='High').map(t=>t.id);
  high.label='Critical';high.color='#8a254a';next.options.priority.push({id:'expedite',label:'Expedite',color:'#4d5891'});
  applySettings(s,next);
  assert.ok(ids.length);assert.ok(ids.every(id=>s.tasks.find(t=>t.id===id).priority==='Critical'));
  assert.equal(priorityColor(s,'Critical'),'#8a254a');assert.equal(priorityColor(s,'Expedite'),'#4d5891');
  assert.equal(priorityColor(normalize(JSON.parse(JSON.stringify(s))),'Critical'),'#8a254a');
  next.options.priority[0].color='invalid';assert.throws(()=>validateSettings(next),/priority color/);
});
test('custom dropdown renames retain values, and removed options clear only affected values', () => {
  const s = workspace();
  s.settings.customFields.push({id:'client',name:'Client',type:'dropdown',options:[{id:'a',label:'Acme'},{id:'b',label:'Other'}]});
  s.tasks[0].customValues.client = 'a';
  s.tasks[1].customValues.client = 'b';
  const settings = structuredClone(s.settings);
  settings.customFields[0].options[0].label = 'Acme Ltd';
  applySettings(s, settings);
  assert.equal(customDisplay(s.settings.customFields[0],s.tasks[0].customValues.client),'Acme Ltd');
  settings.customFields[0].options.splice(0,1);
  applySettings(s, settings);
  assert.equal(s.tasks[0].customValues.client,undefined);
  assert.equal(s.tasks[1].customValues.client,'b');
});
test('zero and false custom values remain visible', () => {
  assert.equal(customDisplay({type:'number'},'0'),'0');
  assert.equal(customDisplay({type:'checkbox'},false),'No');
});
test('settings reject empty or duplicate options and field names', () => {
  const s = workspace();
  let settings = structuredClone(s.settings);
  settings.options.status = [];
  assert.throws(() => validateSettings(settings), /at least one/);
  settings = structuredClone(s.settings);
  settings.options.owner[1].label = ' alex morgan ';
  assert.throws(() => validateSettings(settings), /duplicate/);
  settings = structuredClone(s.settings);
  settings.customFields = [{id:'a',name:'Client',type:'text'},{id:'b',name:'client',type:'number'}];
  assert.throws(() => validateSettings(settings), /unique/);
});
test('deleting and restoring a task removes then restores dependent links', () => {
  const s = workspace(), target = s.tasks.find(t => t.id === '6');
  removeItem(s, 'task', target.id);
  assert.ok(!s.tasks.some(t => t.id === target.id));
  assert.deepEqual(s.tasks.find(t => t.id === '7').dependencies, []);
  restoreItem(s, s.trash[0].id);
  assert.deepEqual(s.tasks.find(t => t.id === target.id),target);
  assert.deepEqual(s.tasks.find(t => t.id === '7').dependencies,['6']);
  assert.equal(s.trash.length,0);
});
test('project deletion cascades and restores tasks including custom data', () => {
  const s = workspace();
  s.tasks[0].customValues = {budget:'1200'};
  const tasks = structuredClone(s.tasks);
  removeItem(s, 'project', 'p1');
  assert.equal(s.tasks.length,0);
  assert.equal(s.projects.length,2);
  restoreItem(s,s.trash[0].id);
  assert.deepEqual(s.tasks,tasks);
  assert.equal(s.projects.length,3);
});
test('all projects can be deleted and restored, with no orphan tasks', () => {
  const s = workspace();
  removeItem(s,'task',s.tasks[0].id);
  const deletedTask = s.trash[0].id;
  for(const p of [...s.projects]) removeItem(s,'project',p.id);
  assert.deepEqual(s.projects,[]);
  assert.deepEqual(s.tasks,[]);
  assert.throws(() => restoreItem(s,deletedTask), /Parent project/);
  restoreItem(s,s.trash.find(e => e.project?.id === 'p1').id);
  restoreItem(s,deletedTask);
  assert.equal(s.tasks.length,seed.tasks.length);
});
