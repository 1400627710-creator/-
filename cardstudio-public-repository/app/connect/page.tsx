import {requireChatGPTUser} from '../chatgpt-auth';
import {env} from 'cloudflare:workers';
import Connect from './connect-client';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string>>}){
  const params=await searchParams;const query=new URLSearchParams(params).toString();
  const user=await requireChatGPTUser('/connect?'+query);
  if(user.email.toLowerCase()!==String((env as any).ADMIN_EMAIL||'').toLowerCase())return <main className="hub"><h1>需要管理员权限</h1><p>当前账号可以共创投稿，公共发布与审核由仓库管理员操作。</p><a href="/community/index.html">打开社区版</a></main>;
  return <Connect state={params.state||''} challenge={params.challenge||''} callback={params.callback||''}/>;
}
