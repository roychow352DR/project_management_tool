import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize, saveTask, removeItem, restoreItem} from '../public/model.js';
import {descendantIds, validateTaskHierarchy, orderTaskTree} from '../public/task-hierarchy.js';
import {isVisibleGanttTask, setTaskBacklog, settleTaskDependencies} from '../public/task-schedule.js';
import {createTimeline, ganttRows} from '../public/timeline.js';
import {createExportPlan, buildGanttSVG} from '../public/gantt-export.js';
import {availableColumns, columnValue} from '../public/list-columns.js';
import {filterListTasks, filterSummary, reconcileFilters} from '../public/list-filters.js';

const task=(id,parentId='',extra={})=>({id,parentId,projectId:'p',title:id,owner:'',status:'To do',priority:'Low',group:'QA',start:'2026-09-01',end:'2026-09-08',backlog:false,dependencies:[],description:'',customValues:{},progress:0,...extra});
const workspace=(tasks=[task('parent'),task('child','parent'),task('nested','child')])=>normalize({projects:[{id:'p',name:'Subtask project'}],tasks});

test('existing workspaces gain empty parent links and hidden Gantt subtasks without changing schedules',()=>{
  const t=task('legacy');delete t.parentId;
  const state=workspace([t]);
  assert.equal(state.tasks[0].parentId,'');assert.equal(state.projects[0].ganttShowSubtasks,false);
  assert.equal(state.tasks[0].end,'2026-09-08');
  state.projects[0].ganttShowSubtasks=true;
  saveTask(state,task('2','1',{start:'',end:'',owner:'Sam Taylor',customValues:{scope:'API'}}));
  const restored=normalize(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.projects[0].ganttShowSubtasks,true);
  assert.equal(restored.tasks[1].parentId,'1');assert.equal(restored.tasks[1].start,'');
});

test('large sibling counts and deeply nested trees have no application count or nesting limit',()=>{
  const many=[task('parent'),...Array.from({length:6000},(_,i)=>task('child-'+i,'parent'))];
  validateTaskHierarchy(many);
  assert.equal(descendantIds(many,'parent').size,6000);
  assert.equal(orderTaskTree(many).length,6001);
  const deep=Array.from({length:12000},(_,i)=>task('node-'+i,i?'node-'+(i-1):''));
  validateTaskHierarchy(deep);
  assert.equal(orderTaskTree(deep)[11999].depth,11999);
  assert.equal(descendantIds(deep,'node-0').size,11999);
});

test('parent relationships reject missing parents, self-links, cycles, duplicates, and cross-project links',()=>{
  for(const tasks of [[task('a','missing')],[task('a','a')],[task('a','b'),task('b','a')],[task('a'),task('a')],[task('a'),task('b','a',{projectId:'other'})]])assert.throws(()=>validateTaskHierarchy(tasks));
  const state=workspace(),before=structuredClone(state);
  assert.throws(()=>saveTask(state,{...state.tasks[0],parentId:state.tasks[2].id}),/Circular/);
  assert.deepEqual(state,before);
});

test('subtasks retain independent fields and can be reassigned or promoted to root tasks',()=>{
  const state=workspace();
  saveTask(state,{...state.tasks[1],status:'Done',progress:100,owner:'Jamie Chen',priority:'High',start:'',end:'',description:'Independent',customValues:{effort:0}});
  settleTaskDependencies(state.tasks);
  assert.equal(state.tasks[0].status,'To do');assert.equal(state.tasks[0].start,'2026-09-01');
  assert.equal(state.tasks[1].start,'');assert.equal(state.tasks[1].owner,'Jamie Chen');
  saveTask(state,{...state.tasks[1],parentId:''});
  assert.equal(state.tasks[1].parentId,'');assert.equal(state.tasks[2].parentId,'2');
});

test('tree order retains matching children without bringing filtered parents back into the results',()=>{
  const all=[task('nested','child'),task('sibling','parent'),task('child','parent'),task('parent')];
  assert.deepEqual(orderTaskTree(all).map(t=>t.id),['parent','sibling','child','nested']);
  const filtered=orderTaskTree([all[0]],all);
  assert.equal(filtered.length,1);assert.equal(filtered[0].depth,2);assert.equal(filtered[0].parentName,'child');
});

test('deleting a parent removes its entire subtree and linked dependencies; restoring recovers both',()=>{
  const state=workspace([task('nested','child'),task('parent'),task('child','parent'),task('other','',{dependencies:['child','nested']})]);
  removeItem(state,'task','2');
  assert.deepEqual(state.tasks.map(t=>t.title),['other']);assert.deepEqual(state.tasks[0].dependencies,[]);
  assert.equal(state.trash[0].name,'parent');assert.equal(state.trash[0].tasks.length,3);
  restoreItem(state,state.trash[0].id);
  assert.equal(state.tasks.length,4);assert.deepEqual(state.tasks[0].dependencies,['3','1']);
  validateTaskHierarchy(state.tasks);
});

test('separately deleted children require parent restoration; restoring into Backlog keeps the subtree there',()=>{
  const state=workspace();removeItem(state,'task','2');const childTrash=state.trash[0].id;
  removeItem(state,'task','1');const parentTrash=state.trash[0].id;
  assert.throws(()=>restoreItem(state,childTrash),/Parent task restoration/);assert.equal(state.tasks.length,0);
  restoreItem(state,parentTrash);setTaskBacklog(state,'1',true);restoreItem(state,childTrash);
  assert.ok(state.tasks.every(t=>t.backlog));validateTaskHierarchy(state.tasks);
});

