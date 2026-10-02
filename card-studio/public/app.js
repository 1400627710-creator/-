(function(){
"use strict";

var uid=function(){return crypto.randomUUID()};
var clone=function(v){return JSON.parse(JSON.stringify(v))};
var $=function(q){return document.querySelector(q)};
var $$=function(q){return Array.prototype.slice.call(document.querySelectorAll(q))};
var esc=function(v){return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")};
var num=function(v,f){var n=Number(v);return Number.isFinite(n)?n:(f||0)};
var nowText=function(){return new Date().toLocaleString("zh-CN",{hour12:false})};

var TEMPLATES={
  unit:{id:"unit",name:"标准单位卡",short:"单位",hint:"攻击 / 血量 / 移速 / 射程",typeLabel:"兵种",stats:[["attack","攻","攻击"],["health","血","血量"],["move","移","移速"],["range","射","射程"]]},
  spell:{id:"spell",name:"法术卡",short:"法术",hint:"威力 / 射程，效果区更大",typeLabel:"法术类型",stats:[["attack","威","威力"],["range","射","射程"]]},
  building:{id:"building",name:"建筑卡",short:"建筑",hint:"火力 / 耐久 / 射程",typeLabel:"建筑类型",stats:[["attack","火","火力"],["health","耐","耐久"],["range","射","射程"]]},
  event:{id:"event",name:"事件卡",short:"事件",hint:"大文本区，无战斗数值",typeLabel:"事件类型",stats:[]}
};

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
  frameStyle:"classic",textureStyle:"clean",costStyle:"circle",rarityStyle:"star",fontStyle:"default"
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
var saved=loadJson("card-studio-project-v2",null)||loadJson("card-studio-project",null);
var cards=saved&&saved.cards&&saved.cards.length?saved.cards:sample;
var selected=saved&&saved.selected&&cards.some(function(c){return c.id===saved.selected})?saved.selected:cards[0].id;
var skins=loadJson("card-studio-skins",BASE_SKINS);
var favoriteAssets=loadJson("card-studio-favorite-assets",[]);
var snapshots=loadJson("card-studio-snapshots",[]);
var aiStyle=loadJson("card-studio-ai-style","统一的东方奇幻桌游插画，厚涂，电影光影，材质细腻，不出现文字");

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

var history=[],future=[],historyLimit=80;
var current=function(){return cards.find(function(c){return c.id===selected})||cards[0]};
var stateSnapshot=function(){return JSON.stringify({cards:cards,selected:selected,skins:skins,favoriteAssets:favoriteAssets})};
var restoreState=function(raw){
  var s=typeof raw==="string"?JSON.parse(raw):clone(raw);
  cards=(s.cards||[]).map(normalizeCard);selected=s.selected&&cards.some(function(c){return c.id===s.selected})?s.selected:(cards[0]&&cards[0].id);
  skins=(s.skins||skins).map(function(x){x.appearance=normalizeAppearance(x.appearance);return x});
  favoriteAssets=s.favoriteAssets||favoriteAssets;
  renderAll();
};
var recordHistory=function(){
  history.push(stateSnapshot());if(history.length>historyLimit)history.shift();future=[];
  updateHistoryButtons();
};
var updateHistoryButtons=function(){$("#undoBtn").disabled=!history.length;$("#redoBtn").disabled=!future.length};
var persist=function(){
  try{
    localStorage.setItem("card-studio-project-v2",JSON.stringify({cards:cards,selected:selected}));
    localStorage.setItem("card-studio-skins",JSON.stringify(skins));
    localStorage.setItem("card-studio-favorite-assets",JSON.stringify(favoriteAssets));
    localStorage.setItem("card-studio-snapshots",JSON.stringify(snapshots.slice(0,12)));
    localStorage.setItem("card-studio-ai-style",JSON.stringify($("#aiStyle")?$("#aiStyle").value:aiStyle));
  }catch(e){}
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
var cardHtml=function(card,editable){
  var t=TEMPLATES[card.templateId]||TEMPLATES.unit,a=normalizeAppearance(card.appearance),ce=editable?' contenteditable="true"':"";
  var desc=esc(resolveVars(card.description,card)).replace(/\n/g,"<br>");
  var artEmpty=card.art?"":'<div class="art-empty">插画区域<br><small>上传图片或使用 AI 生成</small></div>';
  var stats=t.stats.map(function(s){
    return '<div class="stat"><small>'+s[1]+'</small><strong data-edit="'+s[0]+'"'+ce+'>'+esc(card[s[0]])+'</strong></div>';
  }).join("");
  var classes=["card","tpl-"+t.id,"frame-"+a.frameStyle,"texture-"+a.textureStyle,"cost-"+a.costStyle,"rarity-"+a.rarityStyle,"font-"+a.fontStyle].join(" ");
  var style="--p:"+a.primary+";--s:"+a.secondary+";--a:"+a.accent+";--f:"+a.frame+";--t:"+a.text+";--stats-count:"+Math.max(1,t.stats.length);
  return '<div class="'+classes+'" style="'+style+'">'+
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
var renderCard=function(){
  var c=current(),t=TEMPLATES[c.templateId];
  $("#preview").innerHTML=cardHtml(c,true);setArt($("#preview"),c);
  $("#templateName").textContent=t.name;$("#typeLabel").childNodes[0].nodeValue=t.typeLabel;
  $$("[data-form]").forEach(function(el){var f=el.getAttribute("data-form");el.value=c[f]==null?"":c[f]});
  $("#description").value=c.description||"";
  $("#dynamicStats").innerHTML=t.stats.map(function(s){return '<label>'+s[2]+'<input type="number" data-stat="'+s[0]+'" value="'+esc(c[s[0]])+'"></label>'}).join("");
  $$("[data-color]").forEach(function(el){el.value=c.appearance[el.getAttribute("data-color")]});
  renderTemplates();renderAssets();renderSkins();
};
var renderExport=function(card){$("#exportCard").innerHTML=cardHtml(card,false);setArt($("#exportCard"),card)};
var renderList=function(){
  var q=$("#cardSearch").value.trim().toLowerCase();
  var list=cards.filter(function(c){
    var t=TEMPLATES[c.templateId]||TEMPLATES.unit;
    return !q||[c.name,t.name,c.faction,c.unitType,c.rarity,c.tags].join(" ").toLowerCase().indexOf(q)>=0;
  });
  $("#count").textContent=cards.length+" 张";
  $("#cardList").innerHTML=list.map(function(c,i){
    var t=TEMPLATES[c.templateId]||TEMPLATES.unit;
    return '<button class="card-row '+(c.id===selected?"active":"")+'" data-id="'+c.id+'"><span class="n">'+String(i+1).padStart(2,"0")+'</span><span><strong>'+esc(c.name)+'</strong><small>'+esc(t.short)+' · '+esc(c.faction)+' · '+esc(c.rarity)+'</small></span><span class="cost">'+esc(c.cost)+'</span></button>';
  }).join("");
  $("#delete").disabled=cards.length<=1;
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
var renderAll=function(){renderList();renderCard();renderSnapshots();updateHistoryButtons();persist()};

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
$("#cardSearch").addEventListener("input",renderList);
$$("[data-form]").forEach(function(el){el.addEventListener("change",function(){patch(el.getAttribute("data-form"),el.value,true)});el.addEventListener("input",function(){var c=current();var f=el.getAttribute("data-form");c[f]=["cost","attack","health","move","range"].indexOf(f)>=0?num(el.value,0):el.value;renderCard();renderList();persist()})});
$("#dynamicStats").addEventListener("change",function(e){var f=e.target.getAttribute("data-stat");if(f)patch(f,e.target.value,true)});
$("#dynamicStats").addEventListener("input",function(e){var f=e.target.getAttribute("data-stat");if(f){current()[f]=num(e.target.value,0);renderCard();renderList();persist()}});
$("#description").addEventListener("change",function(){patch("description",this.value,true)});
$("#description").addEventListener("input",function(){current().description=this.value;renderCard();persist()});
Object.keys(vars).forEach(function(v){var b=document.createElement("button");b.textContent="{"+v+"}";b.onclick=function(){patch("description",(current().description||"")+"{"+v+"}",true)};$("#variables").appendChild(b)});

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
    var res=await fetch("/api/generate-image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt:prompt,style:$("#aiStyle").value,cardName:c.name,faction:c.faction,cardType:TEMPLATES[c.templateId].name})});
    var data=await res.json();if(!res.ok)throw new Error(data.error||"生成失败");
    patch("art",data.image,true);setStatus("AI 插画已自动适配卡面");
  }catch(err){setStatus("AI 生成失败："+(err.message||"未知错误"))}
  btn.disabled=false;
};

$("#assetSearch").oninput=renderAssets;$("#assetCategory").onchange=renderAssets;
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
$$("[data-color]").forEach(function(el){el.onchange=function(){patchAppearance(el.getAttribute("data-color"),el.value)};el.oninput=function(){current().appearance[el.getAttribute("data-color")]=el.value;renderCard();persist()}});
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

renderAll();
})();