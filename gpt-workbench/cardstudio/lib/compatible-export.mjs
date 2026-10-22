export async function compatibleProject(project,Zip,outputType='blob'){
 const zip=new Zip(),studio=JSON.parse(JSON.stringify(project)),manifest=[];
 for(let i=0;i<(studio.userAssets||[]).length;i++){const a=studio.userAssets[i],data=a.dataUrl;if(!data)continue;const match=/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(data);if(!match)throw new Error('素材格式不支持导出：'+(a.name||a.id));const mime=match[1],ext=mime==='image/jpeg'?'jpg':mime==='image/svg+xml'?'svg':mime.slice(6),path=`assets/${i}.${ext}`;zip.file(path,match[2],{base64:true});manifest.push({...a,path,ext,dataUrl:undefined});delete a.dataUrl;}
 zip.file('project.json',JSON.stringify(studio,null,2));zip.file('assets/manifest.json',JSON.stringify({version:2,assets:manifest},null,2));
 return zip.generateAsync({type:outputType,compression:'DEFLATE',compressionOptions:{level:6}});
}
