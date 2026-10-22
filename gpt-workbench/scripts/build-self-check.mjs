import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Script} from 'node:vm';
import {build} from '../cardstudio/node_modules/vite/dist/node/index.js';
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.argv[2]||root+'checks';mkdirSync(out,{recursive:true});
const result=await build({configFile:false,root:root+'cardstudio',publicDir:false,logLevel:'warn',build:{write:false,lib:{entry:root+'cardstudio/local/self-check.mjs',name:'LocalChecks',formats:['iife']},minify:false}});
const bootstrap=js=>`(()=>{const s=document.createElement('script');s.textContent=new TextDecoder().decode(Uint8Array.from(atob('${Buffer.from(js).toString('base64')}'),c=>c.charCodeAt(0)));document.head.append(s)})();`;
const page=(title,js)=>`<!doctype html><meta charset="utf-8"><title>${title}</title><style>body{font:15px/1.8 system-ui;padding:24px;max-width:1000px;margin:auto;background:#f6f5f9;color:#352e45}li{padding:6px}#summary{font-size:19px;font-weight:bold}</style><h1>${title}</h1><p>所有写入都使用独立的合成测试资料库。</p><div id="summary">正在检查…</div><ol id="checks"></ol><script>${bootstrap(js)}</script>`;
writeFileSync(out+'/cardstudio-check.html',page('卡递 · 本机存储自检',(Array.isArray(result)?result[0]:result).output.find(x=>x.type==='chunk').code));
const html=readFileSync(root+'novel-archive/src/index.html','utf8');
let core=html.slice(html.indexOf('const ArchiveCore ='),html.indexOf('const TextImporter ='));
let storage=html.slice(html.indexOf('const ArchiveStorage ='),html.indexOf('const PngExporter ='));
storage=storage.replace("'novel-archive-studio-v1'","'novel-archive-isolated-qa-'+Date.now()").replace("'novel-archive-studio-workspace-v1'","'novel-archive-isolated-qa-'+Date.now()");
const tests=`
(async()=>{const C=ArchiveCore;let count=0;const assert=(x,m)=>{if(!x)throw Error(m);};const test=async(name,fn)=>{await fn();count++;const li=document.createElement('li');li.textContent='通过：'+name;document.querySelector('#checks').append(li);};let store=new ArchiveStorage.Store(),state;
try{
await test('首次打开没有虚构档案',async()=>{await store.open();assert(store.mode==='indexedDB','没有真实 IndexedDB');assert(!await store.load(),'非空测试库');state=C.blankState();C.createArchive(state,{title:'合成档案'});state.revision=1;await store.save(state);});
await test('关闭连接后重开保留档案',async()=>{store.db.close();store=new ArchiveStorage.Store();await store.open();state=C.validateState(await store.load());assert(state.archives[0].versions[0].title==='合成档案','重读内容不一致');});
await test('并发旧版本写入被拒绝，成功写入和历史在同一事务提交',async()=>{const other=new ArchiveStorage.Store();await other.open();await other.load();state.archives[0].versions[0].title='已确认修改';state.revision++;await store.save(state);let rejected=false;try{await other.save({...C.copy(state),revision:state.revision+1});}catch(e){rejected=e.code==='REVISION_CONFLICT';}assert(rejected,'并发保护失效');assert((await store.history())[0].state.archives[0].versions[0].title==='合成档案','缺少修改前内容');other.db.close();});
await test('恢复历史仍产生新版本，并保存恢复前内容',async()=>{const old=(await store.history())[0].state;old.revision=state.revision+1;await store.save(old);assert((await store.history())[0].state.archives[0].versions[0].title==='已确认修改','恢复前内容丢失');state=old;});
await test('最近 30 次历史数量受限，当前数据仍可重读',async()=>{for(let i=0;i<32;i++){state.revision++;state.archives[0].versions[0].title='历史 '+i;await store.save(state);}assert((await store.history()).length===30,'历史数量不正确');store.db.close();store=new ArchiveStorage.Store();await store.open();const saved=await store.load();assert(saved.archives[0].versions[0].title==='历史 31','最后一次保存缺失');});
document.querySelector('#summary').textContent='全部通过：'+count+' 项真实 IndexedDB 检查';document.querySelector('#summary').dataset.status='passed';
}catch(e){document.querySelector('#summary').textContent='失败：'+e.message;document.querySelector('#summary').dataset.status='failed';console.error(e);}finally{store.db?.close();}})();`;
new Script(core+storage+tests,{filename:'chekaji-storage-checks.js'});
writeFileSync(out+'/archive-check.html',page('车卡机 · 保存与恢复自检',core+storage+tests));
console.log('Browser self-check pages:',out);
