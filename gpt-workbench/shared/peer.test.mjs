import test from 'node:test';
import assert from 'node:assert/strict';
import {createPeer} from './peer.mjs';
function windows(origin='https://example.test'){
 const listeners=[new Set,new Set],messages=[];let childUrl;
 const refs=[{closed:false},{closed:false}];
 const dispatch=(to,event)=>Promise.all([...listeners[to]].map(fn=>fn(event)));
 refs[0].postMessage=(data,targetOrigin)=>{messages.push({to:0,data,targetOrigin});queueMicrotask(()=>dispatch(0,{data,source:refs[1],origin}));};
 refs[1].postMessage=(data,targetOrigin)=>{messages.push({to:1,data,targetOrigin});queueMicrotask(()=>dispatch(1,{data,source:refs[0],origin}));};
 function win(i){return {location:{origin,href:(origin==='null'?'file:///test':origin)+'/cardstudio.html',hash:''},crypto:globalThis.crypto,addEventListener:(_,f)=>listeners[i].add(f),removeEventListener:(_,f)=>listeners[i].delete(f),open:url=>{childUrl=url;return refs[1];}};}
 const a=win(0),b=win(1);b.opener=refs[0];return {a,b,messages,refs,dispatch,get childUrl(){return childUrl;}};
}
async function pair(origin){const env=windows(origin),seen=[],a=createPeer({role:'cardstudio',peerUrl:'archive.html',onPacket:p=>seen.push(p)},env.a);a.connect();env.b.location.hash=new URL(env.childUrl).hash;const b=createPeer({role:'archive',peerUrl:'cardstudio.html',onPacket:p=>seen.push(p)},env.b);await new Promise(setImmediate);assert(a.connected&&b.connected);return {env,a,b,seen};}
test('配对窗口可双向手动传送，连接本身不传资料',async()=>{const {a,b,seen,env}=await pair();assert.deepEqual(seen,[]);a.send({synthetic:1});b.send({synthetic:2});await new Promise(setImmediate);assert.deepEqual(seen,[{synthetic:1},{synthetic:2}]);assert(env.messages.every(m=>m.targetOrigin==='https://example.test'));});
test('伪造窗口、配对码、角色或网页来源不能注入来件',async()=>{const {env,seen}=await pair(),valid=env.messages.find(m=>m.data.type==='hello').data;const data={...valid,type:'packet',packet:{attack:true}};for(const event of [{data,source:{},origin:env.a.location.origin},{data:{...data,token:'x'.repeat(48)},source:env.refs[1],origin:env.a.location.origin},{data:{...data,role:'cardstudio'},source:env.refs[1],origin:env.a.location.origin},{data,source:env.refs[1],origin:'https://other.test'}])await env.dispatch(0,event);assert.deepEqual(seen,[]);});
test('本地文件的空来源仍校验原窗口与随机码，关闭后不能发送',async()=>{const {env,a,b,seen}=await pair('null');a.send({local:true});await new Promise(setImmediate);assert.deepEqual(seen,[{local:true}]);assert(env.messages.every(m=>m.targetOrigin==='*'));env.refs[1].closed=true;assert.equal(a.connected,false);assert.throws(()=>a.send({}),/关闭/);b.dispose();});
