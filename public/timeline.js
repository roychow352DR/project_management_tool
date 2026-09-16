import { orderTaskTree } from './task-hierarchy.js';
import { isGanttTask } from './task-schedule.js';
export const DAY = 86400000;
export const toDay = value => Date.parse(`${value}T00:00:00Z`) / DAY;
export const toDate = value => new Date(value * DAY).toISOString().slice(0, 10);
const monthDay = (year, month) => Date.UTC(year, month, 1) / DAY;
const format = (value, options) => new Date(value * DAY).toLocaleDateString('en', {...options, timeZone:'UTC'});
export const defaultHorizon = {daily:180, monthly:24, quarterly:12};
export function createTimeline(tasks, scale = 'daily', zoom = 1, today = toDate(Date.now()/DAY), options = {}) {
  const dates = tasks.filter(isGanttTask).flatMap(t => [toDay(t.start), toDay(t.end)]);
  const first = dates.length ? Math.min(...dates) : toDay(today);
  const last = dates.length ? Math.max(...dates) : first;
  const a = new Date(first*DAY), b = new Date(last*DAY);
  let start, end, unit;
  if (scale === 'monthly') {
    start = monthDay(a.getUTCFullYear(), a.getUTCMonth()-3);
    end = Math.max(monthDay(b.getUTCFullYear(), b.getUTCMonth()+4), monthDay(a.getUTCFullYear(), a.getUTCMonth()-3+(options.span||defaultHorizon.monthly)));
    unit = 5;
  } else if (scale === 'quarterly') {
    start = monthDay(a.getUTCFullYear(), Math.floor(a.getUTCMonth()/3)*3-3);
    end = Math.max(monthDay(b.getUTCFullYear(), Math.floor(b.getUTCMonth()/3)*3+6), monthDay(a.getUTCFullYear(), Math.floor(a.getUTCMonth()/3)*3-3+(options.span||defaultHorizon.quarterly)*3));
    unit = 2;
  } else {
    scale = 'daily'; start = first-30; end = Math.max(start+(options.span||defaultHorizon.daily),last+31); unit = 34;
  }
  if(options.start!==undefined)start=Math.min(start,options.start);
  if(options.end!==undefined)end=Math.max(end,options.end);
  const dayWidth = unit * zoom;
  const range = {start, end, dayWidth, width:(end-start)*dayWidth, scale};
  return {...range, ...timelineTicks(range)};
}
export function timelineTicks({start, end, dayWidth, scale}) {
  function segments(mode) {
    const ticks = [];
    let cursor=start;
    while(cursor<end) {
      const d=new Date(cursor*DAY), y=d.getUTCFullYear(), m=d.getUTCMonth();
      let boundary, label;
      if(mode==='day'){boundary=cursor+1;label=String(d.getUTCDate());}
      else if(mode==='month'){boundary=monthDay(y,m+1);label=format(cursor,{month:scale==='daily'?'long':'short',...(scale==='daily'?{year:'numeric'}:{})});}
      else if(mode==='quarter'){boundary=monthDay(y,Math.floor(m/3)*3+3);label=`Q${Math.floor(m/3)+1}`;}
      else {boundary=monthDay(y+1,0);label=String(y);}
      const until=Math.min(boundary,end);
      ticks.push({start:cursor,end:until,x:(cursor-start)*dayWidth,width:(until-cursor)*dayWidth,label});
      cursor=until;
    }
    return ticks;
  }
  return {top:segments(scale==='daily'?'month':'year'),bottom:segments(scale==='daily'?'day':scale==='monthly'?'month':'quarter')};
}
export function ganttRows(tasks, groups, collapsed = new Set(), allTasks = tasks) {
  return groups.flatMap(group => {
    const members=orderTaskTree(tasks.filter(t=>t.group===group&&isGanttTask(t)),allTasks);
    return members.length ? [{group}, ...(collapsed.has(group)?[]:members)] : [];
  });
}
export function timelineWindow(timeline, start, end, width) {
  const range={...timeline,start,end,width,dayWidth:width/(end-start)};
  return {...range,...timelineTicks(range)};
}
export function exportWindows(timeline, maxWidth=840) {
  // Split at calendar boundaries, keeping each PDF time window readable.
  const windows=[];
  let start=timeline.start;
  while(start<timeline.end) {
    const capacity=Math.max(1,Math.floor(maxWidth/timeline.dayWidth));
    const limit=Math.min(timeline.end,start+capacity);
    const boundaries=timeline.bottom.map(t=>t.end).filter(end=>end>start&&end<=limit);
    const end=boundaries.at(-1)||limit;
    windows.push(timelineWindow(timeline,start,end,maxWidth)); start=end;
  }
  return windows;
}

export function extendTimeline(timeline, direction) {
  let {start,end}=timeline;
  if(timeline.scale==='daily') {
    if(direction<0)start-=90;else end+=90;
  } else {
    const amount=12;
    const point=new Date((direction<0?start:end)*DAY);
    const boundary=monthDay(point.getUTCFullYear(),point.getUTCMonth()+direction*amount);
    if(direction<0)start=boundary;else end=boundary;
  }
  return timelineWindow(timeline,start,end,(end-start)*timeline.dayWidth);
}
export function selectedTimeline(timeline, from, through) {
  const valid=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(toDay(value))&&toDate(toDay(value))===value;
  if(!valid(from)||!valid(through))throw Error('Valid start and end dates required');
  const start=toDay(from),end=toDay(through)+1;
  if(end<=start)throw Error('End date must be on or after start date');
  if(end-start>7310)throw Error('Maximum export range: 20 years');
  return timelineWindow(timeline,start,end,(end-start)*timeline.dayWidth);
}
