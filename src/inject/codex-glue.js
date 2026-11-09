(function () {
  if (window.__codexGlue) return;   // una vez por vida de pagina (F5 real re-inyecta: ventana nueva)
  window.__codexGlue = true;

  var TOOLS = [
    { code: 'PowerShell', params: 'command:string · timeout?:ms · description?:string · run_in_background?:bool',
      desc: 'Run a Windows PowerShell 5.1 command on this PC; returns its output.',
      example: 'PowerShell(command:"Get-Process | Select -First 5")' },
    { code: 'Bash', params: 'command:string · timeout?:ms · description?:string · run_in_background?:bool · host?:string',
      desc: 'Run a Git Bash command on this PC (or an ssh host); returns its output.',
      example: 'Bash(command:"npm test", timeout:300000)' },
    { code: 'Grep', params: 'pattern:string · path?:string · glob?:string · type?:string · output_mode?:string · -A?:int · -B?:int · -C?:int · -n?:bool · -i?:bool · -o?:bool · head_limit?:int · offset?:int · multiline?:bool',
      desc: 'Search file contents with a regex (ripgrep).',
      example: 'Grep(pattern:"shellExec", glob:"*.js", output_mode:"content")' },
    { code: 'open_path', params: 'path:string',
      desc: 'Open a file or folder on the owner screen.',
      example: 'open_path(path:"Documents/report.html")' },
    { code: 'TaskStop', params: 'task_id:string',
      desc: 'Stop a background task.',
      example: 'TaskStop(task_id:"j4f2a1")' },
  ];
  var READ_OUT = 70000, TOK = 2.8;
  var FILES = [
    { code: 'Read', params: 'file_path:string · offset?:int · limit?:int · pages?:string · allow_large?:bool', out: 1e9,
      desc: 'Read a file (absolute or owner-home path; host:path over ssh): text with line numbers, images, PDFs by pages; a folder lists its entries. allow_large reads one over the usual limits, up to what still fits in your context.',
      example: 'Read(file_path:"Documents/app.js", offset:1, limit:200)' },
    { code: 'Write', params: 'file_path:string · content:string',
      desc: 'Create or overwrite a file (host:path over ssh); creates its folders. An .svg renders.',
      example: 'Write(file_path:"Documents/hi.txt", content:"Hi")' },
    { code: 'Edit', params: 'file_path:string · old_string:string · new_string:string · replace_all?:bool',
      desc: 'Replace old_string with new_string (host:path over ssh). old_string must be exact and unique unless replace_all; an empty new_string deletes.',
      example: 'Edit(file_path:"Documents/a.txt", old_string:"old", new_string:"new")' },
    { code: 'Glob', params: 'pattern:string · path?:string',
      desc: 'Find files by pattern (* ? **), sorted by modification time. path narrows (default: the owner home).',
      example: 'Glob(pattern:"**/*.js", path:"Documents")' },
  ];
  function has(L) { return function (code) { return L.some(function (t) { return t.code === code; }); }; }

  var wsUp;
  function bare(p) { return /^[^\\\/:]+$/.test(p); }
  function ws(cb) { var FS = window.FileSystem; FS ? FS.init(function () { cb(FS.scope('Workspace')); }) : cb(); }
  function fitRead(r, big) {
    var t = r.content || '';
    if (!t) return '(empty)';
    if (r.line) t = t.replace(/\r?\n$/, '').split(/\r?\n/).map(function (l, i) { return (r.line + i) + '\t' + l; }).join('\n');
    var L = t.split('\n'), kept = L.length, body = t, more = r.more || 0, next = r.next || 0, B = big || READ_OUT;
    if (t.length > B) {
      var R = B - 128, out = [], u = 0, i = 0;   // 128 of room for the tail
      for (; i < L.length; i++) { var q = L[i].length + (out.length ? 1 : 0); if (u + q > R) break; out.push(L[i]); u += q; }
      if (!out.length) { body = L[0].slice(0, R - 30) + '\n(line cut: ' + L[0].length + ' chars)'; kept = 1; }   // one line over the whole budget: cut with its mark, never hang
      else { body = out.join('\n'); kept = out.length; }
      more = (r.lines || 0) - ((r.line || 1) - 1 + kept); next = (r.line || 1) + kept;
    }
    return body + (more > 0 ? '\n(\u2026 ' + more + ' more lines' + (big ? ', over the room left this turn' : '') + ': Read with offset ' + next + ')' : '');
  }
  function room(ch) {
    var u; try { u = window.AutoCall.ctxUsage(ch || AutoCall.cfg.activeChannel); } catch (e) {}
    return u && u.pct != null ? Math.max(READ_OUT, Math.min((u.budget - u.used) * 0.7, u.ctx / 4) * TOK | 0) : 0;
  }
  function inWs(p, cb) { bare(p) ? ws(function (F) { F ? F.existsAsync(p, function (y) { cb(y && wsFs(F)); }) : cb(); }) : cb(); }
  function wsFs(F) {
    function get(p) { return new Promise(function (y) { F.readAsync(p, function (t) { y(t == null ? '' : String(t)); }); }); }
    function put(p, t, r) { r.ok = F.write(p, t); r.path = p; r.ws = 1; return r; }
    return {
      read: function (p, pg, off, lim, big) { return get(p).then(function (t) {
        var L = t.split('\n'), n = L.length - (t.endsWith('\n') ? 1 : 0);
        var a = Math.max(0, ((off | 0) || 1) - 1), z = Math.min(n, a + ((lim | 0) > 0 ? (lim | 0) : big > 0 ? n : 2000));
        var own = (lim | 0) <= 0 && z < n;
        if (!(a > 0 || (lim | 0) > 0 || z < n)) return { ok: true, line: 1, lines: n, content: t, more: 0, next: 0 };
        return { ok: true, line: a + 1, lines: n, content: L.slice(a, z).join('\n'), more: own ? n - z : 0, next: own ? z + 1 : 0 }; }); },
      write: function (p, c) { c = c == null ? '' : String(c); return Promise.resolve(put(p, c, { bytes: new Blob([c]).size })); },
      edit: function (p, f, s, all) { return get(p).then(function (t) {
        var n = f ? t.split(f = String(f)).length - 1 : 0;
        return !n ? { e: 'not found: old_string is not in the file' }
          : n > 1 && !all ? { e: 'ambiguous: found ' + n + ' times; add context to make it unique, or replace_all' }
          : put(p, t.split(f).join(s == null ? '' : s), { n: n });
      }); },
    };
  }
  function wsList(g, cb) {
    var re = RegExp('^' + g.replace(/^(\*\*\/)+/, '').replace(/[.+^$(){}|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
    ws(function (F) {
      function go() { wsUp = 1; cb(F.list('').filter(function (n) { return bare(n) && F.exists(n) && re.test(n); })); }
      !F ? cb([]) : wsUp ? go() : F.preloadScope(go);
    });
  }

  function truthy(v) {
    if (v === true) return true;
    if (v == null || v === false) return false;
    return !/^(false|no|0|off|null|undefined|)$/i.test(String(v).trim());
  }
  function ms(v) { v = +v || 0; return v < 1000 ? v * 1000 : v; }

  window.CodexShell = {
    tools: {
      list: function () { return TOOLS; },
      has: has(TOOLS),
      dispatch: function (call, cb, ch) {
        var code = call.tool, args = call.args || {}, N = window.CodexNative;
        if (args.file_path == null && args.path != null) args.file_path = args.path; else if (args.path == null && args.file_path != null) args.path = args.file_path;
        var _d = TOOLS.concat(FILES).filter(function (t) { return t.code === code; })[0];
        if (_d) {
          var _m = _d.params.split(/[·,]/).map(function (x) { return x.trim().split(':')[0].trim(); })
            .filter(function (x) { return x && x.slice(-1) !== '?'; })
                    .filter(function (x) { return x && args[x] == null; });   // '' no es un parametro: una tool sin params no puede exigir ninguno · absent = missing; '' is a value (empty file, deletion)
          if (_m.length) { cb({ ok: false, e: 'missing param: ' + _m.join(', ') + ' \u00b7 e.g. ' + _d.example }); return; }
        }
        if (!N) { cb({ ok: false, e: 'codex_bridge_missing' }); return; }
        var _fh = /^(Glob|Grep|open_path)$/.test(code) && /^((?:[^@\s:\\\/]+@)?[\w.-]{2,}):(?!\/\/)/.exec(String(args.path || (code === 'Glob' && args.pattern) || ''));
        if (_fh) { cb({ ok: false, e: 'host:path works in Read/Write/Edit only · for ' + _fh[1] + ': Bash(host:"' + _fh[1] + '", command:"ls -la ... / grep -rn ...")' }); return; }
        if (code === 'TaskStop') {
          var _j = N.jobs; if (!_j) { cb({ ok: false, e: 'codex_bridge_missing' }); return; }
          if (!args.task_id) { cb({ ok: false, e: 'missing param: task_id' }); return; }
          return void _j.kill(args.task_id).then(function (r) {
            r && r.ok ? cb({ ok: true, result: 'stopped ' + args.task_id }) : cb({ ok: false, e: (r && r.e) || 'stop_failed' });
          }).catch(function (e) { cb({ ok: false, e: String(e && e.message || e) }); });
        }
        if (code === 'Glob' || code === 'Grep') {
          var _s = N.search; if (!_s) { cb({ ok: false, e: 'codex_bridge_missing' }); return; }
          var g = String(args.pattern || '*').replace(/\\/g, '/'), G = /^((?:[a-z]:)?\/(?:[^*?[{\/]*\/)*)(.*)$/i.exec(g),
            _w = code !== 'Grep' && !G && !args.path, _p = code === 'Grep' ? _s.grep(args.path || '.', args.pattern, args)
            : !G ? _s.glob(args.path || '.', g)   // no path = the owner home, where relative paths resolve
            : /[*?[{]/.test(G[2]) ? _s.glob(G[1], '/' + G[2]) : _s.glob(g, '*');
          _p.then(function (r) {
            if (!r.ok) { cb({ ok: false, e: r.e }); return; }
            if (r.text != null) { cb({ ok: true, result: r.text }); return; }   // Grep: Claude Code's own words
            (_w ? wsList : function (x, f) { f([]); })(g, function (w) {
              var h = w.concat(r.hits), n = w.length + r.total;
              cb({ ok: true, result: (h.length ? h.join('\n') + (n > h.length ? '\n(Showing ' + h.length + ' of ' + n + ' matching files; ' + (n - h.length)
                + ' more are not listed. Narrow the pattern or path to see the rest.)' : '') : 'No files found') + (r.cut ? '\n(Stopped at 30 s: narrow the path or pattern.)' : '') });
            });
          }).catch(function (e) { cb({ ok: false, e: String(e && e.message || e) }); });
          return;
        }
        if (code === 'PowerShell' || code === 'Bash') {
          if (args.host && code !== 'Bash') { cb({ ok: false, e: 'host is Bash only: Bash(host:"' + args.host + '", command:"...")' }); return; }
          if (!N.shellExec) { cb({ ok: false, e: 'codex_bridge_missing' }); return; }
          var u; try { u = window.AutoCall && AutoCall.ctxUsage && AutoCall.ctxUsage(ch || (AutoCall.cfg && AutoCall.cfg.activeChannel)); } catch (e) {}
          N.shellExec({ kind: code === 'Bash' ? 'bash' : 'powershell', command: args.command || '', host: code === 'Bash' && args.host ? String(args.host) : '',
            bg: truthy(args.run_in_background), timeoutMs: ms(args.timeout), description: String(args.description || args.label || ''), area: ch || '',   // her section: the hidden id her memory verbs need in the console too
            ctx: u && u.pct != null ? String(Math.round((1 - u.pct) * 100)) : '' })
            .then(function (r) {
              var text = (r.outputText || '(no output)');
              if (r.bg) { cb({ ok: true, job: r.jobId, result: (r.timed_out ? '[still running at ' + Math.round(Math.min(ms(args.timeout) || 120000, 600000) / 1000) + ' s: nothing was killed, it went on in the background] ' : '')
                + 'Command running in background with ID: ' + r.jobId + '. Output is being written to: ' + text + '. You will be notified when it completes — do not poll that file or sleep while waiting. Read the file only if you need a line it prints before you can go on.' }); return; }
              if (r.exit_code) text = '[exit ' + r.exit_code + ']\n' + text;
              if (r.truncated) text = '[...output truncated]\n' + text;
              if (r.held) cb({ ok: false, e: 'denied: ' + (r.reason || 'the owner did not approve') });
              else cb({ ok: true, result: text });
            })
            .catch(function (e) { cb({ ok: false, e: String(e && e.message || e) }); });
          return;
        }
        if (code === 'open_path') {
          if (!N.open) { cb({ ok: false, e: 'codex_open_missing' }); return; }
          N.open(args.path).then(function (r) { (r && r.ok) ? cb({ ok: true, result: 'opened ' + r.path }) : cb({ ok: false, e: (r && r.e) || 'open_error' }); })
            .catch(function (e) { cb({ ok: false, e: String(e && e.message || e) }); });
          return;
        }
        if (!N.fs) { cb({ ok: false, e: 'codex_fs_missing' }); return; }
        function ok(txt) { cb({ ok: true, result: txt }); }
        function ko(r) { cb({ ok: false, e: (r && r.e) || 'fs_error' }); }
        function fail(e) { cb({ ok: false, e: String(e && e.message || e) }); }
        function art(r, txt, c) { var o = { ok: true, result: txt }; if (/\.svg$/i.test(r.path) && c != null) o.url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(c); cb(o); }
        if (!/^(Read|Write|Edit)$/.test(code)) return void cb({ ok: false, e: 'unknown tool: ' + code });
        var P = String(args.file_path || args.path);
        function at(r) { return r.path + (r.ws ? ' (workspace)' : ''); }
        inWs(P, function (D) {
          D = D || N.fs;
          if (code === 'Read') { var big = truthy(args.allow_large) ? room(ch) : 0; return void D.read(P, args.pages, args.offset, args.limit, big).then(function (r) {
            if (!(r && r.ok)) return ko(r);
            if (r.image) return cb({ ok: true, result: r.content, image: r.image });
            ok(fitRead(r, big));
          }).catch(fail); }
          if (code === 'Write') return void D.write(P, args.content).then(function (r) { (r && r.ok) ? art(r, (r.created ? 'created ' : 'overwritten ') + at(r) + ' (' + r.bytes + ' bytes)', args.content) : ko(r); }).catch(fail);
          D.edit(P, args.old_string, args.new_string, truthy(args.replace_all)).then(function (r) {
            if (!(r && r.ok)) return ko(r);
            var t = 'edited ' + at(r) + (r.n > 1 ? ' (' + r.n + ' times)' : '');
            /\.svg$/i.test(r.path) ? D.read(r.path).then(function (x) { art(r, t, x && x.content); }, function () { ok(t); }) : ok(t);
          }).catch(fail);
        });
      },
    },
  };
  var _dispatch = window.CodexShell.tools.dispatch;
  window.CodexShell.tools.dispatch = function (call, cb, ch) {
    _dispatch(call, function (r) {
      var C = window.CodexNative && CodexNative.cron, k = ch || (window.AutoCall && AutoCall.cfg && AutoCall.cfg.activeChannel) || '';
      if (!C || !C.absorb) return cb(r);
      C.absorb(k).then(function (t) {
        if (!t) return cb(r);
        r = Object.assign({}, r);
        if (r.ok) r.result = (r.result == null ? '' : String(r.result)) + '\n\n' + t; else r.e = String(r.e || '') + '\n\n' + t;
        cb(r);
        try { window.CodexCron && CodexCron.wake && CodexCron.wake(); } catch (e) {}   // the queue row forgets them too
      }, function () { cb(r); });
    }, ch);
  };

  (function reg() {
    var A = window.AutoCall;
    if (!A || !A.TOOLS) return void setTimeout(reg, 200);   // el glue puede entrar antes que el motor
    if (!A.TOOLS.some(function (t) { return t.k === 'codex'; }))
      A.TOOLS.push({ k: 'codex', on: 1, g: 'CodexShell', t: 1, l: '💻 Arnés', r: '88' });
  })();
  var FT = { tools: { list: function () { return FILES; }, has: has(FILES), dispatch: window.CodexShell.tools.dispatch } };
  try { Object.defineProperty(window, 'FileTools', { value: FT, enumerable: true }); } catch (e) { window.FileTools = FT; }
  (function sec() {
    var S = window.SubAgents; if (!S || !S.tools) return void setTimeout(sec, 200);
    var d = S.tools.dispatch, q = function (s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; };
    S.tools.dispatch = function (call, cb, ch) {
      var t = call.tool, a = call.args || {}, to = a.to;
      if (t !== 'ListAgents' && (t !== 'SendMessage' || !to || S.live().some(function (x) { return x.id === to; }))) return d(call, cb, ch);
      var m = function (k) { window.CodexShell.tools.dispatch({ tool: 'Bash', args: { command: 'm ' + t + (to ? ' ' + q(to) + ' ' + q(a.message || '') : '') } }, k, ch); };
      if (t === 'SendMessage') return m(cb);
      m(function (r) { d(call, function (s) { cb({ ok: !!r.ok, result: (r.ok ? r.result : r.e) + '\n' + s.result }); }, ch); });   // the sections, then her subagents
    };
  })();
  var busy = false;
  function sync() {
    var M = window.AiMonitor, c = window.AutoCall && AutoCall.cfg, N = window.CodexNative;
    var b = !!(M && M.turnOf && c && c.sessions && Object.keys(c.sessions).some(function (ch) { return M.turnOf(ch); }));
    if (b !== busy && N && N.working) { busy = b; N.working(b); }
  }
  ['autocall:session-updated', 'autocall:speak-ended'].forEach(function (e) { document.addEventListener(e, sync); });
  if (window.CodexNative && CodexNative.onShellOut) CodexNative.onShellOut(function (line) {
    var c = window.AutoCall && AutoCall.cfg, ch, h, i, s;
    if (!c || !c.sessions) return;
    for (ch in c.sessions) {
      h = c.sessions[ch].history || [];
      for (i = h.length - 1; i >= 0 && i >= h.length - 4; i--) {
        s = (h[i].thinking || []).filter(function (t) { return t.ok == null && /^(Bash|PowerShell)$/.test(t.tool); }).pop();
        if (s) { s.tail = line; AutoCall.emit('autocall:session-updated', { channel: ch }); return; }
      }
    }
  });
  document.addEventListener('click', function (e) {
    var N = window.CodexNative, M = window.AiMonitor, c = window.AutoCall && AutoCall.cfg;
    var row = e.target.closest && e.target.closest('#am-turn-row'), pk = document.getElementById('am-job-peek');
    if (!row || !N || !N.jobs || !M || !c) return;
    var j = M.turnOf(c.activeChannel);
    if (pk) { clearInterval(pk._t); pk.remove(); return; }
    if (!j || !j.job) return;
    pk = document.createElement('div'); pk.id = 'am-job-peek';
    pk.innerHTML = '<pre class="am-think-content"></pre><button type="button" class="am-copy-btn">Stop</button>';
    pk.lastChild.onclick = function () { N.jobs.kill(j.job); };
    var tick = function () {
      var r = document.getElementById('am-turn-row'), now = M.turnOf(c.activeChannel);
      if (!now || now.job !== j.job || !r) { clearInterval(pk._t); pk.remove(); return; }
      if (pk.nextSibling !== r) r.parentNode.insertBefore(pk, r);
      N.jobs.log(j.job, 8).then(function (x) { pk.firstChild.textContent = x.ok ? (x.text || '…') : x.e; });
    };
    tick(); pk._t = setInterval(tick, 2000);
  });

  var aiSay = function () { try { if (window.CodexNative && CodexNative.ai) CodexNative.ai(typeof window.ai === 'function' && window.ai()); } catch (e) {} };
  if (!window.__codexAi) { window.__codexAi = 1; document.addEventListener('ai:gate', aiSay); }
  aiSay();
})();
