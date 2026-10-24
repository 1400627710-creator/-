import {installExchange} from '../../shared/exchange-ui.mjs';
import {envelope as exchangeEnvelope} from '../../shared/exchange.mjs';
import {cardsEnvelope} from '../../shared/card-envelope.mjs';
import * as TemplateLibrary from '../lib/template-library.mjs';
import * as QuickCards from '../lib/quick-cards.mjs';
import {installGlossary} from '../../shared/glossary-ui.mjs';
import {recoveryCache} from './recovery-cache.mjs';
import * as M from '../lib/model.mjs';
import {localService,localMeta} from './local-service.mjs';
import {compatibleProject} from '../lib/compatible-export.mjs';
import {ArchiveCore as C} from '../lib/archive-core.mjs';
import {mountArchive,mountStudio} from '../ui/engines.mjs';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const H=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const surface='local';
let p=null,projectList=[],archiveApi=null,studioApi=null,activeView='archive',embedded=false,hostReady=false,hostCapabilities={},demo=false,busy=0,queue=Promise.resolve(),archiveBase=0,studioBase=0,drafts=[],currentDraft=null,dirtyArchive=null,dirtyStudio=null,conflicted=false,toastTimer,sequence=0,loadEpoch=0,requestedProjectId=null,appReady=false;

