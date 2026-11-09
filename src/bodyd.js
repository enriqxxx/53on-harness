'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const { app } = require('electron');

const BACKOFF = [1000, 2000, 5000, 15000];
const STUCK_MS = 300000;
const EXCUSE = { 3: 'missing_requisite', 5: 'port_unusable' };   // exits that are not the version's fault
const gone = (c) => EXCUSE[c] || 'exited:' + (c == null ? -1 : c);   // -1: no code (killed, or never ran)
const kids = new Map();   // id -> { child, cfg, restarts, since, stopping, timer, busy, wait, ready, error, note, code }
const Q = {};             // id -> the tail of its queue
const one = (id, f) => (Q[id] = (Q[id] || Promise.resolve()).catch(() => {}).then(f));

function logFile(id) { return path.join(app.getPath('userData'), id + '.log'); }
function log(id, m) { try { fs.appendFileSync(logFile(id), new Date().toISOString() + ' ' + m + '\n'); } catch (_) {} }
function trim(id) {
  try {
    const fd = fs.openSync(logFile(id), 'r+'), n = fs.fstatSync(fd).size;
    try {
      if (n <= 1048576) return;
      const b = Buffer.alloc(262144), r = fs.readSync(fd, b, 0, b.length, n - b.length), i = b.indexOf(10) + 1;
      fs.ftruncateSync(fd, 0); fs.writeSync(fd, b, i, r - i, 0);
    } finally { fs.closeSync(fd); }
  } catch (_) {}
}
function sink(id) { trim(id); try { return fs.openSync(logFile(id), 'a'); } catch (_) { return 'ignore'; } }

function pulse(port, ms) {
  return new Promise((resolve) => {
    const q = http.get({ host: '127.0.0.1', port: port, path: '/pulse', timeout: ms || 1500 }, (r) => { r.resume(); resolve(r.statusCode === 200); });
    q.on('error', () => resolve(false));
    q.on('timeout', () => { q.destroy(); resolve(false); });
  });
}
function held(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port: port });
    const done = (v) => { s.destroy(); resolve(v); };
    s.setTimeout(800, () => done(false));
    s.on('connect', () => done(true));
    s.on('error', () => done(false));
  });
}
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
function env(id, home, port) {
  const data = path.join(home, 'data'), e = Object.assign({}, process.env, { COMPLEMENT_ID: id, COMPLEMENT_HOME: home, COMPLEMENT_DATA: data });
  try { fs.mkdirSync(data, { recursive: true }); } catch (_) {}
  for (const k in e) if (/^port$/i.test(k)) delete e[k];   // a PORT the Arnés itself inherited is no complement's
  if (port) e.PORT = String(port);
  return e;
}

