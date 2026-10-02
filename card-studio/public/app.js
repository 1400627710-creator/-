(function(){
"use strict";

var uid=function(){return crypto.randomUUID()};
var clone=function(v){return JSON.parse(JSON.stringify(v))};
var $=function(q){return document.querySelector(q)};
var $$=function(q){return Array.prototype.slice.call(document.querySelectorAll(q))};
var esc=function(v){return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")};
var num=function(v,f){var n=Number(v);return Number.isFinite(n)?n:(f||0)};
var nowText=function(){return new Date().toLocaleString("zh-CN",{hour12:false})};
var loadEarly=function(key,fallback){try{var v=JSON.parse(localStorage.getItem(key)||"null");return v==null?fallback:v}catch(e){return fallback}};

var BUILTIN_TEMPLATES={
  unit:{id:"unit",name:"标准单位卡",short:"单位",hint:"攻击 / 血量 / 移速 / 射程",typeLabel:"兵种",stats:[["attack","攻","攻击"],["health","血","血量"],["move","移","移速"],["range","射","射程"]]},
  spell:{id:"spell",name:"法术卡",short:"法术",hint:"威力 / 射程，效果区更大",typeLabel:"法术类型",stats:[["attack","威","威力"],["range","射","射程"]]},
  building:{id:"building",name:"建筑卡",short:"建筑",hint:"火力 / 耐久 / 射程",typeLabel:"建筑类型",stats:[["attack","火","火力"],["health","耐","耐久"],["range","射","射程"]]},
  event:{id:"event",name:"事件卡",short:"事件",hint:"大文本区，无战斗数值",typeLabel:"事件类型",stats:[]}
};
var customTemplates=loadEarly("card-studio-custom-templates",{});
var TEMPLATES=Object.assign({},BUILTIN_TEMPLATES,customTemplates);

var COMPONENTS={
  frame:[
    {id:"classic",name:"经典双线",keywords:"边框 经典 标准"},
    {id:"minimal",name:"极简细框",keywords:"边框 极简 轻"},
    {id:"heavy",name:"重甲粗框",keywords:"边框 厚重 战争"},
    {id:"ornate",name:"仪式双框",keywords:"边框 华丽 仪式"},
    {id:"botanical",name:"古典花饰线框",keywords:"边框 古典 花卉 植物 卷草 线描 手绘"}
  ],
  texture:[
    {id:"clean",name:"纯净底纹",keywords:"底纹 简洁 无纹理"},
    {id:"grid",name:"战术网格",keywords:"底纹 网格 科技"},
    {id:"diagonal",name:"斜纹织物",keywords:"底纹 斜线 军事"},
    {id:"parchment",name:"旧纸肌理",keywords:"底纹 羊皮纸 古典"},
    {id:"canvas",name:"油画画布纹",keywords:"底纹 画布 油画 纤维 手工 纸张"}
  ],
  cost:[
    {id:"circle",name:"圆形费用",keywords:"费用 圆 标记"},
    {id:"hex",name:"六角费用",keywords:"费用 六边形 科技"},
    {id:"diamond",name:"菱形费用",keywords:"费用 菱形 魔法"},
    {id:"square",name:"方形费用",keywords:"费用 方形 极简"}
  ],
  rarity:[
    {id:"dot",name:"圆点稀有度",keywords:"稀有度 圆点"},
    {id:"star",name:"星标稀有度",keywords:"稀有度 星星"},
    {id:"gem",name:"宝石稀有度",keywords:"稀有度 宝石"},
    {id:"bars",name:"刻线稀有度",keywords:"稀有度 条纹"}
  ],
  font:[
    {id:"default",name:"现代无衬线",keywords:"字体 现代 清晰"},
    {id:"serif",name:"典籍衬线",keywords:"字体 古典 衬线"},
    {id:"display",name:"紧凑标题",keywords:"字体 紧凑 标题"},
    {id:"soft",name:"柔和阅读",keywords:"字体 柔和 易读"},
    {id:"classical",name:"古典书卷体",keywords:"字体 古典 手写 书卷 楷体 衬线 奇幻"}
  ]
};
var CATEGORY_NAMES={frame:"边框",texture:"底纹",cost:"费用标记",rarity:"稀有度",font:"字体"};

var DEFAULT_APPEARANCE={
  primary:"#111827",secondary:"#334155",accent:"#f59e0b",frame:"#0f172a",text:"#f8fafc",
  frameStyle:"classic",textureStyle:"clean",costStyle:"circle",rarityStyle:"star",fontStyle:"default",frameImageAssetId:"",textureImageAssetId:"",iconAssetId:"",
  titleSize:22,titleColor:"#f8fafc",titleAlign:"left",titleBold:true,
  effectSize:13,effectColor:"#f8fafc",effectAlign:"left",effectBold:false,
  metaSize:11,metaColor:"#f8fafc",metaAlign:"center",metaBold:true,
  statsSize:21,statsColor:"#f8fafc",statsAlign:"center",statsBold:true,
  costSize:26,costColor:"#111827",costAlign:"center",costBold:true
};
var BASE_SKINS=[
  {id:"obsidian",name:"黑曜战场",favorite:true,appearance:clone(DEFAULT_APPEARANCE)},
  {id:"jade",name:"苍翠古林",appearance:{primary:"#12372a",secondary:"#365e32",accent:"#e8b86d",frame:"#0d281f",text:"#f7f4e9",frameStyle:"ornate",textureStyle:"parchment",costStyle:"hex",rarityStyle:"gem",fontStyle:"serif"}},
  {id:"ember",name:"赤焰军团",appearance:{primary:"#4a1515",secondary:"#8c2f1b",accent:"#ffd166",frame:"#2b0b0b",text:"#fff5e8",frameStyle:"heavy",textureStyle:"diagonal",costStyle:"diamond",rarityStyle:"star",fontStyle:"display"}},
  {id:"arcane",name:"星界秘仪",appearance:{primary:"#24133f",secondary:"#4c2b73",accent:"#71d6ff",frame:"#120b24",text:"#f4efff",frameStyle:"classic",textureStyle:"grid",costStyle:"hex",rarityStyle:"gem",fontStyle:"soft"}},
  {id:"botanical-classic",name:"古典花饰典藏",favorite:true,appearance:{primary:"#eee8dc",secondary:"#c8b99d",accent:"#a88955",frame:"#2b2118",text:"#2b2118",frameStyle:"botanical",textureStyle:"canvas",costStyle:"circle",rarityStyle:"gem",fontStyle:"classical",titleColor:"#2b2118",effectColor:"#2b2118",metaColor:"#2b2118",statsColor:"#2b2118",costColor:"#2b2118"}}
];

var DEFAULT_LAYOUT={
  art:{x:0,y:0,w:100,h:100,r:0,z:1,locked:true,opacity:1,visible:true},
  cost:{x:4,y:3,w:16,h:16,r:0,z:30,locked:false,opacity:1,visible:true},
  title:{x:15,y:4,w:80,h:10,r:0,z:24,locked:false,opacity:1,visible:true},
  faction:{x:15,y:14,w:62,h:5,r:0,z:23,locked:false,opacity:1,visible:true},
  rarityMark:{x:88,y:22,w:8,h:8,r:0,z:31,locked:false,opacity:1,visible:true},
  type:{x:8,y:62,w:38,h:7,r:0,z:22,locked:false,opacity:1,visible:true},
  rarityText:{x:54,y:62,w:38,h:7,r:0,z:22,locked:false,opacity:1,visible:true},
  effect:{x:8,y:69,w:84,h:18,r:0,z:20,locked:false,opacity:1,visible:true},
  stat_attack:{x:7,y:87,w:20,h:10,r:0,z:25,locked:false,opacity:1,visible:true},
  stat_health:{x:29,y:87,w:20,h:10,r:0,z:25,locked:false,opacity:1,visible:true},
  stat_move:{x:51,y:87,w:20,h:10,r:0,z:25,locked:false,opacity:1,visible:true},
  stat_range:{x:73,y:87,w:20,h:10,r:0,z:25,locked:false,opacity:1,visible:true},
  tags:{x:8,y:58,w:70,h:5,r:0,z:20,locked:false,opacity:1,visible:true}
};
var makeLayout=function(){return clone(DEFAULT_LAYOUT)};
var makeCard=function(templateId,name){
  var t=TEMPLATES[templateId]||TEMPLATES.unit;
  return {
    id:uid(),templateId:t.id,name:name||("新"+t.short+"卡"),cost:1,faction:"中立",
    description:"在这里填写卡牌效果。可使用 {费用}、{攻击} 等变量。",
    attack:t.id==="event"?0:1,health:t.id==="event"?0:1,move:t.id==="unit"?2:0,range:t.id==="unit"?1:0,
    unitType:t.short,rarity:"普通",tags:"",rulesKeywords:"",cardNumber:"",art:"",appearance:clone(DEFAULT_APPEARANCE),layout:makeLayout(),extraElements:[]
  };
};
var sample=[
  Object.assign(makeCard("unit","边境长枪兵"),{cost:2,faction:"王国",description:"部署：若你控制相邻据点，获得 +1 攻击。\\n守备时，{射程} 不会降低。",attack:3,health:4,move:2,range:1,unitType:"步兵",tags:"前线,守备,长枪"}),
  Object.assign(makeCard("spell","星辉爆裂"),{cost:4,faction:"星辉议会",description:"对射程内一个区域造成 {攻击} 点伤害。\\n若目标位于据点，额外造成 1 点伤害。",attack:4,range:4,unitType:"攻击法术",rarity:"稀有",tags:"远程,范围"}),
  Object.assign(makeCard("building","边境箭塔"),{cost:3,faction:"王国",description:"驻守单位获得 +1 射程。\\n建筑被摧毁时，驻守单位撤离到相邻空格。",attack:2,health:6,range:3,unitType:"防御建筑",tags:"据点,防御"}),
  Object.assign(makeCard("event","突发浓雾"),{cost:0,faction:"环境",description:"本回合所有超过 2 格的远程攻击获得 -1 命中。\\n回合结束时弃置此事件。",unitType:"战场事件",tags:"环境,全局"})
];

var vars={"名称":"name","费用":"cost","系别":"faction","攻击":"attack","血量":"health","移速":"move","射程":"range","兵种":"unitType","稀有度":"rarity","编号":"cardNumber"};

var loadJson=function(key,fallback){try{var v=JSON.parse(localStorage.getItem(key)||"null");return v==null?fallback:v}catch(e){return fallback}};
var dbReady=false,dbSaveTimer=null;
function openProjectDb(){
  return new Promise(function(resolve,reject){
    var req=indexedDB.open("card-assembly-studio",1);
    req.onupgradeneeded=function(){if(!req.result.objectStoreNames.contains("kv"))req.result.createObjectStore("kv")};
    req.onsuccess=function(){resolve(req.result)};req.onerror=function(){reject(req.error)};
  });
}
async function dbPut(key,value){var db=await openProjectDb();return new Promise(function(resolve,reject){var tx=db.transaction("kv","readwrite");tx.objectStore("kv").put(value,key);tx.oncomplete=function(){db.close();resolve()};tx.onerror=function(){db.close();reject(tx.error)}})}
async function dbGet(key){var db=await openProjectDb();return new Promise(function(resolve,reject){var tx=db.transaction("kv","readonly"),req=tx.objectStore("kv").get(key);req.onsuccess=function(){db.close();resolve(req.result)};req.onerror=function(){db.close();reject(req.error)}})}
function scheduleDbSave(){if(!dbReady)return;clearTimeout(dbSaveTimer);dbSaveTimer=setTimeout(function(){dbPut("project-v3",{updatedAt:Date.now(),project:projectPayload(),snapshots:snapshots}).catch(function(){})},500)};
var saved=loadJson("card-studio-project-v2",null)||loadJson("card-studio-project",null);
var cards=saved&&saved.cards&&saved.cards.length?saved.cards:sample;
var selected=saved&&saved.selected&&cards.some(function(c){return c.id===saved.selected})?saved.selected:cards[0].id;
var skins=loadJson("card-studio-skins",BASE_SKINS);
var favoriteAssets=loadJson("card-studio-favorite-assets",[]);
var snapshots=loadJson("card-studio-snapshots",[]);
var userAssets=loadJson("card-studio-user-assets",[]);
var ruleTerms=loadJson("card-studio-rule-terms",[]);
var OLD_AI_STYLE="统一的东方奇幻桌游插画，厚涂，电影光影，材质细腻，不出现文字";
var DEFAULT_AI_STYLE="古典奇幻桌游插画，传统人工油画质感，亚麻画布纹理，可见而自然的猪鬃笔触与颜料堆叠，柔和的明暗塑形，略带旧画册与十九世纪幻想插画气质，构图清晰、主体明确、色彩克制而丰富；避免现代数码渲染、3D塑料质感、霓虹赛博效果、照片感和任何文字";
var aiStyle=loadJson("card-studio-ai-style",DEFAULT_AI_STYLE);if(aiStyle===OLD_AI_STYLE)aiStyle=DEFAULT_AI_STYLE;
var projectName=saved&&saved.projectName?saved.projectName:"未命名卡牌项目";
var aiQuality="low";
var printSettings={sheet:"a4",crop:true};
var SHEETS={a4:[210,297],a3:[297,420],letter:[215.9,279.4]};

var normalizeAppearance=function(a){return Object.assign(clone(DEFAULT_APPEARANCE),a||{})};
var normalizeCard=function(c){
  c.templateId=TEMPLATES[c.templateId]?c.templateId:"unit";
  c.appearance=normalizeAppearance(c.appearance);
  if(c.unitType==null)c.unitType=TEMPLATES[c.templateId].short;
  if(c.rarity==null)c.rarity="普通";
  if(c.tags==null)c.tags="";
  if(c.rulesKeywords==null)c.rulesKeywords="";
  if(c.cardNumber==null)c.cardNumber="";
  var oldLayout=c.layout||{},t=TEMPLATES[c.templateId]||TEMPLATES.unit,nextLayout=makeLayout();
  function legacy(base,patch){return Object.assign({},base||{},patch||{})}
  if(oldLayout.head&&!oldLayout.title){nextLayout.title=legacy(nextLayout.title,{x:oldLayout.head.x,y:oldLayout.head.y,w:oldLayout.head.w,h:Math.max(6,(oldLayout.head.h||17)*.58),r:oldLayout.head.r,z:oldLayout.head.z,locked:oldLayout.head.locked,opacity:oldLayout.head.opacity,visible:oldLayout.head.visible});nextLayout.faction=legacy(nextLayout.faction,{x:oldLayout.head.x,y:(oldLayout.head.y||0)+Math.max(7,(oldLayout.head.h||17)*.58),w:Math.max(30,(oldLayout.head.w||80)*.78),h:Math.max(4,(oldLayout.head.h||17)*.3),r:oldLayout.head.r,z:oldLayout.head.z,locked:oldLayout.head.locked,opacity:oldLayout.head.opacity,visible:oldLayout.head.visible})}
  if(oldLayout.meta&&!oldLayout.type){nextLayout.type=legacy(nextLayout.type,{x:oldLayout.meta.x,y:oldLayout.meta.y,w:(oldLayout.meta.w||84)*.46,h:oldLayout.meta.h,r:oldLayout.meta.r,z:oldLayout.meta.z,locked:oldLayout.meta.locked,opacity:oldLayout.meta.opacity,visible:oldLayout.meta.visible});nextLayout.rarityText=legacy(nextLayout.rarityText,{x:(oldLayout.meta.x||8)+(oldLayout.meta.w||84)*.54,y:oldLayout.meta.y,w:(oldLayout.meta.w||84)*.46,h:oldLayout.meta.h,r:oldLayout.meta.r,z:oldLayout.meta.z,locked:oldLayout.meta.locked,opacity:oldLayout.meta.opacity,visible:oldLayout.meta.visible})}
  if(oldLayout.rarity&&!oldLayout.rarityMark)nextLayout.rarityMark=legacy(nextLayout.rarityMark,oldLayout.rarity);
  if(oldLayout.stats){var stats=t.stats||[],gap=2,totalW=oldLayout.stats.w||86,n=Math.max(1,stats.length),cell=(totalW-gap*(n-1))/n;stats.forEach(function(st,i){var key="stat_"+st[0];if(!oldLayout[key])nextLayout[key]=legacy(nextLayout[key],{x:(oldLayout.stats.x||7)+i*(cell+gap),y:oldLayout.stats.y,w:cell,h:oldLayout.stats.h,r:oldLayout.stats.r,z:oldLayout.stats.z,locked:oldLayout.stats.locked,opacity:oldLayout.stats.opacity,visible:oldLayout.stats.visible})})}
  Object.keys(oldLayout).forEach(function(k){if(DEFAULT_LAYOUT[k])nextLayout[k]=Object.assign({},nextLayout[k],oldLayout[k])});
  c.layout=nextLayout;Object.keys(c.layout).forEach(function(k){c.layout[k]=Object.assign({},DEFAULT_LAYOUT[k]||{x:10,y:10,w:30,h:10,r:0,z:40,locked:false,opacity:1,visible:true},c.layout[k]||{});if(c.layout[k].opacity==null)c.layout[k].opacity=1;if(c.layout[k].visible==null)c.layout[k].visible=true});
  if(!Array.isArray(c.extraElements))c.extraElements=[];c.extraElements.forEach(function(el){var wasLegacy=el.layout&&el.layout.opacity==null,oldZ=el.layout&&el.layout.z;el.layout=Object.assign({x:10,y:10,w:30,h:8,r:0,z:40,locked:false,opacity:1,visible:true},el.layout||{});if(wasLegacy&&el.kind==="image"&&oldZ===46)el.layout.z=18;if(el.layout.opacity==null)el.layout.opacity=1;if(el.layout.visible==null)el.layout.visible=true});
  if(c.art==null)c.art="";
  return c;
};
cards=cards.map(normalizeCard);
skins=skins.map(function(s){s.appearance=normalizeAppearance(s.appearance);return s});

var history=[],future=[],historyLimit=12;
var current=function(){return cards.find(function(c){return c.id===selected})||cards[0]};
var stateSnapshot=function(){return JSON.stringify({projectName:projectName,cards:cards,selected:selected,skins:skins,favoriteAssets:favoriteAssets,ruleTerms:ruleTerms,userAssets:userAssets,customTemplates:customTemplates,aiStyle:$("#aiStyle")?$("#aiStyle").value:aiStyle,aiQuality:aiQuality,printSettings:printSettings})};
var restoreState=function(raw){
  var s=typeof raw==="string"?JSON.parse(raw):clone(raw);
  cards=(s.cards||[]).map(normalizeCard);selected=s.selected&&cards.some(function(c){return c.id===s.selected})?s.selected:(cards[0]&&cards[0].id);
  skins=(s.skins||skins).map(function(x){x.appearance=normalizeAppearance(x.appearance);return x});
  favoriteAssets=s.favoriteAssets||favoriteAssets;
  userAssets=s.userAssets||userAssets;
  ruleTerms=s.ruleTerms||ruleTerms;
  customTemplates=s.customTemplates||customTemplates;TEMPLATES=Object.assign({},BUILTIN_TEMPLATES,customTemplates);
  if(s.projectName)projectName=s.projectName;if(s.aiStyle)aiStyle=s.aiStyle;if(s.aiQuality)aiQuality=s.aiQuality;if(s.printSettings)printSettings=Object.assign({sheet:"a4",crop:true},s.printSettings);
  renderAll();
};
var recordHistory=function(){
  history.push(stateSnapshot());if(history.length>historyLimit)history.shift();future=[];
  updateHistoryButtons();
};
var updateHistoryButtons=function(){$("#undoBtn").disabled=!history.length;$("#redoBtn").disabled=!future.length};
var persist=function(){
  try{
    var lightCards=cards.map(function(c){var x=Object.assign({},c);x.art="";return x});
    var lightAssets=userAssets.map(function(a){var x=Object.assign({},a);x.dataUrl="";return x});
    localStorage.setItem("card-studio-project-v2",JSON.stringify({cards:lightCards,selected:selected,projectName:projectName}));
    localStorage.setItem("card-studio-skins",JSON.stringify(skins));
    localStorage.setItem("card-studio-favorite-assets",JSON.stringify(favoriteAssets));
    localStorage.removeItem("card-studio-snapshots");
    localStorage.setItem("card-studio-user-assets",JSON.stringify(lightAssets));
    localStorage.setItem("card-studio-rule-terms",JSON.stringify(ruleTerms));
    localStorage.setItem("card-studio-custom-templates",JSON.stringify(customTemplates));
    localStorage.setItem("card-studio-ai-style",JSON.stringify($("#aiStyle")?$("#aiStyle").value:aiStyle));
  }catch(e){}
  scheduleDbSave();
};
var setStatus=function(t){$("#status").textContent=t};

var resolveVars=function(text,card){
  return String(text||"").replace(/\{([^}]+)\}/g,function(all,key){
    var field=vars[String(key).trim()];
    return field?String(card[field]==null?"":card[field]):all;
  });
};
function termByName(name){var n=String(name||"").trim().toLowerCase();return ruleTerms.find(function(t){return String(t.name||"").trim().toLowerCase()===n})}
function extractRuleTerms(text){var out=[],seen={};String(text||"").replace(/\[\[([^\]]+)\]\]/g,function(_,name){name=String(name).trim();if(name&&!seen[name.toLowerCase()]){seen[name.toLowerCase()]=1;out.push(name)}return _});return out}
function escapeRegExp(s){return String(s).replace(/[.*+?^$\{\}()|[\]\\]/g,"\\function renderRichText(text,card){")}
function autoMarkKnownTerms(text){
  var raw=String(text||""),protectedRanges=[];raw.replace(/\[\[([^\]]+)\]\]/g,function(m,n,offset){protectedRanges.push([offset,offset+m.length]);return m});
  var names=ruleTerms.map(function(t){return t.name}).filter(Boolean).sort(function(a,b){return b.length-a.length});
  names.forEach(function(name){
    var re=new RegExp(escapeRegExp(name),"gi"),m,out="",last=0,changed=false;
    while((m=re.exec(raw))){
      var inside=protectedRanges.some(function(r){return m.index>=r[0]&&m.index<r[1]});
      if(inside){continue}
      out+=raw.slice(last,m.index)+"[["+raw.slice(m.index,m.index+m[0].length)+"]]";last=m.index+m[0].length;changed=true;
    }
    if(changed){out+=raw.slice(last);raw=out;protectedRanges=[];raw.replace(/\[\[([^\]]+)\]\]/g,function(mm,n,offset){protectedRanges.push([offset,offset+mm.length]);return mm})}
  });
  return raw;
}
function renderRichText(text,card){
  var raw=resolveVars(text,card),out="",last=0,re=/\[\[([^\]]+)\]\]/g,m;
  while((m=re.exec(raw))){out+=esc(raw.slice(last,m.index));var name=String(m[1]).trim(),term=termByName(name),color=term&&term.color?term.color:"#38bdf8",tip=term&&term.description?term.description:"规则词条："+name;out+='<span class="rule-term" data-rule-term="'+esc(name)+'" title="'+esc(tip)+'" style="color:'+esc(color)+'">'+esc(name)+'</span>';last=re.lastIndex}
  out+=esc(raw.slice(last));return out.replace(/\n/g,"<br>");
}
var raritySymbol=function(style){
  if(style==="dot")return "●";
  if(style==="gem")return "◆";
  if(style==="bars")return "▮▮▮";
  return "★";
};
var assetById=function(id){return userAssets.find(function(x){return x.id===id})};
var cardHtml=function(card,editable){
  var t=TEMPLATES[card.templateId]||TEMPLATES.unit,a=normalizeAppearance(card.appearance),ce=editable?' contenteditable="true"':"";
  var desc=renderRichText(card.description,card);
  var artEmpty=card.art?"":'<div class="art-empty">插画区域<br><small>上传图片或使用 AI 生成</small></div>';
  var layoutId=t.baseLayout||t.id;
  var classes=["card","tpl-"+layoutId,"frame-"+a.frameStyle,"texture-"+a.textureStyle,"cost-"+a.costStyle,"rarity-"+a.rarityStyle,"font-"+a.fontStyle].join(" ");
  var style="--p:"+a.primary+";--s:"+a.secondary+";--a:"+a.accent+";--f:"+a.frame+";--t:"+a.text+";--stats-count:"+Math.max(1,t.stats.length)+";--title-size:"+a.titleSize+"px;--title-color:"+a.titleColor+";--title-align:"+a.titleAlign+";--title-weight:"+(a.titleBold?900:500)+";--effect-size:"+a.effectSize+"px;--effect-color:"+a.effectColor+";--effect-align:"+a.effectAlign+";--effect-weight:"+(a.effectBold?800:400)+";--meta-size:"+a.metaSize+"px;--meta-color:"+a.metaColor+";--meta-align:"+a.metaAlign+";--meta-weight:"+(a.metaBold?800:500)+";--stats-size:"+a.statsSize+"px;--stats-color:"+a.statsColor+";--stats-align:"+a.statsAlign+";--stats-weight:"+(a.statsBold?900:500)+";--cost-size:"+a.costSize+"px;--cost-color:"+a.costColor+";--cost-align:"+a.costAlign+";--cost-weight:"+(a.costBold?900:500);
  var frameAsset=assetById(a.frameImageAssetId),textureAsset=assetById(a.textureImageAssetId),iconAsset=assetById(a.iconAssetId);
  var customFrame=frameAsset?'<img class="custom-frame-layer" src="'+esc(frameAsset.dataUrl)+'">':"";
  var customTexture=textureAsset?'<img class="custom-texture-layer" src="'+esc(textureAsset.dataUrl)+'">':"";
  var customIcon=iconAsset?'<img class="card-custom-icon" src="'+esc(iconAsset.dataUrl)+'">':"";
  function lp(key){var p=(card.layout&&card.layout[key])||DEFAULT_LAYOUT[key]||{x:0,y:0,w:10,h:10,r:0,z:20,opacity:1,visible:true};return 'left:'+p.x+'%;top:'+p.y+'%;width:'+p.w+'%;height:'+p.h+'%;z-index:'+p.z+';opacity:'+(p.opacity==null?1:p.opacity)+';transform:rotate('+p.r+'deg)'}
  function handles(){return editable?'<i class="layout-handle resize" data-handle="resize"></i><i class="layout-handle rotate" data-handle="rotate"></i>':""}
  function node(key,cls,inner,attrs){var p=(card.layout&&card.layout[key])||DEFAULT_LAYOUT[key]||{};if(p.visible===false)return "";return '<div class="layout-node '+cls+(p.locked?' locked':'')+'" data-layout-key="'+key+'" style="'+lp(key)+'" '+(attrs||"")+'>'+inner+handles()+'</div>'}
  var statNodes=(t.stats||[]).map(function(st){return node("stat_"+st[0],"stat stat-layer",'<small>'+st[1]+'</small><strong data-edit="'+st[0]+'"'+ce+'>'+esc(card[st[0]])+'</strong>')}).join("");
  var extras=(card.extraElements||[]).map(function(el){
    var p=el.layout||{x:10,y:10,w:30,h:8,r:0,z:18,locked:false,opacity:1,visible:true};if(p.visible===false)return "";
    var base='left:'+p.x+'%;top:'+p.y+'%;width:'+p.w+'%;height:'+p.h+'%;z-index:'+p.z+';opacity:'+(p.opacity==null?1:p.opacity)+';transform:rotate('+p.r+'deg);';
    if(el.kind==="image"){var asset=el.assetId&&assetById(el.assetId),src=el.src||(asset&&asset.dataUrl)||"";return '<div class="layout-node free-image-element '+(p.locked?"locked":"")+'" data-extra-id="'+el.id+'" style="'+base+'"><img src="'+esc(src)+'" alt="'+esc(el.name||"自由素材")+'" draggable="false">'+handles()+'</div>'}
    var inner=esc(resolveVars(el.text||"",card)).replace(/\\n/g,"<br>");
    return '<div class="layout-node free-text-element '+(el.kind==="number"?"number-element ":"")+(el.parentId?"attached-label ":"")+(p.locked?"locked":"")+'" data-extra-id="'+el.id+'" data-parent-id="'+esc(el.parentId||"")+'" style="'+base+'font-size:'+(el.fontSize||11)+'px;color:'+(el.color||a.text)+';text-align:'+(el.align||"left")+'">'+inner+handles()+'</div>'
  }).join("");
  return '<div class="'+classes+'" style="'+style+'">'+customFrame+customTexture+customIcon+
    node("art","art",artEmpty)+ '<div class="shade"></div><div class="texture-layer"></div><div class="trim"></div>'+
    node("cost","cost-badge",'<span data-edit="cost"'+ce+'>'+esc(card.cost)+'</span>')+
    node("title","head title-layer",'<div class="title" data-edit="name"'+ce+'>'+esc(card.name)+'</div>')+
    node("faction","faction faction-layer",'<span data-edit="faction"'+ce+'>'+esc(card.faction)+'</span>')+
    node("rarityMark","rarity-mark rarity-"+a.rarityStyle,raritySymbol(a.rarityStyle),'title="'+esc(card.rarity)+'"')+
    node("type","meta meta-single type-layer",'<span data-edit="unitType"'+ce+'>'+esc(card.unitType)+'</span>')+
    node("rarityText","meta meta-single rarity-text-layer",'<span data-edit="rarity"'+ce+'>'+esc(card.rarity)+'</span>')+
    node("effect","effect",'<span data-edit="description"'+ce+'>'+desc+'</span>')+
    statNodes+node("tags","tags",esc(card.tags))+extras+'</div>';
};
var LAYOUT_LABELS={art:"插画",cost:"费用",title:"名称",faction:"系别",rarityMark:"稀有度标记",type:"类型",rarityText:"稀有度文字",effect:"效果文本",tags:"检索标签",stat_attack:"攻击",stat_health:"血量",stat_move:"移速",stat_range:"射程"};
function layerLabel(card,type,id,element){
  if(type==="extra"){if(element&&element.kind==="image")return "图片："+(element.name||"小素材");if(element&&element.kind==="number")return "编号："+(element.text||"{编号}");return "文字："+String(element&&element.text||"自定义文本").slice(0,12)}
  var t=TEMPLATES[card.templateId]||TEMPLATES.unit;if(id.indexOf("stat_")===0){var field=id.slice(5),st=(t.stats||[]).find(function(x){return x[0]===field});if(st)return st[2]}
  return LAYOUT_LABELS[id]||id;
}
function fixedLayerKeys(card){
  var t=TEMPLATES[card.templateId]||TEMPLATES.unit,keys=["art","cost","title","faction","rarityMark","type","rarityText","effect"];
  (t.stats||[]).forEach(function(st){keys.push("stat_"+st[0])});keys.push("tags");return keys;
}
function allLayerModels(card){
  var out=fixedLayerKeys(card).map(function(k){return {type:"layout",id:k,layout:card.layout[k],label:layerLabel(card,"layout",k)}});
  (card.extraElements||[]).forEach(function(el){out.push({type:"extra",id:el.id,layout:el.layout,element:el,label:layerLabel(card,"extra",el.id,el)})});
  return out.filter(function(x){return x.layout}).sort(function(a,b){return (b.layout.z||0)-(a.layout.z||0)});
}
function selectedModel(card){
  if(!selectedElement)return null;if(selectedElement.type==="extra"){var el=(card.extraElements||[]).find(function(x){return x.id===selectedElement.id});return el?{type:"extra",id:el.id,layout:el.layout,element:el,label:layerLabel(card,"extra",el.id,el)}:null}
  var p=card.layout[selectedElement.id];return p?{type:"layout",id:selectedElement.id,layout:p,label:layerLabel(card,"layout",selectedElement.id)}:null;
}
function renderLayerPanel(){
  var box=$("#layerList");if(!box)return;var c=current(),layers=allLayerModels(c);
  box.innerHTML=layers.map(function(m){var p=m.layout,sel=selectedElement&&selectedElement.type===m.type&&selectedElement.id===m.id;return '<button class="layer-row '+(sel?"selected ":"")+(p.visible===false?"is-hidden ":"")+'" data-layer-type="'+m.type+'" data-layer-id="'+esc(m.id)+'"><span class="layer-eye" data-layer-eye title="显示/隐藏">'+(p.visible===false?"○":"●")+'</span><span class="layer-name">'+esc(m.label)+'</span><span class="layer-meta">Z '+(p.z||0)+' · '+Math.round((p.opacity==null?1:p.opacity)*100)+'%</span><span class="layer-lock" data-layer-lock title="锁定/解锁">'+(p.locked?"🔒":"🔓")+'</span></button>'}).join("");
}
var setArt=function(root,card){
  var art=root.querySelector(".art");
  if(art&&card.art)art.style.backgroundImage='url("'+String(card.art).replace(/"/g,"%22")+'")';
};
var layoutEditing=false,selectedElement=null,dragState=null;
function getElementModel(card,node){
  if(!node)return null;
  var extraId=node.getAttribute("data-extra-id");
  if(extraId){var el=(card.extraElements||[]).find(function(x){return x.id===extraId});return el?{type:"extra",id:extraId,layout:el.layout,element:el}:null}
  var key=node.getAttribute("data-layout-key");return key&&card.layout[key]?{type:"layout",id:key,layout:card.layout[key]}:null;
}
function findSelectedNode(){
  if(!selectedElement)return null;
  return selectedElement.type==="extra"?$('#preview [data-extra-id="'+selectedElement.id+'"]'):$('#preview [data-layout-key="'+selectedElement.id+'"]');
}
function refreshElementPanel(){
  var c=current(),node=findSelectedNode(),m=selectedModel(c),disabled=!m;
  ["#elX","#elY","#elW","#elH","#elR","#elZ","#elOpacity","#toggleElementVisibility","#toggleElementLock","#layerUp","#layerDown","#bringFront","#sendBack","#duplicateElement","#deleteElement"].forEach(function(q){var el=$(q);if(el)el.disabled=disabled});
  $("#selectedLayerName").textContent=m?m.label:"未选择";
  if(!m){$("#elementText").value="";$("#elementText").disabled=true;$("#elOpacity").value=100;$("#elOpacityValue").textContent="100%";$("#addImageLabel").disabled=true;$("#detachImageLabel").disabled=true;$("#imageLabelPosition").disabled=true;$("#imageLabelTools").classList.remove("active");renderLayerPanel();return}
  $("#elX").value=Math.round(m.layout.x*10)/10;$("#elY").value=Math.round(m.layout.y*10)/10;$("#elW").value=Math.round(m.layout.w*10)/10;$("#elH").value=Math.round(m.layout.h*10)/10;$("#elR").value=Math.round(m.layout.r*10)/10;$("#elZ").value=m.layout.z||20;
  var opacity=Math.round((m.layout.opacity==null?1:m.layout.opacity)*100);$("#elOpacity").value=opacity;$("#elOpacityValue").textContent=opacity+"%";
  $("#toggleElementVisibility").textContent=m.layout.visible===false?"显示模块":"隐藏模块";$("#toggleElementLock").textContent=m.layout.locked?"解锁模块":"锁定模块";
  var isExtra=m.type==="extra",isImage=isExtra&&m.element.kind==="image",isAttached=isExtra&&!!m.element.parentId;
  $("#elementText").disabled=!isExtra||isImage;$("#elementText").value=isExtra&&!isImage?(m.element.text||""):"";
  $("#addImageLabel").disabled=!isImage;$("#detachImageLabel").disabled=!isAttached;$("#imageLabelPosition").disabled=!isImage;
  $("#imageLabelTools").classList.toggle("active",isImage||isAttached);
  if(node)node.classList.add("selected");renderLayerPanel();
}
function setLayoutMode(on,focusPanel){
  layoutEditing=!!on;
  $("#preview").classList.toggle("layout-editing",layoutEditing);document.body.classList.toggle("layout-mode-on",layoutEditing);
  $("#safeMode").classList.toggle("active",!layoutEditing);$("#layoutMode").classList.toggle("active",layoutEditing);$("#layoutQuickButton").classList.toggle("active",layoutEditing);
  $("#layoutModeLabel").textContent=layoutEditing?"自由布局":"普通制卡";
  $("#layoutQuickButton").textContent=layoutEditing?"✓ 自由布局已开启":"✥ 进入自由布局";
  $("#stageHint").textContent=layoutEditing?"自由布局已开启：直接点击费用、稀有度、标题等元素后拖动；右下角缩放；上方圆点旋转；方向键微调。":"普通制卡：直接填写内容，不会误移动版式。要调整费用、稀有度等位置，请点击顶部醒目的“自由布局”。";
  $("#layoutPanel").classList.toggle("mode-focus",layoutEditing);
  if(layoutEditing&&focusPanel!==false)setTimeout(function(){$("#layoutPanel").scrollIntoView({behavior:"smooth",block:"center"})},80);
  if(!layoutEditing){selectedElement=null;refreshElementPanel()}
}
function selectLayoutNode(node){
  $$("#preview .layout-node.selected").forEach(function(x){x.classList.remove("selected")});
  var m=getElementModel(current(),node);if(!m){selectedElement=null;refreshElementPanel();return}
  selectedElement={type:m.type,id:m.id};node.classList.add("selected");refreshElementPanel();
}
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function beginLayoutPointer(e,node,mode){
  var m=getElementModel(current(),node);if(!m||m.layout.locked)return;
  e.preventDefault();e.stopPropagation();selectLayoutNode(node);recordHistory();
  var cardEl=$("#preview .card"),rect=cardEl.getBoundingClientRect(),p=m.layout;
  var linked=[];if(m.type==="extra"&&m.element.kind==="image"&&(mode||"move")==="move"){linked=(current().extraElements||[]).filter(function(x){return x.parentId===m.id}).map(function(x){return {element:x,start:clone(x.layout)}})}
  dragState={pointerId:e.pointerId,node:node,mode:mode||"move",model:m,rect:rect,startX:e.clientX,startY:e.clientY,start:clone(p),linked:linked};
  if(mode==="rotate"){var nr=node.getBoundingClientRect();dragState.cx=nr.left+nr.width/2;dragState.cy=nr.top+nr.height/2;dragState.startAngle=Math.atan2(e.clientY-dragState.cy,e.clientX-dragState.cx)*180/Math.PI}
  node.setPointerCapture&&node.setPointerCapture(e.pointerId);
}
function moveLayoutPointer(e){
  if(!dragState)return;var d=dragState,p=d.model.layout,dx=(e.clientX-d.startX)/d.rect.width*100,dy=(e.clientY-d.startY)/d.rect.height*100;
  if(d.mode==="move"){p.x=clamp(d.start.x+dx,-20,120);p.y=clamp(d.start.y+dy,-20,120);(d.linked||[]).forEach(function(x){x.element.layout.x=x.start.x+dx;x.element.layout.y=x.start.y+dy})}
  else if(d.mode==="resize"){p.w=clamp(d.start.w+dx,2,140);p.h=clamp(d.start.h+dy,2,140)}
  else if(d.mode==="rotate"){var a=Math.atan2(e.clientY-d.cy,e.clientX-d.cx)*180/Math.PI;p.r=d.start.r+(a-d.startAngle)}
  renderPreviewOnly();refreshElementPanel();
}
function endLayoutPointer(){if(!dragState)return;dragState=null;persist()}
function addExtra(kind){
  recordHistory();var c=current(),n=(c.extraElements||[]).length+1,text=kind==="number"?(c.cardNumber||("CARD-"+String(n).padStart(3,"0"))):"双击或在右侧编辑文本";
  var el={id:uid(),kind:kind,text:kind==="number"?"{编号}":text,fontSize:kind==="number"?10:12,color:c.appearance.text,align:kind==="number"?"center":"left",layout:{x:kind==="number"?68:15,y:kind==="number"?94:50,w:kind==="number"?27:45,h:kind==="number"?4:9,r:0,z:45,locked:false,opacity:1,visible:true}};
  c.extraElements.push(el);renderPreviewOnly();selectedElement={type:"extra",id:el.id};refreshElementPanel();persist();
}
function addFreeImage(asset){
  recordHistory();if(!asset.id)asset.id=uid();if(!userAssets.some(function(x){return x.id===asset.id}))userAssets.push(asset);
  var c=current(),el={id:uid(),kind:"image",name:asset.name||"图标",assetId:asset.id,src:asset.dataUrl||"",layout:{x:40,y:42,w:20,h:20,r:0,z:18,locked:false,opacity:1,visible:true}};
  c.extraElements.push(el);renderAll();selectedElement={type:"extra",id:el.id};refreshElementPanel();persist();setStatus("小素材已放到卡面：拖动、缩放或旋转即可");
}
function labelLayoutForImage(p,pos){
  var h=6,g=1;if(pos==="center")return {x:p.x,y:p.y+p.h/2-h/2,w:p.w,h:h,r:0,z:(p.z||18)+1,locked:false,opacity:1,visible:true};
  if(pos==="top")return {x:p.x-5,y:p.y-h-g,w:p.w+10,h:h,r:0,z:(p.z||18)+1,locked:false,opacity:1,visible:true};
  if(pos==="bottom")return {x:p.x-5,y:p.y+p.h+g,w:p.w+10,h:h,r:0,z:(p.z||18)+1,locked:false,opacity:1,visible:true};
  if(pos==="left")return {x:p.x-22-g,y:p.y+p.h/2-h/2,w:22,h:h,r:0,z:(p.z||18)+1,locked:false,opacity:1,visible:true};
  return {x:p.x+p.w+g,y:p.y+p.h/2-h/2,w:22,h:h,r:0,z:(p.z||18)+1,locked:false,opacity:1,visible:true};
}
function addLabelToSelectedImage(){
  var n=findSelectedNode(),m=getElementModel(current(),n);if(!m||m.type!=="extra"||m.element.kind!=="image"){setStatus("请先在卡面选中一个图标或小素材");return}
  recordHistory();var pos=$("#imageLabelPosition").value,el={id:uid(),kind:"text",text:"输入文字",fontSize:11,color:current().appearance.text,align:"center",parentId:m.id,labelPosition:pos,layout:labelLayoutForImage(m.layout,pos)};
  current().extraElements.push(el);renderPreviewOnly();selectedElement={type:"extra",id:el.id};refreshElementPanel();$("#elementText").focus();$("#elementText").select();persist();setStatus("文字已添加；现在直接输入即可，移动图标时文字会跟随");
}
var renderPreviewOnly=function(){
  var c=current(),t=TEMPLATES[c.templateId];
  $("#preview").innerHTML=cardHtml(c,true);setArt($("#preview"),c);$("#preview").classList.toggle("layout-editing",layoutEditing);renderLayerPanel();
  $("#templateName").textContent=t.name;
};
var TEXT_TARGETS={title:"title",effect:"effect",meta:"meta",stats:"stats",cost:"cost"};
function refreshTextControls(){
  var target=$("#textTarget")?$("#textTarget").value:"title",prefix=TEXT_TARGETS[target]||"title",a=current().appearance;
  if($("#textSize"))$("#textSize").value=a[prefix+"Size"];
  if($("#textColor"))$("#textColor").value=a[prefix+"Color"];
  if($("#textAlign"))$("#textAlign").value=a[prefix+"Align"];
  if($("#textBold"))$("#textBold").checked=!!a[prefix+"Bold"];
}
function setTextStyleValue(suffix,value,record){
  var prefix=TEXT_TARGETS[$("#textTarget").value]||"title";
  if(record!==false)recordHistory();
  current().appearance[prefix+suffix]=value;renderPreviewOnly();persist();
}
var renderCard=function(){
  var c=current(),t=TEMPLATES[c.templateId];
  renderPreviewOnly();
  $("#typeLabel").childNodes[0].nodeValue=t.typeLabel;
  $$("[data-form]").forEach(function(el){var f=el.getAttribute("data-form");el.value=c[f]==null?"":c[f]});
  $("#description").value=c.description||"";
  $("#dynamicStats").innerHTML=t.stats.map(function(s){return '<label>'+s[2]+'<input type="number" data-stat="'+s[0]+'" value="'+esc(c[s[0]])+'"></label>'}).join("");
  $$("[data-color]").forEach(function(el){el.value=c.appearance[el.getAttribute("data-color")]});
  refreshTextControls();refreshElementPanel();renderTermQuickList();
  renderTemplates();renderAssets();renderSkins();
};
var renderExport=function(card){$("#exportCard").innerHTML=cardHtml(card,false);setArt($("#exportCard"),card);$("#exportCard").classList.remove("layout-editing")}
var getVisibleCards=function(){
  var q=$("#cardSearch").value.trim().toLowerCase(),filter=$("#templateFilter").value,faction=$("#factionFilter").value,rarity=$("#rarityFilter").value,sort=$("#sortCards").value;
  var list=cards.filter(function(c){
    var t=TEMPLATES[c.templateId]||TEMPLATES.unit;
    return (filter==="all"||c.templateId===filter)&&(faction==="all"||c.faction===faction)&&(rarity==="all"||c.rarity===rarity)&&(!q||[c.cardNumber,c.name,t.name,c.faction,c.unitType,c.rarity,c.tags,c.rulesKeywords,c.description].join(" ").toLowerCase().indexOf(q)>=0);
  });
  if(sort!=="manual")list=list.slice().sort(function(a,b){
    var av,bv;
    if(sort==="template"){av=TEMPLATES[a.templateId].name;bv=TEMPLATES[b.templateId].name}
    else{av=a[sort];bv=b[sort]}
    if(sort==="cost")return num(av)-num(bv);
    return String(av||"").localeCompare(String(bv||""),"zh-CN");
  });
  return list;
};
var renderList=function(){
  var list=getVisibleCards();
  $("#count").textContent=list.length+"/"+cards.length+" 张";
  $("#cardList").innerHTML=list.map(function(c,i){
    var t=TEMPLATES[c.templateId]||TEMPLATES.unit;
    return '<button class="card-row '+(c.id===selected?"active":"")+'" data-id="'+c.id+'"><span class="n">'+String(i+1).padStart(2,"0")+'</span><span><strong>'+esc(c.name)+'</strong><small>'+esc(t.short)+' · '+esc(c.faction)+' · '+esc(c.rarity)+'</small></span><span class="cost">'+esc(c.cost)+'</span></button>';
  }).join("");
  $("#delete").disabled=cards.length<=1;
};
var renderTemplateFilter=function(){
  var old=$("#templateFilter").value,oldFaction=$("#factionFilter").value,oldRarity=$("#rarityFilter").value;
  $("#templateFilter").innerHTML='<option value="all">全部模板</option>'+Object.keys(TEMPLATES).map(function(k){return '<option value="'+k+'">'+esc(TEMPLATES[k].name)+'</option>'}).join("");$("#templateFilter").value=TEMPLATES[old]?old:"all";
  var factions=Array.from(new Set(cards.map(function(c){return c.faction}).filter(Boolean))).sort(),rarities=Array.from(new Set(cards.map(function(c){return c.rarity}).filter(Boolean))).sort();
  $("#factionFilter").innerHTML='<option value="all">全部系别</option>'+factions.map(function(x){return '<option>'+esc(x)+'</option>'}).join("");$("#factionFilter").value=factions.indexOf(oldFaction)>=0?oldFaction:"all";
  $("#rarityFilter").innerHTML='<option value="all">全部稀有度</option>'+rarities.map(function(x){return '<option>'+esc(x)+'</option>'}).join("");$("#rarityFilter").value=rarities.indexOf(oldRarity)>=0?oldRarity:"all";
};
var renderTemplates=function(){
  var c=current();
  $("#templateCards").innerHTML=Object.keys(TEMPLATES).map(function(k){
    var t=TEMPLATES[k];
    return '<button class="template-card '+(c.templateId===k?"active":"")+'" data-template="'+k+'"><strong>'+t.name+'</strong><small>'+t.hint+'</small></button>';
  }).join("");
};
var selectedAssetId=function(category){
  var a=current().appearance;
  if(category==="frame")return a.frameStyle;
  if(category==="texture")return a.textureStyle;
  if(category==="cost")return a.costStyle;
  if(category==="rarity")return a.rarityStyle;
  return a.fontStyle;
};
var renderAssets=function(){
  var q=$("#assetSearch").value.trim().toLowerCase(),cat=$("#assetCategory").value,items=[];
  Object.keys(COMPONENTS).forEach(function(category){
    if(cat!=="all"&&cat!==category)return;
    COMPONENTS[category].forEach(function(x){
      if(q&&[x.name,x.keywords,CATEGORY_NAMES[category]].join(" ").toLowerCase().indexOf(q)<0)return;
      items.push({category:category,item:x});
    });
  });
  items.sort(function(a,b){
    var af=favoriteAssets.indexOf(a.category+":"+a.item.id)>=0,bf=favoriteAssets.indexOf(b.category+":"+b.item.id)>=0;
    return Number(bf)-Number(af);
  });
  $("#assetList").innerHTML=items.map(function(x){
    var key=x.category+":"+x.item.id,fav=favoriteAssets.indexOf(key)>=0,active=selectedAssetId(x.category)===x.item.id;
    return '<div class="asset-item"><button class="asset-main '+(active?"active":"")+'" data-asset="'+key+'"><strong>'+esc(x.item.name)+'</strong><small>'+CATEGORY_NAMES[x.category]+'</small></button><button class="asset-fav" data-asset-fav="'+key+'">'+(fav?"★":"☆")+'</button></div>';
  }).join("");
};
var appearanceEqual=function(a,b){return JSON.stringify(normalizeAppearance(a))===JSON.stringify(normalizeAppearance(b))};
var renderSkins=function(){
  var q=$("#skinSearch").value.trim().toLowerCase(),c=current();
  var list=skins.filter(function(s){return !q||s.name.toLowerCase().indexOf(q)>=0}).slice().sort(function(a,b){return Number(!!b.favorite)-Number(!!a.favorite)});
  $("#skinList").innerHTML=list.map(function(s){
    var a=s.appearance,grad="linear-gradient(135deg,"+a.primary+","+a.secondary+" 55%,"+a.accent+")";
    return '<div class="skin-item '+(appearanceEqual(c.appearance,a)?"active":"")+'"><button class="skin-main" data-skin="'+s.id+'"><span class="swatch" style="background:'+grad+'"></span><span>'+esc(s.name)+'</span></button><button class="skin-fav" data-skin-fav="'+s.id+'">'+(s.favorite?"★":"☆")+'</button></div>';
  }).join("");
};
var renderSnapshots=function(){
  $("#snapshotList").innerHTML=snapshots.length?snapshots.slice(0,8).map(function(s){
    return '<div class="snapshot-item"><div><strong>'+esc(s.label)+'</strong><small>'+esc(s.time)+'</small></div><button data-restore="'+s.id+'">恢复</button></div>';
  }).join(""):'<div class="empty-note">还没有快照。大改之前点“保存”。</div>';
};
var renderCustomAssets=function(){var box=$("#customAssetList");if(!box)return;var q=$("#assetSearch").value.trim().toLowerCase(),cat=$("#assetCategory").value;var list=userAssets.filter(function(a){var catOk=cat==="all"||cat==="custom"||(cat==="frame"&&a.category==="frameImage")||(cat==="texture"&&a.category==="textureImage")||(cat==="icon"&&a.category==="icon");return catOk&&(!q||[a.name,a.category].join(" ").toLowerCase().indexOf(q)>=0)}).slice().sort(function(a,b){return Number(!!b.favorite)-Number(!!a.favorite)});box.innerHTML=list.length?list.map(function(a){var label=a.category==="icon"?"卡面图标":a.category==="frameImage"?"图片边框":"图片底纹",place=a.category==="icon"?'<button data-place-custom="'+a.id+'">放到卡面</button>':"";return '<div class="custom-asset"><img src="'+esc(a.dataUrl)+'"><div><strong>'+esc(a.name)+'</strong><small>'+esc(label)+'</small></div><div class="asset-mini-actions">'+place+'<button data-apply-custom="'+a.id+'">应用</button><button data-fav-custom="'+a.id+'">'+(a.favorite?"★":"☆")+'</button><button data-remove-custom="'+a.id+'">删</button></div></div>'}).join(""):'<div class="empty-note">没有匹配的自定义图片素材。</div>'};
var renderAll=function(){$("#projectName").value=projectName;$("#sheetSize").value=printSettings.sheet;$("#cropMarks").checked=!!printSettings.crop;renderTemplateFilter();renderList();renderCard();renderSnapshots();renderCustomAssets();updateHistoryButtons();persist()};

