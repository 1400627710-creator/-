import test from 'node:test';
import assert from 'node:assert/strict';
const {api,mcp}=await import('../.test-build/service.js');

test('GPT 工具完整往返与来源校验：读原文、预览、确认、制卡、重读',async()=>{
 const owner=`source_qa_${Date.now()}`,origin='https://local-test.invalid';
 async function call(a,status=200){const r=await api(new Request(origin+'/api/service',{method:'POST',headers:{'Content-Type':'application/json','oai-authenticated-user-id':owner},body:JSON.stringify(a)}));const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;}
 async function tool(name,args){const r=await mcp(new Request(origin+'/mcp',{method:'POST',headers:{'Content-Type':'application/json','oai-authenticated-user-id':owner},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}));return (await r.json()).result;}
 const p=(await call({action:'create',title:'合成 GPT 往返'})).project;
 const sourceText='名称：合成卫士\n系别：自检组\n费用：4';
 const input=await call({action:'inbox',projectId:p.id,text:sourceText});
 assert.equal((await tool('read_input',{projectId:p.id,inputId:input.inputId})).structuredContent.text,sourceText);
 const records=[{title:'合成卫士',fields:[{name:'系别',value:'自检组',sourceQuote:'自检组'},{name:'费用',value:'4',sourceQuote:'4'}]}];
 await call({action:'prepareImport',projectId:p.id,kind:'records',records},400);
 await call({action:'prepareImport',projectId:p.id,kind:'records',records,inputId:'missing_input',sourceText},404);
 const blankQuote=await tool('prepare_import',{projectId:p.id,inputId:input.inputId,records:[{title:'测试',fields:[{name:'编造',value:'并未提供',sourceQuote:''}]}]});assert.equal(blankQuote.isError,true);
 const staged=await tool('prepare_import',{projectId:p.id,inputId:input.inputId,records});assert.equal(staged.structuredContent.requiresUserConfirmation,true);assert.equal(staged._meta.projectId,p.id);assert.equal((await tool('read_project',{projectId:p.id})).structuredContent.archives,0);
 const committed=await call({action:'commitDraft',draftId:staged.structuredContent.draftId});const a=committed.project.archive.archives[0],fields=a.versions[0].fields;
 const binding={id:'gpt_roundtrip',name:'自检规则',typeId:a.typeId,templateId:'unit',map:[{target:'name',source:{kind:'meta',key:'title'}},{target:'faction',source:{kind:'field',fieldId:fields[0].id}},{target:'cost',source:{kind:'field',fieldId:fields[1].id}}]};
 const generated=await tool('generate_cards',{projectId:p.id,binding});assert.equal(generated.structuredContent.created,1);assert.equal(generated._meta.projectId,p.id);assert.equal((await tool('generate_cards',{projectId:p.id,binding})).structuredContent.created,0);
 const read=(await tool('read_project',{projectId:p.id})).structuredContent;assert.equal(read.cards,1);assert.equal(read.links.length,1);const saved=(await call({action:'get',projectId:p.id})).project;assert.equal(saved.studio.cards[0].faction,'自检组');assert.equal(saved.studio.cards[0].cost,4);assert.equal(saved.inbox[0].status,'已归档');
});
