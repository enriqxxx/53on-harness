'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const { execFileSync, spawn } = require('child_process');
const up = require('./update');

const TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
const VER_DIR = /^\d+(\.\d+)*$/;
const ID = /^53on-[a-z0-9]+(-[a-z0-9]+)*$/;
const T = { probation: 120000, probe: 60000, prerm: 30000 };   // ms: a new version that crash-loops this soon goes back · a probe's time · a prerm's (a test shortens them)
const Q = {};
const one = (id, f) => (Q[id] = (Q[id] || Promise.resolve()).catch(() => {}).then(f));
const valid = (id) => typeof id === 'string' && id.length <= 64 && ID.test(id);
const inside = (base, p) => { const r = path.relative(base, path.resolve(p)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
const nap = (ms) => new Promise((z) => setTimeout(z, ms));

function root() { return path.join(app.getPath('userData'), 'complements'); }
function home(id) { return path.join(root(), id); }
function markFile(id) { return path.join(home(id), 'installed.json'); }
function log(m) { try { fs.appendFileSync(path.join(app.getPath('userData'), 'packs.log'), new Date().toISOString() + ' ' + m + '\n'); } catch (_) {} }
const CODE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*(:-?\d+(\.\d+)*)?$/;
function code(x, ctx) {
  const m = String((x && x.message) || x || ''), ok = !m || CODE.test(m);
  if (ctx || !ok) log((ctx || 'internal') + ' ' + m);
  return ok ? m : 'internal';
}
function writeJson(f, o) { const t = f + '.' + process.pid + '.tmp'; fs.writeFileSync(t, JSON.stringify(o)); fs.renameSync(t, f); }
async function retry(f) {
  for (let i = 0; ; i++) { try { return f(); } catch (e) { if (!/^(EPERM|EBUSY|EACCES)$/.test(e.code) || i >= 100) throw e; await nap(100); } }
}

function state(id) {
  if (!valid(id)) return null;
  try {
    const s = JSON.parse(fs.readFileSync(markFile(id), 'utf8'));
    return s && s.dir && inside(home(id), s.dir) && fs.existsSync(s.dir) ? s : null;
  } catch (_) { return null; }
}
function installed() { try { return fs.readdirSync(root()).filter((id) => !!state(id)); } catch (_) { return []; } }

async function find(id, force) {
  const rows = await up.rows(force);
  const r = rows.find((x) => x && x.id === id);
  if (!r) return { row: null, why: 'not_in_catalog' };
  if (r.os && r.os.indexOf('pc') < 0) return { row: null, why: 'not_for_pc' };
  return { row: r, why: '' };
}

const str = (x) => typeof x === 'string';   // a ficha's field is its own type, never coerced into one
function needs(q) {
  if (!Array.isArray(q) || !q.length) return 'requires_bad';
  for (const x of q) {
    const m = str(x) && /^53on>=(\d+\.\d+(\.\d+)*)$/.exec(x);
    if (!m) return 'requires_bad';
    if (up.newer(m[1], app.getVersion())) return 'needs_53on:' + m[1];
  }
  return '';
}
function spec(dir, row) {
  let c = null;
  try { c = JSON.parse(fs.readFileSync(path.join(dir, 'control.json'), 'utf8')); } catch (_) {}
  if (!c || typeof c !== 'object') throw new Error('control_bad');
  if (row && (c.id !== row.id || c.ver !== String(row.ver))) throw new Error('control_mismatch');
  if (c.runtime !== 'app' || !Array.isArray(c.os) || c.os.indexOf('pc') < 0) throw new Error('not_for_pc');
  if (!['line', 'http', 'once', 'plug'].includes(c.kind)) throw new Error('kind_bad');
  if (c.kind === 'plug' && !(valid(c.plug) && c.plug !== c.id)) throw new Error('plug_bad');   // a plug names the host it plugs into
  const main = str(c.main) ? c.main : '', file = path.resolve(dir, main);
  if (!/^[A-Za-z0-9_][A-Za-z0-9_./-]*\.js$/.test(main) || main.split('/').indexOf('..') >= 0 || !inside(dir, file)) throw new Error('main_bad');
  let st = null;
  try { st = fs.lstatSync(file); } catch (_) {}
  if (!st || !st.isFile()) throw new Error('main_missing');
  const port = c.kind === 'http' ? c.port : 0;
  if (c.kind === 'http' && (!Number.isInteger(port) || port < 7500 || port > 7599)) throw new Error('port_range');
  const probe = c.probe === undefined ? [] : c.probe;
  if (!Array.isArray(probe) || probe.length > 4 || !probe.every((a) => str(a) && /^--[a-z][a-z0-9-]{0,31}$/.test(a))) throw new Error('probe_bad');
  if (c.engine !== undefined && c.engine !== 'memory.core.js') throw new Error('engine_bad');
  if (c.page !== undefined && (c.page !== 'memory' || c.kind !== 'line')) throw new Error('page_bad');   // a line complement may ask this view's MemoriaBios
  if (c.open !== undefined && !(str(c.open) && /^\/\?gp=[a-z0-9_]{1,40}$/.test(c.open))) throw new Error('open_bad');   // its own 53on.com page, opened apart
  if (c.conf !== undefined && !(str(c.conf) && c.kind === 'http' && /^\/[a-z0-9_/-]{0,40}$/.test(c.conf))) throw new Error('conf_bad');   // its settings page, on its own port
  const tab = c.tab === undefined ? null : c.tab;
  if (tab !== null && !(tab && typeof tab === 'object' && c.kind === 'http' && str(tab.name) && /^[A-Za-z0-9 ]{1,16}$/.test(tab.name) && str(tab.path) && /^\/[a-z0-9_/-]{0,40}$/.test(tab.path))) throw new Error('tab_bad');
  const w = c.with === undefined ? [] : c.with;   // Debian's Recommends: what its first install brings along
  if (!Array.isArray(w) || w.length > 4 || !w.every((x) => valid(x) && x !== c.id)) throw new Error('with_bad');
  const bin = c.bin === undefined ? {} : c.bin;
  if (!bin || typeof bin !== 'object' || Array.isArray(bin) || Object.keys(bin).length > 16 || !Object.entries(bin).every(([n, a]) =>
    /^[a-z][a-z0-9-]{0,23}$/.test(n) && n !== '53on' && Array.isArray(a) && a.length >= 1 && a.length <= 4 && a.every(str)
    && /^[A-Za-z0-9_][A-Za-z0-9_./-]*\.(sh|js)$/.test(a[0]) && a[0].split('/').indexOf('..') < 0 && inside(dir, path.resolve(dir, a[0]))
    && fs.existsSync(path.resolve(dir, a[0])) && a.slice(1).every((x) => /^[a-z0-9-]{1,24}$/.test(x)))) throw new Error('bin_bad');
  const prerm = c.prerm === undefined ? null : c.prerm;
  if (prerm !== null && !(Array.isArray(prerm) && prerm.length >= 1 && prerm.length <= 4 && prerm.every(str) && /^[A-Za-z0-9_][A-Za-z0-9_./-]*\.js$/.test(prerm[0])
    && prerm[0].split('/').indexOf('..') < 0 && inside(dir, path.resolve(dir, prerm[0])) && fs.existsSync(path.resolve(dir, prerm[0])) && prerm.slice(1).every((x) => /^[a-z0-9-]{1,24}$/.test(x)))) throw new Error('prerm_bad');
  const why = needs(c.requires);
  if (why) throw new Error(why);
  return { id: c.id, ver: String(c.ver), dir: dir, kind: c.kind, main: file, port: port, probe: probe, engine: c.engine || '', page: c.page || '', open: c.open || '', conf: c.conf || '', tab: tab, plug: c.kind === 'plug' ? c.plug : '', with: w, bin: bin, prerm: prerm, ttl: String(c.ttl || c.id) };
}
function plugsOf(id) { return installed().filter((x) => !state(x).off).map(specOf).filter((p) => p && p.kind === 'plug' && p.plug === id).map((p) => p.main).join(';'); }   // a plug switched off rides no more
function specOf(id) { const s = state(id); try { return s ? spec(s.dir) : null; } catch (_) { return null; } }

function child(sp, args, pre) {
  return new Promise((resolve) => {
    const bodyd = require('./bodyd'), o = bodyd.sink(sp.id);
    let p;
    try { p = spawn(process.execPath, [pre || sp.main].concat(args), { cwd: sp.dir, env: Object.assign(bodyd.env(sp.id, home(sp.id), sp.port), pre ? { COMPLEMENT_REASON: 'remove' } : {}), windowsHide: true, stdio: ['ignore', pre ? o : 'ignore', o] }); }
    finally { if (typeof o === 'number') try { fs.closeSync(o); } catch (_) {} }   // the child holds its own
    const t = setTimeout(() => { try { p.kill(); } catch (_) {} }, pre ? T.prerm : T.probe);
    const end = (c) => { clearTimeout(t); bodyd.log(sp.id, (pre ? 'prerm' : args[0]) + ' exit=' + c); resolve(c); };
    p.once('error', () => end(-1));
    p.once('exit', end);
  });
}

async function installNow(id, onStep) {
  if (!valid(id)) throw new Error('id_bad');
  const step = (s, d) => { try { if (onStep) onStep(Object.assign({ id: id, state: s }, d || {})); } catch (_) {} };
  const cur = state(id);
  const f = await find(id, true), r = f.row;   // installing demands a fresh catalog: the sha and the signature rule
  if (!r) throw new Error(f.why);
  if (cur && String(r.ver) === String(cur.failed || '')) throw new Error('failed_version');   // whoever asks: a fix is a higher version
  if (!up.trusted(r.url)) throw new Error('host');
  if (!up.signed(r, id)) throw new Error('sig_bad');
  const sha = String(r.sha || '').toLowerCase();
  if (cur && !up.newer(r.ver, cur.ver)) {
    if (sha !== cur.sha) log('row ignored ' + id + ' ' + r.ver + ' (installed ' + cur.ver + ')');
    step('ready', { ver: cur.ver });
    return { ok: true, id: id, ver: cur.ver, dir: cur.dir, already: true };
  }
  const ext = (r.url.match(/\.(tar|tar\.gz|tgz|zip)$/i) || [, 'tar'])[1];
  const tmp = path.join(app.getPath('temp'), id + '-' + r.ver + '-' + crypto.randomBytes(4).toString('hex') + '.' + ext);
  const dir = path.join(home(id), String(r.ver)), part = dir + '.part';
  let sp;
  try {
    step('downloading', { pct: 0, ver: r.ver, sz: r.sz });
    await up.grab(r, tmp, (p) => step('downloading', { pct: p, ver: r.ver }));
    step('unpacking', { ver: r.ver });
    fs.rmSync(part, { recursive: true, force: true });
    fs.mkdirSync(part, { recursive: true });
    execFileSync(TAR, ['-xf', tmp, '-C', part], { windowsHide: true, timeout: 180000 });
    sp = spec(part, r);
    for (const o of installed()) if (o !== id && sp.port) { const s2 = specOf(o); if (s2 && s2.port === sp.port) throw new Error('port_owned:' + sp.port); }
    await retry(() => { fs.rmSync(dir, { recursive: true, force: true }); fs.renameSync(part, dir); });
  } catch (e) { throw new Error(code(e, 'install ' + id + ' ' + r.ver)); }   // the page reads the code, the log the detail
  finally {
    try { fs.rmSync(part, { recursive: true, force: true }); } catch (_) {}
    try { fs.unlinkSync(tmp); } catch (_) {}
    if (!cur) try { fs.rmdirSync(home(id)); } catch (_) {}   // a refused first install leaves no empty house (one with data/ stays)
  }
  const prev = cur ? { prev: cur.dir, prevVer: cur.ver, prevSha: cur.sha } : { prev: null, prevVer: null, prevSha: null };
  writeJson(markFile(id), Object.assign({ id: id, ver: r.ver, sha: sha, dir: dir }, prev, { at: new Date().toISOString() }));
  step('ready', { ver: r.ver });
  log('installed ' + id + ' ' + r.ver);
  return Object.assign({ ok: true, id: id, ver: r.ver, sha: sha, dir: dir }, prev);
}

const last = {};   // id -> why its last start failed
async function startNow(id, why) {
  const s = state(id);
  if (!s) return { ok: false, error: 'not_installed' };
  if (s.off) { delete s.off; writeJson(markFile(id), s); log('on ' + id); }   // the owner turned it on (D6): the boot and the beat run it again
  const bodyd = require('./bodyd'), membio = require('./membio');
  const no = async (r) => { await bodyd.halt(id); last[id] = r.error; return r; };   // failed before its launch
  let sp;
  try { sp = spec(s.dir); } catch (e) { return no({ ok: false, invalid: true, error: code(e) }); }
  if (sp.kind === 'plug') return bodyd.info(sp.plug).running ? start(sp.plug, why) : { ok: true };   // never alone: its host comes back carrying it
  const cfg = { dir: s.dir, entry: sp.main, kind: sp.kind, port: sp.port, home: home(id), reason: why || 'start', page: sp.page, plugs: plugsOf(id) };
  const m = sp.engine ? await membio.refresh(id) : null;
  if (sp.probe.length) {   // proven in isolation before it replaces anything that runs
    let p = await child(sp, sp.probe);
    if (p === null) p = await child(sp, sp.probe);   // its time ran out (a PC that slept?): once more, then it counts
    if (bodyd.excuse[p]) return no({ ok: false, exited: p, error: (p === 3 && m && m.error) || bodyd.excuse[p] });
    if (p !== 0) return no({ ok: false, error: 'probe_failed' });
  }
  let r = await bodyd.run(id, cfg);   // one that fails leaves nothing running (bodyd)
  if (r.exited === 3 && sp.engine) {   // no engine yet: fetch one, try once more, else say why
    const m2 = await membio.refresh(id);
    if (m2.changed) r = await bodyd.run(id, cfg); else r.error = m2.error || (m && m.error) || r.error;
  }
  if (r.ok) delete last[id]; else last[id] = r.error;
  return r;
}

function prune(id) {
  const s = state(id);
  if (!s) return;
  const keep = [s.dir, s.prev].filter(Boolean).map((d) => path.resolve(d));
  try {
    for (const e of fs.readdirSync(home(id), { withFileTypes: true }))
      if (e.isDirectory() && VER_DIR.test(e.name) && !keep.includes(path.resolve(home(id), e.name))) fs.rmSync(path.join(home(id), e.name), { recursive: true, force: true });
  } catch (_) {}
}

async function rollback(id, r, why) {
  if (!r.prev || !fs.existsSync(r.prev)) return false;
  writeJson(markFile(id), { id: id, ver: r.prevVer, sha: r.prevSha, dir: r.prev, prev: null, prevVer: null, prevSha: null, at: new Date().toISOString(), failed: r.ver });
  const back = await startNow(id);
  if (back.ok) {
    try { fs.rmSync(r.dir, { recursive: true, force: true }); } catch (_) {}
    log('update ' + id + ' ' + r.ver + ' failed (' + why + '): back to ' + r.prevVer);
    return true;
  }
  writeJson(markFile(id), { id: id, ver: r.ver, sha: r.sha, dir: r.dir, prev: r.prev, prevVer: r.prevVer, prevSha: r.prevSha, at: new Date().toISOString() });
  last[id] = why;
  log('update ' + id + ' ' + r.ver + ': neither version starts (' + why + ' / ' + back.error + ')');
  return false;
}

async function updateNow(id, onStep) {
  const r = await installNow(id, onStep);
  if (r.already) { if (!require('./bodyd').info(id).running) r.started = await startNow(id); return r; }
  const s = await startNow(id, 'install');
  r.started = s;
  if (!s.ok && !s.busy && !require('./bodyd').excuse[s.exited] && await rollback(id, r, s.error)) throw new Error('start_failed:' + r.ver);
  if (!s.ok) log('update ' + id + ' ' + r.ver + ' installed, not running: ' + s.error);
  prune(id);
  if (s.ok && r.prev) setTimeout(() => one(id, async () => {
    const i = require('./bodyd').info(id), now = state(id);
    if (now && now.ver === r.ver && i.restarts >= 2) { await require('./bodyd').halt(id); await rollback(id, r, 'crash_loop:' + i.restarts); }
  }), T.probation).unref();
  return r;
}

async function stopNow(id) {
  const s = state(id);
  if (!s) return { ok: false, error: 'not_installed' };
  await require('./bodyd').halt(id);
  delete last[id];
  writeJson(markFile(id), Object.assign(s, { off: true }));
  log('off ' + id);
  const host = (specOf(id) || {}).plug;
  if (host && require('./bodyd').info(host).running) await start(host, 'unplug');   // its host comes back without it
  return { ok: true };
}

async function restartNow(id) {
  const s = state(id);
  if (!s) return { ok: false, error: 'not_installed' };
  if (s.off) return { ok: false, error: 'off' };
  const sp = specOf(id);
  return sp && sp.kind === 'plug' ? restart(sp.plug) : startNow(id, 'restart');
}

async function removeNow(id) {
  if (!state(id)) return { ok: false, error: 'not_installed' };
  try { await require('./bodyd').halt(id); } catch (_) {}
  delete last[id];
  const sp = specOf(id) || {}, host = sp.plug;
  const pc = sp.prerm ? await child(sp, sp.prerm.slice(1), path.resolve(sp.dir, sp.prerm[0])) : 0;
  try {
    for (const e of fs.readdirSync(home(id), { withFileTypes: true })) if (e.name !== 'data') await retry(() => fs.rmSync(path.join(home(id), e.name), { recursive: true, force: true }));
    if (host && require('./bodyd').info(host).running) await start(host, 'unplug');   // the host comes back without it
    return pc === 0 ? { ok: true } : { ok: true, prerm: 'prerm_failed:' + (pc === null ? 'timeout' : pc) };
  } catch (e) { return { ok: false, error: code(e, 'remove ' + id) }; }
}

function tabs() {
  const bodyd = require('./bodyd');
  return installed().map((id) => { const s = state(id), sp = specOf(id); return sp && sp.tab && sp.port ? { id: id, name: sp.tab.name, url: 'http://127.0.0.1:' + sp.port + sp.tab.path, on: !s.off && bodyd.info(id).running } : null; }).filter(Boolean);
}

function list() {
  const bodyd = require('./bodyd');
  return installed().map((id) => {
    const s = state(id), sp = specOf(id), i = bodyd.info(id);
    return { id: id, ver: s.ver, ttl: sp ? sp.ttl : id, kind: sp ? sp.kind : '', running: i.running, error: last[id] || i.error || '', note: i.note || '', failed: s.failed || '', open: !!(sp && sp.open), conf: (sp && sp.conf) || '', port: (sp && sp.port) || 0, off: !!s.off };
  });
}

async function recommend(r) {
  if (!r || r.already || r.prevVer) return r;
  const out = [];
  for (const w of (specOf(r.id) || {}).with || []) {
    if (state(w)) continue;
    try { const x = await update(w); out.push({ pack: w, ver: x.ver }); } catch (e) { out.push({ pack: w, error: code(e, 'with ' + r.id + ' ' + w) }); }
  }
  if (out.length) r.with = out;
  return r;
}

const bin = (p) => p.finally(() => { try { require('./cli').sync(); } catch (_) {} });
const install = (id, onStep) => bin(one(id, () => installNow(id, onStep)));
const update = (id, onStep) => bin(one(id, () => updateNow(id, onStep))).then(recommend);
const going = {};   // id -> its start, queued or running
function start(id, why) {
  const p = one(id, () => startNow(id, why)).finally(() => { if (going[id] === p) delete going[id]; });
  return (going[id] = p);
}
const ensure = (id, why) => going[id] || start(id, why);
const stop = (id) => one(id, () => stopNow(id));
const restart = (id) => one(id, () => restartNow(id));
const remove = (id) => bin(one(id, () => removeNow(id)));

const refused = {};   // id -> 'ver sha'
async function tick() {
  for (const id of installed()) {
    require('./bodyd').trim(id);   // a long run's diary too
    const cur = state(id);
    if (cur.off) continue;   // switched off by the owner: no update, no revive
    try {
      const f = await find(id), key = f.row && f.row.ver + ' ' + f.row.sha;
      if (f.row && up.newer(f.row.ver, cur.ver) && String(f.row.ver) !== String(cur.failed || '') && refused[id] !== key) {   // only newer; never the failed one (install refuses it too)
        try { await update(id); } catch (e) { if (/^(needs_53on|requires_bad)/.test(e.message)) refused[id] = key; throw e; }
      } else if (specOf(id) && specOf(id).engine) await require('./membio').refresh(id, null, null, true);
    } catch (e) { log('tick ' + id + ' ' + e.message); }
    try { const sp = specOf(id); if (sp && sp.kind !== 'once' && sp.kind !== 'plug' && !require('./bodyd').info(id).running) await ensure(id); } catch (e) { log('tick start ' + id + ' ' + e.message); }   // installed means running; a job runs at boot, install and Start only
  }
}

const DEFAULTS = ['53on-body'];

async function ensureAll() {
  for (const id of DEFAULTS) if (!fs.existsSync(home(id))) await update(id).catch((e) => code(e, 'default ' + id));
  for (const id of installed()) {
    if (require('./bodyd').info(id).running || (state(id) || {}).off || (specOf(id) || {}).kind === 'plug') continue;   // a host starts with its plugs
    try { const r = await ensure(id, 'boot'); if (!r.ok) log('start ' + id + ' ' + r.error); } catch (e) { log('start ' + id + ' ' + e.message); }
  }
}

module.exports = { install: install, update: update, start: start, stop: stop, restart: restart, remove: remove, list: list, tabs: tabs, state: state, find: find, tick: tick, ensureAll: ensureAll,
  valid: valid, home: home, spec: spec, specOf: specOf, child: child, installed: installed, code: code, writeJson: writeJson, T: T };
