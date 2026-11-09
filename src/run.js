const crypto = require('crypto'), fs = require('fs'), os = require('os'), path = require('path');
const SHIM = path.join(__dirname, 'run-shim.js'), MAX = 8 << 20, TOKEN = crypto.randomBytes(16).toString('hex'), ends = new Map();
const inFile = (id) => path.join(os.tmpdir(), '53on_run_' + String(id).replace(/[^\w-]/g, '') + '.in');

function allowed(q, u) {   // a page always sends Origin; a foreign Host is DNS rebinding; another user of this PC has no token
  if (q.headers.origin != null || !/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(q.headers.host || '')) return false;
  const a = Buffer.from(String(u.searchParams.get('t') || '')), b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const gitRoot = () => [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], 'C:/Program Files'].filter(Boolean).map((r) => path.join(r, 'Git').replace(/\\/g, '/')).find((d) => fs.existsSync(d)) || '';
function winOne(p) {
  const m = /^\/([a-zA-Z])(\/.*)$/.exec(p);
  if (m) return m[1].toUpperCase() + ':' + m[2];
  if (p === '/tmp' || p.startsWith('/tmp/')) return os.tmpdir().replace(/\\/g, '/') + p.slice(4);
  if (/^\/(usr|bin|etc|opt|var|mingw64|mingw32|home)(\/|$)/.test(p) && gitRoot()) return gitRoot() + p;
  return null;
}
function win(v) {
  if (process.platform !== 'win32') return v;
  const o = /^(--?[\w-]+=)(\/.*)$/.exec(v);
  if (o) { const w = winOne(o[2]); return w === null ? v : o[1] + w; }
  if (v[0] !== '/' || v.startsWith('//')) return v;
  if (v.includes(':/')) { const l = v.split(':'); if (l.every((x) => x[0] === '/')) return l.map((x) => winOne(x) || x).join(';'); }
  const w = winOne(v);
  return w === null ? v : w;
}
function parse(b) {
  const f = b.toString('utf8').split('\0'), argc = +f[1], env = {};
  for (const kv of f.slice(2 + argc)) { const k = kv.indexOf('='); if (k > 0) env[kv.slice(0, k)] = kv.slice(k + 1); }
  const argv = f.slice(2, 2 + argc);
  if (env.MSYS_NO_PATHCONV) return { cwd: f[0], argv, env };   // who asked Git Bash for no conversion gets none here either
  for (const k of Object.keys(env)) env[k] = win(env[k]);
  return { cwd: f[0], argv: argv.map(win), env };
}
const plain = (r) => { r.useChunkedEncodingByDefault = false; r.writeHead(200, { Connection: 'close' }); };

function run(id, b, res) {
  const { cwd, argv, env } = parse(b), file = inFile(id), end = { err: [], code: null, wait: [] };
  if (env.__RUN_HAS_IN) { delete env.__RUN_HAS_IN; env.__RUN_STDIN = file; }
  delete env.ELECTRON_RUN_AS_NODE;   // only a test's Electron still reads it, and it would start the utilityProcess as a bare Node (exit 9)
  ends.set(id, end);
  const fin = (code) => {
    for (const x of [file, file + '.done']) try { fs.unlinkSync(x); } catch (_) {}
    res.end(); end.code = code; end.wait.forEach((g) => g()); end.wait = []; setTimeout(() => ends.delete(id), 30000);
  };
  let c;
  try { c = require('electron').utilityProcess.fork(SHIM, argv, { cwd: cwd || undefined, env, stdio: 'pipe', serviceName: '53on-command' }); }
  catch (e) { end.err.push(Buffer.from(String(e.message || e) + '\n')); return fin(1); }
  c.stdout.on('data', (d) => res.write(d)); c.stderr.on('data', (d) => end.err.push(d));
  c.on('exit', (x) => setTimeout(fin, 15, x));   // its writes are synchronous: what it wrote is already in the pipe
}

function http(q, r) {   // true when it was ours
  const u = new URL(q.url, 'http://x'), id = u.searchParams.get('id');
  if (u.pathname !== '/run' && u.pathname !== '/end') return false;
  if (!allowed(q, u)) { r.writeHead(403); r.end(); return true; }
  if (u.pathname === '/end') {
    const e = ends.get(id), go = () => { plain(r); r.write(String(e.code) + '\n'); r.end(Buffer.concat(e.err)); };
    if (!e) { plain(r); r.end('1\nunknown run\n'); } else if (e.code === null) e.wait.push(go); else go();
    return true;
  }
  const a = []; let n = 0;
  q.on('data', (d) => { n += d.length; if (n <= MAX) a.push(d); });
  q.on('end', () => { if (n > MAX) { r.writeHead(413); return r.end(); } plain(r); run(id, Buffer.concat(a), r); });
  return true;
}

function upgrade(q, sock, head) {   // true when it was ours
  const u = new URL(q.url, 'http://x');
  if (u.pathname !== '/in') return false;
  if (!allowed(q, u)) { sock.destroy(); return true; }
  const file = inFile(u.searchParams.get('id')), o = fs.createWriteStream(file);
  if (head && head.length) o.write(head);
  sock.pipe(o); o.on('finish', () => { try { fs.writeFileSync(file + '.done', ''); } catch (_) {} });
  return true;
}

const launcher = (port) => fs.readFileSync(path.join(__dirname, 'launcher.sh'), 'utf8').replace(/\r\n/g, '\n').replace('@PORT@', port).replace('@TOKEN@', TOKEN);

module.exports = { http, upgrade, parse, launcher, allowed, win, TOKEN };
