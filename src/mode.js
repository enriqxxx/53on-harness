const fs = require('fs');
const path = require('path');

const MODES = ['manual', 'plan', 'auto', 'bypass'];
let FILE = '';
let mode = 'manual';   // el que menos confia: si el fichero no esta, no se regala poder
let read = false;

function load(dir) {
  if (read && !dir) return mode;
  if (dir) FILE = path.join(dir, 'mode.json');
  if (!FILE) { try { FILE = path.join(require('electron').app.getPath('userData'), 'mode.json'); } catch (e) { return mode; } }
  read = true;
  try { const m = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (MODES.indexOf(m.mode) !== -1) mode = m.mode; } catch (e) {}
  return mode;
}

function init(userDataDir) { return load(userDataDir); }

function get() { return load(); }

function set(m) {
  if (MODES.indexOf(m) === -1) return { ok: false, e: 'modo invalido: ' + m };
  load(); mode = m;
  try { fs.writeFileSync(FILE, JSON.stringify({ mode: mode }), 'utf8'); } catch (e) {}
  return { ok: true, mode: mode };
}

const DENIED = 'plan mode: read and propose only — nothing is touched until the owner approves the plan';

function says(verdict) {
  load();
  if (mode === 'bypass') return 'allow';
  if (mode === 'plan') return DENIED;
  if (mode === 'auto') return verdict && verdict.danger ? '' : 'allow';   // solo lo destructivo u ofuscado
  return '';                                                             // manual: todo lo que llego aqui
}

module.exports = { init, get, set, says, DENIED, MODES };
