import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {prepare,dependenciesReady} from '../scripts/launcher.mjs';
test('完整包以真实导入检查依赖，自检启动、页面和重启保存通过',async()=>{
 assert.equal(await dependenciesReady(process.cwd()),true);
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'writer-launch-test-')),log=path.join(folder,'launch.txt');
 const r=spawnSync(process.execPath,['scripts/launcher.mjs','--check'],{cwd:process.cwd(),encoding:'utf8',timeout:30000,env:{...process.env,WRITER_LAUNCH_LOG:log}});
 assert.equal(r.status,0,r.stdout+'\n'+r.stderr);
 assert.match(fs.readFileSync(log,'utf8'),/诊断报告/);
 const report=JSON.parse(fs.readFileSync(path.join(folder,fs.readdirSync(folder).find(n=>n.endsWith('.json'))),'utf8'));
 assert.equal(report.ok,true);assert.equal(report.authorManuscriptsRead,false);assert.equal(report.desktopAccountInstalled,false);
 fs.rmSync(folder,{recursive:true,force:true,maxRetries:5,retryDelay:100});
});
test('只提取启动器或缺少文件时返回明确错误，不在其他目录安装依赖',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'writer-partial-'));
 await assert.rejects(prepare({root,log:()=>{}}),e=>e.code==='ARCHIVE_INCOMPLETE');
 assert.deepEqual(fs.readdirSync(root),[]);fs.rmSync(root,{recursive:true,force:true});
});
test('存在 SDK 目录但运行依赖缺失时仍被识别，避免错误跳过修复',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'writer-broken-deps-'));
 for(const p of ['package.json','package-lock.json','scripts/setup.mjs','scripts/selfcheck.mjs','plugin.json','mcp.json','dist/main.js','dist/editor.html']){fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),p==='package.json'?'{}':'');}
 fs.mkdirSync(path.join(root,'node_modules/@modelcontextprotocol/sdk'),{recursive:true});
 await assert.rejects(prepare({root,allowInstall:false,log:()=>{}}),e=>e.code==='DEPENDENCIES_MISSING');
 fs.rmSync(root,{recursive:true,force:true});
});
