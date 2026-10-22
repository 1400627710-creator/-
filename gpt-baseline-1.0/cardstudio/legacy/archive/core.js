export const ArchiveCore = (() => {
  const copy = value => JSON.parse(JSON.stringify(value));
  let serial = 0;
  const uid = prefix => `${prefix}_${globalThis.crypto?.randomUUID?.().replaceAll('-', '') || `${Date.now().toString(36)}${(++serial).toString(36)}${Math.random().toString(36).slice(2)}`}`;
  const error = (code, message) => Object.assign(new Error(message), { code });
  const normalize = s => String(s ?? '').normalize('NFKC').trim().toLocaleLowerCase();
  const keywords = text => Array.isArray(text) ? [...new Set(text.map(String).map(s => s.trim()).filter(Boolean))] : [...new Set(String(text).split(/[,，、;；\n]+/).map(s => s.trim()).filter(Boolean))];
  const field = (name = '', aliases = []) => ({ id: uid('f'), name, aliases: keywords(aliases), width: 220 });
  const row = () => ({ id: uid('r'), values: {}, keywords: [] });
  const type = (name, names = [], mode = 'form', copyOnClick = false) => ({ id: uid('t'), name, fields: names.map(n => field(n)), mode, copyOnClick });
  function blankState() {
    return { schemaVersion: 1, revision: 0, types: [type('角色', ['姓名', '身份', '外貌', '性格', '背景', '目标']), type('物品', ['名称', '描述', '用途', '来历']), type('事件', ['事件', '参与者', '经过', '影响']), type('技能', ['技能名称', '效果', '限制'], 'grid', true)], archives: [], panels: [], activePanelId: null, clockName: '故事时间', clockUnit: '' };
  }
  const archive = (state, id) => {
    const a = state.archives.find(a => a.id === id);
    if (!a) throw error('INVALID_REF', '找不到这份档案。');
    return a;
  };
  const version = (state, archiveId, versionId) => {
    const a = archive(state, archiveId);
    const v = a.versions.find(v => v.id === versionId);
    if (!v) throw error('INVALID_REF', '找不到这个时间版本。');
    return v;
  };
  function makeVersion(title = '', fields = [], mode = 'form') {
    return { id: uid('v'), title, number: '', timeLabel: '', timeOrder: null, keywords: [], fields: copy(fields), rows: [row()], layout: { mode, tableWidth: 480, rowHeights: {} }, metaLabels: { title: '档案名称', number: '编号', time: '故事时间', keywords: '关键词', rowKeywords: '条目关键词' }, visibleMeta: { title: true, number: true, time: true, keywords: true, rowKeywords: true } };
  }
  function createArchive(state, { title = '', typeId = null, useTemplate = false } = {}) {
    const t = typeId === null ? null : state.types.find(t => t.id === typeId);
    if (typeId !== null && !t) throw error('INVALID_REF', '该档案类型已删除。');
    const v = makeVersion(title, useTemplate ? t?.fields || [] : [], t?.mode || 'form');
    const a = { id: uid('a'), typeId, versions: [v], activeVersionId: v.id, copyOnClick: !!t?.copyOnClick };
    state.archives.push(a);
    openPanel(state, a.id, v.id, true);
    return a;
  }
  function openPanel(state, archiveId, versionId, duplicate = false) {
    const a = archive(state, archiveId);
    const v = version(state, archiveId, versionId || a.activeVersionId);
    let p = duplicate ? null : state.panels.find(p => p.archiveId === archiveId && p.versionId === v.id);
    if (!p) {
      p = { id: uid('p'), archiveId, versionId: v.id, width: 570, height: 650 };
      state.panels.push(p);
    }
    state.activePanelId = p.id;
    a.activeVersionId = v.id;
    return p;
  }
  function addField(v, name = '') {
    const f = field(name);
    v.fields.push(f);
    return f;
  }
  function removeField(v, fieldId) {
    v.fields = v.fields.filter(f => f.id !== fieldId);
    for (const r of v.rows) delete r.values[fieldId];
  }
  function removeMeta(v, key) {
    if (!(key in v.visibleMeta)) throw error('INVALID_FIELD', '未知档案信息。');
    v.visibleMeta[key] = false;
    if (key === 'time') { v.timeLabel = ''; v.timeOrder = null; }
    else if (key === 'keywords') v.keywords = [];
    else if (key === 'rowKeywords') for (const r of v.rows) r.keywords = [];
    else v[key] = '';
  }
  function deleteType(state, typeId, deleteArchives = false) {
    state.types = state.types.filter(t => t.id !== typeId);
    for (const a of [...state.archives]) if (a.typeId === typeId) {
      if (deleteArchives) deleteArchive(state, a.id);
      else a.typeId = null;
    }
  }
  function deleteArchive(state, id) {
    archive(state, id);
    state.archives = state.archives.filter(a => a.id !== id);
    state.panels = state.panels.filter(p => p.archiveId !== id);
    if (!state.panels.some(p => p.id === state.activePanelId)) state.activePanelId = state.panels.at(-1)?.id || null;
  }
  function createVersion(state, archiveId, parentId, { timeLabel = '', timeOrder = null, blank = false } = {}) {
    const a = archive(state, archiveId);
    const parent = version(state, archiveId, parentId);
    if (timeOrder !== null && !Number.isFinite(timeOrder)) throw error('INVALID_TIME', '排序坐标应为数字，或留空。');
    const v = blank ? makeVersion(parent.title, parent.fields, parent.layout.mode) : copy(parent);
    v.id = uid('v'); v.timeLabel = timeLabel; v.timeOrder = timeOrder;
    a.versions.push(v); a.activeVersionId = v.id;
    return v;
  }
  function deleteVersion(state, archiveId, versionId) {
    const a = archive(state, archiveId);
    version(state, archiveId, versionId);
    if (a.versions.length === 1) { deleteArchive(state, archiveId); return; }
    a.versions = a.versions.filter(v => v.id !== versionId);
    if (a.activeVersionId === versionId) a.activeVersionId = a.versions[0].id;
    for (const p of state.panels) if (p.archiveId === archiveId && p.versionId === versionId) p.versionId = a.activeVersionId;
  }
  const orderedVersions = a => a.versions.map((v, index) => ({ v, index })).filter(x => x.v.timeOrder !== null).sort((x, y) => x.v.timeOrder - y.v.timeOrder || x.index - y.index).map(x => x.v);
  function futureVersion(a, versionId) {
    const current = a.versions.find(v => v.id === versionId);
    if (!current || current.timeOrder === null) return null;
    return orderedVersions(a).find(v => v.timeOrder > current.timeOrder) || null;
  }
  const titleOf = v => v.title.trim() || '未命名档案';
  const timeOf = v => v.timeLabel.trim() || (v.timeOrder === null ? '未标时间' : `坐标 ${v.timeOrder}`);
  function search(state, query = '', typeId = '') {
    const q = normalize(query).split(/\s+/).filter(Boolean);
    return state.archives.filter(a => (!typeId || a.typeId === typeId || (typeId === '__none' && a.typeId === null)) && q.every(term => a.versions.some(v => normalize([v.title, v.number, v.timeLabel, ...v.keywords, ...v.fields.map(f => f.name), ...v.rows.flatMap(r => [...r.keywords, ...Object.values(r.values)])].join(' ')).includes(term))));
  }
  function applyTemplate(v, t, replace = false) {
    if (replace) { v.fields = []; v.rows = [row()]; }
    for (const tf of t.fields) if (!v.fields.some(f => normalize(f.name) === normalize(tf.name))) {
      const f = copy(tf); f.id = uid('f'); v.fields.push(f);
    }
    v.layout.mode = t.mode;
  }
  function validateState(input) {
    const fail = message => { throw error('INVALID_BACKUP', message); };
    const obj = x => x && typeof x === 'object' && !Array.isArray(x);
    const str = x => typeof x === 'string';
    const id = x => str(x) && /^[A-Za-z0-9_-]{1,120}$/.test(x) && !['__proto__', 'constructor', 'prototype'].includes(x);
    const list = (xs, what) => { if (!Array.isArray(xs) || xs.some(x => !str(x))) fail(`${what}应为文字列表。`); };
    const unique = (xs, what) => { if (new Set(xs).size !== xs.length) fail(`${what}编号重复。`); };
    const fields = fs => {
      if (!Array.isArray(fs)) fail('字段格式不正确。');
      for (const f of fs) { if (!obj(f) || !id(f.id) || !str(f.name)) fail('字段格式不正确。'); list(f.aliases, '字段别名'); if (!Number.isFinite(f.width) || f.width <= 0) fail('列宽应大于零。'); }
      unique(fs.map(f => f.id), '字段');
    };
    if (!obj(input) || input.schemaVersion !== 1) throw error('UNSUPPORTED_FORMAT', '请选择本工具导出的档案备份。');
    if (!Array.isArray(input.archives) || !Array.isArray(input.types) || !Array.isArray(input.panels)) fail('档案备份结构不完整。');
    if (!Number.isSafeInteger(input.revision) || input.revision < 0 || !str(input.clockName) || !str(input.clockUnit)) fail('备份版本或时间轴名称不正确。');
    for (const t of input.types) { if (!obj(t) || !id(t.id) || !str(t.name) || !['form', 'grid'].includes(t.mode) || typeof t.copyOnClick !== 'boolean') fail('类型格式不正确。'); fields(t.fields); }
    unique(input.types.map(t => t.id), '类型');
    const allVersions = [];
    for (const a of input.archives) {
      if (!obj(a) || !id(a.id) || !Array.isArray(a.versions) || !a.versions.length || typeof a.copyOnClick !== 'boolean' || !(a.typeId === null || input.types.some(t => t.id === a.typeId))) fail('档案格式或所属类型不正确。');
      for (const v of a.versions) {
        if (!obj(v) || !id(v.id) || !str(v.title) || !str(v.number) || !str(v.timeLabel) || !(v.timeOrder === null || Number.isFinite(v.timeOrder))) fail('时间版本格式不正确。');
        list(v.keywords, '关键词'); fields(v.fields);
        if (!Array.isArray(v.rows) || !obj(v.layout) || !['form', 'grid'].includes(v.layout.mode) || !Number.isFinite(v.layout.tableWidth) || v.layout.tableWidth <= 0 || !obj(v.layout.rowHeights)) fail('表格布局格式不正确。');
        if (!obj(v.metaLabels) || !obj(v.visibleMeta)) fail('档案信息格式不正确。');
        for (const k of ['title', 'number', 'time', 'keywords', 'rowKeywords']) if (!str(v.metaLabels[k]) || typeof v.visibleMeta[k] !== 'boolean') fail('档案信息格式不正确。');
        for (const [k, height] of Object.entries(v.layout.rowHeights)) if (!id(k) || !Number.isFinite(height) || height <= 0) fail('行高格式不正确。');
        for (const r of v.rows) {
          if (!obj(r) || !id(r.id) || !obj(r.values)) fail('表格行格式不正确。');
          list(r.keywords, '条目关键词');
          for (const [k, value] of Object.entries(r.values)) if (!id(k) || !str(value) || !v.fields.some(f => f.id === k)) fail('单元格引用了不存在的字段。');
        }
        unique(v.rows.map(r => r.id), '表格行');
        allVersions.push(v.id);
      }
      if (!a.versions.some(v => v.id === a.activeVersionId)) fail('当前版本引用不正确。');
    }
    unique(input.archives.map(a => a.id), '档案'); unique(allVersions, '时间版本');
    for (const p of input.panels) {
      if (!obj(p) || !id(p.id) || !Number.isFinite(p.width) || !Number.isFinite(p.height) || p.width <= 0 || p.height <= 0 || !input.archives.some(a => a.id === p.archiveId && a.versions.some(v => v.id === p.versionId))) fail('分屏窗口格式不正确。');
    }
    unique(input.panels.map(p => p.id), '分屏');
    if (!(input.activePanelId === null || input.panels.some(p => p.id === input.activePanelId))) fail('当前窗口引用不正确。');
    return copy(input);
  }
  return { copy, uid, error, normalize, keywords, field, row, type, blankState, archive, version, makeVersion, createArchive, openPanel, addField, removeField, removeMeta, deleteType, deleteArchive, createVersion, deleteVersion, orderedVersions, futureVersion, titleOf, timeOf, search, applyTemplate, validateState };
})();
