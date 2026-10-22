import {validateEnvelope,archiveDiff} from './exchange.mjs';
import {createPeer} from './peer.mjs';

const H=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export function installExchange(adapter){
 let incoming=null,pending=null,connection='尚未连接';
 const name=adapter.role==='cardstudio'?'车卡机':'卡递';
 const show=(...args)=>{adapter.dialog(...args);document.querySelectorAll('[data-action^="exchange-"]').forEach(el=>el.classList.add('button'));};
 const css=document.createElement('style');css.textContent='.exchange-summary{padding:12px 14px;border:1px solid #ded8ed;background:#f5f2fb;border-radius:9px;margin:10px 0;line-height:1.7}.exchange-actions{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.exchange-actions button{flex:1 1 155px}.exchange-row{border:1px solid #e2ddeb;border-radius:9px;padding:12px;margin:10px 0}.exchange-row>div{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.exchange-row strong{flex:1;min-width:120px;overflow-wrap:anywhere}.exchange-row select{max-width:100%}.exchange-row details{margin-top:8px}.exchange-diff{width:100%;border-collapse:collapse;font-size:12px}.exchange-diff td,.exchange-diff th{padding:7px;text-align:left;border-bottom:1px solid #eee9f3;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere;max-width:300px}.exchange-row small,.exchange-help{color:#80758d;line-height:1.7}';document.head.append(css);
 function badge(){const button=document.getElementById('exchange-btn');if(button)button.textContent=incoming?'互通 · 有来件':'与'+name+'互通';}
 const peer=createPeer({role:adapter.role,peerUrl:adapter.peerUrl,onPacket:async packet=>{if(packet?.schema==='cardstudio-glossary-v1'&&adapter.receiveGlossary){await adapter.receiveGlossary(packet);return;}if(incoming)throw new Error('已有一份来件待处理，请先检查或取消');incoming=validateEnvelope(packet);badge();adapter.toast('收到'+name+'资料，点击互通查看');if(!adapter.modalOpen())await preview();},onStatus:text=>{connection=text;const box=document.getElementById('exchange-status');if(box)box.textContent=text;},onNotice:adapter.toast});
 function dialog(){
  show('与'+name+'互通',`<p>两个工具独立保存。你主动发送，接收端核对后才写入。</p><div id="exchange-status" class="exchange-summary">${H(connection)}</div><div class="exchange-actions"><button data-action="exchange-connect">打开${name}并连接</button><button data-action="exchange-send-current">发送${H(adapter.currentLabel())}</button><button data-action="exchange-send-all">发送${H(adapter.allLabel())}</button></div>${incoming?'<button data-action="exchange-preview" class="primary">检查已收到的资料</button>':''}<details><summary>使用互通文件</summary><p class="exchange-help">浏览器限制新窗口时，可导出互通文件，在另一工具中选择接收。此操作不替换整个资料库。</p><div class="exchange-actions"><button data-action="exchange-export">导出互通文件</button><button data-action="exchange-file">选择互通文件</button></div></details><input id="exchange-file" type="file" accept=".json,application/json" hidden><p class="exchange-help">更新按稳定编号识别，改名不会重复创建。目标端额外字段、行和故事版本会保留；双边修改默认保留本机，需逐项决定。</p>`);
  document.getElementById('exchange-file').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>8*1024*1024)throw new Error('互通文件超过 8 MB，请分批发送');const packet=JSON.parse(await file.text());if(packet?.schema==='cardstudio-glossary-v1'&&adapter.receiveGlossary){adapter.close();await adapter.receiveGlossary(packet);return;}incoming=validateEnvelope(packet);badge();await preview();}catch(e){adapter.toast(e.message);}};
 }
 async function preview(){
  if(!incoming)throw new Error('还没有收到互通资料');
  await adapter.flush();if(pending)await adapter.cancel(pending);pending=await adapter.prepare(incoming);const c=pending.plan.counts;
  const labels={new:'新增',update:'来件更新',same:'内容相同',local:'仅本机有修改',conflict:'两边都有修改'};
  const rows=pending.plan.rows.map(row=>{const accept=['new','update'].includes(row.status),diff=archiveDiff(row.before,row.after);return `<article class="exchange-row"><div><strong>${H(row.title)}</strong><span>${row.status==='conflict'&&row.firstReturn?'首次回传，需核对':labels[row.status]}</span><select data-exchange-choice="${H(row.key)}" aria-label="处理 ${H(row.title)}" ${row.status==='same'?'disabled':''}><option value="skip" ${accept?'':'selected'}>保留本机</option><option value="apply" ${accept?'selected':''}>接收来件</option></select></div><details><summary>${diff.length} 项内容变化 · 查看对照</summary>${diff.length?`<table class="exchange-diff"><thead><tr><th>字段</th><th>本机</th><th>来件</th></tr></thead><tbody>${diff.map(d=>`<tr><td>${H(d.label)}</td><td>${H(d.before)}</td><td>${H(d.after)}</td></tr>`).join('')}</tbody></table>`:'<p>文字内容相同，可能仅有类型、版式或当前故事版本的变化。</p>'}</details></article>`;}).join('');
  show('确认互通资料',`<div class="exchange-summary">新增 ${c.new} · 更新 ${c.update} · 冲突 ${c.conflict} · 相同 ${c.same} · 仅本机修改 ${c.local}</div><p>请检查下面的处理方式。修改已有内容需选择“接收来件”并确认；关闭窗口不会写入。</p>${rows}`,`<button data-action="exchange-cancel">取消本次接收</button><button data-action="exchange-commit" class="primary">确认接收所选内容</button>`,true);
 }
 async function action(action){
  if(action==='exchange-open'){dialog();return true;}
  if(action==='exchange-connect'){peer.connect();return true;}
  if(action==='exchange-send-current'||action==='exchange-send-all'||action==='exchange-export'){
   await adapter.flush();const packet=await adapter.make(action==='exchange-send-current'?'current':'all');
   if(action==='exchange-export')adapter.download(packet);else{peer.send(packet);adapter.toast('资料已发送，等待对方检查');}return true;
  }
  if(action==='exchange-file'){document.getElementById('exchange-file').click();return true;}
  if(action==='exchange-preview'){await preview();return true;}
  if(action==='exchange-cancel'){if(pending)await adapter.cancel(pending);pending=null;incoming=null;badge();adapter.close();adapter.toast('已取消，资料保持原状');return true;}
  if(action==='exchange-commit'){
   if(!pending)throw new Error('请重新检查来件');
   const choices=Object.fromEntries([...document.querySelectorAll('[data-exchange-choice]')].map(el=>[el.dataset.exchangeChoice,el.value==='apply']));
   await adapter.flush();const result=await adapter.commit(pending,choices);pending=null;incoming=null;badge();adapter.close();adapter.toast(`已接收：新增 ${result.created}，更新 ${result.updated}，保留 ${result.skipped}`);return true;
  }
  return false;
 }
 badge();return {action,open:dialog,receive:async packet=>{incoming=validateEnvelope(packet);badge();await preview();},peer};
}
