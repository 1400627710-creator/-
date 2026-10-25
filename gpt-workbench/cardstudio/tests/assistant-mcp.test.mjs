import test from 'node:test';
import assert from 'node:assert/strict';
import {makeKeys,token,decryptReply} from '../lib/assistant-delivery.mjs';
const {mcp}=await import('../.test-build/service.js');
async function call(name,args={},owner='assistant-mcp-isolated'){
 const response=await mcp(new Request('https://isolated.invalid/mcp',{method:'POST',headers:{'Content-Type':'application/json','oai-authenticated-user-id':owner},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}));return (await response.json()).result;
}
test('实际 MCP 路由提供本机项目入口，模型结果经加密通道回传并隔离用户，不改变旧云端项目',async()=>{
 const open=await call('open_workbench'),status=await call('kadi_status');assert.equal(open.structuredContent.integration,'gpt-work-local-projects');assert.equal(status.structuredContent.version,'1.4');assert.equal(status.structuredContent.usesApiKey,false);
 const keys=await makeKeys(),a={jobId:'job_mcp',projectId:'project_mcp',baseRevision:0,publicKey:keys.publicKey,readToken:token(),writeToken:token()};assert.ok((await call('kadi_begin',a)).structuredContent.ok);
 assert.ok((await call('kadi_finish',{jobId:a.jobId,writeToken:token(),reply:{kind:'answer',message:'wrong'}})).isError);
 assert.ok((await call('kadi_finish',{jobId:a.jobId,writeToken:a.writeToken,reply:{kind:'answer',message:'合成结果'}})).structuredContent.ok);
 assert.equal((await call('kadi_delivery',{jobId:a.jobId,readToken:a.readToken},'other')).structuredContent.delivery,null);
 const r=await call('kadi_delivery',{jobId:a.jobId,readToken:a.readToken});assert.ok(!r.structuredContent.body);const packet=await decryptReply(r._meta.delivery,keys.privateKey,a.jobId);assert.equal(packet.reply.message,'合成结果');assert.equal(packet.projectId,a.projectId);
 assert.equal((await call('list_projects')).structuredContent.projects.length,0);await call('kadi_delivery',{jobId:a.jobId,readToken:a.readToken,acknowledge:true});assert.equal((await call('kadi_delivery',{jobId:a.jobId,readToken:a.readToken})).structuredContent.expired,true);
});
