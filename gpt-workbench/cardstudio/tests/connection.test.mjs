import test from 'node:test';
import assert from 'node:assert/strict';
import {uiSurface,isRpcResponse} from '../lib/ui-surface.mjs';
const {api,mcp,workbench}=await import('../.test-build/service.js');
const origin='https://connection-test.invalid';
async function rpc(method,params={},owner){
 const response=await mcp(new Request(origin+'/mcp',{method:'POST',headers:{'Content-Type':'application/json',...(owner?{'oai-authenticated-user-id':owner}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}));
 assert.equal(response.status,200);
 return response.json();
}

test('窗口接入：普通网页 iframe 不向父窗口发起插件握手',()=>{
 assert.equal(uiSurface('mcp',true),'mcp');
 assert.equal(uiSurface('web',true),'web-preview');
 assert.equal(uiSurface(undefined,true),'web-preview');
 assert.equal(uiSurface('mcp',false),'mcp');
 assert.equal(uiSurface('web',false),'web');
});

test('窗口消息：同窗口的请求回声不能冒充初始化响应',()=>{
 assert.equal(isRpcResponse({jsonrpc:'2.0',id:1,method:'ui/initialize',params:{}}),false);
 assert.equal(isRpcResponse({jsonrpc:'2.0',id:1}),false);
 assert.equal(isRpcResponse({jsonrpc:'2.0',id:1,result:{hostCapabilities:{}}}),true);
 assert.equal(isRpcResponse({jsonrpc:'2.0',id:0,result:null}),true);
 assert.equal(isRpcResponse({jsonrpc:'2.0',id:1,error:{code:-32601,message:'Unsupported'}}),true);
});

test('窗口资源：插件与网站使用不同标记，显示模式遵循宿主元数据',async()=>{
 const tools=(await rpc('tools/list')).result.tools;
 const opener=tools.find(t=>t.name==='open_workbench');
 assert.equal(opener._meta.ui.resourceUri,'ui://cardstudio/assistant-workbench');
 assert.deepEqual(opener._meta['openai/ui'].entrypoints,[{type:'global'}]);
 assert.equal(opener._meta['openai/outputTemplate'],undefined);
 const resource=(await rpc('resources/read',{uri:opener._meta.ui.resourceUri})).result.contents[0];
 assert.equal(resource.mimeType,'text/html;profile=mcp-app');
 assert.deepEqual(resource._meta['openai/ui'],{preferredDisplayMode:'fullscreen',availableDisplayModes:['inline','fullscreen']});
 assert.equal(resource._meta.ui.preferredDisplayMode,undefined);
 assert.ok(resource.text.includes('name="cardstudio-surface" content="mcp-local"'));
 const legacy=(await rpc('resources/read',{uri:'ui://cardstudio/workbench'})).result.contents[0];
 assert.ok(legacy.text.includes('name="cardstudio-surface" content="mcp"'));
 const webpage=await workbench();
 assert.equal(webpage.status,200);
 const html=await webpage.text();
 assert.ok(html.includes('name="cardstudio-surface" content="web"'));
 assert.ok(!html.includes('name="cardstudio-surface" content="mcp"'));
 assert.match(html,/id="signin-link"[^>]+target="_top"/);
 assert.ok(html.includes('/plugins/plugin_asdk_app_sites_69c46a7643a88191ac8b620a14f7cabd/app/open_workbench'));
});

test('窗口就绪：打开请求不冒充加载成功，就绪回执不写项目且仍需身份',async()=>{
 const owner=`connection_${Date.now()}`;
 const call=(name,args={},user=owner)=>rpc('tools/call',{name,arguments:args},user);
 const opened=(await call('open_workbench')).result.structuredContent;
 assert.equal(opened.status,'requested');
 assert.equal(opened.opened,undefined);
 assert.equal((await call('list_projects')).result.structuredContent.projects.length,0);
 const ack=(await call('app_service',{action:'uiReady'})).result;
 assert.deepEqual(ack._meta.data,{ready:true,version:'1.0.3'});
 assert.equal((await call('list_projects')).result.structuredContent.projects.length,0);
 assert.ok((await call('app_service',{action:'uiReady'},null)).error);
 const unauthorized=await api(new Request(origin+'/api/service',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'uiReady'})}));
 assert.equal(unauthorized.status,401);
});
