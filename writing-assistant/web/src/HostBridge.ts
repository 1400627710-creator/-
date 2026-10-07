import { App } from '@modelcontextprotocol/ext-apps';
import type { Database } from '../../server/types.js';
export type ViewState={database:Database;warnings:string[];recovered:boolean;localUrl:string;modelConnection:{toolCalls:number;completedRequests:number;lastSeen:number}};
declare global {interface Window {__WRITER_LOCAL__?:{clientKey:string};openai?:{callTool?:(name:string,args:unknown)=>Promise<any>;sendFollowUpMessage?:(params:{prompt:string})=>Promise<void>;requestDisplayMode?:(params:{mode:string})=>Promise<any>;toolResponseMetadata?:any};}}

export class HostBridge {
  app?:App;
  key='';
  connected=false;
  mode:'mcp-app'|'chatgpt-compat'|'local'|'unavailable'='unavailable';
  onState:(s:ViewState)=>void=()=>{};
  onStatus:(s:string)=>void=()=>{};
  private initial?:ViewState;
  private readyResolve?:()=>void;
  constructor() {
    if(window.__WRITER_LOCAL__){this.mode='local';this.key=window.__WRITER_LOCAL__.clientKey;}
  }
  async initialize() {
    if(this.mode==='local'){await this.call('snapshot',{});this.connected=true;return;}
    if(window.parent!==window){
      this.app=new App({name:'小说码字助手',version:'0.1.2'}, {availableDisplayModes:['inline','fullscreen']}, {autoResize:false});
      const first=new Promise<void>(resolve=>{this.readyResolve=resolve;});
      this.app.ontoolresult=(result)=>{
        const meta=result._meta as any;if(meta?.clientKey)this.key=meta.clientKey;
        if(meta?.writerState){this.initial=meta.writerState;this.onState(meta.writerState);if(this.key)this.readyResolve?.();}
      };
      try {
        await this.app.connect(undefined,{timeout:8000});this.mode='mcp-app';
        await Promise.race([first,new Promise<void>((_,reject)=>setTimeout(()=>reject(Error('窗口缺少初始授权，请在聊天中重新调用“打开码字窗口”。')),10000))]);
        this.connected=true;void this.app.sendSizeChanged({height:820}).catch(()=>{});return;
      } catch { /* Compatibility is attempted only when supplied by the actual host. */ }
    }
    if(window.openai?.callTool){
      this.mode='chatgpt-compat';const meta=window.openai.toolResponseMetadata;
      if(meta?.clientKey){this.key=meta.clientKey;this.onState(meta.writerState);this.connected=true;return;}
    }
    this.mode='unavailable';throw Error('没有连接到支持编辑窗口的 GPT 宿主。请在桌面端安装本机插件后调用“打开码字窗口”。');
  }
  async call(action:string,args:any):Promise<any> {
    if(this.mode==='local'){
      const response=await fetch('/ui',{method:'POST',headers:{'Content-Type':'application/json','X-Writer-Client':this.key},body:JSON.stringify({action,args})});
      const body=await response.json();if(body.error)throw Object.assign(Error(body.error.message),{code:body.error.code});
      this.onState(body.state);return body.result;
    }
    let response:any;
    if(this.mode==='mcp-app'&&this.app)response=await this.app.callServerTool({name:'writer_ui',arguments:{action,args,clientKey:this.key}});
    else if(this.mode==='chatgpt-compat'&&window.openai?.callTool)response=await window.openai.callTool('writer_ui',{action,args,clientKey:this.key});
    else throw Error('本机编辑服务尚未连接。');
    if(response.isError){const e=response._meta?.writerError;throw Object.assign(Error(e?.message||'窗口操作失败，请重试。'),{code:e?.code});}
    const meta=response._meta;if(meta?.writerState)this.onState(meta.writerState);return meta?.uiResult||{};
  }
  get canTrigger(){return this.mode==='mcp-app'?!!this.app?.getHostCapabilities()?.message?.text:this.mode==='chatgpt-compat'&&!!window.openai?.sendFollowUpMessage;}
  async trigger(jobId:string) {
    const prompt=`使用 author-writing 小说码字助手处理请求 ${jobId}。先调用 writer_context；根据原文与有效依据补读，缺信息直接询问；最后调用 writer_complete 把回答或候选写回窗口。正式正文由我在窗口内采纳。`;
    if(this.mode==='mcp-app'&&this.app){
      if(!this.canTrigger)throw Error('当前宿主没有提供消息唤起能力。请求已保留；请在已连接插件的 GPT 聊天中让它处理下一条码字待办。');
      if(this.app.getHostCapabilities()?.updateModelContext)await this.app.updateModelContext({structuredContent:{writerJobId:jobId,action:'process-author-submitted-writing-request'}},{timeout:5000});
      const result=await this.app.sendMessage({role:'user',content:[{type:'text',text:prompt}]},{timeout:12000});
      if(result.isError)throw Error('宿主未接受请求。稿件和待办已保留，可在当前 GPT 聊天中发送待办指令。');return;
    }
    if(this.mode==='chatgpt-compat'&&window.openai?.sendFollowUpMessage){await window.openai.sendFollowUpMessage({prompt});return;}
    throw Error('独立本机窗口未获得自动唤起 GPT 的通道。请在桌面 GPT 的插件窗口内发送，或把待办指令发给已连接插件的聊天。');
  }
  async fullScreen(){
    if(this.mode==='mcp-app'&&this.app){await this.app.requestDisplayMode({mode:'fullscreen'});return;}
    if(window.openai?.requestDisplayMode){await window.openai.requestDisplayMode({mode:'fullscreen'});return;}
    await document.documentElement.requestFullscreen();
  }
}
