// Register a personal marketplace. Run on the author's computer; no credentials are read.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const profileArg=process.argv.indexOf('--profile');
const profile=profileArg>=0?path.resolve(process.argv[profileArg+1]):os.homedir();
const pluginsRoot=path.join(profile,'.codex','plugins');const target=path.join(pluginsRoot,'author-writing-local');
const catalogFile=path.join(profile,'.agents','plugins','marketplace.json');
const copyFolders=['dist','node_modules','skills'];const copyFiles=['plugin.json','mcp.json','package.json','package-lock.json'];
if(!fs.existsSync(path.join(source,'dist','main.js'))||!fs.existsSync(path.join(source,'node_modules','@modelcontextprotocol','sdk')))throw Error('请先完成依赖安装与构建，再运行安装脚本。');
let catalog={name:'author-personal',interface:{displayName:'我的写作工具'},plugins:[]};
if(fs.existsSync(catalogFile)){
  try{catalog=JSON.parse(fs.readFileSync(catalogFile,'utf8'));}catch{throw Error('现有个人插件目录无法读取；未覆盖，请先修复该 JSON。');}
  if(!catalog.name||!Array.isArray(catalog.plugins))throw Error('现有个人插件目录格式不支持；未覆盖。');
}
fs.mkdirSync(pluginsRoot,{recursive:true});
const temporary=target+'.install-'+Date.now();fs.mkdirSync(temporary,{recursive:true});
try{
 for(const name of copyFiles)fs.copyFileSync(path.join(source,name),path.join(temporary,name));
 for(const name of copyFolders)fs.cpSync(path.join(source,name),path.join(temporary,name),{recursive:true,dereference:true});
 const wiring=JSON.parse(fs.readFileSync(path.join(temporary,'mcp.json'),'utf8'));wiring.mcpServers['author-writing'].command=process.execPath;fs.writeFileSync(path.join(temporary,'mcp.json'),JSON.stringify(wiring,null,2)+'\n');
 const previous=target+'.previous';if(fs.existsSync(previous))fs.rmSync(previous,{recursive:true,force:true});
 if(fs.existsSync(target))fs.renameSync(target,previous);
 try{fs.renameSync(temporary,target);}catch(e){if(fs.existsSync(previous)&&!fs.existsSync(target))fs.renameSync(previous,target);throw e;}
 const entry={name:'author-writing',source:{source:'local',path:'./.codex/plugins/author-writing-local'},policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'},category:'Productivity'};
 catalog.plugins=catalog.plugins.filter(x=>x.name!=='author-writing');catalog.plugins.push(entry);
 fs.mkdirSync(path.dirname(catalogFile),{recursive:true});
 if(fs.existsSync(catalogFile))fs.copyFileSync(catalogFile,catalogFile+'.before-author-writing');
 fs.writeFileSync(catalogFile+'.tmp',JSON.stringify(catalog,null,2)+'\n');fs.renameSync(catalogFile+'.tmp',catalogFile);
 const fallback={command:process.execPath,args:[path.join(target,'dist','main.js'),'--stdio'],cwd:target};
 fs.writeFileSync(path.join(source,'桌面MCP备用配置.json'),JSON.stringify({mcpServers:{'author-writing':fallback}},null,2)+'\n');
 console.log('安装文件已准备。请完全退出并重启 ChatGPT 桌面端，在插件目录中选择“'+(catalog.interface?.displayName||catalog.name)+'”，安装“小说码字助手”。然后在新聊天中说：打开小说码字窗口。\n此脚本只准备本机文件；账户安装与窗口支持须在桌面端实际检查。\n如插件目录不可用，请按生成的“桌面MCP备用配置.json”在桌面设置的 MCP servers 中添加 STDIO。');
}finally{if(fs.existsSync(temporary))fs.rmSync(temporary,{recursive:true,force:true});}
