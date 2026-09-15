import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimeline, timelineWindow, exportWindows, toDay, toDate, ganttRows, extendTimeline, selectedTimeline } from '../public/timeline.js';
import { normalize, statusColor, applySettings, validateSettings } from '../public/model.js';
import { availableColumns, visibleColumns, columnValue } from '../public/list-columns.js';
import { buildGanttSVG, createImagePDF, paginateRows, createExportPlan } from '../public/gantt-export.js';
import { ganttHeaders } from '../public/gantt-style.js';
const task=(start,end)=>({id:'t',title:'QA validation',owner:'QA Lead',group:'Design',status:'In progress',progress:50,dependencies:[],start,end,customValues:{}});
const workspace=()=>normalize({projects:[{id:'p',name:'QA project'}],tasks:[{...task('2026-09-01','2026-09-15'),projectId:'p'}]});
test('monthly boundaries include leap February and crossing year',()=>{
 const timeline=createTimeline([task('2023-12-28','2024-03-02')],'monthly');
 const feb=timeline.bottom.find(t=>t.label==='Feb');
 assert.equal(feb.end-feb.start,29);assert.equal(toDate(timeline.start),'2023-09-01');
 assert.deepEqual(timeline.top.map(t=>t.label),['2023','2024','2025']);
});
test('quarterly boundaries align to calendar quarters, including Q4 rollover',()=>{
 const t=createTimeline([task('2026-11-01','2027-04-02')],'quarterly');
 assert.equal(toDate(t.start),'2026-07-01');assert.equal(toDate(t.end),'2029-07-01');
 assert.equal(t.bottom.length,12);assert.deepEqual(t.bottom.slice(0,4).map(x=>x.label),['Q3','Q4','Q1','Q2']);
});
test('date geometry and PDF windows cover the full period without gaps',()=>{
 for(const scale of ['daily','monthly','quarterly']){
  const t=createTimeline([task('2026-09-01','2027-12-01')],scale);
  const pages=exportWindows(t);assert.equal(pages[0].start,t.start);assert.equal(pages.at(-1).end,t.end);
  pages.forEach((p,i)=>{assert.ok(p.end>p.start);if(i)assert.equal(p.start,pages[i-1].end);assert.equal(p.width,840);});
  assert.equal(t.width,(t.end-t.start)*t.dayWidth);
 }
});
test('status colors are distinct, survive renames, and reject unsafe values',()=>{
 const s=workspace();assert.equal(new Set(s.settings.options.status.map(o=>o.color)).size,3);
 const next=structuredClone(s.settings);next.options.status[1].color='#a43355';next.options.status[1].label='QA Review';applySettings(s,next);
 assert.equal(s.tasks[0].status,'QA Review');assert.equal(statusColor(s,'QA Review'),'#a43355');
 next.options.status[1].color='invalid';assert.throws(()=>validateSettings(next),/color/);
});
test('list selections preserve order and custom values without affecting task data',()=>{
 const s=workspace();s.settings.customFields.push({id:'client',name:'Client',type:'text'});s.tasks[0].customValues.client='Acme';
 const p=s.projects[0];assert.ok(visibleColumns(s,p).some(c=>c.id==='custom:client'));
 p.listColumns=['status','custom:client','owner'];assert.deepEqual(visibleColumns(s,p).map(c=>c.id),p.listColumns);
 assert.equal(columnValue(s,s.tasks[0],visibleColumns(s,p)[1]),'Acme');
 p.listColumns=[];assert.deepEqual(visibleColumns(s,p),[]);assert.equal(s.tasks[0].customValues.client,'Acme');
});
test('removed fields do not leave invalid List columns',()=>{
 const s=workspace();s.projects[0].listColumns=['custom:deleted','owner'];assert.deepEqual(visibleColumns(s,s.projects[0]).map(c=>c.label),['QA Owner']);
});
test('SVG includes calendar labels, borders, date ranges and status colors without owner details or branding footer',()=>{
 const s=workspace();s.tasks[0].title='QA <review> & release';const t=createTimeline(s.tasks,'monthly');
 const result=buildGanttSVG({state:s,project:s.projects[0],timeline:timelineWindow(t,t.start,t.end,860),rows:ganttRows(s.tasks,['Design'])});
 assert.match(result.svg,/QA &lt;review&gt; &amp; release/);assert.doesNotMatch(result.svg,/QA Owner|QA Lead|Orbit \| Status colors \| Diamond/);
 assert.match(result.svg,/class="chart-border"/);assert.match(result.svg,/>01 Sept? 2026 - 15 Sept? 2026</);assert.match(result.svg,/#2563eb/);assert.match(result.svg,/>Sep</);assert.ok(result.height>200);
});
test('Today marker uses date geometry in all scales and is omitted outside the selected range',()=>{
 const s=workspace();
 for(const scale of ['daily','monthly','quarterly']){
  const base=createTimeline(s.tasks,scale),timeline=timelineWindow(base,toDay('2026-09-01'),toDay('2026-10-01'),900);
  const render=today=>buildGanttSVG({state:s,project:s.projects[0],timeline,rows:ganttRows(s.tasks,['Design']),today}).svg;
  const svg=render('2026-09-15');assert.match(svg,/class="today-marker"/);assert.match(svg,/font-size="11"[^>]*>TODAY</);
  assert.match(svg,/M795 144V/); // Day 15 midpoint: 360 + 14.5 * 30.
  assert.doesNotMatch(render('2026-08-31'),/class="today-marker"/);assert.doesNotMatch(render('2026-10-01'),/class="today-marker"/);
 }
});
test('date ranges remain visible at either timeline edge and retain the true date on clipped tasks',()=>{
 const s=workspace(),base=createTimeline(s.tasks,'monthly'),timeline=timelineWindow(base,toDay('2026-09-01'),toDay('2026-10-01'),900);
 const examples=[task('2026-09-01','2026-09-01'),task('2026-09-30','2026-09-30'),task('2026-08-01','2026-10-15')];
 for(const [i,t] of examples.entries()){
  const svg=buildGanttSVG({state:s,project:s.projects[0],timeline,rows:[t],today:'2027-01-01'}).svg;
  const label=svg.match(/<text x="([\d.]+)"[^>]*class="date-range"[^>]*text-anchor="([^"]+)"[^>]*>([^<]+)<\/text>/);
  assert.ok(label);const x=Number(label[1]);assert.ok(x>=360&&x<=1260);
  if(i===0){assert.equal(label[2],'start');assert.match(label[3],/01 Sept? 2026/);}
  if(i===1){assert.equal(label[2],'end');assert.match(label[3],/30 Sept? 2026/);}
  if(i===2)assert.match(label[3],/^01 Aug 2026 - 15 Oct 2026$/);
 }
});
test('all export formats share the Today marker and date ranges used in the preview',()=>{
 const s=workspace(),timeline=createTimeline(s.tasks,'monthly');
 for(const format of ['pdf','png','svg']){
  const plan=createExportPlan({format,state:s,project:s.projects[0],tasks:s.tasks,timeline,today:'2026-09-15'});
  assert.match(plan.page(0).svg,/Today: 2026-09-15/);assert.match(plan.page(0).svg,/>01 Sept? 2026 - 15 Sept? 2026</);
 }
});
test('PDF byte offsets and page resources remain valid with binary image streams',async()=>{
 const page={bytes:new Uint8Array([255,216,128,0,255,217]),width:1200,height:700,pixelWidth:2400,pixelHeight:1400};
 const bytes=new Uint8Array(await createImagePDF([page,page]).arrayBuffer());const text=new TextDecoder('latin1').decode(bytes);
 assert.match(text,/\/Count 2/);assert.match(text,/\/Filter \/DCTDecode/);assert.match(text,/\/MediaBox \[0 0 1200 700\]/);
 const offset=Number(text.match(/startxref\n(\d+)/)[1]);assert.equal(new TextDecoder().decode(bytes.slice(offset,offset+4)),'xref');
 const entries=text.slice(text.indexOf('xref\n')).split('\n').slice(3,11);
 entries.forEach((line,i)=>{const pos=Number(line.slice(0,10));assert.ok(new TextDecoder().decode(bytes.slice(pos,pos+15)).startsWith(`${i+1} 0 obj`));});
});
test('monthly presentation headers align quarters and years to the underlying date grid',()=>{
 const timeline=selectedTimeline(createTimeline([task('2026-11-01','2027-02-15')],'monthly'),'2026-11-01','2027-02-28');
 const headers=ganttHeaders(timeline);
 assert.deepEqual(headers.top.map(t=>t.label),['Q4 2026','Q1 2027']);
 assert.equal(headers.top[0].end,toDay('2027-01-01'));assert.equal(headers.top[1].start,headers.top[0].end);
 assert.equal(headers.top.reduce((n,t)=>n+t.width,0),timeline.width);assert.equal(headers.bottom.length,4);
});
test('reference styling embeds its font and uses a current-period highlight and bottom legend',()=>{
 const s=workspace(),timeline=selectedTimeline(createTimeline(s.tasks,'monthly'),'2026-07-01','2026-12-31');
 const result=buildGanttSVG({state:s,project:s.projects[0],timeline,rows:ganttRows(s.tasks,['Design']),today:'2026-09-15'});
 assert.match(result.svg,/font-family="QA Figtree, Arial, sans-serif"/);assert.match(result.svg,/data:font\/woff2;base64,/);
 assert.ok(result.svg.includes(`<rect width="${result.width}" height="${result.height}" fill="#ffffff"/>`));assert.match(result.svg,/class="current-period"/);
 assert.ok(result.svg.lastIndexOf('>In progress</text>')>result.svg.lastIndexOf('class="date-range"'));
});

