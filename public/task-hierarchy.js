// Parent links are independent of scheduling dependencies and task fields.
export function descendantIds(tasks, parentId) {
  if (!parentId) return new Set();
  const children = new Map();
  for (const task of tasks) {
    if (!children.has(task.parentId)) children.set(task.parentId, []);
    children.get(task.parentId).push(task.id);
  }
  const ids = new Set(), pending = [...(children.get(parentId) || [])];
  while (pending.length) {
    const id = pending.pop();
    if (id === parentId || ids.has(id)) continue;
    ids.add(id);
    for (const child of children.get(id) || []) pending.push(child);
  }
  return ids;
}

export function validateTaskHierarchy(tasks) {
  const byId = new Map();
  for (const task of tasks) {
    if (typeof task.id !== 'string' || !task.id || byId.has(task.id)) throw Error('Task IDs must be unique');
    byId.set(task.id, task);
  }
  for (const task of tasks) {
    if (task.parentId === undefined || task.parentId === null || task.parentId === '') continue;
    const parent = byId.get(task.parentId);
    if (typeof task.parentId !== 'string' || !parent) throw Error('Parent task unavailable');
    if (parent.projectId !== task.projectId) throw Error('Parent task must belong to the same project');
    if (parent.backlog && !task.backlog) throw Error('Move parent task to active first');
  }
  // Iterative traversal supports large and deeply nested task trees.
  const complete = new Set();
  for (const task of tasks) {
    const path = new Set();
    let current = task;
    while (current && !complete.has(current.id)) {
      if (path.has(current.id)) throw Error('Circular parent relationship');
      path.add(current.id);
      current = byId.get(current.parentId);
    }
    for (const id of path) complete.add(id);
  }
}

// Preserve sibling order and filtered results without injecting hidden parents.
export function orderTaskTree(selected, allTasks = selected) {
  const children = new Map(), byId = new Map(allTasks.map(task => [task.id, task]));
  const selectedById = new Map(selected.map(task => [task.id, task]));
  for (const task of allTasks) {
    const key = byId.has(task.parentId) ? task.parentId : '';
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(task);
  }
  const result = [], visited = new Set();
  const pending = (children.get('') || []).map(task => ({task, depth: 0})).reverse();
  while (pending.length) {
    const {task, depth} = pending.pop();
    if (visited.has(task.id)) continue;
    visited.add(task.id);
    const selectedTask = selectedById.get(task.id);
    if (selectedTask) result.push(task.parentId ? {...selectedTask, depth, parentName: byId.get(task.parentId)?.title || ''} : selectedTask);
    const members = children.get(task.id) || [];
    for (let i = members.length - 1; i >= 0; i--) pending.push({task: members[i], depth: depth + 1});
  }
  return result;
}
