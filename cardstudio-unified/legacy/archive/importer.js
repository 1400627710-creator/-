import { ArchiveCore } from './core.js';
export const TextImporter = (() => {
  const C = ArchiveCore;
  function preview(text, fields = []) {
    if (!String(text).trim()) throw C.error('EMPTY_TEXT', '请先粘贴需要导入的文字。');
    const raw = String(text);
    const cleaned = raw.trim().replace(/^```(?:json|text|markdown)?\s*\n?/i, '').replace(/\n?```\s*$/, '');
    const segments = [];
    let isTable = false;
    function add(label, value, source, rowIndex = 0, forced = '') {
      const matches = label ? fields.filter(f => [f.name, ...f.aliases].some(s => C.normalize(s) === C.normalize(label))) : [];
      const target = forced || (matches.length === 1 ? `field:${matches[0].id}` : matches.length === 0 && label ? 'new' : 'unassigned');
      segments.push({ id: `segment_${segments.length}`, label: String(label || ''), value: String(value ?? ''), source: String(source ?? value ?? ''), rowIndex, target, newName: String(label || ''), mode: 'append', candidates: matches.map(f => f.id), issue: matches.length > 1 ? '多个字段同名，请选择归属' : !label ? '未识别到字段，请指定归属' : target === 'new' ? '将创建新字段，可修改名称' : '' });
    }
    if (/^[{[]/.test(cleaned)) {
      let parsed;
      try { parsed = JSON.parse(cleaned); } catch { parsed = null; }
      if (parsed?.schemaVersion && parsed?.archives) throw C.error('BACKUP_IN_TEXT', '这是整库备份，请使用“备份与恢复”中的恢复功能。');
      if (parsed && parsed.format === 'novel-archive-import') {
        if (parsed.fields !== undefined && !Array.isArray(parsed.fields)) throw C.error('INVALID_IMPORT', '字段列表应为数组。');
        if (parsed.metadata !== undefined && (!parsed.metadata || typeof parsed.metadata !== 'object' || Array.isArray(parsed.metadata))) throw C.error('INVALID_IMPORT', '档案信息应为对象。');
        if (!Array.isArray(parsed.fields) && !Array.isArray(parsed.rows) && !parsed.metadata) throw C.error('INVALID_IMPORT', '结构化导入缺少字段或内容。');
        const metadata = parsed.metadata || {};
        for (const key of ['title', 'number', 'timeLabel', 'timeOrder', 'keywords']) if (metadata[key] !== undefined) {
          if (key === 'keywords' && (!Array.isArray(metadata[key]) || metadata[key].some(k => typeof k !== 'string'))) throw C.error('INVALID_IMPORT', '关键词应为文字数组。');
          if (key !== 'keywords' && metadata[key] !== null && !['string','number'].includes(typeof metadata[key])) throw C.error('INVALID_IMPORT', '档案信息应为文字或数字。');
          const value = key === 'keywords' ? C.keywords(metadata[key]).join('、') : String(metadata[key] ?? '');
          add(({ title: '档案名称', number: '编号', timeLabel: '故事时间', timeOrder: '排序坐标', keywords: '档案关键词' })[key], value, value, 0, `meta:${key}`);
        }
        for (const f of parsed.fields || []) {
          if (!f || typeof f.name !== 'string' || !['string', 'number', 'boolean'].includes(typeof f.value)) throw C.error('INVALID_IMPORT', '每个导入字段都需要名称和文字内容。');
          add(f.name, f.value, `${f.name}：${f.value}`);
        }
        if (parsed.rows) {
          if (!Array.isArray(parsed.rows)) throw C.error('INVALID_IMPORT', '条目列表格式不正确。');
          isTable = true;
          parsed.rows.forEach((r, index) => {
            if (!r || typeof r.values !== 'object' || !r.values || Array.isArray(r.values)) throw C.error('INVALID_IMPORT', '条目应包含values字段名与内容。');
            for (const [name, value] of Object.entries(r.values)) {
              if (!['string', 'number', 'boolean'].includes(typeof value)) throw C.error('INVALID_IMPORT', '单元格应为文字内容。');
              add(name, value, `${name}：${value}`, index);
            }
            if (r.keywords !== undefined) {
              if (!Array.isArray(r.keywords) || r.keywords.some(k => typeof k !== 'string')) throw C.error('INVALID_IMPORT', '条目关键词应为文字数组。');
              add('条目关键词', C.keywords(r.keywords).join('、'), JSON.stringify(r.keywords), index, 'rowKeywords');
            }
          });
        }
        if (!segments.length) throw C.error('EMPTY_TEXT', '没有可导入的内容。');
        return annotate();
      }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [name, value] of Object.entries(parsed)) add(name, typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? ''), `${name}：${typeof value === 'object' ? JSON.stringify(value) : value}`);
        return annotate();
      }
    }
    const lines = cleaned.split(/\r?\n/);
    const markdownSeparator = line => /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
    const parsePipe = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(s => s.trim().replace(/\\\|/g, '|'));
    const tableStart = lines.findIndex((line, i) => line.includes('|') && i + 1 < lines.length && markdownSeparator(lines[i + 1]));
    if (tableStart >= 0) {
      const headers = parsePipe(lines[tableStart]);
      let end = tableStart + 2, rowIndex = 0;
      while (end < lines.length && lines[end].includes('|') && lines[end].trim()) {
        const cells = parsePipe(lines[end]);
        if (cells.length > headers.length) { add('', lines[end], lines[end], rowIndex); }
        else headers.forEach((header, col) => add(header, cells[col] || '', lines[end], rowIndex, ['关键词', '关键字', '_keywords'].includes(C.normalize(header)) ? 'rowKeywords' : ''));
        end++; rowIndex++;
      }
      isTable = true;
      const outside = [...lines.slice(0, tableStart), ...lines.slice(end)].join('\n').trim();
      if (outside) add('', outside, outside);
      return annotate();
    }
    if (lines[0].includes('\t') && lines.length > 1) {
      const headers = lines[0].split('\t'); isTable = true;
      lines.slice(1).filter(line => line.trim()).forEach((line, index) => {
        const cells = line.split('\t');
        if (cells.length > headers.length) add('', line, line, index);
        else headers.forEach((header, col) => add(header, cells[col] || '', line, index, ['关键词', '关键字', '_keywords'].includes(C.normalize(header)) ? 'rowKeywords' : ''));
      });
      return annotate();
    }
    let current = null;
    function flush() {
      if (!current) return;
      add(current.label, current.value.join('\n').trim(), current.source.join('\n'));
      current = null;
    }
    for (const line of lines) {
      const heading = line.match(/^\s*#{1,6}\s+(.+?)\s*#*\s*$/);
      const pair = line.match(/^\s*(?:[-*•]\s*)?([^:：\n]{1,100})\s*[:：]\s*(.*)$/);
      if (heading) { flush(); current = { label: heading[1].trim(), value: [], source: [line] }; }
      else if (pair && !/^\d+$/.test(pair[1].trim())) {
        flush(); current = { label: pair[1].trim().replace(/^\*\*|\*\*$/g, ''), value: [pair[2]], source: [line] };
      } else {
        if (!current) current = { label: '', value: [], source: [] };
        current.value.push(line); current.source.push(line);
      }
    }
    flush();
    return annotate();
    function annotate() {
      const seen = new Map();
      for (const segment of segments) {
        const key = `${segment.rowIndex}|${segment.target === 'new' ? C.normalize(segment.newName) : segment.target}`;
        if (!['ignore','unassigned'].includes(segment.target) && seen.has(key)) segment.issue = '同一条目内重复字段，默认追加；可选择替换';
        seen.set(key, true);
      }
      return { raw, segments, isTable };
    }
  }
  function apply(version, preview, { startRow = 0 } = {}) {
    const v = C.copy(version);
    let written = 0;
    if (!Number.isSafeInteger(startRow) || startRow < 0) throw C.error('INVALID_ROW', '条目位置不正确。');
    for (const s of preview.segments) {
      if (s.target === 'ignore') continue;
      if (s.target === 'unassigned') throw C.error('UNRESOLVED_IMPORT', '还有未指定归属的段落。请选择字段或明确选择“不导入这段”。');
      if (!Number.isSafeInteger(s.rowIndex) || s.rowIndex < 0) throw C.error('INVALID_ROW', '条目位置不正确。');
      const value = String(s.value);
      if (s.target.startsWith('meta:')) {
        const key = s.target.slice(5);
        if (!['title', 'number', 'timeLabel', 'timeOrder', 'keywords'].includes(key)) throw C.error('INVALID_FIELD', '未知档案信息。');
        if (key === 'timeOrder') {
          if (value.trim() && !Number.isFinite(Number(value))) throw C.error('INVALID_TIME', '排序坐标需为数字或留空。');
          v.timeOrder = value.trim() ? Number(value) : null; v.visibleMeta.time = true;
        } else if (key === 'keywords') { v.keywords = s.mode === 'replace' ? C.keywords(value) : [...new Set([...v.keywords, ...C.keywords(value)])]; v.visibleMeta.keywords = true; }
        else {
          v[key] = s.mode === 'replace' || !v[key] ? value : `${v[key]}\n${value}`;
          v.visibleMeta[key === 'timeLabel' ? 'time' : key] = true;
        }
        written++; continue;
      }
      const index = startRow + s.rowIndex;
      while (v.rows.length <= index) v.rows.push(C.row());
      const r = v.rows[index];
      if (s.target === 'rowKeywords') {
        r.keywords = s.mode === 'replace' ? C.keywords(value) : [...new Set([...r.keywords, ...C.keywords(value)])];
        v.visibleMeta.rowKeywords = true;
      } else {
        let f;
        if (s.target === 'new') {
          const name = s.newName.trim();
          if (!name) throw C.error('EMPTY_FIELD_NAME', '请为新字段填写名称，或选择“不导入”。');
          f = v.fields.find(f => C.normalize(f.name) === C.normalize(name));
          if (!f) f = C.addField(v, name);
        } else if (s.target.startsWith('field:')) f = v.fields.find(f => f.id === s.target.slice(6));
        if (!f) throw C.error('INVALID_REF', '归属字段已不存在，请重新预览。');
        r.values[f.id] = s.mode === 'replace' || !r.values[f.id] ? value : `${r.values[f.id]}\n${value}`;
      }
      written++;
    }
    if (!written) throw C.error('NOTHING_SELECTED', '请至少为一段内容指定归属。');
    return { version: v, written };
  }
  return { preview, apply };
})();
