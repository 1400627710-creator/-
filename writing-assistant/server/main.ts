import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Store, atomicWrite } from './store.js';
import { Service, errorInfo } from './service.js';
import { createMcp } from './mcp.js';
import { localServer } from './http.js';

const base=path.dirname(fileURLToPath(import.meta.url));
const dataRoot=path.resolve(process.env.WRITER_DATA_DIR||path.join(process.env.LOCALAPPDATA||os.homedir(),process.env.LOCALAPPDATA?'AuthorWriting':'.author-writing'));
const lockFile=path.join(dataRoot,'service.lock');const connectFile=path.join(dataRoot,'connect.json');
function open(url:string) {
  const p=process.platform==='win32'?spawn('rundll32',['url.dll,FileProtocolHandler',url],{detached:true,stdio:'ignore'}):spawn(process.platform==='darwin'?'open':'xdg-open',[url],{detached:true,stdio:'ignore'});
  p.on('error',()=>console.error('请打开 '+url));p.unref();
}
async function main() {
  fs.mkdirSync(dataRoot,{recursive:true,mode:0o700});
  if(fs.existsSync(lockFile)){
    let alive=false;
    try{const lock=JSON.parse(fs.readFileSync(lockFile,'utf8'));process.kill(lock.pid,0);alive=true;}catch(e:any){if(e.code==='EPERM')alive=true;}
    if(alive){
      if(process.argv.includes('--stdio'))throw new Error('LOCAL_SERVICE_BUSY');
      const info=JSON.parse(fs.readFileSync(connectFile,'utf8'));console.log('窗口地址：'+info.url);if(!process.argv.includes('--no-open'))open(info.url);return;
    }
    fs.unlinkSync(lockFile);
  }
  const fd=fs.openSync(lockFile,'wx',0o600);fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));fs.closeSync(fd);
  let server:Awaited<ReturnType<typeof localServer>>|undefined;
  let mcp:ReturnType<typeof createMcp>|undefined;
  const cleanup=()=>{try{fs.unlinkSync(lockFile);}catch{}try{fs.unlinkSync(connectFile);}catch{}};
  process.once('exit',cleanup);
  for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{server?.close();void mcp?.close();cleanup();process.exit(0);});
  const store=new Store(dataRoot),service=new Service(store);
  server=await localServer(service,path.join(base,'editor.html'));
  atomicWrite(connectFile,JSON.stringify({pid:process.pid,url:service.localUrl}));
  if(process.argv.includes('--stdio')){
    mcp=createMcp(service,path.join(base,'editor.html'));await mcp.connect(new StdioServerTransport());
    process.stdin.once('end',()=>{server?.close();cleanup();process.exit(0);});
  } else {
    console.log('小说码字助手已启动。窗口地址：'+service.localUrl+'\n本机存稿位置：'+dataRoot+'\n关闭本终端前请导出备份。GPT 连接由桌面 ChatGPT 插件提供。');
    if(!process.argv.includes('--no-open'))open(service.localUrl);
  }
}
main().catch(e=>{console.error(e instanceof Error&&e.message==='LOCAL_SERVICE_BUSY'?'编辑服务已运行。请关闭独立服务后重启 ChatGPT MCP 连接。':errorInfo(e).message);process.exitCode=1;});
