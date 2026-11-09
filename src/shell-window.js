'use strict';
const { BaseWindow, WebContentsView, BrowserWindow, app, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const TOOLBAR_H = 40;                 // DIP; DEBE ser igual a titleBarOverlay.height
const HINT_W = 460, HINT_H = 60, HINT = '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:transparent;overflow:hidden}'
  + 'body{display:flex;align-items:center;justify-content:center;font:500 15px "Segoe UI",system-ui,sans-serif}'
  + 'div{padding:11px 20px;border-radius:10px;background:rgba(16,16,20,.86);color:#f3f3f3;box-shadow:0 3px 12px rgba(0,0,0,.35);white-space:nowrap;max-width:calc(100% - 64px);overflow:hidden;text-overflow:ellipsis;animation:f 3.2s ease both}'
  + 'kbd{font:600 13px "Segoe UI",sans-serif;padding:3px 9px;margin:0 5px;border:1px solid rgba(255,255,255,.4);border-bottom-width:2px;border-radius:6px}'
  + '@keyframes f{0%{opacity:0;transform:translateY(-6px)}12%,78%{opacity:1;transform:none}100%{opacity:0}}</style><div>{t}</div>';
const HOME = 'https://53on.com/?gp=dashboard_provider';   // el HOME real: el dashboard del proveedor, no el marketplace
const RENDERER = path.join(__dirname, '..', 'renderer');
let GLUE = '';
try {
  GLUE = ['codex-glue.js'].map(function (f) {
    try { return fs.readFileSync(path.join(__dirname, 'inject', f), 'utf8'); } catch (e) { return ''; }
  }).join('\n;\n');
} catch (_) {}

const PRIV = /^(localhost$|.*\.(localhost|local|internal)$|0\.|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[(::1|f[cd]|fe80))/i;
function applyCorsHeaders(ses) {
  ses.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, function (d, cb) {
    const u = /^(https?):\/\/([^/:?#]+|\[[^\]]+\])(?::(\d+))?/i.exec(d.url) || [], h = d.responseHeaders || {};
    const ollama = u[1] === 'http' && /^(localhost|127\.0\.0\.1)$/i.test(u[2] || '') && u[3] === '11434';
    if (!ollama && (u[1] !== 'https' || PRIV.test(u[2] || '') || Object.keys(h).some(function (k) { return k.toLowerCase() === 'access-control-allow-origin'; }))) return cb({});
    const o = Object.assign({}, h);
    for (const k of Object.keys(o)) if (k.toLowerCase().indexOf('access-control-') === 0) delete o[k];
    o['Access-Control-Allow-Origin'] = ['*'];
    o['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, OPTIONS'];
    o['Access-Control-Allow-Headers'] = ['*'];
    o['Access-Control-Max-Age'] = ['86400'];
    cb(Object.assign({ responseHeaders: o }, d.method === 'OPTIONS' ? { statusLine: 'HTTP/1.1 204 No Content' } : {}));
  });
}

function createSplash() {
  const splash = new BrowserWindow({
    width: 300, height: 340, frame: false, transparent: true, resizable: false,
    center: true, alwaysOnTop: true, skipTaskbar: true, backgroundColor: '#00000000',
    webPreferences: { contextIsolation: true },
  });
  wear(null, null, [splash.webContents]);
  splash.loadFile(path.join(RENDERER, 'splash.html'));
  return splash;
}

function own(u) { try { return new URL(u).origin === 'https://53on.com'; } catch (_) { return false; } }
function out(u) { if (/^https?:/i.test(u)) shell.openExternal(String(u)).catch(function () {}); }

function isInternalHost(host) {
  return /(^|\.)53on\.com$/i.test(host)
      || /(^|\.)vcorpsllc\.com$/i.test(host)
      || /(^|\.)google\.com$/i.test(host)          // login OAuth de Google
      || /accounts\.google/i.test(host);
}

const BAR_H = 32, extras = new Map();   // key → its window: one window per page, so a second click brings it back
const SPOTS = () => path.join(app.getPath('userData'), 'windows.json');
let spots = null;
function spot(key, size) {
  if (!spots) { try { spots = JSON.parse(fs.readFileSync(SPOTS(), 'utf8')) || {}; } catch (_) { spots = {}; } }
  const b = spots[key];
  if (!b) return size;
  const seen = screen.getAllDisplays().some(function (d) { const a = d.workArea; return b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y; });
  return Object.assign({}, size, seen ? { x: b.x, y: b.y } : {}, { width: b.width, height: b.height });
}
let mainWeb = null;
const load = () => { if (!spots) { try { spots = JSON.parse(fs.readFileSync(SPOTS(), 'utf8')) || {}; } catch (_) { spots = {}; } } return spots; };
function zoom(f) {
  load();
  if (f !== undefined) {
    spots.zoom = Math.round(Math.max(0.5, Math.min(3, +f || 1)) * 100) / 100;
    try { require('./packs').writeJson(SPOTS(), spots); } catch (_) {}
    if (mainWeb && !mainWeb.isDestroyed()) mainWeb.setZoomFactor(spots.zoom);
  }
  return spots.zoom || 1;
}
const THEMES = { dark: { bg: '#0f1420', fg: '#c7d2e0' }, light: { bg: '#f0f2f5', fg: '#111b21' } };
const frames = new Set(), views = new Set(), pages = new Set();
function theme(t) {
  load();
  if (THEMES[t] && t !== spots.theme) {
    spots.theme = t;
    try { require('./packs').writeJson(SPOTS(), spots); } catch (_) {}
    frames.forEach(dress); views.forEach(tint); pages.forEach(mark);
  }
  return THEMES[spots.theme] ? spots.theme : require('electron').nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}
const colors = () => THEMES[theme()];
function dress(w) {
  if (w.isDestroyed()) return frames.delete(w);
  const c = colors();
  w.setBackgroundColor(c.bg);
  if (process.platform !== 'darwin') try { w.setTitleBarOverlay({ color: c.bg, symbolColor: c.fg }); } catch (_) {}
}
function tint(v) { try { v.setBackgroundColor(colors().bg); } catch (_) { views.delete(v); } }
function mark(wc) { if (wc.isDestroyed()) return pages.delete(wc); wc.executeJavaScript('document.documentElement.dataset.theme=' + JSON.stringify(theme()), true).catch(function () {}); }
function wear(w, vs, own) {
  if (w) { frames.add(w); dress(w); w.on('closed', function () { frames.delete(w); }); }
  (vs || []).forEach(function (v) { views.add(v); tint(v); v.webContents.on('destroyed', function () { views.delete(v); }); });
  (own || []).forEach(function (wc) { pages.add(wc); wc.on('dom-ready', function () { mark(wc); }); wc.on('destroyed', function () { pages.delete(wc); }); });
}
function keep(key, w) {
  const note = function () { if (!w.isDestroyed()) spots[key] = Object.assign(w.getNormalBounds(), w.isMaximized() ? { max: 1 } : {}); };
  ['resize', 'move', 'maximize', 'unmaximize'].forEach(function (ev) { w.on(ev, note); });
  w.on('close', function () { note(); try { require('./packs').writeJson(SPOTS(), spots); } catch (_) {} });
}
function apartView(key, vp, size, b) {
  const o = extras.get(key);
  if (o) { if (o.isMinimized()) o.restore(); o.focus(); return null; }
  const c = colors(), w = new BaseWindow(Object.assign({ width: 1000, height: 760, minWidth: 360, minHeight: 300, backgroundColor: c.bg, title: '53ON',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'), titleBarStyle: 'hidden',
    ...(process.platform !== 'darwin' ? { titleBarOverlay: { color: c.bg, symbolColor: c.fg, height: BAR_H } } : {}) }, spot(key, size)));
  if (spots[key] && spots[key].max && !(size && size.show === false)) w.maximize();   // a hidden one stays hidden (maximize shows)
  keep(key, w);
  const wp = { contextIsolation: true, sandbox: true }, bar = new WebContentsView({ webPreferences: Object.assign({}, wp, b ? { preload: path.join(__dirname, b.preload) } : {}) }), view = new WebContentsView({ webPreferences: Object.assign({}, wp, vp) });
  wear(w, [view, bar], [bar.webContents]);
  w.contentView.addChildView(view); w.contentView.addChildView(bar);
  const fit = function () { const b = w.getContentBounds(); bar.setBounds({ x: 0, y: 0, width: b.width, height: BAR_H }); view.setBounds({ x: 0, y: BAR_H, width: b.width, height: Math.max(0, b.height - BAR_H) }); };
  fit(); ['resize', 'maximize', 'unmaximize', 'restore'].forEach(function (ev) { w.on(ev, fit); });
  bar.webContents.loadFile(path.join(RENDERER, b ? b.file : 'bar.html'));
  view.webContents.on('page-title-updated', function (e, t) { w.setTitle(t || '53ON'); });   // the taskbar names it
  extras.set(key, w);
  w.on('closed', function () { extras.delete(key); try { view.webContents.close(); bar.webContents.close(); } catch (_) {} });
  view.win = w; view.bar = bar.webContents;
  return view;
}
function extra(url, opens) {
  const view = apartView(url);
  if (!view) return;
  view.webContents.setWindowOpenHandler(opens);
  view.webContents.loadURL(url);
  view.webContents.on('did-finish-load', function () { view.webContents.insertCSS('#mmenu{display:none!important}#mz-search-wrap{padding-left:0!important}').catch(function () {}); });
}
function local(file, preload, size) {
  const view = apartView('local:' + file, preload ? { preload: path.join(__dirname, preload) } : {}, size);
  if (!view) return;
  const wc = view.webContents;
  wc.setWindowOpenHandler(function () { return { action: 'deny' }; });
  wear(null, null, [wc]);   // its own page: the theme goes in too
  if (!preload) {
    wc.on('will-navigate', function (e) { e.preventDefault(); });
    wc.on('dom-ready', function () { wc.insertCSS(':root[data-theme=dark]{background:' + THEMES.dark.bg + ';color:' + THEMES.dark.fg + '}').catch(function () {}); });
  }
  wc.loadFile(path.resolve(RENDERER, file));
}

function build() {
  const c = colors(), win = new BaseWindow(spot('main', {
    width: 1100, height: 840, minWidth: 520, minHeight: 480,   // 380 no cabe el strip → 520
    backgroundColor: c.bg, show: false, title: '53ON',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    titleBarStyle: 'hidden',
    ...(process.platform !== 'darwin'
      ? { titleBarOverlay: { color: c.bg, symbolColor: c.fg, height: TOOLBAR_H } }
      : { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 12, y: 12 } }),
  }));
  keep('main', win);

  const web = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',                        // TTS suena sin click
    },
  });
  const toolbar = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'toolbar-preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  wear(win, [web, toolbar], [toolbar.webContents]);

  win.contentView.addChildView(web);         // 53on (grande) PRIMERO
  win.contentView.addChildView(toolbar);     // la barra ULTIMA = pintada encima (orden = z-order, #42061)

  let immersive = false, wasFull = false, hint = null, hintT = 0, hintTop = false, lit = null;
  function light(on) {
    const psb = require('electron').powerSaveBlocker;
    if (on && lit === null) lit = psb.start('prevent-display-sleep');
    else if (!on && lit !== null) { psb.stop(lit); lit = null; }
  }
  const SB = 22, pk = load().panel || {};
  let pOn = !!pk.on, pOpen = pOn && !!pk.open, pH = +pk.h || 260, panel = null, dragging = false;
  const fitH = function (h, all) { return Math.round(Math.max(80, Math.min(h, all - 120))); };
  function pane() {
    if (panel) return panel;
    panel = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'panel-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    panel.setBackgroundColor('#00000000');
    wear(null, null, [panel.webContents]);
    win.contentView.addChildView(panel);
    panel.webContents.on('before-input-event', function (e, i) {   // its shortcuts work from inside it too, a tab's frame included
      if (i.type !== 'keyDown' || !(i.control || i.meta)) return;
      if (i.code === 'KeyJ') { e.preventDefault(); bar(); } else if (i.code === 'Backquote') { e.preventDefault(); toggle(true, 'terminal'); }
    });
    panel.webContents.loadFile(path.join(RENDERER, 'panel.html'));
    return panel;
  }
  function note() { spots.panel = { on: pOn ? 1 : 0, open: pOpen ? 1 : 0, h: pH }; try { require('./packs').writeJson(SPOTS(), spots); } catch (_) {} }
  function bar(on) {
    pOn = on === undefined ? !pOn : !!on;
    if (!pOn) { pOpen = dragging = false; web.webContents.focus(); }
    if (pOn || panel) pane().webContents.send('panel:state', pOpen);
    layout(); note();
    return pOn;
  }
  function toggle(on, tab) {
    pOpen = on === undefined ? !pOpen : !!on;
    if (pOpen) pOn = true;   // the panel stands on its bar
    pane().webContents.send('panel:state', pOpen);
    if (pOpen && tab) panel.webContents.send('panel:tab', tab);
    if (!pOpen) dragging = false;
    layout(); note();
    if (!pOpen) web.webContents.focus();
    return pOpen;
  }
  function drag(on, h) {
    dragging = !!on && pOpen;
    if (!on && h > 0) { pH = fitH(h, win.getContentBounds().height - TOOLBAR_H - SB); note(); }
    layout();
  }
  function layout() {
    const b = win.getContentBounds(), top = immersive ? 0 : TOOLBAR_H, all = Math.max(0, b.height - top);   // DIP; NO multiplicar por scaleFactor
    const sb = immersive || !pOn ? 0 : SB, ph = pOpen && sb ? fitH(pH, all - sb) : 0;
    toolbar.setBounds({ x: 0, y: 0, width: top ? b.width : 0, height: top });
    web.setBounds({ x: 0, y: top, width: b.width, height: all - sb - ph });
    if (panel) { panel.setVisible(!!sb); if (sb) panel.setBounds(dragging ? { x: 0, y: top, width: b.width, height: all } : { x: 0, y: top + all - sb - ph, width: b.width, height: ph + sb }); }
    if (hint) hint.setBounds({ x: Math.max(0, Math.round((b.width - HINT_W) / 2)), y: hintTop ? 28 : Math.max(0, b.height - HINT_H - 48), width: Math.min(HINT_W, b.width), height: HINT_H });
  }
  if (pOn) pane();
  layout();   // inicial, no solo en 'resize'
  ['resize', 'maximize', 'unmaximize', 'leave-full-screen'].forEach(function (ev) { win.on(ev, layout); });
  function repaint() { layout(); [web, toolbar].forEach(function (v) { if (!v.webContents.isDestroyed()) v.webContents.invalidate(); }); }
  ['restore', 'show'].forEach(function (ev) { win.on(ev, repaint); });
  function setImmersive(on) {
    on = !!on;
    if (on === immersive) return;
    if (on) wasFull = win.isFullScreen();
    immersive = on;
    win.setFullScreen(on || wasFull);
    layout();
    light(on);
    if (on) say(); else unsay();
  }
  win.on('leave-full-screen', function () { if (immersive) { immersive = wasFull = false; layout(); light(false); unsay(); } });
  function escape() { if (!immersive) return false; setImmersive(false); return true; }
  function say() { toast(require('./i18n.js').__('fs.exit', { key: '<kbd>Esc</kbd>' }), true); }
  function toast(t, top) {
    unsay();
    hint = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true } });
    hint.setBackgroundColor('#00000000');
    hintTop = !!top;
    win.contentView.addChildView(hint);
    layout();
    hint.webContents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(HINT.replace('{t}', () => t)));
    hintT = setTimeout(unsay, 3200);
  }
  function unsay() {
    clearTimeout(hintT);
    if (!hint) return;
    try { win.contentView.removeChildView(hint); hint.webContents.close(); } catch (_) {}
    hint = null;
  }

  toolbar.webContents.loadFile(path.join(RENDERER, 'toolbar.html'));

  const ses = web.webContents.session;
  const mine = function (u) { return own(u) || /^file:/i.test(u); }, free = function (p) { return p === 'fullscreen' || p === 'clipboard-sanitized-write'; };
  ses.setPermissionRequestHandler(function (wc, perm, cb, d) { cb(free(perm) || mine(d && d.requestingUrl)); });
  ses.setPermissionCheckHandler(function (wc, perm, origin) { return free(perm) || mine(origin); });
  applyCorsHeaders(ses);
  ses.cookies.set({ url: 'https://53on.com', name: 'DEVICE', value: 'avatarwin64', secure: true, httpOnly: false, sameSite: 'lax' })
    .then(function () { web.webContents.loadURL(HOME); }, function () { web.webContents.loadURL(HOME); });

  function opens(d) {
    try {
      const host = new URL(d.url).hostname;
      if (isInternalHost(host)) return { action: 'allow' };   // popup de login, etc.
    } catch (_) {}
    out(d.url);
    return { action: 'deny' };
  }
  web.webContents.setWindowOpenHandler(opens);
  const stay = function (e) { if (e.isMainFrame !== false && /^(https?|file):/i.test(e.url) && !own(e.url)) { e.preventDefault(); out(e.url); } };
  web.webContents.on('will-navigate', stay);
  web.webContents.on('will-redirect', stay);
  win.on('closed', function () { extras.forEach(function (w) { try { w.destroy(); } catch (_) {} }); });   // they leave with the main one

  const splash = createSplash();
  let revealed = false;
  function reveal() {
    if (revealed) return; revealed = true;
    if (!win.isVisible()) { if ((spots.main || {}).max) win.maximize(); else win.show(); }   // maximize shows it too
    if (splash) { try { splash.destroy(); } catch (_) {} }
    try { web.webContents.focus(); } catch (_) {}
    layout();                 // asegura tamaño tras el show (titleBarOverlay + show:false, #42409)
    pushNav();
  }
  web.webContents.once('did-finish-load', reveal);
  web.webContents.on('did-fail-load', function (e, code) { if (code !== -3) reveal(); });  // -3 = redirect abort
  setTimeout(reveal, 30000);   // fallback si la red tarda

  mainWeb = web.webContents;
  web.webContents.on('did-finish-load', function () {
    web.webContents.setZoomFactor(zoom());   // its owner's size of letter, every load
    if (GLUE) web.webContents.executeJavaScript(GLUE, true).catch(function () {});
    function tellChat(prompt, quien, ch) {
      var C = require('./cron.js'), id = C.post(prompt, quien, ch);
      var js = '(function(){return new Promise(function(res){var n=0;'
             + 'function listo(){return document.getElementById("am-chat-input")'
             + ' && window.AiMonitor && AiMonitor.agentRun && window.WebViewApp && WebViewApp.ai'
             + ' && ((WebViewApp.ai.getLastLoad()||{}).caps||{}).ctx > 0;}'
             + 'function go(){if(window.CodexCron&&CodexCron.wake)return res(CodexCron.wake());'
             + 'try{pteToggleAI(true)}catch(e){}'
             + 'if(!listo()){if(++n<40)return setTimeout(go,500);return res(0);}'
             + 'AiMonitor.agentRun(' + JSON.stringify(String(prompt)) + ',{channel:' + JSON.stringify(String(ch || '')) + '||AutoCall.cfg.activeChannel});'
             + 'res(1)}go()})})()';
      try {
        web.webContents.executeJavaScript(js, true).then(function (ok) {
          if (ok === 1) C.done(id);
          if (ok) return;
          try { new (require('electron').Notification)({ title: '⚠️ No pude avisarte', body: String(quien || '') }).show(); } catch (e) {}
        }).catch(function () {});
      } catch (e) {}
    }
    try { var _ud = require('electron').app.getPath('userData'); require('./mode.js').init(_ud); require('./allowlist.js').init(_ud); } catch (e) {}
    try { require('./cron.js').init(require('electron').app.getPath('userData'), function (prompt, id, ch) { tellChat(prompt, id, ch); }); } catch (e) {}
    try { require('./spine.js').onBgDone(function (info) {
      var say = function (ch) {
        tellChat('[system] Background command "' + String(info.command || '').replace(/\s+/g, ' ').slice(0, 80) + '" (' + info.id + ') completed (exit code ' + info.code + ') · output: ' + info.log, 'background', typeof ch === 'string' ? ch : '');
      };
      web.webContents.executeJavaScript('window.AiMonitor && AiMonitor.jobEnd && AiMonitor.jobEnd(' + JSON.stringify(info.id) + ')', true).then(say, function () { say(''); });
    }); } catch (e) {}
    if (process.env.CODEX_DEBUG) {
      setTimeout(function () {
        web.webContents.executeJavaScript(
          "(function(){var A=window.AutoCall;var t=A&&A.TOOLS&&A.TOOLS.some;var d=(/DEVICE=([^;]+)/.exec(document.cookie)||['','none'])[1];return '[codex-probe] cookie DEVICE='+d+' · CodexShell='+(typeof window.CodexShell)+' shellExec='+(window.CodexNative&&typeof window.CodexNative.shellExec)+' TOOLS.len='+(A&&A.TOOLS?A.TOOLS.length:'?')+' codexRegistered='+(t?A.TOOLS.some(function(e){return e.k==='codex';}):'noTOOLS');})()"
        ).then(function (s) { console.log(s); }).catch(function (e) { console.log('[codex-probe] err ' + e); });
        web.webContents.executeJavaScript(
          "new Promise(function(res){if(!navigator.geolocation)return res('no-api');var d=false;navigator.geolocation.getCurrentPosition(function(p){d=true;res('OK '+p.coords.latitude.toFixed(3)+','+p.coords.longitude.toFixed(3));},function(e){d=true;res('ERR code='+e.code+' '+e.message);},{timeout:8000,enableHighAccuracy:false});setTimeout(function(){if(!d)res('TIMEOUT');},9000);})"
        ).then(function (s) { console.log('[gps-probe] ' + s); }).catch(function (e) { console.log('[gps-probe] err ' + e); });
        web.webContents.executeJavaScript(
          "navigator.mediaDevices.getUserMedia({video:true,audio:true}).then(function(s){var v=s.getVideoTracks().length,a=s.getAudioTracks().length;s.getTracks().forEach(function(t){t.stop();});return 'OK video='+v+' audio='+a;}).catch(function(e){return 'ERR '+e.name+': '+e.message;})"
        ).then(function (s) { console.log('[media-probe] ' + s); }).catch(function (e) { console.log('[media-probe] err ' + e); });
      }, 2500);   // deja que el poll del glue registre si AutoCall llegó tarde
    }
  });

  function pushNav() {
    if (toolbar.webContents.isDestroyed()) return;
    toolbar.webContents.send('nav:state', {
      url: web.webContents.getURL(),
      title: web.webContents.getTitle(),
      loading: web.webContents.isLoading(),
    });
  }
  ['did-navigate', 'did-navigate-in-page', 'did-stop-loading', 'did-start-loading'].forEach(function (ev) {
    web.webContents.on(ev, pushNav);
  });

  win.on('focus', function () { if (!toolbar.webContents.isDestroyed()) toolbar.webContents.send('shell:focus', true); });
  win.on('blur', function () { if (!toolbar.webContents.isDestroyed()) toolbar.webContents.send('shell:focus', false); });

  return { win: win, web: web, toolbar: toolbar, layout: layout, pushNav: pushNav, TOOLBAR_H: TOOLBAR_H, HOME: HOME,
    immersive: setImmersive, isImmersive: function () { return immersive; }, escape: escape, toast: toast,
    panel: { toggle: toggle, bar: bar, drag: drag, on: function () { return pOn; }, open: function () { return pOpen; }, wc: function () { return panel && panel.webContents; } },
    extra: function (url) { return extra(url || web.webContents.getURL() || HOME, opens); }, local: local };
}

module.exports = { build: build, local: local, apartView: apartView, zoom: zoom, theme: theme, applyCorsHeaders: applyCorsHeaders, TOOLBAR_H: TOOLBAR_H, HOME: HOME };
