// 只接收用户主动打开的配对窗口；不扫描页面，不在后台同步资料。
export function createPeer({role,peerUrl,onPacket,onStatus=()=>{},onNotice=()=>{}},w=window){
 const other=role==='cardstudio'?'archive':'cardstudio',origin=w.location.origin;
 const params=new URLSearchParams(w.location.hash.slice(1));
 let peer=null,token='',ready=false;
 function secret(){const a=new Uint8Array(24);w.crypto.getRandomValues(a);return [...a].map(x=>x.toString(16).padStart(2,'0')).join('');}
 function post(type,extra={}){if(!peer||peer.closed)throw new Error('对方窗口已关闭，请重新打开配对');peer.postMessage({channel:'cardstudio-chekaji-v1',type,role,token,...extra},origin==='null'?'*':origin);}
 function changed(value){ready=value;onStatus(value?'已连接，可手动发送':'尚未连接');}
 const initial=params.get('pair');
 if(w.opener&&params.get('from')===other&&/^[a-f0-9]{48}$/.test(initial||'')){peer=w.opener;token=initial;post('hello');}
 async function receive(event){
  const message=event.data;
  if(!peer||event.source!==peer||!message||message.channel!=='cardstudio-chekaji-v1'||message.role!==other||message.token!==token)return;
  if(origin!=='null'&&event.origin!==origin)return;
  if(message.type==='hello'){changed(true);post('ready');return;}
  if(message.type==='ready'){changed(true);return;}
  if(!ready)return;
  if(message.type==='packet'){
   try{await onPacket(message.packet);post('received');}catch(e){post('rejected',{error:String(e.message||e).slice(0,250)});}
  }else if(message.type==='received')onNotice('对方已收到，等待接收端确认');
  else if(message.type==='rejected')onNotice(message.error||'对方暂时无法接收，请稍后再试');
 }
 w.addEventListener('message',receive);
 return {
  connect(){token=secret();changed(false);const url=new URL(peerUrl,w.location.href);url.hash=new URLSearchParams({pair:token,from:role}).toString();peer=w.open(url.href,'cardstudio_chekaji_'+token.slice(0,12));if(!peer)throw new Error('浏览器阻止了新窗口，请允许此文件打开窗口后重试');onStatus('正在连接对方窗口…');},
  send(packet){if(!ready)throw new Error('请先打开对方窗口并等待连接成功');post('packet',{packet});},
  get connected(){return ready&&!!peer&&!peer.closed;},
  dispose(){w.removeEventListener('message',receive);peer=null;ready=false;}
 };
}
