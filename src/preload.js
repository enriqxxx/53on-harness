'use strict';
const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('CacheBridgeDesktop', { clearCache: function () { ipcRenderer.invoke('codex:cache:clear'); } });
contextBridge.exposeInMainWorld('ThemeBridgeDesktop', { setTheme: function (t) { ipcRenderer.send('codex:theme', String(t)); } });
const frame = () => new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
contextBridge.exposeInMainWorld('ScreenBridgeDesktop', {
  setSystemBarsHidden: function (h) { ipcRenderer.send('codex:immersive', !!h); },
  capture: function (ex) {
    let h = []; try { h = ex ? Array.from(document.querySelectorAll(String(ex))) : []; } catch (_) {}
    const v = h.map(function (e) { const o = e.style.visibility; e.style.visibility = 'hidden'; return o; });
    return frame().then(function () { return ipcRenderer.invoke('codex:capture'); }).finally(function () { h.forEach(function (e, i) { e.style.visibility = v[i]; }); });
  },
});
contextBridge.exposeInMainWorld('BodyBridgeDesktop', { shot: function (tab) { return ipcRenderer.invoke('codex:body', 'shot', { tabId: tab }); },
  route: function (r, args) { return ipcRenderer.invoke('codex:body', 'route', { route: r, args: args }); } });
const share = function (op) { return function (a, b, c) { return ipcRenderer.invoke('codex:share', op, a, b, c); }; };
contextBridge.exposeInMainWorld('ShareBridgeDesktop', { shareUrl: share('url'), shareBase64: share('base64'), shareText: share('text') });
contextBridge.exposeInMainWorld('EyesBridgeDesktop', {
  screen: function () { return ipcRenderer.invoke('codex:eyes:screen', { data: 1, max: 1600 }); },
  camera: function () { return ipcRenderer.invoke('codex:eyes:camera', { data: 1, max: 1280 }); },
});
contextBridge.exposeInMainWorld('PowerBridgeDesktop', { keepAwake: function (on) { ipcRenderer.send('codex:awake', !!on); } });
contextBridge.exposeInMainWorld('NotifyBridgeDesktop', { notify: function (t, b, tag) { ipcRenderer.send('codex:notify', String(t || ''), String(b || ''), String(tag || '')); } });

const answer = function (cb, o) { webFrame.executeJavaScript('(function(f,p){typeof f==="function"&&f(p)})(window[' + JSON.stringify(String(cb)) + '],' + JSON.stringify(JSON.stringify(o)) + ')').catch(function () {}); };
let playing = null, rec = null;
function hush() { if (playing) { try { playing.pause(); } catch (_) {} playing = null; } try { speechSynthesis.cancel(); } catch (_) {} }
function system(text, voice, rate, pitch, volume, cb) {
  const u = new SpeechSynthesisUtterance(String(text)), v = speechSynthesis.getVoices().filter(function (x) { return x.name === voice; })[0];
  if (v) u.voice = v;
  u.rate = +rate || 1; u.pitch = +pitch || 1; u.volume = volume == null ? 1 : +volume;
  u.onend = function () { answer(cb, { ok: true }); };
  u.onerror = function (e) { answer(cb, { ok: false, e: 'system_' + ((e && e.error) || 'tts') }); };
  speechSynthesis.speak(u);
}
contextBridge.exposeInMainWorld('VoiceBridge', {
  isReady: function () { return true; },
  speak: function (text, pack, voice, rate, pitch, volume, cb) {
    hush();
    if (!pack || pack === 'native') return system(text, voice, rate, pitch, volume, cb);
    if (pack !== 'edge') return answer(cb, { ok: false, e: 'pack_' + pack });
    ipcRenderer.invoke('voice:synth', { text: String(text), voice: voice, rate: rate, pitch: pitch }).then(function (r) {
      if (!r.ok) return answer(cb, { ok: false, e: r.e });
      const a = playing = new Audio('data:audio/mpeg;base64,' + r.b64);
      a.volume = Math.max(0, Math.min(1, volume == null ? 1 : +volume));
      a.onended = function () { if (playing === a) playing = null; answer(cb, { ok: true, backend: voice || 'edge' }); };
      a.onerror = function () { answer(cb, { ok: false, e: 'play' }); };
      a.play().catch(function () { answer(cb, { ok: false, e: 'play' }); });
    }, function () { answer(cb, { ok: false, e: 'bridge' }); });
  },
  cancel: hush,
  voicesFor: function (pack) {
    if (pack === 'edge') return ipcRenderer.sendSync('voice:voices');
    return JSON.stringify(speechSynthesis.getVoices().map(function (v) { return { id: v.name, name: v.name, lang: v.lang }; }));
  },
});
function listen(cb, lang, keep) {
  if (rec) rec();
  let end = null, cut = false;   // cut: cancelled before the mic opened
  const me = rec = function () { if (end) end(!keep); else cut = true; };
  navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(function (stream) {
    if (cut) { stream.getTracks().forEach(function (t) { t.stop(); }); if (rec === me) rec = null; return; }
    const ctx = new AudioContext(), an = ctx.createAnalyser(), lvl = new Uint8Array(an.fftSize), mr = new MediaRecorder(stream), parts = [], t0 = Date.now();
    let spoke = false, quiet = 0, dropped = false;
    ctx.createMediaStreamSource(stream).connect(an);
    end = function (drop) { dropped = dropped || !!drop; if (mr.state !== 'inactive') mr.stop(); };
    const tick = setInterval(function () {
      an.getByteTimeDomainData(lvl);
      let m = 0; for (let i = 0; i < lvl.length; i++) m = Math.max(m, Math.abs(lvl[i] - 128));
      if (m > 12) { spoke = true; quiet = 0; } else if (!keep && spoke && (quiet += 100) >= 1200) end();
      if (Date.now() - t0 > (spoke || keep ? 30000 : 8000)) end();
    }, 100);
    mr.ondataavailable = function (e) { if (e.data && e.data.size) parts.push(e.data); };
    mr.onstop = function () {
      clearInterval(tick); stream.getTracks().forEach(function (t) { t.stop(); }); ctx.close().catch(function () {});
      if (rec === me) rec = null;
      if (dropped) return;
      if (!spoke) return answer(cb, { ok: false, e: 'no_speech' });
      new Blob(parts).arrayBuffer().then(function (buf) {
        const b = new Uint8Array(buf); let s = '';
        for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768));
        return ipcRenderer.invoke('stt:hear', btoa(s), 'webm');
      }).then(function (r) { answer(cb, r.ok ? { ok: true, text: r.text, final: true, lang: lang || 'es-ES' } : { ok: false, e: r.e }); }, function () { answer(cb, { ok: false, e: 'stt' }); });
    };
    mr.start(250);
  }, function () { if (rec === me) rec = null; if (!cut) answer(cb, { ok: false, e: 'mic' }); });
}
contextBridge.exposeInMainWorld('SttBridge', {
  isAvailable: function () { return ipcRenderer.sendSync('stt:ready') === true; },
  recognize: function (cb, lang, continuous) { listen(cb, lang, !!continuous); },
  cancel: function () { if (rec) rec(); },
});