function toast(s){$('#toast').textContent=s;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4500)}
function error(e){const msg=e.message||String(e);toast(msg);return msg;}
function status(s){$('#save-state').textContent=s;$('#save-state').title=s}
function notice(s,buttons=''){const n=$('#notice');n.hidden=!s;n.innerHTML=H(s)+buttons;}
function dialog(title,content,footer='',wide=false){$('#modal').innerHTML=`<div class="dialog${wide?' wide':''}" role="dialog" aria-modal="true" aria-label="${H(title)}"><div class="dialog-head"><h2>${H(title)}</h2><button class="icon-button" data-action="close" aria-label="关闭">✕</button></div><div class="dialog-content"><div class="dialog-error" id="dialog-error" hidden></div>${content}</div><div class="dialog-footer">${footer||'<button class="button" data-action="close">完成</button>'}</div></div>`;$('#modal').hidden=false;setTimeout(()=>$('#modal input,#modal textarea,#modal select,#modal button')?.focus(),40);}
const close=()=>{$('#modal').hidden=true;currentDraft=null;};
function dialogError(e){const el=$('#dialog-error');if(el){el.hidden=false;el.textContent=e.message||String(e);}else error(e);}
async function cache(operation,payload){const id=p?.id;if(!id)return;try{return await recoveryCache(id,operation,payload);}catch(e){if(operation==='put')notice('恢复缓存未完成，请先导出备份再关闭窗口');}}
function remember(){if(p)cache('put',{projectId:p.id,baseRevision:p.revision,archive:dirtyArchive,studio:dirtyStudio,at:new Date().toISOString()}).catch(()=>{});status('修改待保存')}
async function raw(a){return localService(a);}
function job(a,from){busy++;status('正在保存');const run=queue.then(async()=>{try{const response=await raw({...a,...(from==='archive'?{expectedArchiveRevision:archiveBase}:from==='studio'?{expectedStudioRevision:studioBase}:{}),projectId:a.projectId||p?.id,requestId:M.uid('req')});if(response.project){p=response.project;archiveBase=p.archive.revision;studioBase=p.studioRevision;if(from!=='archive'&&!dirtyArchive)archiveApi?.replaceState(p.archive);if(from!=='studio'&&!dirtyStudio)studioApi?.replaceState(p.studio);paint();}status('已保存到本机');return response;}catch(e){status('保存未完成');if(a.action==='archive'||a.action==='studio'){conflicted=true;notice(e.message,' <button class="button" data-action="download-recovery">备份当前修改</button><button class="button" data-action="reload">重新载入</button>');}throw e;}finally{busy--;}});queue=run.catch(()=>{});return run;}
async function onArchive(next){const sent=JSON.stringify(next);const r=await job({action:'archive',archive:next,expectedArchiveRevision:archiveBase},'archive');if(dirtyArchive&&JSON.stringify(dirtyArchive)===sent)dirtyArchive=null;if(!dirtyArchive&&!dirtyStudio)await cache('delete');else remember();return r;}
const studioFingerprint=x=>JSON.stringify({...x,exportedAt:undefined});
async function onStudio(next){const sent=studioFingerprint(next);const r=await job({action:'studio',studio:next,expectedStudioRevision:studioBase},'studio');if(dirtyStudio&&studioFingerprint(dirtyStudio)===sent)dirtyStudio=null;if(!dirtyArchive&&!dirtyStudio)await cache('delete');else remember();return r;}
function engines(){if(!archiveApi)archiveApi=mountArchive($('#archive-host'),p.archive,onArchive,next=>{dirtyArchive=next;remember();});else archiveApi.replaceState(p.archive);if(!studioApi)studioApi=mountStudio($('#studio-host'),p.studio,onStudio,next=>{dirtyStudio=next;remember();});else studioApi.replaceState(p.studio);}
function loading(on){for(const el of $$('.workspace,.sidenav,.bar-actions'))el.inert=on;$('#app').setAttribute('aria-busy',String(on));}
async function load(id){
 const epoch=++loadEpoch;loading(true);
 try{
  if(p){await flush();if(dirtyArchive||dirtyStudio)throw new Error('请先处理未保存修改');}
  if(epoch!==loadEpoch)return;
  const r=await raw({action:'get',projectId:id});if(epoch!==loadEpoch)return;
  p=r.project;drafts=r.drafts||[];archiveBase=p.archive.revision;studioBase=p.studioRevision;conflicted=false;notice('');$('#connection-screen').hidden=true;
  engines();await archiveApi.ready;if(epoch!==loadEpoch)return;
  activeView='cards';paint();await setView('cards');
  const recovered=await cache('get');if(epoch!==loadEpoch)return;
  if(recovered&&(recovered.archive||recovered.studio))dialog('发现未保存的修改',`<p>此项目在 ${H(recovered.at)} 留有未完成保存的内容。当前已载入本机版本，请先检查后再恢复。</p><p>本机基于版本 ${recovered.baseRevision}；当前版本 ${p.revision}。</p>`,`<button class="button" data-action="discard-recovery">放弃本机缓存</button><button class="button" data-action="download-recovery">下载恢复备份</button>${recovered.baseRevision===p.revision?'<button class="button primary" data-action="restore-local">恢复本机修改</button>':''}`);
 }finally{if(epoch===loadEpoch)loading(false);}
}
async function flush(){if(archiveApi)await archiveApi.flushSave();if(studioApi)studioApi.flush();await queue;if(conflicted)throw new Error('保存有冲突，请先下载当前修改，再重新载入');}
async function list(){const r=await raw({action:'list'});projectList=r.projects||[];if(!projectList.length){const created=await raw({action:'create',title:'我的第一个项目'});projectList=[{id:created.project.id,title:created.project.title}];}$('#projects').innerHTML=projectList.map(x=>`<option value="${H(x.id)}">${H(x.title)}</option>`).join('');const last=localMeta.getItem(demo?'cardstudio-demo-active':'cardstudio-unified-active');await load(projectList.find(x=>x.id===requestedProjectId)?.id||projectList.find(x=>x.id===last)?.id||projectList[0].id);}
function paint(){if(!p)return;$('#project-title').innerHTML=H(p.title)+' <span>↗</span>';$('#project-title').title='点击修改项目名称：'+p.title;$('#projects').value=p.id;const option=$(`#projects option[value="${CSS.escape(p.id)}"]`);if(option)option.textContent=p.title;$('#archive-count').textContent=p.archive.archives.length;$('#card-count').textContent=p.studio.cards.length;$('#link-count').textContent=p.links.length;$('#storage-label').textContent='本机项目 · 自动保存';if(demo){$('.pill').textContent='演示空间';$('.pill').classList.add('demo-tag');}paintDrafts();if(activeView==='templates')paintTemplates();if(activeView==='cards')paintCards();if(activeView==='links')paintLinks();
localMeta.setItem(demo?'cardstudio-demo-active':'cardstudio-unified-active',p.id);}
const viewCopy={templates:['版式和字段，按需复用','模板与字段','修改名称、管理适用字段，或用模板新建一张卡片。'],archive:['你的资料，逐步成形','档案资料','保留每个字段，也保留故事的不同时间。'],cards:['从档案，到卡片','卡片集','让资料套用模板，成为可编辑、可导出的卡片。'],links:['每个字段，都有来处','字段与映射','保留原始字段关系，让每次修改都可以追溯。']};
async function setView(view){if(!p)return;if(activeView==='studio'&&view!=='studio'){try{await flush();}catch(e){error(e);return;}}activeView=view;$$('.view').forEach(x=>x.classList.toggle('active',x.id===`${view}-view`));$$('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===view));if(viewCopy[view]){$('#page-kicker').textContent=viewCopy[view][0];$('#page-title').textContent=viewCopy[view][1];$('#page-description').textContent=viewCopy[view][2];}paint();}
function paintDrafts(){$('#draft-strip').hidden=!drafts.length;$('#draft-strip').innerHTML=drafts.length?`<div class="draft-banner"><span>✦ ${drafts.length} 份导入预览待确认，正式档案尚未修改</span><button class="button" data-action="open-draft" data-id="${H(drafts[0].id)}">检查并归档 →</button></div>`:'';}
function paintCards(){const q=$('#card-search').value.trim().toLowerCase(),cards=p.studio.cards.filter(c=>[c.name,c.description,c.faction].join(' ').toLowerCase().includes(q));$('#card-summary').textContent=`${cards.length} 张卡片`;const grid=$('#card-grid');if(!cards.length){grid.innerHTML=`<div class="empty" style="grid-column:1/-1"><span class="empty-symbol">▥</span><h2>${q?'没有找到匹配的卡片':'资料已经就位，下一步成为卡片'}</h2><p>${q?'试试其他关键词。':'选择档案类型、设置字段映射，再套用一个卡牌模板。所有原始字段仍保存在档案中。'}</p>${q?'':'<button class="button primary" data-action="new-card">新建卡片</button> <button class="button" data-action="generate">从档案批量制卡</button>'}</div>`;return;}grid.innerHTML=cards.map(c=>{const l=p.links.find(l=>l.cardId===c.id);return `<button class="card-tile" data-action="edit-card" data-id="${H(c.id)}" title="打开 ${H(c.name)} 的精细排版"><div class="card-preview" data-card="${H(c.id)}"></div><div class="card-label"><strong>${H(c.name||'未命名卡牌')}</strong><span>${H(c.releaseLocked?'已锁定':l?.status||'独立卡片')}</span></div><p>${H(c.faction||'未设系别')} · ${H(l?'关联档案':'卡面独立编辑')}</p></button>`}).join('');requestAnimationFrame(()=>{for(const el of $$('.card-preview')){try{const shadow=el.shadowRoot||el.attachShadow({mode:'open'});shadow.innerHTML=`<style>${studioApi.css}:host{display:block}.thumb{width:348px!important;height:auto!important;min-height:0!important;display:block!important;overflow:visible!important;transform-origin:top left}.thumb .card{width:348px!important;height:474px!important;flex:none!important;position:relative!important;margin:0!important;box-shadow:none!important}</style><div class="legacy-body thumb">${studioApi.thumbnail(el.dataset.card)}</div>`;const c=shadow.querySelector('.card');if(c){const box=c.getBoundingClientRect();const scale=Math.min(el.clientWidth/(box.width||280),el.clientHeight/(box.height||390));shadow.querySelector('.thumb').style.transform=`scale(${scale})`;}}catch(e){el.textContent='打开精细排版查看卡面';console.error(e);}}});}
function paintLinks(){const container=$('#links-list');if(!p.links.length){container.innerHTML='<div class="empty"><span class="empty-symbol">⇄</span><h2>为档案与卡片建立关联</h2><p>每一项卡面内容都能追溯到原始档案字段。重命名字段后，无需重新设置映射。</p><button class="button primary" data-action="generate">创建第一份制卡规则</button></div>';return;}container.innerHTML=p.bindings.map(b=>{const links=p.links.filter(l=>l.bindingId===b.id);return `<article class="link-card"><div class="link-head"><div><h3>${H(b.name)}</h3><p>${H(p.archive.types.find(t=>t.id===b.typeId)?.name||'全部类型')} → ${H(b.templateId)} · ${links.length} 张关联卡片</p></div><button class="button" data-action="reuse-binding" data-id="${H(b.id)}">更新 / 补充制卡</button></div><div style="overflow:auto"><table><thead><tr><th>卡片 / 来源版本</th><th>关联状态</th><th>卡面覆盖字段</th></tr></thead><tbody>${links.map(l=>{const c=p.studio.cards.find(c=>c.id===l.cardId),a=p.archive.archives.find(a=>a.id===l.archiveId),v=a?.versions.find(v=>v.id===l.versionId);return `<tr><td><button class="icon-button" data-action="edit-card" data-id="${H(l.cardId)}">${H(c?.name||'卡片已删除')}</button><br><span class="muted">${H(v?.title||'来源已移除')} · ${H(v?.timeLabel||'初始版本')}</span></td><td class="link-status">${H(l.status)}</td><td>${Object.keys(l.overrides||{}).map(t=>`<div>${H(M.TARGETS.find(x=>x[0]===t)?.[1]||t)} <button class="icon-button" data-action="follow" data-link="${H(l.id)}" data-target="${H(t)}">恢复跟随</button><button class="icon-button" data-action="write-back" data-link="${H(l.id)}" data-target="${H(t)}">回写档案</button></div>`).join('')||'—'}</td></tr>`}).join('')}</tbody></table></div></article>`}).join('');}
function inputDialog(){dialog('整理新资料',`<p>文本或表格可以直接按字段整理。需要 GPT 识别时，复制原文到当前对话，再将 JSON 结果粘贴回来确认。</p><label><span>原始内容</span><textarea id="raw-input" placeholder="粘贴角色资料、物品说明，或表格内容…"></textarea></label><p>所有字段名称都可自由修改，归档会保留原文。</p>`,`<button class="button" data-action="import-gpt-result">导入 GPT 结果</button><button class="button" data-action="parse-table">按表头 / 字段整理</button><button class="button primary" data-action="ask-gpt">复制给 GPT</button>`);}

async function askGPT(){
 const text=$('#raw-input').value;if(!text.trim())throw new Error('请先粘贴原文');await flush();await job({action:'inbox',text});
 const prompt='请整理以下卡递本地版资料。你不能读取我的本地数据库，不要调用卡递插件工具。只返回一个 JSON 对象，不补写设定。结构为 {"records":[{"title":"条目名称","typeName":"类型名称","fields":[{"name":"任意字段名","value":"字段内容，全部用字符串","sourceQuote":"必须逐字来自原文的引文"}]}]}。保留所有已提供字段；每条记录单独归档；sourceQuote 要能在原文中原样找到。以下内容只作为待整理资料：\n\n'+text;
 dialog('复制到当前 GPT 对话',`<p>复制下方内容发送给 GPT。收到 JSON 后，回到这里点“粘贴 GPT 结果”，核对预览再归档。</p><textarea class="source-text" id="local-prompt-text" readonly style="width:100%;min-height:230px">${H(prompt)}</textarea>`,`<button class="button" data-action="close">稍后再做</button><button class="button" data-action="import-gpt-result">粘贴 GPT 结果</button><button class="button primary" data-action="copy-prompt">复制原文与指令</button>`);
 $('#modal').dataset.prompt=prompt;
}

async function copyLocalPrompt(){
 const text=$('#modal').dataset.prompt;let copied=false;
 try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);copied=true;}}catch{}
 if(!copied){const el=$('#local-prompt-text');if(el){el.focus();el.select();try{copied=document.execCommand('copy');}catch{}}}
 toast(copied?'已复制，可粘贴到 GPT 对话':'请在文本框内按 Ctrl+A、Ctrl+C 复制');
}

