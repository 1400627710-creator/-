import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';
import worker from '../worker/index.js';import {makeKeys,decryptReply} from '../shared/delivery.ts';import {sha256} from '../browser/localCrypto.ts';
class Bucket {
  data=new Map();
  async get(k){const v=this.data.get(k);return v?{etag:v.etag,json:async()=>JSON.parse(v.text)}:null;}
  async put(k,text,o={}){const prev=this.data.get(k);if(o.onlyIf?.etagDoesNotMatch==='*'&&prev)return null;if(o.onlyIf?.etagMatches&&o.onlyIf.etagMatches!==prev?.etag)return null;const etag=randomUUID();this.data.set(k,{text,etag,customMetadata:o.customMetadata});return {etag};}
  async delete(keys){for(const k of Array.isArray(keys)?keys:[keys])this.data.delete(k);}
  async list(o){return {objects:[...this.data].filter(([k])=>k.startsWith(o.prefix)).map(([key,v])=>({key,customMetadata:v.customMetadata})).slice(0,o.limit)};}
}
const setup=()=>{
  const bucket=new Bucket();const pending=[];let id=0;
  const rpc=async(method,params)=>{const response=await worker.fetch(new Request('https://site.test/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})}),{BUCKET:bucket},{waitUntil:p=>pending.push(p)});const body=await response.json();assert.ok(!body.error,JSON.stringify(body));return body.result;};
  return {bucket,rpc,call:(name,args={})=>rpc('tools/call',{name,arguments:args})};
};
const answer=(more={})=>({kind:'answer',message:'只依据当前原文回答。',reasons:[],questions:[],evidenceIds:[],memories:[],...more});
const token=n=>n.toString(16).padStart(64,'0');
async function begin(t,mode='polish'){const keys=await makeKeys();const args={jobId:randomUUID(),readToken:token(1),writeToken:token(2),publicKey:keys.publicKey,rev:3,memoryRev:2,branch:4,mode};const result=await t.call('writer_begin',args);assert.equal(result.structuredContent.ok,true,JSON.stringify(result));return {...keys,...args};}

test('插件发现有全屏窗口、侧栏入口和 app-only 通道；模型没有采纳或正文写入工具',async()=>{
  const t=setup(),init=await t.rpc('initialize',{protocolVersion:'2025-11-25'});assert.equal(init.serverInfo.version,'0.2.0');
  const tools=(await t.rpc('tools/list',{})).tools;const open=tools.find(x=>x.name==='writer_open');assert.deepEqual(open._meta['openai/ui'].entrypoints,[{type:'global'},{type:'thread'}]);
  assert.ok(tools.every(x=>!['writer_ui','writer_decide','writer_save'].includes(x.name)));assert.deepEqual(tools.find(x=>x.name==='writer_begin')._meta.ui.visibility,['app']);
  const resource=(await t.rpc('resources/read',{uri:open._meta.ui.resourceUri})).contents[0];assert.equal(resource.mimeType,'text/html;profile=mcp-app');assert.deepEqual(resource._meta['openai/ui'].availableDisplayModes,['fullscreen']);assert.ok(resource.text.includes('润色选段'));assert.ok(resource.text.includes('indexedDB'));assert.ok(!resource.text.includes('api.openai.com'));
  const status=await t.call('writer_status');assert.equal(status.structuredContent.requiresLocalLauncher,false);assert.equal(status.structuredContent.usesApiKey,false);
});
test('GPT 回复真实走加密通道，服务器不保存原文或明文回复，只有当前本机私钥可读取',async()=>{
  const t=setup(),a=await begin(t);const reply=answer({kind:'candidate',replacement:'他坐下来。',message:'去掉选段中的重复，保留原意。'});
  const done=await t.call('writer_finish',{jobId:a.jobId,writeToken:a.writeToken,reply});assert.equal(done.structuredContent.formalManuscriptChanged,false);
  const objects=JSON.stringify([...t.bucket.data.values()]);assert.ok(!objects.includes(reply.replacement));assert.ok(!objects.includes(reply.message));assert.ok(!objects.includes('privateKey'));assert.ok(!objects.includes(a.readToken));assert.ok(!objects.includes(a.writeToken));
  const received=await t.call('writer_delivery',{jobId:a.jobId,readToken:a.readToken});const packet=await decryptReply(received.structuredContent.delivery,a.privateKey,a.jobId);
  assert.deepEqual(packet,{format:'author-writing-reply',schema:1,jobId:a.jobId,rev:3,memoryRev:2,branch:4,reply});
  const other=await makeKeys();await assert.rejects(decryptReply(received.structuredContent.delivery,other.privateKey,a.jobId));
  await assert.rejects(decryptReply(received.structuredContent.delivery,a.privateKey,randomUUID()));
});
test('其他请求、伪造权限和错误模式不能写回；ASK 不带候选',async()=>{
  const t=setup(),a=await begin(t,'ask');
  const bad=await t.call('writer_finish',{jobId:a.jobId,writeToken:token(999),reply:answer()});assert.equal(bad.structuredContent.code,'INVALID_CAPABILITY');
  const read=await t.call('writer_delivery',{jobId:a.jobId,readToken:token(998)});assert.equal(read.structuredContent.code,'INVALID_CAPABILITY');
  const candidate=await t.call('writer_finish',{jobId:a.jobId,writeToken:a.writeToken,reply:answer({kind:'candidate',replacement:'错误改稿'})});assert.equal(candidate.structuredContent.code,'INVALID_REPLY');
  const ask=await t.call('writer_finish',{jobId:a.jobId,writeToken:a.writeToken,reply:answer({kind:'ask',questions:['过渡需要表达什么意图？'],replacement:'越权正文'})});assert.equal(ask.structuredContent.code,'INVALID_REPLY');
  const good=await t.call('writer_finish',{jobId:a.jobId,writeToken:a.writeToken,reply:answer({kind:'ask',questions:['过渡需要表达什么意图？']})});assert.equal(good.structuredContent.ok,true);
});
test('相同回复重试幂等，不同回复冲突；作者收到后删除短期通道',async()=>{
  const t=setup(),a=await begin(t);const args={jobId:a.jobId,writeToken:a.writeToken,reply:answer()};
  assert.equal((await t.call('writer_finish',args)).structuredContent.ok,true);assert.equal((await t.call('writer_finish',args)).structuredContent.ok,true);
  assert.equal((await t.call('writer_finish',{...args,reply:answer({message:'另一份内容'})})).structuredContent.code,'REQUEST_CONFLICT');
  assert.equal((await t.call('writer_delivery',{jobId:a.jobId,readToken:a.readToken,acknowledge:true})).structuredContent.acknowledged,true);assert.equal(t.bucket.data.size,0);
});
test('超时回复不能进入当前窗口，失效通道清除；缺通道是明确错误',async()=>{
  const t=setup(),a=await begin(t),old=t.bucket.data.get('writer-transit-v1/'+a.jobId);const value=JSON.parse(old.text);value.expires=Date.now()-1;old.text=JSON.stringify(value);old.customMetadata.expires=String(value.expires);
  const r=await t.call('writer_delivery',{jobId:a.jobId,readToken:a.readToken});assert.equal(r.structuredContent.expired,true);assert.equal(t.bucket.data.size,0);
  const no=await worker.fetch(new Request('https://site.test/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'writer_delivery',arguments:{jobId:a.jobId,readToken:a.readToken}}})}),{},{});assert.equal((await no.json()).result.structuredContent.code,'DELIVERY_UNAVAILABLE');
});
test('浏览器操作指纹与原生 SHA-256 一致，含中文、emoji 和大文本',()=>{
  for(const s of ['', 'abc','作者原稿💡与修订记录','x'.repeat(200000)])assert.equal(sha256(s),createHash('sha256').update(s).digest('hex'));
});
