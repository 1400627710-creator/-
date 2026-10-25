from pathlib import Path
import re,json
root=Path(__file__).resolve().parents[1]
J=lambda x:json.dumps(x,ensure_ascii=False)
bridge=r'''
function environment(host,bodyHtml,css,bodyClass='') {
 const realWindow=globalThis.window,realDocument=globalThis.document;
 const shadow=host.attachShadow({mode:'open'});
 shadow.innerHTML='<style>'+css+'</style><div class="legacy-body '+bodyClass+'">'+bodyHtml+'</div>';
 const body=shadow.querySelector('.legacy-body'),memory=new Map;
 const document=new Proxy(realDocument,{get(t,k){if(k==='body'||k==='documentElement')return body;if(k==='activeElement')return shadow.activeElement;if(k==='modelContext')return undefined;if(k==='querySelector')return s=>s==='body'?body:shadow.querySelector(s);if(k==='querySelectorAll')return s=>shadow.querySelectorAll(s);if(k==='getElementById')return id=>shadow.getElementById(id);if(k==='addEventListener'||k==='removeEventListener')return shadow[k].bind(shadow);if(k==='elementFromPoint')return shadow.elementFromPoint.bind(shadow);const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v;}});
 const own={};const window=new Proxy(realWindow,{get(t,k){if(k==='document')return document;if(k==='addEventListener')return(type,fn,options)=>{if(type==='keydown')shadow.addEventListener(type,fn,options);else t.addEventListener(type,fn,options);};if(k in own)return own[k];const v=Reflect.get(t,k,t);return typeof v==='function'&&typeof k==='string'&&!/^[A-Z]/.test(k)?v.bind(t):v;},set(t,k,v){own[k]=v;return true;}});
 const localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
 return {shadow,body,document,window,localStorage};
}
'''
out="import {ArchiveCore} from '../lib/archive-core.mjs';\n"+bridge
# archive
css=(root/'legacy/archive/style.css').read_text().replace(':root',':host')
css=re.sub(r'(?<![\w.#-])body(?![\w-])','.legacy-body',css)
css+='\n:host{display:block;height:100%;min-width:0;--bg:#f7f6fa;--paper:#fff;--ink:#353044;--muted:#92879d;--line:#e8e3ed;--soft:#f0ecf7;--primary:#7461b9;--on-primary:#fff;color-scheme:light}.legacy-body{height:100%;background:transparent;overflow:hidden}.topbar{height:52px;min-height:52px}.brand{display:none}.top-actions{margin-left:auto;flex-wrap:wrap}.app-shell{height:calc(100% - 52px);grid-template-columns:210px minmax(0,1fr)}.sidebar{min-width:0;display:flex}.library-item{overflow-wrap:anywhere}.workspace{min-width:0;overflow:auto;padding:14px}.main{min-width:0}.work-hint{display:none}#novel-archive-app{height:100%;min-height:0;display:flex;flex-direction:column}.app-shell{flex:1;height:auto;min-height:0}@media(max-width:800px){.app-shell{grid-template-columns:165px minmax(0,1fr)}}@media(max-width:560px){.app-shell{grid-template-columns:minmax(0,1fr)}.sidebar{display:none}.app-shell.show-sidebar .sidebar{display:flex}.brand{display:flex}.brand>div{display:none}.top-actions{gap:4px}.topbar{padding:6px}.top-actions button{font-size:11px}}'
body='<div id="novel-archive-app"></div>'
out+='\nexport function mountArchive(host,initial,onSave,onDirty){\nconst {document,window,localStorage,shadow}=environment(host,'+J(body)+','+J(css)+');\n'
for name in ['importer.js','png.js']:
 s=(root/'legacy/archive'/name).read_text();s=re.sub(r'^import.*?;\n','',s,flags=re.M);s=s.replace('export const ','const ');out+=s+'\n'
