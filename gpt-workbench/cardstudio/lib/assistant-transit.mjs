import {digest,encryptReply} from './assistant-delivery.mjs';
import {normalizeReply,VERSION} from './assistant-core.mjs';
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const validId=id=>typeof id==='string'&&/^[\w-]{1,120}$/.test(id);
const validToken=t=>typeof t==='string'&&/^[a-f0-9]{64}$/.test(t);
const result=(data,message)=>({content:[{type:'text',text:message}],structuredContent:data});
export async function transit(name,args,{bucket,owner}){
 assert(owner,'请在已连接的 GPT 卡递窗口中使用');assert(bucket,'回复通道尚未配置，资料仍保存在浏览器');
 assert(validId(args.jobId),'请求编号无效');const prefix='kadi-transit-v1/'+await digest(owner)+'/',path=prefix+args.jobId;
 if(bucket.list){const page=await bucket.list({prefix,limit:100,include:['customMetadata']});const old=page.objects.filter(o=>Number(o.customMetadata?.expires||Infinity)<Date.now()).map(o=>o.key);if(old.length)await bucket.delete(old);}
 const object=await bucket.get(path),previous=object?await object.json():null;
 if(previous&&previous.expires<Date.now()){await bucket.delete(path);throw Error('请求已过期，请保留原文重新发送');}
 const save=(value,onlyIf)=>bucket.put(path,JSON.stringify(value),{httpMetadata:{contentType:'application/json'},customMetadata:{expires:String(value.expires)},onlyIf});
 if(name==='kadi_begin'){
  assert(validToken(args.readToken)&&validToken(args.writeToken),'通道凭据无效');assert(args.publicKey?.kty==='RSA'&&typeof args.publicKey.n==='string'&&args.publicKey.n.length>=300&&args.publicKey.n.length<=700&&args.publicKey.e==='AQAB','窗口密钥无效');
  assert(Number.isInteger(args.baseRevision)&&args.baseRevision>=0&&validId(args.projectId),'项目版本无效');
  const writeHash=await digest(args.writeToken),readHash=await digest(args.readToken);
  if(previous){assert(previous.writeHash===writeHash&&previous.readHash===readHash&&previous.publicKey.n===args.publicKey.n&&previous.projectId===args.projectId&&previous.baseRevision===args.baseRevision,'同一请求已有不同的回复通道');return result({ok:true,expires:previous.expires},'本次回复通道已就绪');}
  const value={jobId:args.jobId,projectId:args.projectId,baseRevision:args.baseRevision,publicKey:args.publicKey,writeHash,readHash,expires:Date.now()+20*60*1000,delivery:null,replyHash:null};
  assert(await save(value,{etagDoesNotMatch:'*'}),'请求正在其他窗口提交，请重试');return result({ok:true,expires:value.expires},'本次回复通道已就绪；项目保存在浏览器');
 }
 if(name==='kadi_finish'){
  assert(previous&&validToken(args.writeToken)&&await digest(args.writeToken)===previous.writeHash,'回复通道无效或已过期，请由卡递窗口重新发送');
  const reply=normalizeReply(args.reply),replyHash=await digest(reply);
  if(previous.replyHash){assert(previous.replyHash===replyHash,'同一请求已经有不同回复，请勿重复覆盖');return result({ok:true,jobId:args.jobId,version:VERSION,delivery:'ready',projectChanged:false},'相同回复已交回窗口；是否保存以窗口结果为准');}
  previous.delivery=await encryptReply({jobId:args.jobId,projectId:previous.projectId,baseRevision:previous.baseRevision,reply},previous.publicKey,args.jobId);previous.replyHash=replyHash;
  assert(await save(previous,{etagMatches:object.etag}),'回复通道已改变，请检查任务状态');return result({ok:true,jobId:args.jobId,delivery:'ready',projectChanged:false},'结果已交回卡递窗口，窗口核对项目与版本后处理；请查看右侧助手栏');
 }
 if(name==='kadi_delivery'){
  assert(validToken(args.readToken),'读取凭据无效');if(!previous)return result({ok:true,expired:true,delivery:null},'本次回复通道已结束');
  assert(await digest(args.readToken)===previous.readHash,'不能读取其他任务的回复');
  if(args.acknowledge){if(previous.delivery)await bucket.delete(path);return result({ok:true,acknowledged:!!previous.delivery},'回复已收取');}
  return {content:[{type:'text',text:previous.delivery?'回复已准备':'正在等待本次 GPT 回复'}],structuredContent:{ok:true,ready:!!previous.delivery,expires:previous.expires},_meta:{delivery:previous.delivery}};
 }
 throw Error('未知助手通道操作');
}
