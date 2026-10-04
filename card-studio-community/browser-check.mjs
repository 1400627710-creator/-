import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(root,'test-results');
await fs.mkdir(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
    const bytes=await fs.readFile(file);
    res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(bytes);
  }catch{res.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser,context;
const results=[];
async function download(page,id,name){
  const pending=page.waitForEvent('download');await page.locator('#'+id).click();
  const file=await pending,dest=path.join(out,name);await file.saveAs(dest);return fs.readFile(dest);
}
async function openMenu(page){await page.locator('#openProjectMenu').click()}
async function importAssets(page,assets){
  const text=JSON.stringify({schema:'cardstudio-asset-library-v1',version:1,assets});
  await page.locator('#assetLibraryFile').setInputFiles({name:'test.csassets',mimeType:'application/json',buffer:Buffer.from(text)});
  await page.waitForFunction(()=>/共享素材库已导入|素材库导入失败/.test(document.querySelector('#status').textContent));
}
async function exportAssets(page,name){await openMenu(page);return JSON.parse(await download(page,'exportAssetLibrary',name))}
async function test(name,fn,{offline=false}={}){
  const page=await context.newPage();page.setDefaultTimeout(15000);
  const errors=[],network=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url())});
  const cdp=await context.newCDPSession(page);
  await cdp.send('Storage.clearDataForOrigin',{origin,storageTypes:'all'});await cdp.detach();
  try{
    await page.goto(offline?'file://'+path.join(root,'index.html'):origin,{waitUntil:'networkidle'});
    await page.waitForFunction(()=>document.querySelector('#cardCanvas .card-module')&&document.querySelector('#status').textContent);
    await fn(page);assert.deepEqual(errors,[],'Unexpected browser error');
    if(offline)assert.deepEqual(network,[],'Offline mode made a network request');
    results.push({name,status:'passed'});
  }catch(error){
    results.push({name,status:'failed',error:error.message});
    await page.screenshot({path:path.join(out,name+'.png'),fullPage:true}).catch(()=>{});
  }finally{await page.close()}
  console.log(name+': '+results.at(-1).status);
}
try{
  browser=await chromium.launch({headless:true,
    ...(process.env.CARDSTUDIO_CHROMIUM_PATH?{executablePath:process.env.CARDSTUDIO_CHROMIUM_PATH}:{}),
    ...(process.env.CARDSTUDIO_BROWSER_ARGS?{args:JSON.parse(process.env.CARDSTUDIO_BROWSER_ARGS)}:{})
  });
  context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  await context.route('https://cardstudio-community-hub.tells-route3b.chatgpt.site/api/repository/**',r=>r.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(r.request().url().endsWith('/session')?{authenticated:false,admin:false}:{schema:'cardstudio-public-catalog-v1',revision:'test',terms:[],assets:[],counts:{terms:0,assets:0}})}));
  await context.newPage();
  await test('create-edit-save-reopen-png',async page=>{
    assert.equal(await page.locator('#glossaryModal').isVisible(),false);
    await page.locator('#cardCanvas .card-module').filter({hasText:'第一张卡'}).dblclick();
    await page.locator('#inlineEditor textarea').fill('浏览器验证卡');
    await openMenu(page);
    const bytes=await download(page,'saveProject','roundtrip.cscard'),project=JSON.parse(bytes);
    assert.equal(project.cards[0].name,'浏览器验证卡');
    await page.locator('#addText').click();assert.equal(await page.locator('#cardCanvas .card-module').count(),7);
    await page.locator('#undoBtn').click();assert.equal(await page.locator('#cardCanvas .card-module').count(),6);
    await page.locator('#projectFile').setInputFiles({name:'roundtrip.cscard',mimeType:'application/json',buffer:bytes});
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('共创项目已打开'));
    await page.waitForTimeout(650);await page.reload({waitUntil:'networkidle'});
    await page.waitForFunction(()=>document.querySelector('#cardName').value==='浏览器验证卡');
    const png=await download(page,'exportPng','card.png');
    assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),1380);assert.equal(png.readUInt32BE(20),1880);
  });
  await test('distinct-assets-and-cumulative-capacity',async page=>{
    const blue='data:image/png;base64,'+(await fs.readFile(path.join(root,'tests/fixtures/blue.png'))).toString('base64');
    const red='data:image/png;base64,'+(await fs.readFile(path.join(root,'tests/fixtures/red.png'))).toString('base64');
    assert.equal(blue.slice(0,120),red.slice(0,120));
    await importAssets(page,[{id:'blue',name:'同名图',width:48,height:48,dataUrl:blue},{id:'red',name:'同名图',width:48,height:48,dataUrl:red}]);
    assert.equal((await exportAssets(page,'distinct.csassets')).assets.length,2);
    await importAssets(page,Array.from({length:498},(_,i)=>({id:'asset_'+i,name:'容量 '+i,width:48,height:48,dataUrl:blue})));
    const before=(await exportAssets(page,'before.csassets')).assets;assert.equal(before.length,500);
    await importAssets(page,Array.from({length:501},(_,i)=>({id:'overflow_'+i,name:'超限 '+i,width:48,height:48,dataUrl:blue})));
    assert.match(await page.locator('#status').innerText(),/导入失败.*1000/);
    assert.deepEqual((await exportAssets(page,'after.csassets')).assets,before);
  });
  await test('private-glossary-design-roundtrip',async page=>{
    const term={id:'design.guard',name:'守护',color:'#336699',category:'状态',tags:'防御',description:'保护指定友军',aliases:['保护'],example:'守护本回合保护友军。',designNotes:'明确保护目标 <img src=x onerror="window.bad=true">'};
    // Studio export and older glossary.json both contain the same term record.
    await page.locator('#glossaryFile').setInputFiles({name:'glossary.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,terms:[term]}))});
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('共享词条库已同步'));
    await page.locator('#openGlossary').click();await page.locator('[data-repo-tab=mine]').click();await page.locator('#repoList [data-repo-item]').filter({hasText:'守护'}).click();
    assert.match(await page.locator('#repoDetail').innerText(),/明确保护目标/);
    assert.match(await page.locator('#repoDetail').innerText(),/使用示例/);
    assert.equal(await page.locator('#repoDetail img').count(),0);assert.equal(await page.evaluate(()=>window.bad),undefined);
    await page.locator('#repoSearch').fill('保护');assert.equal(await page.locator('#repoList [data-repo-item]').count(),1);
    await page.locator('#repoClose').click();await openMenu(page);
    const project=JSON.parse(await download(page,'saveProject','with-glossary.cscard'));
    assert.equal(project.sharedGlossary.terms[0].designNotes,term.designNotes);assert.equal(project.glossary.terms.length,0);
    await page.waitForTimeout(650);await page.reload({waitUntil:'networkidle'});await page.locator('#openGlossary').click();await page.locator('[data-repo-tab=mine]').click();
    await page.waitForFunction(()=>document.querySelector('#repoList').textContent.includes('守护'));
    assert.equal(await page.locator('#repoDetail img').count(),0);
  });
  await test('offline-png',async page=>{
    const png=await download(page,'exportPng','offline.png');
    assert.equal(png.readUInt32BE(16),1380);assert.equal(png.readUInt32BE(20),1880);
  },{offline:true});
}finally{
  await browser?.close();await new Promise(resolve=>server.close(resolve));
  await fs.writeFile(path.join(out,'browser-results.json'),JSON.stringify({generatedAt:new Date().toISOString(),results},null,2));
}
if(results.some(x=>x.status==='failed'))process.exitCode=1;