test('export appearance defaults to white and preserves schedule geometry and status colors in dark mode',()=>{
 const s=workspace(),timeline=createTimeline(s.tasks,'monthly');
 for(const format of ['pdf','png','svg']){
  const options={format,state:s,project:s.projects[0],tasks:s.tasks,timeline,today:'2026-09-15'};
  const light=createExportPlan(options).page(0),dark=createExportPlan({...options,appearance:'dark'}).page(0);
  assert.deepEqual([light.width,light.height],[dark.width,dark.height]);
  for(const [artifact,background,text] of [[light,'#ffffff','#253047'],[dark,'#171b34','#d5d8df']]){
   assert.ok(artifact.svg.includes(`<rect width="${artifact.width}" height="${artifact.height}" fill="${background}"/>`));
   assert.ok(artifact.svg.includes(`font-size="12" fill="${text}"`));
   assert.ok(artifact.svg.includes(`fill="${statusColor(s,s.tasks[0].status)}"`));
   assert.ok(artifact.svg.includes('01 Sept 2026 - 15 Sept 2026'));
  }
  assert.deepEqual(light.svg.match(/<path d="M[\d.]+ 144V[^>]+/)[0].split(' fill=')[0],dark.svg.match(/<path d="M[\d.]+ 144V[^>]+/)[0].split(' fill=')[0]);
 }
});

