import { statusColor } from './model.js';
import { isGanttTask } from './task-schedule.js';
import { figtreeFontFace } from './fonts/figtree.js';
import { ganttTheme, ganttHeaders, ganttPeriodLabel, taskDateRange } from './gantt-style.js';
import { ganttRows, timelineWindow, exportWindows, toDate, toDay } from './timeline.js';
const esc = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short = (text,n) => [...String(text)].length>n ? [...String(text)].slice(0,n-1).join('')+'…' : String(text);
function nameLines(text) {
  const chars=[...String(text)];
  if(chars.length<=37)return [String(text)];
  let cut=chars.slice(0,37).lastIndexOf(' ');if(cut<18)cut=37;
  return [chars.slice(0,cut).join(''),short(chars.slice(cut).join('').trim(),37)];
}
function projectNameLines(name,width) {
  // A full font-size allowance per character also accommodates wide Unicode
  // names. Word boundaries are preferred, with wrapping for unbroken names.
  const chars=Array.from(String(name??'')),limit=Math.max(1,Math.floor(width/24)),lines=[];
  while(chars.length){
    let end=Math.min(limit,chars.length);
    if(end<chars.length){const space=chars.slice(0,end+1).lastIndexOf(' ');if(space>0)end=space;}
    lines.push(chars.splice(0,end).join(''));
    if(chars[0]===' ')chars.shift();
  }
  return lines.length?lines:[''];
}
export function buildGanttSVG({state,project,timeline,rows,pageLabel='',today=new Date().toISOString().slice(0,10),appearance='light'}) {
  rows=rows.filter(row=>!row.id||isGanttTask(row)).filter((row,i,list)=>row.id||(list[i+1]?.id));
  const theme=ganttTheme(appearance);
  const left=theme.labelWidth, chartWidth=timeline.width, padding=theme.padding, width=left+chartWidth+padding;
  const titleLines=projectNameLines(project.name,width-padding*2),titleOffset=(titleLines.length-1)*30;
  const head=theme.headingHeight+titleOffset, headerBottom=head+theme.headerHeight, rowHeight=theme.rowHeight;
  const gridTop=headerBottom+theme.bodyPadding, gridBottom=gridTop+rows.length*rowHeight+theme.bodyPadding;
  const statuses=state.settings.options.status,legendPerLine=Math.max(1,Math.floor((width-padding*2)/190));
  const legendLines=Math.ceil(statuses.length/legendPerLine),legendHeight=28+legendLines*28;
  const chartBottom=gridBottom+legendHeight,height=chartBottom+(pageLabel?48:padding);
  const todayDay=toDay(today),headers=ganttHeaders(timeline);
  const text=(x,y,value,extra='')=>`<text x="${x}" y="${y}" ${extra}>${esc(value)}</text>`;
  const roundedText=(x,y,value,maxWidth,extra='')=>text(x,y,short(value,Math.max(2,Math.floor(maxWidth/6.5))),extra);
  let body=`<rect width="${width}" height="${height}" fill="${theme.background}"/>`;
  body+=`<text class="project-name" font-size="24" font-weight="600" aria-label="${esc(project.name)}">${titleLines.map((line,i)=>`<tspan x="${padding}" y="${42+i*30}">${esc(line)}</tspan>`).join('')}</text>`;
  body+=text(padding,66+titleOffset,'Gantt chart','font-size="12" fill="'+theme.muted+'"');
  body+=text(width-padding,64+titleOffset,`${timeline.scale[0].toUpperCase()+timeline.scale.slice(1)} | ${toDate(timeline.start)} - ${toDate(timeline.end-1)}`,`text-anchor="end" fill="${theme.muted}"`);
  body+=text(padding+20,head+34,'Task name',`fill="${theme.muted}" font-weight="500"`);
  body+=`<g stroke="${theme.grid}" fill="none"><path d="M${left} ${head+28}H${width-padding}M${padding} ${headerBottom}H${width-padding}"/>`;
  for(const tick of headers.top)body+=`<path d="M${left+tick.x} ${head}v28"/>`;
  for(const tick of headers.bottom)body+=`<path d="M${left+tick.x} ${head+28}V${gridBottom}" stroke-opacity="${timeline.scale==='daily'?'0.45':'0.85'}"/>`;
  body+='</g>';
  for(const tick of headers.top)if(tick.width>28)body+=roundedText(left+tick.x+tick.width/2,head+19,tick.label,tick.width-14,`text-anchor="middle" fill="${theme.muted}" font-weight="600"`);
  for(const [i,tick] of headers.bottom.entries()){
    const label=ganttPeriodLabel(tick,timeline.scale),current=todayDay>=tick.start&&todayDay<tick.end;
    if(i%Math.max(1,Math.ceil(22/tick.width))!==0&&!current)continue;
    if(current&&tick.width>=20)body+=`<rect class="current-period" x="${left+tick.x+5}" y="${head+34}" width="${Math.max(10,tick.width-10)}" height="18" rx="9" fill="${theme.highlight}"/>`;
    if(tick.width>=20||!current)body+=text(left+tick.x+tick.width/2,head+47,label,`text-anchor="middle" font-size="11" fill="${current?'#ffffff':theme.text}"`);
  }
  const barPosition=t=>({x:left+(Math.max(timeline.start,toDay(t.start))-timeline.start)*timeline.dayWidth,
    end:left+(Math.min(timeline.end,toDay(t.end)+1)-timeline.start)*timeline.dayWidth});
  const dateLabels=[];
  rows.forEach((row,i)=>{
    const y=gridTop+i*rowHeight,center=y+rowHeight/2;
    if(!row.id){
      body+=text(padding+20,center+4,row.group,`fill="${theme.muted}" font-weight="600"`);return;
    }
    const lines=nameLines(row.title);
    body+=`<g><title>${esc(row.title)} | ${esc(row.status)} | ${esc(row.start)} - ${esc(row.end)}</title>`;
    body+=text(padding+20,center+(lines.length>1?-3:4),lines[0]);
    if(lines[1])body+=text(padding+20,center+11,lines[1]);
    const {x,end}=barPosition(row),color=statusColor(state,row.status);
    if(end>x){
      let barLeft=x,barEnd=end;
      if(row.start===row.end){
        const cx=Math.max(left+8,Math.min(left+chartWidth-8,x+Math.min(end-x,14)/2));
        barLeft=cx-8;barEnd=cx+8;
        body+=`<path d="M${cx} ${center-8}l8 8 -8 8 -8 -8z" fill="${color}"/>`;
      }else body+=`<rect x="${x}" y="${center-theme.barHeight/2}" width="${Math.max(0.5,end-x)}" height="${theme.barHeight}" rx="4" fill="${color}"/>`;
      const dateRange=taskDateRange(row),labelWidth=dateRange.length*7;
      let labelX=barEnd+8,anchor='start',fill=theme.text,halo=`stroke="${theme.background}" stroke-width="3" paint-order="stroke" stroke-linejoin="round"`;
      if(labelX+labelWidth>left+chartWidth){
        anchor='end';labelX=barLeft-8;
        if(labelX-labelWidth<left){labelX=barEnd-8;fill='white';halo='';}
      }
      dateLabels.push(text(labelX,center+4,dateRange,`class="date-range" text-anchor="${anchor}" fill="${fill}" ${halo}`));
    }
    body+='</g>';
  });
  for(let i=0;i<rows.length;i++)for(const dependency of rows[i].dependencies||[]){
    const j=rows.findIndex(row=>row.id===dependency);if(j<0)continue;
    const previous=barPosition(rows[j]),current=barPosition(rows[i]);
    if(previous.end<=left||previous.end>left+chartWidth||current.x<left||current.x>=left+chartWidth)continue;
    const y=gridTop+j*rowHeight+rowHeight/2,y2=gridTop+i*rowHeight+rowHeight/2,x=previous.end,x2=current.x;
    body+=`<path d="M${x} ${y}h6 V${y2}H${x2}" fill="none" stroke="${theme.muted}" stroke-dasharray="3 2"/><circle cx="${x2}" cy="${y2}" r="2" fill="${theme.muted}"/>`;
  }
  body+=`<g fill="none" stroke="${theme.grid}"><path d="M${left} ${head}V${gridBottom}M${padding} ${gridBottom}H${width-padding}"/><rect class="chart-border" x="${padding}" y="${head}" width="${width-padding*2}" height="${chartBottom-head}" rx="6"/></g>`;
  if(todayDay>=timeline.start&&todayDay<timeline.end){
    const x=left+(todayDay-timeline.start+0.5)*timeline.dayWidth,labelX=Math.max(left+25,Math.min(left+chartWidth-25,x));
    // Reserve the body padding for the label; the line begins below it.
    body+=`<g class="today-marker" fill="${theme.today}"><title>Today: ${esc(today)}</title><path class="today-line" d="M${x} ${gridTop}V${gridBottom}" fill="none" stroke="${theme.today}" stroke-width="1.25" stroke-dasharray="5 3"/><rect class="today-label-background" x="${labelX-25}" y="${headerBottom+2}" width="50" height="18" rx="2" fill="${theme.background}"/>${text(labelX,headerBottom+15,'TODAY','text-anchor="middle" font-size="11" font-weight="600"')}</g>`;
  }
  body+=dateLabels.join('');
  statuses.forEach((status,i)=>{
    const line=Math.floor(i/legendPerLine),count=Math.min(legendPerLine,statuses.length-line*legendPerLine);
    const start=(width-count*190)/2,x=start+(i%legendPerLine)*190+16,y=gridBottom+30+line*28;
    body+=`<circle cx="${x}" cy="${y-4}" r="5" fill="${statusColor(state,status.label)}"/>${text(x+13,y,short(status.label,24))}`;
  });
  if(pageLabel)body+=text(width-padding,height-18,pageLabel,`text-anchor="end" fill="${theme.muted}" font-size="11"`);
  return {svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="QA Figtree, Arial, sans-serif" font-size="12" fill="${theme.text}"><style>${figtreeFontFace}</style>${body}</svg>`,width,height};
}
export async function svgCanvas(artifact, resolution=2) {
  const scale=Math.min(resolution,12000/artifact.width,12000/artifact.height,Math.sqrt(24000000/(artifact.width*artifact.height)));
  if(scale<0.5)throw Error('Image limit exceeded — use PDF export');
  const image=new Image();
  const url=URL.createObjectURL(new Blob([artifact.svg],{type:'image/svg+xml;charset=utf-8'}));
  try{
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Chart rendering failed'));image.src=url;});
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(artifact.width*scale);canvas.height=Math.ceil(artifact.height*scale);
    const context=canvas.getContext('2d');if(!context)throw Error('Image rendering unavailable');
    context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);return canvas;
  }finally{URL.revokeObjectURL(url);}
}
const canvasBlob=(canvas,type,quality)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Image export failed')),type,quality));
// PDF 1.4: each page embeds a high-resolution JPEG, retaining Unicode glyphs
// rendered by the browser. Offsets and stream lengths count bytes, not characters.
export function createImagePDF(pages) {
  const encoder=new TextEncoder(),chunks=[],offsets=[0];let size=0;
  function append(value){const bytes=typeof value==='string'?encoder.encode(value):value;chunks.push(bytes);size+=bytes.length;}
  function object(id,parts){offsets[id]=size;append(`${id} 0 obj\n`);for(const part of parts)append(part);append('\nendobj\n');}
  append('%PDF-1.4\n');
  object(1,['<< /Type /Catalog /Pages 2 0 R >>']);
  object(2,[`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`]);
  pages.forEach((page,i)=>{
    // Match the reference's chart-sized PDF pages; padding is part of the SVG.
    const id=3+i*3,pageWidth=page.width,pageHeight=page.height;
    const content=`q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Chart Do Q\n`;
    object(id,[`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Chart ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`]);
    object(id+1,[`<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`,page.bytes,'\nendstream']);
    object(id+2,[`<< /Length ${encoder.encode(content).length} >>\nstream\n`,content,'endstream']);
  });
  const xref=size;append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for(let i=1;i<offsets.length;i++)append(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);
  append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks,{type:'application/pdf'});
}
export function paginateRows(rows, limit=12) {
  const pages=[];let offset=0;
  while(offset<rows.length){
    const page=[];
    if(rows[offset].id)page.push({group:rows[offset].group});
    while(offset<rows.length&&page.length<limit){
      if(!rows[offset].id&&page.length===limit-1)break;
      page.push(rows[offset++]);
    }
    pages.push(page);
  }
  return pages;
}
export function createExportPlan({format,state,project,tasks,timeline,pdfLayout='range',today=new Date().toISOString().slice(0,10),appearance='light'}) {
  tasks=tasks.filter(isGanttTask);
  if(!tasks.length)throw Error('No scheduled tasks available for export');
  if(!['pdf','png','svg'].includes(format))throw Error('Invalid export format');
  const rows=ganttRows(tasks,state.settings.options.group.map(o=>o.label));
  if(format==='pdf'){
    const windows=pdfLayout==='detail'?exportWindows(timeline):[timelineWindow(timeline,timeline.start,timeline.end,840)];
    const rowPages=paginateRows(rows),pageCount=windows.length*rowPages.length;
    if(pageCount>200)throw Error('Export exceeds 200 pages — use Full range layout');
    return {format,pageCount,name:'gantt-chart.pdf',page(index){
      if(index<0||index>=pageCount)throw Error('Invalid preview page');
      return buildGanttSVG({state,project,timeline:windows[index%windows.length],rows:rowPages[Math.floor(index/windows.length)],pageLabel:`Page ${index+1} of ${pageCount}`,today,appearance});
    }};
  }
  const width=Math.min(5600,Math.max(860,timeline.width));
  const artifact=buildGanttSVG({state,project,timeline:timelineWindow(timeline,timeline.start,timeline.end,width),rows,today,appearance});
  return {format,pageCount:1,name:`gantt-chart.${format}`,page:()=>artifact};
}
export async function renderExportPlan(plan, canceled=()=>false) {
  if(plan.format==='pdf'){
    const pages=[];
    for(let i=0;i<plan.pageCount;i++){
      if(canceled())throw Error('Export canceled');
      const artifact=plan.page(i),canvas=await svgCanvas(artifact),blob=await canvasBlob(canvas,'image/jpeg',0.95);
      pages.push({bytes:new Uint8Array(await blob.arrayBuffer()),width:artifact.width,height:artifact.height,pixelWidth:canvas.width,pixelHeight:canvas.height});
      canvas.width=canvas.height=0;
    }
    return {blob:createImagePDF(pages),name:plan.name};
  }
  const artifact=plan.page(0);
  if(plan.format==='svg')return {blob:new Blob([artifact.svg],{type:'image/svg+xml;charset=utf-8'}),name:plan.name};
  const canvas=await svgCanvas(artifact),blob=await canvasBlob(canvas,'image/png');canvas.width=canvas.height=0;
  return {blob,name:plan.name};
}
export async function exportGantt(options) {
  return renderExportPlan(createExportPlan(options));
}
