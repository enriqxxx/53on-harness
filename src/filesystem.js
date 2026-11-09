'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { Readable } = require('stream'), { pipeline } = require('stream/promises');

const BAD = /[<>:"|?*\x00-\x1f]/;   // no Windows name holds these; a ':' would open a file's hidden stream
const NAP = new Int32Array(new SharedArrayBuffer(4));
const MIME = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webm: 'audio/webm', ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', mp4: 'video/mp4', pdf: 'application/pdf' };
const SCHEME = { scheme: 'appmedia', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } };
const VERBS = new Set(['cmd', 'read', 'write', 'append', 'list', 'exists', 'del', 'mkdir', 'media', 'b64', 'rename']);

function create(base, get, out = {}) {
  let uid = '', seq = 0;
  try { uid = fs.readFileSync(path.join(base, 'id'), 'utf8').replace(/\D/g, ''); } catch (_) {}
  function file(p) {
    const s = String(p == null ? '' : p).trim().replace(/\\/g, '/').split('/').filter((x) => x && x !== '.' && x !== '..');
    if (!s.length || s.some((x) => BAD.test(x))) return null;
    return s[0] === 'tmp' || s[0] === 'contacts' || s.join('/') === 'id' ? path.join(base, ...s) : path.join(base, uid || '_no_user', ...s);
  }
  const run = (f) => { try { return f() === false ? '' : 'ok'; } catch (_) { return ''; } };
  const up = (f) => fs.mkdirSync(path.dirname(f), { recursive: true });
  const dir = (f) => !!fs.statSync(f, { throwIfNoEntry: false })?.isDirectory();
  function swap(t, f) {
    for (let i = 0; ; i++) try { return fs.renameSync(t, f); } catch (e) { if (i > 9 || !/^(EPERM|EACCES|EBUSY)$/.test(e.code)) throw e; Atomics.wait(NAP, 0, 0, 25); }
  }
  function put(f, data) {
    up(f);
    const t = f + '.tmp', h = fs.openSync(t, 'w');
    try { fs.writeFileSync(h, data); fs.fsyncSync(h); } finally { fs.closeSync(h); }
    swap(t, f);
  }
  const size = (f) => dir(f) ? fs.readdirSync(f).reduce((n, x) => n + size(path.join(f, x)), 0) : fs.statSync(f).size;
  const has = (p) => { const f = file(p); return !!f && fs.existsSync(f); };
  const pair = (fn) => (a) => { a = String(a == null ? '' : a); const i = a.indexOf(':'); return i < 0 ? '' : fn(a.slice(0, i), a.slice(i + 1)); };

  const read = (p) => { try { return fs.readFileSync(file(p), 'utf8'); } catch (_) { return ''; } };
  const write = (p, c) => run(() => put(file(p), c == null ? '' : String(c)));
  const append = (p, c) => run(() => { const f = file(p); up(f); fs.appendFileSync(f, c == null ? '' : String(c)); });
  const list = (p) => { try { return JSON.stringify(fs.readdirSync(file(p) || base, { withFileTypes: true }).map((d) => d.name + (d.isDirectory() ? '/' : ''))); } catch (_) { return '[]'; } };
  const del = (p) => run(() => fs.rmSync(file(p), { recursive: true, force: true }));
  const mkdir = (p) => run(() => fs.mkdirSync(file(p), { recursive: true }));
  const move = (a, b) => run(() => { const f = file(a), t = file(b); if (!t) return false; if (fs.existsSync(f)) { up(t); fs.renameSync(f, t); } });
  const media = (p, d) => run(() => { d = String(d || ''); const i = d.indexOf(','); if (i < 0) return false; put(file(p), Buffer.from(d.slice(i + 1), 'base64')); });
  const b64 = (p) => { try { const f = file(p), s = fs.statSync(f); return s.isFile() && s.size <= 5e7 ? fs.readFileSync(f).toString('base64') : ''; } catch (_) { return ''; } };
  async function dl(dest, url) {
    const f = file(dest);
    if (!f || !/^https?:\/\//i.test(url)) return '';
    const t = f + '.' + (++seq) + '.tmp';   // two pages asking the same file each write their own
    try {
      const r = await get(String(url), { signal: AbortSignal.timeout(30000) });
      if (!r.ok || !r.body) return '';
      up(f);
      await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(t));
      swap(t, f);
      return 'ok';
    } catch (_) { try { fs.unlinkSync(t); } catch (_) {} return ''; }
  }
  function user(u) {
    u = String(u == null ? '' : u).replace(/\D/g, '');
    if (!u) return '';
    if (u !== uid) { uid = u; try { put(path.join(base, 'id'), u); } catch (_) {} }
    try { fs.mkdirSync(path.join(base, u), { recursive: true }); } catch (_) {}
    return u;
  }

  const CMD = {
    read, write: pair(write), append: pair(append), delete: del, list, exists: (p) => has(p) ? '1' : '0', mkdir,
    rmdir: (p) => run(() => { const f = file(p); if (dir(f)) fs.rmSync(f, { recursive: true }); }),
    clear: (p) => run(() => { const f = file(p); if (dir(f)) for (const x of fs.readdirSync(f)) fs.rmSync(path.join(f, x), { recursive: true, force: true }); }),
    rename: pair(move), move: pair(move),
    copy: pair((a, b) => run(() => { const t = file(b); up(t); fs.copyFileSync(file(a), t); })),
    stat: (p) => { try { const s = fs.statSync(file(p)); return JSON.stringify({ size: s.size, modified: Math.floor(s.mtimeMs), isDir: s.isDirectory() }); } catch (_) { return ''; } },
    size: (p) => { try { return String(size(file(p) || base)); } catch (_) { return '0'; } },
    download: pair(dl), media_save: pair(media), read_base64: b64,
    hash: (p) => { try { return crypto.createHash('md5').update(fs.readFileSync(file(p))).digest('hex'); } catch (_) { return ''; } },
    set_user: user, get_user: () => uid,
    save_gallery: (p) => run(() => out.save(file(p))),
    share: (p) => run(() => { const f = file(p); if (!fs.statSync(f).isFile()) return false; out.share(f); }),
  };
  function cmd(m) {
    m = String(m == null ? '' : m);
    if (!m.startsWith('fs:')) return null;
    const i = m.indexOf(':', 3), v = i < 0 ? '' : m.slice(3, i);
    return Object.hasOwn(CMD, v) ? CMD[v](m.slice(i + 1)) : '';
  }
  return { cmd, read, write, append, list, del, mkdir, media, b64, dl, file,
    exists: (p) => has(p) ? 'true' : 'false',
    rename: pair((a, b) => has(a) ? move(a, b) : '') };   // Java's fsRename: '' when the source is not there
}