var patch=function(field,value,record){
  var c=current();if(!c)return;
  if(record!==false)recordHistory();
  if(["cost","attack","health","move","range"].indexOf(field)>=0)value=num(value,0);
  c[field]=value;renderCard();renderList();persist();
};
var patchAppearance=function(field,value){
  recordHistory();current().appearance=normalizeAppearance(current().appearance);current().appearance[field]=value;renderCard();persist();
};
var setTemplate=function(id){
  if(!TEMPLATES[id]||current().templateId===id)return;
  recordHistory();current().templateId=id;
  if(!current().unitType||["单位","法术","建筑","事件"].indexOf(current().unitType)>=0)current().unitType=TEMPLATES[id].short;
  renderAll();setStatus("已切换为"+TEMPLATES[id].name+"，布局自动适配");
};

$("#safeMode").onclick=function(){setLayoutMode(false)};
$("#layoutMode").onclick=function(){setLayoutMode(true,true)};
$("#layoutQuickButton").onclick=function(){setLayoutMode(!layoutEditing,true)};
$("#preview").addEventListener("pointerdown",function(e){
  if(!layoutEditing)return;var handle=e.target.closest("[data-handle]"),node=e.target.closest(".layout-node");if(!node)return;
  beginLayoutPointer(e,node,handle?handle.getAttribute("data-handle"):"move");
});
window.addEventListener("pointermove",moveLayoutPointer);window.addEventListener("pointerup",endLayoutPointer);window.addEventListener("pointercancel",endLayoutPointer);
$("#preview").addEventListener("click",function(e){if(layoutEditing){var n=e.target.closest(".layout-node");if(n){e.preventDefault();e.stopPropagation();selectLayoutNode(n)}}});
["X","Y","W","H","R","Z"].forEach(function(k){$("#el"+k).addEventListener("change",function(){var m=selectedModel(current());if(!m)return;recordHistory();var map={X:"x",Y:"y",W:"w",H:"h",R:"r",Z:"z"};m.layout[map[k]]=num(this.value,m.layout[map[k]]);renderPreviewOnly();refreshElementPanel();persist()})});
$("#elOpacity").addEventListener("pointerdown",function(){if(selectedModel(current()))recordHistory()});$("#elOpacity").addEventListener("input",function(){var m=selectedModel(current());if(!m)return;m.layout.opacity=clamp(num(this.value,100)/100,0,1);$("#elOpacityValue").textContent=Math.round(m.layout.opacity*100)+"%";renderPreviewOnly();refreshElementPanel();persist()});
$("#addTextElement").onclick=function(){setLayoutMode(true);addExtra("text")};$("#addNumberElement").onclick=function(){setLayoutMode(true);addExtra("number")};
$("#addImageElement").onclick=function(){setLayoutMode(true,false);$("#freeImageFile").click()};
$("#freeImageFile").onchange=async function(){var f=this.files&&this.files[0];if(!f)return;try{var asset={id:uid(),name:f.name.replace(/\.[^.]+$/,""),category:"icon",dataUrl:await fileToDataUrl(f)};addFreeImage(asset)}catch(e){setStatus("导入小素材失败："+e.message)}this.value=""};
$("#addImageLabel").onclick=addLabelToSelectedImage;
$("#detachImageLabel").onclick=function(){var m=selectedModel(current());if(!m||m.type!=="extra"||!m.element.parentId)return;recordHistory();m.element.parentId="";m.element.labelPosition="";renderPreviewOnly();refreshElementPanel();persist();setStatus("文字已解除跟随，现在可以完全独立摆放")};
$("#elementText").addEventListener("input",function(){var m=selectedModel(current());if(m&&m.type==="extra"){m.element.text=this.value;renderPreviewOnly();persist()}});
$("#elementText").addEventListener("focus",function(){if(!this.disabled)recordHistory()});
$("#toggleElementVisibility").onclick=function(){var m=selectedModel(current());if(!m)return;recordHistory();m.layout.visible=m.layout.visible===false?true:false;renderPreviewOnly();refreshElementPanel();persist()};
$("#toggleElementLock").onclick=function(){var m=selectedModel(current());if(!m)return;recordHistory();m.layout.locked=!m.layout.locked;renderPreviewOnly();refreshElementPanel();persist()};
function moveSelectedLayer(delta){var m=selectedModel(current());if(!m)return;recordHistory();m.layout.z=Math.max(2,(m.layout.z||20)+delta);renderPreviewOnly();refreshElementPanel();persist()}
$("#layerUp").onclick=function(){moveSelectedLayer(1)};$("#layerDown").onclick=function(){moveSelectedLayer(-1)};
$("#bringFront").onclick=function(){var m=selectedModel(current());if(!m)return;recordHistory();var max=Math.max.apply(null,allLayerModels(current()).map(function(x){return x.layout.z||0}));m.layout.z=max+1;renderPreviewOnly();refreshElementPanel();persist()};
$("#sendBack").onclick=function(){var m=selectedModel(current());if(!m)return;recordHistory();m.layout.z=2;renderPreviewOnly();refreshElementPanel();persist()};
$("#deleteElement").onclick=function(){if(!selectedElement||selectedElement.type!=="extra"){setStatus("模板字段不能删除，可锁定或移出画布；只有自定义元素可以删除");return}recordHistory();var id=selectedElement.id,el=current().extraElements.find(function(x){return x.id===id});current().extraElements=current().extraElements.filter(function(x){return x.id!==id&&!(el&&el.kind==="image"&&x.parentId===id)});selectedElement=null;renderPreviewOnly();refreshElementPanel();persist()};
$("#duplicateElement").onclick=function(){var m=selectedModel(current());if(!m)return;recordHistory();if(m.type==="extra"){var x=clone(m.element),oldId=x.id;x.id=uid();x.layout.x+=3;x.layout.y+=3;current().extraElements.push(x);if(x.kind==="image"){current().extraElements.filter(function(e){return e.parentId===oldId}).forEach(function(e){var y=clone(e);y.id=uid();y.parentId=x.id;y.layout.x+=3;y.layout.y+=3;current().extraElements.push(y)})}selectedElement={type:"extra",id:x.id}}else{var tokenMap={cost:"费用",title:"名称",faction:"系别",rarityText:"稀有度",type:"兵种",stat_attack:"攻击",stat_health:"血量",stat_move:"移速",stat_range:"射程"},x={id:uid(),kind:"text",text:"{"+(tokenMap[m.id]||"名称")+"}",fontSize:12,color:current().appearance.text,align:"left",layout:clone(m.layout)};x.layout.x+=3;x.layout.y+=3;x.layout.z=45;current().extraElements.push(x);selectedElement={type:"extra",id:x.id}}renderPreviewOnly();refreshElementPanel();persist()};
$("#resetLayout").onclick=function(){recordHistory();current().layout=makeLayout();renderPreviewOnly();selectedElement=null;refreshElementPanel();persist();setStatus("已恢复当前卡牌的模板默认布局")};
$("#copyLayoutAll").onclick=function(){var c=current(),tid=c.templateId;recordHistory();cards.forEach(function(x){if(x.templateId===tid&&x.id!==c.id)x.layout=clone(c.layout)});renderAll();setStatus("布局已应用到同模板卡牌")};
window.addEventListener("keydown",function(e){
  var tag=document.activeElement&&document.activeElement.tagName;
  if((e.key==="l"||e.key==="L")&&["INPUT","TEXTAREA","SELECT"].indexOf(tag)<0){e.preventDefault();setLayoutMode(!layoutEditing,true);return}
});
window.addEventListener("keydown",function(e){if(!layoutEditing||!selectedElement||["INPUT","TEXTAREA"].indexOf(document.activeElement.tagName)>=0)return;var m=selectedModel(current());if(!m||m.layout.locked)return;if(e.key==="Delete"&&selectedElement.type==="extra"){$("#deleteElement").click();return}var step=e.shiftKey?1:0.2,used=true;if(e.key==="ArrowLeft")m.layout.x-=step;else if(e.key==="ArrowRight")m.layout.x+=step;else if(e.key==="ArrowUp")m.layout.y-=step;else if(e.key==="ArrowDown")m.layout.y+=step;else used=false;if(used){e.preventDefault();renderPreviewOnly();refreshElementPanel();persist()}});
$("#preview").addEventListener("focusin",function(e){
  var f=e.target&&e.target.getAttribute&&e.target.getAttribute("data-edit");
  if(f==="description")e.target.textContent=current().description||"";
});
$("#preview").addEventListener("focusout",function(e){
  var f=e.target&&e.target.getAttribute&&e.target.getAttribute("data-edit");if(f)patch(f,e.target.innerText.trim(),true);
});
$("#layerList").addEventListener("click",function(e){var row=e.target.closest("[data-layer-id]");if(!row)return;setLayoutMode(true,false);selectedElement={type:row.getAttribute("data-layer-type"),id:row.getAttribute("data-layer-id")};var m=selectedModel(current());if(!m)return;if(e.target.closest("[data-layer-eye]")){recordHistory();m.layout.visible=m.layout.visible===false?true:false;renderPreviewOnly();refreshElementPanel();persist();return}if(e.target.closest("[data-layer-lock]")){recordHistory();m.layout.locked=!m.layout.locked;renderPreviewOnly();refreshElementPanel();persist();return}$("#preview .layout-node.selected").forEach(function(x){x.classList.remove("selected")});var node=findSelectedNode();if(node)node.classList.add("selected");refreshElementPanel()});
$("#cardList").addEventListener("click",function(e){var b=e.target.closest("[data-id]");if(!b)return;selected=b.getAttribute("data-id");renderAll()});
$("#projectName").addEventListener("change",function(){projectName=this.value.trim()||"未命名卡牌项目";this.value=projectName;persist()});
$("#cardSearch").addEventListener("input",renderList);$("#templateFilter").addEventListener("change",renderList);$("#factionFilter").addEventListener("change",renderList);$("#rarityFilter").addEventListener("change",renderList);$("#sortCards").addEventListener("change",renderList);
$$("[data-form]").forEach(function(el){
  el.addEventListener("focus",recordHistory);
  el.addEventListener("change",function(){patch(el.getAttribute("data-form"),el.value,false)});
  el.addEventListener("input",function(){
    var c=current(),f=el.getAttribute("data-form");
    c[f]=["cost","attack","health","move","range"].indexOf(f)>=0?num(el.value,0):el.value;
    renderPreviewOnly();renderList();persist();
  });
});
$("#dynamicStats").addEventListener("focusin",function(e){if(e.target.getAttribute("data-stat"))recordHistory()});
$("#dynamicStats").addEventListener("change",function(e){var f=e.target.getAttribute("data-stat");if(f)patch(f,e.target.value,false)});
$("#dynamicStats").addEventListener("input",function(e){var f=e.target.getAttribute("data-stat");if(f){current()[f]=num(e.target.value,0);renderPreviewOnly();renderList();persist()}});
$("#description").addEventListener("focus",recordHistory);
$("#description").addEventListener("change",function(){patch("description",this.value,false)});
$("#description").addEventListener("input",function(){current().description=this.value;renderPreviewOnly();persist()});
Object.keys(vars).forEach(function(v){var b=document.createElement("button");b.textContent="{"+v+"}";b.onclick=function(){patch("description",(current().description||"")+"{"+v+"}",true)};$("#variables").appendChild(b)});

