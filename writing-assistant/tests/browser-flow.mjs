import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const playwright=await import(process.env.WRITER_PLAYWRIGHT||'playwright');
const out=path.resolve('test-results/browser');fs.mkdirSync(out,{recursive:true});
const root=fs.mkdtempSync(path.join(os.tmpdir(),'writer-browser-'));
const client=new Client({name:'browser-qa',version:'0.1.0'},{capabilities:{}});
const transport=new StdioClientTransport({command:process.execPath,args:['dist/main.js','--stdio'],env:{...process.env,WRITER_DATA_DIR:root},stderr:'pipe'});
await client.connect(transport);
const open=await client.callTool({name:'writer_open',arguments:{}});const key=open._meta.clientKey;
const tool=async(name,args={})=>{const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,JSON.stringify(r.content));return r;};
const author=async(action,args={})=>(await tool('writer_ui',{action,args:{requestId:randomUUID(),...args},clientKey:key}))._meta;
const browser=await playwright.chromium.launch({executablePath:process.env.WRITER_CHROMIUM,headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--single-process','--no-zygote']});
const page=await browser.newPage({viewport:{width:1440,height:950},acceptDownloads:true});const errors=[];const passed=[];
page.on('pageerror',e=>errors.push(e.message));
const prose='程砚把湿伞靠在门边。屋里没有点灯，桌上的茶已经凉了。他摸到椅背，坐下来，坐在那里。阿禾从灶间出来，问他为什么来迟。他说桥口在查路引。他不知道阿禾已把信交给账房。\n阿禾把一只干碗放到他面前，没有再问。';
try{
 await page.goto(open.structuredContent.localUrl);await page.getByRole('button',{name:'新建小说',exact:true}).waitFor();
 if(process.env.WRITER_QA_FONT){
   const fontRoot=process.env.WRITER_QA_FONT;
   await page.route('**/qa-font/*',route=>route.fulfill({body:fs.readFileSync(path.join(fontRoot,'files',path.basename(new URL(route.request().url()).pathname))),contentType:'font/woff2'}));
   const css=fs.readFileSync(path.join(fontRoot,'400.css'),'utf8').replace(/url\(([^)]+)\)/g,(_,file)=>`url("${open.structuredContent.localUrl}qa-font/${path.basename(file.replace(/["']/g,''))}")`);
   await page.addStyleTag({content:css+'*{font-family:"Noto Sans SC",sans-serif!important}'});
 }
 await page.getByRole('button',{name:'新建小说',exact:true}).click();await page.getByRole('textbox',{name:'新建小说',exact:true}).fill('浏览器流程原稿');await page.getByRole('button',{name:'保存',exact:true}).click();
 const editor=page.getByRole('textbox',{name:'小说正文',exact:true});await editor.waitFor();await editor.fill(prose);await page.getByText('已存本机',{exact:true}).waitFor();
 let state=(await author('snapshot')).writerState;let project=state.database.projects[0],chapter=project.chapters[0];assert.equal(chapter.text,prose);passed.push('界面新建小说、正文输入与自动存稿');
 await editor.evaluate(el=>{el.focus();el.setSelectionRange(28,43);el.dispatchEvent(new Event('select',{bubbles:true}));});
 await page.getByRole('button',{name:'润色',exact:true}).click();await page.getByRole('textbox',{name:'给 AI 的问题'}).fill('只去重复，保留原意，不增加修辞。');await page.getByRole('button',{name:'发送 ↑',exact:true}).click();
 await page.getByText(/等待 GPT 处理/).waitFor();const next=(await tool('writer_next_request')).structuredContent.request;const ctx=(await tool('writer_context',{jobId:next.jobId})).structuredContent;
 assert.equal(ctx.job.original,prose.slice(28,43));
 const originalReply=JSON.parse(fs.readFileSync(process.env.WRITER_MODEL_REPLY||'tests/fixtures/host-polish-reply.json','utf8')).reply;
 const reply=structuredClone(originalReply);for(const m of reply.memories)for(const e of m.evidence)e.chapterId=chapter.id;
 await tool('writer_complete',{jobId:next.jobId,reply});await page.getByRole('button',{name:'采纳选段',exact:true}).waitFor();assert.equal(await editor.inputValue(),prose);passed.push('窗口请求经真实 STDIO 协议读取，候选显示且未自动改稿');
 if(await page.getByRole('button',{name:'关闭',exact:true}).count())await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.screenshot({path:path.join(out,'writing-window.png'),fullPage:true});
 await page.getByRole('button',{name:'采纳选段',exact:true}).click();const expected=prose.slice(0,28)+reply.replacement+prose.slice(43);await page.waitForFunction(expected=>document.querySelector('textarea[aria-label="小说正文"]').value===expected,expected);assert.equal(await editor.inputValue(),expected);passed.push('作者采纳只修改选区');
 await page.getByRole('button',{name:'↶ 撤销',exact:true}).click();await page.waitForFunction(prose=>document.querySelector('textarea[aria-label="小说正文"]').value===prose,prose);await page.getByRole('button',{name:'↷ 重做',exact:true}).click();await page.waitForFunction(expected=>document.querySelector('textarea[aria-label="小说正文"]').value===expected,expected);passed.push('界面撤销与重做');
 await page.getByRole('button',{name:/依据与记忆/}).click();await page.getByRole('button',{name:'纠正',exact:true}).click();await page.getByRole('textbox',{name:'指出错误并写出正确依据'}).fill('程砚只知道阿禾收到了信，还不知道信的去向。');await page.getByRole('button',{name:'保存',exact:true}).click();
 await page.getByText('待你确认',{exact:true}).waitFor();state=(await author('snapshot')).writerState;assert.equal(state.database.projects[0].memories.filter(m=>m.status==='confirmed').length,0);
 await page.getByRole('button',{name:'确认依据',exact:true}).click();await page.getByText('已确认',{exact:true}).waitFor();passed.push('界面纠错停用旧项、修正等待确认、确认正式依据');
 let download=page.waitForEvent('download');await page.getByRole('button',{name:'批量导出',exact:true}).click();let file=await download;await file.saveAs(path.join(out,'batch.txt'));assert.ok(fs.readFileSync(path.join(out,'batch.txt'),'utf8').includes(expected));passed.push('批量文本导出');
 download=page.waitForEvent('download');await page.getByRole('button',{name:'备份工程',exact:true}).click();file=await download;const backupFile=path.join(out,'backup.json');await file.saveAs(backupFile);
 await page.locator('input[type=file]').nth(1).setInputFiles(backupFile);await page.getByRole('button',{name:/浏览器流程原稿（恢复）/}).waitFor();state=(await author('snapshot')).writerState;assert.equal(state.database.projects.length,2);assert.equal(state.database.projects[1].chapters[0].text,expected);passed.push('本机备份导出与恢复独立工程');
 await page.getByRole('button',{name:'交流',exact:true}).click();await page.getByRole('button',{name:'问 AI',exact:true}).click();await page.getByRole('textbox',{name:'给 AI 的问题'}).fill('他此时能否说出信的去向？');await page.getByRole('button',{name:'发送 ↑',exact:true}).click();await page.getByRole('button',{name:'导出请求',exact:true}).waitFor();
 download=page.waitForEvent('download');await page.getByRole('button',{name:'导出请求',exact:true}).click();file=await download;const requestFile=path.join(out,'file-request.json');await file.saveAs(requestFile);const packet=JSON.parse(fs.readFileSync(requestFile,'utf8'));assert.equal(packet.format,'author-writing-request');assert.ok(!JSON.stringify(packet).includes(key));
 const fileReply={format:'author-writing-reply',schema:1,jobId:packet.context.job.id,rev:packet.context.job.rev,memoryRev:packet.context.job.memoryRev,branch:packet.context.job.branch,reply:{kind:'answer',message:'界面文件往返的结构验证用回复；正式人物理解需由当前 GPT 根据请求包给出。',reasons:[],questions:[],evidenceIds:[],memories:[]}};
 const replyFile=path.join(out,'file-reply.json');fs.writeFileSync(replyFile,JSON.stringify(fileReply));await page.locator('input[type=file]').nth(2).setInputFiles(replyFile);await page.getByText(fileReply.reply.message,{exact:true}).waitFor();passed.push('网页文件接力的导出、导入与版本校验');
 await page.reload();await editor.waitFor();assert.equal(await editor.inputValue(),expected);passed.push('页面重开恢复本机存稿');
 await page.setViewportSize({width:900,height:780});await page.screenshot({path:path.join(out,'narrow-window.png'),fullPage:true});
 assert.deepEqual(errors,[]);passed.push('无浏览器脚本异常');
 const response=await page.request.post(open.structuredContent.localUrl+'ui',{headers:{'Content-Type':'application/json','Origin':'https://foreign.example','X-Writer-Client':key},data:{action:'snapshot',args:{}}});assert.equal(response.status(),403);passed.push('外部网页来源被本机服务拒绝');
 const report={ok:true,passed,errors,modelFixture:'首个当前 GPT 实际润色回复；本脚本回放用于 UI 验证，不声称本次脚本执行模型推理。',desktopHostInstallationVerified:false};fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({ok:false,passed,error:e.message,errors},null,2));await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw e;}
finally{await browser.close();await client.close();}
