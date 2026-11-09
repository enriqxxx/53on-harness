'use strict';
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'lang'), BASE = 'en', tabs = {};
let cur = null;
const file = () => path.join(require('electron').app.getPath('userData'), 'lang.json');
function load(code) {
  if (!tabs[code]) { try { tabs[code] = JSON.parse(fs.readFileSync(path.join(DIR, code + '.json'), 'utf8')); } catch (_) { tabs[code] = {}; } }
  return tabs[code];
}
function codes() { try { return fs.readdirSync(DIR).filter((f) => /^[a-z]{2}\.json$/.test(f)).map((f) => f.slice(0, 2)); } catch (_) { return [BASE]; } }
function langs() { return codes().map((c) => ({ code: c, name: load(c).name || c })); }
function lang(code) {
  if (cur === null) { try { cur = JSON.parse(fs.readFileSync(file(), 'utf8')).lang; } catch (_) {} if (!codes().includes(cur)) cur = BASE; }
  if (code !== undefined) {
    if (!codes().includes(code)) return false;
    cur = code;
    try { require('./packs').writeJson(file(), { lang: code }); } catch (_) {}
  }
  return cur;
}
function __(k, v) {
  let s = load(lang())[k];
  if (s == null) s = load(BASE)[k];
  if (s == null) s = k;
  if (v) for (const n in v) s = s.split('{' + n + '}').join(v[n]);
  return s;
}
function bag(prefix) {
  const o = {}, b = load(BASE), c = load(lang()), p = prefix + '.';
  for (const k in b) if (k.indexOf(p) === 0) o[k.slice(p.length)] = c[k] != null ? c[k] : b[k];
  return o;
}
module.exports = { __: __, lang: lang, langs: langs, bag: bag };
