import { DAY } from './timeline.js';

export const ganttStyle = {
  labelWidth:360, padding:28,
  headingHeight:88, headerHeight:56, rowHeight:36, bodyPadding:24, barHeight:18,
};

const palettes = {
  light: {background:'#ffffff', grid:'#d5dbe5', text:'#253047', muted:'#647086', highlight:'#171b34', today:'#b54747'},
  dark: {background:'#171b34', grid:'#4a4e69', text:'#d5d8df', muted:'#a0a5b8', highlight:'#536492', today:'#ed9b93'},
};
export const ganttTheme = mode => ({...ganttStyle, ...palettes[mode === 'dark' ? 'dark' : 'light']});

// Monthly views use the quarter/month hierarchy in the styling reference.
export function ganttHeaders(timeline) {
  if(timeline.scale!=='monthly')return {top:timeline.top,bottom:timeline.bottom};
  const top=[];
  for(const tick of timeline.bottom){
    const date=new Date(tick.start*DAY),label=`Q${Math.floor(date.getUTCMonth()/3)+1} ${date.getUTCFullYear()}`;
    const last=top.at(-1);
    if(last?.label===label){last.end=tick.end;last.width+=tick.width;}
    else top.push({...tick,label});
  }
  return {top,bottom:timeline.bottom};
}

export function ganttPeriodLabel(tick, scale) {
  return scale==='monthly'&&tick.width>=90
    ? new Date(tick.start*DAY).toLocaleDateString('en',{month:'long',timeZone:'UTC'})
    : tick.label;
}

export function taskDateRange(task) {
  const format=value=>new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});
  return `${format(task.start)} - ${format(task.end)}`;
}
