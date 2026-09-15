const DAY=86400000;
export function validTaskDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const time=Date.parse(value+'T00:00:00Z');
  return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value;
}
export function validTaskSchedule(task) {
  const optional=value=>value===undefined||value===null||value===''||validTaskDate(value);
  return optional(task.start)&&optional(task.end)&&(!task.start||!task.end||task.end>=task.start);
}
export const hasCompleteSchedule=task=>validTaskDate(task.start)&&validTaskDate(task.end)&&task.end>=task.start;
export const isGanttTask=task=>task.backlog!==true&&hasCompleteSchedule(task);

export function setTaskBacklog(state,id,backlog) {
  const task=state.tasks.find(task=>task.id===id);
  if(!task)throw Error('Task unavailable');
  task.backlog=backlog;
}

export function settleTaskDependencies(tasks) {
  const byId=new Map(tasks.map(task=>[task.id,task]));
  // Unscheduled and backlog tasks keep their dates exactly as entered. Their
  // links remain available when both tasks return to the active schedule.
  for(let pass=0;pass<tasks.length;pass++){
    let changed=false;
    for(const task of tasks){
      if(!isGanttTask(task))continue;
      const parents=(task.dependencies||[]).map(id=>byId.get(id)).filter(parent=>parent&&isGanttTask(parent));
      if(!parents.length)continue;
      const first=Math.max(...parents.map(parent=>Date.parse(parent.end+'T00:00:00Z')))+DAY;
      const start=Date.parse(task.start+'T00:00:00Z');
      if(start<first){
        const duration=Date.parse(task.end+'T00:00:00Z')-start;
        task.start=new Date(first).toISOString().slice(0,10);
        task.end=new Date(first+duration).toISOString().slice(0,10);
        changed=true;
      }
    }
    if(!changed)break;
  }
}
