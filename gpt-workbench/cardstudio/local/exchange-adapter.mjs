function editingInput(){let el=document.activeElement;while(el?.shadowRoot?.activeElement)el=el.shadowRoot.activeElement;return !!el?.matches('input,textarea,[contenteditable="true"]');}
let exchangeController;
function setupExchange(){
 exchangeController=installExchange({
  receiveGlossary:packet=>glossaryController.receive(packet),role:'cardstudio',peerUrl:'../novel-archive/Novel-Archive.html',toast,
  dialog:(title,body,footer,wide)=>dialog(title,body,footer,wide),close,
  modalOpen:()=>!$('#modal').hidden||editingInput(),flush,
  currentLabel:()=>activeView==='archive'?'当前档案':'当前卡片',allLabel:()=>activeView==='archive'?'项目全部档案':'项目全部卡片',
  make:scope=>{
   if(activeView==='archive'){
    const panel=p.archive.panels.find(x=>x.id===p.archive.activePanelId)||p.archive.panels[0];
    if(scope==='current'&&!panel)throw new Error('请先打开一份档案');
    return exchangeEnvelope(p.archive,'cardstudio_'+p.id,scope==='current'?[panel.archiveId]:undefined);
   }
   const selected=studioApi.getState().selected;
   return cardsEnvelope(p,scope==='current'?[selected]:undefined);
  },
  download:packet=>download(packet,`${safeName()}-发送到车卡机.json`),
  prepare:async packet=>{const r=await job({action:'prepareImport',kind:'exchange',payload:packet});return {draftId:r.draft.id,plan:r.draft.exchangePlan};},
  cancel:async item=>{try{await raw({action:'cancelDraft',draftId:item.draftId});drafts=drafts.filter(d=>d.id!==item.draftId);paintDrafts();}catch(e){error(e);}},
  commit:async(item,choices)=>{const r=await job({action:'commitDraft',draftId:item.draftId,choices});drafts=drafts.filter(d=>d.id!==item.draftId);archiveApi.replaceState(p.archive);studioApi.replaceState(p.studio);await setView('archive');paint();return r.stats||{created:0,updated:0,skipped:0};}
 });
 $('#exchange-btn').onclick=()=>exchangeController.open();setupGlossary();
}

function newCardDialog(templateId){
 const catalog=studioApi.getTemplates();
 dialog('新建卡片',`<label><span>卡片名称</span><input id="new-card-name" placeholder="由你命名"></label><label><span>使用模板</span><select id="new-card-template">${Object.entries(catalog).filter(([id])=>!(p.studio.projectDesign?.hiddenTemplates||[]).includes(id)||id==='unit').map(([id,t])=>`<option value="${H(id)}" ${id===templateId?'selected':''}>${H(t.name||id)}</option>`).join('')}</select></label>`,`<button class="button" data-action="close">取消</button><button class="button primary" data-action="create-card">创建并编辑</button>`);
}
async function createCard(){
 const name=$('#new-card-name').value,template=$('#new-card-template').value;
 await flush();const id=studioApi.createCard(template,name);await flush();close();await setView('studio');studioApi.openCard(id);toast('卡片已创建并保存');
}

let glossaryController;
function setupGlossary(){
 glossaryController=installGlossary({
  get:()=>p.studio.ruleTerms,lockedNames:()=>p.studio.cards.filter(c=>M.isLocked(p,c)).flatMap(c=>[...String(c.description||'').matchAll(/\[\[([^\]]+)\]\]/g)].map(m=>m[1])),
  dialog,close,toast,modalOpen:()=>!$('#modal').hidden||editingInput(),flush,
  source:'卡递 · 本地工作台',peerName:'车卡机',send:packet=>exchangeController.peer.send(packet),download:packet=>download(packet,'卡递-共享词条.json'),
  save:async terms=>changeStudio(s=>{
   const previous=s.ruleTerms||[];
   for(const term of terms){const old=previous.find(t=>t.id===term.id);if(old&&old.name!==term.name)for(const c of s.cards){if(M.isLocked(p,c)&&String(c.description||'').includes('[['+old.name+']]'))throw new Error('锁定卡牌仍引用旧词条名称，请先解锁');if(!M.isLocked(p,c))c.description=String(c.description||'').replaceAll('[['+old.name+']]','[['+term.name+']]');}}
   s.ruleTerms=M.copy(terms);
  })
 });
}