async function serve(core, req, key) {
  let f = null, st = null;
  try { const p = decodeURIComponent(new URL(req.url).pathname); if (p.startsWith('/' + key + '/')) { f = core.file(p.slice(key.length + 2)); st = f && fs.statSync(f); } } catch (_) {}
  if (!st || !st.isFile()) return new Response(null, { status: 404 });
  const h = { 'Content-Type': MIME[path.extname(f).slice(1).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
  let a = 0, b = st.size - 1, code = 200;
  if (m && (m[1] || m[2])) {
    a = m[1] ? +m[1] : Math.max(0, st.size - m[2]); if (m[1] && m[2]) b = Math.min(+m[2], b);
    if (a > b) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + st.size } });
    code = 206; h['Content-Range'] = 'bytes ' + a + '-' + b + '/' + st.size;
  }
  h['Content-Length'] = String(b - a + 1);
  return new Response(st.size ? Readable.toWeb(fs.createReadStream(f, { start: a, end: b })) : null, { status: code, headers: h });
}

function wire(gate, ses, out) {
  const core = create(path.join(require('electron').app.getPath('userData'), 'fs'), (u, o) => ses.fetch(u, o), out), key = crypto.randomBytes(12).toString('hex');
  ses.registerPreloadScript({ type: 'frame', id: '53on-disk', filePath: path.join(__dirname, 'disk-preload.js') });
  gate.on('fs', (e, v, a, b) => {
    const r = VERBS.has(v) ? core[v](a, b) : '';
    if (r && r.then) r.then((x) => { e.returnValue = x; }); else e.returnValue = r;
  });
  gate.handle('fs:dl', (e, url, dest) => core.dl(dest, url));
  ses.webRequest.onBeforeRequest({ urls: ['https://53on.com/__appmedia__/*'] }, (d, cb) => cb(d.frame && d.frame.origin === 'https://53on.com'
    ? { redirectURL: 'appmedia://local/' + key + d.url.slice(d.url.indexOf('/__appmedia__/') + 13) } : { cancel: true }));
  ses.protocol.handle('appmedia', (req) => serve(core, req, key));
  return core;
}

module.exports = { create, serve, wire, SCHEME };
