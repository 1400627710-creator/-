import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store,WriterError} from '../shared/store.js';
import {Service} from '../shared/service.js';
import type {ModelReply} from '../shared/types.js';

const prose='程砚把湿伞靠在门边。屋里没有点灯，桌上的茶已经凉了。他摸到椅背，坐下来。阿禾从灶间出来，问他为什么来迟。他说桥口在查路引。他不知道阿禾已把信交给账房。\n阿禾把一只干碗放到他面前，没有再问。';
const reply=(extra:Partial<ModelReply>={}):ModelReply=>({kind:'answer',message:'依据当前原文。',reasons:[],questions:[],evidenceIds:[],memories:[],...extra});
const fixture=()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'author-writing-test-')),s=new Store(root);
 const pId=s.createProject('验收用小说','create-novel').id,p=s.project(pId),c=p.chapters[0];
 s.save(pId,c.id,c.rev,prose,'save-prose');return{root,s,pId,cId:c.id};
};
const code=(expected:string)=> (e:unknown)=>e instanceof WriterError&&e.code===expected;
function request(f:ReturnType<typeof fixture>,mode:'ask'|'polish'|'ghostwrite'|'learn'='polish',start=0,end=12){const c=f.s.chapter(f.s.project(f.pId),f.cId);const jobId=f.s.request(f.pId,f.cId,c.rev,{start,end},'保留意思',mode,false,'job-'+Math.random().toString(36).slice(2)).jobId;f.s.context(jobId);return jobId;}

