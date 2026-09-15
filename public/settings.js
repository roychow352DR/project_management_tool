import { optionKeys, applySettings, defaultStatusColor, defaultPriorityColor } from './model.js';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names = { owner: 'QA Owners', status: 'Statuses', priority: 'Priorities', group: 'Groups' };
export function openSettings({ state, dialog, mutate, onSaved }) {
  const draft = structuredClone(state.settings);
  let section = 'status';
  dialog.className = 'settings-dialog';
  function render() {
    dialog.innerHTML = `<div class="modal-head"><span>WORKSPACE SETTINGS</span><button class="close" aria-label="Close settings">×</button></div>
      <h2>Field settings</h2><p class="settings-intro">Workspace dropdowns and custom fields</p>
      <div class="settings-tabs">${[...optionKeys, 'fields'].map(key => `<button data-section="${key}" class="${section === key ? 'active' : ''}">${names[key] || 'Custom fields'}</button>`).join('')}</div>
      <div id="settings-body"></div><p class="form-error" id="settings-error" role="alert"></p>
      <div class="modal-footer"><button class="button" id="cancel-settings">Cancel</button><button class="button primary" id="save-settings">Save settings</button></div>`;
    dialog.querySelector('.close').onclick = dialog.querySelector('#cancel-settings').onclick = () => dialog.close();
    dialog.querySelectorAll('[data-section]').forEach(b => b.onclick = () => { section = b.dataset.section; render(); });
    if (section === 'fields') renderFields(); else renderOptions();
    dialog.querySelector('#save-settings').onclick = async e => {
      e.target.disabled = true;
      // Validate and reconcile a clone first, so validation errors never partially mutate data.
      const candidate = structuredClone(state);
      try { applySettings(candidate, draft); } catch (error) {
        dialog.querySelector('#settings-error').textContent = error.message;
        e.target.disabled = false;
        return;
      }
      if (await mutate(() => Object.assign(state, candidate))) { dialog.close(); onSaved(); }
      else e.target.disabled = false;
    };
  }
  function optionRows(options, key, custom = false) {
    return options.map(o => `<div class="option-row" data-option-row="${o.id}"><input data-option-label="${o.id}" aria-label="${esc(custom ? 'Dropdown' : names[key])} option" maxlength="80" value="${esc(o.label)}">
      ${['status','priority'].includes(key) ? `<input type="color" class="status-color-input" data-option-color="${o.id}" aria-label="Color for ${esc(o.label)}" value="${o.color || (key==='status'?defaultStatusColor(options.indexOf(o)):defaultPriorityColor(o.label,options.indexOf(o)))}">` : ''}
      ${key === 'status' ? `<select data-option-kind="${o.id}" aria-label="Workflow category for ${esc(o.label)}">${[['todo','To do'],['doing','In progress'],['done','Completed']].map(([value,label]) => `<option value="${value}" ${value === o.kind ? 'selected' : ''}>${label}</option>`).join('')}</select>` : ''}
      <button class="icon-button remove-option" data-remove-option="${o.id}" aria-label="Remove option ${esc(o.label)}" ${options.length === 1 && key!=='owner' ? 'disabled' : ''}>×</button></div>`).join('');
  }
  function bindOptions(container, options, repaint) {
    container.querySelectorAll('[data-option-label]').forEach(input => input.oninput = () => { options.find(o => o.id === input.dataset.optionLabel).label = input.value; });
    container.querySelectorAll('[data-option-color]').forEach(input => input.oninput = () => { options.find(o => o.id === input.dataset.optionColor).color = input.value; });
    container.querySelectorAll('[data-option-kind]').forEach(input => input.onchange = () => { options.find(o => o.id === input.dataset.optionKind).kind = input.value; });
    container.querySelectorAll('[data-remove-option]').forEach(b => b.onclick = () => {
      options.splice(options.findIndex(o => o.id === b.dataset.removeOption), 1); repaint();
    });
  }
  function renderOptions() {
    const options = draft.options[section], body = dialog.querySelector('#settings-body');
    body.innerHTML = `<h3>${names[section]}</h3><p class="field-help">${section==='owner'?'Default: Unassigned. Removed owners: assignments cleared.':'Renaming: existing task assignments retained. Removal: reassignment to the first remaining option.'}</p>
      ${section === 'status' ? '<div class="option-heading"><span>Display name</span><span>Workflow category</span></div><p class="field-help">Status color: List, Board, and Gantt chart. Workflow category: progress calculation.</p>' : ''}
      ${section === 'priority' ? '<p class="field-help">Priority colors: List, Board, and task details.</p>' : ''}
      <div class="option-list">${optionRows(options, section)}</div><button class="button" id="add-option">＋ Add option</button>`;
    bindOptions(body, options, renderOptions);
    body.querySelector('#add-option').onclick = () => {
      options.push({ id: crypto.randomUUID(), label: '', ...(section === 'status' ? {kind: 'todo',color:defaultStatusColor(options.length)} : section==='priority'?{color:defaultPriorityColor('',options.length)}:{}) }); renderOptions();
      body.querySelector('.option-row:last-child input').focus();
    };
  }
  function renderFields() {
    const body = dialog.querySelector('#settings-body');
    body.innerHTML = `<h3>Custom fields</h3><p class="field-help">Available in task details, lists, and CSV exports. Field removal: stored values deleted on save.</p>
      <div class="field-definitions">${draft.customFields.map(field => `<section class="field-definition" data-field="${field.id}">
        <div class="field-definition-head"><label>Field name<input data-field-name="${field.id}" maxlength="80" placeholder="Field name" value="${esc(field.name)}"></label>
        <label>Field type<select data-field-type="${field.id}" ${state.settings.customFields.some(f => f.id === field.id) ? 'disabled' : ''}>${['text', 'number', 'date', 'dropdown', 'checkbox'].map(type => `<option value="${type}" ${field.type === type ? 'selected' : ''}>${type[0].toUpperCase()+type.slice(1)}</option>`).join('')}</select></label>
        <button data-remove-field="${field.id}" class="icon-button" aria-label="Remove field ${esc(field.name)}">×</button></div>
        ${field.type === 'dropdown' ? `<div class="custom-options">${optionRows(field.options, 'custom', true)}</div><button class="button" data-add-custom-option="${field.id}">＋ Add dropdown option</button>` : ''}</section>`).join('') || '<div class="settings-empty">No custom fields configured</div>'}</div>
      <button class="button" id="add-field">＋ Add custom field</button>`;
    body.querySelectorAll('[data-field-name]').forEach(input => input.oninput = () => { draft.customFields.find(f => f.id === input.dataset.fieldName).name = input.value; });
    body.querySelectorAll('[data-field-type]').forEach(input => input.onchange = () => { const field = draft.customFields.find(f => f.id === input.dataset.fieldType); field.type = input.value; if(!field.options?.length)field.options = [{id: crypto.randomUUID(), label: 'Option 1'}]; renderFields(); });
    body.querySelectorAll('[data-remove-field]').forEach(b => b.onclick = () => { draft.customFields = draft.customFields.filter(f => f.id !== b.dataset.removeField); renderFields(); });
    for (const field of draft.customFields.filter(f => f.type === 'dropdown')) {
      const container = body.querySelector(`[data-field="${field.id}"]`);
      bindOptions(container, field.options, renderFields);
      container.querySelector('[data-add-custom-option]').onclick = () => { field.options.push({id: crypto.randomUUID(), label: ''}); renderFields(); };
    }
    body.querySelector('#add-field').onclick = () => {
      draft.customFields.push({id: crypto.randomUUID(), name: '', type: 'text', options: []}); renderFields();
      body.querySelector('.field-definition:last-child input').focus();
    };
  }
  render(); dialog.showModal();
}
