import {PNG} from 'pngjs';
import jpeg from 'jpeg-js';
import decodeWebp,{init as initWebp} from '@jsquash/webp/decode.js';
import {decodePng} from './png-decode.mjs';
const MAX_PIXELS=4200000;
let webpReady;
export function setWebpModule(module){if(!webpReady)webpReady=initWebp(module);return webpReady}
export function imageHeader(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let mime,width,height;
 if(bytes.length>=33&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n)){mime='image/png';width=v.getUint32(16);height=v.getUint32(20);if(v.getUint32(8)!==13||String.fromCharCode(...bytes.slice(12,16))!=='IHDR')throw Error('PNG 文件头无效');if(bytes[28]!==0)throw Error('请另存为普通 PNG 后投稿，原图仍保留');let p=8;while(p+12<=bytes.length){const n=v.getUint32(p);if(n>bytes.length-p-12)throw Error('PNG 图片不完整');if(String.fromCharCode(...bytes.slice(p+4,p+8))==='acTL')throw Error('共享图片暂不接受动画');p+=n+12}}
 else if(bytes.length>=30&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'){
  mime='image/webp';const type=String.fromCharCode(...bytes.slice(12,16));if(type==='VP8X'){if(bytes[20]&2)throw Error('共享图片暂不接受动画');width=1+bytes[24]+bytes[25]*256+bytes[26]*65536;height=1+bytes[27]+bytes[28]*256+bytes[29]*65536}
  else if(type==='VP8L'&&bytes[20]===47){width=1+bytes[21]+((bytes[22]&63)<<8);height=1+(bytes[22]>>6)+(bytes[23]<<2)+((bytes[24]&15)<<10)}
  else if(type==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){width=v.getUint16(26,true)&16383;height=v.getUint16(28,true)&16383}
 }else if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216){mime='image/jpeg';let p=2;while(p+8<bytes.length){if(bytes[p++]!==255)continue;const m=bytes[p++];if(m===217||m===218)break;if(m===216||m===1||m>=208&&m<=215)continue;const n=v.getUint16(p);if(n<2||p+n>bytes.length)break;if([192,193,194].includes(m)){height=v.getUint16(p+3);width=v.getUint16(p+5);break}p+=n}}
 if(!width||!height||width>8192||height>8192||width*height>MAX_PIXELS)throw Error('共享图片需在 420 万像素以内，请在预览中缩小共享副本；本机原图保留');return {mime,width,height};
}
export async function sanitizeImage(bytes){
 const header=imageHeader(bytes);let decoded;
 try{
  if(header.mime==='image/png')decoded=decodePng(Buffer.from(bytes));
  else if(header.mime==='image/jpeg')decoded=jpeg.decode(bytes,{useTArray:true,formatAsRGBA:true,maxResolutionInMP:4.2,maxMemoryUsageInMB:48,tolerantDecoding:false});
  else {if(!webpReady)throw Error('WebP 解码未就绪');await webpReady;decoded=await decodeWebp(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))}
 }catch{throw Error('图片无法完整解码，请换用有效的 PNG / JPG / WebP 文件')}
 if(decoded.width!==header.width||decoded.height!==header.height||decoded.data.length!==header.width*header.height*4)throw Error('图片像素信息不一致');
 const clean=new Uint8Array(PNG.sync.write({width:header.width,height:header.height,data:Buffer.from(decoded.data)},{colorType:6,deflateLevel:6}));
 if(clean.length>15*1024*1024)throw Error('安全共享副本超过 15MB，请缩小后再分享');
 const scale=Math.min(1,320/Math.max(header.width,header.height)),width=Math.max(1,Math.round(header.width*scale)),height=Math.max(1,Math.round(header.height*scale)),pixels=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const src=(Math.min(header.height-1,Math.floor(y/scale))*header.width+Math.min(header.width-1,Math.floor(x/scale)))*4;for(let c=0;c<4;c++)pixels[(y*width+x)*4+c]=decoded.data[src+c]}
 const thumbnail=new Uint8Array(PNG.sync.write({width,height,data:pixels},{colorType:6,deflateLevel:6}));return {...header,mime:'image/png',clean,thumbnail};
}
