import {ArchiveCore as C} from '../lib/archive-core.mjs';
import {envelope} from '../../shared/exchange.mjs';
import {recoveryCache} from './recovery-cache.mjs';
import {createLocalService} from './local-service.mjs';
async function main(){
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const list=document.querySelector('#checks');
let passed=0;
async function check(name,fn){await fn();const li=document.createElement('li');li.textContent='通过：'+name;list.append(li);passed++;}
async function rejects(fn){let failed=false;try{await fn();}catch{failed=true;}assert(failed,'应拒绝此操作');}
const dbName='cardstudio-local-qa-'+Date.now();let service=createLocalService(dbName),p,backup,draft;
try{
 await check('新工作区没有虚构档案或卡牌',async()=>{assert(!(await service({action:'list'})).projects.length,'工作区不是空白');p=(await service({action:'create',title:'隔离合成资料'})).project;assert(!p.archive.archives.length&&!p.studio.cards.length,'存在示例资料');});
 await check('关闭连接后重新打开仍能读取项目',async()=>{await service.close();service=createLocalService(dbName);p=(await service({action:'get',projectId:p.id})).project;assert(p.title==='隔离合成资料','标题未持久化');});
 const text='名称\t系别\t费用\n合成甲\t自检\t2\n合成乙\t自检\t5';
 const records=['甲','乙'].map((v,i)=>({title:'合成'+v,typeName:'表格条目',fields:[{name:'系别',value:'自检',sourceQuote:'自检'},{name:'费用',value:String(i?5:2),sourceQuote:String(i?5:2)}]}));
 await check('导入先预览，确认前不修改正式档案',async()=>{draft=(await service({action:'prepareImport',projectId:p.id,kind:'records',sourceText:text,records})).draft;assert(!(await service({action:'get',projectId:p.id})).project.archive.archives.length,'预览修改正式资料');});
 await check('确认归档与重复确认不生成重复记录',async()=>{p=(await service({action:'commitDraft',draftId:draft.id})).project;assert(p.archive.archives.length===2,'档案数不正确');assert((await service({action:'commitDraft',draftId:draft.id})).duplicate,'重复确认非幂等');});
 await check('伪造引文被拒绝且项目版本不变',async()=>{const revision=p.revision;await rejects(()=>service({action:'prepareImport',projectId:p.id,kind:'records',sourceText:text,records:[{title:'伪造',fields:[{name:'测试',value:'未提供',sourceQuote:''}]}]}));assert((await service({action:'get',projectId:p.id})).project.revision===revision,'拒绝后改变了版本');});
 const first=p.archive.archives[0],fields=first.versions[0].fields;
 const binding={id:'local_qa_binding',name:'本地映射',typeId:first.typeId,templateId:'unit',map:[{target:'name',source:{kind:'meta',key:'title'}},{target:'faction',source:{kind:'field',fieldId:fields.find(f=>f.name==='系别').id}},{target:'cost',source:{kind:'field',fieldId:fields.find(f=>f.name==='费用').id}}]};
 await check('批量制卡保留字段映射，重复生成不增加卡片',async()=>{p=(await service({action:'generate',projectId:p.id,binding,expectedRevision:p.revision})).project;assert(p.studio.cards.length===2&&p.links.length===2,'制卡或映射缺失');p=(await service({action:'generate',projectId:p.id,binding,expectedRevision:p.revision})).project;assert(p.studio.cards.length===2,'重复创建卡片');backup=structuredClone(p);});
 await check('旧版本写入被拒绝',async()=>{await rejects(()=>service({action:'rename',projectId:p.id,title:'不应覆盖',expectedRevision:p.revision-1}));assert((await service({action:'get',projectId:p.id})).project.title===p.title,'过期写入覆盖标题');});
 await check('取消预览保留原项目',async()=>{const d=(await service({action:'prepareImport',projectId:p.id,kind:'records',sourceText:'内容：取消',records:[{title:'取消',fields:[{name:'内容',value:'取消',sourceQuote:'取消'}]}]})).draft;await service({action:'cancelDraft',draftId:d.id});assert((await service({action:'get',projectId:p.id})).project.archive.archives.length===2,'取消预览改变档案');});
 await check('保存历史能够恢复，恢复后的版本保持递增',async()=>{const revision=p.revision;p=(await service({action:'restore',projectId:p.id,revision:0,expectedRevision:revision})).project;assert(!p.studio.cards.length&&!p.archive.archives.length&&p.revision>revision,'恢复失败');});
 await check('完整统一备份能恢复卡牌、档案与映射',async()=>{const other=(await service({action:'create',title:'恢复项目'})).project;const d=(await service({action:'prepareImport',projectId:other.id,kind:'unified',payload:backup})).draft;p=(await service({action:'commitDraft',draftId:d.id})).project;assert(p.id===other.id&&p.studio.cards.length===2&&p.archive.archives.length===2&&p.links.length===2,'恢复备份丢失内容');});
 await check('两个窗口并发修改只有一个版本能够写入',async()=>{const second=createLocalService(dbName),revision=p.revision;const r=await Promise.allSettled([service({action:'rename',projectId:p.id,title:'窗口甲',expectedRevision:revision}),second({action:'rename',projectId:p.id,title:'窗口乙',expectedRevision:revision})]);assert(r.filter(x=>x.status==='fulfilled').length===1,'并发冲突未保护');p=(await service({action:'get',projectId:p.id})).project;await second.close();});
 await check('本机保存历史保留最近 30 次',async()=>{for(let i=0;i<32;i++)p=(await service({action:'rename',projectId:p.id,title:'记录 '+i,expectedRevision:p.revision})).project;assert((await service({action:'revisions',projectId:p.id})).revisions.length===30,'保存历史数量不正确');});
 await check('超过 localStorage 常见容量的素材可在本机数据库重读',async()=>{const large=(await service({action:'create',title:'大素材隔离测试'})).project;const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><metadata>'+'x'.repeat(5*1024*1024)+'</metadata><rect width="1" height="1"/></svg>';const dataUrl='data:image/svg+xml;base64,'+btoa(svg);large.studio.userAssets=[{id:'qa_large',name:'合成 SVG',dataUrl}];await service({action:'studio',projectId:large.id,studio:large.studio,expectedStudioRevision:large.studioRevision});await service.close();service=createLocalService(dbName);const read=(await service({action:'get',projectId:large.id})).project;assert(read.studio.userAssets[0].dataUrl===dataUrl,'素材字节不一致');});
 await check('互通预览仅写待办，重复预览和重复确认不会新增档案',async()=>{
  const other=(await service({action:'create',title:'互通隔离'})).project,s=C.blankState(),a=C.createArchive(s,{title:'互通林澈'});const f=C.addField(a.versions[0],'身份');a.versions[0].rows[0].values[f.id]='药师';const packet=envelope(s,'qa_source');
  const d=(await service({action:'prepareImport',projectId:other.id,kind:'exchange',payload:packet})).draft,d2=(await service({action:'prepareImport',projectId:other.id,kind:'exchange',payload:packet})).draft;
  assert(d.id===d2.id,'相同来件重复创建待办');assert(!(await service({action:'get',projectId:other.id})).project.archive.archives.length,'预览提前写入');
  const accepted=await service({action:'commitDraft',draftId:d.id});assert(accepted.project.archive.archives.length===1,'接收缺少档案');
  const again=(await service({action:'prepareImport',projectId:other.id,kind:'exchange',payload:packet})).draft;assert(again.exchangePlan.counts.same===1,'重复来件不是相同');const r=await service({action:'commitDraft',draftId:again.id});assert(r.project.revision===accepted.project.revision,'重复内容改变正式版本');
 });
 await check('互通预览过期后拒绝确认，未覆盖后来修改',async()=>{
  const other=(await service({action:'create',title:'过期预览'})).project,s=C.blankState();C.createArchive(s,{title:'来件'});const d=(await service({action:'prepareImport',projectId:other.id,kind:'exchange',payload:envelope(s,'qa_stale')})).draft;
  await service({action:'rename',projectId:other.id,title:'后来修改',expectedRevision:other.revision});await rejects(()=>service({action:'commitDraft',draftId:d.id}));assert(!(await service({action:'get',projectId:other.id})).project.archive.archives.length,'过期来件覆盖了正式项目');
 });
 await check('恢复缓存写入与删除按顺序提交，不复活已保存草稿',async()=>{
  const id='qa_recovery_'+Date.now();await Promise.all([recoveryCache(id,'put',{studio:{name:'旧草稿'}}),recoveryCache(id,'delete')]);assert(!(await recoveryCache(id,'get')),'已删除草稿被旧写入复活');
 });
 document.querySelector('#summary').textContent=`全部通过：${passed} 项真实 IndexedDB 检查`;
 document.querySelector('#summary').dataset.status='passed';
}catch(e){document.querySelector('#summary').textContent='失败：'+e.message;document.querySelector('#summary').dataset.status='failed';console.error(e);}
await service.close();

}
main();
