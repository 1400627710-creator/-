from pathlib import Path
import re,json

root=Path(__file__).resolve().parents[1]
s=(root/'ui/main.mjs').read_text()
s=s.replace("import {uiSurface,isRpcResponse} from '../lib/ui-surface.mjs';", "import {localService,localMeta} from './local-service.mjs';")
s=s.replace("from './engines.mjs'", "from '../ui/engines.mjs'")
s=s.replace("const surface=uiSurface(document.querySelector('meta[name=\"cardstudio-surface\"]')?.content,window.parent!==window);", "const surface='local';")
s=s.replace("embedded=surface==='mcp'", 'embedded=false')

def replace_between(start,end,value):
 global s
 i=s.index(start);j=s.index(end,i);s=s[:i]+value+'\n'+s[j:]

replace_between('const requests=new Map;', 'function toast(', '')
replace_between('async function raw(a)', 'function job(', 'async function raw(a){return localService(a);}')
replace_between('function inputDialog()', 'function recordsFromText(', (root/'local/ui-extra.mjs').read_text())
replace_between('function demoRead()', 'async function act(', '')
replace_between("case 'copy-prompt':", "case 'open-draft':", "case 'copy-prompt':await copyLocalPrompt();break;case 'import-gpt-result':openGptResultDialog();break;case 'preview-gpt-result':await previewGptResult();break;")
replace_between("if(embedded&&hostReady)rpc('ui/update-model-context'", 'localStorage.setItem(', '')
s=s.replace('localStorage.', 'localMeta.')
s=s.replace("demo?'演示空间 · 仅本机数据':'私人项目 · 自动保存'", "'本机项目 · 自动保存'")
s=s.replace("status(demo?'演示 · 本机保存':'已保存')", "status('已保存到本机')")
s=s.replace('服务器', '本机')
s=s.replace('保存版本用于恢复编辑状态；故事时间版本仍在档案中单独管理。','本机保留最近 30 次保存；故事时间版本仍在档案中单独管理。')
s=s.replace('演示空间仅保留当前数据，私人项目提供保存历史。','这里显示最近 30 次本机保存。')
replace_between("$('#help-btn').onclick=", "$('#demo-btn').onclick=", "$('#help-btn').onclick=()=>dialog('卡递 · 本地文件版','<p>双击 HTML 即可打开，无需安装、无需登录。</p><p>资料自动保存到当前浏览器的本机数据库。请尽量保持文件位置和浏览器不变，并定期用“备份与迁移”导出完整统一备份。清理浏览器数据会清除本机项目。</p><p>导入旧档案、卡递工程、表格或统一备份后，核对预览再确认。档案与卡片的字段映射、故事时间版本、素材和排版都会保留。</p><p>双击画布添加文字；字段标签支持任意改名；打印设置中可调整出血。项目检查可一键处理能够自动修复的问题。</p><p>GPT 整理：复制原文与指令到当前对话，再将 JSON 从“导入 GPT 结果”粘贴回来。当前文件本身不运行模型，也不会自动读取线上私人项目。</p>');")
replace_between("$('#demo-btn').onclick=", "$('#modal').addEventListener", "$('#demo-btn').onclick=()=>location.reload();")
replace_between('async function init(){', '\ninit();', """async function init(){try{await list();appReady=true;status('已保存到本机');}catch(e){$('#connection-screen').hidden=false;$('#connection-error').textContent=e.message;status('本机保存不可用');}setInterval(()=>{if(appReady&&document.visibilityState==='visible')refresh().catch(()=>status('本机读取暂不可用'))},5000);} """)
assert "fetch('/api/service'" not in s and "rpc(" not in s
(root/'local/main.mjs').write_text(s)

html=(root/'ui/index.html').read_text().replace('content="mcp"','content="local"').replace('统一私人版','本地版').replace('卡递 · 统一卡片工作台','卡递 · 本地工作台')
start=html.index('<div id="connection-screen"');end=html.index('\n</main>',start)
html=html[:start]+'''<div id="connection-screen" class="connection-screen" hidden><div class="welcome-icon">▤</div><h2 id="connection-title">暂时无法保存到本机</h2><p id="connection-description">请使用 Chrome 或 Edge 的常规窗口打开此文件，并允许浏览器保存本地数据。<br>关闭其他卡递本地窗口后，也可以重新尝试。</p><button class="button primary" id="demo-btn">重新尝试</button><small id="connection-error"></small></div>'''+html[end:]
csp="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; worker-src blob:; object-src 'none'; base-uri 'none'"
html=html.replace('<meta charset="utf-8">','<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+csp+'">')
(root/'local/index.html').write_text(html)
print('Local UI source prepared; cloud calls and sign-in removed from this build.')
