import test from 'node:test';
import assert from 'node:assert/strict';
import {ArchiveCore as C} from '../cardstudio/lib/archive-core.mjs';
import {envelope,planExchange,applyExchange,validateEnvelope} from './exchange.mjs';

function fixture(name='林澈'){
 const state=C.blankState(),a=C.createArchive(state,{title:name,typeId:state.types[0].id,useTemplate:true}),v=a.versions[0];
 v.rows[0].values[v.fields[0].id]=name;v.rows[0].values[v.fields[1].id]='药师';return {state,a,v};
}
function imported(){const source=fixture(),target=C.blankState();const plan=planExchange(target,envelope(source.state,'source'), 'target');return {source,target:applyExchange(target,plan).state};}

test('首次传送只新增档案，原有不同名资料保留',()=>{
 const s=fixture(),t=fixture('沈禾');const plan=planExchange(t.state,envelope(s.state,'source'),'target');
 assert.equal(plan.counts.new,1);assert.equal(t.state.archives.length,1);
 const result=applyExchange(t.state,plan).state;assert.equal(result.archives.length,2);assert.equal(result.archives[0].versions[0].title,'沈禾');
});
test('原样重传不增加档案、版本或行',()=>{
 const {source,target}=imported();const plan=planExchange(target,envelope(source.state,'source'),'target');
 assert.equal(plan.counts.same,1);const r=applyExchange(target,plan);assert.equal(r.stats.updated,0);assert.equal(r.state.revision,target.revision);assert.equal(r.state.archives.length,1);
});
test('改档案名和字段名后保留目标编号与已有字段映射',()=>{
 const {source,target}=imported(),a=target.archives[0],field=a.versions[0].fields[1].id;
 source.v.title='林澈·归来';source.v.fields[1].name='职业';source.v.rows[0].values[source.v.fields[1].id]='炼金师';
 const plan=planExchange(target,envelope(source.state,'source'),'target');assert.equal(plan.counts.update,1);
 const next=applyExchange(target,plan).state;assert.equal(next.archives.length,1);assert.equal(next.archives[0].id,a.id);
 assert.equal(next.archives[0].versions[0].fields.find(f=>f.id===field).name,'职业');assert.equal(next.archives[0].versions[0].rows[0].values[field],'炼金师');
});
test('双边修改必须显式采用来件，默认保留本机',()=>{
 const {source,target}=imported(),v=target.archives[0].versions[0];v.rows[0].values[v.fields[1].id]='本机职业';target.revision++;
 source.v.rows[0].values[source.v.fields[1].id]='来件职业';
 const plan=planExchange(target,envelope(source.state,'source'),'target');assert.equal(plan.counts.conflict,1);
 const kept=applyExchange(target,plan);assert.equal(kept.stats.updated,0);assert.equal(kept.state.archives[0].versions[0].rows[0].values[v.fields[1].id],'本机职业');
 const accepted=applyExchange(target,plan,{[plan.rows[0].key]:true});assert.equal(accepted.stats.updated,1);assert.equal(accepted.state.archives[0].versions[0].rows[0].values[v.fields[1].id],'来件职业');
});
test('来件未变而本机有修改时不恢复旧内容',()=>{
 const {source,target}=imported();target.archives[0].versions[0].title='本机新名';target.revision++;
 const plan=planExchange(target,envelope(source.state,'source'),'target');assert.equal(plan.counts.local,1);assert.equal(applyExchange(target,plan).state.archives[0].versions[0].title,'本机新名');
});
test('目标额外字段、行与故事版本在确认更新后仍保留',()=>{
 const {source,target}=imported(),a=target.archives[0],v=a.versions[0];const f=C.addField(v,'仅在本机');v.rows[0].values[f.id]='保留我';v.rows.push(C.row());C.createVersion(target,a.id,v.id,{timeLabel:'后日',timeOrder:2});target.revision++;
 source.v.title='原文改名';const plan=planExchange(target,envelope(source.state,'source'),'target');const next=applyExchange(target,plan,{[plan.rows[0].key]:true}).state;
 assert.equal(next.archives[0].versions.length,2);assert.equal(next.archives[0].versions[0].rows.length,2);assert.equal(next.archives[0].versions[0].rows[0].values[f.id],'保留我');
});
test('同名档案通过编号区分，不按名称混合',()=>{
 const one=fixture(),two=fixture();one.state.archives.push(two.a);one.state.types.push(two.state.types[0]);
 const plan=planExchange(C.blankState(),envelope(one.state,'source'),'target');assert.equal(plan.counts.new,2);assert.equal(applyExchange(C.blankState(),plan).state.archives.length,2);
});
test('相同编号来自不同空间时隔离重映射',()=>{
 const {source,target}=imported();const packet=envelope(source.state,'another_source');const plan=planExchange(target,packet,'target');assert.equal(plan.counts.new,1);
 const next=applyExchange(target,plan).state;assert.equal(new Set(next.archives.map(a=>a.id)).size,2);assert.equal(new Set(next.archives.flatMap(a=>a.versions.map(v=>v.id))).size,2);
});
test('回传识别原档案，保留原始字段编号',()=>{
 const {source,target}=imported();const v=target.archives[0].versions[0];v.rows[0].values[v.fields[1].id]='回传职业';
 const plan=planExchange(source.state,envelope(target,'target'),'source');assert.equal(plan.rows[0].after.id,source.a.id);
 const next=applyExchange(source.state,plan,{[plan.rows[0].key]:true}).state;assert.equal(next.archives.length,1);assert.equal(next.archives[0].versions[0].fields[1].id,source.v.fields[1].id);assert.equal(next.archives[0].versions[0].rows[0].values[source.v.fields[1].id],'回传职业');
});
test('过期预览与无效文件被拒绝',()=>{
 const s=fixture(),t=C.blankState(),plan=planExchange(t,envelope(s.state,'source'),'target');t.revision++;
 assert.throws(()=>applyExchange(t,plan),/预览后/);assert.throws(()=>validateEnvelope({format:'other'}),/互通文件/);
});

