// Isolated browser QA host. Never included in the deployed app or release HTML.
import {transit} from '../lib/assistant-transit.mjs';
import {parseInput,FIELDS} from '../lib/quick-cards.mjs';
const frame=document.querySelector('iframe'),summary=document.querySelector('#summary');let latest;
const files=new Map;let serial=0;
const bucket={async get(key){const o=files.get(key);return o?{etag:o.etag,json:async()=>JSON.parse(o.value)}:null;},async put(key,value,options){const old=files.get(key);if(options?.onlyIf?.etagDoesNotMatch==='*'&&old||options?.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;const etag=String(++serial);files.set(key,{value,etag,customMetadata:options?.customMetadata});return {etag};},async list({prefix}){return {objects:[...files].filter(([k])=>k.startsWith(prefix)).map(([key,v])=>({key,customMetadata:v.customMetadata}))};},async delete(keys){for(const k of Array.isArray(keys)?keys:[keys])files.delete(k);}};
const env={owner:'isolated-assistant-browser-qa',bucket};
window.addEventListener('message',async event=>{
 if(event.source!==frame.contentWindow||event.data?.jsonrpc!=='2.0'||!event.data.method)return;const m=event.data;if(m.id===undefined)return;
 let result={};try{
  if(m.method==='ui/initialize')result={hostCapabilities:{message:{text:{}},updateModelContext:{}},hostContext:{displayMode:'fullscreen'}};
  else if(m.method==='tools/call'){
   if(m.params.name==='app_service')result={_meta:{data:{projects:[]}}};
   else result=await transit(m.params.name,m.params.arguments,env);
  }else if(m.method==='ui/message'){
   latest=JSON.parse(m.params.content.find(c=>c.text?.startsWith('{')).text);summary.textContent='已收到窗口请求 · '+latest.context.mode+' · 原文 '+latest.sourceText.length+' 字 · 项目 '+latest.context.projectId+' · 版本 '+latest.context.baseRevision;
  }
 }catch(e){result={isError:true,content:[{type:'text',text:e.message}]};}
 frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,result},'*');
});
document.querySelector('#respond').onclick=async()=>{
 try{
  if(!latest)throw Error('请先从右侧助手提交合成资料');let reply;
  if(latest.context.mode==='revise')reply={kind:'edits',message:'合成回复：修改所选卡的费用，保留排版与档案原文。',cardChanges:latest.context.cards.map(c=>({cardId:c.id,patch:{cost:5}}))};
  else{const {rows}=parseInput(latest.sourceText);reply={kind:'batch',message:'合成回复：按原文整理，缺数值条目留待补全。',records:rows.map(r=>({title:r.name,typeName:r.cardKind==='spell'?'法术档案':'单位档案',sourceQuote:r.quotes.name,cardKind:latest.context.mode==='archive'?'none':r.cardKind,fields:FIELDS.filter(([k])=>k!=='name'&&(r.cardKind!=='spell'||!['unitType','attack','health'].includes(k))).map(([key,name])=>({key,name,value:String(r[key]),sourceQuote:r.quotes[key]||''}))}))};}
  const result=await transit('kadi_finish',{jobId:latest.jobId,writeToken:latest.writeToken,reply},env);summary.textContent=result.isError?'合成回复失败':'合成回复已进入加密通道，等待窗口收取';
 }catch(e){summary.textContent=e.message;}
};
