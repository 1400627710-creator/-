import fs from 'node:fs';
import {createHash} from 'node:crypto';
const target=new URL('./glossary.json',import.meta.url),current=JSON.parse(fs.readFileSync(target,'utf8'));
const incoming=process.argv[2]?JSON.parse(fs.readFileSync(process.argv[2],'utf8')):[];
const list=Array.isArray(incoming)?incoming:incoming.terms||[],terms=[...(current.terms||[])],seen=new Set(terms.map(x=>JSON.stringify([x.name,x.namespace||'',x.description])));
for(const item of list){if(!item||typeof item.name!=='string'||typeof item.description!=='string'||!item.description.trim())throw Error('词条缺少名称或完整定义');const key=JSON.stringify([item.name,item.namespace||'',item.description]);if(!seen.has(key)){seen.add(key);terms.push({...item,id:item.id||'snapshot.'+createHash('sha256').update(key).digest('hex').slice(0,24)})}}
if(process.argv[2])fs.writeFileSync(target,JSON.stringify({...current,terms},null,2)+'\n');
console.log('卡递词条快照 '+terms.length+' 项；仅增量收录。');
