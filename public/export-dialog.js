import { createExportPlan, renderExportPlan } from './gantt-export.js';
import { selectedTimeline, toDate } from './timeline.js';
export function openExportDialog({dialog,state,project,tasks,timeline,download,toast,appearance='light'}) {
  let plan=null,page=0,previewURL=null,closed=false,generating=false;
  dialog.className='export-dialog';
  dialog.innerHTML=`<div class="modal-head">GANTT CHART<button class="close" aria-label="Close export preview">×</button></div>
    <h2>Export preview</h2><p class="settings-intro">Full date range · Current task filters · All groups expanded · Subtasks ${project.ganttShowSubtasks?'included':'hidden'}</p>
    <div class="export-controls"><label class="export-format-label">File format<select id="export-format"><option value="pdf">PDF (.pdf)</option><option value="png">PNG (.png)</option><option value="svg">SVG (.svg)</option></select></label>
    <label class="export-appearance-label">Appearance<select id="export-appearance"><option value="light" ${appearance!=='dark'?'selected':''}>Light</option><option value="dark" ${appearance==='dark'?'selected':''}>Dark</option></select></label>
    <label>Start date<input type="date" id="export-start" value="${toDate(timeline.start)}" required></label><label>End date<input type="date" id="export-end" value="${toDate(timeline.end-1)}" required></label>
    <label id="pdf-layout-label">PDF layout<select id="pdf-layout"><option value="range">Full range</option><option value="detail">Detailed pages</option></select></label></div>
    <div class="preview-toolbar"><button class="button" id="reset-export-range">Use timeline range</button><span id="export-range-summary"></span><select id="preview-zoom" aria-label="Preview zoom"><option value="fit">Fit width</option><option value="1">100%</option><option value="0.5">50%</option><option value="0.25">25%</option></select><div class="preview-pagination"><button class="button" id="preview-previous" aria-label="Previous preview page">‹</button><span id="preview-page" aria-live="polite"></span><button class="button" id="preview-next" aria-label="Next preview page">›</button></div></div>
    <p id="export-error" class="form-error" role="alert"></p><div class="export-preview" tabindex="0" aria-label="Chart preview"><img id="export-preview-image" alt="Gantt chart export preview"><p id="preview-empty" hidden></p></div>
    <div class="modal-footer"><span id="export-status" role="status"></span><button class="button primary" id="download-chart">Download</button></div>`;
  const $=selector=>dialog.querySelector(selector);
  const controls=[...dialog.querySelectorAll('input,select,button:not(.close)')];
  function cleanup(){closed=true;if(previewURL)URL.revokeObjectURL(previewURL);}
  dialog.addEventListener('close',cleanup,{once:true});
  $('.close').onclick=()=>dialog.close();
  function drawPage(){
    if(!plan)return;
    const artifact=plan.page(page);
    if(previewURL)URL.revokeObjectURL(previewURL);
    previewURL=URL.createObjectURL(new Blob([artifact.svg],{type:'image/svg+xml;charset=utf-8'}));
    const image=$('#export-preview-image');image.src=previewURL;image.hidden=false;
    image.width=artifact.width;image.height=artifact.height;
    image.style.width=$('#preview-zoom').value==='fit'?'100%':`${artifact.width*Number($('#preview-zoom').value)}px`;
    $('#preview-empty').hidden=true;
    $('#preview-page').textContent=`${page+1} / ${plan.pageCount}`;
    $('#preview-previous').disabled=page===0;$('#preview-next').disabled=page===plan.pageCount-1;
    $('#download-chart').disabled=false;
  }
  function update(){
    if(generating)return;
    $('#export-error').textContent='';plan=null;page=0;
    $('#pdf-layout-label').hidden=$('#export-format').value!=='pdf';
    try{
      const selected=selectedTimeline(timeline,$('#export-start').value,$('#export-end').value);
      plan=createExportPlan({format:$('#export-format').value,state,project,tasks,timeline:selected,pdfLayout:$('#pdf-layout').value,appearance:$('#export-appearance').value});
      $('#export-range-summary').textContent=`${toDate(selected.start)} – ${toDate(selected.end-1)} · ${selected.end-selected.start} days`;
      drawPage();
    }catch(error){
      $('#export-error').textContent=error.message;$('#export-range-summary').textContent='';$('#preview-page').textContent='—';
      $('#export-preview-image').hidden=true;$('#preview-empty').hidden=false;$('#preview-empty').textContent='Preview unavailable';
      $('#preview-previous').disabled=$('#preview-next').disabled=$('#download-chart').disabled=true;
    }
  }
  for(const id of ['export-format','export-appearance','export-start','export-end','pdf-layout'])$('#'+id).onchange=update;
  // Invalidate stale previews immediately while a range is being edited.
  for(const id of ['export-start','export-end'])$('#'+id).oninput=update;
  $('#reset-export-range').onclick=()=>{$('#export-start').value=toDate(timeline.start);$('#export-end').value=toDate(timeline.end-1);update();};
  $('#preview-zoom').onchange=drawPage;
  $('#preview-previous').onclick=()=>{if(page>0){page--;drawPage();}};
  $('#preview-next').onclick=()=>{if(page+1<plan.pageCount){page++;drawPage();}};
  $('#download-chart').onclick=async()=>{
    if(!plan||generating)return;
    generating=true;controls.forEach(c=>c.disabled=true);$('#export-status').textContent='Generating export…';
    try{const result=await renderExportPlan(plan,()=>closed);if(!closed){download(result.blob,result.name);toast('Chart exported');}}
    catch(error){if(!closed)$('#export-error').textContent=error.message;}
    finally{generating=false;if(!closed){controls.forEach(c=>c.disabled=false);$('#export-status').textContent='';drawPage();}}
  };
  dialog.showModal();update();
}