var selectedRuleTermId=null;
function termUseCount(name){return cards.reduce(function(n,c){return n+extractRuleTerms(c.description).filter(function(x){return x.toLowerCase()===String(name).toLowerCase()}).length},0)}
function cardsUsingTerm(name){return cards.filter(function(c){return extractRuleTerms(c.description).some(function(x){return x.toLowerCase()===String(name).toLowerCase()})})}
function renderTermQuickList(){
  var box=$("#termQuickList");if(!box)return;
  var list=ruleTerms.slice().sort(function(a,b){return termUseCount(b.name)-termUseCount(a.name)||String(a.name).localeCompare(String(b.name),"zh-CN")}).slice(0,12);
  box.innerHTML=list.length?list.map(function(t){return '<button data-quick-term="'+t.id+'" title="'+esc(t.description||"点击插入词条")+'" style="color:'+esc(t.color||"#38bdf8")+'">'+esc(t.name)+'</button>'}).join(""):'<span class="empty-note">还没有规则词条。选中效果中的词语后点击“设为规则词条”。</span>';
}
function fillTermEditor(term){
  selectedRuleTermId=term&&term.id||null;$("#termId").value=selectedRuleTermId||"";$("#termName").value=term?term.name:"";$("#termColor").value=term&&term.color?term.color:$("#termQuickColor").value;$("#termCategory").value=term&&term.category||"";$("#termTags").value=term&&term.tags||"";$("#termDescription").value=term&&term.description||"";
  var usage=term?cardsUsingTerm(term.name):[];$("#termUsage").innerHTML=term?'<b>使用 '+usage.length+' 张卡牌</b><div class="usage-cards">'+usage.slice(0,20).map(function(c){return '<button data-term-card="'+c.id+'">'+esc(c.cardNumber?c.cardNumber+" · "+c.name:c.name)+'</button>'}).join("")+'</div>':"新建词条后，可在这里查看哪些卡牌使用了它。";
  $("#deleteRuleTerm").disabled=!term;$("#insertRuleTerm").disabled=!term;
}
function renderRuleTermLibrary(){
  var q=$("#termSearch").value.trim().toLowerCase(),list=ruleTerms.filter(function(t){return !q||[t.name,t.category,t.tags,t.description].join(" ").toLowerCase().indexOf(q)>=0}).sort(function(a,b){return String(a.category||"").localeCompare(String(b.category||""),"zh-CN")||String(a.name).localeCompare(String(b.name),"zh-CN")});
  $("#termLibraryCount").textContent="找到 "+list.length+" / "+ruleTerms.length+" 个词条";
  $("#termList").innerHTML=list.length?list.map(function(t){return '<button class="term-row '+(t.id===selectedRuleTermId?"active":"")+'" data-term-id="'+t.id+'"><i class="term-dot" style="background:'+esc(t.color||"#38bdf8")+'"></i><span><strong>'+esc(t.name)+'</strong><small>'+esc(t.category||"未分类")+' · '+esc(t.tags||"无标签")+'</small></span><em>'+termUseCount(t.name)+' 卡</em></button>'}).join(""):'<div class="empty-note">没有匹配词条。</div>';
}
function openTermLibrary(term){
  $("#ruleTermsModal").hidden=false;$("#termSearch").value="";
  fillTermEditor(term||ruleTerms.find(function(t){return t.id===selectedRuleTermId})||ruleTerms[0]||null);renderRuleTermLibrary();
}
function insertDescriptionToken(name,start,end){
  var ta=$("#description"),text=ta.value,token="[[ "+name+" ]]".replace(/\[\[ /,"[[").replace(/ \]\]/,"]]");
  start=start==null?ta.selectionStart:start;end=end==null?ta.selectionEnd:end;recordHistory();ta.value=text.slice(0,start)+token+text.slice(end);current().description=ta.value;renderPreviewOnly();persist();ta.focus();ta.setSelectionRange(start+token.length,start+token.length);
}
function ensureTerm(name,color){
  name=String(name||"").trim();if(!name)return null;var term=termByName(name);
  if(term){term.color=color||term.color;return term}
  term={id:uid(),name:name,color:color||"#38bdf8",category:"",tags:"",description:""};ruleTerms.push(term);return term;
}
$("#markRuleTerm").onclick=function(){
  var ta=$("#description"),start=ta.selectionStart,end=ta.selectionEnd,name=ta.value.slice(start,end).trim();
  if(!name){setStatus("请先在“卡牌效果”文本框中选中一个词语");ta.focus();return}
  if(name.length>40||name.indexOf("\n")>=0){setStatus("规则词条应是简短词语，请重新选择");return}
  name=name.replace(/^\[\[|\]\]$/g,"").trim();recordHistory();var term=ensureTerm(name,$("#termQuickColor").value);
  var token="[["+name+"]]",raw=ta.value;ta.value=raw.slice(0,start)+token+raw.slice(end);current().description=ta.value;selectedRuleTermId=term.id;renderPreviewOnly();renderTermQuickList();persist();setStatus("已标记规则词条："+name);ta.focus();ta.setSelectionRange(start+token.length,start+token.length);
};
$("#termQuickList").onclick=function(e){var b=e.target.closest("[data-quick-term]");if(!b)return;var t=ruleTerms.find(function(x){return x.id===b.getAttribute("data-quick-term")});if(t)insertDescriptionToken(t.name)};
$("#insertKnownTerm").onclick=function(){if(!ruleTerms.length){openTermLibrary();setStatus("词条库还是空的，请先建立一个规则词条");return}openTermLibrary()};
$("#autoMarkTerms").onclick=function(){var before=current().description,after=autoMarkKnownTerms(before);if(after===before){setStatus("当前效果中没有发现尚未标记的已知词条");return}recordHistory();current().description=after;$("#description").value=after;renderPreviewOnly();persist();setStatus("已自动识别当前卡牌中的规则词条")};
$("#autoMarkAllCards").onclick=function(){if(!ruleTerms.length)return;recordHistory();var changed=0;cards.forEach(function(c){var x=autoMarkKnownTerms(c.description);if(x!==c.description){c.description=x;changed++}});renderAll();renderRuleTermLibrary();setStatus("已自动识别 "+changed+" 张卡牌中的规则词条")};
$("#openRuleTerms").onclick=function(){openTermLibrary()};
$("#closeRuleTerms").onclick=function(){$("#ruleTermsModal").hidden=true};
$("#ruleTermsModal").addEventListener("click",function(e){if(e.target===this)this.hidden=true});
$("#termSearch").addEventListener("input",renderRuleTermLibrary);
$("#newRuleTerm").onclick=function(){fillTermEditor(null);renderRuleTermLibrary();$("#termName").focus()};
$("#termList").onclick=function(e){var b=e.target.closest("[data-term-id]");if(!b)return;var t=ruleTerms.find(function(x){return x.id===b.getAttribute("data-term-id")});if(t){fillTermEditor(t);renderRuleTermLibrary()}};
$("#saveRuleTerm").onclick=function(){
  var name=$("#termName").value.trim();if(!name){setStatus("词条名称不能为空");return}var duplicate=ruleTerms.find(function(x){return x.id!==selectedRuleTermId&&String(x.name).toLowerCase()===name.toLowerCase()});if(duplicate){setStatus("已经存在同名词条："+duplicate.name);return}var old=ruleTerms.find(function(x){return x.id===selectedRuleTermId}),oldName=old&&old.name;
  recordHistory();var term=old||{id:uid()};term.name=name;term.color=$("#termColor").value;term.category=$("#termCategory").value.trim();term.tags=$("#termTags").value.trim();term.description=$("#termDescription").value.trim();if(!old)ruleTerms.push(term);
  if(oldName&&oldName!==name){var from="[["+oldName+"]]",to="[["+name+"]]";cards.forEach(function(c){c.description=String(c.description||"").split(from).join(to)})}
  selectedRuleTermId=term.id;renderAll();fillTermEditor(term);renderRuleTermLibrary();setStatus("词条已保存："+name);
};
$("#deleteRuleTerm").onclick=function(){var term=ruleTerms.find(function(x){return x.id===selectedRuleTermId});if(!term)return;recordHistory();var token="[["+term.name+"]]";cards.forEach(function(c){c.description=String(c.description||"").split(token).join(term.name)});ruleTerms=ruleTerms.filter(function(x){return x.id!==term.id});selectedRuleTermId=null;renderAll();fillTermEditor(ruleTerms[0]||null);renderRuleTermLibrary();setStatus("词条已删除，卡牌中的引用已转为普通文字")};
$("#insertRuleTerm").onclick=function(){var term=ruleTerms.find(function(x){return x.id===selectedRuleTermId});if(!term)return;insertDescriptionToken(term.name);$("#ruleTermsModal").hidden=true;setStatus("已插入词条："+term.name)};
$("#termUsage").onclick=function(e){var b=e.target.closest("[data-term-card]");if(!b)return;selected=b.getAttribute("data-term-card");$("#ruleTermsModal").hidden=true;renderAll();setStatus("已定位使用该词条的卡牌："+current().name)};
$("#preview").addEventListener("dblclick",function(e){var span=e.target.closest(".rule-term");if(!span)return;var term=termByName(span.getAttribute("data-rule-term"));if(term)openTermLibrary(term)});
$("#preview").addEventListener("dblclick",function(e){if(!layoutEditing)return;var node=e.target.closest(".free-image-element");if(!node)return;e.preventDefault();selectLayoutNode(node);addLabelToSelectedImage()});
$("#textTarget").addEventListener("change",refreshTextControls);
$("#textSize").addEventListener("change",function(){setTextStyleValue("Size",Math.max(8,Math.min(40,num(this.value,13))),true)});
$("#textColor").addEventListener("change",function(){setTextStyleValue("Color",this.value,true)});
$("#textAlign").addEventListener("change",function(){setTextStyleValue("Align",this.value,true)});
$("#textBold").addEventListener("change",function(){setTextStyleValue("Bold",this.checked,true)});
$("#applyTextAll").onclick=function(){
  var prefix=TEXT_TARGETS[$("#textTarget").value]||"title",src=current().appearance;recordHistory();
  cards.forEach(function(c){c.appearance[prefix+"Size"]=src[prefix+"Size"];c.appearance[prefix+"Color"]=src[prefix+"Color"];c.appearance[prefix+"Align"]=src[prefix+"Align"];c.appearance[prefix+"Bold"]=src[prefix+"Bold"]});
  renderAll();setStatus("当前文字样式已应用到全部卡牌");
};

