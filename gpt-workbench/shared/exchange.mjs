import {ArchiveCore as C} from '../cardstudio/lib/archive-core.mjs';
import {sha256Fallback} from '../cardstudio/local/sha256.mjs';

const copy=C.copy;
const validSpace=x=>typeof x==='string'&&/^[\w-]{1,160}$/.test(x);
const originPattern=/^[\w-]{1,160}\/[\w-]{1,120}$/;
const assert=(ok,text)=>{if(!ok)throw new Error(text);};
const originKeys=(node,space)=>[...new Set([...(Array.isArray(node?.bridgeOrigins)?node.bridgeOrigins.filter(x=>typeof x==='string'&&originPattern.test(x)).slice(0,32):[]),`${space}/${node.id}`])];
function tagged(node,space){return {...copy(node),bridgeOrigins:originKeys(node,space)};}
function markTree(state,space){
 for(const t of state.types){Object.assign(t,tagged(t,space));t.fields=t.fields.map(f=>tagged(f,space));}
 for(const a of state.archives){Object.assign(a,tagged(a,space));for(const v of a.versions){Object.assign(v,tagged(v,space));v.fields=v.fields.map(f=>tagged(f,space));v.rows=v.rows.map(r=>tagged(r,space));}}
 return state;
}
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).filter(k=>k!=='bridgeOrigins').sort().map(k=>[k,canonical(value[k])]));
 return value;
}
const hash=value=>sha256Fallback(JSON.stringify(canonical(value)));
function findIdentity(list,node,sourceSpace,targetSpace){
 const keys=new Set(originKeys(node,sourceSpace));
 return list.find(x=>originKeys(x,targetSpace).some(key=>keys.has(key)));
}
function origins(local,incoming,sourceSpace,targetSpace){return [...new Set([...originKeys(incoming,sourceSpace),...(local?originKeys(local,targetSpace):[])])].slice(0,32);}
function availableId(id,used,prefix){if(!used.has(id)){used.add(id);return id;}let next;do{next=C.uid(prefix);}while(used.has(next));used.add(next);return next;}

export function envelope(state,workspaceId,archiveIds){
 assert(validSpace(workspaceId),'互通空间编号不正确');
 const original=C.validateState(state),next=Object.fromEntries(['schemaVersion','revision','types','archives','clockName','clockUnit'].map(k=>[k,original[k]])),selected=new Set(archiveIds||next.archives.map(a=>a.id));
 next.archives=next.archives.filter(a=>selected.has(a.id));
 assert(next.archives.length,'请先选择需要传送的档案或卡片');
 const types=new Set(next.archives.map(a=>a.typeId));next.types=next.types.filter(t=>types.has(t.id));
 next.panels=[];next.activePanelId=null;delete next.exchangeLedger;
 markTree(next,workspaceId);
 return {format:'cardstudio-archive-exchange',version:1,workspaceId,createdAt:new Date().toISOString(),state:next};
}

export function validateEnvelope(raw){
 assert(raw?.format==='cardstudio-archive-exchange'&&raw.version===1&&validSpace(raw.workspaceId),'请选择卡递或车卡机导出的互通文件');
 assert(JSON.stringify(raw).length<=8*1024*1024,'单次互通内容超过 8 MB，请分批传送');
 const value=copy(raw);value.state=C.validateState(value.state);
 assert(value.state.archives.length<=1000,'单次最多传送 1000 份档案');return value;
}

