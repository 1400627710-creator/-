import React, {useState,useEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {HostBridge,type ViewState} from './HostBridge.js';
import type {Project,Chapter,Job,Memory,Mode,Range} from '../shared/types.js';

const bridge=new HostBridge();
const uid=()=>globalThis.crypto?.randomUUID?.()||'req-'+Date.now()+'-'+Math.random().toString(36).slice(2);
const sorted=<T extends{order:number}>(items:T[])=>[...items].sort((a,b)=>a.order-b.order);
const download=(filename:string,body:string,type='text/plain;charset=utf-8')=>{const blob=new Blob([body],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);};
const filename=(name:string)=>name.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,100)||'小说';
const modeName:Record<Mode,string>={ask:'问 AI',polish:'润色',ghostwrite:'代笔',learn:'学习原稿',suggest:'片段建议'};
const memoryType:Record<Memory['type'],string>={plot:'剧情',world:'世界',social:'社会',character:'人物',item:'物品',style:'文风',knowledge:'人物所知'};
const statusName:Record<Memory['status'],string>={auto:'自动依据',pending:'待你确认',confirmed:'已确认',rejected:'已停用',stale:'出处已改变'};

function Difference({before,after}:{before:string,after:string}) {
  let head=0;while(head<Math.min(before.length,after.length)&&before[head]===after[head])head++;
  let tail=0;while(tail<Math.min(before.length-head,after.length-head)&&before[before.length-1-tail]===after[after.length-1-tail])tail++;
  return <div className="diff"><div><small>原文</small><p>{before.slice(0,head)}<del>{before.slice(head,before.length-tail)}</del>{tail?before.slice(-tail):''}</p></div><div><small>候选</small><p>{after.slice(0,head)}<ins>{after.slice(head,after.length-tail)}</ins>{tail?after.slice(-tail):''}</p></div></div>;
}

