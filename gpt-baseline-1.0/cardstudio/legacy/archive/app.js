(() => {
  'use strict';
  const C = ArchiveCore;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const H = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const icons = {
    book: '<path d="M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2z"/><path d="M12 6v15M6 8l3 1M15 9l3-1M6 12l3 1M15 13l3-1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>', search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    edit: '<path d="m15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14z"/>', sliders: '<path d="M4 7h16M4 17h16M9 4v6M15 14v6"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>', trash: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>', undo: '<path d="M8 5 3 10l5 5M3 10h10a7 7 0 0 1 7 7"/>', redo: '<path d="m16 5 5 5-5 5M21 10H11a7 7 0 0 0-7 7"/>',
    split: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>', timeline: '<path d="M3 12h18"/><circle cx="6" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18" cy="12" r="2"/>',
    resize: '<path d="m8 20 12-12M14 20l6-6M19 20l1-1"/>', horizontal: '<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>'
  };
  const I = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.info}</svg>`;
  const button = (action, label, icon = '', classes = '', attrs = '') => `<button type="button" data-action="${action}" class="${classes}" ${attrs}>${icon ? I(icon) : ''}${label ? H(label) : ''}</button>`;
  const iconButton = (action, label, icon, attrs = '') => button(action, '', icon, 'icon ghost', `title="${H(label)}" aria-label="${H(label)}" ${attrs}`);
  let state = C.blankState();
  const storage = new ArchiveStorage.Store();
  const undoStack = [], redoStack = [];
  let coalesceKey = '', lastChangeAt = 0, query = '', typeFilter = '', view = 'workspace', timelineZoom = 1;
  let loaded = false, dirty = false, saveTimer, savePromise = null, toastTimer, modal = null, importPreview = null, currentImageUrl = null;
  let lastSaveError = null;
  let broadcast;
  const host = { embedded: window.parent !== window, webmcp: typeof document.modelContext?.registerTool === 'function', clipboard: typeof navigator.clipboard?.writeText === 'function', download: 'download' in document.createElement('a') };
  const root = document.getElementById('novel-archive-app');
  root.innerHTML = `<header class="topbar"><div class="brand"><button class="icon ghost mobile-menu" data-action="sidebar" aria-label="档案库">${I('menu')}</button><div class="brand-mark">${I('book')}</div><div><div class="brand-name">小说档案</div><div class="brand-sub">人物、设定与故事时间</div></div></div><div class="top-actions"><button data-action="save-details" class="ghost save-status" id="save-status">正在读取…</button>${button('undo','','undo','icon ghost secondary-action','aria-label="撤销" title="撤销" id="undo-button" disabled')}${button('redo','','redo','icon ghost secondary-action','aria-label="重做" title="重做" id="redo-button" disabled')}${button('import','导入文本','','secondary-action')}${button('backup','备份','','')}${button('new','新建档案','plus','primary')}</div></header><div class="app-shell" id="app-shell"><aside class="sidebar"><div class="side-heading"><span>档案库</span>${iconButton('types','管理档案类型','sliders')}</div><div class="search-box">${I('search')}<input id="library-search" type="search" placeholder="搜索名称、关键词或内容" aria-label="搜索档案"></div><div class="filters"><select id="type-filter" aria-label="按类型筛选"><option value="">全部类型</option></select></div><div id="library-list" class="library-list"></div><div class="side-footer"><span id="library-count" class="small muted"></span>${button('help','使用说明','info','ghost small')}</div></aside><main class="main"><div class="work-header"><div class="view-tabs">${button('workspace','对照工作台','split','active','id="workspace-tab"')}${button('timeline','故事时间轴','timeline','','id="timeline-tab"')}</div><span class="work-hint">拖动右下角调整窗口 · 表格行列可独立拉伸</span></div><div id="workspace" class="workspace"></div><div id="timeline-view" class="timeline-view hidden"></div></main></div><div id="modal-layer"></div><div id="toast" class="toast hidden" role="status" aria-live="polite"></div>`;
  function toast(message, danger = false) {
    const el = $('#toast'); el.textContent = message; el.className = `toast${danger ? ' error' : ''}`;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), danger ? 6000 : 3500);
  }
  function saveStatus(message, danger = false) {
    const el = $('#save-status'); el.textContent = message; el.title = message; el.classList.toggle('unsaved', danger);
  }
  function scheduleSave() {
    dirty = true; saveStatus(storage.mode === 'memory' ? '未持久保存 · 请备份' : '待保存', storage.mode === 'memory');
    clearTimeout(saveTimer); saveTimer = setTimeout(flushSave, 350);
  }
  async function flushSave() {
    clearTimeout(saveTimer);
    if (savePromise) return savePromise;
    if (!dirty) return;
    const snapshot = C.copy(state);
    savePromise = (async () => {
      try {
        await storage.save(snapshot); lastSaveError = null;
        dirty = state.revision !== snapshot.revision;
        saveStatus(dirty ? '待保存' : '已保存到此浏览器');
        broadcast?.postMessage({ revision: snapshot.revision });
        if (dirty) saveTimer = setTimeout(flushSave, 50);
      } catch (e) { dirty = true; lastSaveError = e; saveStatus(e.code === 'REVISION_CONFLICT' ? '其他窗口已更新 · 请处理' : '未保存 · 请备份', true); }
      finally { savePromise = null; }
    })();
    return savePromise;
  }
  function commit(change, { render = true, group = '' } = {}) {
    if (!loaded) throw C.error('NOT_READY', '档案尚未读取完成。');
    const next = C.copy(state);
    const result = change(next);
    const now = Date.now();
    if (!group || group !== coalesceKey || now - lastChangeAt > 1200) undoStack.push(C.copy(state));
    if (undoStack.length > 30) undoStack.shift();
    redoStack.length = 0; coalesceKey = group; lastChangeAt = now;
    next.revision = state.revision + 1; state = next;
    scheduleSave();
    $('#undo-button').disabled = !undoStack.length; $('#redo-button').disabled = true;
    if (render) renderAll();
    return result;
  }
  function undo(redo = false) {
    const from = redo ? redoStack : undoStack, to = redo ? undoStack : redoStack;
    if (!from.length) return;
    const next = from.pop(); to.push(C.copy(state)); next.revision = state.revision + 1; state = next;
    coalesceKey = ''; scheduleSave(); renderAll(); toast(redo ? '已重做' : '已撤销');
  }
  const activePanel = () => state.panels.find(p => p.id === state.activePanelId) || state.panels[0];
  const panelVersion = p => C.version(state, p.archiveId, p.versionId);
  function focusPanel(id) {
    if (state.activePanelId === id) return;
    commit(s => { s.activePanelId = id; }, { render: false });
    $$('.archive-panel').forEach(el => el.classList.toggle('focused', el.dataset.panel === id));
    renderLibrary();
  }
  function renderAll() {
    $('#undo-button').disabled = !undoStack.length; $('#redo-button').disabled = !redoStack.length;
    const filter = $('#type-filter');
    filter.innerHTML = `<option value="">全部类型</option><option value="__none">未分类</option>${state.types.map(t => `<option value="${t.id}">${H(t.name || '未命名类型')}</option>`).join('')}`;
    if (typeFilter && ![...filter.options].some(o => o.value === typeFilter)) typeFilter = '';
    filter.value = typeFilter;
    renderLibrary(); renderWorkspace(); renderTimeline();
    $('#workspace').classList.toggle('hidden', view !== 'workspace'); $('#timeline-view').classList.toggle('hidden', view !== 'timeline');
    $('#workspace-tab').classList.toggle('active', view === 'workspace'); $('#timeline-tab').classList.toggle('active', view === 'timeline');
  }
  function renderLibrary() {
    const matches = C.search(state, query, typeFilter);
    const focused = activePanel()?.archiveId;
    $('#library-count').textContent = query || typeFilter ? `${matches.length} / ${state.archives.length} 份档案` : `${state.archives.length} 份档案`;
    $('#library-list').innerHTML = matches.length ? matches.map(a => {
      const v = a.versions.find(v => v.id === a.activeVersionId) || a.versions[0];
      const t = state.types.find(t => t.id === a.typeId);
      return `<div class="library-item${a.id === focused ? ' active' : ''}"><button type="button" class="library-open" data-action="open" data-archive="${a.id}"><div class="library-name">${H(C.titleOf(v))}</div><div class="library-meta"><span>${H(t?.name || '未分类')}</span><span>${H(C.timeOf(v))}</span><span>${a.versions.length} 个版本</span></div>${v.keywords.length ? `<div class="library-words">${H(v.keywords.join(' · '))}</div>` : ''}</button>${button('compare','','plus','icon ghost library-extra',`data-archive="${a.id}" title="并排打开" aria-label="并排打开"`)}</div>`;
    }).join('') : `<div class="side-empty">${state.archives.length ? '没有找到匹配档案。<br>可修改关键词或清除筛选。' : '这里会收纳你的档案。<br>先新建一份，从空白开始。'}</div>`;
  }
  function panelHtml(p) {
    const a = C.archive(state, p.archiveId), v = panelVersion(p), t = state.types.find(t => t.id === a.typeId);
    const meta = [];
    if (v.visibleMeta.number) meta.push(`<div><label for="number-${p.id}">${H(v.metaLabels.number)}</label><input id="number-${p.id}" data-bind="number" value="${H(v.number)}" placeholder="可留空，也可自行编号"></div>`);
    if (v.visibleMeta.time) meta.push(`<div><label for="time-${p.id}">${H(v.metaLabels.time)}</label><div class="time-inputs"><input id="time-${p.id}" data-bind="timeLabel" value="${H(v.timeLabel)}" placeholder="小说内的时间"><input data-bind="timeOrder" inputmode="decimal" value="${v.timeOrder ?? ''}" aria-label="故事排序坐标" title="时间轴排序坐标，允许负数和小数" placeholder="排序坐标"></div></div>`);
    if (v.visibleMeta.keywords) meta.push(`<div class="meta-wide"><label for="keywords-${p.id}">${H(v.metaLabels.keywords)}</label><input id="keywords-${p.id}" data-bind="keywords" value="${H(v.keywords.join('、'))}" placeholder="用顿号、逗号或换行分隔"><div class="keyword-wrap">${v.keywords.map(word => button('copy-word',word,'','keyword-chip',`data-word="${H(word)}"`)).join('')}</div></div>`);
    return `<section class="archive-panel${p.id === state.activePanelId ? ' focused' : ''}" data-panel="${p.id}" style="width:${p.width}px;height:${p.height}px" aria-label="${H(C.titleOf(v))}"><div class="panel-top"><div style="min-width:0;flex:1"><span class="type-badge">${H(t?.name || '未分类')}</span>${v.visibleMeta.title ? `<input class="panel-title-input" data-bind="title" value="${H(v.title)}" placeholder="未命名档案" aria-label="${H(v.metaLabels.title)}">` : '<div class="panel-title">档案</div>'}</div><div class="panel-actions">${iconButton('meta','修改、移除档案信息','sliders')}${iconButton('export','导出图片','download')}${iconButton('archive-menu','档案操作','menu')}${iconButton('close-panel','关闭此窗口','close')}</div></div><div class="version-bar"><select data-bind="version" aria-label="选择时间版本">${a.versions.map(x => `<option value="${x.id}"${x.id === v.id ? ' selected' : ''}>${H(C.timeOf(x))}${x.id === a.activeVersionId ? ' · 当前' : ''}</option>`).join('')}</select>${button('future','未来版本','arrow')}${button('new-version','添加版本','plus')}${button('compare-version','并排看此版本','split')}</div><div class="panel-scroll"><div class="metadata">${meta.join('')}</div><div class="table-tools">${button('add-field','添加字段','plus')}${button('add-row','添加条目','plus')}${button('panel-import','导入文本','','')}${button('layout',v.layout.mode === 'form' ? '切换表格' : '切换档案','','')}${button('template','模板','','')}${iconButton('copy-mode',a.copyOnClick ? '已启用条目关键词复制' : '启用条目关键词复制','copy',`aria-pressed="${a.copyOnClick}"`)}</div>${sheetHtml(p, v, a)}</div><div class="panel-bottom"><span>${v.fields.length} 个字段 · ${v.rows.length} 个条目</span><span style="margin-left:auto;margin-right:18px">${Math.round(p.width)} × ${Math.round(p.height)}</span></div><div class="panel-resize" data-resize="panel" role="separator" aria-label="调整窗口宽高" tabindex="0">${I('resize')}</div></section>`;
  }
  function sheetHtml(p, v, a) {
    if (!v.fields.length) return `<div class="table-container"><div class="table-empty">档案内容完全由你填写。<br>点击“添加字段”设置名称，或粘贴文字并确认导入。</div>${v.rows.map((r,i)=>`<div class="row-tools">${button('copy-row',`条目 ${i+1}`,'copy','ghost small',`data-row="${r.id}"`)}${iconButton('delete-row','删除此条目','trash',`data-row="${r.id}"`)}</div>${v.visibleMeta.rowKeywords?`<div class="row-keywords"><span class="small muted">${H(v.metaLabels.rowKeywords)}</span><input data-bind="rowKeywords" data-row="${r.id}" value="${H(r.keywords.join('、'))}" aria-label="条目关键词" placeholder="可填写，也可在档案信息中删除此栏"></div>`:''}`).join('')}</div>`;
    if (!v.rows.length) return `<div class="table-empty">所有条目已删除。<br>点击“添加条目”重新录入；字段仍保留。</div>`;
    const heading = f => `<div class="field-heading"><span>${H(f.name || '未命名字段')}</span>${iconButton('edit-field','修改或删除此字段','edit',`data-field="${f.id}"`)}</div>`;
    const cell = (r, f, height = 86) => `<textarea class="cell-text" data-bind="cell" data-row="${r.id}" data-field="${f.id}" style="height:${height}px;min-height:0" aria-label="${H(f.name || '字段')}，第${v.rows.indexOf(r)+1}条" placeholder="自行填写">${H(r.values[f.id] || '')}</textarea>`;
    if (v.layout.mode === 'grid') {
      const keywordWidth = v.visibleMeta.rowKeywords ? 230 : 110;
      const width = v.fields.reduce((sum, f) => sum + f.width, 0) + keywordWidth;
      const rows = v.rows.map((r, i) => {
        const controls = `<div class="row-tools" style="padding:7px 5px">${button('copy-row',`${i+1}`,'copy','ghost small',`data-row="${r.id}" title="单击复制本条关键词"`)}${iconButton('delete-row','删除此条目','trash',`data-row="${r.id}"`)}</div>`;
        const keywordCell = v.visibleMeta.rowKeywords ? `<input data-bind="rowKeywords" data-row="${r.id}" value="${H(r.keywords.join('、'))}" placeholder="为此条目填写关键词" aria-label="第${i+1}条${H(v.metaLabels.rowKeywords)}" style="width:calc(100% - 16px);margin:0 8px;font-size:12px"><div class="keyword-wrap" style="padding:0 8px 8px">${r.keywords.map(word => button('copy-word',word,'','keyword-chip',`data-word="${H(word)}"`)).join('')}</div>` : '';
        return `<tr data-copy-row="${r.id}">${v.fields.map((f, j) => `<td>${cell(r,f,v.layout.rowHeights[r.id] || 100)}${j === 0 ? `<div class="row-resize" data-resize="row" data-row="${r.id}" role="separator" aria-label="调整第${i+1}条行高" tabindex="0"></div>` : ''}</td>`).join('')}<td>${controls}${keywordCell}</td></tr>`;
      }).join('');
      return `<div class="table-container"><table class="sheet grid-sheet" style="width:${width}px"><colgroup>${v.fields.map(f => `<col style="width:${f.width}px">`).join('')}<col style="width:${keywordWidth}px"></colgroup><thead><tr>${v.fields.map(f => `<th>${heading(f)}<div class="col-resize" data-resize="column" data-field="${f.id}" role="separator" aria-label="调整${H(f.name)}列宽" tabindex="0"></div></th>`).join('')}<th><div class="field-heading"><span>${v.visibleMeta.rowKeywords ? H(v.metaLabels.rowKeywords) : '条目操作'}</span></div></th></tr></thead><tbody>${rows}</tbody></table><div class="table-resize" data-resize="table" role="separator" aria-label="调整整个表格宽度" tabindex="0">${I('horizontal')}</div></div>`;
    }
    return `<div class="table-container" style="width:${v.layout.tableWidth}px">${v.rows.map((r,i) => `<div class="row-tools">${button('copy-row',`条目 ${i+1}`,'copy','ghost small',`data-row="${r.id}"`)}${iconButton('delete-row','删除此条目','trash',`data-row="${r.id}"`)}</div><table class="sheet form-sheet" style="width:${v.layout.tableWidth}px"><colgroup><col style="width:${Math.min(155,v.layout.tableWidth*.34)}px"><col></colgroup><tbody>${v.fields.map(f => `<tr><th>${heading(f)}</th><td>${cell(r,f,v.layout.rowHeights[`${r.id}_${f.id}`] || 86)}<div class="row-resize" data-resize="row" data-row="${r.id}" data-field="${f.id}" role="separator" aria-label="调整${H(f.name)}行高" tabindex="0"></div></td></tr>`).join('')}</tbody></table>${v.visibleMeta.rowKeywords ? `<div class="row-keywords"><span class="small muted">${H(v.metaLabels.rowKeywords)}</span><input data-bind="rowKeywords" data-row="${r.id}" value="${H(r.keywords.join('、'))}" aria-label="第${i+1}条关键词" placeholder="单击条目标题可复制"></div>` : ''}`).join('')}<div class="table-resize" data-resize="table" role="separator" aria-label="调整表格宽度" tabindex="0">${I('horizontal')}</div></div>`;
  }
  function renderWorkspace() {
    const work = $('#workspace'), scroll = [work.scrollLeft, work.scrollTop];
    const positions = new Map($$('.archive-panel').map(el => [el.dataset.panel, [$('.panel-scroll',el).scrollLeft, $('.panel-scroll',el).scrollTop]]));
    work.innerHTML = state.panels.length ? state.panels.map(panelHtml).join('') : `<div class="empty-workspace"><svg class="book-art" viewBox="0 0 24 24" aria-hidden="true">${icons.book}</svg><h1>${state.archives.length ? '打开档案，开始对照' : '给故事留一份档案'}</h1><p>${state.archives.length ? '在左侧档案库打开已有档案。<br>点击旁边的“＋”可以并排查看。' : '从空白开始，或选择可修改的类型模板。<br>名字、字段、内容和时间，都由你决定。'}</p><div class="empty-actions">${button('new','新建档案','plus','primary')}${state.archives.length ? '' : button('backup','恢复已有备份','','')}</div></div>`;
    work.scrollLeft = scroll[0]; work.scrollTop = scroll[1];
    $$('.archive-panel').forEach(el => { const pos = positions.get(el.dataset.panel); if (pos) { const area = $('.panel-scroll',el); area.scrollLeft = pos[0]; area.scrollTop = pos[1]; } });
  }
  function revealPanel(id) {
    const el = $(`[data-panel="${id}"]`);
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
  function renderTimeline() {
    const container = $('#timeline-view');
    const archives = C.search(state, query, typeFilter);
    const dated = archives.flatMap(a => a.versions.filter(v => v.timeOrder !== null));
    const values = dated.map(v => v.timeOrder);
    const low = values.length ? Math.min(...values) : 0, high = values.length ? Math.max(...values) : 1;
    const range = high - low || 1;
    const width = Math.max(800, Math.min(12000, dated.length * 90 + 220)) * timelineZoom;
    const percent = value => 8 + ((value - low) / range) * 84;
    const ticks = low === high ? [low] : Array.from({length:5},(_,i)=>low+(high-low)*i/4);
    container.innerHTML = `<div class="timeline-help"><div><span>${H(state.clockName || '故事时间')}</span>${state.clockUnit ? `<span class="small muted"> · ${H(state.clockUnit)}</span>` : ''}<div class="help-text">按故事坐标排序；点击节点打开该版本。</div></div><div style="display:flex;gap:7px">${button('timeline-clock','设置时间轴','','small')}<select id="timeline-zoom" aria-label="时间轴缩放"><option value="1"${timelineZoom===1?' selected':''}>标准</option><option value="1.5"${timelineZoom===1.5?' selected':''}>展开</option><option value="2"${timelineZoom===2?' selected':''}>展开两倍</option></select></div></div>${archives.length ? `<div class="timeline-board" style="width:${width}px"><div class="timeline-axis">${ticks.map(n => `<span class="axis-tick" style="left:${low===high?50:percent(n)}%">${H(Number(n.toPrecision(8)))}</span>`).join('')}</div>${archives.map(a => {
      const current = a.versions.find(v => v.id === a.activeVersionId) || a.versions[0];
      const nodes = C.orderedVersions(a);
      const stacks = new Map();
      const positionData = nodes.map(v => { const count = stacks.get(v.timeOrder)||0; stacks.set(v.timeOrder,count+1); return {v,count}; });
      const height = Math.max(75, ...[...stacks.values()].map(count => count*56+15));
      return `<div class="timeline-track" style="min-height:${height}px"><div class="timeline-label">${H(C.titleOf(current))}<div class="small muted">${H(state.types.find(t=>t.id===a.typeId)?.name||'未分类')}</div></div><div class="timeline-lane">${positionData.map(({v,count})=>button('open-time',C.timeOf(v),'',`timeline-node${v.id===a.activeVersionId?' current':''}`,`data-archive="${a.id}" data-version="${v.id}" style="left:${low===high?50:percent(v.timeOrder)}%;top:${10+count*56}px" title="${H(`${C.titleOf(v)} · ${C.timeOf(v)} · 坐标 ${v.timeOrder}`)}"`)).join('')}</div></div>`;
    }).join('')}</div><div class="undated"><span class="small muted">未标排序坐标</span>${archives.flatMap(a=>a.versions.filter(v=>v.timeOrder===null).map(v=>button('open-time',`${C.titleOf(v)} · ${C.timeOf(v)}`,'','',`data-archive="${a.id}" data-version="${v.id}"`))).join('')}</div>` : '<div class="empty-workspace"><h1>时间轴还没有档案</h1><p>创建档案后，填写故事时间与排序坐标。<br>可使用自己的历法和任意时间标签。</p></div>'}`;
  }
  function openDialog(title, body, footer = '', wide = false) {
    closeDialog();
    modal = { previous: document.activeElement, nonce: C.uid('modal') };
    $('#modal-layer').innerHTML = `<div class="overlay"><section class="dialog${wide?' wide':''}" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="dialog-head"><h2 id="dialog-title">${H(title)}</h2>${iconButton('dialog-close','关闭','close')}</div><div class="dialog-body">${body}<div id="dialog-error" class="dialog-error" role="alert"></div></div>${footer ? `<div class="dialog-foot">${footer}</div>` : ''}</section></div>`;
    setTimeout(()=>$('.dialog input:not([type=checkbox]),.dialog textarea,.dialog select,.dialog button')?.focus(),0);
    return modal.nonce;
  }
  function closeDialog() {
    if (currentImageUrl) { URL.revokeObjectURL(currentImageUrl); currentImageUrl = null; }
    const previous = modal?.previous; modal = null; importPreview = null; $('#modal-layer').innerHTML = ''; previous?.focus?.();
  }
  function dialogError(message) { const el = $('#dialog-error'); if (el) el.textContent = message; else toast(message,true); }
  const cancel = () => button('dialog-close','取消');
  function newDialog() {
    openDialog('新建档案',`<label class="form-group"><span>档案名称（可留空）</span><input id="new-title" placeholder="由你命名"></label><label class="form-group"><span>档案类型</span><select id="new-type"><option value="">空白 · 未分类</option>${state.types.map(t=>`<option value="${t.id}">${H(t.name||'未命名类型')}</option>`).join('')}</select></label><label class="check-line"><input id="new-template" type="checkbox" checked>载入所选类型的字段模板</label><p class="help-text">空白档案没有预填内容。类型模板只提供可删改的字段名称，不填入人物或背景。</p>`,`${cancel()}${button('confirm-new','创建档案','','primary')}`);
  }
  function fieldDialog(p, fieldId = '') {
    const v = panelVersion(p), f = v.fields.find(f=>f.id===fieldId);
    openDialog(f ? '修改字段' : '添加字段',`<label class="form-group"><span>字段名称</span><input id="field-name" value="${H(f?.name||'')}" placeholder="例如：身份、动机，或你自己的名称"></label><label class="form-group"><span>导入识别别名（可留空）</span><input id="field-aliases" value="${H(f?.aliases.join('、')||'')}" placeholder="用顿号分隔，帮助识别粘贴文字"></label><p class="help-text">名称允许留空、重复，也可删除这个字段。别名仅辅助导入，不改写正文。</p>`,`${f?button('confirm-delete-field','删除字段','trash','danger',`data-panel-id="${p.id}" data-field="${f.id}"`):''}${cancel()}${button('confirm-field','保存','','primary',`data-panel-id="${p.id}" data-field="${fieldId}"`)}`);
  }
  function metaDialog(p) {
    const v = panelVersion(p);
    const names = {title:'名称',number:'编号',time:'时间',keywords:'关键词',rowKeywords:'条目词'};
    openDialog('档案信息也可修改',`<p class="help-text">修改显示名称；取消勾选会移除该信息和对应内容，可通过撤销恢复。</p>${Object.keys(names).map(key=>`<div class="meta-setting"><input type="checkbox" id="meta-visible-${key}"${v.visibleMeta[key]?' checked':''} aria-label="保留${names[key]}"><span class="small muted">${names[key]}</span><input type="text" id="meta-label-${key}" value="${H(v.metaLabels[key])}" aria-label="${names[key]}的显示名称"></div>`).join('')}`,`${cancel()}${button('confirm-meta','应用','','primary',`data-panel-id="${p.id}"`)}`);
  }
  function versionDialog(p) {
    const v = panelVersion(p);
    openDialog('添加故事时间版本',`<p class="callout">新版本由你录入。修改新版本，不会改动原来的档案。</p><label class="form-group"><span>故事时间标签</span><input id="version-time" placeholder="例如：第三章，或你的小说历法"></label><label class="form-group"><span>排序坐标（可留空）</span><input id="version-order" inputmode="decimal" placeholder="越大的坐标越靠未来"></label><label class="check-line"><input id="version-copy" type="checkbox" checked>复制当前版本的内容作为起点</label><p class="help-text">不勾选时创建空白内容版本，保留可修改的字段结构。当前时间：${H(C.timeOf(v))}。</p>`,`${cancel()}${button('confirm-version','创建版本','','primary',`data-panel-id="${p.id}"`)}`);
  }
  function archiveMenu(p) {
    const a=C.archive(state,p.archiveId),v=panelVersion(p);
    openDialog('档案操作',`<label class="form-group"><span>所属类型</span><select id="archive-type"><option value="">未分类</option>${state.types.map(t=>`<option value="${t.id}"${t.id===a.typeId?' selected':''}>${H(t.name||'未命名类型')}</option>`).join('')}</select></label><p class="help-text">改变类型不覆盖当前字段或内容。每个时间版本仍可以独立编辑。</p><div class="backup-buttons">${button('delete-version','删除这个时间版本','trash','danger',`data-panel-id="${p.id}"`)}${button('delete-archive','删除整份档案','trash','danger',`data-panel-id="${p.id}"`)}</div><p class="help-text">这份档案有 ${a.versions.length} 个版本，当前查看 ${H(C.timeOf(v))}。删除后可撤销。</p>`,`${cancel()}${button('confirm-archive-type','保存类型','','primary',`data-panel-id="${p.id}"`)}`);
  }
  function typesDialog() {
    openDialog('档案类型与字段模板',`<p class="help-text">所有类型和模板字段均可改名、增删。这里修改的是新档案模板，不会追改已有档案。</p><div id="types-editor">${state.types.map(t=>`<div class="type-card" data-type="${t.id}"><div class="type-top"><input data-type-bind="name" value="${H(t.name)}" aria-label="类型名称">${iconButton('delete-type','删除这个类型','trash',`data-type="${t.id}"`)}</div><div class="type-fields">${t.fields.map(f=>`<div class="type-field-chip"><input data-type-bind="field" data-field="${f.id}" value="${H(f.name)}" aria-label="模板字段名称">${iconButton('delete-type-field','删除模板字段','close',`data-type="${t.id}" data-field="${f.id}"`)}</div>`).join('')}${button('add-type-field','字段','plus','small',`data-type="${t.id}"`)}</div><div style="display:flex;align-items:center;gap:12px;margin-top:10px"><select data-type-bind="mode" aria-label="默认布局"><option value="form"${t.mode==='form'?' selected':''}>档案布局</option><option value="grid"${t.mode==='grid'?' selected':''}>条目表格</option></select><label class="check-line"><input data-type-bind="copyOnClick" type="checkbox"${t.copyOnClick?' checked':''}>单击条目复制关键词</label></div></div>`).join('')}</div><div class="inline-form"><label class="form-group"><span>新类型名称</span><input id="new-type-name" placeholder="自定义档案类型"></label>${button('add-type','添加类型','plus')}</div>`,button('dialog-close','完成','','primary'),true);
  }
  function templateDialog(p) {
    openDialog('使用或保存字段模板',`<label class="form-group"><span>使用已有类型模板</span><select id="template-type">${state.types.map(t=>`<option value="${t.id}">${H(t.name||'未命名类型')}</option>`).join('')}</select></label><label class="check-line"><input id="template-replace" type="checkbox">替换当前字段及内容（不勾选则只补充缺少的字段）</label><div class="backup-buttons">${button('apply-template','载入模板','','',`data-panel-id="${p.id}"`)}</div><hr style="border:0;border-top:1px solid var(--line);margin:20px 0"><label class="form-group"><span>把当前字段结构保存为新类型</span><input id="template-save-name" placeholder="由你命名"></label><p class="help-text">仅保存字段结构、别名和布局，不把这份档案的正文设为默认内容。</p>`,`${cancel()}${button('save-template','保存为类型','','primary',`data-panel-id="${p.id}"`)}`);
  }
  function importDialog(p = activePanel()) {
    if (!p) { toast('请先新建或打开一份档案。'); newDialog(); return; }
    openDialog('粘贴文字，先确认归属',`<div class="callout">可粘贴“字段名：内容”、Markdown表格、带标题的段落或GPT整理的导入JSON。无法判断的段落会留给你指定。</div><textarea id="import-text" class="import-input" aria-label="需要导入的文本" placeholder="粘贴你的文字；预览之前不会写入档案"></textarea><details class="help-text" style="margin-top:12px"><summary>怎样让GPT协助整理？</summary>在同一对话告诉GPT需要导入的原文和字段。它可以整理成“字段名：内容”供你粘贴；不需要额外AI接口。仍由你在这里确认。</details>`,`${cancel()}${button('preview-import','预览归属','','primary',`data-panel-id="${p.id}"`)}`,true);
  }
  function showImportPreview(p, parsed) {
    const v=panelVersion(p),baseRevision=state.revision;
    const options=selected=>`<option value="unassigned"${selected==='unassigned'?' selected':''}>待指定归属</option><option value="ignore"${selected==='ignore'?' selected':''}>不导入这段</option><option value="new"${selected==='new'?' selected':''}>新建字段</option>${v.fields.map(f=>`<option value="field:${f.id}"${selected===`field:${f.id}`?' selected':''}>${H(f.name||'未命名字段')}</option>`).join('')}<option value="rowKeywords"${selected==='rowKeywords'?' selected':''}>条目关键词</option>${[['title','档案名称'],['number','编号'],['timeLabel','故事时间标签'],['timeOrder','故事排序坐标'],['keywords','档案关键词']].map(([k,n])=>`<option value="meta:${k}"${selected===`meta:${k}`?' selected':''}>${H(n)}</option>`).join('')}`;
    openDialog('确认字段归属后导入',`<div class="callout">共 ${parsed.segments.length} 段。每段可改内容、调整归属或不导入；已有内容默认追加，选择“替换”才覆盖。</div>${parsed.isTable?'<label class="check-line"><input id="import-new-rows" type="checkbox" checked>作为新条目追加（空白档案会使用已有空条目）</label>':''}<details class="help-text"><summary>查看完整原文</summary><pre class="import-source">${H(parsed.raw)}</pre></details><div id="import-preview-list">${parsed.segments.map(s=>`<div class="import-segment" data-segment="${s.id}"><div class="import-segment-head"><span>${H(s.label||'未标注段落')} · 条目 ${s.rowIndex+1}</span><span>${H(s.issue)}</span></div><div class="import-mapping"><select data-import-bind="target" aria-label="这段内容归属">${options(s.target)}</select><input data-import-bind="newName" value="${H(s.newName)}" placeholder="新字段名称" aria-label="新字段名称"${s.target==='new'?'':' class="hidden"'}><select data-import-bind="mode" aria-label="写入方式"><option value="append">追加</option><option value="replace">替换</option></select></div><textarea data-import-bind="value" aria-label="待导入内容">${H(s.value)}</textarea></div>`).join('')}</div>`,`${button('back-import','返回修改原文','','',`data-panel-id="${p.id}"`)}${cancel()}${button('confirm-import','确认并导入','','primary',`data-panel-id="${p.id}"`)}`,true);
    importPreview={parsed,panelId:p.id,baseRevision};
  }
  function download(blob, name) {
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.style.display='none';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  const safeName=s=>String(s||'档案').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').slice(0,100);
  async function exportImage(p) {
    if(!p) return toast('请先打开一份档案。');
    const snapshot=C.copy(panelVersion(p));
    const nonce=openDialog('正在生成完整档案图片','<p class="help-text">正在绘制所有字段和正文，滚动区外的内容也会包含在内。</p>');
    try {
      const result=await PngExporter.exportPng(snapshot);
      if(modal?.nonce!==nonce) return;
      download(result.blob,`${safeName(snapshot.title)}-${safeName(C.timeOf(snapshot))}.png`);
      openDialog('图片已生成',`<p class="help-text">${result.width} × ${result.height} 像素。已尝试下载；如GPT视图限制下载，可打开下图保存。</p><img id="export-image" class="image-preview" alt="完整档案导出图片">`,`${button('image-download','再次下载','download')}${button('dialog-close','完成','','primary')}`,true);
      currentImageUrl=URL.createObjectURL(result.blob);$('#export-image').src=currentImageUrl;
      modal.image=result.blob;modal.imageName=`${safeName(snapshot.title)}-${safeName(C.timeOf(snapshot))}.png`;
    }catch(e){if(modal?.nonce===nonce)dialogError(e.message);}
  }
  function backupDialog() {
    openDialog('备份与恢复',`<div class="callout">档案保存在当前浏览器。更换设备、清理浏览器数据或进入不同的GPT预览时，请使用JSON备份恢复。</div><div class="backup-buttons">${button('backup-download','下载完整档案备份','download','primary')}${button('restore-file','选择JSON备份恢复','','')}</div><input type="file" id="backup-file" accept=".json,application/json" class="hidden"><p class="help-text">备份包含所有类型、时间版本、关键词和窗口布局。恢复会先检查格式，并在你确认后替换当前档案库；可撤销。</p>${lastSaveError ? `<p class="dialog-error">${H(lastSaveError.message)}</p>`:''}`,button('dialog-close','关闭'));
  }
  function saveDetails() {
    openDialog('保存状态',`<div class="callout">${H($('#save-status').textContent)}</div><p class="help-text">${storage.mode==='memory'?'当前视图不提供持久存储；关闭后可能丢失未备份内容。':'已保存的数据仅属于当前浏览器和当前来源，不代表跨设备或跨GPT预览同步。'}</p>${lastSaveError?`<p class="dialog-error">${H(lastSaveError.message)}</p>`:''}<div class="backup-buttons">${button('backup-download','先下载当前备份','download')}${button('retry-save','重试保存')}${button('reload-data','载入浏览器已保存档案')}</div>`,button('dialog-close','关闭'));
  }
  function helpDialog() {
    openDialog('从空白开始',`<div class="callout">新建档案 → 添加字段 → 输入内容。没有公式，也不需要模型Key。</div><p><strong>并排查看</strong><br>档案库右侧“＋”打开另一个窗口。窗口、表格宽度、行高和列宽可分别调整，空间不足时滚动查看。</p><p><strong>故事版本</strong><br>时间标签由你填写；排序坐标决定横轴先后。添加版本后，原版与新版本独立编辑。“未来版本”选择最近已保存的未来坐标，不会自动编造剧情。</p><p><strong>技能关键词</strong><br>为每个条目填写关键词，单击条目标题或行号复制；点击输入框编辑时不会复制。字段和条目可自由删除。</p><p><strong>导入与保存</strong><br>导入一定先预览，你可以修改内容和归属。浏览器自动保存失败时会显示提醒；建议定期下载JSON备份。</p><p class="help-text">工具业务完全在前端运行，不请求外部AI接口。GPT内的预览和持久存储能力由宿主决定。</p>`,button('dialog-close','开始使用','','primary'));
  }
  async function copyText(text) {
    if(!String(text).trim()) return toast('此条目还没有关键词。');
    try {
      if(!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(String(text));toast('关键词已复制');
    }catch{
      const temp=document.createElement('textarea');temp.value=String(text);temp.style.cssText='position:fixed;left:-9999px;top:0';document.body.append(temp);temp.select();let copied=false;
      try{copied=!!document.execCommand?.('copy');}catch{}temp.remove();
      if(copied)toast('关键词已复制');
      else { openDialog('请手动复制关键词',`<p class="help-text">此GPT视图或浏览器未允许自动写入剪贴板。选中下方文字后按 Ctrl+C，或使用系统复制。</p><textarea id="manual-copy" readonly style="width:100%;min-height:100px">${H(text)}</textarea>`,button('dialog-close','完成'));setTimeout(()=>$('#manual-copy')?.select(),20); }
    }
  }
  root.addEventListener('pointerdown',event=>{
    const handle=event.target.closest('[data-resize]');
    if(handle){startResize(event,handle);return;}
    const panel=event.target.closest('[data-panel]');if(panel)focusPanel(panel.dataset.panel);
  });
  function startResize(event,handle) {
    if(event.button!==0) return;
    const el=handle.closest('[data-panel]'),p=state.panels.find(p=>p.id===el.dataset.panel),v=panelVersion(p),kind=handle.dataset.resize;
    const startX=event.clientX,startY=event.clientY;
    const fieldId=handle.dataset.field,rowId=handle.dataset.row;
    const rowKey=fieldId&&kind==='row'?`${rowId}_${fieldId}`:rowId;
    const field=v.fields.find(f=>f.id===fieldId);
    const start={width:p.width,height:p.height,tableWidth:v.layout.mode==='grid'?v.fields.reduce((n,f)=>n+f.width,0)+(v.visibleMeta.rowKeywords?230:110):v.layout.tableWidth,colWidth:field?.width||220,rowHeight:v.layout.rowHeights[rowKey]||(v.layout.mode==='grid'?100:86)};
    let final={...start}; event.preventDefault();document.body.classList.add('resize-active');
    try{handle.setPointerCapture?.(event.pointerId);}catch{}
    function move(e){
      const dx=e.clientX-startX,dy=e.clientY-startY;
      if(kind==='panel'){final.width=Math.max(320,start.width+dx);final.height=Math.max(250,start.height+dy);el.style.width=`${final.width}px`;el.style.height=`${final.height}px`;$('.panel-bottom span:last-child',el).textContent=`${Math.round(final.width)} × ${Math.round(final.height)}`;}
      else if(kind==='table'){if(v.layout.mode==='grid'){const extra=v.visibleMeta.rowKeywords?230:110;const sum=v.fields.reduce((n,f)=>n+f.width,0);const factor=Math.max(v.fields.length*80,start.tableWidth+dx-extra)/sum;final.columns=v.fields.map(f=>Math.max(80,f.width*factor));final.tableWidth=final.columns.reduce((n,x)=>n+x,0)+extra;$$('col',el).slice(0,v.fields.length).forEach((c,i)=>c.style.width=`${final.columns[i]}px`);$('.grid-sheet',el).style.width=`${final.tableWidth}px`;}else{final.tableWidth=Math.max(180,start.tableWidth+dx);$('.table-container',el).style.width=`${final.tableWidth}px`;$$('.form-sheet',el).forEach(t=>t.style.width=`${final.tableWidth}px`);}}
      else if(kind==='column'){final.colWidth=Math.max(80,start.colWidth+dx);const index=v.fields.findIndex(f=>f.id===fieldId);const cols=$$('col',el);if(cols[index])cols[index].style.width=`${final.colWidth}px`;$('.grid-sheet',el).style.width=`${v.fields.reduce((n,f)=>n+(f.id===fieldId?final.colWidth:f.width),0)+(v.visibleMeta.rowKeywords?230:110)}px`;}
      else if(kind==='row'){final.rowHeight=Math.max(44,start.rowHeight+dy);const targets=fieldId?$$(`textarea[data-row="${rowId}"][data-field="${fieldId}"]`,el):$$(`textarea[data-row="${rowId}"]`,el);targets.forEach(t=>t.style.height=`${final.rowHeight}px`);}
    }
    function finish(e){
      document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',finish);document.removeEventListener('pointercancel',abort);handle.removeEventListener('lostpointercapture',abort);document.body.classList.remove('resize-active');
      try{if(handle.hasPointerCapture?.(event.pointerId))handle.releasePointerCapture(event.pointerId);}catch{}
      if(e.type==='pointercancel'||e.type==='lostpointercapture'){renderWorkspace();return;}
      commit(s=>{const panel=s.panels.find(x=>x.id===p.id),version=C.version(s,p.archiveId,p.versionId);if(kind==='panel'){panel.width=final.width;panel.height=final.height;}else if(kind==='table'){if(version.layout.mode==='grid'&&final.columns)version.fields.forEach((f,i)=>f.width=final.columns[i]);else version.layout.tableWidth=final.tableWidth;}else if(kind==='column')version.fields.find(f=>f.id===fieldId).width=final.colWidth;else version.layout.rowHeights[rowKey]=final.rowHeight;});
    }
    function abort(e){finish(e);}
    document.addEventListener('pointermove',move);document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',abort);handle.addEventListener('lostpointercapture',abort);
  }
  root.addEventListener('keydown',event=>{
    const handle=event.target.closest('[data-resize]');if(!handle||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();const p=state.panels.find(p=>p.id===handle.closest('[data-panel]').dataset.panel),amount=event.shiftKey?50:10,dx=event.key==='ArrowRight'?amount:event.key==='ArrowLeft'?-amount:0,dy=event.key==='ArrowDown'?amount:event.key==='ArrowUp'?-amount:0;
    const kind=handle.dataset.resize;
    commit(s=>{const panel=s.panels.find(x=>x.id===p.id),v=C.version(s,p.archiveId,p.versionId);if(kind==='panel'){panel.width=Math.max(320,panel.width+dx);panel.height=Math.max(250,panel.height+dy);}else if(kind==='table'){if(v.layout.mode==='grid')v.fields.forEach(f=>f.width=Math.max(80,f.width+dx/v.fields.length));else v.layout.tableWidth=Math.max(180,v.layout.tableWidth+dx);}else if(kind==='column'){const f=v.fields.find(f=>f.id===handle.dataset.field);f.width=Math.max(80,f.width+dx);}else{const key=handle.dataset.field?`${handle.dataset.row}_${handle.dataset.field}`:handle.dataset.row;v.layout.rowHeights[key]=Math.max(44,(v.layout.rowHeights[key]||86)+dy);}});
  });
  root.addEventListener('input',event=>{
    const el=event.target;
    if(el.id==='library-search'){query=el.value;renderLibrary();if(view==='timeline')renderTimeline();return;}
    if(el.dataset.importBind&&importPreview){const segment=importPreview.parsed.segments.find(s=>s.id===el.closest('[data-segment]').dataset.segment);segment[el.dataset.importBind]=el.value;return;}
    if(el.dataset.typeBind){const typeId=el.closest('[data-type]').dataset.type;commit(s=>{const t=s.types.find(t=>t.id===typeId);if(el.dataset.typeBind==='name')t.name=el.value;else if(el.dataset.typeBind==='field')t.fields.find(f=>f.id===el.dataset.field).name=el.value;},{render:false,group:`type:${typeId}:${el.dataset.field||'name'}`});renderLibrary();return;}
    const bind=el.dataset.bind,pel=el.closest('[data-panel]');if(!bind||!pel||bind==='version')return;
    const p=state.panels.find(p=>p.id===pel.dataset.panel);
    if(bind==='timeOrder'&&el.value.trim()&&!Number.isFinite(Number(el.value))){el.setAttribute('aria-invalid','true');return;}
    el.removeAttribute('aria-invalid');
    try{commit(s=>{const v=C.version(s,p.archiveId,p.versionId);if(bind==='cell')v.rows.find(r=>r.id===el.dataset.row).values[el.dataset.field]=el.value;else if(bind==='rowKeywords')v.rows.find(r=>r.id===el.dataset.row).keywords=C.keywords(el.value);else if(bind==='keywords')v.keywords=C.keywords(el.value);else if(bind==='timeOrder')v.timeOrder=el.value.trim()?Number(el.value):null;else v[bind]=el.value;},{render:false,group:`input:${p.id}:${bind}:${el.dataset.row||''}:${el.dataset.field||''}`});renderLibrary();if(bind==='keywords'||bind==='rowKeywords'){const holder=el.closest('.meta-wide,td');const wrap=holder&&$('.keyword-wrap',holder);if(wrap)wrap.innerHTML=C.keywords(el.value).map(word=>button('copy-word',word,'','keyword-chip',`data-word="${H(word)}"`)).join('');}}catch(e){toast(e.message,true);}
  });
  root.addEventListener('focusout',event=>{
    if(event.target.matches('[data-bind="timeOrder"][aria-invalid]')){toast('排序坐标需要数字，或留空。此项未修改。',true);renderWorkspace();}
  });
  root.addEventListener('change',event=>{
    const el=event.target;
    if(el.id==='type-filter'){typeFilter=el.value;renderLibrary();renderTimeline();return;}
    if(el.id==='timeline-zoom'){timelineZoom=Number(el.value);renderTimeline();return;}
    if(el.dataset.importBind&&importPreview){const s=importPreview.parsed.segments.find(s=>s.id===el.closest('[data-segment]').dataset.segment);s[el.dataset.importBind]=el.value;if(el.dataset.importBind==='target')$('[data-import-bind="newName"]',el.closest('[data-segment]')).classList.toggle('hidden',el.value!=='new');return;}
    if(el.dataset.typeBind&&['mode','copyOnClick'].includes(el.dataset.typeBind)){const id=el.closest('[data-type]').dataset.type;commit(s=>{const t=s.types.find(t=>t.id===id);t[el.dataset.typeBind]=el.dataset.typeBind==='copyOnClick'?el.checked:el.value;},{render:false});return;}
    if(el.dataset.bind==='version'){const p=state.panels.find(p=>p.id===el.closest('[data-panel]').dataset.panel);commit(s=>{const pp=s.panels.find(x=>x.id===p.id);pp.versionId=el.value;C.archive(s,p.archiveId).activeVersionId=el.value;});return;}
    if(el.id==='backup-file'&&el.files[0])restoreFile(el.files[0]);
  });
  async function restoreFile(file) {
    try{
      const text=await file.text();const candidate=C.validateState(JSON.parse(text));
      openDialog('确认恢复备份',`<div class="callout">备份包含 ${candidate.archives.length} 份档案、${candidate.types.length} 个类型。恢复后替换当前档案库；你仍可撤销。</div><p class="help-text">建议先下载当前备份。文件：${H(file.name)}</p>`,`${button('backup-download','先备份当前档案','download')}${cancel()}${button('confirm-restore','确认恢复','','primary')}`);
      modal.restore=candidate;
    }catch(e){dialogError(e instanceof SyntaxError?'文件不是有效JSON，当前档案未改变。':e.message);}
  }
  function getPanelFromButton(btn){return state.panels.find(p=>p.id===(btn.dataset.panelId||btn.closest('[data-panel]')?.dataset.panel));}
  root.addEventListener('click',async event=>{
    const btn=event.target.closest('button[data-action]');
    if(!btn){const tr=event.target.closest('[data-copy-row]');if(tr&&!event.target.closest('input,textarea,select,button,[data-resize]')){const p=state.panels.find(p=>p.id===tr.closest('[data-panel]').dataset.panel);if(C.archive(state,p.archiveId).copyOnClick){const r=panelVersion(p).rows.find(r=>r.id===tr.dataset.copyRow);await copyText(r.keywords.join('、'));}}return;}
    const action=btn.dataset.action,p=getPanelFromButton(btn);
    try{
      if(action==='new')newDialog();
      else if(action==='confirm-new'){const title=$('#new-title').value,typeId=$('#new-type').value||null,useTemplate=$('#new-template').checked;const a=commit(s=>C.createArchive(s,{title,typeId,useTemplate}));view='workspace';closeDialog();renderAll();revealPanel(state.activePanelId);toast('档案已创建，可自由增删字段。');}
      else if(action==='open'||action==='compare'||action==='open-time'){const a=C.archive(state,btn.dataset.archive);const pp=commit(s=>C.openPanel(s,a.id,btn.dataset.version||a.activeVersionId,action==='compare'));view='workspace';renderAll();revealPanel(pp.id);$('#app-shell').classList.remove('show-sidebar');}
      else if(action==='sidebar')$('#app-shell').classList.toggle('show-sidebar');
      else if(action==='workspace'||action==='timeline'){view=action;renderAll();}
      else if(action==='dialog-close'){closeDialog();renderAll();}
      else if(action==='undo'||action==='redo')undo(action==='redo');
      else if(action==='close-panel'){commit(s=>{s.panels=s.panels.filter(x=>x.id!==p.id);s.activePanelId=s.panels.at(-1)?.id||null;});}
      else if(action==='meta')metaDialog(p);
      else if(action==='confirm-meta'){const labels={},visible={};for(const key of ['title','number','time','keywords','rowKeywords']){labels[key]=$(`#meta-label-${key}`).value;visible[key]=$(`#meta-visible-${key}`).checked;}commit(s=>{const v=C.version(s,p.archiveId,p.versionId);for(const key of Object.keys(labels)){v.metaLabels[key]=labels[key];if(!visible[key])C.removeMeta(v,key);else v.visibleMeta[key]=true;}});closeDialog();}
      else if(action==='add-field'||action==='edit-field')fieldDialog(p,btn.dataset.field||'');
      else if(action==='confirm-field'){const name=$('#field-name').value,aliases=C.keywords($('#field-aliases').value),fid=btn.dataset.field;commit(s=>{const v=C.version(s,p.archiveId,p.versionId);const f=fid?v.fields.find(f=>f.id===fid):C.addField(v,name);if(!f)throw C.error('INVALID_REF','字段已不存在。');f.name=name;f.aliases=aliases;});closeDialog();}
      else if(action==='confirm-delete-field'){commit(s=>C.removeField(C.version(s,p.archiveId,p.versionId),btn.dataset.field));closeDialog();toast('字段及对应内容已删除，可撤销。');}
      else if(action==='add-row'){commit(s=>C.version(s,p.archiveId,p.versionId).rows.push(C.row()));}
      else if(action==='delete-row'){commit(s=>{const v=C.version(s,p.archiveId,p.versionId);v.rows=v.rows.filter(r=>r.id!==btn.dataset.row);});toast('条目已删除，可撤销。');}
      else if(action==='layout')commit(s=>{const v=C.version(s,p.archiveId,p.versionId);v.layout.mode=v.layout.mode==='form'?'grid':'form';});
      else if(action==='copy-mode'){commit(s=>{const a=C.archive(s,p.archiveId);a.copyOnClick=!a.copyOnClick;});toast(C.archive(state,p.archiveId).copyOnClick?'已启用单击条目复制关键词':'已关闭整行复制；仍可点击条目标题复制');}
      else if(action==='copy-row'){const r=panelVersion(p).rows.find(r=>r.id===btn.dataset.row);await copyText(r?.keywords.join('、')||'');}
      else if(action==='copy-word')await copyText(btn.dataset.word);
      else if(action==='new-version')versionDialog(p);
      else if(action==='confirm-version'){const label=$('#version-time').value,raw=$('#version-order').value.trim(),blank=!$('#version-copy').checked;if(raw&&!Number.isFinite(Number(raw)))throw C.error('INVALID_TIME','排序坐标应为数字，或留空。');commit(s=>{const v=C.createVersion(s,p.archiveId,p.versionId,{timeLabel:label,timeOrder:raw?Number(raw):null,blank});s.panels.find(x=>x.id===p.id).versionId=v.id;});closeDialog();toast('新版本已创建，原版本保留。');}
      else if(action==='future'){const a=C.archive(state,p.archiveId),v=panelVersion(p),future=C.futureVersion(a,v.id);if(v.timeOrder===null)toast('当前版本还没有排序坐标，请先设置故事时间。');else if(!future)toast('还没有已保存的未来版本，可点击“添加版本”录入。');else commit(s=>{s.panels.find(x=>x.id===p.id).versionId=future.id;C.archive(s,p.archiveId).activeVersionId=future.id;});}
      else if(action==='compare-version'){const pp=commit(s=>C.openPanel(s,p.archiveId,p.versionId,true));revealPanel(pp.id);}
      else if(action==='archive-menu')archiveMenu(p);
      else if(action==='confirm-archive-type'){const typeId=$('#archive-type').value||null;commit(s=>{C.archive(s,p.archiveId).typeId=typeId;});closeDialog();}
      else if(action==='delete-archive'||action==='delete-version'){const archiveId=p.archiveId,versionId=p.versionId;openDialog(action==='delete-archive'?'删除整份档案？':'删除这个版本？','<p class="help-text">删除后可使用顶部撤销按钮恢复。</p>',`${cancel()}${button(action==='delete-archive'?'confirm-delete-archive':'confirm-delete-version','确认删除','','danger',`data-archive="${archiveId}" data-version="${versionId}"`)}`);}
      else if(action==='confirm-delete-archive'||action==='confirm-delete-version'){commit(s=>action==='confirm-delete-archive'?C.deleteArchive(s,btn.dataset.archive):C.deleteVersion(s,btn.dataset.archive,btn.dataset.version));closeDialog();toast('已删除，可撤销。');}
      else if(action==='types')typesDialog();
      else if(action==='add-type'){const name=$('#new-type-name').value;commit(s=>s.types.push(C.type(name)));typesDialog();}
      else if(action==='delete-type'){const t=state.types.find(t=>t.id===btn.dataset.type),count=state.archives.filter(a=>a.typeId===t.id).length;openDialog('删除类型',`<p>将删除“${H(t.name||'未命名类型')}”及模板字段。</p><p class="help-text">已有 ${count} 份档案，默认保留内容并改为未分类。</p><label class="check-line"><input id="delete-type-archives" type="checkbox">连同这些档案一起删除</label>`,`${cancel()}${button('confirm-delete-type','确认删除','','danger',`data-type="${t.id}"`)}`);}
      else if(action==='confirm-delete-type'){const all=$('#delete-type-archives').checked;commit(s=>C.deleteType(s,btn.dataset.type,all));typesDialog();}
      else if(action==='add-type-field'){commit(s=>s.types.find(t=>t.id===btn.dataset.type).fields.push(C.field('')));typesDialog();}
      else if(action==='delete-type-field'){commit(s=>{const t=s.types.find(t=>t.id===btn.dataset.type);t.fields=t.fields.filter(f=>f.id!==btn.dataset.field);});typesDialog();}
      else if(action==='template')templateDialog(p);
      else if(action==='apply-template'){const t=state.types.find(t=>t.id===$('#template-type').value),replace=$('#template-replace').checked;if(!t)throw C.error('NO_TEMPLATE','请先创建一个档案类型。');commit(s=>C.applyTemplate(C.version(s,p.archiveId,p.versionId),t,replace));closeDialog();toast(replace?'已替换当前字段和内容，可撤销':'已补充模板字段，现有内容保留');}
      else if(action==='save-template'){const name=$('#template-save-name').value,v=panelVersion(p);commit(s=>{const t=C.type(name);t.fields=C.copy(v.fields).map(f=>({...f,id:C.uid('f')}));t.mode=v.layout.mode;t.copyOnClick=C.archive(s,p.archiveId).copyOnClick;s.types.push(t);});closeDialog();toast('字段结构已保存为可修改的类型模板');}
      else if(action==='timeline-clock')openDialog('自定义时间轴',`<label class="form-group"><span>时间轴名称</span><input id="clock-name" value="${H(state.clockName)}"></label><label class="form-group"><span>坐标单位（可留空）</span><input id="clock-unit" value="${H(state.clockUnit)}" placeholder="例如：章、天，或自己的单位"></label><p class="help-text">不要求现实日期。每个版本的数字坐标仅决定先后，标签由你填写。</p>`,`${cancel()}${button('confirm-clock','保存','','primary')}`);
      else if(action==='confirm-clock'){const name=$('#clock-name').value,unit=$('#clock-unit').value;commit(s=>{s.clockName=name;s.clockUnit=unit;});closeDialog();}
      else if(action==='import'||action==='panel-import')importDialog(p||activePanel());
      else if(action==='preview-import'){const parsed=TextImporter.preview($('#import-text').value,panelVersion(p).fields);showImportPreview(p,parsed);}
      else if(action==='back-import'){const raw=importPreview.parsed.raw;importDialog(p);$('#import-text').value=raw;}
      else if(action==='confirm-import'){if(state.revision!==importPreview.baseRevision)throw C.error('REVISION_CONFLICT','档案在预览期间已更新，请返回并重新预览。');const parsed=importPreview.parsed,v=panelVersion(p),appendRows=$('#import-new-rows')?.checked;const empty=v.rows.length===1&&!Object.values(v.rows[0].values).some(Boolean)&&!v.rows[0].keywords.length;const startRow=appendRows&&!empty?v.rows.length:0;const result=TextImporter.apply(v,parsed,{startRow});commit(s=>{const a=C.archive(s,p.archiveId),index=a.versions.findIndex(v=>v.id===p.versionId);a.versions[index]=result.version;});closeDialog();toast(`已导入 ${result.written} 段，可继续编辑或撤销。`);}
      else if(action==='export')await exportImage(p);
      else if(action==='image-download')download(modal.image,modal.imageName);
      else if(action==='backup')backupDialog();
      else if(action==='backup-download'){const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});download(blob,`小说档案备份-${new Date().toISOString().slice(0,10)}.json`);toast('备份已生成，已尝试下载。');}
      else if(action==='restore-file')$('#backup-file').click();
      else if(action==='confirm-restore'){const candidate=modal.restore;commit(s=>{const revision=s.revision;Object.keys(s).forEach(k=>delete s[k]);Object.assign(s,C.copy(candidate));s.revision=revision;});closeDialog();view='workspace';renderAll();toast('备份已恢复，可撤销。');}
      else if(action==='save-details')saveDetails();
      else if(action==='retry-save'){await flushSave();if(!lastSaveError){closeDialog();toast('已保存到此浏览器');}else dialogError(lastSaveError.message);}
      else if(action==='reload-data')openDialog('重新载入已保存档案？','<p class="help-text">这会放弃当前未保存的修改。可先下载备份。</p>',`${button('backup-download','先备份当前档案','download')}${cancel()}${button('confirm-reload','载入已保存档案','','primary')}`);
      else if(action==='confirm-reload'){clearTimeout(saveTimer);if(savePromise)await savePromise;const saved=await storage.load();if(!saved)throw C.error('NO_SAVED_DATA','此浏览器还没有已保存的档案。');state=C.validateState(saved);undoStack.length=0;redoStack.length=0;dirty=false;lastSaveError=null;saveStatus('已载入浏览器档案');closeDialog();renderAll();}
      else if(action==='help')helpDialog();
    }catch(e){dialogError(e.message||'操作未完成，请重试。');}
  });
  document.addEventListener('keydown',event=>{
    if(modal){if(event.key==='Escape'){closeDialog();return;}if(event.key==='Tab'){const controls=$$('.dialog button:not([disabled]),.dialog input:not([disabled]),.dialog textarea:not([disabled]),.dialog select:not([disabled])').filter(el=>!el.classList.contains('hidden'));const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}return;}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!event.target.matches('input,textarea')){event.preventDefault();undo(event.shiftKey);}
  });
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  async function registerHostTools() {
    const registry=document.modelContext;
    if(typeof registry?.registerTool!=='function')return;
    const schema={type:'object',properties:{},additionalProperties:false};
    const readonly={readOnlyHint:true,untrustedContentHint:true};
    const tools=[
      {name:'read_novel_archives',description:'读取当前浏览器小说档案的类型、字段和时间版本，不修改数据。',inputSchema:schema,annotations:readonly,execute:()=>({revision:state.revision,archives:C.copy(state.archives),types:C.copy(state.types)})},
      {name:'open_novel_archive',description:'在对照工作台打开指定档案或已有时间版本，不修改正文。',inputSchema:{type:'object',properties:{archiveId:{type:'string'},versionId:{type:'string'},compare:{type:'boolean'}},required:['archiveId'],additionalProperties:false},execute:input=>{if(!input||typeof input.archiveId!=='string'||(input.versionId!==undefined&&typeof input.versionId!=='string')||(input.compare!==undefined&&typeof input.compare!=='boolean'))throw C.error('INVALID_INPUT','档案引用格式不正确。');const p=commit(s=>C.openPanel(s,input.archiveId,input.versionId,!!input.compare));view='workspace';renderAll();return {opened:true,panelId:p.id};}},
      {name:'preview_novel_archive_import',description:'把文字放入当前档案的导入预览，等待作者确认归属；不写入档案正文。',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false},execute:input=>{if(!input||typeof input.text!=='string')throw C.error('INVALID_INPUT','请输入文本。');const p=activePanel();if(!p)throw C.error('NO_ACTIVE_ARCHIVE','请先打开档案。');const parsed=TextImporter.preview(input.text,panelVersion(p).fields);showImportPreview(p,parsed);return {previewOpened:true,segments:parsed.segments.length,requiresAuthorConfirmation:true};}}
    ];
    for(const tool of tools)try{await registry.registerTool(tool);}catch{}
  }
  window.NovelArchive={getState:()=>C.copy(state),getHostStatus:()=>({...host,storage:storage.mode,saved:!dirty}),previewImport:text=>{const p=activePanel();if(!p)throw C.error('NO_ACTIVE_ARCHIVE','请先打开档案。');showImportPreview(p,TextImporter.preview(text,panelVersion(p).fields));return {previewOpened:true};},flushSave};
  async function init(){
    renderAll();
    try{await storage.open();const saved=await storage.load();if(saved)state=C.validateState(saved);loaded=true;renderAll();saveStatus(storage.mode==='memory'?'未持久保存 · 请备份':'已准备 · 此浏览器保存',storage.mode==='memory');}
    catch(e){loaded=true;storage.mode='memory';lastSaveError=e;saveStatus('原存储读取失败 · 请处理',true);toast(`${e.message} 原数据未覆盖，请先导出或恢复有效备份。`,true);}
    try{broadcast=new BroadcastChannel('novel-archive-studio');broadcast.onmessage=event=>{if(event.data?.revision>state.revision||event.data?.revision>storage.lastSavedRevision){lastSaveError=C.error('REVISION_CONFLICT','另一个窗口已更新档案，请先备份当前内容，再载入已保存档案。');saveStatus('其他窗口已更新 · 请处理',true);}};}catch{}
    await registerHostTools();
  }
  init();
})();
