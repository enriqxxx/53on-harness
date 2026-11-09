const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const W = require('worker_threads');

const MAX_MS = 30000, MAX = 10000;
const BASE = ['--no-config', '--no-messages'];
const VCS = ['.git', '.svn', '.hg', '.bzr', '.jj', '.sl'].flatMap((d) => ['-g', '!' + d]);
const fwd = (p) => p.split(path.sep).join('/');
const bad = (e) => ({ ok: false, e: String(e.message || e) });
const on = (v) => v === true || v === 'true' || v === 1 || v === '1';
const STOP = '\n(Stopped at 30 s: narrow the path or pattern.)', OVER = '\n(Stopped at ' + MAX + ' results: narrow the path or pattern.)';
let RG;

const rg = () => RG || (RG = require('@vscode/ripgrep').rgPath.replace(/app\.asar(?=[\\/])/, 'app.asar.unpacked'));

function pick(g, typed) {
  g = fwd(String(g || '*'));
  const s = g.replace(/^\.?\//, ''), t = s.replace(/^(\*\*\/)+/, ''), n = t.slice(t.lastIndexOf('/') + 1) || '*';
  const at = (t.includes('/') || s !== g && s === t) && s.toLowerCase();
  if (typed) return [[], at || '**/' + t.toLowerCase()];
  return [['--type-add', 'x:' + n.replace(/\[.*?\]|\\.|[a-z]/gi, (c) => c[1] ? c : '[' + c.toLowerCase() + c.toUpperCase() + ']'), '-tx'], at];
}

function run(root, args, glob, each, typed) {
  root = path.resolve(root);
  return fs.promises.stat(root).then((st) => new Promise((done) => {
    const cwd = st.isDirectory() ? root : path.dirname(root), k = glob ? pick(glob, typed) : [[], false];
    let buf = '', err = '', cut = false, stop = false, over = false, busy = 0, q = [], qi = 0;
    const p = spawn(rg(), BASE.concat(k[0], args, root), { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    try { os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) {}   // the search yields the cores to the app
    const t = setTimeout(() => { cut = true; p.kill(); }, MAX_MS);
    const end = () => {
      if (!over || busy || qi < q.length && !stop) return;
      clearTimeout(t);
      done(p.exitCode === 2 && err ? { ok: false, e: err.replace(/^rg: /, '').trim() } : { ok: true, cut });
    };
    const pump = () => {
      while (qi < q.length && !stop && busy < 64) {
        const l = q[qi++].replace(/\r$/, '');
        if (k[1] && !path.matchesGlob(fwd(path.relative(cwd, l.split('\0', 1)[0])).toLowerCase(), k[1])) continue;
        const r = each(l);
        if (r === true) { stop = true; p.kill(); }
        else if (r) { busy++; r.then(() => { busy--; pump(); end(); }); }
      }
      if (qi >= q.length || stop) { q = []; qi = 0; p.stdout.resume(); }
    };
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d) => {
      const lines = (buf + d).split('\n');
      buf = lines.pop();
      p.stdout.pause();
      q = q.slice(qi).concat(lines); qi = 0;
      pump();
    });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { clearTimeout(t); done(bad(e)); });
    p.on('close', () => { over = true; end(); });
  })).catch(bad);
}

