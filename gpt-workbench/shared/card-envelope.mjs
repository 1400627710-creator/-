import {ArchiveCore as C} from '../cardstudio/lib/archive-core.mjs';
import {TARGETS,getCardValue} from '../cardstudio/lib/model.mjs';
import {sha256Fallback} from '../cardstudio/local/sha256.mjs';
import {envelope} from './exchange.mjs';

const stable=(prefix,text)=>prefix+'_'+sha256Fallback(text).slice(0,24);
export function cardsEnvelope(project,cardIds){
 const selected=new Set(cardIds||project.studio.cards.map(c=>c.id)),cards=project.studio.cards.filter(c=>selected.has(c.id));
 if(!cards.length)throw new Error('请先新建或选择卡片');
 const state=C.blankState();state.types=[];state.archives=[];state.panels=[];state.activePanelId=null;
 const writes=new Map;
 function write(key,value,apply){const text=String(value??'');if(writes.has(key)&&writes.get(key)!==text)throw new Error('多个卡片对同一个档案字段有不同内容，请分批回传');writes.set(key,text);apply(text);}
 for(const card of cards){
  const link=project.links.find(x=>x.cardId===card.id),binding=project.bindings.find(x=>x.id===link?.bindingId),original=project.archive.archives.find(x=>x.id===link?.archiveId);
  if(link&&binding&&original?.versions.some(v=>v.id===link.versionId&&v.rows.some(r=>r.id===link.rowId))){
   let a=state.archives.find(a=>a.id===original.id);
   if(!a){a={...C.copy(original),versions:[]};state.archives.push(a);const type=project.archive.types.find(t=>t.id===a.typeId);if(type&&!state.types.some(t=>t.id===type.id))state.types.push(C.copy(type));}
   const source=original.versions.find(v=>v.id===link.versionId);let v=a.versions.find(v=>v.id===source.id);
   if(!v){v={...C.copy(source),rows:[]};a.versions.push(v);}
   let r=v.rows.find(r=>r.id===link.rowId);if(!r){r=C.copy(source.rows.find(r=>r.id===link.rowId));v.rows.push(r);}
   a.activeVersionId=v.id;
   for(const map of binding.map){const value=getCardValue(card,map.target);if(value===undefined)continue;
    if(map.source.kind==='field'&&v.fields.some(f=>f.id===map.source.fieldId))write(`${a.id}/${v.id}/${r.id}/${map.source.fieldId}`,value,text=>{if(r.values[map.source.fieldId]!==text){v.provenance||={fields:{}};v.provenance.fields||={};v.provenance.fields[map.source.fieldId]={...(v.provenance.fields[map.source.fieldId]||{}),manualCorrection:{value:text,source:'卡递手动回传'},quoteIsOriginal:true};}r.values[map.source.fieldId]=text;});
    else if(map.source.kind==='meta')write(`${a.id}/${v.id}/${map.source.key}`,value,text=>{v[map.source.key]=map.source.key==='keywords'?C.keywords(text):text;});
   }
   v.cardSource={projectId:project.id,cardId:card.id,description:'由卡递手动回传，保留原档案字段编号'};
  }else{
   const tid=stable('ct',card.templateId||'unit');let t=state.types.find(t=>t.id===tid);
   const custom=(project.studio.fieldSchema||[]).filter(f=>!f.tpl||f.tpl===card.templateId);
   const labels=project.studio.projectDesign?.fieldLabels||{};
   const defs=[...TARGETS.map(([key,label])=>({key,label:labels[key]??label})),...custom.map(f=>({key:'custom:'+f.key,label:f.label}))];
   const fields=defs.map(f=>({id:stable('cf',f.key),name:String(f.label),aliases:[],width:220}));
   if(!t){t={...C.type(project.studio.customTemplates?.[card.templateId]?.name||({unit:'单位',spell:'法术',building:'建筑',event:'事件'}[card.templateId])||'卡牌'),id:tid,fields:C.copy(fields)};state.types.push(t);}
   const a={id:stable('ca',card.id),typeId:tid,copyOnClick:false,versions:[],cardSource:{projectId:project.id,cardId:card.id}};
   const v=C.makeVersion(card.name,fields);v.id=stable('cv',card.id);v.rows=[{id:stable('cr',card.id),keywords:[],values:Object.fromEntries(defs.map((f,i)=>[fields[i].id,String(getCardValue(card,f.key)??'')]))}];a.versions=[v];a.activeVersionId=v.id;state.archives.push(a);
  }
 }
 return envelope(state,'cardstudio_'+project.id);
}
