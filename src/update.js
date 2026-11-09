'use strict';
const { app } = require('electron');
const fs = require('fs'), path = require('path'), https = require('https'), crypto = require('crypto'), { pipeline } = require('stream/promises');

const CATALOG = 'https://53on.com/xsite/packages/AssetPacks/Catalog/index.json';
const PACK = '53on-setup';
const HOSTS = ['53on.com', 'vcorpsllc.com'];   // de donde puede venir el catalogo y el blob, redirecciones incluidas
const PUB = Buffer.from('9kh4LAjsjTpWxO02agF37Wd6QwFkWZjy5Snp56E7AbA=', 'base64');
const FIRST_MS = 90e3, EVERY_MS = 36e5, JITTER_MS = 6e5, BUSY_MS = 3e5;
const HOME = path.dirname(path.dirname(process.execPath)), SETUP = path.join(HOME, '53on-setup.exe'), ON = fs.existsSync(SETUP);

let S = null, st = { etag: '', row: null }, busy = false, timer = null;
let catRows = null;

function stateFile() { return path.join(app.getPath('userData'), 'update.json'); }
function load() { try { Object.assign(st, JSON.parse(fs.readFileSync(stateFile(), 'utf8'))); } catch (e) {} }
function save() { try { fs.writeFileSync(stateFile(), JSON.stringify(st)); } catch (e) {} }
function log(m) { try { fs.appendFileSync(path.join(app.getPath('userData'), 'update.log'), new Date().toISOString() + ' ' + m + '\n'); } catch (e) {} }
function push(msg) { try { if (S && S.toolbar) S.toolbar.webContents.send('shell:update', msg); } catch (e) {} }
function newer(a, b) {
  const A = String(a || '').split('.').map(Number), B = String(b || '').split('.').map(Number);
  for (let i = 0; i < Math.max(A.length, B.length); i++) { const d = (A[i] || 0) - (B[i] || 0); if (d) return d > 0; }
  return false;
}
function trusted(u) { try { const x = new URL(u); return x.protocol === 'https:' && HOSTS.includes(x.hostname); } catch (e) { return false; } }
function verify(msg, sig) {
  try {
    const key = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), PUB]), format: 'der', type: 'spki' });
    return crypto.verify(null, msg, key, Buffer.from(String(sig || ''), 'base64'));
  } catch (e) { return false; }
}
function signed(r, id) { return verify(Buffer.from([id || PACK, r.ver, r.sha, r.sz, r.url].join('|')), r.sig); }

function get(url, headers, hops) {
  return new Promise(function (resolve, reject) {
    if (!trusted(url)) return reject(new Error('host'));
    const q = https.get(url, { headers: headers || {} }, function (res) {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && (hops || 0) < 2) {
        res.resume(); return resolve(get(res.headers.location, headers, (hops || 0) + 1));
      }
      resolve(res);
    });
    q.setTimeout(30000, function () { q.destroy(new Error('timeout')); });   // a silent server never freezes the beat
    q.on('error', function (e) { reject(e.message === 'timeout' ? e : net(e)); });
  });
}
function net(e) { log('net ' + e.message); return new Error('net'); }

function offer() {
  const r = st.row;
  if (!r || !newer(r.ver, app.getVersion())) return false;
  if (!signed(r) || !trusted(r.url)) return false;
  push({ state: 'available', ver: r.ver, sz: r.sz });
  return r.ver;
}
async function check(force) {
  try {
    const res = await get(CATALOG, !force && st.etag ? { 'If-None-Match': st.etag } : {});
    if (res.statusCode === 304) { res.resume(); return offer(); }
    if (res.statusCode !== 200) { res.resume(); return null; }
    let body = ''; for await (const c of res) body += c;
    const cat = JSON.parse(body), rows = Array.isArray(cat) ? cat : (cat.p || cat.packs || []);
    catRows = rows;
    const r = rows.find(function (x) { return x && x.id === PACK && (!x.os || x.os.includes('pc')); });
    st.etag = res.headers.etag || '';
    st.row = r ? { ver: r.ver, sha: String(r.sha || '').toLowerCase(), sz: Number(r.sz || 0), url: r.url, sig: r.sig } : null;
    save();
    if (st.row && newer(st.row.ver, app.getVersion()) && !signed(st.row)) log('sig invalid ' + st.row.ver);
    return offer();
  } catch (e) { log('check ' + e.message); return null; }
}
async function beat() {
  try {
    if (ON) await check(); else catRows = null;   // only an installed 53ON updates itself; complements update in every build
    if (await require('./door').isBusy()) { log('beat busy'); return BUSY_MS; }
    await require('./packs').tick();
  } catch (e) { log('beat ' + e.message); }
  return EVERY_MS + (Math.random() * 2 - 1) * JITTER_MS;
}
function arm(ms) { clearTimeout(timer); timer = setTimeout(function () { beat().then(arm); }, ms); }

