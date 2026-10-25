import * as Core from '../lib/assistant-core.mjs';
import * as Quick from '../lib/quick-cards.mjs';
import {createAssistantStore} from './assistant-store.mjs';
import {AssistantHost} from './assistant-host.mjs';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=(selector,root=document)=>root.querySelector(selector);
const labels={queued:'准备提交',processing:'等待 GPT 回复',applying:'正在保存本批',failed:'未完成，可重试',review:'待核对',stale:'项目已有新修改',done:'已保存',answered:'已回复',waiting:'需要补充',cancelled:'已取消',undone:'已撤销'};
const withoutTicket=task=>{const {ticket,reply,...data}=task;return data;};
export function installAssistant(options){
 const root=$('#archive-view'),host=$('#archive-host'),store=createAssistantStore(),bridge=new AssistantHost(),forms=new Map;let jobs=[],reading=false,loadedProject='',renderEpoch=0,collapsed=false,formProject='';
 root.classList.add('has-assistant');const work=document.createElement('div');work.className='archive-primary';host.before(work);work.append(host);
 const handle=document.createElement('div');handle.className='assistant-resizer';handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label','调整卡递助手宽度');handle.tabIndex=0;
 const panel=document.createElement('aside');panel.className='assistant-panel';panel.setAttribute('aria-label','卡递助手');
 panel.innerHTML=`<header class="assistant-head"><div><span class="assistant-eyebrow">资料 · 档案 · 卡片</span><h2>卡递助手 <small>1.4</small></h2></div><button type="button" class="icon-button" data-ai="collapse" aria-label="收起卡递助手">›</button></header><div id="assistant-connection" class="assistant-connection" role="status">正在检查当前 GPT 连接…</div><div id="assistant-template" class="assistant-template"></div><div id="assistant-jobs" class="assistant-jobs" role="log" aria-label="本项目助手任务"></div><form id="assistant-form" class="assistant-compose"><div class="assistant-compose-top"><label><span>处理方式</span><select id="assistant-mode"><option value="cards">归档并批量制卡</option><option value="archive">仅整理档案</option><option value="revise">修改已有资料</option></select></label><button type="button" class="button" data-ai="file">导入文本</button><input id="assistant-file" type="file" accept=".txt,.md,.csv,.tsv,.json,text/plain,text/markdown,text/csv,application/json" hidden></div><label id="assistant-scope-label" hidden><span>处理范围</span><select id="assistant-scope"><option value="current">当前打开的档案及关联卡</option><option value="last">最近一批资料及卡牌</option><option value="all">本项目全部卡片</option></select></label><label id="assistant-source-label"><span>原始资料</span><textarea id="assistant-source" rows="4" maxlength="48000" placeholder="粘贴设定、人物说明或多张卡牌描述…"></textarea></label><label><span id="assistant-prompt-label">处理要求（选填）</span><textarea id="assistant-prompt" rows="2" maxlength="4000" placeholder="例如：沿用默认卡面，原文没有的数值留空。"></textarea></label><div class="assistant-form-foot"><small id="assistant-input-count">单批最多 48,000 字</small><button type="submit" id="assistant-submit" class="button primary">导入并批量车卡</button></div><p id="assistant-help">本批新增可自动保存；同名、出处问题和已有资料修改会先供你核对。</p></form>`;
 root.append(handle,panel);
 const toggle=document.createElement('button');toggle.type='button';toggle.className='button';toggle.textContent='✦ 卡递助手';toggle.id='assistant-toggle';toggle.onclick=async()=>{await options.setView('archive');setCollapsed(false);$('#assistant-source').focus();};$('.heading-actions').prepend(toggle);
 const fail=error=>{const message=error.message||String(error);$('#assistant-connection').textContent=message;$('#assistant-connection').classList.add('has-error');options.toast(message);};
 function setWidth(value){const width=Math.min(520,Math.max(300,value));root.style.setProperty('--assistant-width',width+'px');handle.setAttribute('aria-valuenow',String(width));return width;}
 try{setWidth(Number(localStorage.getItem('kadi-assistant-width'))||350);}catch{setWidth(350);}
 let resizing;
 handle.onpointerdown=e=>{resizing={x:e.clientX,width:panel.getBoundingClientRect().width};handle.setPointerCapture(e.pointerId);e.preventDefault();};
 handle.onpointermove=e=>{if(resizing)setWidth(resizing.width+resizing.x-e.clientX);};
 handle.onpointerup=()=>{if(resizing){try{localStorage.setItem('kadi-assistant-width',String(parseFloat(root.style.getPropertyValue('--assistant-width'))));}catch{}resizing=null;}};
 handle.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();setWidth((parseFloat(root.style.getPropertyValue('--assistant-width'))||350)+(e.key==='ArrowLeft'?16:-16));}};
 function setCollapsed(value){collapsed=value;root.classList.toggle('assistant-collapsed',value);toggle.setAttribute('aria-expanded',String(!value));}
 function connection(){const node=$('#assistant-connection');node.classList.remove('has-error');node.textContent=bridge.canSend?'已连接当前 GPT · 本项目保存在浏览器':'离线模式 · 本机整理可用；在 GPT 内打开卡递可直接对话';if(bridge.canSend&&options.legacyImport&&!$('#assistant-legacy')){const button=document.createElement('button');button.id='assistant-legacy';button.className='assistant-legacy';button.type='button';button.textContent='从旧云端工作台导入项目';button.onclick=()=>options.legacyImport().catch(fail);$('#assistant-template').after(button);}modeChanged();}
 function modeChanged(){const revise=$('#assistant-mode').value==='revise';$('#assistant-scope-label').hidden=!revise;$('#assistant-source-label').hidden=revise;$('#assistant-prompt-label').textContent=revise?'修改要求':'处理要求（选填）';$('#assistant-submit').textContent=revise?'交给 GPT 修改':bridge.canSend?($('#assistant-mode').value==='archive'?'导入并整理档案':'导入并批量车卡'):'本机整理并保存';}
 $('#assistant-mode').onchange=modeChanged;$('#assistant-source').oninput=()=>{$('#assistant-input-count').textContent=$('#assistant-source').value.length.toLocaleString()+' / 48,000 字';};
 $('#assistant-file').onchange=async event=>{try{const file=event.target.files?.[0];if(!file)return;if(file.size>700000)throw Error('文件过大，请先拆分为每批不超过 48,000 字的文本');const text=await file.text();if(text.length>Core.MAX_SOURCE)throw Error('单批最多 48,000 字，请拆分后导入');$('#assistant-source').value=text;$('#assistant-source').oninput();options.toast('文本已放入助手栏，检查处理方式后即可提交');}catch(e){fail(e);}finally{event.target.value='';}};
 function switchForm(id){if(formProject===id)return;if(formProject)forms.set(formProject,{mode:$('#assistant-mode').value,source:$('#assistant-source').value,prompt:$('#assistant-prompt').value,scope:$('#assistant-scope').value});const saved=forms.get(id)||{mode:'cards',source:'',prompt:'',scope:'current'};$('#assistant-mode').value=saved.mode;$('#assistant-source').value=saved.source;$('#assistant-prompt').value=saved.prompt;$('#assistant-scope').value=saved.scope;formProject=id;$('#assistant-source').oninput();modeChanged();}
 async function refresh(){const project=options.getProject();if(!project)return;const epoch=++renderEpoch,id=project.id;switchForm(id);const list=await store.list(id);if(epoch!==renderEpoch||options.getProject()?.id!==id)return;jobs=list;loadedProject=id;render();}
 function render(){
  const project=options.getProject();if(!project||project.id!==loadedProject)return;
  const saved=project.studio.projectDesign?.cardCreationDefault;$('#assistant-template').textContent=saved?'卡面沿用项目保存的唯一默认格式':'卡面使用当前默认模板；可在精细排版中设置唯一默认';
  $('#assistant-jobs').innerHTML=jobs.length?jobs.slice(0,20).map(task=>renderTask(task,project)).join(''):`<div class="assistant-welcome"><span>✦</span><h3>把资料交给我，继续你的创作。</h3><p>导入一段文本，一次整理多份档案；完整条目沿用默认格式生成卡片，缺失内容列为待补。</p><p>之后可以说：“把本批单位的系别改成底层，费用保持原样。”</p></div>`;
 }
 function renderTask(task,project){
  const active=['queued','processing','failed'].includes(task.status),batch=project.assistantBatches?.find(b=>b.jobId===task.id);let detail='';
  if(task.reply?.questions?.length)detail+=`<ul>${task.reply.questions.map(q=>`<li>${escape(q)}</li>`).join('')}</ul>`;
  if(task.status==='review'&&task.reply?.kind==='batch'){
   try{const plan=Core.planBatch(project,task,task.reply);detail+=`<div class="assistant-review">${plan.items.map(i=>`<label class="assistant-record"><input type="checkbox" data-adopt="${i.index}" data-job="${escape(task.id)}" ${i.ready?'checked':''} ${i.canAccept?'':'disabled'}><span><b>${escape(i.record.title)}</b><small>${escape([...i.errors,...i.warnings].join('；')||'档案与卡面可生成')}</small><details><summary>字段与出处</summary>${i.record.fields.map(f=>`<p>${escape(f.name)}：${escape(f.value)}<small>原文：${escape(f.sourceQuote)}</small></p>`).join('')}</details></span></label>`).join('')}</div><button class="button primary" data-ai="apply" data-job="${escape(task.id)}">采用勾选资料</button>`;}catch(e){detail+=`<p class="assistant-error">${escape(e.message)}</p>`;}
  }
  if(task.status==='review'&&task.reply?.kind==='edits'){
   try{const changes=Core.editsPreview(project,task,task.reply);detail+=`<div class="assistant-diffs">${changes.map(c=>`<p><b>${escape(c.name)} · ${escape(c.field)}</b><del>${escape(c.before)}</del><ins>${escape(c.after)}</ins></p>`).join('')}</div><button class="button primary" data-ai="apply" data-job="${escape(task.id)}">采用这批修改</button>`;}catch(e){detail+=`<p class="assistant-error">${escape(e.message)}</p>`;}
  }
  if(batch?.pending?.length)detail+=`<details open><summary>${batch.pending.length} 份档案待补卡面</summary>${batch.pending.map(item=>`<button type="button" class="assistant-pending" data-ai="archive" data-archive="${escape(item.archiveId)}">${escape(project.archive.archives.find(a=>a.id===item.archiveId)?.versions.find(v=>v.id===item.versionId)?.title||'来源已移除')} · ${escape(item.missing.join('；'))}</button>`).join('')}<button class="button" data-ai="complete" data-job="${escape(task.id)}">生成已补全的卡片</button></details>`;
  return `<article class="assistant-task" data-task="${escape(task.id)}"><div class="assistant-task-head"><b>${task.local?'本机整理':task.mode==='revise'?'修改资料':'导入资料'}</b><span>${escape(labels[task.status]||task.status)}</span></div><p class="assistant-user-text">${escape(task.prompt||task.sourceText.slice(0,100))}</p>${task.reply?.message?`<p>${escape(task.reply.message)}</p>`:''}${task.note?`<p class="assistant-error">${escape(task.note)}</p>`:''}${task.stats?`<p class="assistant-result">${task.stats.archived||0} 份新档案 · ${task.stats.created||0} 张新卡${task.stats.updated?' · 更新 '+task.stats.updated+' 项':''}${task.stats.pending?' · '+task.stats.pending+' 份待补':''}</p>`:''}${detail}<div class="assistant-task-actions">${batch?.archiveIds?.length?`<button class="button" data-ai="archive" data-archive="${escape(batch.archiveIds[0])}">查看档案</button>`:''}${batch?.cardIds?.length?`<button class="button" data-ai="cards">查看卡片</button>`:''}${task.status==='done'&&task.undo?`<button class="button" data-ai="undo" data-job="${escape(task.id)}">${task.undo.kind==='complete'?'撤销补全制卡':'撤销本批'}</button>`:''}${active||task.status==='stale'?`<button class="button" data-ai="retry" data-job="${escape(task.id)}">${task.status==='stale'?'按当前版本重发':'重新唤起'}</button>`:''}${active||task.status==='review'?`<button class="button" data-ai="cancel" data-job="${escape(task.id)}">取消任务</button>`:''}</div></article>`;
 }
 function scopeIds(project,scope){
  if(scope==='all')return {archiveIds:[],cardIds:project.studio.cards.map(c=>c.id)};
  if(scope==='last'){const batch=project.assistantBatches?.at(-1);return {archiveIds:batch?.archiveIds||[],cardIds:batch?.cardIds||[]};}
  const archiveIds=options.selection();return {archiveIds,cardIds:project.links.filter(l=>archiveIds.includes(l.archiveId)).map(l=>l.cardId)};
 }
 function requestFromForm(){const project=options.getProject(),mode=$('#assistant-mode').value,scope=$('#assistant-scope').value;return Core.makeRequest(project,{mode,sourceText:mode==='revise'?'':$('#assistant-source').value,prompt:$('#assistant-prompt').value,scope,...scopeIds(project,scope),templateId:options.defaultTemplate()});}
 async function saveTask(task){const current=await store.get(task.id);if(current?.status==='cancelled'&&task.status!=='cancelled'){await refresh();return false;}await store.put(task);await refresh();return true;}
 async function apply(task,selected){
  await options.flush();const project=options.getProject();if(project.id!==task.projectId)throw Error('请切回本次任务所属项目后再采用');
  const claimed=await store.transition(task.id,['review','queued'],{status:'applying'});if(!claimed)throw Error('任务已取消或正在处理，没有重复写入');await refresh();
  try{const result=await options.run({action:'assistantApply',task:withoutTicket(task),reply:task.reply,selected,expectedRevision:task.baseRevision});task.status='done';task.stats=result.stats;task.beforeRevision=task.baseRevision;task.afterRevision=result.project.revision;task.undo={beforeRevision:task.baseRevision,afterRevision:task.afterRevision,kind:'batch'};delete task.note;await saveTask(task);options.toast('本批结果已保存，可在助手栏查看或撤销');}
  catch(e){await store.transition(task.id,['applying'],{status:options.getProject()?.revision!==task.baseRevision?'stale':'review',note:e.message});await refresh();throw e;}
 }
 async function accept(task){
  const reply=task.reply;if(['answer','ask'].includes(reply.kind)){task.status=reply.kind==='ask'?'waiting':'answered';await saveTask(task);return;}
  const project=options.getProject();if(project?.id!==task.projectId){task.status='review';task.note='已收到结果；切回原项目后可核对采用';await saveTask(task);return;}
  if(project.revision!==task.baseRevision){task.status='stale';task.note='处理期间项目已有修改，旧回复已保留，请按当前版本重发';await saveTask(task);return;}
  if(reply.kind==='batch'&&Core.planBatch(project,task,reply).items.every(i=>i.ready))await apply(task);
  else{task.status='review';await saveTask(task);}
 }
 function localReply(task){
  if(task.mode==='revise')throw Error('自然语言修改需要当前 GPT；请在 GPT 内打开卡递，已有资料未修改');
  let records;
  if(task.mode==='archive'){
   try{records=options.recordsFromText(task.sourceText).map(r=>({...r,cardKind:'none',sourceQuote:task.sourceText.includes(r.title)?r.title:'',fields:r.fields}));}catch{}
  }
  if(!records){
   if(!/^[\s]*[\[{]/.test(task.sourceText)&&!/[费\t]/.test(task.sourceText)&&!/^名称[,，]/.test(task.sourceText))throw Error('这段文字需要 GPT 理解；本机整理支持卡牌描述、表格或 JSON，请在 GPT 内打开卡递继续');
   const rows=Quick.parseInput(task.sourceText).rows;records=rows.map(row=>({title:row.name,typeName:row.cardKind==='spell'?'法术资料':'单位资料',cardKind:row.cardKind,sourceQuote:row.quotes.name,fields:[...Quick.FIELDS.filter(([k])=>k!=='name'&&(row.cardKind!=='spell'||!['unitType','attack','health'].includes(k))).map(([key,name])=>({key,name,value:String(row[key]??''),sourceQuote:row.quotes[key]||''})),...row.extraFields.map(f=>({name:f.name,value:f.value,sourceQuote:f.quote||''}))]}));
  }
  return {kind:'batch',message:'由本机按已知格式整理；没有调用 GPT。',records};
 }
 async function send(task){
  if(!bridge.canSend){task.local=true;task.reply=Core.normalizeReply(localReply(task));await saveTask(task);await accept(task);return;}
  await bridge.prepare(task);const claimed=await store.transition(task.id,['queued','failed','processing'],{status:'processing',ticket:task.ticket,note:''});if(!claimed)throw Error('任务已经取消，没有重新发送');task.status='processing';await refresh();await bridge.send(task);options.toast('已交给当前 GPT，回复会回到右侧助手栏');
 }
 $('#assistant-form').onsubmit=async event=>{
  event.preventDefault();const button=$('#assistant-submit');if(button.disabled)return;button.disabled=true;let task;
  try{await options.flush();task=requestFromForm();await saveTask(task);await send(task);}catch(e){if(task){task.status='failed';task.note=e.message;await saveTask(task);}fail(e);}finally{button.disabled=false;}
 };
 panel.addEventListener('click',async event=>{
  const button=event.target.closest('[data-ai]');if(!button)return;const wasDisabled=button.disabled;button.disabled=true;
  try{
   const task=button.dataset.job?await store.get(button.dataset.job):null;
   switch(button.dataset.ai){
    case 'collapse':setCollapsed(true);break;
    case 'file':$('#assistant-file').click();break;
    case 'cards':await options.setView('cards');break;
    case 'archive':await options.openArchive(button.dataset.archive);break;
    case 'apply':{if(!task||task.status!=='review')throw Error('任务状态已改变，请重新查看');const selected=task.reply.kind==='batch'?[...panel.querySelectorAll('[data-adopt]:checked')].filter(e=>e.dataset.job===task.id).map(e=>Number(e.dataset.adopt)):undefined;await apply(task,selected);break;}
    case 'cancel':{if(!task)break;await store.transition(task.id,['queued','processing','failed','review'],{status:'cancelled',note:'已取消，之后到达的回复不会自动写入'});await refresh();break;}
    case 'retry':{
     if(!task)break;await options.flush();const project=options.getProject();if(task.projectId!==project.id)throw Error('请先切回原项目');
     let next=task;if(task.status==='stale'||task.ticket?.expires<Date.now()||project.revision!==task.baseRevision){next=Core.makeRequest(project,{...task,archiveIds:task.archiveIds,cardIds:task.cardIds});task.status='cancelled';await store.put(task);}
     next.status='queued';delete next.note;await saveTask(next);await send(next);break;
    }
    case 'undo':{await options.flush();if(!task?.undo||task.projectId!==options.getProject().id||options.getProject().revision!==task.undo.afterRevision)throw Error('后续已有新的修改，请在“保存记录”中核对后恢复');const result=await options.run({action:'restore',revision:task.undo.beforeRevision,expectedRevision:task.undo.afterRevision});task.status=task.undo.kind==='complete'?'done':'undone';task.stats=result.project.assistantBatches?.find(b=>b.jobId===task.id)?.stats||task.stats;delete task.undo;await saveTask(task);break;}
    case 'complete':{await options.flush();const beforeRevision=options.getProject().revision;const result=await options.run({action:'assistantComplete',jobId:task.id,expectedRevision:options.getProject().revision});task.stats={...task.stats,pending:result.stats.pending,created:(task.stats.created||0)+result.stats.created};task.afterRevision=result.project.revision;task.undo={beforeRevision,afterRevision:task.afterRevision,kind:'complete'};await saveTask(task);options.toast(result.stats.created?'已生成 '+result.stats.created+' 张卡片':'尚有字段未补齐，请点击条目打开档案填写');break;}
   }
  }catch(e){fail(e);}finally{if(button.isConnected)button.disabled=wasDisabled;}
 });
 async function poll(){
  if(reading||!bridge.canSend||document.visibilityState!=='visible')return;reading=true;
  try{
   const tasks=(await store.list()).filter(t=>t.status==='processing').slice(0,4);
   for(let task of tasks){
    if(!task.ticket||task.ticket.expires<Date.now()){task.status='failed';task.note='等待超时，原文已保留，可重新唤起';await saveTask(task);continue;}
    try{
     const packet=await bridge.receive(task);if(!packet)continue;
     task=await store.get(task.id);if(task.status==='cancelled'){await bridge.acknowledge(task);continue;}
     if(packet.projectId!==task.projectId||packet.baseRevision!==task.baseRevision)throw Error('回复对应的项目或版本不一致');
     const claimed=await store.transition(task.id,['processing'],{reply:Core.normalizeReply(packet.reply),status:'review'});await bridge.acknowledge(task).catch(()=>{});if(claimed)await accept(claimed);
    }catch(e){task.status='failed';task.note=e.message;await saveTask(task);}
   }
  }catch(e){fail(e);}finally{reading=false;}
 }
 const timer=setInterval(poll,6000);
 const ready=(async()=>{await refresh();try{await bridge.connect();}catch(e){fail(e);}connection();await poll();})();
 return {ready,bridge,refresh,show:()=>setCollapsed(false),projectChanged(){if(options.getProject()?.id!==loadedProject)refresh().catch(fail);else render();},destroy(){clearInterval(timer);bridge.destroy();store.close();}};
}
