(()=>{
"use strict";
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const uid=(prefix="c_")=>prefix+Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-5);
const SAFE_IMAGE_MIMES=new Set(["image/png","image/jpeg","image/jpg","image/webp"]);
const MAX_IMAGE_BYTES=15*1024*1024,MAX_DATA_URL_CHARS=22*1024*1024,MAX_PROJECT_BYTES=80*1024*1024,MAX_GLOSSARY_BYTES=5*1024*1024,MAX_ASSET_LIBRARY_BYTES=120*1024*1024,MAX_CARDS=500,MAX_MODULES=80,MAX_TERMS=5000,MAX_LIBRARY_ASSETS=1000,MAX_IMAGE_DIMENSION=12000,MAX_IMAGE_PIXELS=60000000;
const safeId=(v,prefix="id_")=>{const s=String(v||"");return /^[A-Za-z0-9_.:-]{1,96}$/.test(s)?s:uid(prefix)};
const safeText=(v,max=20000)=>String(v??"").slice(0,max);
const safeColor=v=>/^#[0-9a-f]{6}$/i.test(String(v||""))?String(v):"#ffffff";
const normalizeWeight=v=>{const n=Number(v)||500,weights=[400,500,600,700,800];return String(weights.reduce((a,b)=>Math.abs(b-n)<Math.abs(a-n)?b:a,weights[0]))};
const safeImageDataUrl=v=>{if(typeof v!=="string"||v.length>MAX_DATA_URL_CHARS||!/^data:image\/(?:png|jpe?g|webp);base64,/i.test(v))return null;const i=v.indexOf(","),payload=v.slice(i+1);return payload&&/^[A-Za-z0-9+/=]+$/.test(payload)?v:null};
const safeImageFile=f=>!!f&&SAFE_IMAGE_MIMES.has(String(f.type||"").toLowerCase())&&Number(f.size||0)<=MAX_IMAGE_BYTES;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const CARD_RATIO=69/94, COMMUNITY_PROJECT_VERSION=3;
const FONT_STACKS={default:'Inter, "PingFang SC", "Microsoft YaHei", sans-serif',serif:'Georgia, "Noto Serif SC", "Songti SC", serif',display:'Impact, "Arial Black", "Microsoft YaHei", sans-serif',soft:'"Trebuchet MS", "PingFang SC", "Microsoft YaHei", sans-serif'};
const DB_NAME="cardstudio-community", DB_VERSION=1, STORE="project";
let BASE_GLOSSARY=normalizeGlossary(window.CARDSTUDIO_SHARED_GLOSSARY||{terms:[]},"official");
let localTerms=[];
let assetLibrary=[];
let selectedAssetId=null;
let state={projectName:"我的卡牌集",cards:[makeCard("第一张卡")],selected:null};
state.selected=state.cards[0].id;
let selectedModuleId=null, selectedModuleIds=[], history=[], future=[], saveTimer=null, inlineEditing=null, dragState=null, marqueeState=null, termSelectionId=null;
let freeMode=false;
let manualGlossaryRevision=0;

function makeModule(type,text,x,y,w,fontSize,opts={}){
  const defaults={title:7,meta:5,cost:8,rules:22,stat:7,text:9,number:5,image:20};
  return {id:uid("m_"),kind:opts.kind||"text",type,slot:opts.slot||"",text:String(text||""),name:opts.name||"",src:opts.src||null,parentId:opts.parentId||"",labelPosition:opts.labelPosition||"",x,y,w,h:clamp(Number(opts.h)||defaults[type]||8,2,140),r:Number(opts.r)||0,z:clamp(Number(opts.z)||20,1,999),locked:!!opts.locked,opacity:clamp(opts.opacity==null?1:Number(opts.opacity),0,1),visible:opts.visible!==false,fontSize,fontWeight:normalizeWeight(opts.fontWeight||600),fontStyle:["default","serif","display","soft"].includes(opts.fontStyle)?opts.fontStyle:"default",color:opts.color||"#ffffff",align:opts.align||"center",autoColor:opts.autoColor!==false};
}
function defaultModules(){
  return [
    makeModule("title","第一张卡",12,5.4,76,24,{fontWeight:800,h:7,z:30,slot:"title"}),
    makeModule("meta","阵营 · 类型",15,14,70,12,{fontWeight:600,h:5,z:25,slot:"meta"}),
    makeModule("cost","3",6,4.8,12,22,{fontWeight:800,h:8,z:35,slot:"cost"}),
    makeModule("rules","双击这里填写卡牌效果。\n打开词条库可以检索并插入共享词条。",10,68,80,14,{fontWeight:500,align:"left",h:22,z:24,slot:"rules"}),
    makeModule("stat","攻 3",8,58,22,16,{fontWeight:700,h:7,z:28,slot:"attack"}),
    makeModule("stat","血 5",70,58,22,16,{fontWeight:700,h:7,z:28,slot:"health"})
  ];
}
function makeCard(name){const cardName=name||"未命名卡牌",modules=defaultModules();const title=modules.find(m=>m.type==="title");if(title)title.text=cardName;return {id:uid("c_"),name:cardName,background:null,backgroundInfo:null,modules}}
function current(){return state.cards.find(c=>c.id===state.selected)||state.cards[0]}
function moduleById(id){return current()?.modules.find(m=>m.id===id)}
function safeName(s){return String(s||"Card").replace(/[\\/:*?"<>|]+/g,"-").replace(/\s+/g," ").trim().slice(0,80)||"Card"}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function normalizeTerm(t,source){return {id:safeId(t?.id,"t_"),name:safeText(t?.name,120).trim(),color:(/^#[0-9a-f]{6}$/i.test(String(t?.color||""))?String(t.color):"#5b5bd6"),category:safeText(t?.category,80),tags:safeText(Array.isArray(t?.tags)?t.tags.join(","):t?.tags,500),description:safeText(t?.description,8000),aliases:(Array.isArray(t?.aliases)?t.aliases:String(t?.aliases||"").split(/[,，]/)).map(x=>safeText(x,120).trim()).filter(Boolean).slice(0,20),example:safeText(t?.example,8000),designNotes:safeText(t?.designNotes,8000),source:["official","community","shared"].includes(t?.source)?t.source:(source||"community")}}
function validTermName(name){return !!name&&!/[\[\]\r\n\t]/.test(name)}
function normalizeGlossary(g,source){const pack=window.CARDSTUDIO_GLOSSARY.normalizePack(g);return {...pack,terms:pack.terms.map(t=>({...t,source:source||"official"}))}}
function sharedGlossaryEndpoint(){return document.querySelector('meta[name="cardstudio-glossary-endpoint"]')?.content==="/api/glossary"?"/api/glossary":"shared-glossary.json"}
function applySharedGlossary(raw,{force=false}={}){
  const g=normalizeGlossary(raw,"official"),oldDate=Date.parse(BASE_GLOSSARY.publishedAt)||0,newDate=Date.parse(g.publishedAt)||0;
  if(!force&&BASE_GLOSSARY.terms.length&&(!g.terms.length||oldDate>newDate))return false;
  BASE_GLOSSARY={...g,terms:g.terms.map(t=>({...t,source:"official"}))};localTerms=normalizeLocalTerms(localTerms);
  const all=allTerms();if(!all.some(t=>t.id===termSelectionId))termSelectionId=all[0]?.id||null;
  renderGlossary();renderCard();queueSave();return true;
}

function allTerms(){
  const out=[],byId=new Map(),byName=new Map();
  const put=(raw,official=false)=>{const t=normalizeTerm(raw,official?"official":"community"),name=t.name.toLowerCase(),idHit=byId.get(t.id),nameHit=byName.get(name),i=idHit??nameHit;if(i==null){const idx=out.length;out.push(official?{...t,source:"official"}:{...t,source:"community"});byId.set(t.id,idx);byName.set(name,idx)}else if(official){const prev=out[i];byId.delete(prev.id);byName.delete(prev.name.toLowerCase());out[i]={...t,source:"official"};byId.set(t.id,i);byName.set(name,i)}};
  localTerms.forEach(t=>put(t,false));BASE_GLOSSARY.terms.forEach(t=>put(t,true));return out;
}
function normalizeLocalTerms(terms){
  const out=[],ids=new Set(),names=new Set(),officialIds=new Set(BASE_GLOSSARY.terms.map(t=>t.id)),officialNames=new Set(BASE_GLOSSARY.terms.map(t=>t.name.toLowerCase()));
  for(const raw of (Array.isArray(terms)?terms:[]).slice(0,MAX_TERMS)){
    if(raw?.source==="official")continue;
    const t={...normalizeTerm({...raw,source:"community"},"community"),source:"community"},name=t.name.toLowerCase();
    if(!t.name||officialIds.has(t.id)||officialNames.has(name)||ids.has(t.id)||names.has(name))continue;
    ids.add(t.id);names.add(name);out.push(t);
  }
  return out;
}

function normalizeAsset(a){
  const roles=["template","frame","icon","decoration","illustration","other"];
  const category=roles.includes(a?.category)?a.category:"other";
  return {id:safeId(a?.id,"a_"),name:safeText(a?.name||"未命名素材",120).trim()||"未命名素材",category,tags:safeText(Array.isArray(a?.tags)?a.tags.join(","):a?.tags,500),width:clamp(Number(a?.width)||0,0,20000),height:clamp(Number(a?.height)||0,0,20000),dataUrl:safeImageDataUrl(a?.dataUrl||a?.src||a?.image),source:safeText(a?.source||"community",40)};
}
function normalizeAssetLibrary(list,limit=MAX_LIBRARY_ASSETS){
  const out=[],ids=new Set(),fingerprints=new Set();
  for(const raw of (Array.isArray(list)?list:[]).slice(0,limit)){
    const a=normalizeAsset(raw);if(!a.dataUrl)continue;
    if(ids.has(a.id))a.id=uid("a_");
    const fp=[a.name,a.width+"x"+a.height,a.dataUrl].join("|");
    if(fingerprints.has(fp))continue;
    ids.add(a.id);fingerprints.add(fp);out.push(a);
  }
  return out;
}
function assetLibraryApproxBytes(list=assetLibrary){return (list||[]).reduce((sum,a)=>{const d=String(a?.dataUrl||"");const i=d.indexOf(","),b64=i>=0?d.slice(i+1):d;return sum+Math.floor(b64.length*3/4)},0)}
function studioAssetCategoryToCommunity(a){const roles=[...(Array.isArray(a?.roles)?a.roles:[]),a?.category].filter(Boolean);if(roles.includes("icon"))return "icon";if(roles.includes("frameImage")||roles.includes("sharedTemplate"))return "frame";if(roles.includes("textureImage"))return "decoration";if(roles.includes("art"))return "illustration";return ["template","frame","icon","decoration","illustration","other"].includes(a?.sharedCategory)?a.sharedCategory:"other"}
function assetById(id){return assetLibrary.find(a=>a.id===id)}
function assetPackFromInput(raw){
  if(raw?.schema==="cardstudio-asset-library-v1"&&Array.isArray(raw.assets))return {name:raw.name||raw.projectName||"共享素材库",assets:raw.assets};
  if(raw?.format==="card-assembly-studio"&&Array.isArray(raw.userAssets))return {name:raw.projectName||"Studio 素材库",assets:raw.userAssets.map(a=>({id:a.id,name:a.name,category:studioAssetCategoryToCommunity(a),tags:Array.isArray(a.tags)?a.tags.join(","):a.tags,width:a.width,height:a.height,dataUrl:a.dataUrl||a.src||a.image,source:"studio"}))};
  if(Array.isArray(raw?.userAssets))return {name:raw.projectName||raw.name||"共享素材库",assets:raw.userAssets.map(a=>({...a,category:studioAssetCategoryToCommunity(a)}))};
  throw new Error("不是有效的共享素材库 / Studio 素材文件");
}
async function loadHostedGlossary({force=false}={}){
  if(location.protocol==="file:")return false;
  const revision=manualGlossaryRevision,controller=typeof AbortController!=="undefined"?new AbortController():null,timer=controller?setTimeout(()=>controller.abort(),3500):null;
  try{
    const r=await fetch(sharedGlossaryEndpoint(),{cache:"no-store",signal:controller?.signal});
    if(!r.ok)return false;
    const declared=Number(r.headers?.get?.("content-length")||0);if(declared>MAX_GLOSSARY_BYTES)return false;
    const text=await r.text();if(text.length>MAX_GLOSSARY_BYTES)return false;
    const raw=JSON.parse(text);if(raw?.schema!=="cardstudio-glossary-v1"||!Array.isArray(raw.terms)||raw.terms.length>MAX_TERMS)return false;
    if(revision!==manualGlossaryRevision)return false;
    return applySharedGlossary(raw,{force});
  }catch{return false}finally{if(timer)clearTimeout(timer)}
}
function termByName(name){const n=String(name||"").trim().toLowerCase();return BASE_GLOSSARY.terms.find(t=>t.name.toLowerCase()===n)||localTerms.find(t=>t.name.toLowerCase()===n)}
function formatTerms(text){const raw=String(text??""),re=/\[\[([^\]]+)\]\]/g;let out="",last=0,m;const plain=s=>esc(s).replace(/\n/g,"<br>");while((m=re.exec(raw))){out+=plain(raw.slice(last,m.index));const name=m[1],t=termByName(name);out+=`<span class="term" style="color:${esc(t?.color||"#8f8fff")}" title="${esc(t?.description||name)}">${esc(name)}</span>`;last=re.lastIndex}return out+plain(raw.slice(last))}
function textPlain(s){return String(s||"").replace(/\[\[([^\]]+)\]\]/g,"$1")}
function selectedModule(){return selectedModuleId?moduleById(selectedModuleId):null}
function selectedModules(){return selectedModuleIds.map(moduleById).filter(Boolean)}
function isSelected(id){return selectedModuleIds.includes(id)}
function setSelection(ids,primary,render=true){const seen=new Set;selectedModuleIds=(ids||[]).filter(id=>{if(seen.has(id)||!moduleById(id))return false;seen.add(id);return true});selectedModuleId=primary&&selectedModuleIds.includes(primary)?primary:(selectedModuleIds[selectedModuleIds.length-1]||null);if(render)applySelectionUi();else{updateSelectionClasses();renderInspector()}}
function clearSelection(render=true){selectedModuleIds=[];selectedModuleId=null;if(render)applySelectionUi();else{updateSelectionClasses();renderInspector()}}
function addSelection(id){setSelection([...selectedModuleIds,id],id)}
function toggleSelection(id){const next=selectedModuleIds.includes(id)?selectedModuleIds.filter(x=>x!==id):[...selectedModuleIds,id];setSelection(next,next.includes(id)?id:next[next.length-1])}
function setStatus(msg){$("#status").textContent=msg;toast(msg)}
function toast(msg){const t=$("#toast");t.textContent=msg;t.hidden=false;clearTimeout(t._timer);t._timer=setTimeout(()=>t.hidden=true,1800)}

function snapshot(){return {projectName:state.projectName,cards:state.cards.map(c=>({...c,background:c.background,backgroundInfo:c.backgroundInfo?{...c.backgroundInfo}:null,modules:c.modules.map(m=>({...m}))})),selected:state.selected,localTerms:localTerms.map(t=>({...t})),assetLibrary:assetLibrary.map(a=>({...a}))}}
function recordHistory(){history.push(snapshot());if(history.length>40)history.shift();future.length=0;refreshUndo()}
function restoreSnapshot(p){try{state.projectName=p.projectName||state.projectName;state.cards=normalizeCards(p.cards||[]);state.selected=p.selected&&state.cards.some(c=>c.id===p.selected)?p.selected:state.cards[0]?.id;localTerms=normalizeLocalTerms(p.localTerms||[]);assetLibrary=normalizeAssetLibrary(p.assetLibrary||[]);selectedModuleId=null;selectedModuleIds=[];renderAll();queueSave()}catch(e){setStatus("无法恢复该历史状态")}}
function undo(){if(!history.length)return;future.push(snapshot());restoreSnapshot(history.pop());refreshUndo()}
function redo(){if(!future.length)return;history.push(snapshot());restoreSnapshot(future.pop());refreshUndo()}
function refreshUndo(){$("#undoBtn").disabled=!history.length;$("#redoBtn").disabled=!future.length}

function normalizeCard(c){
  const fallbackH={title:7,meta:5,cost:8,rules:22,stat:7,text:9,number:5,image:20};
  const modules=Array.isArray(c?.modules)?c.modules.slice(0,MAX_MODULES).map(m=>{const kind=m?.kind==="image"?"image":"text",type=kind==="image"?"image":(["title","meta","cost","rules","stat","text","number"].includes(m?.type)?m.type:"text"),w=clamp(Number(m?.w)||40,2,140),h=clamp(Number(m?.h)||fallbackH[type]||8,2,140),src=kind==="image"?safeImageDataUrl(m?.src):null;return {id:safeId(m?.id,"m_"),kind,type,slot:safeText(m?.slot,40),text:kind==="image"?"":safeText(m?.text),name:safeText(m?.name,120),src,parentId:safeId(m?.parentId||"","m_")===(m?.parentId||"")?String(m?.parentId||""):"",labelPosition:["center","top","bottom","left","right"].includes(m?.labelPosition)?m.labelPosition:"",x:clamp(Number(m?.x)||0,-20,120),y:clamp(Number(m?.y)||0,-20,120),w,h,r:clamp(Number(m?.r)||0,-3600,3600),z:clamp(Number(m?.z)||20,1,999),locked:!!m?.locked,opacity:clamp(m?.opacity==null?1:Number(m.opacity),0,1),visible:m?.visible!==false,fontSize:clamp(Number(m?.fontSize)||14,8,144),fontWeight:normalizeWeight(m?.fontWeight||500),fontStyle:["default","serif","display","soft"].includes(m?.fontStyle)?m.fontStyle:"default",color:safeColor(m?.color),align:["left","center","right"].includes(m?.align)?m.align:"center",autoColor:m?.autoColor!==false}}):defaultModules();
  const ids=new Set(modules.map(m=>m.id));modules.forEach(m=>{if(m.parentId&&!ids.has(m.parentId))m.parentId=""});
  const bi=c?.backgroundInfo||null;
  const background=safeImageDataUrl(c?.background);return {id:safeId(c?.id,"c_"),name:safeText(c?.name||"未命名卡牌",160),background,backgroundInfo:background&&bi?{name:safeText(bi.name,200),width:clamp(Number(bi.width)||0,0,20000),height:clamp(Number(bi.height)||0,0,20000),ratio:Number(bi.ratio)||0,label:safeText(bi.label,120)}:null,modules};
}
function normalizeCards(list){
  const seenCards=new Set();
  return (Array.isArray(list)?list:[]).slice(0,MAX_CARDS).map(raw=>{
    const c=normalizeCard(raw);if(seenCards.has(c.id))c.id=uid("c_");seenCards.add(c.id);
    const seenModules=new Set(),remap=new Map();
    c.modules.forEach(m=>{const old=m.id;if(seenModules.has(m.id)){m.id=uid("m_");remap.set(old,m.id)}seenModules.add(m.id)});
    if(remap.size)c.modules.forEach(m=>{if(m.parentId&&remap.has(m.parentId))m.parentId=remap.get(m.parentId)});
    const ids=new Set(c.modules.map(m=>m.id));c.modules.forEach(m=>{if(m.parentId&&!ids.has(m.parentId))m.parentId=""});
    return c;
  })
}
function updateTitleModuleFromCard(card){const m=card.modules.find(m=>m.type==="title");if(m&&/^第一张卡$|^未命名卡牌$/.test(m.text))m.text=card.name}

function renderAll(){
  $("#projectName").value=state.projectName;renderList();renderCard();renderInspector();refreshUndo();
}
function renderList(){
  const q=$("#cardSearch").value.trim().toLowerCase(),list=state.cards.filter(c=>!q||[c.name,...c.modules.map(m=>textPlain(m.text))].join(" ").toLowerCase().includes(q)),host=$("#cardList");
  $("#cardCount").textContent=state.cards.length;host.innerHTML="";
  if(!list.length){const empty=document.createElement("div");empty.className="empty";empty.textContent="没有匹配卡牌";host.appendChild(empty);return}
  list.forEach(c=>{const b=document.createElement("button");b.className="card-row"+(c.id===state.selected?" active":"");b.dataset.card=c.id;const mini=document.createElement("i");mini.className="mini-card";if(c.background)mini.style.backgroundImage=`url("${c.background}")`;else mini.style.background="linear-gradient(145deg,#555,#222)";const info=document.createElement("span"),name=document.createElement("b"),meta=document.createElement("small");name.textContent=c.name;meta.textContent=`${c.modules.length} 个模块`;info.append(name,meta);b.append(mini,info);host.appendChild(b)});
}
function renderCard(){
  const c=current();if(!c)return;$("#stageName").textContent=c.name;const canvas=$("#cardCanvas"),scale=previewScale();canvas.classList.toggle("no-base",!c.background);canvas.style.backgroundImage=c.background?`url("${c.background}")`:"";canvas.innerHTML="";
  c.modules.slice().sort((a,b)=>(a.z||0)-(b.z||0)).forEach(m=>{if(m.visible===false)return;const el=document.createElement("div");el.className="card-module"+(m.kind==="image"?" is-image":"")+(m.locked?" locked":"")+(m.parentId?" attached-label":"")+(isSelected(m.id)?" selected":"")+(m.id===selectedModuleId?" selected-primary":"");el.dataset.module=m.id;el.style.left=m.x+"%";el.style.top=m.y+"%";el.style.width=m.w+"%";el.style.height=m.h+"%";el.style.transform=`rotate(${m.r||0}deg)`;el.style.zIndex=m.z||20;el.style.opacity=m.opacity==null?1:m.opacity;
    if(m.kind==="image"){const img=document.createElement("img");img.src=m.src||"";img.alt=m.name||"自由图片";img.draggable=false;el.appendChild(img)}else{el.style.fontSize=(m.fontSize*scale)+"px";el.style.fontWeight=m.fontWeight;el.style.fontFamily=FONT_STACKS[m.fontStyle]||FONT_STACKS.default;el.style.color=m.color;el.style.textAlign=m.align;const content=document.createElement("div");content.className="module-content";content.innerHTML=formatTerms(m.text);el.appendChild(content)}
    canvas.appendChild(el)});
  updateSelectionClasses();
  $("#dropHint").textContent=c.background?"拖入另一张图片可立即替换底图":"拖入图片即可作为卡牌底图";
}
function renderInspector(){
  const c=current(),m=selectedModule();$("#selectionLabel").textContent=freeMode?"自由模式":(m?moduleLabel(m):"卡牌");$("#cardInspector").hidden=freeMode||!!(m&&m.kind!=="image");$("#moduleInspector").hidden=freeMode||!m||m.kind==="image";$("#freeInspector").hidden=!freeMode;$("#cardName").value=c?.name||"";
  $("#baseInfo").textContent=c?.backgroundInfo?`${c.backgroundInfo.label} · ${c.backgroundInfo.width}×${c.backgroundInfo.height}px`:"尚未导入底图";
  if(m&&m.kind!=="image"){$("#moduleKind").textContent=moduleLabel(m);$("#moduleText").value=m.text;$("#fontSize").value=m.fontSize;$("#fontWeight").value=m.fontWeight;$("#fontColor").value=rgbToHex(m.color);$("#textAlign").value=m.align;$("#moduleX").value=round1(m.x);$("#moduleY").value=round1(m.y);$("#moduleW").value=round1(m.w)}
  if(freeMode)refreshFreeInspector();
}
function moduleLabel(m){if(m?.kind==="image")return "图片："+(m.name||"自由素材");return ({title:"卡牌名称",meta:"信息文字",cost:"费用",rules:"规则文本",stat:"数值",text:"自由文字",number:"卡牌编号"})[m?.type]||"文字模块"}
function round1(n){return Math.round(Number(n)*10)/10}
function previewScale(){const w=$("#cardCanvas")?.getBoundingClientRect?.().width||360;return clamp(w/360,.2,1.2)}
function syncPreviewScale(){const scale=previewScale();$$("#cardCanvas .card-module").forEach(el=>{const m=moduleById(el.dataset.module);if(m&&m.kind!=="image")el.style.fontSize=(m.fontSize*scale)+"px"})}
function applySelectionUi(){renderCard();renderInspector()}
function updateSelectionClasses(){
  const canvas=$("#cardCanvas");if(!canvas)return;
  canvas.querySelectorAll(".free-handle").forEach(x=>x.remove());
  canvas.querySelectorAll(".card-module").forEach(el=>{const id=el.dataset.module;el.classList.toggle("selected",isSelected(id));el.classList.toggle("selected-primary",id===selectedModuleId)});
  if(freeMode&&selectedModuleId){const m=moduleById(selectedModuleId),el=canvas.querySelector(`[data-module="${selectedModuleId}"]`);if(m&&el&&!m.locked&&m.visible!==false){const resize=document.createElement("i"),rotate=document.createElement("i");resize.className="free-handle resize";resize.dataset.handle="resize";rotate.className="free-handle rotate";rotate.dataset.handle="rotate";el.append(resize,rotate)}}
  canvas.querySelectorAll(".selection-bounds").forEach(x=>x.remove());
  if(freeMode&&selectedModuleIds.length>1){const ms=selectedModules().filter(m=>!m.locked&&m.visible!==false);if(ms.length>1){const b=selectionBounds(ms),box=document.createElement("div");box.className="selection-bounds";box.style.left=b.x+"%";box.style.top=b.y+"%";box.style.width=b.w+"%";box.style.height=b.h+"%";const h=document.createElement("i");h.className="selection-group-resize";h.dataset.groupHandle="resize";box.appendChild(h);canvas.appendChild(box)}}
  renderLayerPanel();
}
function selectionBounds(mods){if(!mods.length)return{x:0,y:0,w:1,h:1};const x1=Math.min(...mods.map(m=>m.x)),y1=Math.min(...mods.map(m=>m.y)),x2=Math.max(...mods.map(m=>m.x+m.w)),y2=Math.max(...mods.map(m=>m.y+m.h));return{x:x1,y:y1,w:Math.max(.1,x2-x1),h:Math.max(.1,y2-y1)}}
function renderLayerPanel(){const box=$("#layerList");if(!box)return;const list=current()?.modules.slice().sort((a,b)=>(b.z||0)-(a.z||0))||[];box.innerHTML=list.map(m=>`<button class="layer-row ${isSelected(m.id)?"selected ":""}${m.visible===false?"is-hidden ":""}" data-layer-id="${esc(m.id)}"><span class="layer-eye" data-layer-eye>${m.visible===false?"○":"●"}</span><span class="layer-name">${esc(moduleLabel(m))}</span><span class="layer-meta">Z ${m.z||0} · ${Math.round((m.opacity==null?1:m.opacity)*100)}%</span><span class="layer-lock" data-layer-lock>${m.locked?"🔒":"🔓"}</span></button>`).join("")}
function refreshFreeInspector(){
  const mods=selectedModules(),m=selectedModule(),count=mods.length,disabled=!m;
  $("#selectionCount").textContent=count+" 个模块";$("#selectedLayerName").textContent=count>1?count+" 个模块":(m?moduleLabel(m):"未选择");
  for(const id of ["elX","elY","elW","elH","elR","elZ","elOpacity","toggleElementVisibility","toggleElementLock","layerUp","layerDown","bringFront","sendBack","duplicateSelection","deleteSelection"]){const el=$("#"+id);if(el)el.disabled=disabled}
  if(m){$("#elX").value=round1(m.x);$("#elY").value=round1(m.y);$("#elW").value=round1(m.w);$("#elH").value=round1(m.h);$("#elR").value=round1(m.r||0);$("#elZ").value=m.z||20;const op=Math.round((m.opacity==null?1:m.opacity)*100);$("#elOpacity").value=op;$("#elOpacityValue").textContent=count>1?`所选 → ${op}%`:`${op}%`;$("#toggleElementVisibility").textContent=mods.length&&mods.every(x=>x.visible===false)?"显示所选":"隐藏所选";$("#toggleElementLock").textContent=mods.length&&mods.every(x=>x.locked)?"解锁所选":"锁定所选"}else{$("#elOpacityValue").textContent="100%"}
  const isImage=count===1&&m?.kind==="image",isAttached=count===1&&!!m?.parentId,isText=count===1&&m?.kind!=="image";
  $("#addImageLabel").disabled=!isImage;$("#detachImageLabel").disabled=!isAttached;$("#imageLabelPosition").disabled=!isImage;$("#imageLabelTools").classList.toggle("disabled",!isImage&&!isAttached);
  const tt=$("#freeTextTools");if(tt)tt.hidden=!isText;
  if(isText){$("#freeElementText").value=m.text||"";$("#freeTextSize").value=m.fontSize;$("#freeTextWeight").value=m.fontWeight;$("#freeTextColor").value=rgbToHex(m.color);$("#freeTextAlign").value=m.align;$("#freeTextFont").value=m.fontStyle||"default";$("#applyFreeTextStyleAll").disabled=!m.slot}
  renderLayerPanel()
}

function rgbToHex(c){if(/^#[0-9a-f]{6}$/i.test(c))return c;return "#ffffff"}

function patchModule(fn,msg,opts={}){const m=selectedModule();if(!m)return;recordHistory();fn(m);if(typeof opts.autoColor==="boolean")m.autoColor=opts.autoColor;renderCard();renderInspector();queueSave();if(msg)setStatus(msg)}

async function smartImportBase(file){
  try{
    if(!file||!SAFE_IMAGE_MIMES.has(String(file.type||"").toLowerCase()))return setStatus("仅支持 PNG / JPG / WebP 图片");
    if(Number(file.size||0)>MAX_IMAGE_BYTES)return setStatus("图片超过 15MB，请先压缩后再导入");
    const data=await fileToDataURL(file);if(!safeImageDataUrl(data))return setStatus("图片数据无效或过大");
    const img=await loadImage(data),iw=Number(img.naturalWidth)||0,ih=Number(img.naturalHeight)||0;if(!iw||!ih)throw new Error("无法读取图片尺寸");
    if(iw>MAX_IMAGE_DIMENSION||ih>MAX_IMAGE_DIMENSION||iw*ih>MAX_IMAGE_PIXELS)return setStatus("图片尺寸过大，请先缩小到 12000px / 6000万像素以内");
    const ratio=iw/ih, delta=Math.abs(ratio-CARD_RATIO);
    let label=delta<.03?"已识别为卡牌底图":ratio>1.1?"横图已智能居中裁切":ratio<.55?"长图已智能居中裁切":"已按卡牌比例居中裁切";
    recordHistory();const c=current();c.background=data;c.backgroundInfo={name:safeText(file.name,200),width:iw,height:ih,ratio,label};
    const tone=sampleTone(img);applyAutoContrast(c,tone);renderAll();queueSave();setStatus(`${label} · ${iw}×${ih}`)
  }catch(e){setStatus("底图导入失败："+(e?.message||"无法读取图片"))}
}
function sampleTone(img){try{const cv=document.createElement("canvas");cv.width=24;cv.height=Math.round(24/CARD_RATIO);const x=cv.getContext("2d",{willReadFrequently:true});drawCover(x,img,cv.width,cv.height);const d=x.getImageData(0,0,cv.width,cv.height).data;let n=0,sum=0;for(let i=0;i<d.length;i+=4){const a=d[i+3]/255;if(a<.25)continue;sum+=(d[i]*.2126+d[i+1]*.7152+d[i+2]*.0722)*a;n+=a}return n?sum/n:80}catch{return 80}}
function applyAutoContrast(c,tone){const color=tone>155?"#18181b":"#ffffff";c.modules.forEach(m=>{if(m.kind!=="image"&&m.autoColor)m.color=color})}
function fileToDataURL(file){return new Promise((res,rej)=>{const r=new FileReader;r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(file)})}
function loadImage(src){return new Promise((res,rej)=>{const i=new Image;i.onload=()=>res(i);i.onerror=rej;i.src=src})}

function openInlineEditor(moduleEl){
  const m=moduleById(moduleEl.dataset.module);if(!m||m.kind==="image")return;selectedModuleIds=[m.id];selectedModuleId=m.id;updateSelectionClasses();renderInspector();const box=$("#inlineEditor"),ta=box.querySelector("textarea"),r=moduleEl.getBoundingClientRect(),w=Math.min(Math.max(170,r.width),Math.max(180,(window.innerWidth||900)-16)),h=Math.min(Math.max(78,r.height+35),Math.max(100,(window.innerHeight||700)-16));box.hidden=false;box.style.left=clamp(r.left,8,Math.max(8,(window.innerWidth||900)-w-8))+"px";box.style.top=clamp(r.top,8,Math.max(8,(window.innerHeight||700)-h-8))+"px";box.style.width=w+"px";box.style.height=h+"px";ta.value=m.text;ta.style.height=Math.max(42,h-35)+"px";inlineEditing={moduleId:m.id,original:m.text};ta.focus();ta.select();
}
function commitInline(cancel=false,deferRender=false){if(!inlineEditing)return;const m=moduleById(inlineEditing.moduleId),ta=$("#inlineEditor textarea");if(m&&!cancel&&ta.value!==inlineEditing.original){recordHistory();m.text=safeText(ta.value);if(m.type==="title")current().name=textPlain(m.text).split("\n")[0].trim()||current().name;queueSave()}$("#inlineEditor").hidden=true;inlineEditing=null;if(deferRender)setTimeout(renderAll,0);else renderAll()}

function buildProjectPayload(){const assets={},byData=new Map;let assetNo=1;const putAsset=data=>{if(!data)return null;let ref=byData.get(data);if(!ref){ref=`asset_${assetNo++}`;byData.set(data,ref);assets[ref]=data}return ref};const cards=state.cards.map(c=>{const backgroundRef=putAsset(c.background),modules=c.modules.map(m=>{if(m.kind!=="image")return {...m};const {src,...rest}=m;return {...rest,assetRef:putAsset(src)}});const {background,...rest}=c;return {...rest,modules,backgroundRef}}),terms=normalizeLocalTerms(localTerms).map(({source,...t})=>t);return {format:"cardstudio-community",version:COMMUNITY_PROJECT_VERSION,exportedAt:new Date().toISOString(),projectName:state.projectName,cards,assets,selected:state.selected,sharedGlossary:BASE_GLOSSARY,glossary:{schema:"cardstudio-glossary-v1",version:"community-contribution",terms}}}
function exportProject(){const payload=buildProjectPayload(),blob=new Blob([JSON.stringify(payload)],{type:"application/json"});downloadBlob(blob,safeName(state.projectName)+".cscard");closeProjectMenu();setStatus(`已导出共创项目 · ${state.cards.length} 张卡`)}
function projectCardsFromPayload(p,version){const assets=p?.assets&&typeof p.assets==="object"?p.assets:{};return p.cards.map(c=>{const background=version>=2?(safeImageDataUrl(assets[c?.backgroundRef])||safeImageDataUrl(c?.background)):safeImageDataUrl(c?.background);const modules=Array.isArray(c?.modules)?c.modules.map(m=>version>=3&&m?.kind==="image"?{...m,src:safeImageDataUrl(assets[m.assetRef])||safeImageDataUrl(m.src)}:m):[];return {...c,background,modules}})}
async function importProjectFile(file){try{if(Number(file?.size||0)>MAX_PROJECT_BYTES)throw new Error("项目文件超过 80MB");const p=JSON.parse(await file.text());if(p?.format!=="cardstudio-community"||!Array.isArray(p.cards))throw new Error("不是有效的 Community 项目");const version=Number(p.version||1);if(!Number.isFinite(version)||version<1||version>COMMUNITY_PROJECT_VERSION)throw new Error("项目版本过新或无效，请升级 Community 后再打开");if(p.cards.length>MAX_CARDS)throw new Error(`项目包含 ${p.cards.length} 张卡，超过 Community 上限 ${MAX_CARDS}`);if(p.cards.some(c=>!c||typeof c!=="object"||Array.isArray(c)||Array.isArray(c?.modules)&&(c.modules.length>MAX_MODULES||c.modules.some(m=>!m||typeof m!=="object"||Array.isArray(m)))))throw new Error(`项目包含无效卡牌/模块，或单张卡模块超过 ${MAX_MODULES} 个`);if(Array.isArray(p.glossary?.terms)&&p.glossary.terms.length>MAX_TERMS)throw new Error(`项目词条超过 ${MAX_TERMS} 个`);const nextCards=normalizeCards(projectCardsFromPayload(p,version));if(!nextCards.length)nextCards.push(makeCard("第一张卡"));const g=p.glossary?.schema==="cardstudio-glossary-v1"?normalizeGlossary(p.glossary,"community"):{terms:[]},shared=p.sharedGlossary?normalizeGlossary(p.sharedGlossary,"official"):null;recordHistory();if(shared)applySharedGlossary(shared);state.projectName=safeText(p.projectName||"共创项目",120);state.cards=nextCards;state.selected=p.selected&&state.cards.some(c=>c.id===p.selected)?p.selected:state.cards[0].id;localTerms=normalizeLocalTerms(g.terms);termSelectionId=null;selectedModuleId=null;selectedModuleIds=[];renderAll();queueSave();setStatus(`共创项目已打开 · ${state.cards.length} 张卡`)}catch(e){setStatus("项目打开失败："+(e?.message||"文件无效"))}}
async function importGlossaryFile(file){try{if(Number(file?.size||0)>MAX_GLOSSARY_BYTES)throw new Error("词条文件超过 5MB");const raw=JSON.parse(await file.text()),g=normalizeGlossary(raw,"official");if(!g.terms.length)throw new Error("词条库为空");manualGlossaryRevision++;applySharedGlossary(g,{force:true});setStatus(`共享词条库已同步 · ${g.terms.length} 个词条`)}catch(e){setStatus("词条库导入失败："+(e?.message||"文件无效"))}}
function communityGlossaryPayload(){const terms=normalizeLocalTerms(localTerms).map(({source,...t})=>t);return window.CARDSTUDIO_GLOSSARY.normalizePack({schema:"cardstudio-glossary-v1",version:1,source:"CardStudio Community",terms})}
function exportGlossary(){const payload=communityGlossaryPayload();if(!payload.terms.length){closeProjectMenu();return setStatus("当前没有需要投稿的共创词条")}downloadBlob(new Blob([JSON.stringify(payload)],{type:"application/json"}),"cardstudio-community-terms.json");closeProjectMenu();setStatus(`已导出 ${payload.terms.length} 个共创词条，在私人版词条库导入即可审核`)}
async function submitCommunityGlossary(){
  const payload=communityGlossaryPayload();if(!payload.terms.length)return setStatus("当前没有需要投稿的共创词条");
  if(location.protocol==="file:"||sharedGlossaryEndpoint()!=="/api/glossary")return exportGlossary();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000),button=$("#submitCommunityTerms");button.disabled=true;
  try{const response=await fetch("/api/glossary/contributions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),signal:controller.signal});const result=await response.json();if(!response.ok)throw new Error(result.error||"提交失败");setStatus(result.reused?"这份投稿已经在私人版待审核区，无需重复提交":"共创词条已提交到私人版待审核区")}catch(error){setStatus("词条提交失败："+error.message)}finally{clearTimeout(timer);button.disabled=false}
}

function downloadBlob(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},800)}

function renderGlossary(){
  const all=allTerms();
  const q=$("#termSearch")?.value?.trim().toLowerCase()||"";
  const terms=all.filter(t=>!q||[t.name,t.category,t.tags,t.description,(t.aliases||[]).join(" "),t.example,t.designNotes].join(" ").toLowerCase().includes(q)).sort((a,b)=>a.category.localeCompare(b.category,"zh-CN")||a.name.localeCompare(b.name,"zh-CN"));
  $("#glossaryVersion").textContent=all.length?`${BASE_GLOSSARY.source} · ${all.length} 词条 · 版本 ${BASE_GLOSSARY.version}`:`可选能力 · 当前没有共享词条`;
  $("#termList").innerHTML=terms.map(t=>`<button class="term-row ${t.id===termSelectionId?"active":""}" data-term="${esc(t.id)}"><i class="term-dot" style="background:${esc(t.color)}"></i><span><b>${esc(t.name)}</b><small>${esc(t.category||"未分类")} · ${esc(t.tags||"无标签")}</small></span><em>${t.source==="official"?"共享":"共创"}</em></button>`).join("")||(all.length?`<div class="empty">没有匹配词条</div>`:`<div class="empty">暂无词条。你仍可正常制卡；只有需要共享术语时才同步或创建词条。</div>`);
  $("#glossarySyncStatus").textContent=BASE_GLOSSARY.terms.length?`私人版已发布 ${BASE_GLOSSARY.terms.length} 个词条 · 我的共创 ${localTerms.length} 个${BASE_GLOSSARY.publishedAt?" · "+new Date(BASE_GLOSSARY.publishedAt).toLocaleString():""}`:"私人版尚未发布词条。在私人版词条库点击“发布到两版词条仓库”，或在这里导入词条文件。";
  const t=all.find(x=>x.id===termSelectionId);
  $("#termDetail").innerHTML=t?`<div class="term-name" style="color:${esc(t.color)}">${esc(t.name)}</div><div class="term-meta">${esc(t.category||"未分类")} · ${esc(t.tags||"无标签")}</div><div class="source-pill">${t.source==="official"?"共享词条":"我的共创词条"}</div><div class="term-desc">${esc(t.description||"暂无说明")}</div>${t.aliases?.length?`<section class="term-design-section"><b>检索别名</b><p>${esc(t.aliases.join("、"))}</p></section>`:""}${t.example?`<section class="term-design-section"><b>使用示例</b><p>${esc(t.example)}</p></section>`:""}${t.designNotes?`<section class="term-design-section"><b>设计说明</b><p>${esc(t.designNotes)}</p></section>`:""}<div class="term-actions"><button class="primary" data-insert-term="${esc(t.id)}">插入当前模块</button>${t.source!=="official"?`<button data-edit-term="${esc(t.id)}">编辑共创词条</button>`:""}</div>`:`<div class="empty">${all.length?"选择词条查看定义。":"词条库不是启动条件，也不需要先发布任何词条。"}</div>`
}
function openGlossary(){$("#glossaryModal").hidden=false;$("#termSearch").focus();renderGlossary()}
function openTermEditor(term){$("#termEditorModal").hidden=false;$("#termEditorModal").dataset.editId=term?.id||"";$("#termName").value=term?.name||"";$("#termCategory").value=term?.category||"";$("#termTags").value=term?.tags||"";$("#termColor").value=rgbToHex(term?.color||"#5b5bd6");$("#termDescription").value=term?.description||"";$("#termAliases").value=Array.isArray(term?.aliases)?term.aliases.join(","):(term?.aliases||"");$("#termExample").value=term?.example||"";$("#termDesignNotes").value=term?.designNotes||"";$("#termName").focus()}
function saveLocalTerm(){const name=$("#termName").value.trim();if(!name)return setStatus("词条名称不能为空");if(!validTermName(name))return setStatus("词条名称不能包含 [、] 或换行");const id=$("#termEditorModal").dataset.editId;const dup=allTerms().find(t=>t.name.toLowerCase()===name.toLowerCase()&&t.id!==id);if(dup)return setStatus(dup.source==="official"?"共享词条中已存在同名词条":"我的共创词条中已存在同名词条");let design;try{design=window.CARDSTUDIO_GLOSSARY.normalizeTerm({id:id||uid("t_"),name,color:$("#termColor").value,category:$("#termCategory").value.trim(),tags:$("#termTags").value.trim(),description:$("#termDescription").value.trim(),aliases:$("#termAliases").value,example:$("#termExample").value,designNotes:$("#termDesignNotes").value})}catch(error){return setStatus(error.message)}let t=localTerms.find(t=>t.id===id);if(!t&&localTerms.length>=MAX_TERMS)return setStatus(`我的共创词条最多 ${MAX_TERMS} 个`);recordHistory();const oldName=t?.name||"";if(!t){t=normalizeTerm({...design,source:"community"},"community");localTerms.push(t)}Object.assign(t,{...design,source:"community"});if(oldName&&oldName!==t.name){const from=`[[${oldName}]]`,to=`[[${t.name}]]`;state.cards.forEach(c=>c.modules.forEach(m=>{if(m.text.includes(from))m.text=m.text.split(from).join(to)}))}$("#termEditorModal").hidden=true;termSelectionId=t.id;renderAll();renderGlossary();queueSave();setStatus("共创词条已保存")}
function insertTerm(id){const t=allTerms().find(x=>x.id===id),m=selectedModule();if(!t)return;if(!m||m.kind==="image"){setStatus("请先选中一个文字模块");return}recordHistory();const spacer=m.text&&![" ","\n"].includes(m.text.slice(-1))?" ":"";m.text+=spacer+`[[${t.name}]]`;renderAll();queueSave();setStatus("已插入词条："+t.name)}


function assetCategoryLabel(key){return ({template:"模板",frame:"边框",icon:"图标",decoration:"装饰",illustration:"插画",other:"其他"})[key]||"其他"}
function buildAssetPack(){return {schema:"cardstudio-asset-library-v1",version:1,exportedAt:new Date().toISOString(),name:state.projectName+" 素材库",assets:assetLibrary.map(a=>({...a}))}}
async function importAssetLibraryFile(file){
  try{
    if(Number(file?.size||0)>MAX_ASSET_LIBRARY_BYTES)throw new Error("素材库文件过大");
    const raw=JSON.parse(await file.text());
    const pack=assetPackFromInput(raw);
    if((pack.assets||[]).length>MAX_LIBRARY_ASSETS)throw new Error(`素材库超过 ${MAX_LIBRARY_ASSETS} 项上限`);
    const next=normalizeAssetLibrary(pack.assets||[]);
    if(!next.length)throw new Error("素材库中没有可用图片");
    const before=assetLibrary.length,merged=normalizeAssetLibrary([...assetLibrary,...next],MAX_LIBRARY_ASSETS*2);
    if(merged.length>MAX_LIBRARY_ASSETS)throw new Error(`合并后素材库超过 ${MAX_LIBRARY_ASSETS} 项上限，请拆分素材包`);
    if(assetLibraryApproxBytes(merged)>MAX_ASSET_LIBRARY_BYTES)throw new Error("合并后素材库超过 120MB 上限，请拆分素材包");
    recordHistory();assetLibrary=merged;selectedAssetId=next[0]?.id||selectedAssetId;
    renderAssetLibrary();queueSave();setStatus(`共享素材库已导入 · 新增 ${Math.max(0,assetLibrary.length-before)} 项，当前共 ${assetLibrary.length} 项`)
  }catch(e){setStatus("素材库导入失败："+(e?.message||"文件无效"))}
}
function exportAssetLibrary(){if(!assetLibrary.length){closeProjectMenu();return setStatus("当前素材库为空")}const payload=buildAssetPack();downloadBlob(new Blob([JSON.stringify(payload)],{type:"application/json"}),safeName(state.projectName)+"-assets.csassets");closeProjectMenu();setStatus(`已导出共享素材库 · ${assetLibrary.length} 项`)}
async function addAssetsToLibrary(files){
  const list=[...(files||[])];
  if(list.length>MAX_LIBRARY_ASSETS)return setStatus(`一次最多导入 ${MAX_LIBRARY_ASSETS} 项素材，请分批选择`);
  if(!list.length)return setStatus(assetLibrary.length>=MAX_LIBRARY_ASSETS?`素材库最多 ${MAX_LIBRARY_ASSETS} 项`:"没有可导入的图片");
  const added=[];
  for(const file of list){
    if(!safeImageFile(file))continue;
    const dataUrl=await fileToDataURL(file);if(!safeImageDataUrl(dataUrl))continue;
    const img=await loadImage(dataUrl),iw=img.naturalWidth||0,ih=img.naturalHeight||0;
    if(!iw||!ih||iw>MAX_IMAGE_DIMENSION||ih>MAX_IMAGE_DIMENSION||iw*ih>MAX_IMAGE_PIXELS)continue;
    added.push(normalizeAsset({id:uid("a_"),name:safeText(file.name.replace(/\.[^.]+$/,"")||"素材",120),category:guessAssetCategory(file.name),tags:"",width:iw,height:ih,dataUrl,source:"community"}));
  }
  if(!added.length)return setStatus("没有导入成功的素材：仅支持 15MB 内 PNG / JPG / WebP");
  const merged=normalizeAssetLibrary([...added,...assetLibrary],MAX_LIBRARY_ASSETS*2);if(merged.length>MAX_LIBRARY_ASSETS)return setStatus(`加入后素材库超过 ${MAX_LIBRARY_ASSETS} 项上限，当前素材库保持不变`);if(assetLibraryApproxBytes(merged)>MAX_ASSET_LIBRARY_BYTES)return setStatus("加入后素材库会超过 120MB，请先删除或拆分素材");recordHistory();assetLibrary=merged;selectedAssetId=added[0].id;renderAssetLibrary();queueSave();setStatus(`已加入素材库 · 新增 ${added.length} 项`)
}
function guessAssetCategory(name=""){const x=String(name).toLowerCase();if(/icon|图标/.test(x))return "icon";if(/frame|border|边框/.test(x))return "frame";if(/template|模板/.test(x))return "template";if(/deco|ornament|装饰/.test(x))return "decoration";if(/art|illustration|插画/.test(x))return "illustration";return "other"}
function renderAssetLibrary(){
  const q=$("#assetSearch")?.value?.trim().toLowerCase()||"",cat=$("#assetCategoryFilter")?.value||"";
  const list=assetLibrary.filter(a=>(!cat||a.category===cat)&&(!q||[a.name,a.tags,assetCategoryLabel(a.category)].join(" ").toLowerCase().includes(q))).sort((a,b)=>a.name.localeCompare(b.name,"zh-CN"));
  const head=$("#assetLibraryVersion");if(head)head.textContent=assetLibrary.length?`当前 ${assetLibrary.length} 项共享素材 · 与词条库分离`:`与词条库分离 · 可导入 Community / Studio 素材`;
  const box=$("#assetList"); if(box) box.innerHTML=list.map(a=>`<button class="asset-card ${a.id===selectedAssetId?"active":""}" data-asset="${esc(a.id)}"><span class="asset-thumb" style="background-image:url('${esc(a.dataUrl)}')"></span><span><b>${esc(a.name)}</b><small>${esc(assetCategoryLabel(a.category))}${a.width&&a.height?` · ${a.width}×${a.height}`:""}</small></span></button>`).join("")||(assetLibrary.length?`<div class="empty">没有匹配素材</div>`:`<div class="empty">这里是共享素材库，不是词条库。你可以把图片模板、图标、边框、装饰元素放进来，随后一键导入到自由模式作为图层编辑。</div>`);
  const a=assetById(selectedAssetId)||list[0]||null;if(a&&selectedAssetId!==a.id)selectedAssetId=a.id;
  const detail=$("#assetDetail"); if(detail) detail.innerHTML=a?`<div class="asset-preview" style="background-image:url('${esc(a.dataUrl)}')"></div><div class="asset-name">${esc(a.name)}</div><div class="asset-meta">${esc(assetCategoryLabel(a.category))}${a.tags?` · ${esc(a.tags)}`:""}${a.width&&a.height?` · ${a.width}×${a.height}px`:""}</div><div class="asset-desc">素材库内的图片既可以直接作为当前卡牌底图，也可以作为自由模式里的“图片模组”插入，并继续拖动、缩放、旋转、改层级。</div><div class="asset-inline-form"><label>名称<input id="assetNameEdit" maxlength="120" value="${esc(a.name)}"></label><label>分类<select id="assetCategoryEdit"><option value="template">模板</option><option value="frame">边框</option><option value="icon">图标</option><option value="decoration">装饰</option><option value="illustration">插画</option><option value="other">其他</option></select></label><label style="grid-column:1/-1">标签<input id="assetTagsEdit" maxlength="500" value="${esc(a.tags||"")}" placeholder="逗号分隔，可留空"></label></div><div class="asset-actions"><button class="primary" data-place-asset="${esc(a.id)}">插入为自由图片</button><button data-use-asset-base="${esc(a.id)}">作为当前底图</button><button data-save-asset-meta="${esc(a.id)}">保存信息</button><button data-delete-asset="${esc(a.id)}" class="danger-quiet">移出素材库</button></div>`:`<div class="empty">选择素材查看预览与导入方式。</div>`;
  if(a&&$("#assetCategoryEdit"))$("#assetCategoryEdit").value=a.category||"other";
}
function openAssetLibrary(){$("#assetLibraryModal").hidden=false;renderAssetLibrary();$("#assetSearch").focus()}
function saveAssetMeta(id){const a=assetById(id);if(!a)return;recordHistory();a.name=safeText($("#assetNameEdit")?.value||a.name,120).trim()||a.name;a.category=["template","frame","icon","decoration","illustration","other"].includes($("#assetCategoryEdit")?.value)?$("#assetCategoryEdit").value:"other";a.tags=safeText($("#assetTagsEdit")?.value||"",500);renderAssetLibrary();queueSave();setStatus("素材信息已保存")}
function deleteAsset(id){const a=assetById(id);if(!a)return;recordHistory();assetLibrary=assetLibrary.filter(x=>x.id!==id);if(selectedAssetId===id)selectedAssetId=assetLibrary[0]?.id||null;renderAssetLibrary();queueSave();setStatus("素材已移出素材库")}
function putAssetOnCurrentCard(asset,asBase=false){if(!asset?.dataUrl)return;if(asBase){recordHistory();current().background=asset.dataUrl;current().backgroundInfo={name:asset.name,width:asset.width||0,height:asset.height||0,ratio:asset.width&&asset.height?asset.width/asset.height:0,label:"来自共享素材库"};renderAll();queueSave();return setStatus("已把素材设为当前卡牌底图")}addFreeImageFromAsset(asset)}
function addFreeImageFromAsset(asset){if(current().modules.length>=MAX_MODULES)return setStatus(`单张卡最多 ${MAX_MODULES} 个模块`);recordHistory();const iw=asset.width||1000,ih=asset.height||1000,ratio=iw/ih,w=20,h=clamp(w*CARD_RATIO/ratio,5,40),m=makeModule("image","",40,42,w,12,{kind:"image",h,z:18,name:safeText(asset.name,120),src:asset.dataUrl,autoColor:false});current().modules.push(m);renderList();setSelection([m.id],m.id);queueSave();setStatus("素材已插入当前卡牌：现在可在自由模式中继续调整")}

async function exportPng(){
  try{const c=current();if(!c)return;const W=1380,H=1880,cv=document.createElement("canvas");cv.width=W;cv.height=H;const ctx=cv.getContext("2d");const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,"#30333a");bg.addColorStop(1,"#15171a");ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);if(c.background){const img=await loadImage(c.background);drawCover(ctx,img,W,H)}
    for(const m of c.modules.slice().sort((a,b)=>(a.z||0)-(b.z||0)))if(m.visible!==false)await drawModule(ctx,m,W,H);
    cv.toBlob(blob=>{if(!blob)return setStatus("PNG 导出失败：浏览器未生成图片");downloadBlob(blob,safeName(c.name)+".png");setStatus("PNG 已导出 · 1380×1880")},"image/png");
  }catch(e){setStatus("PNG 导出失败："+e.message)}
}
function drawCover(ctx,img,W,H){const ir=img.naturalWidth/img.naturalHeight,cr=W/H;let sw,sh,sx,sy;if(ir>cr){sh=img.naturalHeight;sw=sh*cr;sx=(img.naturalWidth-sw)/2;sy=0}else{sw=img.naturalWidth;sh=sw/cr;sx=0;sy=(img.naturalHeight-sh)/2}ctx.drawImage(img,sx,sy,sw,sh,0,0,W,H)}
async function drawModule(ctx,m,W,H){const x=m.x/100*W,y=m.y/100*H,w=m.w/100*W,h=m.h/100*H,cx=x+w/2,cy0=y+h/2;ctx.save();ctx.globalAlpha=m.opacity==null?1:m.opacity;ctx.translate(cx,cy0);ctx.rotate((m.r||0)*Math.PI/180);ctx.translate(-cx,-cy0);if(m.kind==="image"){if(m.src){const img=await loadImage(m.src),ir=img.naturalWidth/img.naturalHeight,br=w/h;let dw=w,dh=h,dx=x,dy=y;if(ir>br){dh=w/ir;dy=y+(h-dh)/2}else{dw=h*ir;dx=x+(w-dw)/2}ctx.drawImage(img,dx,dy,dw,dh)}ctx.restore();return}const scale=W/360,fs=m.fontSize*scale;ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.textBaseline="top";ctx.textAlign=m.align;const family=FONT_STACKS[m.fontStyle]||FONT_STACKS.default,font=weight=>`${weight} ${fs}px ${family}`,ax=m.align==="center"?x+w/2:m.align==="right"?x+w:x,lineH=fs*1.2;let cy=y;String(m.text||"").split("\n").forEach(line=>{const chars=parseColoredChars(line,m.color,m.fontWeight);let row=[],rowWidth=0;function flush(){if(!row.length){cy+=lineH;return}let start=ax;if(m.align==="center")start=ax-rowWidth/2;else if(m.align==="right")start=ax-rowWidth;let px=start;for(const ch of row){ctx.font=font(ch.weight);ctx.fillStyle=ch.color;ctx.fillText(ch.char,px,cy);px+=ch.width}row=[];rowWidth=0;cy+=lineH}for(const ch of chars){ctx.font=font(ch.weight);ch.width=ctx.measureText(ch.char).width;if(row.length&&rowWidth+ch.width>w)flush();row.push(ch);rowWidth+=ch.width}flush()});ctx.restore()}
function parseColoredChars(line,base,baseWeight){const out=[];let i=0;while(i<line.length){if(line.slice(i,i+2)==="[["){const end=line.indexOf("]]",i+2);if(end>=0){const name=line.slice(i+2,end),t=termByName(name),color=t?.color||base;for(const ch of name)out.push({char:ch,color,weight:"700"});i=end+2;continue}}out.push({char:line[i],color:base,weight:baseWeight});i++}return out}

function openDb(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);r.onblocked=()=>rej(new Error("本地存储被其他页面占用"))})}
function withTimeout(promise,ms,fallback=null){return Promise.race([promise,new Promise(res=>setTimeout(()=>res(fallback),ms))])}
async function dbPut(key,val){try{const db=await openDb();await new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(val,key);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close();return true}catch{return false}}
async function dbGet(key){try{const db=await openDb();const v=await new Promise((res,rej)=>{const r=db.transaction(STORE).objectStore(STORE).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});db.close();return v}catch{return null}}
let storageWarningShown=false;function queueSave(){clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{const ok=await dbPut("community-v1",{...state,localTerms,assetLibrary,sharedGlossary:BASE_GLOSSARY});if(!ok&&!storageWarningShown){storageWarningShown=true;const st=$("#status");if(st)st.textContent="自动保存不可用，请定期导出 .cscard";toast("自动保存不可用，请使用“项目 → 导出共创项目”")}},450)}
async function restoreAutosave(){const p=await withTimeout(dbGet("community-v1"),1800,null);if(!p)return false;try{state.projectName=safeText(p.projectName||state.projectName,120);state.cards=normalizeCards(p.cards||[]);if(!state.cards.length)return false;state.selected=p.selected&&state.cards.some(c=>c.id===p.selected)?p.selected:state.cards[0].id;if(p.sharedGlossary?.schema==="cardstudio-glossary-v1"&&Array.isArray(p.sharedGlossary.terms)){const g=normalizeGlossary(p.sharedGlossary,"official");BASE_GLOSSARY={...g,terms:g.terms.map(t=>({...t,source:"official"}))}}localTerms=normalizeLocalTerms(p.localTerms||[]);assetLibrary=normalizeAssetLibrary(p.assetLibrary||[]);return true}catch{return false}}