async function jump(exe, args) {
  const bodyd = require('./bodyd'), ready = path.join(HOME, 'app.new.ready');
  try { fs.unlinkSync(ready); } catch (_) {}
  const p = require('child_process').spawn(exe, args, { cwd: path.dirname(exe), detached: true, stdio: 'ignore' });
  await new Promise(function (ok, no) {
    const t = setInterval(function () { if (fs.existsSync(ready)) { clearInterval(t); ok(); } }, 250);
    p.once('error', function (e) { clearInterval(t); no(e); });
    p.once('exit', function () { clearInterval(t); no(new Error('setup')); });
  });
  p.unref();
  await Promise.race([bodyd.haltAll(), new Promise(function (r) { setTimeout(r, 30000); })]);
  await bodyd.cutAll();
  app.exit(0);
}

async function grab(r, file, onPct) {
  const res = await get(r.url);
  if (res.statusCode !== 200) { res.resume(); throw new Error('http_' + res.statusCode); }
  const total = Number(res.headers['content-length'] || r.sz), hash = crypto.createHash('sha256'), out = fs.createWriteStream(file);
  let got = 0, last = -1, cut = false;
  res.on('data', function (c) {
    hash.update(c); got += c.length;
    const p = total ? Math.floor(got * 100 / total) : 0;
    if (p !== last && p % 2 === 0) { last = p; if (onPct) try { onPct(p); } catch (_) {} }
  }).once('error', function () { cut = !out.errored; });   // the line failed, not the file
  try { await pipeline(res, out); } catch (e) { throw cut ? net(e) : e; }
  if (hash.digest('hex') !== String(r.sha || '').toLowerCase() || got !== Number(r.sz)) throw new Error('sha_mismatch');
  return file;
}

async function rows(force) {
  if (!force && catRows) return catRows;
  const res = await get(CATALOG, {});
  if (res.statusCode !== 200) { res.resume(); throw new Error('http_' + res.statusCode); }
  let body = ''; for await (const c of res) body += c;
  const cat = JSON.parse(body);
  catRows = Array.isArray(cat) ? cat : (cat.p || cat.packs || []);
  return catRows;
}

async function download() {
  if (busy) return;
  busy = true;
  const file = SETUP + '.part';
  try {
    if (!(await check(true))) throw new Error('no_update');   // catalogo fresco: nunca se baja contra un sha viejo
    const r = st.row;
    await grab(r, file, function (p) { push({ state: 'downloading', pct: p }); });
    fs.renameSync(file, SETUP);   // verified: the home's setup is always the newest, for this /update and a later /uninstall
    log('update ' + r.ver);
    push({ state: 'restarting' });
    await jump(SETUP, ['/S', '/update', '/pid=' + process.pid]);   // hidden, inside 53ON's own feel; it waits for this exit
  } catch (e) {
    try { fs.unlinkSync(file); } catch (_) {}
    log('download ' + e.message);
    push({ state: 'error', e: String(e && e.message || e) });
    busy = false;
  }
}

function start(shell) {
  S = shell; if (!app.isPackaged) return;
  if (ON && fs.existsSync(path.join(HOME, 'app.new.ready'))) log('update stuck: something kept app open');   // the setup gave up and reopened this one
  load(); arm(FIRST_MS);
}

module.exports = { on: ON && app.isPackaged, start: start, check: check, download: download, newer: newer,
  rows: rows, grab: grab, signed: signed, verify: verify, trusted: trusted, get: get, beat: beat };
