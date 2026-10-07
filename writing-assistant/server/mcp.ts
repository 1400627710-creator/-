import fs from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { Service, ReplySchema, errorInfo } from './service.js';
import { WRITING_RULES } from './store.js';

export const UI_URI='ui://author-writing/editor.html';
export function createMcp(service:Service,htmlPath:string) {
  const server=new McpServer({name:'author-writing',version:'0.1.2'},{instructions:'作者主导小说助手。打开 writer_open；只处理作者已提交的请求。先 writer_context，按其中规则阅读来源，最后 writer_complete。不可替作者采纳、确认记忆或写正式正文。'+WRITING_RULES.join('\n')});
  const model=(fn:()=>unknown)=>async()=>{
    service.seenModel();
    try{const data=await fn();return{content:[{type:'text' as const,text:JSON.stringify(data)}],structuredContent:data as Record<string,unknown>};}
    catch(e){return{isError:true,content:[{type:'text' as const,text:JSON.stringify(errorInfo(e))}]};}
  };
  registerAppTool(server,'writer_open',{
    title:'打开小说码字窗口',description:'打开作者的本机小说仓库与码字窗口。正式正文只能由窗口内作者操作。',inputSchema:{},
    _meta:{ui:{resourceUri:UI_URI}},annotations:{readOnlyHint:true,openWorldHint:false},
  },async()=>{
    service.seenModel();return{
      content:[{type:'text' as const,text:'码字窗口已就绪。请在窗口中新建小说或导入原稿；使用 writer_next_request 获取作者提交的任务。'}],
      structuredContent:{ready:true,projects:service.store.snapshot().projects.map(p=>({id:p.id,name:p.name})),localUrl:service.localUrl},
      _meta:{writerState:service.state(),clientKey:service.clientKey},
    };
  });
  registerAppTool(server,'writer_ui',{
    title:'作者窗口操作',description:'仅供编辑窗口调用。保存、撤销、采纳、记忆确认需要窗口私有能力。',
    inputSchema:{action:z.string(),args:z.record(z.string(),z.unknown()),clientKey:z.string()},
    _meta:{ui:{visibility:['app']}},annotations:{readOnlyHint:false,openWorldHint:false},
  },async({action,args,clientKey}:{action:string,args:Record<string,unknown>,clientKey:string})=>{
    try {const {result,state}=service.ui(action,args,clientKey);return{content:[{type:'text' as const,text:'窗口操作完成。'}],structuredContent:{ok:true},_meta:{writerState:state,uiResult:result}};}
    catch(e){return{isError:true,content:[{type:'text' as const,text:JSON.stringify(errorInfo(e))}],_meta:{writerError:errorInfo(e)}};}
  });
  server.registerTool('writer_status',{description:'查看连接状态及小说目录，不读正文。',inputSchema:{},annotations:{readOnlyHint:true,openWorldHint:false}},model(()=>({projects:service.store.snapshot().projects.map(p=>({id:p.id,name:p.name,chapters:p.chapters.length})),modelConnection:service.modelConnection,usesApiKey:false})));
  server.registerTool('writer_next_request',{description:'查找作者已提交的下一条任务，手动请求优先。无任务时返回 null，不自动无限轮询。',inputSchema:{projectId:z.string().optional()},annotations:{readOnlyHint:true,openWorldHint:false}},async({projectId})=>model(()=>({request:service.store.nextRequest(projectId)}))());
  server.registerTool('writer_context',{description:'读取请求的当前选段、文风样本、有效记忆、覆盖率及写作规则。必须在回答前调用。',inputSchema:{jobId:z.string()},annotations:{readOnlyHint:false,openWorldHint:false}},async({jobId})=>model(()=>service.store.context(jobId))());
  server.registerTool('writer_sources',{description:'列出小说的章节来源、长度、当前修订及已有依据数量。',inputSchema:{projectId:z.string()},annotations:{readOnlyHint:true,openWorldHint:false}},async({projectId})=>model(()=>({sources:service.store.sources(projectId)}))());
  server.registerTool('writer_read_chapter',{description:'按章节和范围补读本部小说原文；每次最多 12000 字。只读当前小说，不搜索网络。',inputSchema:{projectId:z.string(),chapterId:z.string(),start:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(12000).default(8000)},annotations:{readOnlyHint:true,openWorldHint:false}},async({projectId,chapterId,start,limit})=>model(()=>service.store.readChapter(projectId,chapterId,start,limit))());
  server.registerTool('writer_search',{description:'在指定小说中寻找人物、物品或规则的准确原文出处。关键词由当前上下文决定。',inputSchema:{projectId:z.string(),keywords:z.array(z.string().min(1).max(80)).min(1).max(6)},annotations:{readOnlyHint:true,openWorldHint:false}},async({projectId,keywords})=>model(()=>{
    const p=service.store.project(projectId);const hits=[];
    for(const c of p.chapters)for(const word of keywords){let from=0;for(let n=0;n<3;n++){const pos=c.text.indexOf(word,from);if(pos<0)break;const start=Math.max(0,pos-250),end=Math.min(c.text.length,pos+word.length+400);hits.push({chapterId:c.id,name:c.name,rev:c.rev,start,end,quote:c.text.slice(start,end)});from=pos+word.length;}}
    return{hits:hits.slice(0,20),truncated:hits.length>20};
  })());
  server.registerTool('writer_read_memories',{description:'补读本部小说的有效记忆，不包含待确认、拒绝或失效项。',inputSchema:{projectId:z.string(),offset:z.number().int().nonnegative().default(0)},annotations:{readOnlyHint:true,openWorldHint:false}},async({projectId,offset})=>model(()=>{
    const p=service.store.project(projectId),active=p.memories.filter(m=>['auto','confirmed'].includes(m.status)&&m.evidence.every(e=>service.store.spanValid(p,e)));
    return{memoryRev:p.memoryRev,total:active.length,memories:active.slice(offset,offset+30)};
  })());
  server.registerTool('writer_complete',{
    description:'由当前宿主 GPT 提交回答、澄清问题、正文候选及有准确出处的记忆。不会采纳正文。',inputSchema:{jobId:z.string(),reply:ReplySchema},annotations:{readOnlyHint:false,openWorldHint:false},
  },async({jobId,reply})=>model(()=>service.complete(jobId,reply))());
  registerAppResource(server,'writer-editor',UI_URI,{mimeType:RESOURCE_MIME_TYPE},async()=>({contents:[{uri:UI_URI,mimeType:RESOURCE_MIME_TYPE,text:fs.readFileSync(htmlPath,'utf8'),_meta:{ui:{prefersBorder:false,csp:{connectDomains:[],resourceDomains:[]}}}}]}));
  return server;
}
