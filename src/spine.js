'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const MAX = 1024 * 1024;            // 1 MiB (tope duro en RAM)
const DEFAULT_MS = 120000, MAX_MS = 600000;
const BOM = '﻿';              // ☠️ el BOM le dice a PS 5.1 «esto es UTF-8» y lee bien la ENTRADA
const PY = { PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' };

function runShell(kind, command, opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    const timeoutMs = Math.min(opts.timeoutMs || DEFAULT_MS, MAX_MS);
    const cwd = opts.cwd || os.homedir();
    const env = Object.assign({}, process.env, PY, opts.ctx ? { AVATAR_CTX: String(opts.ctx) } : null);
    Object.keys(env).forEach(function (k) { if (/^CLAUDE/i.test(k)) delete env[k]; });
    if (!opts.ctx) delete env.AVATAR_CTX;
    if (opts.area) env.AVATAR_AREA = String(opts.area); else delete env.AVATAR_AREA;
    try { require('./cli').withPath(env); } catch (_) {}
    const what = String(opts.description || command || '').slice(0, 120);

    let bin, args, tmpFile = null;
    if (kind === 'powershell') {
      const prologue = "$OutputEncoding=[console]::OutputEncoding=New-Object System.Text.UTF8Encoding $false\n$PSDefaultParameterValues['*:Encoding']='utf8'\n$ProgressPreference='SilentlyContinue'\n";
      const epilogue = '\nif(!$?){ Exit $(if($LASTEXITCODE){$LASTEXITCODE}else{1}) }\n';
      tmpFile = path.join(os.tmpdir(), 'spine_' + crypto.randomBytes(8).toString('hex') + '.ps1');
      try { fs.writeFileSync(tmpFile, BOM + prologue + command + epilogue, { encoding: 'utf8' }); }
      catch (e) { return resolve({ outputText: 'tmp write error: ' + e.message, exit_code: -1, duration_seconds: 0, error: true }); }
      bin = 'powershell.exe';
      args = ['-NoProfile', '-NoLogo', '-NonInteractive',
              '-ExecutionPolicy', 'Bypass', '-File', tmpFile];
    } else {                        // bash
      bin = gitBash() || 'bash';
      tmpFile = path.join(os.tmpdir(), 'spine_' + crypto.randomBytes(8).toString('hex') + '.sh');
      try { fs.writeFileSync(tmpFile, 'exec 2>&1; ' + command + '\n', { encoding: 'utf8' }); }
      catch (e) { return resolve({ outputText: 'tmp write error: ' + e.message, exit_code: -1, duration_seconds: 0, error: true }); }
      args = opts.host ? ['-lc', 'exec ssh -o BatchMode=yes -- "$1" \'f=$(mktemp) && trap "rm -f \\"$f\\"" EXIT && cat >"$f" && bash "$f"\' <"$2"', 'ssh', String(opts.host), tmpFile.replace(/\\/g, '/')]
        : ['-l', tmpFile.replace(/\\/g, '/')];
    }

    const cleanup = function () {
      if (!tmpFile) return;
      try { fs.unlinkSync(tmpFile); }
      catch (_) { setTimeout(function () { try { fs.unlinkSync(tmpFile); } catch (__) {} }, 500); }
    };
    if (opts.bg) {
      const log = path.join(os.tmpdir(), 'job_' + crypto.randomBytes(6).toString('hex') + '.log');
      try {
        const out = fs.createWriteStream(log, { flags: 'a' });
        const bgc = spawn(bin, args, { cwd: cwd, env: env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        bgc.stdout.pipe(out, { end: false }); bgc.stderr.pipe(out, { end: false });
        var jid = 'j' + crypto.randomBytes(3).toString('hex');
        JOBS.set(jid, { pid: bgc.pid, sh: kind === 'bash' && tmpFile, log: log, command: what, t0: Date.now(), vivo: true });
        bgc.on('close', function (code) { cleanup(); jobEnd(jid, out, code); });
      } catch (e) { return resolve({ outputText: 'bg spawn error: ' + e.message, exit_code: -1, duration_seconds: 0, error: true }); }
      return resolve({ outputText: log, bg: true, jobId: jid, exit_code: 0, duration_seconds: 0 });
    }
    let child;
    try {
      child = spawn(bin, args, { cwd: cwd, env: env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      cleanup();
      return resolve({ outputText: 'spawn error: ' + e.message, exit_code: -1, duration_seconds: 0, error: true });
    }

    let out = '', cap = false, moved = null;
    const M = opts.max || MAX;
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    const add = function (d) { if (moved) return void moved.w.write(d); if (out.length < M) out += d; else cap = true; if (opts.onOut) opts.onOut(d); };
    child.stdout.on('data', add); child.stderr.on('data', add);

    const t0 = Date.now();
    const timer = setTimeout(function () {
      const log = path.join(os.tmpdir(), 'job_' + crypto.randomBytes(6).toString('hex') + '.log'), id = 'j' + crypto.randomBytes(3).toString('hex');
      moved = { id: id, w: fs.createWriteStream(log, { flags: 'a' }) }; moved.w.write(out);
      JOBS.set(id, { pid: child.pid, sh: kind === 'bash' && tmpFile, log: log, command: what, t0: t0, vivo: true });
      resolve({ outputText: log, bg: true, jobId: id, timed_out: true, exit_code: 0, duration_seconds: timeoutMs / 1000 });
    }, timeoutMs);

    child.on('error', function (e) { clearTimeout(timer); cleanup(); resolve({ outputText: 'spawn error: ' + e.message, exit_code: -1, duration_seconds: 0, error: true }); });
    child.on('exit', function () { setTimeout(function () { try { child.stdout.destroy(); child.stderr.destroy(); } catch (_) {} }, 500); });
    child.on('close', function (code) {                    // 'close' no 'exit': streams cerrados
      clearTimeout(timer); cleanup();
      if (moved) return jobEnd(moved.id, moved.w, code);
      const dur = (Date.now() - t0) / 1000;
      out = out.replace(/\r\n/g, '\n');
      if (tmpFile) {                          // the temp script never reaches the model, in any of its spellings
        const fw = tmpFile.replace(/\\/g, '/');
        [tmpFile, fw, '/' + fw[0].toLowerCase() + fw.slice(2), path.basename(tmpFile)].forEach(function (p) { out = out.split(p).join('<script>'); });
      }
      if (!opts.max && out.length > 30000) {
        const f = path.join(os.tmpdir(), 'out_' + crypto.randomBytes(6).toString('hex') + '.log');
        try { fs.writeFileSync(f, out); } catch (_) {}
        out = out.slice(0, 12000) + '\n[... ' + (out.length - 24000) + ' chars cut · all ' + out.length + ' in ' + f + ': Read it with offset/limit or grep it ...]\n' + out.slice(-12000);
      }
      resolve({ outputText: out, exit_code: code == null ? 1 : code, duration_seconds: +dur.toFixed(2), truncated: cap });
    });
  });
}

const runPowerShell = function (cmd, opts) { return runShell('powershell', cmd, opts); };
let _gb;
function gitBash() {
  if (_gb !== undefined) return _gb;
  _gb = '';
  const c = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], 'C:\\Program Files']
    .filter(Boolean).map(function (r) { return path.join(r, 'Git', 'bin', 'bash.exe'); });
  for (const p of c) { try { if (fs.existsSync(p)) { _gb = p; break; } } catch (e) {} }
  return _gb;
}
const JOBS = new Map();
function jobLog(id, lines) {
  const j = JOBS.get(id);
  if (!j) return { ok: false, e: 'no such task ' + id };
  let t = '';
  try { t = fs.readFileSync(j.log, 'utf8'); } catch (e) { return { ok: false, e: 'no output yet' }; }
  const L = t.replace(/\r\n/g, '\n').split('\n');
  const n = +lines > 0 ? +lines : 60;
  return { ok: true, vivo: j.vivo, code: j.code, text: L.slice(-n).join('\n') };
}
function jobEnd(id, w, code) {
  const j = JOBS.get(id) || {};
  const told = function () {
    j.vivo = false; j.code = code;
    try { _bgDone({ id: id, code: code, log: j.log, command: j.command }); } catch (e) { console.error('bgDone', e); }
  };
  try { w.end('\n[exit ' + code + ']\n', told); } catch (_) { told(); }
}
function killJob(id) {
  const j = JOBS.get(id);
  if (!j) return { ok: false, e: 'no such task ' + id };
  if (!j.vivo) return { ok: false, e: 'ese trabajo ya habia terminado' };
  killTree(j.pid, j.sh);
  return new Promise(function (r) { let n = 0; (function w() { if (!j.vivo || ++n > 50) return r(j.vivo ? { ok: false, e: 'sigue vivo tras matarlo' } : { ok: true }); setTimeout(w, 100); })(); });
}
function killTree(pid, sh) {
  if (process.platform !== 'win32') { try { process.kill(pid); } catch (_) {} return; }
  const tk = function () { try { spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).on('error', function () {}); } catch (_) {} };
  if (!sh) return tk();
  try { spawn(gitBash() || 'bash', ['-c', 'for p in /proc/[0-9]*; do mapfile -d "" A <$p/cmdline 2>/dev/null; [[ "${A[*]}" == *"$K"* ]] && read g <$p/pgid && kill -9 -- -$g; done'],
    { env: Object.assign({}, process.env, { K: path.basename(sh) }), stdio: 'ignore', windowsHide: true }).on('exit', tk).on('error', tk); } catch (_) { tk(); }
}
let _bgDone = function () {};
function onBgDone(fn) { if (typeof fn === 'function') _bgDone = fn; }
const runBash = function (cmd, opts) { return runShell('bash', cmd, opts); };
const sq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'", rq = (p) => /^~(\/|$)/.test(p) ? '"$HOME"' + sq(p.slice(1)) : sq(p);
const getSh = (p) => 'wc -c < ' + rq(p) + ' && base64 < ' + rq(p);
const fromGet = (t) => { const m = /^\s*(\d+)\n([A-Za-z0-9+\/=\n]*)$/.exec(t), b = m && Buffer.from(m[2], 'base64'); if (!b || b.length !== +m[1]) throw new Error('the read came with extra text, nothing written: ' + t.slice(0, 200)); return b; };
const putSh = (p, b) => 'f=' + rq(p) + '; [ -e "$f" ] || echo new; mkdir -p -- "$(dirname -- "$f")" && base64 -d > "$f" <<\'B64\'\n' + b.toString('base64').replace(/.{76}/g, '$&\n') + '\nB64';
const rerr = (r) => { if (r.timed_out) throw new Error('no answer in time; it goes on as job ' + r.jobId); if (r.exit_code) throw new Error(r.outputText.trim() || 'exit ' + r.exit_code); return r; };
function remoteGet(host, p) { return runBash(getSh(p), { host: host, max: 64 << 20 }).then(rerr).then(function (r) { if (r.truncated) throw new Error('over 48 MB: nothing was read; work it with Bash host'); return fromGet(r.outputText); }); }
function remotePut(host, p, b) { return runBash(putSh(p, b), { host: host }).then(rerr).then(function (r) { return { created: /^new/.test(r.outputText) }; }); }
module.exports = { onBgDone, jobLog, killJob, runPowerShell, runBash, runShell, remoteGet, remotePut, getSh, putSh, fromGet };

