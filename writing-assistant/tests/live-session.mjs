// Interactive SDK client used for genuine current-model end-to-end verification.
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import {randomUUID} from 'node:crypto';
const out=path.resolve(process.argv[2]||'test-results/live');fs.mkdirSync(out,{recursive:true});
const data=fs.mkdtempSync(path.join(os.tmpdir(),'author-writing-live-'));
const transport=new StdioClientTransport({command:process.execPath,args:['dist/main.js','--stdio'],env:{...process.env,WRITER_DATA_DIR:data},stderr:'pipe'});
const client=new Client({name:'author-writing-verification',version:'0.1.0'},{capabilities:{}});
await client.connect(transport);const open=await client.callTool({name:'writer_open',arguments:{}});
const key=open._meta.clientKey;
const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});if(r.isError)throw Error(r.content[0].text);return r;};
const ui=async(action,args={})=>(await call('writer_ui',{action,args:{requestId:randomUUID(),...args},clientKey:key}))._meta;
const items=(await client.listTools()).tools;const resource=await client.readResource({uri:'ui://author-writing/editor.html'});
console.log(JSON.stringify({ready:true,url:open.structuredContent.localUrl,output:out,toolCount:items.length,uiResource:resource.contents[0].mimeType}));
fs.writeFileSync(path.join(out,'session.json'),JSON.stringify({url:open.structuredContent.localUrl,dataRoot:data,toolNames:items.map(x=>x.name)},null,2));
const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
for await(const line of rl){
 try{
  const input=JSON.parse(line);let result;
  if(input.op==='create'){
    const p=await ui('createProject',{name:input.name||'演示原稿'});const projectId=p.uiResult.id;
    const chapter=p.writerState.database.projects.find(p=>p.id===projectId).chapters[0];
    const saved=await ui('save',{projectId,chapterId:chapter.id,baseRev:chapter.rev,text:input.text});
    result={projectId,chapterId:chapter.id,rev:saved.uiResult.rev};
  }else if(input.op==='request'){
    const state=(await ui('snapshot')).writerState.database;const p=state.projects.find(p=>p.id===input.projectId),c=p.chapters.find(c=>c.id===input.chapterId);
    const r=await ui('request',{projectId:p.id,chapterId:c.id,baseRev:c.rev,selection:input.selection,prompt:input.prompt,mode:input.mode,automatic:false});
    const jobId=r.uiResult.jobId;const ctx=await call('writer_context',{jobId});
    const packet={format:'author-writing-request',schema:1,context:ctx.structuredContent};const file=path.join(out,input.file||'request.json');fs.writeFileSync(file,JSON.stringify(packet,null,2));result={jobId,file,mode:input.mode};
  }else if(input.op==='next'){
    const next=(await call('writer_next_request')).structuredContent.request;
    if(!next)result={request:null};else{
      const ctx=await call('writer_context',{jobId:next.jobId});const file=path.join(out,input.file||'request.json');fs.writeFileSync(file,JSON.stringify({format:'author-writing-request',schema:1,context:ctx.structuredContent},null,2));result={...next,file};
    }
  }else if(input.op==='complete'){
    const packet=JSON.parse(fs.readFileSync(input.file,'utf8'));const r=await call('writer_complete',{jobId:packet.jobId,reply:packet.reply});result=r.structuredContent;
  }else if(input.op==='ui'){
    const r=await ui(input.action,input.args);result=r.uiResult;
    if(input.stateFile)fs.writeFileSync(input.stateFile,JSON.stringify(r.writerState,null,2));
  }else if(input.op==='snapshot'){
    const r=await ui('snapshot');const file=path.join(out,input.file||'state.json');fs.writeFileSync(file,JSON.stringify(r.writerState,null,2));result={file,projects:r.writerState.database.projects.map(p=>({id:p.id,name:p.name,chapters:p.chapters.map(c=>({id:c.id,name:c.name,rev:c.rev,length:c.text.length})),jobs:p.jobs.map(j=>({id:j.id,status:j.status,kind:j.result?.kind})),memoryCount:p.memories.length})),modelCompleted:r.writerState.modelConnection.completedRequests};
  }else if(input.op==='close'){await client.close();console.log(JSON.stringify({ok:true,closed:true}));break;}
  else throw Error('Unknown operation');
  console.log(JSON.stringify({ok:true,result}));
 }catch(e){console.log(JSON.stringify({ok:false,error:e.message}));}
}
await client.close();
