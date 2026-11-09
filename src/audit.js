'use strict';
const N = 500, ring = [], subs = new Set();
let seq = 0;
const head = (v, n) => { const s = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v); return s.length > n ? s.slice(0, n) + '…' : s; };
function add(e) {
  e.n = ++seq; e.t = Date.now();
  ring.push(e);
  if (ring.length > N) ring.shift();
  for (const wc of subs) if (wc.isDestroyed()) subs.delete(wc); else wc.send('panel:entry', e);
  return e;
}
function wrap(name, f) {
  const v = name.replace(/^codex:/, '');
  return async function (e) {
    const a = arguments[1], t0 = Date.now();
    let r, x;
    try { r = await f.apply(null, arguments); } catch (y) { x = y; }
    const bad = !!x || !!r && (r.ok === false || !!r.held || !!r.exit_code);
    add({ k: 'tool', v: v, a: head(a && typeof a === 'object' ? a.command || a.path || a : a, 300), ok: !bad, ms: Date.now() - t0,
      o: head(x ? String(x && x.message || x) : r && (r.outputText != null ? r.outputText : r.held ? 'denied: ' + (r.reason || '') : r.e || r.error || r), 600) });
    if (x) throw x;
    return r;
  };
}
const log = (level, msg, src) => add({ k: 'log', l: level, a: head(msg, 600), s: src || '' });
function watch(wc) { subs.add(wc); return ring.slice(); }
module.exports = { wrap: wrap, log: log, watch: watch, N: N };
