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
    {id:"ornate",name:"仪式双框",keywords:"边框 华丽 仪式"}
  ],
  texture:[
    {id:"clean",name:"纯净底纹",keywords:"底纹 简洁 无纹理"},
    {id:"grid",name:"战术网格",keywords:"底纹 网格 科技"},
    {id:"diagonal",name:"斜纹织物",keywords:"底纹 斜线 军事"},
    {id:"parchment",name:"旧纸肌理",keywords:"底纹 羊皮纸 古典"}
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
    {id:"soft",name:"柔和阅读",keywords:"字体 柔和 易读"}
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
  {id:"arcane",name:"星界秘仪",appearance:{primary:"#24133f",secondary:"#4c2b73",accent:"#71d6ff",frame:"#120b24",text:"#f4efff",frameStyle:"classic",textureStyle:"grid",costStyle:"hex",rarityStyle:"gem",fontStyle:"soft"}}
];

var makeCard=function(templateId,name){
  var t=TEMPLATES[templateId]||TEMPLATES.unit;
  return {
    id:uid(),templateId:t.id,name:name||("新"+t.short+"卡"),cost:1,faction:"中立",
    description:"在这里填写卡牌效果。可使用 {费用}、{攻击} 等变量。",
    attack:t.id==="event"?0:1,health:t.id==="event"?0:1,move:t.id==="unit"?2:0,range:t.id==="unit"?1:0,
    unitType:t.short,rarity:"普通",tags:"",art:"",appearance:clone(DEFAULT_APPEARANCE)
  };
};
var sample=[
  Object.assign(makeCard("unit","边境长枪兵"),{cost:2,faction:"王国",description:"部署：若你控制相邻据点，获得 +1 攻击。\\n守备时，{射程} 不会降低。",attack:3,health:4,move:2,range:1,unitType:"步兵",tags:"前线,守备,长枪"}),
  Object.assign(makeCard("spell","星辉爆裂"),{cost:4,faction:"星辉议会",description:"对射程内一个区域造成 {攻击} 点伤害。\\n若目标位于据点，额外造成 1 点伤害。",attack:4,range:4,unitType:"攻击法术",rarity:"稀有",tags:"远程,范围"}),
  Object.assign(makeCard("building","边境箭塔"),{cost:3,faction:"王国",description:"驻守单位获得 +1 射程。\\n建筑被摧毁时，驻守单位撤离到相邻空格。",attack:2,health:6,range:3,unitType:"防御建筑",tags:"据点,防御"}),
  Object.assign(makeCard("event","突发浓雾"),{cost:0,faction:"环境",description:"本回合所有超过 2 格的远程攻击获得 -1 命中。\\n回合结束时弃置此事件。",unitType:"战场事件",tags:"环境,全局"})
];

var vars={"名称":"name","费用":"cost","系别":"faction","攻击":"attack","血量":"health","移速":"move","射程":"range","兵种":"unitType","稀有度":"rarity"};

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
function scheduleDbSave(){if(!dbReady)return;clearTimeout(dbSaveTimer);dbSaveTimer=setTimeout(function(){dbPut("project-v3",{updatedAt:Date.now(),project:projectPayload()}).catch(function(){})},500)};
var saved=loadJson("card-studio-project-v2",null)||loadJson("card-studio-project",null);
var cards=saved&&saved.cards&&saved.cards.length?saved.cards:sample;
var selected=saved&&saved.selected&&cards.some(function(c){return c.id===saved.selected})?saved.selected:cards[0].id;
var skins=loadJson("card-studio-skins",BASE_SKINS);
var favoriteAssets=loadJson("card-studio-favorite-assets",[]);
var snapshots=loadJson("card-studio-snapshots",[]);
var userAssets=loadJson("card-studio-user-assets",[]);
var aiStyle=loadJson("card-studio-ai-style","统一的东方奇幻桌游插画，厚涂，电影光影，材质细腻，不出现文字");
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
  if(c.art==null)c.art="";
  return c;
};
cards=cards.map(normalizeCard);
skins=skins.map(function(s){s.appearance=normalizeAppearance(s.appearance);return s});

