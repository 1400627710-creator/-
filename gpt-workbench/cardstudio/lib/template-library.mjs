import {available,BASIC_ID,creationDefault,captureVisual} from './layout-core.mjs';
export {creationDefault,defaultTemplateId} from './layout-core.mjs';
import {copy,uid} from './model.mjs';
const builtins=new Set(['basic-unit','unit','spell','building','event']);
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
export const MAX_TEMPLATE_BYTES=24*1024*1024;
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const visualKeys=['cardRules','cardKind','appearance','layout','layoutOverrides','extraElements','textStyles','badgeOffsets','imageLayerDefaults','artAssetId','art'];
const designKeys=['layoutStep','snapTolerance','axisTolerancePx','safeMargin','safeContentMm','bleedMm','showPrintGuides','targetPrintDpi','minimumPrintDpi','titleMinFont','effectMinFont','ruleLineHeight','ruleBlockGapEm','ruleStyle','ruleIconBaselineEm','ruleTailChars','ruleWidowControl','artSubjectSafePct','opticalCentering','opticalTolerancePx','primary','secondary','accent','text','fontStyle','fieldLabels'];
const select=(x,keys)=>Object.fromEntries(keys.filter(k=>x?.[k]!==undefined).map(k=>[k,copy(x[k])]));
const builtIcons=new Set(['none','auto','cost','attack','health','move','range','armor','draw']);
const imageData=x=>typeof x==='string'&&/^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml)(?:;[^,]*)?,/i.test(x);
function safeTree(x,depth=0){
 assert(depth<40,'模板结构嵌套过深');
 if(Array.isArray(x)){assert(x.length<=5000,'模板列表过长');x.forEach(v=>safeTree(v,depth+1));}
 else if(object(x))for(const [k,v] of Object.entries(x)){assert(!['__proto__','constructor','prototype'].includes(k),'模板包含不支持的结构键');safeTree(v,depth+1);}
 else if(typeof x==='number')assert(Number.isFinite(x),'模板包含无效数字');
}
function assetReferences(visual,back,assets,badges={}){
 const ids=new Set;const add=x=>{if(x)ids.add(String(x));};
 add(visual?.artAssetId);for(const k of ['frameImageAssetId','textureImageAssetId','iconAssetId'])add(visual?.appearance?.[k]);
 for(const el of visual?.extraElements||[])add(el.assetId);
 for(const v of Object.values({...badges,...visual?.badgeOffsets}))if(v.icon&&!builtIcons.has(v.icon))add(v.icon);
 for(const el of visual?.extraElements||[])for(const match of String(el.text||'').matchAll(/\{\{icon:([^}]+)\}\}/g)){
  const key=match[1].trim();if(!builtIcons.has(key)){const asset=assets.find(a=>a.id===key||a.name?.toLowerCase()===key.toLowerCase());assert(asset,'模板自由文字引用的图标素材缺失：'+key);add(asset.id);}
 }
 add(back);return ids;
}
function remapAssets(value,ids){
 if(Array.isArray(value))return value.map(v=>remapAssets(v,ids));
 if(object(value))return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,typeof v==='string'&&(k==='assetId'||k.endsWith('AssetId')||k==='icon')&&ids.has(v)?ids.get(v):remapAssets(v,ids)]));
 if(typeof value==='string')for(const [old,id] of ids)value=value.replaceAll('{{icon:'+old+'}}','{{icon:'+id+'}}');
 return value;
}
function checkGeometry(layout){
 assert(object(layout),'模板布局格式不正确');
 for(const p of Object.values(layout)){assert(object(p),'图层布局格式不正确');for(const k of ['x','y','w','h','r','z','opacity','materialOpacity','textOpacity'])if(p[k]!=null)assert(typeof p[k]==='number'&&Number.isFinite(p[k]),'图层位置、比例或透明度无效');for(const k of ['w','h'])if(p[k]!=null)assert(p[k]>0,'图层宽高必须大于零');for(const k of ['opacity','materialOpacity','textOpacity'])if(p[k]!=null)assert(p[k]>=0&&p[k]<=1,'图层透明度必须在 0 到 1 之间');}
}
function templateVisual(studio,id){const saved=creationDefault(studio);return saved?.templateId===id?saved.visual:studio.customTemplates?.[id]?.visual||null;}
function remapReferences(value,keys){
  if(Array.isArray(value))return value.map(x=>remapReferences(x,keys));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,x])=>[key,remapReferences(x,keys)]));
  if(typeof value==='string')for(const [old,fresh] of keys){if(value==='custom:'+old)value='custom:'+fresh;value=value.replaceAll('{'+old+'}','{'+fresh+'}');}
  return value;
}
export function availableTemplateCatalog(studio,catalog,includeRetired=false){return Object.fromEntries(available(catalog,studio,includeRetired).map(id=>[id,catalog[id]]));}
export function templateNames(studio,catalog){
  return Object.fromEntries(Object.entries(catalog).map(([id,t])=>[id,{...copy(t),name:studio.projectDesign?.templateLabels?.[id]??t.name}]));
}
export function renameTemplate(studio,catalog,id,name){
  assert(catalog[id],'模板已不存在');studio.projectDesign||={};studio.projectDesign.templateLabels||={};
  studio.projectDesign.templateLabels[id]=String(name);
  if(studio.customTemplates?.[id]){studio.customTemplates[id].name=String(name);studio.customTemplates[id].short=String(name).slice(0,8);}
}
export function copyTemplate(studio,catalog,id,name){
  const base=catalog[id];assert(base,'请选择已有模板作为起点');
  const next='custom-'+uid('tpl');studio.customTemplates||={};studio.templateLayouts||={};studio.templateConditions||={};
  studio.customTemplates[next]={...copy(base),id:next,name:String(name),short:String(name).slice(0,8),baseLayout:base.baseLayout||base.id};
  const keys=new Map;
  for(const f of [...(studio.fieldSchema||[])].filter(f=>f.tpl===id)){const key='field_'+uid('k').replaceAll('-','_');keys.set(f.key,key);studio.fieldSchema.push({...copy(f),id:uid('field'),key,tpl:next});}
  const layout=studio.templateLayouts[id]||base.masterLayout;
  if(layout){studio.templateLayouts[next]=remapReferences(copy(layout),keys);studio.customTemplates[next].masterLayout=copy(studio.templateLayouts[next]);}
  studio.templateConditions[next]=remapReferences(copy(studio.templateConditions[id]||{}),keys);
  const visual=templateVisual(studio,id);if(visual)studio.customTemplates[next].visual=remapReferences(copy(visual),keys);
  if(studio.templateBadgeStyles?.[id]){studio.templateBadgeStyles[next]=copy(studio.templateBadgeStyles[id]);}
  if(studio.cardBackProfiles?.byTemplate?.[id])studio.cardBackProfiles.byTemplate[next]=studio.cardBackProfiles.byTemplate[id];
  return next;
}
export function retireTemplate(studio,catalog,id,retired=true){
  assert(catalog[id],'模板已不存在');assert(!['unit',BASIC_ID].includes(id)||!retired,'标准单位模板作为空白起点保留');
  assert(!retired||creationDefault(studio,catalog)?.templateId!==id,'这是当前唯一默认，请先将另一张卡片设为默认');
  studio.projectDesign||={};const hidden=new Set(studio.projectDesign.hiddenTemplates||[]);
  if(retired)hidden.add(id);else hidden.delete(id);studio.projectDesign.hiddenTemplates=[...hidden];
  // Definitions and existing cards remain intact, including locked cards.
}
export function templatePackage(studio,catalog,id,options={}){
  assert(catalog[id],'模板已不存在');
  const card=options.cardId?(studio.cards||[]).find(c=>c.id===options.cardId&&c.templateId===id):null;
  assert(!options.cardId||card,'当前编辑布局已不存在，请重新选择');
  const visual=card?captureVisual(studio,card):copy(templateVisual(studio,id));
  for(const el of visual?.extraElements||[])if(el.text)el.text=el.text.replace(/\{\{icon:([^}]+)\}\}/g,(full,key)=>{const a=(studio.userAssets||[]).find(a=>a.id===key.trim()||a.name?.toLowerCase()===key.trim().toLowerCase());return a?'{{icon:'+a.id+'}}':full;});
  const design=select((card||creationDefault(studio)?.templateId===id)?studio.projectDesign:studio.customTemplates?.[id]?.design||studio.projectDesign,designKeys);
  const back=studio.cardBackProfiles?.byTemplate?.[id]||studio.projectDesign?.cardBackAssetId||'';
  const allAssets=studio.userAssets||[],refs=assetReferences(visual,back,allAssets,studio.templateBadgeStyles?.[id]),assets=[];
  for(const ref of refs){const asset=allAssets.find(a=>a.id===ref);assert(asset&&imageData(asset.dataUrl),'模板素材缺失或尚未载入：'+(asset?.name||ref)+'。请先重新导入原图');assets.push(select(asset,['id','name','category','roles','dataUrl','width','height','alphaBounds','alphaSampleScale','transparentPercent','hasAlpha','imageInspected']));}
  const definition=select(catalog[id],['id','name','short','hint','typeLabel','stats','baseLayout','cardRules']);
  if(options.name!==undefined){definition.name=String(options.name);definition.short=String(options.name).slice(0,8);}
  const raw={format:'cardstudio-template',version:2,exportedAt:new Date().toISOString(),template:definition,layout:copy(visual?.layout||studio.templateLayouts?.[id]||catalog[id].masterLayout||null),conditions:copy(studio.templateConditions?.[id]||{}),fields:copy((studio.fieldSchema||[]).filter(f=>!f.tpl||f.tpl===id)),visual:visual?select(visual,visualKeys):null,design,badgeStyles:copy(studio.templateBadgeStyles?.[id]||{}),cardBackAssetId:back,assets};
  validateTemplatePackage(raw);return raw;
}
export function validateTemplatePackage(raw){
  assert(raw?.format==='cardstudio-template'&&[1,2].includes(raw.version),'请选择卡递模板文件');
  assert(new TextEncoder().encode(JSON.stringify(raw)).length<=MAX_TEMPLATE_BYTES,'模板文件超过 24 MB，请压缩素材原图');safeTree(raw);
  const t=raw.template;assert(t&&typeof t.name==='string'&&Array.isArray(t.stats)&&t.stats.every(s=>Array.isArray(s)&&['attack','health','move','range'].includes(s[0])&&s.slice(1).every(x=>typeof x==='string')),'模板格式不正确');
  if(raw.layout)checkGeometry(raw.layout);
  assert(!raw.conditions||object(raw.conditions),'条件显示规则格式不正确');
  assert(!raw.fields||Array.isArray(raw.fields),'模板字段应为列表');assert((raw.fields||[]).length<=100,'一个模板最多导入 100 个自定义字段');
  if(raw.version===2){
   assert(!raw.visual||object(raw.visual),'完整模板格式不正确');const v=raw.visual;
   if(v){if(v.layout)checkGeometry(v.layout);assert(!v.appearance||object(v.appearance),'模板外观格式不正确');assert(!v.art||imageData(v.art),'模板插画必须随文件保存，不能引用临时地址');assert(!v.extraElements||Array.isArray(v.extraElements),'自由图层应为列表');const seen=new Set;for(const el of v.extraElements||[]){assert(object(el)&&typeof el.id==='string'&&!seen.has(el.id),'自由图层编号无效或重复');seen.add(el.id);assert(['text','image','number','shape'].includes(el.kind),'自由图层类型无效');if(el.layout)checkGeometry({layer:el.layout});assert(!el.src||imageData(el.src),'自由图片必须随文件保存，不能引用临时地址');}for(const el of v.extraElements||[])assert(!el.parentId||seen.has(el.parentId),'自由图层的父层缺失');}
   assert(Array.isArray(raw.assets)&&raw.assets.length<=1000,'模板素材列表无效');const ids=new Set;for(const a of raw.assets){assert(object(a)&&typeof a.id==='string'&&a.id&&!ids.has(a.id)&&imageData(a.dataUrl),'模板素材缺失、编号重复或图片格式无效');ids.add(a.id);}
   for(const ref of assetReferences(v,raw.cardBackAssetId,raw.assets,raw.badgeStyles))assert(ids.has(ref),'模板缺少素材：'+ref);
   assert(!raw.design||object(raw.design),'模板画布设置无效');if(raw.design?.bleedMm!=null)assert(typeof raw.design.bleedMm==='number'&&raw.design.bleedMm>=0&&raw.design.bleedMm<=10,'出血值必须为 0 到 10 毫米');if(raw.design?.fieldLabels)assert(object(raw.design.fieldLabels)&&Object.values(raw.design.fieldLabels).every(v=>typeof v==='string'),'字段名称格式无效');assert(!raw.badgeStyles||object(raw.badgeStyles),'模板徽章格式无效');
  }
  return raw;
}
export function importTemplate(studio,raw,options={}){
  validateTemplatePackage(raw);const next=copy(studio),id=importInto(next,raw,options);
  assert(new TextEncoder().encode(JSON.stringify(next)).length<=MAX_TEMPLATE_BYTES,'导入后项目超过 24 MB，请先压缩或减少素材');
  Object.assign(studio,next);return id;
}
function importInto(studio,raw,options){
  const t=raw.template;
  const id='custom-'+uid('tpl'),base=builtins.has(t.baseLayout||t.id)?t.baseLayout||t.id:'unit';
  studio.customTemplates||={};studio.templateLayouts||={};studio.templateConditions||={};studio.fieldSchema||=[];
  studio.customTemplates[id]={...select(t,['id','name','short','hint','typeLabel','stats','baseLayout','cardRules']),id,baseLayout:base};
  if(raw.layout){assert(typeof raw.layout==='object'&&!Array.isArray(raw.layout),'模板布局格式不正确');studio.templateLayouts[id]=copy(raw.layout);studio.customTemplates[id].masterLayout=copy(raw.layout);}
  const fields=Array.isArray(raw.fields)?raw.fields:[],keys=new Map;
  assert(fields.length<=100,'一个模板最多导入 100 个自定义字段');
  for(const field of fields){const fresh=saveField(studio,{...field,id:undefined,key:undefined,tpl:id});keys.set(field.key,fresh.key);}
  const conditions=copy(raw.conditions||{});assert(conditions&&typeof conditions==='object'&&!Array.isArray(conditions),'条件显示规则格式不正确');
  studio.templateConditions[id]=remapReferences(conditions,keys);
  if(raw.layout){studio.templateLayouts[id]=remapReferences(studio.templateLayouts[id],keys);studio.customTemplates[id].masterLayout=copy(studio.templateLayouts[id]);}
  if(raw.version===2){
   studio.userAssets||=[];const ids=new Map;
   for(const asset of raw.assets){const fresh={...copy(asset),id:uid('asset')};studio.userAssets.push(fresh);ids.set(asset.id,fresh.id);}
   const visual=raw.visual?remapAssets(remapReferences(select(raw.visual,visualKeys),keys),ids):null;
   if(visual)studio.customTemplates[id].visual=visual;
   studio.customTemplates[id].design=select(raw.design,designKeys);
   studio.templateBadgeStyles||={};studio.templateBadgeStyles[id]=remapAssets(copy(raw.badgeStyles||{}),ids);
   if(raw.cardBackAssetId){studio.cardBackProfiles||={byTemplate:{},bySet:{}};studio.cardBackProfiles.byTemplate||={};studio.cardBackProfiles.byTemplate[id]=ids.get(raw.cardBackAssetId);}
   studio.projectDesign||={};
   if(options.applyProjectSettings)Object.assign(studio.projectDesign,select(raw.design,designKeys));
   if(options.makeDefault){
    studio.projectDesign.cardCreationDefault={version:1,templateId:id,templateName:t.name,sourceCardId:'',sourceName:t.name,visual:copy(visual||{layout:studio.templateLayouts[id]||{}})};
   }
  }
  return id;
}
export function saveField(studio,input){
  studio.fieldSchema||=[];assert(['text','number','select','boolean','cardRef'].includes(input.type),'不支持的字段类型');
  const old=studio.fieldSchema.find(f=>f.id===input.id);
  assert(!input.id||old,'字段已不存在');
  const def={...copy(old||{}),id:old?.id||uid('field'),key:old?.key||'field_'+uid('k').replaceAll('-','_'),label:String(input.label??''),type:input.type,tpl:String(input.tpl||''),required:!!input.required,options:input.type==='select'?(Array.isArray(input.options)?input.options:String(input.options||'').split(/[,，\n]/)).map(String).filter(Boolean):[],min:input.min==null||input.min===''?null:Number(input.min),max:input.max==null||input.max===''?null:Number(input.max),defaultValue:input.defaultValue??''};
  assert(def.min===null||Number.isFinite(def.min),'最小值需要数字');assert(def.max===null||Number.isFinite(def.max),'最大值需要数字');assert(def.min===null||def.max===null||def.min<=def.max,'最小值不能大于最大值');
  if(old)studio.fieldSchema[studio.fieldSchema.indexOf(old)]=def;else studio.fieldSchema.push(def);
  return def;
}
