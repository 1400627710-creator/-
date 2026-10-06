// A shared preflight for the visible Windows guardian and command-line launchers.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn, spawnSync} from 'node:child_process';

const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const required=['package.json','package-lock.json','scripts/setup.mjs','scripts/selfcheck.mjs','plugin.json','mcp.json'];
const modules=['@modelcontextprotocol/sdk/server/mcp.js','@modelcontextprotocol/ext-apps/server','zod'];
const failure=(code,message)=>Object.assign(new Error(message),{code});
export async function dependenciesReady(root){
 // Use a fresh child so a failed ESM import cannot stay cached after npm repairs it.
 const result=spawnSync(process.execPath,['--input-type=module','-e','await Promise.all('+JSON.stringify(modules)+'.map(name=>import(name)))'],{cwd:root,encoding:'utf8',timeout:15000,windowsHide:true});
 return result.status===0;
}
export function findNpm(node=process.execPath){
 const bin=path.dirname(node),candidates=[path.join(bin,'node_modules/npm/bin/npm-cli.js'),path.join(bin,'../lib/node_modules/npm/bin/npm-cli.js')];
 if(process.platform==='win32'){
  const r=spawnSync('where.exe',['npm.cmd'],{encoding:'utf8',windowsHide:true});
  for(const line of (r.stdout||'').trim().split(/\r?\n/).filter(Boolean))candidates.push(path.join(path.dirname(line),'node_modules/npm/bin/npm-cli.js'));
 }else{try{candidates.push(fs.realpathSync(path.join(bin,'npm')));}catch{}}
 return candidates.find(p=>fs.existsSync(p));
}
export function runProcess(executable,args,{cwd=source,log=console.log,logFile}={}){
 log('运行：'+path.basename(executable)+' '+args.map(x=>x===cwd?'[程序目录]':x).join(' '));
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{cwd,env:process.env,stdio:['inherit','pipe','pipe'],windowsHide:false});
  for(const [stream,target] of [[child.stdout,process.stdout],[child.stderr,process.stderr]])stream.on('data',chunk=>{target.write(chunk);if(logFile)fs.appendFileSync(logFile,chunk);});
  child.once('error',e=>reject(failure('PROCESS_START_FAILED','无法运行 '+path.basename(executable)+'：'+(e.code||'未知错误'))));
  child.once('close',(code,signal)=>code===0?resolve():reject(failure('PROCESS_FAILED','进程退出：'+path.basename(executable)+'，退出码 '+String(code)+', '+(signal||'无信号'))));
 });
}
export async function prepare({root=source,node=process.execPath,allowInstall=true,log=console.log,logFile}={}){
 const major=Number(process.versions.node.split('.')[0]);
 if(major<22)throw failure('NODE_UNSUPPORTED','当前 Node.js '+process.version+' 过旧，需要 22 或以上版本。');
 log('Node.js '+process.version+'；正在检查完整解压的程序文件。');
 const missing=required.filter(p=>!fs.existsSync(path.join(root,p)));
 if(missing.length)throw failure('ARCHIVE_INCOMPLETE','程序文件不完整，请完整解压最新版压缩包；缺少：'+missing.join(', '));
 const buildNeeded=!['dist/main.js','dist/editor.html'].every(p=>fs.existsSync(path.join(root,p)));
 let ready=await dependenciesReady(root);
 if(!ready||buildNeeded){
  if(!allowInstall)throw failure(buildNeeded?'BUILD_MISSING':'DEPENDENCIES_MISSING','运行文件或依赖不完整。');
  const npm=findNpm(node);if(!npm)throw failure('NPM_MISSING','Node.js 可用，但 npm 缺失。请使用 Windows 完整包，或重新安装 Node.js LTS。');
  log('正在修复运行依赖；第一次需要网络，不需要注册或模型 Key。');
  await runProcess(node,[npm,'ci',...(buildNeeded?[]:['--omit=dev']),'--ignore-scripts','--no-audit','--no-fund'],{cwd:root,log,logFile});
  if(buildNeeded)await runProcess(node,[path.join(root,'scripts/build.mjs')],{cwd:root,log,logFile});
  ready=await dependenciesReady(root);if(!ready)throw failure('DEPENDENCIES_INVALID','依赖安装后仍无法载入；具体错误已保留在启动日志。');
 }
 log('运行文件与依赖已通过检查。');
 return {root,node};
}
async function main(){
 const folder=path.join(process.env.LOCALAPPDATA||os.homedir(),process.env.LOCALAPPDATA?'AuthorWriting':'.author-writing','logs');
 let logFile=process.env.WRITER_LAUNCH_LOG;
 if(!logFile){try{fs.mkdirSync(folder,{recursive:true});logFile=path.join(folder,'launcher-'+Date.now()+'-'+process.pid+'.txt');}catch{logFile=path.join(os.tmpdir(),'author-writing-launcher-'+Date.now()+'-'+process.pid+'.txt');}}
 fs.mkdirSync(path.dirname(logFile),{recursive:true});
 const log=s=>{const line='['+new Date().toISOString()+'] '+s;console.log(line);fs.appendFileSync(logFile,line+'\n','utf8');};
 try{
  log('小说码字助手启动检查。日志：'+logFile);
  await prepare({log,logFile});
  const check=process.argv.includes('--check')||process.argv.includes('--install');
  if(check){
   const {runSelfCheck}=await import('./selfcheck.mjs');
   const reportFile=path.join(path.dirname(logFile),'selfcheck-'+Date.now()+'-'+process.pid+'.json');
   const report=await runSelfCheck({root:source,output:reportFile});
   for(const item of report.checks)log((item.ok?'通过：':'失败：')+item.name+(item.code?' ['+item.code+']':''));
   log('诊断报告：'+reportFile);
   if(!report.ok)throw failure('SELF_CHECK_FAILED','本机启动自检未通过，请提供诊断报告中的错误码。');
  }
  if(process.argv.includes('--install')){
   const args=[path.join(source,'scripts/setup.mjs')];if(process.env.WRITER_INSTALL_PROFILE)args.push('--profile',process.env.WRITER_INSTALL_PROFILE);
   await runProcess(process.execPath,args,{log,logFile});
  }else if(!check){
   log('正在打开码字窗口。终端会保持运行，请从正文窗口导出备份后再关闭。');
   await runProcess(process.execPath,[path.join(source,'dist/main.js'),'--local',...(process.env.WRITER_NO_OPEN==='1'?['--no-open']:[])],{log,logFile});
   log('本次启动进程已结束。若已有服务运行，码字窗口由原服务提供。');
  }
 }catch(e){log('失败 ['+(e.code||'LAUNCH_FAILED')+']：'+e.message);process.exitCode=1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
