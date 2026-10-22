import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Script} from 'node:vm';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>readFileSync(root+p,'utf8');
const plain=p=>read(p).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
let html=read('novel-archive/src/index.html');
const shared=`${read('cardstudio/legacy/studio/glossary-format.js')}
const GlossaryUI=(()=>{const G=window.CARDSTUDIO_GLOSSARY;${plain('shared/glossary-ui.mjs')}
return {installGlossary};})();
\nconst Exchange=(()=>{const C=ArchiveCore;${plain('cardstudio/local/sha256.mjs')}\n${plain('shared/exchange.mjs')}\nreturn {envelope,validateEnvelope,planExchange,applyExchange,archiveDiff};})();\nconst ExchangeUI=(()=>{const {validateEnvelope,archiveDiff}=Exchange;${plain('shared/peer.mjs')}\n${plain('shared/exchange-ui.mjs')}\nreturn {installExchange};})();\n`;
const anchor="(() => {\n  'use strict';\n  const C = ArchiveCore;";
if(!html.includes(anchor))throw Error('找不到车卡机 UI 入口');
html=html.replace(anchor,()=>shared+anchor);
html=html.replace('  async function init(){',()=>read('novel-archive/exchange-adapter.mjs')+'\n  async function init(){');
html=html.replace('    await registerHostTools();','    setupExchange();await registerHostTools();');
const match=html.match(/<script>([\s\S]*)<\/script>/);
if(!match)throw Error('找不到应用脚本');
new Script(match[1],{filename:'chekaji-local.js'});
const bootstrap=`(()=>{const bytes=Uint8Array.from(atob('${Buffer.from(match[1]).toString('base64')}'),c=>c.charCodeAt(0));const script=document.createElement('script');script.textContent=new TextDecoder().decode(bytes);document.head.append(script)})();`;
html=html.replace(match[0],()=>'<script>'+bootstrap+'</script>');
writeFileSync(root+'novel-archive/Novel-Archive.html',html);
console.log('车卡机独立文件已构建：',Buffer.byteLength(html),'bytes');
