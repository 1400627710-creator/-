import {readFileSync,writeFileSync} from 'node:fs';
const html=readFileSync('local/dist/CardStudio-Local.html','utf8').replace('name="cardstudio-surface" content="local"','name="cardstudio-surface" content="mcp-local"').replace('卡递 · 本地工作台','卡递 · GPT 档案与制卡').replace('<small>本地卡牌工作台</small>','<small>档案与卡牌协作</small>').replace('<span class="pill">本地版</span>','<span class="pill">GPT · 本机存档</span>');
writeFileSync('lib/assistant-html.mjs','export const ASSISTANT_HTML='+JSON.stringify(html)+';\n');
console.log('GPT local-project view:',Buffer.byteLength(html),'bytes');