function mergeOne(state,incoming,sourceSpace,targetSpace,incomingType,uniqueTypeName=true){
 const local=findIdentity(state.archives,incoming,sourceSpace,targetSpace);
 const fieldIds=new Set(state.types.flatMap(t=>t.fields.map(f=>f.id)));
 const versionIds=new Set(state.archives.flatMap(a=>a.versions.map(v=>v.id)));
 const rowIds=new Set(state.archives.flatMap(a=>a.versions.flatMap(v=>v.rows.map(r=>r.id))));
 const archiveIds=new Set(state.archives.map(a=>a.id)),typeIds=new Set(state.types.map(t=>t.id));
 let type=null,fieldMap=new Map;
 function mergeFields(target,source){
  const fields=copy(target||[]),originalIds=new Set(fields.map(f=>f.id)),claimed=new Set;
  for(const f of source){
   let old=findIdentity(fields,f,sourceSpace,targetSpace);
   if(!old){const same=fields.filter(x=>originalIds.has(x.id)&&!claimed.has(x.id)&&x.name===f.name);if(same.length===1)old=same[0];}
   if(old)claimed.add(old.id);
   const id=old?.id||fieldMap.get(f.id)||availableId(f.id,fieldIds,'f');fieldMap.set(f.id,id);
   const next={...(old||{}),...copy(f),id,bridgeOrigins:origins(old,f,sourceSpace,targetSpace)};
   if(old)fields[fields.indexOf(old)]=next;else fields.push(next);
  }
  return fields;
 }
 if(incomingType){
  let old=findIdentity(state.types,incomingType,sourceSpace,targetSpace);
  if(!old&&uniqueTypeName){const same=state.types.filter(t=>t.name===incomingType.name);if(same.length===1)old=same[0];}
  type={...(old||{}),...copy(incomingType),id:old?.id||availableId(incomingType.id,typeIds,'t'),bridgeOrigins:origins(old,incomingType,sourceSpace,targetSpace),fields:mergeFields(old?.fields,incomingType.fields)};
 }
 const result=local?copy(local):{...copy(incoming),id:availableId(incoming.id,archiveIds,'a'),versions:[]};
 result.bridgeOrigins=origins(local,incoming,sourceSpace,targetSpace);result.typeId=type?.id||null;result.copyOnClick=incoming.copyOnClick;
 let active;
 for(const v of incoming.versions){
  const old=findIdentity(result.versions,v,sourceSpace,targetSpace);
  const merged={...(old||{}),...copy(v),id:old?.id||availableId(v.id,versionIds,'v'),bridgeOrigins:origins(old,v,sourceSpace,targetSpace),fields:mergeFields(old?.fields,v.fields),rows:copy(old?.rows||[])};
  // 目标额外字段、行和故事版本保留，传送只覆盖预览确认的来件内容。
  merged.layout={...(old?.layout||{}),...copy(v.layout),rowHeights:{...(old?.layout?.rowHeights||{})}};
  for(const [id,height] of Object.entries(v.layout.rowHeights||{}))merged.layout.rowHeights[fieldMap.get(id)||id]=height;
  for(const r of v.rows){
   const previous=findIdentity(merged.rows,r,sourceSpace,targetSpace);
   const row={...(previous||{}),...copy(r),id:previous?.id||availableId(r.id,rowIds,'r'),bridgeOrigins:origins(previous,r,sourceSpace,targetSpace),values:{...(previous?.values||{})}};
   for(const [id,value] of Object.entries(r.values))row.values[fieldMap.get(id)||id]=value;
   if(previous)merged.rows[merged.rows.indexOf(previous)]=row;else merged.rows.push(row);
   if(Object.hasOwn(v.layout.rowHeights||{},r.id))merged.layout.rowHeights[row.id]=v.layout.rowHeights[r.id];
  }
  if(v.provenance?.fields){merged.provenance={...(old?.provenance||{}),...copy(v.provenance),fields:{...(old?.provenance?.fields||{}),...Object.fromEntries(Object.entries(v.provenance.fields).map(([id,value])=>[fieldMap.get(id)||id,copy(value)]))}};}
  if(old)result.versions[result.versions.indexOf(old)]=merged;else result.versions.push(merged);
  if(v.id===incoming.activeVersionId)active=merged.id;
 }
 result.activeVersionId=active||result.versions[0].id;
 return {before:local?copy(local):null,after:result,type};
}

