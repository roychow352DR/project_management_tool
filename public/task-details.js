const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function descriptionParts(value) {
  const text=String(value??''),parts=[];let cursor=0;
  for(const match of text.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi)){
    if(match.index&&/[\w@./-]/.test(text[match.index-1]))continue;
    let label=match[0];
    // Leave prose punctuation outside links and preserve balanced URL brackets.
    for(;;){
      const previous=label;label=label.replace(/[.,!?;:…。，；！、]+$/u,'');
      for(const [open,close] of [['(',')'],['[',']'],['{','}']]){
        while(label.endsWith(close)&&label.split(close).length>label.split(open).length)label=label.slice(0,-1);
      }
      if(previous===label)break;
    }
    let url;try{url=new URL(/^www\./i.test(label)?'https://'+label:label);}catch{continue;}
    if(!['http:','https:'].includes(url.protocol)||!url.hostname)continue;
    if(match.index>cursor)parts.push({text:text.slice(cursor,match.index)});
    parts.push({text:label,href:url.href});cursor=match.index+label.length;
  }
  if(cursor<text.length)parts.push({text:text.slice(cursor)});
  return parts;
}
const renderPart=part=>part.href?`<a href="${escapeHTML(part.href)}" target="_blank" rel="noopener noreferrer" title="Open link in new tab">${escapeHTML(part.text)}</a>`:escapeHTML(part.text);
export const descriptionHTML=value=>descriptionParts(value).map(renderPart).join('');

export function bindTaskDescription(form,editing=false) {
  const input=form.querySelector('[name="description"]'),preview=form.querySelector('#description-preview');
  const toggle=form.querySelector('#edit-description'),links=form.querySelector('#description-links');
  function update(){
    input.hidden=!editing;preview.hidden=editing;
    preview.innerHTML=input.value?descriptionHTML(input.value):'<span class="description-empty">No description</span>';
    toggle.textContent=editing?'Preview':'Edit';toggle.setAttribute('aria-label',editing?'Preview description':'Edit description');
    const unique=[...new Map(descriptionParts(input.value).filter(part=>part.href).map(part=>[part.href,part])).values()];
    links.innerHTML=unique.length?'<span class="description-links-label">Links</span>'+unique.map(renderPart).join(''):'';
    links.hidden=!editing||!unique.length;
  }
  toggle.onclick=()=>{editing=!editing;update();if(editing)input.focus();};
  input.oninput=update;update();
}

export function dismissTaskOnBackdrop(dialog) {
  let outsidePointer=null;
  const outside=event=>{
    const rect=dialog.getBoundingClientRect();
    return event.target===dialog&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom);
  };
  dialog.addEventListener('pointerdown',event=>{
    outsidePointer=event.button===0&&dialog.querySelector('#task-form')&&outside(event)?event.pointerId:null;
  });
  dialog.addEventListener('pointerup',event=>{
    const dismiss=outsidePointer===event.pointerId&&outside(event);outsidePointer=null;
    if(dismiss)dialog.close();
  });
  dialog.addEventListener('pointercancel',()=>{outsidePointer=null;});
  dialog.addEventListener('close',()=>{outsidePointer=null;});
}
