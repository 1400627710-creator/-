import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import worker from '../worker/index.js';

const root=path.resolve('.');
const aliases={'node:fs':'browser/localFs.ts','node:path':'browser/localPath.ts','node:crypto':'browser/localCrypto.ts'};
const built=await build({entryPoints:['browser/HostBridge.ts'],write:false,bundle:true,platform:'browser',format:'esm',target:'es2022',plugins:[{name:'simulated-host-and-storage',setup(b){
  b.onResolve({filter:/^node:(fs|path|crypto)$/},a=>({path:path.join(root,aliases[a.path])}));
  b.onResolve({filter:/^@modelcontextprotocol\/ext-apps$/},()=>({path:'host',namespace:'test'}));
  b.onResolve({filter:/^\.\/persistence\.js$/},()=>({path:'storage',namespace:'test'}));
  b.onLoad({filter:/.*/,namespace:'test'},a=>({loader:'js',resolveDir:root,contents:a.path==='host'?`
    export class App {
      async connect(){};getHostContext(){return {displayMode:'fullscreen'}};
      getHostCapabilities(){return {message:{text:{}},updateModelContext:{}}};
      async updateModelContext(){};
      callServerTool(p){return globalThis.writerBridgeTest.call(p.name,p.arguments)};
      sendMessage(p){return globalThis.writerBridgeTest.message(p)};
    }
  `:`
    import {loadFiles,stagedFiles} from ${JSON.stringify(path.join(root,'browser/localFs.ts'))};
    export class Persistence {
      async open(){await this.refresh()};
      async refresh(){const m=globalThis.writerBridgeTest.local;loadFiles(m.get('manuscript'),m.get('previous'))};
      async commit(){const f=stagedFiles(),m=globalThis.writerBridgeTest.local;m.set('manuscript',f.main);m.set('previous',f.previous)};
      async read(k){return structuredClone(globalThis.writerBridgeTest.local.get(k))};
      async put(k,v){globalThis.writerBridgeTest.local.set(k,structuredClone(v))};
    }
  `}));
}}]});
const {HostBridge}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
class Bucket {
  values=new Map();
  async get(k){const v=this.values.get(k);return v?{etag:v.etag,json:async()=>JSON.parse(v.body)}:null;}
  async put(k,body,o={}){const v=this.values.get(k);if(o.onlyIf?.etagDoesNotMatch==='*'&&v||o.onlyIf?.etagMatches&&o.onlyIf.etagMatches!==v?.etag)return null;const etag=randomUUID();this.values.set(k,{body,etag,customMetadata:o.customMetadata});return {etag};}
  async delete(keys){for(const k of Array.isArray(keys)?keys:[keys])this.values.delete(k);}
  async list(){return {objects:[]};}
}
async function setup(failBegin=false){
  const bucket=new Bucket();let seq=0,failed=false;
  const call=async(name,args={})=>{
    const r=await worker.fetch(new Request('https://site.test/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:++seq,method:'tools/call',params:{name,arguments:args}})}),{BUCKET:bucket},{waitUntil:p=>p.catch(()=>{})});
    const result=(await r.json()).result;
    if(name==='writer_begin'&&failBegin&&!failed){failed=true;throw Error('Simulated timeout after successful registration');}
    return result;
  };
  const host={local:new Map(),call,message:async p=>{
    const packet=JSON.parse(p.content[1].text);
    assert.equal(packet.format,'author-writing-gpt-request');assert.ok(packet.context.currentChapter.context.quote);
    const reply={kind:'candidate',message:'删除重复的坐姿，保留原意。',replacement:'坐下来',reasons:['只删除重复措辞。'],questions:[],evidenceIds:[],memories:[]};
    const r=await call('writer_finish',{jobId:packet.jobId,writeToken:packet.writeToken,reply});assert.equal(r.structuredContent.ok,true);return {};
  }};
  globalThis.writerBridgeTest=host;globalThis.window={parent:{}};
  const bridge=new HostBridge();let latest;bridge.onState=s=>{latest=s};await bridge.initialize();
  const p=await bridge.call('createProject',{name:'合成的流程检查',requestId:randomUUID()});const c=latest.database.projects[0].chapters[0].id;
  const prose='程砚把湿伞靠在门边。屋里没有点灯，桌上的茶已经凉了。他摸到椅背，坐下来，坐在那里。阿禾从灶间出来，问他为什么来迟。他说桥口在查路引。';
  await bridge.call('save',{projectId:p.id,chapterId:c,baseRev:1,text:prose,requestId:randomUUID()});
  const start=prose.indexOf('坐下来'),end=prose.indexOf('。阿禾');
  const request=mode=>bridge.call('request',{projectId:p.id,chapterId:c,baseRev:2,selection:{start,end},prompt:'只消除重复措辞。',mode,automatic:false,requestId:randomUUID()});
  return {bridge,host,request,projectId:p.id,chapterId:c,prose,start,end,state:()=>latest};
}
async function untilDone(t,jobId){
  for(let i=0;i<40;i++){await t.bridge.call('snapshot',{});if(t.state().database.projects[0].jobs.find(j=>j.id===jobId)?.status==='done')return;await new Promise(r=>setTimeout(r,5));}
  assert.fail('Reply was not delivered to the right-side conversation');
}
test('模拟 GPT 宿主：旧待办不挡新回复，候选由作者采纳、撤销，重开恢复主稿',async()=>{
  const t=await setup();for(let i=0;i<4;i++)await t.request('ask');const j=await t.request('polish');
  await t.bridge.trigger(j.jobId);await untilDone(t,j.jobId);
  const chapter=()=>t.state().database.projects[0].chapters[0];assert.equal(chapter().text,t.prose);
  await t.bridge.call('decide',{jobId:j.jobId,accept:true,requestId:randomUUID()});assert.equal(chapter().text,t.prose.slice(0,t.start)+'坐下来'+t.prose.slice(t.end));
  await t.bridge.call('history',{projectId:t.projectId,chapterId:t.chapterId,baseRev:3,direction:'undo',requestId:randomUUID()});assert.equal(chapter().text,t.prose);
  const reopened=new HostBridge();let state;reopened.onState=s=>{state=s};await reopened.initialize();assert.equal(state.database.projects[0].chapters[0].text,t.prose);
});
test('模拟 GPT 宿主：注册成功但网络超时，重新唤起复用本机权限并收到回复',async()=>{
  const t=await setup(true),j=await t.request('polish');await assert.rejects(t.bridge.trigger(j.jobId),/Simulated timeout/);
  const saved=structuredClone(t.host.local.get('ticket:'+j.jobId));assert.ok(saved);
  await t.bridge.trigger(j.jobId);await untilDone(t,j.jobId);
  assert.equal(t.host.local.get('ticket:'+j.jobId).writeToken,saved.writeToken);
  assert.equal(t.state().database.projects[0].chapters[0].text,t.prose);
});