var history=[],future=[],historyLimit=12;
var current=function(){return cards.find(function(c){return c.id===selected})||cards[0]};
var stateSnapshot=function(){return JSON.stringify({projectName:projectName,cards:cards,selected:selected,skins:skins,favoriteAssets:favoriteAssets,userAssets:userAssets,customTemplates:customTemplates,aiStyle:$("#aiStyle")?$("#aiStyle").value:aiStyle,aiQuality:aiQuality,printSettings:printSettings})};
var restoreState=function(raw){
  var s=typeof raw==="string"?JSON.parse(raw):clone(raw);
  cards=(s.cards||[]).map(normalizeCard);selected=s.selected&&cards.some(function(c){return c.id===s.selected})?s.selected:(cards[0]&&cards[0].id);
  skins=(s.skins||skins).map(function(x){x.appearance=normalizeAppearance(x.appearance);return x});
  favoriteAssets=s.favoriteAssets||favoriteAssets;
  userAssets=s.userAssets||userAssets;
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
var raritySymbol=function(style){
  if(style==="dot")return "●";
  if(style==="gem")return "◆";
  if(style==="bars")return "▮▮▮";
  return "★";
};
var assetById=function(id){return userAssets.find(function(x){return x.id===id})};
var cardHtml=function(card,editable){
  var t=TEMPLATES[card.templateId]||TEMPLATES.unit,a=normalizeAppearance(card.appearance),ce=editable?' contenteditable="true"':"";
  var desc=esc(resolveVars(card.description,card)).replace(/\n/g,"<br>");
  var artEmpty=card.art?"":'<div class="art-empty">插画区域<br><small>上传图片或使用 AI 生成</small></div>';
  var stats=t.stats.map(function(s){
    return '<div class="stat"><small>'+s[1]+'</small><strong data-edit="'+s[0]+'"'+ce+'>'+esc(card[s[0]])+'</strong></div>';
  }).join("");
  var layoutId=t.baseLayout||t.id;
  var classes=["card","tpl-"+layoutId,"frame-"+a.frameStyle,"texture-"+a.textureStyle,"cost-"+a.costStyle,"rarity-"+a.rarityStyle,"font-"+a.fontStyle].join(" ");
  var style="--p:"+a.primary+";--s:"+a.secondary+";--a:"+a.accent+";--f:"+a.frame+";--t:"+a.text+";--stats-count:"+Math.max(1,t.stats.length)+";--title-size:"+a.titleSize+"px;--title-color:"+a.titleColor+";--title-align:"+a.titleAlign+";--title-weight:"+(a.titleBold?900:500)+";--effect-size:"+a.effectSize+"px;--effect-color:"+a.effectColor+";--effect-align:"+a.effectAlign+";--effect-weight:"+(a.effectBold?800:400)+";--meta-size:"+a.metaSize+"px;--meta-color:"+a.metaColor+";--meta-align:"+a.metaAlign+";--meta-weight:"+(a.metaBold?800:500)+";--stats-size:"+a.statsSize+"px;--stats-color:"+a.statsColor+";--stats-align:"+a.statsAlign+";--stats-weight:"+(a.statsBold?900:500)+";--cost-size:"+a.costSize+"px;--cost-color:"+a.costColor+";--cost-align:"+a.costAlign+";--cost-weight:"+(a.costBold?900:500);
  var frameAsset=assetById(a.frameImageAssetId),textureAsset=assetById(a.textureImageAssetId),iconAsset=assetById(a.iconAssetId);
  var customFrame=frameAsset?'<img class="custom-frame-layer" src="'+esc(frameAsset.dataUrl)+'">':"";
  var customTexture=textureAsset?'<img class="custom-texture-layer" src="'+esc(textureAsset.dataUrl)+'">':"";
  var customIcon=iconAsset?'<img class="card-custom-icon" src="'+esc(iconAsset.dataUrl)+'">':"";
  return '<div class="'+classes+'" style="'+style+'">'+customFrame+customTexture+customIcon+
    '<div class="art">'+artEmpty+'</div><div class="shade"></div><div class="texture-layer"></div><div class="trim"></div>'+
    '<div class="cost-badge" data-edit="cost"'+ce+'><span>'+esc(card.cost)+'</span></div>'+
    '<div class="head"><div class="title" data-edit="name"'+ce+'>'+esc(card.name)+'</div><div class="faction" data-edit="faction"'+ce+'>'+esc(card.faction)+'</div></div>'+
    '<div class="rarity-mark rarity-'+a.rarityStyle+'" title="'+esc(card.rarity)+'">'+raritySymbol(a.rarityStyle)+'</div>'+
    '<div class="meta"><span data-edit="unitType"'+ce+'>'+esc(card.unitType)+'</span><span>·</span><span data-edit="rarity"'+ce+'>'+esc(card.rarity)+'</span></div>'+
    '<div class="effect" data-edit="description"'+ce+'>'+desc+'</div>'+
    '<div class="stats">'+stats+'</div><div class="tags">'+esc(card.tags)+'</div></div>';
};
var setArt=function(root,card){
  var art=root.querySelector(".art");
  if(art&&card.art)art.style.backgroundImage='url("'+String(card.art).replace(/"/g,"%22")+'")';
};
var renderPreviewOnly=function(){
  var c=current(),t=TEMPLATES[c.templateId];
  $("#preview").innerHTML=cardHtml(c,true);setArt($("#preview"),c);
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
  $("[data-color]").forEach(function(el){el.value=c.appearance[el.getAttribute("data-color")]});
  refreshTextControls();
  renderTemplates();renderAssets();renderSkins();
};
var renderExport=function(card){$("#exportCard").innerHTML=cardHtml(card,false);setArt($("#exportCard"),card)};
var getVisibleCards=function(){
  var q=$("#cardSearch").value.trim().toLowerCase(),filter=$("#templateFilter").value,sort=$("#sortCards").value;
  var list=cards.filter(function(c){
    var t=TEMPLATES[c.templateId]||TEMPLATES.unit;
    return (filter==="all"||c.templateId===filter)&&(!q||[c.name,t.name,c.faction,c.unitType,c.rarity,c.tags].join(" ").toLowerCase().indexOf(q)>=0);
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
var renderTemplateFilter=function(){var old=$("#templateFilter").value;$("#templateFilter").innerHTML='<option value="all">全部模板</option>'+Object.keys(TEMPLATES).map(function(k){return '<option value="'+k+'">'+esc(TEMPLATES[k].name)+'</option>'}).join("");$("#templateFilter").value=TEMPLATES[old]?old:"all"};
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
var renderCustomAssets=function(){var box=$("#customAssetList");if(!box)return;var q=$("#assetSearch").value.trim().toLowerCase(),cat=$("#assetCategory").value;var list=userAssets.filter(function(a){var catOk=cat==="all"||cat==="custom"||(cat==="frame"&&a.category==="frameImage")||(cat==="texture"&&a.category==="textureImage")||(cat==="icon"&&a.category==="icon");return catOk&&(!q||[a.name,a.category].join(" ").toLowerCase().indexOf(q)>=0)}).slice().sort(function(a,b){return Number(!!b.favorite)-Number(!!a.favorite)});box.innerHTML=list.length?list.map(function(a){var label=a.category==="icon"?"卡面图标":a.category==="frameImage"?"图片边框":"图片底纹";return '<div class="custom-asset"><img src="'+esc(a.dataUrl)+'"><div><strong>'+esc(a.name)+'</strong><small>'+esc(label)+'</small></div><div class="asset-mini-actions"><button data-apply-custom="'+a.id+'">应用</button><button data-fav-custom="'+a.id+'">'+(a.favorite?"★":"☆")+'</button><button data-remove-custom="'+a.id+'">删</button></div></div>'}).join(""):'<div class="empty-note">没有匹配的自定义图片素材。</div>'};
var renderAll=function(){renderTemplateFilter();renderList();renderCard();renderSnapshots();renderCustomAssets();updateHistoryButtons();persist()};

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

$("#preview").addEventListener("focusin",function(e){
  var f=e.target&&e.target.getAttribute&&e.target.getAttribute("data-edit");
  if(f==="description")e.target.textContent=current().description||"";
});
$("#preview").addEventListener("focusout",function(e){
  var f=e.target&&e.target.getAttribute&&e.target.getAttribute("data-edit");if(f)patch(f,e.target.innerText.trim(),true);
});
$("#cardList").addEventListener("click",function(e){var b=e.target.closest("[data-id]");if(!b)return;selected=b.getAttribute("data-id");renderAll()});
$("#cardSearch").addEventListener("input",renderList);$("#templateFilter").addEventListener("change",renderList);$("#sortCards").addEventListener("change",renderList);
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
      c.rarity=String(pick(r,["rarity","稀有度"],"普通"));c.tags=String(pick(r,["tags","关键词","标签"],""));c.art=String(pick(r,["art","插画","图片","背景"],""));
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
$("#aiStyle").addEventListener("change",persist);
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
var crop=function(pdf,x,y){var l=2,left=x+3,right=x+66,top=y+3,bottom=y+91;pdf.setLineWidth(.12);pdf.line(left-l,top,left,top);pdf.line(left,top-l,left,top);pdf.line(right,top,right+l,top);pdf.line(right,top-l,right,top);pdf.line(left-l,bottom,left,bottom);pdf.line(left,bottom,left,bottom+l);pdf.line(right,bottom,right+l,bottom);pdf.line(right,bottom,right,bottom+l)};
$("#singlePdf").onclick=async function(){
  setStatus("正在生成单张 PDF...");
  try{var img=await capture(current(),"png"),PDF=window.jspdf.jsPDF,pdf=new PDF({orientation:"portrait",unit:"mm",format:[69,94]});pdf.addImage(img,"PNG",0,0,69,94);crop(pdf,0,0);pdf.save(current().name+"-300dpi.pdf");setStatus("PDF 完成：含 3mm 出血与裁切线")}catch(e){setStatus("PDF 失败："+e.message)}
};
var batchPdf=async function(){
  setStatus("正在生成 A4 拼版...");
  try{
    var PDF=window.jspdf.jsPDF,pdf=new PDF({orientation:"portrait",unit:"mm",format:"a4"});
    for(var i=0;i<cards.length;i++){
      if(i>0&&i%9===0)pdf.addPage();
      var img=await capture(cards[i],"png"),slot=i%9,col=slot%3,row=Math.floor(slot/3),x=1.5+col*69,y=7.5+row*94;
      pdf.addImage(img,"PNG",x,y,69,94);crop(pdf,x,y);setStatus("正在拼版 "+(i+1)+"/"+cards.length);
    }
    pdf.save("卡牌集-A4-300dpi.pdf");setStatus("批量 PDF 完成："+cards.length+" 张");
  }catch(e){setStatus("批量 PDF 失败："+e.message)}
};
$("#batchPdf").onclick=batchPdf;$("#batchPdfTop").onclick=batchPdf;

function safeFilename(name){return String(name||"card").replace(/[\\/:*?"<>|]/g,"_").trim()||"card"}
function normalizeName(name){return String(name||"").replace(/\\.[^.]+$/,"").replace(/[\\s_\\-]+/g,"").toLowerCase()}
function fileToDataUrl(file){return new Promise(function(resolve,reject){var rr=new FileReader();rr.onload=function(){resolve(String(rr.result||""))};rr.onerror=reject;rr.readAsDataURL(file)})}
function projectPayload(){return {format:"card-assembly-studio",version:4,exportedAt:new Date().toISOString(),projectName:projectName,cards:cards,selected:selected,skins:skins,userAssets:userAssets,customTemplates:customTemplates,favoriteAssets:favoriteAssets,snapshots:snapshots,aiStyle:$("#aiStyle").value,aiQuality:aiQuality,printSettings:printSettings}}
function downloadText(text,name,type){var blob=new Blob([text],{type:type||"text/plain;charset=utf-8"}),url=URL.createObjectURL(blob);download(url,name);setTimeout(function(){URL.revokeObjectURL(url)},1000)}

$("#projectExport").onclick=function(){downloadText(JSON.stringify(projectPayload(),null,2),safeFilename(projectName)+".cardstudio","application/json");setStatus("项目文件已保存，包含卡牌、皮肤、模板与图片素材")};
$("#projectImport").onclick=function(){$("#projectFile").click()};
$("#projectFile").onchange=async function(){
  var file=this.files&&this.files[0];if(!file)return;
  try{
    var p=JSON.parse(await file.text());if(p.format!=="card-assembly-studio"&&!Array.isArray(p.cards))throw new Error("不是有效的卡牌项目文件");
    recordHistory();cards=(p.cards||[]).map(normalizeCard);if(!cards.length)throw new Error("项目中没有卡牌");
    skins=(p.skins||BASE_SKINS).map(function(x){x.appearance=normalizeAppearance(x.appearance);return x});
    userAssets=p.userAssets||[];customTemplates=p.customTemplates||{};favoriteAssets=p.favoriteAssets||[];snapshots=p.snapshots||[];
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
  var apply=e.target.closest("[data-apply-custom]"),fav=e.target.closest("[data-fav-custom]"),remove=e.target.closest("[data-remove-custom]");
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
  return cards.map(function(c,i){var t=TEMPLATES[c.templateId]||TEMPLATES.unit;return {序号:i+1,名称:c.name,模板:t.name,费用:c.cost,系别:c.faction,类型:c.unitType,稀有度:c.rarity,攻击:c.attack,血量:c.health,移速:c.move,射程:c.range,关键词:c.tags,效果:c.description,有插画:c.art?"是":"否"}})
}
$("#exportManifest").onclick=function(){var csv="\uFEFF"+Papa.unparse(manifestRows());downloadText(csv,"卡牌导出清单.csv","text/csv;charset=utf-8");setStatus("CSV 清单已导出")};
$("#exportJsonList").onclick=function(){downloadText(JSON.stringify(manifestRows(),null,2),"卡牌导出清单.json","application/json");setStatus("JSON 清单已导出")};

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

renderAll();
dbGet("project-v3").then(function(savedDb){
  dbReady=true;
  if(savedDb&&savedDb.project&&Array.isArray(savedDb.project.cards)&&savedDb.project.cards.length){
    var p=savedDb.project;
    cards=p.cards.map(normalizeCard);skins=(p.skins||skins).map(function(x){x.appearance=normalizeAppearance(x.appearance);return x});
    userAssets=p.userAssets||[];customTemplates=p.customTemplates||{};favoriteAssets=p.favoriteAssets||[];snapshots=p.snapshots||[];
    TEMPLATES=Object.assign({},BUILTIN_TEMPLATES,customTemplates);
    selected=p.selected&&cards.some(function(c){return c.id===p.selected})?p.selected:cards[0].id;
    if(p.aiStyle){aiStyle=p.aiStyle;$("#aiStyle").value=p.aiStyle}if(p.projectName)projectName=p.projectName;if(p.aiQuality)aiQuality=p.aiQuality;if(p.printSettings)printSettings=Object.assign({sheet:"a4",crop:true},p.printSettings);
    renderAll();setStatus("已恢复完整项目（含图片）");
  }else{scheduleDbSave()}
}).catch(function(){dbReady=true;scheduleDbSave()});
})();