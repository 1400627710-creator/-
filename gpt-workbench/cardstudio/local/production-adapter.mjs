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
