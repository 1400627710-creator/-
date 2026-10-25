function setupAssistant(){
 assistantController=installAssistant({getProject:()=>p,flush,run:a=>job(a),toast,setView,recordsFromText,
  selection:()=>{const state=archiveApi.getState(),panel=state.panels.find(x=>x.id===state.activePanelId);return panel?[panel.archiveId]:[];},
  defaultTemplate:()=>TemplateLibrary.defaultTemplateId(p.studio,templateCatalog()),
  openArchive:async id=>{await setView('archive');archiveApi.openArchive(id);},
  legacyImport:()=>assistantAction('assistant-cloud-projects')
 });
 assistantController.ready.then(()=>{if(document.querySelector('meta[name="cardstudio-surface"]')?.content==='mcp-local')setView('archive');}).catch(error);
}
async function assistantAction(action,el){
 if(action==='assistant-cloud-projects'){
  const r=await assistantController.bridge.remote('app_service',{action:'list'}),projects=r._meta?.data?.projects||[];
  dialog('导入旧云端项目',`<p>原云端项目保持原样。选择后会完整复制为本窗口的新项目，图片、档案和字段映射一起保留。</p>${projects.length?projects.map(x=>`<div class="import-choice"><div><strong>${H(x.title)}</strong></div><button class="button" data-action="assistant-cloud-import" data-id="${H(x.id)}">导入为新项目</button></div>`).join(''):'<p>当前账户没有旧云端项目。可从“备份与迁移”导入本地完整备份。</p>'}`,undefined,true);return true;
 }
 if(action==='assistant-cloud-import'){
  await flush();const response=await assistantController.bridge.remote('app_service',{action:'get',projectId:el.dataset.id});const payload=M.validateProject(response._meta?.data?.project);
  const created=await raw({action:'create',title:payload.title});projectList.push({id:created.project.id,title:payload.title});$('#projects').insertAdjacentHTML('beforeend',`<option value="${H(created.project.id)}">${H(payload.title)}</option>`);close();await load(created.project.id);
  const preview=await raw({action:'prepareImport',projectId:p.id,kind:'unified',payload});await job({action:'commitDraft',draftId:preview.draft.id});await setView('archive');toast('已复制为当前窗口的新项目，旧云端资料保持原样');return true;
 }
 return false;
}