function walk(root, pattern) {
  let g = fwd(String(pattern || '*')), n = 0;
  const m = /^\/?([^*?[{/][^*?[{]*\/)/.exec(g), top = [];
  if (m) { root = path.resolve(root, m[1]); g = g.slice(m[0].length - 1); }
  return run(root, ['--files', '--hidden', '--no-ignore'], g, (f) => fs.promises.stat(f).then((s) => {
    let i = top.length; n++;
    while (i && top[i - 1].t > s.mtimeMs) i--;
    if (i < 100) { top.splice(i, 0, { f, t: s.mtimeMs }); if (top.length > 100) top.pop(); }
  }, () => {})).then((r) => r.ok ? { ok: true, hits: top.map((x) => x.f), total: n, cut: r.cut } : r);
}

function grep(root, pattern, o) {
  o = o || {};
  const f = (k) => o['-' + k] ?? o[k];
  const mode = o.output_mode === 'content' || o.output_mode === 'count' ? o.output_mode : 'files_with_matches';
  const lim = o.head_limit == null || o.head_limit === '' ? 250 : Math.max(0, +o.head_limit || 0), off = Math.max(0, +o.offset || 0);
  const a = ['--hidden'].concat(VCS, '--engine', 'auto', '--max-columns', '501', '-e', String(pattern ?? ''));
  if (on(f('i'))) a.push('-i');
  if (o.type) a.push('--type', String(o.type));
  if (on(o.multiline)) a.push('-U', '--multiline-dotall');
  if (mode === 'files_with_matches') a.push('-l');
  else if (mode === 'count') a.push('-c', '-H', '--null');
  else {
    a.push('--null');
    if (!/^(false|0)$/.test(String(f('n')))) a.push('-n');
    for (const [k, v] of [['-A', f('A')], ['-B', f('B')], ['-C', f('C') ?? o.context]]) if (+v > 0) a.push(k, String(+v));
    if (on(f('o'))) a.push('-o');
  }
  const line = mode === 'files_with_matches' ? String
    : mode === 'count' ? (l) => { const i = l.indexOf('\0'); return [l.slice(0, i), +l.slice(i + 1) || 0]; }
    : (l) => { const i = l.indexOf('\0'), r = l.slice(i + 1), s = /^\d+([:-])/.exec(r); return i < 0 ? l : l.slice(0, i) + (s ? s[1] : ':') + r; };
  const out = [], want = mode === 'content' && lim ? Math.min(off + lim + 1, MAX + 1) : MAX + 1;
  return run(root, a, o.glob, (l) => { out.push(line(l)); return out.length >= want; }, !!o.type).then((r) => {
    if (!r.ok) return r;
    const over = out.length > MAX, cut = (r.cut ? STOP : '') + (over ? OVER : '');
    if (over) out.length = MAX;
    if (mode !== 'files_with_matches') return { ok: true, text: say(mode, out, lim, off) + cut };
    return Promise.all(out.map((p) => fs.promises.stat(p).then((s) => s.mtimeMs, () => 0)))
      .then((t) => ({ ok: true, text: say(mode, out.map((p, i) => [p, t[i]]).sort((x, y) => y[1] - x[1]).map((x) => x[0]), lim, off) + cut }));
  });
}

function say(mode, all, lim, off) {
  const page = lim ? all.slice(off, off + lim) : all.slice(off);
  const info = [lim && all.length - off > lim && 'limit: ' + lim, off && 'offset: ' + off].filter(Boolean).join(', ');
  const n = (k, w) => k + ' ' + w + (k === 1 ? '' : 's');
  if (mode === 'files_with_matches') return page.length ? 'Found ' + n(page.length, 'file') + (info ? ' ' + info : '') + '\n' + page.join('\n') : 'No files found';
  if (mode === 'count') {
    const sum = all.reduce((s, x) => s + x[1], 0);
    return (page.map((x) => x[0] + ':' + x[1]).join('\n') || 'No matches found') + '\n\nFound ' + n(sum, 'total occurrence') + ' across ' + n(all.length, 'file') + '.' + (info ? ' with pagination = ' + info : '');
  }
  return page.length ? page.join('\n') + (info ? '\n\n[Showing results with pagination = ' + info + ']' : '') : 'No matches found';
}

function globFiles(root, pattern) {
  return new Promise((ok) => {
    const w = new W.Worker(__filename, { workerData: [root, pattern] });
    w.once('message', ok);
    w.once('error', (e) => ok(bad(e)));
  });
}
if (!W.isMainThread && Array.isArray(W.workerData)) walk(...W.workerData).then((r) => W.parentPort.postMessage(r));

module.exports = { globFiles, grep };