test('存稿重开、纯文本副本与持久幂等',()=>{
 const f=fixture(),s2=new Store(f.root);assert.equal(s2.chapter(s2.project(f.pId),f.cId).text,prose);
 assert.equal(fs.readFileSync(path.join(f.root,'novels',f.pId,f.cId+'.txt'),'utf8'),prose);
 assert.equal(s2.createProject('验收用小说','create-novel').id,f.pId);assert.equal(s2.snapshot().projects.length,1);
 assert.throws(()=>s2.createProject('另一部','create-novel'),code('REQUEST_CONFLICT'));
});
test('旧修订保存拒绝，原稿不受损',()=>{
 const f=fixture(),c=f.s.chapter(f.s.project(f.pId),f.cId),before=c.text;
 assert.throws(()=>f.s.save(f.pId,f.cId,c.rev-1,'覆盖','old-save'),code('REV_CONFLICT'));assert.equal(f.s.chapter(f.s.project(f.pId),f.cId).text,before);
});
test('候选经采纳只改选段；撤销重做保持单调修订',()=>{
 const f=fixture(),j=request(f),before=f.s.chapter(f.s.project(f.pId),f.cId).text;
 f.s.complete(j,reply({kind:'candidate',replacement:'程砚将湿伞靠到门边。'}));assert.equal(f.s.chapter(f.s.project(f.pId),f.cId).text,before);
 f.s.decide(j,true,'accept');const c=f.s.chapter(f.s.project(f.pId),f.cId);assert.equal(c.text,'程砚将湿伞靠到门边。'+before.slice(12));const rev=c.rev;
 f.s.history(f.pId,c.id,rev,'undo','undo');assert.equal(f.s.chapter(f.s.project(f.pId),c.id).text,before);
 f.s.history(f.pId,c.id,rev+1,'redo','redo');assert.equal(f.s.chapter(f.s.project(f.pId),c.id).rev,rev+2);
});
test('候选拒绝不写稿，自动记忆引用必须精确',()=>{
 const f=fixture(),j=request(f);const c=f.s.chapter(f.s.project(f.pId),f.cId);
 assert.throws(()=>f.s.complete(j,reply({memories:[{key:'错误',type:'plot',value:'错误',certainty:'explicit',evidence:[{chapterId:c.id,rev:c.rev,start:0,end:3,quote:'伪出处'}]}]})),code('INVALID_EVIDENCE'));
 f.s.complete(j,reply({kind:'candidate',replacement:'测试候选'}));f.s.decide(j,false,'reject');assert.equal(f.s.chapter(f.s.project(f.pId),f.cId).text,prose);
});
test('写作中改变正文，迟到回复与候选都被拦截',()=>{
 const f=fixture(),j=request(f);const c=f.s.chapter(f.s.project(f.pId),f.cId);
 f.s.save(f.pId,c.id,c.rev,c.text+'\n作者新增句子。','newer');assert.throws(()=>f.s.complete(j,reply()),code('STALE_JOB'));
 const j2=request(f);f.s.complete(j2,reply({kind:'candidate',replacement:'旧候选'}));const c2=f.s.chapter(f.s.project(f.pId),f.cId);f.s.save(f.pId,c2.id,c2.rev,c2.text+'又改了。','newest');assert.throws(()=>f.s.decide(j2,true,'stale-accept'),code('STALE_JOB'));
});
test('编辑旧问题建立分支，后续旧任务不能回写',()=>{
 const f=fixture(),j=request(f,'ask');const p=f.s.project(f.pId),message=p.messages.find(m=>m.jobId===j)!;const c=f.s.chapter(p,f.cId);
 f.s.request(p.id,c.id,c.rev,{start:0,end:12},'重问','ask',false,'edit',message.id);
 assert.equal(f.s.project(f.pId).branch,2);assert.equal(f.s.project(f.pId).messages.find(m=>m.id===message.id)?.active,false);
 assert.throws(()=>f.s.complete(j,reply()),code('STALE_JOB'));
});
test('纠错即时停用，修正待确认，不会被自动学习覆盖',()=>{
 const f=fixture(),j=request(f,'learn');const c=f.s.chapter(f.s.project(f.pId),f.cId);
 const memory={key:'程砚知情',type:'knowledge' as const,value:'程砚不知信的去向',certainty:'explicit' as const,evidence:[{chapterId:c.id,rev:c.rev,start:0,end:prose.length,quote:prose}]};
 f.s.complete(j,reply({kind:'analysis',memories:[memory]}));let p=f.s.project(f.pId);const old=p.memories[0];const corrected=f.s.correctMemory(p.id,old.id,'程砚仅知道阿禾收到了信。','correct');
 p=f.s.project(f.pId);assert.equal(p.memories.find(m=>m.id===old.id)?.status,'rejected');assert.equal(p.memories.find(m=>m.id===corrected.memoryId)?.status,'pending');
 const j2=request(f,'ask'),ctx=f.s.context(j2);assert.equal(ctx.memories.length,0);
 f.s.complete(j2,reply({memories:[memory]}));assert.equal(f.s.project(p.id).memories.length,2);
 f.s.decideMemory(p.id,corrected.memoryId,f.s.project(p.id).memoryRev,true,'confirm');const j3=request(f,'ask');assert.equal(f.s.context(j3).memories[0].value,'程砚仅知道阿禾收到了信。');
});
test('原文改动使有出处的记忆失效，小说资料严格隔离',()=>{
 const f=fixture(),j=request(f,'learn'),c=f.s.chapter(f.s.project(f.pId),f.cId);
 f.s.complete(j,reply({kind:'analysis',memories:[{key:'灯',type:'world',value:'屋里没点灯',certainty:'explicit',evidence:[{chapterId:c.id,rev:c.rev,start:0,end:prose.length,quote:prose}]}]}));
 f.s.save(f.pId,c.id,c.rev,prose.replace('没有点灯','点着灯'),'edit-source');assert.equal(f.s.project(f.pId).memories[0].status,'stale');
 const second=f.s.createProject('第二本','novel-two').id;assert.equal(f.s.project(second).memories.length,0);
 assert.throws(()=>f.s.readChapter(second,f.cId),code('NOT_FOUND'));
});
test('信息不足 ASK 不含代笔正文，没样本不能代笔',()=>{
 const f=fixture(),id=f.s.createProject('空稿','empty-novel').id,c=f.s.project(id).chapters[0];
 const j=f.s.request(id,c.id,c.rev,{start:0,end:0},'写一个过渡','ghostwrite',false,'empty-job').jobId;f.s.context(j);
 assert.throws(()=>f.s.complete(j,reply({kind:'candidate',replacement:'编造'})),code('STYLE_REQUIRED'));
 assert.throws(()=>f.s.complete(j,reply({kind:'ask',questions:['目的是什么？'],replacement:'编造'})),code('INVALID_REPLY'));
 f.s.complete(j,reply({kind:'ask',questions:['请提供作者样本和过渡要到达的情节。']}));assert.equal(f.s.chapter(f.s.project(id),c.id).text,'');
});
test('AI 采纳内容不会自动成为作者样本；明确认可才可使用',()=>{
 const f=fixture(),j=request(f,'polish',0,prose.length),ai='模型生成的内容，仅用于验证来源隔离。'.repeat(8);f.s.complete(j,reply({kind:'candidate',replacement:ai}));f.s.decide(j,true,'ai-accept');
 const j2=request(f,'ghostwrite',0,0),ctx=f.s.context(j2);assert.equal(ctx.styleSamples.length,0);assert.throws(()=>f.s.complete(j2,reply({kind:'candidate',replacement:'代笔'})),code('STYLE_REQUIRED'));
 const c=f.s.chapter(f.s.project(f.pId),f.cId);f.s.approveStyle(f.pId,c.id,c.rev,{start:0,end:80},'approve-style');
 const j3=request(f,'ghostwrite',0,0);assert.ok(f.s.context(j3).styleSamples.length>0);
});
test('自动请求五分钟节流，手动请求优先并撤销旧自动任务',()=>{
 const f=fixture(),c=f.s.chapter(f.s.project(f.pId),f.cId);f.s.setProactive(f.pId,true,'auto-on');
 const auto=f.s.request(f.pId,c.id,c.rev,{start:0,end:12},'建议','suggest',true,'auto-request').jobId;
 assert.throws(()=>f.s.request(f.pId,c.id,c.rev,{start:0,end:12},'建议','suggest',true,'auto-again'),code('RATE_LIMIT'));
 const manual=f.s.request(f.pId,c.id,c.rev,{start:0,end:12},'提问','ask',false,'manual-request').jobId;
 assert.equal(f.s.job(auto).j.status,'cancelled');assert.equal(f.s.nextRequest()?.jobId,manual);
});
test('私有作者能力控制采纳、确认和存稿，路径越界拒绝',()=>{
 const f=fixture(),service=new Service(f.s);
 assert.throws(()=>service.ui('save',{},'wrong'),code('UI_ONLY'));
 assert.throws(()=>f.s.readChapter('../outside','../outside'),code('INVALID_ID'));
 const backup=f.s.exportProject(f.pId);(backup.project.chapters[0] as any).id='../../secret';assert.throws(()=>f.s.importProject(backup,'bad-import'),code('INVALID_BACKUP'));
});
test('保存中断不改当前内存与磁盘主稿，损坏主档从有效备份恢复',()=>{
 const f=fixture(),c=f.s.chapter(f.s.project(f.pId),f.cId),file=path.join(f.root,'state.json');
 fs.renameSync(file,file+'.held');fs.mkdirSync(file);
 assert.throws(()=>f.s.save(f.pId,c.id,c.rev,'丢稿测试','io-failure'),code('IO_FAILED'));assert.equal(f.s.chapter(f.s.project(f.pId),f.cId).text,prose);
 fs.rmdirSync(file);fs.renameSync(file+'.held',file);fs.writeFileSync(file,'broken');const recovered=new Store(f.root);assert.equal(recovered.recovered,true);assert.equal(recovered.chapter(recovered.project(f.pId),f.cId).text,prose);
});
test('导出恢复创建独立工程，重映射来源，不携带旧任务',()=>{
 const f=fixture();request(f,'ask');const backup=f.s.exportProject(f.pId),newId=f.s.importProject(backup,'restore').id;
 const p=f.s.project(newId);assert.notEqual(newId,f.pId);assert.notEqual(p.chapters[0].id,f.cId);assert.equal(p.chapters[0].text,prose);assert.equal(p.jobs.length,0);
});
test('网页文件接力仍有版本校验，导入不伪造 MCP 模型连接',()=>{
 const f=fixture(),service=new Service(f.s),j=request(f),exported=service.ui('exportRequest',{jobId:j},service.clientKey).result.packet;
 const job=exported.context.job,packet={format:'author-writing-reply',schema:1,jobId:job.id,rev:job.rev,memoryRev:job.memoryRev,branch:job.branch,reply:reply({kind:'candidate',replacement:'候选'})};
 service.ui('importReply',{packet},service.clientKey);assert.equal(f.s.job(j).j.status,'done');assert.equal(service.modelConnection.completedRequests,0);
});
test('十万字工程保存计时，自动保存核心写入低于两秒',()=>{
 const f=fixture(),c=f.s.chapter(f.s.project(f.pId),f.cId),start=performance.now();f.s.save(f.pId,c.id,c.rev,'写'.repeat(100000),'100k-save');assert.ok(performance.now()-start<2000);
});
test('不相关编辑保留记忆，出处位置和修订准确更新',()=>{
 const f=fixture(),j=request(f,'learn'),c=f.s.chapter(f.s.project(f.pId),f.cId),quote='他不知道阿禾已把信交给账房。',start=prose.indexOf(quote);
 f.s.complete(j,reply({kind:'analysis',memories:[{key:'第一章程砚认知',type:'knowledge',value:quote,certainty:'explicit',evidence:[{chapterId:c.id,rev:c.rev,start,end:start+quote.length,quote}]}]}));
 f.s.save(f.pId,c.id,c.rev,'新写一行。'+prose,'unrelated-edit');const p=f.s.project(f.pId),m=p.memories[0];assert.equal(m.status,'auto');assert.equal(m.evidence[0].start,start+5);assert.equal(m.evidence[0].rev,c.rev+1);assert.ok(f.s.spanValid(p,m.evidence[0]));
});
test('AI 内容不能自动提取为文风记忆，损坏出处备份拒绝导入',()=>{
 const f=fixture(),j=request(f,'polish',0,prose.length),ai='这是模型候选，用来测试文风隔离。'.repeat(5);f.s.complete(j,reply({kind:'candidate',replacement:ai}));f.s.decide(j,true,'generated');const c=f.s.chapter(f.s.project(f.pId),f.cId),learn=request(f,'learn',0,ai.length);
 assert.throws(()=>f.s.complete(learn,reply({kind:'analysis',memories:[{key:'文风',type:'style',value:'伪学习',certainty:'explicit',evidence:[{chapterId:c.id,rev:c.rev,start:0,end:ai.length,quote:ai}]}]})),code('GENERATED_STYLE'));
 const packet=f.s.exportProject(f.pId);packet.project.memories=[{id:'memory-bad',key:'bad',type:'style',value:'bad',certainty:'explicit',status:'auto',evidence:[{chapterId:c.id,rev:c.rev,start:0,end:5,quote:5 as any}]}];assert.throws(()=>f.s.importProject(packet,'bad-evidence-backup'),code('INVALID_BACKUP'));
});