function launch(id) {
  const k = kids.get(id), c0 = k.cfg, line = c0.kind === 'line', once = c0.kind === 'once', out = sink(id), e = env(id, c0.home, c0.kind === 'http' ? c0.port : 0);
  if (once) e.COMPLEMENT_REASON = c0.reason || 'start';
  if (c0.page) e.COMPLEMENT_PAGE = c0.page;
  if (c0.plugs) e.COMPLEMENT_PLUGS = c0.plugs;   // the mains of the complements plugged into this one
  const flags = line ? ['--max-old-space-size=2048', '--expose-gc'] : [], proc = require('./proc'), inside = proc.available();
  const c = inside ? proc.fork(c0.entry, [], { cwd: c0.dir, env: e, execArgv: flags, line: line, piped: line || once, out: out }) : spawn(process.execPath, flags.concat([c0.entry]), {
    cwd: c0.dir, env: e, stdio: [line ? 'pipe' : 'ignore', line || once ? 'pipe' : out, out], windowsHide: true });
  k.child = c; k.since = Date.now(); k.ready = false; k.busy = 0; k.note = '';   // a new process says its own notes
  if (!inside && typeof out === 'number') { try { fs.closeSync(out); } catch (_) {} }   // the child owns it now (proc.fork closes its own)
  c.on('error', (e) => { log(id, 'launch failed: ' + e.message); if (k.child === c) k.child = null; });
  if (line || once) {
    let buf = '';
    if (line) c.stdin.on('error', () => {});
    c.stdout.on('data', (d) => {
      buf += d;
      for (let i; (i = buf.indexOf('\n')) >= 0; buf = buf.slice(i + 1)) {
        const l = buf.slice(0, i).trim();
        if (l === 'ready') { k.ready = true; if (k.onReady) k.onReady(); }
        else if (l.startsWith('b ')) { k.busy = Date.now(); k.wait = false; k.ticks = 0; }
        else if (l === 'w') k.wait = true;
        else if (l === 'e') { k.busy = 0; k.wait = false; }
        else if (l === 'n' || l.startsWith('n ')) k.note = l.slice(2, 202);
        else if (c0.page && l.startsWith('q ')) ask(id, c, l);
      }
    });
  }
  c.on('exit', (code) => {
    if (k.child !== c) return;   // a newer run() owns this id
    log(id, 'exit code=' + code);
    k.child = null; k.ready = false; k.busy = 0; k.code = code;
    if (k.onExit) k.onExit(code);
    if (k.stopping) return;
    if (k.cfg.kind === 'once') { k.error = code === 0 ? '' : gone(code); return; }   // its job is done, or it says why not
    if (EXCUSE[code]) { k.error = EXCUSE[code]; log(id, k.error); return; }
    const w = BACKOFF[Math.min(k.restarts, BACKOFF.length - 1)];
    k.restarts++;
    log(id, 'relaunch in ' + w + 'ms (try ' + k.restarts + ')');
    k.timer = setTimeout(async () => {   // a port someone took meanwhile is theirs: say so, launch nothing
      if (k.stopping) return;
      if (k.cfg.kind === 'http' && await held(k.cfg.port)) { k.error = 'port_taken:' + k.cfg.port; log(id, k.error); return; }
      if (!k.stopping) launch(id);
    }, w);
  });
}

async function runNow(id, o) {
  if (!o.entry || !o.home || !fs.existsSync(o.entry)) return { ok: false, error: 'main_missing' };
  const had = kids.has(id) && !!kids.get(id).child;
  await haltNow(id);
  const kind = o.kind, port = +o.port || 0, cfg = { dir: o.dir, entry: o.entry, kind: kind, port: port, home: o.home, reason: o.reason, page: o.page, plugs: o.plugs };
  if (kind === 'http') {
    if (had) for (let i = 0; i < 10 && await held(port); i++) await nap(300);   // our own child letting go
    if (await held(port)) {   // someone else listens on its port: say so, launch nothing
      const error = 'port_taken:' + port;
      kids.set(id, { cfg: cfg, restarts: 0, error: error });
      log(id, error);
      return { ok: false, busy: true, error: error };
    }
  }
  const k = { cfg: cfg, restarts: 0, since: 0, stopping: false, timer: null, busy: 0, ready: false, error: '', note: '' };
  kids.set(id, k);
  const t0 = Date.now();
  let res;
  if (kind === 'once') { launch(id); return k.child ? { ok: true, pid: k.child.pid, ms: 0 } : { ok: false, error: 'exited:-1' }; }   // nothing waits on a job (a consent prompt may sit there)
  if (kind === 'line') {
    res = await new Promise((resolve) => {
      const t = setTimeout(() => resolve({ ok: false, error: 'no_ready' }), o.waitMs || 20000);
      k.onReady = () => { clearTimeout(t); resolve({ ok: true }); };
      k.onExit = (code) => { clearTimeout(t); resolve({ ok: false, exited: code, error: gone(code) }); };
      launch(id);
    });
  } else {
    launch(id);
    const end = Date.now() + (o.waitMs || 20000);
    let up = false;
    while (!up && Date.now() < end && k.child) { up = await pulse(port); if (!up) await nap(300); }
    if (up) { await nap(2000); up = !!k.child; }   // the answer counts only if OUR child is still alive after it
    res = up ? { ok: true } : k.child ? { ok: false, error: 'no_pulse:' + port } : { ok: false, exited: k.code, error: gone(k.code) };
  }
  k.onReady = null; k.onExit = null;
  if (!res.ok) {
    if (kids.get(id) === k) { await haltNow(id); k.error = res.error; }
    return res;
  }
  log(id, 'alive pid=' + (k.child && k.child.pid));
  return { ok: true, pid: k.child && k.child.pid, port: kind === 'http' ? port : 0, ms: Date.now() - t0 };
}