$("#templateCards").addEventListener("click",function(e){var b=e.target.closest("[data-template]");if(b)setTemplate(b.getAttribute("data-template"))});
$("#newCard").onclick=function(){recordHistory();var c=makeCard(current().templateId);c.appearance=clone(current().appearance);cards.push(c);selected=c.id;renderAll();setStatus("已创建"+TEMPLATES[c.templateId].name)};
$("#duplicate").onclick=function(){recordHistory();var c=clone(current());c.id=uid();c.name=current().name+" - 副本";cards.push(c);selected=c.id;renderAll();setStatus("已复制卡牌")};
$("#delete").onclick=function(){if(cards.length<=1)return;recordHistory();cards=cards.filter(function(c){return c.id!==selected});selected=cards[0].id;renderAll();setStatus("已删除卡牌")};

$("#undoBtn").onclick=function(){if(!history.length)return;future.push(stateSnapshot());var prev=history.pop();restoreState(prev);setStatus("已撤销")};
$("#redoBtn").onclick=function(){if(!future.length)return;history.push(stateSnapshot());var next=future.pop();restoreState(next);setStatus("已重做")};

$("#saveSnapshot").onclick=function(){
  snapshots.unshift({id:uid(),time:nowText(),label:"版本 "+(snapshots.length+1),state:stateSnapshot()});snapshots=snapshots.slice(0,12);renderSnapshots();persist();setStatus("已保存本地版本快照");
};
$("#snapshotList").addEventListener("click",function(e){
  var b=e.target.closest("[data-restore]");if(!b)return;var s=snapshots.find(function(x){return x.id===b.getAttribute("data-restore")});if(!s)return;
  recordHistory();restoreState(s.state);setStatus("已恢复："+s.label);
});

