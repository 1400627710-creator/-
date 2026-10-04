import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('index.html','utf8');
const glossaryJs=fs.readFileSync('glossary-data.js','utf8');
const appJs=fs.readFileSync('app.js','utf8');

class ClassList{
  constructor(){this.s=new Set()}
  add(...xs){xs.forEach(x=>this.s.add(x))}
  remove(...xs){xs.forEach(x=>this.s.delete(x))}
  contains(x){return this.s.has(x)}
  toggle(x,force){if(force===true){this.s.add(x);return true}if(force===false){this.s.delete(x);return false}if(this.s.has(x)){this.s.delete(x);return false}this.s.add(x);return true}
}
class El{
  constructor(tag='div',id=''){this.tagName=tag.toUpperCase();this.id=id;this.hidden=false;this.value='';this.textContent='';this._innerHTML='';this.disabled=false;this.dataset={};this.style={};this.className='';this.classList=new ClassList();this.children=[];this.files=[];this._listeners={}}
  set innerHTML(v){this._innerHTML=String(v??'');if(this._innerHTML==='')this.children=[]}
  get innerHTML(){return this._innerHTML}
  addEventListener(t,fn){(this._listeners[t]??=[]).push(fn)}
  dispatch(t,event={}){for(const fn of this._listeners[t]??[])fn({target:this,preventDefault(){},stopPropagation(){},...event})}
  appendChild(x){this.children.push(x);return x}
  append(...xs){this.children.push(...xs)}
  remove(){}
  querySelector(sel){if(sel==='textarea') return this._textarea||(this._textarea=new El('textarea'));return null}
  querySelectorAll(){return []}
  focus(){} select(){} click(){this.onclick?.({target:this,stopPropagation(){},preventDefault(){}})}
  getBoundingClientRect(){return {left:100,top:100,width:360,height:490,right:460,bottom:590}}
  setPointerCapture(){}
  matches(sel){return sel.includes('input')&&this.tagName==='INPUT'||sel.includes('textarea')&&this.tagName==='TEXTAREA'}
  closest(sel){if(sel===".card-module"&&this.dataset.module)return this;if(sel==="[data-card]"&&this.dataset.card)return this;if(sel==="[data-term]"&&this.dataset.term)return this;if(sel==="[data-asset]"&&this.dataset.asset)return this;if(sel==="[data-place-asset]"&&this.dataset.placeAsset)return this;if(sel==="[data-use-asset-base]"&&this.dataset.useAssetBase)return this;if(sel==="[data-save-asset-meta]"&&this.dataset.saveAssetMeta)return this;if(sel==="[data-delete-asset]"&&this.dataset.deleteAsset)return this;return null}
}