// Complete classic free-layout layer (Community 1.1)
function setFreeMode(on){
  freeMode=!!on;document.body.classList.toggle("free-mode",freeMode);const b=$("#freeModeBtn");if(b){b.classList.toggle("active",freeMode);b.textContent=freeMode?"✓ 自由模式":"自由模式"}$("#stageMeta").textContent=freeMode?"自由布局 · 框选、多选、缩放、旋转与图层":"双击文字直接编辑 · 拖动模块调整位置";try{localStorage.setItem("cardstudio-community-free-mode",freeMode?"1":"0")}catch{}if(!freeMode&&selectedModuleIds.length>1)setSelection(selectedModuleId?[selectedModuleId]:[],selectedModuleId);else renderAll()
}
function editableSelectedModules(){return selectedModules().filter(m=>!m.locked&&m.visible!==false)}
function shiftAttachedChildren(m,dx,dy){if(!dx&&!dy||m?.kind!=="image")return;for(const x of current().modules){if(x.parentId===m.id&&!isSelected(x.id)){x.x+=dx;x.y+=dy}}}
function setModulePosition(m,x,y){const dx=x-m.x,dy=y-m.y;m.x=x;m.y=y;shiftAttachedChildren(m,dx,dy)}
function clearSnapGuides(){$$("#cardCanvas .snap-guide").forEach(x=>x.remove())}
function showSnapGuides(snap){clearSnapGuides();const canvas=$("#cardCanvas");if(!snap)return;if(snap.x!=null){const v=document.createElement("i");v.className="snap-guide snap-guide-v";v.style.left=snap.x+"%";canvas.appendChild(v)}if(snap.y!=null){const h=document.createElement("i");h.className="snap-guide snap-guide-h";h.style.top=snap.y+"%";canvas.appendChild(h)}}
function snappedMove(d,dx,dy){if(!$("#snapEnabled").checked)return{dx,dy,x:null,y:null};const threshold=.7,g=d.group,sel=new Set(d.starts.map(s=>s.id)),xs=[0,50,100],ys=[0,50,100];for(const m of current().modules){if(sel.has(m.id)||m.visible===false)continue;xs.push(m.x,m.x+m.w/2,m.x+m.w);ys.push(m.y,m.y+m.h/2,m.y+m.h)}const fx=[g.x+dx,g.x+g.w/2+dx,g.x+g.w+dx],fy=[g.y+dy,g.y+g.h/2+dy,g.y+g.h+dy];let bx=null,by=null;for(const f of fx)for(const c of xs){const diff=c-f;if(Math.abs(diff)<=threshold&&(!bx||Math.abs(diff)<Math.abs(bx.diff)))bx={diff,target:c}}for(const f of fy)for(const c of ys){const diff=c-f;if(Math.abs(diff)<=threshold&&(!by||Math.abs(diff)<Math.abs(by.diff)))by={diff,target:c}}return{dx:dx+(bx?bx.diff:0),dy:dy+(by?by.diff:0),x:bx?.target??null,y:by?.target??null}}
function ensureDragHistory(d){if(!d.recorded){recordHistory();d.recorded=true}}
function beginFreePointer(e,el,mode="move"){
  const m=moduleById(el.dataset.module);if(!m)return;e.preventDefault();e.stopPropagation();const toggle=e.ctrlKey||e.metaKey,additive=e.shiftKey;if(toggle){toggleSelection(m.id);return}if(!isSelected(m.id)){if(additive)setSelection([...selectedModuleIds,m.id],m.id,false);else setSelection([m.id],m.id,false)}else{selectedModuleId=m.id;updateSelectionClasses();renderInspector()}if(m.locked)return;
  const mods=editableSelectedModules();if(!mods.length)return;const rect=$("#cardCanvas").getBoundingClientRect(),group=selectionBounds(mods),starts=mods.map(x=>({id:x.id,x:x.x,y:x.y,w:x.w,h:x.h,r:x.r||0,z:x.z||20})),linked=[];if(mode==="move")for(const sm of mods)if(sm.kind==="image")for(const x of current().modules)if(x.parentId===sm.id&&!isSelected(x.id)&&!linked.some(y=>y.id===x.id))linked.push({id:x.id,x:x.x,y:x.y});dragState={kind:"free",mode,primary:m.id,startX:e.clientX,startY:e.clientY,rect,group,starts,linked,recorded:false};if(mode==="rotate"){const nr=el.getBoundingClientRect();dragState.cx=nr.left+nr.width/2;dragState.cy=nr.top+nr.height/2;dragState.startAngle=Math.atan2(e.clientY-dragState.cy,e.clientX-dragState.cx)*180/Math.PI}
}
function beginSimplePointer(e,el){const m=moduleById(el.dataset.module);if(!m||m.locked||m.visible===false||inlineEditing)return;setSelection([m.id],m.id,false);const r=$("#cardCanvas").getBoundingClientRect();dragState={kind:"simple",id:m.id,startX:e.clientX,startY:e.clientY,x:m.x,y:m.y,rect:r,moved:false,recorded:false}}
function movePointer(e){
  const d=dragState;if(!d)return;if(d.kind==="simple"){const m=moduleById(d.id);if(!m)return;const dx=(e.clientX-d.startX)/d.rect.width*100,dy=(e.clientY-d.startY)/d.rect.height*100;if(Math.abs(dx)+Math.abs(dy)<=.12)return;ensureDragHistory(d);d.moved=true;setModulePosition(m,clamp(d.x+dx,0,Math.max(0,100-m.w)),clamp(d.y+dy,0,Math.max(0,100-m.h)));renderCard();renderInspector();return}
  let dx=(e.clientX-d.startX)/d.rect.width*100,dy=(e.clientY-d.startY)/d.rect.height*100;if(Math.abs(dx)+Math.abs(dy)<=.08)return;ensureDragHistory(d);let snap=null;
  if(d.mode==="move"){snap=snappedMove(d,dx,dy);dx=snap.dx;dy=snap.dy;for(const st of d.starts){const m=moduleById(st.id);if(m){m.x=clamp(st.x+dx,-20,120);m.y=clamp(st.y+dy,-20,120)}}for(const st of d.linked){const m=moduleById(st.id);if(m){m.x=st.x+dx;m.y=st.y+dy}}}
  else if(d.mode==="resize"){const lock=$("#lockAspect").checked||e.shiftKey,g=d.group,newW=Math.max(2,g.w+dx),newH=Math.max(2,g.h+dy);let sx=newW/g.w,sy=newH/g.h;if(lock){const sc=Math.max(.05,Math.abs(dx/g.w)>=Math.abs(dy/g.h)?sx:sy);sx=sy=sc}for(const st of d.starts){const m=moduleById(st.id);if(!m)continue;m.x=g.x+(st.x-g.x)*sx;m.y=g.y+(st.y-g.y)*sy;m.w=clamp(st.w*sx,2,140);m.h=clamp(st.h*sy,2,140)}}
  else if(d.mode==="rotate"){const m=moduleById(d.primary),st=d.starts.find(x=>x.id===d.primary);if(m&&st){const a=Math.atan2(e.clientY-d.cy,e.clientX-d.cx)*180/Math.PI;m.r=st.r+(a-d.startAngle)}}renderCard();renderInspector();if(snap)showSnapGuides(snap)
}
function endPointer(){if(!dragState)return;const changed=dragState.recorded;dragState=null;clearSnapGuides();if(changed){queueSave();renderCard();renderInspector()}}
function beginMarquee(e){const r=$("#cardCanvas").getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)return;e.preventDefault();const sx=(e.clientX-r.left)/r.width*100,sy=(e.clientY-r.top)/r.height*100,base=(e.ctrlKey||e.metaKey||e.shiftKey)?selectedModuleIds.slice():[];if(!base.length)clearSelection();const box=document.createElement("div");box.className="marquee-box";$("#cardCanvas").appendChild(box);marqueeState={rect:r,sx,sy,base,box}}
function moveMarquee(e){if(!marqueeState)return;const m=marqueeState,ex=(e.clientX-m.rect.left)/m.rect.width*100,ey=(e.clientY-m.rect.top)/m.rect.height*100,x=Math.min(m.sx,ex),y=Math.min(m.sy,ey),w=Math.abs(ex-m.sx),h=Math.abs(ey-m.sy);m.box.style.left=x+"%";m.box.style.top=y+"%";m.box.style.width=w+"%";m.box.style.height=h+"%";const ids=m.base.slice();for(const mod of current().modules){if(mod.visible===false||mod.locked)continue;if(mod.x<x+w&&mod.x+mod.w>x&&mod.y<y+h&&mod.y+mod.h>y)ids.push(mod.id)}setSelection(ids,ids[ids.length-1]||null,false)}
function endMarquee(){if(!marqueeState)return;marqueeState.box?.remove?.();marqueeState=null;renderCard()}
function addFreeText(type="text",pos=null){if(current().modules.length>=MAX_MODULES)return setStatus(`单张卡最多 ${MAX_MODULES} 个模块`);recordHistory();const isNum=type==="number",m=makeModule(type,isNum?"001":"输入文字",pos?.x??(isNum?68:15),pos?.y??(isNum?90:50),isNum?27:45,isNum?10:14,{h:isNum?5:9,z:45,fontWeight:isNum?600:600,align:isNum?"center":"left",autoColor:true});current().modules.push(m);renderList();setSelection([m.id],m.id);queueSave();setStatus(isNum?"已添加卡牌编号":"已添加自由文字");return m}
async function addFreeImageFile(file){try{if(!safeImageFile(file))return setStatus("自由图片仅支持 15MB 内 PNG / JPG / WebP");const src=await fileToDataURL(file);if(!safeImageDataUrl(src))throw new Error("图片数据无效或过大");const img=await loadImage(src),iw=img.naturalWidth||0,ih=img.naturalHeight||0;if(!iw||!ih)throw new Error("无法读取图片尺寸");if(iw>MAX_IMAGE_DIMENSION||ih>MAX_IMAGE_DIMENSION||iw*ih>MAX_IMAGE_PIXELS)throw new Error("图片尺寸过大");if(current().modules.length>=MAX_MODULES)return setStatus(`单张卡最多 ${MAX_MODULES} 个模块`);recordHistory();const ratio=iw/ih,w=20,h=clamp(w*CARD_RATIO/ratio,5,40),m=makeModule("image","",40,42,w,12,{kind:"image",h,z:18,name:safeText(file.name.replace(/\.[^.]+$/,""),120),src,autoColor:false});current().modules.push(m);renderList();setSelection([m.id],m.id);queueSave();setStatus("图片已放到卡面：可拖动、缩放、旋转") }catch(e){setStatus("自由图片导入失败："+(e?.message||"无法读取图片"))}}
function defaultTextStyleFor(m){const probe=defaultModules().find(x=>x.slot&&x.slot===m?.slot);if(probe)return{fontSize:probe.fontSize,fontWeight:probe.fontWeight,fontStyle:probe.fontStyle||"default",color:probe.color,align:probe.align,autoColor:probe.autoColor};return{fontSize:m?.type==="number"?10:14,fontWeight:"600",fontStyle:"default",color:"#ffffff",align:m?.type==="number"?"center":"left",autoColor:true}}
function patchSelectedTextStyle(mutator,msg){const m=selectedModule();if(!m||m.kind==="image")return setStatus("请先选中一个文字模块");recordHistory();mutator(m);renderCard();renderInspector();queueSave();if(msg)setStatus(msg)}
function resetSelectedTextStyle(){const m=selectedModule();if(!m||m.kind==="image")return;const d=defaultTextStyleFor(m);patchSelectedTextStyle(x=>Object.assign(x,d),"已恢复该文字模块默认样式")}
function applySelectedTextStyleAll(){const m=selectedModule();if(!m||m.kind==="image")return;if(!m.slot)return setStatus("自由文字没有跨卡稳定槽位；只对当前卡生效");recordHistory();let n=0;for(const c of state.cards){const t=c.modules.find(x=>x.slot===m.slot&&x.kind!=="image");if(!t)continue;for(const k of ["fontSize","fontWeight","fontStyle","color","align","autoColor"])t[k]=m[k];n++}renderAll();queueSave();setStatus(`该模块文字样式已应用到 ${n} 张卡`)}
function labelLayoutForImage(m,pos){const h=6,g=1;if(pos==="center")return{x:m.x,y:m.y+m.h/2-h/2,w:m.w,h};if(pos==="top")return{x:m.x-5,y:m.y-h-g,w:m.w+10,h};if(pos==="bottom")return{x:m.x-5,y:m.y+m.h+g,w:m.w+10,h};if(pos==="left")return{x:m.x-23,y:m.y+m.h/2-h/2,w:22,h};return{x:m.x+m.w+g,y:m.y+m.h/2-h/2,w:22,h}}
function addLabelToSelectedImage(){const m=selectedModule();if(!m||m.kind!=="image")return setStatus("请先选中一个图片 / 图标");if(current().modules.length>=MAX_MODULES)return setStatus(`单张卡最多 ${MAX_MODULES} 个模块`);recordHistory();const pos=$("#imageLabelPosition").value,p=labelLayoutForImage(m,pos),label=makeModule("text","输入文字",p.x,p.y,p.w,11,{h:p.h,z:(m.z||18)+1,parentId:m.id,labelPosition:pos,align:"center",fontWeight:600});current().modules.push(label);renderList();setSelection([label.id],label.id);queueSave();setStatus("已添加跟随图标的文字")}
function duplicateSelected(){const mods=selectedModules();if(!mods.length)return;if(current().modules.length>=MAX_MODULES)return setStatus(`单张卡最多 ${MAX_MODULES} 个模块`);recordHistory();const include=new Map(mods.map(m=>[m.id,m]));for(const m of mods)if(m.kind==="image")for(const x of current().modules)if(x.parentId===m.id&&!include.has(x.id))include.set(x.id,x);const arr=[...include.values()].slice(0,Math.max(0,MAX_MODULES-current().modules.length)),idMap=new Map,clones=[];for(const m of arr){const c={...m,id:uid("m_"),x:m.x+3,y:m.y+3};if(m.slot&&!m.parentId){c.slot="";if(c.kind!=="image")c.type="text"}idMap.set(m.id,c.id);clones.push(c)}for(const c of clones)if(c.parentId&&idMap.has(c.parentId))c.parentId=idMap.get(c.parentId);current().modules.push(...clones);renderList();setSelection(clones.map(x=>x.id),clones[clones.length-1]?.id);queueSave();setStatus(`已复制 ${clones.length} 个模块`)}
function deleteSelected(){const mods=selectedModules();if(!mods.length)return;recordHistory();const remove=new Set;for(const m of mods){if(m.slot)m.visible=false;else{remove.add(m.id);if(m.kind==="image")for(const x of current().modules)if(x.parentId===m.id)remove.add(x.id)}}current().modules=current().modules.filter(m=>!remove.has(m.id));renderList();clearSelection();queueSave();setStatus("标准模块已隐藏，自由模块已删除")}
function alignSelection(kind){const ms=editableSelectedModules();if(ms.length<2)return setStatus("至少选择两个未锁定模块才能对齐");recordHistory();const b=selectionBounds(ms);for(const m of ms){let x=m.x,y=m.y;if(kind==="left")x=b.x;else if(kind==="hcenter")x=b.x+b.w/2-m.w/2;else if(kind==="right")x=b.x+b.w-m.w;else if(kind==="top")y=b.y;else if(kind==="vcenter")y=b.y+b.h/2-m.h/2;else if(kind==="bottom")y=b.y+b.h-m.h;setModulePosition(m,x,y)}renderCard();renderInspector();queueSave();setStatus(`已对齐 ${ms.length} 个模块`)}
function distributeSelection(axis){const ms=editableSelectedModules();if(ms.length<3)return setStatus("至少选择三个未锁定模块才能等距分布");recordHistory();if(axis==="h"){ms.sort((a,b)=>a.x-b.x);const left=ms[0].x,right=ms.at(-1).x+ms.at(-1).w,total=ms.reduce((n,m)=>n+m.w,0),gap=(right-left-total)/(ms.length-1);let x=left;for(const m of ms){setModulePosition(m,x,m.y);x+=m.w+gap}}else{ms.sort((a,b)=>a.y-b.y);const top=ms[0].y,bottom=ms.at(-1).y+ms.at(-1).h,total=ms.reduce((n,m)=>n+m.h,0),gap=(bottom-top-total)/(ms.length-1);let y=top;for(const m of ms){setModulePosition(m,m.x,y);y+=m.h+gap}}renderCard();renderInspector();queueSave();setStatus(`已等距分布 ${ms.length} 个模块`)}
function moveSelectedLayer(delta){const ms=selectedModules();if(!ms.length)return;recordHistory();for(const m of ms)m.z=clamp((m.z||20)+delta,1,999);renderCard();renderInspector();queueSave()}
function changeGeometry(k){const primary=selectedModule(),mods=selectedModules();if(!primary)return;recordHistory();const el=$("#el"+k),field={X:"x",Y:"y",W:"w",H:"h",R:"r",Z:"z"}[k],v=Number(el.value);if(!Number.isFinite(v))return renderInspector();if((k==="X"||k==="Y")&&mods.length>1){const d=v-primary[field];for(const m of mods.filter(x=>!x.locked))setModulePosition(m,m.x+(field==="x"?d:0),m.y+(field==="y"?d:0))}else if((k==="W"||k==="H")&&mods.length>1){const g=selectionBounds(mods),scale=Math.max(.05,v/primary[field]);for(const m of mods.filter(x=>!x.locked)){if(k==="W"){m.x=g.x+(m.x-g.x)*scale;m.w=clamp(m.w*scale,2,140)}else{m.y=g.y+(m.y-g.y)*scale;m.h=clamp(m.h*scale,2,140)}}}else if(!primary.locked){if(k==="X")setModulePosition(primary,v,primary.y);else if(k==="Y")setModulePosition(primary,primary.x,v);else if(k==="W")primary.w=clamp(v,2,140);else if(k==="H")primary.h=clamp(v,2,140);else if(k==="R")primary.r=clamp(v,-3600,3600);else primary.z=clamp(Math.round(v),1,999)}renderCard();renderInspector();queueSave()}
function resetStandardLayout(){recordHistory();const defs=defaultModules(),bySlot=new Map(current().modules.filter(m=>m.slot).map(m=>[m.slot,m]));for(const d of defs){const m=bySlot.get(d.slot);if(m){for(const k of ["x","y","w","h","r","z","locked","opacity","visible"])m[k]=d[k]}else{if(d.slot==="title")d.text=current().name;current().modules.push(d)}}clearSelection();renderAll();queueSave();setStatus("已恢复标准模块布局，自由元素保留")}
function applyLayoutAll(){const src=current(),standards=src.modules.filter(m=>m.slot);if(!standards.length)return setStatus("当前卡没有标准模块可同步");recordHistory();let n=0;for(const c of state.cards){if(c.id===src.id)continue;for(const sm of standards){const t=c.modules.find(m=>m.slot===sm.slot);if(!t)continue;for(const k of ["x","y","w","h","r","z","locked","opacity","visible"])t[k]=sm[k]}n++}renderAll();queueSave();setStatus(`标准模块布局已同步到 ${n} 张卡；自由元素不受影响`)}

