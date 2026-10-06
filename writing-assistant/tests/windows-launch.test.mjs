// Runs actual cmd.exe and Windows PowerShell 5.1, never an emulation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
if(process.platform!=='win32')throw Error('Run this check on native Windows.');
const app=path.resolve(process.argv[2]||process.cwd()),temp=fs.mkdtempSync(path.join(os.tmpdir(),'作者 空格 启动测试-'));
const copy=path.join(temp,'小说 码字窗口'),profile=path.join(temp,'安装 用户目录'),local=path.join(temp,'本机数据');
fs.cpSync(app,copy,{recursive:true});
const env={...process.env,LOCALAPPDATA:local,WRITER_NONINTERACTIVE:'1',WRITER_SKIP_NODE_INSTALL:'1',WRITER_INSTALL_PROFILE:profile,WRITER_NO_OPEN:'1'};
const run=(file,args=[],options={})=>spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c','""'+path.join(copy,file)+'" '+args.join(' ')+'"'],{cwd:copy,env,encoding:'utf8',timeout:90000,...options});
const passed=[];
try{
 let r=run('START.cmd',['--check']);assert.equal(r.status,0,r.stdout+'\n'+r.stderr);assert.match(r.stdout,/Exit code: 0/);passed.push('START.cmd 在中文、空格目录完成真实服务检查');
 r=run('DIAGNOSE.cmd');assert.equal(r.status,0,r.stdout+'\n'+r.stderr);const logs=path.join(local,'AuthorWriting','logs');assert.ok(fs.readdirSync(logs).some(n=>n.endsWith('.json')));passed.push('DIAGNOSE.cmd 留下本机自检报告');
 r=run('INSTALL-GPT.cmd');assert.equal(r.status,0,r.stdout+'\n'+r.stderr);
 const installed=path.join(profile,'.codex','plugins','author-writing-local'),wiring=JSON.parse(fs.readFileSync(path.join(installed,'mcp.json'),'utf8'));
 assert.equal(wiring.mcpServers['author-writing'].command,path.join(installed,'runtime','node.exe'));
 r=spawnSync(wiring.mcpServers['author-writing'].command,[path.join(installed,'scripts','selfcheck.mjs')],{cwd:installed,env,encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stdout+'\n'+r.stderr);passed.push('完整包安装后使用安装目录内的 Node，实际 MCP 自检通过');
 fs.renameSync(path.join(copy,'package-lock.json'),path.join(copy,'package-lock.held'));
 r=run('START.cmd');assert.equal(r.status,1);assert.match(r.stdout,/ARCHIVE_INCOMPLETE/);assert.match(r.stdout,/Exit code: 1/);passed.push('不完整解压明确显示错误与退出码');
 r=run('START.cmd',[],{env:{...env,WRITER_NONINTERACTIVE:''},input:'\r\n'});assert.equal(r.status,1);assert.match(r.stdout,/This window keeps the result/);passed.push('失败时保留窗口，按键后才退出');
 fs.renameSync(path.join(copy,'package-lock.held'),path.join(copy,'package-lock.json'));
 r=run('START.cmd',['--check'],{env:{...env,PATH:path.join(process.env.SystemRoot,'System32')}});assert.equal(r.status,0,r.stdout+'\n'+r.stderr);passed.push('不依赖系统 PATH 中的 Node 或 npm，完整包仍通过自检');
 console.log(JSON.stringify({ok:true,platform:'native-win32',passed,desktopAccountInstalled:false},null,2));
}finally{fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
