import * as M from './model.mjs';
import * as Q from './quick-cards.mjs';
import {BASIC_ID} from './layout-core.mjs';

export const VERSION='1.4';
export const MAX_SOURCE=48000;
const keys=Q.FIELDS.map(([key])=>key),numbers=new Set(['cost','attack','health']);
const aliases={name:['名称','卡名','姓名'],unitType:['种族','兵种'],faction:['系别','阵营'],description:['效果','卡牌正文'],cost:['费用','消耗'],attack:['攻击','攻击力'],health:['血量','生命','生命值']};
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const text=(value,label,max=15000)=>{assert(typeof value==='string'&&value.length<=max,label+'格式无效或过长');return value;};
export function fieldKey(field,project){
 if(keys.includes(field.key))return field.key;
 return keys.find(key=>field.name===key||aliases[key].includes(field.name)||project.studio.projectDesign?.fieldLabels?.[key]===field.name)||'';
}
const shown=(kind,key)=>kind!=='spell'||!['unitType','attack','health'].includes(key);
export function normalizeReply(raw){
 assert(raw&&['batch','edits','answer','ask'].includes(raw.kind),'回复需要明确为批量资料、修改建议、回答或问题');
 const out={kind:raw.kind,message:text(raw.message??'','回复说明',12000),questions:[],records:[],cardChanges:[],archiveChanges:[]};
 assert(Array.isArray(raw.questions??[]),'问题格式无效');out.questions=(raw.questions||[]).map(q=>text(q,'问题',1000));assert(out.questions.length<=5,'一次最多五个问题');
 if(raw.kind==='ask')assert(out.questions.length,'请写出需要补充的问题');
 if(raw.kind==='batch'){
  assert(Array.isArray(raw.records)&&raw.records.length>0&&raw.records.length<=500,'一次需要 1～500 份档案');
  out.records=raw.records.map(record=>{
   const r={title:text(record.title,'档案名称',500),typeName:text(record.typeName||'导入档案','档案类型',200),sourceQuote:text(record.sourceQuote??'','名称出处',MAX_SOURCE),cardKind:record.cardKind||'none',fields:[],timeLabel:'',timeOrder:null,keywords:[]};
   assert(r.title.trim(),'档案名称不能为空');assert(['unit','spell','none'].includes(r.cardKind),'卡牌模式只能是单位、法术或仅归档');
   assert(Array.isArray(record.fields)&&record.fields.length<=100,'每份档案最多 100 个字段');
   r.fields=record.fields.map(f=>{assert(f&&typeof f==='object','档案字段无效');if(f.key)assert(keys.includes(f.key),'未知卡牌字段');return {key:f.key||'',name:text(f.name,'字段名称',300),value:text(f.value,'字段内容'),sourceQuote:text(f.sourceQuote??'','字段出处',MAX_SOURCE)};});return r;
  });
 }
 if(raw.kind==='edits'){
  assert(Array.isArray(raw.cardChanges??[])&&Array.isArray(raw.archiveChanges??[]),'修改列表格式无效');
  assert((raw.cardChanges?.length||0)+(raw.archiveChanges?.length||0)>0,'没有待修改内容');
  assert((raw.cardChanges?.length||0)+(raw.archiveChanges?.length||0)<=500,'一次最多 500 项修改');
  out.cardChanges=(raw.cardChanges||[]).map(c=>{
   text(c.cardId,'卡牌编号',120);assert(c.patch&&Object.keys(c.patch).length,'卡牌修改为空');
   const patch={};for(const [k,v] of Object.entries(c.patch)){assert(keys.includes(k)||k==='cardKind','助手不能修改图层或排版');assert(typeof v==='string'||typeof v==='number','字段需要文字或数字');assert(String(v).length<=15000,'字段过长');if(k==='cardKind')assert(['unit','spell'].includes(v),'卡牌模式无效');patch[k]=v;}return {cardId:c.cardId,patch};
  });
  out.archiveChanges=(raw.archiveChanges||[]).map(c=>({archiveId:text(c.archiveId,'档案编号',120),versionId:text(c.versionId,'故事版本编号',120),rowId:text(c.rowId,'资料行编号',120),fieldId:text(c.fieldId,'字段编号',120),value:text(c.value,'修改内容')}));
 }
 assert(JSON.stringify(out).length<=650000,'单次回复过大，请拆分资料');return out;
}
export function makeRequest(project,{mode='cards',sourceText='',prompt='',scope='current',archiveIds=[],cardIds=[],templateId=BASIC_ID}={}){
 assert(['cards','archive','revise'].includes(mode),'处理方式无效');text(sourceText,'原始资料',MAX_SOURCE);text(prompt,'处理要求',4000);
 assert(mode==='revise'?prompt.trim():sourceText.trim(),mode==='revise'?'请填写修改要求':'请导入或粘贴原文');
 const archives=project.archive.archives.filter(a=>archiveIds.includes(a.id)),cards=project.studio.cards.filter(c=>cardIds.includes(c.id));
 assert(cards.length<=100&&archives.length<=50,'一次最多选择 100 张卡或 50 份档案，请缩小处理范围');
 if(mode==='revise')assert(archives.length||cards.length,'请先打开一份档案，或选择有卡片的处理范围');
 const context={projectId:project.id,title:project.title,baseRevision:project.revision,mode,scope,templateId,fieldLabels:project.studio.projectDesign?.fieldLabels||{},rules:'单位七项；法术没有种族、攻击和血量；建筑按单位；不得改动排版。',types:project.archive.types.slice(0,40).map(t=>({id:t.id,name:t.name,fields:t.fields.map(f=>({id:f.id,name:f.name}))})),archives:archives.map(a=>({id:a.id,typeId:a.typeId,activeVersionId:a.activeVersionId,versions:a.versions.filter(v=>v.id===a.activeVersionId).map(v=>({id:v.id,title:v.title,fields:v.fields.map(f=>({id:f.id,name:f.name})),rows:v.rows.map(r=>({id:r.id,values:r.values}))}))})),cards:cards.map(c=>({id:c.id,cardKind:c.cardKind||'unit',locked:M.isLocked(project,c),fields:Object.fromEntries(Q.FIELDS.map(([k])=>[k,c[k]??''])),lockedFields:keys.filter(k=>M.fieldLocked(c,k))}))};
 assert(JSON.stringify(context).length<=90000,'所选资料过多，请缩小处理范围');
 return {id:M.uid('job'),projectId:project.id,baseRevision:project.revision,mode,scope,sourceText,prompt,templateId,archiveIds:archives.map(a=>a.id),cardIds:cards.map(c=>c.id),context,status:'queued',createdAt:new Date().toISOString()};
}
export function planBatch(project,task,raw){
 assert(task?.projectId===project.id,'回复不属于当前项目');const reply=normalizeReply(raw);
 if(reply.kind!=='batch')return {reply,items:[]};
 assert(['cards','archive'].includes(task.mode),'当前任务不能新增档案');
 const existing=new Set(project.archive.archives.flatMap(a=>a.versions.map(v=>v.title.trim()))),counts=new Map;
 for(const r of reply.records)counts.set(r.title.trim(),(counts.get(r.title.trim())||0)+1);
 const items=reply.records.map((r,index)=>{
  const errors=[],warnings=[],mapped={},values={name:r.title},hardErrors=[];
  if(!r.sourceQuote||!task.sourceText.includes(r.sourceQuote)||!r.sourceQuote.includes(r.title))hardErrors.push('名称需要可定位的原文出处');
  for(const [i,f] of r.fields.entries()){
   if(f.value&&(!f.sourceQuote||!task.sourceText.includes(f.sourceQuote)||!f.sourceQuote.includes(f.value)))hardErrors.push('“'+f.name+'”的值与原文不符');
   const key=fieldKey(f,project);if(key){if(mapped[key]!==undefined)hardErrors.push('重复映射“'+key+'”');mapped[key]=i;values[key]=f.value;}
  }
  values.name=r.title;
  const missing=r.cardKind==='none'?[]:Q.rowIssues({...values,cardKind:r.cardKind});
  const duplicate=existing.has(r.title.trim())||counts.get(r.title.trim())>1;
  if(duplicate)errors.push('存在同名资料；勾选后仅新增，不合并旧档案');
  errors.push(...hardErrors);if(task.mode==='cards'&&r.cardKind!=='none')warnings.push(...missing);
  return {index,record:r,mapped,values,duplicate,hardErrors,errors,warnings,ready:!hardErrors.length&&!duplicate,canAccept:!hardErrors.length,cardReady:task.mode==='cards'&&r.cardKind!=='none'&&!missing.length};
 });return {reply,items};
}
function bindingFor(project,archive,kind,templateId,map){
 let b=project.bindings.find(b=>b.assistantKind===kind&&b.typeId===archive.typeId&&b.templateId===templateId&&JSON.stringify(b.map)===JSON.stringify(map));
 return b||{id:M.uid('binding'),name:'卡递助手 · '+(kind==='spell'?'法术':'单位'),assistantKind:kind,typeId:archive.typeId,templateId,map};
}
function generateOne(project,archive,pending){
 const v=archive.versions.find(v=>v.id===archive.activeVersionId),r=v.rows[0],values={name:v.title},map=[{target:'name',source:{kind:'meta',key:'title'}}];
 if(Object.values(pending.fieldIds).some(id=>!v.fields.some(f=>f.id===id)))return {missing:['制卡字段已移除，请重新设置映射']};
 for(const [key,fieldId] of Object.entries(pending.fieldIds)){values[key]=r.values[fieldId]??'';if(shown(pending.cardKind,key))map.push({target:key,source:{kind:'field',fieldId}});}
 const missing=Q.rowIssues({...values,cardKind:pending.cardKind});if(missing.length)return {missing};
 const old=new Set(project.studio.cards.map(c=>c.id)),b=bindingFor(project,archive,pending.cardKind,pending.templateId,map);M.generateCards(project,b,[archive.id]);
 const made=project.studio.cards.filter(c=>!old.has(c.id));for(const c of made){c.cardKind=pending.cardKind;c.cardRules='seven-v1';}return {cards:made.map(c=>c.id),missing:[]};
}
export function applyBatch(project,task,raw,selected){
 const repeated=project.assistantBatches?.find(b=>b.jobId===task.id);if(repeated)return {...M.copy(repeated.stats),duplicate:true};
 assert(task.projectId===project.id&&task.baseRevision===project.revision,'任务后项目已有修改，结果已保留，请按当前版本重新发送');
 const {reply,items}=planBatch(project,task,raw),next=M.copy(project),beforeRevision=project.revision;
 const batch={jobId:task.id,beforeRevision,mode:task.mode,archiveIds:[],cardIds:[],pending:[],createdAt:new Date().toISOString(),message:reply.message};
 if(reply.kind==='batch'){
  const indices=selected??items.filter(i=>i.ready).map(i=>i.index);assert(Array.isArray(indices)&&indices.length,'没有可采用的资料');assert(new Set(indices).size===indices.length,'重复的资料选择');
  const chosen=indices.map(i=>{const x=items[i];assert(x?.canAccept,'第 '+(Number(i)+1)+' 份资料的原文依据需要修正');return x;});
  const records=chosen.map(item=>{
   const record=M.copy(item.record);if(task.mode==='cards'&&record.cardKind!=='none')for(const [key,label] of Q.FIELDS)if(key!=='name'&&shown(record.cardKind,key)&&item.mapped[key]===undefined)record.fields.push({key,name:next.studio.projectDesign?.fieldLabels?.[key]??label,value:'',sourceQuote:''});
   return record;
  });
  const old=new Set(next.archive.archives.map(a=>a.id));M.appendRecords(next,records,{id:M.uid('source'),kind:'gpt-assistant',jobId:task.id,raw:task.sourceText});
  const added=next.archive.archives.filter(a=>!old.has(a.id));batch.archiveIds=added.map(a=>a.id);
  added.forEach((a,i)=>{
   const record=records[i],v=a.versions[0];v.provenance.title={quote:record.sourceQuote};
   if(task.mode!=='cards'||record.cardKind==='none')return;
   const fieldIds={};record.fields.forEach((f,j)=>{const key=fieldKey(f,next);if(key&&key!=='name')fieldIds[key]=v.fields[j].id;});
   const pending={archiveId:a.id,versionId:v.id,rowId:v.rows[0].id,cardKind:record.cardKind,templateId:task.templateId,fieldIds};
   const result=generateOne(next,a,pending);batch.cardIds.push(...(result.cards||[]));if(result.missing.length)batch.pending.push({...pending,missing:result.missing});
  });
 }else if(reply.kind==='edits'){
  assert(task.mode==='revise','当前任务只允许新增归档');
  assert(new Set(reply.cardChanges.map(c=>c.cardId)).size===reply.cardChanges.length,'同一卡牌修改不能重复');
  for(const c of reply.cardChanges)assert(task.cardIds.includes(c.cardId),'修改越过了本次选定卡牌范围');
  if(reply.cardChanges.length){Q.batchCards(next,reply.cardChanges.map(c=>({id:c.cardId,patch:c.patch})));batch.cardIds=reply.cardChanges.map(c=>c.cardId);}
  const touched=new Set;
  for(const c of reply.archiveChanges){
   assert(task.archiveIds.includes(c.archiveId),'修改越过了本次选定档案范围');
   const a=next.archive.archives.find(a=>a.id===c.archiveId),v=a?.versions.find(v=>v.id===c.versionId),row=v?.rows.find(r=>r.id===c.rowId);
   assert(a?.activeVersionId===c.versionId&&row&&v.fields.some(f=>f.id===c.fieldId),'档案字段或故事版本已改变');
   const tag=[c.archiveId,c.versionId,c.rowId,c.fieldId].join('/');assert(!touched.has(tag),'同一档案字段不能重复修改');touched.add(tag);
   row.values[c.fieldId]=c.value;v.provenance||={fields:{}};v.provenance.fields||={};v.provenance.fields[c.fieldId]||={quote:''};v.provenance.fields[c.fieldId].manualCorrection={value:c.value,reason:'卡递助手：'+task.prompt,jobId:task.id};
   if(!batch.archiveIds.includes(a.id))batch.archiveIds.push(a.id);
  }
  if(reply.archiveChanges.length){next.archive.revision++;M.syncCards(next);next.studioRevision++;}
 }else throw Error('回答和问题只显示在助手栏，不写入正式资料');
 batch.stats={archived:reply.kind==='batch'?batch.archiveIds.length:0,created:reply.kind==='batch'?batch.cardIds.length:0,updated:reply.kind==='edits'?batch.cardIds.length+batch.archiveIds.length:0,pending:batch.pending.length,archiveIds:batch.archiveIds,cardIds:batch.cardIds};
 (next.assistantBatches||=[]).push(batch);M.validateProject(next);Object.assign(project,next);return M.copy(batch.stats);
}
export function completePending(project,jobId){
 const next=M.copy(project),batch=next.assistantBatches?.find(b=>b.jobId===jobId);assert(batch,'找不到这批资料');let made=0;const remain=[];
 for(const entry of batch.pending){const a=next.archive.archives.find(a=>a.id===entry.archiveId);if(!a){remain.push({...entry,missing:['档案已移除']});continue;}if(a.activeVersionId!==entry.versionId){remain.push({...entry,missing:['故事版本已切换，请重新设置制卡映射']});continue;}const r=generateOne(next,a,entry);if(r.missing.length)remain.push({...entry,missing:r.missing});else{const v=a.versions.find(v=>v.id===entry.versionId);for(const id of Object.values(entry.fieldIds)){const value=v.rows[0].values[id]??'',provenance=v.provenance.fields[id]||={quote:''};if(value&&!provenance.quote.includes(String(value)))provenance.manualCorrection={value,reason:'手动补全待制卡字段'};}batch.cardIds.push(...r.cards);made+=r.cards.length;}}
 batch.pending=remain;batch.stats.pending=remain.length;batch.stats.created+=made;batch.stats.cardIds=batch.cardIds;M.validateProject(next);Object.assign(project,next);return {created:made,pending:remain.length};
}
export function editsPreview(project,task,reply){
 const lines=[];
 for(const c of reply.cardChanges){const card=project.studio.cards.find(x=>x.id===c.cardId);assert(card&&task.cardIds.includes(c.cardId),'卡牌不在本次处理范围');for(const [key,value] of Object.entries(c.patch))lines.push({name:card.name,field:Q.FIELDS.find(([k])=>k===key)?.[1]||'模式',before:String(card[key]??''),after:String(value)});}
 for(const c of reply.archiveChanges){const a=project.archive.archives.find(x=>x.id===c.archiveId),v=a?.versions.find(v=>v.id===c.versionId),r=v?.rows.find(r=>r.id===c.rowId),f=v?.fields.find(f=>f.id===c.fieldId);assert(r&&f&&task.archiveIds.includes(c.archiveId),'档案不在本次处理范围');lines.push({name:v.title,field:f.name,before:String(r.values[f.id]??''),after:c.value});}return lines;
}
