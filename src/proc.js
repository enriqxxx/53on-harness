const { EventEmitter } = require('events'), fs = require('fs'), path = require('path');
const SHIM = path.join(__dirname, 'run-shim.js');

const available = () => { try { return !!require('electron').utilityProcess; } catch (_) { return false; } };

function fork(entry, args, o) {
  const c = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null }), env = Object.assign({}, o.env);
  delete env.ELECTRON_RUN_AS_NODE;   // only a test's Electron still reads it, and it would start the utilityProcess as a bare Node (exit 9)
  if (o.line) env.__RUN_PARENT = '1';
  if (o.execArgv && o.execArgv.length) env.__RUN_V8 = o.execArgv.join(' ');
  let u;
  try { u = require('electron').utilityProcess.fork(SHIM, [entry].concat(args || []), { cwd: o.cwd, env, stdio: 'pipe', serviceName: env.COMPLEMENT_ID || 'complement' }); }
  catch (e) { c.exitCode = -1; setImmediate(() => { c.emit('error', e); c.emit('exit', -1); }); return c; }
  const sink = (s, keep) => { if (keep) return; s.on('data', (d) => { if (typeof o.out === 'number') try { fs.writeSync(o.out, d); } catch (_) {} }); };
  c.stdout = u.stdout; c.stderr = u.stderr;
  sink(u.stdout, o.piped); sink(u.stderr, false);
  const post = (m) => { try { u.postMessage(m); } catch (_) {} return true; };
  c.stdin = o.line ? Object.assign(new EventEmitter(), { write: (s) => post({ in: String(s) }), end: () => post({ end: 1 }) }) : null;
  c.kill = () => u.kill();
  u.on('spawn', () => { c.pid = u.pid; });
  c.pid = u.pid;
  u.on('exit', (code) => { c.exitCode = code; setTimeout(() => { if (typeof o.out === 'number') try { fs.closeSync(o.out); } catch (_) {} c.emit('exit', code); }, 15); });
  return c;
}

module.exports = { fork, available };
