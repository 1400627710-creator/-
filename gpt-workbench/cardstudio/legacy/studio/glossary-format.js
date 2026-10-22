(function(root){
  'use strict';
  const MAX_TERMS=5000,MAX_BYTES=5*1024*1024;
  const fields=['id','name','color','category','tags','description','aliases','example','designNotes'];
  const key=name=>String(name||'').trim().toLocaleLowerCase('zh-CN');
  const validName=name=>!!name&&!/[\[\]\r\n\t]/.test(name);
  function text(value,max,label){
    if(value==null)return '';
    if(typeof value!=='string'&&typeof value!=='number')throw new Error(label+'格式无效');
    const result=String(value);if(result.length>max)throw new Error(label+'过长');return result;
  }
  function stableId(name){let h=2166136261;for(const c of key(name)){h^=c.codePointAt(0);h=Math.imul(h,16777619)}return 'term_'+(h>>>0).toString(16)}
  function normalizeTerm(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('词条记录无效');
    const name=text(raw.name,120,'词条名称').trim();if(!validName(name))throw new Error('词条名称不能包含 [、]、换行或制表符');
    const id=raw.id==null||raw.id===''?stableId(name):text(raw.id,96,'词条编号');
    if(!/^[A-Za-z0-9_.:-]{1,96}$/.test(id))throw new Error('词条编号格式无效');
    if(raw.aliases!=null&&!Array.isArray(raw.aliases)&&typeof raw.aliases!=='string')throw new Error('检索别名应为文本或列表');
    const aliases=Array.isArray(raw.aliases)?raw.aliases:String(raw.aliases||'').split(/[,，]/);
    if(aliases.length>20)throw new Error('词条别名最多 20 个');
    const cleanAliases=[...new Set(aliases.map(a=>text(a,120,'别名').trim()).filter(Boolean))];
    if(cleanAliases.some(a=>!validName(a)))throw new Error('别名不能包含词条引用符号或换行');
    const color=/^#[0-9a-f]{6}$/i.test(String(raw.color||''))?String(raw.color):'#5b5bd6';
    return {id,name,color,category:text(raw.category,80,'分类'),tags:text(Array.isArray(raw.tags)?raw.tags.join(','):raw.tags,500,'标签'),description:text(raw.description,8000,'规则说明'),aliases:cleanAliases,example:text(raw.example,8000,'使用示例'),designNotes:text(raw.designNotes,8000,'设计说明')};
  }
  function normalizeTerms(list){
    if(!Array.isArray(list))throw new Error('词条应为列表');if(list.length>MAX_TERMS)throw new Error('词条超过 5000 个上限');
    const ids=new Set(),names=new Set();return list.map(raw=>{const t=normalizeTerm(raw),name=key(t.name);if(ids.has(t.id)||names.has(name))throw new Error('词条编号或名称重复：'+t.name);ids.add(t.id);names.add(name);return t});
  }
  function normalizePack(raw,{allowLegacy=true}={}){
    let list;
    if(raw?.schema==='cardstudio-glossary-v1'&&Array.isArray(raw.terms))list=raw.terms;
    else if(allowLegacy&&Array.isArray(raw))list=raw;
    else if(allowLegacy&&raw?.format==='card-assembly-studio'&&Array.isArray(raw.ruleTerms))list=raw.ruleTerms;
    else if(allowLegacy&&!raw?.schema&&Array.isArray(raw?.terms))list=raw.terms;
    else throw new Error('不是有效的共享词条文件');
    const terms=normalizeTerms(list);
    const pack={schema:'cardstudio-glossary-v1',version:text(raw?.version||1,80,'版本'),publishedAt:text(raw?.publishedAt||raw?.exportedAt,80,'发布时间'),source:text(raw?.source||'CardStudio Studio',120,'来源'),revision:text(raw?.revision,96,'修订号'),terms};
    if(unescape(encodeURIComponent(JSON.stringify(pack))).length>MAX_BYTES)throw new Error('词条文件超过 5MB');return pack;
  }
  const equal=(a,b)=>JSON.stringify(normalizeTerm(a))===JSON.stringify(normalizeTerm(b));
  function planMerge(current,incoming,lockedNames=[]){
    const originals=normalizeTerms(current),entries=normalizeTerms(incoming),locked=new Set(lockedNames.map(key));
    const byId=new Map(originals.map(t=>[t.id,t])),byName=new Map(originals.map(t=>[key(t.name),t]));
    const rows=entries.map(term=>{
      const idHit=byId.get(term.id),nameHit=byName.get(key(term.name)),existing=idHit||nameHit;
      let kind=!existing?'new':equal({...term,id:existing.id},existing)?'same':'conflict',reason='';
      if(idHit&&nameHit&&idHit.id!==nameHit.id){kind='blocked';reason='名称已被另一个词条使用'}
      if(existing&&existing.name!==term.name&&locked.has(key(existing.name))){kind='blocked';reason='锁定卡仍引用原名称，请先解锁或保留原词条'}
      return {term,existing,kind,reason};
    });
    if(originals.length+rows.filter(r=>r.kind==='new').length>MAX_TERMS)throw new Error('合并后词条超过 5000 个上限');
    return rows;
  }
  root.CARDSTUDIO_GLOSSARY={MAX_TERMS,MAX_BYTES,fields,key,validName,normalizeTerm,normalizeTerms,normalizePack,planMerge,equal};
})(typeof window!=='undefined'?window:globalThis);
