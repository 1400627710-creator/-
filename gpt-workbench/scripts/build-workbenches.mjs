import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {copyFileSync} from 'node:fs';
const root=fileURLToPath(new URL('../',import.meta.url));
function run(command,args,cwd=root){const r=spawnSync(command,args,{cwd,stdio:'inherit',shell:process.platform==='win32'});if(r.status!==0)process.exit(r.status||1);}
run('npm',['run','build:local'],root+'cardstudio');
run(process.execPath,['novel-archive/build-local.mjs']);
copyFileSync(root+'cardstudio/local/dist/CardStudio-Local.html',root+'cardstudio/CardStudio-Local.html');
console.log('卡递与车卡机入口已更新。');