function App() {
  const [view,setView]=useState<ViewState>();const [projectId,setProjectId]=useState('');const [chapterId,setChapterId]=useState('');
  const [draft,setDraft]=useState('');const [selection,setSelection]=useState<Range>({start:0,end:0});
  const [prompt,setPrompt]=useState('');const [mode,setMode]=useState<Mode>('ask');const [tab,setTab]=useState<'chat'|'memory'>('chat');
  const [saveStatus,setSaveStatus]=useState('正在打开本机存稿…');const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);const [history,setHistory]=useState(false);const [editMessageId,setEditMessageId]=useState<string>();
  const [focus,setFocus]=useState(false);const [fontSize,setFontSize]=useState(18);const [ready,setReady]=useState(false);
  const [proactiveChoice,setProactiveChoice]=useState<boolean|undefined>();
  const [dialog,setDialog]=useState<{title:string,value:string,multiline?:boolean,run:(s:string)=>Promise<void>}|null>(null);
  const editor=useRef<HTMLTextAreaElement>(null),scroll=useRef<HTMLDivElement>(null),importer=useRef<HTMLInputElement>(null),restorer=useRef<HTMLInputElement>(null),replyImporter=useRef<HTMLInputElement>(null);
  const latest=useRef({draft:'',projectId:'',chapterId:'',rev:0,dirty:false});
  const saveFlight=useRef<Promise<void>|undefined>(undefined);const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const lastTyped=useRef(0),lastAutomaticRev=useRef(0);const proactiveFailed=useRef(false);
  const newParagraph=useRef(false);
  const latestViewRevision=useRef(-1);
  const project=view?.database.projects.find(p=>p.id===projectId);const chapter=project?.chapters.find(c=>c.id===chapterId);
  const projectRef=useRef<Project|undefined>(undefined);projectRef.current=project;
  const updateView=(state:ViewState)=>{
    if(state.database.revision<latestViewRevision.current)return;latestViewRevision.current=state.database.revision;
    setView(state);
    const live=latest.current;const p=state.database.projects.find(p=>p.id===live.projectId),c=p?.chapters.find(c=>c.id===live.chapterId);
    if(c&&!live.dirty){live.rev=c.rev;live.draft=c.text;setDraft(c.text);}
  };
  useEffect(()=>{
    bridge.onState=updateView;bridge.onStatus=setNotice;
    bridge.initialize().then(()=>{setReady(true);setSaveStatus('本机存稿已连接');}).catch(e=>setError(e.message));
    const poll=setInterval(()=>{if(bridge.connected)bridge.call('snapshot',{}).catch(()=>{});},2500);
    return()=>{clearInterval(poll);if(timer.current)clearTimeout(timer.current);};
  },[]);
  useEffect(()=>{
    if(!view)return;
    if(!view.database.projects.some(p=>p.id===projectId)&&view.database.projects.length)selectProject(sorted(view.database.projects)[0]);
  },[view?.database.projects.length]);
  useEffect(()=>{scroll.current?.scrollTo({top:scroll.current.scrollHeight,behavior:'smooth'});},[project?.messages.length]);
  useEffect(()=>{
    const listener=(e:BeforeUnloadEvent)=>{if(latest.current.dirty){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',listener);return()=>window.removeEventListener('beforeunload',listener);
  },[]);
  const guard=async(fn:()=>Promise<void>)=>{setError('');setBusy(true);try{await fn();}catch(e:any){setError(e.message||'操作失败，请重试。');}finally{setBusy(false);}};
  async function flush():Promise<void> {
    if(timer.current)clearTimeout(timer.current);
    if(saveFlight.current){await saveFlight.current;if(latest.current.dirty)return flush();return;}
    if(!latest.current.dirty||!latest.current.chapterId)return;
    const saving={...latest.current};
    const flight=(async()=>{
      try{
        setSaveStatus('正在保存…');
        const result=await bridge.call('save',{projectId:saving.projectId,chapterId:saving.chapterId,baseRev:saving.rev,text:saving.draft,requestId:uid()});
        const live=latest.current;
        if(live.chapterId===saving.chapterId){live.rev=result.rev;live.dirty=live.draft!==saving.draft;setSaveStatus(live.dirty?'待保存':'已存本机');}
      }catch(e:any){setSaveStatus('保存失败 · 未保存稿仍在窗口');setError(e.message);throw e;}
    })();saveFlight.current=flight;
    try{await flight;}finally{saveFlight.current=undefined;}
    if(latest.current.dirty)await flush();
  }
  function changeDraft(text:string) {
    if((text.match(/\n/g)||[]).length>(latest.current.draft.match(/\n/g)||[]).length)newParagraph.current=true;
    setDraft(text);latest.current.draft=text;latest.current.dirty=true;setSaveStatus('待保存');lastTyped.current=Date.now();
    if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>void flush().catch(()=>{}),650);
  }
  function selectChapter(p:Project,c:Chapter) {
    newParagraph.current=false;lastTyped.current=0;lastAutomaticRev.current=0;setProactiveChoice(undefined);
    latest.current={draft:c.text,projectId:p.id,chapterId:c.id,rev:c.rev,dirty:false};setProjectId(p.id);setChapterId(c.id);setDraft(c.text);setSelection({start:0,end:0});setSaveStatus('已存本机');setEditMessageId(undefined);
  }
  function selectProject(p:Project){const c=sorted(p.chapters)[0];if(c)selectChapter(p,c);else{setProjectId(p.id);setChapterId('');setDraft('');}}
  async function switchTo(p:Project,c?:Chapter){await flush();selectChapter(p,c||sorted(p.chapters)[0]);}
  function captureSelection(){if(editor.current)setSelection({start:editor.current.selectionStart,end:editor.current.selectionEnd});}
  async function send(chosenMode=mode,automatic=false,overridePrompt?:string) {
    await flush();const live=latest.current;if(!live.chapterId)throw Error('请先新建小说。');
    const range=automatic?{start:Math.max(0,live.draft.length-1000),end:live.draft.length}:selection;
    const result=await bridge.call('request',{projectId:live.projectId,chapterId:live.chapterId,baseRev:live.rev,selection:range,prompt:automatic?'针对新写片段只给一条必要的小建议，并提取有准确出处的设定。':overridePrompt||prompt||({polish:'消除歧义和重复，保留原意与文风。',ghostwrite:'根据作者原文与意图补充过渡；依据不足先问。',learn:'阅读本次提供的原文，提取有出处的设定与作者文风；没有提供的范围说明尚未读取。'} as any)[chosenMode]||'请分析所选片段。',mode:chosenMode,automatic,requestId:uid(),editMessageId:automatic||overridePrompt!==undefined?undefined:editMessageId});
    if(!automatic){if(overridePrompt===undefined){setPrompt('');setEditMessageId(undefined);}setTab('chat');}
    try{await bridge.trigger(result.jobId);setNotice('已提交给当前 GPT，回答会回到右侧。');}
    catch(e:any){if(automatic)proactiveFailed.current=true;setNotice('请求已存为待办。');throw e;}
  }
  useEffect(()=>{
    const automaticTimer=setInterval(()=>{
      const p=projectRef.current,live=latest.current;
      if(!p?.proactive.enabled||!bridge.canTrigger||proactiveFailed.current||document.visibilityState!=='visible'||!document.hasFocus()||live.dirty||!lastTyped.current||Date.now()-lastTyped.current<30000||Date.now()-p.proactive.lastRequest<300000||lastAutomaticRev.current===live.rev||!newParagraph.current||p.jobs.some(j=>['queued','processing'].includes(j.status)))return;
      lastAutomaticRev.current=live.rev;newParagraph.current=false;void send('suggest',true).catch((e:any)=>setError(e.message));
    },5000);return()=>clearInterval(automaticTimer);
  },[selection,prompt]);
  async function move(itemId:string,direction:number,isChapter:boolean) {
    const list=isChapter?sorted(project!.chapters):sorted(view!.database.projects);const index=list.findIndex(x=>x.id===itemId),target=index+direction;
    if(target<0||target>=list.length)return;const ids=list.map(x=>x.id);[ids[index],ids[target]]=[ids[target],ids[index]];
    await bridge.call('reorder',{projectId:isChapter?projectId:undefined,ids,requestId:uid()});
  }
  const nameDialog=(title:string,value:string,run:(s:string)=>Promise<void>)=>setDialog({title,value,run});
  async function createNovel(title:string) {
    await flush();const r=await bridge.call('createProject',{name:title,requestId:uid()});
    const snapshot=await bridge.call('snapshot',{});void snapshot;setProjectId(r.id);latest.current.projectId=r.id;
    // The response state is authoritative; select it on the following render.
    const stateHolder=await getSnapshot();selectProject(stateHolder.database.projects.find(p=>p.id===r.id)!);
  }
  async function getSnapshot():Promise<ViewState>{let out!:ViewState;const old=bridge.onState;bridge.onState=s=>{out=s;old(s);};try{await bridge.call('snapshot',{});return out;}finally{bridge.onState=old;}}
  async function createChapter(title:string,text='') {
    await flush();const r=await bridge.call('createChapter',{projectId,name:title,text,requestId:uid()});const state=await getSnapshot();const p=state.database.projects.find(p=>p.id===projectId)!;selectChapter(p,p.chapters.find(c=>c.id===r.id)!);
  }
  async function importTextFiles(files:File[]) {
    if(!files.length)return;
    const bodies=await Promise.all(files.map(async f=>{const text=await f.text();if(text.length>2_000_000)throw Error('章节“'+f.name+'”过长，请拆分后再导入。');return text;}));
    await flush();let target=latest.current.projectId;let first='';
    const title=(f:File)=>f.name.replace(/\.[^.]+$/,'').slice(0,120)||'导入原稿';
    if(!target){const created=await bridge.call('createProject',{name:title(files[0]),requestId:uid()});target=created.id;const state=await getSnapshot();first=state.database.projects.find(p=>p.id===target)!.chapters[0].id;}
    let selected='';
    for(const [i,f] of files.entries()){
      const text=bodies[i];
      if(i===0&&first){await bridge.call('rename',{projectId:target,chapterId:first,name:title(f),requestId:uid()});await bridge.call('save',{projectId:target,chapterId:first,baseRev:1,text,requestId:uid()});selected=first;}
      else{const c=await bridge.call('createChapter',{projectId:target,name:title(f),text,requestId:uid()});if(!selected)selected=c.id;}
    }
    const state=await getSnapshot(),p=state.database.projects.find(p=>p.id===target)!;selectChapter(p,p.chapters.find(c=>c.id===selected)!);setNotice('原稿已导入本机，选中文字即可交流或润色。');
  }
  async function exportText(all=false) {
    await flush();const state=await getSnapshot();const projects=all?sorted(state.database.projects):state.database.projects.filter(p=>p.id===projectId);
    const text=projects.map(p=>p.name+'\n'+'='.repeat(24)+'\n\n'+sorted(p.chapters).map(c=>c.name+'\n\n'+c.text).join('\n\n')).join('\n\n'+'='.repeat(40)+'\n\n');
    download(all?'小说仓库-批量导出.txt':filename(project?.name||'小说')+'.txt','\ufeff'+text);
  }
  async function backup(){await flush();const r=await bridge.call('export',{projectId});download(filename(project!.name)+'-完整备份.json',JSON.stringify(r.backup,null,2),'application/json');}
  async function historyAction(direction:'undo'|'redo') {
    await flush();await bridge.call('history',{projectId,chapterId,baseRev:latest.current.rev,direction,requestId:uid()});setSelection({start:0,end:0});
  }
  const activeMessages=project?.messages.filter(m=>history||m.active)||[];
  const activeMemories=project?.memories||[];
  const pendingJobs=project?.jobs.filter(j=>['queued','processing'].includes(j.status))||[];
  const selectedText=draft.slice(selection.start,selection.end);
  const connectedModel=bridge.canTrigger?'当前 GPT 已连接':'请从 GPT 插件内打开 AI 交流';
  return <div className={'workspace'+(focus?' focus':'')}>
    <header className="topbar"><div className="brand"><span className="brandmark">文</span><strong>小说码字助手</strong><span className="edition">作者主导</span></div>
      <nav><button disabled={!chapter||busy} onClick={()=>guard(()=>historyAction('undo'))}>↶ 撤销</button><button disabled={!chapter||busy} onClick={()=>guard(()=>historyAction('redo'))}>↷ 重做</button><span className="divider"/><button disabled={!project} onClick={()=>guard(()=>exportText())}>导出本书</button><button disabled={!view?.database.projects.length} onClick={()=>guard(()=>exportText(true))}>批量导出</button><button disabled={!project} onClick={()=>guard(backup)}>备份工程</button><button onClick={()=>restorer.current?.click()}>恢复备份</button></nav>
      <div className="view-controls"><button title="调整字号" onClick={()=>setFontSize(n=>n>=24?16:n+2)}>Aa {fontSize}</button><button onClick={()=>setFocus(!focus)}>{focus?'退出专注':'专注'}</button><button onClick={()=>guard(()=>bridge.fullScreen())}>全屏</button></div></header>
    <div className="statusbar"><span className={'dot '+(ready?'green':'')}/><span>{saveStatus}</span><span className="status-spacer"/><span>{connectedModel}</span></div>
    {error&&<div className="alert" role="alert"><span>{error}</span>{latest.current.dirty&&<button onClick={()=>download(filename(chapter?.name||'未保存稿')+'-应急.txt',latest.current.draft)}>下载未保存稿</button>}<button onClick={()=>setError('')}>关闭</button></div>}
    {notice&&<div className="notice"><span>{notice}</span><button onClick={()=>setNotice('')}>×</button></div>}
    {view?.recovered&&<div className="alert">已从上一份有效本机存稿恢复；损坏的原档已保留。请核对最近一次改动并导出备份。</div>}
    {view?.warnings.map(w=><div className="alert" key={w}>{w}</div>)}
    <div className="columns">
      <aside className="repository"><div className="panel-title"><h2>小说仓库</h2><button className="icon" title="新建小说" disabled={!ready} onClick={()=>nameDialog('新建小说','',createNovel)}>＋</button></div><p className="muted hint">原稿和记忆保存在本机</p>
        <div className="novel-list">{sorted(view?.database.projects||[]).map(p=><div className={'novel'+(p.id===projectId?' selected':'')} key={p.id}><button className="novel-name" onClick={()=>guard(()=>switchTo(p))}><span>▤</span><span>{p.name}</span></button><div className="item-actions"><button title="重命名小说" onClick={()=>nameDialog('重命名小说',p.name,async s=>{await bridge.call('rename',{projectId:p.id,name:s,requestId:uid()});})}>✎</button><button title="小说上移" onClick={()=>guard(()=>move(p.id,-1,false))}>↑</button><button title="小说下移" onClick={()=>guard(()=>move(p.id,1,false))}>↓</button></div></div>)}</div>
        {project&&<><div className="section-heading"><span>章节 · {project.chapters.length}</span><button title="新建章节" onClick={()=>nameDialog('新建章节','',s=>createChapter(s))}>＋</button></div><div className="chapter-list">{sorted(project.chapters).map((c,i)=><div className={'chapter-item'+(c.id===chapterId?' active':'')} key={c.id}><button className="chapter-name" onClick={()=>guard(()=>switchTo(project,c))}><span className="chapter-number">{String(i+1).padStart(2,'0')}</span><span>{c.name}</span></button><div className="item-actions"><button title="重命名章节" onClick={()=>nameDialog('重命名章节',c.name,async s=>{await bridge.call('rename',{projectId,chapterId:c.id,name:s,requestId:uid()});})}>✎</button><button title="章节上移" onClick={()=>guard(()=>move(c.id,-1,true))}>↑</button><button title="章节下移" onClick={()=>guard(()=>move(c.id,1,true))}>↓</button></div></div>)}</div><button className="import-button" onClick={()=>importer.current?.click()}>＋ 导入文本章节</button></>}
        <div className="repository-footer"><span>你的表达，由你决定</span><small>无需额外账号或模型 Key</small></div>
      </aside>
      <main className="editor-pane">
        {chapter?<><div className="document-heading"><div className="breadcrumb">{project?.name}<span>/</span>正文</div><h1>{chapter.name}</h1><p>写下你的故事。选中文字，让 AI 帮你推敲。</p></div><textarea ref={editor} aria-label="小说正文" className="manuscript" style={{fontSize}} value={draft} onChange={e=>changeDraft(e.target.value)} onSelect={captureSelection} onBlur={captureSelection} onMouseUp={captureSelection} onKeyUp={captureSelection} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();void guard(()=>historyAction(e.shiftKey?'redo':'undo'));}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();void guard(flush);}}} placeholder="从这里开始写作…" spellCheck={false}/><div className="selection-actions">{selectedText&&<><span>选中 {selectedText.length} 字</span><button disabled={busy} onClick={()=>guard(()=>send('polish',false,'只消除歧义、去重复和修正措辞。保留原意、文风、视角、时间与情节，不增加事实或比喻。'))}>润色选段</button><button disabled={busy} onClick={()=>guard(()=>send('ask',false,'请根据所选原文与场景，给出少量更贴切的词语和表达选择。'))}>问词与表达</button><button disabled={busy} onClick={()=>{setMode('ghostwrite');setPrompt('请根据原文与作者样本补充不改变情节的过渡；缺少我的意图时先问我。');setTab('chat');}}>补过渡</button></>}</div><footer className="editor-footer"><span>{draft.replace(/\s/g,'').length.toLocaleString()} 字</span><span>{selectedText?`已选 ${selectedText.length} 字`:'未选择正文'}</span><span className="status-spacer"/><button disabled={!selectedText} onClick={()=>guard(async()=>{await flush();await bridge.call('approveStyle',{projectId,chapterId,baseRev:latest.current.rev,selection,requestId:uid()});setNotice('此选段已作为你明确认可的文风样本。');})}>认可为文风样本</button><span>修订 {chapter.rev}</span></footer></>:<div className="empty"><div className="empty-icon">文</div><h1>把故事留在你的笔下</h1><p>新建一本小说或恢复已有备份。<br/>先读你的原文，再一起推敲表达。</p><button className="primary" disabled={!ready} onClick={()=>nameDialog('新建小说','',createNovel)}>新建小说</button><button disabled={!ready} onClick={()=>importer.current?.click()}>导入原稿</button><p className="privacy">主稿存本机；发送给 GPT 的片段仍由在线模型处理。</p></div>}
      </main>
      <aside className="assistant-pane"><div className="assistant-heading"><div><span className="ai-symbol">✦</span><h2>与你共写</h2></div><span className="muted">先理解，再建议</span></div><div className="tabs"><button className={tab==='chat'?'active':''} onClick={()=>setTab('chat')}>交流</button><button className={tab==='memory'?'active':''} onClick={()=>setTab('memory')}>依据与记忆 <span>{activeMemories.filter(m=>['auto','confirmed'].includes(m.status)).length}</span></button></div>
        {tab==='chat'?<><div className="chat-options"><label><input type="checkbox" checked={proactiveChoice??project?.proactive.enabled??false} disabled={!project||!bridge.canTrigger||busy} onChange={e=>{const enabled=e.target.checked;setProactiveChoice(enabled);void guard(async()=>{proactiveFailed.current=false;try{await bridge.call('proactive',{projectId,enabled,requestId:uid()});}finally{setProactiveChoice(undefined);}});}}/>停笔后给小建议</label><button onClick={()=>setHistory(!history)}>{history?'隐藏旧分支':'查看旧分支'}</button></div><div className="conversation" ref={scroll}>
          {!activeMessages.length&&<div className="chat-welcome"><span>✦</span><h3>我先读你的内容</h3><p>选一段正文，可以问词语、对白、场景表达，也可以请求润色或补充过渡。</p><p>你不采纳，正文就不会改变。</p><button disabled={!chapter||busy} onClick={()=>guard(()=>send('learn'))}>学习原稿</button></div>}
          {activeMessages.map(m=>{const j=project?.jobs.find(j=>j.id===m.jobId);return <div key={m.id} className={'message '+m.role+(!m.active?' superseded':'')}><div className="message-label"><span>{m.role==='user'?'你':'GPT'}{!m.active?' · 已撤回的分支':''}</span>{m.role==='user'&&m.active&&<button onClick={()=>{setPrompt(m.text);setMode(j?.mode||'ask');setEditMessageId(m.id);}}>编辑重问</button>}</div><p>{m.text}</p>{m.role==='user'&&m.active&&j?.status==='stale'&&<small className="stale-request">原文或依据已更新，这条请求已失效。可编辑重问，按当前选段重新发送。</small>}{m.role==='assistant'&&j?.result?.questions.length? <ul>{j.result.questions.map((q,i)=><li key={i}>{q}</li>)}</ul>:null}{m.role==='assistant'&&j?.result?.kind==='candidate'&&<div className="proposal"><Difference before={j.original} after={j.result.replacement||''}/>{j.result.reasons.length>0&&<ul className="reasons">{j.result.reasons.map((s,i)=><li key={i}>{s}</li>)}</ul>}<div className="proposal-actions"><button className="primary" disabled={j.status!=='done'||!m.active||busy} onClick={()=>guard(async()=>{await flush();await bridge.call('decide',{jobId:j.id,accept:true,requestId:uid()});setSelection({start:j.selection.start,end:j.selection.start+(j.result?.replacement?.length||0)});setNotice('候选已采纳，只改选段。可用顶部撤销恢复。');})}>{j.status==='applied'?'已采纳':j.status==='stale'?'旧候选已失效':'采纳选段'}</button><button disabled={j.status!=='done'||busy} onClick={()=>guard(async()=>{await bridge.call('decide',{jobId:j.id,accept:false,requestId:uid()});})}>不采纳</button></div></div>}</div>;})}
          {pendingJobs.map(j=><div className="pending" key={j.id}><span className="pulse"/>{j.status==='processing'?'等待 GPT 回复':'等待 GPT 处理'} · {modeName[j.mode]}<div><button onClick={()=>guard(async()=>{await bridge.trigger(j.id);})}>重新唤起</button><button onClick={()=>{void navigator.clipboard?.writeText('使用 author-writing 处理请求 '+j.id+'：先 writer_context，后 writer_complete。').then(()=>setNotice('待办指令已复制，发给已连接插件的 GPT 聊天即可。')).catch(()=>setError('复制失败，请在聊天中让 GPT 处理下一条码字待办。'));}}>复制待办指令</button><button onClick={()=>guard(async()=>{await bridge.call('cancel',{jobId:j.id,requestId:uid()});})}>撤回</button></div></div>)}
        </div><div className="composer"><div className="selection-tag">{selectedText?`选段：${selectedText.slice(0,38)}${selectedText.length>38?'…':''}`:'可选正文，或直接交流创作想法'}</div>{editMessageId&&<div className="edit-banner">重问后，后续旧回答会退出有效分支。<button onClick={()=>setEditMessageId(undefined)}>取消编辑</button></div>}<div className="modes">{(['ask','polish','ghostwrite'] as Mode[]).map(m=><button key={m} className={mode===m?'active':''} onClick={()=>setMode(m)}>{modeName[m]}</button>)}</div><textarea aria-label="给 AI 的问题" onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();void guard(()=>send());}}} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder={mode==='ask'?'这句话用什么词更合适？':mode==='polish'?'选中需要润色的文字，补充你的要求…':'写清过渡要达到的目的；缺信息时先问我…'}/><div className="composer-footer"><small>候选须经你采纳</small><button className="primary" disabled={!chapter||busy} onClick={()=>guard(()=>send())}>{editMessageId?'重问':'发送'} ↑</button></div>{bridge.mode==='local'&&<div className="file-relay"><span>网页 GPT 文件接力</span><button disabled={!pendingJobs.length} onClick={()=>guard(async()=>{const r=await bridge.call('exportRequest',{jobId:pendingJobs[0].id});download('码字请求-'+pendingJobs[0].id.slice(0,8)+'.json',JSON.stringify(r.packet,null,2),'application/json');setNotice('将请求文件上传当前 ChatGPT，调用“小说码字助手”；下载它生成的回复，再导入这里。');})}>导出请求</button><button onClick={()=>replyImporter.current?.click()}>导入 GPT 回复</button></div>}</div></>:<div className="memory-pane"><p className="hint">自动记录须有原文出处。你指出错误后旧项停用，修正内容经你确认后再使用。</p><button className="learn-button" disabled={!chapter||busy} onClick={()=>guard(()=>send('learn'))}>学习原稿与文风</button>{!activeMemories.length&&<div className="memory-empty">还没有记录。<br/>让 GPT 读过原稿后，出处会显示在这里。</div>}{activeMemories.map(m=><div className={'memory-card '+m.status} key={m.id}><div className="memory-top"><span>{memoryType[m.type]}</span><span>{statusName[m.status]}</span></div><h3>{m.key}</h3><p>{m.value}</p>{m.certainty==='inference'&&<small className="uncertain">这是推断，需你确认</small>}{m.authorStatement&&<blockquote>作者纠正：{m.authorStatement}</blockquote>}{m.evidence.map((e,i)=><details key={i}><summary>{project?.chapters.find(c=>c.id===e.chapterId)?.name||'原文'} · 修订 {e.rev}</summary><blockquote>{e.quote}</blockquote></details>)}<div className="memory-actions">{['auto','pending'].includes(m.status)&&<button onClick={()=>guard(async()=>{await bridge.call('decideMemory',{projectId,memoryId:m.id,baseMemoryRev:project!.memoryRev,confirm:true,requestId:uid()});})}>确认依据</button>}{['auto','pending','confirmed'].includes(m.status)&&<button onClick={()=>setDialog({title:'指出错误并写出正确依据',value:'',multiline:true,run:async value=>{await bridge.call('correctMemory',{projectId,memoryId:m.id,correction:value,requestId:uid()});}})}>纠正</button>}{['auto','pending'].includes(m.status)&&<button onClick={()=>guard(async()=>{await bridge.call('decideMemory',{projectId,memoryId:m.id,baseMemoryRev:project!.memoryRev,confirm:false,requestId:uid()});})}>停用</button>}</div></div>)}</div>}
      </aside>
    </div>
    <input ref={importer} type="file" accept=".txt,.md,text/plain" multiple hidden onChange={e=>{const files=Array.from(e.target.files||[]);void guard(async()=>{await importTextFiles(files);});e.target.value='';}}/>
    <input ref={restorer} type="file" accept=".json,application/json" hidden onChange={e=>{const f=e.target.files?.[0];if(f)void guard(async()=>{await flush();const r=await bridge.call('import',{backup:JSON.parse(await f.text()),requestId:uid()});const s=await getSnapshot();selectProject(s.database.projects.find(p=>p.id===r.id)!);});e.target.value='';}}/>
    <input ref={replyImporter} type="file" accept=".json,application/json" hidden onChange={e=>{const f=e.target.files?.[0];if(f)void guard(async()=>{await bridge.call('importReply',{packet:JSON.parse(await f.text())});setNotice('GPT 回复已导入。请核对候选和依据，再决定是否采纳。');});e.target.value='';}}/>
    {dialog&&<div className="dialog-overlay"><form className="dialog" onSubmit={e=>{e.preventDefault();void guard(async()=>{await dialog.run(dialog.value);setDialog(null);});}}><h2>{dialog.title}</h2>{dialog.multiline?<textarea autoFocus aria-label={dialog.title} value={dialog.value} onChange={e=>setDialog({...dialog,value:e.target.value})}/>:<input autoFocus aria-label={dialog.title} value={dialog.value} onChange={e=>setDialog({...dialog,value:e.target.value})} maxLength={120}/>}<div><button type="button" onClick={()=>setDialog(null)}>取消</button><button className="primary" disabled={busy||!dialog.value.trim()}>保存</button></div></form></div>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
