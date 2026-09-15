import { migrateTaskIds } from './task-ids.js';
export const statusPalette = ['#64748b','#2563eb','#16805d','#b96a12','#8755b2','#bf4c64','#0e8190','#9a593d'];
export const defaultStatusColor = index => statusPalette[index % statusPalette.length];
export const priorityPalette = ['#16805d','#a66a0a','#b4233c','#8755b2','#2563eb','#0e8190'];
export const defaultPriorityColor = (label, index=0) => ({low:priorityPalette[0],medium:priorityPalette[1],high:priorityPalette[2],critical:'#861337',urgent:'#861337'}[label.toLowerCase()] || priorityPalette[index % priorityPalette.length]);
export const optionKeys = ['owner', 'status', 'priority', 'group'];
const defaults = {
  owner: ['Alex Morgan', 'Jamie Chen', 'Sam Taylor', 'Riley Park'],
  status: ['To do', 'In progress', 'Done'],
  priority: ['Low', 'Medium', 'High'],
  group: ['Discovery', 'Design', 'Development'],
};
export function normalize(state) {
  migrateTaskIds(state);
  // Update only unedited descriptions bundled with the original demo.
  const demoDescriptions = [["p1", "Website redesign", "A fresh experience. Built around our customers.", "Website redesign and customer experience"], ["p2", "Mobile app", "Great experiences, wherever you go.", "Mobile application development"], ["p3", "Brand refresh", "Make our next chapter unmistakable.", "Brand identity development"]];
  for (const [id, name, original, replacement] of demoDescriptions) {
    const project = state.projects.find(p => p.id === id && p.name === name && p.description === original);
    if (project) project.description = replacement;
  }
  state.settings ??= { options: {}, customFields: [] };
  state.settings.options ??= {};
  state.settings.customFields ??= [];
  state.trash ??= [];
  for (const key of optionKeys) {
    state.settings.options[key] ??= defaults[key].map((label, i) => ({
      id: `${key}-${i}`, label, ...(key === 'status' ? { kind: ['todo', 'doing', 'done'][i] } : {}),
    }));
    // Preserve labels used in workspaces created before settings were introduced.
    for (const task of state.tasks) {
      if (task[key] && !state.settings.options[key].some(o => o.label === task[key])) {
        state.settings.options[key].push({ id: crypto.randomUUID(), label: task[key], ...(key === 'status' ? { kind: 'todo' } : {}) });
      }
    }
  }
  state.settings.options.status.forEach((option, index) => { option.color ??= defaultStatusColor(index); });
  state.settings.options.priority.forEach((option, index) => { option.color ??= defaultPriorityColor(option.label,index); });
  for (const task of [...state.tasks,...state.trash.flatMap(entry=>entry.tasks)]) {
    task.customValues ??= {}; task.owner ??= ''; task.start ??= ''; task.end ??= ''; task.backlog ??= false;
  }
  return state;
}
export function statusColor(state, label) {
  return state.settings.options.status.find(o => o.label === label)?.color || statusPalette[0];
}
export function priorityColor(state, label) {
  return state.settings.options.priority.find(o => o.label === label)?.color || defaultPriorityColor(label || '');
}
export function statusKind(state, label) {
  return state.settings.options.status.find(o => o.label === label)?.kind || 'todo';
}
function validateOptions(options, name, allowEmpty=false) {
  if (!options.length && !allowEmpty) throw Error(`${name}: at least one option required`);
  const seen = new Set();
  for (const o of options) {
    o.label = o.label.trim();
    if (!o.label || o.label.length > 80) throw Error(`${name}: option length 1–80 characters`);
    if (seen.has(o.label.toLowerCase())) throw Error(`${name}: duplicate options`);
    seen.add(o.label.toLowerCase());
  }
}
export function validateSettings(settings) {
  for (const key of optionKeys) validateOptions(settings.options[key], {owner:'QA Owners',status:'Statuses',priority:'Priorities',group:'Groups'}[key], key==='owner');
  if (settings.options.status.some(o => !['todo', 'doing', 'done'].includes(o.kind))) throw Error('Invalid workflow category');
  settings.options.status.forEach((option, index) => {
    option.color ??= defaultStatusColor(index);
    if (!/^#[0-9a-f]{6}$/i.test(option.color)) throw Error('Invalid status color');
  });
  settings.options.priority.forEach((option, index) => {
    option.color ??= defaultPriorityColor(option.label,index);
    if (!/^#[0-9a-f]{6}$/i.test(option.color)) throw Error('Invalid priority color');
  });
  const names = new Set();
  for (const field of settings.customFields) {
    field.name = field.name.trim();
    if (!field.name || field.name.length > 80) throw Error('Field name length: 1–80 characters');
    if (names.has(field.name.toLowerCase())) throw Error('Custom field names: unique names required');
    names.add(field.name.toLowerCase());
    if (!['text', 'number', 'date', 'dropdown', 'checkbox'].includes(field.type)) throw Error('Invalid field type');
    if (field.type === 'dropdown') validateOptions(field.options, field.name);
  }
}
export function applySettings(state, next) {
  validateSettings(next);
  const previous = state.settings;
  const allTasks = [...state.tasks, ...state.trash.flatMap(entry => entry.tasks)];
  for (const task of allTasks) {
    for (const key of optionKeys) {
      const oldOption = previous.options[key].find(o => o.label === task[key]);
      const replacement = next.options[key].find(o => o.id === oldOption?.id);
      task[key] = key==='owner' ? (replacement?.label || '') : (replacement || next.options[key][0]).label;
    }
    task.customValues ??= {};
    for (const id of Object.keys(task.customValues)) {
      const field = next.customFields.find(f => f.id === id);
      const oldField = previous.customFields.find(f => f.id === id);
      if (!field || field.type !== oldField?.type || (field.type === 'dropdown' && !field.options.some(o => o.id === task.customValues[id]))) {
        delete task.customValues[id];
      }
    }
    const kind = next.options.status.find(o => o.label === task.status).kind;
    task.progress = kind === 'done' ? 100 : kind === 'doing' ? 50 : 0;
  }
  state.settings = structuredClone(next);
}
export function removeItem(state, kind, id) {
  const project = kind === 'project' ? state.projects.find(p => p.id === id) : null;
  const tasks = state.tasks.filter(t => kind === 'project' ? t.projectId === id : t.id === id);
  if (!project && !tasks.length) throw Error('Item unavailable');
  const ids = new Set(tasks.map(t => t.id));
  const links = state.tasks.flatMap(t => t.dependencies.filter(dep => ids.has(dep)).map(dep => ({ taskId: t.id, dependency: dep })));
  state.trash.unshift({ id: crypto.randomUUID(), kind, name: project?.name || tasks[0].title, project: project ? structuredClone(project) : null, tasks: structuredClone(tasks), links, deletedAt: new Date().toISOString() });
  state.tasks = state.tasks.filter(t => !ids.has(t.id));
  state.tasks.forEach(t => { t.dependencies = t.dependencies.filter(dep => !ids.has(dep)); });
  if (project) state.projects = state.projects.filter(p => p.id !== id);
}
export function restoreItem(state, id) {
  const item = state.trash.find(e => e.id === id);
  if (!item) throw Error('Item unavailable');
  if (!item.project && item.tasks.some(t => !state.projects.some(p => p.id === t.projectId))) throw Error('Parent project restoration required');
  if (item.project) state.projects.push(structuredClone(item.project));
  state.tasks.push(...structuredClone(item.tasks));
  const ids = new Set(state.tasks.map(t => t.id));
  state.tasks.forEach(t => { t.dependencies = t.dependencies.filter(dep => ids.has(dep)); });
  for (const link of item.links) {
    const task = state.tasks.find(t => t.id === link.taskId);
    if (task && ids.has(link.dependency) && !task.dependencies.includes(link.dependency)) task.dependencies.push(link.dependency);
  }
  state.trash = state.trash.filter(e => e.id !== id);
}
export function customDisplay(field, value) {
  if (value === undefined || value === '') return '—';
  if (field.type === 'checkbox') return value ? 'Yes' : 'No';
  if (field.type === 'dropdown') return field.options.find(o => o.id === value)?.label || '—';
  return String(value);
}
