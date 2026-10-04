import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import '../card-studio-community/glossary-format.js';

const format=globalThis.CARDSTUDIO_GLOSSARY;
const directory=path.dirname(fileURLToPath(import.meta.url));
const community=path.resolve(directory,'../card-studio-community');
const files=[path.join(directory,'glossary.json'),path.join(community,'shared-glossary.json'),path.join(community,'glossary-data.js')];
const argument=process.argv[2];
async function readPack(file){
  if((await fs.stat(file)).size>format.MAX_BYTES)throw new Error('词条文件超过 5MB');
  return format.normalizePack(JSON.parse(await fs.readFile(file,'utf8')));
}

if(argument==='--check'){
  const published=await readPack(files[0]),online=await readPack(files[1]);
  const sandbox={window:{}};
  vm.runInNewContext(await fs.readFile(files[2],'utf8'),sandbox,{timeout:1000});
  const offline=format.normalizePack(sandbox.window.CARDSTUDIO_SHARED_GLOSSARY);
  const canonical=JSON.stringify(published);
  if(canonical!==JSON.stringify(online)||canonical!==JSON.stringify(offline))throw new Error('仓库、在线与离线词条快照不同步');
  console.log(`两版词条仓库快照一致：${published.terms.length} 个词条。`);
}else if(argument){
  const pack=await readPack(path.resolve(argument));
  const json=JSON.stringify(pack),script='window.CARDSTUDIO_SHARED_GLOSSARY = '+json.replaceAll('<','\\u003c')+';\n';
  const contents=[json,json,script];
  // Validate all input before changing any published snapshot. Git commits group the three output files.
  for(let i=0;i<files.length;i++){
    const temporary=files[i]+'.'+process.pid+'.tmp';
    try{await fs.writeFile(temporary,contents[i]);await fs.rename(temporary,files[i])}finally{await fs.unlink(temporary).catch(()=>{})}
  }
  console.log(`已同步 ${pack.terms.length} 个词条到仓库、在线 JSON 与离线快照。`);
}else{
  console.error('用法：node shared-glossary/sync-glossary.mjs 已审核的词条文件.json；核对：node shared-glossary/sync-glossary.mjs --check');
  process.exitCode=1;
}
