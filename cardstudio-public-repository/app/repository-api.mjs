import './glossary-format.mjs';
const format=globalThis.CARDSTUDIO_GLOSSARY;
const MAX_IMAGE=15*1024*1024,MAX_JSON=5*1024*1024;
const categories=['template','frame','icon','decoration','illustration','other'];
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const sha=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value))].map(b=>b.toString(16).padStart(2,'0')).join('');
const random=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const text=(value,max,label)=>{if(value==null)return '';if(typeof value!=='string')fail(label+'格式无效');if(value.length>max)fail(label+'过长');return value};
const stableId=async(kind,name)=>kind+'.'+(await sha(format.key(name))).slice(0,24);
function db(env){if(!env.DB||!env.BUCKET)fail('公共仓库尚未完成部署',503);return env.DB}
function stmt(env,sql,...values){return db(env).prepare(sql).bind(...values)}
async function all(env,sql,...values){return (await stmt(env,sql,...values).all()).results||[]}
async function first(env,sql,...values){return stmt(env,sql,...values).first()}
async function bodyBytes(request,max){
  if(Number(request.headers.get('content-length'))>max)fail('上传文件超过大小上限',413);
  const reader=request.body?.getReader();if(!reader)return new Uint8Array();let size=0,chunks=[];
  while(true){const result=await reader.read();if(result.done)break;size+=result.value.length;if(size>max){await reader.cancel();fail('上传文件超过大小上限',413)}chunks.push(result.value)}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}return bytes;
}
async function readJson(request){if(!request.headers.get('content-type')?.includes('application/json'))fail('请使用 JSON 提交',415);try{return JSON.parse(new TextDecoder().decode(await bodyBytes(request,MAX_JSON)))}catch(error){if(error.status)throw error;fail('提交内容不是有效 JSON')}}
async function actor(request,env){
  const token=request.headers.get('authorization')?.replace(/^Bearer /,'');
  if(token){const session=await first(env,'SELECT * FROM sessions WHERE id=? AND expires_at>?',await sha(token),Date.now());if(session)return {id:session.actor_id,name:'管理员',admin:true};}
  const id=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email');
  if(id&&email){let name='共创作者';try{name=decodeURIComponent(request.headers.get('oai-authenticated-user-full-name')||'')||name}catch{}return {id,name:name.slice(0,120),admin:!!env.ADMIN_EMAIL&&email.toLowerCase()===String(env.ADMIN_EMAIL).toLowerCase()};}
  return null;
}
async function requireActor(request,env,admin=false){const user=await actor(request,env);if(!user)fail('请先登录后投稿',401);if(admin&&!user.admin)fail('只有管理员能审核和发布公共资料',403);return user}
async function quota(env,user,count=1){if(user.admin)return;if(count>40)fail('一次最多投稿 40 项',429);const id=user.id+':'+now().slice(0,10);const row=await stmt(env,'INSERT INTO counters (id,count) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET count=count+excluded.count WHERE count+excluded.count<=40 RETURNING count',id,count).first();if(!row||row.count>40)fail('今日投稿数量已达上限，请明天再提交',429)}
function publicRecord(row){const payload=JSON.parse(row.payload);return {...payload,publicId:row.id,publicRevision:row.revision,author:row.author,updatedAt:row.updated_at,...(row.blob_key?{url:'/api/repository/files/'+row.blob_key,thumbnailUrl:'/api/repository/files/'+(payload.thumbnailKey||row.blob_key),hash:row.blob_key}:{} )}}
async function catalog(env){const rows=await all(env,'SELECT * FROM records ORDER BY kind,name_key');const terms=rows.filter(x=>x.kind==='term').map(publicRecord),assets=rows.filter(x=>x.kind==='asset').map(publicRecord),revision=await sha(JSON.stringify(rows.map(x=>[x.id,x.revision,x.hash])));return {schema:'cardstudio-public-catalog-v1',revision,updatedAt:rows.reduce((v,r)=>r.updated_at>v?r.updated_at:v,''),terms,assets,counts:{terms:terms.length,assets:assets.length}}}
async function submit(env,user,kind,items,prepaid=false){
  if(!items.length)fail('请选择需要投稿的资料');if(items.length>100)fail('一次最多投稿 100 项');
  const count=await first(env,"SELECT COUNT(*) AS n FROM submissions WHERE status='pending'");if(count.n+items.length>500)fail('待审核区已满，请联系管理员处理',429);
  if(!prepaid)await quota(env,user,items.length);const statements=[],result=[];
  for(const item of items){const hash=await sha(JSON.stringify(item.payload)),existing=await first(env,'SELECT id,status FROM submissions WHERE kind=? AND hash=? AND actor_id=?',kind,hash,user.id);if(existing){result.push({...existing,reused:true});continue}
    const id=random();statements.push(stmt(env,"INSERT INTO submissions(id,kind,name,payload,blob_key,hash,actor_id,author,status,created_at) VALUES (?,?,?,?,?,?,?,?,'pending',?) ON CONFLICT(kind,hash,actor_id) DO NOTHING",id,kind,item.payload.name,JSON.stringify(item.payload),item.blobKey||null,hash,user.id,user.name,now()));result.push({id,status:'pending',reused:false});
  }
  if(statements.length){const guard=random();statements.push(stmt(env,"INSERT INTO mutation_guards(id,valid) VALUES(?,CASE WHEN (SELECT COUNT(*) FROM submissions WHERE status='pending')<=500 THEN 1 ELSE 0 END)",guard),stmt(env,'DELETE FROM mutation_guards WHERE id=?',guard));await db(env).batch(statements)}return {submissions:result,message:'投稿已保存，等待私人版审核'};
}
async function publish(env,user,kind,items,expected={},reviewId=null,author=user.name){
  if(!items.length||items.length>100)fail('一次发布 1 至 100 项资料');const statements=[],output=[],guards=[],stamp=now();
  if(reviewId){const gate=random();guards.push(gate);statements.push(stmt(env,"INSERT INTO mutation_guards(id,valid) VALUES (?,CASE WHEN EXISTS(SELECT 1 FROM submissions WHERE id=? AND status='pending') THEN 1 ELSE 0 END)",gate,reviewId))}
  for(const item of items){const id=await stableId(kind,item.payload.name),nameKey=format.key(item.payload.name),payload={...item.payload,id},hash=await sha(JSON.stringify(payload)),old=await first(env,'SELECT * FROM records WHERE id=?',id);
    if(old?.hash===hash){output.push({id,revision:old.revision,reused:true});continue}
    const wanted=Number(expected[id]||0);if(old&&wanted!==old.revision||!old&&wanted!==0)fail('公共资料已更新，请刷新后核对同名设计：'+payload.name,409);
    const gate=random(),revision=(old?.revision||0)+1;guards.push(gate);
    statements.push(stmt(env,'INSERT INTO mutation_guards(id,valid) VALUES (?,CASE WHEN (SELECT revision FROM records WHERE id=?) IS ? THEN 1 ELSE 0 END)',gate,id,old?.revision||null));
    statements.push(stmt(env,'INSERT INTO records(id,kind,name_key,name,payload,blob_key,hash,revision,author,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,payload=excluded.payload,blob_key=excluded.blob_key,hash=excluded.hash,revision=excluded.revision,author=excluded.author,updated_at=excluded.updated_at',id,kind,nameKey,payload.name,JSON.stringify(payload),item.blobKey||null,hash,revision,author,stamp));
    statements.push(stmt(env,'INSERT INTO versions(id,record_id,revision,payload,blob_key,hash,updated_at) VALUES(?,?,?,?,?,?,?)',id+':'+revision,id,revision,JSON.stringify(payload),item.blobKey||null,hash,stamp));output.push({id,revision,reused:false});
  }
  const guard=random();guards.push(guard);statements.push(stmt(env,"INSERT INTO mutation_guards(id,valid) VALUES (?,CASE WHEN (SELECT COUNT(*) FROM records WHERE kind='term')<=5000 AND (SELECT COUNT(*) FROM records WHERE kind='asset')<=1000 AND (SELECT COALESCE(SUM(LENGTH(CAST(payload AS BLOB))+6*LENGTH(CAST(author AS BLOB))+LENGTH(id)+180),0) FROM records WHERE kind='term')<=4194304 THEN 1 ELSE 0 END)",guard));
  if(reviewId)statements.push(stmt(env,"UPDATE submissions SET status='published',decided_at=? WHERE id=? AND status='pending'",stamp,reviewId));
  for(const id of guards)statements.push(stmt(env,'DELETE FROM mutation_guards WHERE id=?',id));
  try{await db(env).batch(statements)}catch(error){if(/constraint|unique|guard/i.test(error.message))fail('仓库已发生变化或容量已满，已保留原资料，请刷新后重试',409);throw error}return {published:output,message:'已发布到公共仓库'};
}
function imageDimensions(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let mime,w,h;
  if(bytes.length>=24&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n)){mime='image/png';w=view.getUint32(16);h=view.getUint32(20)}
  else if(bytes.length>=12&&new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP'){
    mime='image/webp';const kind=new TextDecoder().decode(bytes.slice(12,16));
    if(kind==='VP8X'&&bytes.length>=30){w=1+bytes[24]+bytes[25]*256+bytes[26]*65536;h=1+bytes[27]+bytes[28]*256+bytes[29]*65536}
    else if(kind==='VP8L'&&bytes.length>=25&&bytes[20]===47){w=1+bytes[21]+((bytes[22]&63)<<8);h=1+(bytes[22]>>6)+(bytes[23]<<2)+((bytes[24]&15)<<10)}
    else if(kind==='VP8 '&&bytes.length>=30&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){w=view.getUint16(26,true)&16383;h=view.getUint16(28,true)&16383}
  }else if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216){mime='image/jpeg';let p=2;while(p+8<bytes.length){if(bytes[p++]!==255)continue;const marker=bytes[p++];if(marker===217||marker===218)break;if(marker===216||marker===1||marker>=208&&marker<=215)continue;const length=view.getUint16(p);if(length<2||p+length>bytes.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){h=view.getUint16(p+3);w=view.getUint16(p+5);break}p+=length}}
  if(!w||!h||w>16000||h>16000||w*h>60000000)fail('图片无效或像素尺寸过大；仅接受 PNG / JPG / WebP');return {mime,width:w,height:h};
}
async function readAsset(request,env){
  const bytes=await bodyBytes(request,MAX_IMAGE+64*1024),form=await new Request(request.url,{method:'POST',headers:{'Content-Type':request.headers.get('content-type')||''},body:bytes}).formData();
  const file=form.get('file');if(!file||typeof file==='string'||file.size>MAX_IMAGE)fail('请选择 15MB 内的图片文件',413);const image=new Uint8Array(await file.arrayBuffer()),dimensions=imageDimensions(image),hash=await sha(image);let meta;try{meta=JSON.parse(String(form.get('metadata')||'{}'))}catch{fail('素材信息格式无效')}
  const name=text(meta.name,120,'素材名称').trim();if(!name)fail('素材名称不能为空');const payload={id:'asset.'+hash.slice(0,24),name,category:categories.includes(meta.category)?meta.category:'other',tags:text(meta.tags,500,'标签'),description:text(meta.description,4000,'素材说明'),...dimensions,bytes:image.length,hash};
  const thumbnail=form.get('thumbnail');if(thumbnail&&typeof thumbnail!=='string'){if(thumbnail.size>512*1024)fail('缩略图过大');const bytes=new Uint8Array(await thumbnail.arrayBuffer()),size=imageDimensions(bytes);if(size.width>640||size.height>640)fail('缩略图尺寸过大');payload.thumbnailKey=await sha(bytes);await env.BUCKET.put(payload.thumbnailKey,bytes,{httpMetadata:{contentType:size.mime}})}
  await env.BUCKET.put(hash,image,{httpMetadata:{contentType:dimensions.mime}});return {payload,blobKey:hash,expected:meta.expectedRevisions||{}};
}
async function fileResponse(request,env,key){
  if(!/^[a-f0-9]{64}$/.test(key))fail('素材不存在',404);const publicRef=await first(env,"SELECT id FROM versions WHERE blob_key=? OR json_extract(payload,'$.thumbnailKey')=? LIMIT 1",key,key);
  if(!publicRef){const user=await requireActor(request,env);const pending=await first(env,"SELECT actor_id FROM submissions WHERE (blob_key=? OR json_extract(payload,'$.thumbnailKey')=?) AND (actor_id=? OR ?=1) LIMIT 1",key,key,user.id,user.admin?1:0);if(!pending)fail('素材不存在',404)}
  const object=await env.BUCKET.get(key);if(!object)fail('素材不存在',404);const headers=new Headers({'Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff','Cache-Control':publicRef?'public,max-age=31536000,immutable':'private,no-store'});object.writeHttpMetadata(headers);return new Response(object.body,{headers});
}
export async function handleRepository(request,env){
  try{
    const url=new URL(request.url),path=url.pathname.replace(/^\/api\/repository\/?/,'');db(env);
    const origin=request.headers.get('Origin');if(['POST','DELETE'].includes(request.method)&&origin&&origin!==url.origin)fail('请从公共仓库页面提交资料',403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':url.origin,'Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Max-Age':'600'}});
    if(request.method==='GET'){
      if(path==='health')return json({ok:true,service:'cardstudio-public-repository',version:'1.0.0'});
      if(path==='catalog')return json(await catalog(env));
      if(path==='glossary'){const data=await catalog(env);return json({schema:'cardstudio-glossary-v1',version:data.revision,source:'CardStudio 公共词条库',publishedAt:data.updatedAt,terms:data.terms})}
      if(path==='session'){const user=await actor(request,env);return json({authenticated:!!user,admin:!!user?.admin,name:user?.name||'',signIn:'/signin-with-chatgpt?return_to=/community/index.html'})}
      if(path==='submissions'){const user=await requireActor(request,env);const rows=user.admin?await all(env,"SELECT * FROM submissions WHERE status='pending' ORDER BY created_at LIMIT 500"):await all(env,'SELECT * FROM submissions WHERE actor_id=? ORDER BY created_at DESC LIMIT 100',user.id);return json({submissions:rows.map(r=>({...JSON.parse(r.payload),sourceId:JSON.parse(r.payload).id,id:r.id,kind:r.kind,status:r.status,author:r.author,createdAt:r.created_at,...(r.blob_key?{url:'/api/repository/files/'+r.blob_key,thumbnailUrl:'/api/repository/files/'+(JSON.parse(r.payload).thumbnailKey||r.blob_key)}:{} )}))})}
      if(path.startsWith('files/'))return await fileResponse(request,env,path.slice(6));
    }
    if(request.method==='POST'){
      if(path==='pair'){
        const user=await requireActor(request,env,true),data=await readJson(request);if(!/^[A-Za-z0-9_-]{43}$/.test(data.challenge)||!/^[A-Za-z0-9_-]{20,96}$/.test(data.state))fail('连接信息无效');
        const code=random()+random();await stmt(env,'INSERT INTO pairing(id,challenge,state,actor_id,expires_at,consumed) VALUES(?,?,?,?,?,0)',await sha(code),data.challenge,data.state,user.id,Date.now()+300000).run();return json({code,state:data.state});
      }
      if(path==='token'){
        const data=await readJson(request),id=await sha(text(data.code,100,'连接码')),row=await first(env,'SELECT * FROM pairing WHERE id=? AND consumed=0 AND expires_at>?',id,Date.now());if(!row||data.state!==row.state||typeof data.verifier!=='string'||data.verifier.length<43||data.verifier.length>128)fail('连接已过期，请重新连接',401);
        const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data.verifier))),challenge=btoa(String.fromCharCode(...digest)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');if(challenge!==row.challenge)fail('连接验证失败',401);
        const claim=await stmt(env,'UPDATE pairing SET consumed=1 WHERE id=? AND consumed=0 AND expires_at>?',id,Date.now()).run();if(claim.meta.changes!==1)fail('连接码已使用',401);
        const token=random()+random(),expiresAt=Date.now()+30*86400000;await stmt(env,'INSERT INTO sessions(id,actor_id,expires_at) VALUES(?,?,?)',await sha(token),row.actor_id,expiresAt).run();return json({token,expiresAt});
      }
      if(path==='terms/submit'||path==='terms/publish'){
        const publishing=path.endsWith('/publish'),user=await requireActor(request,env,publishing),data=await readJson(request);const terms=format.normalizePack({schema:'cardstudio-glossary-v1',terms:data.terms}).terms,items=terms.map(payload=>({payload}));return json(publishing?await publish(env,user,'term',items,data.expectedRevisions):await submit(env,user,'term',items));
      }
      if(path==='assets/submit'||path==='assets/publish'){
        const publishing=path.endsWith('/publish'),user=await requireActor(request,env,publishing);await quota(env,user);const item=await readAsset(request,env);return json(publishing?await publish(env,user,'asset',[item],item.expected):await submit(env,user,'asset',[item],true));
      }
      if(path.startsWith('review/')){
        const user=await requireActor(request,env,true),data=await readJson(request),id=path.slice(7),row=await first(env,"SELECT * FROM submissions WHERE id=? AND status='pending'",id);if(!row)fail('投稿已处理或不存在',409);
        if(data.decision==='reject'){await stmt(env,"UPDATE submissions SET status='rejected',decided_at=? WHERE id=? AND status='pending'",now(),id).run();return json({status:'rejected'})}
        if(data.decision!=='publish')fail('审核操作无效');return json(await publish(env,user,row.kind,[{payload:JSON.parse(row.payload),blobKey:row.blob_key}],data.expectedRevisions,id,row.author));
      }
      if(path==='logout'){const token=request.headers.get('authorization')?.replace(/^Bearer /,'');if(token)await stmt(env,'DELETE FROM sessions WHERE id=?',await sha(token)).run();return json({ok:true})}
    }
    if(request.method==='DELETE'&&path.startsWith('records/')){
      await requireActor(request,env,true);const id=path.slice(8),revision=Number(url.searchParams.get('revision'));const guard=random(),batch=[stmt(env,'INSERT INTO mutation_guards(id,valid) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM records WHERE id=? AND revision=?) THEN 1 ELSE 0 END)',guard,id,revision),stmt(env,'DELETE FROM records WHERE id=?',id)];if(url.searchParams.get('purge')==='1')batch.push(stmt(env,'DELETE FROM versions WHERE record_id=?',id));batch.push(stmt(env,'DELETE FROM mutation_guards WHERE id=?',guard));try{await db(env).batch(batch)}catch{fail('资料版本已变化，请刷新后重试',409)}return json({ok:true});
    }
    return json({error:'仓库接口不存在'},404);
  }catch(error){return json({error:error.status?error.message:'仓库暂时不可用，请稍后重试'},error.status||500)}
}
