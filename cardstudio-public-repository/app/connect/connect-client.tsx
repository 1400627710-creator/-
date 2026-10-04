'use client';
import {useState} from 'react';
export default function Connect({state,challenge,callback}:{state:string;challenge:string;callback:string}){
 const [status,setStatus]=useState('连接后，私人版可直接发布词条、素材并审核社区投稿。'),[busy,setBusy]=useState(false);
 async function connect(){setBusy(true);try{const target=new URL(callback);if(target.protocol!=='http:'||!['127.0.0.1','localhost'].includes(target.hostname)||target.pathname!=='/api/repository/connect/callback')throw Error('连接地址无效，请从私人版发起连接');const response=await fetch('/api/repository/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state,challenge})}),data=await response.json();if(!response.ok)throw Error(data.error);target.searchParams.set('state',state);target.searchParams.set('code',data.code);location.href=target.href}catch(error){setStatus((error as Error).message);setBusy(false)}}
 return <main className="hub"><span className="eyebrow">CardStudio · 公共资料仓库</span><h1>连接这台电脑的私人版</h1><p>{status}</p><button disabled={busy} onClick={connect}>{busy?'正在连接…':'连接私人版'}</button><p className="muted">公共仓库地址已内置。此操作只授权这台电脑，管理凭据不会进入社区版或制卡项目。</p></main>;
}