out+='''const ArchiveStorage={Store:class {constructor(){this.mode='cloud';this.lastSavedRevision=initial.revision;}async open(){}async load(){return initial;}async save(s){await onSave(s);this.lastSavedRevision=s.revision;}}};\n'''
s=(root/'legacy/archive/app.js').read_text()
s=s.replace("dirty = true; saveStatus", "onDirty?.(C.copy(state));dirty = true; saveStatus")
s=s.replace("'已保存到此浏览器'","'已保存到统一项目'").replace("'已准备 · 此浏览器保存'","'统一项目 · 自动保存'")
s=s.replace("'已载入浏览器档案'","'已载入统一项目'")
s=s.replace("window.NovelArchive={getState:","window.NovelArchive={openArchive:(id,versionId)=>{const p=commit(s=>C.openPanel(s,id,versionId));view='workspace';renderAll();revealPanel(p.id);},replaceState:next=>{clearTimeout(saveTimer);state=C.validateState(next);dirty=false;undoStack.length=0;redoStack.length=0;renderAll();},getState:")
start=s.index("    try{broadcast=new BroadcastChannel")
end=s.index('    await registerHostTools();',start)
s=s[:start]+s[end:]
s=s.replace('  init();','  window.archiveReady=init();')
out+=s+'\nreturn {...window.NovelArchive,ready:window.archiveReady,shadow};\n}\n'
# studio
html=(root/'legacy/studio/index.html').read_text()
body=re.search(r'<body[^>]*>([\s\S]*?)</body>',html).group(1)
body=re.sub(r'<script[\s\S]*?</script>','',body)
body=body.replace('特殊效果的统一定义、颜色与检索仓库 · 与 Community 共用 cardstudio-glossary-v1','词条定义、颜色和检索 · 与车卡机共用词条格式')
body=body.replace('<b>CardStudio</b>','<b>卡递</b>').replace('Card design workspace','卡牌工作台').replace('Beta 10','本地 1.4.1')
body=re.sub(r'(<button[^>]*id="setDefaultCard"[^>]*>.*?</button>)',r'\1<button class="default-card-control" id="exportTemplatePack">导出完整模板</button><button class="default-card-control" id="importTemplatePack">导入模板</button>',body,count=1)
css='\n'.join((root/'legacy/studio'/name).read_text() for name in ['styles.css','workspace-ui.css','public-repository.css'])
css=css.replace(':root',':host');css=re.sub(r'(?<![\w.#-])body(?![\w-])','.legacy-body',css);css=re.sub(r'(^|[},\s])html(?=[\s,{.#:])',r'\1.legacy-body',css)
css+='\n:host{display:block;height:100%;min-width:0}.legacy-body{height:100%;overflow:hidden}.legacy-body.workspace-v9{height:100%;min-height:0}#publishSharedGlossary,#receiveCommunityTerms,#openCommunityEdition,#downloadCommunityEdition,#openPublicTerms,#openPublicAssets,#openAiSettings,#openAiWorkbench,#openRecovery,#projectImport,#importBtn,.ai-bridge{display:none!important}.app-header .version-badge{font-size:11px}.project-name{pointer-events:none}.top-menu{z-index:160}.canvas-viewport{min-height:240px}'
out+='\nexport function mountStudio(host,initial,onSave,onDirty){\nconst {document,window,localStorage,shadow}=environment(host,'+J(body)+','+J(css)+',"workspace-v9");\nconst crypto={randomUUID:()=>globalThis.crypto?.randomUUID?.()||"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==="x"?r:(r&3|8)).toString(16);})};const setImmediate=(fn,...args)=>globalThis.setTimeout(fn,0,...args),clearImmediate=id=>globalThis.clearTimeout(id);window.setImmediate=setImmediate;window.clearImmediate=clearImmediate;const self=window;const module=undefined,exports=undefined,define=undefined;\n'
for name in ['papaparse.min.js','xlsx.full.min.js','html-to-image.js','jspdf.umd.min.js','jszip.min.js']:
 out+='\n'+(root/'legacy/vendor'/name).read_text()+'\n'
out+='\nwindow.Papa=window.Papa||globalThis.Papa;window.XLSX=XLSX;window.htmlToImage=globalThis.htmlToImage;window.jspdf=globalThis.jspdf;window.JSZip=globalThis.JSZip||window.JSZip;const JSZip=window.JSZip,Papa=window.Papa,htmlToImage=window.htmlToImage;\n'
for name in ['layout-core.js','edit-core.js','image-layers.js','glossary-format.js','glossary-bridge.js']:
 source=(root/'legacy/studio'/name).read_text()
 if name=='glossary-bridge.js':
  start=source.index('  async function refresh(){');end=source.index('  window.previewSharedGlossary',start)
  source=source[:start]+"  async function refresh(){$('#sharedGlossaryStatus').textContent='本机词条库 · 可从外层词条库与车卡机手动互传；不需要联网或发布。';}\n"+source[end:]
 out+=source+'\n'