export function planExchange(target,packet,targetWorkspace){
 assert(validSpace(targetWorkspace),'目标空间编号不正确');
 const source=validateEnvelope(packet),current=C.validateState(target),working=copy(current),rows=[];
 for(const a of source.state.archives){
  const sourceType=source.state.types.find(t=>t.id===a.typeId)||null;
  const merged=mergeOne(working,a,source.workspaceId,targetWorkspace,sourceType,!sourceType||source.state.types.filter(t=>t.name===sourceType.name).length===1);
  const oldType=current.types.find(t=>t.id===merged.before?.typeId)||null;
  const key=originKeys(a,source.workspaceId)[0],incomingHash=hash({archive:a,type:sourceType}),beforeHash=merged.before?hash({archive:merged.before,type:oldType}):null;
  const ledger=current.exchangeLedger?.[key];
  let status=merged.before?'update':'new';
  if(merged.before){
   if(hash({archive:merged.after,type:merged.type})===beforeHash)status='same';
   else if(ledger&&ledger.incomingHash===incomingHash)status='local';
   else if(!ledger||ledger.targetHash!==beforeHash)status='conflict';
  }
  const item={key,status,firstReturn:!!merged.before&&!ledger,title:a.versions.find(v=>v.id===a.activeVersionId)?.title||'未命名档案',incomingHash,...merged};rows.push(item);
  if(merged.type){const i=working.types.findIndex(t=>t.id===merged.type.id);if(i<0)working.types.push(merged.type);else working.types[i]=merged.type;}
  const i=working.archives.findIndex(x=>x.id===merged.after.id);if(i<0)working.archives.push(merged.after);else working.archives[i]=merged.after;
 }
 const counts=Object.fromEntries(['new','update','same','local','conflict'].map(k=>[k,rows.filter(r=>r.status===k).length]));
 return {baseRevision:current.revision,targetWorkspace,packet:source,rows,counts};
}

export function applyExchange(target,plan,choices={}){
 assert(target.revision===plan.baseRevision,'预览后资料已更新，请重新检查来件');
 const next=C.validateState(target),stats={created:0,updated:0,skipped:0};next.exchangeLedger=copy(next.exchangeLedger||{});
 for(const row of plan.rows){
  const accept=Object.hasOwn(choices,row.key)?choices[row.key]===true:['new','update'].includes(row.status);
  if(!accept||row.status==='same'){stats.skipped++;continue;}
  if(row.type){const i=next.types.findIndex(t=>t.id===row.type.id);if(i<0)next.types.push(copy(row.type));else next.types[i]=copy(row.type);}
  const i=next.archives.findIndex(a=>a.id===row.after.id);if(i<0){next.archives.push(copy(row.after));stats.created++;}else{next.archives[i]=copy(row.after);stats.updated++;}
  next.exchangeLedger[row.key]={targetId:row.after.id,incomingHash:row.incomingHash};
 }
 for(const ledger of Object.values(next.exchangeLedger)){
  const archive=next.archives.find(a=>a.id===ledger.targetId);
  if(archive&&!ledger.targetHash)ledger.targetHash=hash({archive,type:next.types.find(t=>t.id===archive.typeId)||null});
 }
 if(stats.created||stats.updated)next.revision++;
 return {state:C.validateState(next),stats};
}

export function archiveDiff(before,after){
 const values=a=>{const out=new Map;for(const v of a?.versions||[]){out.set(v.id+'/title',{label:'档案名称',value:v.title});out.set(v.id+'/time',{label:'故事时间',value:v.timeLabel});for(const r of v.rows)for(const f of v.fields)out.set(v.id+'/'+r.id+'/'+f.id,{label:f.name||'未命名字段',value:r.values[f.id]||''});}return out;};
 const old=values(before),next=values(after),diff=[];
 for(const [key,value] of next){const previous=old.get(key);if(!previous||previous.value!==value.value||previous.label!==value.label)diff.push({label:value.label,before:previous?.value??'',after:value.value});}
 return diff;
}
