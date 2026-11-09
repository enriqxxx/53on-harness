'use strict';
const { app, powerMonitor } = require('electron');
const POWER = ['suspend', 'resume', 'lock-screen', 'unlock-screen', 'on-ac', 'on-battery', 'shutdown'];
const ov = () => require('./overlay'), eyes = () => require('./eyes');
const packs = () => require('./packs'), up = () => require('./update');
const fail = (e) => ({ ok: false, error: packs().code(e) });
const rows = async () => (await up().rows(true)).filter((r) => r && r.rt === 'tar' && /^53on-[a-z0-9]+(-[a-z0-9]+)*$/.test(r.id) && (!r.os || r.os.includes('pc')));
async function apt(q, pack) {
  try {
    if (q !== 'install' && !packs().state(pack)) return { ok: false, error: 'not_installed' };
    if (q === 'remove') { await packs().remove(pack); return { ok: true, pack: pack }; }
    const r = await packs().update(pack);
    return { ok: true, pack: pack, ver: r.ver, already: !!r.already, running: !!(r.started && r.started.ok) };
  } catch (e) { return fail(e); }
}
async function list() {
  const mine = packs().list(), have = new Set(mine.map((c) => c.id));
  try {
    return { ok: true, installed: mine.map((c) => ({ id: c.id, ver: c.ver, running: c.running, off: c.off })),
      available: (await rows()).filter((r) => r.vis === 'pub' && !have.has(r.id)).map((r) => ({ id: r.id, ver: r.ver, ttl: r.ttl || r.id })) };
  } catch (e) { return fail(e); }
}
async function update() {
  try {
    const all = await rows(), out = [];
    for (const c of packs().list()) { const r = all.find((x) => x.id === c.id); if (r && up().newer(r.ver, c.ver)) out.push({ pack: c.id, from: c.ver, to: r.ver }); }
    const v = up().on && await up().check(true);
    if (v) out.push({ pack: '53on', from: app.getVersion(), to: v });
    return { ok: true, upgradable: out };
  } catch (e) { return fail(e); }
}
async function upgrade(pack) {
  if (pack && pack !== '53on') return apt('upgrade', pack);
  const done = [];
  if (!pack) for (const c of packs().list()) if (!c.off) { const r = await apt('upgrade', c.id); if (r.ok && !r.already) done.push({ pack: c.id, ver: r.ver }); }
  const v = up().on && await up().check(true);
  if (v) setTimeout(() => up().download(), 300);
  return Object.assign({ ok: true, upgraded: done }, v ? { restarting: true, from: app.getVersion(), ver: v } : {});
}
async function toggle(pack, on) {
  try {
    if (!packs().state(pack)) return { ok: false, error: 'not_installed' };
    const r = await (on ? packs().start(pack) : packs().stop(pack));
    return r.ok ? { ok: true, pack: pack, on: on } : { ok: false, error: packs().code(r.error) };
  } catch (e) { return fail(e); }
}
async function restart(pack) {
  try {
    if (!packs().state(pack)) return { ok: false, error: 'not_installed' };
    const r = await packs().restart(pack);
    return r.ok ? { ok: true, pack: pack, running: true } : { ok: false, error: packs().code(r.error) };
  } catch (e) { return fail(e); }
}
function config(arg) {
  if (!arg) return require('./settings').get();
  let patch;
  try { patch = JSON.parse(arg); } catch (_) { return { ok: false, error: 'json_bad' }; }
  return require('./settings').set(patch).catch(fail);
}
function prompt(arg) {
  let a; try { a = Object(JSON.parse(arg || '{}')); } catch (_) { return { ok: false, error: 'json_bad' }; }
  const c = require('./cron'), r = a.cancel ? c.cancel(String(a.cancel)) : a.text ? c.add(a.when, a.text, 'm prompt', a.ch) : c.list();
  if (!r.ok) return { ok: false, error: r.e };
  const { id, ...rest } = r;   // an answer's id is the question's: the task's goes as job
  return id ? Object.assign(rest, { job: id }) : rest;
}
const SECTIONS = '(function(){var A=window.AutoCall,M=window.AiMonitor,P=window.PteTabs,s=(A&&A.cfg&&A.cfg.sessions)||{};'
  + 'return Object.keys(s).filter(function(k){return k==="base"||/^s_/.test(k)})'
  + '.map(function(k){return{id:k,name:String((P&&P.title&&P.title(k))||k),busy:M&&M.busy?+M.busy(k)||0:0}})})()';
