import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,applySettings} from '../public/model.js';
import {filterFields,filterListTasks,validateFilters,reconcileFilters,filterSummary} from '../public/list-filters.js';

function workspace(){
  const state=normalize({projects:[{id:'p',name:'QA',listColumns:[]}],tasks:[]});
  state.settings.customFields=[
    {id:'client',name:'Client',type:'text'}, {id:'effort',name:'Effort',type:'number'},
    {id:'review',name:'Review date',type:'date'}, {id:'approved',name:'Approved',type:'checkbox'},
    {id:'platform',name:'Platform',type:'dropdown',options:[{id:'ios',label:'iOS'},{id:'android',label:'Android'}]},
  ];
  const base={projectId:'p',title:'Release validation',owner:'',status:'To do',priority:'Low',group:'Discovery',start:'2026-09-01',end:'2026-09-15',progress:0,description:'',dependencies:[],customValues:{}};
  state.tasks=[
    {...base,id:'a',customValues:{client:'Acme & Co',effort:0,review:'2026-09-01',approved:false,platform:'ios'}},
    {...base,id:'b',owner:'Alex Morgan',priority:'High',progress:50,description:'Security review',dependencies:['a'],customValues:{client:'Beta',effort:'8.5',review:'2026-09-30',approved:true,platform:'android'}},
    {...base,id:'c',title:'Missing values',customValues:{}},
  ];
  return state;
}
const rule=(field,type,operator,value='',end='')=>({id:field,field,type,operator,value,end});
const ids=(state,rules,match='all')=>filterListTasks(state,state.tasks,'p',{match,rules}).map(task=>task.id);

test('filter catalog follows field settings independently of List column visibility',()=>{
  const state=workspace(),fields=filterFields(state,'p');
  for(const id of ['title','owner','status','priority','group','start','end','progress','description','dependencies','custom:client','custom:effort','custom:review','custom:approved','custom:platform'])assert.ok(fields.some(field=>field.id===id));
  assert.deepEqual(fields.find(field=>field.id==='custom:platform').options.map(option=>option.id),['ios','android']);
  assert.equal(fields.find(field=>field.id==='owner').label,'QA Owner');
});
test('standard and custom conditions combine with all/any logic',()=>{
  const state=workspace(),high=state.settings.options.priority.find(option=>option.label==='High').id;
  const conditions=[rule('priority','dropdown','eq',high),rule('custom:platform','dropdown','eq','ios')];
  assert.deepEqual(ids(state,conditions),[]);assert.deepEqual(ids(state,conditions,'any'),['a','b']);
  assert.deepEqual(ids(state,[rule('custom:client','text','contains','ACME &'),rule('owner','dropdown','empty')]),['a']);
  assert.deepEqual(ids(state,[]),['a','b','c']);
});
test('zero and unchecked values are distinct from absent custom values',()=>{
  const state=workspace();
  assert.deepEqual(ids(state,[rule('custom:effort','number','eq','0')]),['a']);
  assert.deepEqual(ids(state,[rule('custom:approved','checkbox','eq','false')]),['a']);
  for(const [field,type] of [['custom:effort','number'],['custom:approved','checkbox'],['custom:client','text']])assert.deepEqual(ids(state,[rule(field,type,'empty')]),['c']);
  assert.deepEqual(ids(state,[rule('custom:effort','number','between','0','8.5')]),['a','b']);
  assert.deepEqual(ids(state,[rule('custom:effort','number','gt','0')]),['b']);
  assert.deepEqual(ids(state,[rule('custom:approved','checkbox','not-empty')]),['a','b']);
});
test('date ranges include their boundaries and support before/after filters',()=>{
  const state=workspace();
  assert.deepEqual(ids(state,[rule('custom:review','date','between','2026-09-01','2026-09-30')]),['a','b']);
  assert.deepEqual(ids(state,[rule('custom:review','date','lt','2026-09-30')]),['a']);
  assert.deepEqual(ids(state,[rule('custom:review','date','gte','2026-09-30')]),['b']);
  assert.deepEqual(ids(state,[rule('end','date','eq','2026-09-15')]),['a','b','c']);
});
test('predecessor and text filters use task data, with explicit empty checks',()=>{
  const state=workspace();
  assert.deepEqual(ids(state,[rule('dependencies','dependencies','contains','a')]),['b']);
  assert.deepEqual(ids(state,[rule('dependencies','dependencies','empty')]),['a','c']);
  assert.deepEqual(ids(state,[rule('description','text','contains','REVIEW')]),['b']);
  assert.deepEqual(ids(state,[rule('custom:client','text','not-contains','acme')]),['b']);
});
test('renamed fields and options preserve filters; removed definitions clear stale conditions',()=>{
  const state=workspace(),config={match:'all',rules:[rule('custom:platform','dropdown','eq','ios'),rule('priority','dropdown','eq',state.settings.options.priority[0].id)]};
  const next=structuredClone(state.settings);next.customFields.find(field=>field.id==='platform').name='Target platform';next.customFields.find(field=>field.id==='platform').options[0].label='iPhone';next.options.priority[0].label='Routine';applySettings(state,next);
  assert.deepEqual(ids(state,config.rules),['a']);
  assert.equal(filterSummary(state,'p',config.rules[0]),'Target platform · Is · iPhone');
  next.customFields.find(field=>field.id==='platform').options.shift();applySettings(state,next);
  assert.equal(reconcileFilters(state,'p',config).rules.length,1);
  next.customFields=next.customFields.filter(field=>field.id!=='effort');applySettings(state,next);
  assert.deepEqual(reconcileFilters(state,'p',{rules:[rule('custom:effort','number','eq','0')]}).rules,[]);
});
test('filter validation rejects incomplete values, invalid dates, and inverted ranges',()=>{
  const state=workspace();
  for(const condition of [rule('owner','dropdown','eq'),rule('custom:effort','number','eq','Infinity'),rule('custom:review','date','eq','2026-02-30'),rule('progress','number','between','60','10'),rule('start','date','between','2026-09-30','2026-09-01'),rule('custom:approved','checkbox','eq','maybe')])assert.throws(()=>validateFilters(state,'p',{rules:[condition]}));
  assert.doesNotThrow(()=>validateFilters(state,'p',{rules:[rule('owner','dropdown','empty')]}));
});