test('project deletion restores nested tasks and saved Gantt visibility',()=>{
  const state=workspace();state.projects[0].ganttShowSubtasks=true;
  removeItem(state,'project','p');assert.equal(state.tasks.length,0);
  restoreItem(state,state.trash[0].id);validateTaskHierarchy(state.tasks);
  assert.equal(state.tasks[2].parentId,'2');assert.equal(state.projects[0].ganttShowSubtasks,true);
});

test('planning changes cascade to descendants and block active children of backlog parents',()=>{
  const state=workspace();setTaskBacklog(state,'1',true);
  assert.ok(state.tasks.every(t=>t.backlog));assert.ok(state.tasks.every(t=>!isVisibleGanttTask(t,true)));
  assert.throws(()=>setTaskBacklog(state,'2',false),/parent task/);
  saveTask(state,{...state.tasks[0],backlog:false});assert.ok(state.tasks.every(t=>!t.backlog));
  setTaskBacklog(state,'2',true);
  saveTask(state,{...state.tasks[0],title:'Renamed parent'});
  assert.equal(state.tasks[1].backlog,true);assert.equal(state.tasks[0].backlog,false);
});

test('Numeric ID migration preserves active and trashed parent relationships',()=>{
  const state=workspace([task('ORB-parent'),task('ORB-child','ORB-parent')]);
  assert.equal(state.tasks[1].parentId,'1');
  removeItem(state,'task','1');
  state.trash[0].tasks[0].id='ORB-root';state.trash[0].tasks[1].parentId='ORB-root';
  normalize(state);restoreItem(state,state.trash[0].id);
  assert.equal(state.tasks[1].parentId,'3');
});

test('Parent task columns and filters use stable IDs and support root-only queries',()=>{
  const state=workspace(),column=availableColumns(state).find(c=>c.id==='parentId');
  const config={match:'all',rules:[{id:'r',field:'parentId',type:'dropdown',operator:'eq',value:'1'}]};
  assert.equal(columnValue(state,state.tasks[1],column),'parent');
  assert.deepEqual(filterListTasks(state,state.tasks,'p',config).map(t=>t.id),['2']);
  state.tasks[0].title='Release QA';
  assert.equal(reconcileFilters(state,'p',config).rules.length,1);assert.match(filterSummary(state,'p',config.rules[0]),/Release QA/);
  assert.deepEqual(filterListTasks(state,state.tasks,'p',{rules:[{field:'parentId',type:'dropdown',operator:'empty'}]}).map(t=>t.id),['1']);
});

test('hidden subtasks cannot extend Gantt date coverage; shown children can outlive or outdate their parents',()=>{
  const state=workspace([task('parent','',{start:'',end:''}),task('child','parent',{start:'2030-01-01',end:'2030-02-01'})]);
  assert.equal(state.tasks.filter(t=>isVisibleGanttTask(t)).length,0);
  const shown=state.tasks.filter(t=>isVisibleGanttTask(t,true));assert.equal(shown.length,1);
  const hiddenTimeline=createTimeline([], 'monthly',1,'2026-09-16');
  const shownTimeline=createTimeline(shown,'monthly',1,'2026-09-16');assert.ok(shownTimeline.end>hiddenTimeline.end);
  const rows=ganttRows(shown,['QA'],new Set(),state.tasks);assert.equal(rows[1].parentName,'parent');
});

test('all export formats share the saved subtask visibility across scales and appearances',()=>{
  const state=workspace([task('Parent label'),task('Child label','Parent label'),task('Backlog child','Parent label',{backlog:true}),task('Undated child','Parent label',{start:''})]);
  const project=state.projects[0];
  for(const scale of ['daily','monthly','quarterly'])for(const appearance of ['light','dark'])for(const format of ['pdf','png','svg'])for(const show of [false,true]){
    project.ganttShowSubtasks=show;
    const timeline=createTimeline(state.tasks,scale,1,'2026-09-16');
    const svg=createExportPlan({format,state,project,tasks:state.tasks,timeline,appearance}).page(0).svg;
    assert.ok(svg.includes('Parent label'));assert.equal(svg.includes('Child label'),show);
    assert.ok(!svg.includes('Backlog child'));assert.ok(!svg.includes('Undated child'));
    const direct=buildGanttSVG({state,project,timeline,rows:ganttRows(state.tasks,['QA']),appearance}).svg;
    assert.equal(direct.includes('Child label'),show);
  }
});

test('PDF continuation pages retain subtask parent context and stable tree order',()=>{
  const state=workspace([task('Release parent'),...Array.from({length:26},(_,i)=>task('Case '+String(i).padStart(2,'0'),'Release parent'))]);
  const project=state.projects[0];project.ganttShowSubtasks=true;
  const plan=createExportPlan({format:'pdf',state,project,tasks:state.tasks,timeline:createTimeline(state.tasks,'monthly',1,'2026-09-16')});
  assert.ok(plan.pageCount>1);
  assert.match(plan.page(1).svg,/Release parent \/ Case/);
  assert.equal(Array.from({length:plan.pageCount},(_,i)=>plan.page(i).svg.match(/<title>Case /g)?.length||0).reduce((a,b)=>a+b),26);
});
