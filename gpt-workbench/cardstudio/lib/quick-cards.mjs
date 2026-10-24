import * as M from './model.mjs';
import {BASIC_ID} from './layout-core.mjs';
export const FIELDS=[['name','名称'],['unitType','种族'],['faction','系别'],['description','效果'],['cost','费用'],['attack','攻击'],['health','血量']];
const numeric=new Set(['cost','attack','health']);
const aliases={name:['名称','卡名','姓名','name'],unitType:['种族','兵种','unitType'],faction:['系别','阵营','faction'],description:['效果','卡牌正文','描述','description','effect'],cost:['费用','消耗','cost'],attack:['攻击','攻击力','attack'],health:['血量','生命','生命值','health'],cardKind:['模式','卡牌模式','类型','cardKind']};
const keyFor=name=>Object.entries(aliases).find(([,names])=>names.includes(String(name).trim()))?.[0];
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const visible=(row,key)=>row.cardKind!=='spell'||!['unitType','attack','health'].includes(key);
const quote=(raw,value)=>{const text=String(value??'');return text&&raw.includes(text)?text:text&&raw.includes(JSON.stringify(text))?JSON.stringify(text):'';};
function rowFrom(values,raw,index,extraFields=[]){
 const kind=values.cardKind??'unit';assert(['','unit','单位','单位卡','building','建筑','spell','法术','法术卡'].includes(kind),'第 '+(index+1)+' 张的模式请填写单位或法术');
 const row={id:'row_'+index,cardKind:['spell','法术','法术卡'].includes(kind)?'spell':'unit',original:{},quotes:{},extraFields};
 for(const [key,label] of FIELDS){assert(values[key]==null||['string','number'].includes(typeof values[key]),'第 '+(index+1)+' 张的'+label+'需要文字或数字');row[key]=String(values[key]??'');row.original[key]=row[key];row.quotes[key]=quote(raw,row[key]);}
 return row;
}
function splitTable(text,delimiter){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===delimiter&&!quoted){row.push(cell);cell='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 assert(!quoted,'表格引号没有闭合，请检查最后一格');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
export function parseInput(text,gptJSON=''){
 assert(typeof text==='string'&&text.trim(),'请先粘贴卡牌内容');assert(text.length<=150000,'单次内容最多 15 万字');
 const source=text,trimmed=(gptJSON||text).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''),rows=[];
 if(/^[\[{]/.test(trimmed)&&!/^\[法术\]/.test(trimmed)){
  let parsed;try{parsed=JSON.parse(trimmed);}catch{throw Error('JSON 格式不完整，请粘贴整个对象或数组');}
  const list=Array.isArray(parsed)?parsed:parsed.cards||parsed.records;assert(Array.isArray(list),'JSON 需要 cards 或 records 数组');
  list.forEach((item,i)=>{assert(item&&typeof item==='object','第 '+(i+1)+' 条不是卡牌对象');const values={},extras=[];
   if(Array.isArray(item.fields)){values.name=item.title??'';values.cardKind=/法术/.test(item.typeName||'')?'spell':'unit';for(const f of item.fields){assert(f&&typeof f.name==='string','第 '+(i+1)+' 张含无效字段');const key=keyFor(f.name);if(key)values[key]=f.value;else extras.push({name:String(f.name??''),value:String(f.value??''),quote:quote(source,f.sourceQuote??f.value)});}}
   else for(const [name,value] of Object.entries(item)){const key=keyFor(name);if(key)values[key]=value;else if(!['id','original','quotes','extraFields'].includes(name))extras.push({name,value:String(value??''),quote:quote(source,value)});}
   rows.push(rowFrom(values,source,i,extras));
  });
 }else{
  const first=trimmed.split(/\r?\n/)[0],delimiter=first.includes('\t')?'\t':first.includes(',')?',':'，';
  const header=first.split(delimiter).map(x=>x.trim().replace(/^"|"$/g,''));
  if(header.some(x=>keyFor(x)==='name')&&header.filter(keyFor).length>=3){
   const table=splitTable(trimmed,delimiter),names=table.shift(),recognized=names.map(keyFor).filter(Boolean);assert(new Set(recognized).size===recognized.length,'表头有重复的卡牌字段，请保留一列或改为备注名称');
   table.forEach((cells,i)=>{assert(cells.length<=names.length,'第 '+(i+1)+' 行比表头多出单元格，请为含逗号的内容加引号');const values={},extras=[];names.forEach((name,j)=>{const key=keyFor(name);if(key)values[key]=cells[j]??'';else extras.push({name,value:cells[j]??'',quote:quote(source,cells[j])});});rows.push(rowFrom(values,source,i,extras));});
  }else trimmed.split(/\r?\n/).filter(x=>x.trim()).forEach((line,i)=>{
   const values={},spell=/^\s*(?:法术\s*[:：]|\[法术\]|【法术】)/.test(line);let rest=line.trim().replace(/^\s*(?:法术\s*[:：]|\[法术\]|【法术】)\s*/,'');values.cardKind=spell?'spell':'unit';
   const body=rest.match(/(-?\d+(?:\.\d+)?)\s*费\s*[,，。;；\s]*(-?\d+(?:\.\d+)?)\s*[\/\\]\s*(-?\d+(?:\.\d+)?)\s*(?:身材)?\s*[。.!！]?\s*$/);
   const cost=rest.match(/(-?\d+(?:\.\d+)?)\s*费\s*[。.!！]?\s*$/);
   if(body){values.cost=body[1];values.attack=body[2];values.health=body[3];rest=rest.slice(0,body.index).trim();}
   else if(cost){values.cost=cost[1];rest=rest.slice(0,cost.index).trim();}
   const take=()=>{const match=rest.match(/[,，]/),value=match?rest.slice(0,match.index):rest;rest=match?rest.slice(match.index+1):'';return value.trim();};values.name=take();if(!spell)values.unitType=take();values.faction=take();values.description=rest.trim().replace(/^效果\s*[:：]\s*/,'').replace(/[,，;；]\s*$/,'');
   rows.push(rowFrom(values,line,i));
  });
 }
 assert(rows.length&&rows.length<=500,'一次可预览 1～500 张卡片');return {sourceText:source,rows};
}
export function rowIssues(row){
 const issues=[];if(!String(row.name??'').trim())issues.push('请填写名称');
 for(const [key,label] of FIELDS)if(numeric.has(key)&&visible(row,key)&&(String(row[key]??'').trim()===''||!Number.isFinite(Number(row[key]))))issues.push(label+'需要数字');
 return issues;
}
export function validateRows(rows){
 assert(Array.isArray(rows)&&rows.length&&rows.length<=500,'请选择 1～500 张卡片');
 return rows.map((raw,i)=>{assert(raw&&typeof raw==='object','卡牌内容无效');assert(['unit','spell'].includes(raw.cardKind),'卡牌模式只能是单位或法术');const issues=rowIssues(raw);assert(!issues.length,'第 '+(i+1)+' 张：'+issues.join('；'));const row=M.copy(raw);
  for(const [key] of FIELDS){assert(['string','number'].includes(typeof (row[key]??'')),'字段内容需要文字或数字');row[key]=numeric.has(key)&&visible(row,key)?Number(row[key]):String(row[key]??'');assert(String(row[key]).length<=15000,'单个字段最多 15000 字');}
  row.original=Object.fromEntries(FIELDS.map(([key])=>[key,String(row.original?.[key]??'')]));row.quotes=Object.fromEntries(FIELDS.map(([key])=>[key,typeof row.quotes?.[key]==='string'?row.quotes[key]:'']));
  row.extraFields=(Array.isArray(row.extraFields)?row.extraFields:[]).slice(0,50).map(f=>({name:String(f.name??''),value:String(f.value??''),quote:String(f.quote??'')}));return row;
 });
}
export function createCards(project,rawRows,sourceText,templateId=BASIC_ID,fingerprint=''){
 const rows=validateRows(rawRows);assert(typeof sourceText==='string'&&sourceText.trim()&&sourceText.length<=150000,'请保留对应原文');
 assert([BASIC_ID,'unit','spell','building','event'].includes(templateId)||project.studio.customTemplates?.[templateId],'默认模板已不存在，请重新选择');
 const next=M.copy(project),before=new Set(next.archive.archives.map(a=>a.id)),sourceId=M.uid('source');
 const records=rows.map(row=>({title:row.name,typeName:row.cardKind==='spell'?'快速制卡 · 法术':'快速制卡 · 单位',keywords:[],timeLabel:'',timeOrder:null,fields:[...FIELDS.filter(([key])=>key!=='name'&&visible(row,key)).map(([key,label])=>({name:next.studio.projectDesign?.fieldLabels?.[key]??label,value:String(row[key]),sourceQuote:sourceText.includes(row.quotes?.[key])?row.quotes?.[key]||'':''})),...row.extraFields.map(f=>({name:f.name,value:f.value,sourceQuote:sourceText.includes(f.quote)?f.quote:''}))]}));
 M.appendRecords(next,records,{id:sourceId,kind:'quick-cards',raw:sourceText,fingerprint});
 const archives=next.archive.archives.filter(a=>!before.has(a.id));
 const groups=new Map;archives.forEach((a,i)=>{const row=rows[i],v=a.versions[0],keys=FIELDS.filter(([key])=>key!=='name'&&visible(row,key)),map=[{target:'name',source:{kind:'meta',key:'title'}},...keys.map(([key],index)=>({target:key,source:{kind:'field',fieldId:v.fields[index].id}}))];
  v.provenance.title={quote:sourceText.includes(row.quotes?.name)?row.quotes?.name||'':''};
  if(String(row.name)!==String(row.original?.name??'')||!v.provenance.title.quote)v.provenance.title.manualCorrection={value:row.name,reason:'快速制卡预览确认或补充'};
  keys.forEach(([key],j)=>{const f=v.fields[j],p=v.provenance.fields[f.id];if(String(row[key])!==String(row.original?.[key]??'')||!p.quote)p.manualCorrection={value:String(row[key]),reason:'快速制卡预览确认或补充'};});
  const signature=JSON.stringify([a.typeId,row.cardKind,map]);let group=groups.get(signature);
  if(!group){let binding=next.bindings.find(b=>b.quickKind===row.cardKind&&b.templateId===templateId&&b.typeId===a.typeId&&JSON.stringify(b.map)===JSON.stringify(map));if(!binding)binding={id:M.uid('binding'),name:'快速制卡 · '+(row.cardKind==='spell'?'法术':'单位'),quickKind:row.cardKind,typeId:a.typeId,templateId,map};group={binding,ids:[],kind:row.cardKind};groups.set(signature,group);}group.ids.push(a.id);
 });
 const oldCards=new Set(next.studio.cards.map(c=>c.id));for(const group of groups.values()){M.generateCards(next,group.binding,group.ids);for(const link of next.links.filter(l=>group.ids.includes(l.archiveId))){const card=next.studio.cards.find(c=>c.id===link.cardId);card.cardKind=group.kind;card.cardRules='seven-v1';}}
 next.studio.selected=next.studio.cards.find(c=>!oldCards.has(c.id))?.id||next.studio.selected;M.validateProject(next);Object.assign(project,next);return {created:rows.length,archived:rows.length};
}
export function batchCards(project,changes){
 assert(Array.isArray(changes)&&changes.length&&changes.length<=5000,'没有待保存的修改');const next=M.copy(project.studio),ids=new Set;
 for(const item of changes){assert(item&&typeof item.id==='string'&&!ids.has(item.id),'卡牌编号重复或无效');ids.add(item.id);const card=next.cards.find(c=>c.id===item.id);assert(card,'卡牌已删除，请重新打开批量编辑');assert(!M.isLocked(project,card),'“'+card.name+'”已锁定，请先解锁');assert(item.patch&&typeof item.patch==='object','修改内容无效');
  for(const [key,value] of Object.entries(item.patch)){assert(FIELDS.some(([k])=>k===key)||key==='cardKind','不支持修改此字段');assert(!M.fieldLocked(card,key),'“'+card.name+'”的字段已锁定');
   if(key==='cardKind'){assert(['unit','spell'].includes(value),'卡牌模式无效');card.cardKind=value;card.cardRules='seven-v1';}
   else{assert(typeof value==='string'||typeof value==='number','字段内容需要文字或数字');assert(String(value).length<=15000,'单个字段最多 15000 字');if(numeric.has(key))assert(String(value).trim()!==''&&Number.isFinite(Number(value)),'“'+card.name+'”的'+FIELDS.find(([k])=>k===key)[1]+'需要数字');M.setCardValue(card,key,value);}
  }
 }
 M.acceptStudio(project,next);return {updated:changes.length};
}
