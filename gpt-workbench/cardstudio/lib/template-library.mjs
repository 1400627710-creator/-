import {available,BASIC_ID} from './layout-core.mjs';
import {copy,uid} from './model.mjs';
const builtins=new Set(['basic-unit','unit','spell','building','event']);
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
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
  return next;
}
export function retireTemplate(studio,catalog,id,retired=true){
  assert(catalog[id],'模板已不存在');assert(!['unit',BASIC_ID].includes(id)||!retired,'标准单位模板作为空白起点保留');
  studio.projectDesign||={};const hidden=new Set(studio.projectDesign.hiddenTemplates||[]);
  if(retired)hidden.add(id);else hidden.delete(id);studio.projectDesign.hiddenTemplates=[...hidden];
  // Definitions and existing cards remain intact, including locked cards.
}
export function templatePackage(studio,catalog,id){
  assert(catalog[id],'模板已不存在');
  return {format:'cardstudio-template',version:1,template:copy(catalog[id]),layout:copy(studio.templateLayouts?.[id]||catalog[id].masterLayout||null),conditions:copy(studio.templateConditions?.[id]||{}),fields:copy((studio.fieldSchema||[]).filter(f=>!f.tpl||f.tpl===id))};
}
export function importTemplate(studio,raw){
  assert(raw?.format==='cardstudio-template'&&raw.version===1,'请选择卡递模板文件');
  assert(JSON.stringify(raw).length<2*1024*1024,'模板文件超过 2 MB');
  const t=raw.template;assert(t&&typeof t.name==='string'&&Array.isArray(t.stats)&&t.stats.every(s=>Array.isArray(s)&&['attack','health','move','range'].includes(s[0])&&s.slice(1).every(x=>typeof x==='string')),'模板格式不正确');
  const id='custom-'+uid('tpl'),base=builtins.has(t.baseLayout||t.id)?t.baseLayout||t.id:'unit';
  studio.customTemplates||={};studio.templateLayouts||={};studio.templateConditions||={};studio.fieldSchema||=[];
  studio.customTemplates[id]={...copy(t),id,baseLayout:base};
  if(raw.layout){assert(typeof raw.layout==='object'&&!Array.isArray(raw.layout),'模板布局格式不正确');studio.templateLayouts[id]=copy(raw.layout);studio.customTemplates[id].masterLayout=copy(raw.layout);}
  const fields=Array.isArray(raw.fields)?raw.fields:[],keys=new Map;
  assert(fields.length<=100,'一个模板最多导入 100 个自定义字段');
  for(const field of fields){const fresh=saveField(studio,{...field,id:undefined,key:undefined,tpl:id});keys.set(field.key,fresh.key);}
  const conditions=copy(raw.conditions||{});assert(conditions&&typeof conditions==='object'&&!Array.isArray(conditions),'条件显示规则格式不正确');
  studio.templateConditions[id]=remapReferences(conditions,keys);
  if(raw.layout){studio.templateLayouts[id]=remapReferences(studio.templateLayouts[id],keys);studio.customTemplates[id].masterLayout=copy(studio.templateLayouts[id]);}
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
