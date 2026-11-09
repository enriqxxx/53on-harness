const fs = require('fs');
const path = require('path');

let FILE = '';
let allowed = [];

function load() {
  try { allowed = JSON.parse(fs.readFileSync(FILE, 'utf8')) || []; } catch (e) { allowed = []; }
  if (!Array.isArray(allowed)) allowed = [];
}
function save() { try { fs.writeFileSync(FILE, JSON.stringify(allowed), 'utf8'); } catch (e) {} }

function init(userDataDir) { FILE = path.join(userDataDir, 'allow.json'); load(); return allowed.length; }

function programOf(cmd) {
  const t = String(cmd || '').trim();
  const q = t.match(/^["']([^"']+)["']/);
  const first = q ? q[1] : (t.split(/[\s;|&]+/)[0] || '');
  return first.split(/[\\/]/).pop().replace(/\.(exe|cmd|bat|ps1)$/i, '').toLowerCase();
}


function isAllowed(cmd) { return allowed.indexOf(programOf(cmd)) !== -1; }

function allow(cmd) {
  const p = programOf(cmd);
  if (!p || allowed.indexOf(p) !== -1) return p;
  allowed.push(p); save();
  return p;
}

function list() { return allowed.slice(); }
function forget(p) { allowed = allowed.filter(function (x) { return x !== String(p || '').toLowerCase(); }); save(); }

module.exports = { init, isAllowed, allow, list, forget, programOf };