test('重名字段和重名类型保持独立，不把不同内容挤进一个编号',()=>{
 const s=fixture(),v=s.v;v.fields.push({...C.field(v.fields[0].name)});v.rows[0].values[v.fields.at(-1).id]='另一同名值';
 const extra=fixture('重名类型');extra.state.types[0].name=s.state.types[0].name;s.state.types.push(extra.state.types[0]);s.state.archives.push(extra.a);
 const target=C.blankState(),result=applyExchange(target,planExchange(target,envelope(s.state,'source'),'target')).state;
 const received=result.archives.find(a=>a.id===s.a.id).versions[0];assert.equal(received.fields.length,v.fields.length);assert.equal(new Set(received.fields.map(f=>f.id)).size,v.fields.length);assert.equal(received.rows[0].values[received.fields.at(-1).id],'另一同名值');assert.notEqual(result.archives[0].typeId,result.archives[1].typeId);
});
test('只改类型名称和模板字段时也能预览并更新，重传后为相同',()=>{
 const {source,target}=imported();source.state.types[0].name='人物新类型';source.state.types[0].fields.push(C.field('新模板字段'));
 const plan=planExchange(target,envelope(source.state,'source'),'target');assert.equal(plan.counts.update,1);const next=applyExchange(target,plan).state;assert.equal(next.types.find(t=>t.id===next.archives[0].typeId).name,'人物新类型');assert.equal(planExchange(next,envelope(source.state,'source'),'target').counts.same,1);
});

test('发送当前档案不捎带未选档案、全局词条库或接收台账',()=>{
 const s=fixture();const another=C.createArchive(s.state,{title:'未选的资料'});s.state.sharedGlossary=[{name:'不应随档案发送'}];s.state.exchangeLedger={secret:'不应传送'};
 const packet=envelope(s.state,'source',[s.a.id]);assert.equal(packet.state.archives.length,1);assert(!JSON.stringify(packet).includes(another.id));assert(!Object.hasOwn(packet.state,'sharedGlossary'));assert(!Object.hasOwn(packet.state,'exchangeLedger'));
});
