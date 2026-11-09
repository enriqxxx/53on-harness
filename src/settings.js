'use strict';
const fs = require('fs'), path = require('path');
const BODY = '53on-body', BROWSERS = ['chrome', 'msedge'];
const packs = () => require('./packs');
const file = () => path.join(packs().home(BODY), 'data', 'settings.json');
const raw = () => { try { return JSON.parse(fs.readFileSync(file(), 'utf8')) || {}; } catch (_) { return {}; } };
const url = (v) => { try { return v.length <= 2000 && /^(https?|file):$/.test(new URL(v).protocol); } catch (_) { return false; } };
const str = (v) => typeof v === 'string';
const exe = (v) => { try { return str(v) && v.length <= 400 && path.isAbsolute(v) && fs.statSync(v).isFile(); } catch (_) { return false; } };
const KEYS = {
  browser: ['53on', (v) => v === '53on' || v === 'auto' || v === 'off' || BROWSERS.includes(v) || exe(v)],
  hidden: [false, (v) => typeof v === 'boolean'],
  home: ['blank', (v) => v === 'blank' || v === '53on' || (str(v) && url(v))],
};
const MSG = { on: [false, (v) => typeof v === 'boolean'], to: ['arnes', (v) => v === 'vscodex' || v === 'arnes'], tone: ['voice', (v) => /^(voice|off|custom|t[1-3])$/.test(v)], toneFile: ['', (v) => v === '' || /[\\/]sounds[\\/]arrival\.(mp3|wav|ogg|m4a|webm)$/i.test(v)], say: ['', (v) => typeof v === 'string' && v.length <= 60] };
const EAR = { model: ['small', (v) => str(v) && /^[a-z0-9-]{1,24}$/.test(v)], lang: ['53on', (v) => v === '53on' || (str(v) && /^[a-z]{2}$/.test(v))] };
const DL = { dir: ['', (v) => v === '' || (str(v) && v.length <= 400 && path.isAbsolute(v))], ask: [false, (v) => typeof v === 'boolean'] };
const NEST = { msg: MSG, ear: EAR, downloads: DL };
const pick = (o, spec) => { const r = {}; for (const k in spec) r[k] = o[k] !== undefined && spec[k][1](o[k]) ? o[k] : spec[k][0]; return r; };
const isId = (v) => /^\d{1,12}$/.test(v);

function view(s) {
  const c = pick(s, KEYS), m = s.msg || {};
  for (const n in NEST) c[n] = pick(s[n] || {}, NEST[n]);
  c.msg.id = isId(String(m.id || '')) ? String(m.id) : '';
  return c;
}
function browsersHere() {
  const e = process.env, at = {
    win32: { msedge: [e['ProgramFiles(x86)'], e.ProgramFiles, e.LOCALAPPDATA].map((d) => d + '\\Microsoft\\Edge\\Application\\msedge.exe'),
      chrome: [e.ProgramFiles, e['ProgramFiles(x86)'], e.LOCALAPPDATA].map((d) => d + '\\Google\\Chrome\\Application\\chrome.exe') },
    darwin: { msedge: ['/Applications/Microsoft Edge.app'], chrome: ['/Applications/Google Chrome.app'] },
    linux: { msedge: ['/opt/microsoft/msedge/msedge'], chrome: ['/opt/google/chrome/chrome'] },
  }[process.platform] || {};
  return BROWSERS.filter((b) => (at[b] || []).some((f) => fs.existsSync(f)));
}
function get() { return { ok: true, config: view(raw()), browsers: browsersHere() }; }

async function set(patch, owner) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, error: 'json_bad' };
  for (const k of Object.keys(patch)) {
    if (NEST[k]) {
      const m = patch[k];
      if (!m || typeof m !== 'object' || Array.isArray(m)) return { ok: false, error: 'value_bad', key: k };
      for (const j of Object.keys(m)) {
        if (k === 'msg' && j === 'id') {   // who may write from outside, and the one answered: its owner, in Options
          if (!owner) return { ok: false, error: 'manual', key: 'msg.id' };
          const v = String(m.id == null ? '' : m.id).trim();
          if (v && !isId(v)) return { ok: false, error: 'value_bad', key: 'msg.id' };
          continue;
        }
        if (!NEST[k][j]) return { ok: false, error: 'key_bad', key: k + '.' + j };
        if (m[j] !== null && !NEST[k][j][1](m[j])) return { ok: false, error: 'value_bad', key: k + '.' + j };
      }
    } else if (!KEYS[k]) return { ok: false, error: 'key_bad', key: k };
    else if (patch[k] !== null && !KEYS[k][1](patch[k])) return { ok: false, error: 'value_bad', key: k };
  }
  const s = raw(), was = view(s);
  for (const k of Object.keys(patch)) {   // null: back to its default (the one KEYS, MSG and EAR name)
    if (!NEST[k]) { if (patch[k] === null) delete s[k]; else s[k] = patch[k]; continue; }
    s[k] = Object.assign({}, s[k], patch[k]);
    for (const j in patch[k]) if (patch[k][j] === null && j !== 'id') delete s[k][j];
  }
  if (patch.msg && patch.msg.id !== undefined) { s.msg.id = String(patch.msg.id == null ? '' : patch.msg.id).trim(); delete s.msg.ids; }   // the old list of 5 goes
  if (s.msg) delete s.msg.ai;   // an AI by name is no destination any more
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  packs().writeJson(file(), s);
  try { require('./messenger').sync(); require('./push').start(); } catch (_) {}   // the Arnés's ear hears the new id now, no reload
  const now = view(s), again = ['browser', 'hidden', 'home'].some((k) => now[k] !== was[k]);   // messages are the Arnés's: no relaunch
  if (again) require('./browse').close();   // its windows come back as now asked (hidden or not, its home)
  const relaunched = again && require('./bodyd').info(BODY).running ? !!(await packs().start(BODY)).ok : false;
  return { ok: true, config: now, relaunched: relaunched };
}

module.exports = { get: get, set: set, BODY: BODY };
