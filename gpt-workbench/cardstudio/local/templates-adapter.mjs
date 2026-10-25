async function changeStudio(change){
 await flush();const next=M.copy(p.studio),result=change(next);
 await job({action:'studio',studio:next,expectedStudioRevision:p.studioRevision});
 return result;
}
const templateCatalog=()=>TemplateLibrary.templateNames(p.studio,studioApi.getTemplates());
function paintTemplates(){
 const catalog=TemplateLibrary.availableTemplateCatalog(p.studio,templateCatalog(),true),hidden=new Set(p.studio.projectDesign?.hiddenTemplates||[]),saved=TemplateLibrary.creationDefault(p.studio,catalog);
 $('#templates-list').innerHTML=`<p class="muted" style="grid-column:1/-1">${saved?`唯一默认：${H(catalog[saved.templateId].name)} · ${H(saved.sourceName)}。普通新建只使用此格式；旧模板仍可手动使用。`:'尚未指定自定义默认。打开你要作为基础的那张卡，点击左侧“设为唯一默认”。'}</p>`+Object.entries(catalog).map(([id,t])=>{
  const visual=saved?.templateId===id?saved.visual:t.visual;
  const count=p.studio.cards.filter(c=>c.templateId===id).length,fields=(p.studio.fieldSchema||[]).filter(f=>!f.tpl||f.tpl===id),retired=hidden.has(id);
  return `<article class="template-item ${retired?'retired':''}"><div class="template-item-head"><span>${saved?.templateId===id?'唯一默认':retired?'已停用':'可使用'}</span><small>${count} 张卡片 · ${fields.length} 个自定义字段</small></div><label class="template-name"><span>模板名称 · 修改后自动保存</span><input data-template-name="${H(id)}" aria-label="模板名称 ${H(t.name)}" value="${H(t.name)}"></label><p>${H(t.hint||'自由卡牌模板')}</p>${visual?`<p>已保存完整格式 · ${Object.keys(visual.layout||{}).length} 个模块 · ${(visual.extraElements||[]).length} 个自由图层</p>`:''}<div class="template-fields">${fields.map(f=>`<button data-action="field-edit" data-id="${H(f.id)}" title="编辑 ${H(f.label)}">${H(f.label||'未命名字段')}${!f.tpl?' · 通用':''}</button>`).join('')||'<span>暂未添加自定义字段</span>'}</div><div class="template-actions">${!retired?`<button class="button primary" data-action="template-use" data-id="${H(id)}">新建卡片</button>`:''}<button class="button" data-action="template-fields" data-id="${H(id)}">管理字段</button><button class="button" data-action="template-clone" data-id="${H(id)}">复制模板</button><button class="button" data-action="template-export" data-id="${H(id)}">导出完整模板</button>${!['unit','basic-unit'].includes(id)&&saved?.templateId!==id?`<button class="button quiet" data-action="template-retire" data-id="${H(id)}" data-retired="${retired?'false':'true'}">${retired?'恢复使用':'停用'}</button>`:''}</div><p class="template-note">${retired?'已有卡片仍保留原模板、字段和值。':'拖拽完成后，可在编辑器直接导出完整模板。'}</p></article>`;
 }).join('');
 for(const el of $$('[data-template-name]'))el.onchange=async()=>{try{await changeStudio(s=>TemplateLibrary.renameTemplate(s,catalog,el.dataset.templateName,el.value));toast('模板名称已保存');}catch(e){error(e);}};
}
function cloneTemplateDialog(id='basic-unit'){
 const catalog=TemplateLibrary.availableTemplateCatalog(p.studio,templateCatalog());dialog('新建模板',`<label><span>模板名称</span><input id="template-new-name" value="${H((catalog[id]?.name||'模板')+'副本')}"></label><label><span>以哪份模板为起点</span><select id="template-base">${Object.entries(catalog).map(([key,t])=>`<option value="${H(key)}" ${id===key?'selected':''}>${H(t.name||'未命名模板')}</option>`).join('')}</select></label><p>复制该模板已保存的模块、自由图层、外观、条件和自定义字段。保存刚拖拽的最新布局，请在编辑器导出完整模板。</p>`,`<button class="button" data-action="close">取消</button><button class="button primary" data-action="template-create">创建模板</button>`);
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
 if(action==='template-export'){await templateExportDialog(el.dataset.id);return true;}
 if(action==='template-download'){await exportCompleteTemplate(el.dataset.id);return true;}
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
 if(!file)return;if(file.size>TemplateLibrary.MAX_TEMPLATE_BYTES)throw new Error('模板文件超过 24 MB，请压缩素材原图');
 await flush();const target=p.id,revision=p.studioRevision,raw=JSON.parse(await file.text());
 // Validate on a throwaway copy before presenting an actionable import.
 TemplateLibrary.importTemplate(M.copy(p.studio),raw);
 const full=raw.version===2,empty=!p.studio.cards.length;
 dialog('导入完整模板',`<p><strong>${H(raw.template.name||'未命名模板')}</strong></p><div class="template-pack-summary"><span>${Object.keys(raw.layout||{}).length} 个模块</span><span>${raw.visual?.extraElements?.length||0} 个自由图层</span><span>${raw.assets?.length||0} 份图片素材</span><span>${raw.fields?.length||0} 个自定义字段</span></div><p>添加为新模板，已有卡片和模板继续保留。自由文字按原样保留，绑定文字随新卡内容变化。</p>${full?`<label class="checkline"><input id="template-import-default" type="checkbox" checked>设为以后新建卡片的唯一默认</label><label class="checkline"><input id="template-import-settings" type="checkbox" ${empty?'checked':''}>应用此模板的出血、字体排版规则和字段标签</label><p class="muted">出血和字段标签属于整个项目；已有卡片时默认保留当前项目设置。</p>`:'<p class="muted">这是旧版模板文件；其中没有打包图片和自由图层，按原文件已有内容恢复。</p>'}<label class="checkline"><input id="template-import-open" type="checkbox" ${empty?'checked':''}>导入后新建一张空白卡，直接查看布局</label>`,`<button class="button" data-action="close">取消</button><button class="button primary" id="confirm-template-import">确认导入模板</button>`);
 $('#confirm-template-import').onclick=async()=>{const button=$('#confirm-template-import');button.disabled=true;try{
  if(p.id!==target||p.studioRevision!==revision)throw new Error('项目在预览后已有变化，请重新导入模板');
  const options={makeDefault:!!$('#template-import-default')?.checked,applyProjectSettings:!!$('#template-import-settings')?.checked},open=$('#template-import-open').checked;
  const id=await changeStudio(s=>TemplateLibrary.importTemplate(s,raw,options));close();
  if(open){const cardId=studioApi.createCard(id,'');await flush();await setView('studio');studioApi.openCard(cardId);}else await setView('templates');
  toast(options.makeDefault?'完整模板已导入并设为唯一默认':'模板已导入，可直接用于新建卡片');
 }catch(e){dialogError(e);}finally{if(button.isConnected)button.disabled=false;}};
}
async function templateExportDialog(id,cardId=''){
 await flush();const catalog=templateCatalog(),current=p.studio.cards.find(c=>c.id===(cardId||p.studio.selected)&&c.templateId===id);if(!catalog[id])throw new Error('模板已不存在');
 const options=[['saved','已保存的模板格式'],...(current?[[current.id,'当前编辑的完整布局']]:[])];
 dialog('导出完整模板',`<label><span>模板名称</span><input id="template-pack-name" value="${H(catalog[id].name)}"></label><label><span>导出哪份排版</span><select id="template-pack-source">${options.map(([key,label])=>`<option value="${H(key)}" ${key===(cardId?current?.id:'saved')?'selected':''}>${H(label)}</option>`).join('')}</select></label><p>一个文件保存这套模板的模块坐标、字体与笔画、自由图层、图层顺序、图片原图、缩放、透明度、字段、条件与出血设置。</p><p class="muted">卡名、效果、费用和身材由新卡重新填写。自由文字及字段绑定保留；以后全新打开卡递，点击“导入模板”即可复用。</p>`,`<button class="button" data-action="close">关闭</button><button class="button primary" data-action="template-download" data-id="${H(id)}" data-project="${H(p.id)}">生成模板文件</button>`);
}
async function exportCompleteTemplate(id){
 if(p.id!==$('[data-action="template-download"]').dataset.project)throw new Error('项目已切换，请重新导出');
 const name=$('#template-pack-name').value,source=$('#template-pack-source').value;await flush();
 const pack=TemplateLibrary.templatePackage(p.studio,templateCatalog(),id,{name,cardId:source==='saved'?'':source});
 download(pack,`卡递模板-${(name||'未命名模板').replace(/[\\/:*?"<>|]/g,'-').slice(0,70)}.kadi-template.json`);toast('完整模板文件已生成，包含本套模板使用的图片原图');
}
function setupTemplateControls(){
 $('#studio-host').addEventListener('kadi-template-action',event=>{
  const detail=event.detail||{};if(detail.action==='import'){$('#template-file').value='';$('#template-file').click();return;}
  const card=p?.studio.cards.find(c=>c.id===detail.cardId);if(card)templateExportDialog(card.templateId,card.id).catch(error);
 });
}