$("#importBtn").onclick=function(){$("#importFile").click()};
$("#importFile").onchange=async function(){
  var file=this.files&&this.files[0];if(!file)return;setStatus("正在导入...");
  try{
    var rows=[],name=file.name.toLowerCase();
    if(name.endsWith(".json")){var parsed=JSON.parse(await file.text());rows=Array.isArray(parsed)?parsed:(Array.isArray(parsed.cards)?parsed.cards:[])}
    else if(name.endsWith(".xlsx")||name.endsWith(".xls")){var wb=XLSX.read(await file.arrayBuffer(),{type:"array"}),ws=wb.Sheets[wb.SheetNames[0]];rows=XLSX.utils.sheet_to_json(ws)}
    else rows=Papa.parse(await file.text(),{header:true,skipEmptyLines:true}).data;
    var pick=function(r,keys,fallback){for(var i=0;i<keys.length;i++){var k=keys[i];if(r[k]!==undefined&&r[k]!==null&&String(r[k]).trim()!=="")return r[k]}return fallback};
    var imported=rows.map(function(r){
      var templateRaw=String(pick(r,["template","模板","卡牌类型"],"unit")).toLowerCase();
      var tid=templateRaw.indexOf("法术")>=0?"spell":templateRaw.indexOf("建筑")>=0?"building":templateRaw.indexOf("事件")>=0?"event":(TEMPLATES[templateRaw]?templateRaw:"unit");
      var c=makeCard(tid,String(pick(r,["name","名称","卡牌名称"],"未命名卡牌")));
      c.cost=num(pick(r,["cost","费用"],0));c.faction=String(pick(r,["faction","系别","阵营"],"中立"));
      c.description=String(pick(r,["description","描述","效果","卡牌效果"],""));c.attack=num(pick(r,["attack","攻击","威力","火力"],0));
      c.health=num(pick(r,["health","血量","生命","耐久"],0));c.move=num(pick(r,["move","移速","移动"],0));c.range=num(pick(r,["range","射程"],0));
      c.unitType=String(pick(r,["unitType","兵种","类型","法术类型","建筑类型","事件类型"],TEMPLATES[tid].short));
      c.rarity=String(pick(r,["rarity","稀有度"],"普通"));c.tags=String(pick(r,["tags","关键词","标签"],""));c.rulesKeywords=String(pick(r,["rulesKeywords","规则关键词","规则标签"],""));c.cardNumber=String(pick(r,["cardNumber","编号","卡号","ID"],""));c.art=String(pick(r,["art","插画","图片","背景"],""));
      c.appearance=clone(current().appearance);return c;
    }).filter(function(c){return c.name});
    if(!imported.length)throw new Error("没有读取到卡牌数据");
    recordHistory();cards=imported;selected=cards[0].id;renderAll();setStatus("已导入 "+cards.length+" 张卡牌");
  }catch(err){setStatus("导入失败："+(err.message||"未知错误"))}
  this.value="";
};

