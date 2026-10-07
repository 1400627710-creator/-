export const bytesTo64=(a:Uint8Array)=>{let s='';for(const x of a)s+=String.fromCharCode(x);return btoa(s);};
export const from64=(s:string)=>Uint8Array.from(atob(s),x=>x.charCodeAt(0));
export async function makeKeys(){const pair=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);return {publicKey:await crypto.subtle.exportKey('jwk',pair.publicKey),privateKey:await crypto.subtle.exportKey('jwk',pair.privateKey)};}
export async function encryptReply(reply:unknown,jwk:JsonWebKey,jobId:string){
  const pub=await crypto.subtle.importKey('jwk',jwk,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']),raw=await crypto.subtle.exportKey('raw',key),iv=crypto.getRandomValues(new Uint8Array(12));
  const aad=new TextEncoder().encode('author-writing:'+jobId),text=new TextEncoder().encode(JSON.stringify(reply));
  const body=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,text),wrapped=await crypto.subtle.encrypt({name:'RSA-OAEP'},pub,raw);
  return {format:'writer-encrypted-reply',v:1,jobId,iv:bytesTo64(iv),key:bytesTo64(new Uint8Array(wrapped)),body:bytesTo64(new Uint8Array(body))};
}
export async function decryptReply(packet:any,jwk:JsonWebKey,jobId:string){
  if(packet?.format!=='writer-encrypted-reply'||packet.v!==1||packet.jobId!==jobId)throw Error('回复不属于当前请求。');
  const privateKey=await crypto.subtle.importKey('jwk',jwk,{name:'RSA-OAEP',hash:'SHA-256'},false,['decrypt']);
  const raw=await crypto.subtle.decrypt({name:'RSA-OAEP'},privateKey,from64(packet.key)),key=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['decrypt']);
  const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(packet.iv),additionalData:new TextEncoder().encode('author-writing:'+jobId)},key,from64(packet.body));
  return JSON.parse(new TextDecoder().decode(plaintext));
}
