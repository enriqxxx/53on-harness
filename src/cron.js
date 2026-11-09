const fs = require('fs');
const path = require('path');

let FILE = '', jobs = [], notes = [], seen = 0, seq = 0, T = null;
let fire = function () {};       // wakes the page: set by shell-window

function load() {
  try { jobs = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { jobs = []; }
  if (!Array.isArray(jobs)) jobs = [];
  for (const j of jobs) if (j.hhmm) { const t = j.hhmm.split(':'); j.cron = +t[1] + ' ' + +t[0] + ' * * *'; delete j.hhmm; }   // the old daily, as its cron
}
function save() { try { fs.writeFileSync(FILE, JSON.stringify(jobs), 'utf8'); } catch (e) {} }
function hhmm(d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
const SPAN = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]], P = new Map();
function field(f, i) {
  const [lo, hi] = SPAN[i], o = new Set();
  for (const p of f.split(',')) {
    const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(p);
    if (!m) return null;
    const a = m[1] === '*' ? lo : +m[2], b = m[1] === '*' ? hi : m[3] != null ? +m[3] : m[4] ? hi : a;
    if (a < lo || b > hi || a > b || m[4] === '0') return null;
    for (let v = a; v <= b; v += +m[4] || 1) o.add(i === 4 && v === 7 ? 0 : v);
  }
  return o;
}
function parse(c) {
  if (P.has(c)) return P.get(c);
  const f = String(c).trim().split(/\s+/), s = f.length === 5 ? f.map(field) : [];
  const p = s.length && s.every(Boolean) ? { s: s, dom: f[2] !== '*', dow: f[4] !== '*' } : null;
  P.set(c, p); return p;
}
function hit(p, d) {
  const a = p.s[2].has(d.getDate()), b = p.s[4].has(d.getDay());
  return p.s[0].has(d.getMinutes()) && p.s[1].has(d.getHours()) && p.s[3].has(d.getMonth() + 1) && (p.dom && p.dow ? a || b : a && b);
}
function next(p, from) { const d = new Date(from); d.setSeconds(0, 0); for (let i = 0; i < 527040; i++) { d.setMinutes(d.getMinutes() + 1); if (hit(p, d)) return +d; } return 0; }
function uid(p) { return p + Date.now().toString(36) + (++seq).toString(36); }   // unique even in the same ms

function ready(now) {
  return jobs.filter(function (j) { return j.at ? j.at <= now : j.due; }).concat(notes)
    .sort(function (a, b) { return (a.at || a.due || a.set_at) - (b.at || b.due || b.set_at); });
}

function check(hot) {
  const now = Date.now(), d = new Date(now);
  for (const j of jobs) {
    const k = d.toDateString() + ' ' + hhmm(d), p = j.cron && parse(j.cron);
    if (p && j.last !== k && hit(p, d)) { j.last = k; j.due = now; hot = 1; }
    if (j.at > seen && j.at <= now) hot = 1;
  }
  seen = now;
  if (hot) { save(); const n = ready(now)[0]; if (n) try { fire(n.prompt, n.id, n.ch); } catch (e) {} }
  arm();
}

function arm() {
  clearTimeout(T); T = null;
  const now = Date.now(), next = jobs.filter(function (j) { return j.at > seen; }).map(function (j) { return Math.max(0, j.at - now); });
  if (jobs.some(function (j) { return j.cron; })) next.push(30000);
  if (!next.length) return;
  T = setTimeout(check, Math.min.apply(null, next.concat(60000)));
  if (T.unref) T.unref();
}

function init(userDataDir, onFire) {
  FILE = path.join(userDataDir, 'cron.json');
  fire = onFire || fire;
  load(); check(true);           // app start or page reload: whatever is still waiting (overdue included) wakes once
  return jobs.length;
}

