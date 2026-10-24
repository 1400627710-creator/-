(function(root){
  'use strict';
  var copy=function(v){return JSON.parse(JSON.stringify(v));};
  var clamp=function(v,a,b){return Math.max(a,Math.min(b,v));};
  var round=function(v){return Math.round(v*1000000)/1000000;};
  function opacityState(layout){
    var legacy=layout.opacity==null?1:layout.opacity;
    return {material:layout.materialOpacity==null?legacy:layout.materialOpacity,text:layout.textOpacity==null?legacy:layout.textOpacity,split:layout.materialOpacity!=null||layout.textOpacity!=null};
  }
  function setOpacity(layout,kind,value,channel){
    if(!Number.isFinite(value)||value<0||value>1)throw Error('透明度需要在 0% 到 100% 之间');
    var next=copy(layout);
    if(kind==='module')next[channel==='text'?'textOpacity':'materialOpacity']=value;
    else if(kind==='text'&&channel==='text'||kind==='image'&&channel==='material')next.opacity=value;
    return next;
  }
  function strokeCss(value){
    var px=clamp(Number(value)||0,0,1.2);
    return '-webkit-text-stroke:'+round(px)+'px currentColor;paint-order:stroke fill';
  }
  // Pointer deltas are canvas percentages. Work in physical coordinates so a
  // rotated layer keeps its opposite corner fixed on the 69 × 94 mm canvas.
  function resizeCorner(layout,corner,dx,dy,keepAspect){
    if(!['nw','ne','sw','se'].includes(corner)||![layout.x,layout.y,layout.w,layout.h,dx,dy].every(Number.isFinite)||layout.w<=0||layout.h<=0)throw Error('缩放参数无效');
    var sx=corner.includes('e')?1:-1,sy=corner.includes('s')?1:-1,r=(layout.r||0)*Math.PI/180,c=Math.cos(r),s=Math.sin(r),w=layout.w*.69,h=layout.h*.94;
    var mx=dx*.69,my=dy*.94,lx=c*mx+s*my,ly=-s*mx+c*my,nw=w+sx*lx,nh=h+sy*ly;
    if(keepAspect){var factor=(w*nw+h*nh)/(w*w+h*h);factor=clamp(factor,Math.max(.5/layout.w,.5/layout.h),Math.min(400/layout.w,400/layout.h));nw=w*factor;nh=h*factor;}
    else{nw=clamp(nw,.345,276);nh=clamp(nh,.47,376);}
    var cx=(layout.x+layout.w/2)*.69,cy=(layout.y+layout.h/2)*.94;
    var ax=cx-c*sx*w/2+s*sy*h/2,ay=cy-s*sx*w/2-c*sy*h/2;
    var ncx=ax+c*sx*nw/2-s*sy*nh/2,ncy=ay+s*sx*nw/2+c*sy*nh/2;
    return Object.assign({},layout,{x:round((ncx-nw/2)/.69),y:round((ncy-nh/2)/.94),w:round(nw/.69),h:round(nh/.94),fitTarget:'manual'});
  }
  function duplicateExtras(selected,all,freshId){
    var source=selected.slice(),seen=new Set(source.map(function(el){return el.id;}));
    selected.filter(function(el){return el.kind==='image';}).forEach(function(el){all.filter(function(child){return child.parentId===el.id&&!seen.has(child.id);}).forEach(function(child){source.push(child);seen.add(child.id);});});
    var ids={};source.forEach(function(el){ids[el.id]=freshId();});
    return source.map(function(el){var out=copy(el);out.id=ids[el.id];out.layout.x+=3;out.layout.y+=3;out.layout.locked=false;if(out.kind==='image')out.initialLayout=copy(out.layout);if(out.parentId){if(ids[out.parentId])out.parentId=ids[out.parentId];else delete out.parentId;}return out;});
  }
  root.KadiEdit=Object.freeze({opacityState:opacityState,setOpacity:setOpacity,strokeCss:strokeCss,resizeCorner:resizeCorner,duplicateExtras:duplicateExtras});
})(typeof window!=='undefined'?window:globalThis);
