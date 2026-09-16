import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, removeItem, restoreItem } from '../public/model.js';
import { validTaskSchedule, setTaskBacklog, settleTaskDependencies } from '../public/task-schedule.js';
import { createTimeline, ganttRows } from '../public/timeline.js';
import { buildGanttSVG, createExportPlan } from '../public/gantt-export.js';
import { filterListTasks } from '../public/list-filters.js';

const task=(id,extra={})=>({id,projectId:'p',title:id,group:'Discovery',status:'To do',priority:'High',owner:'',start:'2026-09-01',end:'2026-09-15',dependencies:[],customValues:{platform:'iOS'},...extra});
const workspace=tasks=>normalize({projects:[{id:'p',name:'QA planning'}],tasks});

test('task dates are independently optional while supplied dates remain valid and ordered',()=>{
  for(const schedule of [{},{start:null,end:null},{start:'',end:''},{start:'2024-02-29'},{end:'2026-09-15'},{start:'2026-09-15',end:'2026-09-15'}])assert.equal(validTaskSchedule(schedule),true);
  for(const schedule of [{start:'2026-02-29'},{end:'2026-09-31'},{start:'invalid'},{start:0},{end:false},{start:'2026-09-16',end:'2026-09-15'}])assert.equal(validTaskSchedule(schedule),false);
});

test('legacy tasks remain active and blank dates survive persistence and Trash restoration',()=>{
  const s=workspace([task('legacy'),task('undated',{start:null,end:undefined,backlog:true})]);
  assert.equal(s.tasks[0].backlog,false);
  const undated=structuredClone(s.tasks[1]);assert.equal(undated.start,'');assert.equal(undated.end,'');
  removeItem(s,'task',undated.id);
  const reloaded=normalize(JSON.parse(JSON.stringify(s)));
  restoreItem(reloaded,reloaded.trash[0].id);
  assert.deepEqual(reloaded.tasks.find(t=>t.id===undated.id),undated);
});

test('moving a task between active and backlog retains its dates, status, and custom data',()=>{
  const s=workspace([task('release',{status:'In progress',dependencies:['parent']})]);
  const original=structuredClone(s.tasks[0]);
  setTaskBacklog(s,original.id,true);
  assert.deepEqual(s.tasks[0],{...original,backlog:true});
  setTaskBacklog(s,original.id,false);assert.deepEqual(s.tasks[0],original);
});

test('backlog and incomplete tasks cannot extend the timeline or create Gantt rows',()=>{
  const active=task('scheduled');
  const excluded=[task('future backlog',{backlog:true,start:'2040-01-01',end:'2040-12-31'}),task('missing start',{start:'',end:'2050-01-01'}),task('missing end',{start:'2000-01-01',end:''}),task('undated',{start:'',end:''})];
  for(const scale of ['daily','monthly','quarterly']){
    assert.deepEqual(createTimeline([active,...excluded],scale,1,'2026-09-15'),createTimeline([active],scale,1,'2026-09-15'));
    assert.deepEqual(createTimeline(excluded,scale,1,'2026-09-15'),createTimeline([],scale,1,'2026-09-15'));
  }
  assert.deepEqual(ganttRows([active,...excluded],['Discovery']),[{group:'Discovery'},active]);
  assert.deepEqual(ganttRows(excluded,['Discovery']),[]);
});

test('every export format excludes backlog and undated tasks, including direct SVG rendering',()=>{
  const s=workspace([task('Scheduled release'),task('Backlog release',{backlog:true}),task('Unscheduled release',{start:'',end:''})]);
  const timeline=createTimeline(s.tasks,'monthly',1,'2026-09-15');
  const options={state:s,project:s.projects[0],tasks:s.tasks,timeline};
  for(const format of ['pdf','png','svg']){
    const plan=createExportPlan({...options,format});
    const svg=plan.page(0).svg;
    assert.match(svg,/Scheduled release/);assert.doesNotMatch(svg,/Backlog release|Unscheduled release|NaN/);
    assert.throws(()=>createExportPlan({...options,format,tasks:s.tasks.slice(1)}),/No scheduled tasks/);
  }
  const svg=buildGanttSVG({...options,rows:[{group:'Discovery'},...s.tasks,{group:'Empty group'}]}).svg;
  assert.match(svg,/Scheduled release/);assert.doesNotMatch(svg,/Backlog release|Unscheduled release|Empty group|NaN/);
});

test('dependency scheduling preserves missing dates and backlog schedules',()=>{
  const tasks=[task('parent'),task('backlog',{backlog:true,dependencies:['parent']}),task('no-start',{start:'',dependencies:['parent']}),task('no-end',{end:'',dependencies:['parent']}),task('neither',{start:'',end:'',dependencies:['parent']})];
  const original=structuredClone(tasks);settleTaskDependencies(tasks);assert.deepEqual(tasks,original);
});

test('returning a dated predecessor to active planning resumes dependency scheduling and preserves duration',()=>{
  const s=workspace([task('parent',{backlog:true}),task('child',{start:'2026-09-02',end:'2026-09-04',dependencies:['parent']})]);
  settleTaskDependencies(s.tasks);assert.equal(s.tasks[1].start,'2026-09-02');
  setTaskBacklog(s,s.tasks[0].id,false);settleTaskDependencies(s.tasks);
  assert.equal(s.tasks[1].start,'2026-09-16');assert.equal(s.tasks[1].end,'2026-09-18');
});

test('Unscheduled filters include either missing date and omit fully dated active tasks',()=>{
  const s=workspace([task('scheduled'),task('start-only',{end:''}),task('end-only',{start:''}),task('undated',{start:'',end:''})]);
  const config={match:'any',rules:['start','end'].map(field=>({id:field,field,type:'date',operator:'empty'}))};
  assert.deepEqual(filterListTasks(s,s.tasks,'p',config).map(t=>t.title),['start-only','end-only','undated']);
});
