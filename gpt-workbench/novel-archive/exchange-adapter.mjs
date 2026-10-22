// Inserted inside the standalone app's UI closure by build-local.mjs.
let exchangeController;
function workspaceId(){
  if(!state.exchangeWorkspaceId)commit(s=>{s.exchangeWorkspaceId=C.uid('archive_workspace');},{render:false});
  return state.exchangeWorkspaceId;
}
async function durableSave(){
  await flushSave();
  if(dirty)await flushSave();
  if(dirty)throw lastSaveError||new Error('内容尚未保存，请先下载备份再接收资料');
}
function setupExchange(){
  exchangeController=ExchangeUI.installExchange({
    receiveGlossary:packet=>glossaryController.receive(packet),role:'archive',peerUrl:'../cardstudio/CardStudio-Local.html',toast,
    dialog:openDialog,close:closeDialog,
    modalOpen:()=>!!modal||document.activeElement?.matches('input,textarea,[contenteditable="true"]'),
    flush:durableSave,currentLabel:()=> '当前档案',allLabel:()=> '全部档案',
    make:async scope=>{
      const p=activePanel();if(scope==='current'&&!p)throw new Error('请先打开一份档案');
      const space=workspaceId();await durableSave();
      return Exchange.envelope(state,space,scope==='current'?[p.archiveId]:undefined);
    },
    download:packet=>download(new Blob([JSON.stringify(packet,null,2)],{type:'application/json'}),'车卡机-发送到卡递.json'),
    prepare:async packet=>{const space=workspaceId();await durableSave();return {plan:Exchange.planExchange(state,packet,space)};},
    cancel:async()=>{},
    commit:async(item,choices)=>{
      const result=Exchange.applyExchange(state,item.plan,choices);
      if(result.stats.created||result.stats.updated){
        commit(s=>{Object.assign(s,result.state);});
        await durableSave();renderAll();
      }
      return result.stats;
    }
  });setupGlossary();
}
async function historyDialog(){
  await durableSave();const records=await storage.history();
  openDialog('本机保存记录',`<p class="help-text">自动保留最近 30 次修改前的内容。先预览，确认后恢复；当前内容也会留在保存记录中。故事时间版本仍独立保留。</p>${records.length?records.map((r,i)=>`<div class="history-record"><div><strong>${H(new Date(r.savedAt).toLocaleString())}</strong><div class="small muted">${r.state.archives.length} 份档案 · 保存版本 ${r.state.revision}</div></div>${button('history-preview','预览','','',`data-history="${i}"`)}</div>`).join(''):'<p>还没有可恢复的保存记录。继续编辑并保存后会出现在这里。</p>'}`,button('dialog-close','关闭'),true);
  modal.history=records;
}
function historyPreview(index){
  const record=modal.history[index],candidate=C.validateState(record.state);candidate.exchangeWorkspaceId||=state.exchangeWorkspaceId;
  openDialog('预览保存记录',`<div class="callout">${H(new Date(record.savedAt).toLocaleString())} · ${candidate.archives.length} 份档案、${candidate.types.length} 个类型、${candidate.sharedGlossary?.length||0} 个词条</div>${candidate.archives.map(a=>`<details class="history-record"><summary>${H(C.titleOf(a.versions.find(v=>v.id===a.activeVersionId)||a.versions[0]))} · ${a.versions.length} 个故事版本</summary>${a.versions.map(v=>`<p><strong>${H(v.timeLabel||'未标故事时间')}</strong></p>${v.rows.map(r=>`<dl>${v.fields.map(f=>`<dt>${H(f.name)}</dt><dd>${H(r.values[f.id]||'')}</dd>`).join('')}</dl>`).join('')}`).join('')}</details>`).join('')}${(candidate.sharedGlossary||[]).length?'<h3>词条定义</h3>'+candidate.sharedGlossary.map(t=>`<details class="history-record"><summary>${H(t.name)}</summary><p>${H(t.description)}</p></details>`).join(''):''}`,`${button('history','返回记录')}${button('confirm-restore','恢复这份记录','','primary')}`,true);
  modal.restore=candidate;
}

let glossaryController;
function setupGlossary(){
 glossaryController=GlossaryUI.installGlossary({
  get:()=>state.sharedGlossary||[],lockedNames:()=>[],dialog:openDialog,close:closeDialog,toast,
  modalOpen:()=>!!modal||document.activeElement?.matches('input,textarea,[contenteditable="true"]'),flush:durableSave,
  source:'车卡机 · 本地工作台',peerName:'卡递',send:packet=>exchangeController.peer.send(packet),
  download:packet=>download(new Blob([JSON.stringify(packet,null,2)],{type:'application/json'}),'车卡机-共享词条.json'),
  save:async terms=>{commit(s=>{s.sharedGlossary=C.copy(terms);});await durableSave();}
 });
}
