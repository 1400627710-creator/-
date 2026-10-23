import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../lib/layout-core.mjs';
import * as M from '../lib/model.mjs';
import * as T from '../lib/template-library.mjs';

function fixture(){
 const p=M.blankProject('合成默认格式测试'),id='custom-real-unit';
 p.studio.customTemplates={[id]:{...M.copy(L.BASIC_TEMPLATE),id,name:'真单位卡'}};
 const catalog={[L.BASIC_ID]:L.BASIC_TEMPLATE,...p.studio.customTemplates};
 const card={id:'source_unit',templateId:id,name:'帮派弟兄',unitType:'人类',faction:'底层',description:'登场：检索一张帮派弟兄。',cost:3,attack:1,health:2,cardKind:'unit',releaseLocked:true,workflowStatus:'锁定',setId:'old-set',familyId:'old-family',customFields:{private:'角色内容'},
  appearance:{frameImageAssetId:'frame',titleColor:'#452610'},layout:{title:{x:20,y:4,w:60,h:9,z:20,locked:false},frameImage:{x:2,y:0,w:96,h:100,z:11,fit:'contain',lockAspect:true}},layoutOverrides:{title:true},textStyles:{title:{size:18}},badgeOffsets:{cost:{valueDx:.4}},imageLayerDefaults:{frameImage:{x:2,y:0,w:96,h:100}},artAssetId:'art',art:'duplicate-binary',extraElements:[{id:'old_text',kind:'text',text:'单位',layout:{x:10,y:50,w:20,h:8,z:41}},{id:'old_image',kind:'image',assetId:'ornament',layout:{x:60,y:20,w:8,h:8,z:4}}]};
 p.studio.cards=[card];p.studio.templateBadgeStyles={[id]:{cost:{shape:'circle',icon:'badge-icon'}}};
 return {p,card,catalog,id};
}
test('设置唯一默认只保存格式，不改原卡、模板主版或原有锁定状态',()=>{
 const {p,card,catalog,id}=fixture(),before=M.copy(card),masters=M.copy(p.studio.templateLayouts);
 p.studio.projectDesign.hiddenTemplates=[id];L.captureDefault(p.studio,card,catalog);
 assert.equal(L.defaultTemplateId(p.studio,catalog),id);assert.deepEqual(card,before);assert.deepEqual(p.studio.templateLayouts,masters);assert.deepEqual(p.studio.projectDesign.hiddenTemplates,[]);
 const saved=L.creationDefault(p.studio,catalog);assert.equal(saved.sourceName,'帮派弟兄');assert.equal(saved.templateName,'真单位卡');assert.equal(saved.visual.art,'');assert.deepEqual(saved.visual.badgeOffsets.cost,{shape:'circle',icon:'badge-icon',valueDx:.4});
 assert.equal(saved.visual.name,undefined);assert.equal(saved.visual.customFields,undefined);assert.throws(()=>T.retireTemplate(p.studio,catalog,id),/唯一默认/);
});
test('新卡继承卡框、各层位置和字体，数据和身份独立且自由层编号不冲突',()=>{
 const {p,card,catalog,id}=fixture();L.captureDefault(p.studio,card,catalog);let seq=0;
 const make=()=>L.applyCreationDefault({id:'new_'+seq,templateId:id,name:'新卡',cost:0,attack:1,health:1,releaseLocked:false,workflowStatus:'设计中',customFields:{}},p.studio,()=>`new_layer_${++seq}`);
 const a=make(),b=make();assert.deepEqual(a.layout,card.layout);assert.deepEqual(a.appearance,card.appearance);assert.deepEqual(a.textStyles,card.textStyles);assert.equal(a.name,'新卡');assert.equal(a.cost,0);assert.equal(a.releaseLocked,false);assert.equal(a.setId,undefined);assert.equal(a.familyId,undefined);assert.deepEqual(a.customFields,{});
 assert.notEqual(a.extraElements[0].id,card.extraElements[0].id);assert.notEqual(a.extraElements[0].id,b.extraElements[0].id);assert.equal(a.extraElements[1].assetId,'ornament');a.layout.frameImage.w=50;a.extraElements[0].text='独立修改';assert.equal(b.layout.frameImage.w,96);assert.equal(card.extraElements[0].text,'单位');
 card.layout.title.y=22;assert.equal(L.creationDefault(p.studio,catalog).visual.layout.title.y,4);
 const other={templateId:L.BASIC_ID,layout:{}};assert.equal(L.applyCreationDefault(other,p.studio,()=>''),other);assert.deepEqual(other.layout,{});
});
test('默认格式随完整项目往返，源卡删除后仍可用，素材被视作使用中',()=>{
 const {p,card,catalog,id}=fixture();L.captureDefault(p.studio,card,catalog);const restored=M.validateProject(JSON.parse(JSON.stringify(p)));restored.studio.cards=[];
 assert.equal(L.defaultTemplateId(restored.studio,catalog),id);for(const asset of ['frame','art','ornament','badge-icon'])assert.ok(L.defaultReferencesAsset(restored.studio,asset),asset);assert.ok(!L.defaultReferencesAsset(restored.studio,'unused'));
 const c=L.applyCreationDefault({templateId:id},restored.studio,()=>M.uid('layer'));assert.equal(c.layout.frameImage.z,11);assert.equal(c.extraElements.length,2);
 const replacement={...M.copy(card),id:'replacement',name:'另一个默认',templateId:L.BASIC_ID};restored.studio.cards=[replacement];L.captureDefault(restored.studio,replacement,catalog);assert.equal(L.defaultTemplateId(restored.studio,catalog),L.BASIC_ID);assert.equal(L.creationDefault(restored.studio,catalog).sourceCardId,'replacement');assert.equal(L.defaultTemplateId({projectDesign:{cardCreationDefault:{version:1,templateId:'missing',visual:{}}}},catalog),L.BASIC_ID);
});
test('档案批量制卡使用同一默认格式，映射数值不会被样板数据覆盖',()=>{
 const {p,card,catalog,id}=fixture();L.captureDefault(p.studio,card,catalog);
 M.appendRecords(p,M.normalizeRecords([{title:'档案新单位',fields:[{name:'费用',value:'5'},{name:'攻击',value:'8'}]}]),{id:'source'});
 const a=p.archive.archives[0],v=a.versions[0],binding={id:'binding',name:'默认格式映射',typeId:a.typeId,templateId:id,map:[{target:'name',source:{kind:'meta',key:'title'}},{target:'cost',source:{kind:'field',fieldId:v.fields[0].id}},{target:'attack',source:{kind:'field',fieldId:v.fields[1].id}}]};
 M.generateCards(p,binding);const fresh=p.studio.cards.at(-1);assert.deepEqual(fresh.layout,card.layout);assert.equal(fresh.appearance.frameImageAssetId,'frame');assert.deepEqual([fresh.name,fresh.cost,fresh.attack],['档案新单位',5,8]);assert.equal(p.links[0].bindingId,'binding');assert.equal(M.generateCards(p,binding).created,0);assert.equal(p.studio.cards.length,2);
});
