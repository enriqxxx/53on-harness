'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const up = require('./update');

const FILES = ['lang/en.js', 'lang/es.js', 'memory.core.js', 'memory.node.js'];   // sorted: the only files an engine has
const json = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; } };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
function log(m) { try { fs.appendFileSync(path.join(app.getPath('userData'), 'packs.log'), new Date().toISOString() + ' engine ' + m + '\n'); } catch (_) {} }

const shape = (e) => !!e && /^\d+(\.\d+){1,3}$/.test(e.v) && Number.isInteger(e.n) && e.n > 0 && !!e.f &&
  Object.keys(e.f).sort().join() === FILES.join() && FILES.every((k) => /^[0-9a-f]{64}$/.test(e.f[k]));
const signedEngine = (e) => shape(e) && up.verify(Buffer.from(JSON.stringify(['53on-engine', e.v, e.n, FILES.map((k) => [k, e.f[k]])])), e.sig);
const intact = (e, d) => { try { return !!d && FILES.every((k) => sha(fs.readFileSync(path.join(d, k))) === e.f[k]); } catch (_) { return false; } };

let seen = null, heard = null;   // seen: the last engine script the view loaded and we used {base, v}; heard: its base, used or not
const busy = {};   // id -> the refresh in flight

async function fetch(url) {
  const res = await up.get(url);
  if (res.statusCode !== 200) { res.resume(); log(res.statusCode + ' ' + url); throw new Error('http_' + res.statusCode); }
  const c = []; let n = 0;
  for await (const d of res) { n += d.length; if (n > 2097152) { log('too big ' + url); throw new Error('too_big'); } c.push(d); }
  return Buffer.concat(c);
}
async function file(base, e, k) {
  const u = base + 'engine/' + e.v + '-' + e.n + '/' + k;
  let b = null;
  try { b = await fetch(u); } catch (_) {}
  if (!b || sha(b) !== e.f[k]) b = await fetch(u + '?t=' + Date.now());
  if (sha(b) !== e.f[k]) { log('sha ' + k); throw new Error('sha_mismatch'); }
  return b;
}
async function retry(f) {
  for (let i = 0; ; i++) { try { return f(); } catch (e) { if (!/^(EPERM|EBUSY|EACCES)$/.test(e.code) || i >= 100) throw e; await new Promise((r) => setTimeout(r, 100)); } }
}

async function run(id, base, viewV) {
  const packs = require('./packs'), s = packs.state(id), sp = packs.specOf(id);
  if (!s || !sp || !sp.engine) return { ok: false, error: 'no_engine_declared' };
  const home = packs.home(id), ptrFile = path.join(home, 'engine.json'), ptr = json(ptrFile) || {};
  base = base || (seen && seen.base) || heard || ptr.base;   // heard: an install after the view loaded the engine works at once
  if (!base) return { ok: false, error: 'engine_not_loaded' };
  const b = await fetch(base + 'engine.json?t=' + Date.now());
  let e = null;
  try { e = JSON.parse(b.toString('utf8')); } catch (_) {}
  if (!signedEngine(e)) throw new Error('engine_sig');
  if (viewV && viewV !== e.v) log('view ' + viewV + ' · signed engine ' + e.v + '-' + e.n + ' · the live files were deployed without re-signing');
  const live = signedEngine(ptr) && intact(ptr, ptr.dir);
  if (live && ptr.sig === e.sig) return { ok: true, same: true };
  if (live && !(up.newer(e.v, ptr.v) || (e.v === ptr.v && e.n > ptr.n))) { log('older engine refused: ' + e.v + '-' + e.n + ' < ' + ptr.v + '-' + ptr.n); return { ok: true, same: true }; }
  const dir = path.join(home, 'engine', e.v + '-' + e.n), part = dir + '.part';
  fs.rmSync(part, { recursive: true, force: true });
  fs.mkdirSync(path.join(part, 'lang'), { recursive: true });
  for (const k of FILES) fs.writeFileSync(path.join(part, k), await file(base, e, k));
  fs.writeFileSync(path.join(part, 'engine.json'), JSON.stringify(e));
  if (await packs.child(sp, ['--selftest', part]) !== 0) { fs.rmSync(part, { recursive: true, force: true }); throw new Error('engine_selftest'); }   // why: <id>.log
  await retry(() => { fs.rmSync(dir, { recursive: true, force: true }); fs.renameSync(part, dir); });
  const prev = live && path.resolve(ptr.dir) !== path.resolve(dir) ? ptr.dir : (ptr.prev && fs.existsSync(ptr.prev) ? ptr.prev : null);
  const tmp = ptrFile + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(Object.assign({}, e, { dir: dir, base: base, prev: prev })));
  fs.renameSync(tmp, ptrFile);
  try {   // keep the current and the previous engine
    const keep = [dir, prev].filter(Boolean).map((d) => path.resolve(d));
    for (const n of fs.readdirSync(path.join(home, 'engine'))) if (!keep.includes(path.resolve(home, 'engine', n))) fs.rmSync(path.join(home, 'engine', n), { recursive: true, force: true });
  } catch (_) {}
  log(id + ' ' + e.v + '-' + e.n + ' ready');
  return { ok: true, v: e.v, n: e.n, changed: true };
}

function refresh(id, base, v, restart) {
  if (!busy[id]) busy[id] = run(id, base, v).then((r) => { if (r.ok && base) seen = { base: base, v: v }; return r; })
    .catch((e) => ({ ok: false, error: require('./packs').code(e, 'engine ' + id) })).finally(() => { busy[id] = null; });
  if (!restart) return busy[id];
  return busy[id].then(async (r) => { if (r.changed) { const s = await require('./packs').start(id); if (!s.ok) log(id + ' ' + s.error); } return r; });
}

function watch(ses) {
  ses.webRequest.onCompleted({ urls: ['https://53on.com/*memory.core.js*'] }, (d) => {
    if (d.resourceType !== 'script' || !(d.statusCode >= 200 && d.statusCode < 400)) return;
    const m = /^(https:\/\/53on\.com\/xsite\/packages\/[A-Za-z0-9_-]+\/Assets\/)memory\.core\.js\?v=([\d.]+)$/.exec(d.url);
    if (!m) return;
    heard = m[1];
    if (seen && seen.base === m[1] && seen.v === m[2]) return;
    const packs = require('./packs');
    for (const id of packs.installed()) { const sp = packs.specOf(id); if (sp && sp.engine) refresh(id, m[1], m[2], true); }
  });
}

module.exports = { watch: watch, refresh: refresh };
