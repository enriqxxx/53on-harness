'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { app } = require('electron');

const OWN = '.owned';
const dir = () => path.join(app.getPath('userData'), 'bin');
const unix = (p) => String(p).replace(/\\/g, '/');
const q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";   // one bash word, whatever it holds
const here = '"$(dirname "$0")"';
const DOOR = `const [q, arg] = process.argv.slice(2), rid = 'c' + process.pid;
if (!q || q === 'h' || q === 'help') { console.log('53on <verb> [arg] · list · update · upgrade [pack] · install <pack> · remove <pack> · start|stop|restart <pack> · config [json] · version · reload [clean] · bin'); process.exit(0); }
const done = (j, c) => { console.log(JSON.stringify(j)); process.exit(c); };
setTimeout(() => done({ ok: false, error: 'timeout' }, 1), /^(update|upgrade|install|remove|start|stop|restart|config)$/.test(q) ? 900000 : 15000);
const w = new WebSocket('ws://127.0.0.1:7532');
w.onerror = () => done({ ok: false, error: 'no_door' }, 1);
w.onopen = () => w.send(JSON.stringify(Object.assign({ action: '_query', q: q, id: rid }, arg ? { arg: arg } : {})));
w.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id === rid) { delete m.type; delete m.id; done(m, m.ok === false ? 1 : 0); } };
`;

function gitBash() {
  return [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], 'C:\\Program Files'].filter(Boolean)
    .map((r) => path.join(r, 'Git', 'bin', 'bash.exe')).find((p) => { try { return fs.existsSync(p); } catch (_) { return false; } }) || '';
}
function wanted() {
  const packs = require('./packs'), out = {}, gb = gitBash(), cmds = ['53on'];
  out['.node'] = require('./run').launcher(7532);   // 53ON runs them: no Node on the PC, none in the launcher
  out['.53on.js'] = DOOR;
  out['53on'] = '#!/usr/bin/env bash\nexec ' + here + '/.node ' + here + '/.53on.js "$@"\n';
  for (const id of packs.installed()) {
    const s = packs.state(id), sp = packs.specOf(id);
    if (!sp) continue;
    for (const [n, a] of Object.entries(sp.bin)) {
      if (out[n]) continue;   // first come keeps it: two complements never share a name, and 53on is the Arnés's
      const f = q(unix(path.resolve(s.dir, a[0]))), rest = a.slice(1).map(q).join(' ');
      out[n] = '#!/usr/bin/env bash\n' + (/\.js$/.test(a[0]) ? 'exec ' + here + '/.node ' + f : 'BODY_NODE=' + here + '/.node exec bash ' + f) + (rest ? ' ' + rest : '') + ' "$@"\n';
      cmds.push(n);
    }
  }
  if (process.platform === 'win32')
    for (const n of cmds) out[n + '.cmd'] = gb ? '@"' + gb + '" "%~dp0' + n + '" %*\r\n' : '@echo 53ON: ' + n + ' needs Git Bash (git-scm.com) & exit /b 1\r\n';
  return { out: out, cmds: cmds };
}

function onPath(d) {
  const mark = path.join(d, '.path');
  try { if (fs.readFileSync(mark, 'utf8') === d) return; } catch (_) {}
  if (process.platform !== 'win32' || !app.isPackaged) return;   // a test or a run from source never touches the owner's PATH
  const ps = "$k='HKCU:\\Environment';$v=[string](Get-Item $k).GetValue('Path','','DoNotExpandEnvironmentNames');" +
    "if(($v -split ';') -notcontains $env:BIN53){$t=if($v -match '%'){'ExpandString'}else{'String'};" +
    "Set-ItemProperty $k Path ((@($v.TrimEnd(';'),$env:BIN53) -ne '') -join ';') -Type $t;" +
    "Add-Type -Namespace W -Name U -MemberDefinition '[DllImport(\"user32.dll\",CharSet=CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr h,uint m,UIntPtr w,string l,uint f,uint t,out UIntPtr r);';" +
    "$r=[UIntPtr]::Zero;[void][W.U]::SendMessageTimeout([IntPtr]0xffff,0x1A,[UIntPtr]::Zero,'Environment',2,5000,[ref]$r)}";
  cp.execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { env: Object.assign({}, process.env, { BIN53: d }), windowsHide: true, timeout: 30000 },
    (e) => { if (!e) try { fs.writeFileSync(mark, d); } catch (_) {} });
}

function sync() {
  const d = dir();
  try {
    fs.mkdirSync(d, { recursive: true });
    const w = wanted();
    let had = [];
    try { had = JSON.parse(fs.readFileSync(path.join(d, OWN), 'utf8')); } catch (_) {}
    for (const n of had) if (!(n in w.out)) try { fs.unlinkSync(path.join(d, n)); } catch (_) {}   // nobody gives it any more
    for (const [n, t] of Object.entries(w.out)) {
      const f = path.join(d, n);
      let old = null;
      try { old = fs.readFileSync(f, 'utf8'); } catch (_) {}
      if (old !== t) { fs.writeFileSync(f + '.tmp', t); fs.renameSync(f + '.tmp', f); }
    }
    fs.writeFileSync(path.join(d, OWN), JSON.stringify(Object.keys(w.out)));
    onPath(d);
    return { ok: true, dir: d, commands: w.cmds };
  } catch (e) { return { ok: false, error: 'bin_write', dir: d }; }
}

let reg = '', regAt = 0;
function regPath() {
  if (process.platform !== 'win32' || Date.now() - regAt < 10000) return reg;
  regAt = Date.now();
  const one = (k) => { try { return (/\sREG_(?:EXPAND_)?SZ\s+(.*)/.exec(cp.execFileSync('reg', ['query', k, '/v', 'Path'], { encoding: 'utf8', windowsHide: true, timeout: 3000 })) || [])[1] || ''; } catch (_) { return ''; } };
  return (reg = one('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment') + ';' + one('HKCU\\Environment'));
}

function withPath(env, fresh) {
  const key = (n) => Object.keys(env).find((x) => x.toUpperCase() === n) , k = key('PATH') || 'PATH', have = new Set(String(env[k] || '').toLowerCase().split(path.delimiter));
  const add = (fresh === undefined ? regPath() : fresh).replace(/%([^%]+)%/g, (m, n) => env[key(n.toUpperCase())] || m).split(';').map((p) => p.trim())
    .filter((p) => p && !have.has(p.toLowerCase()) && have.add(p.toLowerCase()));
  env[k] = dir() + path.delimiter + (env[k] || '') + (add.length ? path.delimiter + add.join(path.delimiter) : '');
  return env;
}

require('./door').handle('bin', () => sync());
module.exports = { sync: sync, dir: dir, withPath: withPath };