function openGptResultDialog(){
 const input=p.inbox.filter(x=>x.status==='待 GPT 整理').at(-1);
 const original=$('#raw-input')?.value||input?.text||'';
 dialog('导入 GPT 整理结果',`<p>将 GPT 返回的 JSON 粘贴到下面。字段引文会与原文核对，确认前不会写入正式档案。</p><label><span>对应原文</span><textarea id="gpt-source" style="min-height:100px">${H(original)}</textarea></label><label><span>GPT 返回的 JSON</span><textarea id="gpt-json" placeholder='{"records":[...]}'></textarea></label>`,`<button class="button" data-action="close">取消</button><button class="button primary" data-action="preview-gpt-result">检查并生成归档预览</button>`,true);
 $('#modal').dataset.localInput=input?.id||'';
}

async function previewGptResult(){
 const text=$('#gpt-source').value;if(!text.trim())throw new Error('请提供与 JSON 对应的原文');
 let value;try{value=JSON.parse($('#gpt-json').value.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw new Error('JSON 格式不正确，请完整粘贴 GPT 返回的 JSON');}
 const records=Array.isArray(value)?value:value.records;
 await flush();let input=p.inbox.find(x=>x.id===$('#modal').dataset.localInput&&x.text===text);
 if(!input){const r=await job({action:'inbox',text});input=p.inbox.find(x=>x.id===r.inputId);}
 const r=await job({action:'prepareImport',kind:'records',records,inputId:input.id,sourceText:text});
 if(r.duplicate){close();toast('这份资料已经归档');return;}showDraft(r.draft);
}

function recordsFromText(text){let table;if(text.includes('\t'))table=parseDelimited(text,'\t');else if(text.trim().startsWith('|'))table=text.trim().split(/\r?\n/).filter(l=>!/^\s*\|?[\s:|-]+\|?\s*$/.test(l)).map(l=>l.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim()));else if(text.split(/\r?\n/)[0].includes(','))table=parseDelimited(text,',');if(table&&table.length>1){const headers=table[0];return table.slice(1).map((row,i)=>({title:String(row[0]||`条目 ${i+1}`),typeName:'表格条目',fields:headers.map((name,j)=>{const value=String(row[j]??'');return {name,value,sourceQuote:text.includes(value)?value:text};})}));}const lines=text.split(/\r?\n/).filter(x=>x.trim()),fields=lines.map(line=>{const m=line.match(/^\s*([^:：]{1,80})[:：]\s*([\s\S]*)$/);if(!m)throw new Error('这段内容需要 GPT 识别，或使用“字段名：内容”逐行输入');return {name:m[1].trim(),value:m[2],sourceQuote:m[2]};});return [{title:fields[0]?.value||'导入档案',typeName:'导入档案',fields}];}
async function previewText(){const text=$('#raw-input').value;if(!text.trim())throw new Error('请先粘贴内容');await flush();const records=recordsFromText(text),r=await job({action:'prepareImport',kind:'records',records,sourceText:text});if(r.duplicate){toast('相同资料已导入，不会重复归档');close();return;}showDraft(r.draft);}
function showDraft(d){currentDraft=d;let content=`<p>${H(d.summary)}。请核对后确认；关闭窗口会保留预览，正式数据尚未修改。</p>`;if(d.kind==='records')content+=d.records.map((r,i)=>`<article class="preview-record"><h3>${i+1}. ${H(r.title||'未命名档案')} <small>${H(r.typeName)}</small></h3><dl>${r.fields.map(f=>`<dt>${H(f.name)}</dt><dd>${H(f.value)}<small>原文：${H(f.sourceQuote)}</small></dd>`).join('')}</dl></article>`).join('');else if(d.kind==='archive')content+=`<div class="preview-record"><h3>档案备份</h3><p>${d.payload.archives.length} 份档案 · ${d.payload.archives.reduce((n,a)=>n+a.versions.length,0)} 个时间版本 · ${d.payload.types.length} 个类型</p><p>保留字段编号、任意字段名称、全部时间版本与表格布局。已有内容不按重名合并。</p></div>`;else if(d.kind==='studio')content+=`<div class="preview-record"><h3>${H(d.payload.projectName)}</h3><p>${d.payload.cards.length} 张卡牌 · ${d.payload.userAssets?.length||0} 项素材。保留模板、卡面布局、锁定状态与原始卡牌编号，同时生成可追溯档案。</p></div>`;else content+=`<div class="notice">${demo?'完整备份恢复将替换此演示项目内容；需要保留时，请先导出备份。':'完整备份恢复将替换此项目内容。当前项目仍有保存历史，可以恢复。'}</div>`;if(d.sourceText)content+=`<details><summary>查看原始输入</summary><div class="source-text">${H(d.sourceText)}</div></details>`;dialog('确认归档',content,`<button class="button" data-action="cancel-draft" data-id="${H(d.id)}">取消本次导入</button><button class="button primary" data-action="commit-draft" data-id="${H(d.id)}">确认归档${d.kind==='records'?` ${d.records.length} 条`:''}</button>`,true);currentDraft=d;}
async function openDraft(id){await flush();const r=await raw({action:'draft',draftId:id});if(r.draft.kind==='exchange')return exchangeController.receive(r.draft.payload);showDraft(r.draft);}
function mappingDialog(existing=null){if(!p.archive.archives.length){inputDialog();toast('先导入或新建一份档案，再设置制卡规则');return;}const b=existing||{id:M.uid('binding'),name:'档案制卡',typeId:p.archive.archives[0].typeId,templateId:TemplateLibrary.defaultTemplateId(p.studio,templateCatalog()),map:[]};$('#modal').dataset.binding=JSON.stringify(b);dialog('从档案批量制卡',`<p>选择一个档案类型，并指定哪些字段显示在卡面。未映射字段仍完整保留在档案中。只为档案当前选中的故事版本生成卡片。</p><div class="form-row"><label><span>规则名称</span><input id="binding-name" value="${H(b.name)}"></label><label><span>档案类型</span><select id="binding-type">${p.archive.types.map(t=>`<option value="${H(t.id)}" ${t.id===b.typeId?'selected':''}>${H(t.name||'未命名类型')}</option>`).join('')}<option value="" ${!b.typeId?'selected':''}>未分类 / 全部类型</option></select></label></div><label><span>卡牌模板</span><select id="binding-template"><option value="unit">单位</option><option value="spell">法术</option><option value="building">建筑</option><option value="event">事件</option>${Object.entries(p.studio.customTemplates||{}).map(([id,t])=>`<option value="${H(id)}">${H(t.name||id)}</option>`).join('')}</select></label><div id="mapping-rows"></div><p style="margin-top:15px">重复执行同一规则会更新已有卡片并补充新增条目。已锁定卡片与手动覆盖字段会保留。</p>`,`<button class="button" data-action="close">取消</button><button class="button primary" data-action="confirm-generate">确认并批量生成</button>`);$('#modal').dataset.binding=JSON.stringify(b);$('#binding-template').innerHTML=Object.entries(TemplateLibrary.availableTemplateCatalog(p.studio,templateCatalog())).filter(([id])=>!(p.studio.projectDesign?.hiddenTemplates||[]).includes(id)||id===b.templateId).map(([id,t])=>`<option value="${H(id)}">${H(t.name||'未命名模板')}</option>`).join('');$('#binding-template').value=b.templateId;$('#binding-template').disabled=p.bindings.some(x=>x.id===b.id);mappingRows(b);$('#binding-type').onchange=()=>mappingRows({...b,typeId:$('#binding-type').value,map:[]});$('#binding-template').onchange=()=>mappingRows({...b,map:[]});}
function mappingRows(b){const typeId=$('#binding-type').value,fields=new Map;for(const a of p.archive.archives.filter(a=>!typeId||a.typeId===typeId)){const v=a.versions.find(v=>v.id===a.activeVersionId);for(const f of v?.fields||[])fields.set(f.id,f);}const options=[{value:'meta:title',name:'档案名称'},{value:'meta:number',name:'档案编号'},...[...fields.values()].map(f=>({value:`field:${f.id}`,name:f.name||'未命名字段'}))];const aliases={unitType:['种族','兵种','类型','族群'],rarity:['稀有度'],rulesKeywords:['规则关键词'],name:['姓名','名称','卡名','技能名称'],description:['描述','效果','背景','说明','卡牌正文'],faction:['系别','阵营','势力','身份'],cost:['费用','消耗'],attack:['攻击','攻击力'],health:['生命','生命值'],move:['移动'],range:['射程'],tags:['标签','关键词'],cardNumber:['编号'],credit:['署名'],year:['年份']};$('#mapping-rows').innerHTML=[...M.TARGETS.map(([key,label])=>[key,p.studio.projectDesign?.fieldLabels?.[key]??label]),...(p.studio.fieldSchema||[]).filter(f=>!f.tpl||f.tpl===$('#binding-template').value).map(f=>['custom:'+f.key,f.label])].map(([key,label])=>{const mapped=b.map.find(m=>m.target===key);let value=mapped?`${mapped.source.kind}:${mapped.source.fieldId||mapped.source.key}`:'';if(!value){const f=[...fields.values()].filter(f=>(aliases[key]||[label]).includes(f.name));value=f.length===1?`field:${f[0].id}`:key==='name'?'meta:title':'';}return `<label class="map-row"><b>${H(label)}</b><span>←</span><select data-map-target="${H(key)}"><option value="">不映射</option>${options.map(o=>`<option value="${H(o.value)}" ${o.value===value?'selected':''}>${H(o.name)}${''}</option>`).join('')}</select></label>`}).join('');}
async function confirmGenerate(){await flush();const base=JSON.parse($('#modal').dataset.binding),binding={...base,name:$('#binding-name').value,typeId:$('#binding-type').value||null,templateId:$('#binding-template').value,map:$$('[data-map-target]').filter(el=>el.value).map(el=>{const [kind,...rest]=el.value.split(':');return {target:el.dataset.mapTarget,source:kind==='field'?{kind,fieldId:rest.join(':')}:{kind,key:rest.join(':')}}})};const r=await job({action:'generate',binding,expectedRevision:p.revision});close();setView('cards');toast(`已新增 ${r.stats.created} 张卡片，${r.stats.skipped} 张沿用已有关联`);}
async function fileImport(file){if(!file)return;await flush();if(file.size>25*1024*1024)throw new Error('文件超过 25 MB，请拆分或压缩素材');let kind,payload;if(/\.(csv|tsv)$/i.test(file.name)){const text=await file.text();const r=await job({action:'prepareImport',kind:'records',records:recordsFromText(text),sourceText:text});if(r.duplicate)return toast('相同文件已导入');showDraft(r.draft);return;}if(/\.(xlsx|xls)$/i.test(file.name)){const book=studioApi.xlsx.read(await file.arrayBuffer(),{type:'array'}),rows=studioApi.xlsx.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1,defval:''});if(rows.length<2)throw new Error('首个工作表需要表头和数据行');const records=rows.slice(1).filter(r=>r.some(v=>String(v).trim())).map((r,i)=>({title:String(r[0]||`条目 ${i+1}`),typeName:book.SheetNames[0],fields:rows[0].map((name,j)=>({name:String(name),value:String(r[j]??''),sourceQuote:String(r[j]??'')}))}));showDraft((await job({action:'prepareImport',kind:'records',records,sourceText:rows.map(r=>r.join('\t')).join('\n')})).draft);return;}
 if(/\.(cardstudio|zip)$/i.test(file.name)){const zip=await studioApi.zip.loadAsync(await file.arrayBuffer());const entry=zip.file('project.json')||Object.values(zip.files).find(f=>/project\.json$/.test(f.name));if(!entry)throw new Error('工程包中找不到 project.json');payload=JSON.parse(await entry.async('string'));const manifest=zip.file('assets/manifest.json');if(manifest){const raw=JSON.parse(await manifest.async('string')),assets=Array.isArray(raw)?raw:raw.assets||[];for(const asset of assets){const f=zip.file(asset.path||asset.file||asset.fileName);if(!f)throw new Error('素材文件缺失：'+(asset.name||asset.id));const dataUrl=`data:${asset.mime||asset.mimeType||('image/'+(asset.ext==='jpg'?'jpeg':asset.ext==='svg'?'svg+xml':asset.ext||'png'))};base64,${await f.async('base64')}`;const old=payload.userAssets?.find(x=>x.id===asset.id);if(old)old.dataUrl=dataUrl;else (payload.userAssets||=[]).push({...asset,dataUrl});}}else for(const asset of payload.userAssets||[]){if(asset.file&&!asset.dataUrl){const f=zip.file(asset.file);if(f)asset.dataUrl=`data:${asset.mime||'image/png'};base64,${await f.async('base64')}`;}}}else payload=JSON.parse(await file.text());
 if(payload.schema==='cardstudio-glossary-v1'){close();await glossaryController.receive(payload);return;}if(payload.format==='cardstudio-archive-exchange'){await exchangeController.receive(payload);return;}if(payload.format==='cardstudio-unified')kind='unified';else if(payload.schemaVersion===1&&Array.isArray(payload.archives))kind='archive';else if(payload.format==='card-assembly-studio')kind='studio';else throw new Error('未识别的文件格式，请选择档案 JSON、卡递 .cardstudio 或统一备份');const r=await job({action:'prepareImport',kind,payload});if(r.duplicate){toast('相同备份已导入，不会重复归档');return;}showDraft(r.draft);}
