import assert from 'node:assert/strict';
import './glossary-format.js';
const format=globalThis.CARDSTUDIO_GLOSSARY;
const term={id:'design.guard',name:'守护',color:'#336699',category:'状态',tags:'保护,防御',description:'承受指定攻击。',aliases:['保护'],example:'守护：本回合保护友军。',designNotes:'让玩家明确选择保护对象。'};
const pack=format.normalizePack({schema:'cardstudio-glossary-v1',version:1,terms:[term],cards:[{name:'私人卡牌'}],apiKey:'never-export'});
assert.deepEqual(pack.terms,[term]);assert.equal(JSON.stringify(pack).includes('never-export'),false);assert.equal('cards' in pack,false);
assert.deepEqual(format.normalizePack({format:'card-assembly-studio',ruleTerms:[term]}).terms,[term]);
assert.deepEqual(format.normalizePack({version:1,terms:[term]}).terms,[term]);
assert.equal(format.normalizePack([{name:'旧格式'}]).terms[0].id,format.normalizePack([{name:'旧格式'}]).terms[0].id);
for(const raw of [
  {schema:'wrong',terms:[term]},
  {schema:'cardstudio-glossary-v1',terms:[term,{...term}]},
  {schema:'cardstudio-glossary-v1',terms:[{...term,id:'bad" id'}]},
  {schema:'cardstudio-glossary-v1',terms:[{...term,name:'坏[词条]'}]},
  {schema:'cardstudio-glossary-v1',terms:[{...term,aliases:{invalid:true}}]},
  {schema:'cardstudio-glossary-v1',terms:[{...term,description:'x'.repeat(8001)}]},
  {schema:'cardstudio-glossary-v1',terms:Array.from({length:5001},(_,i)=>({...term,id:'t'+i,name:'词条'+i}))}
])assert.throws(()=>format.normalizePack(raw));
const newTerm={...term,id:'design.new',name:'部署'};
const plan=format.planMerge([term],[{...term,description:'不同定义'},newTerm]);
assert.deepEqual(plan.map(r=>r.kind),['conflict','new']);
assert.equal(format.planMerge([term],[{...term,name:'新守护'}],['守护'])[0].kind,'blocked');
assert.equal(format.planMerge([term],[term])[0].kind,'same');
console.log('Shared glossary design preservation, legacy formats, private-field filtering, bounds and conflict planning passed.');
