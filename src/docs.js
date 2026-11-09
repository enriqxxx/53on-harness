const fs = require('fs');
const zlib = require('zlib');

const MAX_OUT = 200000;   // lo que va al prompt tiene precio: se corta y se avisa del corte
const cut = (s) => (s.length > MAX_OUT ? s.slice(0, MAX_OUT) + '\n[...cortado, pedí menos páginas/celdas]' : s);

function notebook(path, from, to) {
  const j = JSON.parse(fs.readFileSync(path, 'utf8'));
  const cells = j.cells || [];
  const a = Math.max(1, +from || 1), b = Math.min(cells.length, +to || cells.length);
  const txt = (s) => (Array.isArray(s) ? s.join('') : String(s || ''));
  const out = ['cuaderno ' + path + ' · ' + cells.length + ' celdas · kernel ' +
    (((j.metadata || {}).kernelspec || {}).display_name || '?')];

  for (let i = a - 1; i < b; i++) {
    const c = cells[i] || {}, n = '[' + (i + 1) + ']';
    out.push('\n' + n + ' ' + (c.cell_type || '?') + (c.execution_count != null ? ' · ejecutada ' + c.execution_count : ''));
    out.push(txt(c.source).replace(/\n$/, ''));
    (c.outputs || []).forEach((o) => {
      const d = o.data || {};
      if (o.output_type === 'stream') out.push('  → ' + txt(o.text).replace(/\n/g, '\n  '));
      else if (o.output_type === 'error') out.push('  ✗ ' + o.ename + ': ' + o.evalue);
      else if (d['text/plain']) out.push('  → ' + txt(d['text/plain']).replace(/\n/g, '\n  '));
      Object.keys(d).filter((k) => /^image\//.test(k)).forEach((k) => out.push('  🖼️ salida ' + k));
    });
  }
  return cut(out.join('\n'));
}

function objects(buf) {
  const s = buf.latin1Slice ? buf.latin1Slice(0) : buf.toString('latin1');
  const obj = {};                        // id -> {head, stream}
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const id = +m[1], start = m.index + m[0].length;
    const end = s.indexOf('endobj', start);
    if (end < 0) continue;
    const body = s.slice(start, end);
    const si = body.indexOf('stream');
    let head = body, stream = null;
    if (si >= 0) {
      head = body.slice(0, si);
      let p = start + si + 6;
      if (s[p] === '\r') p++;
      if (s[p] === '\n') p++;
      const ei = s.indexOf('endstream', p);
      if (ei > p) stream = buf.slice(p, ei);
    }
    obj[id] = { head, stream };
  }
  return obj;
}

function inflate(o) {
  if (!o.stream) return null;
  if (!/\/FlateDecode/.test(o.head)) return o.stream;
  try { return zlib.inflateSync(o.stream); } catch (e) {
    try { return zlib.inflateRawSync(o.stream.slice(2)); } catch (e2) { return null; }
  }
}

function expand(obj) {
  Object.keys(obj).forEach((id) => {
    const o = obj[id];
    if (!/\/Type\s*\/ObjStm/.test(o.head)) return;
    const d = inflate(o); if (!d) return;
    const n = +(/\/N\s+(\d+)/.exec(o.head) || [])[1] || 0;
    const first = +(/\/First\s+(\d+)/.exec(o.head) || [])[1] || 0;
    const s = d.toString('latin1');
    const nums = s.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i++) {
      const oid = nums[i * 2], off = nums[i * 2 + 1];
      if (oid == null || obj[oid]) continue;
      const nxt = (i + 1 < n) ? nums[i * 2 + 3] : (s.length - first);
      obj[oid] = { head: s.slice(first + off, first + nxt), stream: null };
    }
  });
  return obj;
}

function pdfStr(raw, hex) {
  if (hex) {
    const h = raw.replace(/[^0-9a-f]/gi, '');
    let t = '';
    for (let i = 0; i + 1 < h.length; i += 2) t += String.fromCharCode(parseInt(h.substr(i, 2), 16));
    return t;
  }
  return raw.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, c) =>
    ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' })[c] || (/^[0-7]+$/.test(c) ? String.fromCharCode(parseInt(c, 8)) : c));
}

function pageText(content) {
  const s = content.toString('latin1');
  let out = '';
  const re = /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]*>|\bTJ\b|\bTj\b|\bT\*\b|\bTd\b|\bTD\b|\bET\b|'|"/g;
  let m, pend = [];
  while ((m = re.exec(s)) !== null) {
    const t = m[0];
    if (t[0] === '(') pend.push(pdfStr(t.slice(1, -1), false));
    else if (t[0] === '<') pend.push(pdfStr(t.slice(1, -1), true));
    else if (t === 'TJ' || t === 'Tj' || t === "'" || t === '"') { out += pend.join(''); pend = []; if (t !== 'Tj') out += '\n'; }
    else if (t === 'T*' || t === 'Td' || t === 'TD' || t === 'ET') { out += pend.join(''); pend = []; if (out && !/\n$/.test(out)) out += '\n'; }
  }
  return out + pend.join('');
}

function pdf(path, pages) {
  const buf = fs.readFileSync(path);
  if (buf.slice(0, 5).toString('latin1') !== '%PDF-') throw new Error('no parece un PDF');
  const obj = expand(objects(buf));
  const ids = Object.keys(obj).map(Number).sort((x, y) => x - y)
    .filter((id) => /\/Type\s*\/Page[^s]/.test(obj[id].head));
  if (!ids.length) throw new Error('sin páginas legibles (¿cifrado?)');

  let a = 1, b = ids.length;
  if (pages) {
    const p = String(pages).split('-').map((x) => parseInt(x, 10));
    a = Math.max(1, p[0] || 1); b = Math.min(ids.length, p.length > 1 ? (p[1] || ids.length) : a);
  }
  const out = ['pdf ' + path + ' · ' + ids.length + ' páginas · mostrando ' + a + '-' + b];
  for (let i = a - 1; i < b; i++) {
    const head = obj[ids[i]].head;
    const refs = (head.match(/\/Contents\s*(?:\[([^\]]*)\]|(\d+)\s+\d+\s+R)/) || []);
    const list = (refs[1] || refs[2] || '').match(/\d+(?=\s+\d+\s+R)/g) || (refs[2] ? [refs[2]] : []);
    let txt = '';
    list.forEach((r) => { const d = obj[+r] && inflate(obj[+r]); if (d) txt += pageText(d); });
    txt = txt.replace(/[ \t]+\n/g, '\n').replace(/ {4,}/g, '   ').replace(/\n{3,}/g, '\n\n').trim();
    out.push('\n─── página ' + (i + 1) + ' ───\n' + (txt || '(sin texto extraíble · probablemente escaneada)'));
  }
  return cut(out.join('\n'));
}

module.exports = { notebook, pdf };
