(function(root){
  'use strict';
  var BASIC_ID='basic-unit',oldIds=['unit','spell','building','event'];
  var BASIC_TEMPLATE={id:BASIC_ID,name:'基础单位卡',short:'单位',hint:'名称 · 种族 · 系别 · 效果 · 费用 · 攻击 · 血量',typeLabel:'种族',stats:[['attack','攻','攻击'],['health','血','血量']],baseLayout:'unit',cardRules:'seven-v1'};
  var fields=[['name','名称'],['unitType','种族'],['faction','系别'],['description','效果'],['cost','费用'],['attack','攻击'],['health','血量']];
  var round=function(x){return Math.round(x*1000000)/1000000;};
  function simple(card,catalog){return !!(card&&catalog[card.templateId]&&(catalog[card.templateId].cardRules==='seven-v1'||card.cardRules==='seven-v1'));}
  function templateFor(card,catalog){
    var t=catalog[card.templateId]||catalog[BASIC_ID]||catalog.unit;
    if(card.cardRules==='seven-v1')t=Object.assign({},t,{typeLabel:'种族',stats:BASIC_TEMPLATE.stats});
    if(simple(card,catalog)&&card.cardKind==='spell')return Object.assign({},t,{name:t.name+' · 法术',short:'法术',stats:[]});
    return t;
  }
  function available(catalog,studio,includeRetired){
    var used=new Set((studio.cards||[]).map(function(c){return c.templateId;})),hidden=new Set(studio.projectDesign&&studio.projectDesign.hiddenTemplates||[]);
    var saved=creationDefault(studio,catalog);if(saved)used.add(saved.templateId);
    return Object.keys(catalog).filter(function(id){return (!oldIds.includes(id)||used.has(id))&&(includeRetired||!hidden.has(id)||id===BASIC_ID);});
  }
  var visualKeys=['cardRules','cardKind','appearance','layout','layoutOverrides','extraElements','textStyles','badgeOffsets','imageLayerDefaults','artAssetId','art'];
  var copy=function(value){return JSON.parse(JSON.stringify(value));};
  function creationDefault(studio,catalog){
    var saved=studio.projectDesign&&studio.projectDesign.cardCreationDefault;
    return saved&&saved.version===1&&saved.visual&&(!catalog||catalog[saved.templateId])?saved:null;
  }
  function defaultTemplateId(studio,catalog){
    var saved=creationDefault(studio,catalog);
    return saved?saved.templateId:catalog[BASIC_ID]?BASIC_ID:catalog.unit?'unit':Object.keys(catalog)[0];
  }
  function captureDefault(studio,card,catalog){
    if(!card||!(studio.cards||[]).some(function(c){return c.id===card.id;})||!catalog[card.templateId])throw Error('请先选中一张已有卡片');
    var visual={};visualKeys.forEach(function(k){if(card[k]!==undefined)visual[k]=copy(card[k]);});
    // Freeze effective badge styles, including styles inherited from the template.
    visual.badgeOffsets=copy(studio.templateBadgeStyles&&studio.templateBadgeStyles[card.templateId]||{});
    Object.keys(card.badgeOffsets||{}).forEach(function(k){visual.badgeOffsets[k]=Object.assign({},visual.badgeOffsets[k]||{},copy(card.badgeOffsets[k]));});
    if(visual.artAssetId)visual.art='';
    studio.projectDesign=studio.projectDesign||{};
    var saved={version:1,templateId:card.templateId,sourceCardId:card.id,sourceName:card.name,templateName:studio.projectDesign.templateLabels&&studio.projectDesign.templateLabels[card.templateId]!==undefined?studio.projectDesign.templateLabels[card.templateId]:catalog[card.templateId].name,visual:visual};
    studio.projectDesign.cardCreationDefault=saved;
    // A previously retired template can become the new default without removing
    // any other definition, changing existing cards, or changing their masters.
    studio.projectDesign.hiddenTemplates=(studio.projectDesign.hiddenTemplates||[]).filter(function(id){return id!==card.templateId;});
    return saved;
  }
  function applyCreationDefault(card,studio,freshId){
    var saved=creationDefault(studio);if(!saved||card.templateId!==saved.templateId)return card;
    visualKeys.forEach(function(k){if(saved.visual[k]!==undefined)card[k]=copy(saved.visual[k]);});
    var ids={};(card.extraElements||[]).forEach(function(el){var old=el.id;el.id=freshId();ids[old]=el.id;});
    (card.extraElements||[]).forEach(function(el){if(el.parentId){if(ids[el.parentId])el.parentId=ids[el.parentId];else delete el.parentId;}});
    // All captured placements are intentional, even when they match today's
    // master. Later template edits must not erase this saved starting format.
    card.layoutOverrides={};Object.keys(card.layout||{}).forEach(function(k){card.layoutOverrides[k]=true;});
    return card;
  }
  function defaultReferencesAsset(studio,id){
    var saved=creationDefault(studio);if(!saved||!id)return false;var v=saved.visual,a=v.appearance||{};
    return v.artAssetId===id||['frameImageAssetId','textureImageAssetId','iconAssetId'].some(function(k){return a[k]===id;})||(v.extraElements||[]).some(function(el){return el.assetId===id;})||Object.keys(v.badgeOffsets||{}).some(function(k){return v.badgeOffsets[k].icon===id;});
  }
  // All rectangles use canvas percentages. Source aspect is measured in pixels,
  // so conversion must account for the physical aspect of the card canvas.
  function fitRect(width,height,target,canvas){
    if(!(width>0&&height>0))throw new Error('图片尺寸无效');
    canvas=canvas||{w:69,h:94};target=target||{x:0,y:0,w:100,h:100};
    var tw=target.w/100*canvas.w,th=target.h/100*canvas.h,scale=Math.min(tw/width,th/height),w=width*scale/canvas.w*100,h=height*scale/canvas.h*100;
    return {x:round(target.x+(target.w-w)/2),y:round(target.y+(target.h-h)/2),w:round(w),h:round(h)};
  }
  function targetRect(target,bleed,canvas){
    canvas=canvas||{w:69,h:94};if(target!=='trim')return {x:0,y:0,w:100,h:100};
    var bx=bleed/canvas.w*100,by=bleed/canvas.h*100;
    return {x:bx,y:by,w:100-2*bx,h:100-2*by};
  }
  function imageLayout(width,height,target,bleed,base){
    var bounds=targetRect(target,bleed||0),rect=fitRect(width,height,bounds);
    return Object.assign({r:0,z:11,opacity:1,visible:true,locked:false,fit:'contain',lockAspect:true,fitTarget:target||'canvas'},base||{},rect);
  }
  function resized(layout,key,value){
    var next=Object.assign({},layout);if(!Number.isFinite(value))throw new Error('尺寸需要有效数字');
    if((key==='w'||key==='h')&&value<=0)throw new Error('图片宽高必须大于零');
    if(layout.lockAspect&&(key==='w'||key==='h')){var other=key==='w'?'h':'w';next[other]=round(layout[other]*value/layout[key]);}
    next[key]=value;return next;
  }
  function diagnostic(studio,card,layers,measurements){
    var design=studio.projectDesign||{},bleed=Number(design.bleedMm??3),dpi=Number(design.targetPrintDpi||300),canvas={w:69,h:94},catalog=studio.catalog||{},isSpell=card.templateId==='spell'||simple(card,catalog)&&card.cardKind==='spell';
    var report={format:'kadi-layout-report',version:1,appVersion:'1.4',exportedAt:new Date().toISOString(),projectName:studio.projectName||'',card:{id:card.id,name:card.name,templateId:card.templateId,kind:isSpell?'法术':'单位',fields:fields.filter(function(f){return !isSpell||!['unitType','attack','health'].includes(f[0]);}).map(function(f){return {key:f[0],label:design.fieldLabels&&Object.prototype.hasOwnProperty.call(design.fieldLabels,f[0])?design.fieldLabels[f[0]]:f[1],value:card[f[0]]??''};})},canvas:{unit:'mm',width:69,height:94,trimWidth:69-2*bleed,trimHeight:94-2*bleed,bleedMm:bleed,safeInsideTrimMm:Number(design.safeContentMm??3),dpi:dpi,editorPixels:{width:348,height:474},previewFile:'卡面预览.png'},layers:[]};
    report.layers=layers.map(function(m,index){
      var p=m.layout,asset=m.asset||null,measurement=measurements&&measurements[m.type+':'+m.id],out={id:m.id,type:m.type,name:m.label,orderFromTop:index,geometry:{unit:'percent',x:p.x,y:p.y,width:p.w,height:p.h,rotationDeg:p.r||0},millimeters:{x:round(p.x/100*canvas.w),y:round(p.y/100*canvas.h),width:round(p.w/100*canvas.w),height:round(p.h/100*canvas.h)},z:p.z??0,visible:m.rendered!==false&&p.visible!==false,locked:!!p.locked,opacity:p.opacity??1};
      out.materialOpacity=p.materialOpacity??p.opacity??1;out.textOpacity=p.textOpacity??p.opacity??1;
      if(m.fieldKey)out.fieldKey=m.fieldKey;
      if(m.text!=null)out.text=m.text;
      if(m.element&&m.element.kind!=='image'){out.text=m.element.text||'';var bound=fields.some(function(f){return f[0]===m.element.fieldKey});if(bound){out.fieldKey=m.element.fieldKey;out.literalText=out.text;out.text=String(card[out.fieldKey]??'');}}
      if(asset){out.image={assetId:asset.id,name:asset.name,width:asset.width||0,height:asset.height||0,originalAspect:asset.width&&asset.height?round(asset.width/asset.height):null,alphaBounds:asset.alphaBounds||null,alphaSampleScale:asset.alphaSampleScale||1,transparentPercent:asset.transparentPercent??null,fit:p.fit||'contain',fitTarget:p.fitTarget||'manual',lockAspect:!!p.lockAspect};}
      if(m.id==='art'&&asset){out.image.fit='background';out.image.crop={focusX:card.appearance?.artFocusX??50,focusY:card.appearance?.artFocusY??50,zoomPercent:card.appearance?.artZoom??100,subjectX:card.appearance?.artSubjectX??50,subjectY:card.appearance?.artSubjectY??42};}
      if(measurement)out.rendered=measurement;
      return out;
    });return report;
  }
  function readable(report){
    var c=report.canvas,lines=['卡递排版参数 · '+report.appVersion,'卡牌：'+report.card.name,'模式：'+report.card.kind,'画布：'+c.width+' × '+c.height+' mm；成品：'+c.trimWidth+' × '+c.trimHeight+' mm','出血：'+c.bleedMm+' mm；裁切内安全距离：'+c.safeInsideTrimMm+' mm','位置与宽高从左上角开始，按画布百分比计算；图层按从上到下排列。',''];
    report.layers.forEach(function(l){var p=l.geometry;lines.push(l.name+' ['+l.id+'] · Z '+l.z+' · '+(l.visible?'显示':'隐藏')+' · '+(l.locked?'锁定':'可编辑'),'  X '+p.x+'% / Y '+p.y+'% / 宽 '+p.width+'% / 高 '+p.height+'% / 角度 '+p.rotationDeg+'° / 不透明度 '+Math.round(l.opacity*100)+'%');if(l.image)lines.push('  素材：'+l.image.name+' · '+l.image.width+' × '+l.image.height+' px · 适配 '+l.image.fit+' · '+(l.image.lockAspect?'锁定比例':'自由比例'));});
    lines.push('','参数.json 可供程序读取；卡面预览.png 用于核对实际效果。','该诊断包只包含当前卡的参数与预览；完整项目仍使用“保存项目”备份。');return lines.join('\n');
  }
  root.KadiLayout=Object.freeze({BASIC_ID:BASIC_ID,BASIC_TEMPLATE:BASIC_TEMPLATE,fields:fields,simple:simple,templateFor:templateFor,available:available,creationDefault:creationDefault,defaultTemplateId:defaultTemplateId,captureDefault:captureDefault,applyCreationDefault:applyCreationDefault,defaultReferencesAsset:defaultReferencesAsset,fitRect:fitRect,targetRect:targetRect,imageLayout:imageLayout,resized:resized,diagnostic:diagnostic,readable:readable});
})(typeof window!=='undefined'?window:globalThis);