function add(when, prompt, label, ch, once) {
  const w = String(when || '').trim(), m = w.match(/^\+?\s*(\d{1,6})\s*([smh]?)$/i), p = !m && w ? parse(w) : null, now = Date.now();
  const j = { id: uid('j'), set_at: now, prompt: String(prompt || ''), label: String(label || ''), ch: String(ch || '') };
  if (!w || m) j.at = now + (m ? m[1] * { s: 1e3, m: 6e4, h: 36e5 }[(m[2] || 's').toLowerCase()] : 0);   // N = seconds (ScheduleWakeup) · nothing = now
  else if (p && once) { if (!(j.at = next(p, now))) return { ok: false, e: 'that cron never comes within a year' }; }
  else if (p) j.cron = w;
  else return { ok: false, e: 'invalid when: a 5-field cron "M H DoM Mon DoW" (local time), or +Ns / +Nm / +Nh (once), nothing (now)' };
  if (!j.prompt) return { ok: false, e: 'missing prompt' };
  jobs.push(j); save(); check(j.at <= now);       // "+0s" in the same ms as the last look is due already
  return { ok: true, id: j.id, at: j.at, cron: j.cron, when: j.cron ? 'cron ' + j.cron + ' · next ' + new Date(next(p, now)).toLocaleString() : 'once ' + new Date(j.at).toLocaleString() };
}

function post(prompt, who, ch) {
  if (jobs.concat(notes).some(function (j) { return j.id === who; })) return who;
  const n = { id: uid('n'), set_at: Date.now(), prompt: String(prompt || ''), ch: String(ch || '') };
  notes.push(n);
  return n.id;
}

function inbox(prompt, ch) {
  const id = post(prompt, '', ch);
  try { fire(prompt, id, ch); } catch (e) {}
  return { ok: true, id: id };
}

function take(skip) {
  const r = ready(Date.now()).filter(function (j) { return !skip || skip.indexOf(j.ch || '') < 0; }), n = r[0];
  if (!n) return null;
  if (n.at || n.cron) return { id: n.id, prompt: n.prompt, ch: n.ch || '' };
  const k = n.ch || '', same = r.filter(function (x) { return !x.at && !x.cron && (x.ch || '') === k; });
  return { id: same.map(function (x) { return x.id; }).join(','), prompt: same.map(function (x) { return x.prompt; }).join('\n'), ch: k };
}

function absorb(ch) {
  const k = String(ch || ''), got = notes.filter(function (n) { return (n.ch || '') === k; });
  if (!got.length) return '';
  notes = notes.filter(function (n) { return got.indexOf(n) < 0; });
  return got.map(function (n) { return n.prompt; }).join('\n');
}

function done(id) {
  const ids = String(id).split(','), now = Date.now();
  notes = notes.filter(function (n) { return ids.indexOf(n.id) < 0; });
  jobs = jobs.filter(function (j) { return !(ids.indexOf(j.id) >= 0 && j.at <= now); });
  for (const j of jobs) if (ids.indexOf(j.id) >= 0) delete j.due;
  save();
  return { ok: true };
}

function waiting(ch) {
  const k = String(ch || '');
  return ready(Date.now()).filter(function (j) { return (j.ch || '') === k; }).length;
}

function list() {
  const now = Date.now();
  return { ok: true, jobs: jobs.concat(notes).map(function (j) {
    return { id: j.id, at: j.at, set_at: j.set_at, cron: j.cron, label: j.label || '', prompt: j.prompt, ch: j.ch || '',
      wait: !!(j.at ? j.at <= now : j.cron ? j.due : 1),
      when: j.cron ? 'cron ' + j.cron : j.at ? 'once ' + new Date(j.at).toLocaleString() : 'notice' };
  }) };
}

function cancel(id) {
  const n = jobs.length + notes.length;
  jobs = jobs.filter(function (j) { return j.id !== id; });
  notes = notes.filter(function (j) { return j.id !== id; });
  if (jobs.length + notes.length === n) return { ok: false, e: 'no such task ' + id };
  save(); arm();
  return { ok: true };
}

module.exports = { init, add, list, cancel, post, inbox, take, absorb, done, waiting, _check: check };