$("#uploadArt").onclick=function(){$("#artFile").click()};
$("#artFile").onchange=function(){var file=this.files&&this.files[0];if(!file)return;var reader=new FileReader();reader.onload=function(){patch("art",String(reader.result||""),true)};reader.readAsDataURL(file);this.value=""};
$("#clearArt").onclick=function(){patch("art","",true)};
$("#aiStyle").value=aiStyle;
$("#aiStyle").addEventListener("change",persist);$("#resetAiStyle").onclick=function(){$("#aiStyle").value=DEFAULT_AI_STYLE;aiStyle=DEFAULT_AI_STYLE;persist();setStatus("已恢复古典油画默认风格")};
$("#aiGenerate").onclick=async function(){
  var c=current(),btn=this,prompt=$("#aiPrompt").value.trim();if(!prompt)return;
  btn.disabled=true;setStatus("AI 正在生成插画...");
  try{
    var res=await fetch("/api/generate-image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt:prompt,style:$("#aiStyle").value,cardName:c.name,faction:c.faction,cardType:TEMPLATES[c.templateId].name,quality:$("#aiQuality").value})});
    var data=await res.json();if(!res.ok)throw new Error(data.error||"生成失败");
    patch("art",data.image,true);setStatus("AI 插画已自动适配卡面");
  }catch(err){setStatus("AI 生成失败："+(err.message||"未知错误"))}
  btn.disabled=false;
};

async function refreshAiKeyStatus(){
  try{var res=await fetch("/api/health"),data=await res.json();$("#apiKeyStatus").textContent=data.aiConfigured?"AI 已配置，可直接生成":"尚未配置 AI Key";$("#apiKeyStatus").dataset.ready=data.aiConfigured?"1":"0"}catch(e){$("#apiKeyStatus").textContent="无法检查 AI 配置"}
}
$("#saveApiKey").onclick=async function(){
  var key=$("#apiKeyInput").value.trim(),btn=this;btn.disabled=true;$("#apiKeyStatus").textContent="正在保存...";
  try{
    var res=await fetch("/api/settings/api-key",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({apiKey:key})}),data=await res.json();
    if(!res.ok)throw new Error(data.error||"保存失败");
    $("#apiKeyInput").value="";$("#apiKeyStatus").textContent=data.aiConfigured?"AI Key 已保存在本机":"AI Key 已清除";setStatus($("#apiKeyStatus").textContent);
  }catch(e){$("#apiKeyStatus").textContent="保存失败："+e.message}
  btn.disabled=false;
};
$("#aiRedraw").onclick=async function(){
  var c=current(),prompt=$("#aiPrompt").value.trim();if(!c.art){setStatus("请先上传或生成一张插画，再进行现图重绘");return}if(!prompt)return;
  var btn=this;btn.disabled=true;setStatus("AI 正在基于现图重绘...");
  try{
    var res=await fetch("/api/redraw-image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({image:c.art,prompt:prompt,style:$("#aiStyle").value,cardName:c.name,faction:c.faction,cardType:TEMPLATES[c.templateId].name,quality:$("#aiQuality").value})});
    var data=await res.json();if(!res.ok)throw new Error(data.error||"重绘失败");patch("art",data.image,true);setStatus("现图重绘完成");
  }catch(e){setStatus("AI 重绘失败："+e.message)}
  btn.disabled=false;
};
refreshAiKeyStatus();

$("#assetSearch").oninput=function(){renderAssets();renderCustomAssets()};$("#assetCategory").onchange=function(){renderAssets();renderCustomAssets()};
$("#assetList").onclick=function(e){
  var fav=e.target.closest("[data-asset-fav]"),main=e.target.closest("[data-asset]");
  if(fav){
    var key=fav.getAttribute("data-asset-fav"),idx=favoriteAssets.indexOf(key);
    if(idx>=0)favoriteAssets.splice(idx,1);else favoriteAssets.push(key);
    renderAssets();persist();return;
  }
  if(main){
    var parts=main.getAttribute("data-asset").split(":"),cat=parts[0],id=parts[1],field=cat==="frame"?"frameStyle":cat==="texture"?"textureStyle":cat==="cost"?"costStyle":cat==="rarity"?"rarityStyle":"fontStyle";
    patchAppearance(field,id);setStatus("已替换"+CATEGORY_NAMES[cat]+"："+COMPONENTS[cat].find(function(x){return x.id===id}).name);
  }
};

$("#skinSearch").oninput=renderSkins;
$("#skinList").onclick=function(e){
  var fav=e.target.closest("[data-skin-fav]"),main=e.target.closest("[data-skin]");
  if(fav){var s=skins.find(function(x){return x.id===fav.getAttribute("data-skin-fav")});if(s){s.favorite=!s.favorite;renderSkins();persist()}return}
  if(main){var skin=skins.find(function(x){return x.id===main.getAttribute("data-skin")});if(skin){recordHistory();current().appearance=clone(skin.appearance);renderCard();persist();setStatus("已应用皮肤："+skin.name)}}
};
$$("[data-color]").forEach(function(el){
  el.addEventListener("focus",recordHistory);
  el.onchange=function(){current().appearance[el.getAttribute("data-color")]=el.value;renderCard();persist()};
  el.oninput=function(){current().appearance[el.getAttribute("data-color")]=el.value;renderPreviewOnly();persist()};
});
$("#saveSkin").onclick=function(){
  var skin={id:uid(),name:"自定义皮肤 "+(skins.length+1),favorite:true,appearance:clone(current().appearance)};
  skins.push(skin);renderSkins();persist();setStatus("已保存为可复用皮肤");
};
$("#applyAll").onclick=function(){
  recordHistory();var a=clone(current().appearance);cards.forEach(function(c){c.appearance=clone(a)});renderAll();setStatus("当前皮肤与素材已应用到全部 "+cards.length+" 张卡牌");
};

var waitFrame=function(){return new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve)})})};
var capture=async function(card,kind){
  renderExport(card);await document.fonts.ready;await waitFrame();
  var el=$("#exportCard .card"),ratio=815/el.offsetWidth;
  return kind==="jpeg"?htmlToImage.toJpeg(el,{pixelRatio:ratio,quality:.95,cacheBust:true}):htmlToImage.toPng(el,{pixelRatio:ratio,cacheBust:true});
};
var download=function(url,name){var a=document.createElement("a");a.href=url;a.download=name;a.click()};
$("#png").onclick=async function(){setStatus("正在导出 PNG...");try{download(await capture(current(),"png"),current().name+".png");setStatus("PNG 完成：300dpi")}catch(e){setStatus("导出失败："+e.message)}};
$("#jpg").onclick=async function(){setStatus("正在导出 JPG...");try{download(await capture(current(),"jpeg"),current().name+".jpg");setStatus("JPG 完成：300dpi")}catch(e){setStatus("导出失败："+e.message)}};
var crop=function(pdf,x,y){if(!printSettings.crop)return;var l=2,left=x+3,right=x+66,top=y+3,bottom=y+91;pdf.setLineWidth(.12);pdf.line(left-l,top,left,top);pdf.line(left,top-l,left,top);pdf.line(right,top,right+l,top);pdf.line(right,top-l,right,top);pdf.line(left-l,bottom,left,bottom);pdf.line(left,bottom,left,bottom+l);pdf.line(right,bottom,right+l,bottom);pdf.line(right,bottom,right,bottom+l)};
$("#singlePdf").onclick=async function(){
  setStatus("正在生成单张 PDF...");
  try{var img=await capture(current(),"png"),PDF=window.jspdf.jsPDF,pdf=new PDF({orientation:"portrait",unit:"mm",format:[69,94]});pdf.addImage(img,"PNG",0,0,69,94);crop(pdf,0,0);pdf.save(current().name+"-300dpi.pdf");setStatus("PDF 完成：含 3mm 出血与裁切线")}catch(e){setStatus("PDF 失败："+e.message)}
};
var batchPdf=async function(){
  var list=getVisibleCards();if(!list.length)list=cards;setStatus("正在生成拼版...");
  try{
    var PDF=window.jspdf.jsPDF,ss=SHEETS[printSettings.sheet]||SHEETS.a4,pdf=new PDF({orientation:ss[0]>ss[1]?"landscape":"portrait",unit:"mm",format:ss}),cw=69,ch=94,margin=3;
    var cols=Math.max(1,Math.floor((ss[0]-margin*2)/cw)),rows=Math.max(1,Math.floor((ss[1]-margin*2)/ch)),per=cols*rows,startX=(ss[0]-cols*cw)/2,startY=(ss[1]-rows*ch)/2;
    for(var i=0;i<list.length;i++){
      if(i>0&&i%per===0)pdf.addPage();
      var img=await capture(list[i],"png"),slot=i%per,col=slot%cols,row=Math.floor(slot/cols),x=startX+col*cw,y=startY+row*ch;
      pdf.addImage(img,"PNG",x,y,cw,ch);crop(pdf,x,y);setStatus("正在拼版 "+(i+1)+"/"+list.length);
    }
    pdf.save(safeFilename(projectName)+"-"+String(printSettings.sheet).toUpperCase()+"-300dpi.pdf");setStatus("拼版 PDF 完成："+list.length+" 张");
  }catch(e){setStatus("批量 PDF 失败："+e.message)}
};
$("#batchPdf").onclick=batchPdf;$("#batchPdfTop").onclick=batchPdf;
$("#sheetSize").onchange=function(){printSettings.sheet=this.value;persist()};
$("#cropMarks").onchange=function(){printSettings.crop=this.checked;persist()};

