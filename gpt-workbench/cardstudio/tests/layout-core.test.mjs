import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../lib/layout-core.mjs';
import * as M from '../lib/model.mjs';
import * as Templates from '../lib/template-library.mjs';
import '../legacy/studio/image-layers.js';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const catalog={unit:{id:'unit',stats:[['attack'],['health'],['move'],['range']]},spell:{id:'spell',stats:[['attack'],['range']]},building:{id:'building',stats:[['attack'],['health']]},event:{id:'event',stats:[]},[L.BASIC_ID]:L.BASIC_TEMPLATE};
const close=(a,b,epsilon=0.00001)=>assert.ok(Math.abs(a-b)<epsilon,`${a} ≠ ${b}`);
test('946×1340 透明卡框完整放入画布且保持物理宽高比，透明留白计入原图',()=>{
 const p=L.imageLayout(946,1340,'canvas',3);
 close(p.x+p.w/2,50);close(p.y+p.h/2,50);close(p.w/100*69/(p.h/100*94),946/1340);
 assert.ok(p.w<100&&p.h<=100);assert.equal(p.fit,'contain');assert.equal(p.lockAspect,true);
});
test('适配成品区域准确扣除四边出血，横图与竖图均保持完整且居中',()=>{
 const box=L.targetRect('trim',3);
 close(box.x/100*69,3);close(box.y/100*94,3);close(box.w/100*69,63);close(box.h/100*94,88);
 for(const [w,h] of [[946,1340],[1200,300],[300,1200]]){const p=L.fitRect(w,h,box);assert.ok(p.x>=box.x-1e-6&&p.y>=box.y-1e-6);assert.ok(p.x+p.w<=box.x+box.w+1e-6&&p.y+p.h<=box.y+box.h+1e-6);close(p.w*69/(p.h*94),w/h);}
 assert.throws(()=>L.fitRect(0,100),/尺寸/);
});
test('锁定图片比例时数值缩放同步另一轴，自由比例可独立调整',()=>{
 const p=L.imageLayout(946,1340,'canvas',3),next=L.resized(p,'w',p.w/2);
 close(next.h,p.h/2);assert.equal(p.h,100);assert.equal(next.z,p.z);
 const free=L.resized({...p,lockAspect:false},'h',20);assert.equal(free.h,20);assert.equal(free.w,p.w);
 assert.throws(()=>L.resized(p,'w',0),/大于零/);
});
test('新项目仅有一张基础模板，已有旧卡的模板及自定义停用记录可恢复',()=>{
 const studio=M.blankProject().studio;
 assert.deepEqual(L.available(catalog,studio),[L.BASIC_ID]);
 const original=JSON.stringify(catalog);studio.cards.push({templateId:'unit'});assert.deepEqual(L.available(catalog,studio),['unit',L.BASIC_ID]);
 const copied=Templates.copyTemplate(studio,catalog,L.BASIC_ID,'任意模板');const all={...catalog,...studio.customTemplates};Templates.retireTemplate(studio,all,copied);
 assert.ok(!L.available(all,studio).includes(copied));assert.ok(L.available(all,studio,true).includes(copied));assert.equal(JSON.stringify(catalog),original);
 assert.throws(()=>Templates.retireTemplate(studio,catalog,L.BASIC_ID),/保留/);
});
test('单位法术切换不修改七个字段值、模板定义或任何排版',()=>{
 const card={templateId:L.BASIC_ID,name:'帮派弟兄',unitType:'人类',faction:'底层',description:'登场：检索一张帮派弟兄。',cost:3,attack:1,health:2,layout:{title:{x:20,w:60}}};
 const saved=JSON.stringify(card);assert.deepEqual(L.templateFor(card,catalog).stats.map(x=>x[0]),['attack','health']);
 card.cardKind='spell';assert.deepEqual(L.templateFor(card,catalog).stats,[]);delete card.cardKind;
 assert.equal(JSON.stringify(card),saved);assert.equal(catalog[L.BASIC_ID].stats.length,2);
});
test('新基础模板可从档案制卡，原七项数值与映射编号准确保留',()=>{
 const p=M.blankProject(),records=M.normalizeRecords([{title:'帮派弟兄',fields:[{name:'种族',value:'人类'},{name:'系别',value:'底层'},{name:'效果',value:'登场：检索一张帮派弟兄。'},{name:'费用',value:'3'},{name:'攻击',value:'1'},{name:'血量',value:'2'}]}]);
 M.appendRecords(p,records,{id:'source'});const a=p.archive.archives[0],v=a.versions[0],targets=['unitType','faction','description','cost','attack','health'];
 const binding={id:'seven',name:'七项制卡',templateId:L.BASIC_ID,typeId:a.typeId,map:[{target:'name',source:{kind:'meta',key:'title'}},...targets.map((target,i)=>({target,source:{kind:'field',fieldId:v.fields[i].id}}))]};
 M.generateCards(p,binding);const c=p.studio.cards[0];assert.equal(c.templateId,L.BASIC_ID);assert.deepEqual([c.name,c.unitType,c.faction,c.description,c.cost,c.attack,c.health],['帮派弟兄','人类','底层','登场：检索一张帮派弟兄。',3,1,2]);assert.equal(M.generateCards(p,binding).created,0);M.validateProject(p);
});
test('诊断参数往返包含真实图层数值、零透明度、字体、图片尺寸与出血，不混入原图数据',()=>{
 const card={id:'test',name:'帮派弟兄',templateId:L.BASIC_ID,cardKind:'unit',cost:3,attack:1,health:2};
 const layers=[{type:'layout',id:'frameImage',label:'透明卡框',layout:{x:2,y:0,w:96,h:100,z:-1,r:0,opacity:0,locked:true,visible:false,fit:'contain',lockAspect:true},asset:{id:'asset',name:'透明卡框',width:946,height:1340,dataUrl:'私有原图'},rendered:false}];
 const studio={catalog,projectDesign:{bleedMm:3,fieldLabels:{faction:'任意系别'}},cards:[card]};const report=L.diagnostic(studio,card,layers,{'layout:frameImage':{fontSize:'22px'}}),raw=JSON.stringify(report),roundtrip=JSON.parse(raw);
 assert.equal(roundtrip.layers[0].opacity,0);assert.equal(roundtrip.layers[0].z,-1);assert.equal(roundtrip.layers[0].visible,false);assert.equal(roundtrip.layers[0].image.width,946);assert.equal(roundtrip.layers[0].rendered.fontSize,'22px');close(roundtrip.layers[0].millimeters.x,1.38);assert.ok(!raw.includes('私有原图'));assert.ok(L.readable(report).includes('946 × 1340'));
 card.cardKind='spell';assert.deepEqual(L.diagnostic(studio,card,[],{}).card.fields.map(f=>f.key),['name','faction','description','cost']);
});
test('排版诊断 ZIP 使用实际打包代码往返，包含中文参数、清单和原始预览 PNG 字节',async()=>{
 const module={exports:{}};vm.runInNewContext(readFileSync(fileURLToPath(new URL('../legacy/vendor/jszip.min.js',import.meta.url)),'utf8'),{module,exports:module.exports,Buffer,setImmediate,clearImmediate,setTimeout,clearTimeout,Uint8Array,ArrayBuffer,Promise,TextDecoder,TextEncoder});
 const report=L.diagnostic({catalog,projectDesign:{bleedMm:3}},{id:'zip_test',templateId:L.BASIC_ID,name:'帮派弟兄'},[],{});
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCTkAAAAASUVORK5CYII=';
 const bytes=await globalThis.KadiImages.archive(new module.exports(),report,'data:image/png;base64,'+png,'uint8array'),zip=await module.exports.loadAsync(bytes);
 assert.deepEqual(Object.keys(zip.files).sort(),['卡面预览.png','排版说明.txt','参数.json'].sort());assert.deepEqual(JSON.parse(await zip.file('参数.json').async('string')),report);assert.match(await zip.file('排版说明.txt').async('string'),/帮派弟兄/);assert.deepEqual(Buffer.from(await zip.file('卡面预览.png').async('uint8array')),Buffer.from(png,'base64'));
});
