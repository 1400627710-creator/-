import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../lib/model.mjs';
import * as A from '../lib/assistant-core.mjs';
import * as L from '../lib/layout-core.mjs';
import {makeKeys,token,decryptReply} from '../lib/assistant-delivery.mjs';
import {transit} from '../lib/assistant-transit.mjs';
const source='帮派弟兄，人类，底层，登场：检索一张帮派弟兄。3费1/2身材。\n火花，法术，底层，造成2点伤害。2费';
const field=(key,name,value)=>({key,name,value,sourceQuote:value});
function reply(){return {kind:'batch',message:'已整理两份资料',records:[{title:'帮派弟兄',typeName:'单位档案',sourceQuote:'帮派弟兄',cardKind:'unit',fields:[field('unitType','种族','人类'),field('faction','系别','底层'),field('description','效果','登场：检索一张帮派弟兄。'),field('cost','费用','3'),field('attack','攻击','1'),field('health','血量','2'),{name:'备注',value:'帮派弟兄',sourceQuote:'帮派弟兄'}]},{title:'火花',typeName:'法术档案',sourceQuote:'火花',cardKind:'spell',fields:[field('faction','系别','底层'),field('description','效果','造成2点伤害。'),field('cost','费用','2')]}]};}
function task(p,mode='cards'){return A.makeRequest(p,{mode,sourceText:source,templateId:L.BASIC_ID});}
test('助手一次归档与制卡，保留额外字段、原文、稳定映射和默认格式',()=>{
 const p=M.blankProject(),prototype=M.copy(p.studio.cards[0]||{});Object.assign(prototype,{id:'prototype',templateId:L.BASIC_ID,cardKind:'unit',name:'样板',cost:9,layout:{title:{x:10,y:8,w:80,h:10}},extraElements:[{id:'image',kind:'image',assetId:'frame',layout:{x:0,y:0,w:100,h:100}},{id:'label',kind:'text',fieldKey:'cost',parentId:'image',layout:{x:10,y:80,w:20,h:8}}]});p.studio.cards=[prototype];L.captureDefault(p.studio,prototype,{[L.BASIC_ID]:L.BASIC_TEMPLATE});
 const t=task(p),s=A.applyBatch(p,t,reply());assert.equal(s.archived,2);assert.equal(s.created,2);assert.equal(p.links.length,2);assert.equal(p.imports.at(-1).raw,source);assert.equal(p.archive.archives[0].versions[0].fields.at(-1).name,'备注');
 const made=p.studio.cards[1];assert.equal(made.cost,3);assert.deepEqual(made.layout,prototype.layout);assert.equal(made.extraElements[1].parentId,made.extraElements[0].id);assert.notEqual(made.extraElements[0].id,'image');assert.equal(p.studio.cards[2].cardKind,'spell');assert.deepEqual(L.templateFor(p.studio.cards[2],{[L.BASIC_ID]:L.BASIC_TEMPLATE}).stats,[]);
 const before=M.copy(p);assert.equal(A.applyBatch(p,t,reply()).duplicate,true);assert.deepEqual(p,before);M.validateProject(JSON.parse(JSON.stringify(p)));
});
test('助手缺值只归档待补，手动补数值后为原档案生成卡片，重试不重复',()=>{
 const p=M.blankProject(),r=reply();r.records[0].fields=r.records[0].fields.filter(f=>!['cost','attack'].includes(f.key));const t=task(p),s=A.applyBatch(p,t,r);assert.equal(s.archived,2);assert.equal(s.created,1);assert.equal(s.pending,1);
 const pending=p.assistantBatches[0].pending[0],v=p.archive.archives.find(a=>a.id===pending.archiveId).versions[0];v.rows[0].values[pending.fieldIds.cost]='3';v.rows[0].values[pending.fieldIds.attack]='1';const result=A.completePending(p,t.id);assert.equal(result.created,1);assert.equal(p.archive.archives.length,2);assert.equal(A.completePending(p,t.id).created,0);assert.equal(p.studio.cards.length,2);
});
test('助手仅归档不创建卡，同名资料先核对，只能明确新增',()=>{
 const p=M.blankProject(),r=reply();A.applyBatch(p,task(p,'archive'),r);assert.equal(p.studio.cards.length,0);const t=task(p),plan=A.planBatch(p,t,r);assert.equal(plan.items[0].duplicate,true);const before=M.copy(p);assert.throws(()=>A.applyBatch(p,t,r),/没有可采用/);assert.deepEqual(p,before);A.applyBatch(p,t,r,[0]);assert.equal(p.archive.archives.length,3);assert.equal(p.studio.cards.length,1);
});
test('伪造字段值与引文、越过项目和旧版本回复不写入',()=>{
 const p=M.blankProject(),r=reply();r.records[0].fields[0].value='精灵';const t=task(p);assert.equal(A.planBatch(p,t,r).items[0].canAccept,false);const before=M.copy(p);assert.throws(()=>A.applyBatch(p,t,r,[0]),/原文依据/);assert.deepEqual(p,before);p.revision++;assert.throws(()=>A.applyBatch(p,t,reply()),/已有修改/);assert.throws(()=>A.planBatch({...p,id:'other'},t,reply()),/不属于/);
});
test('自然语言卡面修改只在选定范围，保留布局与原档案，锁定或错误数值整批拒绝',()=>{
 const p=M.blankProject();A.applyBatch(p,task(p),reply());const c=p.studio.cards[0],t=A.makeRequest(p,{mode:'revise',prompt:'费用改成5',cardIds:[c.id]}),r={kind:'edits',message:'修改费用',cardChanges:[{cardId:c.id,patch:{cost:5}}]},oldArchive=M.copy(p.archive),layout=M.copy(c.layout);
 assert.equal(A.editsPreview(p,t,A.normalizeReply(r))[0].before,'3');A.applyBatch(p,t,r);assert.equal(p.studio.cards[0].cost,5);assert.deepEqual(p.archive,oldArchive);assert.deepEqual(p.studio.cards[0].layout,layout);assert.equal(p.links[0].overrides.cost,true);
 let next=A.makeRequest(p,{mode:'revise',prompt:'改卡',cardIds:[c.id]}),before=M.copy(p);assert.throws(()=>A.applyBatch(p,next,{...r,cardChanges:[{cardId:p.studio.cards[1].id,patch:{cost:6}}]}),/范围/);assert.deepEqual(p,before);
 p.studio.cards[0].layout.cost={locked:true};next=A.makeRequest(p,{mode:'revise',prompt:'改费用',cardIds:[c.id]});before=M.copy(p);assert.throws(()=>A.applyBatch(p,next,r),/锁定/);assert.deepEqual(p,before);
});
test('档案修改保留编号、原始出处与故事版本，并记录修订且同步跟随卡',()=>{
 const p=M.blankProject();A.applyBatch(p,task(p),reply());const a=p.archive.archives[0],v=a.versions[0],f=v.fields.find(f=>f.name==='系别'),r=v.rows[0],t=A.makeRequest(p,{mode:'revise',prompt:'系别改成上层',archiveIds:[a.id]}),oldQuote=v.provenance.fields[f.id].quote;
 A.applyBatch(p,t,{kind:'edits',message:'调整系别',archiveChanges:[{archiveId:a.id,versionId:v.id,rowId:r.id,fieldId:f.id,value:'上层'}]});const after=p.archive.archives[0].versions[0];assert.equal(after.id,v.id);assert.equal(after.rows[0].values[f.id],'上层');assert.equal(after.provenance.fields[f.id].quote,oldQuote);assert.equal(after.provenance.fields[f.id].manualCorrection.value,'上层');assert.equal(p.studio.cards[0].faction,'上层');
});
test('请求只提供选定范围与字段，不携带素材、完整库或越界长文本',()=>{
 const p=M.blankProject();A.applyBatch(p,task(p),reply());p.studio.userAssets=[{id:'private-image',dataUrl:'data:image/png;base64,SECRET'}];const t=A.makeRequest(p,{mode:'revise',prompt:'改当前卡',cardIds:[p.studio.cards[0].id]});assert.equal(t.context.cards.length,1);assert.ok(!JSON.stringify(t).includes('SECRET'));assert.equal(t.context.archives.length,0);assert.throws(()=>A.makeRequest(p,{sourceText:'字'.repeat(48001)}),/过长/);assert.throws(()=>A.makeRequest(p,{mode:'revise',prompt:'改',cardIds:[]}),/打开一份/);
});
class Bucket {
 constructor(){this.files=new Map;this.n=0;}
 async get(path){const value=this.files.get(path);return value?{etag:value.etag,json:async()=>JSON.parse(value.text)}:null;}
 async put(path,text,opts={}){const old=this.files.get(path);if(opts.onlyIf?.etagDoesNotMatch==='*'&&old||opts.onlyIf?.etagMatches&&old?.etag!==opts.onlyIf.etagMatches)return null;const etag=String(++this.n);this.files.set(path,{text,etag,customMetadata:opts.customMetadata});return {etag};}
 async list({prefix}){return {objects:[...this.files].filter(([k])=>k.startsWith(prefix)).map(([key,v])=>({key,customMetadata:v.customMetadata}))};}
 async delete(paths){for(const p of Array.isArray(paths)?paths:[paths])this.files.delete(p);}
}
test('真实加密回复往返：不存原文明文，凭据与用户隔离，重复完成幂等，收取后删除',async()=>{
 const bucket=new Bucket,keys=await makeKeys(),readToken=token(),writeToken=token(),args={jobId:'job_test',projectId:'project_test',baseRevision:3,readToken,writeToken,publicKey:keys.publicKey},env={bucket,owner:'one'};
 await transit('kadi_begin',args,env);await transit('kadi_begin',args,env);await assert.rejects(()=>transit('kadi_finish',{jobId:args.jobId,writeToken:token(),reply:reply()},env),/无效/);
 await transit('kadi_finish',{jobId:args.jobId,writeToken,reply:reply()},env);assert.ok(!JSON.stringify([...bucket.files.values()]).includes('帮派弟兄'));
 await transit('kadi_finish',{jobId:args.jobId,writeToken,reply:reply()},env);await assert.rejects(()=>transit('kadi_finish',{jobId:args.jobId,writeToken,reply:{kind:'answer',message:'different'}},env),/不同回复/);
 const delivery=await transit('kadi_delivery',{jobId:args.jobId,readToken},env),packet=await decryptReply(delivery._meta.delivery,keys.privateKey,args.jobId);assert.equal(packet.projectId,args.projectId);assert.equal(packet.reply.records[0].title,'帮派弟兄');assert.ok(!JSON.stringify(delivery.structuredContent).includes('body'));
 assert.equal((await transit('kadi_delivery',{jobId:args.jobId,readToken},{bucket,owner:'two'})).structuredContent.delivery,null);await assert.rejects(()=>transit('kadi_delivery',{jobId:args.jobId,readToken:token()},env),/不能读取/);
 await transit('kadi_delivery',{jobId:args.jobId,readToken,acknowledge:true},env);assert.equal(bucket.files.size,0);
});