const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
const els=new Map(ids.map(id=>[id,new El('div',id)]));
const tagFor=(id,tag)=>{const e=els.get(id);if(e)e.tagName=tag.toUpperCase()};
for(const id of ['projectName','baseFile','projectFile','glossaryFile','cardSearch','cardName','fontSize','fontColor','moduleX','moduleY','moduleW','termSearch','termName','termCategory','termTags','termColor','freeImageFile','elX','elY','elW','elH','elR','elZ','elOpacity','freeTextSize','freeTextColor','lockAspect','snapEnabled','assetLibraryFile','assetLibraryUpload','assetSearch','assetNameEdit','assetTagsEdit'])tagFor(id,'input');
for(const id of ['moduleText','termDescription','freeElementText'])tagFor(id,'textarea');
for(const id of ['fontWeight','textAlign','imageLabelPosition','freeTextWeight','freeTextAlign','freeTextFont','assetCategoryFilter','assetCategoryEdit'])tagFor(id,'select');
for(const id of ['glossaryModal','assetLibraryModal','termEditorModal','projectMenu','inlineEditor','toast'])els.get(id).hidden=true;
els.get('fontColor').value='#ffffff';els.get('termColor').value='#5b5bd6';els.get('snapEnabled').checked=true;els.get('lockAspect').checked=false;els.get('imageLabelPosition').value='bottom';
const closeButtons=[...html.matchAll(/data-close="([^"]+)"/g)].map(m=>{const e=new El('button');e.dataset.close=m[1];return e});
const canvasShell=new El('div');canvasShell.className='canvas-shell';
const body=new El('body');
const document={
  body,
  querySelector(sel){
    if(sel.startsWith('#')){
      if(sel==='#inlineEditor textarea')return els.get('inlineEditor').querySelector('textarea');
      const id=sel.slice(1).split(/[ .\[]/)[0];return els.get(id)||null;
    }
    if(sel==='.canvas-shell')return canvasShell;
    return null;
  },
  querySelectorAll(sel){if(sel==='[data-close]')return closeButtons;if(sel==='.modal')return [els.get('glossaryModal'),els.get('assetLibraryModal'),els.get('termEditorModal')];if(sel==='#cardCanvas .card-module')return els.get('cardCanvas').children.filter(x=>x.className.includes('card-module'));return []},
  createElement(tag){return new El(tag)},
  addEventListener(){}
};
const windowObj={CARDSTUDIO_SHARED_GLOSSARY:null,_listeners:{},addEventListener(t,fn){(this._listeners[t]??=[]).push(fn)}};
let lastBlob=null;
const context={window:windowObj,document,location:{protocol:'file:'},console,Blob,URL:{createObjectURL(blob){lastBlob=blob;return 'blob:test'},revokeObjectURL(){}},setTimeout(){return 1},clearTimeout(){},Image:class{},FileReader:class{},Math,Date,JSON,Promise,Array,Object,String,Number,RegExp,Map,Set,Intl};
windowObj.window=windowObj;windowObj.document=document;windowObj.location=context.location;
vm.createContext(context);
vm.runInContext(glossaryJs,context,{filename:'glossary-data.js'});
vm.runInContext(appJs,context,{filename:'app.js'});
await new Promise(r=>setImmediate(r));
await new Promise(r=>setImmediate(r));

const fail=m=>{throw new Error(m)};
if(!els.get('glossaryModal').hidden||!els.get('termEditorModal').hidden)fail('启动后词条弹窗不应显示');
if(els.get('cardCanvas').children.length!==6)fail(`默认卡面应有 6 个模块，实际 ${els.get('cardCanvas').children.length}`);
if(!String(els.get('status').textContent).includes('Community'))fail('启动状态没有进入制卡主界面');

els.get('openGlossary').onclick();
if(els.get('glossaryModal').hidden)fail('点击词条库后没有打开');
if(!els.get('termEditorModal').hidden)fail('打开词条库不应自动打开共创词条编辑器');
const closeGlossary=closeButtons.find(b=>b.dataset.close==='glossaryModal');
closeGlossary.onclick();
if(!els.get('glossaryModal').hidden)fail('词条库关闭失败');

els.get('projectMenu').hidden=false;
els.get('newProject').onclick();
if(!els.get('projectMenu').hidden)fail('新建项目后项目菜单应关闭');
if(els.get('cardCanvas').children.length!==6)fail('新建项目没有恢复默认卡面');

els.get('focusBtn').onclick();
if(!body.classList.contains('focus')||els.get('focusBtn').textContent!=='退出专注')fail('专注模式进入失败');
els.get('focusBtn').onclick();
if(body.classList.contains('focus')||els.get('focusBtn').textContent!=='专注')fail('专注模式退出失败');

els.get('addText').onclick();
if(els.get('cardCanvas').children.length!==7)fail('新增文字模块失败');
els.get('undoBtn').onclick();
if(els.get('cardCanvas').children.length!==6)fail('撤销新增文字失败');

els.get('projectMenu').hidden=false;
els.get('exportGlossary').onclick();
if(!els.get('projectMenu').hidden)fail('没有共创词条时，投稿操作也应关闭菜单');
if(!String(els.get('status').textContent).includes('没有需要投稿'))fail('空词条投稿提示不正确');


// Invalid generic JSON must not be accepted as a project.
const badFile={size:80,text:async()=>JSON.stringify({cards:[]})};
els.get('projectFile').files=[badFile];els.get('projectFile').onchange({target:els.get('projectFile')});
await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
if(!String(els.get('status').textContent).includes('不是有效的 Community 项目'))fail('任意 cards JSON 被错误当作 Community 项目');

// V2 project: duplicate ids are repaired, unsafe SVG data URLs are rejected, and shared background assets hydrate.
const safeBg='data:image/png;base64,QUFBQQ==';
const v2={format:'cardstudio-community',version:2,projectName:'协作测试',assets:{bg_1:safeBg,bad:'data:image/svg+xml;base64,PHN2Zz4='},cards:[
  {id:'same',name:'卡A',backgroundRef:'bg_1',modules:[{id:'dup',type:'title',text:'A',x:12,y:5,w:76,fontSize:24,fontWeight:750,color:'#ffffff',align:'center'}]},
  {id:'same',name:'卡B',backgroundRef:'bg_1',modules:[{id:'dup',type:'title',text:'B',x:12,y:5,w:76,fontSize:24,fontWeight:700,color:'#ffffff',align:'center'}]}
],selected:'same',glossary:{schema:'cardstudio-glossary-v1',terms:[]}};
const goodFile={size:JSON.stringify(v2).length,text:async()=>JSON.stringify(v2)};
els.get('projectFile').files=[goodFile];els.get('projectFile').onchange({target:els.get('projectFile')});
await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
if(els.get('cardCount').textContent!==2)fail('V2 共创项目没有正确打开');
const rows=els.get('cardList').children;
if(rows.length!==2||rows[0].dataset.card===rows[1].dataset.card)fail('重复卡牌 ID 没有修复');
if(!String(els.get('cardCanvas').style.backgroundImage||'').includes('data:image/png;base64'))fail('V2 背景资源没有正确还原');

// Export V3 must deduplicate shared backgrounds and support free image assets.
lastBlob=null;els.get('saveProject').onclick();
if(!lastBlob)fail('导出共创项目没有生成文件');
const exported=JSON.parse(await lastBlob.text());
if(exported.version!==3)fail('共创项目没有使用 V3 格式');
if(Object.keys(exported.assets||{}).length!==1)fail('相同底图没有去重保存');
if(exported.cards[0].backgroundRef!==exported.cards[1].backgroundRef)fail('重复底图没有共享同一资源引用');
if('background' in exported.cards[0])fail('V3 卡牌记录仍重复嵌入底图');

// Manual glossary sync is optional and remains separate from contribution export.
const glossaryFile={size:200,text:async()=>JSON.stringify({schema:'cardstudio-glossary-v1',version:'test',source:'Studio',terms:[{id:'status.test',name:'测试状态',color:'#336699',description:'测试'}]})};
els.get('glossaryFile').files=[glossaryFile];els.get('glossaryFile').onchange({target:els.get('glossaryFile')});
await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
els.get('openGlossary').onclick();
if(!String(els.get('glossaryVersion').textContent).includes('1 词条'))fail('共享词条同步失败');
if(!els.get('termDetail').innerHTML.includes('词条库不是启动条件')&&!els.get('termList').innerHTML.includes('测试状态'))fail('共享词条没有进入词条库');


// Local glossary terms are project-scoped: new/open project must not leak terms across projects.
els.get('newLocalTerm').onclick();
els.get('termName').value='本项目词条A';els.get('termCategory').value='测试';els.get('saveLocalTerm').onclick();
lastBlob=null;els.get('saveProject').onclick();
if(!lastBlob)fail('带共创词条的项目没有导出');
const projectA=JSON.parse(await lastBlob.text());
if(projectA.glossary?.terms?.length!==1||projectA.glossary.terms[0].name!=='本项目词条A')fail('项目没有只保存自己的共创词条');
els.get('newProject').onclick();
lastBlob=null;els.get('exportGlossary').onclick();
if(lastBlob)fail('新建项目后不应继续携带上一个项目的共创词条');
els.get('newLocalTerm').onclick();els.get('termName').value='本项目词条B';els.get('saveLocalTerm').onclick();
const projectAFile={size:JSON.stringify(projectA).length,text:async()=>JSON.stringify(projectA)};
els.get('projectFile').files=[projectAFile];els.get('projectFile').onchange({target:els.get('projectFile')});
await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
lastBlob=null;els.get('exportGlossary').onclick();
const contribution=JSON.parse(await lastBlob.text());
if(contribution.terms.length!==1||contribution.terms[0].name!=='本项目词条A')fail('打开项目后发生共创词条串库');

// Inline editing must commit data before a click-triggered export; deferred repaint must not mean stale export.
const firstModule=els.get('cardCanvas').children[0];
els.get('cardCanvas').ondblclick({target:firstModule,preventDefault(){}});
const inlineTa=els.get('inlineEditor').querySelector('textarea');inlineTa.value='即时保存标题';inlineTa.dispatch('blur');
lastBlob=null;els.get('saveProject').onclick();
const afterInline=JSON.parse(await lastBlob.text());
if(afterInline.cards[0].modules[0].text!=='即时保存标题')fail('双击文字离开编辑框后立即导出仍然得到旧文字');

// Invalid module structures must fail cleanly instead of reaching normalization and throwing unpredictably.
const badModules={format:'cardstudio-community',version:2,cards:[{id:'x',name:'bad',modules:[null]}]};
const badModulesFile={size:200,text:async()=>JSON.stringify(badModules)};
els.get('projectFile').files=[badModulesFile];els.get('projectFile').onchange({target:els.get('projectFile')});
await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
if(!String(els.get('status').textContent).includes('无效卡牌/模块'))fail('无效模块结构没有被项目边界校验拦截');


// Inspector changes unrelated to color must not silently disable smart auto-contrast.
const first=els.get('cardCanvas').children[0];
els.get('cardCanvas').onclick({target:first});
els.get('moduleX').value='14';els.get('moduleX').onchange({target:els.get('moduleX')});
lastBlob=null;els.get('saveProject').onclick();
let autoPayload=JSON.parse(await lastBlob.text());
if(autoPayload.cards[0].modules[0].autoColor!==true)fail('移动模块错误关闭了自动对比色');
els.get('fontColor').value='#123456';els.get('fontColor').onchange({target:els.get('fontColor')});
lastBlob=null;els.get('saveProject').onclick();autoPayload=JSON.parse(await lastBlob.text());
if(autoPayload.cards[0].modules[0].autoColor!==false)fail('手动改颜色没有关闭自动对比色');

// Term names that break [[term]] syntax must be rejected, and Escape should close glossary even from search input.
els.get('openGlossary').onclick();els.get('newLocalTerm').onclick();els.get('termName').value='坏[词条]';els.get('saveLocalTerm').onclick();
if(!String(els.get('status').textContent).includes('不能包含'))fail('非法词条名称未被拦截');
els.get('termEditorModal').hidden=true;els.get('glossaryModal').hidden=false;
for(const fn of windowObj._listeners.keydown??[])fn({key:'Escape',target:els.get('termSearch'),preventDefault(){},ctrlKey:false,metaKey:false,shiftKey:false});
if(!els.get('glossaryModal').hidden)fail('焦点在搜索框时 Esc 不能关闭词条库');

// Shared asset library: separate from glossary, safe raster-only, placeable as a free image layer.
const sharedPng='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n7sAAAAASUVORK5CYII=';
const assetPack={schema:'cardstudio-asset-library-v1',version:1,name:'测试素材库',assets:[{id:'a_icon',name:'测试图标',category:'icon',width:64,height:64,dataUrl:sharedPng,source:'community'}]};
const assetFile={size:JSON.stringify(assetPack).length,text:async()=>JSON.stringify(assetPack)};
els.get('assetLibraryFile').files=[assetFile];els.get('assetLibraryFile').onchange({target:els.get('assetLibraryFile')});
await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
if(!String(els.get('status').textContent).includes('共享素材库已导入'))fail('共享素材库没有正确导入');
els.get('openAssetLibrary').onclick();
if(els.get('assetLibraryModal').hidden)fail('素材库弹窗没有打开');
if(!els.get('assetList').innerHTML.includes('测试图标'))fail('共享素材没有出现在素材库列表');
// Directly exercise the detail click with a mock place button, since the tiny DOM mock does not parse innerHTML into real buttons.
const placeBtn=new El('button');placeBtn.dataset.placeAsset='a_icon';
els.get('assetDetail').onclick({target:placeBtn});
lastBlob=null;els.get('saveProject').onclick();const afterAsset=JSON.parse(await lastBlob.text());
if(!afterAsset.cards[0].modules.some(m=>m.kind==='image'))fail('素材库图片没有插入为自由图片图层');
if(!Object.values(afterAsset.assets||{}).some(v=>v===sharedPng))fail('素材库插入的自由图片没有进入 .cscard 资源表');
els.get('assetLibraryModal').hidden=true;

// Complete classic free mode: toggle, text/image-independent layer editing, multi-select UI and v3 persistence.
els.get('freeModeBtn').onclick();
if(!body.classList.contains('free-mode')||els.get('freeInspector').hidden)fail('自由模式没有正确进入');
const freeBefore=els.get('cardCanvas').children.filter(x=>x.className.includes('card-module')).length;els.get('addFreeText').onclick();
const freeAfter=els.get('cardCanvas').children.filter(x=>x.className.includes('card-module')).length;if(freeAfter!==freeBefore+1)fail(`自由模式新增文本失败 ${freeBefore} → ${freeAfter}`);
if(els.get('freeTextTools').hidden)fail('选中文字后自由文字属性没有显示');
els.get('freeElementText').value='自由模式文字';els.get('freeElementText').onchange({target:els.get('freeElementText')});
els.get('freeTextFont').value='serif';els.get('freeTextFont').onchange({target:els.get('freeTextFont')});
els.get('freeTextSize').value='18';els.get('freeTextSize').onchange({target:els.get('freeTextSize')});
lastBlob=null;els.get('saveProject').onclick();
const v3Free=JSON.parse(await lastBlob.text());
if(v3Free.version!==3)fail('自由模式项目没有保存为 v3');
const savedFree=v3Free.cards[0].modules.find(m=>m.text==='自由模式文字');
if(!savedFree||savedFree.fontStyle!=='serif'||savedFree.fontSize!==18)fail('自由文字样式没有持久化');
els.get('duplicateSelection').onclick();
lastBlob=null;els.get('saveProject').onclick();const dupFree=JSON.parse(await lastBlob.text());
if(dupFree.cards[0].modules.filter(m=>m.text==='自由模式文字').length<2)fail('自由模式复制失败');
els.get('deleteSelection').onclick();
if(!String(els.get('status').textContent).includes('已删除')&&!String(els.get('status').textContent).includes('已隐藏'))fail('自由模式删除/隐藏没有执行');
els.get('freeModeBtn').onclick();
if(body.classList.contains('free-mode'))fail('自由模式没有正确退出');

// Preserve the pointer target between the two clicks so the browser can dispatch native dblclick.
const pointerTarget=els.get('cardCanvas').children.find(x=>x.dataset.module);
els.get('cardCanvas').onpointerdown({target:pointerTarget,clientX:150,clientY:150});
if(!els.get('cardCanvas').children.includes(pointerTarget))fail('选中模块时替换了原 DOM，原生双击将丢失');
for(const fn of windowObj._listeners.pointerup??[])fn({});
els.get('cardCanvas').onclick({target:pointerTarget});
if(!els.get('cardCanvas').children.includes(pointerTarget))fail('第一次点击结束时替换了原 DOM，原生双击将丢失');

const importPack=async assets=>{
  const raw=JSON.stringify({schema:'cardstudio-asset-library-v1',version:1,assets});
  els.get('assetLibraryFile').files=[{size:raw.length,text:async()=>raw}];
  els.get('assetLibraryFile').onchange({target:els.get('assetLibraryFile')});
  await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
};
const exportedAssets=async()=>{
  lastBlob=null;els.get('exportAssetLibrary').onclick();
  if(!lastBlob)fail('素材库没有导出');
  return JSON.parse(await lastBlob.text()).assets;
};
// Two valid images with identical names, dimensions and base64 prefixes must both survive import.
const blue='data:image/png;base64,'+fs.readFileSync('tests/fixtures/blue.png').toString('base64');
const red='data:image/png;base64,'+fs.readFileSync('tests/fixtures/red.png').toString('base64');
if(blue.slice(0,120)!==red.slice(0,120))fail('去重回归图片没有共用前缀');
await importPack([{id:'prefix_blue',name:'同名图',width:48,height:48,dataUrl:blue},{id:'prefix_red',name:'同名图',width:48,height:48,dataUrl:red}]);
const distinctAssets=await exportedAssets();
if(distinctAssets.filter(a=>a.name==='同名图').length!==2)fail('不同图片因为相同前缀被错误去重');

// Cumulative overflow must reject the complete import, retain all previous assets and add no undo step.
const to500=Array.from({length:500-distinctAssets.length},(_,i)=>({id:'cap_'+i,name:'容量素材 '+i,dataUrl:sharedPng,width:1,height:1}));
await importPack(to500);
const at500=await exportedAssets();
if(at500.length!==500)fail('容量回归测试准备失败');
await importPack(Array.from({length:501},(_,i)=>({id:'over_'+i,name:'超限素材 '+i,dataUrl:sharedPng,width:1,height:1})));
if(!String(els.get('status').textContent).includes('导入失败')||!String(els.get('status').textContent).includes('1000'))fail('累计超限没有明确拒绝');
if(JSON.stringify(await exportedAssets())!==JSON.stringify(at500))fail('累计超限改变了原有素材库');
els.get('undoBtn').onclick();
if(JSON.stringify(await exportedAssets())!==JSON.stringify(distinctAssets))fail('拒绝的素材导入增加了无效撤销步骤');

console.log('Community runtime startup, classic/free layout, native click target, distinct assets and atomic capacity checks passed.');
