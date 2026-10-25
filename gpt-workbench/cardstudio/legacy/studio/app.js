(function(){
"use strict";

var KadiLayout=window.KadiLayout,KadiEdit=window.KadiEdit,IMAGE_ROLE_FIELDS=window.KadiImages.roleFields;
var APP_VERSION="3.0.0-beta10",PROJECT_SCHEMA_VERSION=20,PRIMARY_DB_KEY="project-v13",RECOVERY_DB_KEY="recovery-v1";

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
BUILTIN_TEMPLATES[KadiLayout.BASIC_ID]=clone(KadiLayout.BASIC_TEMPLATE);
function cardTemplate(card){return KadiLayout.templateFor(card,TEMPLATES)}
function simpleCard(card){return KadiLayout.simple(card,TEMPLATES)}
function availableTemplateIds(){return KadiLayout.available(TEMPLATES,{cards:cards,projectDesign:projectDesign})}
var customTemplates=loadEarly("card-studio-custom-templates",{});
var TEMPLATES=Object.assign({},clone(BUILTIN_TEMPLATES),customTemplates);
function rebuildTemplateCatalog(){TEMPLATES=Object.assign({},clone(BUILTIN_TEMPLATES),clone(customTemplates));Object.keys(projectDesign.templateLabels||{}).forEach(function(id){if(TEMPLATES[id]){TEMPLATES[id].name=projectDesign.templateLabels[id];TEMPLATES[id].short=String(projectDesign.templateLabels[id]).slice(0,8)}})}
var templateLayouts=loadEarly("card-studio-template-layouts",{});

var CARD_BLEED_W_MM=69,CARD_BLEED_H_MM=94,CARD_TRIM_W_MM=63,CARD_TRIM_H_MM=88,CARD_BLEED_MM=3;
var DEFAULT_PROJECT_DESIGN={
  layoutStep:.05,
  snapTolerance:.7,
  axisTolerancePx:.45,
  safeMargin:5,
  safeContentMm:3,
  bleedMm:3,
  showPrintGuides:false,
  targetPrintDpi:300,
  minimumPrintDpi:220,
  titleMinFont:8,
  effectMinFont:9,
  ruleLineHeight:1.34,
  ruleBlockGapEm:.18,
  ruleStyle:"pill",
  ruleIconBaselineEm:-.04,
  ruleTailChars:4,
  ruleWidowControl:true,
  artSubjectSafePct:10,
  opticalCentering:true,
  opticalTolerancePx:.35,
  reviewRuleDensityRatio:1.75,
  reviewOverrideWarn:5,
  primary:"#111827",
  secondary:"#334155",
  accent:"#f59e0b",
  text:"#f8fafc",
  fontStyle:"default",
  cardBackAssetId:""
};
var projectDesign=Object.assign({},DEFAULT_PROJECT_DESIGN,loadEarly("card-studio-project-design",{}));
function safeFieldKey(v){return String(v||"").trim().replace(/\s+/g,"_").replace(/[^\w\u4e00-\u9fff-]/g,"").slice(0,40)}
function normalizeFieldSchema(list){
  return (Array.isArray(list)?list:[]).map(function(f,i){
    var type=["text","number","select","boolean","cardRef"].indexOf(f&&f.type)>=0?f.type:"text";
    return {id:f.id||uid(),key:safeFieldKey(f.key||("field_"+(i+1)))||("field_"+(i+1)),label:f.label==null?String(f.key||("字段 "+(i+1))):String(f.label),tpl:String(f.tpl||""),type:type,required:!!f.required,options:Array.isArray(f.options)?f.options:String(f.options||"").split(",").map(function(x){return x.trim()}).filter(Boolean),min:f.min==null||f.min===""?null:Number(f.min),max:f.max==null||f.max===""?null:Number(f.max),defaultValue:f.defaultValue==null?"":f.defaultValue};
  });
}
var fieldSchema=normalizeFieldSchema(loadEarly("card-studio-field-schema",[]));
var templateConditions=loadEarly("card-studio-template-conditions",{});
var layoutComponents=loadEarly("card-studio-layout-components",[]);
var templateBadgeStyles=loadEarly("card-studio-template-badges",{});
function normalizeCardBackProfiles(v){v=v&&typeof v==="object"?v:{};return {byTemplate:v.byTemplate&&typeof v.byTemplate==="object"?v.byTemplate:{},bySet:v.bySet&&typeof v.bySet==="object"?v.bySet:{}}}
var cardBackProfiles=normalizeCardBackProfiles(loadEarly("card-studio-card-back-profiles",{}));

// 3.0 Alpha 4: project development model. Sets, families, playtests and project versions use stable IDs.
var SET_STATUSES=["开发中","测试中","准备发布","已发布","归档"];
function normalizeProjectSets(list){return (Array.isArray(list)?list:[]).map(function(x,i){return {id:x&&x.id||uid(),name:String(x&&x.name||("扩展包 "+(i+1))),code:String(x&&x.code||("SET"+String(i+1).padStart(2,"0"))).trim().toUpperCase(),status:SET_STATUSES.indexOf(x&&x.status)>=0?x.status:"开发中",releaseDate:String(x&&x.releaseDate||""),numberPrefix:String(x&&x.numberPrefix||""),numberStart:Math.max(0,num(x&&x.numberStart,1)),numberPadding:Math.max(1,Math.min(6,num(x&&x.numberPadding,3))),locked:!!(x&&x.locked),lockedAt:String(x&&x.lockedAt||""),createdAt:String(x&&x.createdAt||new Date().toISOString())}})}
function normalizeFamilies(list){return (Array.isArray(list)?list:[]).map(function(x,i){return {id:x&&x.id||uid(),name:String(x&&x.name||("卡牌家族 "+(i+1))),baseCardId:String(x&&x.baseCardId||""),createdAt:String(x&&x.createdAt||new Date().toISOString())}})}
function normalizePlaytests(list){return (Array.isArray(list)?list:[]).map(function(x){return {id:x&&x.id||uid(),cardId:String(x&&x.cardId||""),date:String(x&&x.date||new Date().toISOString().slice(0,10)),sessions:Math.max(0,num(x&&x.sessions,1)),plays:Math.max(0,num(x&&x.plays,0)),wins:Math.max(0,num(x&&x.wins,0)),rating:String(x&&x.rating||"待观察"),note:String(x&&x.note||""),changeNote:String(x&&x.changeNote||""),createdAt:String(x&&x.createdAt||new Date().toISOString())}})}
function normalizeProjectVersions(list){return (Array.isArray(list)?list:[]).map(function(x,i){return {id:x&&x.id||uid(),label:String(x&&x.label||("版本 "+(i+1))),note:String(x&&x.note||""),time:String(x&&x.time||new Date().toISOString()),state:x&&x.state&&typeof x.state==="object"?x.state:{cards:[],projectSets:[],cardFamilies:[]}}}).slice(0,24)}
var projectSets=normalizeProjectSets(loadEarly("card-studio-project-sets",[]));
var cardFamilies=normalizeFamilies(loadEarly("card-studio-card-families",[]));
var playtests=normalizePlaytests(loadEarly("card-studio-playtests",[]));
var projectVersions=normalizeProjectVersions(loadEarly("card-studio-project-versions",[]));
var releaseHistory=Array.isArray(loadEarly("card-studio-release-history",[]))?loadEarly("card-studio-release-history",[]):[];
function projectSetById(id){return projectSets.find(function(x){return x.id===String(id||"")})||null}
function familyById(id){return cardFamilies.find(function(x){return x.id===String(id||"")})||null}
function cardFamilyMembers(id){return cards.filter(function(c){return c.familyId===id})}
function setCards(id){return cards.filter(function(c){return c.setId===id})}
function isCardLocked(card){var set=card&&projectSetById(card.setId);return !!(card&&(card.workflowStatus==="锁定"||card.releaseLocked)||(set&&set.locked))}
function lockReason(card){var set=card&&projectSetById(card.setId);if(set&&set.locked)return "所属扩展包“"+set.name+"”已发布锁定";if(card&&card.workflowStatus==="锁定")return "当前卡牌生产状态为“锁定”";if(card&&card.releaseLocked)return "当前卡牌已发布锁定";return ""}
function setDisplayName(card){var set=card&&projectSetById(card.setId);return set?set.name:String(card&&card.setName||"")}
function ensureSetCatalogFromCards(){cards.forEach(function(c){if(c.setId&&projectSetById(c.setId)){c.setName=projectSetById(c.setId).name;return}var name=String(c.setName||"").trim();if(!name){c.setId="";return}var found=projectSets.find(function(s){return s.name===name});if(!found){var base=safeFieldKey(name).replace(/[^A-Za-z0-9]/g,"").toUpperCase().slice(0,6)||("SET"+(projectSets.length+1));found={id:uid(),name:name,code:base,status:"开发中",releaseDate:"",numberPrefix:base+"-",numberStart:1,numberPadding:3,locked:false,lockedAt:"",createdAt:new Date().toISOString()};projectSets.push(found)}c.setId=found.id;c.setName=found.name})}
function ensureFamilyIntegrity(){cardFamilies=cardFamilies.filter(function(f){var members=cardFamilyMembers(f.id);if(!members.length)return false;if(!members.some(function(c){return c.id===f.baseCardId}))f.baseCardId=members[0].id;return true});cards.forEach(function(c){if(c.familyId&&!familyById(c.familyId)){c.familyId="";c.variantKind="标准";c.variantOf=""}})}
function precisionRound(v){
  var step=Math.max(.001,Number(projectDesign.layoutStep)||.05),n=Number(v);
  return Number.isFinite(n)?Math.round(n/step)*step:v;
}
function schemaForCard(card){return fieldSchema.filter(function(f){return !f.tpl||card&&f.tpl===card.templateId})}
function fieldDefByKey(key){return fieldSchema.find(function(f){return f.key===key})}
function customFieldValue(card,key){return card&&card.customFields&&card.customFields[key]!=null?card.customFields[key]:""}
function displayCustomFieldValue(card,def){var v=customFieldValue(card,def.key);if(def.type==="cardRef"){var target=cards&&cards.find?cards.find(function(x){return x.id===String(v)}):null;return target?(target.cardNumber?(target.cardNumber+" · "+target.name):target.name):""}return v}
function allConditionFieldDefs(){
  var core=[
    {key:"name",label:"名称",type:"text"},{key:"cost",label:"费用",type:"number"},{key:"faction",label:"系别",type:"text"},{key:"unitType",label:"类型",type:"text"},
    {key:"rarity",label:"稀有度",type:"text"},{key:"attack",label:"攻击",type:"number"},{key:"health",label:"血量",type:"number"},{key:"move",label:"移速",type:"number"},
    {key:"range",label:"射程",type:"number"},{key:"workflowStatus",label:"生产状态",type:"text"},{key:"tags",label:"标签",type:"text"}
  ];
  return core.map(function(f){return Object.assign({},f,{label:fieldDisplayName(f.key,f.label)})}).concat(fieldSchema.map(function(f){return {key:"custom:"+f.key,label:f.label,type:f.type}}));
}
function conditionFieldValue(card,key){if(String(key).indexOf("custom:")===0)return customFieldValue(card,String(key).slice(7));return card?card[key]:""}
function conditionMatches(card,cond){
  if(!cond||!cond.field||!cond.op||cond.op==="always")return true;
  var raw=conditionFieldValue(card,cond.field),val=cond.value==null?"":cond.value,op=cond.op;
  if(op==="empty")return raw==null||String(raw).trim()==="";
  if(op==="notEmpty")return raw!=null&&String(raw).trim()!=="";
  if(op==="gt"||op==="lt"){var a=Number(raw),b=Number(val);if(!Number.isFinite(a)||!Number.isFinite(b))return false;return op==="gt"?a>b:a<b}
  if(op==="contains")return String(raw||"").toLowerCase().indexOf(String(val||"").toLowerCase())>=0;
  if(op==="neq")return String(raw)==String(val)?false:true;
  return String(raw)==String(val);
}
function templateCondition(templateId,key){var map=templateConditions[templateId];return map&&map[key]?map[key]:null}
function conditionVisible(card,key){return conditionMatches(card,templateCondition(card.templateId,key))}

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
  frameStyle:"classic",textureStyle:"clean",costStyle:"circle",rarityStyle:"star",fontStyle:"default",finishStyle:"premium",frameImageAssetId:"",textureImageAssetId:"",iconAssetId:"",artFocusX:50,artFocusY:50,artSubjectX:50,artSubjectY:42,artZoom:100,autoFitText:true,
  titleSize:22,titleColor:"#f8fafc",titleAlign:"center",titleBold:true,
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
  title:{x:22,y:4,w:56,h:10,r:0,z:24,locked:false,opacity:1,visible:true},
  faction:{x:15,y:14,w:62,h:5,r:0,z:23,locked:false,opacity:1,visible:true},
  rarityMark:{x:88,y:22,w:8,h:8,r:0,z:31,locked:false,opacity:1,visible:true},
  type:{x:8,y:62,w:38,h:7,r:0,z:22,locked:false,opacity:1,visible:true},
  rarityText:{x:54,y:62,w:38,h:7,r:0,z:22,locked:false,opacity:1,visible:true},
  effect:{x:8,y:69,w:84,h:18,r:0,z:20,locked:false,opacity:1,visible:true},
  stat_attack:{x:7,y:87,w:20,h:10,r:0,z:25,locked:false,opacity:1,visible:true},
  stat_health:{x:29,y:87,w:20,h:10,r:0,z:25,locked:false,opacity:1,visible:true},
  stat_move:{x:51,y:87,w:20,h:10,r:0,z:25,locked:false,opacity:1,visible:true},
  stat_range:{x:73,y:87,w:20,h:10,r:0,z:25,locked:false,opacity:1,visible:true},
  tags:{x:8,y:58,w:70,h:5,r:0,z:20,locked:false,opacity:1,visible:true},
  footerLeft:{x:6,y:95,w:56,h:3.2,r:0,z:32,locked:false,opacity:.9,visible:true},
  footerRight:{x:64,y:95,w:30,h:3.2,r:0,z:32,locked:false,opacity:.9,visible:true},
  frameImage:{x:0,y:0,w:100,h:100,r:0,z:11,locked:false,opacity:1,visible:true,fit:"fill",lockAspect:false},
  textureImage:{x:4.310345,y:54.852321,w:91.37931,h:41.983122,r:0,z:3,locked:false,opacity:.35,visible:true,fit:"cover",lockAspect:false},
  iconImage:{x:83.045977,y:75.949367,w:8.62069,h:6.329114,r:0,z:8,locked:false,opacity:1,visible:true,fit:"contain",lockAspect:false}
};
function enforceTitleAxis(layout){
  if(!layout||!layout.title)return layout;
  var p=layout.title,w=Number(p.w);if(!Number.isFinite(w))w=56;w=Math.max(12,Math.min(92,w));p.w=precisionRound(w);p.x=Math.round(((100-p.w)/2)*1000)/1000;p.r=0;return layout;
}
function quantizeLayout(layout){
  Object.keys(layout||{}).forEach(function(k){var p=layout[k];if(!p)return;["x","y","w","h","r"].forEach(function(f){var v=Number(p[f]);if(Number.isFinite(v))p[f]=precisionRound(v)});if(Number.isFinite(Number(p.z)))p.z=Math.round(Number(p.z))});return enforceTitleAxis(layout);
}
function defaultLayoutForTemplate(templateId){
  var out=clone(DEFAULT_LAYOUT),t=TEMPLATES[templateId]||TEMPLATES.unit,stats=t.stats||[],gap=2,totalW=86,n=Math.max(1,stats.length),cell=(totalW-gap*(n-1))/n;
  stats.forEach(function(st,i){var key="stat_"+st[0];out[key].x=7+i*(cell+gap);out[key].w=cell});
  if(t.cardRules==="seven-v1"){
    ["rarityMark","rarityText","tags","footerLeft","footerRight","stat_move","stat_range"].forEach(function(k){out[k].visible=false});
    out.title=Object.assign(out.title,{x:21,y:4,w:58,h:10});out.cost=Object.assign(out.cost,{x:5,y:3,w:15,h:13});
    out.type=Object.assign(out.type,{x:8,y:62,w:38,h:5});out.faction=Object.assign(out.faction,{x:54,y:62,w:38,h:5});
    out.effect=Object.assign(out.effect,{x:8,y:69,w:84,h:18});
    out.stat_attack=Object.assign(out.stat_attack,{x:7,y:89,w:18,h:8});out.stat_health=Object.assign(out.stat_health,{x:75,y:89,w:18,h:8});
  }
  return enforceTitleAxis(out);
}
var makeLayout=function(templateId){
  var out=defaultLayoutForTemplate(templateId),saved=templateLayouts[templateId];
  if(saved&&typeof saved==="object")Object.keys(saved).forEach(function(k){if(out[k])out[k]=Object.assign({},out[k],clone(saved[k]))});
  return quantizeLayout(out);
};
function masterLayoutSnapshot(templateId,layout){
  var out=defaultLayoutForTemplate(templateId);Object.keys(out).forEach(function(k){if(layout&&layout[k])out[k]=Object.assign({},out[k],clone(layout[k]))});return quantizeLayout(out);
}
function saveTemplateMaster(templateId,layout){
  templateLayouts[templateId]=masterLayoutSnapshot(templateId,layout);
  if(customTemplates[templateId])customTemplates[templateId].masterLayout=clone(templateLayouts[templateId]);
  return templateLayouts[templateId];
}
function applyTemplateMaster(templateId){
  var master=makeLayout(templateId),applied=0,locked=0;cards.forEach(function(c){if(c.templateId!==templateId)return;if(isCardLocked(c)){locked++;return}ensureLayoutOverrides(c);Object.keys(master).forEach(function(k){if(!c.layoutOverrides[k])c.layout[k]=clone(master[k])});enforceTitleAxis(c.layout);applied++});master._applyStats={applied:applied,locked:locked};return master;
}

var makeCard=function(templateId,name){
  var t=TEMPLATES[templateId||KadiLayout.defaultTemplateId({projectDesign:projectDesign},TEMPLATES)]||TEMPLATES[KadiLayout.BASIC_ID],basic=t.cardRules==="seven-v1";
  var card={
    id:uid(),templateId:t.id,cardKind:"unit",name:name||("新"+t.short+"卡"),cost:basic?0:1,faction:basic?"":"中立",
    description:basic?"":"在这里填写卡牌效果。可使用 {费用}、{攻击} 等变量。",
    attack:t.id==="event"?0:1,health:t.id==="event"?0:1,move:t.id==="unit"?2:0,range:t.id==="unit"?1:0,
    unitType:basic?"":t.short,rarity:basic?"":"普通",workflowStatus:"设计中",tags:"",rulesKeywords:"",cardNumber:"",setName:"",setId:"",familyId:"",variantKind:"标准",variantOf:"",releaseLocked:false,year:String(new Date().getFullYear()),credit:"",art:"",artAssetId:"",artPrompt:"",customFields:{},appearance:Object.assign(clone(DEFAULT_APPEARANCE),basic?{statsColor:"#111827"}:{}),layout:makeLayout(t.id),layoutOverrides:{},extraElements:[]
  };
  return KadiLayout.applyCreationDefault(card,{projectDesign:projectDesign,customTemplates:customTemplates},uid);
};
var sample=[makeCard(KadiLayout.BASIC_ID,"新单位卡")];

var vars={"名称":"name","费用":"cost","系别":"faction","攻击":"attack","血量":"health","移速":"move","射程":"range","兵种":"unitType","种族":"unitType","稀有度":"rarity","编号":"cardNumber","系列":"setName","年份":"year","署名":"credit"};

// 3.0 semantic object model: UI behavior follows what the object means, not a generic rectangle.
var SEMANTIC_OBJECTS={
  title:{role:"卡牌名称",kind:"title",anchor:"card-top-center",alignBy:"text",lockX:true,lockRotation:true,resize:"width",minW:18,maxW:92,minH:5,maxH:14,minFont:8,hint:"以文字实际渲染宽度居中；水平中心固定在卡牌 X=50%，宽度只代表允许文字占用的最大范围。"},
  cost:{role:"费用",kind:"value",anchor:"slot",alignBy:"content",resize:"both",hint:"数值应围绕费用槽视觉中心定位；模块框只是允许区域。"},
  faction:{role:"系别",kind:"label",anchor:"master",alignBy:"text",resize:"both",hint:"默认跟随主模板；只有特殊卡需要解除继承。"},
  rarityMark:{role:"稀有度标记",kind:"icon",anchor:"master",alignBy:"content",resize:"both",hint:"图标以自身视觉中心参与对齐。"},
  type:{role:"卡牌类型",kind:"label",anchor:"master",alignBy:"text",resize:"both",hint:"文本对象默认跟随主模板。"},
  rarityText:{role:"稀有度文字",kind:"label",anchor:"master",alignBy:"text",resize:"both",hint:"文本对象默认跟随主模板。"},
  effect:{role:"规则文本区",kind:"rules",anchor:"master",alignBy:"content",resize:"both",hint:"区域负责限制正文；正文是否溢出由项目检查中心按真实 DOM 测量。"},
  stat_attack:{role:"攻击 / 威力",kind:"value",anchor:"master",alignBy:"content",resize:"both",hint:"数值模块以内容中心对齐。"},
  stat_health:{role:"生命 / 耐久",kind:"value",anchor:"master",alignBy:"content",resize:"both",hint:"数值模块以内容中心对齐。"},
  stat_move:{role:"移动",kind:"value",anchor:"master",alignBy:"content",resize:"both",hint:"数值模块以内容中心对齐。"},
  stat_range:{role:"射程",kind:"value",anchor:"master",alignBy:"content",resize:"both",hint:"数值模块以内容中心对齐。"},
  art:{role:"插画窗口",kind:"art",anchor:"master",alignBy:"frame",resize:"both",hint:"模板控制插画窗口；每张卡独立保存人物焦点和缩放，而不是反复移动窗口。"},
  tags:{role:"检索标签",kind:"meta",anchor:"master",alignBy:"text",resize:"both",hint:"项目数据字段，不建议为单张卡随意移动。"},
  footerLeft:{role:"系列 / 编号 / 年份",kind:"meta",anchor:"master",alignBy:"text",resize:"both",hint:"出版信息默认跟随模板。"},
  footerRight:{role:"署名",kind:"meta",anchor:"master",alignBy:"text",resize:"both",hint:"出版信息默认跟随模板。"}
};
SEMANTIC_OBJECTS.frameImage={role:"透明卡框",kind:"image",alignBy:"frame",resize:"both",hint:"保持原图比例，独立调整卡框的位置、尺寸、透明度与层级。"};SEMANTIC_OBJECTS.textureImage=Object.assign({},SEMANTIC_OBJECTS.frameImage,{role:"图片底纹"});SEMANTIC_OBJECTS.iconImage=Object.assign({},SEMANTIC_OBJECTS.frameImage,{role:"素材图标"});
function semanticForModel(m){return m&&m.type==="layout"?(SEMANTIC_OBJECTS[m.id]||{role:m.label||m.id,kind:"layout",anchor:"master",alignBy:"frame",resize:"both",hint:"标准模板对象。"}):{role:m&&m.label||"自由元素",kind:"free",anchor:"free",alignBy:"frame",resize:"both",hint:"自由元素不受主模板继承约束。"}}
function layoutGeomEqual(a,b){if(!a||!b)return false;return ["x","y","w","h","r","z","visible","opacity","materialOpacity","textOpacity","fit","lockAspect"].every(function(k){if(k==="visible")return (a[k]!==false)===(b[k]!==false);var av=Number(a[k]),bv=Number(b[k]);if(Number.isFinite(av)||Number.isFinite(bv))return Math.abs((Number.isFinite(av)?av:0)-(Number.isFinite(bv)?bv:0))<=Math.max(.001,(Number(projectDesign.layoutStep)||.05)/2+.001);return a[k]===b[k]})}
function ensureLayoutOverrides(card){if(card.layoutOverrides&&typeof card.layoutOverrides==="object")return card.layoutOverrides;var master=makeLayout(card.templateId),out={};Object.keys(card.layout||{}).forEach(function(k){if(master[k]&&!layoutGeomEqual(card.layout[k],master[k]))out[k]=true});card.layoutOverrides=out;return out}
function isLayoutOverride(card,key){return !!(card&&ensureLayoutOverrides(card)[key])}
function setLayoutOverride(card,key,on){if(!card||!key)return;var map=ensureLayoutOverrides(card);if(on)map[key]=true;else delete map[key]}

var loadJson=function(key,fallback){try{var v=JSON.parse(localStorage.getItem(key)||"null");return v==null?fallback:v}catch(e){return fallback}};
var dbReady=false,dbSaveTimer=null,persistTimer=null,lastDurableProject=null,lastDbSaveAt=0,savePhase="saved",bootstrapping=true;
function setSaveIndicator(phase,text){savePhase=phase;var el=$("#summarySave");if(!el)return;el.classList.remove("is-dirty","is-saving","is-error");if(phase==="dirty")el.classList.add("is-dirty");else if(phase==="saving")el.classList.add("is-saving");else if(phase==="error")el.classList.add("is-error");var span=el.querySelector("span");if(span)span.textContent=text||(phase==="dirty"?"有未保存更改":phase==="saving"?"正在自动保存…":phase==="error"?"自动保存失败":"已自动保存")}
function openProjectDb(){
  return new Promise(function(resolve,reject){
    var req=indexedDB.open("card-assembly-studio",2);
    req.onupgradeneeded=function(){if(!req.result.objectStoreNames.contains("kv"))req.result.createObjectStore("kv");if(!req.result.objectStoreNames.contains("assets"))req.result.createObjectStore("assets",{keyPath:"id"})};
    req.onsuccess=function(){resolve(req.result)};req.onerror=function(){reject(req.error)};
  });
}
async function dbPut(key,value){var db=await openProjectDb();return new Promise(function(resolve,reject){var tx=db.transaction("kv","readwrite");tx.objectStore("kv").put(value,key);tx.oncomplete=function(){db.close();resolve()};tx.onerror=function(){db.close();reject(tx.error)}})}
async function dbGet(key){var db=await openProjectDb();return new Promise(function(resolve,reject){var tx=db.transaction("kv","readonly"),req=tx.objectStore("kv").get(key);req.onsuccess=function(){db.close();resolve(req.result)};req.onerror=function(){db.close();reject(req.error)}})}
async function dbPutAssets(list){var db=await openProjectDb();return new Promise(function(resolve,reject){var tx=db.transaction("assets","readwrite"),store=tx.objectStore("assets");store.clear();(list||[]).forEach(function(a){if(a&&a.id&&a.dataUrl)store.put(a)});tx.oncomplete=function(){db.close();resolve()};tx.onerror=function(){db.close();reject(tx.error)}})}
async function dbGetAssets(){var db=await openProjectDb();return new Promise(function(resolve,reject){var tx=db.transaction("assets","readonly"),req=tx.objectStore("assets").getAll();req.onsuccess=function(){db.close();resolve(req.result||[])};req.onerror=function(){db.close();reject(req.error)}})}
function scheduleDbSave(delay){if(!dbReady)return;clearTimeout(dbSaveTimer);setSaveIndicator("saving");dbSaveTimer=setTimeout(async function(){
  var next={updatedAt:Date.now(),project:projectPayload(false),snapshots:snapshots};
  try{
    var jobs=[dbPut(PRIMARY_DB_KEY,next),dbPutAssets(userAssets)];
    if(lastDurableProject&&lastDurableProject.project)jobs.push(dbPut(RECOVERY_DB_KEY,lastDurableProject));
    await Promise.all(jobs);lastDurableProject=clone(next);lastDbSaveAt=Date.now();setSaveIndicator("saved","已自动保存 · "+new Date(lastDbSaveAt).toLocaleTimeString("zh-CN",{hour12:false,hour:"2-digit",minute:"2-digit"}));
  }catch(e){console.error("Card Studio autosave failed",e);setSaveIndicator("error","自动保存失败");setStatus("自动保存失败：请立即保存 .cardstudio，或打开安全恢复")
  }
},delay==null?850:delay)};
var saved=loadJson("card-studio-project-v2",null)||loadJson("card-studio-project",null);
var cards=saved&&saved.cards&&saved.cards.length?saved.cards:sample;
var selected=saved&&saved.selected&&cards.some(function(c){return c.id===saved.selected})?saved.selected:cards[0].id;
var skins=loadJson("card-studio-skins",BASE_SKINS);
var favoriteAssets=loadJson("card-studio-favorite-assets",[]);
var snapshots=loadJson("card-studio-snapshots",[]);
var userAssets=loadJson("card-studio-user-assets",[]);
var assetBinaryCache={};
var ruleTerms=loadJson("card-studio-rule-terms",[]);
var OLD_AI_STYLE="统一的东方奇幻桌游插画，厚涂，电影光影，材质细腻，不出现文字";
var LEGACY_AI_STYLE="古典奇幻桌游插画，传统人工油画质感，亚麻画布纹理，可见而自然的猪鬃笔触与颜料堆叠，柔和的明暗塑形，略带旧画册与十九世纪幻想插画气质，构图清晰、主体明确、色彩克制而丰富；避免现代数码渲染、3D塑料质感、霓虹赛博效果、照片感和任何文字";
var AI_STYLE_PRESETS={
  premium:"高端幻想收藏卡插画，成熟概念艺术厚涂，强烈但克制的电影光影，清晰的主体轮廓与动作叙事，丰富笔触和材质层次，局部锐利焦点配合大面积概括笔触，颜色统一而有高级灰变化，避免廉价手游立绘感、塑料3D感和任何文字",
  inkAnime:"高完成度幻想动漫插画，黑白墨线与厚涂结合，手绘排线、飞白和概括笔触，角色五官精致但不塑料，服装与武器有丰富结构，有限高饱和点色，强烈剪影和动态构图，避免扁平赛璐璐和任何文字",
  oil:LEGACY_AI_STYLE,
  abstract:"史诗幻想概念绘画，抽象大笔触与具象主体结合，戏剧化明暗和色块切割，人物边缘局部消融进环境，强烈方向性光线，保留手工绘画肌理和高级留白，避免杂乱细节、3D渲染和任何文字"
};
var DEFAULT_AI_STYLE=AI_STYLE_PRESETS.premium;
var aiStyle=loadJson("card-studio-ai-style",DEFAULT_AI_STYLE);if(aiStyle===OLD_AI_STYLE||aiStyle===LEGACY_AI_STYLE)aiStyle=DEFAULT_AI_STYLE;
var aiProviderPreference=localStorage.getItem("card-studio-ai-provider")||"manual";
var aiGeneratePresetPreference=localStorage.getItem("card-studio-ai-preset")||"standard";
var aiComfyWorkflow=localStorage.getItem("card-studio-comfy-workflow")||"";
var aiProviders=[];
var aiGeneratedCandidate=null;
var aiRequestController=null;
var projectName=saved&&saved.projectName?saved.projectName:"未命名卡牌项目";
var printSettings={sheet:"a4",crop:true,duplexFlip:"long",backRotate:false};
var SHEETS={a4:[210,297],a3:[297,420],letter:[215.9,279.4]};

var normalizeAppearance=function(a){return Object.assign(clone(DEFAULT_APPEARANCE),a||{})};
var normalizeCard=function(c){
  c.templateId=TEMPLATES[c.templateId]?c.templateId:"unit";
  c.appearance=normalizeAppearance(c.appearance);
  if(c.unitType==null)c.unitType=TEMPLATES[c.templateId].short;
  if(c.rarity==null)c.rarity="普通";if(c.workflowStatus==null)c.workflowStatus="设计中";
  if(c.tags==null)c.tags="";
  if(c.rulesKeywords==null)c.rulesKeywords="";
  if(c.cardNumber==null)c.cardNumber="";if(c.setName==null)c.setName="";if(c.setId==null)c.setId="";if(c.familyId==null)c.familyId="";if(c.variantKind==null)c.variantKind="标准";if(c.variantOf==null)c.variantOf="";if(c.releaseLocked==null)c.releaseLocked=false;if(c.year==null)c.year="";if(c.credit==null)c.credit="";if(!c.textStyles||typeof c.textStyles!=="object")c.textStyles={};
  var oldLayout=c.layout||{},t=cardTemplate(c),nextLayout=makeLayout(c.templateId);
  function legacy(base,patch){return Object.assign({},base||{},patch||{})}
  if(oldLayout.head&&!oldLayout.title){nextLayout.title=legacy(nextLayout.title,{x:oldLayout.head.x,y:oldLayout.head.y,w:oldLayout.head.w,h:Math.max(6,(oldLayout.head.h||17)*.58),r:oldLayout.head.r,z:oldLayout.head.z,locked:oldLayout.head.locked,opacity:oldLayout.head.opacity,visible:oldLayout.head.visible});nextLayout.faction=legacy(nextLayout.faction,{x:oldLayout.head.x,y:(oldLayout.head.y||0)+Math.max(7,(oldLayout.head.h||17)*.58),w:Math.max(30,(oldLayout.head.w||80)*.78),h:Math.max(4,(oldLayout.head.h||17)*.3),r:oldLayout.head.r,z:oldLayout.head.z,locked:oldLayout.head.locked,opacity:oldLayout.head.opacity,visible:oldLayout.head.visible})}
  if(oldLayout.meta&&!oldLayout.type){nextLayout.type=legacy(nextLayout.type,{x:oldLayout.meta.x,y:oldLayout.meta.y,w:(oldLayout.meta.w||84)*.46,h:oldLayout.meta.h,r:oldLayout.meta.r,z:oldLayout.meta.z,locked:oldLayout.meta.locked,opacity:oldLayout.meta.opacity,visible:oldLayout.meta.visible});nextLayout.rarityText=legacy(nextLayout.rarityText,{x:(oldLayout.meta.x||8)+(oldLayout.meta.w||84)*.54,y:oldLayout.meta.y,w:(oldLayout.meta.w||84)*.46,h:oldLayout.meta.h,r:oldLayout.meta.r,z:oldLayout.meta.z,locked:oldLayout.meta.locked,opacity:oldLayout.meta.opacity,visible:oldLayout.meta.visible})}
  if(oldLayout.rarity&&!oldLayout.rarityMark)nextLayout.rarityMark=legacy(nextLayout.rarityMark,oldLayout.rarity);
  if(oldLayout.stats){var stats=t.stats||[],gap=2,totalW=oldLayout.stats.w||86,n=Math.max(1,stats.length),cell=(totalW-gap*(n-1))/n;stats.forEach(function(st,i){var key="stat_"+st[0];if(!oldLayout[key])nextLayout[key]=legacy(nextLayout[key],{x:(oldLayout.stats.x||7)+i*(cell+gap),y:oldLayout.stats.y,w:cell,h:oldLayout.stats.h,r:oldLayout.stats.r,z:oldLayout.stats.z,locked:oldLayout.stats.locked,opacity:oldLayout.stats.opacity,visible:oldLayout.stats.visible})})}
  Object.keys(oldLayout).forEach(function(k){if(DEFAULT_LAYOUT[k])nextLayout[k]=Object.assign({},nextLayout[k],oldLayout[k])});
  Object.keys(IMAGE_ROLE_FIELDS).forEach(function(k){if(!oldLayout[k]&&(!c.appearance[IMAGE_ROLE_FIELDS[k]]||isCardLocked(c)))delete nextLayout[k]});
  c.layout=nextLayout;Object.keys(c.layout).forEach(function(k){c.layout[k]=Object.assign({},DEFAULT_LAYOUT[k]||{x:10,y:10,w:30,h:10,r:0,z:40,locked:false,opacity:1,visible:true},c.layout[k]||{});if(c.layout[k].opacity==null)c.layout[k].opacity=1;if(c.layout[k].visible==null)c.layout[k].visible=true});
  enforceTitleAxis(c.layout);ensureLayoutOverrides(c);c.appearance.titleAlign="center";if(c.textStyles&&c.textStyles.title)c.textStyles.title.align="center";
  if(!Array.isArray(c.extraElements))c.extraElements=[];c.extraElements.forEach(function(el){var wasLegacy=el.layout&&el.layout.opacity==null,oldZ=el.layout&&el.layout.z;el.layout=Object.assign({x:10,y:10,w:30,h:8,r:0,z:40,locked:false,opacity:1,visible:true},el.layout||{});if(wasLegacy&&el.kind==="image"&&oldZ===46)el.layout.z=18;if(el.layout.opacity==null)el.layout.opacity=1;if(el.layout.visible==null)el.layout.visible=true;if(el.kind!=="image"){if(el.bold==null)el.bold=false;if(el.fontStyle==null)el.fontStyle=""}});
  if(c.art==null)c.art="";if(c.artAssetId==null)c.artAssetId="";if(c.artPrompt==null)c.artPrompt="";if(!c.customFields||typeof c.customFields!=="object")c.customFields={};schemaForCard(c).forEach(function(f){if(!isCardLocked(c)&&c.customFields[f.key]===undefined&&f.defaultValue!=="")c.customFields[f.key]=f.type==="number"?num(f.defaultValue,0):f.type==="boolean"?String(f.defaultValue)==="true":f.defaultValue});
  return c;
};
cards=cards.map(normalizeCard);
ensureSetCatalogFromCards();ensureFamilyIntegrity();
migrateLegacyArtAssets();
skins=skins.map(function(s){s.appearance=normalizeAppearance(s.appearance);return s});

var history=[],future=[],historyLimit=40,mutationPending=false;
var current=function(){return cards.find(function(c){return c.id===selected})||cards[0]};
function assetMetadataList(){return userAssets.map(function(a){var x=Object.assign({},a);delete x.dataUrl;return x})}
function cardsWithoutEmbeddedBinary(){return cards.map(function(c){var x=clone(c);x.art="";return x})}
var stateSnapshot=function(){return JSON.stringify({projectName:projectName,cards:cardsWithoutEmbeddedBinary(),selected:selected,skins:skins,favoriteAssets:favoriteAssets,ruleTerms:ruleTerms,userAssets:assetMetadataList(),customTemplates:customTemplates,templateLayouts:templateLayouts,projectDesign:projectDesign,fieldSchema:fieldSchema,templateConditions:templateConditions,layoutComponents:layoutComponents,templateBadgeStyles:templateBadgeStyles,cardBackProfiles:cardBackProfiles,projectSets:projectSets,cardFamilies:cardFamilies,playtests:playtests,projectVersions:projectVersions,releaseHistory:releaseHistory,aiStyle:$("#aiStyle")?$("#aiStyle").value:aiStyle,printSettings:printSettings})};
function hydrateAssetsFromMetadata(list){return (list||[]).map(function(a){return hydratedAsset(a)})}
var restoreState=function(raw){
  var s=typeof raw==="string"?JSON.parse(raw):clone(raw);
  customTemplates=s.customTemplates||customTemplates;rebuildTemplateCatalog();templateLayouts=s.templateLayouts||templateLayouts;projectDesign=Object.assign({},DEFAULT_PROJECT_DESIGN,s.projectDesign||projectDesign);rebuildTemplateCatalog();fieldSchema=normalizeFieldSchema(s.fieldSchema||fieldSchema);templateConditions=s.templateConditions||templateConditions;layoutComponents=s.layoutComponents||layoutComponents;templateBadgeStyles=s.templateBadgeStyles||templateBadgeStyles;cardBackProfiles=normalizeCardBackProfiles(s.cardBackProfiles||cardBackProfiles);projectSets=normalizeProjectSets(s.projectSets||projectSets);cardFamilies=normalizeFamilies(s.cardFamilies||cardFamilies);playtests=normalizePlaytests(s.playtests||playtests);projectVersions=normalizeProjectVersions(s.projectVersions||projectVersions);releaseHistory=Array.isArray(s.releaseHistory)?s.releaseHistory:releaseHistory;
  cards=(s.cards||[]).map(normalizeCard);ensureSetCatalogFromCards();ensureFamilyIntegrity();selected=s.selected&&cards.some(function(c){return c.id===s.selected})?s.selected:(cards[0]&&cards[0].id);
  skins=(s.skins||skins).map(function(x){x.appearance=normalizeAppearance(x.appearance);return x});
  favoriteAssets=s.favoriteAssets||favoriteAssets;userAssets=hydrateAssetsFromMetadata(s.userAssets||assetMetadataList());cacheAllAssetBinaries();ruleTerms=s.ruleTerms||ruleTerms;
  if(s.projectName)projectName=s.projectName;if(s.aiStyle)aiStyle=s.aiStyle;if(s.printSettings)printSettings=Object.assign({sheet:"a4",crop:true,duplexFlip:"long",backRotate:false},s.printSettings);
  renderAll();
};
var recordHistory=function(){history.push(stateSnapshot());if(history.length>historyLimit)history.shift();future=[];mutationPending=true;updateHistoryButtons()};
var updateHistoryButtons=function(){$("#undoBtn").disabled=!history.length;$("#redoBtn").disabled=!future.length};
function flushLocalPersist(){
  clearTimeout(persistTimer);persistTimer=null;flushPendingTemplateEdits();
  try{
    var lightCards=cardsWithoutEmbeddedBinary(),lightAssets=assetMetadataList();
    localStorage.setItem("card-studio-project-v2",JSON.stringify({cards:lightCards,selected:selected,projectName:projectName}));
    localStorage.setItem("card-studio-skins",JSON.stringify(skins));localStorage.setItem("card-studio-favorite-assets",JSON.stringify(favoriteAssets));localStorage.removeItem("card-studio-snapshots");localStorage.setItem("card-studio-user-assets",JSON.stringify(lightAssets));localStorage.setItem("card-studio-rule-terms",JSON.stringify(ruleTerms));localStorage.setItem("card-studio-custom-templates",JSON.stringify(customTemplates));localStorage.setItem("card-studio-template-layouts",JSON.stringify(templateLayouts));localStorage.setItem("card-studio-project-design",JSON.stringify(projectDesign));localStorage.setItem("card-studio-field-schema",JSON.stringify(fieldSchema));localStorage.setItem("card-studio-template-conditions",JSON.stringify(templateConditions));localStorage.setItem("card-studio-layout-components",JSON.stringify(layoutComponents));localStorage.setItem("card-studio-template-badges",JSON.stringify(templateBadgeStyles));localStorage.setItem("card-studio-card-back-profiles",JSON.stringify(cardBackProfiles));localStorage.setItem("card-studio-project-sets",JSON.stringify(projectSets));localStorage.setItem("card-studio-card-families",JSON.stringify(cardFamilies));localStorage.setItem("card-studio-playtests",JSON.stringify(playtests));localStorage.setItem("card-studio-project-versions",JSON.stringify(projectVersions));localStorage.setItem("card-studio-release-history",JSON.stringify(releaseHistory.slice(0,30)));localStorage.setItem("card-studio-ai-style",JSON.stringify($("#aiStyle")?$("#aiStyle").value:aiStyle));
  }catch(e){console.error("CardStudio local fallback save failed",e);setSaveIndicator("error","本地保存失败");}
}
var persist=function(){
  if(bootstrapping)return;mutationPending=false;flushPendingTemplateEdits();setSaveIndicator("dirty");clearTimeout(persistTimer);persistTimer=setTimeout(flushLocalPersist,260);scheduleDbSave(900);
};
function flushPersistNow(){flushLocalPersist();if(dbReady)scheduleDbSave(0)}
window.addEventListener("pagehide",flushLocalPersist);document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden")flushLocalPersist()});
window.addEventListener("beforeunload",function(e){if(savePhase==="error"||savePhase==="dirty"||savePhase==="saving"){flushLocalPersist();e.preventDefault();e.returnValue=""}});
var statusToastTimer=null;
var setStatus=function(t){
  var status=$("#status");if(status){status.textContent=t;status.title=t}
  var stack=$("#toastStack");if(!stack||!t||t==="就绪"||/^正在/.test(t)||/^发布构建/.test(t)||/^Set 构建/.test(t))return;
  clearTimeout(statusToastTimer);var old=stack.querySelector(".app-toast");if(old)old.remove();var toast=document.createElement("div"),bad=/失败|错误|阻止|不能|不存在|过低/.test(t),good=/完成|已保存|已恢复|通过|已应用|已创建|已删除|已清理|已锁定|已解除/.test(t);toast.className="app-toast "+(bad?"bad":good?"good":"info");toast.textContent=t;stack.appendChild(toast);requestAnimationFrame(function(){toast.classList.add("show")});statusToastTimer=setTimeout(function(){toast.classList.remove("show");setTimeout(function(){toast.remove()},220)},2600)
};

var resolveVars=function(text,card){
  return String(text||"").replace(/\{([^}]+)\}/g,function(all,key){
    var token=String(key).trim(),field=vars[token];
    if(field)return String(card[field]==null?"":card[field]);
    var alias=Object.keys(projectDesign.fieldLabels||{}).find(function(k){return String(projectDesign.fieldLabels[k])===token});if(alias&&Object.prototype.hasOwnProperty.call(card,alias))return String(card[alias]==null?"":card[alias]);
    var def=fieldSchema.find(function(f){return f.key===token||f.label===token});
    if(def){var cv=customFieldValue(card,def.key);if(def.type==="cardRef"){var rc=cards.find(function(x){return x.id===cv});return rc?rc.name:""}return String(cv)};
    return all;
  });
};
function termByName(name){var n=String(name||"").trim().toLowerCase();return ruleTerms.find(function(t){return String(t.name||"").trim().toLowerCase()===n})}
function extractRuleTerms(text){var out=[],seen={};String(text||"").replace(/\[\[([^\]]+)\]\]/g,function(_,name){name=String(name).trim();if(name&&!seen[name.toLowerCase()]){seen[name.toLowerCase()]=1;out.push(name)}return _});return out}
function extractIconTokens(text){var out=[],seen={};String(text||"").replace(/\{\{icon:([^}]+)\}\}/g,function(_,name){name=String(name).trim();if(name&&!seen[name.toLowerCase()]){seen[name.toLowerCase()]=1;out.push(name)}return _});return out}
var CORE_STAT_TOKENS={cost:{icon:"cost",label:"费用"},attack:{icon:"attack",label:"攻击"},health:{icon:"health",label:"生命"},move:{icon:"move",label:"移动"},range:{icon:"range",label:"射程"}};
var RULE_BLOCK_TYPES={"触发":"trigger","效果":"effect","条件":"condition","限制":"limit","持续":"duration","提示":"note","风味":"flavor"};
function extractStatTokens(text){var out=[],seen={};String(text||"").replace(/\{\{stat:([^}]+)\}\}/g,function(_,name){name=String(name).trim().toLowerCase();if(name&&!seen[name]){seen[name]=1;out.push(name)}return _});return out}
function statTokenValue(card,key){if(!card)return "";return String(card[key]==null?"":card[key])}
function structuredRuleBlocks(text,card){return String(text||"").split(/\r?\n/).map(function(line,index){var m=/^\s*\[([^\]]+)\]\s*(.*)$/.exec(line);if(m&&RULE_BLOCK_TYPES[m[1]])return {index:index,type:RULE_BLOCK_TYPES[m[1]],label:m[1],text:m[2],resolved:resolveVars(m[2],card)};return {index:index,type:"plain",label:"",text:line,resolved:resolveVars(line,card)}})}
function inlineIconExists(name){var key=String(name||"").trim().toLowerCase(),built=["attack","health","move","range","cost","armor","draw"];return built.indexOf(key)>=0||userAssets.some(function(a){return assetHasRole(a,"icon")&&(a.id===name||String(a.name||"").toLowerCase()===key)})}
function escapeRegExp(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}
function autoMarkKnownTerms(text){
  var raw=String(text||""),protectedRanges=[];raw.replace(/\[\[([^\]]+)\]\]/g,function(m,n,offset){protectedRanges.push([offset,offset+m.length]);return m});
  var names=ruleTerms.map(function(t){return t.name}).filter(Boolean).sort(function(a,b){return b.length-a.length});
  names.forEach(function(name){
    var re=new RegExp(escapeRegExp(name),"gi"),m,out="",last=0,changed=false;
    while((m=re.exec(raw))){var inside=protectedRanges.some(function(r){return m.index>=r[0]&&m.index<r[1]});if(inside){continue}out+=raw.slice(last,m.index)+"[["+raw.slice(m.index,m.index+m[0].length)+"]]";last=m.index+m[0].length;changed=true}
    if(changed){out+=raw.slice(last);raw=out;protectedRanges=[];raw.replace(/\[\[([^\]]+)\]\]/g,function(mm,n,offset){protectedRanges.push([offset,offset+mm.length]);return mm})}
  });return raw;
}
function inlineIconHtml(name){var key=String(name||"").trim(),built={attack:"⚔",health:"♥",move:"↗",range:"◎",cost:"◆",armor:"⬟",draw:"▣"};if(built[key])return '<span class="inline-game-icon" data-icon="'+esc(key)+'" title="'+esc(key)+'">'+built[key]+'</span>';var asset=userAssets.find(function(a){return assetHasRole(a,"icon")&&(a.id===key||String(a.name||"").toLowerCase()===key.toLowerCase())});return asset?'<img class="inline-game-icon custom" src="'+esc(asset.dataUrl)+'" alt="'+esc(asset.name)+'">':'<span class="inline-game-icon missing" title="未知图标 '+esc(key)+'">?</span>'}
function renderInlineRichText(raw,card){var src=String(raw||""),out="",last=0,re=/\[\[([^\]]+)\]\]|\{\{icon:([^}]+)\}\}(\s*[+\-]?\d+(?:\.\d+)?)?|\{\{stat:([^}]+)\}\}/g,m;while((m=re.exec(src))){out+=esc(src.slice(last,m.index));if(m[4]!=null){var sk=String(m[4]).trim().toLowerCase(),sd=CORE_STAT_TOKENS[sk];if(sd)out+='<span class="inline-icon-value semantic-stat-token" data-stat-token="'+esc(sk)+'" title="实时'+esc(sd.label)+'">'+inlineIconHtml(sd.icon)+'<span>'+esc(statTokenValue(card,sk))+'</span></span>';else out+='<span class="inline-token-missing">{{stat:'+esc(sk)+'}}</span>'}else if(m[2]!=null){var icon=inlineIconHtml(m[2]),value=m[3]||"";out+=value?'<span class="inline-icon-value">'+icon+'<span>'+esc(value.trim())+'</span></span>':icon}else{var name=String(m[1]).trim(),term=termByName(name),color=term&&term.color?term.color:"#38bdf8",tip=term&&term.description?term.description:"规则词条："+name;out+='<span class="rule-term" data-rule-term="'+esc(name)+'" title="'+esc(tip)+'" style="color:'+esc(color)+'">'+esc(name)+'</span>'}last=re.lastIndex}return out+esc(src.slice(last))}
function ruleTailSplit(raw){var src=String(raw||""),need=Math.max(0,Math.min(10,Math.round(num(projectDesign.ruleTailChars,4))));if(projectDesign.ruleWidowControl===false||need<2||src.length<need+2)return {head:src,tail:""};var re=/\[\[[^\]]+\]\]|\{\{[^}]+\}\}(?:\s*[+\-]?\d+(?:\.\d+)?)?|[^\s]/gu,m,tokens=[];while((m=re.exec(src)))tokens.push({start:m.index,end:re.lastIndex});if(tokens.length<=need+1)return {head:src,tail:""};var start=tokens[Math.max(0,tokens.length-need)].start;return {head:src.slice(0,start),tail:src.slice(start)}}
function renderRuleBody(raw,card){var sp=ruleTailSplit(raw);return renderInlineRichText(sp.head,card)+(sp.tail?'<span class="rule-tail-lock">'+renderInlineRichText(sp.tail,card)+'</span>':"")}
function renderRichText(text,card){return structuredRuleBlocks(text,card).map(function(b){if(b.type!=="plain")return '<span class="rule-structured-line rule-'+b.type+'"><b class="rule-block-label">'+esc(b.label)+'</b><span class="rule-block-body">'+renderRuleBody(b.resolved,card)+'</span></span>';if(/^\s*[-•]\s+/.test(b.resolved))return '<span class="rule-bullet-line"><i>•</i><span>'+renderRuleBody(b.resolved.replace(/^\s*[-•]\s+/,""),card)+'</span></span>';if(!String(b.resolved).trim())return '<span class="rule-empty-line"><br></span>';return '<span class="rule-plain-line">'+renderRuleBody(b.resolved,card)+'</span>'}).join("")}
var raritySymbol=function(style){
  if(style==="dot")return "●";
  if(style==="gem")return "◆";
  if(style==="bars")return "▮▮▮";
  return "★";
};
var assetById=function(id){return userAssets.find(function(x){return x.id===id})};
function cacheAssetBinary(asset){if(asset&&asset.id&&asset.dataUrl)assetBinaryCache[asset.id]=asset.dataUrl}
function cacheAllAssetBinaries(){userAssets.forEach(cacheAssetBinary)}
function hydratedAsset(asset){var out=Object.assign({},asset||{});if(!out.dataUrl&&out.id&&assetBinaryCache[out.id])out.dataUrl=assetBinaryCache[out.id];return out}
function cardArtData(card){var a=card&&card.artAssetId&&assetById(card.artAssetId);return a&&a.dataUrl?a.dataUrl:String(card&&card.art||"")}
function hasCardArt(card){return !!cardArtData(card)}
var imageTools=window.KadiImages.install({$: $,current:current,selected:function(){return selectedModel(current())},assetById:assetById,locked:function(){return isCardLocked(current())},history:recordHistory,bleed:function(){syncPrintGeometry();return CARD_BLEED_MM},override:function(k){setLayoutOverride(current(),k,true)},mark:markModelOverride,render:function(){renderPreviewOnly()},refresh:refreshElementPanel,select:function(ref){setSelection([ref],ref)},save:function(){persist()},status:setStatus,defaults:DEFAULT_LAYOUT,state:function(){return projectPayload(true)},layers:allLayerModels,capture:function(c){return capture(c,"png")},fieldKey:fieldKeyForLayout,catalog:function(){return TEMPLATES},zip:function(){return new JSZip()},filename:function(s){return safeFilename(s)},download:function(blob,name){var url=URL.createObjectURL(blob);download(url,name);setTimeout(function(){URL.revokeObjectURL(url)},300000)}});
function imageForModel(m){return imageTools.imageFor(m)}
function refreshImageControls(m,count){imageTools.refresh(m,count)}
function inspectAssetImage(asset){return window.KadiImages.inspect(asset)}

function assetRoles(a){var out=Array.isArray(a&&a.roles)?a.roles.slice():[];if(a&&a.category&&out.indexOf(a.category)<0)out.push(a.category);return out}
function assetHasRole(a,role){return assetRoles(a).indexOf(role)>=0}
function findAssetByDataUrl(dataUrl){return userAssets.find(function(a){return a.dataUrl===dataUrl})}
function registerAsset(dataUrl,name,category,meta){if(!dataUrl)return null;meta=meta||{};var existing=findAssetByDataUrl(dataUrl);if(existing){existing.roles=assetRoles(existing);if(category&&existing.roles.indexOf(category)<0)existing.roles.push(category);["width","height","source","aiProvider","aiModel","aiQuality","generatedAt"].forEach(function(k){if((existing[k]==null||existing[k]==="")&&meta[k]!=null&&meta[k]!=="")existing[k]=meta[k]});cacheAssetBinary(existing);return existing}var a=Object.assign({id:uid(),name:name||"未命名素材",category:category||"custom",roles:[category||"custom"],dataUrl:dataUrl,createdAt:new Date().toISOString()},meta);userAssets.push(a);cacheAssetBinary(a);return a}
function assignCardArt(card,dataUrl,name,meta){if(!card)return null;if(!dataUrl){card.art="";card.artAssetId="";return null}var a=registerAsset(dataUrl,name||((card.name||"卡牌")+" · 插画"),"art",meta||{});card.artAssetId=a.id;card.art="";return a}
function migrateLegacyArtAssets(){cards.forEach(function(c){if(c.art&&String(c.art).indexOf("data:image/")===0)assignCardArt(c,c.art,(c.name||"卡牌")+" · 插画")});cacheAllAssetBinaries()}
function assetReferenceCount(id){var n=KadiLayout.defaultReferencesAsset({projectDesign:projectDesign,customTemplates:customTemplates},id)?1:0;if(projectDesign.cardBackAssetId===id)n++;Object.keys(cardBackProfiles.byTemplate||{}).forEach(function(k){if(cardBackProfiles.byTemplate[k]===id)n++});Object.keys(cardBackProfiles.bySet||{}).forEach(function(k){if(cardBackProfiles.bySet[k]===id)n++});cards.forEach(function(c){if(c.artAssetId===id)n++;var a=c.appearance||{};["iconAssetId","frameImageAssetId","textureImageAssetId"].forEach(function(k){if(a[k]===id)n++});(c.extraElements||[]).forEach(function(el){if(el.assetId===id)n++})});return n}
function assetSizeBytes(a){var d=a&&a.dataUrl||assetBinaryCache[a&&a.id]||"";if(!d)return 0;var comma=d.indexOf(","),b64=comma>=0?d.slice(comma+1):d;return Math.max(0,Math.floor(b64.length*3/4))}
function formatBytes(n){if(n<1024)return n+" B";if(n<1024*1024)return (n/1024).toFixed(1)+" KB";return (n/1024/1024).toFixed(1)+" MB"}

var SHARED_ASSET_SCHEMA="cardstudio-asset-library-v1",SHARED_ASSET_MAX=1000,SHARED_ASSET_MAX_DATA_URL=22*1024*1024;
function safeSharedRasterDataUrl(v){return typeof v==="string"&&v.length<=SHARED_ASSET_MAX_DATA_URL&&/^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i.test(v)?v:""}
function sharedAssetCategory(a){
  if(a&&["template","frame","icon","decoration","illustration","other"].indexOf(a.sharedCategory)>=0)return a.sharedCategory;
  if(assetHasRole(a,"icon"))return "icon";
  if(assetHasRole(a,"frameImage")||assetHasRole(a,"sharedTemplate"))return "frame";
  if(assetHasRole(a,"textureImage"))return "decoration";
  if(assetHasRole(a,"art"))return "illustration";
  return "other";
}
function sharedCategoryToStudioRole(cat){return cat==="icon"?"icon":cat==="frame"||cat==="template"?"frameImage":cat==="illustration"?"art":cat==="decoration"?"textureImage":"custom"}
function sharedAssetPayload(){
  var skipped=0,assets=[];
  userAssets.forEach(function(raw){var a=hydratedAsset(raw);if(!assetHasRole(a,"shared")&&!a.shareable)return;var data=safeSharedRasterDataUrl(a.dataUrl||"");if(!data){skipped++;return}assets.push({id:a.sharedAssetId||a.id,name:a.name||"未命名素材",category:sharedAssetCategory(a),tags:a.tags||"",width:a.width||0,height:a.height||0,dataUrl:data,source:"studio"})});
  return {schema:SHARED_ASSET_SCHEMA,version:1,exportedAt:new Date().toISOString(),name:projectName+" 素材库",assets:assets.slice(0,SHARED_ASSET_MAX),skipped:skipped};
}
function normalizeSharedAssetPack(raw){
  if(!raw||typeof raw!=="object")throw new Error("素材库文件无效");
  var list=null,name=raw.name||raw.projectName||"共享素材库";
  if(raw.schema===SHARED_ASSET_SCHEMA&&Array.isArray(raw.assets))list=raw.assets;
  else if(raw.format==="cardstudio-community"&&raw.assetLibrary&&Array.isArray(raw.assetLibrary.assets))list=raw.assetLibrary.assets;
  else if(Array.isArray(raw.userAssets))list=raw.userAssets;
  if(!list)throw new Error("不是有效的 CardStudio 共享素材库");
  if(list.length>SHARED_ASSET_MAX)throw new Error("共享素材超过 "+SHARED_ASSET_MAX+" 项上限");
  var out=[];list.forEach(function(x){var data=safeSharedRasterDataUrl(x&& (x.dataUrl||x.src||x.image)||"");if(!data)return;var cat=["template","frame","icon","decoration","illustration","other"].indexOf(x.category)>=0?x.category:"other";out.push({id:String(x.id||""),name:String(x.name||"未命名素材").slice(0,120),category:cat,tags:String(Array.isArray(x.tags)?x.tags.join(","):x.tags||"").slice(0,500),width:Math.max(0,Math.min(20000,Number(x.width)||0)),height:Math.max(0,Math.min(20000,Number(x.height)||0)),dataUrl:data,source:String(x.source||"community").slice(0,40)})});
  if(!out.length)throw new Error("素材库中没有可用的 PNG / JPG / WebP 图片");
  return {name:name,assets:out};
}
function mergeSharedAssets(pack){
  var added=0,reused=0;
  (pack.assets||[]).forEach(function(x){var role=sharedCategoryToStudioRole(x.category),existing=findAssetByDataUrl(x.dataUrl);if(existing){existing.roles=assetRoles(existing);["shared",role].forEach(function(r){if(r&&existing.roles.indexOf(r)<0)existing.roles.push(r)});existing.sharedCategory=x.category;if(!existing.sharedAssetId&&x.id)existing.sharedAssetId=x.id;if(!existing.tags&&x.tags)existing.tags=x.tags;if(!existing.width&&x.width)existing.width=x.width;if(!existing.height&&x.height)existing.height=x.height;cacheAssetBinary(existing);reused++;return}var a=registerAsset(x.dataUrl,x.name,role,{width:x.width,height:x.height,source:"shared",sharedCategory:x.category,tags:x.tags,sharedSource:x.source,sharedAssetId:x.id||""});a.roles=assetRoles(a);if(a.roles.indexOf("shared")<0)a.roles.push("shared");added++});
  return {added:added,reused:reused};
}
function downloadSharedAssetLibrary(){
  var payload=sharedAssetPayload();if(!payload.assets.length){setStatus("当前没有标记为共享的 PNG / JPG / WebP 素材；请先在资产库点“加入共享”");return}
  downloadText(JSON.stringify(payload,null,2),safeFilename(projectName||"CardStudio")+"-assets.csassets","application/json;charset=utf-8");
  setStatus("共享素材库已导出："+payload.assets.length+" 项"+(payload.skipped?" · 已跳过 "+payload.skipped+" 个非安全共享格式素材":""));
}

var FONT_STACKS={
  default:"Inter,'PingFang SC','Microsoft YaHei',system-ui,sans-serif",
  serif:"Georgia,'Noto Serif SC','Songti SC',serif",
  display:"'Arial Narrow','Microsoft YaHei',sans-serif",
  soft:"'Trebuchet MS','PingFang SC',sans-serif",
  classical:"'Palatino Linotype','Book Antiqua','Noto Serif SC','Songti SC','STKaiti','KaiTi',serif"
};
var FIXED_TEXT_KEYS=["title","faction","type","rarityText","effect","cost","stat_attack","stat_health","stat_move","stat_range"];
function baseTextStyle(card,key,a){
  var group=key==="title"?"title":key==="effect"?"effect":key==="cost"?"cost":key.indexOf("stat_")===0?"stats":"meta";
  return {size:a[group+"Size"],color:a[group+"Color"],align:a[group+"Align"],bold:!!a[group+"Bold"],fontStyle:a.fontStyle||"default"};
}
function elementBindingKey(el){return el&&KadiLayout.fields.some(function(f){return f[0]===el.fieldKey})?el.fieldKey:""}
function textModuleKey(key){return FIXED_TEXT_KEYS.concat(["tags","footerLeft","footerRight"]).includes(key)}
function modelOpacityKind(m){return m.type==="extra"?(m.element.kind==="image"?"image":"text"):textModuleKey(m.id)?"module":"image"}
function textStyleFor(card,key,a){var out=Object.assign(baseTextStyle(card,key,a),(card.textStyles&&card.textStyles[key])||{});if(key==="title")out.align="center";return out}
function textCss(card,key,a,sizeOverride){var t=textStyleFor(card,key,a),family=FONT_STACKS[t.fontStyle]||FONT_STACKS.default;return "font-size:"+(sizeOverride==null?t.size:sizeOverride)+"px;color:"+t.color+";text-align:"+t.align+";font-weight:"+(t.bold?900:500)+";font-family:"+family+";"+KadiEdit.strokeCss(t.strokePx)}
// Beta 8: a single geometry model for preview, QA, crop, PnP, duplex and TTS.
function syncPrintGeometry(){
  var raw=projectDesign.bleedMm==null?3:Number(projectDesign.bleedMm);
  CARD_BLEED_MM=Math.round(Math.max(0,Math.min(10,Number.isFinite(raw)?raw:3))*10)/10;
  projectDesign.bleedMm=CARD_BLEED_MM;
  CARD_TRIM_W_MM=Math.round((CARD_BLEED_W_MM-2*CARD_BLEED_MM)*10)/10;
  CARD_TRIM_H_MM=Math.round((CARD_BLEED_H_MM-2*CARD_BLEED_MM)*10)/10;
}
function printTrimSizeText(){return CARD_TRIM_W_MM+" × "+CARD_TRIM_H_MM+" mm"}
function renderPrintGeometryControls(){
  syncPrintGeometry();
  $("#printBleedMm").value=CARD_BLEED_MM;$("#printBleedRange").value=CARD_BLEED_MM;
  $("#printSafeMm").value=projectDesign.safeContentMm==null?3:projectDesign.safeContentMm;
  $("#printTrimSize").value=printTrimSizeText();$("#showPrintGuides").checked=!!projectDesign.showPrintGuides;
  $("#printGeometryHint").textContent="画布 69 × 94 mm → 成品 "+printTrimSizeText()+"；四周出血 "+CARD_BLEED_MM+" mm。红线是裁切边界，绿线是安全区；保存项目与各类导出共用此设置。";
  $("#openPrintGuides").setAttribute("aria-pressed",String(!!projectDesign.showPrintGuides));
}
var printGeometryEditing=false;
function changePrintGeometry(field,el){
  if(el.value===""||!Number.isFinite(Number(el.value))){el.setCustomValidity("请输入 0 到 10 之间的毫米数");return}
  el.setCustomValidity("");var next=Math.round(Math.max(0,Math.min(10,Number(el.value)))*10)/10;
  if(next===Number(projectDesign[field])&&projectDesign.showPrintGuides)return;
  if(!printGeometryEditing){recordHistory();printGeometryEditing=true}
  projectDesign[field]=next;projectDesign.showPrintGuides=true;syncPrintGeometry();
  renderPrintGeometryControls();renderPreviewOnly();persist();
}
["printBleedMm","printBleedRange","printSafeMm"].forEach(function(id){
  var el=$("#"+id),field=id==="printSafeMm"?"safeContentMm":"bleedMm";
  el.addEventListener("input",function(){changePrintGeometry(field,el)});
  el.addEventListener("change",function(){changePrintGeometry(field,el);printGeometryEditing=false;setStatus("裁切设置已保存：出血 "+CARD_BLEED_MM+" mm，成品 "+printTrimSizeText())});
  el.addEventListener("blur",function(){printGeometryEditing=false;el.setCustomValidity("");renderPrintGeometryControls()});
});
$("#showPrintGuides").onchange=function(){recordHistory();projectDesign.showPrintGuides=this.checked;renderPrintGeometryControls();renderPreviewOnly();persist()};
$("#openPrintGuides").onclick=function(){
  setBeta3Panel("right",true);setToolMode("export");
  if(!projectDesign.showPrintGuides){recordHistory();projectDesign.showPrintGuides=true;persist()}
  renderPrintGeometryControls();renderPreviewOnly();$("#printBleedMm").scrollIntoView({block:"center"});$("#printBleedMm").focus();
};
$("#resetPrintGeometry").onclick=function(){recordHistory();printGeometryEditing=false;projectDesign.bleedMm=3;projectDesign.safeContentMm=3;projectDesign.showPrintGuides=true;renderAll();setStatus("裁切设置已恢复：四周出血 3 mm，成品 63 × 88 mm；可撤销")};

function printGuideInsets(){syncPrintGeometry();var safeInside=Math.max(0,Number(projectDesign.safeContentMm==null?3:projectDesign.safeContentMm)),total=CARD_BLEED_MM+safeInside;return {trimX:CARD_BLEED_MM/CARD_BLEED_W_MM*100,trimY:CARD_BLEED_MM/CARD_BLEED_H_MM*100,safeX:total/CARD_BLEED_W_MM*100,safeY:total/CARD_BLEED_H_MM*100}}
function printGuideHtml(){var g=printGuideInsets();return '<i class="card-trim-guide" aria-hidden="true" style="left:'+g.trimX+'%;right:'+g.trimX+'%;top:'+g.trimY+'%;bottom:'+g.trimY+'%"></i><i class="card-safe-guide" aria-hidden="true" style="left:'+g.safeX+'%;right:'+g.safeX+'%;top:'+g.safeY+'%;bottom:'+g.safeY+'%"></i>'}
function defaultBadgeIcon(key){var map={cost:"cost",stat_attack:"attack",stat_health:"health",stat_move:"move",stat_range:"range"};return map[key]||"none"}
function badgeStyleFor(card,key){var byTemplate=templateBadgeStyles[card.templateId]||{},saved=Object.assign({},byTemplate[key]||{},card.badgeOffsets&&card.badgeOffsets[key]||{});return {shape:saved.shape||"none",icon:saved.icon||"none",showLabel:saved.showLabel==null?key!=="cost":saved.showLabel!==false,iconPlacement:["corner","left","top","behind"].indexOf(saved.iconPlacement)>=0?saved.iconPlacement:"corner",iconScale:Math.max(.4,Math.min(1.4,num(saved.iconScale,.72))),valueDx:Math.max(-8,Math.min(8,num(saved.valueDx,0))),valueDy:Math.max(-8,Math.min(8,num(saved.valueDy,0)))}}
function badgeStyleCss(st){return "--badge-icon-scale:"+st.iconScale+";--badge-dx:"+st.valueDx+"px;--badge-dy:"+st.valueDy+"px"}
function badgeClass(st){return " badge-icon-"+st.iconPlacement}
function badgeIconHtml(name){if(!name||name==="none")return "";var built={attack:"⚔",health:"♥",move:"↗",range:"◎",cost:"◆",armor:"⬟",draw:"▣"};if(built[name])return '<span class="semantic-badge-icon" aria-hidden="true">'+built[name]+'</span>';var asset=assetById(name);return asset&&assetHasRole(asset,"icon")?'<img class="semantic-badge-icon custom" src="'+esc(asset.dataUrl)+'" alt="">':""}
function resolvedBadgeIcon(style,key){var name=style.icon==="auto"?defaultBadgeIcon(key):style.icon;return badgeIconHtml(name)}
var cardHtml=function(card,editable){
  var t=cardTemplate(card),a=normalizeAppearance(card.appearance);
  function fieldEditAttrs(key){return editable&&!(card.layout&&card.layout[key]&&card.layout[key].locked)?' contenteditable="true"':""}
  var desc=renderRichText(card.description,card);
  var artEmpty=hasCardArt(card)?"":'<div class="art-empty">插画区域<br><small>上传图片，或先复制绘画提示词再导入成图</small></div>';
  var layoutId=t.baseLayout||t.id;
  var classes=["card","tpl-"+layoutId,"frame-"+a.frameStyle,"texture-"+a.textureStyle,"cost-"+a.costStyle,"rarity-"+a.rarityStyle,"font-"+a.fontStyle,"finish-"+(a.finishStyle||"premium"),"rule-style-"+(projectDesign.ruleStyle||"pill"),a.frameImageAssetId?"has-custom-frame":""].filter(Boolean).join(" ");
  var titleTs=textStyleFor(card,"title",a),effectTs=textStyleFor(card,"effect",a),titleRenderSize=titleTs.size,effectRenderSize=effectTs.size;
  var style="--p:"+a.primary+";--s:"+a.secondary+";--a:"+a.accent+";--f:"+a.frame+";--t:"+a.text+";--stats-count:"+Math.max(1,t.stats.length)+";--rule-line-height:"+Math.max(1,Math.min(2,num(projectDesign.ruleLineHeight,1.34)))+";--rule-block-gap:"+Math.max(0,Math.min(1,num(projectDesign.ruleBlockGapEm,.18)))+"em;--rule-icon-baseline:"+Math.max(-.4,Math.min(.4,num(projectDesign.ruleIconBaselineEm,-.04)))+"em;--title-size:"+titleRenderSize+"px;--title-color:"+a.titleColor+";--title-align:"+a.titleAlign+";--title-weight:"+(a.titleBold?900:500)+";--effect-size:"+effectRenderSize+"px;--effect-color:"+a.effectColor+";--effect-align:"+a.effectAlign+";--effect-weight:"+(a.effectBold?800:400)+";--meta-size:"+a.metaSize+"px;--meta-color:"+a.metaColor+";--meta-align:"+a.metaAlign+";--meta-weight:"+(a.metaBold?800:500)+";--stats-size:"+a.statsSize+"px;--stats-color:"+a.statsColor+";--stats-align:"+a.statsAlign+";--stats-weight:"+(a.statsBold?900:500)+";--cost-size:"+a.costSize+"px;--cost-color:"+a.costColor+";--cost-align:"+a.costAlign+";--cost-weight:"+(a.costBold?900:500);
  var frameAsset=assetById(a.frameImageAssetId),textureAsset=assetById(a.textureImageAssetId),iconAsset=assetById(a.iconAssetId);
  var customFrame="",customTexture="",customIcon="";
  function lp(key,opacity){var p=(card.layout&&card.layout[key])||DEFAULT_LAYOUT[key]||{x:0,y:0,w:10,h:10,r:0,z:20,opacity:1,visible:true};return 'left:'+p.x+'%;top:'+p.y+'%;width:'+p.w+'%;height:'+p.h+'%;z-index:'+p.z+';opacity:'+(opacity==null?(p.opacity==null?1:p.opacity):opacity)+';transform:rotate('+p.r+'deg)'}
  function handles(image){return editable?(image?["nw","ne","sw","se"].map(function(c){return '<i class="layout-handle resize corner-'+c+'" data-handle="resize" data-corner="'+c+'" title="拖动缩放素材；锁定宽高比可等比调整"></i>'}).join(""):'<i class="layout-handle resize" data-handle="resize"></i>')+'<i class="layout-handle rotate" data-handle="rotate"></i>':""}
  function node(key,cls,inner,attrs,extraCss){
    var p=(card.layout&&card.layout[key])||DEFAULT_LAYOUT[key]||{},sem=SEMANTIC_OBJECTS[key];if(p.visible===false||!cardLayerAllowed(card,key)||!conditionVisible(card,key))return "";
    var semCls=sem?(" semantic-object semantic-"+sem.kind):"",semAttr=sem?(' data-semantic-kind="'+esc(sem.kind)+'" data-semantic-role="'+esc(sem.role)+'"'):"",state=KadiEdit.opacityState(p),split=textModuleKey(key)&&state.split;
    var surface=split?'<div aria-hidden="true" class="layout-node '+cls+semCls+' module-surface" data-material-for="'+key+'" style="'+lp(key,state.material)+(extraCss?";"+extraCss:"")+'"></div>':"";
    return surface+'<div class="layout-node '+cls+semCls+(split?' module-foreground':'')+(p.locked?' locked':'')+'" data-layout-key="'+key+'"'+semAttr+' style="'+lp(key,split?state.text:null)+(extraCss?";"+extraCss:"")+'" '+(attrs||"")+'>'+inner+handles(!!IMAGE_ROLE_FIELDS[key])+'</div>';
  }
  function imageNode(key,asset){if(!asset)return "";var p=card.layout[key]||DEFAULT_LAYOUT[key];return node(key,"material-layer material-"+key,'<img src="'+esc(asset.dataUrl)+'" alt="'+esc(asset.name||"素材")+'" draggable="false" style="object-fit:'+esc(p.fit||"contain")+'">')}
  customFrame=imageNode("frameImage",frameAsset);customTexture=imageNode("textureImage",textureAsset);customIcon=imageNode("iconImage",iconAsset);
  var statNodes=(t.stats||[]).map(function(st){var k="stat_"+st[0],bs=badgeStyleFor(card,k),icon=resolvedBadgeIcon(bs,k),shape=bs.shape&&bs.shape!=="none"?(" badge-shape-"+bs.shape):" badge-shape-none";return node(k,"stat stat-layer semantic-badge"+shape+badgeClass(bs)+(icon?" has-badge-icon":""),icon+(bs.showLabel?'<small class="semantic-badge-label">'+st[1]+"</small>":"")+'<strong class="semantic-badge-value" style="'+textCss(card,k,a)+'" data-edit="'+st[0]+'"'+fieldEditAttrs(k)+'>'+esc(card[st[0]])+"</strong>","",badgeStyleCss(bs))}).join("");
  var extras=(card.extraElements||[]).map(function(el){
    var p=el.layout||{x:10,y:10,w:30,h:8,r:0,z:18,locked:false,opacity:1,visible:true};if(p.visible===false)return "";
    var base='left:'+p.x+'%;top:'+p.y+'%;width:'+p.w+'%;height:'+p.h+'%;z-index:'+p.z+';opacity:'+(p.opacity==null?1:p.opacity)+';transform:rotate('+p.r+'deg);';
    if(el.kind==="image"){var asset=el.assetId&&assetById(el.assetId),src=el.src||(asset&&asset.dataUrl)||"";return '<div class="layout-node free-image-element '+(p.locked?"locked":"")+'" data-extra-id="'+el.id+'" style="'+base+'"><img src="'+esc(src)+'" alt="'+esc(el.name||"自由素材")+'" draggable="false" style="object-fit:'+esc(p.fit||"contain")+'">'+handles(true)+'</div>'}
    var binding=elementBindingKey(el);if(simpleCard(card)&&card.cardKind==="spell"&&["unitType","attack","health"].includes(binding))return "";
    var inner=binding?'<span class="bound-field-value" data-edit="'+binding+'"'+(editable&&!p.locked&&editableCardField(card,binding)?' contenteditable="true"':'')+'>'+esc(card[binding]??"")+'</span>':esc(resolveVars(el.text||"",card)).replace(/\\n/g,"<br>");
    return '<div class="layout-node free-text-element '+(el.kind==="number"?"number-element ":"")+(el.parentId?"attached-label ":"")+(p.locked?"locked":"")+'" data-extra-id="'+el.id+'" data-parent-id="'+esc(el.parentId||"")+'" style="'+base+'font-size:'+(el.fontSize||11)+'px;color:'+(el.color||a.text)+';text-align:'+(el.align||"left")+';font-weight:'+(el.bold?900:500)+';font-family:'+(FONT_STACKS[el.fontStyle||a.fontStyle]||FONT_STACKS.default)+';'+KadiEdit.strokeCss(el.strokePx)+'">'+inner+handles()+'</div>'
  }).join("");
  return '<div class="'+classes+'" style="'+style+'">'+customFrame+customTexture+customIcon+
    node("art","art",artEmpty+'<i class="art-subject-marker" aria-hidden="true"><span></span></i>')+ '<div class="shade"></div><div class="texture-layer"></div><div class="trim"></div><i class="card-axis-guide" aria-hidden="true"></i>'+printGuideHtml()+
    (function(){var bs=badgeStyleFor(card,"cost"),icon=resolvedBadgeIcon(bs,"cost"),shape=bs.shape&&bs.shape!=="none"?(" badge-shape-"+bs.shape):"";return node("cost","cost-badge semantic-badge"+shape+badgeClass(bs)+(icon?" has-badge-icon":""),icon+(bs.showLabel?'<small class="semantic-badge-label">费</small>':"")+'<span class="semantic-badge-value" data-edit="cost"'+fieldEditAttrs("cost")+'>'+esc(card.cost)+"</span>","",textCss(card,"cost",a)+";"+badgeStyleCss(bs))})()+
    node("title","head title-layer",'<div class="title" style="'+textCss(card,"title",a,titleRenderSize)+'" data-edit="name"'+fieldEditAttrs("title")+'>'+esc(card.name)+'</div>')+
    node("faction","faction faction-layer",'<span data-edit="faction"'+fieldEditAttrs("faction")+'>'+esc(card.faction)+'</span>',"",textCss(card,"faction",a))+
    node("rarityMark","rarity-mark rarity-"+a.rarityStyle,raritySymbol(a.rarityStyle),'title="'+esc(card.rarity)+'"')+
    node("type","meta meta-single type-layer",'<span data-edit="unitType"'+fieldEditAttrs("type")+'>'+esc(card.unitType)+'</span>',"",textCss(card,"type",a))+
    node("rarityText","meta meta-single rarity-text-layer",'<span data-edit="rarity"'+fieldEditAttrs("rarityText")+'>'+esc(card.rarity)+'</span>',"",textCss(card,"rarityText",a))+
    node("effect","effect",'<span data-edit="description"'+fieldEditAttrs("effect")+'>'+desc+'</span>',"",textCss(card,"effect",a,effectRenderSize))+
    statNodes+node("tags","tags",esc(card.tags))+node("footerLeft","card-footer footer-left",esc([card.setName,card.cardNumber,card.year].filter(Boolean).join("  ·  ")))+node("footerRight","card-footer footer-right",esc(card.credit))+extras+'</div>';
};
// Beta 9: display names use stable field keys; changing a caption never changes card data.
var FIELD_DISPLAY_DEFAULTS={name:"名称",cost:"费用",faction:"系别",unitType:"种族",rarity:"稀有度",description:"效果",attack:"攻击",health:"血量",move:"移速",range:"射程",tags:"检索关键词",workflowStatus:"生产状态",cardNumber:"卡牌编号",setName:"系列",year:"年份",credit:"署名",rulesKeywords:"规则关键词",art:"插画",rarityMark:"稀有度标记",footerLeft:"系列 / 编号 / 年份",footerRight:"署名"};
function fieldDisplayName(key,fallback){
  if(String(key).indexOf("custom:")===0){var def=fieldDefByKey(String(key).slice(7));return def?String(def.label):String(fallback||key)}
  var labels=projectDesign.fieldLabels;if(labels&&Object.prototype.hasOwnProperty.call(labels,key))return String(labels[key]);
  return String(fallback&&fallback!==key?fallback:FIELD_DISPLAY_DEFAULTS[key]||key);
}
function fieldKeyForLayout(key){return {title:"name",type:"unitType",rarityText:"rarity",effect:"description"}[key]||(String(key).indexOf("stat_")===0?String(key).slice(5):key)}
function layoutDisplayName(key){return fieldDisplayName(fieldKeyForLayout(key),LAYOUT_LABELS[key]||key)}
function fieldCaptionButton(key,fallback){return '<button type="button" class="field-label-button" data-rename-field="'+esc(key)+'" data-default-label="'+esc(fallback)+'" title="点击修改字段名称">'+'<span class="field-caption-text">'+esc(fieldDisplayName(key,fallback)||"未命名")+'</span><span class="rename-pencil" aria-hidden="true">✎</span></button>'}
function updateFieldCaptions(){
  $$("[data-rename-field]").forEach(function(el){var key=el.getAttribute("data-rename-field"),fallback=el.getAttribute("data-default-label"),name=fieldDisplayName(key,key==="unitType"?(cardTemplate(current())||{}).typeLabel:fallback);if(el.dataset.displayValue!==name){el.innerHTML='<span class="field-caption-text">'+esc(name||"未命名")+'</span><span class="rename-pencil" aria-hidden="true">✎</span>';el.dataset.displayValue=name}el.title=(name||"未命名")+" · 点击改名";el.setAttribute("aria-label","修改字段名称："+(name||"未命名"))});
  $$("#textTarget option,#batchField option,#formulaField option,#replaceScope option").forEach(function(option){var key=fieldKeyForLayout(option.value);if(!Object.prototype.hasOwnProperty.call(FIELD_DISPLAY_DEFAULTS,key)&&key.indexOf("custom:")!==0)return;if(!option.dataset.defaultCaption)option.dataset.defaultCaption=option.textContent;option.textContent=fieldDisplayName(key,option.dataset.defaultCaption)});
  $$("select").forEach(function(el){if(el.selectedOptions&&el.selectedOptions[0])el.title=el.selectedOptions[0].textContent});
  $$(".left input,.right input").forEach(function(el){if((el.type==="text"||el.type==="number")&&!/key|secret|password|token/i.test(el.id||""))el.title=el.value});
}
function renderNavigatorOverview(){
  var c=current(),name=$("#navigatorCardName"),facts=$("#navigatorFacts");if(!c||!name||!facts)return;
  name.textContent=c.name||"未命名卡牌";name.title=c.name||"未命名卡牌";
  var t=cardTemplate(c),values=[["卡牌类型",t.name],[fieldDisplayName("faction"),c.faction||"未填写"],[fieldDisplayName("cardNumber"),c.cardNumber||"尚未编号"],[fieldDisplayName("workflowStatus"),isCardLocked(c)?"已锁定":c.workflowStatus||"设计中"]];
  facts.innerHTML=values.map(function(x){return '<div><small title="'+esc(x[0]||"未命名")+'">'+esc(x[0]||"未命名")+'</small><span title="'+esc(x[1])+'">'+esc(x[1])+'</span></div>'}).join("");
}
var fieldRenameSession=null;
function startFieldRename(key,anchor){
  finishFieldRename(false);var custom=String(key).indexOf("custom:")===0,def=custom&&fieldDefByKey(String(key).slice(7));
  if(custom&&!def)return;var map=projectDesign.fieldLabels||{},previous=custom?def.label:map[key];
  fieldRenameSession={key:key,had:custom||Object.prototype.hasOwnProperty.call(map,key),previous:previous,snapshot:null,future:future.slice()};
  var pop=$("#fieldRenamePopover"),input=$("#fieldRenameInput"),r=anchor.getBoundingClientRect();pop.hidden=false;input.value=fieldDisplayName(key,anchor.getAttribute("data-default-label"));
  pop.style.left=Math.max(12,Math.min(window.innerWidth-pop.offsetWidth-12,r.left))+"px";pop.style.top=Math.max(12,Math.min(window.innerHeight-pop.offsetHeight-12,r.bottom+6))+"px";
  input.focus();input.select();
}
function writeFieldCaption(session,value){
  if(String(session.key).indexOf("custom:")===0){var def=fieldDefByKey(session.key.slice(7));if(def)def.label=value;return}
  projectDesign.fieldLabels=Object.assign({},projectDesign.fieldLabels||{});projectDesign.fieldLabels[session.key]=value;
}
function finishFieldRename(cancel){
  var session=fieldRenameSession;if(!session)return;fieldRenameSession=null;
  if(cancel){if(session.had)writeFieldCaption(session,session.previous);else if(projectDesign.fieldLabels)delete projectDesign.fieldLabels[session.key];if(session.snapshot&&history[history.length-1]===session.snapshot){history.pop();future=session.future}}
  $("#fieldRenamePopover").hidden=true;updateFieldCaptions();renderNavigatorOverview();renderLayerPanel();refreshElementPanel();renderVariableButtons();renderTemplateFilter();persist();updateHistoryButtons();
  if(!cancel&&session.snapshot)setStatus("字段名称已保存");
}
$("#fieldRenameInput").addEventListener("input",function(){var session=fieldRenameSession;if(!session)return;if(!session.snapshot){session.snapshot=stateSnapshot();recordHistory()}writeFieldCaption(session,this.value);updateFieldCaptions();renderNavigatorOverview();renderLayerPanel();persist()});
$("#fieldRenameInput").addEventListener("keydown",function(e){if(e.isComposing)return;if(e.key==="Escape"){e.preventDefault();finishFieldRename(true)}else if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();finishFieldRename(false)}});
$("#finishFieldRename").onclick=function(){finishFieldRename(false)};
document.addEventListener("input",function(e){var el=e.target;if(el.tagName==="INPUT"&&el.closest(".left,.right")&&(el.type==="text"||el.type==="number")&&!/key|secret|password|token/i.test(el.id||""))el.title=el.value});
document.addEventListener("change",function(e){var el=e.target;if(el.tagName==="SELECT"&&el.selectedOptions&&el.selectedOptions[0])el.title=el.selectedOptions[0].textContent});
document.addEventListener("pointerdown",function(e){if(fieldRenameSession&&!e.target.closest("#fieldRenamePopover"))finishFieldRename(false)},true);
document.addEventListener("click",function(e){var b=e.target.closest("[data-rename-field]");if(b){e.preventDefault();startFieldRename(b.getAttribute("data-rename-field"),b);return}var a=e.target.closest("[data-workspace-action]");if(a){var target=$("#"+a.getAttribute("data-workspace-action"));if(target)target.click()}});
$("#renameSelectedField").onclick=function(){var m=selectedModel(current());if(!m||m.type!=="layout"){setStatus("请先选择名称、系别或数值等标准模块");return}startFieldRename(fieldKeyForLayout(m.id),this)};
// Standard card fields save on input, so refresh/export cannot lose a still-focused edit.
var inlineFieldSession=null;
function editableCardField(card,field){
  var key={name:"title",unitType:"type",rarity:"rarityText",description:"effect"}[field]||(["attack","health","move","range"].indexOf(field)>=0?"stat_"+field:field);
  return !!card&&!isCardLocked(card)&&!(card.layout&&card.layout[key]&&card.layout[key].locked);
}
function syncInlineFieldControls(card,field){
  if(card!==current())return;
  $$('[data-form="'+field+'"],[data-stat="'+field+'"]').forEach(function(el){el.value=card[field]==null?"":card[field];el.title=String(el.value)});
  if(field==="description")$("#description").value=card.description||"";
  $$('#preview [data-edit="'+field+'"]').forEach(function(n){if(inlineFieldSession&&inlineFieldSession.node===n)return;if(field==="description"&&n.closest('[data-layout-key="effect"]'))n.innerHTML=renderRichText(card.description,card);else n.textContent=String(card[field]??"")});
}
function beginInlineCardField(node){
  var field=node.getAttribute("data-edit"),card=current();if(!field||!editableCardField(card,field))return;
  if(inlineFieldSession&&inlineFieldSession.node===node)return;
  finishInlineCardField(false);
  inlineFieldSession={cardId:card.id,field:field,node:node,before:card[field],checkpoint:null,future:future.slice()};
  if(field==="description")node.textContent=card.description||"";
}
function saveInlineCardField(node){
  if(!inlineFieldSession||inlineFieldSession.node!==node)beginInlineCardField(node);
  var session=inlineFieldSession;if(!session||session.node!==node)return;
  var card=cards.find(function(c){return c.id===session.cardId});if(!editableCardField(card,session.field))return;
  var value=node.innerText.replace(/\r\n/g,"\n");
  if(["cost","attack","health","move","range"].indexOf(session.field)>=0)value=num(value,0);
  if(card[session.field]!==value){if(!session.checkpoint){session.checkpoint=stateSnapshot();recordHistory()}card[session.field]=value;syncInlineFieldControls(card,session.field);renderList();renderNavigatorOverview();refreshBeta3Context();scheduleLiveQa();persist()}
  if(session.field==="name")fitTitleToBox($("#preview"),card);
}
function finishInlineCardField(cancel,repaint){
  var session=inlineFieldSession;if(!session)return;
  if(!cancel&&session.node.isConnected)saveInlineCardField(session.node);
  inlineFieldSession=null;var card=cards.find(function(c){return c.id===session.cardId});if(!card)return;
  if(cancel){card[session.field]=session.before;if(session.checkpoint&&history[history.length-1]===session.checkpoint){history.pop();future=session.future}renderList()}
  syncInlineFieldControls(card,session.field);
  // Keep the clicked layer/card/field in the DOM until its click has been handled.
  if(repaint!==false&&session.node.isConnected){
    var host=document.createElement("div");host.innerHTML=cardHtml(card,!isCardLocked(card));var freeNode=session.node.closest('[data-extra-id]'),fresh=host.querySelector(freeNode?'[data-extra-id="'+freeNode.dataset.extraId+'"] [data-edit="'+session.field+'"]':'[data-edit="'+session.field+'"]');
    if(fresh)session.node.innerHTML=fresh.innerHTML;
    fitTitleToBox($("#preview"),card);fitEffectToBox($("#preview"),card);
  }
  renderNavigatorOverview();refreshBeta3Context();scheduleLiveQa();updateHistoryButtons();persist();
}
$("#preview").addEventListener("keydown",function(e){
  var node=e.target.closest("[data-edit]");if(!node||e.isComposing)return;
  if(e.key==="Escape"){e.preventDefault();finishInlineCardField(true);node.blur()}
  else if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();finishInlineCardField(false);node.blur()}
});
// Native in-place typing with immediate persistence, IME support, undo and explicit cancellation.
var inlineCanvasSession=null;
function startInlineCanvasText(node,created){
  var c=current(),m=getElementModel(c,node);if(!m||m.type!=="extra"||m.element.kind==="image"||isCardLocked(c)||m.layout.locked)return;
  var binding=elementBindingKey(m.element);if(binding){if(!editableCardField(c,binding)){setStatus("绑定的卡牌字段已锁定");return}var valueNode=node.querySelector('[data-edit]');if(valueNode){valueNode.focus();beginInlineCardField(valueNode)}return}
  if(inlineCanvasSession)finishInlineCanvasText(false);
  var previousFuture=future.slice();if(!created)recordHistory();var checkpoint=history[history.length-1];
  inlineCanvasSession={cardId:c.id,id:m.id,created:!!created,before:m.element.text||"",beforeLayout:clone(m.layout),future:previousFuture,checkpoint:checkpoint};
  node.textContent=created?"":String(m.element.text||"");if(created)m.element.text="";
  node.contentEditable="true";node.setAttribute("data-inline-editing","true");node.setAttribute("data-placeholder","在这里输入文字");node.setAttribute("role","textbox");node.setAttribute("aria-label","画布文字");node.setAttribute("aria-multiline","true");node.focus();
  var range=document.createRange();range.selectNodeContents(node);var selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);persist();
  setStatus("直接输入文字；Enter 换行，Ctrl / Cmd + Enter 完成，Esc 取消");
}
function saveInlineCanvasText(node){
  var session=inlineCanvasSession;if(!session)return;var c=cards.find(function(c){return c.id===session.cardId}),el=c&&(c.extraElements||[]).find(function(el){return el.id===session.id});if(!el)return;
  el.text=node.innerText.replace(/\r\n/g,"\n");
  var card=node.closest(".card"),h=card&&card.getBoundingClientRect().height,scale=h/474;
  if(h&&node.scrollHeight>node.clientHeight){var maxH=Math.max(el.layout.h,100-el.layout.y),wanted=Math.ceil((node.scrollHeight+4)*scale/h*100*1000)/1000;el.layout.h=Math.min(maxH,Math.max(el.layout.h,wanted));node.style.height=el.layout.h+"%"}
  if($("#elementText"))$("#elementText").value=el.text;renderNavigatorOverview();persist();
}
function finishInlineCanvasText(cancel){
  var session=inlineCanvasSession;if(!session)return;var c=cards.find(function(c){return c.id===session.cardId}),node=$('#preview [data-extra-id="'+session.id+'"]');
  if(!cancel&&node)saveInlineCanvasText(node);inlineCanvasSession=null;
  if(c&&cancel){if(session.created)c.extraElements=c.extraElements.filter(function(el){return el.id!==session.id});else{var el=c.extraElements.find(function(el){return el.id===session.id});if(el){el.text=session.before;el.layout=clone(session.beforeLayout)}}if(history[history.length-1]===session.checkpoint){history.pop();future=session.future}}
  if(node){node.removeAttribute("data-inline-editing");node.contentEditable="false"}
  renderPreviewOnly();refreshElementPanel();updateHistoryButtons();persist();
}
function insertCanvasTextAt(e){
  if(isCardLocked(current())){setStatus("当前卡牌已锁定，不能添加文字");return}
  var card=$("#preview .card");if(!card)return;var r=card.getBoundingClientRect(),x=e?clamp((e.clientX-r.left)/r.width*100,0,100):25,y=e?clamp((e.clientY-r.top)/r.height*100,0,100):45;
  var previousFuture=future.slice();addExtra("text",{x:clamp(x-2,1,89),y:clamp(y-2,1,89)});var model=selectedModel(current());if(model)model.layout.w=Math.min(45,99-model.layout.x);renderPreviewOnly();var node=findSelectedNode();if(node){startInlineCanvasText(node,true);inlineCanvasSession.future=previousFuture}
}
$("#canvasAddText").onclick=function(){setLayoutMode(true,false);insertCanvasTextAt()};
$("#preview").addEventListener("input",function(e){var node=e.target.closest("[data-inline-editing]");if(node)saveInlineCanvasText(node)});
$("#preview").addEventListener("keydown",function(e){if(!e.target.closest("[data-inline-editing]")||e.isComposing)return;if(e.key==="Escape"){e.preventDefault();finishInlineCanvasText(true)}else if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();finishInlineCanvasText(false)}});
// Fit only the preview wrapper. The export renderer keeps its original 348 × 474 coordinate space.
var workspaceFitFrame=null,workspaceCompact=null,wideNavigatorVisible=true;
function fitWorkspacePreview(){
  workspaceFitFrame=null;var viewport=$(".canvas-viewport");if(!viewport)return;
  var compact=window.innerWidth<1040;if(compact!==workspaceCompact){if(compact){wideNavigatorVisible=!document.body.classList.contains("panel-left-hidden");setBeta3Panel("left",false,false)}else if(workspaceCompact!==null)setBeta3Panel("left",wideNavigatorVisible,false);workspaceCompact=compact}
  var rect=viewport.getBoundingClientRect(),scale=Math.max(.35,Math.min(1.35,(rect.width-32)/348,(rect.height-32)/474));
  viewport.style.setProperty("--stage-scale",String(Math.round(scale*1000)/1000));
}
function scheduleWorkspaceFit(){if(workspaceFitFrame==null)workspaceFitFrame=requestAnimationFrame(fitWorkspacePreview)}
window.addEventListener("resize",scheduleWorkspaceFit);new ResizeObserver(scheduleWorkspaceFit).observe($(".canvas-viewport"));

var LAYOUT_LABELS={frameImage:"透明卡框",textureImage:"图片底纹",iconImage:"素材图标",art:"插画",cost:"费用",title:"名称",faction:"系别",rarityMark:"稀有度标记",type:"类型",rarityText:"稀有度文字",effect:"效果文本",tags:"检索标签",footerLeft:"系列 / 编号 / 年份",footerRight:"署名",stat_attack:"攻击",stat_health:"血量",stat_move:"移速",stat_range:"射程"};
function layerLabel(card,type,id,element){
  if(type==="extra"){if(element&&element.kind==="image")return "图片："+(element.name||"小素材");var binding=elementBindingKey(element);if(binding)return "文字跟随："+fieldDisplayName(binding);if(element&&element.kind==="number")return "编号："+(element.text||"{编号}");return "文字："+String(element&&element.text||"自定义文本").slice(0,12)}
  var t=cardTemplate(card);if(id==="type"&&simpleCard(card))return fieldDisplayName("unitType",t.typeLabel);if(id.indexOf("stat_")===0){var field=id.slice(5),st=(t.stats||[]).find(function(x){return x[0]===field});if(st)return fieldDisplayName(field,st[2])}
  return fieldDisplayName(fieldKeyForLayout(id),LAYOUT_LABELS[id]||id);
}
function cardLayerAllowed(card,key){
  if(!simpleCard(card))return true;
  if(["rarityMark","rarityText","tags","footerLeft","footerRight","stat_move","stat_range"].includes(key))return false;
  return card.cardKind!=="spell"||!["type","stat_attack","stat_health"].includes(key);
}
function fixedLayerKeys(card){
  var t=cardTemplate(card),keys=["art","cost","title","faction","rarityMark","type","rarityText","effect"];
  (t.stats||[]).forEach(function(st){keys.push("stat_"+st[0])});keys.push("tags","footerLeft","footerRight");Object.keys(IMAGE_ROLE_FIELDS).forEach(function(k){if(card.appearance[IMAGE_ROLE_FIELDS[k]])keys.push(k)});return keys.filter(function(k){return cardLayerAllowed(card,k)});
}
function allLayerModels(card){
  var out=fixedLayerKeys(card).map(function(k){return {type:"layout",id:k,layout:card.layout[k]||IMAGE_ROLE_FIELDS[k]&&clone(DEFAULT_LAYOUT[k]),label:layerLabel(card,"layout",k)}});
  (card.extraElements||[]).forEach(function(el){out.push({type:"extra",id:el.id,layout:el.layout,element:el,label:layerLabel(card,"extra",el.id,el)})});
  return out.filter(function(x){return x.layout}).sort(function(a,b){return (b.layout.z||0)-(a.layout.z||0)});
}
function selectedModel(card){
  if(!selectedElement)return null;if(selectedElement.type==="extra"){var el=(card.extraElements||[]).find(function(x){return x.id===selectedElement.id});return el?{type:"extra",id:el.id,layout:el.layout,element:el,label:layerLabel(card,"extra",el.id,el)}:null}
  var p=card.layout[selectedElement.id];if(!p&&IMAGE_ROLE_FIELDS[selectedElement.id]&&card.appearance[IMAGE_ROLE_FIELDS[selectedElement.id]])p=clone(DEFAULT_LAYOUT[selectedElement.id]);if(p&&IMAGE_ROLE_FIELDS[selectedElement.id]&&!isCardLocked(card))card.layout[selectedElement.id]=p;return p?{type:"layout",id:selectedElement.id,layout:p,label:layerLabel(card,"layout",selectedElement.id)}:null;
}
function renderLayerPanel(){
  var box=$("#layerList");if(!box)return;var c=current(),layers=allLayerModels(c);
  box.innerHTML=layers.map(function(m){var p=m.layout,sel=isSelectedRef({type:m.type,id:m.id});return '<button class="layer-row '+(sel?"selected ":"")+(p.visible===false?"is-hidden ":"")+'" data-layer-type="'+m.type+'" data-layer-id="'+esc(m.id)+'"><span class="layer-eye" data-layer-eye title="显示/隐藏">'+(p.visible===false?"○":"●")+'</span><span class="layer-name" title="'+esc(m.label)+'">'+esc(m.label)+'</span><span class="layer-meta">Z '+(p.z||0)+' · '+(modelOpacityKind(m)==="module"&&KadiEdit.opacityState(p).split?('底图 '+Math.round(KadiEdit.opacityState(p).material*100)+'% · 字 '+Math.round(KadiEdit.opacityState(p).text*100)+'%'):Math.round((p.opacity==null?1:p.opacity)*100)+'%')+'</span><span class="layer-lock" data-layer-lock title="锁定/解锁">'+(p.locked?"🔒":"🔓")+'</span></button>'}).join("");
}
var setArt=function(root,card){
  var art=root.querySelector(".art"),a=normalizeAppearance(card.appearance);
  if(art){var artData=cardArtData(card);if(artData)art.style.backgroundImage='url("'+String(artData).replace(/"/g,"%22")+'")';art.style.backgroundPosition=(a.artFocusX==null?50:a.artFocusX)+"% "+(a.artFocusY==null?50:a.artFocusY)+"%";art.style.backgroundSize=Math.max(100,a.artZoom||100)+"% auto";var subject=artSubjectScreenPosition(card);var marker=art.querySelector(".art-subject-marker");if(marker&&subject){marker.style.left=subject.x+"%";marker.style.top=subject.y+"%";marker.classList.toggle("unsafe",!subject.safe)}}
};
var layoutEditing=false,selectedElement=null,selectedElements=[],dragState=null,marqueeState=null;
var templateEditMode=loadJson("card-studio-edit-scope","card")==="template",pendingTemplateEditKeys={};
var advancedGeometry=loadJson("card-studio-advanced-geometry",false)===true;
function refKey(r){return r?r.type+":"+r.id:""}
function sameRef(a,b){return !!a&&!!b&&a.type===b.type&&a.id===b.id}
function modelFromRef(card,ref){
  if(!ref)return null;
  if(ref.type==="extra"){var el=(card.extraElements||[]).find(function(x){return x.id===ref.id});return el?{type:"extra",id:el.id,layout:el.layout,element:el,label:layerLabel(card,"extra",el.id,el)}:null}
  var p=card.layout[ref.id];if(!p&&IMAGE_ROLE_FIELDS[ref.id]&&card.appearance[IMAGE_ROLE_FIELDS[ref.id]])p=clone(DEFAULT_LAYOUT[ref.id]);if(p&&IMAGE_ROLE_FIELDS[ref.id]&&!isCardLocked(card))card.layout[ref.id]=p;return p?{type:"layout",id:ref.id,layout:p,label:layerLabel(card,"layout",ref.id)}:null;
}
function isSelectedRef(ref){return selectedElements.some(function(x){return sameRef(x,ref)})}
function selectedModels(card){return selectedElements.map(function(r){return modelFromRef(card,r)}).filter(Boolean)}
function shiftAttachedChildren(m,dx,dy){
  if(!dx&&!dy)return;if(m.type!=="extra"||!m.element||m.element.kind!=="image")return;
  (current().extraElements||[]).filter(function(x){return x.parentId===m.id&&!isSelectedRef({type:"extra",id:x.id})}).forEach(function(x){x.layout.x+=dx;x.layout.y+=dy});
}
function setModelPosition(m,x,y){if(m&&m.type==="layout"&&m.id==="title")x=(100-m.layout.w)/2;var dx=x-m.layout.x,dy=y-m.layout.y;m.layout.x=x;m.layout.y=y;if(m&&m.type==="layout"&&m.id==="title")enforceTitleAxis({title:m.layout});shiftAttachedChildren(m,dx,dy)}
function markModelOverride(m){if(!m||m.type!=="layout")return;if(IMAGE_ROLE_FIELDS[m.id]&&!current().layout[m.id])current().layout[m.id]=m.layout;if(templateEditMode){if(!pendingTemplateEditKeys[m.id])pendingTemplateEditKeys[m.id]=clone(m.layout);setLayoutOverride(current(),m.id,false)}else setLayoutOverride(current(),m.id,true)}
function markModelsOverride(models){(models||[]).forEach(markModelOverride)}
function flushPendingTemplateEdits(){
  if(!templateEditMode||!current())return;var keys=Object.keys(pendingTemplateEditKeys);if(!keys.length)return;var tid=current().templateId,master=makeLayout(tid),changed=[];
  keys.forEach(function(key){var p=current().layout&&current().layout[key],before=pendingTemplateEditKeys[key];if(p&&before&&!layoutGeomEqual(p,before)){master[key]=clone(p);setLayoutOverride(current(),key,false);changed.push(key)}});pendingTemplateEditKeys={};if(!changed.length)return;saveTemplateMaster(tid,master);applyTemplateMaster(tid);
}
function setTemplateEditMode(on){templateEditMode=!!on;pendingTemplateEditKeys={};try{localStorage.setItem("card-studio-edit-scope",JSON.stringify(templateEditMode?"template":"card"))}catch(e){};document.body.classList.toggle("template-edit-mode",templateEditMode);var a=$("#editScopeCard"),b=$("#editScopeTemplate"),badge=$("#editScopeBadge"),hint=$("#editScopeHint");if(a)a.classList.toggle("active",!templateEditMode);if(b)b.classList.toggle("active",templateEditMode);if(badge){badge.textContent=templateEditMode?"类型模板":"本卡精调";badge.classList.toggle("template",templateEditMode)}if(hint)hint.textContent=templateEditMode?("类型模板：标准语义模块的布局调整会写回“"+((TEMPLATES[current().templateId]||{}).name||current().templateId)+"”并同步所有跟随模板的卡；局部覆盖卡保持不变。自由元素仍只属于当前卡。"):("本卡精调：移动标准模块只影响当前卡，并自动记录为局部覆盖。");clearSelection();refreshElementPanel()}
function restoreModelFromMaster(m){if(!m||m.type!=="layout")return false;var master=makeLayout(current().templateId),p=master[m.id];if(!p)return false;current().layout[m.id]=clone(p);setLayoutOverride(current(),m.id,false);enforceTitleAxis(current().layout);return true}
function setSelection(refs,primary){
  var seen={};selectedElements=(refs||[]).filter(function(r){if(!r||seen[refKey(r)])return false;seen[refKey(r)]=1;return !!modelFromRef(current(),r)});
  selectedElement=primary&&isSelectedRef(primary)?primary:(selectedElements[selectedElements.length-1]||null);
  applySelectionClasses();refreshElementPanel();
}
function clearSelection(){selectedElements=[];selectedElement=null;applySelectionClasses();refreshElementPanel()}
function addSelection(ref){var refs=selectedElements.slice();if(!isSelectedRef(ref))refs.push(ref);setSelection(refs,ref)}
function toggleSelection(ref){var refs=selectedElements.slice(),idx=refs.findIndex(function(x){return sameRef(x,ref)});if(idx>=0)refs.splice(idx,1);else refs.push(ref);setSelection(refs,idx>=0?(refs[refs.length-1]||null):ref)}
function nodeForRef(ref){return !ref?null:(ref.type==="extra"?$('#preview [data-extra-id="'+ref.id+'"]'):$('#preview [data-layout-key="'+ref.id+'"]'))}
function semanticContentRectForModel(m){
  if(!m)return null;var node=nodeForRef({type:m.type,id:m.id});if(!node)return null;
  if(m.type!=="layout")return node.getBoundingClientRect();
  var sem=semanticForModel(m);if(!sem||sem.alignBy==="frame")return node.getBoundingClientRect();
  var content=node.querySelector('[data-edit]')||node.querySelector(".title")||node.querySelector("strong")||node.querySelector("span")||node;
  return (sem.kind==="title"||sem.kind==="value"||sem.kind==="label"||sem.kind==="meta")?(opticalTextRect(content)||content.getBoundingClientRect()):(renderedTextRect(content)||content.getBoundingClientRect());
}
function semanticBoundsPercent(m){
  var cardEl=$("#preview .card"),rr=semanticContentRectForModel(m);if(!cardEl||!rr)return {x:m.layout.x,y:m.layout.y,w:m.layout.w,h:m.layout.h,content:false};
  var cr=cardEl.getBoundingClientRect();if(!cr.width||!cr.height)return {x:m.layout.x,y:m.layout.y,w:m.layout.w,h:m.layout.h,content:false};
  var sem=semanticForModel(m),uses=!!(m.type==="layout"&&sem&&sem.alignBy!=="frame");
  return {x:(rr.left-cr.left)/cr.width*100,y:(rr.top-cr.top)/cr.height*100,w:rr.width/cr.width*100,h:rr.height/cr.height*100,content:uses};
}
function applySelectionClasses(){
  document.querySelectorAll('#preview .image-transform-overlay').forEach(function(el){el.remove()});
  document.querySelectorAll("#preview .layout-node.selected").forEach(function(x){x.classList.remove("selected","selected-primary")});var old=$("#preview .selection-bounds");if(old)old.remove();var oldTextGuide=$("#preview .semantic-content-guide");if(oldTextGuide)oldTextGuide.remove();
  selectedElements.forEach(function(ref){var n=nodeForRef(ref);if(n)n.classList.add("selected")});
  if(selectedElement){var p=nodeForRef(selectedElement);if(p)p.classList.add("selected-primary")}
  if(layoutEditing&&selectedElements.length===1&&selectedElement){
    var imageModel=selectedModel(current()),imageNode=nodeForRef(selectedElement),imageCard=$('#preview');
    if(imageModel&&imageNode&&imageCard&&imageForModel(imageModel)&&!imageModel.layout.locked&&!isCardLocked(current())){
      var transformBox=document.createElement('div'),ip=imageModel.layout;transformBox.className='image-transform-overlay';
      transformBox.dataset.refType=selectedElement.type;transformBox.dataset.refId=selectedElement.id;
      transformBox.style.cssText='left:'+ip.x+'%;top:'+ip.y+'%;width:'+ip.w+'%;height:'+ip.h+'%;transform:rotate('+(ip.r||0)+'deg)';
      transformBox.innerHTML=Array.from(imageNode.querySelectorAll(':scope > .layout-handle')).map(function(h){return h.outerHTML}).join('');imageCard.appendChild(transformBox);
    }
  }
  if(layoutEditing&&selectedElements.length>1){var ms=selectedModels(current()).filter(function(m){return !m.layout.locked&&m.layout.visible!==false});if(ms.length>1){var b=selectionBounds(ms),card=$("#preview .card");if(card){var box=document.createElement("div");box.className="selection-bounds";box.style.left=b.x+"%";box.style.top=b.y+"%";box.style.width=b.w+"%";box.style.height=b.h+"%";box.innerHTML='<i class="selection-group-resize" data-group-handle="resize" title="缩放整个选区"></i>';card.appendChild(box)}}}
  if(layoutEditing&&selectedElement&&selectedElement.type==="layout"){var sm=selectedModel(current()),card=$("#preview .card"),rr=semanticContentRectForModel(sm);if(card&&rr){var cr=card.getBoundingClientRect(),guide=document.createElement("i");guide.className="semantic-content-guide";guide.style.left=((rr.left-cr.left)/cr.width*100)+"%";guide.style.top=((rr.top-cr.top)/cr.height*100)+"%";guide.style.width=(rr.width/cr.width*100)+"%";guide.style.height=(rr.height/cr.height*100)+"%";guide.setAttribute("data-label","实际内容");card.appendChild(guide)}}
}
function getElementModel(card,node){
  if(!node)return null;
  var extraId=node.getAttribute("data-extra-id");
  if(extraId){var el=(card.extraElements||[]).find(function(x){return x.id===extraId});return el?{type:"extra",id:extraId,layout:el.layout,element:el,label:layerLabel(card,"extra",extraId,el)}:null}
  var key=node.getAttribute("data-layout-key");if(key&&IMAGE_ROLE_FIELDS[key]&&!card.layout[key]&&card.appearance[IMAGE_ROLE_FIELDS[key]]&&!isCardLocked(card))card.layout[key]=clone(DEFAULT_LAYOUT[key]);return key&&card.layout[key]?{type:"layout",id:key,layout:card.layout[key],label:layerLabel(card,"layout",key)}:null;
}
function findSelectedNode(){
  if(!selectedElement)return null;
  return selectedElement.type==="extra"?$('#preview [data-extra-id="'+selectedElement.id+'"]'):$('#preview [data-layout-key="'+selectedElement.id+'"]');
}
function renderConditionControls(m,count){
  var can=!!(m&&count===1&&m.type==="layout"),field=$("#conditionField"),op=$("#conditionOp"),value=$("#conditionValue"),save=$("#saveCondition"),clear=$("#clearCondition");
  if(!field||!op||!value)return;
  var defs=allConditionFieldDefs(),old=field.value;
  field.innerHTML=defs.map(function(f){return '<option value="'+esc(f.key)+'">'+esc(f.label)+'</option>'}).join("");
  var cond=can?templateCondition(current().templateId,m.id):null;
  field.disabled=!can;op.disabled=!can;save.disabled=!can;clear.disabled=!can;value.disabled=!can;
  if(!can){$("#conditionSummary").textContent="选择一个标准语义对象后，可按费用、稀有度、阵营或自定义字段控制是否显示。";value.value="";op.value="always";return}
  field.value=cond&&defs.some(function(f){return f.key===cond.field})?cond.field:(defs[0]?defs[0].key:"name");
  op.value=cond&&cond.op?cond.op:"always";value.value=cond&&cond.value!=null?cond.value:"";
  var noValue=["always","empty","notEmpty"].indexOf(op.value)>=0;value.disabled=noValue;
  $("#conditionSummary").textContent=cond&&cond.op&&cond.op!=="always"?"当前模板条件："+conditionHumanText(cond):"当前模板：始终显示该对象";
}
function conditionHumanText(cond){
  if(!cond||cond.op==="always")return "始终显示";
  var def=allConditionFieldDefs().find(function(f){return f.key===cond.field}),label=def?def.label:cond.field,ops={eq:"等于",neq:"不等于",contains:"包含",empty:"为空",notEmpty:"不为空",gt:"大于",lt:"小于"};
  return label+" "+(ops[cond.op]||cond.op)+(cond.op==="empty"||cond.op==="notEmpty"?"":" "+String(cond.value==null?"":cond.value));
}
function renderBadgeControls(m,count){var box=$("#semanticBadgeBox"),shape=$("#badgeShape"),icon=$("#badgeIcon"),label=$("#badgeShowLabel"),placement=$("#badgeIconPlacement"),scale=$("#badgeIconScale"),dx=$("#badgeValueDx"),dy=$("#badgeValueDy"),wm=$("#badgeWidthMm"),hm=$("#badgeHeightMm"),save=$("#saveBadgeStyle"),applySize=$("#applyBadgePhysicalSize"),reset=$("#resetBadgeStyle"),sem=m&&semanticForModel(m),can=!!(m&&count===1&&m.type==="layout"&&sem&&sem.kind==="value");if(!box)return;box.classList.toggle("disabled",!can);[shape,icon,label,placement,scale,dx,dy,wm,hm,save,applySize,reset].forEach(function(x){if(x)x.disabled=!can});if(!can){$("#badgeSummary").textContent="选择费用、攻击、生命、移动或射程后，可定义该卡牌类型统一的数值徽章。";return}var st=badgeStyleFor(current(),m.id),icons=["none","auto","cost","attack","health","move","range","armor","draw"];userAssets.filter(function(a){return assetHasRole(a,"icon")}).forEach(function(a){icons.push(a.id)});icon.innerHTML=icons.map(function(v){var a=assetById(v),name=v==="none"?"不显示图标":v==="auto"?("自动 · "+defaultBadgeIcon(m.id)):a?a.name:v;return '<option value="'+esc(v)+'">'+esc(name)+'</option>'}).join("");shape.value=st.shape||"none";icon.value=icons.indexOf(st.icon)>=0?st.icon:"none";placement.value=st.iconPlacement;scale.value=Math.round(st.iconScale*100);dx.value=st.valueDx;dy.value=st.valueDy;wm.value=(m.layout.w/100*CARD_BLEED_W_MM).toFixed(2);hm.value=(m.layout.h/100*CARD_BLEED_H_MM).toFixed(2);label.checked=st.showLabel!==false;$("#badgeSummary").textContent="样式属于“"+TEMPLATES[current().templateId].name+"”主模板；物理宽高按 69×94mm 卡面换算，应用后同类型继承卡精确同步。"}
function semanticGeometryProfile(m,count){
  if(!m||count!==1)return {fields:["x","y","w","h","r","z"],label:"多选 / 通用几何"};
  if(m.type==="extra")return {fields:["x","y","w","h","r","z"],label:"自由对象 · 完整几何"};
  var sem=semanticForModel(m),kind=sem&&sem.kind;if(kind==="title")return {fields:["y","w","z"],label:"卡牌名称 · 垂直位置 / 最大文字宽度 / 层级"};
  if(kind==="value")return {fields:["x","y","w","h","z"],label:"数值徽章 · 中心位置 / 物理尺寸 / 层级"};
  if(kind==="rules")return {fields:["x","y","w","h","z"],label:"规则区域 · 内容边界 / 可用宽高 / 层级"};
  if(kind==="art")return {fields:["x","y","w","h","z"],label:"插画窗口 · 裁切窗口；主体位置请用插画焦点控制"};
  if(kind==="icon")return {fields:["x","y","w","h","r","z"],label:"图形标记 · 位置 / 尺寸 / 旋转 / 层级"};
  if(kind==="label"||kind==="meta")return {fields:["x","y","w","h","z"],label:"文字标签 · 位置 / 文本区域 / 层级"};
  return {fields:["x","y","w","h","r","z"],label:"标准模块 · 完整几何"};
}
function applySemanticGeometryVisibility(m,count){var profile=semanticGeometryProfile(m,count),showAll=advancedGeometry||count!==1||!m;var grid=$("#semanticGeometryGrid"),profileEl=$("#semanticControlProfile");if(profileEl)profileEl.textContent="控件策略："+profile.label;if(grid){grid.setAttribute("data-profile",(m&&m.type==="layout"?semanticForModel(m).kind:"free")||"none");grid.querySelectorAll("[data-geom-field]").forEach(function(label){var f=label.getAttribute("data-geom-field");label.classList.toggle("semantic-hidden",!showAll&&profile.fields.indexOf(f)<0)})}var adv=$("#advancedGeometry");if(adv)adv.checked=advancedGeometry}

function refreshOpacityControls(models){
  ["material","text"].forEach(function(channel){
    var eligible=models.filter(function(m){return modelOpacityKind(m)!==(channel==="material"?"text":"image")}),id=channel==="material"?"elOpacity":"elTextOpacity",m=eligible[0],value=m?Math.round(KadiEdit.opacityState(m.layout)[channel]*100):100;
    $("#"+id).value=value;$("#"+id+"Value").textContent=value+"%";
    $("#"+id).disabled=isCardLocked(current())||!eligible.some(function(m){return !m.layout.locked});
  });
}
function refreshElementPanel(){
  var c=current(),m=selectedModel(c),models=selectedModels(c),count=models.length,disabled=!m;
  ["#elX","#elY","#elW","#elH","#elR","#elZ","#elOpacity","#elTextOpacity","#lockAspect","#toggleElementVisibility","#toggleElementLock","#layerUp","#layerDown","#bringFront","#sendBack","#duplicateElement","#deleteElement"].forEach(function(q){var el=$(q);if(el)el.disabled=disabled});
  var titleLocked=count===1&&m&&m.type==="layout"&&m.id==="title";if(titleLocked){$("#elX").disabled=true;$("#elH").disabled=true;$("#elR").disabled=true}var sem=m?semanticForModel(m):null,canInherit=count===1&&m&&m.type==="layout",overridden=canInherit&&isLayoutOverride(c,m.id);$("#semanticObjectBox").classList.toggle("is-override",!!overridden);$("#semanticObjectBox").classList.toggle("template-scope",templateEditMode);$("#semanticRole").textContent=sem?((m&&m.label||sem.role)+(templateEditMode&&canInherit?" · 编辑类型模板":overridden?" · 本卡覆盖":" · 跟随模板")):"未选择语义对象";$("#semanticRole").title=$("#semanticRole").textContent;$("#semanticHint").textContent=sem?sem.hint:"选择卡名、数值、规则区等对象后，这里会显示它真正的排版规则。";$("#inheritLayout").disabled=!canInherit||templateEditMode;$("#inheritLayout").checked=!!canInherit&&!overridden;$("#resetSelectedLayout").disabled=!canInherit||!overridden||templateEditMode;$("#snapSemanticAnchor").disabled=!canInherit;$("#opticalCenterSelected").disabled=!canInherit||!sem||sem.alignBy==="frame";applySemanticGeometryVisibility(m,count);var anchor=canInherit?semanticAnchorPoint(c,m.id):null,readout=$("#semanticAnchorReadout");if(readout){var actual=canInherit?semanticBoundsPercent(m):null,dx=anchor&&actual?(actual.x+actual.w/2-anchor.x):0,dy=anchor&&actual?(actual.y+actual.h/2-anchor.y):0;readout.textContent=anchor?("语义锚点："+anchor.x.toFixed(2)+"%, "+anchor.y.toFixed(2)+"% · 内容偏差 ΔX "+dx.toFixed(3)+"% / ΔY "+dy.toFixed(3)+"%"):"语义锚点：—"}$("#elXLabel").textContent=titleLocked?"水平中心":"X";$("#elYLabel").textContent="Y";$("#elWLabel").textContent=titleLocked?"文字最大宽":"宽";$("#elHLabel").textContent=titleLocked?"高度由模板控制":"高";$("#elRLabel").textContent="角度";renderConditionControls(m,count);renderBadgeControls(m,count);
  $("#selectedLayerName").title=m?m.label:"未选择";$("#selectionCount").textContent=count+" 个模块";$("#selectedLayerName").textContent=count>1?count+" 个模块":(m?m.label+(titleLocked?" · 中轴锁定":""):"未选择");
  if(!m){refreshOpacityControls([]);refreshImageControls(null,0);applySelectionLockState();applySemanticGeometryVisibility(null,0);$("#elementText").value="";$("#elementText").disabled=true;$("#elementBinding").disabled=true;$("#elOpacity").value=100;$("#elOpacityValue").textContent="100%";$("#addImageLabel").disabled=true;$("#detachImageLabel").disabled=true;$("#imageLabelPosition").disabled=true;$("#imageLabelTools").classList.remove("active");renderLayerPanel();refreshTextControls();return}
  $("#elX").value=Number(precisionRound(m.layout.x).toFixed(3));$("#elY").value=Number(precisionRound(m.layout.y).toFixed(3));$("#elW").value=Number(precisionRound(m.layout.w).toFixed(3));$("#elH").value=Number(precisionRound(m.layout.h).toFixed(3));$("#elR").value=Number(precisionRound(m.layout.r).toFixed(3));$("#elZ").value=m.layout.z==null?20:m.layout.z;
  refreshOpacityControls(models);
  var allHidden=count&&models.every(function(x){return x.layout.visible===false}),allLocked=count&&models.every(function(x){return x.layout.locked});
  $("#toggleElementVisibility").textContent=allHidden?"显示所选":"隐藏所选";$("#toggleElementLock").textContent=allLocked?"解锁所选":"锁定所选";
  var isSingle=count===1,isExtra=isSingle&&m.type==="extra",isImage=isExtra&&m.element.kind==="image",isAttached=isExtra&&!!m.element.parentId;
  var binding=isExtra&&!isImage?elementBindingKey(m.element):"";
  $("#elementBinding").innerHTML='<option value="">自由文字</option>'+KadiLayout.fields.map(function(f){return '<option value="'+f[0]+'">跟随 '+esc(fieldDisplayName(f[0],f[1]))+'</option>'}).join('');
  $("#elementBinding").value=binding;$("#elementBinding").disabled=!isExtra||isImage||!!m.layout.locked||isCardLocked(c);
  $("#elementBindingHint").textContent=binding?'本层内容跟随卡牌字段；双击文字可修改字段值，字体和位置保留。':'自由文字可绑定到名称、费用等字段，数据变化时保留本层排版。';
  $("#elementText").disabled=!isExtra||isImage||!!binding;$("#elementText").value=isExtra&&!isImage?(binding?String(c[binding]??""):m.element.text||""):"";
  $("#addImageLabel").disabled=!isImage;$("#detachImageLabel").disabled=!isAttached;$("#imageLabelPosition").disabled=!isImage;
  $("#imageLabelTools").classList.toggle("active",isImage||isAttached);
  refreshImageControls(m,count);applySelectionLockState();applySelectionClasses();renderLayerPanel();refreshTextControls();
}
function setLayoutMode(on,focusPanel){
  layoutEditing=!!on;
  $("#preview").classList.toggle("layout-editing",layoutEditing);document.body.classList.toggle("layout-mode-on",layoutEditing);
  $("#safeMode").classList.toggle("active",!layoutEditing);$("#layoutMode").classList.toggle("active",layoutEditing);$("#layoutQuickButton").classList.toggle("active",layoutEditing);
  $("#layoutModeLabel").textContent=layoutEditing?"布局":"内容";
  $("#layoutQuickButton").textContent=layoutEditing?"完成":"布局";
  $("#stageHint").textContent=layoutEditing?"双击空白处输入文字 · 双击文字继续编辑 · 方向键微调 · Ctrl / Cmd + Enter 完成":"直接填写内容；双击卡面空白处可添加文字。";
  $("#layoutPanel").classList.toggle("mode-focus",layoutEditing);
  if(layoutEditing){setToolMode("layout");if(focusPanel!==false)setTimeout(function(){$("#layoutPanel").scrollIntoView({behavior:"smooth",block:"center"})},80)}
  if(!layoutEditing)clearSelection();scheduleWorkspaceFit();
}
function selectLayoutNode(node,additive){
  var m=getElementModel(current(),node);if(!m){if(!additive)clearSelection();return}
  var ref={type:m.type,id:m.id};
  if(additive)addSelection(ref);else setSelection([ref],ref);
}
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function selectionBounds(models){
  if(!models.length)return {x:0,y:0,w:1,h:1};var x1=Math.min.apply(null,models.map(function(m){return m.layout.x})),y1=Math.min.apply(null,models.map(function(m){return m.layout.y})),x2=Math.max.apply(null,models.map(function(m){return m.layout.x+m.layout.w})),y2=Math.max.apply(null,models.map(function(m){return m.layout.y+m.layout.h}));return {x:x1,y:y1,w:Math.max(.1,x2-x1),h:Math.max(.1,y2-y1)}
}
function beginLayoutPointer(e,node,mode){
  var m=getElementModel(current(),node);if(!m||m.layout.locked)return;
  e.preventDefault();e.stopPropagation();
  var ref={type:m.type,id:m.id},toggle=!!(e.ctrlKey||e.metaKey),additive=!!e.shiftKey;
  if(toggle){toggleSelection(ref);return}
  if(!isSelectedRef(ref))selectLayoutNode(node,additive);else{selectedElement=ref;applySelectionClasses();refreshElementPanel()}
  var models=selectedModels(current()).filter(function(x){return !x.layout.locked});if(!models.length)return;
  recordHistory();markModelsOverride(models);var cardEl=$("#preview .card"),rect=cardEl.getBoundingClientRect(),starts=models.map(function(x){return {ref:{type:x.type,id:x.id},layout:clone(x.layout)}}),group=selectionBounds(models);
  var linked=[];if((mode||"move")==="move")models.forEach(function(sm){if(sm.type==="extra"&&sm.element.kind==="image"){(current().extraElements||[]).filter(function(x){return x.parentId===sm.id&&!isSelectedRef({type:"extra",id:x.id})}).forEach(function(x){if(!linked.some(function(y){return y.element.id===x.id}))linked.push({element:x,start:clone(x.layout)})})}});
  dragState={pointerId:e.pointerId,node:node,mode:mode||"move",model:m,models:models,starts:starts,group:group,rect:rect,startX:e.clientX,startY:e.clientY,start:clone(m.layout),corner:(e.target.closest("[data-corner]")||{}).dataset?.corner||"se",linked:linked};
  if(mode==="rotate"){var nr=node.getBoundingClientRect();dragState.cx=nr.left+nr.width/2;dragState.cy=nr.top+nr.height/2;dragState.startAngle=Math.atan2(e.clientY-dragState.cy,e.clientX-dragState.cx)*180/Math.PI}
  $("#preview").setPointerCapture&&$("#preview").setPointerCapture(e.pointerId);
}
function clearSnapGuides(){document.querySelectorAll("#preview .snap-guide").forEach(function(x){x.remove()})}
function showSnapGuides(snap){clearSnapGuides();if(!snap)return;var card=$("#preview .card");if(!card)return;if(snap.x!=null){var v=document.createElement("i");v.className="snap-guide snap-guide-v";v.style.left=snap.x+"%";card.appendChild(v)}if(snap.y!=null){var h=document.createElement("i");h.className="snap-guide snap-guide-h";h.style.top=snap.y+"%";card.appendChild(h)}}
function snappedMove(d,dx,dy){
  var enabled=$("#snapEnabled")&&$("#snapEnabled").checked;if(!enabled)return {dx:dx,dy:dy,x:null,y:null};var threshold=Math.max(.05,Number(projectDesign.snapTolerance)||.7),g=d.group,selected={};d.starts.forEach(function(st){selected[refKey(st.ref)]=1});
  var xs=[0,50,100],ys=[0,50,100];allLayerModels(current()).forEach(function(m){if(selected[refKey({type:m.type,id:m.id})]||m.layout.visible===false)return;var p=m.layout;xs.push(p.x,p.x+p.w/2,p.x+p.w);ys.push(p.y,p.y+p.h/2,p.y+p.h)});
  var fx=[g.x+dx,g.x+g.w/2+dx,g.x+g.w+dx],fy=[g.y+dy,g.y+g.h/2+dy,g.y+g.h+dy],bestX=null,bestY=null;
  fx.forEach(function(f){xs.forEach(function(c){var diff=c-f;if(Math.abs(diff)<=threshold&&(!bestX||Math.abs(diff)<Math.abs(bestX.diff)))bestX={diff:diff,target:c}})});
  fy.forEach(function(f){ys.forEach(function(c){var diff=c-f;if(Math.abs(diff)<=threshold&&(!bestY||Math.abs(diff)<Math.abs(bestY.diff)))bestY={diff:diff,target:c}})});
  return {dx:dx+(bestX?bestX.diff:0),dy:dy+(bestY?bestY.diff:0),x:bestX?bestX.target:null,y:bestY?bestY.target:null};
}
function moveLayoutPointer(e){
  if(!dragState||e.pointerId!==dragState.pointerId)return;var d=dragState,dx=(e.clientX-d.startX)/d.rect.width*100,dy=(e.clientY-d.startY)/d.rect.height*100;
  var snap=null;if(d.mode==="move"){snap=snappedMove(d,dx,dy);dx=snap.dx;dy=snap.dy;
    d.starts.forEach(function(st){var m=modelFromRef(current(),st.ref);if(!m)return;m.layout.x=clamp(st.layout.x+dx,-20,120);m.layout.y=clamp(st.layout.y+dy,-20,120)});
    (d.linked||[]).forEach(function(x){x.element.layout.x=x.start.x+dx;x.element.layout.y=x.start.y+dy});
  }else if(d.mode==="resize"){
    if(d.starts.length===1&&imageForModel(d.model)){Object.assign(d.model.layout,KadiEdit.resizeCorner(d.start,d.corner,dx,dy,!!d.start.lockAspect||e.shiftKey));}else if(d.starts.length===1&&d.starts[0].ref.type==="layout"&&d.starts[0].ref.id==="title"){var st=d.starts[0],tm=modelFromRef(current(),st.ref),sem=SEMANTIC_OBJECTS.title,nw=clamp(st.layout.w+dx*2,sem.minW,sem.maxW);tm.layout.w=precisionRound(nw);tm.layout.x=Math.round(((100-tm.layout.w)/2)*1000)/1000;tm.layout.h=st.layout.h;tm.layout.r=0}else{
    var lock=($("#lockAspect")&&$("#lockAspect").checked)||e.shiftKey,g=d.group,newW=Math.max(2,g.w+dx),newH=Math.max(2,g.h+dy),sx=newW/g.w,sy=newH/g.h;
    if(lock){var scale=Math.max(.05,Math.abs(dx/g.w)>=Math.abs(dy/g.h)?sx:sy);sx=sy=scale}
    d.starts.forEach(function(st){var m=modelFromRef(current(),st.ref);if(!m)return;m.layout.x=g.x+(st.layout.x-g.x)*sx;m.layout.y=g.y+(st.layout.y-g.y)*sy;m.layout.w=clamp(st.layout.w*sx,2,140);m.layout.h=(m.type==="layout"&&m.id==="title")?st.layout.h:clamp(st.layout.h*sy,2,140);if(m.type==="layout"&&m.id==="title"){m.layout.x=(100-m.layout.w)/2;m.layout.r=0}});}
  }else if(d.mode==="rotate"){
    var p=d.model.layout,a=Math.atan2(e.clientY-d.cy,e.clientX-d.cx)*180/Math.PI;p.r=d.start.r+(a-d.startAngle);
  }
  d.models.forEach(function(m){if(imageForModel(m))m.layout.fitTarget="manual"});
  enforceTitleAxis(current().layout);renderPreviewOnly();refreshElementPanel();if(snap)showSnapGuides(snap);
}
function endLayoutPointer(){if(!dragState)return;enforceTitleAxis(current().layout);dragState=null;clearSnapGuides();persist()}
function beginMarquee(e){
  var card=$("#preview .card");if(!card)return;var rect=card.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)return;
  e.preventDefault();var sx=(e.clientX-rect.left)/rect.width*100,sy=(e.clientY-rect.top)/rect.height*100,base=(e.ctrlKey||e.metaKey||e.shiftKey)?selectedElements.slice():[];
  if(!base.length)clearSelection();var box=document.createElement("div");box.className="marquee-box";card.appendChild(box);marqueeState={rect:rect,sx:sx,sy:sy,base:base,box:box};
}
function moveMarquee(e){
  if(!marqueeState)return;var m=marqueeState,ex=(e.clientX-m.rect.left)/m.rect.width*100,ey=(e.clientY-m.rect.top)/m.rect.height*100,x=Math.min(m.sx,ex),y=Math.min(m.sy,ey),w=Math.abs(ex-m.sx),h=Math.abs(ey-m.sy);
  m.box.style.left=x+"%";m.box.style.top=y+"%";m.box.style.width=w+"%";m.box.style.height=h+"%";
  var refs=m.base.slice();allLayerModels(current()).forEach(function(layer){var p=layer.layout;if(p.visible===false||p.locked)return;var hit=p.x<x+w&&p.x+p.w>x&&p.y<y+h&&p.y+p.h>y;if(hit)refs.push({type:layer.type,id:layer.id})});setSelection(refs,refs[refs.length-1]||null);
}
function endMarquee(){if(!marqueeState)return;if(marqueeState.box&&marqueeState.box.remove)marqueeState.box.remove();marqueeState=null}
function addExtra(kind,pos){
  if(isCardLocked(current())){setStatus("当前卡牌已锁定，不能添加模块");return}
  recordHistory();var c=current(),n=(c.extraElements||[]).length+1,text=kind==="number"?(c.cardNumber||("CARD-"+String(n).padStart(3,"0"))):"输入文字";
  var x=pos&&pos.x!=null?pos.x:(kind==="number"?68:15),y=pos&&pos.y!=null?pos.y:(kind==="number"?94:50);
  var el={id:uid(),kind:kind,text:kind==="number"?"{编号}":text,fontSize:kind==="number"?10:12,color:c.appearance.text,align:kind==="number"?"center":"left",layout:{x:x,y:y,w:kind==="number"?27:45,h:kind==="number"?4:9,r:0,z:45,locked:false,opacity:1,visible:true}};
  c.extraElements.push(el);renderPreviewOnly();setSelection([{type:"extra",id:el.id}],{type:"extra",id:el.id});persist();
}
async function addFreeImage(asset){
  if(isCardLocked(current())){setStatus("当前卡牌已锁定，不能放入图片素材");return}
  try{await inspectAssetImage(asset);recordHistory();if(!asset.id)asset.id=uid();if(!userAssets.some(function(x){return x.id===asset.id}))userAssets.push(asset);cacheAssetBinary(asset);
  var c=current(),rect=KadiLayout.fitRect(asset.width,asset.height,{x:38,y:38,w:24,h:24}),p=Object.assign({r:0,z:18,locked:false,opacity:1,visible:true,fit:"contain",lockAspect:true,fitTarget:"manual"},rect),el={id:uid(),kind:"image",name:asset.name||"素材",assetId:asset.id,layout:p,initialLayout:clone(p)};
  c.extraElements.push(el);renderAll();setSelection([{type:"extra",id:el.id}],{type:"extra",id:el.id});persist();setStatus("素材已按原图比例放入，可调整图层与尺寸");}catch(e){setStatus("放入素材失败："+e.message)}
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
  current().extraElements.push(el);renderPreviewOnly();setSelection([{type:"extra",id:el.id}],{type:"extra",id:el.id});$("#elementText").focus();$("#elementText").select();persist();setStatus("文字已添加；现在直接输入即可，移动图标时文字会跟随");
}
function renderedTextRect(el){if(!el)return null;try{var range=document.createRange();range.selectNodeContents(el);var r=range.getBoundingClientRect();if(r&&Number.isFinite(r.width))return r}catch(e){}return el.getBoundingClientRect()}
function opticalTextRect(el){
  var rr=renderedTextRect(el);if(!rr||!projectDesign.opticalCentering)return rr;var text=String(el&&el.textContent||"").replace(/\s+/g," ").trim();if(!text)return rr;
  try{var cs=getComputedStyle(el),cv=opticalTextRect._canvas||(opticalTextRect._canvas=document.createElement("canvas")),ctx=cv.getContext("2d"),fontSize=parseFloat(cs.fontSize)||12;ctx.font=[cs.fontStyle||"normal",cs.fontWeight||"400",fontSize+"px",cs.fontFamily||"sans-serif"].join(" ");var mt=ctx.measureText(text),advance=Number(mt.width)||0,left=Number(mt.actualBoundingBoxLeft),right=Number(mt.actualBoundingBoxRight);if(!(advance>0)||!Number.isFinite(left)||!Number.isFinite(right)||left+right<=0)return rr;var scale=rr.width/advance;if(!Number.isFinite(scale)||scale<.5||scale>2)scale=1;var inkW=(left+right)*scale,inkLeft=rr.left-left*scale;return {left:inkLeft,top:rr.top,width:inkW,height:rr.height,right:inkLeft+inkW,bottom:rr.bottom,x:inkLeft,y:rr.top}}
  catch(e){return rr}
}
function semanticAnchorPoint(card,key){var master=makeLayout(card.templateId),p=master[key]||card.layout[key];if(!p)return null;return {x:key==="title"?50:p.x+p.w/2,y:p.y+p.h/2}}
function reconcileModelOverride(m){if(!m||m.type!=="layout")return;var master=makeLayout(current().templateId),p=master[m.id];if(p&&layoutGeomEqual(m.layout,p))setLayoutOverride(current(),m.id,false);else setLayoutOverride(current(),m.id,true)}
function fitTitleToBox(root,card){
  var el=root&&root.querySelector&&root.querySelector(".title-layer .title");if(!el)return {fits:true,size:0};var a=normalizeAppearance(card.appearance),ts=textStyleFor(card,"title",a),sem=SEMANTIC_OBJECTS.title,min=Math.max(5,Number(projectDesign.titleMinFont)||sem.minFont),max=Math.max(min,Number(ts.size)||22);
  el.style.textAlign="center";el.style.justifyContent="center";el.style.alignItems="center";el.style.whiteSpace="nowrap";el.style.transform="none";el.removeAttribute("data-fit-state");
  // Hidden editor mounts have zero geometry; never turn those measurements into a text offset.
  if(!el.getClientRects().length||el.getBoundingClientRect().width<1){el.style.setProperty("font-size",max+"px","important");return {fits:true,size:max,pending:true}}
  function fits(size){el.style.transform="none";el.style.setProperty("font-size",size+"px","important");if(projectDesign.opticalCentering!==false){var ink=opticalTextRect(el),box=el.getBoundingClientRect(),scale=el.offsetWidth?box.width/el.offsetWidth:1,delta=ink?(box.left+box.width/2)-(ink.left+ink.width/2):0;if(ink&&scale>0&&Math.abs(delta)<size*scale*.25)el.style.transform="translateX("+Math.max(-1.5,Math.min(1.5,delta/scale))+"px)"}var rr=renderedTextRect(el),er=el.getBoundingClientRect(),w=rr?rr.width:el.scrollWidth,h=rr?rr.height:el.scrollHeight;return w<=Math.max(1,er.width-4)&&h<=Math.max(1,er.height-2)}
  if(card.appearance&&card.appearance.autoFitText===false){el.style.fontSize=max+"px";var ok=fits(max);el.dataset.fitState=ok?"ok":"overflow";return {fits:ok,size:max}}
  if(fits(max)){el.dataset.fitState="ok";return {fits:true,size:max}}
  var lo=min,hi=max,best=min;for(var i=0;i<14;i++){var mid=(lo+hi)/2;if(fits(mid)){best=mid;lo=mid}else hi=mid}best=Math.floor(best*10)/10;el.style.fontSize=best+"px";var ok=fits(best);el.dataset.fitState=ok?(best<max*.78?"tight":"ok"):"overflow";return {fits:ok,size:best};
}
function fitEffectToBox(root,card){
  var layer=root&&root.querySelector&&root.querySelector(".effect"),el=layer&&layer.querySelector('[data-edit="description"]');if(!layer||!el)return {fits:true,size:0};
  var a=normalizeAppearance(card.appearance),ts=textStyleFor(card,"effect",a),min=Math.max(6,Number(projectDesign.effectMinFont)||9),max=Math.max(min,Number(ts.size)||13);
  function fits(size){el.style.setProperty("font-size",size+"px","important");return layer.scrollHeight<=layer.clientHeight+1&&layer.scrollWidth<=layer.clientWidth+1}
  if(card.appearance&&card.appearance.autoFitText===false){el.style.fontSize=max+"px";var fixedOk=fits(max);el.dataset.fitState=fixedOk?"ok":"overflow";return {fits:fixedOk,size:max}}
  if(fits(max)){el.dataset.fitState="ok";return {fits:true,size:max}}
  var lo=min,hi=max,best=min;for(var i=0;i<14;i++){var mid=(lo+hi)/2;if(fits(mid)){best=mid;lo=mid}else hi=mid}best=Math.floor(best*10)/10;el.style.fontSize=best+"px";var ok=fits(best);el.dataset.fitState=ok?(best<max*.8?"tight":"ok"):"overflow";return {fits:ok,size:best}
}

var renderPreviewOnly=function(){
  syncPrintGeometry();$("#preview").classList.toggle("show-print-guides",!!projectDesign.showPrintGuides);
  var c=current(),t=cardTemplate(c);
  if(inlineCanvasSession)finishInlineCanvasText(false);
  if(inlineFieldSession)finishInlineCardField(false,false);
  enforceTitleAxis(c.layout);$("#preview").innerHTML=cardHtml(c,!isCardLocked(c));setArt($("#preview"),c);fitTitleToBox($("#preview"),c);fitEffectToBox($("#preview"),c);$("#preview").classList.toggle("layout-editing",layoutEditing);applySelectionClasses();renderLayerPanel();
  $("#templateName").textContent=t.name;
  var savedDefault=KadiLayout.creationDefault({projectDesign:projectDesign},TEMPLATES),defaultButton=$("#setDefaultCard");
  if(defaultButton){defaultButton.textContent=savedDefault&&savedDefault.sourceCardId===c.id?"更新唯一默认":"设为唯一默认";defaultButton.title=savedDefault?"当前默认："+savedDefault.templateName+" · "+savedDefault.sourceName+"。点击保存当前卡的完整格式。":"将当前卡的卡框、图层、字体与位置用于以后新建卡片";}
  renderNavigatorOverview();scheduleLiveQa();scheduleWorkspaceFit();
};
function textControlTargets(){
  var c=current(),raw=$("#textTarget")?$("#textTarget").value:"title";
  if(raw!=="selected")return [{type:"layout",key:raw}];
  return selectedModels(c).filter(function(m){return (m.type==="layout"&&FIXED_TEXT_KEYS.indexOf(m.id)>=0)||(m.type==="extra"&&m.element.kind!=="image")}).map(function(m){return m.type==="layout"?{type:"layout",key:m.id}:{type:"extra",element:m.element}});
}
function readTextControlStyle(target){
  var c=current(),a=normalizeAppearance(c.appearance);
  if(target.type==="layout")return textStyleFor(c,target.key,a);
  var el=target.element;return {size:el.fontSize||11,color:el.color||a.text,align:el.align||"left",bold:!!el.bold,strokePx:el.strokePx||0,fontStyle:el.fontStyle||a.fontStyle||"default"};
}
function refreshTextControls(){
  if(!$("#textTarget"))return;var targets=textControlTargets(),disabled=isCardLocked(current())||!targets.some(function(t){var p=t.type==="layout"?current().layout[t.key]:t.element.layout;return !p||!p.locked}),style=targets.length?readTextControlStyle(targets[0]):{size:13,color:"#334155",align:"left",bold:false,fontStyle:"default"};
  ["#textSize","#textColor","#textAlign","#textBold","#textStroke","#textFont","#clearTextOverride","#applyTextAll"].forEach(function(q){var el=$(q);if(el)el.disabled=disabled});
  var titleOnly=targets.length&&targets.every(function(t){return t.type==="layout"&&t.key==="title"});if($("#textAlign"))$("#textAlign").disabled=disabled||titleOnly;
  $("#textSize").value=style.size;$("#textColor").value=style.color;$("#textAlign").value=titleOnly?"center":style.align;$("#textBold").checked=!!style.bold;$("#textStroke").value=Math.round((style.strokePx||0)/1.2*100);$("#textStrokeValue").textContent=$("#textStroke").value+"%";$("#textFont").value=style.fontStyle||"default";
}
function setTextStyleValue(field,value,record){
  if(isCardLocked(current())){setStatus("当前卡牌已锁定，不能修改文字样式");refreshTextControls();return}var targets=textControlTargets().filter(function(t){var p=t.type==="layout"?current().layout[t.key]:t.element.layout;return !p||!p.locked});if(!targets.length){setStatus("请先选择一个文字模块，或在“文字模块”中指定区域");return}if(record!==false)recordHistory();var c=current();
  targets.forEach(function(t){if(t.type==="layout"){if(!c.textStyles)c.textStyles={};if(!c.textStyles[t.key])c.textStyles[t.key]={};c.textStyles[t.key][field]=(t.key==="title"&&field==="align")?"center":value}else{var el=t.element;if(field==="size")el.fontSize=value;else el[field]=value}});
  renderPreviewOnly();refreshTextControls();persist();
}
function renderCustomFieldInputs(){
  var box=$("#customFieldInputs");if(!box)return;var c=current(),visibleFields=schemaForCard(c);
  if(!visibleFields.length){box.innerHTML='<div class="empty-note">当前模板没有适用的自定义字段。可添加模板专用字段，或选择适用于全部模板的通用字段。</div>';return}
  box.innerHTML=visibleFields.map(function(f){
    var v=customFieldValue(c,f.key),req=f.required?' <em>*</em>':'',control;
    if(f.type==="cardRef")control='<select data-custom-field="'+esc(f.key)+'"><option value=""></option>'+cards.filter(function(x){return x.id!==c.id}).map(function(x){return '<option value="'+esc(x.id)+'" '+(String(v)===String(x.id)?'selected':'')+'>'+esc(x.cardNumber?(x.cardNumber+" · "+x.name):x.name)+'</option>'}).join("")+'</select>';
    else if(f.type==="select")control='<select data-custom-field="'+esc(f.key)+'"><option value=""></option>'+f.options.map(function(x){return '<option value="'+esc(x)+'" '+(String(v)===String(x)?'selected':'')+'>'+esc(x)+'</option>'}).join("")+'</select>';
    else if(f.type==="boolean")control='<input data-custom-field="'+esc(f.key)+'" type="checkbox" '+(v?'checked':'')+'>';
    else control='<input data-custom-field="'+esc(f.key)+'" type="'+(f.type==="number"?'number':'text')+'" '+(f.type==="number"?'step="any" ':'')+'value="'+esc(v)+'">';
    return '<label>'+fieldCaptionButton('custom:'+f.key,f.label)+req+control+'<small>{'+esc(f.key)+'}</small></label>';
  }).join("");
}
function renderCardSetSelect(){var el=$("#cardSetSelect");if(!el)return;var c=current(),value=c.setId||"";el.innerHTML='<option value="">未归属扩展包</option>'+projectSets.map(function(s){return '<option value="'+esc(s.id)+'" '+(s.id===value?'selected':'')+'>'+esc(s.code+' · '+s.name+(s.locked?' 🔒':''))+'</option>'}).join("");el.value=projectSetById(value)?value:""}
function refreshEditLock(){var c=current(),locked=isCardLocked(c),banner=$("#currentLockBanner");if(banner){banner.hidden=!locked;banner.querySelector("span").textContent=locked?("只读："+lockReason(c)):""}var selectors=['[data-form]','#description','#dynamicStats input','#customFieldInputs input','#customFieldInputs select','#templateCards button','#cardKind','#presetShowcase','#presetClassicFrame','#layoutPanel button','#layoutPanel input','#layoutPanel select','#textSize','#textColor','#textAlign','#textBold','#textFont','#clearTextOverride','#applyTextAll','#uploadArt','#clearArt','#artFocusX','#artFocusY','#artSubjectX','#artSubjectY','#centerArtSubject','#artZoom','#autoPalette'];selectors.forEach(function(q){$$(q).forEach(function(el){el.disabled=locked})});if($("#cardSetSelect"))$("#cardSetSelect").disabled=locked;$$("[data-form]").forEach(function(el){el.disabled=!editableCardField(c,el.getAttribute("data-form"))});$$("[data-stat]").forEach(function(el){el.disabled=!editableCardField(c,el.getAttribute("data-stat"))});$("#description").disabled=!editableCardField(c,"description");refreshElementPanel()}
var renderCard=function(){
  var c=current(),t=cardTemplate(c);
  renderPreviewOnly();
  updateFieldCaptions();
  $$("[data-form]").forEach(function(el){var f=el.getAttribute("data-form");el.value=c[f]==null?"":c[f]});
  $("#description").value=c.description||"";
  var basic=simpleCard(c),spell=basic&&c.cardKind==="spell";
  $("#cardKindControl").hidden=!basic;$("#cardKind").value=spell?"spell":"unit";$("#typeLabel").hidden=spell;
  $("[data-form=rarity]").closest("label").hidden=basic;
  document.body.classList.toggle("seven-field-card",basic);
  if($("#aiPrompt"))$("#aiPrompt").value=c.artPrompt||"";
  $("#dynamicStats").innerHTML=t.stats.map(function(s){return '<label>'+fieldCaptionButton(s[0],s[2])+'<input type="number" data-stat="'+s[0]+'" value="'+esc(c[s[0]])+'"></label>'}).join("");
  $$("[data-color]").forEach(function(el){el.value=c.appearance[el.getAttribute("data-color")]});
  refreshTextControls();refreshElementPanel();renderTermQuickList();renderCustomFieldInputs();renderCardSetSelect();syncArtControls();refreshAiPromptPreview();
  renderTemplates();renderAssets();renderSkins();refreshEditLock();updateFieldCaptions();renderNavigatorOverview();
};
var renderExport=function(card){enforceTitleAxis(card.layout);$("#exportCard").innerHTML=cardHtml(card,false);setArt($("#exportCard"),card);fitTitleToBox($("#exportCard"),card);fitEffectToBox($("#exportCard"),card);$("#exportCard").classList.remove("layout-editing")}
var getVisibleCards=function(){
  var q=$("#cardSearch").value.trim().toLowerCase(),filter=$("#templateFilter").value,faction=$("#factionFilter").value,rarity=$("#rarityFilter").value,sort=$("#sortCards").value;
  var list=cards.filter(function(c){
    var t=cardTemplate(c);
    return (filter==="all"||c.templateId===filter)&&(faction==="all"||c.faction===faction)&&(rarity==="all"||c.rarity===rarity)&&(!q||searchableText(c).indexOf(q)>=0);
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
    var t=cardTemplate(c);
    var set=projectSetById(c.setId),variant=c.variantKind&&c.variantKind!=="标准"?(" · "+c.variantKind):"";return '<button class="card-row '+(c.id===selected?"active":"")+(isCardLocked(c)?' is-locked':'')+'" data-id="'+c.id+'"><span class="n">'+String(i+1).padStart(2,"0")+'</span><span><strong title="'+esc(c.name)+'">'+esc(c.name)+(isCardLocked(c)?' 🔒':'')+'</strong><small>'+esc(t.short)+' · '+esc(c.faction)+' · '+esc(c.rarity)+(set?' · '+esc(set.code):'')+esc(variant)+'</small></span><span class="cost">'+esc(c.cost)+'</span></button>';
  }).join("");
  $("#delete").disabled=cards.length<=1;
};
var renderTemplateFilter=function(){
  var old=$("#templateFilter").value,oldFaction=$("#factionFilter").value,oldRarity=$("#rarityFilter").value;
  $("#templateFilter").innerHTML='<option value="all">全部模板</option>'+availableTemplateIds().map(function(k){return '<option value="'+k+'">'+esc(TEMPLATES[k].name)+'</option>'}).join("");$("#templateFilter").value=TEMPLATES[old]?old:"all";
  var factions=Array.from(new Set(cards.map(function(c){return c.faction}).filter(Boolean))).sort(),rarities=Array.from(new Set(cards.map(function(c){return c.rarity}).filter(Boolean))).sort();
  $("#factionFilter").innerHTML='<option value="all">全部'+esc(fieldDisplayName("faction"))+'</option>'+factions.map(function(x){return '<option>'+esc(x)+'</option>'}).join("");$("#factionFilter").value=factions.indexOf(oldFaction)>=0?oldFaction:"all";
  $("#rarityFilter").innerHTML='<option value="all">全部稀有度</option>'+rarities.map(function(x){return '<option>'+esc(x)+'</option>'}).join("");$("#rarityFilter").value=rarities.indexOf(oldRarity)>=0?oldRarity:"all";
};
var renderTemplates=function(){
  var c=current();
  $("#templateCards").innerHTML=availableTemplateIds().filter(function(k){return !(projectDesign.hiddenTemplates||[]).includes(k)||k===c.templateId}).map(function(k){
    var t=TEMPLATES[k];
    return '<button class="template-card '+(c.templateId===k?"active":"")+'" data-template="'+k+'"><strong>'+esc(t.name)+'</strong><small>'+esc(t.hint)+'</small></button>';
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
var SKIN_THEME_KEYS=["primary","secondary","accent","frame","text","frameStyle","textureStyle","costStyle","rarityStyle","fontStyle","titleSize","titleColor","titleAlign","titleBold","effectSize","effectColor","effectAlign","effectBold","metaSize","metaColor","metaAlign","metaBold","statsSize","statsColor","statsAlign","statsBold","costSize","costColor","costAlign","costBold"];
function themeAppearance(a){var n=normalizeAppearance(a),out={};SKIN_THEME_KEYS.forEach(function(k){out[k]=clone(n[k])});return out}
function mergeThemeAppearance(target,theme){var out=normalizeAppearance(target);SKIN_THEME_KEYS.forEach(function(k){if(theme&&theme[k]!==undefined)out[k]=clone(theme[k])});return out}
var appearanceEqual=function(a,b){return JSON.stringify(themeAppearance(a))===JSON.stringify(themeAppearance(b))};
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
function customAssetRoleForView(a,cat){if(cat==="icon"&&assetHasRole(a,"icon"))return "icon";if(cat==="frame"&&assetHasRole(a,"frameImage"))return "frameImage";if(cat==="texture"&&assetHasRole(a,"textureImage"))return "textureImage";if(assetHasRole(a,"icon"))return "icon";if(assetHasRole(a,"frameImage"))return "frameImage";if(assetHasRole(a,"textureImage"))return "textureImage";return "custom"}
var renderCustomAssets=function(){var box=$("#customAssetList");if(!box)return;var q=$("#assetSearch").value.trim().toLowerCase(),cat=$("#assetCategory").value;var list=userAssets.filter(function(a){var roles=assetRoles(a);if(roles.length===1&&roles[0]==="art")return false;var catOk=cat==="all"||cat==="custom"||(cat==="frame"&&assetHasRole(a,"frameImage"))||(cat==="texture"&&assetHasRole(a,"textureImage"))||(cat==="icon"&&assetHasRole(a,"icon"));return catOk&&(!q||[a.name,roles.join(" "),a.tags||""].join(" ").toLowerCase().indexOf(q)>=0)}).slice().sort(function(a,b){return Number(!!b.favorite)-Number(!!a.favorite)});box.innerHTML=list.length?list.map(function(a){var role=customAssetRoleForView(a,cat),label=role==="icon"?"卡面图标":role==="frameImage"?"图片边框 / 模板":role==="textureImage"?"图片底纹":"自由素材",place='<button data-place-custom="'+a.id+'">放到卡面</button>';return '<div class="custom-asset"><img src="'+esc(a.dataUrl)+'"><div><strong>'+esc(a.name)+'</strong><small>'+esc(label)+'</small></div><div class="asset-mini-actions">'+place+(role!=="custom"?'<button data-apply-custom="'+a.id+'" data-apply-role="'+role+'">应用</button>':'')+'<button data-fav-custom="'+a.id+'">'+(a.favorite?"★":"☆")+'</button><button data-remove-custom="'+a.id+'">删</button></div></div>'}).join(""):'<div class="empty-note">没有匹配的自定义图片素材。</div>'};
var activeToolMode=loadJson("card-studio-tool-mode","content");
function setToolMode(mode){
  var valid=["content","text","layout","visual","rules","export"];if(valid.indexOf(mode)<0)mode="content";activeToolMode=mode;
  $$("#rightModeTabs [data-tool-mode]").forEach(function(b){b.classList.toggle("active",b.getAttribute("data-tool-mode")===mode)});
  $$(".right [data-tool-group]").forEach(function(sec){sec.hidden=sec.getAttribute("data-tool-group")!==mode});
  try{localStorage.setItem("card-studio-tool-mode",JSON.stringify(mode))}catch(e){}
}
$("#rightModeTabs").addEventListener("click",function(e){var b=e.target.closest("[data-tool-mode]");if(!b)return;var mode=b.getAttribute("data-tool-mode");setToolMode(mode);if(mode==="layout"&&!layoutEditing)setLayoutMode(true,false)});
var renderAll=function(){syncPrintGeometry();renderPrintGeometryControls();$("#projectName").value=projectName;if($("#aiStyle"))$("#aiStyle").value=aiStyle;if($("#aiStylePreset"))$("#aiStylePreset").value=detectAiStylePreset(aiStyle);$("#sheetSize").value=printSettings.sheet;$("#cropMarks").checked=!!printSettings.crop;if($("#duplexFlip"))$("#duplexFlip").value=printSettings.duplexFlip||"long";if($("#backRotate"))$("#backRotate").checked=!!printSettings.backRotate;["X","Y","W","H","R"].forEach(function(k){var el=$("#el"+k);if(el)el.step=String(projectDesign.layoutStep)});renderTemplateFilter();renderList();renderCard();renderSnapshots();renderCustomAssets();renderVariableButtons();renderLayoutComponents();renderProjectSummary();renderInlineIconPalette();renderCardBackControl();renderTemplatePrecisionSummary();updateHistoryButtons();setToolMode(activeToolMode);setTemplateEditMode(templateEditMode);refreshBeta3Context();renderAiProviderControls();updateFieldCaptions();renderNavigatorOverview();scheduleWorkspaceFit();if(mutationPending)persist()};

var patch=function(field,value,record){
  var c=current();if(!c)return;if(!editableCardField(c,field)){setStatus("当前卡牌或字段模块已锁定，请先解锁再修改");renderCard();return;}
  if(["cost","attack","health","move","range"].indexOf(field)>=0)value=num(value,0);
  if(c[field]===value)return;
  if(record!==false)recordHistory();
  c[field]=value;renderCard();renderList();persist();
};
var patchAppearance=function(field,value){
  if(isCardLocked(current())){setStatus("当前卡牌已锁定，视觉设置保持只读");renderCard();return}recordHistory();current().appearance=normalizeAppearance(current().appearance);current().appearance[field]=value;renderCard();persist();
};
$("#cardKind").onchange=function(){var c=current();if(!simpleCard(c)||isCardLocked(c)){renderCard();return}recordHistory();c.cardKind=this.value==="spell"?"spell":"unit";clearSelection();renderAll();persist();setStatus(c.cardKind==="spell"?"已切换为法术：种族、攻击、血量已隐藏，原值保留":"已切换为单位：种族、攻击、血量已恢复")};
var setTemplate=function(id){
  if(isCardLocked(current())){setStatus("当前卡牌已锁定，不能切换模板");return}if(!TEMPLATES[id]||current().templateId===id)return;
  recordHistory();clearSelection();current().templateId=id;current().layout=makeLayout(id);current().layoutOverrides={};enforceTitleAxis(current().layout);
  if(!current().unitType||["单位","法术","建筑","事件"].indexOf(current().unitType)>=0)current().unitType=TEMPLATES[id].short;
  renderAll();setStatus("已切换为"+TEMPLATES[id].name+"；已自动套用该类型统一坐标");
};

$("#safeMode").onclick=function(){setLayoutMode(false);setToolMode("content")};
$("#layoutMode").onclick=function(){setLayoutMode(true,true)};
$("#layoutQuickButton").onclick=function(){setLayoutMode(!layoutEditing,true)};
$("#editScopeCard").onclick=function(){setTemplateEditMode(false);setStatus("编辑范围：本卡精调；标准模块改动只记录到当前卡")};
$("#editScopeTemplate").onclick=function(){setLayoutMode(true,false);setTemplateEditMode(true);setStatus("编辑范围：类型模板；标准语义模块改动将同步所有跟随模板的同类型卡")};
$("#advancedGeometry").onchange=function(){advancedGeometry=!!this.checked;try{localStorage.setItem("card-studio-advanced-geometry",JSON.stringify(advancedGeometry))}catch(e){}refreshElementPanel()};
$("#preview").addEventListener("pointerdown",function(e){
  if(e.target.closest("[data-inline-editing]")||e.detail>1)return;
  var transformBox=e.target.closest('.image-transform-overlay');if(transformBox&&layoutEditing&&!isCardLocked(current())){var original=nodeForRef({type:transformBox.dataset.refType,id:transformBox.dataset.refId}),transformHandle=e.target.closest('[data-handle]');if(original&&transformHandle)beginLayoutPointer(e,original,transformHandle.dataset.handle);return}
  if(!layoutEditing)return;if(isCardLocked(current())){setStatus("当前卡牌已锁定，布局为只读");return;}var groupHandle=e.target.closest("[data-group-handle]"),handle=e.target.closest("[data-handle]"),node=e.target.closest(".layout-node");if(groupHandle){var gm=selectedModels(current()).find(function(m){return !m.layout.locked&&m.layout.visible!==false}),gn=gm&&nodeForRef({type:gm.type,id:gm.id});if(gn)beginLayoutPointer(e,gn,"resize");return}
  if(node){var nm=getElementModel(current(),node);if(nm&&nm.id==="art"&&nm.layout.locked){beginMarquee(e);return}if(nm&&nm.layout.locked){selectLayoutNode(node,e.ctrlKey||e.metaKey||e.shiftKey);return}beginLayoutPointer(e,node,handle?handle.getAttribute("data-handle"):"move");return}
  if(e.target.closest(".card"))beginMarquee(e);
});
window.addEventListener("pointermove",function(e){moveLayoutPointer(e);moveMarquee(e)});
window.addEventListener("pointerup",function(){endLayoutPointer();endMarquee()});window.addEventListener("pointercancel",function(){endLayoutPointer();endMarquee()});
$("#preview").addEventListener("click",function(e){if(layoutEditing&&e.target.closest(".layout-node")&&!e.target.closest("[data-inline-editing]")){e.preventDefault();e.stopPropagation()}});
$("#preview").addEventListener("dblclick",function(e){
  if(isCardLocked(current())){setStatus("当前卡牌已锁定，不能直接编辑卡面");return}
  var node=e.target.closest(".layout-node"),card=e.target.closest(".card");
  if(node&&["art","frameImage","textureImage"].includes(node.getAttribute("data-layout-key")))node=null;
  if(!node&&card){e.preventDefault();if(!layoutEditing)setLayoutMode(true,false);insertCanvasTextAt(e);return}
  if(!layoutEditing)return;
  if(node&&node.classList.contains("free-text-element")){e.preventDefault();selectLayoutNode(node,false);startInlineCanvasText(node,false);return}
  if(node){var direct=e.target.closest("[data-edit]")||node.querySelector("[data-edit]");if(direct&&direct.isContentEditable){selectLayoutNode(node,false);direct.focus();document.execCommand&&document.execCommand("selectAll",false,null)}}
});
var geometryEditInput=null;
function applyGeometryInput(k,el,finish){
  if(el.value===""||!Number.isFinite(Number(el.value)))return;
  var models=mutableSelectedModels(),m=models.find(function(x){return selectedElement&&x.type===selectedElement.type&&x.id===selectedElement.id})||models[0];if(!m)return;if(geometryEditInput!==el){recordHistory();geometryEditInput=el}markModelsOverride(models);var v=num(el.value,m.layout[{X:"x",Y:"y",W:"w",H:"h",R:"r",Z:"z"}[k]]);
  if((k==="X"||k==="Y")&&models.length>1){var f=k==="X"?"x":"y",d=v-m.layout[f];models.filter(function(x){return !x.layout.locked}).forEach(function(x){setModelPosition(x,x.layout.x+(f==="x"?d:0),x.layout.y+(f==="y"?d:0))})}
  else if((k==="W"||k==="H")&&models.length>1){var f=k==="W"?"w":"h",scale=Math.max(.05,v/m.layout[f]),g=selectionBounds(models);models.filter(function(x){return !x.layout.locked}).forEach(function(x){if(k==="W"){x.layout.x=g.x+(x.layout.x-g.x)*scale;x.layout.w*=scale}else{x.layout.y=g.y+(x.layout.y-g.y)*scale;x.layout.h*=scale}})}
  else if(k==="X")setModelPosition(m,v,m.layout.y);else if(k==="Y")setModelPosition(m,m.layout.x,v);else {var field={W:"w",H:"h",R:"r",Z:"z"}[k];if((field==="w"||field==="h")&&imageForModel(m)){if(v<=0){refreshElementPanel();return}Object.assign(m.layout,KadiLayout.resized(m.layout,field,v));}else m.layout[field]=v;}

  if(imageForModel(m)&&["X","Y","W","H","R"].includes(k))m.layout.fitTarget="manual";
  enforceTitleAxis(current().layout);renderPreviewOnly();
  if(finish){geometryEditInput=null;refreshElementPanel()}
  else if(models.length===1&&imageForModel(m)&&m.layout.lockAspect&&(k==="W"||k==="H")){var other=k==="W"?"H":"W";$("#el"+other).value=Number(m.layout[other==="W"?"w":"h"].toFixed(3));}
  persist();
}
["X","Y","W","H","R","Z"].forEach(function(k){var el=$("#el"+k);el.addEventListener("input",function(){applyGeometryInput(k,this,false)});el.addEventListener("change",function(){applyGeometryInput(k,this,true)});el.addEventListener("blur",function(){if(geometryEditInput===this){geometryEditInput=null;refreshElementPanel()}})});

["material","text"].forEach(function(channel){
  var el=$(channel==="material"?"#elOpacity":"#elTextOpacity"),editing=false;
  function begin(){if(!editing){recordHistory();editing=true;}}
  el.addEventListener("pointerdown",function(){if(!el.disabled)begin()});
  el.addEventListener("input",function(){var models=mutableSelectedModels().filter(function(m){return modelOpacityKind(m)!==(channel==="material"?"text":"image")});if(!models.length)return;begin();markModelsOverride(models);var value=clamp(num(el.value,100)/100,0,1);models.forEach(function(m){Object.assign(m.layout,KadiEdit.setOpacity(m.layout,modelOpacityKind(m),value,channel))});renderPreviewOnly();refreshElementPanel();persist()});
  ["change","blur"].forEach(function(event){el.addEventListener(event,function(){editing=false})});
});
$("#importFrameLayer").onclick=function(){setLayoutMode(true,false);$("#smartFrameFile").click()};
$("#addTextElement").onclick=function(){setLayoutMode(true,false);insertCanvasTextAt()};$("#addNumberElement").onclick=function(){setLayoutMode(true);addExtra("number")};
$("#addImageElement").onclick=function(){setLayoutMode(true,false);$("#freeImageFile").click()};
$("#freeImageFile").onchange=async function(){var f=this.files&&this.files[0];if(!f)return;try{var asset={id:uid(),name:f.name.replace(/\.[^.]+$/,""),category:"icon",dataUrl:await fileToDataUrl(f)};addFreeImage(asset)}catch(e){setStatus("导入小素材失败："+e.message)}this.value=""};
$("#addImageLabel").onclick=addLabelToSelectedImage;
$("#detachImageLabel").onclick=function(){var m=selectedModel(current());if(!m||m.type!=="extra"||!m.element.parentId)return;recordHistory();m.element.parentId="";m.element.labelPosition="";renderPreviewOnly();refreshElementPanel();persist();setStatus("文字已解除跟随，现在可以完全独立摆放")};
$("#elementBinding").onchange=function(){var m=selectedModel(current());if(!m||m.type!=="extra"||m.element.kind==="image"||m.layout.locked||isCardLocked(current()))return;var key=this.value;if(key&&!KadiLayout.fields.some(function(f){return f[0]===key}))return;recordHistory();var old=elementBindingKey(m.element);if(!key&&old)m.element.text=String(current()[old]??"");if(key)m.element.fieldKey=key;else delete m.element.fieldKey;renderPreviewOnly();refreshElementPanel();persist();setStatus(key?"文字已绑定字段，排版保持原样":"已解除绑定并保留当前文字")};
$("#elementText").addEventListener("input",function(){var m=selectedModel(current());if(m&&m.type==="extra"&&!elementBindingKey(m.element)&&!m.layout.locked&&!isCardLocked(current())){m.element.text=this.value;renderPreviewOnly();persist()}});
$("#elementText").addEventListener("focus",function(){if(!this.disabled)recordHistory()});
$("#toggleElementVisibility").onclick=function(){var models=mutableSelectedModels();if(!models.length)return;recordHistory();markModelsOverride(models);var show=models.every(function(m){return m.layout.visible===false});models.forEach(function(m){m.layout.visible=show});renderPreviewOnly();refreshElementPanel();persist()};
$("#toggleElementLock").onclick=function(){if(isCardLocked(current()))return;var models=selectedModels(current());if(!models.length)return;recordHistory();var unlock=models.every(function(m){return m.layout.locked});models.forEach(function(m){m.layout.locked=!unlock});renderPreviewOnly();refreshEditLock();persist()};
function moveSelectedLayer(delta){var models=mutableSelectedModels();if(!models.length)return;recordHistory();markModelsOverride(models);var selected=new Set(models.map(function(m){return refKey(m)})),others=allLayerModels(current()).filter(function(m){return !selected.has(refKey(m))});models.sort(function(a,b){return delta>0?(b.layout.z||0)-(a.layout.z||0):(a.layout.z||0)-(b.layout.z||0)}).forEach(function(m){var z=m.layout.z||0,adjacent=others.map(function(n){return n.layout.z||0}).filter(function(v){return delta>0?v>=z:v<=z});m.layout.z=adjacent.length?(delta>0?Math.min.apply(null,adjacent)+1:Math.max.apply(null,adjacent)-1):z+delta});renderPreviewOnly();refreshElementPanel();persist()}

$("#layerUp").onclick=function(){moveSelectedLayer(1)};$("#layerDown").onclick=function(){moveSelectedLayer(-1)};
$("#bringFront").onclick=function(){var models=mutableSelectedModels();if(!models.length)return;recordHistory();markModelsOverride(models);var max=Math.max.apply(null,allLayerModels(current()).map(function(x){return x.layout.z||0}));models.sort(function(a,b){return (a.layout.z||0)-(b.layout.z||0)}).forEach(function(m,i){m.layout.z=max+1+i});renderPreviewOnly();refreshElementPanel();persist()};
$("#sendBack").onclick=function(){var models=mutableSelectedModels();if(!models.length)return;recordHistory();markModelsOverride(models);var min=Math.min.apply(null,allLayerModels(current()).map(function(x){return x.layout.z||0}));models.sort(function(a,b){return (a.layout.z||0)-(b.layout.z||0)}).forEach(function(m,i){m.layout.z=min-models.length+i});renderPreviewOnly();refreshElementPanel();persist()};
$("#deleteElement").onclick=function(){var models=mutableSelectedModels();if(!models.length)return;recordHistory();markModelsOverride(models);var removeIds={};models.forEach(function(m){if(m.type==="extra"){removeIds[m.id]=1;if(m.element.kind==="image")(current().extraElements||[]).forEach(function(x){if(x.parentId===m.id)removeIds[x.id]=1})}else m.layout.visible=false});current().extraElements=(current().extraElements||[]).filter(function(x){return !removeIds[x.id]});clearSelection();renderPreviewOnly();persist();setStatus("已处理所选 "+models.length+" 个模块：自定义元素删除，模板字段隐藏")};
function duplicateSelection(){
  if(isCardLocked(current()))return;var models=selectedModels(current());if(!models.length)return;recordHistory();var out=[],c=current(),tokenMap={cost:"费用",title:"名称",faction:"系别",rarityText:"稀有度",type:"兵种",stat_attack:"攻击",stat_health:"血量",stat_move:"移速",stat_range:"射程",footerLeft:"系列",footerRight:"署名"};
  var extras=KadiEdit.duplicateExtras(models.filter(function(m){return m.type==="extra"}).map(function(m){return m.element}),c.extraElements,uid);
  extras.forEach(function(x){c.extraElements.push(x);out.push({type:"extra",id:x.id})});
  models.filter(function(m){return m.type==="layout"}).forEach(function(m){var asset=imageForModel(m),x=asset?{id:uid(),kind:"image",name:asset.name,assetId:asset.id,layout:clone(m.layout),initialLayout:clone(m.layout)}:{id:uid(),kind:"text",text:"{"+(tokenMap[m.id]||"名称")+"}",fontSize:12,color:c.appearance.text,align:"left",bold:false,fontStyle:"",layout:clone(m.layout)};x.layout.x+=3;x.layout.y+=3;x.layout.z=(m.layout.z||0)+1;x.layout.locked=false;if(x.kind==="image")x.initialLayout=clone(x.layout);c.extraElements.push(x);out.push({type:"extra",id:x.id})});
  renderPreviewOnly();setSelection(out,out[out.length-1]);persist();setStatus("已复制 "+out.length+" 个模块（附属文字关系已保留）");
}
$("#duplicateElement").onclick=duplicateSelection;
function templatePrecisionStats(templateId){var master=makeLayout(templateId),list=cards.filter(function(c){return c.templateId===templateId}),overrides=0,drift=0;list.forEach(function(c){Object.keys(master).forEach(function(k){if(isLayoutOverride(c,k))overrides++;else if(!isCardLocked(c)&&c.layout&&c.layout[k]&&!layoutGeomEqual(c.layout[k],master[k]))drift++})});return {cards:list.length,overrides:overrides,drift:drift}}
var pendingTemplateImpact=null;
function templateChangedKeys(templateId,candidate){var master=makeLayout(templateId),keys=[];Object.keys(master).forEach(function(k){if(candidate&&candidate[k]&&!layoutGeomEqual(master[k],candidate[k]))keys.push(k)});return keys}
function templateImpactData(templateId,candidate){var changed=templateChangedKeys(templateId,candidate),list=cards.filter(function(c){return c.templateId===templateId}),followers=0,protectedCards=0,locked=0;list.forEach(function(c){if(isCardLocked(c)){locked++;return}var protectedAny=changed.some(function(k){return isLayoutOverride(c,k)});if(protectedAny)protectedCards++;else followers++});var scored=list.map(function(c){var ov=Object.keys(ensureLayoutOverrides(c)||{}).length,dpi=artEffectiveDpi(c),title=String(c.name||"").length,rules=String(c.description||"").length,score=title*2+Math.min(500,rules)/3+ov*80+(dpi!=null&&dpi<dpiThresholds().target?120:0)+(isCardLocked(c)?150:0);return {card:c,score:score,overrides:ov,dpi:dpi}}).sort(function(a,b){return b.score-a.score}).slice(0,5);return {templateId:templateId,changed:changed,total:list.length,followers:followers,protectedCards:protectedCards,locked:locked,samples:scored}}
function openTemplateImpact(candidate,options){options=options||{};var tid=options.templateId||current().templateId,data=templateImpactData(tid,candidate),t=TEMPLATES[tid]||{};pendingTemplateImpact={candidate:masterLayoutSnapshot(tid,candidate),options:options,data:data};$("#templateImpactSubtitle").textContent=(options.title||"更新类型模板")+" · "+(t.name||tid);$("#templateImpactSummary").innerHTML='<div><b>'+data.total+'</b><span>同类型卡</span></div><div><b>'+data.followers+'</b><span>将自动跟随</span></div><div><b>'+data.protectedCards+'</b><span>存在局部覆盖</span></div><div><b>'+data.locked+'</b><span>锁定并冻结</span></div>';$("#templateImpactKeys").innerHTML=data.changed.length?data.changed.map(function(k){return '<span class="impact-key"><b>'+esc(layoutDisplayName(k))+'</b><i>'+esc(k)+'</i></span>'}).join(''):'<div class="empty-note">没有检测到布局变化。</div>';$("#templateImpactSamples").innerHTML=data.samples.length?data.samples.map(function(row){var c=row.card,flag=isCardLocked(c)?'<em class="locked">锁定</em>':row.overrides?'<em class="override">'+row.overrides+' 覆盖</em>':'<em>跟随</em>',dpi=row.dpi==null?'DPI —':('DPI '+Math.round(row.dpi));return '<div class="impact-sample"><div><b>'+esc(c.name||"未命名卡")+'</b><small>标题 '+String(c.name||"").length+' 字 · 规则 '+String(c.description||"").length+' 字 · '+dpi+'</small></div>'+flag+'</div>'}).join(''):'<div class="empty-note">当前类型没有卡牌。</div>';$("#templateImpactNote").textContent=data.locked?('局部覆盖保持不变；'+data.locked+' 张锁定卡会冻结当前版式，不会因模板更新而改变。'):'局部覆盖保持不变；当前没有锁定卡。';$("#confirmTemplateImpact").disabled=!data.changed.length;$("#templateImpactModal").hidden=false}
function closeTemplateImpact(cancel){if(cancel&&pendingTemplateImpact&&typeof pendingTemplateImpact.options.onCancel==="function")pendingTemplateImpact.options.onCancel();pendingTemplateImpact=null;$("#templateImpactModal").hidden=true}
function confirmTemplateImpact(){if(!pendingTemplateImpact)return;var p=pendingTemplateImpact,tid=p.data.templateId;recordHistory();saveTemplateMaster(tid,p.candidate);if(typeof p.options.beforeApply==="function")p.options.beforeApply();var applied=applyTemplateMaster(tid),st=applied&&applied._applyStats||{applied:0,locked:0};if(typeof p.options.afterApply==="function")p.options.afterApply();pendingTemplateImpact=null;$("#templateImpactModal").hidden=true;renderAll();persist();setStatus((p.options.successText||"类型主模板已更新")+" · 同步 "+st.applied+" 张，冻结 "+st.locked+" 张锁定卡")}
function renderTemplatePrecisionSummary(){var el=$("#templatePrecisionSummary");if(!el||!current())return;var st=templatePrecisionStats(current().templateId);el.textContent=st.cards+" 张同类型卡 · "+st.overrides+" 个局部覆盖 · "+st.drift+" 个继承漂移";el.classList.toggle("has-drift",st.drift>0)}
$("#repairTemplateFollowers").onclick=function(){var tid=current().templateId,master=makeLayout(tid),changed=0,skipped=0;recordHistory();cards.forEach(function(c){if(c.templateId!==tid)return;if(isCardLocked(c)){skipped++;return}ensureLayoutOverrides(c);Object.keys(master).forEach(function(k){if(!c.layoutOverrides[k]&&!layoutGeomEqual(c.layout[k],master[k])){c.layout[k]=clone(master[k]);changed++}});enforceTitleAxis(c.layout)});renderAll();setStatus("类型模板校准完成：修复 "+changed+" 个继承漂移；跳过 "+skipped+" 张锁定卡")};
$("#resetLayout").onclick=function(){recordHistory();current().layout=makeLayout(current().templateId);current().layoutOverrides={};enforceTitleAxis(current().layout);renderPreviewOnly();clearSelection();persist();setStatus("当前卡已恢复主模板；所有模块重新进入继承状态")};
$("#copyLayoutAll").onclick=function(){var c=current(),tid=c.templateId,candidate=masterLayoutSnapshot(tid,c.layout);enforceTitleAxis(candidate);openTemplateImpact(candidate,{templateId:tid,title:"把当前卡排版写回类型模板",beforeApply:function(){c.layoutOverrides={}},successText:"主模板已更新；局部覆盖保持不变"})};
$("#inheritLayout").onchange=function(){var m=selectedModel(current());if(!m||m.type!=="layout")return;recordHistory();if(this.checked){restoreModelFromMaster(m);setStatus(m.label+" 已恢复跟随主模板")}else{setLayoutOverride(current(),m.id,true);setStatus(m.label+" 已设为本卡独立覆盖；后续主模板更新不会改变它")}renderPreviewOnly();refreshElementPanel();persist()};
$("#conditionOp").onchange=function(){var noValue=["always","empty","notEmpty"].indexOf(this.value)>=0;$("#conditionValue").disabled=noValue||this.disabled};
$("#saveCondition").onclick=function(){
  var m=selectedModel(current());if(!m||m.type!=="layout")return;recordHistory();var tid=current().templateId;if(!templateConditions[tid])templateConditions[tid]={};
  var op=$("#conditionOp").value;if(op==="always")delete templateConditions[tid][m.id];else templateConditions[tid][m.id]={field:$("#conditionField").value,op:op,value:$("#conditionValue").value};
  renderPreviewOnly();refreshElementPanel();persist();setStatus(m.label+" 的条件显示规则已保存到 "+TEMPLATES[tid].name+" 主模板");
};
$("#clearCondition").onclick=function(){var m=selectedModel(current());if(!m||m.type!=="layout")return;recordHistory();var tid=current().templateId;if(templateConditions[tid])delete templateConditions[tid][m.id];renderPreviewOnly();refreshElementPanel();persist();setStatus(m.label+" 已恢复为始终显示")};

$("#saveBadgeStyle").onclick=function(){var m=selectedModel(current()),sem=m&&semanticForModel(m);if(!m||m.type!=="layout"||!sem||sem.kind!=="value")return;recordHistory();var tid=current().templateId;if(!templateBadgeStyles[tid])templateBadgeStyles[tid]={};templateBadgeStyles[tid][m.id]={shape:$("#badgeShape").value,icon:$("#badgeIcon").value,showLabel:!!$("#badgeShowLabel").checked,iconPlacement:$("#badgeIconPlacement").value,iconScale:Math.max(.4,Math.min(1.4,num($("#badgeIconScale").value,72)/100)),valueDx:Math.max(-8,Math.min(8,num($("#badgeValueDx").value,0))),valueDy:Math.max(-8,Math.min(8,num($("#badgeValueDy").value,0)))};renderPreviewOnly();refreshElementPanel();persist();setStatus(m.label+" 的数值徽章已保存：数字中心、图标位置与光学校正由当前类型统一控制")};
$("#applyBadgePhysicalSize").onclick=function(){var m=selectedModel(current()),sem=m&&semanticForModel(m);if(!m||m.type!=="layout"||!sem||sem.kind!=="value")return;var wmm=Math.max(3,Math.min(30,num($("#badgeWidthMm").value,m.layout.w/100*CARD_BLEED_W_MM))),hmm=Math.max(3,Math.min(30,num($("#badgeHeightMm").value,m.layout.h/100*CARD_BLEED_H_MM))),tid=current().templateId,master=makeLayout(tid),p=master[m.id];if(!p)return;var cx=p.x+p.w/2,cy=p.y+p.h/2;p.w=precisionRound(wmm/CARD_BLEED_W_MM*100);p.h=precisionRound(hmm/CARD_BLEED_H_MM*100);p.x=precisionRound(cx-p.w/2);p.y=precisionRound(cy-p.h/2);openTemplateImpact(master,{templateId:tid,title:m.label+" · 设置物理尺寸 "+wmm.toFixed(1)+" × "+hmm.toFixed(1)+" mm",successText:m.label+" 物理尺寸已写入类型主模板"})};
$("#resetBadgeStyle").onclick=function(){var m=selectedModel(current());if(!m||m.type!=="layout")return;recordHistory();var tid=current().templateId;if(templateBadgeStyles[tid])delete templateBadgeStyles[tid][m.id];if(current().badgeOffsets)delete current().badgeOffsets[m.id];renderPreviewOnly();refreshElementPanel();persist();setStatus(m.label+" 已恢复默认数值表现")};
function renderLayoutComponents(){
  var box=$("#layoutComponentList");if(!box)return;
  box.innerHTML=layoutComponents.length?layoutComponents.map(function(c){return '<div class="layout-component-item"><div><b>'+esc(c.name)+'</b><small>'+c.items.length+' 个语义对象 · '+esc(c.templateHint||"通用")+'</small></div><div><button data-component-apply="'+c.id+'">应用到本卡</button><button data-component-master="'+c.id+'">写入当前类型主模板</button><button data-component-delete="'+c.id+'">删</button></div></div>'}).join(""):'<div class="empty-note">框选多个标准对象后，可以把它们保存成可复用的布局组件。</div>';
}
$("#saveLayoutComponent").onclick=function(){
  var models=selectedModels(current()).filter(function(m){return m.type==="layout"});if(!models.length){setStatus("请先选择至少一个标准语义对象");return}
  var name=$("#componentName").value.trim()||("布局组件 "+(layoutComponents.length+1));recordHistory();
  layoutComponents.push({id:uid(),name:name,templateHint:TEMPLATES[current().templateId].name,items:models.map(function(m){return {key:m.id,layout:clone(m.layout)}})});
  $("#componentName").value="";renderLayoutComponents();persist();setStatus("已保存语义布局组件："+name);
};
$("#layoutComponentList").onclick=function(e){
  var id=e.target.getAttribute("data-component-apply")||e.target.getAttribute("data-component-master")||e.target.getAttribute("data-component-delete");if(!id)return;var comp=layoutComponents.find(function(x){return x.id===id});if(!comp)return;
  if(e.target.hasAttribute("data-component-delete")){recordHistory();layoutComponents=layoutComponents.filter(function(x){return x.id!==id});renderLayoutComponents();persist();setStatus("已删除布局组件："+comp.name);return}
  var c=current();
  if(e.target.hasAttribute("data-component-master")){var master=makeLayout(c.templateId);comp.items.forEach(function(item){if(master[item.key])master[item.key]=Object.assign({},master[item.key],clone(item.layout))});quantizeLayout(master);enforceTitleAxis(master);openTemplateImpact(master,{templateId:c.templateId,title:"布局组件“"+comp.name+"”写入类型模板",beforeApply:function(){Object.keys(c.layoutOverrides||{}).forEach(function(k){if(comp.items.some(function(i){return i.key===k}))delete c.layoutOverrides[k]})},afterApply:renderLayoutComponents,successText:"组件“"+comp.name+"”已更新对应语义对象"});return}
  recordHistory();var valid=0;comp.items.forEach(function(item){if(!c.layout[item.key])return;c.layout[item.key]=Object.assign({},c.layout[item.key],clone(item.layout));valid++});quantizeLayout(c.layout);enforceTitleAxis(c.layout);comp.items.forEach(function(item){if(c.layout[item.key])setLayoutOverride(c,item.key,true)});setStatus("组件“"+comp.name+"”已应用到本卡，共 "+valid+" 个对象");renderAll();renderLayoutComponents();persist();
};

function snapModelToSemanticAnchor(m,useContent){
  if(!m||m.type!=="layout")return false;var c=current(),anchor=semanticAnchorPoint(c,m.id);if(!anchor)return false;var p=m.layout,dx=0,dy=0;
  if(useContent){var b=semanticBoundsPercent(m);dx=anchor.x-(b.x+b.w/2);dy=anchor.y-(b.y+b.h/2)}else{dx=anchor.x-(p.x+p.w/2);dy=anchor.y-(p.y+p.h/2)}
  if(m.id==="title")dx=useContent?dx:0;setModelPosition(m,p.x+dx,p.y+dy);reconcileModelOverride(m);return true
}
$("#snapSemanticAnchor").onclick=function(){var m=selectedModel(current());if(!m||m.type!=="layout")return;recordHistory();markModelOverride(m);if(snapModelToSemanticAnchor(m,false)){renderPreviewOnly();refreshElementPanel();persist();setStatus(m.label+(templateEditMode?" 已校准并写入类型模板语义锚点":" 已恢复到主模板语义锚点；宽高与文字样式保持不变"))}};
$("#opticalCenterSelected").onclick=function(){var m=selectedModel(current()),sem=m&&semanticForModel(m);if(!m||m.type!=="layout"||!sem||sem.alignBy==="frame")return;recordHistory();markModelOverride(m);if(snapModelToSemanticAnchor(m,true)){renderPreviewOnly();refreshElementPanel();persist();setStatus(m.label+" 已按实际文字 / 数值内容进行光学居中"+(templateEditMode?"，并同步到类型模板":""))}};
$("#resetSelectedLayout").onclick=function(){var m=selectedModel(current());if(!m||m.type!=="layout")return;recordHistory();if(restoreModelFromMaster(m)){renderPreviewOnly();refreshElementPanel();persist();setStatus(m.label+" 已恢复主模板值")}};
function mutableSelectedModels(){return isCardLocked(current())?[]:selectedModels(current()).filter(function(m){return !m.layout.locked})}
function editableSelectedModels(){return mutableSelectedModels().filter(function(m){return m.layout.visible!==false})}
function applySelectionLockState(){
  var c=current(),all=selectedModels(c),locked=isCardLocked(c),writable=mutableSelectedModels().length>0;
  if(locked){$$("#layoutPanel button,#layoutPanel input,#layoutPanel select").forEach(function(el){el.disabled=true})}
  else if(all.length&&!writable){["elX","elY","elW","elH","elR","elZ","elOpacity","elTextOpacity","lockAspect","toggleElementVisibility","layerUp","layerDown","bringFront","sendBack","deleteElement","elementText","elementBinding","addImageLabel","detachImageLabel","imageLabelPosition","inheritLayout","resetSelectedLayout","snapSemanticAnchor","opticalCenterSelected","saveBadgeStyle","applyBadgePhysicalSize","resetBadgeStyle","saveCondition","clearCondition"].forEach(function(id){var el=$("#"+id);if(el)el.disabled=true})}
}
function alignSelection(kind){
  var ms=editableSelectedModels();if(!ms.length){setStatus("请先选择要对齐的模块");return}
  if(ms.length===1){if(kind!=="hcenter"&&kind!=="vcenter"){setStatus("单选时可用“水平居中 / 垂直居中”对齐卡牌中轴；边缘对齐需要至少两个模块");return}var one=ms[0],p=one.layout,nx=p.x,ny=p.y,sem=semanticForModel(one),contentRect=semanticContentRectForModel(one),cardEl=$("#preview .card"),usedContent=false;if(one.type==="layout"&&sem&&sem.alignBy!=="frame"&&contentRect&&cardEl){var cr=cardEl.getBoundingClientRect();if(kind==="hcenter"){nx=p.x+((cr.left+cr.width/2)-(contentRect.left+contentRect.width/2))/cr.width*100;usedContent=true}else{ny=p.y+((cr.top+cr.height/2)-(contentRect.top+contentRect.height/2))/cr.height*100;usedContent=true}}else{if(kind==="hcenter")nx=50-p.w/2;else ny=50-p.h/2}recordHistory();markModelsOverride(ms);setModelPosition(one,nx,ny);renderPreviewOnly();refreshElementPanel();persist();setStatus((usedContent?"已按实际内容":"已按模块")+"精确对齐卡牌"+(kind==="hcenter"?"水平":"垂直")+"中轴");return}
  var boxes=ms.map(function(m){return {m:m,b:semanticBoundsPercent(m)}}),minX=Math.min.apply(null,boxes.map(function(x){return x.b.x})),maxX=Math.max.apply(null,boxes.map(function(x){return x.b.x+x.b.w})),minY=Math.min.apply(null,boxes.map(function(x){return x.b.y})),maxY=Math.max.apply(null,boxes.map(function(x){return x.b.y+x.b.h})),usedContent=boxes.some(function(x){return x.b.content});
  recordHistory();markModelsOverride(ms);
  boxes.forEach(function(x){var m=x.m,p=m.layout,b=x.b,dx=0,dy=0;if(kind==="left")dx=minX-b.x;else if(kind==="hcenter")dx=(minX+maxX)/2-(b.x+b.w/2);else if(kind==="right")dx=maxX-(b.x+b.w);else if(kind==="top")dy=minY-b.y;else if(kind==="vcenter")dy=(minY+maxY)/2-(b.y+b.h/2);else if(kind==="bottom")dy=maxY-(b.y+b.h);setModelPosition(m,p.x+dx,p.y+dy)});
  renderPreviewOnly();refreshElementPanel();persist();setStatus("已按"+(usedContent?"实际内容 / 语义边界":"模块边界")+"对齐 "+ms.length+" 个对象");
}
function distributeSelection(axis){
  var ms=editableSelectedModels();if(ms.length<3){setStatus("至少选择三个未锁定模块才能等距分布");return}var items=ms.map(function(m){return {m:m,b:semanticBoundsPercent(m)}});recordHistory();markModelsOverride(ms);
  if(axis==="h"){items.sort(function(a,b){return a.b.x-b.b.x});var left=items[0].b.x,right=items[items.length-1].b.x+items[items.length-1].b.w,total=items.reduce(function(n,x){return n+x.b.w},0),gap=(right-left-total)/(items.length-1),x=left;items.forEach(function(item){var m=item.m,dx=x-item.b.x;setModelPosition(m,m.layout.x+dx,m.layout.y);x+=item.b.w+gap})}
  else{items.sort(function(a,b){return a.b.y-b.b.y});var top=items[0].b.y,bottom=items[items.length-1].b.y+items[items.length-1].b.h,total=items.reduce(function(n,x){return n+x.b.h},0),gap=(bottom-top-total)/(items.length-1),y=top;items.forEach(function(item){var m=item.m,dy=y-item.b.y;setModelPosition(m,m.layout.x,m.layout.y+dy);y+=item.b.h+gap})}
  renderPreviewOnly();refreshElementPanel();persist();setStatus("已按实际内容 / 语义边界等距分布 "+ms.length+" 个对象");
}
$("#alignLeft").onclick=function(){alignSelection("left")};$("#alignHCenter").onclick=function(){alignSelection("hcenter")};$("#alignRight").onclick=function(){alignSelection("right")};
$("#alignTop").onclick=function(){alignSelection("top")};$("#alignVCenter").onclick=function(){alignSelection("vcenter")};$("#alignBottom").onclick=function(){alignSelection("bottom")};
$("#distributeH").onclick=function(){distributeSelection("h")};$("#distributeV").onclick=function(){distributeSelection("v")};
$("#selectAllLayers").onclick=function(){var refs=allLayerModels(current()).filter(function(m){return m.layout.visible!==false&&!m.layout.locked}).map(function(m){return {type:m.type,id:m.id}});setSelection(refs,refs[refs.length-1]);setStatus("已选择全部可见且未锁定模块")};

// ---------- 3.0 Alpha 10 application shell ----------
function closeTopMenus(except){
  [["projectMenuToggle","projectMenu"],["workspaceMenuToggle","workspaceMenu"]].forEach(function(pair){var btn=$("#"+pair[0]),menu=$("#"+pair[1]);if(!btn||!menu||menu===except)return;menu.hidden=true;btn.setAttribute("aria-expanded","false")})
}
function bindTopMenu(toggleId,menuId){var btn=$("#"+toggleId),menu=$("#"+menuId);if(!btn||!menu)return;btn.onclick=function(e){e.stopPropagation();var open=menu.hidden;closeTopMenus(menu);menu.hidden=!open;btn.setAttribute("aria-expanded",open?"true":"false")};menu.addEventListener("click",function(e){if(e.target.closest("button")){menu.hidden=true;btn.setAttribute("aria-expanded","false")}})}
bindTopMenu("projectMenuToggle","projectMenu");bindTopMenu("workspaceMenuToggle","workspaceMenu");
document.addEventListener("click",function(e){if(!e.target.closest(".menu-shell"))closeTopMenus()});
function setFocusStage(on){document.body.classList.toggle("focus-stage",!!on);var b=$("#focusStage");if(b)b.innerHTML=on?'↙ 退出专注 <kbd>F</kbd>':'⛶ 专注预览 <kbd>F</kbd>';try{localStorage.setItem("card-studio-focus-stage",on?"1":"0")}catch(e){}}
if($("#focusStage"))$("#focusStage").onclick=function(){setFocusStage(!document.body.classList.contains("focus-stage"))};
try{if(localStorage.getItem("card-studio-focus-stage")==="1")setFocusStage(true)}catch(e){}

function isTextEditingTarget(target){
  if(!target)return false;var tag=target.tagName;if(["INPUT","TEXTAREA","SELECT"].indexOf(tag)>=0)return true;
  return !!(target.isContentEditable||(target.closest&&target.closest('[contenteditable="true"]')));
}
window.addEventListener("keydown",function(e){
  if(isTextEditingTarget(e.target)||isTextEditingTarget(document.activeElement))return;
  if(e.key==="Escape"){closeTopMenus();return}
  if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&(e.key==="f"||e.key==="F")){e.preventDefault();setFocusStage(!document.body.classList.contains("focus-stage"));return}
  var mod=e.ctrlKey||e.metaKey;if(mod&&(e.key==="z"||e.key==="Z")){e.preventDefault();if(e.shiftKey)$("#redoBtn").click();else $("#undoBtn").click();return}
  if(mod&&(e.key==="y"||e.key==="Y")){e.preventDefault();$("#redoBtn").click();return}
  if(e.key==="l"||e.key==="L"){e.preventDefault();setLayoutMode(!layoutEditing,true);return}
  var modeKeys={"1":"content","2":"text","3":"layout","4":"visual","5":"rules","6":"export"};if(modeKeys[e.key]){e.preventDefault();setToolMode(modeKeys[e.key]);if(modeKeys[e.key]==="layout"&&!layoutEditing)setLayoutMode(true,false);return}
});
window.addEventListener("keydown",function(e){
  if(!layoutEditing||isTextEditingTarget(e.target)||isTextEditingTarget(document.activeElement))return;if(isCardLocked(current()))return;
  var mod=e.ctrlKey||e.metaKey;if(mod&&(e.key==="a"||e.key==="A")){e.preventDefault();$("#selectAllLayers").click();return}
  if(e.key==="Escape"){e.preventDefault();clearSelection();return}
  if(!selectedElements.length)return;
  if(mod&&(e.key==="d"||e.key==="D")){e.preventDefault();duplicateSelection();return}
  if(e.key==="Delete"||e.key==="Backspace"){e.preventDefault();$("#deleteElement").click();return}
  var ms=editableSelectedModels();if(!ms.length)return;var step=e.altKey?.05:(e.shiftKey?1:.2),used=true;
  if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].indexOf(e.key)>=0){if(!e.repeat){recordHistory();markModelsOverride(ms)}ms.forEach(function(m){var nx=m.layout.x,ny=m.layout.y;if(e.key==="ArrowLeft")nx-=step;else if(e.key==="ArrowRight")nx+=step;else if(e.key==="ArrowUp")ny-=step;else ny+=step;setModelPosition(m,nx,ny)})}
  else if(e.key==="="||e.key==="+"){if(!e.repeat){recordHistory();markModelsOverride(ms)}var sc=e.shiftKey?1.05:1.01,g=selectionBounds(ms);ms.forEach(function(m){m.layout.x=g.x+(m.layout.x-g.x)*sc;m.layout.y=g.y+(m.layout.y-g.y)*sc;m.layout.w*=sc;m.layout.h*=sc;if(m.type==="layout"&&m.id==="title"){m.layout.h=(makeLayout(current().templateId).title||m.layout).h;m.layout.x=(100-m.layout.w)/2;m.layout.r=0}})}
  else if(e.key==="-"){if(!e.repeat){recordHistory();markModelsOverride(ms)}var sc=e.shiftKey?.95:.99,g=selectionBounds(ms);ms.forEach(function(m){m.layout.x=g.x+(m.layout.x-g.x)*sc;m.layout.y=g.y+(m.layout.y-g.y)*sc;m.layout.w*=sc;m.layout.h*=sc;if(m.type==="layout"&&m.id==="title"){m.layout.h=(makeLayout(current().templateId).title||m.layout).h;m.layout.x=(100-m.layout.w)/2;m.layout.r=0}})}
  else if(e.key==="q"||e.key==="Q"||e.key==="e"||e.key==="E"){if(!e.repeat){recordHistory();markModelsOverride(ms)}var dr=(e.key.toLowerCase()==="q"?-1:1)*(e.shiftKey?5:1);ms.forEach(function(m){m.layout.r=(m.layout.r||0)+dr})}
  else if(e.key==="["||e.key==="]"){if(!e.repeat){recordHistory();markModelsOverride(ms)}var dz=e.key==="["?-1:1;ms.forEach(function(m){m.layout.z=Math.max(2,(m.layout.z||20)+dz)})}
  else used=false;
  if(used){e.preventDefault();renderPreviewOnly();refreshElementPanel();persist()}
});
$("#preview").addEventListener("input",function(e){var node=e.target.closest("[data-edit]");if(node)saveInlineCardField(node)});
$("#preview").addEventListener("focusin",function(e){var node=e.target.closest("[data-edit]");if(node)beginInlineCardField(node)});
$("#preview").addEventListener("focusout",function(e){
  if(e.target.closest&&e.target.closest("[data-inline-editing]")){finishInlineCanvasText(false);return}
  var f=e.target&&e.target.getAttribute&&e.target.getAttribute("data-edit");if(f){finishInlineCardField(false);return}
  var n=e.target&&e.target.closest&&e.target.closest(".free-text-element[data-extra-id]");if(n&&n.contentEditable==="true"){var m=getElementModel(current(),n);if(m&&m.type==="extra"){m.element.text=n.innerText.trim();n.contentEditable="false";renderPreviewOnly();refreshElementPanel();persist()}}
});
$("#layerList").addEventListener("click",function(e){var row=e.target.closest("[data-layer-id]");if(!row)return;setLayoutMode(true,false);var ref={type:row.getAttribute("data-layer-type"),id:row.getAttribute("data-layer-id")};if(e.ctrlKey||e.metaKey)toggleSelection(ref);else if(e.shiftKey)addSelection(ref);else setSelection([ref],ref);var m=modelFromRef(current(),ref);if(!m)return;if(e.target.closest("[data-layer-eye]")){if(isCardLocked(current())||m.layout.locked){setStatus("卡牌或图层已锁定，显示状态保持不变");return}recordHistory();markModelOverride(m);m.layout.visible=m.layout.visible===false?true:false;renderPreviewOnly();refreshElementPanel();persist();return}if(e.target.closest("[data-layer-lock]")){if(isCardLocked(current())){setStatus("当前卡牌已锁定，图层保持只读");return}recordHistory();m.layout.locked=!m.layout.locked;renderPreviewOnly();refreshEditLock();persist();return}applySelectionClasses();refreshElementPanel()});
$("#cardList").addEventListener("click",function(e){var b=e.target.closest("[data-id]");if(!b)return;selected=b.getAttribute("data-id");selectedElements=[];selectedElement=null;renderAll()});
$("#projectName").addEventListener("change",function(){projectName=this.value.trim()||"未命名卡牌项目";this.value=projectName;persist()});
$("#cardSetSelect").addEventListener("change",function(){var c=current();if(isCardLocked(c)){renderCard();return}recordHistory();c.setId=this.value||"";var set=projectSetById(c.setId);c.setName=set?set.name:"";renderCard();renderList();renderProjectSummary();persist();setStatus(set?("已归入扩展包："+set.name):"已取消扩展包归属")});
$("#cardSearch").addEventListener("input",renderList);$("#templateFilter").addEventListener("change",renderList);$("#factionFilter").addEventListener("change",renderList);$("#rarityFilter").addEventListener("change",renderList);$("#sortCards").addEventListener("change",renderList);
$$("[data-form]").forEach(function(el){
  el.addEventListener("focus",recordHistory);
  el.addEventListener("change",function(){patch(el.getAttribute("data-form"),el.value,false)});
  el.addEventListener("input",function(){
    var c=current(),f=el.getAttribute("data-form");if(!editableCardField(c,f)){renderCard();return;}
    c[f]=["cost","attack","health","move","range"].indexOf(f)>=0?num(el.value,0):el.value;
    renderPreviewOnly();renderList();persist();
  });
});
$("#dynamicStats").addEventListener("focusin",function(e){if(e.target.getAttribute("data-stat"))recordHistory()});
$("#dynamicStats").addEventListener("change",function(e){var f=e.target.getAttribute("data-stat");if(f)patch(f,e.target.value,false)});
$("#dynamicStats").addEventListener("input",function(e){var f=e.target.getAttribute("data-stat");if(f){if(!editableCardField(current(),f)){renderCard();return;}current()[f]=num(e.target.value,0);renderPreviewOnly();renderList();persist()}});
$("#description").addEventListener("focus",recordHistory);
$("#description").addEventListener("change",function(){patch("description",this.value,false)});
$("#description").addEventListener("input",function(){if(!editableCardField(current(),"description")){renderCard();return;}current().description=this.value;renderPreviewOnly();persist()});
function renderVariableButtons(){
  var box=$("#variables");if(!box)return;box.innerHTML="";
  Object.keys(vars).forEach(function(v){var b=document.createElement("button");b.textContent="{"+fieldDisplayName(vars[v],v)+"}";b.title="插入字段："+fieldDisplayName(vars[v],v);b.onclick=function(){patch("description",(current().description||"")+"{"+v+"}",true)};box.appendChild(b)});
  schemaForCard(current()).forEach(function(f){var b=document.createElement("button");b.textContent="{"+f.key+"}";b.title=f.label+" · 自定义字段";b.onclick=function(){patch("description",(current().description||"")+"{"+f.key+"}",true)};box.appendChild(b)});
}
renderVariableButtons();
$("#customFieldInputs").addEventListener("focusin",function(e){if(e.target.getAttribute("data-custom-field"))recordHistory()});
$("#customFieldInputs").addEventListener("input",function(e){var key=e.target.getAttribute("data-custom-field");if(!key)return;if(isCardLocked(current())){renderCard();return;}var def=fieldDefByKey(key);if(!def)return;var value=def.type==="boolean"?!!e.target.checked:def.type==="number"?num(e.target.value,0):e.target.value;current().customFields[key]=value;renderPreviewOnly();renderList();persist()});
$("#customFieldInputs").addEventListener("change",function(e){var key=e.target.getAttribute("data-custom-field");if(!key)return;if(isCardLocked(current())){renderCard();return;}var def=fieldDefByKey(key);if(!def)return;var value=def.type==="boolean"?!!e.target.checked:def.type==="number"?num(e.target.value,0):e.target.value;current().customFields[key]=value;renderPreviewOnly();persist()});

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
  $("#termAliases").value=Array.isArray(term&&term.aliases)?term.aliases.join(","):(term&&term.aliases||"");$("#termExample").value=term&&term.example||"";$("#termDesignNotes").value=term&&term.designNotes||"";
  var usage=term?cardsUsingTerm(term.name):[];$("#termUsage").innerHTML=term?'<b>使用 '+usage.length+' 张卡牌</b><div class="usage-cards">'+usage.slice(0,20).map(function(c){return '<button data-term-card="'+c.id+'">'+esc(c.cardNumber?c.cardNumber+" · "+c.name:c.name)+'</button>'}).join("")+'</div>':"新建词条后，可在这里查看哪些卡牌使用了它。";
  $("#deleteRuleTerm").disabled=!term;$("#insertRuleTerm").disabled=!term;
}
function renderRuleTermLibrary(){
  var q=$("#termSearch").value.trim().toLowerCase(),list=ruleTerms.filter(function(t){return !q||[t.name,t.category,t.tags,t.description,(t.aliases||[]).join(" "),t.example,t.designNotes].join(" ").toLowerCase().indexOf(q)>=0}).sort(function(a,b){return String(a.category||"").localeCompare(String(b.category||""),"zh-CN")||String(a.name).localeCompare(String(b.name),"zh-CN")});
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
function insertDescriptionRawToken(token){
  var ta=$("#description"),text=ta.value,start=ta.selectionStart,end=ta.selectionEnd;recordHistory();ta.value=text.slice(0,start)+token+text.slice(end);current().description=ta.value;renderPreviewOnly();persist();ta.focus();ta.setSelectionRange(start+token.length,start+token.length);
}
function renderInlineIconPalette(){
  var sel=$("#customInlineIcon");if(!sel)return;var old=sel.value;var icons=userAssets.filter(function(a){return assetHasRole(a,"icon")});sel.innerHTML='<option value="">自定义图标…</option>'+icons.map(function(a){return '<option value="'+esc(a.id)+'">'+esc(a.name||a.id)+'</option>'}).join("");if(icons.some(function(a){return a.id===old}))sel.value=old;
}
$("#inlineIconPalette").onclick=function(e){var stat=e.target.closest("[data-insert-stat]");if(stat){insertDescriptionRawToken("{{stat:"+stat.getAttribute("data-insert-stat")+"}}");setStatus("已插入实时数值单元：图标与数值会一起更新且不会拆行");return}var b=e.target.closest("[data-insert-icon]");if(!b)return;insertDescriptionRawToken("{{icon:"+b.getAttribute("data-insert-icon")+"}}");setStatus("已插入卡牌语义图标")};
$("#ruleStructureToolbar").onclick=function(e){var b=e.target.closest("[data-rule-block]");if(!b)return;var type=b.getAttribute("data-rule-block"),ta=$("#description"),start=ta.selectionStart,end=ta.selectionEnd,selectedText=ta.value.slice(start,end),prefix="["+type+"] ";recordHistory();ta.value=ta.value.slice(0,start)+prefix+selectedText+ta.value.slice(end);current().description=ta.value;renderPreviewOnly();persist();ta.focus();ta.setSelectionRange(start+prefix.length,start+prefix.length+selectedText.length);setStatus("已插入规则结构："+type)};
$("#insertCustomInlineIcon").onclick=function(){var id=$("#customInlineIcon").value;if(!id){setStatus("请先选择一个自定义卡面图标");return}insertDescriptionRawToken("{{icon:"+id+"}}");var a=assetById(id);setStatus("已插入自定义图标："+(a?a.name:id))};
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
function normalizeSharedGlossaryPayload(raw){return window.CARDSTUDIO_GLOSSARY.normalizePack(raw).terms}
function mergeSharedGlossaryTerms(incoming,selectedRows){
  var lockedNames=[];cards.filter(isCardLocked).forEach(function(c){lockedNames.push.apply(lockedNames,extractRuleTerms(c.description))});
  var rows=window.CARDSTUDIO_GLOSSARY.planMerge(ruleTerms,incoming,lockedNames),selected=selectedRows==null?new Set(rows.map(function(r,i){return r.kind==="new"?i:-1}).filter(function(i){return i>=0})):new Set(selectedRows),changed=0,added=0,renamed=0;
  rows.forEach(function(row,index){if(!selected.has(index)||row.kind==="blocked"||row.kind==="same")return;var t=row.term,hit=row.existing&&ruleTerms.find(function(x){return x.id===row.existing.id});if(hit){var oldName=hit.name;if(oldName!==t.name){cards.forEach(function(c){if(!isCardLocked(c))c.description=String(c.description||"").split("[["+oldName+"]]").join("[["+t.name+"]]")});renamed++}Object.assign(hit,t,{id:hit.id});changed++}else{ruleTerms.push(t);added++}});return {added:added,changed:changed,renamed:renamed};
}
function exportSharedGlossaryFile(){var payload=window.CARDSTUDIO_GLOSSARY.normalizePack({schema:"cardstudio-glossary-v1",version:1,publishedAt:new Date().toISOString(),source:"CardStudio Studio",terms:ruleTerms});downloadText(JSON.stringify(payload),"shared-glossary.json","application/json;charset=utf-8");setStatus("已导出包含完整设计的两版通用词条库")}
$("#exportSharedGlossary").onclick=exportSharedGlossaryFile;
$("#importSharedGlossary").onclick=function(){$("#sharedGlossaryFile").click()};
$("#sharedGlossaryFile").onchange=async function(){var file=this.files&&this.files[0];this.value="";if(!file)return;try{if(file.size>5*1024*1024)throw new Error("词条文件超过 5MB");var incoming=normalizeSharedGlossaryPayload(JSON.parse(await file.text()));if(!incoming.length)throw new Error("词条库为空");window.previewSharedGlossary(incoming)}catch(err){setStatus("共享词条导入失败："+(err&&err.message||err))}};

$("#insertKnownTerm").onclick=function(){if(!ruleTerms.length){openTermLibrary();setStatus("词条库还是空的，请先建立一个规则词条");return}openTermLibrary()};
$("#autoMarkTerms").onclick=function(){var before=current().description,after=autoMarkKnownTerms(before);if(after===before){setStatus("当前效果中没有发现尚未标记的已知词条");return}recordHistory();current().description=after;$("#description").value=after;renderPreviewOnly();persist();setStatus("已自动识别当前卡牌中的规则词条")};
$("#autoMarkAllCards").onclick=function(){if(!ruleTerms.length)return;recordHistory();var changed=0;cards.forEach(function(c){if(isCardLocked(c))return;var x=autoMarkKnownTerms(c.description);if(x!==c.description){c.description=x;changed++}});renderAll();renderRuleTermLibrary();setStatus("已自动识别 "+changed+" 张卡牌中的规则词条")};
$("#openRuleTerms").onclick=function(){openTermLibrary()};$("#openRuleTermsRules").onclick=function(){openTermLibrary()};
$("#closeRuleTerms").onclick=function(){$("#ruleTermsModal").hidden=true};
$("#ruleTermsModal").addEventListener("click",function(e){if(e.target===this)this.hidden=true});
$("#termSearch").addEventListener("input",renderRuleTermLibrary);
$("#newRuleTerm").onclick=function(){fillTermEditor(null);renderRuleTermLibrary();$("#termName").focus()};
$("#termList").onclick=function(e){var b=e.target.closest("[data-term-id]");if(!b)return;var t=ruleTerms.find(function(x){return x.id===b.getAttribute("data-term-id")});if(t){fillTermEditor(t);renderRuleTermLibrary()}};
$("#saveRuleTerm").onclick=function(){
  var name=$("#termName").value.trim();if(!name){setStatus("词条名称不能为空");return}var duplicate=ruleTerms.find(function(x){return x.id!==selectedRuleTermId&&String(x.name).toLowerCase()===name.toLowerCase()});if(duplicate){setStatus("已经存在同名词条："+duplicate.name);return}var old=ruleTerms.find(function(x){return x.id===selectedRuleTermId}),oldName=old&&old.name;
  if(oldName&&oldName!==name&&cardsUsingTerm(oldName).some(isCardLocked)){setStatus("锁定卡仍引用原词条，不能重命名；请先解锁或保留原名称");return}
  var design;try{design=window.CARDSTUDIO_GLOSSARY.normalizeTerm({id:old&&old.id||uid(),name:name,color:$("#termColor").value,category:$("#termCategory").value.trim(),tags:$("#termTags").value.trim(),description:$("#termDescription").value,aliases:$("#termAliases").value,example:$("#termExample").value,designNotes:$("#termDesignNotes").value})}catch(err){setStatus(err.message);return}
  recordHistory();var term=old||{id:design.id};Object.assign(term,design);term.name=name;term.color=$("#termColor").value;term.category=$("#termCategory").value.trim();term.tags=$("#termTags").value.trim();term.description=$("#termDescription").value.trim();if(!old)ruleTerms.push(term);
  if(oldName&&oldName!==name){var from="[["+oldName+"]]",to="[["+name+"]]";cards.forEach(function(c){c.description=String(c.description||"").split(from).join(to)})}
  selectedRuleTermId=term.id;renderAll();fillTermEditor(term);renderRuleTermLibrary();setStatus("词条已保存："+name);
};
$("#deleteRuleTerm").onclick=function(){var term=ruleTerms.find(function(x){return x.id===selectedRuleTermId});if(!term)return;if(cardsUsingTerm(term.name).some(isCardLocked)){setStatus("锁定卡仍引用此词条，不能删除；请先解锁");return}recordHistory();var token="[["+term.name+"]]";cards.forEach(function(c){c.description=String(c.description||"").split(token).join(term.name)});ruleTerms=ruleTerms.filter(function(x){return x.id!==term.id});selectedRuleTermId=null;renderAll();fillTermEditor(ruleTerms[0]||null);renderRuleTermLibrary();setStatus("词条已删除，卡牌中的引用已转为普通文字")};
$("#insertRuleTerm").onclick=function(){var term=ruleTerms.find(function(x){return x.id===selectedRuleTermId});if(!term)return;insertDescriptionToken(term.name);$("#ruleTermsModal").hidden=true;setStatus("已插入词条："+term.name)};
$("#termUsage").onclick=function(e){var b=e.target.closest("[data-term-card]");if(!b)return;selected=b.getAttribute("data-term-card");$("#ruleTermsModal").hidden=true;renderAll();setStatus("已定位使用该词条的卡牌："+current().name)};
$("#preview").addEventListener("dblclick",function(e){var span=e.target.closest(".rule-term");if(!span)return;var term=termByName(span.getAttribute("data-rule-term"));if(term)openTermLibrary(term)});
$("#preview").addEventListener("dblclick",function(e){if(!layoutEditing)return;var node=e.target.closest(".free-image-element");if(!node)return;e.preventDefault();selectLayoutNode(node);addLabelToSelectedImage()});
$("#textTarget").addEventListener("change",refreshTextControls);
$("#textSize").addEventListener("change",function(){setTextStyleValue("size",Math.max(8,Math.min(40,num(this.value,13))),true)});
$("#textColor").addEventListener("change",function(){setTextStyleValue("color",this.value,true)});
$("#textAlign").addEventListener("change",function(){setTextStyleValue("align",this.value,true)});
$("#textBold").addEventListener("change",function(){setTextStyleValue("bold",this.checked,true)});
var strokeEditing=false;
$("#textStroke").addEventListener("input",function(){var value=clamp(Number(this.value)||0,0,100)/100*1.2;setTextStyleValue("strokePx",value,!strokeEditing);strokeEditing=true});
["change","blur"].forEach(function(event){$("#textStroke").addEventListener(event,function(){strokeEditing=false})});
$("#textFont").addEventListener("change",function(){setTextStyleValue("fontStyle",this.value,true)});
$("#clearTextOverride").onclick=function(){
  var targets=textControlTargets().filter(function(t){var p=t.type==="layout"?current().layout[t.key]:t.element.layout;return !p||!p.locked});if(!targets.length)return;recordHistory();var c=current(),a=normalizeAppearance(c.appearance);
  targets.forEach(function(t){if(t.type==="layout"){if(c.textStyles)delete c.textStyles[t.key]}else{t.element.fontSize=11;t.element.color=a.text;t.element.align="left";t.element.bold=false;t.element.strokePx=0;t.element.fontStyle=""}});
  renderPreviewOnly();refreshTextControls();persist();setStatus("已恢复所选文字模块的默认样式");
};
$("#applyTextAll").onclick=function(){
  var targets=textControlTargets().filter(function(t){return t.type==="layout"});if(!targets.length){setStatus("自定义文字没有跨卡牌对应模块；请选择名称、系别、攻击等固定文字模块");return}recordHistory();var source=current();
  targets.forEach(function(t){var style=clone(textStyleFor(source,t.key,normalizeAppearance(source.appearance)));cards.forEach(function(c){if(isCardLocked(c))return;if(!c.textStyles)c.textStyles={};c.textStyles[t.key]=clone(style)})});
  renderAll();setStatus("已把 "+targets.length+" 个文字模块的样式应用到未锁定卡牌");
};

$("#templateCards").addEventListener("click",function(e){var b=e.target.closest("[data-template]");if(b)setTemplate(b.getAttribute("data-template"))});
$("#presetShowcase").onclick=function(){recordHistory();applyCompositionPreset("showcase")};
$("#presetClassicFrame").onclick=function(){recordHistory();applyCompositionPreset("classic")};
$("#setDefaultCard").onclick=function(){var c=current();if(!c)return;recordHistory();KadiLayout.captureDefault({cards:cards,projectDesign:projectDesign,templateBadgeStyles:templateBadgeStyles},c,TEMPLATES);renderAll();persist();setStatus("已设为唯一默认："+TEMPLATES[c.templateId].name+" · "+c.name+"。以后新建沿用此格式；修改后可点“更新唯一默认”。")};
$("#newCard").onclick=function(){recordHistory();var saved=KadiLayout.creationDefault({projectDesign:projectDesign},TEMPLATES),source=current(),c=makeCard(saved?undefined:source.templateId);if(!saved){c.cardKind=source.cardKind||"unit";c.appearance=clone(source.appearance);Object.keys(IMAGE_ROLE_FIELDS).forEach(function(k){if(c.appearance[IMAGE_ROLE_FIELDS[k]]&&source.layout[k]){c.layout[k]=clone(source.layout[k]);c.layoutOverrides[k]=true}});c.imageLayerDefaults=clone(source.imageLayerDefaults||{});c.setId=source.setId||"";c.setName=setDisplayName(source)}c=normalizeCard(c);cards.push(c);selected=c.id;renderAll();persist();setStatus(saved?"已按默认格式创建"+TEMPLATES[c.templateId].name:"已创建"+TEMPLATES[c.templateId].name)};
$("#duplicate").onclick=function(){recordHistory();var c=clone(current());c.id=uid();c.name=current().name+" - 副本";c.familyId="";c.variantKind="标准";c.variantOf="";c.workflowStatus="设计中";c.releaseLocked=false;cards.push(c);selected=c.id;renderAll();setStatus("已复制为独立卡牌；不会误继承原卡家族")};
$("#delete").onclick=function(){if(cards.length<=1)return;if(isCardLocked(current())){setStatus("已锁定卡牌不能直接删除");return}recordHistory();var removed=selected;cards=cards.filter(function(c){return c.id!==removed});playtests=playtests.filter(function(x){return x.cardId!==removed});cardFamilies.forEach(function(f){if(f.baseCardId===removed){var m=cardFamilyMembers(f.id);f.baseCardId=m[0]?m[0].id:""}});ensureFamilyIntegrity();selected=cards[0].id;renderAll();setStatus("已删除卡牌及其测试记录")};

$("#undoBtn").onclick=function(){if(!history.length)return;future.push(stateSnapshot());var prev=history.pop();restoreState(prev);persist();setStatus("已撤销")};
$("#redoBtn").onclick=function(){if(!future.length)return;history.push(stateSnapshot());var next=future.pop();restoreState(next);persist();setStatus("已重做")};

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
      c.unitType=String(pick(r,["unitType","种族","兵种","类型","法术类型","建筑类型","事件类型"],TEMPLATES[tid].short));
      c.rarity=String(pick(r,["rarity","稀有度"],"普通"));c.workflowStatus=String(pick(r,["workflowStatus","生产状态","状态"],"设计中"));c.setName=String(pick(r,["setName","系列","系列名"],""));c.year=String(pick(r,["year","年份"],""));c.credit=String(pick(r,["credit","署名","作者"],""));c.tags=String(pick(r,["tags","关键词","标签"],""));c.rulesKeywords=String(pick(r,["rulesKeywords","规则关键词","规则标签"],""));c.cardNumber=String(pick(r,["cardNumber","编号","卡号","ID"],""));c.art=String(pick(r,["art","插画","图片","背景"],""));c.artPrompt=String(pick(r,["artPrompt","插画关键词","插画提示词","画面要求"],""));
      schemaForCard(c).forEach(function(f){var raw=pick(r,[f.key,f.label],f.defaultValue);if(raw===undefined||raw===null)return;if(f.type==="number")c.customFields[f.key]=num(raw,0);else if(f.type==="boolean")c.customFields[f.key]=raw===true||String(raw).toLowerCase()==="true"||String(raw)==="1"||String(raw)==="是";else c.customFields[f.key]=String(raw)});
      c.appearance=clone(current().appearance);return c;
    }).filter(function(c){return c.name});
    if(!imported.length)throw new Error("没有读取到卡牌数据");
    fieldSchema.filter(function(f){return f.type==="cardRef"}).forEach(function(f){imported.forEach(function(c){var raw=String(c.customFields[f.key]||"").trim();if(!raw)return;var target=imported.find(function(x){return x.id===raw||x.cardNumber===raw||x.name===raw});if(target)c.customFields[f.key]=target.id})});
    imported.forEach(function(c){if(c.art&&String(c.art).indexOf("data:image/")===0)assignCardArt(c,c.art,(c.name||"卡牌")+" · 导入插画")});
    recordHistory();cards=imported;ensureSetCatalogFromCards();ensureFamilyIntegrity();selected=cards[0].id;renderAll();setStatus("已导入 "+cards.length+" 张卡牌，并建立扩展包目录");
  }catch(err){setStatus("导入失败："+(err.message||"未知错误"))}
  this.value="";
};

$("#uploadArt").onclick=function(){$("#artFile").click()};
$("#artFile").onchange=async function(){var file=this.files&&this.files[0];if(!file)return;try{var data=await fileToDataUrl(file),im=await imageFromDataUrl(data);recordHistory();assignCardArt(current(),data,file.name,{width:im.naturalWidth,height:im.naturalHeight});renderAll();setStatus("插画已进入统一资产库："+im.naturalWidth+" × "+im.naturalHeight+" px；已记录真实像素供 DPI 检查")}catch(e){setStatus("插画导入失败："+e.message)}this.value=""};
$("#clearArt").onclick=function(){patch("art","",true)};
$("#aiStyle").value=aiStyle;
function detectAiStylePreset(v){var keys=Object.keys(AI_STYLE_PRESETS);for(var i=0;i<keys.length;i++)if(AI_STYLE_PRESETS[keys[i]]===v)return keys[i];return "custom"}
$("#aiStylePreset").value=detectAiStylePreset(aiStyle);
function buildAiPrompt(mode){
  var c=current(),t=cardTemplate(c),scene=$("#aiPrompt").value.trim(),style=$("#aiStyle").value.trim();
  var lines=[
    mode==="redraw"?"请以我随后提供的现有插画为基础进行重绘，保持主体身份和主要构图，除非下面要求明确改变。":"请生成一张全新的竖版桌游收藏卡插画，只生成插画本身。",
    "画布比例约为 0.73 宽高比，适合作为卡牌满版背景。",
    "顶部约 16% 保持较低细节和较稳定明度，给标题、费用与图标留出安全区；底部约 27% 保持较低干扰和较稳定明暗，给规则文字留出安全区。",
    "主体必须有清晰剪影、明确动作和视觉焦点；不要把脸、武器尖端或关键叙事细节放进文字安全区。",
    "禁止生成任何文字、字母、数字、Logo、水印、卡牌边框、徽章、UI 或伪游戏文字。",
    "卡牌名称："+c.name,
    "卡牌类型："+t.name,
    "系别 / 阵营："+c.faction,
    "游戏类型字段："+c.unitType,
    style?"统一画风："+style:"",
    scene?"本张画面要求："+scene:"",
    c.description?"规则语义参考（只用于理解氛围，不要把文字画出来）："+resolveVars(c.description,c):""
  ].filter(Boolean);
  return lines.join("\n");
}
function refreshAiPromptPreview(){var box=$("#aiPromptPreview");if(box)box.value=buildAiPrompt("generate")}
async function copyPrompt(mode){
  var text=buildAiPrompt(mode),box=$("#aiPromptPreview");if(box)box.value=text;
  try{if(navigator.clipboard&&navigator.clipboard.writeText)await navigator.clipboard.writeText(text);else throw new Error("clipboard unavailable")}
  catch(e){var ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove()}
  setStatus(mode==="redraw"?"重绘提示词已复制":"生图提示词已复制");
}
$("#aiStylePreset").addEventListener("change",function(){if(this.value==="custom")return;$("#aiStyle").value=AI_STYLE_PRESETS[this.value];aiStyle=AI_STYLE_PRESETS[this.value];refreshAiPromptPreview();persist();setStatus("已切换整套画风："+this.options[this.selectedIndex].text)});
$("#aiStyle").addEventListener("input",function(){aiStyle=this.value;$("#aiStylePreset").value=detectAiStylePreset(this.value);refreshAiPromptPreview()});
$("#aiStyle").addEventListener("change",persist);
$("#aiPrompt").addEventListener("focus",recordHistory);$("#aiPrompt").addEventListener("input",function(){current().artPrompt=this.value;refreshAiPromptPreview();persist()});
$("#resetAiStyle").onclick=function(){$("#aiStyle").value=DEFAULT_AI_STYLE;$("#aiStylePreset").value="premium";aiStyle=DEFAULT_AI_STYLE;refreshAiPromptPreview();persist();setStatus("已恢复高端幻想卡牌默认风格")};
$("#copyAiPrompt").onclick=function(){copyPrompt("generate")};$("#copyRedrawPrompt").onclick=function(){copyPrompt("redraw")};

// ---------- 3.0 Beta 4 external AI image bridge ----------
function aiProviderInfo(id){return aiProviders.find(function(x){return x.id===id})||null}
function setAiProviderStatus(textValue,quality){var el=$("#aiProviderStatus"),dot=$("#aiProviderDot");if(el)el.textContent=textValue||"";if(dot){dot.className="ai-provider-dot"+(quality?(" "+quality):"")}}
function aiBusy(busy){["#aiGenerateArt","#aiRedrawArt","#saveAiSessionKey","#clearAiSessionKey"].forEach(function(q){var el=$(q);if(el)el.disabled=!!busy});if($("#aiCancelGenerate"))$("#aiCancelGenerate").hidden=!busy}
async function aiJson(path,options){var response=await fetch(path,options||{}),body=null;try{body=await response.json()}catch(e){}if(!response.ok||!body||body.ok===false)throw new Error(body&&body.error?body.error:("请求失败：HTTP "+response.status));return body}
function renderAiProviderControls(){
  var provider=$("#aiProvider")?$("#aiProvider").value:aiProviderPreference,info=aiProviderInfo(provider),remote=provider==="openai"||provider==="stability",comfy=provider==="comfyui",manual=provider==="manual",busy=!!aiRequestController,ready=manual||(info&&info.configured);
  if($("#aiKeyRow"))$("#aiKeyRow").hidden=!remote;if($("#aiComfyDetails"))$("#aiComfyDetails").hidden=!comfy;if($("#aiNegativePromptWrap"))$("#aiNegativePromptWrap").hidden=!(provider==="stability"||comfy);
  if($("#aiGeneratePreset"))$("#aiGeneratePreset").disabled=comfy||manual||busy;if($("#aiGenerateArt"))$("#aiGenerateArt").disabled=manual||!ready||busy;if($("#aiRedrawArt"))$("#aiRedrawArt").disabled=provider!=="openai"||!ready||!hasCardArt(current())||busy;
  if(manual)setAiProviderStatus("仅生成提示词，不连接外部服务","manual");
  else if(comfy)setAiProviderStatus((info&&info.note)||"ComfyUI 本地工作流；无需 API Key",info&&info.configured?"ready":"warn");
  else if(info&&info.configured)setAiProviderStatus(info.name+" · 已连接"+(info.keySource==="environment"?"（环境变量）":"（本次会话）"),"ready");
  else setAiProviderStatus((info?info.name:"外置 AI")+" · 尚未配置 API Key","warn");
}
async function loadAiProviders(){try{var out=await aiJson("/api/ai/providers");aiProviders=out.providers||[];var select=$("#aiProvider");if(select&&Array.from(select.options).some(function(x){return x.value===aiProviderPreference}))select.value=aiProviderPreference;if($("#aiGeneratePreset"))$("#aiGeneratePreset").value=["draft","standard","final"].indexOf(aiGeneratePresetPreference)>=0?aiGeneratePresetPreference:"standard";if($("#aiComfyWorkflow"))$("#aiComfyWorkflow").value=aiComfyWorkflow;renderAiProviderControls()}catch(e){setAiProviderStatus("本机 AI 接入层不可用："+e.message,"bad")}}
function resetAiGeneratedCandidate(){aiGeneratedCandidate=null;if($("#aiGeneratedResult"))$("#aiGeneratedResult").hidden=true;if($("#aiGeneratedPreview"))$("#aiGeneratedPreview").removeAttribute("src")}
async function requestAiImage(mode){
  var provider=$("#aiProvider").value;if(provider==="manual"){await copyPrompt(mode==="edit"?"redraw":"generate");return}
  if(mode==="edit"&&provider!=="openai"){setStatus("当前第一版外置重绘仅支持 OpenAI；可先生成新图或继续复制重绘提示词");return}
  if(mode==="edit"&&!hasCardArt(current())){setStatus("当前卡牌还没有插画，无法执行基于现图重绘");return}
  var promptText=buildAiPrompt(mode==="edit"?"redraw":"generate"),workflow=$("#aiComfyWorkflow")?$("#aiComfyWorkflow").value.trim():"";
  if(provider==="comfyui"&&!workflow){setStatus("ComfyUI：请先导入 API 格式工作流 JSON");$("#aiComfyDetails").open=true;return}
  var body={provider:provider,prompt:promptText,preset:$("#aiGeneratePreset").value,negativePrompt:$("#aiNegativePrompt").value.trim(),workflow:provider==="comfyui"?workflow:undefined};
  if(mode==="edit")body.sourceDataUrl=cardArtData(current());
  resetAiGeneratedCandidate();aiRequestController=new AbortController();aiBusy(true);setAiProviderStatus("正在生成 · 请保持 CardStudio 打开","busy");setStatus(mode==="edit"?"正在请求外置 AI 重绘当前插画……":"正在请求外置 AI 生成卡牌插画……");
  var started=Date.now(),sourceCard=current(),sourceCardId=sourceCard.id,sourceCardName=sourceCard.name;
  try{var out=await aiJson(mode==="edit"?"/api/ai/edit":"/api/ai/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:aiRequestController.signal});aiGeneratedCandidate={cardId:sourceCardId,cardName:sourceCardName,dataUrl:out.dataUrl,provider:out.provider||provider,model:out.model||"",quality:out.quality||"",requestId:out.requestId||"",seed:out.seed||0,prompt:promptText};$("#aiGeneratedPreview").src=out.dataUrl;$("#aiGeneratedInfo").textContent=sourceCardName+" · "+((aiProviderInfo(provider)||{}).name||provider)+" · "+(out.model||"模型")+" · "+((out.elapsedMs||Date.now()-started)/1000).toFixed(1)+" 秒"+(out.seed?(" · Seed "+out.seed):"");$("#aiGeneratedResult").hidden=false;setStatus("AI 插画已生成；先预览，确认后再写入「"+sourceCardName+"」")}
  catch(e){if(e&&e.name==="AbortError"){setStatus("已取消本地等待；外部生成任务如果已经提交，仍可能继续并产生费用")}else{setStatus("AI 生图失败："+e.message);setAiProviderStatus("生成失败 · "+e.message,"bad")}}
  finally{aiRequestController=null;aiBusy(false);renderAiProviderControls()}
}
$("#aiProvider").onchange=function(){aiProviderPreference=this.value;try{localStorage.setItem("card-studio-ai-provider",this.value)}catch(e){}resetAiGeneratedCandidate();renderAiProviderControls()};
$("#aiGeneratePreset").onchange=function(){aiGeneratePresetPreference=this.value;try{localStorage.setItem("card-studio-ai-preset",this.value)}catch(e){}};
$("#saveAiSessionKey").onclick=async function(){var provider=$("#aiProvider").value,key=$("#aiSessionKey").value.trim();if(!key){setStatus("请先粘贴 API Key");return}this.disabled=true;try{await aiJson("/api/ai/session-key",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({provider:provider,key:key})});$("#aiSessionKey").value="";await loadAiProviders();setStatus("已建立本次运行的 "+((aiProviderInfo(provider)||{}).name||provider)+" 连接；密钥不会写入项目文件") }catch(e){setStatus("AI 连接失败："+e.message)}this.disabled=false};
$("#clearAiSessionKey").onclick=async function(){var provider=$("#aiProvider").value;try{await aiJson("/api/ai/session-key",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({provider:provider,key:""})});$("#aiSessionKey").value="";await loadAiProviders();setStatus("已清除本次运行中的 AI 密钥") }catch(e){setStatus("清除密钥失败："+e.message)}};
$("#aiGenerateArt").onclick=function(){requestAiImage("generate")};$("#aiRedrawArt").onclick=function(){requestAiImage("edit")};
$("#aiCancelGenerate").onclick=function(){if(aiRequestController)aiRequestController.abort()};
$("#aiDiscardGenerated").onclick=function(){resetAiGeneratedCandidate();setStatus("已放弃本次生成结果，没有修改卡牌")};
$("#aiApplyGenerated").onclick=async function(){if(!aiGeneratedCandidate)return;var target=cards.find(function(c){return c.id===aiGeneratedCandidate.cardId});if(!target){setStatus("这张 AI 候选图对应的原卡牌已经不存在");return}if(current().id!==target.id){setStatus("这张候选图属于「"+target.name+"」；请先切回该卡牌再确认使用");return}if(isCardLocked(target)){setStatus("当前卡牌已锁定，不能写入 AI 插画；候选图仍保留在预览中");return}try{var im=await imageFromDataUrl(aiGeneratedCandidate.dataUrl);recordHistory();assignCardArt(target,aiGeneratedCandidate.dataUrl,(target.name||"卡牌")+" · AI 插画",{width:im.naturalWidth,height:im.naturalHeight,source:"ai",aiProvider:aiGeneratedCandidate.provider,aiModel:aiGeneratedCandidate.model,aiQuality:aiGeneratedCandidate.quality,generatedAt:new Date().toISOString()});resetAiGeneratedCandidate();renderAll();setStatus("AI 插画已写入「"+target.name+"」并进入 Asset Store："+im.naturalWidth+" × "+im.naturalHeight+" px")}catch(e){setStatus("使用 AI 插画失败："+e.message)}};
$("#importComfyWorkflow").onclick=function(){$("#comfyWorkflowFile").click()};
$("#comfyWorkflowFile").onchange=async function(){var f=this.files&&this.files[0];if(!f)return;try{var raw=await f.text();JSON.parse(raw);aiComfyWorkflow=raw;$("#aiComfyWorkflow").value=raw;localStorage.setItem("card-studio-comfy-workflow",raw);setStatus("已导入 ComfyUI API 工作流："+f.name)}catch(e){setStatus("ComfyUI 工作流导入失败："+e.message)}this.value=""};
$("#aiComfyWorkflow").addEventListener("change",function(){var raw=this.value.trim();if(raw){try{JSON.parse(raw)}catch(e){setStatus("ComfyUI 工作流 JSON 无法解析："+e.message);return}}aiComfyWorkflow=raw;try{localStorage.setItem("card-studio-comfy-workflow",raw)}catch(e){}setStatus(raw?"已保存 ComfyUI 工作流到本机浏览器设置":"已清空 ComfyUI 工作流")});
$("#clearComfyWorkflow").onclick=function(){aiComfyWorkflow="";$("#aiComfyWorkflow").value="";try{localStorage.removeItem("card-studio-comfy-workflow")}catch(e){}setStatus("已清空 ComfyUI 工作流设置")};
function dpiThresholds(){var target=Math.max(150,num(projectDesign.targetPrintDpi,300)),minimum=Math.max(72,Math.min(target,num(projectDesign.minimumPrintDpi,220)));return {target:target,minimum:minimum}}
function artSubjectScreenPosition(card){var a=card&&normalizeAppearance(card.appearance),asset=card&&card.artAssetId&&assetById(card.artAssetId),layout=card&&card.layout&&card.layout.art;if(!a||!asset||!asset.width||!asset.height||!layout)return null;var zoom=Math.max(100,num(a.artZoom,100))/100,cardRatio=CARD_BLEED_W_MM/CARD_BLEED_H_MM,containerRatio=cardRatio*Math.max(.01,num(layout.w,100))/Math.max(.01,num(layout.h,100)),rw=zoom,rh=zoom*containerRatio*(asset.height/asset.width),fx=Math.max(0,Math.min(1,num(a.artFocusX,50)/100)),fy=Math.max(0,Math.min(1,num(a.artFocusY,50)/100)),sx=Math.max(0,Math.min(1,num(a.artSubjectX,50)/100)),sy=Math.max(0,Math.min(1,num(a.artSubjectY,42)/100)),left=(1-rw)*fx,top=(1-rh)*fy,x=(left+rw*sx)*100,y=(top+rh*sy)*100,safe=Math.max(0,Math.min(30,num(projectDesign.artSubjectSafePct,10)));return {x:x,y:y,safe:x>=safe&&x<=100-safe&&y>=safe&&y<=100-safe,margin:safe,renderedWidthPct:rw*100,renderedHeightPct:rh*100}}
function artSubjectSafetyText(card){var p=artSubjectScreenPosition(card);if(!hasCardArt(card))return {quality:"unknown",text:"主体安全：尚未设置插画"};if(!p)return {quality:"unknown",text:"主体安全：素材缺少尺寸，无法计算当前裁切"};var dx=Math.min(p.x,100-p.x),dy=Math.min(p.y,100-p.y),m=Math.min(dx,dy);return p.safe?{quality:"good",text:"主体安全：通过 · 距最近边缘 "+m.toFixed(1)+"%"}:{quality:"bad",text:"主体安全：危险 · 当前落点 "+p.x.toFixed(1)+"%, "+p.y.toFixed(1)+"% · 要求离边缘 ≥ "+p.margin.toFixed(0)+"%"}}
function visibleCenterSourcePoint(card){var a=card&&normalizeAppearance(card.appearance),asset=card&&card.artAssetId&&assetById(card.artAssetId),layout=card&&card.layout&&card.layout.art;if(!a||!asset||!asset.width||!asset.height||!layout)return null;var zoom=Math.max(100,num(a.artZoom,100))/100,containerRatio=(CARD_BLEED_W_MM/CARD_BLEED_H_MM)*Math.max(.01,num(layout.w,100))/Math.max(.01,num(layout.h,100)),rw=zoom,rh=zoom*containerRatio*(asset.height/asset.width),fx=Math.max(0,Math.min(1,num(a.artFocusX,50)/100)),fy=Math.max(0,Math.min(1,num(a.artFocusY,50)/100)),left=(1-rw)*fx,top=(1-rh)*fy;return {x:Math.max(0,Math.min(1,(.5-left)/rw))*100,y:Math.max(0,Math.min(1,(.5-top)/rh))*100}}
function artEffectiveDpi(card){var a=card&&card.artAssetId&&assetById(card.artAssetId),layout=card&&card.layout&&card.layout.art;if(!a||!a.width||!a.height||!layout)return null;var zoom=Math.max(1,num(card.appearance&&card.appearance.artZoom,100))/100,physicalWmm=CARD_BLEED_W_MM*Math.max(.01,num(layout.w,100))/100*zoom;if(!physicalWmm)return null;return a.width/(physicalWmm/25.4)}
function backEffectiveDpi(asset){if(!asset||!asset.width||!asset.height)return null;return Math.min(asset.width/(CARD_BLEED_W_MM/25.4),asset.height/(CARD_BLEED_H_MM/25.4))}
function dpiQuality(dpi){var t=dpiThresholds();if(dpi==null)return "unknown";return dpi<t.minimum?"bad":dpi<t.target?"warn":"good"}
function dpiText(dpi){return dpi==null?"未知":Math.round(dpi)+" DPI"}
function renderArtDpiInfo(){var el=$("#artDpiInfo"),c=current();if(!el||!c)return;var asset=c.artAssetId&&assetById(c.artAssetId),dpi=artEffectiveDpi(c),q=dpiQuality(dpi),t=dpiThresholds();el.className="art-dpi-info "+q;if(!asset){el.textContent="插画 DPI：尚未设置插画";return}if(dpi==null){el.textContent="插画 DPI：素材缺少像素尺寸 · 建议重新导入一次";return}el.textContent="插画有效精度："+dpiText(dpi)+" · 理想 ≥ "+t.target+" / 最低 "+t.minimum+" DPI"}
function renderArtSubjectInfo(){var el=$("#artSubjectInfo");if(!el)return;var q=artSubjectSafetyText(current());el.className="art-subject-info "+q.quality;el.textContent=q.text}
function syncArtControls(){var a=current().appearance,x=a.artFocusX==null?50:a.artFocusX,y=a.artFocusY==null?50:a.artFocusY,sx=a.artSubjectX==null?50:a.artSubjectX,sy=a.artSubjectY==null?42:a.artSubjectY,z=a.artZoom||100;$("#artFocusX").value=x;$("#artFocusY").value=y;$("#artSubjectX").value=sx;$("#artSubjectY").value=sy;$("#artZoom").value=z;$("#artFocusXValue").textContent=Math.round(x)+"%";$("#artFocusYValue").textContent=Math.round(y)+"%";$("#artSubjectXValue").textContent=Math.round(sx)+"%";$("#artSubjectYValue").textContent=Math.round(sy)+"%";$("#artZoomValue").textContent=Math.round(z)+"%";renderArtDpiInfo();renderArtSubjectInfo()}
["X","Y"].forEach(function(axis){var el=$("#artFocus"+axis);el.addEventListener("pointerdown",function(){recordHistory()});el.addEventListener("input",function(){current().appearance["artFocus"+axis]=num(this.value,50);$("#artFocus"+axis+"Value").textContent=Math.round(num(this.value,50))+"%";renderPreviewOnly();renderArtSubjectInfo();persist()})});
["X","Y"].forEach(function(axis){var el=$("#artSubject"+axis);el.addEventListener("pointerdown",function(){recordHistory()});el.addEventListener("input",function(){current().appearance["artSubject"+axis]=num(this.value,axis==="X"?50:42);$("#artSubject"+axis+"Value").textContent=Math.round(num(this.value,axis==="X"?50:42))+"%";renderPreviewOnly();renderArtSubjectInfo();persist()})});
$("#centerArtSubject").onclick=function(){if(!hasCardArt(current())){setStatus("请先上传插画");return}var p=visibleCenterSourcePoint(current());if(!p){setStatus("素材缺少像素尺寸，暂时无法反算当前画面中心");return}recordHistory();var a=current().appearance;a.artSubjectX=p.x;a.artSubjectY=p.y;syncArtControls();renderPreviewOnly();persist();setStatus("已把当前画面中心标记为主体安全焦点；以后调整裁切时会持续检查主体位置")};
$("#artZoom").addEventListener("pointerdown",function(){recordHistory()});$("#artZoom").addEventListener("input",function(){current().appearance.artZoom=num(this.value,100);$("#artZoomValue").textContent=Math.round(num(this.value,100))+"%";renderPreviewOnly();renderArtDpiInfo();renderArtSubjectInfo();persist()});
$("#autoPalette").onclick=async function(){var c=current();if(!hasCardArt(c)){setStatus("请先上传插画，再自动配色");return}var btn=this;btn.disabled=true;try{var p=await paletteFromArt(cardArtData(c));recordHistory();Object.assign(c.appearance,p);renderAll();setStatus("已从插画提取主色：卡框、强调色和底色已自动协调")}catch(e){setStatus("自动配色失败："+e.message)}btn.disabled=false};

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
  if(main){var skin=skins.find(function(x){return x.id===main.getAttribute("data-skin")});if(skin){recordHistory();current().appearance=mergeThemeAppearance(current().appearance,skin.appearance);renderCard();persist();setStatus("已应用皮肤："+skin.name+"；卡框、图片素材与布局保持不变")}}
};
$$("[data-color]").forEach(function(el){
  el.addEventListener("focus",recordHistory);
  el.onchange=function(){current().appearance[el.getAttribute("data-color")]=el.value;renderCard();persist()};
  el.oninput=function(){current().appearance[el.getAttribute("data-color")]=el.value;renderPreviewOnly();persist()};
});
$("#saveSkin").onclick=function(){
  var skin={id:uid(),name:"自定义皮肤 "+(skins.length+1),favorite:true,appearance:themeAppearance(current().appearance)};
  skins.push(skin);renderSkins();persist();setStatus("已保存为可复用皮肤");
};
$("#applyAll").onclick=function(){
  recordHistory();var a=themeAppearance(current().appearance);cards.forEach(function(c){if(!isCardLocked(c))c.appearance=mergeThemeAppearance(c.appearance,a)});renderAll();setStatus("当前皮肤主题已应用到 "+cards.filter(function(c){return !isCardLocked(c)}).length+" 张未锁定卡牌；已跳过锁定卡");
};

var waitFrame=function(){return new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve)})})};
function cardBackAsset(){return projectDesign.cardBackAssetId&&assetById(projectDesign.cardBackAssetId)||null}
function cardBackAssetForCard(card){var id=card&&card.setId&&cardBackProfiles.bySet[card.setId]||card&&card.templateId&&cardBackProfiles.byTemplate[card.templateId]||projectDesign.cardBackAssetId||"";return id?assetById(id):null}
function cardBackRouteForCard(card){if(card&&card.setId&&cardBackProfiles.bySet[card.setId])return "扩展包卡背";if(card&&card.templateId&&cardBackProfiles.byTemplate[card.templateId])return "卡牌类型卡背";return projectDesign.cardBackAssetId?"项目默认卡背":"未设置卡背"}
function cardsMissingBack(list){return (list||cards).filter(function(c){return !cardBackAssetForCard(c)})}
function renderCardBackControl(){var box=$("#cardBackPreview"),clear=$("#clearCardBack"),a=cardBackAsset(),c=current(),resolved=cardBackAssetForCard(c),route=cardBackRouteForCard(c);if(!box)return;box.innerHTML=a?'<img src="'+esc(a.dataUrl)+'" alt="'+esc(a.name||"卡背")+'">':'<span>尚未设置项目默认卡背</span>';if(clear)clear.disabled=!a;var label=$("#resolvedCardBackLabel"),bdpi=backEffectiveDpi(resolved);if(label)label.textContent=resolved?(route+" · "+resolved.name+" · "+dpiText(bdpi)):"当前卡没有可用卡背";var tb=$("#clearTemplateBack"),sb=$("#clearSetBack"),upSet=$("#uploadSetBack");if(tb)tb.disabled=!(c&&cardBackProfiles.byTemplate[c.templateId]);if(sb)sb.disabled=!(c&&c.setId&&cardBackProfiles.bySet[c.setId]);if(upSet)upSet.disabled=!(c&&c.setId);var missing=cardsMissingBack(cards).length;["#duplexPnpPdf","#duplexPrintPack"].forEach(function(q){var b=$(q);if(b){b.disabled=missing>0;b.title=missing?("仍有 "+missing+" 张卡没有解析到卡背"):""}})}
$("#uploadCardBack").onclick=function(){$("#cardBackFile").click()};
$("#cardBackFile").onchange=async function(){var f=this.files&&this.files[0];if(!f)return;try{recordHistory();var data=await fileToDataUrl(f),im=await imageFromDataUrl(data),a=registerAsset(data,f.name.replace(/\.[^.]+$/,"" )+" · 卡背","cardBack",{width:im.naturalWidth,height:im.naturalHeight});projectDesign.cardBackAssetId=a.id;renderCardBackControl();renderAssetManager();persist();setStatus("项目卡背已设置："+im.naturalWidth+" × "+im.naturalHeight+" px，并进入统一资产库")}catch(e){setStatus("卡背导入失败："+e.message)}this.value=""};
$("#clearCardBack").onclick=function(){if(!projectDesign.cardBackAssetId)return;recordHistory();projectDesign.cardBackAssetId="";renderCardBackControl();persist();setStatus("已解除项目卡背引用；原素材仍保留在资产库")};
async function assignScopedBackFile(file,scope){if(!file)return;var data=await fileToDataUrl(file),im=await imageFromDataUrl(data),label=scope==="template"?"类型卡背":"扩展包卡背",a=registerAsset(data,file.name.replace(/\.[^.]+$/,"")+" · "+label,"cardBack",{width:im.naturalWidth,height:im.naturalHeight}),c=current();if(scope==="template")cardBackProfiles.byTemplate[c.templateId]=a.id;else if(c.setId)cardBackProfiles.bySet[c.setId]=a.id;renderCardBackControl();renderAssetManager();persist();setStatus((scope==="template"?TEMPLATES[c.templateId].name:setDisplayName(c))+" 已设置专用卡背："+a.name)}
$("#uploadTemplateBack").onclick=function(){$("#templateBackFile").click()};$("#templateBackFile").onchange=async function(){var f=this.files&&this.files[0];if(!f)return;try{recordHistory();await assignScopedBackFile(f,"template")}catch(e){setStatus("类型卡背导入失败："+e.message)}this.value=""};
$("#clearTemplateBack").onclick=function(){var c=current();if(!c)return;recordHistory();delete cardBackProfiles.byTemplate[c.templateId];renderCardBackControl();persist();setStatus("当前卡牌类型已恢复继承项目默认卡背")};
$("#uploadSetBack").onclick=function(){if(!current().setId){setStatus("当前卡牌尚未归属扩展包");return}$("#setBackFile").click()};$("#setBackFile").onchange=async function(){var f=this.files&&this.files[0];if(!f)return;try{recordHistory();await assignScopedBackFile(f,"set")}catch(e){setStatus("扩展包卡背导入失败："+e.message)}this.value=""};
$("#clearSetBack").onclick=function(){var c=current();if(!c||!c.setId)return;recordHistory();delete cardBackProfiles.bySet[c.setId];renderCardBackControl();persist();setStatus("当前扩展包已恢复继承卡牌类型 / 项目默认卡背")};
var capture=async function(card,kind){
  renderExport(card);await document.fonts.ready;await waitFrame();fitTitleToBox($("#exportCard"),card);fitEffectToBox($("#exportCard"),card);await waitFrame();
  var el=$("#exportCard .card"),ratio=815/el.offsetWidth;
  return kind==="jpeg"?htmlToImage.toJpeg(el,{pixelRatio:ratio,quality:.95,cacheBust:true}):htmlToImage.toPng(el,{pixelRatio:ratio,cacheBust:true});
};
async function trimCardDataUrl(dataUrl,targetWidth){var im=await imageFromDataUrl(dataUrl),sx=im.naturalWidth*(CARD_BLEED_MM/CARD_BLEED_W_MM),sy=im.naturalHeight*(CARD_BLEED_MM/CARD_BLEED_H_MM),sw=im.naturalWidth*(CARD_TRIM_W_MM/CARD_BLEED_W_MM),sh=im.naturalHeight*(CARD_TRIM_H_MM/CARD_BLEED_H_MM),w=targetWidth||Math.round(sw),h=Math.round(w*CARD_TRIM_H_MM/CARD_TRIM_W_MM),cv=document.createElement("canvas");cv.width=w;cv.height=h;var ctx=cv.getContext("2d");ctx.drawImage(im,sx,sy,sw,sh,0,0,w,h);return cv.toDataURL("image/png")}
async function captureTrimmed(card,targetWidth){return trimCardDataUrl(await capture(card,"png"),targetWidth)}
function trimMarks(pdf,x,y,w,h){var l=2,g=.6;pdf.setLineWidth(.12);pdf.line(x-l-g,y,x-g,y);pdf.line(x,y-l-g,x,y-g);pdf.line(x+w+g,y,x+w+l+g,y);pdf.line(x+w,y-l-g,x+w,y-g);pdf.line(x-l-g,y+h,x-g,y+h);pdf.line(x,y+h+g,x,y+h+l+g);pdf.line(x+w+g,y+h,x+w+l+g,y+h);pdf.line(x+w,y+h+g,x+w,y+h+l+g)}
async function buildPnpPdfDocument(list){var PDF=window.jspdf.jsPDF,ss=SHEETS[printSettings.sheet]||SHEETS.a4,pdf=new PDF({orientation:ss[0]>ss[1]?"landscape":"portrait",unit:"mm",format:ss}),cw=CARD_TRIM_W_MM,ch=CARD_TRIM_H_MM,margin=7,cols=Math.max(1,Math.floor((ss[0]-margin*2)/cw)),rows=Math.max(1,Math.floor((ss[1]-margin*2)/ch)),per=cols*rows,startX=(ss[0]-cols*cw)/2,startY=(ss[1]-rows*ch)/2;for(var i=0;i<list.length;i++){if(i>0&&i%per===0)pdf.addPage();var img=await captureTrimmed(list[i]),slot=i%per,col=slot%cols,row=Math.floor(slot/cols),x=startX+col*cw,y=startY+row*ch;pdf.addImage(img,"PNG",x,y,cw,ch);trimMarks(pdf,x,y,cw,ch);setStatus("家庭 PnP 拼版 "+(i+1)+" / "+list.length)}return pdf}
async function pnpPdf(){var list=getVisibleCards();if(!list.length)list=cards;setStatus("正在生成家庭测试 PnP……");try{var pdf=await buildPnpPdfDocument(list);pdf.save(safeFilename(projectName)+"-PnP-"+String(printSettings.sheet).toUpperCase()+".pdf");setStatus("家庭测试 PnP 完成："+list.length+" 张，按 "+printTrimSizeText()+" 成品尺寸输出")}catch(e){setStatus("PnP PDF 失败："+e.message)}}
function impositionGrid(sheet,cw,ch,margin){var cols=Math.max(1,Math.floor((sheet[0]-margin*2)/cw)),rows=Math.max(1,Math.floor((sheet[1]-margin*2)/ch));return {cols:cols,rows:rows,per:cols*rows,startX:(sheet[0]-cols*cw)/2,startY:(sheet[1]-rows*ch)/2}}
function mirroredSlot(slot,grid,flip){var col=slot%grid.cols,row=Math.floor(slot/grid.cols);if(flip==="short")row=grid.rows-1-row;else col=grid.cols-1-col;return {col:col,row:row}}
async function coverImageDataUrl(src,width,height,rotate180){var im=await imageFromDataUrl(src),cv=document.createElement("canvas");cv.width=width;cv.height=height;var ctx=cv.getContext("2d"),scale=Math.max(width/im.naturalWidth,height/im.naturalHeight),dw=im.naturalWidth*scale,dh=im.naturalHeight*scale,dx=(width-dw)/2,dy=(height-dh)/2;if(rotate180){ctx.translate(width,height);ctx.rotate(Math.PI);ctx.drawImage(im,dx,dy,dw,dh)}else ctx.drawImage(im,dx,dy,dw,dh);return cv.toDataURL("image/png")}
async function cardBackDataUrl(targetWidth,targetHeight){var a=cardBackAsset();if(!a)throw new Error("请先设置项目卡背");var src=a.dataUrl||assetBinaryCache[a.id]||"";if(!src)throw new Error("项目卡背素材已丢失");return coverImageDataUrl(src,targetWidth,targetHeight,!!printSettings.backRotate)}
async function cardBackDataUrlForCard(card,targetWidth,targetHeight,cache){var a=cardBackAssetForCard(card);if(!a)throw new Error("卡牌“"+(card&&card.name||"未命名")+"”没有可用卡背");var key=[a.id,targetWidth,targetHeight,!!printSettings.backRotate].join(":");cache=cache||{};if(cache[key])return cache[key];var src=a.dataUrl||assetBinaryCache[a.id]||"";if(!src)throw new Error("卡背素材已丢失："+a.name);cache[key]=await coverImageDataUrl(src,targetWidth,targetHeight,!!printSettings.backRotate);return cache[key]}
function addBackSlot(pdf,img,x,y,cw,ch,trimmed){pdf.addImage(img,"PNG",x,y,cw,ch);if(trimmed)trimMarks(pdf,x,y,cw,ch);else crop(pdf,x,y)}
async function buildDuplexPdf(list,trimmed){var PDF=window.jspdf.jsPDF,ss=SHEETS[printSettings.sheet]||SHEETS.a4,cw=trimmed?CARD_TRIM_W_MM:CARD_BLEED_W_MM,ch=trimmed?CARD_TRIM_H_MM:CARD_BLEED_H_MM,margin=trimmed?7:3,grid=impositionGrid(ss,cw,ch,margin),pdf=new PDF({orientation:ss[0]>ss[1]?"landscape":"portrait",unit:"mm",format:ss}),backPxW=trimmed?744:815,backPxH=Math.round(backPxW*ch/cw),backCache={},pageCount=Math.ceil(list.length/grid.per);for(var pg=0;pg<pageCount;pg++){if(pg>0)pdf.addPage();var part=list.slice(pg*grid.per,(pg+1)*grid.per);for(var i=0;i<part.length;i++){var slot=i,col=slot%grid.cols,row=Math.floor(slot/grid.cols),x=grid.startX+col*cw,y=grid.startY+row*ch,face=trimmed?await captureTrimmed(part[i],backPxW):await capture(part[i],"png");pdf.addImage(face,"PNG",x,y,cw,ch);if(trimmed)trimMarks(pdf,x,y,cw,ch);else crop(pdf,x,y);setStatus((trimmed?"双面 PnP":"双面印刷")+" 正面 "+(pg*grid.per+i+1)+" / "+list.length)}pdf.addPage();for(var j=0;j<part.length;j++){var ms=mirroredSlot(j,grid,printSettings.duplexFlip),bx=grid.startX+ms.col*cw,by=grid.startY+ms.row*ch,back=await cardBackDataUrlForCard(part[j],backPxW,backPxH,backCache);addBackSlot(pdf,back,bx,by,cw,ch,trimmed)}}return {pdf:pdf,grid:grid,pageCount:pageCount}}
async function duplexPnpPdf(){var list=getVisibleCards();if(!list.length)list=cards;var missingBacks=cardsMissingBack(list);if(missingBacks.length){setStatus("双面 PnP：仍有 "+missingBacks.length+" 张卡没有可用卡背");return}var btn=$("#duplexPnpPdf");btn.disabled=true;try{var out=await buildDuplexPdf(list,true);out.pdf.save(safeFilename(projectName)+"-Duplex-PnP-"+String(printSettings.sheet).toUpperCase()+".pdf");setStatus("双面 PnP 完成："+list.length+" 张 · "+(printSettings.duplexFlip==="short"?"短边":"长边")+"翻页校准")}catch(e){setStatus("双面 PnP 失败："+e.message)}btn.disabled=false}
async function buildDuplexPrintArtifacts(list){var missing=cardsMissingBack(list);if(missing.length)throw new Error("仍有 "+missing.length+" 张卡没有可用卡背");var PDF=window.jspdf.jsPDF,ss=SHEETS[printSettings.sheet]||SHEETS.a4,cw=69,ch=94,margin=3,grid=impositionGrid(ss,cw,ch,margin),fronts=new PDF({orientation:ss[0]>ss[1]?"landscape":"portrait",unit:"mm",format:ss}),backs=new PDF({orientation:ss[0]>ss[1]?"landscape":"portrait",unit:"mm",format:ss}),backCache={},pages=[];for(var pg=0;pg<Math.ceil(list.length/grid.per);pg++){if(pg>0){fronts.addPage();backs.addPage()}var part=list.slice(pg*grid.per,(pg+1)*grid.per),map=[];for(var i=0;i<part.length;i++){var col=i%grid.cols,row=Math.floor(i/grid.cols),x=grid.startX+col*cw,y=grid.startY+row*ch,face=await capture(part[i],"png");fronts.addImage(face,"PNG",x,y,cw,ch);crop(fronts,x,y);var ms=mirroredSlot(i,grid,printSettings.duplexFlip),bx=grid.startX+ms.col*cw,by=grid.startY+ms.row*ch,back=await cardBackDataUrlForCard(part[i],815,Math.round(815*94/69),backCache);backs.addImage(back,"PNG",bx,by,cw,ch);crop(backs,bx,by);var ba=cardBackAssetForCard(part[i]);map.push({cardId:part[i].id,name:part[i].name,frontSlot:i,backSlot:ms.row*grid.cols+ms.col,backAssetId:ba&&ba.id||"",backRoute:cardBackRouteForCard(part[i])});setStatus("印刷正反面拼版 "+(pg*grid.per+i+1)+" / "+list.length)}pages.push({page:pg+1,cards:map})}var imposition={format:"cardstudio-duplex-imposition",version:2,project:projectName,sheet:printSettings.sheet,flip:printSettings.duplexFlip,backRotate:!!printSettings.backRotate,cardSizeMm:[CARD_BLEED_W_MM,CARD_BLEED_H_MM],trimSizeMm:[CARD_TRIM_W_MM,CARD_TRIM_H_MM],bleedMm:CARD_BLEED_MM,grid:{columns:grid.cols,rows:grid.rows,cardsPerPage:grid.per},pages:pages};return {fronts:fronts,backs:backs,imposition:imposition}}
async function buildDuplexPrintPack(){var list=getVisibleCards();if(!list.length)list=cards;var out=await buildDuplexPrintArtifacts(list),zip=new JSZip();zip.file("fronts.pdf",out.fronts.output("blob"));zip.file("backs.pdf",out.backs.output("blob"));zip.file("imposition.json",JSON.stringify(out.imposition,null,2));zip.file("README.txt","CardStudio 双面印刷包\n\nfronts.pdf：正面含当前项目设置的出血（详见 imposition.json）\nbacks.pdf：卡背按所选翻页方式自动镜像卡位\nimposition.json：每张卡正反槽位对应关系\n\n第一次送印前请先用普通纸进行一页正反校准。\n");return zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}})}

var download=function(url,name){var old=$("#readyExportDownload");if(old)old.remove();var a=document.createElement("a");a.id="readyExportDownload";a.className="export-download-ready";a.href=url;a.download=name;a.textContent="下载："+name;a.title="文件已生成；点击下载 "+name;$(".export-actions").appendChild(a);a.click();scheduleWorkspaceFit();return a};
$("#png").onclick=async function(){setStatus("正在导出 PNG...");try{download(await capture(current(),"png"),current().name+".png");setStatus("PNG 完成：300dpi")}catch(e){setStatus("导出失败："+e.message)}};
$("#jpg").onclick=async function(){setStatus("正在导出 JPG...");try{download(await capture(current(),"jpeg"),current().name+".jpg");setStatus("JPG 完成：300dpi")}catch(e){setStatus("导出失败："+e.message)}};
var crop=function(pdf,x,y){if(!printSettings.crop)return;var l=2,left=x+CARD_BLEED_MM,right=x+CARD_BLEED_W_MM-CARD_BLEED_MM,top=y+CARD_BLEED_MM,bottom=y+CARD_BLEED_H_MM-CARD_BLEED_MM;pdf.setLineWidth(.12);pdf.line(left-l,top,left,top);pdf.line(left,top-l,left,top);pdf.line(right,top,right+l,top);pdf.line(right,top-l,right,top);pdf.line(left-l,bottom,left,bottom);pdf.line(left,bottom,left,bottom+l);pdf.line(right,bottom,right+l,bottom);pdf.line(right,bottom,right,bottom+l)};
$("#singlePdf").onclick=async function(){
  setStatus("正在生成单张 PDF...");
  try{var img=await capture(current(),"png"),PDF=window.jspdf.jsPDF,pdf=new PDF({orientation:"portrait",unit:"mm",format:[69,94]});pdf.addImage(img,"PNG",0,0,69,94);crop(pdf,0,0);pdf.save(current().name+"-300dpi.pdf");setStatus("PDF 完成：四周出血 "+CARD_BLEED_MM+" mm"+(printSettings.crop?"，已添加裁切线":""))}catch(e){setStatus("PDF 失败："+e.message)}
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
$("#pnpPdf").onclick=pnpPdf;$("#duplexPnpPdf").onclick=duplexPnpPdf;$("#printPresetPdf").onclick=batchPdf;$("#duplexPrintPack").onclick=async function(){var btn=this;btn.disabled=true;setStatus("正在生成专业印刷正反面包……");try{var blob=await buildDuplexPrintPack(),url=URL.createObjectURL(blob);download(url,safeFilename(projectName)+"-Duplex-Print.zip");setTimeout(function(){URL.revokeObjectURL(url)},300000);setStatus("专业印刷正反面包完成：fronts.pdf + backs.pdf + 卡位映射")}catch(e){setStatus("印刷正反面包失败："+e.message)}btn.disabled=false};$("#ttsPackPreset").onclick=function(){$("#exportTTS").click()};
$("#sheetSize").onchange=function(){printSettings.sheet=this.value;persist()};
$("#cropMarks").onchange=function(){printSettings.crop=this.checked;persist()};
$("#duplexFlip").onchange=function(){printSettings.duplexFlip=this.value;persist()};$("#backRotate").onchange=function(){printSettings.backRotate=this.checked;persist()};

function safeFilename(name){return String(name||"card").replace(/[\\/:*?"<>|]/g,"_").trim()||"card"}
function normalizeName(name){return String(name||"").replace(/\\.[^.]+$/,"").replace(/[\\s_\\-]+/g,"").toLowerCase()}
function fileToDataUrl(file){return new Promise(function(resolve,reject){var rr=new FileReader();rr.onload=function(){resolve(String(rr.result||""))};rr.onerror=reject;rr.readAsDataURL(file)})}
function imageFromDataUrl(src){return new Promise(function(resolve,reject){var im=new Image();im.onload=function(){resolve(im)};im.onerror=reject;im.src=src})}
async function assignCardArtFile(card,file){var data=await fileToDataUrl(file),im=await imageFromDataUrl(data);return assignCardArt(card,data,file.name,{width:im.naturalWidth,height:im.naturalHeight})}
async function enrichMissingAssetDimensions(){var changed=0;for(var i=0;i<userAssets.length;i++){var a=userAssets[i],src=a.dataUrl||assetBinaryCache[a.id]||"";if(!src||a.width&&a.height)continue;try{var im=await imageFromDataUrl(src);a.width=im.naturalWidth;a.height=im.naturalHeight;changed++}catch(e){}}if(changed){persist();renderArtDpiInfo();renderCardBackControl()}return changed}
async function makeSmartFrameDataUrl(file){
  var src=await fileToDataUrl(file),im=await imageFromDataUrl(src),maxSide=1800,scale=Math.min(1,maxSide/Math.max(im.naturalWidth,im.naturalHeight)),w=Math.max(1,Math.round(im.naturalWidth*scale)),h=Math.max(1,Math.round(im.naturalHeight*scale)),cv=document.createElement("canvas");cv.width=w;cv.height=h;var ctx=cv.getContext("2d",{willReadFrequently:true});ctx.drawImage(im,0,0,w,h);var id=ctx.getImageData(0,0,w,h),d=id.data;
  for(var i=0;i<d.length;i+=4){var r=d[i],g=d[i+1],b=d[i+2],mn=Math.min(r,g,b),mx=Math.max(r,g,b),ch=mx-mn;if(ch<=16&&mn>=245)d[i+3]=0;else if(ch<=16&&mn>=235)d[i+3]=Math.round(d[i+3]*(245-mn)/10)}
  ctx.putImageData(id,0,0);return cv.toDataURL("image/png");
}
function rgbToHsl(r,g,b){r/=255;g/=255;b/=255;var mx=Math.max(r,g,b),mn=Math.min(r,g,b),h=0,s=0,l=(mx+mn)/2,d=mx-mn;if(d){s=l>.5?d/(2-mx-mn):d/(mx+mn);if(mx===r)h=((g-b)/d+(g<b?6:0))/6;else if(mx===g)h=((b-r)/d+2)/6;else h=((r-g)/d+4)/6}return [h,s,l]}
function hslHex(h,s,l){function f(n){var k=(n+h*12)%12,a=s*Math.min(l,1-l),v=l-a*Math.max(-1,Math.min(k-3,9-k,1));return Math.round(255*v).toString(16).padStart(2,"0")}return "#"+f(0)+f(8)+f(4)}
async function paletteFromArt(dataUrl){var im=await imageFromDataUrl(dataUrl),cv=document.createElement("canvas");cv.width=48;cv.height=68;var ctx=cv.getContext("2d",{willReadFrequently:true});ctx.drawImage(im,0,0,48,68);var d=ctx.getImageData(0,0,48,68).data,bins=Array.from({length:12},function(){return {w:0,h:0,s:0,l:0}}),neutral={r:0,g:0,b:0,n:0};for(var i=0;i<d.length;i+=4){if(d[i+3]<128)continue;var r=d[i],g=d[i+1],b=d[i+2],x=rgbToHsl(r,g,b),h=x[0],sat=x[1],l=x[2];if(l<.08||l>.92)continue;neutral.r+=r;neutral.g+=g;neutral.b+=b;neutral.n++;var w=sat*sat*(1-Math.abs(l-.5));if(w>.015){var bin=bins[Math.floor(h*12)%12];bin.w+=w;bin.h+=h*w;bin.s+=sat*w;bin.l+=l*w}}var best=bins.sort(function(a,b){return b.w-a.w})[0];if(best&&best.w>.12){var h=best.h/best.w,s=Math.max(.38,Math.min(.78,best.s/best.w)),l=Math.max(.43,Math.min(.62,best.l/best.w));return {accent:hslHex(h,s,l),primary:hslHex(h,Math.min(.62,s*.75),.18),secondary:hslHex(h,Math.min(.58,s*.65),.31),frame:hslHex(h,Math.min(.5,s*.55),.11)}}var rr=neutral.n?neutral.r/neutral.n:110,gg=neutral.n?neutral.g/neutral.n:120,bb=neutral.n?neutral.b/neutral.n:130,hsl=rgbToHsl(rr,gg,bb);return {accent:hslHex(hsl[0],Math.max(.18,hsl[1]),.58),primary:hslHex(hsl[0],Math.max(.1,hsl[1]*.5),.2),secondary:hslHex(hsl[0],Math.max(.08,hsl[1]*.45),.34),frame:hslHex(hsl[0],Math.max(.06,hsl[1]*.4),.12)}}
function applyCompositionPreset(kind,quiet){
  var c=current(),t=cardTemplate(c),l=makeLayout(c.templateId),a=c.appearance;
  if(kind==="showcase"){
    l.art={x:0,y:0,w:100,h:100,r:0,z:1,locked:true,opacity:1,visible:true};
    l.title={x:22,y:4,w:56,h:7.5,r:0,z:34,locked:false,opacity:1,visible:true};l.faction={x:22,y:11.5,w:56,h:4.5,r:0,z:33,locked:false,opacity:.88,visible:true};
    l.type={x:22,y:15.5,w:56,h:4.5,r:0,z:32,locked:false,opacity:.82,visible:true};l.cost={x:3.5,y:1.2,w:17,h:12.5,r:0,z:36,locked:false,opacity:1,visible:true};l.rarityMark={x:79.5,y:1.2,w:17,h:12.5,r:0,z:36,locked:false,opacity:1,visible:true};
    l.rarityText.visible=false;l.tags.visible=false;l.footerLeft={x:6,y:95,w:56,h:3.2,r:0,z:32,locked:false,opacity:.9,visible:true};l.footerRight={x:64,y:95,w:30,h:3.2,r:0,z:32,locked:false,opacity:.9,visible:true};l.effect={x:6,y:72,w:88,h:20,r:0,z:30,locked:false,opacity:1,visible:true};
    var stats=t.stats||[],sw=9,sg=1,start=94-(stats.length*sw+Math.max(0,stats.length-1)*sg);stats.forEach(function(st,i){l["stat_"+st[0]]={x:start+i*(sw+sg),y:66,w:sw,h:5.5,r:0,z:35,locked:false,opacity:1,visible:true}});
    a.finishStyle="premium";a.frameStyle="minimal";a.textureStyle="clean";a.titleSize=24;a.effectSize=13;a.metaSize=11;a.statsSize=17;a.statsColor="#111827";a.costSize=20;a.costColor="#111827";a.artFocusX=50;a.artFocusY=46;a.artZoom=105;
  }else{
    l.art={x:0,y:0,w:100,h:100,r:0,z:1,locked:true,opacity:1,visible:true};l.cost={x:2.5,y:.8,w:18,h:12.8,r:0,z:34,locked:false,opacity:1,visible:true};l.rarityMark={x:79.5,y:.8,w:18,h:12.8,r:0,z:34,locked:false,opacity:1,visible:true};
    l.title={x:22,y:3.5,w:56,h:6.5,r:0,z:35,locked:false,opacity:1,visible:true};l.faction={x:22,y:10,w:56,h:4,r:0,z:34,locked:false,opacity:.9,visible:true};l.type={x:22,y:14,w:56,h:4,r:0,z:34,locked:false,opacity:.85,visible:true};l.rarityText.visible=false;l.tags.visible=false;l.footerLeft.visible=false;l.footerRight.visible=false;l.effect={x:7.4,y:68.4,w:85.2,h:28.2,r:0,z:30,locked:false,opacity:1,visible:true};
    var stats=t.stats||[],sw=10,sg=1,start=92-(stats.length*sw+Math.max(0,stats.length-1)*sg);stats.forEach(function(st,i){l["stat_"+st[0]]={x:start+i*(sw+sg),y:62,w:sw,h:5.5,r:0,z:35,locked:false,opacity:1,visible:true}});
    a.finishStyle="frame";a.frameStyle="minimal";a.textureStyle="clean";a.titleSize=20;a.titleColor="#f8fafc";a.effectSize=13;a.effectColor="#1f2937";a.metaSize=10;a.metaColor="#f8fafc";a.statsSize=16;a.statsColor="#111827";a.costSize=20;a.costColor="#111827";a.artFocusX=50;a.artFocusY=44;a.artZoom=108;
  }
  c.layout=enforceTitleAxis(l);c.layoutOverrides={};Object.keys(c.layout).forEach(function(k){c.layoutOverrides[k]=true});c.appearance.titleAlign="center";renderAll();if(!quiet)setStatus(kind==="showcase"?"已套用：全幅插画 · 竞技卡":"已套用：古典双槽 · 边框卡");
}
function projectPayload(includeAssetBinary){var assets=(includeAssetBinary===false?assetMetadataList():userAssets.map(function(a){return hydratedAsset(a)}));return {format:"card-assembly-studio",version:20,exportedAt:new Date().toISOString(),projectName:projectName,cards:cardsWithoutEmbeddedBinary(),selected:selected,skins:skins,ruleTerms:ruleTerms,userAssets:assets,customTemplates:customTemplates,templateLayouts:templateLayouts,projectDesign:projectDesign,fieldSchema:fieldSchema,templateConditions:templateConditions,layoutComponents:layoutComponents,templateBadgeStyles:templateBadgeStyles,cardBackProfiles:cardBackProfiles,projectSets:projectSets,cardFamilies:cardFamilies,playtests:playtests,projectVersions:projectVersions,releaseHistory:releaseHistory,favoriteAssets:favoriteAssets,snapshots:snapshots,aiStyle:$("#aiStyle").value,printSettings:printSettings}}
function downloadText(text,name,type){var blob=new Blob([text],{type:type||"text/plain;charset=utf-8"}),url=URL.createObjectURL(blob);download(url,name);setTimeout(function(){URL.revokeObjectURL(url)},300000)}
function assetExtension(a){var d=a&&a.dataUrl||"",m=/^data:image\/([^;]+)/.exec(d),x=(m&&m[1]||"bin").toLowerCase();if(x==="jpeg")x="jpg";if(x.indexOf("svg")>=0)x="svg";return x.replace(/[^a-z0-9]/g,"")||"bin"}
async function buildProjectArchive(){var zip=new JSZip(),p=projectPayload(false),manifest=[];zip.file("project.json",JSON.stringify(p,null,2));userAssets.forEach(function(a){var data=a.dataUrl||assetBinaryCache[a.id]||"";if(!data)return;var comma=data.indexOf(","),base64=comma>=0?data.slice(comma+1):data,ext=assetExtension(a),path="assets/"+a.id+"."+ext;zip.file(path,base64,{base64:true});manifest.push({id:a.id,name:a.name,category:a.category,roles:assetRoles(a),path:path,ext:ext,bytes:assetSizeBytes(a),width:a.width||0,height:a.height||0,alphaBounds:a.alphaBounds||null,alphaSampleScale:a.alphaSampleScale||1,transparentPercent:a.transparentPercent,hasAlpha:a.hasAlpha,imageInspected:a.imageInspected,createdAt:a.createdAt||""})});zip.file("assets/manifest.json",JSON.stringify({version:2,assets:manifest},null,2));zip.file("README.txt","CardStudio 3.0 项目容器\n\nproject.json：结构化项目数据（不含 Base64 图片）\nassets/：项目素材，每份二进制只保存一次\nassets/manifest.json：素材索引\n\n此格式从 Alpha 3 起分离二进制资产；Beta 4 在此基础上加入可插拔外置 AI 生图桥接；API Key 不进入项目容器，AI 成图确认后才写入 Asset Store。\n");return zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}})}
async function parseProjectFile(file){try{var zip=await JSZip.loadAsync(file),pf=zip.file("project.json");if(pf){var p=JSON.parse(await pf.async("string")),mf=zip.file("assets/manifest.json"),manifest=mf?JSON.parse(await mf.async("string")):{assets:[]},assets=[];for(var i=0;i<(manifest.assets||[]).length;i++){var meta=manifest.assets[i],entry=zip.file(meta.path);if(!entry)continue;var base64=await entry.async("base64"),mime=meta.ext==="svg"?"image/svg+xml":"image/"+(meta.ext==="jpg"?"jpeg":meta.ext);assets.push({id:meta.id,name:meta.name,category:meta.category,roles:meta.roles||[meta.category||"custom"],dataUrl:"data:"+mime+";base64,"+base64,width:meta.width||0,height:meta.height||0,alphaBounds:meta.alphaBounds||null,alphaSampleScale:meta.alphaSampleScale||1,transparentPercent:meta.transparentPercent,hasAlpha:meta.hasAlpha,imageInspected:meta.imageInspected,createdAt:meta.createdAt||""})}p.userAssets=assets;return p}}catch(e){}var text=await file.text();return JSON.parse(text)}
function validateImportedProject(p){
  if(!p||typeof p!=="object"||Array.isArray(p)||p.format!=="card-assembly-studio")throw new Error("不是有效的 Studio 卡牌项目文件");
  if(p.version!=null&&(!Number.isInteger(Number(p.version))||Number(p.version)<1||Number(p.version)>20))throw new Error("项目版本过新或无效，请使用支持该版本的 Studio");
  if(!Array.isArray(p.cards)||!p.cards.length)throw new Error("项目中没有卡牌，当前工程保持不变");
  if(p.cards.some(function(c){return !c||typeof c!=="object"||Array.isArray(c)}))throw new Error("项目包含无效卡牌，当前工程保持不变");
  if(p.ruleTerms!=null)window.CARDSTUDIO_GLOSSARY.normalizeTerms(p.ruleTerms);
  ["userAssets","skins","ruleTerms","fieldSchema","layoutComponents","projectSets","cardFamilies","playtests","projectVersions","releaseHistory","favoriteAssets","snapshots"].forEach(function(key){if(p[key]!=null&&!Array.isArray(p[key]))throw new Error("项目字段 "+key+" 应为列表，当前工程保持不变")});
  ["customTemplates","templateLayouts","projectDesign","templateConditions","templateBadgeStyles","cardBackProfiles","printSettings"].forEach(function(key){if(p[key]!=null&&(typeof p[key]!=="object"||Array.isArray(p[key])))throw new Error("项目字段 "+key+" 应为对象，当前工程保持不变")});
  if(p.projectDesign&&p.projectDesign.bleedMm!=null&&(!Number.isFinite(Number(p.projectDesign.bleedMm))||Number(p.projectDesign.bleedMm)<0||Number(p.projectDesign.bleedMm)>10))throw new Error("项目出血值必须是 0 到 10 毫米，当前工程保持不变");
  if(p.projectDesign&&p.projectDesign.fieldLabels!=null&&(typeof p.projectDesign.fieldLabels!=="object"||Array.isArray(p.projectDesign.fieldLabels)||Object.values(p.projectDesign.fieldLabels).some(function(v){return typeof v!=="string"})))throw new Error("项目字段名称无效，当前工程保持不变");
  if((p.userAssets||[]).some(function(a){return !a||typeof a!=="object"||Array.isArray(a)}))throw new Error("项目包含无效素材，当前工程保持不变");
  if(Object.keys(p.customTemplates||{}).some(function(key){var t=p.customTemplates[key];return !t||typeof t!=="object"||Array.isArray(t)||t.stats!=null&&!Array.isArray(t.stats)}))throw new Error("项目包含无效自定义模板，当前工程保持不变");
  return p;
}
function applyImportedProject(p){validateImportedProject(p);customTemplates=p.customTemplates||{};rebuildTemplateCatalog();templateLayouts=p.templateLayouts||{};projectDesign=Object.assign({},DEFAULT_PROJECT_DESIGN,p.projectDesign||{});rebuildTemplateCatalog();fieldSchema=normalizeFieldSchema(p.fieldSchema||[]);templateConditions=p.templateConditions||{};layoutComponents=p.layoutComponents||[];templateBadgeStyles=p.templateBadgeStyles||{};cardBackProfiles=normalizeCardBackProfiles(p.cardBackProfiles||{});projectSets=normalizeProjectSets(p.projectSets||[]);cardFamilies=normalizeFamilies(p.cardFamilies||[]);playtests=normalizePlaytests(p.playtests||[]);projectVersions=normalizeProjectVersions(p.projectVersions||[]);releaseHistory=Array.isArray(p.releaseHistory)?p.releaseHistory:[];userAssets=(p.userAssets||[]).map(hydratedAsset);cacheAllAssetBinaries();cards=(p.cards||[]).map(normalizeCard);ensureSetCatalogFromCards();ensureFamilyIntegrity();migrateLegacyArtAssets();if(!cards.length)throw new Error("项目中没有卡牌");skins=(p.skins||BASE_SKINS).map(function(x){x.appearance=normalizeAppearance(x.appearance);return x});ruleTerms=window.CARDSTUDIO_GLOSSARY.normalizeTerms(p.ruleTerms||[]);favoriteAssets=p.favoriteAssets||[];snapshots=p.snapshots||[];selected=p.selected&&cards.some(function(c){return c.id===p.selected})?p.selected:cards[0].id;if(p.aiStyle){aiStyle=p.aiStyle;$("#aiStyle").value=p.aiStyle}if(p.projectName)projectName=p.projectName;if(p.printSettings)printSettings=Object.assign({sheet:"a4",crop:true,duplexFlip:"long",backRotate:false},p.printSettings);setTimeout(function(){enrichMissingAssetDimensions().catch(function(){})},0)}
$("#projectExport").onclick=async function(){var btn=this;btn.disabled=true;setStatus("正在构建 .cardstudio 项目容器……");try{var blob=await buildProjectArchive(),url=URL.createObjectURL(blob);download(url,safeFilename(projectName)+".cardstudio");setTimeout(function(){URL.revokeObjectURL(url)},300000);setStatus("项目已保存：结构数据与素材已分离，图片不再重复写入 JSON")}catch(e){setStatus("保存项目失败："+e.message)}btn.disabled=false};
$("#projectImport").onclick=function(){$("#projectFile").click()};
$("#projectFile").onchange=async function(){var file=this.files&&this.files[0];if(!file)return;try{var p=await parseProjectFile(file);validateImportedProject(p);recordHistory();applyImportedProject(p);renderAll();persist();setStatus("项目已打开："+cards.length+" 张卡牌 · "+userAssets.length+" 个素材")}catch(e){setStatus("打开项目失败："+e.message)}this.value=""};

$("#cloneTemplate").onclick=function(){
  var base=TEMPLATES[current().templateId],name=prompt("新模板名称",base.name+" - 自定义");if(!name)return;
  var typeLabel=prompt("这一栏叫什么？",base.typeLabel)||base.typeLabel;
  var statText=prompt("保留哪些数值？可填：攻击,血量,移速,射程，用逗号分隔",base.stats.map(function(x){return x[2]}).join(","));if(statText==null)return;
  var map={攻击:["attack","攻","攻击"],威力:["attack","威","威力"],火力:["attack","火","火力"],血量:["health","血","血量"],耐久:["health","耐","耐久"],移速:["move","移","移速"],射程:["range","射","射程"]};
  var stats=statText.split(/[,，]/).map(function(x){return x.trim()}).filter(Boolean).map(function(x){return map[x]||null}).filter(Boolean);
  var id="custom-"+uid();customTemplates[id]={id:id,name:name,short:name.slice(0,4),hint:stats.length?stats.map(function(x){return x[2]}).join(" / "):"大文本区",typeLabel:typeLabel,stats:stats,baseLayout:base.baseLayout||base.id,cardRules:base.cardRules};
  recordHistory();rebuildTemplateCatalog();templateLayouts[id]=masterLayoutSnapshot(id,current().layout);customTemplates[id].masterLayout=clone(templateLayouts[id]);templateConditions[id]=clone(templateConditions[base.id]||{});current().templateId=id;current().layout=makeLayout(id);current().layoutOverrides={};renderAll();setStatus("已创建自定义模板："+name+"；已继承统一坐标与条件显示规则");
};
$("#deleteTemplate").onclick=function(){
  var c=current(),id=c&&c.templateId;if(!id||id==="unit"||id===KadiLayout.BASIC_ID){setStatus("标准单位模板作为空白起点保留");return}
  var saved=KadiLayout.creationDefault({projectDesign:projectDesign},TEMPLATES);if(saved&&saved.templateId===id){setStatus("这是当前唯一默认，请先将另一张卡片设为默认");return}
  recordHistory();projectDesign.hiddenTemplates=Array.from(new Set((projectDesign.hiddenTemplates||[]).concat(id)));renderAll();persist();setStatus("模板已停用；已有卡片、字段与排版保持原样，可在模板与字段中恢复");
};
$("#batchImages").onclick=function(){$("#batchImageFiles").click()};
$("#batchImageFiles").onchange=async function(){
  var files=Array.prototype.slice.call(this.files||[]);if(!files.length)return;
  recordHistory();setStatus("正在匹配 "+files.length+" 张图片...");
  var remaining=cards.filter(function(c){return !isCardLocked(c)&&!hasCardArt(c)}),used={},matchedFiles={},skippedLocked=0;
  for(var i=0;i<files.length;i++){
    var f=files[i],fn=normalizeName(f.name),target=cards.find(function(c){return normalizeName(c.name)===fn&&!used[c.id]});
    if(target&&isCardLocked(target)){matchedFiles[f.name]=true;skippedLocked++;continue}if(target){await assignCardArtFile(target,f);used[target.id]=true;matchedFiles[f.name]=true}
  }
  var restFiles=files.filter(function(f){return !matchedFiles[f.name]}),restCards=remaining.filter(function(c){return !used[c.id]});
  for(var j=0;j<Math.min(restFiles.length,restCards.length);j++){await assignCardArtFile(restCards[j],restFiles[j]);used[restCards[j].id]=true}
  renderAll();setStatus("批量图片完成：已填入 "+Object.keys(used).length+" 张卡牌；跳过 "+skippedLocked+" 张锁定卡对应图片");this.value="";
};

$("#smartFrameBtn").onclick=function(){$("#smartFrameFile").click()};
$("#smartFrameFile").onchange=async function(){var f=this.files&&this.files[0];if(!f)return;var btn=$("#smartFrameBtn");btn.disabled=true;try{
  if(isCardLocked(current()))throw new Error("当前卡牌已锁定，请先解锁");
  var raw={dataUrl:await fileToDataUrl(f)};await inspectAssetImage(raw);
  var data=raw.hasAlpha?raw.dataUrl:await makeSmartFrameDataUrl(f),asset=registerAsset(data,f.name.replace(/\.[^.]+$/,"")+" · 卡框","frameImage",{});
  await imageTools.applyRole(asset,"frameImage");setLayoutMode(true,false);setStatus(raw.hasAlpha?"透明卡框已保持原图比例导入，可直接调整图层":"已转换为透明卡框，可调整比例与图层");
  }catch(e){setStatus("卡框导入失败："+e.message)}finally{btn.disabled=false;this.value=""}};

$("#uploadAssetBtn").onclick=function(){$("#customAssetFile").click()};
$("#customAssetFile").onchange=async function(){
  var f=this.files&&this.files[0];if(!f)return;var cat=$("#uploadAssetCategory").value;
  var name=prompt("素材名称",f.name.replace(/\.[^.]+$/,""));if(!name){this.value="";return}
  recordHistory();var a=registerAsset(await fileToDataUrl(f),name,cat,{});
  try{await imageTools.applyRole(a,cat);}catch(e){setStatus("素材应用失败："+e.message);this.value="";return}
  renderAll();setStatus("自定义素材已上传并应用："+name);this.value="";
};
$("#customAssetList").onclick=async function(e){
  var place=e.target.closest("[data-place-custom]"),apply=e.target.closest("[data-apply-custom]"),fav=e.target.closest("[data-fav-custom]"),remove=e.target.closest("[data-remove-custom]");
  if(place){var pa=userAssets.find(function(x){return x.id===place.getAttribute("data-place-custom")});if(pa){setLayoutMode(true,false);addFreeImage(pa)}return}
  if(apply){var a=userAssets.find(function(x){return x.id===apply.getAttribute("data-apply-custom")}),role=apply.getAttribute("data-apply-role")||"";if(!a)return;try{await imageTools.applyRole(a,role);renderAll();setStatus("已应用自定义素材："+a.name)}catch(err){setStatus(err.message)}return}
  if(fav){var fa=userAssets.find(function(x){return x.id===fav.getAttribute("data-fav-custom")});if(fa){fa.favorite=!fa.favorite;renderCustomAssets();persist()}return}
  if(remove){var id=remove.getAttribute("data-remove-custom");if(KadiLayout.defaultReferencesAsset({projectDesign:projectDesign,customTemplates:customTemplates},id)){setStatus("此素材用于已保存的模板格式，请先修改模板引用再删除");return}recordHistory();userAssets=userAssets.filter(function(a){return a.id!==id});cards.forEach(function(c){if(c.artAssetId===id)c.artAssetId="";["iconAssetId","frameImageAssetId","textureImageAssetId"].forEach(function(k){if(c.appearance[k]===id)c.appearance[k]=""});(c.extraElements||[]).forEach(function(el){if(el.assetId===id)el.assetId=""})});renderAll();setStatus("自定义素材已删除")}
};
$("#batchRename").onclick=function(){
  var visible=getVisibleCards(),list=visible.filter(function(c){return !isCardLocked(c)}),prefix=$("#namePrefix").value,start=num($("#nameStart").value,1);if(!list.length){setStatus("没有可命名的未锁定卡牌");return}recordHistory();
  list.forEach(function(c,i){c.name=prefix+String(start+i).padStart(3,"0")});renderAll();setStatus("已批量命名 "+list.length+" 张卡牌；跳过 "+(visible.length-list.length)+" 张锁定卡");
};
$("#clearAllArt").onclick=function(){var editable=cards.filter(function(c){return !isCardLocked(c)});if(!editable.length){setStatus("卡牌均已锁定，没有清空插画");return}recordHistory();editable.forEach(function(c){c.art="";c.artAssetId=""});renderAll();setStatus("已解除 "+editable.length+" 张卡牌的插画引用；跳过 "+(cards.length-editable.length)+" 张锁定卡；资产库原文件仍保留")};

function manifestRows(list){
  list=list||cards;return list.map(function(c,i){var t=cardTemplate(c),row={序号:i+1,系列:setDisplayName(c),扩展包代码:(projectSetById(c.setId)||{}).code||"",编号:c.cardNumber,年份:c.year,署名:c.credit,名称:c.name,变体:c.variantKind||"标准",模板:t.name,费用:c.cost,系别:c.faction,类型:c.unitType,稀有度:c.rarity,生产状态:c.workflowStatus||"设计中",攻击:c.attack,血量:c.health,移速:c.move,射程:c.range,标签:c.tags,规则关键词:c.rulesKeywords,效果:c.description,插画关键词:c.artPrompt||"",有插画:hasCardArt(c)?"是":"否"};schemaForCard(c).forEach(function(f){row[f.label]=displayCustomFieldValue(c,f)});return row})
}
$("#exportManifest").onclick=function(){var csv="\uFEFF"+Papa.unparse(manifestRows());downloadText(csv,"卡牌导出清单.csv","text/csv;charset=utf-8");setStatus("CSV 清单已导出")};
$("#exportJsonList").onclick=function(){downloadText(JSON.stringify(manifestRows(),null,2),"卡牌导出清单.json","application/json");setStatus("JSON 清单已导出")};

var activeLibraryTag="",libraryCompareIds=[];
function splitTags(v){return String(v||"").split(/[,，;；|]/).map(function(x){return x.trim()}).filter(Boolean)}
function searchableText(c){var t=cardTemplate(c),termText=extractRuleTerms(c.description).map(function(n){var x=termByName(n);return x?[x.name,x.category,x.tags,x.description].join(" "):n}).join(" "),customText=fieldSchema.map(function(f){return displayCustomFieldValue(c,f)}).join(" ");return [setDisplayName(c),(projectSetById(c.setId)||{}).code,c.variantKind,c.cardNumber,c.year,c.credit,c.name,t.name,c.faction,c.unitType,c.rarity,c.workflowStatus,c.tags,c.rulesKeywords,c.description,termText,customText,c.cost,c.attack,c.health,c.move,c.range].join(" ").toLowerCase()}
function libraryIssueState(c){var issues=quickCardIssues(c,duplicateNumberMap());return {issues:issues,error:issues.some(function(x){return x.level==="error"}),warn:issues.some(function(x){return x.level==="warn"})}}
function comparisonBenchmark(card){var peers=cards.filter(function(c){return c.id!==card.id&&c.templateId===card.templateId&&Number(c.cost)===Number(card.cost)}),fields=["attack","health","move","range"],out={count:peers.length,values:{}};fields.forEach(function(k){var vals=peers.map(function(c){return Number(c[k])}).filter(Number.isFinite);out.values[k]=vals.length?vals.reduce(function(a,b){return a+b},0)/vals.length:null});return out}
function formatDelta(v,mean){if(mean==null||!Number.isFinite(Number(v)))return "—";var d=Number(v)-mean;return (d>0?"+":"")+(Math.round(d*100)/100)}
function renderLibraryCompare(){var box=$("#libraryComparePanel");if(!box)return;libraryCompareIds=libraryCompareIds.filter(function(id){return cards.some(function(c){return c.id===id})}).slice(0,4);var list=libraryCompareIds.map(function(id){return cards.find(function(c){return c.id===id})}).filter(Boolean);box.hidden=!list.length;if(!list.length){box.innerHTML="";return}var rows=[["费用","cost"],["攻击","attack"],["生命","health"],["移速","move"],["射程","range"]];box.innerHTML='<div class="compare-head"><b>卡牌对比 · '+list.length+'/4</b><small>同时显示“同模板 + 同费用”基准差值，只提供数据，不替你判断强弱。</small><button data-clear-library-compare>清空</button></div><div class="compare-grid">'+list.map(function(c){var a=cardArtData(c),bm=comparisonBenchmark(c);return '<article class="compare-card"><button data-library-compare-remove="'+c.id+'">×</button><div class="compare-art">'+(a?'<img loading="lazy" src="'+esc(a)+'">':'<span>缺插画</span>')+'</div><strong>'+esc(c.name)+'</strong><small>'+esc(c.cardNumber||"未编号")+' · '+esc(c.faction)+' · '+esc(c.unitType)+'</small><div class="compare-stats">'+rows.map(function(r){return '<span><i>'+r[0]+'</i><b>'+esc(c[r[1]])+'</b></span>'}).join("")+'</div><div class="compare-benchmark"><b>同模板同费用基准 · '+bm.count+' 张</b><br>'+[["攻","attack"],["血","health"],["移","move"],["射","range"]].map(function(r){return '<span>'+r[0]+' Δ <em>'+formatDelta(c[r[1]],bm.values[r[1]])+'</em></span>'}).join("")+'</div><p>'+renderRichText(c.description,c)+'</p></article>'}).join("")+'</div>'}
function renderCardLibrary(){
  var q=$("#librarySearch").value.trim().toLowerCase(),setId=$("#librarySet").value,template=$("#libraryTemplate").value,f=$("#libraryFaction").value,ty=$("#libraryType").value,r=$("#libraryRarity").value,status=$("#libraryStatus").value,issueFilter=$("#libraryIssue").value,sort=$("#librarySort").value;
  var allTags={};cards.forEach(function(c){splitTags(c.tags).concat(splitTags(c.rulesKeywords)).forEach(function(t){allTags[t]=(allTags[t]||0)+1})});
  $("#tagCloud").innerHTML=Object.keys(allTags).sort(function(a,b){return allTags[b]-allTags[a]||a.localeCompare(b,"zh-CN")}).slice(0,40).map(function(t){return '<button class="'+(activeLibraryTag===t?"active":"")+'" data-library-tag="'+esc(t)+'">'+esc(t)+' <small>'+allTags[t]+'</small></button>'}).join("");
  var dup=duplicateNumberMap(),list=cards.filter(function(c){var issues=quickCardIssues(c,dup),hasErr=issues.some(function(x){return x.level==="error"}),hasWarn=issues.some(function(x){return x.level==="warn"}),issueOk=issueFilter==="all"||(issueFilter==="ok"&&!issues.length)||(issueFilter==="error"&&hasErr)||(issueFilter==="warn"&&hasWarn)||(issueFilter==="missingArt"&&!hasCardArt(c));return (setId==="all"||c.setId===setId)&&(template==="all"||c.templateId===template)&&(f==="all"||c.faction===f)&&(ty==="all"||c.unitType===ty)&&(r==="all"||c.rarity===r)&&(status==="all"||c.workflowStatus===status)&&issueOk&&(!activeLibraryTag||splitTags(c.tags).concat(splitTags(c.rulesKeywords)).indexOf(activeLibraryTag)>=0)&&(!q||searchableText(c).indexOf(q)>=0)});
  list.sort(function(a,b){if(sort==="cost"||sort==="attack")return num(a[sort],0)-num(b[sort],0)||String(a.name).localeCompare(String(b.name),"zh-CN");if(sort==="name")return String(a.name).localeCompare(String(b.name),"zh-CN");return String(a.cardNumber||"~~~~").localeCompare(String(b.cardNumber||"~~~~"),"zh-CN")});
  var exactTerm=ruleTerms.find(function(t){var hay=[t.name,t.category,t.tags,t.description,(t.aliases||[]).join(" "),t.example,t.designNotes].join(" ").toLowerCase();return q&&hay.indexOf(q)>=0});
  if(exactTerm){$("#libraryTermInfo").hidden=false;$("#libraryTermInfo").innerHTML='<div class="term-definition-head"><i style="background:'+esc(exactTerm.color||"#38bdf8")+'"></i><b style="color:'+esc(exactTerm.color||"#38bdf8")+'">'+esc(exactTerm.name)+'</b><span>'+esc(exactTerm.category||"规则词条")+'</span></div><div>'+esc(exactTerm.description||"尚未填写说明")+'</div><small>检索标签：'+esc(exactTerm.tags||"无")+' · 使用 '+cardsUsingTerm(exactTerm.name).length+' 张卡牌</small>'}else{$("#libraryTermInfo").hidden=true;$("#libraryTermInfo").innerHTML=""}
  $("#libraryCount").textContent="找到 "+list.length+" / "+cards.length+" 张卡牌 · 对比栏 "+libraryCompareIds.length+" / 4";
  $("#libraryResults").innerHTML=list.map(function(c){var tags=splitTags(c.tags).concat(splitTags(c.rulesKeywords)),issues=quickCardIssues(c,dup),level=issues.some(function(x){return x.level==="error"})?"error":issues.length?"warn":"ok",art=cardArtData(c),t=cardTemplate(c);return '<article class="catalog-card '+level+'"><button class="catalog-main" data-library-card="'+c.id+'"><div class="catalog-art">'+(art?'<img loading="lazy" src="'+esc(art)+'" alt="">':'<span>缺插画</span>')+'<i>'+esc(c.rarity||"")+'</i></div><div class="catalog-body"><div class="lib-head"><strong>'+esc(c.name)+'</strong><span class="lib-number">'+esc(c.cardNumber||"未编号")+'</span></div><div class="lib-meta">'+esc(setDisplayName(c)||"未归属")+' · '+esc(t.name)+' · '+esc(c.faction)+' · '+esc(c.unitType)+'</div><div class="catalog-stats"><span>费 <b>'+esc(c.cost)+'</b></span><span>攻 <b>'+esc(c.attack)+'</b></span><span>血 <b>'+esc(c.health)+'</b></span><span>移 <b>'+esc(c.move)+'</b></span><span>射 <b>'+esc(c.range)+'</b></span></div><div class="lib-effect">'+renderRichText(c.description,c)+'</div><div class="lib-tags">'+tags.slice(0,8).map(function(tg){return '<span>'+esc(tg)+'</span>'}).join("")+'</div></div></button><div class="catalog-foot"><span class="check-pill '+level+'">'+(issues.length?issues.length+" 项检查":"检查通过")+'</span><span>'+esc(c.workflowStatus||"设计中")+'</span><button data-library-compare="'+c.id+'">'+(libraryCompareIds.indexOf(c.id)>=0?"✓ 已对比":"＋ 对比")+'</button></div></article>'}).join("");renderLibraryCompare();
}
function refreshLibraryFilters(){function opts(arr,label){return '<option value="all">'+label+'</option>'+Array.from(new Set(arr.filter(Boolean))).sort().map(function(x){return '<option value="'+esc(x)+'">'+esc(x)+'</option>'}).join("")}$("#librarySet").innerHTML='<option value="all">全部扩展包</option>'+projectSets.map(function(x){return '<option value="'+esc(x.id)+'">'+esc(x.code+' · '+x.name)+'</option>'}).join("");$("#libraryTemplate").innerHTML='<option value="all">全部卡牌模板</option>'+Object.keys(TEMPLATES).map(function(k){return '<option value="'+esc(k)+'">'+esc(TEMPLATES[k].name)+'</option>'}).join("");$("#libraryFaction").innerHTML=opts(cards.map(function(c){return c.faction}),"全部系别");$("#libraryType").innerHTML=opts(cards.map(function(c){return c.unitType}),"全部类型");$("#libraryRarity").innerHTML=opts(cards.map(function(c){return c.rarity}),"全部稀有度");$("#libraryStatus").innerHTML='<option value="all">全部生产状态</option>'+DATA_STATUSES.map(function(x){return '<option>'+esc(x)+'</option>'}).join("")}
$("#batchNumber").onclick=function(){var prefix=$("#numberPrefix").value,start=num($("#numberStart").value,1),visible=getVisibleCards(),list=visible.filter(function(c){return !isCardLocked(c)});if(!list.length){setStatus("没有可编号的未锁定卡牌");return}recordHistory();list.forEach(function(c,i){c.cardNumber=prefix+String(start+i).padStart(3,"0")});renderAll();setStatus("已生成 "+list.length+" 个稳定卡号；跳过 "+(visible.length-list.length)+" 张锁定卡")};
$("#openCardSearch").onclick=function(){activeLibraryTag="";refreshLibraryFilters();renderCardLibrary();$("#cardSearchModal").hidden=false};
$("#closeCardSearch").onclick=function(){$("#cardSearchModal").hidden=true};
$("#cardSearchModal").addEventListener("click",function(e){if(e.target===this)this.hidden=true});
["#librarySearch","#librarySet","#libraryTemplate","#libraryFaction","#libraryType","#libraryRarity","#libraryStatus","#libraryIssue","#librarySort"].forEach(function(q){$(q).addEventListener(q==="#librarySearch"?"input":"change",renderCardLibrary)});
$("#tagCloud").onclick=function(e){var b=e.target.closest("[data-library-tag]");if(!b)return;var t=b.getAttribute("data-library-tag");activeLibraryTag=activeLibraryTag===t?"":t;renderCardLibrary()};
$("#libraryResults").onclick=function(e){var cmp=e.target.closest("[data-library-compare]");if(cmp){var cid=cmp.getAttribute("data-library-compare"),i=libraryCompareIds.indexOf(cid);if(i>=0)libraryCompareIds.splice(i,1);else if(libraryCompareIds.length<4)libraryCompareIds.push(cid);else{setStatus("卡牌对比最多同时放入 4 张");return}renderCardLibrary();return}var b=e.target.closest("[data-library-card]");if(!b)return;selected=b.getAttribute("data-library-card");$("#cardSearchModal").hidden=true;renderAll();setStatus("已从卡牌图鉴定位："+current().name)};
$("#libraryComparePanel").onclick=function(e){if(e.target.hasAttribute("data-clear-library-compare")){libraryCompareIds=[];renderCardLibrary();return}var id=e.target.getAttribute("data-library-compare-remove");if(!id)return;libraryCompareIds=libraryCompareIds.filter(function(x){return x!==id});renderCardLibrary()};
function ttsCard(c,index){var set=projectSetById(c.setId);return {id:c.id,setId:c.setId||"",setName:set?set.name:c.setName,setCode:set?set.code:"",familyId:c.familyId||"",variantKind:c.variantKind||"标准",number:c.cardNumber||String(index+1).padStart(3,"0"),year:c.year,credit:c.credit,name:c.name,template:c.templateId,faction:c.faction,type:c.unitType,rarity:c.rarity,workflowStatus:c.workflowStatus||"设计中",cost:c.cost,stats:{attack:c.attack,health:c.health,move:c.move,range:c.range},tags:splitTags(c.tags),rulesKeywords:splitTags(c.rulesKeywords),text:c.description,termRefs:extractRuleTerms(c.description),searchText:searchableText(c),ruleBlocks:structuredRuleBlocks(c.description,c),statTokens:extractStatTokens(c.description),imageFile:String(index+1).padStart(3,"0")+"-"+safeFilename(c.name)+".png"}}
function bestTtsGrid(n){var best={cols:1,rows:n,score:1e9};for(var cols=1;cols<=10;cols++){var rows=Math.ceil(n/cols);if(rows>7)continue;var w=cols*400,h=rows*Math.round(400*CARD_TRIM_H_MM/CARD_TRIM_W_MM),score=Math.max(w,h)+Math.abs(w-h)*.15;if(score<best.score)best={cols:cols,rows:rows,score:score}}return best}
async function buildTtsCardPackage(list){
  var zip=new JSZip(),data=list.map(ttsCard),byTag={},byTerm={},byNumber={},byId={},sheetMaps=[];
  data.forEach(function(c){byId[c.id]=c.number;byNumber[c.number]=c.id;c.tags.concat(c.rulesKeywords).forEach(function(t){if(!byTag[t])byTag[t]=[];byTag[t].push(c.id)});c.termRefs.forEach(function(t){if(!byTerm[t])byTerm[t]=[];byTerm[t].push(c.id)})});
  zip.file("data/cards.json",JSON.stringify({format:"card-studio-tts",version:5,project:projectName,cards:data},null,2));
  zip.file("data/glossary.json",JSON.stringify({version:1,terms:ruleTerms},null,2));
  zip.file("data/index.json",JSON.stringify({byId:byId,byNumber:byNumber,byTag:byTag,byTerm:byTerm},null,2));
  zip.file("manifest.csv","\uFEFF"+Papa.unparse(manifestRows(list)));
  var cellW=400,cellH=Math.round(cellW*CARD_TRIM_H_MM/CARD_TRIM_W_MM),maxPer=70,backCache={},backFiles={},groups={};
  list.forEach(function(c){var b=cardBackAssetForCard(c),key=b?b.id:"__missing__";if(!groups[key])groups[key]=[];groups[key].push(c)});
  if(groups.__missing__&&groups.__missing__.length)throw new Error("TTS 导出被阻止：仍有 "+groups.__missing__.length+" 张卡没有可用卡背");
  var sheetIndex=0;
  for(var backId of Object.keys(groups)){
    var group=groups[backId],backAsset=assetById(backId),backFile="";
    if(backAsset){
      backFile="tts/backs/"+safeFilename(backAsset.name||backAsset.id)+"-"+backAsset.id.slice(0,8)+".png";
      if(!backFiles[backId]){var normalizedBack=await cardBackDataUrlForCard(group[0],cellW,cellH,backCache);zip.file(backFile,normalizedBack.split(",")[1],{base64:true});backFiles[backId]=backFile}else backFile=backFiles[backId];
    }
    for(var off=0;off<group.length;off+=maxPer,sheetIndex++){
      var part=group.slice(off,off+maxPer),grid=bestTtsGrid(part.length),cv=document.createElement("canvas");cv.width=grid.cols*cellW;cv.height=grid.rows*cellH;
      var ctx=cv.getContext("2d");ctx.fillStyle="#ffffff";ctx.fillRect(0,0,cv.width,cv.height);var mapping=[];
      for(var i=0;i<part.length;i++){
        setStatus("TTS 卡牌 Sheet "+(sheetIndex+1)+"："+(i+1)+" / "+part.length);
        var face=await captureTrimmed(part[i],cellW),im=await imageFromDataUrl(face),col=i%grid.cols,row=Math.floor(i/grid.cols);ctx.drawImage(im,col*cellW,row*cellH,cellW,cellH);
        mapping.push({slot:i,cardId:part[i].id,number:part[i].cardNumber,name:part[i].name,backRoute:cardBackRouteForCard(part[i])});
      }
      var file="tts/faces/sheet-"+String(sheetIndex+1).padStart(2,"0")+".png",sheetData=cv.toDataURL("image/png");zip.file(file,sheetData.split(",")[1],{base64:true});
      sheetMaps.push({file:file,backFile:backFile,backAssetId:backId,width:grid.cols,height:grid.rows,number:part.length,cell:{width:cellW,height:cellH},cards:mapping});
    }
  }
  var map={format:"card-studio-tts-sheets",version:3,project:projectName,generatedAt:new Date().toISOString(),rgb:true,trimSizeMm:[CARD_TRIM_W_MM,CARD_TRIM_H_MM],bleedMm:CARD_BLEED_MM,backStrategy:"per-sheet",backIsHidden:true,sheets:sheetMaps};
  zip.file("tts/deck-map.json",JSON.stringify(map,null,2));
  zip.file("README-TTS.txt","CardStudio TTS 卡牌包\n\n1. tts/faces/：已经按项目设置裁掉印刷出血的 RGB 卡面 Sheet。\n2. tts/backs/：按项目默认 / 类型 / Set 卡背策略生成的背面图片。\n3. tts/deck-map.json：每张 Sheet 单独记录 backFile、Width、Height、Number 与卡牌槽位映射。\n4. 不同卡背会自动拆成不同 Sheet，避免同一 TTS Custom Deck 混用背面。\n");
  return zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}})
}
$("#exportTTS").onclick=async function(){var btn=this;btn.disabled=true;setStatus("正在生成 TTS 卡牌包……");try{var blob=await buildTtsCardPackage(cards),url=URL.createObjectURL(blob);download(url,safeFilename(projectName)+"-TTS-card-pack.zip");setTimeout(function(){URL.revokeObjectURL(url)},300000);setStatus("TTS 卡牌包完成："+cards.length+" 张；已按卡背策略自动拆分 Sheet 并生成数据映射")}catch(e){setStatus("TTS 导出失败："+e.message)}btn.disabled=false};

$("#batchPngZip").onclick=async function(){
  var list=getVisibleCards();if(!list.length)return;var btn=this;btn.disabled=true;setStatus("正在打包 PNG...");
  try{
    var zip=new JSZip();
    for(var i=0;i<list.length;i++){
      setStatus("PNG 打包 "+(i+1)+"/"+list.length);
      var data=await capture(list[i],"png");
      zip.file(String(i+1).padStart(3,"0")+"-"+safeFilename(list[i].name)+".png",data.split(",")[1],{base64:true});
    }
    zip.file("manifest.csv","\uFEFF"+Papa.unparse(manifestRows(list)));
    var blob=await zip.generateAsync({type:"blob"}),url=URL.createObjectURL(blob);download(url,"卡牌PNG-300dpi.zip");setTimeout(function(){URL.revokeObjectURL(url)},300000);setStatus("PNG ZIP 完成："+list.length+" 张");
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
    zip.file("manifest.csv","\uFEFF"+Papa.unparse(manifestRows(list)));
    var blob=await zip.generateAsync({type:"blob"}),url=URL.createObjectURL(blob);download(url,safeFilename(projectName)+"-JPG-300dpi.zip");setTimeout(function(){URL.revokeObjectURL(url)},300000);setStatus("JPG ZIP 完成："+list.length+" 张");
  }catch(e){setStatus("JPG ZIP 失败："+e.message)}
  btn.disabled=false;
};




// ---------- 3.0 Alpha 2 project design system + custom field schema ----------
function fillDesignSystem(){
  $("#designLayoutStep").value=String(projectDesign.layoutStep);
  $("#designSnapTolerance").value=projectDesign.snapTolerance;
  $("#designAxisTolerance").value=projectDesign.axisTolerancePx;
  $("#designOpticalTolerance").value=projectDesign.opticalTolerancePx==null ? .35 : projectDesign.opticalTolerancePx;
  $("#designOpticalCentering").checked=projectDesign.opticalCentering!==false;
  $("#designSafeMargin").value=projectDesign.safeContentMm==null?3:projectDesign.safeContentMm;
  $("#designBleedMm").value=projectDesign.bleedMm==null?3:projectDesign.bleedMm;
  $("#designTargetPrintDpi").value=projectDesign.targetPrintDpi==null?300:projectDesign.targetPrintDpi;
  $("#designMinimumPrintDpi").value=projectDesign.minimumPrintDpi==null?220:projectDesign.minimumPrintDpi;
  $("#designTitleMinFont").value=projectDesign.titleMinFont;
  $("#designEffectMinFont").value=projectDesign.effectMinFont;
  $("#designRuleLineHeight").value=projectDesign.ruleLineHeight==null?1.34:projectDesign.ruleLineHeight;
  $("#designRuleBlockGap").value=projectDesign.ruleBlockGapEm==null?.18:projectDesign.ruleBlockGapEm;
  $("#designRuleStyle").value=projectDesign.ruleStyle||"pill";
  $("#designRuleIconBaseline").value=projectDesign.ruleIconBaselineEm==null?-.04:projectDesign.ruleIconBaselineEm;
  $("#designRuleTailChars").value=projectDesign.ruleTailChars==null?4:projectDesign.ruleTailChars;
  $("#designRuleWidowControl").checked=projectDesign.ruleWidowControl!==false;
  $("#designArtSubjectSafe").value=projectDesign.artSubjectSafePct==null?10:projectDesign.artSubjectSafePct;
  $("#designPrimary").value=projectDesign.primary;
  $("#designSecondary").value=projectDesign.secondary;
  $("#designAccent").value=projectDesign.accent;
  $("#designText").value=projectDesign.text;
  $("#designFontStyle").value=projectDesign.fontStyle||"default";
}
function openDesignSystem(){fillDesignSystem();$("#designSystemModal").hidden=false}
$("#openDesignSystem").onclick=openDesignSystem;
$("#closeDesignSystem").onclick=function(){$("#designSystemModal").hidden=true};
$("#designSystemModal").addEventListener("click",function(e){if(e.target===this)this.hidden=true});
$("#saveDesignSystem").onclick=function(){
  recordHistory();
  projectDesign=Object.assign({},projectDesign,{
    bleedMm:Math.max(0,Math.min(10,num($("#designBleedMm").value,3))),
    layoutStep:Math.max(.01,Math.min(.5,num($("#designLayoutStep").value,.05))),
    snapTolerance:Math.max(.05,Math.min(3,num($("#designSnapTolerance").value,.7))),
    axisTolerancePx:Math.max(.05,Math.min(3,num($("#designAxisTolerance").value,.45))),
    opticalTolerancePx:Math.max(.05,Math.min(2,num($("#designOpticalTolerance").value,.35))),
    opticalCentering:!!$("#designOpticalCentering").checked,
    safeMargin:projectDesign.safeMargin,
    safeContentMm:Math.max(0,Math.min(10,num($("#designSafeMargin").value,3))),
    targetPrintDpi:Math.max(150,Math.min(1200,num($("#designTargetPrintDpi").value,300))),
    minimumPrintDpi:Math.max(72,Math.min(1200,num($("#designMinimumPrintDpi").value,220))),
    titleMinFont:Math.max(5,Math.min(30,num($("#designTitleMinFont").value,8))),
    effectMinFont:Math.max(6,Math.min(30,num($("#designEffectMinFont").value,9))),
    ruleLineHeight:Math.max(1,Math.min(2,num($("#designRuleLineHeight").value,1.34))),
    ruleBlockGapEm:Math.max(0,Math.min(1,num($("#designRuleBlockGap").value,.18))),
    ruleStyle:["pill","editorial","minimal"].indexOf($("#designRuleStyle").value)>=0?$("#designRuleStyle").value:"pill",
    ruleIconBaselineEm:Math.max(-.4,Math.min(.4,num($("#designRuleIconBaseline").value,-.04))),
    ruleTailChars:Math.max(0,Math.min(10,Math.round(num($("#designRuleTailChars").value,4)))),
    ruleWidowControl:!!$("#designRuleWidowControl").checked,
    artSubjectSafePct:Math.max(0,Math.min(30,num($("#designArtSubjectSafe").value,10))),
    primary:$("#designPrimary").value,secondary:$("#designSecondary").value,accent:$("#designAccent").value,text:$("#designText").value,fontStyle:$("#designFontStyle").value
  });
  if(projectDesign.minimumPrintDpi>projectDesign.targetPrintDpi)projectDesign.minimumPrintDpi=projectDesign.targetPrintDpi;
  ["X","Y","W","H","R"].forEach(function(k){var el=$("#el"+k);if(el)el.step=String(projectDesign.layoutStep)});
  Object.keys(templateLayouts).forEach(function(tid){quantizeLayout(templateLayouts[tid])});cards.forEach(function(c){quantizeLayout(c.layout);enforceTitleAxis(c.layout)});
  renderAll();setStatus("项目设计变量已保存：坐标、文字、毫米几何与素材 DPI 检查使用同一套精度标准");
};
$("#applyDesignThemeAll").onclick=function(){
  recordHistory();cards.forEach(function(c){var a=normalizeAppearance(c.appearance);a.primary=projectDesign.primary;a.secondary=projectDesign.secondary;a.accent=projectDesign.accent;a.text=projectDesign.text;a.fontStyle=projectDesign.fontStyle;a.titleColor=projectDesign.text;a.effectColor=projectDesign.text;a.metaColor=projectDesign.text;a.statsColor=projectDesign.text;c.appearance=a});
  renderAll();setStatus("项目颜色与默认字体已应用到全部 "+cards.length+" 张卡牌");
};

function fieldSchemaRangeText(f){
  if(f.type==="select")return (f.options||[]).join(",");
  if(f.type==="number")return [f.min==null?"":f.min,f.max==null?"":f.max].join(",");
  return "";
}
function renderFieldSchemaEditor(){
  var body=$("#schemaFieldRows");if(!body)return;$("#schemaCount").textContent=fieldSchema.length+" 个自定义字段";
  body.innerHTML=fieldSchema.length?fieldSchema.map(function(f){return '<tr data-schema-row="'+f.id+'"><td><select data-schema-prop="tpl"><option value="">全部模板</option>'+Object.keys(TEMPLATES).map(function(tid){return '<option value="'+esc(tid)+'" '+(f.tpl===tid?'selected':'')+'>'+esc(TEMPLATES[tid].name)+'</option>'}).join('')+'</select></td><td><input data-schema-prop="label" value="'+esc(f.label)+'"></td><td><input data-schema-prop="key" value="'+esc(f.key)+'"></td><td><select data-schema-prop="type"><option value="text"'+(f.type==="text"?" selected":"")+'>文本</option><option value="number"'+(f.type==="number"?" selected":"")+'>数字</option><option value="select"'+(f.type==="select"?" selected":"")+'>选项</option><option value="boolean"'+(f.type==="boolean"?" selected":"")+'>是/否</option><option value="cardRef"'+(f.type==="cardRef"?" selected":"")+'>卡牌引用</option></select></td><td class="schema-check"><input data-schema-prop="required" type="checkbox" '+(f.required?"checked":"")+'></td><td><input data-schema-prop="range" value="'+esc(fieldSchemaRangeText(f))+'" placeholder="'+(f.type==="select"?"选项A,选项B":f.type==="number"?"最小,最大":"—")+'"></td><td><input data-schema-prop="defaultValue" value="'+esc(f.defaultValue)+'"></td><td><button data-schema-delete="'+f.id+'">删除</button></td></tr>'}).join(""):'<tr><td colspan="8"><div class="empty-note">还没有项目自定义字段。建立后会自动进入卡牌编辑、数据表、变量、条件显示、导入导出和项目检查。</div></td></tr>';
}
function openFieldSchema(){renderFieldSchemaEditor();$("#fieldSchemaModal").hidden=false}
$("#openFieldSchema").onclick=openFieldSchema;$("#openFieldSchemaInline").onclick=openFieldSchema;
$("#closeFieldSchema").onclick=function(){$("#fieldSchemaModal").hidden=true};
$("#fieldSchemaModal").addEventListener("click",function(e){if(e.target===this)this.hidden=true});
$("#addSchemaField").onclick=function(){
  recordHistory();var n=fieldSchema.length+1,key="custom_"+n;while(fieldDefByKey(key))key="custom_"+(++n);
  fieldSchema.push({id:uid(),key:key,label:"自定义字段 "+(fieldSchema.length+1),type:"text",required:false,options:[],min:null,max:null,defaultValue:"",tpl:current()&&current().templateId||""});
  cards.forEach(function(c){if(!c.customFields)c.customFields={}});renderFieldSchemaEditor();renderVariableButtons();renderCustomFieldInputs();persist();setStatus("已新增字段结构；可直接修改名称与键名");
};
$("#schemaFieldRows").addEventListener("change",function(e){
  var row=e.target.closest("[data-schema-row]");if(!row)return;var f=fieldSchema.find(function(x){return x.id===row.getAttribute("data-schema-row")});if(!f)return;var prop=e.target.getAttribute("data-schema-prop");if(!prop)return;
  recordHistory();
  if(prop==="required")f.required=!!e.target.checked;
  else if(prop==="key"){
    var old=f.key,next=safeFieldKey(e.target.value);if(!next){e.target.value=old;setStatus("字段键名不能为空");return}
    var conflict=fieldSchema.some(function(x){return x.id!==f.id&&x.key===next})||Object.values(vars).indexOf(next)>=0;
    if(conflict){e.target.value=old;setStatus("字段键名已存在或与内置字段冲突："+next);return}
    f.key=next;cards.forEach(function(c){if(!c.customFields)c.customFields={};if(c.customFields[old]!==undefined&&c.customFields[next]===undefined)c.customFields[next]=c.customFields[old];delete c.customFields[old]});Object.keys(templateConditions).forEach(function(tid){Object.keys(templateConditions[tid]||{}).forEach(function(k){var cond=templateConditions[tid][k];if(cond&&cond.field==="custom:"+old)cond.field="custom:"+next})});
  }else if(prop==="range"){
    if(f.type==="select")f.options=String(e.target.value||"").split(/[,，]/).map(function(x){return x.trim()}).filter(Boolean);
    else if(f.type==="number"){var bits=String(e.target.value||"").split(/[,，]/);f.min=bits[0]===""||bits[0]==null?null:Number(bits[0]);f.max=bits[1]===""||bits[1]==null?null:Number(bits[1]);if(!Number.isFinite(f.min))f.min=null;if(!Number.isFinite(f.max))f.max=null}
  }else{f[prop]=e.target.value;if(prop==="type"&&f.type!=="select")f.options=[]}
  fieldSchema=normalizeFieldSchema(fieldSchema);
  var fresh=fieldSchema.find(function(x){return x.id===f.id});
  if(fresh&&prop==="type"){var range=row.querySelector('[data-schema-prop="range"]');if(range){range.value=fieldSchemaRangeText(fresh);range.placeholder=fresh.type==="select"?"选项A,选项B":fresh.type==="number"?"最小,最大":"—"}}
  if(fresh&&prop==="key")e.target.value=fresh.key;
  renderVariableButtons();renderCustomFieldInputs();renderLayoutComponents();renderPreviewOnly();renderProjectSummary();persist();setStatus("字段结构已更新");
});
$("#schemaFieldRows").addEventListener("click",function(e){
  var id=e.target.getAttribute("data-schema-delete");if(!id)return;var f=fieldSchema.find(function(x){return x.id===id});if(!f)return;recordHistory();fieldSchema=fieldSchema.filter(function(x){return x.id!==id});renderFieldSchemaEditor();renderVariableButtons();renderCustomFieldInputs();renderPreviewOnly();renderProjectSummary();persist();setStatus("已移除字段结构“"+f.label+"”；卡牌中的旧值仍保留在项目数据中");
});

// ---------- 3.0 Alpha 4 project hub: sets / families / playtest / versions ----------
var activeHubTab="overview",hubActiveSetId="";
function setOptionHtml(value){return '<option value="">未归属扩展包</option>'+projectSets.map(function(s){return '<option value="'+esc(s.id)+'" '+(s.id===value?'selected':'')+'>'+esc(s.code+' · '+s.name+(s.locked?' 🔒':''))+'</option>'}).join("")}
function projectPlaytestSummary(){var sessions=0,plays=0,wins=0;playtests.forEach(function(x){sessions+=num(x.sessions,0);plays+=num(x.plays,0);wins+=num(x.wins,0)});return {records:playtests.length,sessions:sessions,plays:plays,wins:wins,winRate:plays?wins/plays:null}}
function median(values){if(!values.length)return 0;var a=values.slice().sort(function(x,y){return x-y}),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function numericSummary(list,key){var a=list.map(function(c){return Number(c[key])}).filter(Number.isFinite);if(!a.length)return {n:0,mean:0,median:0,min:0,max:0,sd:0};var mean=a.reduce(function(x,y){return x+y},0)/a.length,variance=a.reduce(function(x,y){return x+Math.pow(y-mean,2)},0)/a.length;return {n:a.length,mean:mean,median:median(a),min:Math.min.apply(null,a),max:Math.max.apply(null,a),sd:Math.sqrt(variance)}}
function fmtStat(n){return Number(n).toFixed(Math.abs(n)>=10?1:2).replace(/\.00$/,"").replace(/(\.\d)0$/,"$1")}
function projectVersionCard(c){return {id:c.id,name:c.name,cardNumber:c.cardNumber,templateId:c.templateId,setId:c.setId||"",familyId:c.familyId||"",variantKind:c.variantKind||"标准",variantOf:c.variantOf||"",releaseLocked:!!c.releaseLocked,workflowStatus:c.workflowStatus,cost:c.cost,faction:c.faction,unitType:c.unitType,rarity:c.rarity,attack:c.attack,health:c.health,move:c.move,range:c.range,description:c.description,tags:c.tags,rulesKeywords:c.rulesKeywords,year:c.year,credit:c.credit,artPrompt:c.artPrompt||"",customFields:clone(c.customFields||{}),artAssetId:c.artAssetId||"",appearance:clone(c.appearance||{}),badgeOffsets:clone(c.badgeOffsets||{}),textStyles:clone(c.textStyles||{}),layout:clone(c.layout),layoutOverrides:clone(c.layoutOverrides||{}),extraElements:clone(c.extraElements||[])}}
function projectVersionState(){return {schemaVersion:20,projectName:projectName,cards:cards.map(projectVersionCard),projectSets:clone(projectSets),cardFamilies:clone(cardFamilies),fieldSchema:clone(fieldSchema),templateLayouts:clone(templateLayouts),templateConditions:clone(templateConditions),layoutComponents:clone(layoutComponents),templateBadgeStyles:clone(templateBadgeStyles),cardBackProfiles:clone(cardBackProfiles),projectDesign:clone(projectDesign),ruleTerms:clone(ruleTerms),printSettings:clone(printSettings)}}
function createProjectVersion(label,note){var v={id:uid(),label:String(label||("版本 "+(projectVersions.length+1))),note:String(note||""),time:new Date().toISOString(),state:projectVersionState()};projectVersions.unshift(v);projectVersions=projectVersions.slice(0,24);persist();return v}
function diffObject(a,b,prefix,out){a=a||{};b=b||{};var keys=Array.from(new Set(Object.keys(a).concat(Object.keys(b))));keys.forEach(function(k){var p=prefix?prefix+"."+k:k,av=a[k],bv=b[k];if(av&&bv&&typeof av==="object"&&typeof bv==="object"&&!Array.isArray(av)&&!Array.isArray(bv)){diffObject(av,bv,p,out);return}if(JSON.stringify(av)!==JSON.stringify(bv))out.push({field:p,before:av,after:bv})})}
function diffProjectVersion(version){var old=(version&&version.state&&version.state.cards)||[],oldMap={},curMap={},rows=[];old.forEach(function(c){oldMap[c.id]=c});cards.map(projectVersionCard).forEach(function(c){curMap[c.id]=c});Object.keys(curMap).forEach(function(id){if(!oldMap[id])rows.push({type:"added",card:curMap[id],changes:[]});else{var changes=[];diffObject(oldMap[id],curMap[id],"",changes);if(changes.length)rows.push({type:"changed",card:curMap[id],changes:changes})}});Object.keys(oldMap).forEach(function(id){if(!curMap[id])rows.push({type:"removed",card:oldMap[id],changes:[]})});return rows}
function diffProjectStructure(version){var state=version&&version.state||{},out=[];diffObject(state.projectSets||[],projectSets,"projectSets",out);diffObject(state.cardFamilies||[],cardFamilies,"cardFamilies",out);diffObject(state.fieldSchema||[],fieldSchema,"fieldSchema",out);diffObject(state.templateLayouts||{},templateLayouts,"templateLayouts",out);diffObject(state.templateConditions||{},templateConditions,"templateConditions",out);diffObject(state.layoutComponents||[],layoutComponents,"layoutComponents",out);diffObject(state.templateBadgeStyles||{},templateBadgeStyles,"templateBadgeStyles",out);diffObject(state.cardBackProfiles||{byTemplate:{},bySet:{}},cardBackProfiles,"cardBackProfiles",out);diffObject(state.projectDesign||{},projectDesign,"projectDesign",out);diffObject(state.ruleTerms||[],ruleTerms,"ruleTerms",out);diffObject(state.printSettings||{sheet:"a4",crop:true,duplexFlip:"long",backRotate:false},printSettings,"printSettings",out);return out}
function familyCorePayload(c){return {name:c.name,cost:c.cost,faction:c.faction,description:c.description,attack:c.attack,health:c.health,move:c.move,range:c.range,unitType:c.unitType,rarity:c.rarity,tags:c.tags,rulesKeywords:c.rulesKeywords,customFields:clone(c.customFields||{})}}
function applyFamilyCore(target,p){Object.keys(p).forEach(function(k){target[k]=clone(p[k])})}
function renderHubTabs(){$$('[data-hub-tab]').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-hub-tab')===activeHubTab)});$$('[data-hub-panel]').forEach(function(p){p.hidden=p.getAttribute('data-hub-panel')!==activeHubTab})}
function renderHubOverview(){var el=$("#hubOverviewStats");if(!el)return;var ready=cards.filter(function(c){return c.workflowStatus==="通过"||isCardLocked(c)}).length,locked=cards.filter(isCardLocked).length,ps=projectPlaytestSummary();el.innerHTML='<div><b>'+cards.length+'</b><span>卡牌</span></div><div><b>'+projectSets.length+'</b><span>扩展包</span></div><div><b>'+ready+'</b><span>可发布</span></div><div><b>'+locked+'</b><span>锁定</span></div><div><b>'+ps.records+'</b><span>测试记录</span></div><div><b>'+projectVersions.length+'</b><span>版本基线</span></div>';var statuses={};DATA_STATUSES.forEach(function(x){statuses[x]=0});cards.forEach(function(c){statuses[c.workflowStatus||"设计中"]=(statuses[c.workflowStatus||"设计中"]||0)+1});$("#hubWorkflow").innerHTML=Object.keys(statuses).map(function(k){var v=statuses[k],pct=cards.length?v/cards.length*100:0;return '<div class="hub-progress-row"><span>'+esc(k)+'</span><i><b style="width:'+pct+'%"></b></i><em>'+v+'</em></div>'}).join("");$("#hubSetSummary").innerHTML=projectSets.length?projectSets.map(function(set){var list=setCards(set.id),done=list.filter(function(c){return c.workflowStatus==="通过"||c.workflowStatus==="锁定"}).length;return '<button data-hub-set-jump="'+set.id+'"><strong>'+esc(set.code+' · '+set.name)+(set.locked?' 🔒':'')+'</strong><small>'+list.length+' 张 · '+done+' 可发布 · '+esc(set.status)+'</small></button>'}).join(""):'<div class="empty-note">尚未建立扩展包。旧项目中的“系列名”会自动迁移为扩展包。</div>';renderBalanceStats()}
function renderBalanceStats(){var box=$("#hubBalanceSummary");if(!box)return;var metrics=[["cost","费用"],["attack","攻击"],["health","生命"],["move","移动"],["range","射程"]],rows=metrics.map(function(m){var st=numericSummary(cards,m[0]);return '<tr><th>'+m[1]+'</th><td>'+st.n+'</td><td>'+fmtStat(st.mean)+'</td><td>'+fmtStat(st.median)+'</td><td>'+fmtStat(st.min)+' – '+fmtStat(st.max)+'</td><td>'+fmtStat(st.sd)+'</td></tr>'}).join("");var c=current(),peers=cards.filter(function(x){return x.id!==c.id&&x.templateId===c.templateId&&Number(x.cost)===Number(c.cost)}),compare=peers.length?metrics.slice(1).map(function(m){var st=numericSummary(peers,m[0]),v=Number(c[m[0]]);return '<span>'+m[1]+' '+fmtStat(v)+' <em>'+(v>=st.mean?'+':'')+fmtStat(v-st.mean)+'</em></span>'}).join(""):'<small>当前卡没有足够的同模板同费用参照。</small>';box.innerHTML='<table><thead><tr><th>指标</th><th>N</th><th>均值</th><th>中位数</th><th>范围</th><th>标准差</th></tr></thead><tbody>'+rows+'</tbody></table><div class="current-compare"><b>当前卡 vs 同模板同费用均值（'+peers.length+' 张参照）</b>'+compare+'</div>'}
function renderSetManager(){var box=$("#setList");if(!box)return;box.innerHTML=projectSets.length?projectSets.map(function(set){var n=setCards(set.id).length;return '<div class="set-row '+(set.id===hubActiveSetId?'active ':'')+(set.locked?'locked':'')+'" data-set-row="'+set.id+'"><button data-select-set="'+set.id+'"><strong>'+esc(set.code+' · '+set.name)+(set.locked?' 🔒':'')+'</strong><small>'+n+' 张 · '+esc(set.status)+(set.releaseDate?' · '+esc(set.releaseDate):'')+'</small></button><div><button data-number-set="'+set.id+'">自动编号</button><button data-build-set="'+set.id+'">构建三套成品</button><button data-lock-set="'+set.id+'">'+(set.locked?'解除锁定':'发布锁定')+'</button><button data-delete-set="'+set.id+'" '+(n?'disabled title="仍有卡牌归属此扩展包"':'')+'>删除</button></div></div>'}).join(""):'<div class="empty-note">还没有扩展包。创建后，卡牌编号、发布锁定和统计都会以扩展包为单位工作。</div>';var set=projectSetById(hubActiveSetId);if(set){$("#setNameInput").value=set.name;$("#setCodeInput").value=set.code;$("#setPrefixInput").value=set.numberPrefix;$("#setStartInput").value=set.numberStart;$("#setPaddingInput").value=set.numberPadding;$("#setDateInput").value=set.releaseDate;$("#setStatusInput").value=set.status;$("#saveSet").textContent="保存扩展包"}else{$("#saveSet").textContent="新建扩展包"}}
function renderFamilyPanel(){var c=current(),f=familyById(c.familyId),members=f?cardFamilyMembers(f.id):[];$("#currentDevCard").innerHTML='<b>'+esc(c.cardNumber?c.cardNumber+' · '+c.name:c.name)+'</b><small>'+esc(TEMPLATES[c.templateId].name)+' · '+esc(setDisplayName(c)||'未归属扩展包')+(isCardLocked(c)?' · 🔒 '+esc(lockReason(c)):'')+'</small>';$("#familyNameInput").value=f?f.name:c.name;$("#variantKind").value=(c.variantKind&&c.variantKind!=="标准")?c.variantKind:"异画";$("#familyInfo").innerHTML=f?'<b>'+esc(f.name)+'</b><small>'+members.length+' 个成员 · 基准卡：'+esc((cards.find(function(x){return x.id===f.baseCardId})||{}).name||'未设置')+'</small><div>'+members.map(function(x){return '<button data-family-card="'+x.id+'">'+esc((x.variantKind||'标准')+' · '+x.name)+(x.id===f.baseCardId?' ★':'')+'</button>'}).join('')+'</div>':'<div class="empty-note">当前卡还是独立卡。建立家族后可以创建异画 / Promo / Foil 变体，并显式同步核心数据。</div>';$("#createFamily").disabled=!!f;$("#createVariant").disabled=!f||isCardLocked(c);$("#syncFamilyCore").disabled=!f||isCardLocked(c);$("#detachFamily").disabled=!f||isCardLocked(c);$("#toggleCardLock").textContent=c.workflowStatus==="锁定"?'解除当前卡锁定':'锁定当前卡';$("#toggleCardLock").disabled=!!(projectSetById(c.setId)&&projectSetById(c.setId).locked)}
function renderPlaytests(){var c=current(),list=playtests.filter(function(x){return x.cardId===c.id}).sort(function(a,b){return String(b.date).localeCompare(String(a.date))}),sessions=list.reduce(function(n,x){return n+num(x.sessions,0)},0),plays=list.reduce(function(n,x){return n+num(x.plays,0)},0),wins=list.reduce(function(n,x){return n+num(x.wins,0)},0);$("#playtestSummary").innerHTML='<b>'+list.length+' 条记录</b><span>'+sessions+' 场 · '+plays+' 次使用'+(plays?' · '+(wins/plays*100).toFixed(1)+'% 记录胜率':'')+'</span>';$("#playtestList").innerHTML=list.length?list.map(function(x){return '<div class="playtest-row"><div><b>'+esc(x.date)+' · '+esc(x.rating)+'</b><small>'+x.sessions+' 场 · '+x.plays+' 次 · '+x.wins+' 胜</small><p>'+esc(x.note||'无测试备注')+'</p>'+(x.changeNote?'<em>调整依据：'+esc(x.changeNote)+'</em>':'')+'</div><button data-delete-playtest="'+x.id+'">删除</button></div>'}).join(""):'<div class="empty-note">当前卡还没有测试记录。</div>'}
function renderVersions(){var sel=$("#versionSelect"),old=sel.value;sel.innerHTML='<option value="">选择一个版本基线</option>'+projectVersions.map(function(v){return '<option value="'+v.id+'">'+esc(v.label+' · '+new Date(v.time).toLocaleString('zh-CN',{hour12:false}))+'</option>'}).join("");if(projectVersions.some(function(v){return v.id===old}))sel.value=old;$("#versionList").innerHTML=projectVersions.length?projectVersions.slice(0,12).map(function(v){return '<button data-version-select="'+v.id+'"><strong>'+esc(v.label)+'</strong><small>'+esc(v.note||'无备注')+' · '+esc(new Date(v.time).toLocaleString('zh-CN',{hour12:false}))+'</small></button>'}).join(""):'<div class="empty-note">还没有项目版本基线。大规模平衡调整、测试轮次结束或送印前都适合建立一个版本。</div>';$("#releaseHistory").innerHTML=releaseHistory.length?releaseHistory.slice(0,8).map(function(r){return '<div><b>'+esc(r.label)+'</b><small>'+esc(new Date(r.time).toLocaleString('zh-CN',{hour12:false}))+' · '+r.cardCount+' 张 · '+r.warnings+' 警告</small></div>'}).join(""):'<div class="empty-note">还没有正式发布构建记录。</div>'}
function renderProjectHub(){ensureSetCatalogFromCards();ensureFamilyIntegrity();renderHubTabs();renderHubOverview();renderSetManager();renderFamilyPanel();renderPlaytests();renderVersions()}
function openProjectHub(tab){activeHubTab=tab||activeHubTab||"overview";$("#projectHubModal").hidden=false;renderProjectHub()}
$("#openProjectHub").onclick=function(){openProjectHub("overview")};$("#closeProjectHub").onclick=function(){$("#projectHubModal").hidden=true};$("#projectHubModal").addEventListener("click",function(e){if(e.target===this)this.hidden=true});$("#hubTabs").onclick=function(e){var b=e.target.closest('[data-hub-tab]');if(!b)return;activeHubTab=b.getAttribute('data-hub-tab');renderHubTabs();if(activeHubTab==="overview")renderHubOverview();if(activeHubTab==="sets")renderSetManager();if(activeHubTab==="develop"){renderFamilyPanel();renderPlaytests()}if(activeHubTab==="versions")renderVersions()};$("#hubSetSummary").onclick=function(e){var b=e.target.closest('[data-hub-set-jump]');if(!b)return;hubActiveSetId=b.getAttribute('data-hub-set-jump');activeHubTab="sets";renderProjectHub()};
function productionAuditSample(list){var chosen=[],seen={};function add(c,reason){if(!c||seen[c.id])return;seen[c.id]=1;chosen.push({card:c,reason:reason})}if(!list.length)return [];add(list[0],"首张 / 编号起点");add(list[list.length-1],"末张 / 编号终点");add(list.slice().sort(function(a,b){return String(b.name||"").length-String(a.name||"").length})[0],"最长卡名");add(list.slice().sort(function(a,b){return String(b.description||"").length-String(a.description||"").length})[0],"最长规则");add(list.slice().sort(function(a,b){var da=artEffectiveDpi(a);var db=artEffectiveDpi(b);return (da==null?1e9:da)-(db==null?1e9:db)})[0],"最低插画 DPI");var templates={};list.forEach(function(c){if(!templates[c.templateId]){templates[c.templateId]=1;add(c,"模板代表 · "+(TEMPLATES[c.templateId]?TEMPLATES[c.templateId].name:c.templateId))}});var backs={};list.forEach(function(c){var b=cardBackAssetForCard(c),id=b&&b.id||"none";if(!backs[id]){backs[id]=1;add(c,"卡背策略代表 · "+cardBackRouteForCard(c))}});return chosen.slice(0,12)}
async function buildAuditContactSheet(sample){if(!sample.length)return null;var cellW=260,cellH=370,cols=4,rows=Math.ceil(sample.length/cols),cv=document.createElement("canvas");cv.width=cols*cellW;cv.height=rows*cellH;var ctx=cv.getContext("2d");ctx.fillStyle="#f8fafc";ctx.fillRect(0,0,cv.width,cv.height);for(var i=0;i<sample.length;i++){var item=sample[i],data=await captureTrimmed(item.card,220),img=await imageFromDataUrl(data),col=i%cols,row=Math.floor(i/cols),x=col*cellW+20,y=row*cellH+12;ctx.drawImage(img,x,y,220,Math.round(220*CARD_TRIM_H_MM/CARD_TRIM_W_MM));ctx.fillStyle="#0f172a";ctx.font="bold 13px sans-serif";ctx.fillText(String(i+1).padStart(2,"0")+" · "+String(item.card.name||"").slice(0,18),x,y+315);ctx.font="11px sans-serif";ctx.fillStyle="#475569";ctx.fillText(String(item.reason||"").slice(0,28),x,y+334)}return cv.toDataURL("image/png")}
async function buildSetPackage(set){
  var list=setCards(set.id);if(!list.length)throw new Error("该扩展包没有卡牌");
  var allIssues=runPreflight(),ids=new Set(list.map(function(c){return c.id})),issues=allIssues.filter(function(x){return !x.cardId||ids.has(x.cardId)}),errors=issues.filter(function(x){return x.level==="error"});
  if(errors.length){$("#preflightModal").hidden=false;throw new Error("Set 构建被阻止：当前扩展包或项目级检查仍有 "+errors.length+" 个错误") }
  var missingBack=cardsMissingBack(list);if(missingBack.length)throw new Error("Set 三套成品构建被阻止：仍有 "+missingBack.length+" 张卡没有可用卡背");
  var zip=new JSZip(),stamp=new Date().toISOString().replace(/[:.]/g,"-").slice(0,19),meta={format:"card-studio-set-release",version:5,schemaVersion:20,project:projectName,set:clone(set),builtAt:new Date().toISOString(),cardCount:list.length,warnings:issues.filter(function(x){return x.level==="warn"}).length,trimSizeMm:[CARD_TRIM_W_MM,CARD_TRIM_H_MM],bleedSizeMm:[CARD_BLEED_W_MM,CARD_BLEED_H_MM]};
  zip.file("set.json",JSON.stringify(meta,null,2));zip.file("manifest.csv","\uFEFF"+Papa.unparse(manifestRows(list)));zip.file("data/cards.json",JSON.stringify({project:projectName,setId:set.id,cards:list.map(releaseCardData)},null,2));zip.file("report/preflight.json",JSON.stringify({builtAt:meta.builtAt,issues:issues},null,2));
  var backMap={},backCache={},writtenBacks={};
  for(var i=0;i<list.length;i++){
    var c=list[i];setStatus("构建 "+set.code+"：卡面 "+(i+1)+" / "+list.length);var face=await capture(c,"png");zip.file("images/fronts/"+String(i+1).padStart(3,"0")+"-"+safeFilename(c.name)+".png",face.split(",")[1],{base64:true});
    var b=cardBackAssetForCard(c);if(b){var bf="images/backs/"+safeFilename(b.name||b.id)+"-"+b.id.slice(0,8)+".png";backMap[c.id]={assetId:b.id,file:bf,route:cardBackRouteForCard(c)};if(!writtenBacks[b.id]){var bd=await cardBackDataUrlForCard(c,744,Math.round(744*CARD_TRIM_H_MM/CARD_TRIM_W_MM),backCache);zip.file(bf,bd.split(",")[1],{base64:true});writtenBacks[b.id]=true}}else backMap[c.id]={assetId:"",file:"",route:"未设置卡背"};
  }
  zip.file("data/back-map.json",JSON.stringify(backMap,null,2));
  setStatus("构建 "+set.code+"：生成家庭 PnP……");var pnp=await buildPnpPdfDocument(list);zip.file("production/pnp/"+safeFilename(set.code)+"-PnP.pdf",pnp.output("blob"));
  setStatus("构建 "+set.code+"：生成专业印刷正反面……");var printOut=await buildDuplexPrintArtifacts(list);zip.file("production/print/fronts.pdf",printOut.fronts.output("blob"));zip.file("production/print/backs.pdf",printOut.backs.output("blob"));zip.file("production/print/imposition.json",JSON.stringify(printOut.imposition,null,2));
  setStatus("构建 "+set.code+"：生成 TTS 卡牌包……");var ttsBlob=await buildTtsCardPackage(list),ttsZip=await JSZip.loadAsync(ttsBlob);for(var ttsPath of Object.keys(ttsZip.files)){var entry=ttsZip.files[ttsPath];if(entry.dir)continue;zip.file("production/tts/"+ttsPath,await entry.async("uint8array"))}
  var audit=productionAuditSample(list),auditJson={setId:set.id,setCode:set.code,builtAt:meta.builtAt,samples:audit.map(function(x){return {cardId:x.card.id,cardNumber:x.card.cardNumber,name:x.card.name,reason:x.reason,artDpi:artEffectiveDpi(x.card),backRoute:cardBackRouteForCard(x.card)}})};zip.file("report/sample-audit.json",JSON.stringify(auditJson,null,2));var auditSheet=await buildAuditContactSheet(audit);if(auditSheet)zip.file("report/sample-audit.png",auditSheet.split(",")[1],{base64:true});
  zip.file("production/README.txt","同一个 Set 数据状态一次生成三套卡牌成品：\n- pnp：家庭测试，按项目当前成品尺寸拼版\n- print：69×94mm 含出血专业正反面 + 卡位映射\n- tts：无出血卡面 Sheet + 按卡背拆分映射\n- report/sample-audit：自动挑选最长卡名、最长规则、最低 DPI、不同模板/卡背代表卡供人工抽检\n");
  zip.file("README.txt","CardStudio Set Build\n\n本包只包含扩展包 "+set.code+" · "+set.name+" 的卡牌。\nimages/fronts：含项目当前出血的正面 PNG。\nimages/backs：按卡背策略去重后的当前成品尺寸卡背。\nproduction：由同一份 Set 数据一次生成 PnP / 专业印刷 / TTS 三套成品。\ndata/back-map.json：每张卡对应的卡背资源与策略。\nreport/preflight.json：本 Set + 项目级发布前检查结果。\n");
  return {blob:await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}}),stamp:stamp}
}
$("#saveSet").onclick=function(){var name=$("#setNameInput").value.trim(),code=$("#setCodeInput").value.trim().toUpperCase();if(!name||!code){setStatus("扩展包名称和代码不能为空");return}var duplicate=projectSets.find(function(x){return x.id!==hubActiveSetId&&x.code.toUpperCase()===code});if(duplicate){setStatus("扩展包代码重复："+code);return}recordHistory();var set=projectSetById(hubActiveSetId);if(!set){set={id:uid(),createdAt:new Date().toISOString(),locked:false,lockedAt:""};projectSets.push(set);hubActiveSetId=set.id}set.name=name;set.code=code;set.status=$("#setStatusInput").value;set.releaseDate=$("#setDateInput").value;set.numberPrefix=$("#setPrefixInput").value||code+"-";set.numberStart=Math.max(0,num($("#setStartInput").value,1));set.numberPadding=Math.max(1,Math.min(6,num($("#setPaddingInput").value,3)));setCards(set.id).forEach(function(c){c.setName=set.name});renderProjectHub();renderCard();renderList();persist();setStatus("扩展包已保存："+set.name)};$("#newSet").onclick=function(){hubActiveSetId="";$("#setNameInput").value="";$("#setCodeInput").value="";$("#setPrefixInput").value="";$("#setStartInput").value=1;$("#setPaddingInput").value=3;$("#setDateInput").value="";$("#setStatusInput").value="开发中";renderSetManager()};$("#setList").onclick=async function(e){var id=e.target.getAttribute("data-select-set")||e.target.getAttribute("data-number-set")||e.target.getAttribute("data-build-set")||e.target.getAttribute("data-lock-set")||e.target.getAttribute("data-delete-set");if(!id)return;var set=projectSetById(id);if(!set)return;if(e.target.hasAttribute("data-select-set")){hubActiveSetId=id;renderSetManager();return}if(e.target.hasAttribute("data-number-set")){if(set.locked){setStatus("已锁定扩展包不能重新编号");return}var list=setCards(id);if(!list.length){setStatus("该扩展包没有卡牌");return}if(!confirm("将按当前卡牌顺序重写“"+set.name+"”的 "+list.length+" 个编号，继续吗？"))return;recordHistory();list.forEach(function(c,i){c.cardNumber=(set.numberPrefix||set.code+"-")+String(set.numberStart+i).padStart(set.numberPadding,"0")});renderProjectHub();renderAll();setStatus("已按扩展包规则精确生成 "+list.length+" 个编号");return}if(e.target.hasAttribute("data-build-set")){var btn=e.target;btn.disabled=true;setStatus("正在构建扩展包 "+set.code+"……");try{var out=await buildSetPackage(set),url=URL.createObjectURL(out.blob);download(url,safeFilename(projectName)+"-"+safeFilename(set.code)+"-Set-"+out.stamp+".zip");setTimeout(function(){URL.revokeObjectURL(url)},300000);releaseHistory.unshift({id:uid(),time:new Date().toISOString(),label:"Set Build · "+set.code,type:"set",setId:set.id,cardCount:setCards(set.id).length,warnings:lastPreflightIssues.filter(function(x){return x.level==="warn"&&(!x.cardId||setCards(set.id).some(function(c){return c.id===x.cardId}))}).length,production:{sheet:printSettings.sheet,safeContentMm:Number(projectDesign.safeContentMm==null?3:projectDesign.safeContentMm),cardBackProfiles:clone(cardBackProfiles)}});releaseHistory=releaseHistory.slice(0,30);persist();renderProjectHub();setStatus("Set 构建完成："+set.code+" · "+setCards(set.id).length+" 张卡牌")}catch(err){setStatus(err.message)}btn.disabled=false;return}if(e.target.hasAttribute("data-lock-set")){recordHistory();set.locked=!set.locked;set.lockedAt=set.locked?new Date().toISOString():"";if(set.locked){set.status="已发布";createProjectVersion("锁定 "+set.code,"扩展包“"+set.name+"”发布锁定时自动建立的版本基线")}renderProjectHub();renderAll();setStatus(set.locked?("已发布锁定："+set.name):("已解除扩展包锁定："+set.name));return}if(e.target.hasAttribute("data-delete-set")){if(setCards(id).length)return;recordHistory();projectSets=projectSets.filter(function(x){return x.id!==id});if(hubActiveSetId===id)hubActiveSetId="";renderProjectHub();renderAll();setStatus("已删除空扩展包")}};
$("#createFamily").onclick=function(){var c=current();if(isCardLocked(c))return;recordHistory();var f={id:uid(),name:$("#familyNameInput").value.trim()||c.name,baseCardId:c.id,createdAt:new Date().toISOString()};cardFamilies.push(f);c.familyId=f.id;c.variantKind="标准";c.variantOf="";renderProjectHub();renderAll();setStatus("已建立卡牌家族："+f.name)};$("#createVariant").onclick=function(){var c=current(),f=familyById(c.familyId);if(!f||isCardLocked(c))return;recordHistory();var x=clone(c);x.id=uid();x.variantKind=$("#variantKind").value||"异画";x.variantOf=f.baseCardId;x.workflowStatus="设计中";x.releaseLocked=false;x.cardNumber="";cards.push(x);selected=x.id;renderProjectHub();renderAll();setStatus("已创建“"+x.variantKind+"”变体；图片和版式可以独立修改")};$("#syncFamilyCore").onclick=function(){var c=current(),f=familyById(c.familyId);if(!f||isCardLocked(c))return;var members=cardFamilyMembers(f.id),editable=members.filter(function(x){return x.id!==c.id&&!isCardLocked(x)});if(!editable.length){setStatus("家族中没有可同步的其他未锁定卡牌");return}recordHistory();var p=familyCorePayload(c);editable.forEach(function(x){applyFamilyCore(x,p)});f.name=c.name;renderProjectHub();renderAll();setStatus("已把核心数据同步到 "+editable.length+" 个家族变体；插画、编号、版式和发布状态保持独立")};$("#detachFamily").onclick=function(){var c=current();if(!c.familyId||isCardLocked(c))return;recordHistory();c.familyId="";c.variantKind="标准";c.variantOf="";ensureFamilyIntegrity();renderProjectHub();renderAll();setStatus("当前卡已脱离家族，成为独立卡牌")};$("#toggleCardLock").onclick=function(){var c=current(),set=projectSetById(c.setId);if(set&&set.locked){setStatus("当前卡由扩展包发布锁定控制，请先解除扩展包锁定");return}recordHistory();c.workflowStatus=c.workflowStatus==="锁定"?"通过":"锁定";if(c.workflowStatus==="锁定")createProjectVersion("锁定卡牌 · "+c.name,"单卡锁定时自动建立的版本基线");renderProjectHub();renderAll();setStatus(c.workflowStatus==="锁定"?"当前卡已锁定":"当前卡已解除锁定")};$("#familyInfo").onclick=function(e){var id=e.target.getAttribute("data-family-card");if(!id)return;selected=id;renderProjectHub();renderAll()};
$("#addPlaytest").onclick=function(){var c=current(),plays=Math.max(0,num($("#playtestPlays").value,0)),wins=Math.max(0,num($("#playtestWins").value,0));if(wins>plays){setStatus("测试记录中的胜场不能大于使用次数");return}recordHistory();playtests.unshift({id:uid(),cardId:c.id,date:$("#playtestDate").value||new Date().toISOString().slice(0,10),sessions:Math.max(0,num($("#playtestSessions").value,1)),plays:plays,wins:wins,rating:$("#playtestRating").value,note:$("#playtestNote").value.trim(),changeNote:$("#playtestChangeNote").value.trim(),createdAt:new Date().toISOString()});$("#playtestNote").value="";$("#playtestChangeNote").value="";renderProjectHub();persist();setStatus("已记录“"+c.name+"”的测试结果")};$("#playtestList").onclick=function(e){var id=e.target.getAttribute("data-delete-playtest");if(!id)return;recordHistory();playtests=playtests.filter(function(x){return x.id!==id});renderProjectHub();persist();setStatus("已删除测试记录")};
$("#createProjectVersion").onclick=function(){var label=$("#versionLabel").value.trim()||("版本 "+(projectVersions.length+1)),note=$("#versionNote").value.trim();recordHistory();createProjectVersion(label,note);$("#versionLabel").value="";$("#versionNote").value="";renderVersions();renderHubOverview();setStatus("已建立项目版本基线："+label)};$("#versionList").onclick=function(e){var b=e.target.closest('[data-version-select]');if(!b)return;$("#versionSelect").value=b.getAttribute('data-version-select');$("#compareVersion").click()};$("#compareVersion").onclick=function(){var v=projectVersions.find(function(x){return x.id===$("#versionSelect").value});if(!v){$("#versionDiff").innerHTML='<div class="empty-note">请选择一个版本基线。</div>';return}var rows=diffProjectVersion(v),structure=diffProjectStructure(v),added=rows.filter(function(x){return x.type==="added"}).length,removed=rows.filter(function(x){return x.type==="removed"}).length,changed=rows.filter(function(x){return x.type==="changed"}).length;$("#versionDiff").innerHTML='<div class="diff-summary"><b>'+changed+' 张修改</b><span>'+added+' 新增 · '+removed+' 删除 · '+structure.length+' 项项目结构变化</span></div>'+(structure.length?'<div class="diff-row changed"><b>项目结构</b><span>修改</span><small>'+structure.slice(0,12).map(function(x){return esc(x.field)+': '+esc(typeof x.before==='object'?JSON.stringify(x.before):x.before)+' → '+esc(typeof x.after==='object'?JSON.stringify(x.after):x.after)}).join('<br>')+(structure.length>12?'<br>…另 '+(structure.length-12)+' 项':'')+'</small></div>':'')+(rows.length?rows.slice(0,120).map(function(r){return '<div class="diff-row '+r.type+'"><b>'+esc(r.card.name||r.card.id)+'</b><span>'+({added:'新增',removed:'删除',changed:'修改'}[r.type])+'</span>'+(r.changes.length?'<small>'+r.changes.slice(0,8).map(function(x){return esc(x.field)+': '+esc(typeof x.before==='object'?JSON.stringify(x.before):x.before)+' → '+esc(typeof x.after==='object'?JSON.stringify(x.after):x.after)}).join('<br>')+(r.changes.length>8?'<br>…另 '+(r.changes.length-8)+' 项':'')+'</small>':'')+'</div>'}).join(''):(structure.length?'':'<div class="preflight-empty">✓ 当前项目与此版本基线没有结构差异</div>'))};

// ---------- 3.0 Alpha 11 visual review wall ----------
var reviewPage=0,reviewPageSize={comfortable:24,compact:40,dense:60};
function medianNumber(list){var a=(list||[]).filter(function(x){return Number.isFinite(x)}).slice().sort(function(x,y){return x-y});if(!a.length)return 0;var m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function visibleRuleLength(c){return String(c&&c.description||"").replace(/\[\[([^\]]+)\]\]/g,"$1").replace(/\{\{[^}]+\}\}/g,"X").replace(/\s+/g,"").length}
function reviewTemplateStats(){var out={};Object.keys(TEMPLATES).forEach(function(tid){var list=cards.filter(function(c){return c.templateId===tid});out[tid]={ruleMedian:medianNumber(list.map(visibleRuleLength)),titleMedian:medianNumber(list.map(function(c){return String(c.name||"").replace(/\s+/g,"").length}))}});return out}
function reviewAuditForCard(c,dupes,stats){var base=quickCardIssues(c,dupes),errors=base.filter(function(x){return x.level==="error"}).length,warns=base.filter(function(x){return x.level==="warn"}).length,overrides=Object.keys(ensureLayoutOverrides(c)||{}).length,textOverrides=Object.keys(c.textStyles||{}).length,ruleLen=visibleRuleLength(c),titleLen=String(c.name||"").replace(/\s+/g,"").length,st=stats[c.templateId]||{ruleMedian:0,titleMedian:0},dense=ruleLen>Math.max(90,(st.ruleMedian||0)*Math.max(1.2,num(projectDesign.reviewRuleDensityRatio,1.75))),longTitle=titleLen>Math.max(10,(st.titleMedian||0)*1.8),subj=artSubjectScreenPosition(c),artRisk=!!(subj&&!subj.safe),dpi=artEffectiveDpi(c),dpiRisk=dpi!=null&&dpi<dpiThresholds().target,layoutRisk=overrides>Math.max(1,num(projectDesign.reviewOverrideWarn,5));return {errors:errors,warns:warns,overrides:overrides,textOverrides:textOverrides,ruleLen:ruleLen,titleLen:titleLen,dense:dense,longTitle:longTitle,artRisk:artRisk,dpiRisk:dpiRisk,layoutRisk:layoutRisk,attention:errors*10+warns*3+(dense?2:0)+(longTitle?1:0)+(artRisk?3:0)+(dpiRisk?2:0)+(layoutRisk?2:0)}}
function reviewFilters(){return {q:String($("#reviewSearch")&&$("#reviewSearch").value||"").trim().toLowerCase(),setId:$("#reviewSet")?$("#reviewSet").value:"all",template:$("#reviewTemplate")?$("#reviewTemplate").value:"all",status:$("#reviewStatus")?$("#reviewStatus").value:"all",focus:$("#reviewFocus")?$("#reviewFocus").value:"all",sort:$("#reviewSort")?$("#reviewSort").value:"order",density:$("#reviewDensity")?$("#reviewDensity").value:"compact"}}
function fillReviewFilters(){var set=$("#reviewSet"),tpl=$("#reviewTemplate"),status=$("#reviewStatus");if(!set||!tpl||!status)return;var oldS=set.value||"all",oldT=tpl.value||"all",oldW=status.value||"all";set.innerHTML='<option value="all">全部扩展包</option>'+projectSets.map(function(s){return '<option value="'+esc(s.id)+'">'+esc(s.code+" · "+s.name)+'</option>'}).join("");tpl.innerHTML='<option value="all">全部模板</option>'+Object.keys(TEMPLATES).map(function(k){return '<option value="'+esc(k)+'">'+esc(TEMPLATES[k].name)+'</option>'}).join("");status.innerHTML='<option value="all">全部状态</option>'+DATA_STATUSES.map(function(x){return '<option value="'+esc(x)+'">'+esc(x)+'</option>'}).join("");set.value=projectSetById(oldS)?oldS:"all";tpl.value=TEMPLATES[oldT]?oldT:"all";status.value=DATA_STATUSES.indexOf(oldW)>=0?oldW:"all"}
function reviewFilteredCards(){var f=reviewFilters(),dupes=duplicateNumberMap(),stats=reviewTemplateStats(),list=cards.map(function(c,i){return {card:c,index:i,audit:reviewAuditForCard(c,dupes,stats)}}).filter(function(row){var c=row.card,a=row.audit;if(f.q&&searchableText(c).indexOf(f.q)<0)return false;if(f.setId!=="all"&&c.setId!==f.setId)return false;if(f.template!=="all"&&c.templateId!==f.template)return false;if(f.status!=="all"&&c.workflowStatus!==f.status)return false;if(f.focus==="issues"&&!(a.errors||a.warns||a.dense||a.longTitle||a.artRisk||a.layoutRisk))return false;if(f.focus==="overrides"&&!a.overrides&&!a.textOverrides)return false;if(f.focus==="dense"&&!a.dense)return false;if(f.focus==="art"&&!a.artRisk&&!a.dpiRisk&&!(!hasCardArt(c)))return false;return true});if(f.sort==="issues")list.sort(function(a,b){return b.audit.attention-a.audit.attention||a.index-b.index});else if(f.sort==="rules")list.sort(function(a,b){return b.audit.ruleLen-a.audit.ruleLen||a.index-b.index});else if(f.sort==="name")list.sort(function(a,b){return String(a.card.name||"").localeCompare(String(b.card.name||""),"zh-CN")});return list}
function reviewBadges(row){var a=row.audit,out=[];if(a.errors)out.push('<i class="review-flag error">'+a.errors+' 错误</i>');if(a.warns)out.push('<i class="review-flag warn">'+a.warns+' 警告</i>');if(a.dense)out.push('<i class="review-flag density">规则密</i>');if(a.longTitle)out.push('<i class="review-flag density">长标题</i>');if(a.artRisk)out.push('<i class="review-flag warn">主体边缘</i>');if(a.dpiRisk)out.push('<i class="review-flag warn">DPI</i>');if(a.overrides)out.push('<i class="review-flag override">'+a.overrides+' 覆盖</i>');if(!out.length)out.push('<i class="review-flag ok">一致</i>');return out.join("")}
var reviewHydrationToken=0;
function hydrateReviewWallCards(){var token=++reviewHydrationToken,items=Array.prototype.slice.call($("#reviewGrid").querySelectorAll('[data-review-card]')),i=0;function step(){if(token!==reviewHydrationToken)return;var end=Math.min(items.length,i+6);for(;i<end;i++){var item=items[i],c=cards.find(function(x){return x.id===item.getAttribute('data-review-card')});if(!c)continue;var host=item.querySelector('.review-card-host');setArt(host,c);fitTitleToBox(host,c);fitEffectToBox(host,c);item.classList.add("hydrated")}if(i<items.length)requestAnimationFrame(step)}requestAnimationFrame(step)}
function renderReviewWall(resetPage){if(resetPage)reviewPage=0;fillReviewFilters();var list=reviewFilteredCards(),f=reviewFilters(),size=reviewPageSize[f.density]||40,pages=Math.max(1,Math.ceil(list.length/size));reviewPage=Math.max(0,Math.min(reviewPage,pages-1));var page=list.slice(reviewPage*size,reviewPage*size+size),errors=list.filter(function(r){return r.audit.errors}).length,visual=list.filter(function(r){return r.audit.dense||r.audit.longTitle||r.audit.artRisk||r.audit.layoutRisk}).length,overrides=list.filter(function(r){return r.audit.overrides||r.audit.textOverrides}).length;$("#reviewSummary").innerHTML='<div><b>'+list.length+'</b><span>当前范围</span></div><div><b>'+errors+'</b><span>含错误</span></div><div><b>'+visual+'</b><span>视觉复核</span></div><div><b>'+overrides+'</b><span>存在局部覆盖</span></div>';var grid=$("#reviewGrid");grid.className="review-grid density-"+f.density;grid.innerHTML=page.length?page.map(function(row){var c=row.card,t=cardTemplate(c),set=projectSetById(c.setId);return '<article class="review-card-item '+(c.id===selected?'selected':'')+'" data-review-card="'+esc(c.id)+'"><div class="review-card-canvas"><div class="review-card-host">'+cardHtml(c,false)+'</div></div><div class="review-card-meta"><div><b>'+esc(c.name)+'</b><small>'+esc((c.cardNumber?c.cardNumber+' · ':'')+t.short+(set?' · '+set.code:''))+'</small></div><div class="review-flags">'+reviewBadges(row)+'</div></div></article>'}).join(""):'<div class="review-empty">当前筛选没有卡牌。</div>';hydrateReviewWallCards();$("#reviewPageInfo").textContent="第 "+(reviewPage+1)+" / "+pages+" 页 · 每页 "+size+" 张";$("#reviewPrev").disabled=reviewPage<=0;$("#reviewNext").disabled=reviewPage>=pages-1}
function openReviewWall(){reviewPage=0;$("#reviewWallModal").hidden=false;renderReviewWall(true);setStatus("已打开全套卡牌审阅墙：先看整套节奏，再进入单卡精调")}
$("#openReviewWall").onclick=openReviewWall;$("#reviewWallQuick").onclick=openReviewWall;$("#closeReviewWall").onclick=function(){$("#reviewWallModal").hidden=true};$("#reviewWallModal").addEventListener("click",function(e){if(e.target===this)this.hidden=true});["reviewSearch","reviewSet","reviewTemplate","reviewStatus","reviewFocus","reviewSort","reviewDensity"].forEach(function(id){var el=$("#"+id);if(el)el.addEventListener(id==="reviewSearch"?"input":"change",function(){renderReviewWall(true)})});$("#reviewPrev").onclick=function(){reviewPage=Math.max(0,reviewPage-1);renderReviewWall(false)};$("#reviewNext").onclick=function(){reviewPage++;renderReviewWall(false)};$("#reviewGrid").addEventListener("click",function(e){var item=e.target.closest('[data-review-card]');if(!item)return;selected=item.getAttribute('data-review-card');this.querySelectorAll('.review-card-item').forEach(function(x){x.classList.toggle('selected',x===item)});setStatus("审阅选中："+current().name+"；双击可回到编辑器")});$("#reviewGrid").addEventListener("dblclick",function(e){var item=e.target.closest('[data-review-card]');if(!item)return;selected=item.getAttribute('data-review-card');$("#reviewWallModal").hidden=true;renderAll();setStatus("已从审阅墙定位："+current().name)});

// ---------- 3.0 data table + preflight workspaces ----------
var DATA_STATUSES=["概念","设计中","待插画","待测试","测试中","待调整","通过","锁定"],dataSelection={},lastPreflightIssues=[],dataTablePage=0;
function duplicateNumberMap(){var m={};cards.forEach(function(c){var n=String(c.cardNumber||"").trim();if(n){if(!m[n])m[n]=[];m[n].push(c.id)}});return m}
function customFieldValidation(c){
  var out=[];schemaForCard(c).forEach(function(f){var v=customFieldValue(c,f.key),empty=v==null||String(v).trim()==="";
    if(f.required&&empty)out.push({level:"error",code:"required-custom",text:"必填字段“"+f.label+"”为空"});
    if(empty)return;
    if(f.type==="number"){var n=Number(v);if(!Number.isFinite(n))out.push({level:"error",code:"custom-number",text:"字段“"+f.label+"”必须是数字"});else{if(f.min!=null&&n<f.min)out.push({level:"error",code:"custom-min",text:"字段“"+f.label+"”低于最小值 "+f.min});if(f.max!=null&&n>f.max)out.push({level:"error",code:"custom-max",text:"字段“"+f.label+"”高于最大值 "+f.max})}}
    if(f.type==="select"&&f.options.length&&f.options.indexOf(String(v))<0)out.push({level:"warn",code:"custom-option",text:"字段“"+f.label+"”使用了未定义选项“"+v+"”"});if(f.type==="cardRef"&&!cards.some(function(x){return x.id===String(v)}))out.push({level:"error",code:"broken-card-ref",text:"字段“"+f.label+"”引用了不存在的卡牌"});
  });return out;
}
function quickCardIssues(c,dupes){var out=[];if(!String(c.name||"").trim())out.push({level:"error",text:"缺少卡名"});if(c.setId&&!projectSetById(c.setId))out.push({level:"error",text:"扩展包引用失效"});if(c.familyId&&!familyById(c.familyId))out.push({level:"error",text:"卡牌家族引用失效"});var n=String(c.cardNumber||"").trim();if(n&&dupes[n]&&dupes[n].length>1)out.push({level:"error",text:"编号重复"});extractRuleTerms(c.description).forEach(function(name){if(!termByName(name))out.push({level:"error",text:"未定义词条 "+name})});extractIconTokens(c.description).forEach(function(name){if(!inlineIconExists(name))out.push({level:"error",text:"未知图标 "+name})});extractStatTokens(c.description).forEach(function(name){if(!CORE_STAT_TOKENS[name])out.push({level:"error",text:"未知实时数值 "+name})});customFieldValidation(c).forEach(function(x){out.push(x)});if(!hasCardArt(c))out.push({level:"warn",text:"缺少插画"});else{var dpi=artEffectiveDpi(c),t=dpiThresholds();if(dpi!=null&&dpi<t.minimum)out.push({level:"error",text:"插画 DPI 过低"});else if(dpi!=null&&dpi<t.target)out.push({level:"warn",text:"插画低于理想 DPI"})}var title=c.layout&&c.layout.title;if(title&&Math.abs((title.x+title.w/2)-50)>Math.max(.001,(Number(projectDesign.layoutStep)||.05)/2+.001))out.push({level:"error",text:"卡名偏离中轴"});var master=makeLayout(c.templateId);if(!isCardLocked(c))Object.keys(c.layout||{}).some(function(k){if(master[k]&&!isLayoutOverride(c,k)&&!layoutGeomEqual(c.layout[k],master[k])){out.push({level:"error",text:"继承模块与主模板漂移"});return true}return false});return out}
var liveQaTimer=null;function scheduleLiveQa(){clearTimeout(liveQaTimer);liveQaTimer=setTimeout(renderLiveQa,120)}
function renderLiveQa(){var el=$("#liveQaBadge"),c=current();if(!el||!c)return;var issues=quickCardIssues(c,duplicateNumberMap()),errors=issues.filter(function(x){return x.level==="error"}).length,warns=issues.filter(function(x){return x.level==="warn"}).length,level=errors?"error":warns?"warn":"ok",label=errors?"编辑错误":warns?"编辑警告":"编辑通过",count=errors+warns;el.className="live-qa-badge "+level;var b=el.querySelector("b"),span=el.querySelector("span");if(b)b.textContent=(isCardLocked(c)?"锁定 · ":"")+label;if(span)span.textContent=count?String(count):"";el.title="编辑阶段快速检查；发布前请点击此处运行完整检查（文字溢出、安全区与裁切）。\n"+(issues.length?issues.slice(0,6).map(function(x){return (x.level==="error"?"错误：":"警告：")+x.text}).join("\n"):"暂未发现快速检查问题")}
function renderProjectSummary(){if(!$("#summaryCards"))return;var dup=duplicateNumberMap(),problem=0;cards.forEach(function(c){if(quickCardIssues(c,dup).length)problem++});$("#summaryCards b").textContent=cards.length;$("#summaryReady b").textContent=cards.filter(function(c){return c.workflowStatus==="通过"||isCardLocked(c)}).length;$("#summaryIssues b").textContent=problem;$("#summaryIssues").classList.toggle("has-issues",problem>0)}
function workflowOptions(value){return DATA_STATUSES.map(function(x){return '<option'+(x===value?' selected':'')+'>'+esc(x)+'</option>'}).join("")}
function templateOptions(value){return Object.keys(TEMPLATES).map(function(k){return '<option value="'+esc(k)+'"'+(k===value?' selected':'')+'>'+esc(TEMPLATES[k].name)+'</option>'}).join("")}
function dataTableCards(){var q=$("#dataTableSearch").value.trim().toLowerCase(),tf=$("#dataTableTemplate").value,sf=$("#dataTableStatus").value;return cards.filter(function(c){return (tf==="all"||c.templateId===tf)&&(sf==="all"||(sf==="ready"?(c.workflowStatus==="通过"||c.workflowStatus==="锁定"):c.workflowStatus===sf))&&(!q||searchableText(c).indexOf(q)>=0)})}
function renderDataTable(){
  if(!$("#dataTableBody"))return;var tf=$("#dataTableTemplate"),sf=$("#dataTableStatus"),oldT=tf.value||"all",oldS=sf.value||"all";
  tf.innerHTML='<option value="all">全部模板</option>'+Object.keys(TEMPLATES).map(function(k){return '<option value="'+esc(k)+'">'+esc(TEMPLATES[k].name)+'</option>'}).join("");
  sf.innerHTML='<option value="all">全部状态</option><option value="ready">可发布（通过 / 锁定）</option>'+DATA_STATUSES.map(function(x){return '<option>'+esc(x)+'</option>'}).join("");
  tf.value=Object.prototype.hasOwnProperty.call(TEMPLATES,oldT)?oldT:"all";sf.value=(oldS==="ready"||DATA_STATUSES.indexOf(oldS)>=0)?oldS:"all";
  var batch=$("#batchField"),oldBatch=batch.value||"workflowStatus";batch.innerHTML='<option value="workflowStatus">生产状态</option><option value="faction">系别</option><option value="rarity">稀有度</option><option value="setId">扩展包</option>'+fieldSchema.map(function(f){return '<option value="custom:'+esc(f.key)+'">'+esc(f.label)+'</option>'}).join("");if(Array.prototype.some.call(batch.options,function(o){return o.value===oldBatch}))batch.value=oldBatch;
  refreshFormulaFields();
  var customHead=fieldSchema.map(function(f){return '<th title="{'+esc(f.key)+'}">'+esc(f.label)+(f.required?' *':'')+'</th>'}).join("");
  $("#dataTableHead").innerHTML='<th><input id="selectAllDataRows" type="checkbox"></th>'+[["cardNumber","编号"],["name","名称"],["","扩展包"],["","模板"],["workflowStatus","状态"],["faction","系别"],["cost","费用"],["attack","攻"],["health","血"],["rarity","稀有度"]].map(function(x){var name=x[0]?fieldDisplayName(x[0],x[1]):x[1];return '<th title="'+esc(name)+'">'+esc(name)+'</th>'}).join("")+customHead+'<th>插画</th><th>检查</th>';
  var list=dataTableCards(),dupes=duplicateNumberMap(),pageSize=Math.max(25,Number($("#dataPageSize")&&$("#dataPageSize").value)||100),pages=Math.max(1,Math.ceil(list.length/pageSize));dataTablePage=Math.max(0,Math.min(dataTablePage,pages-1));var page=list.slice(dataTablePage*pageSize,dataTablePage*pageSize+pageSize),from=list.length?dataTablePage*pageSize+1:0,to=Math.min(list.length,(dataTablePage+1)*pageSize);$("#dataTableCount").textContent="显示 "+from+"–"+to+" / "+list.length+" 张（项目共 "+cards.length+"） · 已选 "+Object.keys(dataSelection).filter(function(id){return dataSelection[id]}).length+" 张";
  if($("#dataPageInfo"))$("#dataPageInfo").textContent="第 "+(dataTablePage+1)+" / "+pages+" 页";if($("#dataPrev"))$("#dataPrev").disabled=dataTablePage<=0;if($("#dataNext"))$("#dataNext").disabled=dataTablePage>=pages-1;
  $("#dataTableBody").innerHTML=page.map(function(c){
    var issues=quickCardIssues(c,dupes),level=issues.some(function(x){return x.level==="error"})?"error":issues.length?"warn":"ok",label=issues.length?issues.length+" 项":"通过";
    var customCells=fieldSchema.map(function(f){if(f.tpl&&f.tpl!==c.templateId)return '<td class="muted">—</td>';var v=customFieldValue(c,f.key),control;if(f.type==="cardRef")control='<select data-card-custom-field="'+esc(f.key)+'" data-card-id="'+c.id+'"><option value=""></option>'+cards.filter(function(x){return x.id!==c.id}).map(function(x){return '<option value="'+esc(x.id)+'" '+(String(v)===String(x.id)?'selected':'')+'>'+esc(x.cardNumber?(x.cardNumber+" · "+x.name):x.name)+'</option>'}).join("")+'</select>';else if(f.type==="select")control='<select data-card-custom-field="'+esc(f.key)+'" data-card-id="'+c.id+'"><option value=""></option>'+f.options.map(function(x){return '<option value="'+esc(x)+'" '+(String(v)===String(x)?'selected':'')+'>'+esc(x)+'</option>'}).join("")+'</select>';else if(f.type==="boolean")control='<input type="checkbox" data-card-custom-field="'+esc(f.key)+'" data-card-id="'+c.id+'" '+(v?'checked':'')+'>';else control='<input '+(f.type==="number"?'type="number" step="any" ':'')+'data-card-custom-field="'+esc(f.key)+'" data-card-id="'+c.id+'" value="'+esc(v)+'">';return '<td>'+control+'</td>'}).join("");
    var locked=isCardLocked(c),dis=locked?' disabled title="已锁定，只能在项目中心解锁"':'';var setOptions='<option value="">未归属</option>'+projectSets.map(function(s){return '<option value="'+esc(s.id)+'" '+(s.id===c.setId?'selected':'')+'>'+esc(s.code+' · '+s.name)+'</option>'}).join('');return '<tr class="'+(dataSelection[c.id]?"data-selected ":"")+(locked?'data-locked':'')+'" data-row-id="'+c.id+'"><td><input type="checkbox" data-data-select="'+c.id+'" '+(dataSelection[c.id]?"checked":"")+'></td><td><input class="cell-id" data-card-field="cardNumber" data-card-id="'+c.id+'" value="'+esc(c.cardNumber||"")+'"'+dis+'></td><td><button class="row-jump" data-data-jump="'+c.id+'">↗</button> <input class="cell-name" data-card-field="name" data-card-id="'+c.id+'" value="'+esc(c.name||"")+'"'+dis+'></td><td><select data-card-set="'+c.id+'"'+dis+'>'+setOptions+'</select></td><td><select data-card-template="'+c.id+'"'+dis+'>'+templateOptions(c.templateId)+'</select></td><td><select data-card-field="workflowStatus" data-card-id="'+c.id+'"'+dis+'>'+workflowOptions(c.workflowStatus||"设计中")+'</select></td><td><input data-card-field="faction" data-card-id="'+c.id+'" value="'+esc(c.faction||"")+'"'+dis+'></td><td><input class="cell-mini" type="number" data-card-field="cost" data-card-id="'+c.id+'" value="'+esc(c.cost)+'"'+dis+'></td><td><input class="cell-mini" type="number" data-card-field="attack" data-card-id="'+c.id+'" value="'+esc(c.attack)+'"'+dis+'></td><td><input class="cell-mini" type="number" data-card-field="health" data-card-id="'+c.id+'" value="'+esc(c.health)+'"'+dis+'></td><td><input data-card-field="rarity" data-card-id="'+c.id+'" value="'+esc(c.rarity||"")+'"'+dis+'></td>'+customCells+'<td>'+(hasCardArt(c)?'<span class="check-pill ok">有</span>':'<span class="check-pill warn">缺</span>')+'</td><td><span class="check-pill '+level+'" title="'+esc(issues.map(function(x){return x.text}).join("；"))+'">'+label+(locked?' · 🔒':'')+'</span></td></tr>'
  }).join("");
  $$("#dataTableBody tr.data-locked [data-card-custom-field]").forEach(function(el){el.disabled=true;el.title="已锁定，只能在项目中心解锁"});
}
function openDataTable(){dataTablePage=0;renderDataTable();$("#dataTableModal").hidden=false}
$("#dataPrev").onclick=function(){dataTablePage=Math.max(0,dataTablePage-1);renderDataTable()};$("#dataNext").onclick=function(){dataTablePage++;renderDataTable()};$("#dataPageSize").onchange=function(){dataTablePage=0;renderDataTable()};
$("#openDataTable").onclick=openDataTable;$("#summaryCards").onclick=openDataTable;$("#summaryReady").onclick=function(){openDataTable();$("#dataTableStatus").value="ready";renderDataTable()};$("#closeDataTable").onclick=function(){$("#dataTableModal").hidden=true};$("#dataTableModal").addEventListener("click",function(e){if(e.target===this)this.hidden=true});
["#dataTableSearch","#dataTableTemplate","#dataTableStatus"].forEach(function(q){$(q).addEventListener(q==="#dataTableSearch"?"input":"change",function(){dataTablePage=0;renderDataTable()})});
$("#dataTableBody").addEventListener("change",function(e){var sid=e.target.getAttribute("data-data-select");if(sid){dataSelection[sid]=e.target.checked;var row=e.target.closest("tr");if(row)row.classList.toggle("data-selected",!!e.target.checked);var list=dataTableCards(),pageSize=Math.max(25,Number($("#dataPageSize").value)||100),from=list.length?dataTablePage*pageSize+1:0,to=Math.min(list.length,(dataTablePage+1)*pageSize);$("#dataTableCount").textContent="显示 "+from+"–"+to+" / "+list.length+" 张（项目共 "+cards.length+"） · 已选 "+Object.keys(dataSelection).filter(function(id){return dataSelection[id]}).length+" 张";return}var setCardId=e.target.getAttribute("data-card-set");if(setCardId){var sc=cards.find(function(x){return x.id===setCardId});if(!sc||isCardLocked(sc))return;recordHistory();sc.setId=e.target.value||"";sc.setName=setDisplayName(sc);if(sc.id===selected)renderCard();renderList();renderProjectSummary();persist();renderDataTable();return}var id=e.target.getAttribute("data-card-id"),field=e.target.getAttribute("data-card-field"),customKey=e.target.getAttribute("data-card-custom-field");if(id&&customKey){var cc=cards.find(function(x){return x.id===id}),def=fieldDefByKey(customKey);if(!cc||!def||isCardLocked(cc))return;recordHistory();var cv=def.type==="boolean"?!!e.target.checked:def.type==="number"?num(e.target.value,0):e.target.value;cc.customFields[customKey]=cv;if(id===selected)renderCard();renderProjectSummary();persist();renderDataTable();return}if(id&&field){var c=cards.find(function(x){return x.id===id});if(!c||isCardLocked(c))return;recordHistory();var value=e.target.value;if(["cost","attack","health","move","range"].indexOf(field)>=0)value=num(value,0);c[field]=value;if(id===selected)renderCard();renderList();renderProjectSummary();persist();renderDataTable();return}var tid=e.target.getAttribute("data-card-template");if(tid){var c=cards.find(function(x){return x.id===tid});if(!c||isCardLocked(c)||!TEMPLATES[e.target.value])return;recordHistory();c.templateId=e.target.value;c.layout=makeLayout(c.templateId);c.layoutOverrides={};if(!c.unitType)c.unitType=TEMPLATES[c.templateId].short;if(c.id===selected)renderCard();renderList();renderProjectSummary();persist();renderDataTable()}});
$("#dataTableBody").addEventListener("click",function(e){var id=e.target.getAttribute("data-data-jump");if(!id)return;selected=id;$("#dataTableModal").hidden=true;renderAll();setStatus("已从数据表定位："+current().name)});
$("#dataTableModal").addEventListener("change",function(e){if(e.target.id!=="selectAllDataRows")return;var checked=e.target.checked;dataTableCards().forEach(function(c){dataSelection[c.id]=checked});renderDataTable()});
$("#clearDataSelection").onclick=function(){dataSelection={};$("#selectAllDataRows").checked=false;renderDataTable()};
$("#applyBatchField").onclick=function(){var ids=Object.keys(dataSelection).filter(function(id){return dataSelection[id]}),field=$("#batchField").value,value=$("#batchValue").value;if(!ids.length){setStatus("数据表：请先勾选要批量修改的卡牌");return}var editable=ids.map(function(id){return cards.find(function(x){return x.id===id})}).filter(function(c){return c&&!isCardLocked(c)});if(!editable.length){setStatus("所选卡牌均已锁定，没有执行批量修改");return}recordHistory();editable.forEach(function(c){if(field.indexOf("custom:")===0){var key=field.slice(7),def=fieldDefByKey(key);if(def&&(!def.tpl||def.tpl===c.templateId))c.customFields[key]=def.type==="number"?num(value,0):def.type==="boolean"?(value==="true"||value==="1"||value==="是"):value}else if(field==="setId"){var set=projectSets.find(function(x){return x.id===value||x.code===value||x.name===value});c.setId=set?set.id:"";c.setName=set?set.name:""}else c[field]=value});renderAll();renderDataTable();setStatus("已批量修改 "+editable.length+" 张卡牌；跳过 "+(ids.length-editable.length)+" 张锁定卡牌")};
function refreshFormulaFields(){var el=$("#formulaField");if(!el)return;var old=el.value||"cost",core=[{key:"cost",label:"费用"},{key:"attack",label:"攻击"},{key:"health",label:"生命"},{key:"move",label:"移速"},{key:"range",label:"射程"}],custom=fieldSchema.filter(function(f){return f.type==="number"}).map(function(f){return {key:"custom:"+f.key,label:f.label}}),all=core.concat(custom);el.innerHTML=all.map(function(x){return '<option value="'+esc(x.key)+'">'+esc(x.label)+'</option>'}).join("");if(all.some(function(x){return x.key===old}))el.value=old}
function applyFormulaValue(base,op,v){if(op==="set")return v;if(op==="sub")return base-v;if(op==="mul")return base*v;return base+v}
$("#applyBatchFormula").onclick=function(){var ids=Object.keys(dataSelection).filter(function(id){return dataSelection[id]});if(!ids.length){setStatus("数值公式：请先在数据表勾选卡牌");return}var field=$("#formulaField").value,op=$("#formulaOp").value,v=Number($("#formulaValue").value),minRaw=$("#formulaMin").value,maxRaw=$("#formulaMax").value,lo=minRaw===""?null:Number(minRaw),hi=maxRaw===""?null:Number(maxRaw);if(!Number.isFinite(v)||lo!=null&&!Number.isFinite(lo)||hi!=null&&!Number.isFinite(hi)){setStatus("数值公式包含无效数字");return}if(lo!=null&&hi!=null&&lo>hi){setStatus("数值公式：最小值不能大于最大值");return}var editable=ids.map(function(id){return cards.find(function(c){return c.id===id})}).filter(function(c){return c&&!isCardLocked(c)});if(!editable.length){setStatus("所选卡牌均已锁定，没有执行公式");return}recordHistory();editable.forEach(function(c){var custom=field.indexOf("custom:")===0,key=custom?field.slice(7):field,def=custom&&fieldDefByKey(key);if(def&&def.tpl&&def.tpl!==c.templateId)return;var base=Number(custom?customFieldValue(c,key):c[key]);if(!Number.isFinite(base))base=0;var next=applyFormulaValue(base,op,v);if(lo!=null)next=Math.max(lo,next);if(hi!=null)next=Math.min(hi,next);next=Math.round(next*1000)/1000;if(custom)c.customFields[key]=next;else c[key]=next});renderAll();renderDataTable();setStatus("数值公式已应用到 "+editable.length+" 张卡牌；跳过 "+(ids.length-editable.length)+" 张锁定卡牌")};
function replaceFieldKeys(scope){if(scope==="allText")return ["name","description","tags","rulesKeywords","cardNumber","faction","unitType","rarity","credit","artPrompt"].concat(fieldSchema.filter(function(f){return f.type==="text"}).map(function(f){return "custom:"+f.key}));return [scope]}
function replaceTargetCards(){if($("#replaceSelectedOnly")&&$("#replaceSelectedOnly").checked){var ids=Object.keys(dataSelection).filter(function(id){return dataSelection[id]});return ids.map(function(id){return cards.find(function(c){return c.id===id})}).filter(Boolean)}return cards.slice()}
function stringOccurrences(haystack,needle){if(!needle)return 0;var s=String(haystack==null?"":haystack),n=0,pos=0;while((pos=s.indexOf(needle,pos))>=0){n++;pos+=needle.length}return n}
function replacementPlan(){var find=$("#replaceFind").value,withValue=$("#replaceWith").value,scope=$("#replaceScope").value;if(!find)return {find:find,withValue:withValue,scope:scope,cards:[],matches:0,editableMatches:0,lockedMatches:0};var keys=replaceFieldKeys(scope),rows=[],matches=0,editable=0,locked=0;replaceTargetCards().forEach(function(c){var cardMatches=0,fields=[];keys.forEach(function(key){var custom=key.indexOf("custom:")===0,k=custom?key.slice(7):key,v=custom?customFieldValue(c,k):c[key],count=stringOccurrences(v,find);if(count){cardMatches+=count;fields.push({key:key,count:count,before:String(v==null?"":v)})}});if(cardMatches){matches+=cardMatches;if(isCardLocked(c))locked+=cardMatches;else editable+=cardMatches;rows.push({card:c,count:cardMatches,fields:fields,locked:isCardLocked(c)})}});return {find:find,withValue:withValue,scope:scope,cards:rows,matches:matches,editableMatches:editable,lockedMatches:locked}}
function renderReplacePreview(){var p=replacementPlan(),box=$("#replaceSummary");if(!p.find){box.textContent="请输入查找内容；锁定卡牌永远不会被修改。";return p}box.textContent="找到 "+p.matches+" 处 / "+p.cards.length+" 张卡；可替换 "+p.editableMatches+" 处"+(p.lockedMatches?("，锁定卡牌跳过 "+p.lockedMatches+" 处"):"");return p}
$("#previewReplace").onclick=function(){var p=renderReplacePreview();setStatus(p.find?("查找预览："+p.matches+" 处匹配，"+p.cards.length+" 张卡牌"):"请输入要查找的文字")};
$("#applyReplace").onclick=function(){var p=replacementPlan();if(!p.find){setStatus("查找替换：请输入查找内容");return}var editableRows=p.cards.filter(function(r){return !r.locked});if(!editableRows.length){renderReplacePreview();setStatus("没有可修改的匹配项；锁定卡牌不会被替换");return}recordHistory();editableRows.forEach(function(row){row.fields.forEach(function(f){var custom=f.key.indexOf("custom:")===0,key=custom?f.key.slice(7):f.key,next=f.before.split(p.find).join(p.withValue);if(custom)row.card.customFields[key]=next;else row.card[f.key]=next})});renderAll();renderDataTable();renderReplacePreview();setStatus("查找替换完成：修改 "+editableRows.length+" 张卡牌，共 "+p.editableMatches+" 处；跳过锁定匹配 "+p.lockedMatches+" 处")};
["replaceScope","replaceFind","replaceWith","replaceSelectedOnly"].forEach(function(id){var el=$("#"+id);if(el)el.addEventListener(id==="replaceFind"||id==="replaceWith"?"input":"change",renderReplacePreview)});


function addPreflight(issues,c,level,code,text,details){issues.push(Object.assign({cardId:c&&c.id||"",cardName:c&&c.name||"项目",level:level,code:code,text:text},details||{}))}
function preflightContentRect(layer,key){
  if(!layer)return null;
  var inner=null;
  if(key==="title")inner=layer.querySelector(".title");
  else if(key==="effect")inner=layer.querySelector("span");
  else if(key==="cost")inner=layer.querySelector('[data-edit="cost"]');
  else if(key.indexOf("stat_")===0)inner=layer.querySelector("strong");
  else if(key==="faction")inner=layer.querySelector("span");
  else if(key==="type")inner=layer.querySelector("span");
  else if(key==="rarityText")inner=layer.querySelector("span");
  else if(key==="rarityMark")inner=layer;
  // An empty text slot has no printed content to crop. Keep checking image-only
  // fields, including inline rule icons, even when their textContent is empty.
  if(inner&&!String(inner.textContent||"").trim()&&!inner.querySelector("img,svg,canvas"))return null;
  return inner?(renderedTextRect(inner)||inner.getBoundingClientRect()):layer.getBoundingClientRect()
}
function rectInside(inner,outer,tolerance){tolerance=Number(tolerance||0);return inner.left>=outer.left-tolerance&&inner.top>=outer.top-tolerance&&inner.right<=outer.right+tolerance&&inner.bottom<=outer.bottom+tolerance}
function ruleVisualLines(el){var lines=[],walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),node;while((node=walker.nextNode())){for(var i=0;i<node.nodeValue.length;i++){var ch=node.nodeValue.charAt(i);if(!ch.trim())continue;try{var r=document.createRange();r.setStart(node,i);r.setEnd(node,i+1);var rr=r.getBoundingClientRect();if(!rr||!rr.width)continue;var line=lines.find(function(x){return Math.abs(x.top-rr.top)<1.6});if(!line){line={top:rr.top,chars:0,width:0};lines.push(line)}line.chars++;line.width+=rr.width}catch(e){}}}return lines.sort(function(a,b){return a.top-b.top})}
function measureCardForPreflight(c,issues){
  var host=document.createElement("div");host.className="preflight-measure-host";host.style.cssText="position:fixed;left:-10000px;top:0;width:348px;height:474px;visibility:hidden;pointer-events:none";host.innerHTML=cardHtml(c,false);document.body.appendChild(host);setArt(host,c);
  var fit=fitTitleToBox(host,c),effectFit=fitEffectToBox(host,c),cardEl=host.querySelector(".card"),titleLayer=host.querySelector(".title-layer");
  if(!fit.fits)addPreflight(issues,c,"error","title-overflow","卡牌名称在项目设定的最小字号下仍无法完整放入名称区域");
  else{var titleBase=Math.max(1,num(textStyleFor(c,"title",normalizeAppearance(c.appearance)).size,22));if(fit.size<titleBase*.78)addPreflight(issues,c,"warn","title-tight-fit","卡名已自动缩至 "+fit.size.toFixed(1)+"px（设计字号 "+titleBase.toFixed(1)+"px）；整套卡可能出现标题视觉重量不一致")};
  if(!effectFit.fits)addPreflight(issues,c,"error","rules-overflow","规则文字在项目设定的最小字号下仍发生溢出/裁切");
  else{var ruleBase=Math.max(1,num(textStyleFor(c,"effect",normalizeAppearance(c.appearance)).size,13));if(effectFit.size<ruleBase*.80)addPreflight(issues,c,"warn","rules-tight-fit","规则正文已自动缩至 "+effectFit.size.toFixed(1)+"px（设计字号 "+ruleBase.toFixed(1)+"px）；建议检查同类型卡的文字密度一致性")};
  var effectText=host.querySelector('.effect [data-edit="description"]');if(effectText&&projectDesign.ruleWidowControl!==false){var vlines=ruleVisualLines(effectText),minTail=Math.max(2,Math.round(num(projectDesign.ruleTailChars,4)));if(vlines.length>1&&vlines[vlines.length-1].chars<minTail)addPreflight(issues,c,"warn","rules-short-tail","规则正文最后一行仅 "+vlines[vlines.length-1].chars+" 个可见字符；建议调整措辞或字号，避免孤行短尾")};
  if(cardEl&&titleLayer){
    var cr=cardEl.getBoundingClientRect(),titleText=titleLayer.querySelector(".title"),tr=projectDesign.opticalCentering!==false?(opticalTextRect(titleText)||titleLayer.getBoundingClientRect()):(renderedTextRect(titleText)||titleLayer.getBoundingClientRect()),delta=Math.abs((tr.left+tr.width/2)-(cr.left+cr.width/2)),tol=projectDesign.opticalCentering!==false?Number(projectDesign.opticalTolerancePx||.35):Number(projectDesign.axisTolerancePx||.45);
    if(delta>tol)addPreflight(issues,c,"error","title-axis","卡名"+(projectDesign.opticalCentering!==false?"光学":"几何")+"中心偏离卡牌中轴 "+delta.toFixed(2)+" px（项目容差 "+tol+" px）");
    var g=printGuideInsets(),trimRect={left:cr.left+cr.width*g.trimX/100,right:cr.right-cr.width*g.trimX/100,top:cr.top+cr.height*g.trimY/100,bottom:cr.bottom-cr.height*g.trimY/100},safeRect={left:cr.left+cr.width*g.safeX/100,right:cr.right-cr.width*g.safeX/100,top:cr.top+cr.height*g.safeY/100,bottom:cr.bottom-cr.height*g.safeY/100};
    var safeKeys=["title","faction","type","rarityText","effect","stat_attack","stat_health","stat_move","stat_range"],trimKeys=["cost","rarityMark"],seen={};
    safeKeys.forEach(function(key){var layer=host.querySelector('[data-layout-key="'+key+'"]');if(!layer||getComputedStyle(layer).display==="none")return;var r=preflightContentRect(layer,key);if(r&&!rectInside(r,safeRect,.6)){seen[key]=1;addPreflight(issues,c,"warn","safe-zone-"+key,layoutDisplayName(key)+"的实际内容越过成品内安全区（当前安全距 "+Number(projectDesign.safeContentMm==null?3:projectDesign.safeContentMm).toFixed(1)+" mm）")}});
    trimKeys.forEach(function(key){var layer=host.querySelector('[data-layout-key="'+key+'"]');if(!layer||getComputedStyle(layer).display==="none")return;var r=preflightContentRect(layer,key);if(r&&!rectInside(r,trimRect,.6))addPreflight(issues,c,"error","trim-zone-"+key,layoutDisplayName(key)+"的实际内容越过裁切线；印刷后可能被切掉")});
    host.querySelectorAll(".semantic-badge .semantic-badge-value").forEach(function(valueNode){var parent=valueNode.closest(".semantic-badge"),key=parent&&parent.getAttribute("data-layout-key");if(!parent||!key)return;var pr=parent.getBoundingClientRect(),vr=projectDesign.opticalCentering!==false?(opticalTextRect(valueNode)||valueNode.getBoundingClientRect()):(renderedTextRect(valueNode)||valueNode.getBoundingClientRect()),dx=Math.abs((vr.left+vr.width/2)-(pr.left+pr.width/2)),dy=Math.abs((vr.top+vr.height/2)-(pr.top+pr.height/2)),tol=Number(projectDesign.opticalTolerancePx||.35);if(dx>tol||dy>tol)addPreflight(issues,c,"warn","badge-optical-"+key,layoutDisplayName(key)+"数字视觉中心偏差 ΔX "+dx.toFixed(2)+" / ΔY "+dy.toFixed(2)+" px；可在数值徽章中进行光学校正")});
  }
  host.remove()
}
function runPreflight(){var issues=[],dupes=duplicateNumberMap(),conditionFields=allConditionFieldDefs().map(function(f){return f.key});
  var setCodes={};projectSets.forEach(function(set){var code=String(set.code||"").trim().toUpperCase();if(!code)addPreflight(issues,null,"warn","set-code","扩展包“"+set.name+"”缺少代码");if(code){if(setCodes[code])addPreflight(issues,null,"error","duplicate-set-code","扩展包代码 "+code+" 重复");setCodes[code]=true}if(set.locked&&set.status!=="已发布")addPreflight(issues,null,"warn","locked-set-status","扩展包“"+set.name+"”已锁定，但状态仍为“"+set.status+"”")});
  cardFamilies.forEach(function(f){var members=cardFamilyMembers(f.id);if(!members.length)addPreflight(issues,null,"warn","empty-family","卡牌家族“"+f.name+"”没有成员");if(f.baseCardId&&!members.some(function(c){return c.id===f.baseCardId}))addPreflight(issues,null,"error","family-base","卡牌家族“"+f.name+"”的基准卡已不存在")});
  playtests.forEach(function(t){var c=cards.find(function(x){return x.id===t.cardId});if(!c)addPreflight(issues,null,"warn","orphan-playtest","存在引用已删除卡牌的 Playtest 记录");if(num(t.wins,0)>num(t.plays,0))addPreflight(issues,c||null,"error","playtest-wins","Playtest 胜场不能大于使用次数");if(num(t.plays,0)<0||num(t.sessions,0)<0)addPreflight(issues,c||null,"error","playtest-negative","Playtest 场次与使用次数不能为负数")});
  Object.keys(templateConditions||{}).forEach(function(tid){Object.keys(templateConditions[tid]||{}).forEach(function(key){var cond=templateConditions[tid][key];if(cond&&cond.op!=="always"&&conditionFields.indexOf(cond.field)<0)addPreflight(issues,null,"error","condition-field","模板“"+(TEMPLATES[tid]?TEMPLATES[tid].name:tid)+"”的“"+layoutDisplayName(key)+"”引用了不存在的条件字段 "+cond.field)})});
  cards.forEach(function(c){
    if(!String(c.name||"").trim())addPreflight(issues,c,"error","missing-name","缺少卡牌名称");if(c.setId&&!projectSetById(c.setId))addPreflight(issues,c,"error","broken-set","引用的扩展包已不存在");if(c.familyId&&!familyById(c.familyId))addPreflight(issues,c,"error","broken-family","引用的卡牌家族已不存在");if(c.variantKind&&c.variantKind!=="标准"&&!c.familyId)addPreflight(issues,c,"warn","variant-without-family","卡牌标记为“"+c.variantKind+"”变体，但尚未加入卡牌家族");
    var n=String(c.cardNumber||"").trim();if(n&&dupes[n]&&dupes[n].length>1)addPreflight(issues,c,"error","duplicate-number","卡牌编号 "+n+" 重复（共 "+dupes[n].length+" 张）");
    extractRuleTerms(c.description).forEach(function(name){if(!termByName(name))addPreflight(issues,c,"error","unknown-term","使用了未定义规则词条 [["+name+"]] ",{termName:name})});
    extractIconTokens(c.description).forEach(function(name){if(!inlineIconExists(name))addPreflight(issues,c,"error","unknown-icon","使用了不存在的语义图标 {{icon:"+name+"}}")});
    extractStatTokens(c.description).forEach(function(name){if(!CORE_STAT_TOKENS[name])addPreflight(issues,c,"error","unknown-stat-token","使用了不存在的实时数值 {{stat:"+name+"}}")});
    String(c.description||"").split(/\r?\n/).forEach(function(line){var m=/^\s*\[(?!\[)([^\]]+)\]\s*(.*)$/.exec(line);if(!m)return;if(!RULE_BLOCK_TYPES[m[1]])addPreflight(issues,c,"warn","unknown-rule-block","规则结构标签 ["+m[1]+"] 未定义；可用："+Object.keys(RULE_BLOCK_TYPES).join(" / "));else if(!String(m[2]||"").trim())addPreflight(issues,c,"warn","empty-rule-block","规则结构 ["+m[1]+"] 没有内容")});
    customFieldValidation(c).forEach(function(x){addPreflight(issues,c,x.level,x.code,x.text)});
    var plain=String(c.description||"").replace(/\[\[[^\]]+\]\]/g," ");ruleTerms.forEach(function(t){if(t.name&&plain.indexOf(t.name)>=0)addPreflight(issues,c,"warn","unmarked-known-term","规则文本出现已知词条“"+t.name+"”，但没有使用 [["+t.name+"]] 统一引用")});
    if(!hasCardArt(c))addPreflight(issues,c,"warn","missing-art","尚未设置插画");else{var artAsset=c.artAssetId&&assetById(c.artAssetId),adpi=artEffectiveDpi(c),dt=dpiThresholds();if(artAsset&&(!artAsset.width||!artAsset.height))addPreflight(issues,c,"warn","art-dpi-unknown","插画缺少原始像素尺寸，无法验证印刷 DPI；重新导入一次即可补齐");else if(adpi!=null&&adpi<dt.minimum)addPreflight(issues,c,"error","art-dpi-low","插画有效精度仅 "+Math.round(adpi)+" DPI，低于项目最低 "+dt.minimum+" DPI");else if(adpi!=null&&adpi<dt.target)addPreflight(issues,c,"warn","art-dpi-target","插画有效精度 "+Math.round(adpi)+" DPI，低于项目理想 "+dt.target+" DPI");var subj=artSubjectScreenPosition(c);if(subj&&!subj.safe)addPreflight(issues,c,"warn","art-subject-unsafe","插画主体安全焦点位于当前裁切的 "+subj.x.toFixed(1)+"%, "+subj.y.toFixed(1)+"%；建议离插画边缘至少 "+subj.margin.toFixed(0)+"%")};if(!String(c.cardNumber||"").trim())addPreflight(issues,c,"warn","missing-number","尚未设置稳定卡牌编号");if(c.workflowStatus!=="通过"&&c.workflowStatus!=="锁定")addPreflight(issues,c,"warn","workflow","生产状态仍为“"+(c.workflowStatus||"设计中")+"”");
    var overrideCount=Object.keys(ensureLayoutOverrides(c)||{}).length,textOverrideCount=Object.keys(c.textStyles||{}).length;if(overrideCount>Math.max(1,num(projectDesign.reviewOverrideWarn,5)))addPreflight(issues,c,"warn","many-local-overrides","当前卡有 "+overrideCount+" 个布局局部覆盖；若不是特殊构图，建议回到类型主模板统一处理");if(textOverrideCount>4)addPreflight(issues,c,"warn","many-text-overrides","当前卡有 "+textOverrideCount+" 处文字样式覆盖；建议确认是否应写入类型模板 / 项目设计系统");
    var master=makeLayout(c.templateId);if(!isCardLocked(c))Object.keys(c.layout||{}).forEach(function(k){if(master[k]&&!isLayoutOverride(c,k)&&!layoutGeomEqual(c.layout[k],master[k]))addPreflight(issues,c,"error","master-drift",layerLabel(c,"layout",k)+" 标记为跟随模板，但坐标已漂移",{layoutKey:k})});measureCardForPreflight(c,issues)
  });
  ruleTerms.forEach(function(t){if(termUseCount(t.name)===0)addPreflight(issues,null,"warn","unused-term","规则词条“"+t.name+"”当前没有任何卡牌引用")});
  var unusedAssets=userAssets.filter(function(a){return assetReferenceCount(a.id)===0&&!assetHasRole(a,"shared")&&!a.shareable});if(unusedAssets.length)addPreflight(issues,null,"warn","unused-assets","资产库有 "+unusedAssets.length+" 个未使用私人素材，可在“资产库”中安全清理；共享素材不会计入此项");
  var checkedBacks={};cards.forEach(function(c){var backCheck=cardBackAssetForCard(c);if(!backCheck){addPreflight(issues,c,"warn","missing-card-back","没有解析到卡背（优先级：Set → 卡牌类型 → 项目默认）；双面 / TTS 输出会被阻止");return}if(checkedBacks[backCheck.id])return;checkedBacks[backCheck.id]=true;var bdt=dpiThresholds(),bdpi=backEffectiveDpi(backCheck);if(!backCheck.width||!backCheck.height)addPreflight(issues,c,"warn","back-dpi-unknown","卡背“"+(backCheck.name||backCheck.id)+"”缺少原始像素尺寸，无法验证印刷 DPI");else{var br=backCheck.width/backCheck.height,trimR=CARD_TRIM_W_MM/CARD_TRIM_H_MM,bleedR=CARD_BLEED_W_MM/CARD_BLEED_H_MM,ratioError=Math.min(Math.abs(br-trimR)/trimR,Math.abs(br-bleedR)/bleedR);if(ratioError>.04)addPreflight(issues,c,"warn","card-back-ratio","卡背“"+(backCheck.name||backCheck.id)+"”宽高比与当前成品 / 出血画布差异较大（"+backCheck.width+"×"+backCheck.height+" px）；导出时会居中裁切，请确认关键内容未靠边");if(bdpi<bdt.minimum)addPreflight(issues,c,"error","back-dpi-low","卡背“"+(backCheck.name||backCheck.id)+"”有效精度仅 "+Math.round(bdpi)+" DPI，低于项目最低 "+bdt.minimum+" DPI");else if(bdpi<bdt.target)addPreflight(issues,c,"warn","back-dpi-target","卡背“"+(backCheck.name||backCheck.id)+"”有效精度 "+Math.round(bdpi)+" DPI，低于项目理想 "+bdt.target+" DPI")}});
  cards.forEach(function(c){if(c.artAssetId&&!assetById(c.artAssetId))addPreflight(issues,c,"error","broken-art-asset","插画引用的 Asset ID 已不存在");var a=c.appearance||{};[["frameImageAssetId","卡框"],["textureImageAssetId","底纹"],["iconAssetId","图标"]].forEach(function(pair){if(a[pair[0]]&&!assetById(a[pair[0]]))addPreflight(issues,c,"error","broken-asset-ref",pair[1]+"引用的 Asset ID 已不存在")});(c.extraElements||[]).forEach(function(el){if(el.kind==="image"&&el.assetId&&!assetById(el.assetId))addPreflight(issues,c,"error","broken-extra-asset","自由图片“"+(el.name||"未命名")+"”引用的素材已不存在")})});
  lastPreflightIssues=issues;renderPreflight();renderProjectSummary();return issues}
// Repairs only change candidates that pass measurement again. Content and locked cards stay intact.
var lastRepairReport=null,lastRepairUndo=null,preflightRepairBusy=false,deferredPreflightRepairs=new Map();
function preflightRepairSignature(c){return JSON.stringify([c.layout,c.appearance,c.textStyles,c.badgeOffsets,c.name,c.description,projectDesign,templateLayouts[c.templateId]])}
function deferredPreflightKey(x){return [x.cardId,x.code,x.layoutKey||""].join("|")}
function preflightIssueKey(x){return [x.cardId,x.code,x.layoutKey||"",x.termName||"",x.text].join("|")}
function preflightLayoutKey(x){return x.layoutKey||(/^(safe-zone-|trim-zone-|badge-optical-)/.test(x.code)?x.code.replace(/^(safe-zone-|trim-zone-|badge-optical-)/,""):x.code==="title-axis"||x.code==="title-overflow"?"title":x.code==="rules-overflow"?"effect":"")}
function canRepairPreflight(x){
  var c=cards.find(function(c){return c.id===x.cardId});if(!c||isCardLocked(c))return false;
  if(x.code==="missing-number")return true;
  if(deferredPreflightRepairs.get(deferredPreflightKey(x))===preflightRepairSignature(c))return false;
  var key=preflightLayoutKey(x),p=c.layout&&c.layout[key];if(!p||p.locked||p.visible===false||Math.abs(num(p.r,0))>.01)return false;
  return /^(safe-zone-|trim-zone-|badge-optical-)/.test(x.code)||["master-drift","title-axis","title-overflow","rules-overflow"].indexOf(x.code)>=0;
}
function preflightHelp(x){
  var card=cards.find(function(c){return c.id===x.cardId});if(card&&deferredPreflightRepairs.get(deferredPreflightKey(x))===preflightRepairSignature(card))return "自动调整未通过复查，已保留原设计；点此直接调整模块";
  if(x.code==="unknown-term")return "请填写此词条的真实规则定义";
  if(/dpi-(low|target)/.test(x.code))return "需要更清晰的原图；修复不会降低印刷标准";
  if(/missing-art|broken-.*asset|dpi-unknown/.test(x.code))return "进入素材位置检查 / 重新导入原图";
  if(x.code==="duplicate-number")return "在数据表中核对重复编号，避免改变已有引用";
  var c=cards.find(function(c){return c.id===x.cardId});if(c&&isCardLocked(c))return "卡牌已锁定，请先确认并解锁";
  if(/overflow/.test(x.code))return "自动调整若仍放不下，将保留原布局；可缩短正文或调整模块";
  if(/workflow/.test(x.code))return "由你确认生产状态，修复不会自动标记通过";
  return "查看并处理此问题";
}
function renderPreflight(){
  ["closePreflight","rerunPreflight","preflightFilter","exportPreflightReport"].forEach(function(id){$("#"+id).disabled=preflightRepairBusy});
  $("#preflightResults").classList.toggle("repair-busy",preflightRepairBusy);
  var filter=$("#preflightFilter").value||"all",list=lastPreflightIssues.filter(function(x){return filter==="all"||filter==="auto"&&canRepairPreflight(x)||filter==="manual"&&!canRepairPreflight(x)||x.level===filter}),errors=lastPreflightIssues.filter(function(x){return x.level==="error"}).length,warns=lastPreflightIssues.filter(function(x){return x.level==="warn"}).length,affected=new Set(lastPreflightIssues.map(function(x){return x.cardId}).filter(Boolean)).size,auto=lastPreflightIssues.filter(canRepairPreflight).length;
  $("#preflightSummary").innerHTML='<div class="preflight-stat"><b>'+cards.length+'</b><span>卡牌总数</span></div><div class="preflight-stat"><b>'+errors+'</b><span>错误 · 必须处理</span></div><div class="preflight-stat"><b>'+warns+'</b><span>警告 · 建议确认</span></div><div class="preflight-stat"><b>'+affected+'</b><span>受影响卡牌</span></div>';
  $("#repairPreflightAll").disabled=preflightRepairBusy||!auto;$("#repairPreflightAll").textContent="一键修复可处理问题"+(auto?"（"+auto+"）":"");
  $("#undoPreflightRepair").disabled=preflightRepairBusy||!lastRepairUndo||stateSnapshot()!==lastRepairUndo.after;
  var groups=new Map();list.forEach(function(x){var key=x.cardId||"project";if(!groups.has(key))groups.set(key,[]);groups.get(key).push(x)});
  $("#preflightResults").innerHTML=list.length?Array.from(groups.values()).map(function(group){return '<section class="preflight-group"><b class="preflight-group-title">'+esc(group[0].cardName)+' <small>'+group.length+' 项</small></b>'+group.map(function(x){var index=lastPreflightIssues.indexOf(x),repairable=canRepairPreflight(x);return '<div class="preflight-item '+x.level+'"><span class="sev">'+(x.level==="error"?"错误":"警告")+'</span><span class="card-ref">'+esc(preflightLayoutKey(x)?layoutDisplayName(preflightLayoutKey(x)):"项目资料")+'</span><span class="issue-text">'+esc(x.text)+'<small>'+esc(repairable?"可自动校正，修复后会重新检查":preflightHelp(x))+'</small></span><div class="preflight-actions">'+(repairable?'<button data-preflight-fix="'+index+'">修复此项</button>':'')+'<button data-preflight-go="'+index+'">定位并处理</button></div></div>'}).join("")+'</section>'}).join(""):'<div class="preflight-empty">✓ 当前筛选范围没有发现问题</div>';
}
function makeRepairHost(c){var host=document.createElement("div");host.className="preflight-measure-host";host.style.cssText="position:fixed;left:-10000px;top:0;width:348px;height:474px;visibility:hidden;pointer-events:none";document.body.appendChild(host);refreshRepairHost(host,c);return host}
function refreshRepairHost(host,c){host.innerHTML=cardHtml(c,false);fitTitleToBox(host,c);fitEffectToBox(host,c)}
function repairMeasuredLayout(c,x){
  var key=preflightLayoutKey(x),p=c.layout[key];if(!p||p.locked)return false;
  var before=JSON.stringify({layout:c.layout,overrides:c.layoutOverrides,badges:c.badgeOffsets}),host=makeRepairHost(c);
  try{
    if(x.code==="master-drift"){var master=makeLayout(c.templateId);if(master[key]&&!isLayoutOverride(c,key))c.layout[key]=clone(master[key]);}
    else if(x.code==="title-axis"){enforceTitleAxis(c.layout);c.appearance.titleAlign="center";if(c.textStyles.title)c.textStyles.title.align="center";setLayoutOverride(c,key,true)}
    else if(x.code==="title-overflow"||x.code==="rules-overflow"){
      var g=printGuideInsets(),padX=g.safeX+.3,padY=g.safeY+.3,fit=key==="title"?fitTitleToBox:fitEffectToBox;
      // Expand into free space only; keep the designed minimum font size and all text.
      var old=clone(p),oldRight=p.x+p.w,oldBottom=p.y+p.h,maxW=Math.min(key==="title"?92:100,100-2*padX);
      p.w=Math.max(p.w,maxW);p.x=key==="title"?(100-p.w)/2:Math.max(padX,Math.min(p.x,100-padX-p.w));
      var maxBottom=100-padY,nextTop=padY;
      Object.keys(c.layout).forEach(function(k){var other=c.layout[k];if(k===key||k==="art"||other.visible===false||!conditionVisible(c,k))return;if(other.x+other.w<=p.x||other.x>=p.x+p.w)return;if(other.y>=oldBottom-.1)maxBottom=Math.min(maxBottom,other.y-.6);if(other.y+other.h<=old.y+.1)nextTop=Math.max(nextTop,other.y+other.h+.6)});
      p.y=Math.max(padY,Math.min(p.y,maxBottom-p.h));p.h=Math.max(p.h,maxBottom-p.y);refreshRepairHost(host,c);
      if(!fit(host,c).fits&&key==="effect"){p.y=Math.min(p.y,nextTop);p.h=Math.max(p.h,maxBottom-p.y);refreshRepairHost(host,c)}
      if(!fit(host,c).fits){c.layout[key]=old;return false}setLayoutOverride(c,key,true);
    }
    else if(x.code.indexOf("badge-optical-")===0){
      var node=host.querySelector('[data-layout-key="'+key+'"]'),value=node&&node.querySelector('.semantic-badge-value');if(!value)return false;
      var nr=node.getBoundingClientRect(),vr=projectDesign.opticalCentering!==false?opticalTextRect(value):renderedTextRect(value),style=badgeStyleFor(c,key);
      c.badgeOffsets=c.badgeOffsets||{};c.badgeOffsets[key]={valueDx:Math.max(-8,Math.min(8,style.valueDx+(nr.left+nr.width/2)-(vr.left+vr.width/2))),valueDy:Math.max(-8,Math.min(8,style.valueDy+(nr.top+nr.height/2)-(vr.top+vr.height/2)))};
    }
    else if(/^(safe-zone-|trim-zone-)/.test(x.code)){
      var g=printGuideInsets(),safe=x.code.indexOf("safe-zone-")===0,insetX=safe?g.safeX:g.trimX,insetY=safe?g.safeY:g.trimY;
      for(var pass=0;pass<2;pass++){
        refreshRepairHost(host,c);var node=host.querySelector('[data-layout-key="'+key+'"]'),cr=host.querySelector('.card').getBoundingClientRect(),rr=preflightContentRect(node,key);if(!rr)return false;
        var bound={left:cr.left+cr.width*(insetX+.15)/100,right:cr.right-cr.width*(insetX+.15)/100,top:cr.top+cr.height*(insetY+.15)/100,bottom:cr.bottom-cr.height*(insetY+.15)/100};
        if(rr.width>bound.right-bound.left||rr.height>bound.bottom-bound.top)return false;
        var dx=rr.left<bound.left?bound.left-rr.left:rr.right>bound.right?bound.right-rr.right:0,dy=rr.top<bound.top?bound.top-rr.top:rr.bottom>bound.bottom?bound.bottom-rr.bottom:0;
        if(key!=="title")p.x=Math.round((p.x+dx/cr.width*100)*1000)/1000;
        p.y=Math.round((p.y+dy/cr.height*100)*1000)/1000;
      }
      setLayoutOverride(c,key,true);
    }
    return before!==JSON.stringify({layout:c.layout,overrides:c.layoutOverrides,badges:c.badgeOffsets});
  }finally{host.remove()}
}
function introducesLayoutOverlap(before,after){
  var hosts=[makeRepairHost(before),makeRepairHost(after)];
  try{
    function visibleBounds(host,c){
      var out={};Object.keys(c.layout||{}).forEach(function(key){
        if(key==="art"||c.layout[key].visible===false||!conditionVisible(c,key))return;
        var node=host.querySelector('[data-layout-key="'+key+'"]');if(!node)return;
        var r=preflightContentRect(node,key),n=node.getBoundingClientRect();if(!r)return;
        // Compare the visible contents; generous selection rectangles are not printed ink.
        var clipped=getComputedStyle(node).overflow!=="visible";
        out[key]={left:clipped?Math.max(r.left,n.left):r.left,right:clipped?Math.min(r.right,n.right):r.right,top:clipped?Math.max(r.top,n.top):r.top,bottom:clipped?Math.min(r.bottom,n.bottom):r.bottom};
      });
      (c.extraElements||[]).forEach(function(el){var node=host.querySelector('[data-extra-id="'+el.id+'"]');if(!node||el.layout&&el.layout.visible===false)return;out["extra:"+el.id]=el.kind==="image"?node.getBoundingClientRect():(renderedTextRect(node)||node.getBoundingClientRect())});
      return out;
    }
    function area(a,b){if(!a||!b)return 0;return Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top))}
    var old=visibleBounds(hosts[0],before),next=visibleBounds(hosts[1],after),keys=Object.keys(next);
    for(var i=0;i<keys.length;i++)for(var j=i+1;j<keys.length;j++){var a=keys[i],b=keys[j];if(area(next[a],next[b])>area(old[a],old[b])+4)return true}
    return false;
  }finally{hosts.forEach(function(host){host.remove()})}
}

function undoPreflightRepair(){
  if(!lastRepairUndo)return;
  if(stateSnapshot()!==lastRepairUndo.after){$("#preflightRepairStatus").textContent="修复之后已有其他修改，请用顶部“撤销”逐步退回，避免覆盖你的新编辑。";$("#undoPreflightRepair").disabled=true;return}
  future.push(stateSnapshot());if(history[history.length-1]===lastRepairUndo.before)history.pop();
  restoreState(lastRepairUndo.before);lastRepairUndo=null;persist();runPreflight();$("#preflightRepairStatus").textContent="已撤销本次修复，修复前快照仍可在项目快照中找到。";setStatus("已撤销本次项目修复");
}
async function repairPreflight(index){
  if(preflightRepairBusy)return;preflightRepairBusy=true;renderPreflight();
  var requested=index==null?null:lastPreflightIssues[Number(index)],requestedKey=requested&&preflightIssueKey(requested);
  if(index!=null&&!requested){preflightRepairBusy=false;renderPreflight();return}
  var issues,targets;
  try{flushPendingTemplateEdits();await document.fonts.ready;issues=runPreflight().slice();targets=issues.filter(function(x){return canRepairPreflight(x)&&(!requestedKey||preflightIssueKey(x)===requestedKey)})}catch(e){preflightRepairBusy=false;renderPreflight();$("#preflightRepairStatus").textContent="检查未完成，尚未修改项目："+e.message;return}
  if(!targets.length){preflightRepairBusy=false;renderPreflight();$("#preflightRepairStatus").textContent="当前没有可自动修复的问题。需要原图、词条定义或设计判断的项目，可点“定位并处理”。";return}
  preflightRepairBusy=true;renderPreflight();var before=stateSnapshot(),oldSnapshots=snapshots.slice(),oldHistory=history.slice(),oldFuture=future.slice(),fixed=[],unchanged=[];
  try{
    recordHistory();snapshots.unshift({id:uid(),time:nowText(),label:"一键修复前 · "+nowText(),state:before});snapshots=snapshots.slice(0,12);
    var byCard=new Map();targets.forEach(function(x){if(!byCard.has(x.cardId))byCard.set(x.cardId,[]);byCard.get(x.cardId).push(x)});
    var done=0;
    for(var entry of byCard){
      var c=cards.find(function(c){return c.id===entry[0]}),cardTargets=entry[1];if(!c||isCardLocked(c))continue;
      for(var x of cardTargets){
        var candidate=clone(c),changed=false;
        if(x.code==="missing-number"){
          var used=new Set(cards.map(function(card){return String(card.cardNumber||"").trim()})),set=projectSetById(c.setId),prefix=set&&set.numberPrefix||"CARD-",number=set?set.numberStart:1,padding=set?set.numberPadding:3,value;
          do{value=prefix+String(number++).padStart(padding,"0")}while(used.has(value));candidate.cardNumber=value;changed=true;
        }else changed=repairMeasuredLayout(candidate,x);
        var originalIssues=[],candidateIssues=[];
        if(changed&&x.code!=="missing-number"){
          measureCardForPreflight(c,originalIssues);measureCardForPreflight(candidate,candidateIssues);
          var oldCodes=new Set(originalIssues.map(function(q){return q.code})),newProblem=candidateIssues.some(function(q){return !oldCodes.has(q.code)&&q.code!=="many-local-overrides"});
          if(newProblem||candidateIssues.some(function(q){return q.code===x.code})||introducesLayoutOverlap(c,candidate))changed=false;
        }
        if(changed){Object.assign(c,candidate);fixed.push({cardId:c.id,cardName:c.name,code:x.code})}else unchanged.push({cardId:c.id,code:x.code,layoutKey:x.layoutKey||"",reason:"自动调整无法安全解决，已保留原设计"});
      }
      done++;$("#preflightRepairStatus").textContent="正在修复 "+done+" / "+byCard.size+" 张卡牌…";await new Promise(function(resolve){requestAnimationFrame(resolve)});
    }
    if(!fixed.length){snapshots=oldSnapshots;history=oldHistory;future=oldFuture;mutationPending=false;lastRepairUndo=null}
    renderAll();persist();var after=runPreflight();
    unchanged.forEach(function(x){var c=cards.find(function(c){return c.id===x.cardId});if(c)deferredPreflightRepairs.set(deferredPreflightKey(x),preflightRepairSignature(c))});
    lastRepairReport={time:new Date().toISOString(),before:issues.length,after:after.length,fixed:fixed,unchanged:unchanged};
    if(fixed.length)lastRepairUndo={before:before,after:stateSnapshot()};
    $("#preflightRepairStatus").textContent="已完成 "+fixed.length+" 项修复，剩余 "+after.length+" 项。"+(fixed.length?"已保留修复前快照，可一键撤销。":"原设计保持不变。")+(unchanged.length?"其中 "+unchanged.length+" 项自动调整未通过复查，已保留原设计。":"")+"缺少资料的问题请点“定位并处理”。";
    setStatus("项目修复完成：已处理 "+fixed.length+" 项，剩余 "+after.length+" 项");
  }catch(e){
    restoreState(before);snapshots=oldSnapshots;history=oldHistory;future=oldFuture;lastRepairUndo=null;persist();runPreflight();$("#preflightRepairStatus").textContent="修复中断，已恢复修复前状态："+e.message;
  }finally{preflightRepairBusy=false;renderPreflight()}
}
function locatePreflightIssue(x){
  if(!x)return;$("#preflightModal").hidden=true;
  if(x.cardId&&cards.some(function(c){return c.id===x.cardId}))selected=x.cardId;
  renderAll();setBeta3Panel("right",true);var key=preflightLayoutKey(x);
  if(key){setToolMode("layout");setLayoutMode(true,false);setSelection([{type:"layout",id:key}],{type:"layout",id:key});}
  else if(x.code==="unknown-term"){fillTermEditor(null);$("#ruleTermsModal").hidden=false;$("#termSearch").value=x.termName||"";renderRuleTermLibrary();$("#termName").value=x.termName||"";$("#termDescription").focus()}
  else if(/card-back|back-dpi/.test(x.code)){setToolMode("export");$("#cardBackPreview").scrollIntoView({block:"center"})}
  else if(/art|asset/.test(x.code)){setToolMode("visual");}
  else if(/duplicate-number|missing-number|field/.test(x.code)){$("#openDataTable").click();$("#dataTableSearch").value=current().name;renderDataTable()}
  else if(!x.cardId){$("#openProjectHub").click()}
  else{setToolMode("content")}
  setStatus("已定位："+x.cardName+" · "+preflightHelp(x));
}

function assetProvenanceText(a){if(!a||a.source!=="ai")return "";var bits=["AI",a.aiProvider||"外置服务",a.aiModel||"",a.aiQuality||""].filter(Boolean),when=a.generatedAt?new Date(a.generatedAt):null;if(when&&!isNaN(when.getTime()))bits.push(when.toLocaleString());return bits.join(" · ")}
function renderAssetManager(){var box=$("#assetManagerList"),summary=$("#assetManagerSummary");if(!box||!summary)return;cacheAllAssetBinaries();var total=userAssets.reduce(function(s,a){return s+assetSizeBytes(a)},0),used=userAssets.filter(function(a){return assetReferenceCount(a.id)>0}).length,shared=userAssets.filter(function(a){return assetHasRole(a,"shared")||a.shareable}).length;summary.innerHTML='<div><b>'+userAssets.length+'</b><span>素材</span></div><div><b>'+used+'</b><span>使用中</span></div><div><b>'+shared+'</b><span>共享素材</span></div><div><b>'+formatBytes(total)+'</b><span>二进制总量</span></div>';box.innerHTML=userAssets.length?userAssets.slice().sort(function(a,b){return assetReferenceCount(b.id)-assetReferenceCount(a.id)}).map(function(a){var refs=assetReferenceCount(a.id),data=a.dataUrl||assetBinaryCache[a.id]||"",prov=assetProvenanceText(a),cat=sharedAssetCategory(a);return '<div class="asset-manager-row"><div class="asset-manager-thumb">'+(data?'<img src="'+esc(data)+'">':'<span>无预览</span>')+'</div><div class="asset-manager-info"><b>'+esc(a.name||a.id)+'</b><small>'+esc(assetRoles(a).join(' / ')||"custom")+' · 共享分类 '+esc(cat)+' · '+formatBytes(assetSizeBytes(a))+' · '+refs+' 处引用</small>'+(prov?'<small class="asset-provenance">'+esc(prov)+'</small>':'')+'<code>'+esc(a.id)+'</code></div><div class="asset-manager-actions"><button data-asset-manager-share="'+a.id+'">'+(assetHasRole(a,"shared")?"共享中":"加入共享")+'</button><button data-asset-manager-place="'+a.id+'">放到卡面</button><button data-asset-manager-frame="'+a.id+'">设为卡框模板</button><button data-asset-manager-texture="'+a.id+'">设为底纹</button><button data-asset-manager-art="'+a.id+'">用作插画</button><button data-asset-manager-remove="'+a.id+'" '+(refs?'disabled title="仍被卡牌引用"':'')+'>删除未使用</button></div></div>'}).join(""):'<div class="empty-note">项目还没有素材。可以上传本地素材，或导入 Community / Studio 共享素材库。</div>'}
function openAssetManager(){renderAssetManager();$("#assetManagerModal").hidden=false}
$("#openAssetManager").onclick=openAssetManager;$("#closeAssetManager").onclick=function(){$("#assetManagerModal").hidden=true};$("#assetManagerModal").addEventListener("click",function(e){if(e.target===this)this.hidden=true});
$("#importSharedAssets").onclick=function(){$("#sharedAssetFile").click()};
$("#sharedAssetFile").onchange=async function(){var file=this.files&&this.files[0];this.value="";if(!file)return;try{if(file.size>120*1024*1024)throw new Error("素材库文件超过 120MB");var pack=normalizeSharedAssetPack(JSON.parse(await file.text()));recordHistory();var out=mergeSharedAssets(pack);renderAll();renderAssetManager();persist();setStatus("共享素材已合并：新增 "+out.added+"，复用 "+out.reused+" · "+pack.name)}catch(err){setStatus("共享素材导入失败："+(err&&err.message||err))}};
$("#exportSharedAssets").onclick=downloadSharedAssetLibrary;
$("#assetManagerList").onclick=async function(e){var btn=e.target.closest("button");if(!btn)return;var id=btn.getAttribute("data-asset-manager-remove")||btn.getAttribute("data-asset-manager-share")||btn.getAttribute("data-asset-manager-place")||btn.getAttribute("data-asset-manager-frame")||btn.getAttribute("data-asset-manager-texture")||btn.getAttribute("data-asset-manager-art"),a=assetById(id);if(!id||!a)return;if(btn.hasAttribute("data-asset-manager-share")){recordHistory();a.roles=assetRoles(a);var si=a.roles.indexOf("shared");if(si>=0)a.roles.splice(si,1);else a.roles.push("shared");renderAssetManager();persist();setStatus(si>=0?"已取消共享标记："+a.name:"已加入共享素材："+a.name);return}if(btn.hasAttribute("data-asset-manager-place")){setLayoutMode(true,false);addFreeImage(a);$("#assetManagerModal").hidden=true;return}if(btn.hasAttribute("data-asset-manager-frame")){try{await imageTools.applyRole(a,"frameImage")}catch(err){setStatus(err.message);return}a.roles=assetRoles(a);if(a.roles.indexOf("frameImage")<0)a.roles.push("frameImage");renderAll();persist();setStatus("已设为当前卡牌卡框模板："+a.name);return}if(btn.hasAttribute("data-asset-manager-texture")){try{await imageTools.applyRole(a,"textureImage")}catch(err){setStatus(err.message);return}a.roles=assetRoles(a);if(a.roles.indexOf("textureImage")<0)a.roles.push("textureImage");renderAll();persist();setStatus("已设为当前卡牌底纹："+a.name);return}if(btn.hasAttribute("data-asset-manager-art")){recordHistory();current().art="";current().artAssetId=id;a.roles=assetRoles(a);if(a.roles.indexOf("art")<0)a.roles.push("art");renderAll();persist();setStatus("已用作当前卡牌插画："+a.name);return}if(btn.hasAttribute("data-asset-manager-remove")){if(assetReferenceCount(id)>0)return;recordHistory();userAssets=userAssets.filter(function(x){return x.id!==id});renderAssetManager();renderCustomAssets();persist();setStatus("已删除未使用素材")}};
$("#cleanupUnusedAssets").onclick=function(){var ids=userAssets.filter(function(a){return assetReferenceCount(a.id)===0&&!assetHasRole(a,"shared")&&!a.shareable}).map(function(a){return a.id});if(!ids.length){setStatus("没有可安全清理的未使用私人素材；共享素材会保留在素材库中");return}recordHistory();userAssets=userAssets.filter(function(a){return ids.indexOf(a.id)<0});renderAssetManager();renderCustomAssets();persist();setStatus("已清理 "+ids.length+" 个未使用私人素材；共享素材已保留")};
function releaseCardData(c,index){var x=ttsCard(c,index);x.customFields={};schemaForCard(c).forEach(function(f){x.customFields[f.key]={label:f.label,type:f.type,value:customFieldValue(c,f.key),display:displayCustomFieldValue(c,f)}});x.ruleBlocks=structuredRuleBlocks(c.description,c);x.printQuality={artDpi:artEffectiveDpi(c),targetDpi:dpiThresholds().target,minimumDpi:dpiThresholds().minimum};return x}
async function buildReleasePackage(){
  var issues=runPreflight(),errors=issues.filter(function(x){return x.level==="error"});if(errors.length){$("#preflightModal").hidden=false;throw new Error("发布被阻止：仍有 "+errors.length+" 个错误，请先处理项目检查中的红色问题")}
  var zip=new JSZip(),stamp=new Date().toISOString().replace(/[:.]/g,"-").slice(0,19),release={format:"card-studio-release",version:10,project:projectName,builtAt:new Date().toISOString(),cardCount:cards.length,warnings:issues.filter(function(x){return x.level==="warn"}).length,schemaVersion:20};
  zip.file("release.json",JSON.stringify(release,null,2));zip.file("manifest.csv","\uFEFF"+Papa.unparse(manifestRows(cards)));zip.file("database/cards.json",JSON.stringify({project:projectName,cards:cards.map(releaseCardData)},null,2));zip.file("database/sets.json",JSON.stringify({sets:projectSets},null,2));zip.file("database/families.json",JSON.stringify({families:cardFamilies},null,2));zip.file("testing/playtests.json",JSON.stringify({records:playtests,summary:projectPlaytestSummary()},null,2));zip.file("versions/current.json",JSON.stringify(projectVersionState(),null,2));zip.file("rules/glossary.json",JSON.stringify({terms:ruleTerms},null,2));zip.file("report/preflight.json",JSON.stringify({builtAt:release.builtAt,issues:issues},null,2));zip.file("report/visual-audit.json",JSON.stringify({builtAt:release.builtAt,cards:cards.map(function(c){return {cardId:c.id,name:c.name,templateId:c.templateId,audit:reviewAuditForCard(c,duplicateNumberMap(),reviewTemplateStats())}})},null,2));zip.file("project/project.json",JSON.stringify(projectPayload(false),null,2));
  zip.file("production/settings.json",JSON.stringify({sheet:printSettings.sheet,cropMarks:!!printSettings.crop,duplexFlip:printSettings.duplexFlip||"long",backRotate:!!printSettings.backRotate,bleedSizeMm:[CARD_BLEED_W_MM,CARD_BLEED_H_MM],trimSizeMm:[CARD_TRIM_W_MM,CARD_TRIM_H_MM],safeContentMm:Number(projectDesign.safeContentMm==null?3:projectDesign.safeContentMm),cardBackProfiles:cardBackProfiles,bleedMm:CARD_BLEED_MM},null,2));
  var backCache={},backMap={},writtenBacks={};
  for(var i=0;i<cards.length;i++){
    var c=cards[i],b=cardBackAssetForCard(c);if(b){var base="images/backs/"+safeFilename(b.name||b.id)+"-"+b.id.slice(0,8),orig=base+"-original."+assetExtension(b),trim=base+"-trimmed.png";backMap[c.id]={assetId:b.id,route:cardBackRouteForCard(c),original:orig,trimmed:trim};if(!writtenBacks[b.id]){var raw=b.dataUrl||assetBinaryCache[b.id]||"";if(raw)zip.file(orig,raw.split(",")[1],{base64:true});var td=await cardBackDataUrlForCard(c,744,Math.round(744*CARD_TRIM_H_MM/CARD_TRIM_W_MM),backCache);zip.file(trim,td.split(",")[1],{base64:true});writtenBacks[b.id]=true}}else backMap[c.id]={assetId:"",route:"未设置卡背",original:"",trimmed:""};
    setStatus("发布构建：渲染卡牌 "+(i+1)+" / "+cards.length);var data=await capture(c,"png");zip.file("images/png/"+String(i+1).padStart(3,"0")+"-"+safeFilename(c.name)+".png",data.split(",")[1],{base64:true})
  }
  zip.file("images/backs/map.json",JSON.stringify(backMap,null,2));
  var releaseAudit=productionAuditSample(cards),releaseAuditJson={builtAt:release.builtAt,samples:releaseAudit.map(function(x){return {cardId:x.card.id,cardNumber:x.card.cardNumber,name:x.card.name,reason:x.reason,artDpi:artEffectiveDpi(x.card),backRoute:cardBackRouteForCard(x.card)}})};zip.file("report/sample-audit.json",JSON.stringify(releaseAuditJson,null,2));var releaseAuditSheet=await buildAuditContactSheet(releaseAudit);if(releaseAuditSheet)zip.file("report/sample-audit.png",releaseAuditSheet.split(",")[1],{base64:true});
  zip.file("README.txt","CardStudio Release Build\n\nimages/png：最终含出血卡面 PNG\nimages/backs：按 Set → 类型 → 项目默认策略解析并去重的卡背；map.json 保存每张卡对应关系\ndatabase/cards.json：结构化卡牌数据\ndatabase/sets.json：扩展包定义\ndatabase/families.json：卡牌家族 / 变体关系\ntesting/playtests.json：测试记录与汇总\nversions/current.json：当前版本结构快照\nrules/glossary.json：规则词典\nmanifest.csv：人工清单\nreport/preflight.json：本次发布前检查结果\nproject/project.json：不含图片二进制的项目结构快照\nproduction/settings.json：纸张、裁切线、安全距、双面翻页与卡背路由设置\n");
  return {blob:await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}}),stamp:stamp}
}
$("#buildRelease").onclick=async function(){var btn=this;btn.disabled=true;setStatus("发布构建开始：先执行完整项目检查……");try{var out=await buildReleasePackage(),url=URL.createObjectURL(out.blob);download(url,safeFilename(projectName)+"-Release-"+out.stamp+".zip");setTimeout(function(){URL.revokeObjectURL(url)},300000);releaseHistory.unshift({id:uid(),time:new Date().toISOString(),label:"Release "+out.stamp,cardCount:cards.length,warnings:lastPreflightIssues.filter(function(x){return x.level==="warn"}).length,production:{sheet:printSettings.sheet,duplexFlip:printSettings.duplexFlip||"long",backRotate:!!printSettings.backRotate,cardBackAssetId:projectDesign.cardBackAssetId||"",cardBackProfiles:clone(cardBackProfiles),safeContentMm:Number(projectDesign.safeContentMm==null?3:projectDesign.safeContentMm)},sets:projectSets.map(function(x){return {id:x.id,code:x.code,name:x.name,locked:x.locked}})});releaseHistory=releaseHistory.slice(0,30);persist();setStatus("发布构建完成："+cards.length+" 张卡牌；结构数据、规则、测试、版本、清单与检查报告已打包")}catch(e){setStatus(e.message)}btn.disabled=false};
function openPreflight(){$("#preflightModal").hidden=false;setStatus("正在进行精确项目检查……");requestAnimationFrame(function(){runPreflight();setStatus(lastPreflightIssues.length?"项目检查完成：发现 "+lastPreflightIssues.length+" 项":"项目检查通过")})}
$("#openPreflight").onclick=openPreflight;$("#summaryIssues").onclick=openPreflight;$("#closePreflight").onclick=function(){$("#preflightModal").hidden=true};$("#preflightModal").addEventListener("click",function(e){if(e.target===this&&!preflightRepairBusy)this.hidden=true});$("#preflightFilter").onchange=renderPreflight;$("#rerunPreflight").onclick=runPreflight;$("#preflightResults").onclick=function(e){var fix=e.target.closest("[data-preflight-fix]"),go=e.target.closest("[data-preflight-go]");if(fix){repairPreflight(fix.getAttribute("data-preflight-fix"));return}if(go)locatePreflightIssue(lastPreflightIssues[Number(go.getAttribute("data-preflight-go"))])};
$("#repairPreflightAll").onclick=function(){repairPreflight()};$("#undoPreflightRepair").onclick=undoPreflightRepair;$("#exportPreflightReport").onclick=function(){downloadText(JSON.stringify({version:APP_VERSION,project:projectName,bleedMm:CARD_BLEED_MM,trimSizeMm:[CARD_TRIM_W_MM,CARD_TRIM_H_MM],repair:lastRepairReport,issues:lastPreflightIssues},null,2),safeFilename(projectName)+"-项目检查.json","application/json")};
window.addEventListener("keydown",function(e){if(preflightRepairBusy){e.preventDefault();e.stopImmediatePropagation()}},true);
$("#liveQaBadge").onclick=openPreflight;$("#closeTemplateImpact").onclick=function(){closeTemplateImpact(true)};$("#cancelTemplateImpact").onclick=function(){closeTemplateImpact(true)};$("#confirmTemplateImpact").onclick=confirmTemplateImpact;$("#templateImpactModal").addEventListener("click",function(e){if(e.target===this)closeTemplateImpact(true)});

// ---------- 3.0 Beta 4 stability, recovery and first-run flow ----------
var runtimeErrors=[],recoveryCandidate=null;
function showRuntimeProblem(message){var msg=String(message||"未知运行异常").slice(0,500);runtimeErrors.unshift({time:new Date().toISOString(),message:msg});runtimeErrors=runtimeErrors.slice(0,12);var bar=$("#runtimeBanner");if(bar){bar.hidden=false;$("#runtimeBannerText").textContent=msg+"。当前项目仍保留，请先保存项目；若界面状态异常，可使用安全恢复。"}setSaveIndicator("error","运行异常 · 请保存")};
window.addEventListener("error",function(e){if(e&&e.error)showRuntimeProblem(e.error.stack||e.error.message||e.message)});window.addEventListener("unhandledrejection",function(e){var r=e&&e.reason;showRuntimeProblem(r&&r.stack||r&&r.message||String(r||"Promise 异常"))});
$("#runtimeDismiss").onclick=function(){$("#runtimeBanner").hidden=true};$("#runtimeSaveNow").onclick=function(){$("#projectExport").click()};$("#runtimeOpenRecovery").onclick=function(){openRecovery()};
function renderRuntimeErrors(){var box=$("#runtimeErrorList");if(!box)return;box.innerHTML=runtimeErrors.length?'<b>本次运行捕获到的异常</b>'+runtimeErrors.map(function(x){return '<div><time>'+esc(new Date(x.time).toLocaleTimeString("zh-CN",{hour12:false}))+'</time><span>'+esc(x.message)+'</span></div>'}).join(""):'<div class="empty-note">本次运行没有捕获到 JavaScript 异常。</div>'}
async function openRecovery(){recoveryCandidate=null;$("#recoveryModal").hidden=false;$("#recoveryInfo").textContent="正在读取安全备份…";$("#restoreRecovery").disabled=true;renderRuntimeErrors();try{recoveryCandidate=await dbGet(RECOVERY_DB_KEY);if(recoveryCandidate&&recoveryCandidate.project&&Array.isArray(recoveryCandidate.project.cards)){var dt=new Date(recoveryCandidate.updatedAt||0);$("#recoveryInfo").innerHTML='<b>可恢复安全备份</b><span>'+esc(dt.toLocaleString("zh-CN",{hour12:false}))+' · '+recoveryCandidate.project.cards.length+' 张卡牌</span><small>这是上一次成功自动保存之前的项目结构，用于回退误操作或运行异常。</small>';$("#restoreRecovery").disabled=false}else $("#recoveryInfo").innerHTML='<b>暂无可恢复备份</b><span>完成至少两次自动保存后，这里会保留上一份稳定状态。</span>'}catch(e){$("#recoveryInfo").textContent="读取安全备份失败："+e.message}}
$("#openRecovery").onclick=openRecovery;$("#closeRecovery").onclick=function(){$("#recoveryModal").hidden=true};$("#recoveryModal").addEventListener("click",function(e){if(e.target===this)this.hidden=true});$("#recoverySaveCurrent").onclick=function(){$("#projectExport").click()};$("#restoreRecovery").onclick=async function(){if(!recoveryCandidate||!recoveryCandidate.project)return;try{recordHistory();var p=clone(recoveryCandidate.project),assets=await dbGetAssets();p.userAssets=assets.length?assets:(p.userAssets||[]);applyImportedProject(p);snapshots=recoveryCandidate.snapshots||snapshots;$("#recoveryModal").hidden=true;renderAll();persist();setStatus("已恢复到上一份稳定自动保存；当前状态仍可通过撤销返回")}catch(e){setStatus("安全恢复失败："+e.message)}};
function setQuickStartSeen(){try{localStorage.setItem("card-studio-beta1-welcome","1")}catch(e){}}
function openQuickStart(){$("#quickStartModal").hidden=false}
$("#openQuickStart").onclick=openQuickStart;$("#closeQuickStart").onclick=function(){setQuickStartSeen();$("#quickStartModal").hidden=true};$("#quickStartSample").onclick=function(){setQuickStartSeen();$("#quickStartModal").hidden=true;setStatus("示例项目已保留；建议先修改卡名，再打开“全套审阅墙”观察整套一致性")};$("#quickStartProject").onclick=function(){setQuickStartSeen();$("#quickStartModal").hidden=true;$("#projectFile").click()};$("#quickStartData").onclick=function(){setQuickStartSeen();$("#quickStartModal").hidden=true;$("#importFile").click()};$("#quickStartBlank").onclick=function(){setQuickStartSeen();recordHistory();projectName="未命名卡牌项目";cards=[makeCard("unit")];selected=cards[0].id;projectSets=[];cardFamilies=[];playtests=[];projectVersions=[];releaseHistory=[];dataSelection={};renderAll();persist();$("#quickStartModal").hidden=true;setStatus("已建立空白卡牌项目：先设计一种类型模板，再批量录入卡牌会最稳定")};

// ---------- 3.0 Beta 4 quiet shell ----------
function refreshBeta3Context(){var el=$("#inspectorContext");if(!el)return;var c=current();if(layoutEditing){var m=selectedModel(c);el.textContent=m?m.label:"布局 · 请选择对象"}else el.textContent=c&&c.name?c.name:"当前卡牌"}
function moveBeta3Shell(){var mode=document.querySelector(".editor-mode-bar"),modeSlot=$("#stageModeSlot"),summary=document.querySelector(".project-summary"),summarySlot=$("#headerStatusSlot");if(mode&&modeSlot&&mode.parentNode!==modeSlot)modeSlot.appendChild(mode);if(summary&&summarySlot&&summary.parentNode!==summarySlot)summarySlot.appendChild(summary);var sub=document.querySelector(".app-subbar");if(sub)sub.setAttribute("aria-hidden","true")}
function setBeta3Panel(side,visible,remember){var left=side==="left",cls=left?"panel-left-hidden":"panel-right-hidden",btn=$(left?"#toggleLeftPanel":"#toggleRightPanel");document.body.classList.toggle(cls,!visible);if(btn){btn.classList.toggle("active",visible);btn.setAttribute("aria-pressed",visible?"true":"false")}if(remember!==false){try{localStorage.setItem("card-studio-beta3-"+side,visible?"1":"0")}catch(e){}}}
function restoreBeta3Panels(){var lv=true,rv=true;try{var l=localStorage.getItem("card-studio-beta3-left"),r=localStorage.getItem("card-studio-beta3-right");if(l!==null)lv=l==="1";if(r!==null)rv=r==="1"}catch(e){}setBeta3Panel("left",lv,false);setBeta3Panel("right",rv,false)}
moveBeta3Shell();restoreBeta3Panels();loadAiProviders();
if($("#toggleLeftPanel"))$("#toggleLeftPanel").onclick=function(){setBeta3Panel("left",document.body.classList.contains("panel-left-hidden"))};
if($("#toggleRightPanel"))$("#toggleRightPanel").onclick=function(){setBeta3Panel("right",document.body.classList.contains("panel-right-hidden"))};

window.initializeGlossaryBridge({getTerms:function(){return ruleTerms},getCards:function(){return cards},isCardLocked:isCardLocked,extractRuleTerms:extractRuleTerms,recordHistory:recordHistory,mergeSharedGlossaryTerms:mergeSharedGlossaryTerms,renderAll:renderAll,renderRuleTermLibrary:renderRuleTermLibrary,fillTermEditor:fillTermEditor,persist:persist,setStatus:setStatus,esc:esc});
if(window.initializePublicRepository)window.initializePublicRepository({
  edition:'studio',getTerms:function(){return ruleTerms},setStatus:setStatus,
  getAssets:function(){return userAssets.map(hydratedAsset).filter(function(a){return safeSharedRasterDataUrl(a.dataUrl)}).map(function(a){return Object.assign({},a,{category:sharedAssetCategory(a)})})},
  saveTerm:function(raw){
    var old=ruleTerms.find(function(t){return t.id===raw.id}),term=window.CARDSTUDIO_GLOSSARY.normalizeTerm(Object.assign({},raw,{id:old?old.id:uid()}));
    var next=ruleTerms.filter(function(t){return !old||t.id!==old.id}).concat([term]);window.CARDSTUDIO_GLOSSARY.normalizeTerms(next);
    var names=[term.name];if(old)names.push(old.name);if(cardsUsingTerm(term.name).concat(old?cardsUsingTerm(old.name):[]).some(isCardLocked))throw Error('锁定卡正在引用该词条，请先解锁后修改');
    recordHistory();if(old&&old.name!==term.name)cards.forEach(function(c){c.description=String(c.description||'').split('[['+old.name+']]').join('[['+term.name+']]')});ruleTerms=next;renderAll();persist();return term;
  },
  adoptTerm:function(raw,use){
    if(use&&isCardLocked(current()))throw Error('当前卡牌已锁定，请先解锁');var term=window.CARDSTUDIO_GLOSSARY.normalizeTerm(raw),locked=[];cards.filter(isCardLocked).forEach(function(c){locked.push.apply(locked,extractRuleTerms(c.description))});var row=window.CARDSTUDIO_GLOSSARY.planMerge(ruleTerms,[term],locked)[0];
    if(row.kind==='blocked')throw Error('锁定卡正在引用旧版本词条，请先解锁');if(row.kind!=='same'){if(row.existing&&!confirm('我的资料已有同名词条。确认采用这份完整设计？'))throw Error('已保留原词条');recordHistory();mergeSharedGlossaryTerms([term],[0]);renderAll();persist()}
    if(use)insertDescriptionToken(term.name);
  },
  saveAsset:function(raw){
    var pack=normalizeSharedAssetPack({schema:'cardstudio-asset-library-v1',assets:[raw]}),a=pack.assets[0];if(!a||!safeSharedRasterDataUrl(a.dataUrl))throw Error('素材图片无效');if(!findAssetByDataUrl(a.dataUrl)&&userAssets.length>=1000)throw Error('我的素材已达 1000 项，请先清理');
    recordHistory();var saved=registerAsset(a.dataUrl,a.name,sharedCategoryToStudioRole(a.category),{width:a.width,height:a.height});saved.name=a.name;saved.sharedCategory=a.category;saved.tags=a.tags;saved.description=String(raw.description||'').slice(0,4000);saved.repositoryId=raw.repositoryId||saved.repositoryId||'';saved.repositoryRevision=Number(raw.repositoryRevision)||saved.repositoryRevision||0;renderAll();persist();return Object.assign({},hydratedAsset(saved),{category:sharedAssetCategory(saved)});
  },
  removeTerm:function(term){if(cardsUsingTerm(term.name).some(isCardLocked))throw Error('锁定卡正在引用该词条，请先解锁');recordHistory();cards.forEach(function(c){c.description=String(c.description||'').split('[['+term.name+']]').join(term.name)});ruleTerms=ruleTerms.filter(function(t){return t.id!==term.id});renderAll();persist()},
  removeAsset:function(asset){if(assetReferenceCount(asset.id)>0)throw Error('当前项目仍在使用该素材，请先移除卡牌引用');recordHistory();userAssets=userAssets.filter(function(a){return a.id!==asset.id});renderAll();persist()},
  useAsset:function(asset){if(isCardLocked(current()))throw Error('当前卡牌已锁定，请先解锁');setLayoutMode(true,false);addFreeImage(assetById(asset.id))}
});
renderAll();setSaveIndicator("saved");
Promise.all([dbGet(PRIMARY_DB_KEY),dbGetAssets()]).then(function(pair){var savedDb=pair[0],storedAssets=pair[1]||[];dbReady=true;if(savedDb&&savedDb.project&&Array.isArray(savedDb.project.cards)&&savedDb.project.cards.length){lastDurableProject=clone(savedDb);bootstrapping=false;var p=savedDb.project;p.userAssets=storedAssets.length?storedAssets:(p.userAssets||[]);applyImportedProject(p);snapshots=savedDb.snapshots||snapshots;renderAll();setSaveIndicator("saved","已恢复自动保存");setStatus("已恢复完整卡牌项目：Beta 4 简约工作区、稳定机制与外置 AI 接入层已启用")}else{Promise.all([dbGet("project-v12"),dbGet("project-v11"),dbGet("project-v10"),dbGet("project-v9"),dbGet("project-v8"),dbGet("project-v7"),dbGet("project-v6"),dbGet("project-v5"),dbGet("project-v4"),dbGet("project-v3")]).then(function(old){var oldDb=old.find(function(x){return x&&x.project&&Array.isArray(x.project.cards)&&x.project.cards.length});if(oldDb){lastDurableProject=clone(oldDb);bootstrapping=false;applyImportedProject(oldDb.project);snapshots=oldDb.snapshots||snapshots;renderAll();persist();setStatus("已从旧版自动保存迁移到 Beta 4 稳定模型")}else{bootstrapping=false;scheduleDbSave(0);if(saved&&saved.cards&&saved.cards.length)setStatus("已从浏览器本地备份恢复卡牌，并迁移到 Beta 4 自动保存");else if(!localStorage.getItem("card-studio-beta1-welcome"))setTimeout(openQuickStart,180)}}).catch(function(e){dbReady=true;bootstrapping=false;scheduleDbSave(0);showRuntimeProblem(e.message)})}}).catch(function(e){dbReady=true;bootstrapping=false;scheduleDbSave(0);showRuntimeProblem(e.message)});
})();
