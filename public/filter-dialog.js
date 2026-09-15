import { filterFields, filterOperators, needsValue, emptyFilters, validateFilters } from './list-filters.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function openFilterDialog({dialog,state,projectId,config,onApply,viewLabel='List'}) {
  const fields=filterFields(state,projectId);
  let draft=structuredClone(config);
  const newRule=()=>({id:crypto.randomUUID(),field:'owner',type:'dropdown',operator:'eq',value:'',end:''});
  const $=selector=>dialog.querySelector(selector);
  dialog.className='filters-dialog';
  function valueInput(field,rule,index){
    if(!needsValue(rule))return '<span class="filter-no-value">—</span>';
    const aria=`Filter value ${index+1}`;
    if(['dropdown','dependencies','checkbox'].includes(field.type)){
      const options=field.type==='checkbox'?[{id:'true',label:'Yes'},{id:'false',label:'No'}]:field.options;
      return `<select data-value="${rule.id}" aria-label="${aria}" required><option value="">Select value</option>${options.map(option=>`<option value="${esc(option.id)}" ${option.id===rule.value?'selected':''}>${esc(option.label)}</option>`).join('')}</select>`;
    }
    const input=(key,value,label)=>`<input data-${key}="${rule.id}" aria-label="${label}" type="${field.type}" ${field.type==='number'?'step="any"':''} value="${esc(value)}" placeholder="${field.type==='text'?'Filter value':'Value'}" required>`;
    return `<div class="filter-values">${input('value',rule.value,aria)}${rule.operator==='between'?`<span>–</span>${input('end',rule.end,`Upper limit ${index+1}`)}`:''}</div>`;
  }
  function draw(){
    dialog.innerHTML=`<form id="filters-form" novalidate><div class="modal-head">${esc(viewLabel.toUpperCase())} VIEW<button class="close" type="button" aria-label="Close filters">×</button></div>
      <h2>${esc(viewLabel)} filters</h2><p class="settings-intro">Standard and custom fields · Current project</p>
      <label class="filter-match">Match<select id="filter-match"><option value="all" ${draft.match==='all'?'selected':''}>All conditions</option><option value="any" ${draft.match==='any'?'selected':''}>Any condition</option></select></label>
      <div class="filter-rows">${draft.rules.map((rule,index)=>{
        const field=fields.find(field=>field.id===rule.field);
        return `<div class="filter-row"><div class="filter-rule-main"><select data-field="${rule.id}" aria-label="Filter field ${index+1}">${[false,true].map(custom=>`<optgroup label="${custom?'Custom fields':'Standard fields'}">${fields.filter(field=>!!field.custom===custom).map(field=>`<option value="${esc(field.id)}" ${field.id===rule.field?'selected':''}>${esc(field.label)}</option>`).join('')}</optgroup>`).join('')}</select><select data-operator="${rule.id}" aria-label="Filter condition ${index+1}">${filterOperators(field).map(operator=>`<option value="${operator.id}" ${operator.id===rule.operator?'selected':''}>${operator.label}</option>`).join('')}</select>${valueInput(field,rule,index)}</div><button class="icon-button" type="button" data-remove="${rule.id}" aria-label="Remove filter ${index+1}">×</button></div>`;
      }).join('')||'<p class="settings-empty">No active filters</p>'}</div>
      <button class="button" type="button" id="add-filter">＋ Add filter</button><p class="field-help">Empty values: Is empty. Unchecked values: No. Ranges: inclusive.</p>
      <p class="form-error" id="filter-error" role="alert"></p><div class="modal-footer"><button class="button" type="button" id="clear-filter-draft">Clear conditions</button><div class="filter-actions"><button class="button" type="button" id="cancel-filters">Cancel</button><button class="button primary" type="submit">Apply filters</button></div></div></form>`;
    $('.close').onclick=$('#cancel-filters').onclick=()=>dialog.close();
    $('#filter-match').onchange=event=>draft.match=event.target.value;
    $('#add-filter').onclick=()=>{const rule=newRule();draft.rules.push(rule);draw();$(`[data-field="${rule.id}"]`).focus();};
    $('#clear-filter-draft').onclick=()=>{draft=emptyFilters();draw();};
    dialog.querySelectorAll('[data-field]').forEach(select=>select.onchange=()=>{
      const rule=draft.rules.find(rule=>rule.id===select.dataset.field),field=fields.find(field=>field.id===select.value);
      Object.assign(rule,{field:field.id,type:field.type,operator:filterOperators(field)[0].id,value:'',end:''});draw();$(`[data-operator="${rule.id}"]`).focus();
    });
    dialog.querySelectorAll('[data-operator]').forEach(select=>select.onchange=()=>{
      const rule=draft.rules.find(rule=>rule.id===select.dataset.operator);rule.operator=select.value;draw();
      ($(`[data-value="${rule.id}"]`)||$(`[data-operator="${rule.id}"]`)).focus();
    });
    for(const key of ['value','end'])dialog.querySelectorAll(`[data-${key}]`).forEach(input=>input.oninput=()=>{draft.rules.find(rule=>rule.id===input.dataset[key])[key]=input.value;$('#filter-error').textContent='';});
    dialog.querySelectorAll('[data-remove]').forEach(button=>button.onclick=()=>{draft.rules=draft.rules.filter(rule=>rule.id!==button.dataset.remove);draw();});
    $('#filters-form').onsubmit=event=>{
      event.preventDefault();
      try{validateFilters(state,projectId,draft);}catch(error){$('#filter-error').textContent=error.message;return;}
      onApply(structuredClone(draft));dialog.close();
    };
  }
  draw();dialog.showModal();
}
