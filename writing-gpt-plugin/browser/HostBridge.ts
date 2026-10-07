import {App} from '@modelcontextprotocol/ext-apps';
import {Store} from '../shared/store.js';
import {Service} from '../shared/service.js';
import {Persistence} from './persistence.js';
import {makeKeys,decryptReply} from '../shared/delivery.js';
import {randomBytes} from './localCrypto.js';
import type {Database} from '../shared/types.js';
export type ViewState={database:Database;warnings:string[];recovered:boolean;localUrl:string;modelConnection:{toolCalls:number;completedRequests:number;lastSeen:number}};
declare global {interface Window {openai?:{callTool?:(name:string,args:unknown)=>Promise<any>;sendFollowUpMessage?:(params:{prompt:string})=>Promise<void>;requestDisplayMode?:(params:{mode:string})=>Promise<any>};}}
type Ticket={jobId:string;readToken:string;writeToken:string;publicKey:JsonWebKey;privateKey:JsonWebKey;expires:number;rev:number;memoryRev:number;branch:number;delivered?:boolean;failed?:boolean};

export class HostBridge {
  app?:App;connected=false;
  mode:'mcp-app'|'chatgpt-compat'|'local'|'unavailable'='local';
  onState:(s:ViewState)=>void=()=>{};onStatus:(s:string)=>void=()=>{};
  private persistence=new Persistence();private service!:Service;
  private queue:Promise<any>=Promise.resolve();private polling=false;
  private counters={toolCalls:0,completedRequests:0,lastSeen:0};
  private async serial<T>(fn:()=>Promise<T>):Promise<T>{const next=this.queue.then(fn,fn);this.queue=next.catch(()=>{});return next;}
  private async load(){await this.persistence.refresh();this.service=new Service(new Store('/writer'));this.service.modelConnection=this.counters;}
  private async publish(){await this.persistence.commit();this.onState(this.service.state());}
  async initialize(){
    await this.persistence.open();await this.serial(async()=>{await this.load();await this.publish();});
    if(window.parent!==window){
      this.app=new App({name:'小说码字助手',version:'0.2.0'},{availableDisplayModes:['fullscreen']},{autoResize:false});
      this.app.ontoolresult=()=>{};
      try{
        await this.app.connect(undefined,{timeout:8000});this.mode='mcp-app';
        const ctx=this.app.getHostContext();
        if(ctx?.displayMode!=='fullscreen'&&ctx?.availableDisplayModes?.includes('fullscreen'))await this.app.requestDisplayMode({mode:'fullscreen'}).catch(()=>{});
      }catch{if(window.openai?.callTool&&window.openai.sendFollowUpMessage)this.mode='chatgpt-compat';}
    }
    this.connected=true;
    if(!this.canTrigger)this.onStatus('本机存稿可用；请在 GPT 插件内打开窗口进行 AI 交流。');
    await this.checkDeliveries();
  }
  async call(action:string,args:any):Promise<any>{
    const r=await this.serial(async()=>{await this.load();const {result}=this.service.ui(action,args,this.service.clientKey);await this.publish();return result;});
    if(action==='snapshot')void this.checkDeliveries();return r;
  }
  private async remote(name:string,args:any){
    let r:any;
    if(this.mode==='mcp-app'&&this.app)r=await this.app.callServerTool({name,arguments:args},{timeout:18000});
    else if(this.mode==='chatgpt-compat'&&window.openai?.callTool)r=await window.openai.callTool(name,args);
    else throw Error('请从 GPT 内的“小说码字助手”插件打开窗口，AI 才能直接回复。');
    if(r.isError)throw Object.assign(Error(r.structuredContent?.message||r._meta?.writerError?.message||'回复通道暂时不可用，请重试。'),{code:r.structuredContent?.code});
    return r.structuredContent||{};
  }
  get canTrigger(){return this.mode==='mcp-app'?!!this.app?.getHostCapabilities()?.message?.text:this.mode==='chatgpt-compat'&&!!window.openai?.sendFollowUpMessage;}
  async trigger(jobId:string){
    if(!this.canTrigger)throw Error('稿件已保存在本机。请从 GPT 插件内打开窗口，再发送请求。');
    const context=await this.serial(async()=>{await this.load();const c=this.service.store.context(jobId);await this.publish();return c;});
    let ticket:Ticket|undefined=await this.persistence.read('ticket:'+jobId);
    if(ticket?.failed&&ticket.expires>Date.now())throw Error('这条回复已失效，请在原问题上点“编辑重问”，按当前原稿重新发送。');
    if(!ticket||ticket.expires<Date.now()){
      const keys=await makeKeys();ticket={...keys,jobId,readToken:randomBytes(32).toString('hex'),writeToken:randomBytes(32).toString('hex'),expires:Date.now()+20*60*1000,rev:context.job.rev,memoryRev:context.job.memoryRev,branch:context.job.branch};
      await this.persistence.put('ticket:'+jobId,ticket);
    }
    await this.remote('writer_begin',{jobId,readToken:ticket.readToken,writeToken:ticket.writeToken,publicKey:ticket.publicKey,rev:ticket.rev,memoryRev:ticket.memoryRev,branch:ticket.branch,mode:context.job.mode});
    const sources=await this.serial(async()=>{
      await this.load();const p=this.service.store.project(context.novel.id);const spans:any[]=[];let budget=context.job.mode==='learn'?48000:14000;
      const chapters=context.job.mode==='learn'?p.chapters:[this.service.store.chapter(p,context.currentChapter.id)];
      for(const c of chapters){for(let start=0;start<c.text.length&&budget>0;){const end=Math.min(c.text.length,start+Math.min(budget,12000));spans.push({chapterId:c.id,name:c.name,rev:c.rev,start,end,quote:c.text.slice(start,end)});budget-=end-start;start=end;}if(!budget)break;}
      return {spans,providedCharacters:spans.reduce((n,e)=>n+e.quote.length,0),totalCharacters:chapters.reduce((n,c)=>n+c.text.length,0),scope:context.job.mode==='learn'?'novel':'current-chapter'};
    });
    const packet={format:'author-writing-gpt-request',schema:1,jobId,writeToken:ticket.writeToken,context,supplementalSources:sources,instructions:'使用当前对话模型；先读原文、有效记忆、作者样本和意图。只依据本次实际提供的资料。未读部分不能声称已学习；缺关键信息时返回 ask，最多五问。完成时调用此插件的 writer_finish(jobId,writeToken,reply)。只能提交回答或候选；正式正文和记忆确认由作者在窗口中操作。'};
    const prompt=`小说码字助手：${context.job.prompt}\n请处理窗口请求 ${jobId}，读完附带原文后调用 writer_finish 把回答回到右侧。`;
    if(this.mode==='mcp-app'&&this.app){
      if(this.app.getHostCapabilities()?.updateModelContext)await this.app.updateModelContext({structuredContent:{writerRequest:packet}},{timeout:6000});
      const r=await this.app.sendMessage({role:'user',content:[{type:'text',text:prompt},{type:'text',text:JSON.stringify(packet),annotations:{audience:['assistant']},_meta:{'openai/title':'当前选段与原文依据'}}]},{timeout:16000});
      if(r.isError)throw Error('GPT 未接受请求；待办与稿件已保留，可以重新唤起。');
    }else await window.openai!.sendFollowUpMessage!({prompt:prompt+'\n'+JSON.stringify(packet)});
    void this.checkDeliveries();
  }
  private async checkDeliveries(){
    if(this.polling||!this.canTrigger)return;this.polling=true;
    try{
      const jobs=await this.serial(async()=>{await this.load();return this.service.store.snapshot().projects.flatMap(p=>p.jobs).filter(j=>['processing','queued'].includes(j.status));});
      let checked=0;
      for(const job of jobs){
        const ticket:Ticket|undefined=await this.persistence.read('ticket:'+job.id);if(!ticket||ticket.delivered||ticket.failed)continue;
        if(ticket.expires<Date.now()){ticket.failed=true;await this.persistence.put('ticket:'+job.id,ticket);this.onStatus('有一条请求等待超时；原稿已保留，可点“重新唤起”。');continue;}
        if(checked>=4)break;checked++;
        const result=await this.remote('writer_delivery',{jobId:job.id,readToken:ticket.readToken});if(!result.delivery)continue;
        const packet=await decryptReply(result.delivery,ticket.privateKey,job.id);
        try{
          await this.serial(async()=>{await this.load();this.service.ui('importReply',{packet},this.service.clientKey);this.counters.toolCalls++;this.counters.completedRequests++;this.counters.lastSeen=Date.now();await this.publish();});
          ticket.delivered=true;await this.persistence.put('ticket:'+job.id,ticket);
          await this.remote('writer_delivery',{jobId:job.id,readToken:ticket.readToken,acknowledge:true});
        }catch(e:any){ticket.failed=true;await this.persistence.put('ticket:'+job.id,ticket);this.onStatus(e.message||'回复对应旧版原文，已保留当前稿件，请编辑重问。');}
      }
    }catch(e:any){this.onStatus(e.message||'回复通道暂时不可用，稿件已保留。');}finally{this.polling=false;}
  }
  async fullScreen(){
    if(this.mode==='mcp-app'&&this.app){await this.app.requestDisplayMode({mode:'fullscreen'});return;}
    if(window.openai?.requestDisplayMode){await window.openai.requestDisplayMode({mode:'fullscreen'});return;}
    await document.documentElement.requestFullscreen();
  }
}
