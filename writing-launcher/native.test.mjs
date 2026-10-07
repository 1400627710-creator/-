import assert from 'node:assert/strict';
import fs from 'node:fs';
import {rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
if(process.platform!=='win32')throw Error('Run on native Windows.');
const [exe,app,zip]=process.argv.slice(2).map(p=>path.resolve(p));
assert.ok(exe&&app&&zip);
assert.equal(fs.readFileSync(exe).subarray(0,2).toString(),'MZ');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'作者 EXE 启动-'));
const lone=path.join(temp,'单独入口 & ! [1]'),local=path.join(temp,'本机数据 & !'),cache=path.join(temp,'恢复 程序');
fs.mkdirSync(lone);fs.mkdirSync(local);
const standalone=path.join(lone,'START.exe'),bundled=path.join(app,'START.exe');
fs.copyFileSync(exe,standalone);fs.copyFileSync(exe,bundled);
const env={...process.env,LOCALAPPDATA:local,WRITER_NONINTERACTIVE:'1',WRITER_SKIP_NODE_INSTALL:'1',WRITER_NO_OPEN:'1',WRITER_RECOVERY_DIR:cache};
const run=(entry,args=[],extra={})=>{const r=spawnSync(entry,args,{cwd:path.dirname(entry),env:{...env,...extra},encoding:'utf8',timeout:180000});if(r.error)throw r.error;return r;};
const passed=[];
try{
 let r=run(bundled,['--check']);assert.equal(r.status,0,r.stdout+'\n'+r.stderr);assert.match(r.stdout,/Exit code: 0/);passed.push('EXE 在完整程序目录运行实际 MCP、HTTP 页面和持久化自检');
 assert.deepEqual(fs.readdirSync(lone),['START.exe']);
 r=run(standalone,['--check'],{WRITER_PACKAGE_FILE:zip});assert.equal(r.status,0,r.stdout+'\n'+r.stderr);assert.match(r.stdout,/RECOVERED/);passed.push('只有 EXE 的中文空格及特殊字符目录，自动解压完整 ZIP 并运行真实自检');
 const pointer=fs.readFileSync(path.join(cache,'current.txt'),'utf8');
 r=run(standalone,['--diagnose']);assert.equal(r.status,0,r.stdout+'\n'+r.stderr);assert.doesNotMatch(r.stdout,/RECOVERED/);passed.push('再次点击入口复用已恢复程序，诊断报告正常生成');
 const child=spawn(standalone,[],{cwd:lone,env,stdio:['pipe','pipe','pipe']});
 let output='',failure;child.on('error',e=>failure=e);for(const stream of [child.stdout,child.stderr])stream.on('data',b=>output+=b.toString('utf8'));
 try{
  let url;const deadline=Date.now()+30000;
  while(Date.now()<deadline&&!url){if(failure)throw failure;assert.equal(child.exitCode,null,output);url=output.match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];if(!url)await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(url,'EXE 没有启动窗口服务：'+output);
  const response=await fetch(url,{signal:AbortSignal.timeout(5000)});assert.equal(response.status,200);assert.ok((await response.text()).includes('__WRITER_LOCAL__'));assert.equal(child.exitCode,null);passed.push('EXE 正常启动后服务持续运行，真实码字页面可访问');
 }finally{
  if(child.pid)spawnSync('taskkill.exe',['/pid',String(child.pid),'/t','/f'],{encoding:'utf8'});
  if(child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,5000);});
 }
 // Exercise the actual double-click branch: a GUI EXE with no inherited console.
 const guiData=path.join(temp,'默认 GUI 本机数据'),connect=path.join(guiData,'connect.json');
 const gui=spawn(bundled,[],{cwd:app,env:{...env,WRITER_NONINTERACTIVE:'',WRITER_DATA_DIR:guiData},stdio:'ignore'});
 let guiError;gui.on('error',e=>guiError=e);
 try{
  const deadline=Date.now()+30000;
  while(Date.now()<deadline&&!fs.existsSync(connect)){if(guiError)throw guiError;assert.equal(gui.exitCode,null,'默认 GUI 入口提前退出');await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(fs.existsSync(connect),'默认 GUI 入口未建立本机服务');
  const address=JSON.parse(fs.readFileSync(connect,'utf8')).url;
  const response=await fetch(address,{signal:AbortSignal.timeout(5000)});assert.equal(response.status,200);assert.ok((await response.text()).includes('__WRITER_LOCAL__'));assert.equal(gui.exitCode,null);passed.push('默认双击模式没有继承控制台，仍建立持续可访问的码字服务');
 }finally{
  if(gui.pid)spawnSync('taskkill.exe',['/pid',String(gui.pid),'/t','/f'],{encoding:'utf8'});
  if(gui.exitCode===null)await new Promise(resolve=>{gui.once('exit',resolve);setTimeout(resolve,5000);});
 }
 r=run(standalone,['--check'],{WRITER_PACKAGE_FILE:path.join(temp,'不存在.zip')});assert.equal(r.status,1);assert.match(r.stdout,/PACKAGE_NOT_FOUND/);assert.equal(fs.readFileSync(path.join(cache,'current.txt'),'utf8'),pointer);passed.push('错误选包时保留退出码与错误信息，不覆盖已恢复程序');
 r=run(standalone,['--unknown']);assert.equal(r.status,1);assert.match(r.stderr,/LAUNCHER_ERROR/);passed.push('入口只接受规定参数，明确报告启动参数错误');
 console.log(JSON.stringify({ok:true,platform:'native-win32',launcher:'native-exe',passed,authorComputerOperated:false},null,2));
}finally{await rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
