(function(root){
  'use strict';
  var roleFields={frameImage:'frameImageAssetId',textureImage:'textureImageAssetId',iconImage:'iconAssetId'};
  var roleKeys={frameImage:'frameImage',textureImage:'textureImage',icon:'iconImage',iconImage:'iconImage'};
  async function archive(zip,report,png,type){
    zip.file('参数.json',JSON.stringify(report,null,2));
    zip.file('排版说明.txt',root.KadiLayout.readable(report));
    zip.file('卡面预览.png',png.slice(png.indexOf(',')+1),{base64:true});
    return zip.generateAsync({type:type||'blob',compression:'DEFLATE'});
  }
  async function inspect(asset){
    if(asset.imageInspected&&asset.width>0&&asset.height>0)return asset;
    var im=await new Promise(function(resolve,reject){var image=new Image();image.onload=function(){resolve(image)};image.onerror=function(){reject(new Error('无法读取图片，请重新导入 PNG、JPG、WebP 或 SVG'))};image.src=asset.dataUrl;});
    asset.width=im.naturalWidth;asset.height=im.naturalHeight;
    var scale=Math.min(1,2048/Math.max(asset.width,asset.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(asset.width*scale));canvas.height=Math.max(1,Math.round(asset.height*scale));
    var context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(im,0,0,canvas.width,canvas.height);
    try{
      var data=context.getImageData(0,0,canvas.width,canvas.height).data,minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1,transparent=0,hasAlpha=false;
      for(var y=0;y<canvas.height;y++)for(var x=0;x<canvas.width;x++){var a=data[(y*canvas.width+x)*4+3];if(a<255)hasAlpha=true;if(a===0)transparent++;if(a>0){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}
      asset.alphaBounds=maxX<0?null:{x:Math.floor(minX/scale),y:Math.floor(minY/scale),width:Math.min(asset.width,Math.ceil((maxX+1)/scale))-Math.floor(minX/scale),height:Math.min(asset.height,Math.ceil((maxY+1)/scale))-Math.floor(minY/scale)};
      asset.alphaSampleScale=scale;asset.transparentPercent=Math.round(transparent/(canvas.width*canvas.height)*10000)/100;asset.hasAlpha=hasAlpha;
    }catch(e){asset.alphaBounds=null;asset.transparentPercent=null;}
    canvas.width=canvas.height=1;asset.imageInspected=true;return asset;
  }
  function install(ctx){
    var $=ctx.$,core=root.KadiLayout;
    function imageFor(m,card){
      if(!m)return null;card=card||ctx.current();
      if(m.type==='extra'&&m.element&&m.element.kind==='image')return ctx.assetById(m.element.assetId)||{id:m.element.id,name:m.element.name,dataUrl:m.element.src};
      if(m.type==='layout'&&roleFields[m.id])return ctx.assetById(card.appearance[roleFields[m.id]]);
      return null;
    }
    function selected(){var m=ctx.selected();return m&&imageFor(m)&&!m.layout.locked&&!ctx.locked()?m:null;}
    function refresh(m,count){
      var a=count===1&&imageFor(m),box=$('#imageGeometryTools');box.hidden=!a;if(!a)return;
      $('#imageSourceInfo').textContent=(a.name||'图片素材')+' · '+(a.width&&a.height?a.width+' × '+a.height+' px':'原始尺寸将在适配时读取');
      $('#imageFitMode').value=m.layout.fit||'contain';$('#imageFitTarget').value=m.layout.fitTarget||'manual';
      $('#lockAspect').checked=!!m.layout.lockAspect;
      box.querySelectorAll('button,select').forEach(function(el){el.disabled=ctx.locked()||!!m.layout.locked;});
    }
    async function applyRole(asset,role){
      var key=roleKeys[role];if(!key)throw new Error('不支持的图片角色');
      var c=ctx.current();if(ctx.locked())throw new Error('当前卡牌已锁定，请先解锁');await inspect(asset);
      if(ctx.current()!==c)throw new Error('当前卡片已切换，请重新应用素材');
      ctx.history();var initial=core.imageLayout(asset.width,asset.height,'canvas',ctx.bleed(),{z:key==='frameImage'?11:key==='textureImage'?3:28,opacity:key==='textureImage'?.35:1});
      if(key==='iconImage'){Object.assign(initial,core.fitRect(asset.width,asset.height,{x:76,y:5,w:16,h:16}),{fitTarget:'manual'});}
      c.appearance[roleFields[key]]=asset.id;c.layout[key]=initial;c.imageLayerDefaults||={};c.imageLayerDefaults[key]=JSON.parse(JSON.stringify(initial));
      ctx.override(key);ctx.render();ctx.select({type:'layout',id:key});ctx.save();return key;
    }
    async function fit(){
      var m=selected();if(!m)return;var card=ctx.current(),a=imageFor(m),mode=$('#imageFitMode').value,target=$('#imageFitTarget').value;
      await inspect(a);if(ctx.current()!==card||ctx.selected()?.id!==m.id||!selected())throw new Error('选择已改变，请重新适配');
      ctx.history();ctx.mark(m);var bounds=target==='manual'?{x:m.layout.x,y:m.layout.y,w:m.layout.w,h:m.layout.h}:core.targetRect(target,ctx.bleed());
      Object.assign(m.layout,mode==='contain'?core.fitRect(a.width,a.height,bounds):bounds,{fit:mode,lockAspect:mode!=='fill',fitTarget:target});
      ctx.render();ctx.refresh();ctx.save();ctx.status('图片已适配：'+(target==='trim'?'成品裁切区域':target==='canvas'?'整张画布':'当前区域'));
    }
    $('#fitImageLayer').onclick=function(){fit().catch(function(e){ctx.status(e.message)});};
    $('#centerImageLayer').onclick=function(){var m=selected();if(!m)return;ctx.history();ctx.mark(m);m.layout.x=(100-m.layout.w)/2;m.layout.y=(100-m.layout.h)/2;ctx.render();ctx.refresh();ctx.save();};
    $('#resetImageLayer').onclick=function(){var m=selected();if(!m)return;var p=m.type==='extra'?m.element.initialLayout:ctx.current().imageLayerDefaults?.[m.id];ctx.history();ctx.mark(m);Object.assign(m.layout,p||ctx.defaults[m.id]);ctx.render();ctx.refresh();ctx.save();ctx.status('图片已恢复到导入时的位置与尺寸');};
    $('#lockAspect').addEventListener('change',function(){var m=selected();if(!m)return;ctx.history();ctx.mark(m);m.layout.lockAspect=this.checked;ctx.save();});
    async function exportPackage(){
      var button=$('#exportLayoutParams');if(button.disabled)return;button.disabled=true;var before=ctx.state(),card=JSON.parse(JSON.stringify(ctx.current()));
      try{
        ctx.status('正在导出当前卡的排版参数与预览…');
        function reportAsset(m){return m.id==='art'?(ctx.assetById(card.artAssetId)||(card.art?{id:'embedded-art',name:'插画',dataUrl:card.art}:null)):imageFor(m,card)}
        var models=ctx.layers(card);for(var m of models){var a=reportAsset(m);if(a)await inspect(a);}
        var png=await ctx.capture(card),current=ctx.state();
        if(JSON.stringify(current.cards)!==JSON.stringify(before.cards)||JSON.stringify(current.projectDesign)!==JSON.stringify(before.projectDesign))throw new Error('导出期间排版已变化，请重新导出');
        var measurements={};for(var m of models){
          var selector=m.type==='extra'?'[data-extra-id="'+m.id+'"]':'[data-layout-key="'+m.id+'"]',node=$('#exportCard').querySelector(selector),text=node&&node.querySelector('[data-edit]'),computed=node&&getComputedStyle(text||node);
          if(node){var rect=node.getBoundingClientRect(),cardRect=$('#exportCard .card').getBoundingClientRect();measurements[m.type+':'+m.id]={boxPixels:{x:rect.left-cardRect.left,y:rect.top-cardRect.top,width:rect.width,height:rect.height},font:computed.fontFamily,fontSize:computed.fontSize,fontWeight:computed.fontWeight,lineHeight:computed.lineHeight,textAlign:computed.textAlign,color:computed.color,letterSpacing:computed.letterSpacing};}
          m.asset=reportAsset(m);m.rendered=!!node;if(m.type==='layout'){m.fieldKey=ctx.fieldKey(m.id);m.text=card[m.fieldKey];}
        }
        before.catalog=ctx.catalog();var report=core.diagnostic(before,card,models,measurements),im=await new Promise(function(resolve,reject){var image=new Image();image.onload=function(){resolve(image)};image.onerror=reject;image.src=png;});report.canvas.previewPixels={width:im.naturalWidth,height:im.naturalHeight};
        var blob=await archive(ctx.zip(),report,png);ctx.download(blob,ctx.filename(card.name||'未命名卡牌')+'-排版参数.zip');
        var old=$('#copyLayoutParams');if(old)old.remove();var copy=document.createElement('button');copy.id='copyLayoutParams';copy.type='button';copy.textContent='复制排版参数';
        copy.onclick=async function(){var json=JSON.stringify(report,null,2);try{if(!navigator.clipboard||!navigator.clipboard.writeText)throw new Error('需手动复制');await navigator.clipboard.writeText(json);ctx.status('排版参数已复制，可直接粘贴发给我')}catch(e){var previous=$('#layoutParamsText');if(previous)previous.remove();var text=document.createElement('textarea');text.id='layoutParamsText';text.readOnly=true;text.rows=6;text.value=json;text.setAttribute('aria-label','排版参数（可全选复制）');$('.export-actions').appendChild(text);text.focus();text.select();if(document.execCommand&&document.execCommand('copy')){text.remove();ctx.status('排版参数已复制，可直接粘贴发给我')}else ctx.status('请全选复制下方参数，粘贴发给我')}};
        $('.export-actions').appendChild(copy);ctx.status('排版参数包已生成；可下载 ZIP 或复制参数发给我');
      }catch(e){ctx.status('排版参数导出失败：'+e.message);}finally{button.disabled=false;}
    }
    $('#exportLayoutParams').onclick=exportPackage;
    return {imageFor:imageFor,refresh:refresh,applyRole:applyRole,exportPackage:exportPackage};
  }
  root.KadiImages={roleFields:roleFields,inspect:inspect,install:install,archive:archive};
})(typeof window!=='undefined'?window:globalThis);