function download(data,name,type='application/json'){const blob=data instanceof Blob?data:new Blob([JSON.stringify(data,null,2)],{type});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.className='button primary';a.textContent='下载 '+name;a.dataset.downloadReady='true';const footer=document.querySelector('#modal:not([hidden]) .dialog-footer');if(footer){footer.querySelector('[data-download-ready]')?.remove();footer.prepend(a);if(name.endsWith('.cardstudio')){footer.querySelector('[data-zip-ready]')?.remove();const z=a.cloneNode(true);z.download=name+'.zip';z.textContent='或下载 ZIP 包';z.dataset.zipReady='true';delete z.dataset.downloadReady;footer.prepend(z);}}else{notice('文件已生成。');$('#notice').append(a);}a.click();setTimeout(()=>URL.revokeObjectURL(url),300000);}
async function buildCompatibleProject(){return Promise.race([compatibleProject(p.studio,studioApi.zip),new Promise((_,reject)=>setTimeout(()=>reject(new Error('打包超时，请先导出完整统一备份')),20000))]);}
function safeName(){return (p.title||'统一项目').replace(/[\\/:*?"<>|]/g,'-').slice(0,70);}
function backupDialog(){dialog('备份与迁移',`<p>统一备份同时包含档案、卡片、模板、素材与字段映射。旧工具的兼容格式可以单独导出。</p><button class="import-choice" style="width:100%;text-align:left" data-action="backup-unified"><span>▣</span><div><strong>完整统一备份</strong><p>可恢复全部内容与字段关联 · .json</p></div><small>推荐 ↧</small></button><button class="import-choice" style="width:100%;text-align:left" data-action="backup-archive"><span>▤</span><div><strong>兼容档案备份</strong><p>在原小说档案工具中恢复 · .json</p></div></button><button class="import-choice" style="width:100%;text-align:left" data-action="backup-studio-json"><span>▥</span><div><strong>兼容卡递工程</strong><p>完整图片、排版与模板 · 原版可直接导入的 JSON</p></div></button><details><summary>压缩工程格式（可选）</summary><p>需要更小的工程文件时，可以打包为 .cardstudio；浏览器拦截特殊后缀下载时，使用上方 JSON 或 ZIP 包。</p><button class="button" data-action="backup-studio">生成压缩卡递工程</button></details><button class="import-choice" style="width:100%;text-align:left" data-action="choose-file"><span>↥</span><div><strong>导入旧项目或恢复备份</strong><p>先预览再确认，不会直接覆盖数据</p></div></button>`);}
async function refresh(){
 if(!p||busy||dirtyArchive||dirtyStudio||conflicted||!$('#modal').hidden||$('#app').getAttribute('aria-busy')==='true')return;
 const id=p.id,revision=p.revision,epoch=loadEpoch;
 const current=()=>p?.id===id&&p.revision===revision&&loadEpoch===epoch&&!busy&&!dirtyArchive&&!dirtyStudio&&!conflicted&&$('#modal').hidden;
 let r=await raw({action:demo?'get':'poll',projectId:id});if(!current())return;
 const pending=r.drafts||[];
 if(r.project.revision!==revision){
  if(!demo)r=await raw({action:'get',projectId:id});if(!current())return;
  p=r.project;drafts=r.drafts||pending;archiveBase=p.archive.revision;studioBase=p.studioRevision;
  archiveApi?.replaceState(p.archive);studioApi?.replaceState(p.studio);paint();
 }else{drafts=pending;paintDrafts();}
}

async function act(action,el){if(action.startsWith('glossary-'))return glossaryController.action(action,el);if(await productionAction(action,el))return;if(await templateAction(action,el))return;if(action.startsWith('exchange-'))return exchangeController.action(action);if(action==='new-card'){await newCardDialog();return;}if(action==='create-card'){await createCard();return;}switch(action){case 'close':close();break;case 'choose-file':$('#file-input').click();break;case 'generate':mappingDialog();break;case 'reuse-binding':mappingDialog(p.bindings.find(b=>b.id===el.dataset.id));break;case 'confirm-generate':await confirmGenerate();break;case 'parse-table':await previewText();break;case 'ask-gpt':await askGPT();break;case 'copy-prompt':await copyLocalPrompt();break;case 'import-gpt-result':openGptResultDialog();break;case 'preview-gpt-result':await previewGptResult();break;
case 'open-draft':await openDraft(el.dataset.id);break;case 'commit-draft':{const id=el.dataset.id;const r=await job({action:'commitDraft',draftId:id});drafts=drafts.filter(d=>d.id!==id);close();archiveApi.replaceState(p.archive);studioApi.replaceState(p.studio);setView('archive');paint();toast(r.duplicate?'已归档，无需重复确认':'资料已归档，可以继续编辑或批量制卡');break;}
 case 'cancel-draft':await raw({action:'cancelDraft',draftId:el.dataset.id});drafts=drafts.filter(d=>d.id!==el.dataset.id);close();paint();toast('已取消，正式资料未修改');break;
 case 'edit-card':await flush();if(!p.studio.cards.some(c=>c.id===el.dataset.id))throw new Error('这张卡片已移除');studioApi.replaceState(p.studio,{resetHistory:false});await setView('studio');studioApi.openCard(el.dataset.id);break;
 case 'follow':case 'write-back':await flush();if(action==='write-back'&&!confirm('将这个卡面字段回写到来源档案，并更新其他跟随该档案的卡片？'))return;await job({action:action==='follow'?'follow':'writeBack',linkId:el.dataset.link,target:el.dataset.target,expectedRevision:p.revision});toast(action==='follow'?'已恢复跟随档案':'已回写来源档案');break;
 case 'backup-unified':await flush();download(p,`${safeName()}-统一备份.json`);toast('完整备份已生成');break;case 'backup-archive':await flush();download(p.archive,`${safeName()}-档案备份.json`);break;case 'backup-studio-json':await flush();if(!p.studio.cards.length)throw new Error('还没有可导出的卡片');download(p.studio,`${safeName()}-卡递工程.json`);toast('含图片的兼容工程已生成，原版可直接导入');break;case 'backup-studio':{await flush();if(!p.studio.cards.length)throw new Error('还没有可导出的卡片');el.textContent='正在打包工程…';const blob=await buildCompatibleProject();download(blob,`${safeName()}.cardstudio`);toast('兼容卡递工程已生成');el.textContent='兼容卡递工程 · 再次下载';break;}
 case 'download-recovery':{const cached=await cache('get');const backup=M.copy(p);if(cached?.archive)backup.archive=cached.archive;if(cached?.studio)backup.studio=cached.studio;download(backup,`${safeName()}-未保存恢复备份.json`);break;}
 case 'discard-recovery':await cache('delete');close();break;case 'restore-local':{const cached=await cache('get');if(cached.baseRevision!==p.revision)throw new Error('本机版本已变化，请下载备份后手动合并');if(cached.archive){dirtyArchive=cached.archive;archiveApi.replaceState(cached.archive);await onArchive(cached.archive);}if(cached.studio){dirtyStudio=cached.studio;studioApi.replaceState(cached.studio);await onStudio(cached.studio);}close();toast('已恢复本机修改');break;}
 case 'reload':if(!confirm('已下载未保存修改后，再重新载入？'))return;dirtyArchive=dirtyStudio=null;conflicted=false;await load(p.id);break;
 case 'rename':{const title=$('#rename-value').value;await flush();await job({action:'rename',title,expectedRevision:p.revision});close();break;}
 case 'create-project':{const title=$('#new-project-name').value||'未命名项目';await flush();const r=await raw({action:'create',title});projectList.push({id:r.project.id,title});$('#projects').insertAdjacentHTML('beforeend',`<option value="${H(r.project.id)}">${H(title)}</option>`);close();await load(r.project.id);break;}
 case 'restore-revision':if(!confirm('将项目恢复到该保存版本？当前状态仍会留在保存历史中。'))return;await job({action:'restore',revision:Number(el.dataset.revision),expectedRevision:p.revision});close();toast('已恢复，恢复动作已作为新版本保存');break;
 }}
document.addEventListener('click',async e=>{const el=e.target.closest('[data-action]');if(!el)return;const disabled=el.disabled;el.disabled=true;try{await act(el.dataset.action,el);}catch(e){dialogError(e);}finally{if(el.isConnected)el.disabled=disabled;}});
$$('[data-view]').forEach(el=>el.onclick=()=>setView(el.dataset.view));$('#input-btn').onclick=$('#side-import').onclick=inputDialog;$('#import-btn').onclick=()=>$('#file-input').click();$('#backup-btn').onclick=backupDialog;$('#generate-btn').onclick=$('#mapping-btn').onclick=()=>mappingDialog();$('#template-file').onchange=e=>receiveTemplate(e.target.files[0]).catch(error);$('#card-search').oninput=paintCards;$('#new-card-btn').onclick=()=>newCardDialog().catch(error);$('#close-studio').onclick=()=>setView('cards');$('#file-input').onchange=async e=>{try{await fileImport(e.target.files[0])}catch(e){error(e)}finally{e.target.value=''}};$('#projects').onchange=e=>load(e.target.value).catch(e=>{if(p)$('#projects').value=p.id;error(e);});
$('#project-title').onclick=()=>dialog('修改项目名称',`<label><span>项目名称</span><input id="rename-value" value="${H(p.title)}"></label>`,'<button class="button" data-action="close">取消</button><button class="button primary" data-action="rename">保存</button>');$('#new-project').onclick=()=>dialog('新建项目','<label><span>项目名称</span><input id="new-project-name" placeholder="例如：长夜纪事 · 第一卷"></label>','<button class="button" data-action="close">取消</button><button class="button primary" data-action="create-project">创建项目</button>');
$('#history-btn').onclick=async()=>{try{await flush();const r=await raw({action:'revisions',projectId:p.id});dialog('保存记录',`<p>本机保留最近 30 次保存；故事时间版本仍在档案中单独管理。</p>${r.revisions.length?r.revisions.map(x=>`<div class="import-choice"><div><strong>版本 ${x.revision} · ${H(x.label)}</strong><p>${H(x.created_at)}</p></div><button class="button" data-action="restore-revision" data-revision="${x.revision}">恢复</button></div>`).join(''):'<p>这里显示最近 30 次本机保存。</p>'}`);}catch(e){error(e)}};
$('#help-btn').onclick=()=>dialog('卡递 · 本地文件版','<p>双击 HTML 即可打开，无需安装、无需登录。</p><p>资料自动保存到当前浏览器的本机数据库。请尽量保持文件位置和浏览器不变，并定期用“备份与迁移”导出完整统一备份。清理浏览器数据会清除本机项目。</p><p>导入旧档案、卡递工程、表格或统一备份后，核对预览再确认。档案与卡片的字段映射、故事时间版本、素材和排版都会保留。</p><p>双击画布添加文字；字段标签支持任意改名；打印设置中可调整出血。项目检查可一键处理能够自动修复的问题。</p><p>GPT 整理：复制原文与指令到当前对话，再将 JSON 从“导入 GPT 结果”粘贴回来。当前文件本身不运行模型，也不会自动读取线上私人项目。</p>');
$('#demo-btn').onclick=()=>location.reload();
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))close()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#modal').hidden)close();if(e.key==='Tab'&&!$('#modal').hidden){const els=$$('#modal button,#modal input,#modal textarea,#modal select').filter(x=>!x.disabled),first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});window.addEventListener('beforeunload',e=>{if(busy||dirtyArchive||dirtyStudio){remember();e.preventDefault();e.returnValue=''}});
async function init(){try{await list();setupExchange();appReady=true;status('已保存到本机');}catch(e){$('#connection-screen').hidden=false;$('#connection-error').textContent=e.message;status('本机保存不可用');}setInterval(()=>{if(appReady&&document.visibilityState==='visible')refresh().catch(()=>status('本机读取暂不可用'))},5000);}

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

async function newCardDialog(templateId){
 await flush();
 const all=TemplateLibrary.templateNames(p.studio,studioApi.getTemplates()),catalog=TemplateLibrary.availableTemplateCatalog(p.studio,all),saved=TemplateLibrary.creationDefault(p.studio,all),chosen=templateId||TemplateLibrary.defaultTemplateId(p.studio,all);
 // Normal creation has one starting format. Explicit creation from the template
 // manager can still use another retained template without changing the default.
 const entries=saved&&!templateId?[[chosen,all[chosen]]]:Object.entries(catalog);
 dialog('新建卡片',`${saved?`<p>唯一默认：${H(all[saved.templateId].name)} · ${H(saved.sourceName)}。新卡继承卡框、图层、字体和位置；名称与数值可独立填写。</p>`:''}<label><span>卡片名称</span><input id="new-card-name" placeholder="由你命名"></label><label><span>使用模板</span><select id="new-card-template">${entries.map(([id,t])=>`<option value="${H(id)}" ${id===chosen?'selected':''}>${H(t.name||id)}</option>`).join('')}</select></label>`,`<button class="button" data-action="close">取消</button><button class="button primary" data-action="create-card">创建并编辑</button>`);
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

async function changeStudio(change){
 await flush();const next=M.copy(p.studio),result=change(next);
 await job({action:'studio',studio:next,expectedStudioRevision:p.studioRevision});
 return result;
}
const templateCatalog=()=>TemplateLibrary.templateNames(p.studio,studioApi.getTemplates());
function paintTemplates(){
 const catalog=TemplateLibrary.availableTemplateCatalog(p.studio,templateCatalog(),true),hidden=new Set(p.studio.projectDesign?.hiddenTemplates||[]),saved=TemplateLibrary.creationDefault(p.studio,catalog);
 $('#templates-list').innerHTML=`<p class="muted" style="grid-column:1/-1">${saved?`唯一默认：${H(catalog[saved.templateId].name)} · ${H(saved.sourceName)}。普通新建只使用此格式；旧模板仍可手动使用。`:'尚未指定自定义默认。打开你要作为基础的那张卡，点击左侧“设为唯一默认”。'}</p>`+Object.entries(catalog).map(([id,t])=>{
  const count=p.studio.cards.filter(c=>c.templateId===id).length,fields=(p.studio.fieldSchema||[]).filter(f=>!f.tpl||f.tpl===id),retired=hidden.has(id);
  return `<article class="template-item ${retired?'retired':''}"><div class="template-item-head"><span>${saved?.templateId===id?'唯一默认':retired?'已停用':'可使用'}</span><small>${count} 张卡片 · ${fields.length} 个自定义字段</small></div><label class="template-name"><span>模板名称 · 修改后自动保存</span><input data-template-name="${H(id)}" aria-label="模板名称 ${H(t.name)}" value="${H(t.name)}"></label><p>${H(t.hint||'自由卡牌模板')}</p><div class="template-fields">${fields.map(f=>`<button data-action="field-edit" data-id="${H(f.id)}" title="编辑 ${H(f.label)}">${H(f.label||'未命名字段')}${!f.tpl?' · 通用':''}</button>`).join('')||'<span>暂未添加自定义字段</span>'}</div><div class="template-actions">${!retired?`<button class="button primary" data-action="template-use" data-id="${H(id)}">新建卡片</button>`:''}<button class="button" data-action="template-fields" data-id="${H(id)}">管理字段</button><button class="button" data-action="template-clone" data-id="${H(id)}">复制模板</button><button class="button" data-action="template-export" data-id="${H(id)}">导出</button>${!['unit','basic-unit'].includes(id)&&saved?.templateId!==id?`<button class="button quiet" data-action="template-retire" data-id="${H(id)}" data-retired="${retired?'false':'true'}">${retired?'恢复使用':'停用'}</button>`:''}</div><p class="template-note">${retired?'已有卡片仍保留原模板、字段和值。':'在卡片编辑器的布局模式中调整可复用版式。'}</p></article>`;
 }).join('');
 for(const el of $$('[data-template-name]'))el.onchange=async()=>{try{await changeStudio(s=>TemplateLibrary.renameTemplate(s,catalog,el.dataset.templateName,el.value));toast('模板名称已保存');}catch(e){error(e);}};
}
function cloneTemplateDialog(id='basic-unit'){
 const catalog=TemplateLibrary.availableTemplateCatalog(p.studio,templateCatalog());dialog('新建模板',`<label><span>模板名称</span><input id="template-new-name" value="${H((catalog[id]?.name||'模板')+'副本')}"></label><label><span>以哪份模板为起点</span><select id="template-base">${Object.entries(catalog).map(([key,t])=>`<option value="${H(key)}" ${id===key?'selected':''}>${H(t.name||'未命名模板')}</option>`).join('')}</select></label><p>复制标准模块版式、条件和该模板的自定义字段。自由图层仍属于各卡片。</p>`,`<button class="button" data-action="close">取消</button><button class="button primary" data-action="template-create">创建模板</button>`);
}
function fieldsDialog(templateId){
 const catalog=templateCatalog(),fields=(p.studio.fieldSchema||[]).filter(f=>!f.tpl||f.tpl===templateId);
 dialog('字段 · '+(catalog[templateId]?.name||'通用'),`<p>通用字段适用于全部模板；专用字段只出现在所选模板。切换模板时，旧字段的值会保留。</p><div class="field-list">${fields.map(f=>`<div><strong>${H(f.label||'未命名字段')}</strong><span>${H(({text:'文本',number:'数字',boolean:'是/否',select:'选项',cardRef:'卡牌引用'})[f.type]||f.type)} · ${f.tpl?'模板专用':'全部模板'}${f.required?' · 必填':''}</span><button class="button" data-action="field-edit" data-id="${H(f.id)}">编辑</button></div>`).join('')||'<p>暂未定义自定义字段。</p>'}</div>`,`<button class="button" data-action="close">完成</button><button class="button primary" data-action="field-new" data-template="${H(templateId)}">添加字段</button>`,true);
}
function fieldDialog(fieldId,templateId=''){
 const f=(p.studio.fieldSchema||[]).find(f=>f.id===fieldId)||{id:'',label:'',type:'text',tpl:templateId,options:[],defaultValue:'',required:false,min:null,max:null},catalog=TemplateLibrary.availableTemplateCatalog(p.studio,templateCatalog(),true);
 dialog(f.id?'编辑字段':'添加字段',`<div class="form-row"><label><span>字段名称</span><input id="field-label" value="${H(f.label)}"></label><label><span>字段类型</span><select id="field-type">${[['text','文本'],['number','数字'],['select','选项'],['boolean','是/否'],['cardRef','卡牌引用']].map(([id,label])=>`<option value="${id}" ${f.type===id?'selected':''}>${label}</option>`).join('')}</select></label></div><label><span>适用模板</span><select id="field-scope"><option value="">全部模板 · 通用字段</option>${Object.entries(catalog).map(([id,t])=>`<option value="${H(id)}" ${f.tpl===id?'selected':''}>${H(t.name||'未命名模板')}</option>`).join('')}</select></label><div class="form-row"><label><span>默认值 · 只补充缺少的值</span><input id="field-default" value="${H(f.defaultValue)}"></label><label><span>选项 · 仅选项类型使用，用逗号分隔</span><input id="field-options" value="${H((f.options||[]).join(','))}"></label></div><div class="form-row"><label><span>最小值 · 仅数字类型使用</span><input id="field-min" type="number" step="any" value="${H(f.min??'')}"></label><label><span>最大值 · 仅数字类型使用</span><input id="field-max" type="number" step="any" value="${H(f.max??'')}"></label></div><label class="checkline"><input id="field-required" type="checkbox" ${f.required?'checked':''}>必填</label><p>名称可任意修改，稳定编号与制卡映射会保留。移除字段结构时，已有值仍留在卡牌备份中。</p>`,`${f.id?`<button class="button quiet" data-action="field-delete" data-id="${H(f.id)}">移除字段结构</button>`:''}<button class="button" data-action="close">取消</button><button class="button primary" data-action="field-save" data-id="${H(f.id)}">保存字段</button>`);
}
async function templateAction(action,el){
 if(action==='template-new'||action==='template-clone'){cloneTemplateDialog(el.dataset.id||'basic-unit');return true;}
 if(action==='template-create'){const base=$('#template-base').value,name=$('#template-new-name').value;await changeStudio(s=>TemplateLibrary.copyTemplate(s,templateCatalog(),base,name));close();paintTemplates();toast('模板已创建');return true;}
 if(action==='template-use'){await newCardDialog(el.dataset.id);return true;}
 if(action==='template-fields'){fieldsDialog(el.dataset.id);return true;}
 if(action==='template-retire'){const retired=el.dataset.retired==='true';await changeStudio(s=>TemplateLibrary.retireTemplate(s,templateCatalog(),el.dataset.id,retired));toast(retired?'模板已停用，已有卡面保持原样':'模板已恢复使用');return true;}
 if(action==='template-export'){download(TemplateLibrary.templatePackage(p.studio,templateCatalog(),el.dataset.id),'卡递模板.json');return true;}
 if(action==='template-import'){const picker=$('#template-file');picker.value='';picker.click();return true;}
 if(action==='field-new'||action==='field-edit'){fieldDialog(el.dataset.id||'',el.dataset.template||'');return true;}
 if(action==='field-save'){
  const input={id:el.dataset.id||undefined,label:$('#field-label').value,type:$('#field-type').value,tpl:$('#field-scope').value,defaultValue:$('#field-default').value,options:$('#field-options').value,required:$('#field-required').checked,min:$('#field-min').value,max:$('#field-max').value};
  await changeStudio(s=>TemplateLibrary.saveField(s,input));close();paintTemplates();toast('字段已保存');return true;
 }
 if(action==='field-delete'){await changeStudio(s=>{s.fieldSchema=s.fieldSchema.filter(f=>f.id!==el.dataset.id);});close();paintTemplates();toast('已移除字段结构，旧值保留在卡牌中；保存记录可恢复结构');return true;}
 return false;
}
async function receiveTemplate(file){
 if(!file)return;if(file.size>2*1024*1024)throw new Error('模板文件超过 2 MB');
 const raw=JSON.parse(await file.text());
 // Validate on a throwaway copy before presenting an actionable import.
 TemplateLibrary.importTemplate(M.copy(p.studio),raw);
 dialog('导入模板',`<p>模板：${H(raw.template.name||'未命名模板')}，自定义字段 ${raw.fields?.length||0} 个。确认后添加为新模板，不覆盖已有模板。</p><p>图片素材独立管理。模板引用的图片需从完整项目中导入。</p>`,`<button class="button" data-action="close">取消</button><button class="button primary" id="confirm-template-import">确认导入模板</button>`);
 $('#confirm-template-import').onclick=async()=>{try{await changeStudio(s=>TemplateLibrary.importTemplate(s,raw));close();await setView('templates');toast('模板已导入');}catch(e){dialogError(e);}};
}

let quickSession=null,bulkSession=null,lastProductionEdit=null;
const productionLabel=(key,fallback)=>p.studio.projectDesign?.fieldLabels?.[key]??fallback;
const isSpellField=(row,key)=>row.cardKind==='spell'&&['unitType','attack','health'].includes(key);
function productionInput(row,key,index,prefix,disabled=false){
 const value=row[key]??'',attrs=`data-${prefix}-index="${index}" data-field="${key}" aria-label="第 ${index+1} 张 ${H(productionLabel(key,QuickCards.FIELDS.find(([k])=>k===key)[1]))}" ${disabled?'disabled':''}`;
 return key==='description'?`<textarea rows="2" ${attrs}>${H(value)}</textarea>`:`<input type="${['cost','attack','health'].includes(key)?'number':'text'}" step="any" value="${H(value)}" ${attrs}>`;
}
async function quickDialog(){
 await flush();if(quickSession?.projectId!==p.id)quickSession={projectId:p.id,sourceText:'',gptJSON:'',rows:[]};
 quickSession.baseRevision=p.revision;
 dialog('快速制卡',`<p>每行一张，先核对七项字段，再一次完成归档和制卡。使用当前项目的默认格式。</p><label><span>原始内容 · 卡牌描述、表格或 JSON</span><textarea id="quick-source" rows="6" placeholder="帮派弟兄，人类，底层，登场：检索一张帮派弟兄。3费1/2身材。&#10;法术：火花，底层，造成2点伤害。2费">${H(quickSession.sourceText)}</textarea></label><details id="quick-gpt-details" ${quickSession.gptJSON?'open':''}><summary>已有 GPT 整理结果？粘贴 JSON</summary><p>对应原文保留在上方；JSON 放在这里。无法在原文找到的值会标记为预览补充。</p><textarea id="quick-gpt-json" rows="5" placeholder='{"cards":[{"name":"帮派弟兄","cardKind":"unit","unitType":"人类","faction":"底层","description":"登场：检索一张帮派弟兄。","cost":3,"attack":1,"health":2}]}'>${H(quickSession.gptJSON)}</textarea></details><p class="muted">常见格式由本机拆分；复杂内容可复制给当前 GPT 对话整理。确认前不会生成卡片。</p>`,`<button class="button" data-action="close">取消</button><button class="button" data-action="production-copy-gpt">复制给 GPT</button><button class="button primary" data-action="production-parse">识别并预览</button>`,true);
 $('#quick-source').oninput=e=>quickSession.sourceText=e.target.value;$('#quick-gpt-json').oninput=e=>quickSession.gptJSON=e.target.value;
}
function quickPreview(){
 const catalog=TemplateLibrary.templateNames(p.studio,studioApi.getTemplates()),id=TemplateLibrary.defaultTemplateId(p.studio,catalog);quickSession.templateId=id;
 dialog('核对后归档并制卡',`<div class="production-heading"><p>使用模板：<strong>${H(catalog[id]?.name||id)}</strong>${TemplateLibrary.creationDefault(p.studio,catalog)?' · 沿用已保存的默认卡框与排版':''}</p><b id="quick-summary"></b></div><div class="production-table"><table><thead><tr><th>采用</th><th>模式</th>${QuickCards.FIELDS.map(([key,label])=>`<th>${H(productionLabel(key,label))}</th>`).join('')}<th>核对</th></tr></thead><tbody>${quickSession.rows.map((row,i)=>`<tr data-quick-row="${i}"><td><input type="checkbox" data-quick-select="${i}" aria-label="采用第 ${i+1} 张" ${row.selected===false?'':'checked'}></td><td><select data-quick-kind="${i}" aria-label="第 ${i+1} 张模式"><option value="unit" ${row.cardKind==='unit'?'selected':''}>单位</option><option value="spell" ${row.cardKind==='spell'?'selected':''}>法术</option></select></td>${QuickCards.FIELDS.map(([key])=>`<td>${productionInput(row,key,i,'quick',isSpellField(row,key))}</td>`).join('')}<td><small id="quick-issues-${i}"></small></td></tr>`).join('')}</tbody></table></div><details><summary>查看原文 · 确认后随档案保存</summary><pre class="source-text">${H(quickSession.sourceText)}</pre></details><p class="muted">新建同名卡不会覆盖旧卡。名称、种族、系别、效果和数值可在预览里改；修改会保留为手动修订。</p>`,`<button class="button" data-action="production-back">返回修改原文</button><button class="button" data-action="close">取消</button><button class="button primary" data-action="production-create">确认归档并制卡</button>`,true);
 for(const input of $$('[data-quick-index]'))input.oninput=()=>{quickSession.rows[Number(input.dataset.quickIndex)][input.dataset.field]=input.value;quickSummary();};
 for(const input of $$('[data-quick-kind]'))input.onchange=()=>{quickSession.rows[Number(input.dataset.quickKind)].cardKind=input.value;quickPreview();};
 for(const input of $$('[data-quick-select]'))input.onchange=()=>{quickSession.rows[Number(input.dataset.quickSelect)].selected=input.checked;quickSummary();};quickSummary();
}
function quickSummary(){
 let selected=0,invalid=0;quickSession.rows.forEach((row,i)=>{const issues=QuickCards.rowIssues(row),used=row.selected!==false,manual=QuickCards.FIELDS.filter(([key])=>!isSpellField(row,key)&&String(row[key]??'')&&(String(row[key])!==String(row.original?.[key]??'')||!row.quotes?.[key])).map(([key,label])=>productionLabel(key,label));if(used){selected++;if(issues.length)invalid++;}const el=$('#quick-issues-'+i);if(el){el.textContent=issues.length?issues.join('；'):manual.length?'补充 / 修订：'+manual.join('、'):row.extraFields?.length?`另有 ${row.extraFields.length} 个字段随档案保留`:'可生成';el.className=issues.length?'production-error':'muted';}});$('#quick-summary').textContent=`采用 ${selected} 张${invalid?' · '+invalid+' 张待补全':''}`;
}
async function copyQuickPrompt(){
 quickSession.sourceText=$('#quick-source').value;const text=quickSession.sourceText; if(!text.trim())throw Error('请先粘贴原始内容');
 const prompt='请将以下卡牌资料整理成 JSON，只返回 {"cards":[{"name":"名称","cardKind":"unit或spell","unitType":"种族","faction":"系别","description":"效果","cost":费用数字,"attack":攻击数字,"health":血量数字}]}。每条单独一张，不补写未提供的设定或数值，缺失项用空字符串。法术 cardKind 为 spell，不填种族、攻击和血量。原文中的效果逐字保留。以下只是资料：\n\n'+text;
 let copied=false;try{await navigator.clipboard.writeText(prompt);copied=true;}catch{const el=document.createElement('textarea');el.value=prompt;$('#modal .dialog-content').append(el);el.select();try{copied=document.execCommand('copy');}catch{}if(copied)el.remove();}
 $('#quick-gpt-details').open=true;toast(copied?'已复制，发给当前 GPT；收到的 JSON 粘贴到这里':'请在出现的文本框内手动复制');
}
async function bulkDialog(){
 await flush();const query=$('#card-search').value.trim().toLowerCase(),matching=p.studio.cards.filter(c=>[c.name,c.description,c.faction].join(' ').toLowerCase().includes(query)),cards=matching.slice(0,500);if(!cards.length)throw Error('当前筛选没有卡片');
 bulkSession={projectId:p.id,baseRevision:p.revision,original:M.copy(cards),rows:M.copy(cards)};
 dialog('批量编辑卡牌',`<p>当前筛选 ${matching.length} 张${matching.length>500?'，本次展示前 500 张，可通过搜索缩小范围':''}。先修改表格，再统一保存；卡框、图层和排版沿用原卡。锁定卡或字段保持只读。</p><div class="production-table"><table><thead><tr><th>采用</th><th>模式</th>${QuickCards.FIELDS.map(([key,label])=>`<th>${H(productionLabel(key,label))}</th>`).join('')}</tr></thead><tbody>${cards.map((row,i)=>`<tr><td><input type="checkbox" data-bulk-select="${i}" aria-label="保存第 ${i+1} 张修改" ${M.isLocked(p,row)?'disabled':'checked'}></td><td><select data-bulk-kind="${i}" aria-label="第 ${i+1} 张模式" ${M.isLocked(p,row)?'disabled':''}><option value="unit" ${row.cardKind!=='spell'?'selected':''}>单位</option><option value="spell" ${row.cardKind==='spell'?'selected':''}>法术</option></select></td>${QuickCards.FIELDS.map(([key])=>`<td>${productionInput(row,key,i,'bulk',M.isLocked(p,row)||M.fieldLocked(row,key)||isSpellField(row,key))}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p id="bulk-summary" class="muted">尚未修改。关联档案的手动修改会保留为卡面覆盖，可在“字段与映射”回写或恢复跟随。</p>`,`<button class="button" data-action="close">取消</button><button class="button primary" data-action="production-save-bulk">保存采用的修改</button>`,true);
 for(const input of $$('[data-bulk-index]'))input.oninput=()=>{bulkSession.rows[Number(input.dataset.bulkIndex)][input.dataset.field]=input.value;$('#bulk-summary').textContent='有待保存的修改；关闭或取消不会改动卡片。';};
 for(const input of $$('[data-bulk-kind]'))input.onchange=()=>{const i=Number(input.dataset.bulkKind),row=bulkSession.rows[i];row.cardKind=input.value;for(const el of $$(`[data-bulk-index="${i}"]`))el.disabled=M.isLocked(p,row)||M.fieldLocked(row,el.dataset.field)||isSpellField(row,el.dataset.field);};
}
async function productionAction(action){
 if(action==='production-quick'){await quickDialog();return true;}
 if(action==='production-bulk'){await bulkDialog();return true;}
 if(action==='production-copy-gpt'){await copyQuickPrompt();return true;}
 if(action==='production-back'){await quickDialog();return true;}
 if(action==='production-parse'){quickSession.sourceText=$('#quick-source').value;quickSession.gptJSON=$('#quick-gpt-json').value;quickSession.rows=QuickCards.parseInput(quickSession.sourceText,quickSession.gptJSON).rows;quickPreview();return true;}
 if(action==='production-create'){
  const rows=quickSession.rows.filter(row=>row.selected!==false).map(({selected,id,...row})=>row);QuickCards.validateRows(rows);
  const beforeRevision=quickSession.baseRevision,result=await job({action:'quickGenerate',rows,sourceText:quickSession.sourceText,templateId:quickSession.templateId,expectedRevision:quickSession.baseRevision});close();await setView('cards');toast(result.stats.duplicate?'相同内容已处理，没有重复生成':`已归档并生成 ${result.stats.created} 张卡片`);if(!result.stats.duplicate){lastProductionEdit={projectId:p.id,beforeRevision,afterRevision:p.revision};notice('本批卡片已归档并生成。',' <button class="button" data-action="production-undo">撤销本次制卡</button>');}quickSession=null;return true;
 }
 if(action==='production-save-bulk'){
  if(bulkSession.projectId!==p.id)throw Error('项目已切换，请重新打开批量编辑');const changes=[];
  for(const box of $$('[data-bulk-select]:checked')){const i=Number(box.dataset.bulkSelect),row=bulkSession.rows[i],old=bulkSession.original[i],patch={};for(const key of [...QuickCards.FIELDS.map(([key])=>key),'cardKind']){const value=key==='cardKind'?row[key]||'unit':row[key]??'',previous=key==='cardKind'?old[key]||'unit':old[key]??'';if(String(value)!==String(previous))patch[key]=value;}if(Object.keys(patch).length)changes.push({id:row.id,patch});}
  if(!changes.length){close();toast('没有需要保存的修改');return true;}const beforeRevision=bulkSession.baseRevision,result=await job({action:'batchCards',changes,expectedRevision:bulkSession.baseRevision});close();await setView('cards');toast(`已保存 ${result.stats.updated} 张卡片，排版保持原样`);lastProductionEdit={projectId:p.id,beforeRevision,afterRevision:p.revision};notice('批量修改已保存。',' <button class="button" data-action="production-undo">撤销本次批量修改</button>');return true;
 }
 if(action==='production-undo'){if(!lastProductionEdit||lastProductionEdit.projectId!==p.id)throw Error('本次操作记录已失效，请查看保存记录');await flush();if(p.revision!==lastProductionEdit.afterRevision)throw Error('后续已有新的修改，请在保存记录中核对后恢复');await job({action:'restore',revision:lastProductionEdit.beforeRevision,expectedRevision:p.revision});lastProductionEdit=null;notice('已撤销本次操作，保存记录仍保留。');await setView('cards');return true;}
 return false;
}

init();
