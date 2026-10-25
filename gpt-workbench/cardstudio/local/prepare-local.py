from pathlib import Path
import re,json

root=Path(__file__).resolve().parents[1]
s=(root/'ui/main.mjs').read_text()
s=s.replace("import {uiSurface,isRpcResponse} from '../lib/ui-surface.mjs';", "import {localService,localMeta} from './local-service.mjs';")
s=s.replace("from './engines.mjs'", "from '../ui/engines.mjs'")
s="import {installAssistant} from './assistant-panel.mjs';\n"+s
s="import {recoveryCache} from './recovery-cache.mjs';\n"+s
s="import {installGlossary} from '../../shared/glossary-ui.mjs';\n"+s
s="import * as QuickCards from '../lib/quick-cards.mjs';\n"+s
s="import * as TemplateLibrary from '../lib/template-library.mjs';\n"+s
s="import {installExchange} from '../../shared/exchange-ui.mjs';\nimport {envelope as exchangeEnvelope} from '../../shared/exchange.mjs';\nimport {cardsEnvelope} from '../../shared/card-envelope.mjs';\n"+s
s=s.replace("const surface=uiSurface(document.querySelector('meta[name=\"cardstudio-surface\"]')?.content,window.parent!==window);", "const surface='local';")
s=s.replace("const $=", "let assistantController=null;\nconst $=")
s=s.replace("function paint(){if(!p)return;", "function paint(){if(!p)return;assistantController?.projectChanged();")
s=s.replace("embedded=surface==='mcp'", 'embedded=false')

def replace_between(start,end,value):
 global s
 i=s.index(start);j=s.index(end,i);s=s[:i]+value+'\n'+s[j:]

