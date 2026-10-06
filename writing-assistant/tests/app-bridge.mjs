// MCP Apps host simulator: verifies wire/UI behavior, never claims actual ChatGPT installation.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const {chromium}=await import(process.env.WRITER_PLAYWRIGHT||'playwright');
const out=path.resolve('test-results/bridge');fs.mkdirSync(out,{recursive:true});const root=fs.mkdtempSync(path.join(os.tmpdir(),'writer-bridge-'));
const client=new Client({name:'app-bridge-qa',version:'0.1.0'},{capabilities:{}});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/main.js','--stdio'],env:{...process.env,WRITER_DATA_DIR:root},stderr:'pipe'}));
const open=await client.callTool({name:'writer_open',arguments:{}});const resource=await client.readResource({uri:'ui://author-writing/editor.html'});
const browser=await chromium.launch({executablePath:process.env.WRITER_CHROMIUM,headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--single-process','--no-zygote']});const page=await browser.newPage({viewport:{width:1440,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.clock.install();
 await page.exposeFunction('qaCallTool',params=>client.callTool(params));
 await page.goto(open.structuredContent.localUrl);await page.setContent('<!doctype html><html><body style="margin:0"><iframe id="editor" style="width:100vw;height:950px;border:0"></iframe></body></html>');
 await page.evaluate(({html,initial})=>{
   window.qaEvents=[];const iframe=document.getElementById('editor');
   window.addEventListener('message',async event=>{
     if(event.source!==iframe.contentWindow)return;const request=event.data;if(request?.jsonrpc!=='2.0')return;
     window.qaEvents.push({method:request.method,params:request.method==='ui/message'?request.params:undefined});
     const answer=result=>event.source.postMessage({jsonrpc:'2.0',id:request.id,result},'*');
     if(request.method==='ui/initialize')answer({protocolVersion:request.params.protocolVersion,hostInfo:{name:'verification-host-simulator',version:'0.1'},hostCapabilities:{serverTools:{},message:{text:{}},updateModelContext:{text:{}}},hostContext:{displayMode:'inline',availableDisplayModes:['inline','fullscreen'],theme:'light'}});
     else if(request.method==='ui/notifications/initialized')event.source.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:initial},'*');
     else if(request.method==='tools/call')answer(await window.qaCallTool(request.params));
     else if(request.method==='ui/message'||request.method==='ui/update-model-context')answer({});
     else if(request.method==='ui/request-display-mode')answer({mode:request.params.mode});
     else if(request.id!==undefined)event.source.postMessage({jsonrpc:'2.0',id:request.id,error:{code:-32601,message:'Unsupported'}},'*');
   });iframe.srcdoc=html;
 },{html:resource.contents[0].text,initial:open});
 const frame=page.frameLocator('#editor');await frame.getByText('GPT 窗口已连接',{exact:true}).waitFor();
 await frame.getByRole('button',{name:'新建小说',exact:true}).click();await frame.getByRole('textbox',{name:'新建小说',exact:true}).fill('宿主桥验证');await frame.getByRole('button',{name:'保存',exact:true}).click();
 const editor=frame.getByRole('textbox',{name:'小说正文'});await editor.fill('他推开门，站了一会儿。桌上有一只碗，碗边的水已经干了。他把碗挪到近处，没有抬头，等她说话。');await page.clock.runFor(1200);await frame.getByText('已存本机',{exact:true}).waitFor();
 await frame.getByRole('textbox',{name:'给 AI 的问题'}).fill('这个场景可以怎样表达得更清楚？');await frame.getByRole('button',{name:'发送 ↑',exact:true}).click();await frame.getByText('已提交给当前 GPT，回答会回到右侧。',{exact:true}).waitFor();
 const events=await page.evaluate(()=>window.qaEvents);assert.ok(events.some(e=>e.method==='ui/initialize'));assert.ok(events.some(e=>e.method==='tools/call'));assert.ok(events.some(e=>e.method==='ui/update-model-context'));assert.ok(events.some(e=>e.method==='ui/message'));
 const state=await client.callTool({name:'writer_ui',arguments:{action:'snapshot',args:{},clientKey:open._meta.clientKey}});const project=state._meta.writerState.database.projects[0];const queued=project.jobs[0];
 await client.callTool({name:'writer_ui',arguments:{action:'cancel',args:{jobId:queued.id,requestId:'cancel-for-proactive'},clientKey:open._meta.clientKey}});
 await page.clock.runFor(3000);await frame.getByRole('checkbox',{name:'停笔后给小建议'}).check();await editor.fill((await editor.inputValue())+'\n她放下抹布，问他要不要添水。');await page.clock.runFor(1200);await frame.getByText('已存本机',{exact:true}).waitFor();
 const before=(await page.evaluate(()=>window.qaEvents)).filter(e=>e.method==='ui/message').length;await page.clock.runFor(27000);assert.equal((await page.evaluate(()=>window.qaEvents)).filter(e=>e.method==='ui/message').length,before);
 await page.clock.runFor(8000);await frame.getByText(/等待 GPT 处理.*片段建议/).waitFor();await page.waitForFunction(()=>window.qaEvents.filter(e=>e.method==='ui/message').length===2);
 const after=await page.evaluate(()=>window.qaEvents);assert.equal(after.filter(e=>e.method==='ui/message').length,before+1);
 await frame.getByRole('button',{name:'全屏',exact:true}).click();assert.ok((await page.evaluate(()=>window.qaEvents)).some(e=>e.method==='ui/request-display-mode'));
 assert.deepEqual(errors,[]);const report={ok:true,verified:['官方 App SDK iframe 握手','通过 tools/call 操作真实本机 STDIO 服务','ui/update-model-context 和 ui/message 发送任务','新增段落停笔30秒前不自动请求，之后发起一次建议任务','全屏请求'],host:'simulator',actualChatGPTDesktopVerified:false,automaticModelInferenceVerified:false,errors};fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({ok:false,error:e.message,errors},null,2));throw e;}
finally{await browser.close();await client.close();}
