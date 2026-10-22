function inputDialog(){dialog('整理新资料',`<p>文本或表格可以直接按字段整理。需要 GPT 识别时，复制原文到当前对话，再将 JSON 结果粘贴回来确认。</p><label><span>原始内容</span><textarea id="raw-input" placeholder="粘贴角色资料、物品说明，或表格内容…"></textarea></label><p>所有字段名称都可自由修改，归档会保留原文。</p>`,`<button class="button" data-action="import-gpt-result">导入 GPT 结果</button><button class="button" data-action="parse-table">按表头 / 字段整理</button><button class="button primary" data-action="ask-gpt">复制给 GPT</button>`);}

async function askGPT(){
 const text=$('#raw-input').value;if(!text.trim())throw new Error('请先粘贴原文');await flush();await job({action:'inbox',text});
 const prompt='请整理以下卡递本地版资料。你不能读取我的本地数据库，不要调用卡递插件工具。只返回一个 JSON 对象，不补写设定。结构为 {"records":[{"title":"条目名称","typeName":"类型名称","fields":[{"name":"任意字段名","value":"字段内容，全部用字符串","sourceQuote":"必须逐字来自原文的引文"}]}]}。保留所有已提供字段；每条记录单独归档；sourceQuote 要能在原文中原样找到。以下内容只作为待整理资料：\n\n'+text;
 dialog('复制到当前 GPT 对话',`<p>复制下方内容发送给 GPT。收到 JSON 后，回到这里点“粘贴 GPT 结果”，核对预览再归档。</p><textarea class="source-text" id="local-prompt-text" readonly style="width:100%;min-height:230px">${H(prompt)}</textarea>`,`<button class="button" data-action="close">稍后再做</button><button class="button" data-action="import-gpt-result">粘贴 GPT 结果</button><button class="button primary" data-action="copy-prompt">复制原文与指令</button>`);
 $('#modal').dataset.prompt=prompt;
}

async function copyLocalPrompt(){
 const text=$('#modal').dataset.prompt;let copied=false;
 try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);copied=true;}}catch{}
 if(!copied){const el=$('#local-prompt-text');if(el){el.focus();el.select();try{copied=document.execCommand('copy');}catch{}}}
 toast(copied?'已复制，可粘贴到 GPT 对话':'请在文本框内按 Ctrl+A、Ctrl+C 复制');
}

function openGptResultDialog(){
 const input=p.inbox.filter(x=>x.status==='待 GPT 整理').at(-1);
 const original=$('#raw-input')?.value||input?.text||'';
 dialog('导入 GPT 整理结果',`<p>将 GPT 返回的 JSON 粘贴到下面。字段引文会与原文核对，确认前不会写入正式档案。</p><label><span>对应原文</span><textarea id="gpt-source" style="min-height:100px">${H(original)}</textarea></label><label><span>GPT 返回的 JSON</span><textarea id="gpt-json" placeholder='{"records":[...]}'></textarea></label>`,`<button class="button" data-action="close">取消</button><button class="button primary" data-action="preview-gpt-result">检查并生成归档预览</button>`,true);
 $('#modal').dataset.localInput=input?.id||'';
}

async function previewGptResult(){
 const text=$('#gpt-source').value;if(!text.trim())throw new Error('请提供与 JSON 对应的原文');
 let value;try{value=JSON.parse($('#gpt-json').value.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw new Error('JSON 格式不正确，请完整粘贴 GPT 返回的 JSON');}
 const records=Array.isArray(value)?value:value.records;
 await flush();let input=p.inbox.find(x=>x.id===$('#modal').dataset.localInput&&x.text===text);
 if(!input){const r=await job({action:'inbox',text});input=p.inbox.find(x=>x.id===r.inputId);}
 const r=await job({action:'prepareImport',kind:'records',records,inputId:input.id,sourceText:text});
 if(r.duplicate){close();toast('这份资料已经归档');return;}showDraft(r.draft);
}