test('full project names wrap without clipping and reserve space above every export chart',()=>{
 const s=workspace(),base=createTimeline(s.tasks,'monthly'),timeline=timelineWindow(base,base.start,base.end,860);
 const names=['Regional Quality Assurance Programme for Mobile Applications and Release Readiness','W'.repeat(80),'品質保證項目'.repeat(13)];
 for(const name of names)for(const format of ['pdf','png','svg'])for(const appearance of ['light','dark']){
  const plan=createExportPlan({format,appearance,state:s,project:{...s.projects[0],name},tasks:s.tasks,timeline});
  const artifact=plan.page(0),heading=artifact.svg.match(/<text class="project-name"[^>]*>(.*?)<\/text>/)[1];
  const lines=[...heading.matchAll(/<tspan x="[\d.]+" y="([\d.]+)">([^<]*)<\/tspan>/g)];
  assert.ok(lines.length>1);
  assert.equal(lines.map(m=>m[2]).join('').replaceAll(' ',''),name.replaceAll(' ',''));
  assert.ok(!heading.includes('…'));
  const gridY=Number(artifact.svg.match(/<rect class="chart-border" x="[\d.]+" y="([\d.]+)"/)[1]);
  assert.ok(gridY>=Number(lines.at(-1)[1])+40);
 }
});

