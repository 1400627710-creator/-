import * as M from '../lib/model.mjs';
import {ArchiveCore as C} from '../lib/archive-core.mjs';
import {fingerprint as hashText} from './sha256.mjs';

const request=q=>new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const labels={archive:'编辑档案',studio:'编辑卡牌',generate:'批量制卡',follow:'恢复字段跟随',writeBack:'卡面回写档案',rename:'修改项目名称',inbox:'保留原文',restore:'恢复保存版本'};
export const localMeta={getItem(key){try{return localStorage.getItem('cardstudio-local:'+key);}catch{return null;}},setItem(key,value){try{localStorage.setItem('cardstudio-local:'+key,value);}catch{}}};

// Every change reads the current revision and writes all affected stores in
// one IndexedDB transaction. A successful return means that transaction committed.
export function createLocalService(name='cardstudio-local-v1'){
 let opened;
 async function database(){
  if(!opened)opened=new Promise((resolve,reject)=>{
   const q=indexedDB.open(name,1);
   q.onupgradeneeded=()=>{
    const db=q.result;
    db.createObjectStore('projects',{keyPath:'id'});
    const drafts=db.createObjectStore('drafts',{keyPath:'id'});drafts.createIndex('projectId','projectId');
    const history=db.createObjectStore('history',{keyPath:['projectId','revision']});history.createIndex('projectId','projectId');
    db.createObjectStore('snapshots',{keyPath:['projectId','revision']});
   };
   q.onsuccess=()=>{q.result.onversionchange=()=>q.result.close();resolve(q.result);};
   q.onerror=()=>reject(q.error);
   q.onblocked=()=>reject(new Error('请关闭其他卡递本地窗口后重试'));
  }).catch(e=>{opened=null;throw e;});
  return opened;
 }
 async function run(a){
  let fingerprint;
  if(a.action==='prepareImport'){
   fingerprint=await hashText(JSON.stringify({kind:a.kind,payload:a.payload,records:a.records,sourceText:a.sourceText||'',inputId:a.inputId||null}));
  }
  const db=await database(),readOnly=['list','get','poll','draft','revisions'].includes(a.action);
  const tx=db.transaction(['projects','drafts','history','snapshots'],readOnly?'readonly':'readwrite');
  const finished=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('本机保存已取消'));tx.onerror=()=>{};});
  finished.catch(()=>{});
  const projects=tx.objectStore('projects'),drafts=tx.objectStore('drafts'),history=tx.objectStore('history'),snapshots=tx.objectStore('snapshots');
  async function pending(id){return (await request(drafts.index('projectId').getAll(id))).filter(d=>d.status==='pending');}
  async function save(p,label){
   assert(JSON.stringify(p).length<=30*1024*1024,'项目超过 30 MB，请拆分或减少图片体积后重试');
   const meta={projectId:p.id,revision:p.revision,label,created_at:new Date().toISOString()};
   projects.put(p);history.put(meta);snapshots.put({...meta,project:p});
   const keys=await request(history.index('projectId').getAllKeys(p.id));
   for(const key of keys.slice(0,Math.max(0,keys.length-30))){history.delete(key);snapshots.delete(key);}
  }
  async function operate(){
   if(a.action==='list')return {projects:(await request(projects.getAll())).map(p=>({id:p.id,title:p.title,revision:p.revision}))};
   if(a.action==='create'){const p=M.blankProject(String(a.title||'未命名项目'));await save(p,'创建本机项目');return {project:p};}
   const d=a.draftId?await request(drafts.get(a.draftId)):null;
   if(a.draftId)assert(d,'找不到这份导入预览');
   const id=a.projectId||d?.projectId,p=id?await request(projects.get(id)):null;
   assert(p,'找不到本机项目');
   if(a.action==='get')return {project:p,drafts:await pending(id)};
   if(a.action==='poll')return {project:{id,revision:p.revision,archiveRevision:p.archive.revision,studioRevision:p.studioRevision},drafts:await pending(id)};
   if(a.action==='revisions')return {revisions:(await request(history.index('projectId').getAll(id))).sort((x,y)=>y.revision-x.revision)};
   if(a.action==='draft')return {draft:d};
   if(a.action==='cancelDraft'){assert(d.status==='pending','这份预览已经处理');d.status='cancelled';drafts.put(d);return {cancelled:true};}
   if(a.action==='prepareImport'){
    if(p.imports.some(x=>x.fingerprint===fingerprint))return {duplicate:true};
    const input=a.inputId?p.inbox.find(x=>x.id===a.inputId):null;
    if(a.inputId)assert(input,'找不到这份原始输入，请重新粘贴原文');
    const sourceText=input?.text??a.sourceText??'';
    assert(typeof sourceText==='string'&&sourceText.length<=150000,'单次原文最多 15 万字');
    let payload=a.payload,records,summary;
    if(a.kind==='records'){assert(sourceText.trim(),'请先提供原文');records=M.normalizeRecords(a.records,sourceText);summary=`${records.length} 条记录，${records.reduce((n,r)=>n+r.fields.length,0)} 个字段`;}
    else if(a.kind==='archive'){payload=C.validateState(payload);summary=`${payload.archives.length} 份档案，保留全部故事版本`;}
    else if(a.kind==='studio'){M.validateStudio(payload);assert(!p.studio.cards.length,'请新建空项目再导入卡递工程');summary=`${payload.cards.length} 张卡牌，保留模板、素材与排版`;}
    else if(a.kind==='unified'){payload=M.validateProject(payload);summary='恢复完整统一备份，将替换本项目内容';}
    else throw new Error('不支持的导入类型');
    const draft={id:M.uid('draft'),projectId:id,baseRevision:p.revision,status:'pending',kind:a.kind,payload,records,sourceText,inputId:input?.id||null,fingerprint,sourceId:M.uid('source'),summary};
    drafts.put(draft);return {draft};
   }
   if(a.action==='commitDraft'){
    if(d.status==='committed')return {project:p,duplicate:true};
    assert(d.status==='pending','这份预览已取消');
    assert(p.revision===d.baseRevision,'预览后项目已更新，请重新预览，当前资料没有被覆盖');
    const revision=p.revision;let stats;
    if(d.kind==='records')stats=M.appendRecords(p,d.records,{id:d.sourceId,kind:'local-text-or-gpt',raw:d.sourceText,fingerprint:d.fingerprint});
    else if(d.kind==='archive')stats=M.mergeArchive(p,d.payload,d.fingerprint);
    else if(d.kind==='studio')stats=M.importStudio(p,d.payload,d.fingerprint);
    else if(d.kind==='unified'){
     const archiveRevision=p.archive.revision+1,studioRevision=p.studioRevision+1;
     Object.assign(p,M.validateProject(d.payload),{id,revision});p.archive.revision=archiveRevision;p.studioRevision=studioRevision;stats={restored:true};
    }
    if(d.inputId){const original=p.inbox.find(x=>x.id===d.inputId);if(original)original.status='已归档';}
    M.syncCards(p);p.revision=revision+1;d.status='committed';drafts.put(d);await save(p,'确认导入');return {project:p,stats};
   }
   if(a.expectedRevision!==undefined)assert(a.expectedRevision===p.revision,'项目已被其他窗口更新，请重新载入');
   let stats;
   switch(a.action){
    case 'archive':{const previous=p.archive.revision;assert(a.expectedArchiveRevision===previous,'档案已被其他窗口更新，请先备份当前修改');p.archive=C.validateState(a.archive);p.archive.revision=Math.max(p.archive.revision,previous+1);stats=M.syncCards(p);p.studioRevision++;break;}
    case 'studio':assert(a.expectedStudioRevision===p.studioRevision,'卡牌已被其他窗口更新，请先备份当前修改');M.acceptStudio(p,a.studio);break;
    case 'generate':stats=M.generateCards(p,a.binding,a.archiveIds||[]);break;
    case 'rename':p.title=String(a.title);p.studio.projectName=p.title;break;
    case 'follow':M.resetOverride(p,a.linkId,a.target);p.studioRevision++;break;
    case 'writeBack':M.writeBack(p,a.linkId,a.target);p.studioRevision++;break;
    case 'inbox':assert(typeof a.text==='string'&&a.text.trim(),'请先粘贴原文');assert(a.text.length<=150000,'单次最多输入 15 万字');p.inbox.push({id:M.uid('input'),text:a.text,status:'待 GPT 整理',createdAt:new Date().toISOString()});break;
    case 'restore':{const old=await request(snapshots.get([id,Number(a.revision)]));assert(old,'该保存版本已经不在最近 30 次记录中');const revision=p.revision,archiveRevision=p.archive.revision+1,studioRevision=p.studioRevision+1;Object.assign(p,M.copy(old.project),{id,revision});p.archive.revision=archiveRevision;p.studioRevision=studioRevision;break;}
    default:throw new Error('不支持的本机操作');
   }
   p.revision++;await save(p,labels[a.action]||a.action);return {project:p,stats,inputId:a.action==='inbox'?p.inbox.at(-1).id:undefined};
  }
  try{const value=await operate();await finished;return structuredClone(value);}
  catch(error){try{tx.abort();}catch{}await finished.catch(()=>{});if(error?.name==='QuotaExceededError')throw new Error('浏览器本机空间不足，修改未保存，请先导出备份并减少素材体积');throw error;}
 }
 run.close=async()=>{if(opened)(await opened).close();opened=null;};
 return run;
}
export const localService=createLocalService();