contextBridge.exposeInMainWorld('CodexNative', {
  shellExec: function (opts) { return ipcRenderer.invoke('codex:shell:exec', opts); },
  classify: function (command) { return ipcRenderer.invoke('codex:shell:classify', command); },
  platform: function () { return 'win64'; },
  working: function (b) { ipcRenderer.send('codex:working', !!b); },
  ai: function (on) { ipcRenderer.send('codex:ai', !!on); },   // the page's AI alive or not (its ai:gate): the bar's ✦ follows
  onShellOut: function (cb) { ipcRenderer.on('codex:shell:out', function (_e, t) { cb(t); }); },
  jobs: {
    log:  function (id, n) { return ipcRenderer.invoke('codex:jobs:log', id, n); },
    kill: function (id) { return ipcRenderer.invoke('codex:jobs:kill', id); },
  },
  cron: {
    add:    function (w, p, l, c, o) { return ipcRenderer.invoke('codex:cron:add', w, p, l, c, o); },   // o: once, a cron's next match only
    list:   function () { return ipcRenderer.invoke('codex:cron:list'); },
    cancel: function (id) { return ipcRenderer.invoke('codex:cron:cancel', id); },
    take:   function (skip) { return ipcRenderer.invoke('codex:cron:take', skip); },   // skip: the chats that work
    absorb: function (ch) { return ipcRenderer.invoke('codex:cron:absorb', ch); },
    done:   function (id) { return ipcRenderer.invoke('codex:cron:done', id); },
  },
  search: {
    glob: function (root, pattern) { return ipcRenderer.invoke('codex:search:glob', root, pattern); },
    grep: function (root, pattern, opts) { return ipcRenderer.invoke('codex:search:grep', root, pattern, opts); },
  },
  ask: function (q, opts) { return ipcRenderer.invoke('codex:ask', q, opts); },
  heard: function (m) { ipcRenderer.send('codex:heard', { id: m && m.id, sender_id: m && m.sender_id }); },
  overlay: {
    paint: function (msg) { return ipcRenderer.invoke('codex:overlay', msg); },
    query: function (q) { return ipcRenderer.invoke('codex:overlay:query', q); },
  },
  eyes: {
    screen:  function (o) { return ipcRenderer.invoke('codex:eyes:screen', o); },
    camera:  function (o) { return ipcRenderer.invoke('codex:eyes:camera', o); },
    cameras: function () { return ipcRenderer.invoke('codex:eyes:cameras'); },
  },
  complements: {
    info:    function () { return ipcRenderer.invoke('codex:complements:info'); },
    list:    function () { return ipcRenderer.invoke('codex:complements:list'); },
    install: function (id) { return ipcRenderer.invoke('codex:complements:install', String(id)); },
    update:  function (id) { return ipcRenderer.invoke('codex:complements:update', String(id)); },
    start:   function (id) { return ipcRenderer.invoke('codex:complements:start', String(id)); },
    open:    function (id) { return ipcRenderer.invoke('codex:complements:open', String(id)); },
    remove:  function (id) { return ipcRenderer.invoke('codex:complements:remove', String(id)); },
    onProgress: function (cb) { ipcRenderer.on('complements:progress', function (_e, s) { try { cb(s); } catch (x) {} }); },
  },
  open: function (p) { return ipcRenderer.invoke('codex:open', p); },
  fs: {
    read:  function (p, pages, off, lim, big) { return ipcRenderer.invoke('codex:fs:read', p, pages, off, lim, big); },
    write: function (p, content) { return ipcRenderer.invoke('codex:fs:write', p, content); },
    edit:  function (p, find, replace, all) { return ipcRenderer.invoke('codex:fs:edit', p, find, replace, all); },
  },
});
