// Exercises the real local MCP service with synthetic data in an isolated folder.
import fs from 'node:fs';
import {rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const needed=['writer_open','writer_ui','writer_status','writer_next_request','writer_context','writer_sources','writer_read_chapter','writer_search','writer_read_memories','writer_complete'];
export async function runSelfCheck({root=source,output}={}){
 const report={application:'author-writing',version:JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,ok:false,nodeVersion:process.version,platform:process.platform,checks:[],usesApiKey:false,credentialsRead:false,authorManuscriptsRead:false,desktopAccountInstalled:false,desktopProactiveVerified:false};
 let client,temp;
 const step=async(name,fn)=>{try{await fn();report.checks.push({name,ok:true});}catch(e){report.checks.push({name,ok:false,code:e.code||'CHECK_FAILED'});throw e;}};
 try{
  await step('Node 版本与运行文件',()=>{if(Number(process.versions.node.split('.')[0])<22)throw Object.assign(Error(),{code:'NODE_UNSUPPORTED'});for(const p of ['dist/main.js','dist/editor.html','plugin.json','mcp.json'])if(!fs.existsSync(path.join(root,p)))throw Object.assign(Error(),{code:'FILE_MISSING'});});
  const [{Client},{StdioClientTransport}]=await Promise.all([import('@modelcontextprotocol/sdk/client/index.js'),import('@modelcontextprotocol/sdk/client/stdio.js')]);
  temp=fs.mkdtempSync(path.join(os.tmpdir(),'author-writing-selfcheck-'));
  const connect=async()=>{client=new Client({name:'author-writing-selfcheck',version:'0.1.1'},{capabilities:{}});await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(root,'dist/main.js'),'--stdio'],cwd:root,env:{...process.env,WRITER_DATA_DIR:temp},stderr:'pipe'}));};
  await step('启动真实本机 MCP 服务',connect);
  await step('10 个 MCP 工具',async()=>{const names=(await client.listTools()).tools.map(x=>x.name);if(needed.some(n=>!names.includes(n)))throw Object.assign(Error(),{code:'TOOLS_MISSING'});});
  await step('码字窗口资源',async()=>{const data=await client.readResource({uri:'ui://author-writing/editor.html'});if(data.contents[0].mimeType!=='text/html;profile=mcp-app'||!data.contents[0].text.includes('LOCAL_BOOT'))throw Object.assign(Error(),{code:'UI_RESOURCE_INVALID'});});
  let open;
  await step('本机 HTTP 页面',async()=>{open=await client.callTool({name:'writer_open',arguments:{}});const url=new URL(open.structuredContent.localUrl);if(url.hostname!=='127.0.0.1')throw Object.assign(Error(),{code:'HOST_INVALID'});const response=await fetch(url,{signal:AbortSignal.timeout(5000)});if(!response.ok||!(await response.text()).includes('__WRITER_LOCAL__'))throw Object.assign(Error(),{code:'HTTP_NOT_READY'});});
  const call=async(action,args)=>{const r=await client.callTool({name:'writer_ui',arguments:{action,args,clientKey:open._meta.clientKey}});if(r.isError)throw Object.assign(Error(),{code:'UI_OPERATION_FAILED'});return r._meta;};
  let id;
  await step('隔离测试工程的写入与重启恢复',async()=>{const data=await call('createProject',{name:'启动自检（合成测试）',requestId:randomUUID()});id=data.uiResult.id;await call('createChapter',{projectId:id,name:'测试章节',text:'这是启动自检用的合成测试正文。',requestId:randomUUID()});await client.close();client=undefined;await connect();const status=await client.callTool({name:'writer_status',arguments:{}});if(status.structuredContent.usesApiKey!==false||!status.structuredContent.projects.some(p=>p.id===id&&p.chapters===2))throw Object.assign(Error(),{code:'PERSISTENCE_FAILED'});});
  report.ok=true;
 }catch(e){if(!report.checks.some(c=>!c.ok))report.checks.push({name:'加载或连接运行依赖',ok:false,code:e.code||'DEPENDENCIES_OR_CONNECTION_FAILED'});}
 finally{if(client)try{await client.close();}catch{}if(temp)await rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
 if(output){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n','utf8');}
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const n=process.argv.indexOf('--output');const report=await runSelfCheck({output:n>=0?process.argv[n+1]:undefined});console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1;
}
