import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../lib/edit-core.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<2e-5,`${a} != ${b}`);
function opposite(p,corner){const sx=corner.includes('e')?1:-1,sy=corner.includes('s')?1:-1,r=(p.r||0)*Math.PI/180,w=p.w*.69,h=p.h*.94;return [(p.x+p.w/2)*.69-Math.cos(r)*sx*w/2+Math.sin(r)*sy*h/2,(p.y+p.h/2)*.94-Math.sin(r)*sx*w/2-Math.cos(r)*sy*h/2];}
test('底图与文字分别调整透明度，保留旧版透明文字，零值不被默认值覆盖',()=>{
 const old={x:5,opacity:.6},next=E.setOpacity(old,'module',0,'material');assert.deepEqual(old,{x:5,opacity:.6});assert.deepEqual(E.opacityState(next),{material:0,text:.6,split:true});
 const text=E.setOpacity(next,'module',1,'text');assert.deepEqual(E.opacityState(text),{material:0,text:1,split:true});
 assert.deepEqual(E.setOpacity(old,'text',.2,'material'),old);assert.equal(E.setOpacity(old,'image',.2,'material').opacity,.2);assert.throws(()=>E.setOpacity(old,'image',NaN,'material'),/透明度/);
});
test('四角在各种角度下等比缩放，对角锚点固定且原图层不被改写',()=>{
 for(const r of [0,27,90,-38])for(const corner of ['nw','ne','sw','se']){
  const p={x:18,y:20,w:31,h:26,r,z:18,opacity:.7,fit:'contain',lockAspect:true},before=structuredClone(p),next=E.resizeCorner(p,corner,7,-9,true),a=opposite(p,corner),b=opposite(next,corner);
  near(next.w/next.h,p.w/p.h);near(a[0],b[0]);near(a[1],b[1]);assert.deepEqual(p,before);assert.equal(next.z,18);assert.equal(next.opacity,.7);assert.equal(next.fit,'contain');
 }
});
test('自由比例可单轴调整；拖过锚点及放大至上限时尺寸仍有效，锁定比例始终不变',()=>{
 const p={x:10,y:10,w:24,h:36,r:0};const free=E.resizeCorner(p,'nw',-10,0,false);near(free.w,34);near(free.h,36);near(free.x,0);near(free.y,10);
 for(const d of [-10000,10000]){const next=E.resizeCorner(p,'se',d,d,true);assert.ok(next.w>=.5&&next.h>=.5&&next.w<=400&&next.h<=400);near(next.w/next.h,2/3);}
 assert.throws(()=>E.resizeCorner({...p,w:0},'se',2,2,true),/参数/);
});
test('复制图片及附属文字独立编号、重绑关系、复用素材且不改原层',()=>{
 const image={id:'image',kind:'image',assetId:'same-asset',layout:{x:10,y:10,w:20,h:20,z:4,locked:true,opacity:.5}},label={id:'label',kind:'text',parentId:'image',text:'标签',strokePx:.6,layout:{x:12,y:12,w:14,h:5,z:5,locked:false}},all=[image,label],before=structuredClone(all);let n=0;
 const copies=E.duplicateExtras([image],all,()=>`new_${++n}`);assert.deepEqual(all,before);assert.equal(copies.length,2);assert.equal(copies[0].assetId,'same-asset');assert.equal(copies[0].layout.locked,false);assert.equal(copies[1].parentId,copies[0].id);assert.equal(copies[1].strokePx,.6);copies[0].layout.w=99;assert.equal(image.layout.w,20);
 assert.equal(E.duplicateExtras([label],all,()=>`new_${++n}`)[0].parentId,undefined);assert.equal(E.duplicateExtras([image,label],all,()=>`new_${++n}`).length,2);
});
test('笔画加粗样式不包含字号、字重、缩放、间距或换行变更',()=>{
 assert.match(E.strokeCss(.6),/-webkit-text-stroke:0.6px currentColor/);assert.ok(!/font-size|font-weight|transform|letter-spacing|white-space/.test(E.strokeCss(.6)));assert.match(E.strokeCss(9),/1.2px/);assert.match(E.strokeCss(-9),/0px/);
});
