'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

const MAX = +process.env.AVATAR_PRUNE_MAX || 8192,
  HEAD = +process.env.AVATAR_PRUNE_HEAD || 4096,
  TAIL = +process.env.AVATAR_PRUNE_TAIL || 1024,
  DIR = process.env.AVATAR_SPILL_DIR || path.join(os.tmpdir(), '53on', 'spill');

function prune(text) {
  const t = String(text == null ? '' : text);
  const cp = Array.from(t);
  if (cp.length <= MAX) return t;
  const at = spill(t);
  if (!at) return t;   // save failed: keep the bulk rather than lose it
  return cp.slice(0, HEAD).join('') + '\n\n[... ' + (cp.length - HEAD - TAIL) +
    ' code points pruned \u00b7 full output: ' + at + ' · reopen with Read ...]\n\n' +
    cp.slice(-TAIL).join('');
}

function spill(t) {
  try {
    fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
    const p = path.join(DIR, 'spill_' + Date.now() + '_' + process.pid + '.txt');
    fs.writeFileSync(p, t, { flag: 'wx', mode: 0o600 });   // wx: a planted link cannot redirect it
    sweep();
    return p;
  } catch (e) { return ''; }
}

function sweep() {   // deletes only files matching the name this writes
  try {
    const f = fs.readdirSync(DIR).filter(n => /^spill_\d+_\d+\.txt$/.test(n)).sort();
    for (let i = 0; i < f.length - 40; i++) try { fs.unlinkSync(path.join(DIR, f[i])); } catch (e) {}
  } catch (e) {}
}

module.exports = { prune };
