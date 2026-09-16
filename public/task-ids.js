const numericId = value => typeof value === 'string' && /^[1-9]\d*$/.test(value);
// Keep the saved numeric key stable; use the QA prefix wherever it is displayed.
export const formatTaskId = id => numericId(String(id)) ? `QA-${id}` : String(id ?? '');
const workspaceTasks = state => [...(state.tasks || []), ...(state.trash || []).flatMap(entry => entry.tasks || [])];

function referencedIds(state) {
  const ids = new Set();
  const add = id => { if (id !== undefined && id !== null && id !== '') ids.add(String(id)); };
  const tasks = workspaceTasks(state);
  // Assign existing tasks first, in their saved order, followed by recovery links.
  for (const task of tasks) add(task.id);
  for (const task of tasks) {
    add(task.parentId);
    for (const dependency of task.dependencies || []) add(dependency);
  }
  for (const entry of state.trash || []) for (const link of entry.links || []) {
    add(link.taskId); add(link.dependency);
  }
  return ids;
}

export function nextTaskId(state) {
  let next = numericId(state.nextTaskNumber) ? BigInt(state.nextTaskNumber) : 1n;
  for (const id of referencedIds(state)) if (numericId(id) && BigInt(id) >= next) next = BigInt(id) + 1n;
  return String(next);
}

export function migrateTaskIds(state) {
  let next = BigInt(nextTaskId(state));
  const mapping = new Map();
  for (const id of referencedIds(state)) if (!numericId(id)) mapping.set(id, String(next++));
  const renamed = id => mapping.get(String(id)) || String(id);
  let changed = false;
  const replace = (object, key) => {
    if (object[key] === undefined || object[key] === null || object[key] === '') return;
    const value = renamed(object[key]);
    if (object[key] !== value) { object[key] = value; changed = true; }
  };
  for (const task of workspaceTasks(state)) {
    replace(task, 'id'); replace(task, 'parentId');
    if (task.dependencies) task.dependencies = task.dependencies.map(id => {
      const value = renamed(id); if (id !== value) changed = true; return value;
    });
  }
  for (const entry of state.trash || []) for (const link of entry.links || []) {
    replace(link, 'taskId'); replace(link, 'dependency');
  }
  if (state.nextTaskNumber !== String(next)) { state.nextTaskNumber = String(next); changed = true; }
  return changed;
}
