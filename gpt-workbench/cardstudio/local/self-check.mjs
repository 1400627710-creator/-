import {ArchiveCore as C} from '../lib/archive-core.mjs';
import {envelope} from '../../shared/exchange.mjs';
import {recoveryCache} from './recovery-cache.mjs';
import {createLocalService} from './local-service.mjs';
import * as Layout from '../lib/layout-core.mjs';
import * as Edit from '../lib/edit-core.mjs';
import * as Quick from '../lib/quick-cards.mjs';
import * as Assistant from '../lib/assistant-core.mjs';
import {createAssistantStore} from './assistant-store.mjs';
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
 await check('唯一默认格式保存重开后保留原卡、透明卡框、自由图层与字体',async()=>{
  const other=(await service({action:'create',title:'唯一默认隔离测试'})).project,id='qa_true_unit',catalog={[id]:{...Layout.BASIC_TEMPLATE,id,name:'真单位卡'}};
  other.studio.customTemplates=catalog;const source={id:'qa_default_source',name:'帮派弟兄',templateId:id,appearance:{frameImageAssetId:'qa_frame'},layout:{title:{x:20,y:4,w:60,h:8,z:20},frameImage:{x:2,y:0,w:96,h:100,z:11,fit:'contain',lockAspect:true}},textStyles:{title:{size:19}},extraElements:[{id:'qa_free',kind:'text',text:'单位',layout:{x:10,y:50,w:20,h:8,z:40}}]};
  other.studio.cards=[source];const before=JSON.stringify(source);Layout.captureDefault(other.studio,source,catalog);
  await service({action:'studio',projectId:other.id,studio:other.studio,expectedStudioRevision:other.studioRevision});await service.close();service=createLocalService(dbName);
  const read=(await service({action:'get',projectId:other.id})).project;assert(JSON.stringify(read.studio.cards[0])===before,'设置默认改动了原卡');assert(Layout.defaultTemplateId(read.studio,catalog)===id,'重开后默认丢失');
  const fresh=Layout.applyCreationDefault({templateId:id,name:'新单位'},read.studio,()=>C.uid('layer'));assert(fresh.layout.frameImage.w===96&&fresh.textStyles.title.size===19&&fresh.extraElements[0].text==='单位','格式未完整继承');assert(fresh.extraElements[0].id!=='qa_free','自由层编号重复');
 });
 await check('独立底图透明度、文字笔画和复制图层保存重开不丢失',async()=>{
  const other=(await service({action:'create',title:'编辑属性隔离测试'})).project;
  const layer={id:'edit_image',kind:'image',assetId:'edit_asset',layout:{x:10,y:12,w:20,h:30,r:25,z:10,opacity:.7,locked:true}},card={id:'edit_card',name:'编辑自检',templateId:'basic-unit',layout:{cost:Edit.setOpacity({opacity:.6},'module',.25,'material')},textStyles:{effect:{strokePx:.8}},extraElements:[layer]};
  card.extraElements.push(...Edit.duplicateExtras([layer],[layer],()=>C.uid('copy')));other.studio.cards=[card];
  await service({action:'studio',projectId:other.id,studio:other.studio,expectedStudioRevision:other.studioRevision});await service.close();service=createLocalService(dbName);
  const read=(await service({action:'get',projectId:other.id})).project.studio.cards[0];assert(read.layout.cost.materialOpacity===.25&&read.layout.cost.opacity===.6,'透明度串改');assert(read.textStyles.effect.strokePx===.8,'笔画粗度未保存');assert(read.extraElements[1].assetId==='edit_asset'&&!read.extraElements[1].layout.locked&&read.extraElements[0].layout.locked,'复制状态错误');
 });
 await check('快速制卡原子保存档案、卡面和映射，重复确认不增加内容',async()=>{
  const original=(await service({action:'create',title:'快速制卡隔离'})).project,sourceText='帮派弟兄，人类，底层，登场：检索一张帮派弟兄。3费1/2身材。\n法术：火花，底层，造成2点伤害。2费',rows=Quick.parseInput(sourceText).rows;
  assert(!(await service({action:'get',projectId:original.id})).project.studio.cards.length,'解析提前写入');const action={action:'quickGenerate',projectId:original.id,rows,sourceText,templateId:'basic-unit',expectedRevision:original.revision},result=await service(action),again=await service(action);assert(result.project.studio.cards.length===2&&result.project.archive.archives.length===2&&result.project.links.length===2,'快速制卡丢失关联');assert(again.stats.duplicate&&again.project.revision===result.project.revision,'重复确认改变正式内容');
 });
 await check('快速制卡与批量修改拒绝旧预览，非法数字不留下部分写入',async()=>{
  const original=(await service({action:'create',title:'批量编辑隔离'})).project,sourceText='甲，人类，底层，检索。3费1/2',rows=Quick.parseInput(sourceText).rows;
  let read=(await service({action:'quickGenerate',projectId:original.id,rows,sourceText,templateId:'basic-unit',expectedRevision:0})).project,id=read.studio.cards[0].id,revision=read.revision;
  await rejects(()=>service({action:'batchCards',projectId:read.id,changes:[{id,patch:{cost:'5'}}],expectedRevision:0}));await rejects(()=>service({action:'batchCards',projectId:read.id,changes:[{id,patch:{cost:'错误'}}],expectedRevision:revision}));assert((await service({action:'get',projectId:read.id})).project.revision===revision,'拒绝后改变版本');
  read=(await service({action:'batchCards',projectId:read.id,changes:[{id,patch:{cost:'5'}}],expectedRevision:revision})).project;await service.close();service=createLocalService(dbName);const restored=(await service({action:'get',projectId:read.id})).project;assert(restored.studio.cards[0].cost===5&&restored.links[0].overrides.cost,'批量修改或覆盖未保存');assert(restored.imports.at(-1).raw===sourceText,'原文丢失');
 });
 await check('助手任务与原文保存重开不丢失，项目记录相互隔离',async()=>{
  const name='assistant-qa-'+Date.now(),store=createAssistantStore(name),t={id:'job_one',projectId:'project_one',createdAt:new Date().toISOString(),sourceText:'合成原文',status:'processing'};await store.put(t);await store.put({...t,id:'job_two',projectId:'project_two'});await store.close();const reopened=createAssistantStore(name);assert((await reopened.get(t.id)).sourceText==='合成原文','任务原文丢失');assert((await reopened.list('project_one')).length===1,'任务跨项目混入');await reopened.transition(t.id,['processing'],{status:'cancelled'});assert(!await reopened.transition(t.id,['processing'],{status:'review'}),'取消的任务被迟到回复重新激活');await reopened.close();
 });
 await check('助手批次在真实事务中保存归档与卡面，重复回复不改版本，旧回复拒绝且整批可恢复',async()=>{
  const original=(await service({action:'create',title:'助手批次隔离'})).project,sourceText='甲，人类，底层，检索。3费1/2',task=Assistant.makeRequest(original,{sourceText}),reply={kind:'batch',message:'合成资料',records:[{title:'甲',typeName:'单位',sourceQuote:'甲',cardKind:'unit',fields:[['unitType','种族','人类'],['faction','系别','底层'],['description','效果','检索。'],['cost','费用','3'],['attack','攻击','1'],['health','血量','2']].map(([key,name,value])=>({key,name,value,sourceQuote:value}))}]};
  const action={action:'assistantApply',projectId:original.id,task,reply,expectedRevision:0},r=await service(action),again=await service(action);assert(r.project.studio.cards.length===1&&r.project.archive.archives.length===1&&r.project.links.length===1,'助手批次未完整提交');assert(again.stats.duplicate&&again.project.revision===r.project.revision,'重复回复写入两次');
  const stale={...task,id:'job_stale'};await rejects(()=>service({...action,task:stale}));await service.close();service=createLocalService(dbName);const read=(await service({action:'get',projectId:original.id})).project;assert(read.assistantBatches[0].jobId===task.id,'批次重开丢失');const restored=(await service({action:'restore',projectId:read.id,revision:0,expectedRevision:read.revision})).project;assert(!restored.studio.cards.length&&!restored.archive.archives.length,'整批恢复未还原');
 });
 document.querySelector('#summary').textContent=`全部通过：${passed} 项真实 IndexedDB 检查`;
 document.querySelector('#summary').dataset.status='passed';
}catch(e){document.querySelector('#summary').textContent='失败：'+e.message;document.querySelector('#summary').dataset.status='failed';console.error(e);}
await service.close();

}
main();
