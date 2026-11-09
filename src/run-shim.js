const fs = require('fs'), path = require('path'), Module = require('module'), { Readable } = require('stream');
const file = process.env.__RUN_STDIN, parent = !!process.env.__RUN_PARENT; delete process.env.__RUN_STDIN; delete process.env.__RUN_PARENT;
const orig = fs.readFileSync, done = () => fs.existsSync(file + '.done');
fs.readFileSync = function (p, o) {
  if (p !== 0 && p !== '/dev/stdin') return orig.apply(fs, arguments);
  if (!file) return typeof o === 'string' || (o && o.encoding) ? '' : Buffer.alloc(0);
  const s = new Int32Array(new SharedArrayBuffer(4));
  while (!done()) Atomics.wait(s, 0, 0, 5);
  return orig.call(fs, file, o);
};
const r = new Readable({ read() {} });
let off = 0, tail = null, held = false, open = true;
function follow() {   // from the first reader on: what has arrived, then the end (a reader of a complement's holds it, as its pipe did, until 53ON closes it)
  if (parent) { held = open; return; }
  if (tail) return;
  if (!file) { tail = true; r.push(null); return; }
  tail = setInterval(() => {
    let b = null;
    try { const n = fs.statSync(file).size; if (n > off) { b = Buffer.alloc(n - off); const f = fs.openSync(file, 'r'); fs.readSync(f, b, 0, b.length, off); fs.closeSync(f); off = n; } } catch (_) {}
    if (b) r.push(b);
    else if (done()) { clearInterval(tail); r.push(null); }
  }, 5);
}
if (parent) process.parentPort.on('message', (e) => { const m = e.data || {}; if (!open) return; if (m.in !== undefined) r.push(m.in); if (m.end) { open = held = false; r.push(null); } });
if (process.env.__RUN_V8) {   // a utilityProcess takes no V8 flags from its command line
  const v8 = require('v8'), fl = process.env.__RUN_V8.split(' '); delete process.env.__RUN_V8;
  fl.forEach((f) => v8.setFlagsFromString(f));
  if (fl.includes('--expose-gc')) global.gc = require('vm').runInNewContext('gc');
}
const si = process.stdin;   // born ended and not replaceable: its reading verbs go to the stream above
for (const k of ['on', 'once', 'addListener', 'removeListener', 'off', 'pipe', 'setEncoding', 'resume', 'pause', 'read', 'unpipe']) si[k] = function () { if (k !== 'pause' && k !== 'removeListener' && k !== 'off') follow(); const x = r[k].apply(r, arguments); return x === r ? si : x; };
si[Symbol.asyncIterator] = () => { follow(); return r[Symbol.asyncIterator](); };
[[process.stdout, 1], [process.stderr, 2]].forEach(([x, fd]) => { x.write = function (c, e, cb) { if (typeof e === 'function') { cb = e; e = undefined; } fs.writeSync(fd, typeof c === 'string' ? Buffer.from(c, e || 'utf8') : c); if (cb) process.nextTick(cb); return true; }; });
setInterval(() => {
  const o = [process.stdout, process.stderr];
  if (held || process._getActiveRequests().length || process._getActiveHandles().filter((h) => !o.includes(h)).length) return;
  if (process.getActiveResourcesInfo().some((x) => x !== 'PipeWrap')) return;
  process.exit(process.exitCode);
}, 5).unref();
const argv = process.argv.slice(2);
if (argv[0] === '-e') {
  process.argv = [process.execPath].concat(argv.slice(2));
  const m = new Module('[eval]'); m.filename = path.join(process.cwd(), '[eval]'); m.paths = Module._nodeModulePaths(process.cwd());
  m._compile(argv[1], m.filename);
} else {
  process.argv = [process.execPath, argv[0]].concat(argv.slice(1));
  Module.runMain();
}