replace_between('const requests=new Map;', 'function toast(', '')
replace_between('async function raw(a)', 'function job(', 'async function raw(a){return localService(a);}')
replace_between('async function cache(', 'function remember()', "async function cache(operation,payload){const id=p?.id;if(!id)return;try{return await recoveryCache(id,operation,payload);}catch(e){if(operation==='put')notice('恢复缓存未完成，请先导出备份再关闭窗口');}}")
s=s.replace("if(p)cache('put',", "if(p)cache('put',")
s=s.replace("studio:dirtyStudio,at:new Date().toISOString()});status('修改待保存')", "studio:dirtyStudio,at:new Date().toISOString()}).catch(()=>{});status('修改待保存')")
replace_between('function inputDialog()', 'function recordsFromText(', (root/'local/ui-extra.mjs').read_text())
replace_between('function demoRead()', 'async function act(', '')
replace_between("case 'copy-prompt':", "case 'open-draft':", "case 'copy-prompt':await copyLocalPrompt();break;case 'import-gpt-result':openGptResultDialog();break;case 'preview-gpt-result':await previewGptResult();break;")
replace_between("if(embedded&&hostReady)rpc('ui/update-model-context'", 'localStorage.setItem(', '')
s=s.replace('localStorage.', 'localMeta.')
s=s.replace("demo?'演示空间 · 仅本机数据':'私人项目 · 自动保存'", "'本机项目 · 自动保存'")
s=s.replace("status(demo?'演示 · 本机保存':'已保存')", "status('已保存到本机')")
s=s.replace('服务器', '本机')
s=s.replace('保存版本用于恢复编辑状态；故事时间版本仍在档案中单独管理。','本机保留最近 30 次保存；故事时间版本仍在档案中单独管理。')
s=s.replace('演示空间仅保留当前数据，私人项目提供保存历史。','这里显示最近 30 次本机保存。')
replace_between("$('#help-btn').onclick=", "$('#demo-btn').onclick=", "$('#help-btn').onclick=()=>dialog('卡递 · 本地文件版','<p>双击 HTML 即可打开，无需安装、无需登录。</p><p>资料自动保存到当前浏览器的本机数据库。请尽量保持文件位置和浏览器不变，并定期用“备份与迁移”导出完整统一备份。清理浏览器数据会清除本机项目。</p><p>导入旧档案、卡递工程、表格或统一备份后，核对预览再确认。档案与卡片的字段映射、故事时间版本、素材和排版都会保留。</p><p>双击画布添加文字；字段标签支持任意改名；打印设置中可调整出血。项目检查可一键处理能够自动修复的问题。</p><p>GPT 整理：档案资料右侧提供卡递助手。在 GPT 内打开工作台，可直接交给当前对话整理与批量制卡；独立本地文件提供离线格式整理，仍可使用旧版 JSON 接力。资料保存在当前浏览器，迁移时请导出完整统一备份。</p>');")
replace_between("$('#demo-btn').onclick=", "$('#modal').addEventListener", "$('#demo-btn').onclick=()=>location.reload();")
replace_between('async function init(){', '\ninit();', """async function init(){try{await list();appReady=true;status('已保存到本机');}catch(e){$('#connection-screen').hidden=false;$('#connection-error').textContent=e.message;status('本机保存不可用');}setInterval(()=>{if(appReady&&document.visibilityState==='visible')refresh().catch(()=>status('本机读取暂不可用'))},5000);}""")
s=s.replace("await list();appReady=true", "await list();setupExchange();setupAssistant();setupTemplateControls();appReady=true")
s=s.replace("activeView='archive';paint();await setView('archive');", "activeView='cards';paint();await setView('cards');")
s=s.replace("async function act(action,el){switch(action){", "async function act(action,el){if(action.startsWith('glossary-'))return glossaryController.action(action,el);if(await assistantAction(action,el))return;if(await productionAction(action,el))return;if(await templateAction(action,el))return;if(action.startsWith('exchange-'))return exchangeController.action(action);if(action==='new-card'){await newCardDialog();return;}if(action==='create-card'){await createCard();return;}switch(action){")
s=s.replace("async function openDraft(id){await flush();const r=await raw({action:'draft',draftId:id});showDraft(r.draft);}", "async function openDraft(id){await flush();const r=await raw({action:'draft',draftId:id});if(r.draft.kind==='exchange')return exchangeController.receive(r.draft.payload);showDraft(r.draft);}")
s=s.replace("if(payload.format==='cardstudio-unified')", "if(payload.format==='cardstudio-template'){await receiveTemplate(file);return;}if(payload.schema==='cardstudio-glossary-v1'){close();await glossaryController.receive(payload);return;}if(payload.format==='cardstudio-archive-exchange'){await exchangeController.receive(payload);return;}if(payload.format==='cardstudio-unified')")
s=s.replace("name:['姓名','名称','卡名','技能名称']", "unitType:['种族','兵种','类型','族群'],rarity:['稀有度'],rulesKeywords:['规则关键词'],name:['姓名','名称','卡名','技能名称']")
s=s.replace("$('#card-search').oninput=paintCards;", "$('#card-search').oninput=paintCards;$('#new-card-btn').onclick=()=>newCardDialog().catch(error);")
s=s.replace("'<button class=\"button primary\" data-action=\"generate\">从档案批量制卡</button>'", "'<button class=\"button primary\" data-action=\"new-card\">新建卡片</button> <button class=\"button\" data-action=\"generate\">从档案批量制卡</button>'")
s=s.replace('\ninit();', '\n'+(root/'local/exchange-adapter.mjs').read_text()+'\n'+(root/'local/templates-adapter.mjs').read_text()+'\n'+(root/'local/production-adapter.mjs').read_text()+'\n'+(root/'local/assistant-adapter.mjs').read_text()+'\ninit();')
s=s.replace("if(activeView==='cards')paintCards();", "if(activeView==='templates')paintTemplates();if(activeView==='cards')paintCards();")
s=s.replace("templateId:'unit',map:[]","templateId:TemplateLibrary.defaultTemplateId(p.studio,templateCatalog()),map:[]")
s=s.replace("const viewCopy={archive:", "const viewCopy={templates:['版式和字段，按需复用','模板与字段','修改名称、管理适用字段，或用模板新建一张卡片。'],archive:")
s=s.replace("M.TARGETS.map(([key,label])=>", "[...M.TARGETS.map(([key,label])=>[key,p.studio.projectDesign?.fieldLabels?.[key]??label]),...(p.studio.fieldSchema||[]).filter(f=>!f.tpl||f.tpl===$('#binding-template').value).map(f=>['custom:'+f.key,f.label])].map(([key,label])=>")
s=s.replace("(aliases[key]||[]).includes(f.name)", "(aliases[key]||[label]).includes(f.name)")
s=s.replace("$('#binding-type').onchange=()=>mappingRows({...b,typeId:$('#binding-type').value,map:[]});", "$('#binding-type').onchange=()=>mappingRows({...b,typeId:$('#binding-type').value,map:[]});$('#binding-template').onchange=()=>mappingRows({...b,map:[]});")
s=s.replace("$('#binding-template').value=b.templateId;", '$(\'#binding-template\').innerHTML=Object.entries(TemplateLibrary.availableTemplateCatalog(p.studio,templateCatalog())).filter(([id])=>!(p.studio.projectDesign?.hiddenTemplates||[]).includes(id)||id===b.templateId).map(([id,t])=>`<option value="${H(id)}">${H(t.name||\'未命名模板\')}</option>`).join(\'\');$(\'#binding-template\').value=b.templateId;')
s=s.replace("$('#card-search').oninput=paintCards;", "$('#template-file').onchange=e=>receiveTemplate(e.target.files[0]).catch(error);$('#card-search').oninput=paintCards;")
assert "fetch('/api/service'" not in s and "rpc(" not in s
(root/'local/main.mjs').write_text(s)