const ASK = {
  version: () => ({ ok: true, version: app.getVersion() }),
  ui: () => ({ ok: true, lang: require('./i18n').lang() }),
  status: () => Promise.all([app.getGPUInfo('complete'), aiBusy()]).then(([g, b]) => Object.assign({ ok: true, version: app.getVersion(),
    uptime: Math.round(process.uptime()), busy: +b || 0, gpu: (g.auxAttributes || {}).glRenderer || '', door: { port: gatePort, peers: peers.size },
    packs: packs().list().map((c) => ({ id: c.id, ver: c.ver, running: !!c.running, off: !!c.off })) }, look())),
  list: () => list(),
  update: () => update(),
  upgrade: (m) => upgrade(m.arg),
  install: (m) => (m.arg ? apt('install', m.arg) : { ok: false, error: 'pack_required' }),
  remove: (m) => (m.arg ? apt('remove', m.arg) : { ok: false, error: 'pack_required' }),
  start: (m) => (m.arg ? toggle(m.arg, true) : { ok: false, error: 'pack_required' }),
  stop: (m) => (m.arg ? toggle(m.arg, false) : { ok: false, error: 'pack_required' }),
  restart: (m) => (m.arg ? restart(m.arg) : { ok: false, error: 'pack_required' }),
  config: (m) => config(m.arg),
  prompt: (m) => prompt(m.arg),
  inbox: (m) => { let a; try { a = Object(JSON.parse(m.arg || '{}')); } catch (_) { return { ok: false, error: 'json_bad' }; }
    if (!a.text || !a.ch) return { ok: false, error: 'missing', hint: 'text, ch' };
    return { ok: true, job: require('./cron').inbox(String(a.text), String(a.ch)).id }; },
  sections: () => page(SECTIONS).then((l) => (Array.isArray(l) ? { ok: true, sections: l.map((s) => ({ id: String(s.id), name: String(s.name),
    status: s.busy > 1 || require('./cron').waiting(s.id) ? 'busy' : 'idle' })) } : { ok: false, error: 'no_view' })),
  displays: () => ({ displays: ov().query('displays') }),
  idle: () => ov().query('idle'),
  screen: (m) => eyes().screen({ display: m.display, max: m.max }),
  camera: (m) => eyes().camera({ device: m.device, max: m.max }),
  cameras: () => eyes().cameras(),
  listen: () => eyes().listen(),   // m listen: one phrase from the PC's mic, as a page's listen hears the phone's
  move: (m) => ({ ok: ov().moveToDisplay(parseInt(m.index, 10)) }),   // the overlay to display <index>, answered by id
};
const MOVES = new Set(['upgrade', 'install', 'remove', 'start', 'stop', 'restart', 'reload']);
let aiBusy = () => 0, look = () => ({}), page = () => Promise.resolve(null);   // look: what main sees for status (immersive, awake) · page: main runs a probe in 53on.com's view
const peers = new Set();
let gate = null, gatePort = 0, gateErr = '', wired = false, turn = Promise.resolve();

function toBodies(m) { for (const p of peers) p.send(m); }
function serve(p) {
  peers.add(p);
  p.on('close', () => peers.delete(p));
  p.on('message', (m) => {
    if (m.action === '_query') {
      const f = ASK[m.q];
      Promise.resolve().then(async () => {
        if (!f) return { ok: false, error: 'unknown_query' };
        const b = (MOVES.has(m.q) || (m.q === 'config' && m.arg)) && await aiBusy();
        return b ? { ok: false, error: 'busy', busy: b, hint: 'try again later' } : f(m, p);   // p: who asks (browse.js keeps its windows while it lives)
      }).catch((e) => ({ ok: false, error: String((e && e.message) || e) }))
        .then((r) => p.send(Object.assign({ type: String(m.q) }, m.id != null ? { id: m.id } : {}, r)));
    } else if (m.action === 'move-to-display') p.send({ type: 'move-result', ok: ov().moveToDisplay(parseInt(m.index, 10)), index: m.index });
    else if (m.action === 'message') require('./cron').add('', '📱' + m.uid + ': ' + m.text, '📱' + m.uid);   // F7: to 53ON's own chat, as its prompt
    else ov().send(m);
  });
}
function info() { return { port: gatePort, open: !!gate, peers: peers.size, error: gateErr }; }
function open(port) {
  port = +port || 0;
  return (turn = turn.catch(() => {}).then(async () => {
    if (gate && gatePort === port) return info();
    if (gate) { gate.close(); gate = null; peers.clear(); }
    gatePort = port; gateErr = '';
    if (!port) return info();
    const r = await require('./wsd').listen(port, serve, require('./run'));
    if (r.ok) gate = r; else gateErr = r.error;   // a held port is theirs: said, retried on the next open
    if (r.ok && !wired) {
      wired = true;
      ov().onBack(toBodies);
      POWER.forEach((ev) => { try { powerMonitor.on(ev, () => toBodies({ type: 'power', event: ev, ts: Date.now() })); } catch (_) {} });
    }
    return info();
  }));
}

function handle(q, fn) { ASK[q] = fn; }
function tell(m) { toBodies(m); return peers.size; }
module.exports = { open: open, info: info, handle: handle, tell: tell, busy: (fn) => { aiBusy = fn; }, isBusy: () => aiBusy(), look: (fn) => { look = fn; }, page: (fn) => { page = fn; } };
