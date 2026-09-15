import { builtinColumns } from './list-columns.js';

const emptyOperators = [{id:'empty',label:'Is empty'},{id:'not-empty',label:'Is not empty'}];
const operators = {
  text:[{id:'contains',label:'Contains'},{id:'not-contains',label:'Does not contain'},{id:'eq',label:'Is'},{id:'neq',label:'Is not'}],
  dropdown:[{id:'eq',label:'Is'},{id:'neq',label:'Is not'}],
  checkbox:[{id:'eq',label:'Is'}],
  dependencies:[{id:'contains',label:'Includes'},{id:'not-contains',label:'Excludes'}],
  number:[{id:'eq',label:'Equals'},{id:'neq',label:'Not equal'},{id:'gt',label:'Greater than'},{id:'gte',label:'At least'},{id:'lt',label:'Less than'},{id:'lte',label:'At most'},{id:'between',label:'Between'}],
  date:[{id:'eq',label:'On'},{id:'neq',label:'Not on'},{id:'lt',label:'Before'},{id:'lte',label:'On or before'},{id:'gt',label:'After'},{id:'gte',label:'On or after'},{id:'between',label:'Between'}],
};
export const filterOperators = field => [...operators[field.type],...emptyOperators];
export const needsValue = rule => !['empty','not-empty'].includes(rule.operator);
export const emptyFilters = () => ({match:'all',rules:[]});

export function filterFields(state,projectId) {
  const standard=[{id:'title',label:'Task name'},...builtinColumns].map(column=>{
    const options=state.settings.options[column.id];
    const type=options?'dropdown':['start','end'].includes(column.id)?'date':column.id==='progress'?'number':column.id==='dependencies'?'dependencies':'text';
    return {...column,type,options:options || (type==='dependencies'?state.tasks.filter(t=>t.projectId===projectId).map(t=>({id:t.id,label:t.title})):[])};
  });
  return [...standard,...state.settings.customFields.map(field=>({id:`custom:${field.id}`,label:field.name,type:field.type,custom:true,options:field.options||[]}))];
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
}
function validValue(field,value) {
  if(value===undefined || value===null || String(value).trim()==='')return false;
  if(['dropdown','dependencies'].includes(field.type))return field.options.some(option=>option.id===value);
  if(field.type==='checkbox')return ['true','false'].includes(value);
  if(field.type==='number')return Number.isFinite(Number(value));
  if(field.type==='date')return validDate(value);
  return true;
}
export function validateFilters(state,projectId,config) {
  const fields=filterFields(state,projectId);
  for(const rule of config.rules){
    const field=fields.find(field=>field.id===rule.field);
    if(!field || field.type!==rule.type)throw Error('Filter field unavailable');
    if(!filterOperators(field).some(option=>option.id===rule.operator))throw Error(`${field.label}: invalid condition`);
    if(!needsValue(rule))continue;
    if(!validValue(field,rule.value))throw Error(`${field.label}: valid filter value required`);
    if(rule.operator==='between'){
      if(!validValue(field,rule.end))throw Error(`${field.label}: valid upper limit required`);
      if(field.type==='number'?Number(rule.end)<Number(rule.value):rule.end<rule.value)throw Error(`${field.label}: invalid range`);
    }
  }
  return config;
}

// Stable field/option IDs preserve filters through renames. Remove conditions
// whose field, type, option or predecessor no longer exists after an edit.
export function reconcileFilters(state,projectId,config=emptyFilters()) {
  return {match:config.match==='any'?'any':'all',rules:config.rules.filter(rule=>{
    try{validateFilters(state,projectId,{rules:[rule]});return true;}catch{return false;}
  })};
}
function fieldValue(task,field) {
  const raw=field.custom?task.customValues?.[field.id.slice(7)]:task[field.id];
  if(field.type==='dropdown')return field.custom?raw:field.options.find(option=>option.label===raw)?.id;
  return raw;
}
function matchesRule(task,field,rule) {
  const raw=fieldValue(task,field),empty=raw===undefined||raw===null||raw===''||(Array.isArray(raw)&&!raw.length);
  if(rule.operator==='empty')return empty;
  if(rule.operator==='not-empty')return !empty;
  // Missing values are distinct from zero, unchecked, and negative matches.
  if(empty)return false;
  if(field.type==='dependencies')return rule.operator==='contains'?raw.includes(rule.value):!raw.includes(rule.value);
  if(field.type==='checkbox')return raw===(rule.value==='true');
  let value=raw,target=rule.value,end=rule.end;
  if(field.type==='number'){
    value=Number(raw);target=Number(target);end=Number(end);
    if(!Number.isFinite(value))return false;
  }else if(field.type==='text'){
    value=String(raw).toLocaleLowerCase();target=String(target).trim().toLocaleLowerCase();
  }
  switch(rule.operator){
    case 'eq':return value===target;
    case 'neq':return value!==target;
    case 'contains':return value.includes(target);
    case 'not-contains':return !value.includes(target);
    case 'gt':return value>target;
    case 'gte':return value>=target;
    case 'lt':return value<target;
    case 'lte':return value<=target;
    case 'between':return value>=target&&value<=end;
    default:return false;
  }
}
export function filterListTasks(state,tasks,projectId,config) {
  const current=reconcileFilters(state,projectId,config);
  if(!current.rules.length)return tasks;
  const fields=new Map(filterFields(state,projectId).map(field=>[field.id,field]));
  return tasks.filter(task=>current.match==='any'
    ? current.rules.some(rule=>matchesRule(task,fields.get(rule.field),rule))
    : current.rules.every(rule=>matchesRule(task,fields.get(rule.field),rule)));
}
export function filterSummary(state,projectId,rule) {
  const field=filterFields(state,projectId).find(field=>field.id===rule.field);
  if(!field)return '';
  const operator=filterOperators(field).find(option=>option.id===rule.operator)?.label||'';
  const label=value=>['dropdown','dependencies'].includes(field.type)?field.options.find(option=>option.id===value)?.label:field.type==='checkbox'?(value==='true'?'Yes':'No'):value;
  return `${field.label} · ${operator}${needsValue(rule)?` · ${label(rule.value)}${rule.operator==='between'?` – ${label(rule.end)}`:''}`:''}`;
}