// Events
$("#cardList").onclick=e=>{const b=e.target.closest("[data-card]");if(!b)return;state.selected=b.dataset.card;selectedModuleId=null;selectedModuleIds=[];renderAll()};
$("#cardSearch").oninput=renderList;
$("#addCard").onclick=()=>{if(state.cards.length>=MAX_CARDS)return setStatus(`单个 Community 项目最多 ${MAX_CARDS} 张卡`);recordHistory();const c=makeCard("新卡牌");state.cards.push(c);state.selected=c.id;clearSelection();renderAll();queueSave();setStatus("已新建卡牌")};
$("#duplicateCard").onclick=()=>{if(state.cards.length>=MAX_CARDS)return setStatus(`单个 Community 项目最多 ${MAX_CARDS} 张卡`);recordHistory();const src=current(),idMap=new Map,mods=src.modules.map(m=>{const c={...m,id:uid("m_")};idMap.set(m.id,c.id);return c});mods.forEach(m=>{if(m.parentId&&idMap.has(m.parentId))m.parentId=idMap.get(m.parentId)});const c={...src,id:uid("c_"),name:safeText(src.name+" 副本",160),background:src.background,backgroundInfo:src.backgroundInfo?{...src.backgroundInfo}:null,modules:mods};state.cards.push(c);state.selected=c.id;selectedModuleId=null;selectedModuleIds=[];renderAll();queueSave();setStatus("已复制卡牌")};
$("#deleteCard").onclick=()=>{if(state.cards.length<=1)return setStatus("至少保留一张卡牌");recordHistory();const i=state.cards.findIndex(c=>c.id===state.selected);state.cards.splice(i,1);state.selected=state.cards[Math.max(0,i-1)].id;selectedModuleId=null;selectedModuleIds=[];renderAll();queueSave();setStatus("已删除卡牌")};
$("#projectName").onchange=e=>{recordHistory();state.projectName=safeText(e.target.value.trim()||"我的卡牌集",120);e.target.value=state.projectName;queueSave()};
$("#cardName").onchange=e=>{recordHistory();const c=current();c.name=safeText(e.target.value.trim()||"未命名卡牌",160);const t=c.modules.find(m=>m.slot==="title"||m.type==="title");if(t)t.text=c.name;renderAll();queueSave()};
$("#importBaseBtn").onclick=()=>$("#baseFile").click();$("#replaceBase").onclick=()=>$("#baseFile").click();$("#baseFile").onchange=e=>{if(e.target.files[0])smartImportBase(e.target.files[0]);e.target.value=""};
$("#clearBase").onclick=()=>{if(!current().background)return;recordHistory();current().background=null;current().backgroundInfo=null;renderAll();queueSave();setStatus("底图已清除")};
$("#openGlossary").onclick=openGlossary;$("#insertTermToModule").onclick=openGlossary;
$("#openProjectMenu").onclick=e=>{e.stopPropagation();$("#projectMenu").hidden=!$("#projectMenu").hidden};document.addEventListener("click",e=>{if(!e.target.closest("#projectMenu")&&!e.target.closest("#openProjectMenu"))$("#projectMenu").hidden=true});
$("#saveProject").onclick=exportProject;$("#openProject").onclick=()=>{closeProjectMenu();$("#projectFile").click()};$("#projectFile").onchange=e=>{if(e.target.files[0])importProjectFile(e.target.files[0]);e.target.value=""};
$("#importGlossary").onclick=()=>{closeProjectMenu();$("#glossaryFile").click()};$("#glossaryFile").onchange=e=>{if(e.target.files[0])importGlossaryFile(e.target.files[0]);e.target.value=""};$("#exportGlossary").onclick=exportGlossary;$("#openAssetLibrary").onclick=openAssetLibrary;$("#openAssetLibraryFree").onclick=openAssetLibrary;$("#importAssetLibrary").onclick=()=>{closeProjectMenu();$("#assetLibraryFile").click()};$("#assetLibraryFile").onchange=e=>{if(e.target.files[0])importAssetLibraryFile(e.target.files[0]);e.target.value=""};$("#exportAssetLibrary").onclick=exportAssetLibrary;$("#addAssetsToLibrary").onclick=()=>$("#assetLibraryUpload").click();$("#assetLibraryUpload").onchange=e=>{if(e.target.files?.length)addAssetsToLibrary(e.target.files);e.target.value=""};$("#assetSearch").oninput=renderAssetLibrary;$("#assetCategoryFilter").onchange=renderAssetLibrary;$("#assetList").onclick=e=>{const b=e.target.closest("[data-asset]");if(!b)return;selectedAssetId=b.dataset.asset;renderAssetLibrary()};$("#assetDetail").onclick=e=>{const place=e.target.closest("[data-place-asset]"),base=e.target.closest("[data-use-asset-base]"),save=e.target.closest("[data-save-asset-meta]"),del=e.target.closest("[data-delete-asset]");if(place)putAssetOnCurrentCard(assetById(place.dataset.placeAsset),false);if(base)putAssetOnCurrentCard(assetById(base.dataset.useAssetBase),true);if(save)saveAssetMeta(save.dataset.saveAssetMeta);if(del)deleteAsset(del.dataset.deleteAsset)};
$("#newProject").onclick=()=>{recordHistory();state={projectName:"我的卡牌集",cards:[makeCard("第一张卡")],selected:null};state.selected=state.cards[0].id;localTerms=[];termSelectionId=null;selectedModuleId=null;selectedModuleIds=[];closeProjectMenu();renderAll();queueSave();setStatus("已新建项目")};
$("#exportPng").onclick=exportPng;$("#undoBtn").onclick=undo;$("#redoBtn").onclick=redo;
$("#addText").onclick=()=>{const m=addFreeText("text");if(m&&!freeMode)setSelection([m.id],m.id)};
$("#resetLayout").onclick=resetStandardLayout;
function toggleFocus(){document.body.classList.toggle("focus");$("#focusBtn").textContent=document.body.classList.contains("focus")?"退出专注":"专注"}$("#focusBtn").onclick=toggleFocus;
$("#freeModeBtn").onclick=()=>setFreeMode(!freeMode);
$("#cardCanvas").onclick=e=>{if(freeMode)return;const el=e.target.closest(".card-module");if(!el)return clearSelection(false);setSelection([el.dataset.module],el.dataset.module,false)};
$("#cardCanvas").ondblclick=e=>{const el=e.target.closest(".card-module");if(el){const m=moduleById(el.dataset.module);if(m?.kind!=="image"){e.preventDefault();openInlineEditor(el)}return}if(freeMode){const r=$("#cardCanvas").getBoundingClientRect(),m=addFreeText("text",{x:clamp((e.clientX-r.left)/r.width*100-12,-10,100),y:clamp((e.clientY-r.top)/r.height*100-3,-10,100)});if(m)setTimeout(()=>{const n=$(`[data-module="${m.id}"]`);if(n)openInlineEditor(n)},0)}};
$("#cardCanvas").onpointerdown=e=>{if(inlineEditing)return;if(freeMode){const gh=e.target.closest("[data-group-handle]"),handle=e.target.closest("[data-handle]"),el=e.target.closest(".card-module");if(gh){const first=editableSelectedModules()[0],node=first&&$(`[data-module="${first.id}"]`);if(node)beginFreePointer(e,node,"resize");return}if(el){const m=moduleById(el.dataset.module);if(m?.locked){if(e.ctrlKey||e.metaKey)toggleSelection(m.id);else if(e.shiftKey)addSelection(m.id);else setSelection([m.id],m.id);return}beginFreePointer(e,el,handle?.dataset.handle||"move");return}beginMarquee(e)}else{const el=e.target.closest(".card-module");if(el)beginSimplePointer(e,el)}};
window.addEventListener("pointermove",e=>{movePointer(e);moveMarquee(e)});window.addEventListener("pointerup",()=>{endPointer();endMarquee()});window.addEventListener("pointercancel",()=>{endPointer();endMarquee()});
const editorTa=$("#inlineEditor textarea");editorTa.addEventListener("keydown",e=>{if(e.key==="Escape"){e.preventDefault();commitInline(true)}else if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();commitInline(false)}});editorTa.addEventListener("blur",()=>{if(inlineEditing)commitInline(false,true)});
$("#moduleText").onchange=e=>patchModule(m=>m.text=safeText(e.target.value));$("#fontSize").onchange=e=>patchModule(m=>m.fontSize=clamp(+e.target.value||14,8,144));$("#fontWeight").onchange=e=>patchModule(m=>m.fontWeight=e.target.value);$("#fontColor").onchange=e=>patchModule(m=>m.color=e.target.value,null,{autoColor:false});$("#textAlign").onchange=e=>patchModule(m=>m.align=e.target.value);$("#moduleX").onchange=e=>patchModule(m=>setModulePosition(m,clamp(+e.target.value||0,0,Math.max(0,100-m.w)),m.y));$("#moduleY").onchange=e=>patchModule(m=>setModulePosition(m,m.x,clamp(+e.target.value||0,0,Math.max(0,100-m.h))));$("#moduleW").onchange=e=>patchModule(m=>{m.w=clamp(+e.target.value||40,5,100);m.x=clamp(m.x,0,100-m.w)});
$("#autoContrast").onclick=async()=>{try{const c=current();if(!c.background)return setStatus("请先导入底图");const img=await loadImage(c.background);const tone=sampleTone(img);patchModule(m=>{if(m.kind!=="image")m.color=tone>155?"#18181b":"#ffffff"},"已按底图自动选择对比色",{autoColor:true})}catch{setStatus("无法读取当前底图，自动对比色未应用")}};
$("#removeModule").onclick=()=>{const m=selectedModule();if(!m)return;recordHistory();current().modules=current().modules.filter(x=>x.id!==m.id&&x.parentId!==m.id);clearSelection();renderAll();queueSave();setStatus("模块已删除")};
$("#addFreeText").onclick=()=>addFreeText("text");$("#addFreeNumber").onclick=()=>addFreeText("number");$("#addFreeImage").onclick=()=>$("#freeImageFile").click();$("#freeImageFile").onchange=e=>{if(e.target.files[0])addFreeImageFile(e.target.files[0]);e.target.value=""};
$("#addImageLabel").onclick=addLabelToSelectedImage;$("#detachImageLabel").onclick=()=>{const m=selectedModule();if(!m?.parentId)return;recordHistory();m.parentId="";m.labelPosition="";renderAll();queueSave();setStatus("文字已解除跟随")};
$("#duplicateSelection").onclick=duplicateSelected;$("#deleteSelection").onclick=deleteSelected;
$("#freeElementText").onchange=e=>patchSelectedTextStyle(m=>{m.text=safeText(e.target.value);if(m.slot==="title")current().name=textPlain(m.text).split("\n")[0].trim()||current().name});
$("#freeTextSize").onchange=e=>patchSelectedTextStyle(m=>m.fontSize=clamp(Number(e.target.value)||14,8,144));
$("#freeTextWeight").onchange=e=>patchSelectedTextStyle(m=>m.fontWeight=normalizeWeight(e.target.value));
$("#freeTextColor").onchange=e=>patchSelectedTextStyle(m=>{m.color=safeColor(e.target.value);m.autoColor=false});
$("#freeTextAlign").onchange=e=>patchSelectedTextStyle(m=>m.align=e.target.value);
$("#freeTextFont").onchange=e=>patchSelectedTextStyle(m=>m.fontStyle=["default","serif","display","soft"].includes(e.target.value)?e.target.value:"default");
$("#freeTextAutoContrast").onclick=async()=>{const m=selectedModule(),c=current();if(!m||m.kind==="image")return setStatus("请先选中文字模块");if(!c.background)return setStatus("请先导入底图");try{const img=await loadImage(c.background),tone=sampleTone(img);patchSelectedTextStyle(x=>{x.color=tone>155?"#18181b":"#ffffff";x.autoColor=true},"已恢复自动对比色")}catch{setStatus("无法读取底图")}};
$("#resetFreeTextStyle").onclick=resetSelectedTextStyle;$("#applyFreeTextStyleAll").onclick=applySelectedTextStyleAll;
for(const k of ["X","Y","W","H","R","Z"])$("#el"+k).onchange=()=>changeGeometry(k);
$("#elOpacity").onpointerdown=()=>{if(selectedModuleIds.length)recordHistory()};$("#elOpacity").oninput=e=>{const ms=selectedModules();if(!ms.length)return;const v=clamp(Number(e.target.value)/100,0,1);for(const m of ms)m.opacity=v;$("#elOpacityValue").textContent=(ms.length>1?"所选 → ":"")+Math.round(v*100)+"%";renderCard();queueSave()};
$("#toggleElementVisibility").onclick=()=>{const ms=selectedModules();if(!ms.length)return;recordHistory();const show=ms.every(m=>m.visible===false);for(const m of ms)m.visible=show;renderCard();renderInspector();queueSave()};$("#toggleElementLock").onclick=()=>{const ms=selectedModules();if(!ms.length)return;recordHistory();const unlock=ms.every(m=>m.locked);for(const m of ms)m.locked=!unlock;renderCard();renderInspector();queueSave()};
$("#layerUp").onclick=()=>moveSelectedLayer(1);$("#layerDown").onclick=()=>moveSelectedLayer(-1);$("#bringFront").onclick=()=>{const ms=selectedModules();if(!ms.length)return;recordHistory();let z=Math.max(0,...current().modules.map(m=>m.z||0))+1;for(const m of ms.slice().sort((a,b)=>(a.z||0)-(b.z||0)))m.z=z++;renderCard();renderInspector();queueSave()};$("#sendBack").onclick=()=>{const ms=selectedModules();if(!ms.length)return;recordHistory();let z=1;for(const m of ms.slice().sort((a,b)=>(a.z||0)-(b.z||0)))m.z=z++;renderCard();renderInspector();queueSave()};
$("#alignLeft").onclick=()=>alignSelection("left");$("#alignHCenter").onclick=()=>alignSelection("hcenter");$("#alignRight").onclick=()=>alignSelection("right");$("#alignTop").onclick=()=>alignSelection("top");$("#alignVCenter").onclick=()=>alignSelection("vcenter");$("#alignBottom").onclick=()=>alignSelection("bottom");$("#distributeH").onclick=()=>distributeSelection("h");$("#distributeV").onclick=()=>distributeSelection("v");$("#selectAllLayers").onclick=()=>{const ids=current().modules.filter(m=>m.visible!==false&&!m.locked).map(m=>m.id);setSelection(ids,ids[ids.length-1]);setStatus("已选择全部可见且未锁定模块")};$("#applyLayoutAll").onclick=applyLayoutAll;
$("#layerList").onclick=e=>{const row=e.target.closest("[data-layer-id]");if(!row)return;const id=row.dataset.layerId,m=moduleById(id);if(!m)return;if(e.target.closest("[data-layer-eye]")){recordHistory();m.visible=m.visible===false;setSelection([id],id);queueSave();return}if(e.target.closest("[data-layer-lock]")){recordHistory();m.locked=!m.locked;setSelection([id],id);queueSave();return}if(e.ctrlKey||e.metaKey)toggleSelection(id);else if(e.shiftKey)addSelection(id);else setSelection([id],id)};
$("#importGlossaryHere").onclick=()=>$("#glossaryFile").click();$("#submitCommunityTerms").onclick=submitCommunityGlossary;
$("#syncSharedGlossary").onclick=async function(){if(location.protocol==="file:"){setStatus("请选择私人版导出的 shared-glossary.json，或使用下载的含词条社区版");$("#glossaryFile").click();return}this.disabled=true;setStatus("正在同步两版共享词条仓库……");try{manualGlossaryRevision++;const ok=await loadHostedGlossary({force:true});setStatus(ok?`共享词条库已同步 · ${BASE_GLOSSARY.terms.length} 个词条`:"暂时无法同步，已保留本地词条；也可导入私人版词条文件")}finally{this.disabled=false}};
$("#termSearch").oninput=renderGlossary;$("#termList").onclick=e=>{const b=e.target.closest("[data-term]");if(!b)return;termSelectionId=b.dataset.term;renderGlossary()};$("#termDetail").onclick=e=>{const ins=e.target.closest("[data-insert-term]"),edit=e.target.closest("[data-edit-term]");if(ins)insertTerm(ins.dataset.insertTerm);if(edit)openTermEditor(allTerms().find(t=>t.id===edit.dataset.editTerm))};$("#newLocalTerm").onclick=()=>openTermEditor(null);$("#saveLocalTerm").onclick=saveLocalTerm;
$$('[data-close]').forEach(b=>b.onclick=()=>$("#"+b.dataset.close).hidden=true);$$('.modal').forEach(m=>m.addEventListener("click",e=>{if(e.target===m)m.hidden=true}));
function closeProjectMenu(){const m=$("#projectMenu");if(m)m.hidden=true}
const shell=$(".canvas-shell");["dragenter","dragover"].forEach(t=>shell.addEventListener(t,e=>{e.preventDefault();shell.classList.add("dragover")}));["dragleave","drop"].forEach(t=>shell.addEventListener(t,e=>{e.preventDefault();shell.classList.remove("dragover")}));shell.addEventListener("drop",e=>{const f=[...e.dataTransfer.files].find(f=>SAFE_IMAGE_MIMES.has(String(f.type||"").toLowerCase()));if(!f)return e.dataTransfer.files.length&&setStatus("仅支持 PNG / JPG / WebP 图片");if(freeMode&&e.target.closest?.("#cardCanvas"))addFreeImageFile(f);else smartImportBase(f)});
if("ResizeObserver" in window)new ResizeObserver(syncPreviewScale).observe($("#cardCanvas"));
window.addEventListener("keydown",e=>{const editing=e.target.matches?.("input,textarea,select,[contenteditable=true]")||document.activeElement?.matches?.("input,textarea,select,[contenteditable=true]");if(e.key==="Escape"){if(e.target===editorTa)return;if(!$("#termEditorModal").hidden){e.preventDefault();$("#termEditorModal").hidden=true;return}if(!$("#glossaryModal").hidden){e.preventDefault();$("#glossaryModal").hidden=true;return}if(freeMode&&selectedModuleIds.length){e.preventDefault();clearSelection();return}closeTransientUi();return}if(editing)return;const mod=e.ctrlKey||e.metaKey;if(mod&&e.key.toLowerCase()==="z"){e.preventDefault();e.shiftKey?redo():undo();return}if(mod&&e.key.toLowerCase()==="y"){e.preventDefault();redo();return}if(e.key.toLowerCase()==="f"){e.preventDefault();toggleFocus();return}if(e.key.toLowerCase()==="l"){e.preventDefault();setFreeMode(!freeMode);return}if(freeMode&&mod&&e.key.toLowerCase()==="a"){e.preventDefault();$("#selectAllLayers").click();return}if(freeMode&&mod&&e.key.toLowerCase()==="d"){e.preventDefault();duplicateSelected();return}if(freeMode&&(e.key==="Delete"||e.key==="Backspace")){e.preventDefault();deleteSelected();return}const ms=freeMode?editableSelectedModules():(selectedModule()&&!selectedModule().locked?[selectedModule()]:[]);if(!ms.length)return;const step=e.altKey?.05:(e.shiftKey?1:.2);if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)){e.preventDefault();if(!e.repeat)recordHistory();for(const m of ms){let x=m.x,y=m.y;if(e.key==="ArrowLeft")x-=step;if(e.key==="ArrowRight")x+=step;if(e.key==="ArrowUp")y-=step;if(e.key==="ArrowDown")y+=step;if(freeMode)setModulePosition(m,x,y);else setModulePosition(m,clamp(x,0,Math.max(0,100-m.w)),clamp(y,0,Math.max(0,100-m.h)))}renderCard();renderInspector();queueSave();return}if(!freeMode)return;let used=true;if(e.key==="="||e.key==="+"){if(!e.repeat)recordHistory();const sc=e.shiftKey?1.05:1.01,g=selectionBounds(ms);for(const m of ms){m.x=g.x+(m.x-g.x)*sc;m.y=g.y+(m.y-g.y)*sc;m.w=clamp(m.w*sc,2,140);m.h=clamp(m.h*sc,2,140)}}else if(e.key==="-"){if(!e.repeat)recordHistory();const sc=e.shiftKey?.95:.99,g=selectionBounds(ms);for(const m of ms){m.x=g.x+(m.x-g.x)*sc;m.y=g.y+(m.y-g.y)*sc;m.w=clamp(m.w*sc,2,140);m.h=clamp(m.h*sc,2,140)}}else if(/[qQeE]/.test(e.key)){if(!e.repeat)recordHistory();const dr=(e.key.toLowerCase()==="q"?-1:1)*(e.shiftKey?5:1);for(const m of ms)m.r=(m.r||0)+dr}else if(e.key==="["||e.key==="]"){if(!e.repeat)recordHistory();const dz=e.key==="["?-1:1;for(const m of ms)m.z=clamp((m.z||20)+dz,1,999)}else used=false;if(used){e.preventDefault();renderCard();renderInspector();queueSave()}});

