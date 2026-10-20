import {ownerOf,AppError} from '../../../lib/store';
import {service} from '../../../lib/service';
export async function POST(r:Request){try{const owner=ownerOf(r);const origin=r.headers.get('origin');if(origin&&origin!==new URL(r.url).origin)throw new AppError(403,'不接受其他网站的修改请求');const body=await r.text();if(body.length>32*1024*1024)throw new AppError(413,'请求过大');return Response.json(await service(owner,JSON.parse(body)),{headers:{'Cache-Control':'no-store'}});}catch(e:any){return Response.json({error:e.message},{status:e.status||400,headers:{'Cache-Control':'no-store'}});}}
