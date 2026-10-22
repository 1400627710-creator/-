export const PngExporter = (() => {
  const FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';
  function wrap(ctx, text, width) {
    const blocks = String(text ?? '').split('\n');
    const result = [];
    for (const block of blocks) {
      const chars = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(block)].map(s => s.segment) : Array.from(block);
      let line = '';
      for (const char of chars) {
        if (line && ctx.measureText(line + char).width > width) { result.push(line); line = char; }
        else line += char;
      }
      result.push(line);
    }
    return result;
  }
  function plan(ctx, version) {
    const v = version;
    const pad = 34, textPad = 15, lineHeight = 25;
    const tableWidth = v.layout.mode === 'grid' ? Math.max(180, v.fields.reduce((sum, f) => sum + f.width, 0) + (v.visibleMeta.rowKeywords ? 230 : 0)) : Math.max(180, v.layout.tableWidth);
    const width = Math.ceil(tableWidth + pad * 2);
    const blocks = [];
    let y = pad;
    function textBlock(text, size, color = '#3c444b', gap = 12) {
      ctx.font = `${size}px ${FONT}`;
      const lines = wrap(ctx, text, width - pad * 2);
      blocks.push({ kind: 'text', x: pad, y, lines, font: ctx.font, color, lineHeight: size + 9 });
      y += lines.length * (size + 9) + gap;
    }
    if (v.visibleMeta.title && v.title) textBlock(v.title, 25, '#283a44', 18);
    if (v.visibleMeta.number && v.number) textBlock(`${v.metaLabels.number}：${v.number}`, 14);
    if (v.visibleMeta.time && (v.timeLabel || v.timeOrder !== null)) textBlock(`${v.metaLabels.time}：${v.timeLabel}${v.timeOrder === null ? '' : `  [${v.timeOrder}]`}`, 14);
    if (v.visibleMeta.keywords && v.keywords.length) textBlock(`${v.metaLabels.keywords}：${v.keywords.join('、')}`, 14, '#5b686f', 20);
    const cells = [];
    const rowBlock = (rowCells, forcedHeight = 0, header = false) => {
      ctx.font = `${header ? 14 : 16}px ${FONT}`;
      const data = rowCells.map(c => ({ ...c, lines: wrap(ctx, c.text, Math.max(1, c.width - textPad * 2)) }));
      const height = Math.max(46, forcedHeight, ...data.map(c => c.lines.length * lineHeight + textPad * 2));
      let x = pad;
      for (const c of data) { cells.push({ ...c, x, y, height, header, font: ctx.font }); x += c.width; }
      y += height;
    };
    if (v.layout.mode === 'grid' && v.fields.length) {
      rowBlock([...v.fields.map(f => ({ text: f.name, width: f.width })), ...(v.visibleMeta.rowKeywords ? [{ text: v.metaLabels.rowKeywords, width: 230 }] : [])], 0, true);
      for (const r of v.rows) rowBlock([...v.fields.map(f => ({ text: r.values[f.id] || '', width: f.width })), ...(v.visibleMeta.rowKeywords ? [{ text: r.keywords.join('、'), width: 230 }] : [])], v.layout.rowHeights[r.id] || 0);
    } else {
      for (const [index, r] of v.rows.entries()) {
        if (v.rows.length > 1) { y += 12; textBlock(`条目 ${index + 1}`, 15, '#5b686f', 8); }
        for (const f of v.fields) rowBlock([{ text: f.name, width: Math.min(155, tableWidth * .34) }, { text: r.values[f.id] || '', width: tableWidth - Math.min(155, tableWidth * .34) }], v.layout.rowHeights[`${r.id}_${f.id}`] || 0);
        if (v.visibleMeta.rowKeywords && r.keywords.length) { y += 10; textBlock(`${v.metaLabels.rowKeywords}：${r.keywords.join('、')}`, 14); }
      }
    }
    return { width, height: Math.ceil(Math.max(140, y + pad)), blocks, cells, textPad, lineHeight };
  }
  async function exportPng(snapshot) {
    if (document.fonts?.ready) await document.fonts.ready;
    const canvas = document.createElement('canvas');
    let ctx = canvas.getContext('2d');
    if (!ctx) throw Object.assign(new Error('当前环境不支持图片绘制，请在网页版导出。'), { code: 'CANVAS_UNAVAILABLE' });
    const layout = plan(ctx, snapshot);
    const renderedText = [...layout.blocks.flatMap(b => b.lines), ...layout.cells.map(c => c.text)].join('');
    if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3001-\u303f\uff01-\uff60]/u.test(renderedText)) {
      ctx.font = `16px ${FONT}`;
      const sample = ctx.measureText('中文');
      if (sample.actualBoundingBoxAscent === 0 && sample.actualBoundingBoxDescent === 0) throw Object.assign(new Error('当前绘图环境缺少中文字形。请使用支持中文的浏览器打开网页版导出；未生成空白图片。'), { code: 'FONT_UNAVAILABLE' });
    }
    if (layout.width > 16384 || layout.height > 32760 || layout.width * layout.height > 40000000) throw Object.assign(new Error('完整档案超出浏览器单张图片能力。请减少表格宽度或按条目拆分后导出；原档案仍保留。'), { code: 'EXPORT_TOO_LARGE' });
    canvas.width = layout.width; canvas.height = layout.height;
    ctx = canvas.getContext('2d');
    ctx.fillStyle = '#faf8f3'; ctx.fillRect(0, 0, layout.width, layout.height);
    ctx.textBaseline = 'top';
    for (const b of layout.blocks) { ctx.font = b.font; ctx.fillStyle = b.color; b.lines.forEach((line, index) => ctx.fillText(line, b.x, b.y + index * b.lineHeight)); }
    for (const c of layout.cells) {
      ctx.fillStyle = c.header ? '#edf1ed' : '#ffffff'; ctx.fillRect(c.x, c.y, c.width, c.height);
      ctx.strokeStyle = '#d8dfda'; ctx.lineWidth = 1; ctx.strokeRect(c.x + .5, c.y + .5, c.width, c.height);
      ctx.fillStyle = '#394951'; ctx.font = c.font;
      c.lines.forEach((line, index) => ctx.fillText(line, c.x + layout.textPad, c.y + layout.textPad + index * layout.lineHeight));
    }
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw Object.assign(new Error('图片生成失败，请缩小宽度后重试。'), { code: 'EXPORT_FAILED' });
    return { blob, width: layout.width, height: layout.height };
  }
  return { wrap, plan, exportPng };
})();
