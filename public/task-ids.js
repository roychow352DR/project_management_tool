export function migrateTaskIds(state) {
  const tasks=[...(state.tasks||[]),...(state.trash||[]).flatMap(entry=>entry.tasks||[])];
  const reserved=new Set(tasks.map(task=>task.id)),mapping=new Map();
  for(const task of tasks){
    if(typeof task.id!=='string'||!task.id.startsWith('ORB-')||mapping.has(task.id))continue;
    const base='QA-'+task.id.slice(4);let replacement=base,suffix=2;
    while(reserved.has(replacement))replacement=`${base}-${suffix++}`;
    reserved.add(replacement);mapping.set(task.id,replacement);
  }
  if(!mapping.size)return false;
  const renamed=id=>mapping.get(id)||id;
  for(const task of tasks){
    task.id=renamed(task.id);
    if(task.dependencies)task.dependencies=task.dependencies.map(renamed);
  }
  for(const entry of state.trash||[])for(const link of entry.links||[]){
    link.taskId=renamed(link.taskId);link.dependency=renamed(link.dependency);
  }
  return true;
}