test('PDF pagination keeps group headers with tasks and repeats continuation headers',()=>{
 const rows=ganttRows(Array.from({length:28},(_,i)=>({...task('2026-01-01','2026-01-02'),id:'t'+i,group:i<10?'Discovery':'Design'})),['Discovery','Design']);
 const pages=paginateRows(rows);assert.equal(pages.flat().filter(t=>t.id).length,28);
 assert.ok(pages.every(p=>!p[0].id&&p.at(-1).id));
});

test('default horizons include earlier and later empty periods',()=>{
 const tasks=[task('2026-09-01','2026-09-15')];
 const daily=createTimeline(tasks,'daily');assert.equal(daily.end-daily.start,180);assert.ok(daily.start<toDay(tasks[0].start));assert.ok(daily.end>toDay(tasks[0].end));
 assert.equal(createTimeline(tasks,'monthly').bottom.length,24);
 assert.equal(createTimeline(tasks,'quarterly').bottom.length,12);
});
test('user-selected horizons and range extensions retain task coverage',()=>{
 const tasks=[task('2026-09-01','2026-09-15')];
 const daily=createTimeline(tasks,'daily',1,'2026-09-15',{span:365});assert.equal(daily.end-daily.start,365);
 for(const scale of ['daily','monthly','quarterly']){
  const base=createTimeline(tasks,scale),earlier=extendTimeline(base,-1),later=extendTimeline(base,1);
  assert.ok(earlier.start<base.start);assert.equal(earlier.end,base.end);assert.equal(later.start,base.start);assert.ok(later.end>base.end);
  assert.equal(earlier.dayWidth,base.dayWidth);
 }
});
test('export range validates dates and includes the end date',()=>{
 const base=createTimeline([task('2026-09-01','2026-09-15')],'daily');
 const selected=selectedTimeline(base,'2024-02-29','2024-02-29');assert.equal(selected.end-selected.start,1);
 assert.throws(()=>selectedTimeline(base,'2025-02-29','2025-03-01'),/Valid start/);
 assert.throws(()=>selectedTimeline(base,'2026-12-01','2026-11-01'),/End date/);
 assert.throws(()=>selectedTimeline(base,'2000-01-01','2050-01-01'),/20 years/);
});
test('preview and PDF export plan preserve all selected dates, including empty months',()=>{
 const s=workspace(),timeline=selectedTimeline(createTimeline(s.tasks,'monthly'),'2026-01-01','2027-12-31');
 const plan=createExportPlan({format:'pdf',state:s,project:s.projects[0],tasks:s.tasks,timeline});
 assert.equal(plan.pageCount,1);assert.match(plan.page(0).svg,/2026-01-01 - 2027-12-31/);
 assert.match(plan.page(0).svg,/>Q[1-4] 2027</);assert.match(plan.page(0).svg,/>Dec</);
});
test('image export uses the full range rather than cropping to task dates',()=>{
 const s=workspace(),timeline=selectedTimeline(createTimeline(s.tasks,'quarterly'),'2025-01-01','2028-12-31');
 for(const format of ['png','svg']){
  const plan=createExportPlan({format,state:s,project:s.projects[0],tasks:s.tasks,timeline});
  assert.match(plan.page(0).svg,/2025-01-01 - 2028-12-31/);assert.match(plan.page(0).svg,/>Q4</);
 }
});
test('PDF detail mode previews every date page with matching page numbers',()=>{
 const s=workspace(),timeline=createTimeline(s.tasks,'daily');
 const plan=createExportPlan({format:'pdf',state:s,project:s.projects[0],tasks:s.tasks,timeline,pdfLayout:'detail'});
 assert.ok(plan.pageCount>1);assert.match(plan.page(0).svg,new RegExp(`Page 1 of ${plan.pageCount}`));
 assert.match(plan.page(plan.pageCount-1).svg,new RegExp(toDate(timeline.end-1)));
});
