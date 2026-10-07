import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import path from 'node:path';import {randomUUID} from 'node:crypto';
const root=path.resolve('.'),aliases={'node:fs':path.join(root,'browser/localFs.ts'),'node:path':path.join(root,'browser/localPath.ts'),'node:crypto':path.join(root,'browser/localCrypto.ts')};
const output=await build({entryPoints:['tests/browserCore.entry.ts'],write:false,bundle:true,platform:'browser',format:'esm',target:'es2022',plugins:[{name:'browser-core-test',setup(b){b.onResolve({filter:/^node:(fs|path|crypto)$/},a=>({path:aliases[a.path]}));}}]});
const {Store,Service,loadFiles,stagedFiles}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
const uid=()=>randomUUID();const prose='程砚把湿伞靠在门边。屋里没有点灯，桌上的茶已经凉了。他摸到椅背，坐下来，坐在那里。阿禾从灶间出来，问他为什么来迟。他说桥口在查路引。';
const reply=(extra={})=>({kind:'answer',message:'只核对原文。',reasons:[],questions:[],evidenceIds:[],memories:[],...extra});

test('实际浏览器适配器：原稿重开、选段回复、作者采纳、撤销与版本保护',()=>{
  loadFiles();let store=new Store('/writer');const p=store.createProject('本机存稿',uid()).id,c=store.snapshot().projects[0].chapters[0].id;store.save(p,c,1,prose,uid());
  const saved=stagedFiles();assert.equal(JSON.parse(saved.main).projects[0].chapters[0].text,prose);loadFiles(saved.main,saved.previous);store=new Store('/writer');assert.equal(store.chapter(store.project(p),c).text,prose);
  const start=prose.indexOf('坐下来'),end=prose.indexOf('。阿禾');const j=store.request(p,c,2,{start,end},'消除重复', 'polish',false,uid()).jobId;store.context(j);
  const service=new Service(store),key=service.clientKey;service.ui('importReply',{packet:{format:'author-writing-reply',schema:1,jobId:j,rev:2,memoryRev:0,branch:1,reply:reply({kind:'candidate',replacement:'坐下来',message:'去掉重复的坐姿。'})}},key);
  assert.equal(store.chapter(store.project(p),c).text,prose);service.ui('decide',{jobId:j,accept:true,requestId:uid()},key);const expected=prose.slice(0,start)+'坐下来'+prose.slice(end);assert.equal(store.chapter(store.project(p),c).text,expected);
  service.ui('history',{projectId:p,chapterId:c,baseRev:3,direction:'undo',requestId:uid()},key);assert.equal(store.chapter(store.project(p),c).text,prose);
  assert.throws(()=>store.save(p,c,2,'旧窗口覆盖',uid()),e=>e.code==='REV_CONFLICT');assert.equal(store.chapter(store.project(p),c).text,prose);
});
test('实际浏览器适配器：原稿损坏可从上一份有效提交恢复并保留损坏原档',()=>{
  loadFiles();const store=new Store('/writer');store.createProject('可恢复存稿',uid());const committed=stagedFiles();loadFiles('{broken',committed.main);const restored=new Store('/writer');assert.equal(restored.recovered,true);assert.equal(restored.snapshot().projects[0].name,'可恢复存稿');assert.equal(stagedFiles().corrupt[0][1],'{broken');
});
test('实际浏览器适配器：自动记忆有出处，纠正停用旧项，作者确认前不作依据',()=>{
  loadFiles();const s=new Store('/writer'),p=s.createProject('记忆保护',uid()).id,c=s.project(p).chapters[0].id;s.save(p,c,1,prose,uid());const j=s.request(p,c,2,{start:0,end:14},'学习人物所知','learn',false,uid()).jobId;s.context(j);
  const end=prose.indexOf('。')+1;s.complete(j,reply({kind:'analysis',memories:[{key:'程砚的伞',type:'item',value:'程砚的伞是湿的。',certainty:'explicit',evidence:[{chapterId:c,rev:2,start:0,end,quote:prose.slice(0,end)}]}]}));
  const old=s.project(p).memories[0];assert.equal(old.status,'auto');s.correctMemory(p,old.id,'伞属于阿禾，程砚暂时借用。',uid());const m=s.project(p).memories.find(x=>x.status==='pending');assert.ok(m);assert.equal(s.project(p).memories.find(x=>x.id===old.id).status,'rejected');
  const next=s.request(p,c,2,{start:0,end:14},'这把伞属于谁？','ask',false,uid()).jobId;assert.equal(s.context(next).memories.length,0);s.decideMemory(p,m.id,s.project(p).memoryRev,true,uid());assert.equal(s.project(p).memories.find(x=>x.id===m.id).status,'confirmed');
});