function safeFilename(name){return String(name||"card").replace(/[\\/:*?"<>|]/g,"_").trim()||"card"}
function normalizeName(name){return String(name||"").replace(/\\.[^.]+$/,"").replace(/[\\s_\\-]+/g,"").toLowerCase()}
function fileToDataUrl(file){return new Promise(function(resolve,reject){var rr=new FileReader();rr.onload=function(){resolve(String(rr.result||""))};rr.onerror=reject;rr.readAsDataURL(file)})}
function projectPayload(){return {format:"card-assembly-studio",version:5,exportedAt:new Date().toISOString(),projectName:projectName,cards:cards,selected:selected,skins:skins,ruleTerms:ruleTerms,userAssets:userAssets,customTemplates:customTemplates,favoriteAssets:favoriteAssets,snapshots:snapshots,aiStyle:$("#aiStyle").value,aiQuality:aiQuality,printSettings:printSettings}}
function downloadText(text,name,type){var blob=new Blob([text],{type:type||"text/plain;charset=utf-8"}),url=URL.createObjectURL(blob);download(url,name);setTimeout(function(){URL.revokeObjectURL(url)},1000)}

$("#projectExport").onclick=function(){downloadText(JSON.stringify(projectPayload(),null,2),safeFilename(projectName)+".cardstudio","application/json");setStatus("项目文件已保存，包含卡牌、规则词条、皮肤、模板与图片素材")};
$("#projectImport").onclick=function(){$("#projectFile").click()};
$("#projectFile").onchange=async function(){
  var file=this.files&&this.files[0];if(!file)return;
  try{
    var p=JSON.parse(await file.text());if(p.format!=="card-assembly-studio"&&!Array.isArray(p.cards))throw new Error("不是有效的卡牌项目文件");
    recordHistory();cards=(p.cards||[]).map(normalizeCard);if(!cards.length)throw new Error("项目中没有卡牌");
    skins=(p.skins||BASE_SKINS).map(function(x){x.appearance=normalizeAppearance(x.appearance);return x});
    userAssets=p.userAssets||[];ruleTerms=p.ruleTerms||[];customTemplates=p.customTemplates||{};favoriteAssets=p.favoriteAssets||[];snapshots=p.snapshots||[];
    TEMPLATES=Object.assign({},BUILTIN_TEMPLATES,customTemplates);selected=cards[0].id;if(p.aiStyle){aiStyle=p.aiStyle;$("#aiStyle").value=p.aiStyle}if(p.projectName)projectName=p.projectName;if(p.aiQuality)aiQuality=p.aiQuality;if(p.printSettings)printSettings=Object.assign({sheet:"a4",crop:true},p.printSettings);
    renderAll();setStatus("项目已打开："+cards.length+" 张卡牌");
  }catch(e){setStatus("打开项目失败："+e.message)}
  this.value="";
};

$("#cloneTemplate").onclick=function(){
  var base=TEMPLATES[current().templateId],name=prompt("新模板名称",base.name+" - 自定义");if(!name)return;
  var typeLabel=prompt("这一栏叫什么？",base.typeLabel)||base.typeLabel;
  var statText=prompt("保留哪些数值？可填：攻击,血量,移速,射程，用逗号分隔",base.stats.map(function(x){return x[2]}).join(","));if(statText==null)return;
  var map={攻击:["attack","攻","攻击"],威力:["attack","威","威力"],火力:["attack","火","火力"],血量:["health","血","血量"],耐久:["health","耐","耐久"],移速:["move","移","移速"],射程:["range","射","射程"]};
  var stats=statText.split(/[,，]/).map(function(x){return x.trim()}).filter(Boolean).map(function(x){return map[x]||null}).filter(Boolean);
  var id="custom-"+uid();customTemplates[id]={id:id,name:name,short:name.slice(0,4),hint:stats.length?stats.map(function(x){return x[2]}).join(" / "):"大文本区",typeLabel:typeLabel,stats:stats,baseLayout:base.baseLayout||base.id};
  TEMPLATES=Object.assign({},BUILTIN_TEMPLATES,customTemplates);recordHistory();current().templateId=id;renderAll();setStatus("已创建自定义模板："+name);
};
$("#deleteTemplate").onclick=function(){
  var id=current().templateId;if(!customTemplates[id]){setStatus("内置模板不能删除");return}
  recordHistory();cards.forEach(function(c){if(c.templateId===id)c.templateId="unit"});delete customTemplates[id];TEMPLATES=Object.assign({},BUILTIN_TEMPLATES,customTemplates);current().templateId="unit";renderAll();setStatus("自定义模板已删除，相关卡牌改为标准单位卡");
};
$("#batchImages").onclick=function(){$("#batchImageFiles").click()};
$("#batchImageFiles").onchange=async function(){
  var files=Array.prototype.slice.call(this.files||[]);if(!files.length)return;
  recordHistory();setStatus("正在匹配 "+files.length+" 张图片...");
  var remaining=cards.filter(function(c){return !c.art}),used={},matchedFiles={};
  for(var i=0;i<files.length;i++){
    var f=files[i],fn=normalizeName(f.name),target=cards.find(function(c){return normalizeName(c.name)===fn&&!used[c.id]});
    if(target){target.art=await fileToDataUrl(f);used[target.id]=true;matchedFiles[f.name]=true}
  }
  var restFiles=files.filter(function(f){return !matchedFiles[f.name]}),restCards=remaining.filter(function(c){return !used[c.id]});
  for(var j=0;j<Math.min(restFiles.length,restCards.length);j++){restCards[j].art=await fileToDataUrl(restFiles[j]);used[restCards[j].id]=true}
  renderAll();setStatus("批量图片完成：已填入 "+Object.keys(used).length+" 张卡牌");this.value="";
};

async function generateForCard(c,promptText){
  var res=await fetch("/api/generate-image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt:promptText,style:$("#aiStyle").value,cardName:c.name,faction:c.faction,cardType:TEMPLATES[c.templateId].name,quality:$("#aiQuality").value})});
  var data=await res.json();if(!res.ok)throw new Error(data.error||"生成失败");c.art=data.image;
}
$("#batchAI").onclick=async function(){
  var targets=cards.filter(function(c){return !c.art});if(!targets.length){setStatus("没有缺图卡牌");return}
  recordHistory();var btn=this;btn.disabled=true;
  try{
    for(var i=0;i<targets.length;i++){var c=targets[i];setStatus("AI 批量生图 "+(i+1)+"/"+targets.length+"："+c.name);await generateForCard(c,(c.description||"")+"。主体："+c.name)}
    renderAll();setStatus("批量 AI 插画完成："+targets.length+" 张");
  }catch(e){renderAll();setStatus("批量 AI 在中途停止："+e.message)}
  btn.disabled=false;
};

$("#uploadAssetBtn").onclick=function(){$("#customAssetFile").click()};
$("#customAssetFile").onchange=async function(){
  var f=this.files&&this.files[0];if(!f)return;var cat=$("#uploadAssetCategory").value;
  var name=prompt("素材名称",f.name.replace(/\.[^.]+$/,""));if(!name){this.value="";return}
  recordHistory();var a={id:uid(),name:name,category:cat,dataUrl:await fileToDataUrl(f)};userAssets.push(a);
  if(cat==="icon")current().appearance.iconAssetId=a.id;else if(cat==="frameImage")current().appearance.frameImageAssetId=a.id;else current().appearance.textureImageAssetId=a.id;
  renderAll();setStatus("自定义素材已上传并应用："+name);this.value="";
};
$("#customAssetList").onclick=function(e){
  var place=e.target.closest("[data-place-custom]"),apply=e.target.closest("[data-apply-custom]"),fav=e.target.closest("[data-fav-custom]"),remove=e.target.closest("[data-remove-custom]");
  if(place){var pa=userAssets.find(function(x){return x.id===place.getAttribute("data-place-custom")});if(pa){setLayoutMode(true,false);addFreeImage(pa)}return}
  if(apply){var a=userAssets.find(function(x){return x.id===apply.getAttribute("data-apply-custom")});if(!a)return;recordHistory();if(a.category==="icon")current().appearance.iconAssetId=a.id;else if(a.category==="frameImage")current().appearance.frameImageAssetId=a.id;else current().appearance.textureImageAssetId=a.id;renderAll();setStatus("已应用自定义素材："+a.name);return}
  if(fav){var fa=userAssets.find(function(x){return x.id===fav.getAttribute("data-fav-custom")});if(fa){fa.favorite=!fa.favorite;renderCustomAssets();persist()}return}
  if(remove){var id=remove.getAttribute("data-remove-custom");recordHistory();userAssets=userAssets.filter(function(a){return a.id!==id});cards.forEach(function(c){["iconAssetId","frameImageAssetId","textureImageAssetId"].forEach(function(k){if(c.appearance[k]===id)c.appearance[k]=""})});renderAll();setStatus("自定义素材已删除")}
};
$("#batchRename").onclick=function(){
  var list=getVisibleCards(),prefix=$("#namePrefix").value,start=num($("#nameStart").value,1);if(!list.length)return;recordHistory();
  list.forEach(function(c,i){c.name=prefix+String(start+i).padStart(3,"0")});renderAll();setStatus("已批量命名 "+list.length+" 张可见卡牌");
};
$("#clearAllArt").onclick=function(){recordHistory();cards.forEach(function(c){c.art=""});renderAll();setStatus("已清空全部插画")};

function manifestRows(){
  return cards.map(function(c,i){var t=TEMPLATES[c.templateId]||TEMPLATES.unit;return {序号:i+1,编号:c.cardNumber,名称:c.name,模板:t.name,费用:c.cost,系别:c.faction,类型:c.unitType,稀有度:c.rarity,攻击:c.attack,血量:c.health,移速:c.move,射程:c.range,标签:c.tags,规则关键词:c.rulesKeywords,效果:c.description,有插画:c.art?"是":"否"}})
}
$("#exportManifest").onclick=function(){var csv="\uFEFF"+Papa.unparse(manifestRows());downloadText(csv,"卡牌导出清单.csv","text/csv;charset=utf-8");setStatus("CSV 清单已导出")};
$("#exportJsonList").onclick=function(){downloadText(JSON.stringify(manifestRows(),null,2),"卡牌导出清单.json","application/json");setStatus("JSON 清单已导出")};

var activeLibraryTag="";
function splitTags(v){return String(v||"").split(/[,，;；|]/).map(function(x){return x.trim()}).filter(Boolean)}
function searchableText(c){var t=TEMPLATES[c.templateId]||TEMPLATES.unit,termText=extractRuleTerms(c.description).map(function(n){var x=termByName(n);return x?[x.name,x.category,x.tags,x.description].join(" "):n}).join(" ");return [c.cardNumber,c.name,t.name,c.faction,c.unitType,c.rarity,c.tags,c.rulesKeywords,c.description,termText,c.cost,c.attack,c.health,c.move,c.range].join(" ").toLowerCase()}
function renderCardLibrary(){
  var q=$("#librarySearch").value.trim().toLowerCase(),f=$("#libraryFaction").value,ty=$("#libraryType").value,r=$("#libraryRarity").value;
  var allTags={};cards.forEach(function(c){splitTags(c.tags).concat(splitTags(c.rulesKeywords)).forEach(function(t){allTags[t]=(allTags[t]||0)+1})});
  $("#tagCloud").innerHTML=Object.keys(allTags).sort(function(a,b){return allTags[b]-allTags[a]||a.localeCompare(b,"zh-CN")}).slice(0,40).map(function(t){return '<button class="'+(activeLibraryTag===t?"active":"")+'" data-library-tag="'+esc(t)+'">'+esc(t)+' <small>'+allTags[t]+'</small></button>'}).join("");
  var list=cards.filter(function(c){return (f==="all"||c.faction===f)&&(ty==="all"||c.unitType===ty)&&(r==="all"||c.rarity===r)&&(!activeLibraryTag||splitTags(c.tags).concat(splitTags(c.rulesKeywords)).indexOf(activeLibraryTag)>=0)&&(!q||searchableText(c).indexOf(q)>=0)});
  var exactTerm=ruleTerms.find(function(t){var hay=[t.name,t.category,t.tags,t.description].join(" ").toLowerCase();return q&&hay.indexOf(q)>=0});
  if(exactTerm){$("#libraryTermInfo").hidden=false;$("#libraryTermInfo").innerHTML='<div class="term-definition-head"><i style="background:'+esc(exactTerm.color||"#38bdf8")+'"></i><b style="color:'+esc(exactTerm.color||"#38bdf8")+'">'+esc(exactTerm.name)+'</b><span>'+esc(exactTerm.category||"规则词条")+'</span></div><div>'+esc(exactTerm.description||"尚未填写说明")+'</div><small>检索标签：'+esc(exactTerm.tags||"无")+' · 使用 '+cardsUsingTerm(exactTerm.name).length+' 张卡牌</small>'}else{$("#libraryTermInfo").hidden=true;$("#libraryTermInfo").innerHTML=""}
  $("#libraryCount").textContent="找到 "+list.length+" / "+cards.length+" 张卡牌";
  $("#libraryResults").innerHTML=list.map(function(c){var tags=splitTags(c.tags).concat(splitTags(c.rulesKeywords));return '<button class="library-card" data-library-card="'+c.id+'"><div class="lib-head"><strong>'+esc(c.name)+'</strong><span class="lib-number">'+esc(c.cardNumber||"未编号")+'</span></div><div class="lib-meta">'+esc(c.faction)+' · '+esc(c.unitType)+' · '+esc(c.rarity)+' · 费用 '+esc(c.cost)+'</div><div class="lib-effect">'+esc(resolveVars(c.description,c))+'</div><div class="lib-tags">'+tags.slice(0,10).map(function(t){return '<span>'+esc(t)+'</span>'}).join("")+'</div></button>'}).join("");
}
function refreshLibraryFilters(){
  function opts(arr,label){return '<option value="all">'+label+'</option>'+Array.from(new Set(arr.filter(Boolean))).sort().map(function(x){return '<option value="'+esc(x)+'">'+esc(x)+'</option>'}).join("")}
  $("#libraryFaction").innerHTML=opts(cards.map(function(c){return c.faction}),"全部系别");$("#libraryType").innerHTML=opts(cards.map(function(c){return c.unitType}),"全部类型");$("#libraryRarity").innerHTML=opts(cards.map(function(c){return c.rarity}),"全部稀有度");
}
$("#batchNumber").onclick=function(){var prefix=$("#numberPrefix").value,start=num($("#numberStart").value,1),list=getVisibleCards();if(!list.length)return;recordHistory();list.forEach(function(c,i){c.cardNumber=prefix+String(start+i).padStart(3,"0")});renderAll();setStatus("已生成 "+list.length+" 个稳定卡号")};
$("#openCardSearch").onclick=function(){activeLibraryTag="";refreshLibraryFilters();renderCardLibrary();$("#cardSearchModal").hidden=false};
$("#closeCardSearch").onclick=function(){$("#cardSearchModal").hidden=true};
$("#cardSearchModal").addEventListener("click",function(e){if(e.target===this)this.hidden=true});
["#librarySearch","#libraryFaction","#libraryType","#libraryRarity"].forEach(function(q){$(q).addEventListener(q==="#librarySearch"?"input":"change",renderCardLibrary)});
$("#tagCloud").onclick=function(e){var b=e.target.closest("[data-library-tag]");if(!b)return;var t=b.getAttribute("data-library-tag");activeLibraryTag=activeLibraryTag===t?"":t;renderCardLibrary()};
$("#libraryResults").onclick=function(e){var b=e.target.closest("[data-library-card]");if(!b)return;selected=b.getAttribute("data-library-card");$("#cardSearchModal").hidden=true;renderAll();setStatus("已从卡查定位："+current().name)};
function ttsCard(c,index){return {id:c.id,number:c.cardNumber||String(index+1).padStart(3,"0"),name:c.name,template:c.templateId,faction:c.faction,type:c.unitType,rarity:c.rarity,cost:c.cost,stats:{attack:c.attack,health:c.health,move:c.move,range:c.range},tags:splitTags(c.tags),rulesKeywords:splitTags(c.rulesKeywords),text:c.description,termRefs:extractRuleTerms(c.description),searchText:searchableText(c),imageFile:String(index+1).padStart(3,"0")+"-"+safeFilename(c.name)+".png"}}
$("#exportTTS").onclick=async function(){
  var btn=this;btn.disabled=true;setStatus("正在生成 TTS 模组数据...");
  try{
    var zip=new JSZip(),data=cards.map(ttsCard),byTag={},byTerm={},byNumber={},byId={};
    data.forEach(function(c){byId[c.id]=c.number;byNumber[c.number]=c.id;c.tags.concat(c.rulesKeywords).forEach(function(t){if(!byTag[t])byTag[t]=[];byTag[t].push(c.id)});c.termRefs.forEach(function(t){if(!byTerm[t])byTerm[t]=[];byTerm[t].push(c.id)})});
    zip.file("cards.json",JSON.stringify({format:"card-studio-tts",version:2,project:projectName,cards:data},null,2));
    zip.file("glossary.json",JSON.stringify({version:1,terms:ruleTerms},null,2));
    zip.file("index.json",JSON.stringify({byId:byId,byNumber:byNumber,byTag:byTag,byTerm:byTerm},null,2));
    zip.file("manifest.csv","\uFEFF"+Papa.unparse(manifestRows()));
    zip.file("README-TTS.txt","Card Studio TTS 数据包\\n\\ncards.json：完整卡牌数据库\\nindex.json：按稳定 ID、编号、标签建立的索引\\nmanifest.csv：人工查看用清单\\n\\n未来 TTS Lua 模组可读取同结构数据，并以 card.id 作为稳定主键。");
    var blob=await zip.generateAsync({type:"blob"}),url=URL.createObjectURL(blob);download(url,safeFilename(projectName)+"-TTS-data.zip");setTimeout(function(){URL.revokeObjectURL(url)},1000);setStatus("TTS 数据包已导出："+cards.length+" 张");
  }catch(e){setStatus("TTS 导出失败："+e.message)}
  btn.disabled=false;
};

$("#batchPngZip").onclick=async function(){
  var list=getVisibleCards();if(!list.length)return;var btn=this;btn.disabled=true;setStatus("正在打包 PNG...");
  try{
    var zip=new JSZip();
    for(var i=0;i<list.length;i++){
      setStatus("PNG 打包 "+(i+1)+"/"+list.length);
      var data=await capture(list[i],"png");
      zip.file(String(i+1).padStart(3,"0")+"-"+safeFilename(list[i].name)+".png",data.split(",")[1],{base64:true});
    }
    zip.file("manifest.csv","\uFEFF"+Papa.unparse(manifestRows()));
    var blob=await zip.generateAsync({type:"blob"}),url=URL.createObjectURL(blob);download(url,"卡牌PNG-300dpi.zip");setTimeout(function(){URL.revokeObjectURL(url)},1000);setStatus("PNG ZIP 完成："+list.length+" 张");
  }catch(e){setStatus("PNG ZIP 失败："+e.message)}
  btn.disabled=false;
};

$("#batchJpgZip").onclick=async function(){
  var list=getVisibleCards();if(!list.length)return;var btn=this;btn.disabled=true;setStatus("正在打包 JPG...");
  try{
    var zip=new JSZip();
    for(var i=0;i<list.length;i++){
      setStatus("JPG 打包 "+(i+1)+"/"+list.length);
      var data=await capture(list[i],"jpeg");
      zip.file(String(i+1).padStart(3,"0")+"-"+safeFilename(list[i].name)+".jpg",data.split(",")[1],{base64:true});
    }
    zip.file("manifest.csv","\uFEFF"+Papa.unparse(manifestRows()));
    var blob=await zip.generateAsync({type:"blob"}),url=URL.createObjectURL(blob);download(url,safeFilename(projectName)+"-JPG-300dpi.zip");setTimeout(function(){URL.revokeObjectURL(url)},1000);setStatus("JPG ZIP 完成："+list.length+" 张");
  }catch(e){setStatus("JPG ZIP 失败："+e.message)}
  btn.disabled=false;
};

renderAll();
dbGet("project-v3").then(function(savedDb){
  dbReady=true;
  if(savedDb&&savedDb.project&&Array.isArray(savedDb.project.cards)&&savedDb.project.cards.length){
    var p=savedDb.project;
    cards=p.cards.map(normalizeCard);skins=(p.skins||skins).map(function(x){x.appearance=normalizeAppearance(x.appearance);return x});
    userAssets=p.userAssets||[];ruleTerms=p.ruleTerms||[];customTemplates=p.customTemplates||{};favoriteAssets=p.favoriteAssets||[];snapshots=p.snapshots||[];
    TEMPLATES=Object.assign({},BUILTIN_TEMPLATES,customTemplates);
    selected=p.selected&&cards.some(function(c){return c.id===p.selected})?p.selected:cards[0].id;
    if(p.aiStyle){aiStyle=p.aiStyle;$("#aiStyle").value=p.aiStyle}if(p.projectName)projectName=p.projectName;if(p.aiQuality)aiQuality=p.aiQuality;if(p.printSettings)printSettings=Object.assign({sheet:"a4",crop:true},p.printSettings);
    renderAll();setStatus("已恢复完整项目（含图片）");
  }else{scheduleDbSave()}
}).catch(function(){dbReady=true;scheduleDbSave()});
})();