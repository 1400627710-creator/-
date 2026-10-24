import test from 'node:test';
import assert from 'node:assert/strict';
import * as Q from '../lib/quick-cards.mjs';
import * as M from '../lib/model.mjs';
import * as L from '../lib/layout-core.mjs';
const text='帮派弟兄，人类，底层，登场：检索一张帮派弟兄。3费1\\2身材。\n法术：火花，底层，造成2点伤害。2费';
test('常见描述识别七项字段，法术明确排除种族与身材，不把效果里的数字当身材',()=>{
 const {rows}=Q.parseInput(text);assert.equal(rows.length,2);assert.deepEqual(Q.rowIssues(rows[0]),[]);assert.deepEqual([rows[0].name,rows[0].unitType,rows[0].faction,rows[0].description,rows[0].cost,rows[0].attack,rows[0].health],['帮派弟兄','人类','底层','登场：检索一张帮派弟兄。','3','1','2']);assert.equal(rows[1].cardKind,'spell');assert.equal(rows[1].description,'造成2点伤害。');assert.deepEqual(Q.rowIssues(rows[1]),[]);
 const incomplete=Q.parseInput('新卡，人类，底层，造成3点伤害。').rows[0];assert.ok(Q.rowIssues(incomplete).some(x=>x.includes('费用')));assert.equal(incomplete.description,'造成3点伤害。');assert.equal(Q.parseInput('[法术]零费牌，底层，抽1张牌。0费').rows[0].cost,'0');
});
test('带引号、逗号和多行效果的 CSV 与表头 TSV 保留原文，数字零正确',()=>{
 const csv='名称,种族,系别,效果,费用,攻击,血量,备注\n甲,人类,底层,"第一段,保留逗号\n第二段",0,0,2,额外设定';const row=Q.parseInput(csv).rows[0];assert.equal(row.description,'第一段,保留逗号\n第二段');assert.equal(row.extraFields[0].value,'额外设定');assert.equal(Q.validateRows([row])[0].cost,0);
 const tsv='名称\t种族\t系别\t效果\t费用\t攻击\t血量\n乙\t人类\t底层\t检索\t3\t1\t2';assert.equal(Q.parseInput(tsv).rows[0].name,'乙');assert.throws(()=>Q.parseInput('名称,效果,费用\n甲,"缺引号,3'),/引号/);
 assert.throws(()=>Q.parseInput('名称,费用,效果,消耗\n甲,1,抽牌,2'),/重复/);assert.throws(()=>Q.parseInput('名称,费用,效果\n甲,1,抽牌,多余'),/多出/);
});
test('GPT JSON 和通用归档结果可转七项预览，额外字段保留',()=>{
 const raw={records:[{title:'火花',typeName:'法术',fields:[{name:'系别',value:'底层'},{name:'效果',value:'造成2点伤害。'},{name:'费用',value:'2'},{name:'设定',value:'火焰'}]}]};const row=Q.parseInput('火花来自底层，造成2点伤害。2费',JSON.stringify(raw)).rows[0];assert.equal(row.cardKind,'spell');assert.equal(row.extraFields.length,1);assert.deepEqual(Q.rowIssues(row),[]);assert.throws(()=>Q.parseInput('{"cards":['),/JSON/);
 assert.throws(()=>Q.parseInput(JSON.stringify({cards:[{name:'甲',description:{value:'效果'}}]})),/效果需要文字/);
});
test('快速制卡同时归档、创建稳定字段映射并继承完整默认格式，法术只显示三项卡面字段加名称',()=>{
 const p=M.blankProject(),source={id:'prototype',name:'样板',templateId:L.BASIC_ID,cardKind:'unit',layout:{title:{x:20,y:6,w:60,h:9},frameImage:{x:2,y:0,w:96,h:100,z:11}},appearance:{frameImageAssetId:'frame'},extraElements:[{id:'pic',kind:'image',assetId:'frame',layout:{x:10,y:20,w:20,h:30}},{id:'label',kind:'text',parentId:'pic',fieldKey:'cost',text:'旧费用',layout:{x:10,y:50,w:20,h:5}}]};p.studio.cards=[source];L.captureDefault(p.studio,source,{[L.BASIC_ID]:L.BASIC_TEMPLATE});const before=M.copy(source),parsed=Q.parseInput(text);const stats=Q.createCards(p,parsed.rows,text,L.BASIC_ID,'fingerprint');assert.equal(stats.created,2);assert.equal(p.archive.archives.length,2);assert.equal(p.links.length,2);assert.deepEqual(p.studio.cards[0],before);
 const unit=p.studio.cards[1],spell=p.studio.cards[2];assert.equal(unit.cost,3);assert.equal(unit.attack,1);assert.equal(unit.health,2);assert.deepEqual(unit.layout,source.layout);assert.equal(unit.extraElements[1].parentId,unit.extraElements[0].id);assert.notEqual(unit.extraElements[0].id,source.extraElements[0].id);assert.equal(spell.cardKind,'spell');assert.deepEqual(L.templateFor(spell,{[L.BASIC_ID]:L.BASIC_TEMPLATE}).stats,[]);assert.equal(p.imports.at(-1).raw,text);M.validateProject(p);
 const extra=unit.extraElements[1],report=L.diagnostic(p.studio,unit,[{id:extra.id,type:'extra',label:'绑定费用',layout:extra.layout,element:extra}]);assert.equal(report.layers[0].fieldKey,'cost');assert.equal(report.layers[0].text,'3');assert.equal(report.layers[0].literalText,'旧费用');
});
test('预览修订标明手动补充；伪造引文不会成为原文证据，错误行不会部分归档',()=>{
 const p=M.blankProject(),{rows}=Q.parseInput(text);rows[0].cost='5';rows[0].quotes.cost='伪造内容';Q.createCards(p,[rows[0]],text);const a=p.archive.archives[0],v=a.versions[0],costField=v.fields.find(f=>f.name==='费用');assert.equal(v.provenance.fields[costField.id].quote,'');assert.equal(v.provenance.fields[costField.id].manualCorrection.value,'5');
 const original=M.copy(p);assert.throws(()=>Q.createCards(p,[rows[0],{...rows[0],cost:'错误'}],text),/需要数字/);assert.deepEqual(p,original);
});
test('批量修改保留排版和原档案，关联值标记覆盖；非法数值和锁定字段整体拒绝',()=>{
 const p=M.blankProject();Q.createCards(p,Q.parseInput(text).rows,text);const card=p.studio.cards[0],oldLayout=M.copy(card.layout),a=M.copy(p.archive);Q.batchCards(p,[{id:card.id,patch:{cost:'5',description:'新效果'}}]);assert.equal(p.studio.cards[0].cost,5);assert.deepEqual(p.studio.cards[0].layout,oldLayout);assert.deepEqual(p.archive,a);assert.equal(p.links[0].overrides.cost,true);
 let before=M.copy(p);assert.throws(()=>Q.batchCards(p,[{id:card.id,patch:{cost:'7'}},{id:p.studio.cards[1].id,patch:{cost:'abc'}}]),/需要数字/);assert.deepEqual(p,before);
 p.studio.cards[0].layout.cost={locked:true};before=M.copy(p);assert.throws(()=>Q.batchCards(p,[{id:card.id,patch:{cost:'9'}}]),/锁定/);assert.deepEqual(p,before);
});
test('单位法术切换保留原种族身材，完整备份往返保留新增数据与映射',()=>{
 const p=M.blankProject();Q.createCards(p,[Q.parseInput(text).rows[0]],text);const c=p.studio.cards[0];Q.batchCards(p,[{id:c.id,patch:{cardKind:'spell'}}]);assert.equal(p.studio.cards[0].health,2);assert.equal(p.studio.cards[0].unitType,'人类');const restored=M.validateProject(JSON.parse(JSON.stringify(p)));assert.equal(restored.links[0].cardId,c.id);assert.equal(restored.studio.cards[0].cardRules,'seven-v1');assert.equal(restored.imports.at(-1).raw,text);
});