function closeTransientUi(){["projectMenu","inlineEditor","glossaryModal","assetLibraryModal","termEditorModal","toast"].forEach(id=>{const el=$("#"+id);if(el)el.hidden=true})}
(async function init(){
  closeTransientUi();
  try{
    const restored=await restoreAutosave();
    state.cards=normalizeCards(state.cards);
    if(!state.cards.length)state.cards=[makeCard("第一张卡")];
    if(!state.selected||!state.cards.some(c=>c.id===state.selected))state.selected=state.cards[0].id;selectedModuleId=null;selectedModuleIds=[];try{freeMode=localStorage.getItem("cardstudio-community-free-mode")==="1"}catch{}
    setFreeMode(freeMode);
    closeTransientUi();
    setStatus(restored?"已恢复上次 Community 项目":"Community 已就绪");
    loadHostedGlossary().catch(()=>{});
  }catch(e){
    console.error("Community startup recovery:",e);
    state={projectName:"我的卡牌集",cards:[makeCard("第一张卡")],selected:null};
    state.selected=state.cards[0].id;localTerms=[];assetLibrary=[];selectedModuleId=null;selectedModuleIds=[];freeMode=false;
    try{renderAll()}catch{}
    closeTransientUi();
    const status=$("#status");if(status)status.textContent="已进入安全空白项目";
    loadHostedGlossary().catch(()=>{});
  }
})();
})();
