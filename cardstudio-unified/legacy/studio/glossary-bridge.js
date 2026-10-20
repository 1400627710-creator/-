window.initializeGlossaryBridge=function(core){
  'use strict';
  const format=window.CARDSTUDIO_GLOSSARY,$=selector=>document.querySelector(selector);
  const {getTerms,getCards,isCardLocked,extractRuleTerms,recordHistory,mergeSharedGlossaryTerms,renderAll,renderRuleTermLibrary,fillTermEditor,persist,setStatus,esc}=core;
  let preview=null;
  async function request(url,body){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{const response=await fetch(url,{cache:'no-store',signal:controller.signal,...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw new Error(data.error||'词条仓库暂时不可用');return data}finally{clearTimeout(timer)}
  }
  async function refresh(){
    try{
      const pack=await request('/api/glossary'),pending=await request('/api/glossary/contributions');
      $('#sharedGlossaryStatus').textContent=`已发布 ${pack.terms.length} 个词条 · 待审核 ${pending.submissions.length} 份投稿${pack.publishedAt?' · '+new Date(pack.publishedAt).toLocaleString():''}`;
    }catch(error){$('#sharedGlossaryStatus').textContent='词条仓库不可用：'+error.message}
  }
  window.previewSharedGlossary=function(incoming,submissionId=null){
    const locked=getCards().filter(isCardLocked).flatMap(c=>extractRuleTerms(c.description));
    const rows=format.planMerge(getTerms(),incoming,locked);
    preview={incoming,submissionId,before:JSON.stringify(getTerms()),rows};
    $('#glossaryMergeSummary').textContent=`新增 ${rows.filter(r=>r.kind==='new').length} · 设计变更 ${rows.filter(r=>r.kind==='conflict').length} · 相同 ${rows.filter(r=>r.kind==='same').length} · 受保护 ${rows.filter(r=>r.kind==='blocked').length}`;
    const design=term=>esc([term.category?'分类：'+term.category:'',term.tags?'标签：'+term.tags:'',term.description,term.aliases?.length?'检索别名：'+term.aliases.join('、'):'',term.example?'示例：'+term.example:'',term.designNotes?'设计：'+term.designNotes:''].filter(Boolean).join('\n')||'暂无说明');
    $('#glossaryMergeRows').innerHTML=rows.map((row,index)=>`<section class="glossary-merge-row"><label><input type="checkbox" data-glossary-row="${index}" ${row.kind==='new'?'checked':''} ${['blocked','same'].includes(row.kind)?'disabled':''}><b>${esc(row.term.name)}</b><span>${({new:'新增',conflict:'设计变更',same:'内容相同',blocked:'保留原设计'})[row.kind]}</span></label>${row.reason?'<p>'+esc(row.reason)+'</p>':''}<div class="glossary-design-diff">${row.existing?`<div><small>原设计 · ${esc(row.existing.color)}</small><strong>${esc(row.existing.name)}</strong><pre>${design(row.existing)}</pre></div>`:''}<div><small>待合并 · ${esc(row.term.color)}</small><strong>${esc(row.term.name)}</strong><pre>${design(row.term)}</pre></div></div></section>`).join('');
    $('#glossaryMergeModal').hidden=false;
  };
  $('#cancelGlossaryMerge').onclick=()=>{preview=null;$('#glossaryMergeModal').hidden=true};
  $('#confirmGlossaryMerge').onclick=async()=>{
    if(!preview)return;
    if(preview.before!==JSON.stringify(getTerms())){setStatus('词条库已变化，请取消并重新预览');return}
    const selected=[...document.querySelectorAll('[data-glossary-row]:checked')].map(el=>Number(el.dataset.glossaryRow));
    const action=preview;
    try{
      if(selected.length)recordHistory();
      const result=mergeSharedGlossaryTerms(action.incoming,selected);
      $('#glossaryMergeModal').hidden=true;preview=null;renderAll();renderRuleTermLibrary();fillTermEditor(getTerms()[0]||null);persist();
      if(action.submissionId){try{await request('/api/glossary/contributions/reviewed',{id:action.submissionId})}catch(error){setStatus('词条已合并，投稿状态未更新：'+error.message);return}}
      setStatus(`共享词条已合并：新增 ${result.added}，更新 ${result.changed}；未勾选的原设计保持不变`);refresh();
    }catch(error){setStatus('词条合并失败：'+error.message)}
  };
  $('#publishSharedGlossary').onclick=async function(){
    this.disabled=true;
    try{
      const terms=format.normalizeTerms(getTerms());if(!terms.length)throw new Error('当前词条库为空，请先建立或导入词条');
      const current=await request('/api/glossary');
      const pack=await request('/api/glossary/publish',{expectedRevision:current.revision,pack:{schema:'cardstudio-glossary-v1',version:1,terms}});
      setStatus(`已发布 ${pack.terms.length} 个词条，社区版现在可以同步查看完整设计`);refresh();
    }catch(error){setStatus('词条发布失败：'+error.message)}finally{this.disabled=false}
  };
  $('#receiveCommunityTerms').onclick=async function(){
    try{const queue=await request('/api/glossary/contributions');if(!queue.submissions.length)return setStatus('当前没有待审核的社区投稿');const item=queue.submissions[0];window.previewSharedGlossary(item.terms,item.id)}catch(error){setStatus('读取投稿失败：'+error.message)}
  };
  $('#openCommunityEdition').onclick=()=>window.open('/community/','_blank','noopener');
  $('#downloadCommunityEdition').onclick=()=>{const a=document.createElement('a');a.href='/api/glossary/community-pack';a.download='CardStudio-Community-with-glossary.zip';a.click();setStatus('正在下载包含已发布私人版词条的离线社区版')};
  $('#openRuleTerms').addEventListener('click',refresh);$('#openRuleTermsRules').addEventListener('click',refresh);
};
