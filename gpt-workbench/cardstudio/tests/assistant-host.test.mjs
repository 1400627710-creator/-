import test from 'node:test';
import assert from 'node:assert/strict';
import {AssistantHost} from '../local/assistant-host.mjs';
import {transit} from '../lib/assistant-transit.mjs';
test('当前对话桥完整往返：握手回声不误认、任务送出、加密结果解回原项目，普通网页不握手',async()=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document,listeners=new Set,requests=[],files=new Map;let latest,serial=0;
 const bucket={async get(key){const v=files.get(key);return v?{etag:v.etag,json:async()=>JSON.parse(v.value)}:null;},async put(key,value,opts){const old=files.get(key);if(opts.onlyIf?.etagDoesNotMatch==='*'&&old||opts.onlyIf?.etagMatches&&old?.etag!==opts.onlyIf.etagMatches)return null;const etag=String(++serial);files.set(key,{value,etag});return {etag};},async delete(key){files.delete(key);}};
 const env={owner:'synthetic-bridge-owner',bucket};
 const deliver=data=>{for(const listener of listeners)listener({source:parent,data});};
 const parent={postMessage(message){requests.push(message);if(message.id===undefined)return;queueMicrotask(async()=>{
  // Echoing a request with its ID must not resolve initialization.
  deliver(message);let result={};if(message.method==='ui/initialize')result={hostCapabilities:{message:{text:{}},updateModelContext:{}},hostContext:{}};
  else if(message.method==='tools/call')result=await transit(message.params.name,message.params.arguments,env);
  else if(message.method==='ui/message')latest=JSON.parse(message.params.content[1].text);
  deliver({jsonrpc:'2.0',id:message.id,result});
 });}};
 globalThis.window={parent,addEventListener:(type,fn)=>listeners.add(fn),removeEventListener:(type,fn)=>listeners.delete(fn)};
 globalThis.document={querySelector:()=>({content:'mcp-local'})};const bridge=new AssistantHost();
 try{
  assert.equal(await bridge.connect(),true);const task={id:'job_protocol',projectId:'project_protocol',baseRevision:2,sourceText:'帮派弟兄',prompt:'整理',context:{mode:'cards'}};
  await bridge.prepare(task);await bridge.send(task);assert.equal(latest.jobId,task.id);assert.equal(latest.sourceText,'帮派弟兄');assert.equal(latest.writeToken,task.ticket.writeToken);assert.ok(!JSON.stringify(latest).includes('privateKey'));
  await transit('kadi_finish',{jobId:task.id,writeToken:latest.writeToken,reply:{kind:'answer',message:'已阅读本次资料'}},env);const packet=await bridge.receive(task);assert.equal(packet.projectId,task.projectId);assert.equal(packet.baseRevision,2);assert.equal(packet.reply.message,'已阅读本次资料');await bridge.acknowledge(task);assert.equal(files.size,0);
  globalThis.document={querySelector:()=>({content:'web-local'})};const other=new AssistantHost(),before=requests.length;assert.equal(await other.connect(),false);assert.equal(requests.length,before);other.destroy();
 }finally{bridge.destroy();if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
});