s=(root/'legacy/studio/app.js').read_text()
# The unified project may intentionally contain no cards. Load its settings and
# assets as well, instead of retaining the previous project's engine state.
s=s.replace('if(!Array.isArray(p.cards)||!p.cards.length)throw new Error("项目中没有卡牌，当前工程保持不变");','if(!Array.isArray(p.cards))throw new Error("卡牌列表无效");')
s=s.replace('if(!cards.length)throw new Error("项目中没有卡牌");','')
s=s.replace('p.selected:cards[0].id;if(p.aiStyle){aiStyle=p.aiStyle;$("#aiStyle").value=p.aiStyle}if(p.projectName)projectName=p.projectName;if(p.printSettings)printSettings=Object.assign(', 'p.selected:(cards[0]&&cards[0].id||"");aiStyle=p.aiStyle||"";$("#aiStyle").value=aiStyle;projectName=p.projectName||"";printSettings=Object.assign(')
start=s.rfind('Promise.all([dbGet(PRIMARY_DB_KEY)')
assert start>0
s=s[:start]+'''bootstrapping=false;dbReady=false;
scheduleDbSave=function(){};
flushLocalPersist=function(){clearTimeout(persistTimer);persistTimer=null;flushPendingTemplateEdits();var p=projectPayload(true);onSave(p).then(function(){setSaveIndicator('saved','统一项目已保存')}).catch(function(e){setSaveIndicator('error','保存未完成');setStatus(e.message)});};
persist=function(){if(bootstrapping)return;mutationPending=false;flushPendingTemplateEdits();onDirty?.(projectPayload(true));setSaveIndicator('dirty');clearTimeout(persistTimer);persistTimer=setTimeout(flushLocalPersist,350);};
flushPersistNow=flushLocalPersist;
function replaceUnifiedStudio(p,options){
  bootstrapping=true;clearTimeout(persistTimer);persistTimer=null;
  try{
    if(!options||options.resetHistory!==false){
      history=[];future=[];mutationPending=false;assetBinaryCache={};
      inlineFieldSession=null;inlineCanvasSession=null;fieldRenameSession=null;
      pendingTemplateEditKeys={};pendingTemplateImpact=null;dataSelection={};
      lastRepairUndo=null;lastRepairReport=null;lastPreflightIssues=[];deferredPreflightRepairs.clear();
      document.querySelectorAll('.modal-backdrop,#fieldRenamePopover').forEach(function(el){el.hidden=true;});
    }
    applyImportedProject(p);
    if(cards.length)renderAll();else{$('#cardList').innerHTML='';$('#preview').innerHTML='';updateHistoryButtons();}
  }finally{bootstrapping=false;}
}
replaceUnifiedStudio(initial);
$('#exportTemplatePack').onclick=function(){if(current())host.dispatchEvent(new CustomEvent('kadi-template-action',{detail:{action:'export',cardId:current().id}}));};
$('#importTemplatePack').onclick=function(){host.dispatchEvent(new CustomEvent('kadi-template-action',{detail:{action:'import'}}));};
window.UnifiedStudio={getState:function(){return projectPayload(true)},replaceState:replaceUnifiedStudio,openCard:function(id){selected=id;layoutEditing=false;renderAll();},exportProject:buildProjectArchive,thumbnail:function(id){var c=cards.find(function(c){return c.id===id});if(!c)return '';renderExport(c);return $('#exportCard').innerHTML;},flush:function(){if(preflightRepairBusy)throw new Error('项目检查修复正在进行，请完成后再切换项目');if(persistTimer)flushLocalPersist();},css:STUDIO_CSS};
})();
'''
s=s.replace('window.UnifiedStudio={getState:', 'window.UnifiedStudio={getTemplates:function(){return clone(TEMPLATES)},createCard:function(tid,name){tid=tid||KadiLayout.defaultTemplateId({projectDesign:projectDesign},TEMPLATES);if(!TEMPLATES[tid])throw Error("找不到这份模板");recordHistory();var c=normalizeCard(makeCard(tid));if(name)c.name=name;cards.push(c);selected=c.id;renderAll();persist();return c.id;},getState:')
s=s.replace('css:STUDIO_CSS','css:'+J(css))
out+=s+'\nreturn {...window.UnifiedStudio,shadow,zip:window.JSZip,xlsx:XLSX,papa:window.Papa};\n}\n'
(root/'ui/engines.mjs').write_text(out)
print('Generated legacy engines:',len(out),'characters')