if (require.main === module) {
  (async function () {
    const T = [];
    const shot = async (name, kind, cmd, opts) => {
      const r = await runShell(kind, cmd, opts);
      T.push({ name, kind, ...r });
    };
    await shot('1 basico',        'powershell', 'Write-Output "hola desde PowerShell"');
    await shot('2 encoding-utf8', 'powershell', 'Write-Output "cafe ñoño 日本 — €$£"');
    await shot('3 exit-code',     'powershell', 'Write-Output "antes del fallo"; cmd /c exit 3');
    await shot('4 stderr',        'powershell', 'Write-Error "esto es un error"');
    await shot('5 timeout-2s',    'powershell', 'Start-Sleep -Seconds 10; Write-Output "no deberia verse"', { timeoutMs: 2000 });
    await shot('6 bash',          'bash',       'echo "hola desde $(uname -s) · pwd=$(pwd)"');
    await shot('7 bash-exit',     'bash',       'echo salida; exit 7');
    await shot('8 truncado',      'powershell', '1..200000 | ForEach-Object { "linea $_ con relleno para llenar el buffer rapido" }');

    for (const r of T) {
      const body = String(r.outputText).replace(/\n/g, '\\n');
      console.log(
        `[${r.name}] exit=${r.exit_code} ${r.duration_seconds}s` +
        (r.timed_out ? ' TIMEOUT' : '') + (r.truncated ? ' TRUNC' : '') +
        `  ->  ${body.slice(0, 90)}${body.length > 90 ? '…(' + body.length + ' ch)' : ''}`
      );
    }
  })();
}
