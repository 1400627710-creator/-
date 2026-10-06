import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';
test('安装目录合并保留其他插件，重复安装幂等，生成真实 Node 路径',()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'writer-setup-')),catalogFile=path.join(profile,'.agents','plugins','marketplace.json');fs.mkdirSync(path.dirname(catalogFile),{recursive:true});
 const other={name:'existing-plugin',source:{source:'local',path:'./plugins/other'},category:'Productivity',policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'}};
 fs.writeFileSync(catalogFile,JSON.stringify({name:'existing-personal',interface:{displayName:'已有工具'},plugins:[other]}));
 for(let n=0;n<2;n++){const result=spawnSync(process.execPath,['scripts/setup.mjs','--profile',profile],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);}
 const catalog=JSON.parse(fs.readFileSync(catalogFile,'utf8'));assert.equal(catalog.name,'existing-personal');assert.equal(catalog.plugins.length,2);assert.deepEqual(catalog.plugins[0],other);
 const wiring=JSON.parse(fs.readFileSync(path.join(profile,'.codex','plugins','author-writing-local','mcp.json'),'utf8'));assert.equal(wiring.mcpServers['author-writing'].command,process.execPath);assert.ok(fs.existsSync(catalogFile+'.before-author-writing'));
});
