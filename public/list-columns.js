import { customDisplay } from './model.js';
export const builtinColumns = [
  {id:'owner',label:'QA Owner',width:145}, {id:'status',label:'Status',width:135},
  {id:'priority',label:'Priority',width:100}, {id:'start',label:'Start date',width:115},
  {id:'end',label:'End date',width:115}, {id:'group',label:'Group',width:140},
  {id:'progress',label:'Progress',width:95}, {id:'dependencies',label:'Predecessor tasks',width:180},
  {id:'description',label:'Description',width:220},
];
export function availableColumns(state) {
  return [...builtinColumns,...state.settings.customFields.map(field=>({id:`custom:${field.id}`,label:field.name,width:160,field}))];
}
export function visibleColumns(state, project) {
  const all=availableColumns(state);
  const ids=project?.listColumns || ['owner','status','priority','end',...all.filter(c=>c.field).map(c=>c.id)];
  return ids.map(id=>all.find(c=>c.id===id)).filter(Boolean);
}
export function columnValue(state, task, column) {
  if(column.field)return customDisplay(column.field,task.customValues?.[column.field.id]);
  if(column.id==='progress')return `${task.progress}%`;
  if(column.id==='dependencies')return task.dependencies.map(id=>state.tasks.find(t=>t.id===id)?.title||id).join('; ')||'—';
  return task[column.id]||'—';
}
