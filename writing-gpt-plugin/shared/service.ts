import { randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Store, WriterError, fail } from './store.js';
import type { Mode } from './types.js';

export {SpanSchema,ReplySchema} from './replySchema.js';
import {ReplySchema} from './replySchema.js';

export class Service {
  readonly clientKey=randomBytes(32).toString('hex');
  modelConnection={toolCalls:0,completedRequests:0,lastSeen:0};
  localUrl='';
  constructor(public store:Store) {}
  authorize(key:string) {
    if(typeof key!=='string'||key.length!==this.clientKey.length||!timingSafeEqual(new TextEncoder().encode(key),new TextEncoder().encode(this.clientKey)))fail('UI_ONLY','这个操作只允许作者在窗口内执行。');
  }
  private call(method:string,args:any):any {
    const s=this.store;
    switch(method){
      case 'snapshot':return{};
      case 'createProject':return s.createProject(args.name,args.requestId);
      case 'createChapter':return s.createChapter(args.projectId,args.name,args.text||'',args.requestId);
      case 'rename':return s.rename(args.projectId,args.chapterId,args.name,args.requestId);
      case 'reorder':return s.reorder(args.projectId,args.ids,args.requestId);
      case 'save':return s.save(args.projectId,args.chapterId,args.baseRev,args.text,args.requestId);
      case 'history':if(!['undo','redo'].includes(args.direction))fail('INVALID_REQUEST','撤销方向无效。');return s.history(args.projectId,args.chapterId,args.baseRev,args.direction,args.requestId);
      case 'request':return s.request(args.projectId,args.chapterId,args.baseRev,args.selection,args.prompt,args.mode as Mode,!!args.automatic,args.requestId,args.editMessageId);
      case 'cancel':return s.cancel(args.jobId,args.requestId);
      case 'decide':return s.decide(args.jobId,!!args.accept,args.requestId);
      case 'correctMemory':return s.correctMemory(args.projectId,args.memoryId,args.correction,args.requestId);
      case 'decideMemory':return s.decideMemory(args.projectId,args.memoryId,args.baseMemoryRev,!!args.confirm,args.requestId);
      case 'approveStyle':return s.approveStyle(args.projectId,args.chapterId,args.baseRev,args.selection,args.requestId);
      case 'proactive':return s.setProactive(args.projectId,!!args.enabled,args.requestId);
      case 'export':return{backup:s.exportProject(args.projectId)};
      case 'exportRequest':return{packet:{format:'author-writing-request',schema:1,context:s.context(args.jobId)}};
      case 'importReply':{
        const packet=args.packet;
        if(packet?.format!=='author-writing-reply'||packet.schema!==1)fail('INVALID_REPLY','请选择当前 GPT 生成的码字回复文件。');
        const current=s.job(packet.jobId);
        if(packet.rev!==current.j.rev||packet.memoryRev!==current.j.memoryRev||packet.branch!==current.j.branch)fail('STALE_JOB','回复文件对应旧版本，请重新导出请求。');
        return this.complete(packet.jobId,packet.reply,false);
      }
      case 'import':return s.importProject(args.backup,args.requestId);
      default:return fail('INVALID_ACTION','不支持这个操作。');
    }
  }
  state() {
    return{database:this.store.snapshot(),warnings:this.store.warnings,recovered:this.store.recovered,modelConnection:this.modelConnection,localUrl:this.localUrl};
  }
  ui(method:string,args:unknown,key:string) {
    this.authorize(key);
    if(!args||typeof args!=='object'||Array.isArray(args))fail('INVALID_REQUEST','请求参数无效。');
    const result=this.call(method,args);
    return{result,state:this.state()};
  }
  seenModel() {this.modelConnection.toolCalls++;this.modelConnection.lastSeen=Date.now();}
  complete(jobId:string,reply:unknown,fromMcp=true) {
    const parsed=ReplySchema.safeParse(reply);if(!parsed.success)fail('INVALID_REPLY','回复结构不合要求，请核对当前 Schema 后重试。');
    const result=this.store.complete(jobId,parsed.data!);if(fromMcp)this.modelConnection.completedRequests++;return result;
  }
}

export function errorInfo(error:unknown) {
  return error instanceof WriterError?{code:error.code,message:error.message}:{code:'INTERNAL_ERROR',message:'操作失败。原稿已保留；请重试或导出备份。'};
}
