import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../cardstudio/lib/model.mjs';
import * as T from '../cardstudio/lib/template-library.mjs';
import {ArchiveCore as C} from '../cardstudio/lib/archive-core.mjs';
import {cardsEnvelope} from './card-envelope.mjs';
import {planExchange,applyExchange} from './exchange.mjs';
const catalog={unit:{id:'unit',name:'单位',short:'单位',hint:'数值',stats:[['attack','攻','攻击']],typeLabel:'兵种'}};
function linked(){const p=M.blankProject(),a=C.createArchive(p.archive,{title:'合成林澈',typeId:p.archive.types[0].id,useTemplate:true}),v=a.versions[0];v.rows[0].values[v.fields[0].id]='林澈';v.provenance={fields:{[v.fields[0].id]:{quote:'林澈'}}};const b={id:'binding',name:'测试',typeId:a.typeId,templateId:'unit',map:[{target:'name',source:{kind:'field',fieldId:v.fields[0].id}}]};M.generateCards(p,b);return {p,a,v,c:p.studio.cards[0]};}
test('关联卡回传保持原档案、版本、行及字段编号，并标明手动修订',()=>{
 const {p,a,v,c}=linked();c.name='林澈归来';const packet=cardsEnvelope(p,[c.id]);const incoming=packet.state.archives[0];assert.equal(incoming.id,a.id);assert.equal(incoming.versions[0].id,v.id);assert.equal(incoming.versions[0].rows[0].id,v.rows[0].id);assert.equal(incoming.versions[0].rows[0].values[v.fields[0].id],'林澈归来');assert.equal(incoming.versions[0].provenance.fields[v.fields[0].id].quote,'林澈');assert.equal(incoming.versions[0].provenance.fields[v.fields[0].id].manualCorrection.value,'林澈归来');assert.equal(v.rows[0].values[v.fields[0].id],'林澈');
});
test('独立卡归档编号稳定，改名重传更新同一档案',()=>{
 const p=M.blankProject();p.studio.cards=[{...M.copy((linked()).c),id:'independent'}];p.links=[];
 const packet=cardsEnvelope(p),target=C.blankState(),plan=planExchange(target,packet,'archive');const one=applyExchange(target,plan).state;p.studio.cards[0].name='新名';const again=planExchange(one,cardsEnvelope(p),'archive');assert.equal(again.counts.update,1);assert.equal(applyExchange(one,again).state.archives.length,1);
});
test('同时回传两个卡面覆盖相同档案字段的不同值会明确拒绝',()=>{
 const {p,c}=linked(),other=M.copy(c);other.id='second';other.name='另一名称';p.studio.cards.push(other);p.links.push({...M.copy(p.links[0]),id:'link2',cardId:other.id});assert.throws(()=>cardsEnvelope(p),/分批回传/);
});
test('停用正在使用的模板保持锁定卡的模板、字段和值与排版',()=>{
 const {p,c}=linked();c.layout={title:{x:7,w:86}};c.workflowStatus='锁定';const before=M.copy(c);T.retireTemplate(p.studio,{spell:{id:'spell'}},'spell');assert.deepEqual(c,before);assert.deepEqual(p.studio.projectDesign.hiddenTemplates,['spell']);T.retireTemplate(p.studio,{spell:{id:'spell'}},'spell',false);assert.deepEqual(p.studio.projectDesign.hiddenTemplates,[]);
});
test('任意模板名可保存，空名称不回退为旧名且不改变目录原对象',()=>{
 const p=M.blankProject();T.renameTemplate(p.studio,catalog,'unit',' <自定义>\n任意名字 ');assert.equal(T.templateNames(p.studio,catalog).unit.name,' <自定义>\n任意名字 ');assert.equal(catalog.unit.name,'单位');T.renameTemplate(p.studio,catalog,'unit','');assert.equal(T.templateNames(p.studio,catalog).unit.name,'');
});
test('复制模板的专用字段获得新编号，条件与布局变量重绑到新字段',()=>{
 const p=M.blankProject();const field=T.saveField(p.studio,{label:'护甲',type:'number',tpl:'unit'});p.studio.templateConditions={unit:{effect:{field:'custom:'+field.key,op:'gt',value:'0'}}};p.studio.templateLayouts={unit:{extra:{text:'护甲：{'+field.key+'}'}}};const id=T.copyTemplate(p.studio,catalog,'unit','复制');const fresh=p.studio.fieldSchema.find(f=>f.tpl===id);assert.notEqual(fresh.id,field.id);assert.notEqual(fresh.key,field.key);assert.equal(p.studio.templateConditions[id].effect.field,'custom:'+fresh.key);assert.equal(p.studio.templateLayouts[id].extra.text,'护甲：{'+fresh.key+'}');
});
test('导出再导入模板包含通用和专用字段，原模板与原字段不被覆盖',()=>{
 const p=M.blankProject();T.saveField(p.studio,{label:'通用字段',type:'text'});T.saveField(p.studio,{label:'专用字段',type:'boolean',tpl:'unit'});const raw=T.templatePackage(p.studio,catalog,'unit'),id=T.importTemplate(p.studio,raw);assert.equal(p.studio.fieldSchema.length,4);assert.equal(p.studio.fieldSchema.filter(f=>f.tpl===id).length,2);assert.equal(p.studio.customTemplates[id].name,'单位');
});
test('不同模板的字段不能串入映射，布尔和数字映射保存为正确类型',()=>{
 const {p,a,v}=linked();const f=T.saveField(p.studio,{label:'启用',type:'boolean',tpl:'unit'}),n=T.saveField(p.studio,{label:'护甲',type:'number',tpl:'unit'}),foreign=T.saveField(p.studio,{label:'法术专用',type:'text',tpl:'spell'});const b={id:'typed',name:'类型映射',typeId:a.typeId,templateId:'unit',map:[{target:'custom:'+f.key,source:{kind:'field',fieldId:v.fields[0].id}},{target:'custom:'+n.key,source:{kind:'field',fieldId:v.fields[1].id}}]};v.rows[0].values[v.fields[0].id]='false';v.rows[0].values[v.fields[1].id]='12';M.generateCards(p,b);const c=p.studio.cards.at(-1);assert.equal(c.customFields[f.key],false);assert.equal(c.customFields[n.key],12);assert.throws(()=>M.generateCards(p,{...b,map:[{...b.map[0],target:'custom:'+foreign.key}]}),/不适用/);
});