html=(root/'ui/index.html').read_text().replace('content="mcp"','content="local"').replace('统一私人版','本地版').replace('卡递 · 统一卡片工作台','卡递 · 本地工作台')
start=html.index('<div id="connection-screen"');end=html.index('\n</main>',start)
html=html[:start]+'''<div id="connection-screen" class="connection-screen" hidden><div class="welcome-icon">▤</div><h2 id="connection-title">暂时无法保存到本机</h2><p id="connection-description">请使用 Chrome 或 Edge 的常规窗口打开此文件，并允许浏览器保存本地数据。<br>关闭其他卡递本地窗口后，也可以重新尝试。</p><button class="button primary" id="demo-btn">重新尝试</button><small id="connection-error"></small></div>'''+html[end:]
csp="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; worker-src blob:; object-src 'none'; base-uri 'none'"
html=html.replace('<meta charset="utf-8">','<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+csp+'">')
html=html.replace('<small>ARCHIVE × STUDIO</small>','<small>本地卡牌工作台</small>')
html=html.replace('<button class="button quiet" id="history-btn">','<button class="button" id="exchange-btn">与车卡机互通</button><button class="button quiet" id="history-btn">')
html=html.replace('<button id="generate-btn"', '<button class="button primary" data-action="production-quick">✦ 快速制卡</button><button class="button" data-action="production-bulk">批量编辑</button><button class="button" data-action="template-import">导入模板</button><button id="new-card-btn" class="button">＋ 新建卡片</button><button id="generate-btn"')
html=html.replace('<button data-view="links"', '<button data-view="templates" class="nav-button"><span class="nav-icon">◇</span> 模板与字段</button><button data-view="links"')
html=html.replace('<section id="links-view"', '<section id="templates-view" class="view"><div class="section-toolbar"><p class="muted">完整模板文件包含布局、自由图层与图片，导入后可设为唯一默认。</p><div><button class="button primary" data-action="template-import">导入模板</button><button class="button" data-action="template-new">＋ 新建模板</button></div></div><div id="templates-list" class="template-grid"></div></section><section id="links-view"')
html=html.replace('<script>/*APP*/</script>', '<input id="template-file" type="file" accept=".json,.kadi-template.json,application/json" hidden><script>/*APP*/</script>')
html=html.replace('</nav>', '<button id="glossary-btn" data-action="glossary-open" class="nav-button"><span class="nav-icon">◈</span> 词条库</button></nav>')
(root/'local/index.html').write_text(html)
print('Local UI source prepared; cloud calls and sign-in removed from this build.')