function kill(c) {
  return new Promise((resolve) => {
    const plain = () => { try { c.kill(); } catch (_) {} resolve(); };
    if (process.platform !== 'win32' || !c.pid) return plain();
    let t;
    try { t = spawn('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch (_) { return plain(); }
    t.on('error', plain);
    t.on('exit', () => resolve());
  });
}

function haltNow(id) {
  const k = kids.get(id);
  if (!k) return Promise.resolve();
  k.stopping = true;
  if (k.timer) { clearTimeout(k.timer); k.timer = null; }
  const c = k.child;
  k.child = null;
  k.dying = c;   // cutAll still finds it while it leaves
  if (!c) return Promise.resolve();
  if (c.exitCode !== null || c.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    let n = 0, idle = 0, cut = null;   // half-second ticks, not the wall clock: a PC that sleeps through a halt is not a stuck child
    const go = () => cut || (cut = kill(c));
    const iv = setInterval(() => {   // the request in flight finishes; a child idle 10 s or past STUCK_MS goes
      n++; idle = k.busy ? 0 : idle + 1;
      if (idle * 500 > (k.cfg.kind === 'line' ? 10000 : 5000) || n * 500 > STUCK_MS) { clearInterval(iv); go().then(resolve); }
    }, 500);
    c.once('exit', () => { clearInterval(iv); (cut || Promise.resolve()).then(resolve); });
    if (k.cfg.kind === 'line') { try { c.stdin.end(); } catch (_) { go(); } }
    else go();
  });
}

function ask(id, c, l) {
  const i = l.indexOf(' ', 2), n = l.slice(2, i);
  let q = null;
  try { q = JSON.parse(l.slice(i + 1)); } catch (_) {}
  Promise.resolve().then(() => { if (!q || !module.exports.page) throw new Error('no_page'); return module.exports.page(id, q); })
    .then((o) => ({ o: o }), (e) => ({ x: String((e && e.message) || e) }))
    .then((r) => { let t; try { t = JSON.stringify(r); } catch (_) { t = '{"x":"unsendable"}'; } try { c.stdin.write('r ' + n + ' ' + t + '\n'); } catch (_) {} });
}

const run = (id, o) => one(id, () => runNow(id, o || {}));
const halt = (id) => one(id, () => haltNow(id));
const haltAll = () => Promise.all([...kids.keys()].map(halt));
const cutAll = () => Promise.all([...kids.values()].map((k) => { const c = k.child || k.dying; return c && c.exitCode === null && c.signalCode === null ? kill(c) : null; }));

function info(id) {
  const k = kids.get(id);
  return { running: !!(k && k.child), pid: k && k.child ? k.child.pid : 0, restarts: k ? k.restarts : 0, since: k ? k.since || 0 : 0,
    busy: k ? k.busy || 0 : 0, port: k && k.cfg && k.cfg.kind === 'http' ? k.cfg.port : 0, error: k && !k.child ? k.error || '' : '', note: k && (k.child || k.cfg.kind === 'once') ? k.note || '' : '' };
}

setInterval(() => {
  for (const [id, k] of kids) {
    if (!k.child || !k.busy || k.wait) { k.ticks = 0; continue; }
    if (++k.ticks * 10000 > STUCK_MS) { log(id, 'stuck ' + k.ticks * 10 + 's: kill'); k.busy = 0; k.ticks = 0; kill(k.child); }
  }
}, 10000).unref();

module.exports = { run: run, halt: halt, haltAll: haltAll, cutAll: cutAll, info: info, pulse: pulse, env: env, sink: sink, log: log, trim: trim, excuse: EXCUSE };
