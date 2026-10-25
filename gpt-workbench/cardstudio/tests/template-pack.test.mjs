import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../lib/model.mjs';
import * as T from '../lib/template-library.mjs';
import * as L from '../lib/layout-core.mjs';
import {CARD_BLUEPRINT} from '../lib/studio-defaults.mjs';

const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const catalog={[L.BASIC_ID]:L.BASIC_TEMPLATE};
function source(){
 const p=M.blankProject('合成模板测试'),s=p.studio,c={...M.copy(CARD_BLUEPRINT),id:'source-card',templateId:L.BASIC_ID,name:'业务卡名不应导出',cost:7,attack:8,health:9,description:'仅这一张卡的效果'};
 s.userAssets=[{id:'frame',name:'透明卡框',roles:['frame'],dataUrl:pixel,width:69,height:94},{id:'icon',name:'本套图标',roles:['icon'],dataUrl:pixel,width:1,height:1},{id:'unrelated',name:'不相关插画',dataUrl:pixel}];
 c.layout={title:{x:10,y:8.125,w:80,h:9,z:50},frameImage:{x:1.25,y:2.5,w:97.5,h:95,r:3,z:20,opacity:.8,fit:'contain',lockAspect:true},effect:{x:12,y:60,w:76,h:20,z:55,materialOpacity:.3,textOpacity:1}};
 c.appearance.frameImageAssetId='frame';c.appearance.titleSize=25;c.textStyles={title:{strokePx:.75}};
 c.extraElements=[{id:'image-layer',kind:'image',assetId:'icon',layout:{x:5,y:5,w:10,h:10,z:25,opacity:.7}},{id:'attached',kind:'text',text:'费用',parentId:'image-layer',fontSize:12,strokePx:.4,layout:{x:5,y:5,w:10,h:3,z:26}},{id:'bound',kind:'text',fieldKey:'name',text:'',layout:{x:10,y:15,w:80,h:5,z:60}},{id:'inline-icon',kind:'number',text:'{{icon:本套图标}} 1',layout:{x:3,y:90,w:10,h:5,z:70}}];
 s.cards=[c];s.selected=c.id;s.projectDesign.bleedMm=4;s.projectDesign.fieldLabels={faction:'任意系名'};s.templateBadgeStyles={[L.BASIC_ID]:{cost:{icon:'icon',shape:'circle',valueDx:2}}};
 return {p,s,c};
}
test('完整模板跨空项目往返：图片、有效布局、自由层、字体、绑定、出血均保留，业务卡数据不携带',()=>{
 const {s,c}=source(),before=M.copy(s),packet=T.templatePackage(s,catalog,c.templateId,{cardId:c.id,name:'真单位卡模板'}),bytes=JSON.stringify(packet);
 assert.deepEqual(s,before);assert.equal(packet.version,2);assert.deepEqual(packet.assets.map(a=>a.id),['frame','icon']);assert(!bytes.includes('业务卡名不应导出'));assert(!bytes.includes('仅这一张卡的效果'));assert(!('cards' in packet));
 const target=M.blankProject(),id=T.importTemplate(target.studio,JSON.parse(bytes),{makeDefault:true,applyProjectSettings:true});
 assert.equal(target.studio.cards.length,0);assert.equal(target.studio.projectDesign.bleedMm,4);assert.equal(target.studio.projectDesign.fieldLabels.faction,'任意系名');
 const fresh={...M.copy(CARD_BLUEPRINT),id:'new-card',templateId:id,name:'全新卡牌'};L.applyCreationDefault(fresh,target.studio,()=>M.uid('el'));
 assert.deepEqual(fresh.layout,c.layout);assert.equal(fresh.appearance.titleSize,25);assert.equal(fresh.textStyles.title.strokePx,.75);assert.equal(fresh.name,'全新卡牌');assert.equal(fresh.cost,0);assert.equal(fresh.description,'');
 assert.notEqual(fresh.appearance.frameImageAssetId,'frame');assert.equal(target.studio.userAssets.find(a=>a.id===fresh.appearance.frameImageAssetId).dataUrl,pixel);
 const [image,label,bound,inline]=fresh.extraElements;assert.notEqual(image.id,'image-layer');assert.equal(label.parentId,image.id);assert.equal(bound.fieldKey,'name');assert(inline.text.includes(image.assetId));assert.equal(fresh.badgeOffsets.cost.icon,image.assetId);assert.equal(fresh.layout.effect.materialOpacity,.3);assert.equal(fresh.layout.effect.textOpacity,1);
});
test('导出已保存默认格式不依赖原卡仍存在；未保存的本卡精调可明确导出',()=>{
 const {s,c}=source();L.captureDefault(s,c,catalog);s.cards=[];const packet=T.templatePackage(s,catalog,c.templateId);assert.deepEqual(packet.visual.layout,c.layout);assert.equal(packet.assets.length,2);
 s.cards=[c];c.layout.title.y=18;assert.equal(T.templatePackage(s,catalog,c.templateId).visual.layout.title.y,8.125);assert.equal(T.templatePackage(s,catalog,c.templateId,{cardId:c.id}).visual.layout.title.y,18);
});
test('导入为非默认模板也可完整用于新建及批量制卡；原有卡面、同名模板和同名素材不覆盖',()=>{
 const {s,c}=source(),packet=T.templatePackage(s,catalog,c.templateId,{cardId:c.id}),target=M.blankProject();target.studio.userAssets=[{id:'frame',name:'透明卡框',dataUrl:'data:image/png;base64,OLD'}];target.studio.cards=[{...M.copy(CARD_BLUEPRINT),id:'existing',name:'旧卡'}];const old=M.copy(target.studio.cards[0]),id=T.importTemplate(target.studio,packet);assert.deepEqual(target.studio.cards[0],old);assert.equal(target.studio.userAssets[0].dataUrl,'data:image/png;base64,OLD');assert(!L.creationDefault(target.studio));
 const fresh={...M.copy(CARD_BLUEPRINT),templateId:id};L.applyCreationDefault(fresh,target.studio,()=>M.uid('layer'));assert.deepEqual(fresh.layout,c.layout);
 const rec=M.normalizeRecords([{title:'新的单位',fields:[]}]);M.appendRecords(target,rec,{id:'source'});M.generateCards(target,{id:'binding',name:'制卡',templateId:id,map:[{target:'name',source:{kind:'meta',key:'title'}}]});assert.deepEqual(target.studio.cards.at(-1).layout,c.layout);assert.equal(target.studio.cards.at(-1).name,'新的单位');
});
test('通用和专用字段变量、条件在完整模板迁移和复制后重绑，后续导出仍自包含',()=>{
 const {s,c}=source(),f=T.saveField(s,{label:'护甲',type:'number',tpl:c.templateId});c.extraElements.push({id:'custom',kind:'text',text:'护甲：{'+f.key+'}',layout:{x:5,y:5,w:20,h:8}});s.templateConditions={[c.templateId]:{effect:{field:'custom:'+f.key,op:'gt',value:'0'}}};const packet=T.templatePackage(s,catalog,c.templateId,{cardId:c.id}),target=M.blankProject(),id=T.importTemplate(target.studio,packet),field=target.studio.fieldSchema[0],all={...catalog,...target.studio.customTemplates};assert.notEqual(field.key,f.key);assert.equal(target.studio.customTemplates[id].visual.extraElements.at(-1).text,'护甲：{'+field.key+'}');assert.equal(target.studio.templateConditions[id].effect.field,'custom:'+field.key);
 const clone=T.copyTemplate(target.studio,all,id,'副本');assert(target.studio.customTemplates[clone].visual);const twice=T.templatePackage(target.studio,{...all,...target.studio.customTemplates},id);assert.equal(twice.assets.length,2);assert.equal(twice.design.bleedMm,4);
});
test('损坏素材、无效几何与无效字段整体拒绝，导入失败不留下半套模板',()=>{
 const {s,c}=source(),pack=T.templatePackage(s,catalog,c.templateId,{cardId:c.id});
 for(const mutate of [p=>p.assets.pop(),p=>p.visual.layout.title.w=-1,p=>p.fields=[{label:'坏字段',type:'bad'}],p=>p.visual.extraElements[0].src='blob:expired',p=>p.visual.extraElements[1].parentId='missing']){
  const target=M.blankProject(),before=JSON.stringify(target.studio),bad=M.copy(pack);mutate(bad);assert.throws(()=>T.importTemplate(target.studio,bad));assert.equal(JSON.stringify(target.studio),before);
 }
 s.userAssets=[];assert.throws(()=>T.templatePackage(s,catalog,c.templateId,{cardId:c.id}),/素材|图标/);
});
test('旧版模板仍可导入；完整模板未使用的图像、档案、映射、凭据均不输出',()=>{
 const target=M.blankProject(),raw={format:'cardstudio-template',version:1,template:L.BASIC_TEMPLATE,layout:{title:{x:10,y:8,w:80,h:9}},fields:[],conditions:{}},id=T.importTemplate(target.studio,raw);assert.deepEqual(target.studio.templateLayouts[id],raw.layout);
 const {s,c}=source();s.aiKey='不导出';s.projectDesign.cardCreationDefault={version:1,templateId:c.templateId,sourceCardId:c.id,sourceName:c.name,visual:L.captureVisual(s,c)};const packet=T.templatePackage(s,catalog,c.templateId);assert(!JSON.stringify(packet).includes('不导出'));assert(!JSON.stringify(packet).includes('不相关插画'));
});
test('模板资产在尚未创建卡片时也被引用保护，重名导入各自获得独立编号',()=>{
 const {s,c}=source(),packet=T.templatePackage(s,catalog,c.templateId,{cardId:c.id}),target=M.blankProject(),a=T.importTemplate(target.studio,packet),b=T.importTemplate(target.studio,packet);assert.notEqual(a,b);const asset=target.studio.customTemplates[a].visual.appearance.frameImageAssetId;assert(L.defaultReferencesAsset(target.studio,asset));assert.notEqual(asset,target.studio.customTemplates[b].visual.appearance.frameImageAssetId);
});
