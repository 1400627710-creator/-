async function changeStudio(change){
 await flush();const next=M.copy(p.studio),result=change(next);
 await job({action:'studio',studio:next,expectedStudioRevision:p.studioRevision});
 return result;
}
const templateCatalog=()=>TemplateLibrary.templateNames(p.studio,studioApi.getTemplates());
function paintTemplates(){
 const catalog=templateCatalog(),hidden=new Set(p.studio.projectDesign?.hiddenTemplates||[]);
 $('#templates-list').innerHTML=Object.entries(catalog).map(([id,t])=>{
  const count=p.studio.cards.filter(c=>c.templateId===id).length,fields=(p.studio.fieldSchema||[]).filter(f=>!f.tpl||f.tpl===id),retired=hidden.has(id);
  return `<article class="template-item ${retired?'retired':''}"><div class="template-item-head"><span>${retired?'已停用':'可使用'}</span><small>${count} 张卡片 · ${fields.length} 个自定义字段</small></div><label class="template-name"><span>模板名称 · 修改后自动保存</span><input data-template-name="${H(id)}" aria-label="模板名称 ${H(t.name)}" value="${H(t.name)}"></label><p>${H(t.hint||'自由卡牌模板')}</p><div class="template-fields">${fields.map(f=>`<button data-action="field-edit" data-id="${H(f.id)}" title="编辑 ${H(f.label)}">${H(f.label||'未命名字段')}${!f.tpl?' · 通用':''}</button>`).join('')||'<span>暂未添加自定义字段</span>'}</div><div class="template-actions">${!retired?`<button class="button primary" data-action="template-use" data-id="${H(id)}">新建卡片</button>`:''}<button class="button" data-action="template-fields" data-id="${H(id)}">管理字段</button><button class="button" data-action="template-clone" data-id="${H(id)}">复制模板</button><button class="button" data-action="template-export" data-id="${H(id)}">导出</button>${id!=='unit'?`<button class="button quiet" data-action="template-retire" data-id="${H(id)}" data-retired="${retired?'false':'true'}">${retired?'恢复使用':'停用'}</button>`:''}</div><p class="template-note">${retired?'已有卡片仍保留原模板、字段和值。':'在卡片编辑器的布局模式中调整可复用版式。'}</p></article>`;
 }).join('');
 for(const el of $$('[data-template-name]'))el.onchange=async()=>{try{await changeStudio(s=>TemplateLibrary.renameTemplate(s,catalog,el.dataset.templateName,el.value));toast('模板名称已保存');}catch(e){error(e);}};
}
function cloneTemplateDialog(id='unit'){
 const catalog=templateCatalog();dialog('新建模板',`<label><span>模板名称</span><input id="template-new-name" value="${H((catalog[id]?.name||'模板')+'副本')}"></label><label><span>以哪份模板为起点</span><select id="template-base">${Object.entries(catalog).map(([key,t])=>`<option value="${H(key)}" ${id===key?'selected':''}>${H(t.name||'未命名模板')}</option>`).join('')}</select></label><p>复制标准模块版式、条件和该模板的自定义字段。自由图层仍属于各卡片。</p>`,`<button class="button" data-action="close">取消</button><button class="button primary" data-action="template-create">创建模板</button>`);
}
function fieldsDialog(templateId){
 const catalog=templateCatalog(),fields=(p.studio.fieldSchema||[]).filter(f=>!f.tpl||f.tpl===templateId);
 dialog('字段 · '+(catalog[templateId]?.name||'通用'),`<p>通用字段适用于全部模板；专用字段只出现在所选模板。切换模板时，旧字段的值会保留。</p><div class="field-list">${fields.map(f=>`<div><strong>${H(f.label||'未命名字段')}</strong><span>${H(({text:'文本',number:'数字',boolean:'是/否',select:'选项',cardRef:'卡牌引用'})[f.type]||f.type)} · ${f.tpl?'模板专用':'全部模板'}${f.required?' · 必填':''}</span><button class="button" data-action="field-edit" data-id="${H(f.id)}">编辑</button></div>`).join('')||'<p>暂未定义自定义字段。</p>'}</div>`,`<button class="button" data-action="close">完成</button><button class="button primary" data-action="field-new" data-template="${H(templateId)}">添加字段</button>`,true);
}
function fieldDialog(fieldId,templateId=''){
 const f=(p.studio.fieldSchema||[]).find(f=>f.id===fieldId)||{id:'',label:'',type:'text',tpl:templateId,options:[],defaultValue:'',required:false,min:null,max:null},catalog=templateCatalog();
 dialog(f.id?'编辑字段':'添加字段',`<div class="form-row"><label><span>字段名称</span><input id="field-label" value="${H(f.label)}"></label><label><span>字段类型</span><select id="field-type">${[['text','文本'],['number','数字'],['select','选项'],['boolean','是/否'],['cardRef','卡牌引用']].map(([id,label])=>`<option value="${id}" ${f.type===id?'selected':''}>${label}</option>`).join('')}</select></label></div><label><span>适用模板</span><select id="field-scope"><option value="">全部模板 · 通用字段</option>${Object.entries(catalog).map(([id,t])=>`<option value="${H(id)}" ${f.tpl===id?'selected':''}>${H(t.name||'未命名模板')}</option>`).join('')}</select></label><div class="form-row"><label><span>默认值 · 只补充缺少的值</span><input id="field-default" value="${H(f.defaultValue)}"></label><label><span>选项 · 仅选项类型使用，用逗号分隔</span><input id="field-options" value="${H((f.options||[]).join(','))}"></label></div><div class="form-row"><label><span>最小值 · 仅数字类型使用</span><input id="field-min" type="number" step="any" value="${H(f.min??'')}"></label><label><span>最大值 · 仅数字类型使用</span><input id="field-max" type="number" step="any" value="${H(f.max??'')}"></label></div><label class="checkline"><input id="field-required" type="checkbox" ${f.required?'checked':''}>必填</label><p>名称可任意修改，稳定编号与制卡映射会保留。移除字段结构时，已有值仍留在卡牌备份中。</p>`,`${f.id?`<button class="button quiet" data-action="field-delete" data-id="${H(f.id)}">移除字段结构</button>`:''}<button class="button" data-action="close">取消</button><button class="button primary" data-action="field-save" data-id="${H(f.id)}">保存字段</button>`);
}
async function templateAction(action,el){
 if(action==='template-new'||action==='template-clone'){cloneTemplateDialog(el.dataset.id||'unit');return true;}
 if(action==='template-create'){const base=$('#template-base').value,name=$('#template-new-name').value;await changeStudio(s=>TemplateLibrary.copyTemplate(s,templateCatalog(),base,name));close();paintTemplates();toast('模板已创建');return true;}
 if(action==='template-use'){newCardDialog(el.dataset.id);return true;}
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
