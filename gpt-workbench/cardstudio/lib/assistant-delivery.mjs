const encoder=new TextEncoder();
const to64=bytes=>{let text='';for(const byte of new Uint8Array(bytes))text+=String.fromCharCode(byte);return btoa(text);};
const from64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
export const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
export async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(typeof value==='string'?value:JSON.stringify(value)))),v=>v.toString(16).padStart(2,'0')).join('');}
export async function makeKeys(){
 const pair=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
 return {publicKey:await crypto.subtle.exportKey('jwk',pair.publicKey),privateKey:await crypto.subtle.exportKey('jwk',pair.privateKey)};
}
export async function encryptReply(value,publicKey,jobId){
 const pub=await crypto.subtle.importKey('jwk',publicKey,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']),key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']),iv=crypto.getRandomValues(new Uint8Array(12));
 const body=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode('kadi:'+jobId)},key,encoder.encode(JSON.stringify(value)));
 const wrapped=await crypto.subtle.encrypt({name:'RSA-OAEP'},pub,await crypto.subtle.exportKey('raw',key));
 return {format:'kadi-encrypted-reply',version:1,jobId,body:to64(body),key:to64(wrapped),iv:to64(iv)};
}
export async function decryptReply(packet,privateKey,jobId){
 if(packet?.format!=='kadi-encrypted-reply'||packet.version!==1||packet.jobId!==jobId)throw Error('回复不属于本次卡递请求');
 const priv=await crypto.subtle.importKey('jwk',privateKey,{name:'RSA-OAEP',hash:'SHA-256'},false,['decrypt']);
 const raw=await crypto.subtle.decrypt({name:'RSA-OAEP'},priv,from64(packet.key)),key=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['decrypt']);
 const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(packet.iv),additionalData:encoder.encode('kadi:'+jobId)},key,from64(packet.body));return JSON.parse(new TextDecoder().decode(bytes));
}
