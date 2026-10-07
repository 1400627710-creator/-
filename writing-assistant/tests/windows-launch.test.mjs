// Runs actual cmd.exe and Windows PowerShell 5.1, never an emulation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
if(process.platform!=='win32')throw Error('Run this check on native Windows.');
const app=path.resolve(process.argv[2]||process.cwd()),temp=fs.mkdtempSync(path.join(os.tmpdir(),'作者 空格 启动测试-'));
const packageFile=path.resolve(process.argv[3]||'');
assert.ok(process.argv[3]&&fs.existsSync(packageFile),'Pass the final published ZIP as the second argument');
const copy=path.join(temp,'小说 码字窗口'),profile=path.join(temp,'安装 用户目录'),local=path.join(temp,'本机数据');
assert.equal(fs.statSync(app).isDirectory(),true,'Packaged app argument must be a directory');
fs.mkdirSync(copy,{recursive:true});
console.log(JSON.stringify({nativeFixture:true,app,copy,appFiles:fs.readdirSync(app)},null,2));
fs.cpSync(app,copy,{recursive:true,dereference:true,filter:()=>true});
fs.mkdirSync(local,{recursive:true});
assert.equal(fs.statSync(copy).isDirectory(),true,'Copied app directory missing');
assert.ok(fs.existsSync(path.join(copy,'START.cmd')),'Copied launcher missing');
const cwd=fs.realpathSync(copy);
const env={...process.env,LOCALAPPDATA:local,WRITER_NONINTERACTIVE:'1',WRITER_SKIP_NODE_INSTALL:'1',WRITER_INSTALL_PROFILE:profile,WRITER_NO_OPEN:'1'};
const cmd=path.join(process.env.SystemRoot||'C:\\Windows','System32','cmd.exe');
assert.ok(fs.existsSync(cmd),'Windows cmd.exe missing');
const baseline=spawnSync(cmd,['/d','/c','ver'],{cwd,encoding:'utf8',windowsVerbatimArguments:true});
if(baseline.error)throw baseline.error;
assert.equal(baseline.status,0,'Native cmd.exe baseline failed: '+baseline.stderr);
const run=(file,args=[],options={})=>{const r=spawnSync(cmd,['/d','/c',file,...args],{cwd,env,encoding:'utf8',timeout:90000,windowsVerbatimArguments:true,...options});if(r.error)throw r.error;return r;};
const passed=[];
async function checkLocalStart(testCwd=cwd,testEnv=env,label='正常 START.cmd 持续运行，真实本机窗口页面可访问'){
 const child=spawn(cmd,['/d','/c','START.cmd'],{cwd:testCwd,env:testEnv,stdio:['pipe','pipe','pipe'],windowsVerbatimArguments:true});
 let processError;child.on('error',e=>{processError=e;});
 let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>output+=chunk.toString('utf8'));
 try{
  const deadline=Date.now()+20000;let url;
  while(Date.now()<deadline&&!url){if(processError)throw processError;assert.equal(child.exitCode,null,'启动器提前退出：'+output);url=output.match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];if(!url)await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(url,'未输出可用的窗口地址：'+output);
  const response=await fetch(url,{signal:AbortSignal.timeout(5000)});assert.equal(response.status,200);assert.ok((await response.text()).includes('__WRITER_LOCAL__'));
  assert.equal(child.exitCode,null);passed.push(label);
 }finally{
  spawnSync('taskkill.exe',['/pid',String(child.pid),'/t','/f'],{encoding:'utf8'});
  if(child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,5000);});
 }
}
try{
 let r=run('START.cmd',['--check']);assert.equal(r.status,0,r.stdout+'\n'+r.stderr);assert.match(r.stdout,/Exit code: 0/);passed.push('START.cmd 在中文、空格目录完成真实服务检查');
 await checkLocalStart();
 r=run('DIAGNOSE.cmd');assert.equal(r.status,0,r.stdout+'\n'+r.stderr);const logs=path.join(local,'AuthorWriting','logs');assert.ok(fs.readdirSync(logs).some(n=>n.endsWith('.json')));passed.push('DIAGNOSE.cmd 留下本机自检报告');
 // Three installs exercise first install, backup, then removal of that backup.
 for(let n=0;n<3;n++){r=run('INSTALL-GPT.cmd');assert.equal(r.status,0,r.stdout+'\n'+r.stderr);}
 const installed=path.join(profile,'.codex','plugins','author-writing-local'),wiring=JSON.parse(fs.readFileSync(path.join(installed,'mcp.json'),'utf8'));
 assert.equal(wiring.mcpServers['author-writing'].command,path.join(installed,'runtime','node.exe'));
 r=spawnSync(wiring.mcpServers['author-writing'].command,[path.join(installed,'scripts','selfcheck.mjs')],{cwd:installed,env,encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stdout+'\n'+r.stderr);passed.push('中文目录连续安装三次，安装目录内 Node 与实际 MCP 自检通过');
 fs.renameSync(path.join(copy,'package-lock.json'),path.join(copy,'package-lock.held'));
 r=run('START.cmd');assert.equal(r.status,1);assert.match(r.stdout,/ARCHIVE_INCOMPLETE/);assert.match(r.stdout,/Exit code: 1/);passed.push('不完整解压明确显示错误与退出码');
 r=run('START.cmd',[],{env:{...env,WRITER_NONINTERACTIVE:''},input:'\r\n'});assert.equal(r.status,1);assert.match(r.stdout,/This window keeps the result/);passed.push('失败时保留窗口，按键后才退出');
 fs.renameSync(path.join(copy,'package-lock.held'),path.join(copy,'package-lock.json'));
 r=run('START.cmd',['--check'],{env:{...env,PATH:path.join(process.env.SystemRoot,'System32')}});assert.equal(r.status,0,r.stdout+'\n'+r.stderr);passed.push('不依赖系统 PATH 中的 Node 或 npm，完整包仍通过自检');
 // Reproduce the author's failure: only the CMD exists, no scripts beside it.
 const lone=path.join(temp,'仅有启动器 空格 & ! [1]'),cache=path.join(temp,'恢复 程序'),recoveryEnv={...env,WRITER_RECOVERY_DIR:cache};
 fs.mkdirSync(lone);fs.copyFileSync(path.join(copy,'START.cmd'),path.join(lone,'START.cmd'));
 r=run('START.cmd',['--check'],{cwd:lone,env:{...recoveryEnv,WRITER_PACKAGE_FILE:packageFile},timeout:180000});assert.equal(r.status,0,r.stdout+'\n'+r.stderr);assert.match(r.stdout,/RECOVERED/);
 const restored=fs.readFileSync(path.join(cache,'current.txt'),'utf8');assert.ok(fs.existsSync(path.join(restored,'runtime','node.exe')));passed.push('单独启动器自动解压最终 ZIP，真实 MCP、页面及重启保存检查通过');
 r=run('START.cmd',['--check'],{cwd:lone,env:recoveryEnv});assert.equal(r.status,0,r.stdout+'\n'+r.stderr);assert.doesNotMatch(r.stdout,/RECOVERED/);passed.push('下次点击单独启动器直接复用已恢复程序');
 await checkLocalStart(lone,recoveryEnv,'恢复后的单独启动器实际打开可访问的本机窗口服务');
 fs.copyFileSync(path.join(copy,'START.cmd'),path.join(path.dirname(app),'START.cmd'));
 r=run('START.cmd',['--check'],{cwd:path.dirname(app)});assert.equal(r.status,0,r.stdout+'\n'+r.stderr);passed.push('启动器放在解压根目录也能识别内层 author-writing 文件夹');
 const legacyZip=path.join(temp,'旧格式 完整包.zip'),unsafeZip=path.join(temp,'错误路径.zip');
 const fixture=spawnSync('python',['-c',`import sys,zipfile
with zipfile.ZipFile(sys.argv[1]) as source,zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED,compresslevel=1) as target:
 for entry in source.infolist(): target.writestr(entry.filename.replace('/',chr(92)),source.read(entry))
with zipfile.ZipFile(sys.argv[3],'w') as bad: bad.writestr('author-writing/../outside.txt','must not extract')
`,packageFile,legacyZip,unsafeZip],{encoding:'utf8',timeout:180000});assert.equal(fixture.status,0,fixture.stdout+'\n'+fixture.stderr);
 r=run('START.cmd',['--check'],{cwd:lone,env:{...recoveryEnv,WRITER_RECOVERY_DIR:path.join(temp,'旧包恢复'),WRITER_PACKAGE_FILE:legacyZip},timeout:180000});assert.equal(r.status,0,r.stdout+'\n'+r.stderr);assert.match(r.stdout,/RECOVERED/);passed.push('兼容旧版反斜杠 ZIP：单独启动器恢复并运行真实自检');
 r=run('START.cmd',['--check'],{cwd:lone,env:{...recoveryEnv,WRITER_PACKAGE_FILE:unsafeZip}});assert.equal(r.status,1);assert.match(r.stdout,/PACKAGE_INVALID/);assert.equal(fs.readFileSync(path.join(cache,'current.txt'),'utf8'),restored);assert.ok(!fs.existsSync(path.join(cache,'outside.txt')));passed.push('错误 ZIP 路径被拒绝，失败不覆盖已恢复程序');
 r=run('START.cmd',['--check'],{cwd:lone,env:{...recoveryEnv,WRITER_RECOVERY_DIR:path.join(temp,'未选择ZIP')}});assert.equal(r.status,1);assert.match(r.stdout,/ARCHIVE_INCOMPLETE/);passed.push('非交互检查未指定 ZIP 时明确报错，不弹出窗口或静默退出');
 console.log(JSON.stringify({ok:true,platform:'native-win32',passed,desktopAccountInstalled:false},null,2));
}finally{await rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
