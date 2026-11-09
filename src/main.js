'use strict';
const { app, BrowserWindow, ipcMain, dialog, session, shell, Menu, nativeImage, protocol } = require('electron');
const path = require('path');
app.setPath('userData', path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'Programs', '53on', 'data'));
protocol.registerSchemesAsPrivileged([require('./filesystem').SCHEME]);   // 💾 the page's /__appmedia__/ (filesystem.js), before ready
const { runAgent } = require('./agent.js');
const { classify } = require('./guard.js');
const { runPowerShell, runBash } = require('./spine.js');
const shellWindow = require('./shell-window.js');
const applyCorsHeaders = shellWindow.applyCorsHeaders;

const TEST = process.argv.includes('--test');
const TEST_OLLAMA = process.argv.includes('--test-ollama');


app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

app.commandLine.appendSwitch('force_high_performance_gpu');

function isOwnerLan(url) {
  let h = '';
  try { h = new URL(url).hostname; } catch (_) { return false; }
  return h === 'localhost' || /\.local$/i.test(h) || /^127\./.test(h) ||
    /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
}
app.on('certificate-error', function (e, wc, url, err, cert, cb) {
  if (!isOwnerLan(url)) return cb(false);
  console.log('[tls] owner LAN, certificate accepted: ' + url.split('/').slice(0, 3).join('/') + ' (' + err + ')');
  e.preventDefault(); cb(true);
});

let S = null;   // el cascaron vivo: { win, web, toolbar, layout, pushNav, ... }

function gate(at) {
  return {
    handle: function (ch, f) { ipcMain.handle(ch, function (e) { return at(e) ? f.apply(null, arguments) : { ok: false, error: 'origin', e: 'origin' }; }); },
    on: function (ch, f) { ipcMain.on(ch, function (e) { if (at(e)) f.apply(null, arguments); else e.returnValue = null; }); },
  };
}
function atView(e) { try { return e.sender === S.web.webContents && e.senderFrame === e.sender.mainFrame && new URL(e.senderFrame.url).origin === 'https://53on.com'; } catch (_) { return false; } }
function atBar(e) { return !!S && e.sender === S.toolbar.webContents; }
function atOptions(e) { try { const u = new URL(e.senderFrame.url); return u.protocol === 'file:' && /\/renderer\/options\.html$/.test(u.pathname); } catch (_) { return false; } }
function atPage(e) { try { return e.senderFrame === e.sender.mainFrame && new URL(e.senderFrame.url).origin === 'https://53on.com'; } catch (_) { return false; } }
const view = gate(atView), bar = gate(atBar), opts = gate(atOptions), page = gate(atPage), pane = gate(atPanel);
function atPanel(e) { return !!(S && S.panel) && e.sender === S.panel.wc() && e.senderFrame === e.sender.mainFrame; }
view.handle = (function (h) { return function (ch, f) { h(ch, /^codex:(shell:exec|fs:|search:|jobs:|open$)/.test(ch) ? require('./audit').wrap(ch, f) : f); }; })(view.handle);
app.on('web-contents-created', function (e, wc) { wc.on('will-attach-webview', function (ev) { ev.preventDefault(); }); });

function askOwner(cmd, verdict) {
  try { const w = require('./mode').says(verdict);
    if (w === 'allow') return true;
    if (w) { verdict.reason = w; return false; }   // plan: held, and the model reads why instead of guessing
  } catch (e) {}
  const opts = {
    type: verdict.danger ? 'warning' : 'question',
    buttons: ['Cancel', 'Run', 'Always allow'], defaultId: 1, cancelId: 0,
    title: 'Confirm command',
    message: (verdict.danger ? '⚠️ ' + verdict.reason : 'Confirm (' + verdict.reason + ')'),
    detail: cmd,
  };
  const r = (S && S.win) ? dialog.showMessageBoxSync(S.win, opts) : dialog.showMessageBoxSync(opts);
  if (r === 2 && !verdict.danger) { try { require('./allowlist').allow(cmd); } catch (e) {} }
  return r === 1 || r === 2;
}

function zoomWeb(delta) {
  const z = require('./shell-window.js').zoom;
  z(delta === 0 ? 1 : z() + delta * 0.1);
}

let awakeId = null;
function awake(on) {
  const psb = require('electron').powerSaveBlocker;
  if (on && awakeId === null) awakeId = psb.start('prevent-display-sleep');
  else if (!on && awakeId !== null) { psb.stop(awakeId); awakeId = null; }
}

const esc = (s) => String(s).replace(/[&<>]/g, (x) => '&#' + x.charCodeAt(0) + ';');
function toast(k, n) { if (S) S.toast(require('./i18n.js').__(k, { name: esc(n) })); }
const hand = (f) => require('./share').copy(f).then((k) => (toast(k ? 'share.' + k : 'share.fail'), k));

function popupAppMenu() {
  if (!S) return;
  const wc = S.web.webContents, __ = require('./i18n.js').__, packs = require('./packs');
  let mine = [];
  try { mine = packs.list(); } catch (_) {}
  const items = [
    { label: __('menu.fullscreen'), accelerator: 'F11', click: function () { S.win.setFullScreen(!S.win.isFullScreen()); } },
    { label: __('menu.immersive'), accelerator: 'Alt+Enter', click: function () { S.immersive(true); } },
    { label: __('menu.panel'), accelerator: 'Ctrl+J', type: 'checkbox', checked: S.panel.on(), click: function () { S.panel.bar(); } },   // the status bar; the panel opens touching it
    { label: __('menu.maps'), click: function () { apart('/?gp=memory_map&direct'); } },   // the memory live beside the chat, for everyone; direct: the map alone, no home behind it
    { label: __('menu.options'), click: function () { S.local('options.html', 'options-preload.js', { width: 600, height: 680, minWidth: 400, minHeight: 440 }); } },   // what `53on config` sets, by hand
  ];
  items.push({ type: 'separator' }, { label: __('menu.complements'), submenu: mine.map(function (c) {
    const why = c.off ? __('menu.off') : c.running || c.kind === 'plug' ? '' : c.error ? c.error.replace(/_/g, ' ') : __('menu.stopped');
    return { label: c.ttl + ' · ' + c.ver + (why ? ' · ' + why : ''), submenu: [
      { label: __('menu.on'), type: 'checkbox', checked: !c.off, click: function () { (c.off ? packs.start(c.id) : packs.stop(c.id)).catch(function () {}); } },
      { label: __('menu.open'), click: function () { openStore('/?gp=asset_pack&id=' + c.id); } },
    ].concat(c.conf && c.port ? [{ label: __('menu.settings'), enabled: c.running && !c.off, click: function () { S.extra('http://127.0.0.1:' + c.port + c.conf); } }] : []) };
  }).concat(mine.length ? [{ type: 'separator' }] : [], [{ label: __('menu.more'), click: function () { openStore('/?gp=asset_packs'); } }]) });
  const U = require('./update'), help = [
    { label: __('menu.docs'), click: function () { openStore('/?u=conditions_of_use'); } },
    { type: 'separator' },
    { label: __('menu.license'), click: showLicense },
    { label: __('menu.notices'), submenu: [
      { label: '53ON', click: function () { S.local('../THIRD_PARTY_NOTICES.txt'); } },
      { label: 'Chromium', click: function () { S.local(path.join(path.dirname(process.execPath), 'LICENSES.chromium.html')); } },
    ] },
    { label: __('menu.privacy'), click: function () { openStore('/?u=privacy'); } },
  ];
  if (!app.isPackaged || app.commandLine.hasSwitch('devtools')) help.push({ type: 'separator' }, { label: __('menu.devtools'), click: function () { wc.openDevTools({ mode: 'detach' }); } });
  if (U.on) help.push({ type: 'separator' }, { label: __('menu.updates'), click: function () {
    U.check(true).then(function (v) {
      if (v) return dialog.showMessageBox(S.win, { type: 'info', title: '53ON', message: __('update.available'), detail: __('update.availableDetail', { v: v, c: app.getVersion() }), buttons: [__('update.now'), __('update.later')], defaultId: 0, cancelId: 1, noLink: true }).then(function (r) { if (!r.response) U.download(); });
      dialog.showMessageBox(S.win, { type: v === false ? 'info' : 'warning', title: '53ON', message: __(v === false ? 'update.none' : 'update.fail'), detail: v === false ? __('update.version', { v: app.getVersion() }) : __('update.failDetail'), buttons: [__('dlg.ok')], noLink: true });
    });
  } });
  help.push({ type: 'separator' }, { label: __('menu.about'), accelerator: 'F1', click: showHelp });   // no '&': Windows eats it as a mnemonic
  items.push({ type: 'separator' }, { label: __('menu.help'), submenu: help });
  Menu.buildFromTemplate(items).popup();   // en el cursor (Menu.popup con {window} espera BrowserWindow; BaseWindow → sin window)
}
function apart(p) { S.extra('https://53on.com' + p); }
function openStore(p) {
  const wc = S.web.webContents, url = 'https://53on.com' + p;
  let at = '';
  try { at = new URL(wc.getURL()).origin; } catch (_) {}
  if (at !== 'https://53on.com') return wc.loadURL(url);
  wc.executeJavaScript('(function(){try{' + SHUT_AI + SHUT_MSGS + 'if(window.spaGo){spaGo(' + JSON.stringify(p) + ');return 1;}}catch(e){}return 0;})()')
    .then(function (ok) { if (!ok) wc.loadURL(url); }, function () { wc.loadURL(url); });
}

const PAGE_VERBS = ['add', 'recall', 'get', 'useful', 'stats', 'sleep', 'awakeReplay', 'health', 'bios', 'duerme', 'reconsolidate',
  'ingestSession', 'ownerSet', 'ownerGet', 'ownerWrite', 'ownerList', 'ownerSeed', 'painLevel', 'cansancioLevel'];
function pageVerb(id, q) {
  if (!S || S.web.webContents.isDestroyed() || PAGE_VERBS.indexOf(q && q.v) < 0) return Promise.reject(new Error('no_memory'));
  return S.web.webContents.executeJavaScript('(function(v,a){var M=null;Object.keys(window).some(function(k){var o=/^Memory/.test(k)&&window[k];return o&&typeof o.recall==="function"&&typeof o.get==="function"&&(M=o);});'
    + 'if(!M||typeof M[v]!=="function")throw new Error("no_memory");return M[v].apply(M,a);})('
    + JSON.stringify(q.v) + ',' + JSON.stringify(Array.isArray(q.a) ? q.a : []) + ')', true);
}

const BODY = '53on-body';
function wireOptions() {
  const card = async function () {
    const g = require('./settings').get(), packs = require('./packs'), mode = require('./mode'), s = packs.state('53on-ear'), ear = { installed: !!s, on: !!s && !s.off };
    const b = packs.state(BODY), body = { installed: !!b, on: !!b && !b.off };
    if (ear.on) {
      try {
        const r = await fetch('http://127.0.0.1:' + ((packs.specOf(BODY) || {}).port || 7531) + '/ear', { signal: AbortSignal.timeout(2000) });
        const j = await r.json();
        if (j.ok) Object.assign(ear, { models: j.models, ready: j.ready, pct: j.pct });
      } catch (_) {}
    }
    const i18n = require('./i18n.js');
    return { ok: true, lang: i18n.lang(), langs: i18n.langs(), t: i18n.bag('options'), zoom: require('./shell-window.js').zoom(), mode: mode.get(), modes: mode.MODES,
      door: require('./door').info(), body: body, config: g.config, ear: ear, dl: require('./share').dir(),
      packs: packs.list().map(function (c) { return { id: c.id, ttl: c.ttl, ver: c.ver, kind: c.kind, on: !c.off, running: c.running }; }) };
  };
  opts.handle('options:get', function () { return card(); });
  opts.handle('options:set', async function (e, p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return Object.assign(await card(), { ok: false, error: 'json_bad' });
    const fail = async function (error, key) { return Object.assign(await card(), { ok: false, error: error, key: key }); };
    const rest = Object.assign({}, p);
    if ('lang' in rest) {   // the Arnés's own words (i18n.js); its bar takes them on a reload
      if (!require('./i18n.js').lang(rest.lang)) return fail('value_bad', 'lang');
      delete rest.lang;
      try { S.toolbar.webContents.reload(); } catch (_) {}
    }
    if ('zoom' in rest) { if (typeof rest.zoom !== 'number') return fail('value_bad', 'zoom'); require('./shell-window.js').zoom(rest.zoom); delete rest.zoom; }
    if ('mode' in rest) { const m = require('./mode').set(rest.mode); if (!m || m.ok === false) return fail('value_bad', 'mode'); delete rest.mode; }
    if ('pack' in rest) {   // a complement's switch (D6), the same as ≡ › 🧩 Complements
      const k = rest.pack || {}, packs = require('./packs');
      if (!packs.state(k.id)) return fail('not_installed', 'pack');
      const r = await (k.on ? packs.start(k.id) : packs.stop(k.id));
      if (!r.ok) return fail(packs.code(r.error), 'pack');
      delete rest.pack;
    }
    if ('ai' in rest) { openStore('/?gp=loader_card'); return Object.assign(await card(), { shown: true }); }
    if ('theme' in rest) { S.web.webContents.loadURL('https://53on.com/m?v=settings'); return Object.assign(await card(), { shown: true }); }
    if ('open' in rest) {
      const r = await fetch('http://127.0.0.1:' + ((require('./packs').specOf(BODY) || {}).port || 7531) + '/open', { method: 'POST', signal: AbortSignal.timeout(60000) })
        .then(function (x) { return x.json(); }).catch(function () { return { ok: false, error: 'no_body' }; });
      if (!r.ok) return fail(r.error || 'no_body', 'open');
      return Object.assign(await card(), { opened: true });
    }
    if ('pickTone' in rest) {
      const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ['openFile'], filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'webm'] }] });
      if (r.canceled || !r.filePaths[0]) return card();
      const fs = require('fs'), f = r.filePaths[0], d = path.join(app.getPath('userData'), 'sounds'), to = path.join(d, 'arrival' + path.extname(f).toLowerCase());
      if (fs.statSync(f).size > 2097152) return fail('too_big', 'msg.toneFile');
      fs.mkdirSync(d, { recursive: true });
      for (const x of fs.readdirSync(d)) if (/^arrival\./.test(x)) fs.unlinkSync(path.join(d, x));
      fs.copyFileSync(f, to);
      delete rest.pickTone; rest.msg = { tone: 'custom', toneFile: to };
    }
    if ('pickDir' in rest) {
      const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ['openDirectory', 'createDirectory'] });
      if (r.canceled || !r.filePaths[0]) return card();
      delete rest.pickDir; rest.downloads = { dir: r.filePaths[0] };
    }
    let relaunched = false;
    if (Object.keys(rest).length) {
      const r = await require('./settings').set(rest, true);
      if (!r.ok) return fail(r.error, r.key);
      relaunched = r.relaunched;
    }
    return Object.assign(await card(), { relaunched: relaunched });
  });
}

function wireMessenger() {
  const m = require('./messenger'), door = require('./door');
  m.wire(S.web.webContents);
  require('./push').wire(S.web.webContents);   // Electron hears no web push by itself: its main process is the FCM client
  view.on('codex:heard', function (e, x) { m.heard(x).catch(function () {}); });
  door.handle('send', function (q) { return m.send(q); });
  door.handle('media', function (q) { return m.media(q); });
}

function wireComplements() {
  const packs = require('./packs');
  const ok = function (id) { return packs.valid(id) && id !== '53on'; };
  const progress = function (s) { try { S.web.webContents.send('complements:progress', s); } catch (_) {} };
  const clean = function (r) { return { ok: true, ver: r.ver, already: !!r.already, running: !!(r.started ? r.started.ok : require('./bodyd').info(r.id).running), error: r.started && !r.started.ok ? r.started.error : '' }; };
  let asking = false;   // one owner dialog at a time: a page cannot stack them
  const ask = function (o) {
    if (asking) return Promise.resolve(false);
    asking = true;
    return dialog.showMessageBox(S.win, Object.assign({ type: 'question', buttons: ['Cancel', 'OK'], defaultId: 0, cancelId: 0, noLink: true }, o))
      .then(function (r) { return r.response === 1; }).finally(function () { asking = false; });
  };
  const verb = function (name, f) {
    view.handle('codex:complements:' + name, function (e, id) {
      return Promise.resolve().then(function () { return f(String(id || '')); })
        .then(function (r) { if (r.error) r.error = packs.code(r.error); return r; }, function (x) { return { ok: false, error: packs.code(x) }; });
    });
  };
  verb('info', function () { return { ok: true, api: 1, app: '53ON', ver: app.getVersion() }; });
  verb('list', function () { return { ok: true, list: packs.list().map(function (c) { c.error = packs.code(c.error); return c; }) }; });
  verb('install', function (id) {
    if (!ok(id)) return { ok: false, error: 'id_bad' };
    if (packs.state(id)) return packs.update(id, progress).then(clean);
    return packs.find(id, true).then(function (f) {
      if (!f.row) return { ok: false, error: f.why };
      const r = f.row, sz = !r.sz ? '' : ' · ' + (r.sz < 1048576 ? Math.ceil(r.sz / 1024) + ' KB' : (r.sz / 1048576).toFixed(1) + ' MB');
      return ask({ message: 'Install «' + (r.ttl || id) + '»?', detail: id + ' ' + r.ver + sz + '\nRequested by https://53on.com\nIt starts with 53ON and keeps itself up to date.', buttons: ['Cancel', 'Install'] })
        .then(function (yes) { return yes ? packs.update(id, progress).then(clean) : { ok: false, error: 'owner_declined' }; });
    });
  });
  verb('update', function (id) { return ok(id) && packs.state(id) ? packs.update(id, progress).then(clean) : { ok: false, error: 'not_installed' }; });
  verb('open', function (id) {   // a complement's own page, apart
    const sp = ok(id) && packs.specOf(id);
    if (!sp || !sp.open) return { ok: false, error: 'not_installed' };
    apart(sp.open);
    return { ok: true };
  });
  verb('start', function (id) { return ok(id) && packs.state(id) ? packs.start(id).then(function (r) { return { ok: !!r.ok, error: r.ok ? '' : r.error }; }) : { ok: false, error: 'not_installed' }; });
  verb('remove', function (id) {
    if (!ok(id) || !packs.state(id)) return { ok: false, error: 'not_installed' };
    const s = packs.state(id);
    return ask({ message: 'Remove «' + id + '» ' + s.ver + '?', detail: 'Its settings stay on this PC: installing it again brings them back.', buttons: ['Cancel', 'Remove'] })
      .then(function (yes) { return yes ? packs.remove(id) : { ok: false, error: 'owner_declined' }; });
  });
}

function showHelp() {
  const v = process.versions, os = require('os'), __ = require('./i18n.js').__;
  const d = [__('about.version') + ': ' + app.getVersion(), 'Electron: ' + v.electron, 'Chromium: ' + v.chrome, 'Node.js: ' + v.node, 'V8: ' + v.v8,
    'OS: ' + os.type() + ' ' + process.arch + ' ' + os.release(), '', __('about.legal')].join('\n');
  dialog.showMessageBox(S.win, { type: 'info', title: '53ON', message: '53ON', detail: d, buttons: [__('about.copy'), __('dlg.ok')], defaultId: 1, cancelId: 1, noLink: true })
    .then(function (r) { if (r.response === 0) require('electron').clipboard.writeText(d); });
}
function showLicense() {
  const __ = require('./i18n.js').__;
  let t = 'MIT License';
  try { t = require('fs').readFileSync(path.join(__dirname, '..', 'LICENSE'), 'utf8'); } catch (_) {}
  dialog.showMessageBox(S.win, { type: 'info', title: '53ON', message: __('about.license'), detail: t, buttons: [__('dlg.ok')], noLink: true });
}

function wireKeyboard(web) {
  web.on('before-input-event', function (e, input) {
    if (input.type !== 'keyDown') return;
    const k = (input.key || '').toLowerCase();
    const mod = input.control || input.meta;
    if (k === 'f1') { e.preventDefault(); showHelp(); }   // the menu promises it
    else if (k === 'f11') { e.preventDefault(); S.win.setFullScreen(!S.win.isFullScreen()); }
    else if (k === 'escape') { if (S.escape()) e.preventDefault(); }
    else if (input.alt && k === 'enter') { e.preventDefault(); S.immersive(!S.isImmersive()); }
    else if (mod && input.shift && k === 'n') { e.preventDefault(); S.extra(); }
    else if (mod && input.code === 'KeyJ') { e.preventDefault(); S.panel.bar(); }   // as ≡ › Terminal
    else if (mod && input.code === 'Backquote') { e.preventDefault(); S.panel.toggle(true, 'terminal'); }
    else if (mod && (k === '+' || k === '=')) { e.preventDefault(); zoomWeb(+1); }
    else if (mod && k === '-') { e.preventDefault(); zoomWeb(-1); }
    else if (mod && k === '0') { e.preventDefault(); zoomWeb(0); }
    else if (mod && k === 'r' && !input.shift) { e.preventDefault(); web.reload(); }
  });
}
function wireContextMenu(web) {
  const it = function (l, k, on, fn) { return { label: l, accelerator: k, enabled: on, click: function () { web[fn](); } }; };
  web.on('context-menu', function (e, p) {
    const f = p.editFlags;
    const m = p.isEditable ? [it('Undo', 'CmdOrCtrl+Z', f.canUndo, 'undo'), it('Redo', 'CmdOrCtrl+Y', f.canRedo, 'redo'), { type: 'separator' },
      it('Cut', 'CmdOrCtrl+X', f.canCut, 'cut'), it('Copy', 'CmdOrCtrl+C', f.canCopy, 'copy'), it('Paste', 'CmdOrCtrl+V', f.canPaste, 'paste'),
      { type: 'separator' }, it('Select All', 'CmdOrCtrl+A', f.canSelectAll, 'selectAll')]
      : p.selectionText.trim() ? [it('Copy', 'CmdOrCtrl+C', true, 'copy')] : null;
    if (m) Menu.buildFromTemplate(m).popup();
  });
}

function wirePanel() {
  const audit = require('./audit'), packs = require('./packs'), __ = require('./i18n.js').__;
  const ports = function () { const l = [{ name: '53ON door', port: 7532, on: true }]; try { packs.list().forEach(function (c) { if (c.port) l.push({ name: c.ttl, port: c.port, on: c.running && !c.off }); }); } catch (_) {} return l; };
  const now = function () { let t = []; try { t = packs.tabs(); } catch (_) {} return { tabs: t, ports: ports() }; };
  const words = {}; ['output', 'problems', 'console', 'ports', 'empty', 'none', 'filter', 'off', 'close', 'clear', 'max', 'restore', 'port', 'name', 'state', 'notes', 'nonotes'].forEach(function (k) { words[k] = __('panel.' + k); });
  const notes = []; let unread = 0, paneWc = null;
  const tell = function () { if (paneWc && !paneWc.isDestroyed()) paneWc.send('panel:notes', notes, unread); };
  const tap = function (tag) {
    if (S.win.isMinimized()) S.win.restore(); S.win.show(); S.win.focus();
    S.web.webContents.executeJavaScript("document.dispatchEvent(new CustomEvent('webviewapp:notify-click',{detail:" + JSON.stringify(tag) + '}))').catch(function () {});
  };
  view.on('codex:notify', function (e, t, b, tag) {
    const n = { t: Date.now(), title: String(t || '').slice(0, 120), body: String(b || '').slice(0, 300), tag: String(tag || '').slice(0, 80) };   // the page's words, never trusted as typed
    notes.unshift(n); notes.length = Math.min(notes.length, 50); unread++; tell();
    if (!S.win.isFocused()) { const x = new (require('electron').Notification)({ title: n.title, body: n.body }); x.on('click', function () { tap(n.tag); }); x.show(); }
  });
  pane.on('panel:note', function (e, tag) { tap(String(tag || '')); });
  pane.on('panel:notes', function (e, clear) { if (clear) notes.length = 0; unread = 0; tell(); });   // the bell opened (read) or cleared
  pane.handle('panel:watch', function (e) { paneWc = e.sender; return Object.assign({ ring: audit.watch(e.sender), words: words, open: S.panel.open(), notes: notes, unread: unread }, now()); });
  pane.handle('panel:refresh', now);
  pane.on('panel:drag', function (e, on, h) { S.panel.drag(on, h); });
  pane.on('panel:toggle', function (e, on) { S.panel.toggle(on); });
  S.web.webContents.on('console-message', function (e, level, message, line, src) {
    const L = { verbose: 0, debug: 0, info: 1, warning: 2, error: 3 }, l = e && e.level !== undefined ? e.level : level;
    audit.log(typeof l === 'string' ? (L[l] || 0) : +l || 0, e && e.message !== undefined ? e.message : message, (e && e.sourceId !== undefined ? e.sourceId : src) + ':' + (e && e.lineNumber !== undefined ? e.lineNumber : line));
  });
}

function wireIpc() {
  const goHome = function (then) {
    const wc = S.web.webContents, after = function () { if (then) wc.executeJavaScript(then).catch(function () {}); };
    wc.executeJavaScript(GO_HOME_JS)
      .then(function (r) { if (r !== 'reload') return after(); wc.once('did-finish-load', after); wc.loadURL(S.HOME); })
      .catch(function () { wc.loadURL(S.HOME); });   // nothing loaded yet
  };
  bar.on('nav:home', function () { goHome(); });
  bar.on('nav:messages', function () {
    const wc = S.web.webContents;
    wc.executeJavaScript(GO_MSGS_JS).then(function (r) { if (r === 'load') wc.loadURL('https://53on.com/m'); }, function () { wc.loadURL('https://53on.com/m'); });
  });
  bar.on('nav:ai', function () { S.disk.write('Chat/max', '1'); const h = function () { goHome(OPEN_CHAT_JS); }; S.web.webContents.executeJavaScript(OPEN_AI_JS).then(function (r) { if (r === 'none') h(); }, h); });
  bar.on('app:fullscreen-toggle', function () { S.win.setFullScreen(!S.win.isFullScreen()); });
  bar.on('app:menu', function () { popupAppMenu(); });
  bar.on('app:update', function () { require('./update').download(); });   // el boton azul de la barra
  bar.on('i18n:bar', function (e) { e.returnValue = require('./i18n.js').bag('bar'); });   // the bar's own words
  bar.handle('codex:mode:get', function () { try { return { ok: true, mode: require('./mode').get(), modes: require('./mode').MODES }; } catch (x) { return { ok: false, e: String(x.message || x) }; } });
  bar.handle('codex:mode:set', function (e, m) { try { return require('./mode').set(m); } catch (x) { return { ok: false, e: String(x.message || x) }; } });
  view.on('codex:working', function (e, b) { S.win.setProgressBar(b ? 2 : -1); });
  let aiOn = false;
  const aiTell = function () { try { S.toolbar.webContents.send('nav:ai', aiOn); } catch (_) {} };
  view.on('codex:ai', function (e, on) { aiOn = !!on; aiTell(); });
  S.toolbar.webContents.on('did-finish-load', aiTell);
  const freshView = async function (clean) {
    const wc = S.web.webContents;
    if (clean) { await wc.session.clearCache(); wc.reloadIgnoringCache(); } else wc.reload();
    return { ok: true, clean: !!clean };
  };
  view.handle('codex:cache:clear', function () { return freshView(true); });
  view.on('codex:theme', function (e, t) { require('./shell-window.js').theme(t); });   // 53ON's theme: its frame follows
  view.on('codex:immersive', function (e, h) { S.immersive(h); });
  view.on('codex:awake', function (e, on) { awake(on); });
  require('./door').handle('reload', function (m) { return freshView(m.arg === 'clean'); });
  require('./door').look(function () { return { immersive: !!(S && S.isImmersive()), awake: awakeId !== null }; });
  const askPage = function (js) {
    const wc = S.web.webContents;
    try { if (wc.isDestroyed() || new URL(wc.getURL()).origin !== 'https://53on.com') return Promise.resolve(null); } catch (_) { return Promise.resolve(null); }
    let t;
    return Promise.race([wc.executeJavaScript(js, true), new Promise(function (r) { t = setTimeout(r, 2000, null); })])
      .catch(function () { return null; }).finally(function () { clearTimeout(t); });
  };
  require('./door').page(askPage);
  require('./door').busy(function () { return askPage('(window.AiMonitor&&AiMonitor.busy)?+AiMonitor.busy()||0:0').then(function (b) { return +b || 0; }); });
  view.handle('codex:overlay', function (e, msg) { try { return { ok: require('./overlay').send(msg) }; } catch (x) { return { ok: false, error: String((x && x.message) || x) }; } });
  view.handle('codex:overlay:query', function (e, q) { try { return { ok: true, data: require('./overlay').query(String(q || '')) }; } catch (x) { return { ok: false, error: String((x && x.message) || x) }; } });
  view.handle('codex:eyes:screen', function (e, o) {
    o = o || {};
    if (o.display == null) { const sc = require('electron').screen, ds = sc.getAllDisplays(), d = sc.getDisplayMatching(S.win.getBounds()); o.display = Math.max(0, ds.findIndex(function (x) { return x.id === d.id; })); }
    return require('./eyes').screen(o);
  });
  view.handle('codex:eyes:camera', function (e, o) { return require('./eyes').camera(o || {}); });
  view.handle('codex:eyes:cameras', function () { return require('./eyes').cameras(); });
  view.handle('codex:capture', function (e) { return e.sender.capturePage().then(function (i) { return 'data:image/jpeg;base64,' + i.toJPEG(85).toString('base64'); }); });
  const toBody = function (p, data) {
    const d = data ? JSON.stringify(data) : '', port = (require('./packs').specOf(BODY) || {}).port || 7531;
    return new Promise(function (ok) {
      const q = require('http').request({ host: '127.0.0.1', port: port, path: p, method: data ? 'POST' : 'GET', timeout: 30000, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } }, function (r) {
        let s = ''; r.on('data', function (c) { s += c; }); r.on('end', function () { try { ok(JSON.parse(s)); } catch (_) { ok({ ok: false, error: 'body_bad' }); } });
      });
      q.on('error', function () { ok({ ok: false, error: 'no_body' }); });
      q.on('timeout', function () { q.destroy(); ok({ ok: false, error: 'timeout' }); });
      q.end(d);
    });
  };
  const PIPE = { goto: 'POST', page: 'POST', tap: 'POST', type: 'POST', key: 'POST', hover: 'POST', drag: 'POST', longpress: 'POST', swipe: 'POST', slide: 'POST', pinch: 'POST', exists: 'POST', visible: 'POST', await: 'POST', 'wait-state': 'POST', console: 'GET', wheel: 'POST', read_page: 'POST', form_input: 'POST', scroll_to: 'POST', tabs: 'GET', tab_new: 'POST', tab_close: 'POST', network: 'GET' };
  view.handle('codex:share', async function (e, op, a, b, c) {
    let f = '';
    try {
      if (op === 'base64') f = a && require('./share').stage(/\./.test(c) ? c : '53on_' + Date.now() + '.' + (c || 'bin'), Buffer.from(String(a), 'base64'));
      else if (op === 'url') {
        const u = new URL(String(a), 'https://53on.com'), m = u.origin === 'https://53on.com' && /^\/__appmedia__\/(.+)/.exec(u.pathname);
        if (m) f = S.disk.file(decodeURIComponent(m[1]));
        else { const r = await e.sender.session.fetch(u.href); if (r.ok) f = require('./share').stage(path.basename(u.pathname), Buffer.from(await r.arrayBuffer())); }
      }
    } catch (_) {}
    if (f && require('fs').existsSync(f)) return hand(f).then((k) => ({ ok: !!k, copied: k }));
    if (op === 'base64') return toast('share.fail'), { ok: false, error: 'share_bad' };
    require('electron').clipboard.writeText(String(a == null ? '' : a)); toast('share.text'); return { ok: true, copied: 'text' };
  });
  view.handle('codex:body', async function (e, op, a) {
    a = a || {};
    if (op === 'shot') {
      const r = await toBody('/screenshot' + (+a.tabId > 1 ? '?tabId=' + +a.tabId : ''));   // the AI's tab, vscodex's tabId
      if (!r.ok) return r;
      const i = nativeImage.createFromPath(r.file), z = i.getSize();
      return { ok: !i.isEmpty(), image: 'data:image/jpeg;base64,' + i.toJPEG(80).toString('base64'), w: z.width, h: z.height };
    }
    if (op === 'route') {
      const r = String(a.route || ''), m = PIPE[r], q = a.args && typeof a.args === 'object' ? a.args : {};
      if (!m) return { ok: false, error: 'route_bad', routes: Object.keys(PIPE) };
      return m === 'GET' ? toBody('/' + r + '?' + new URLSearchParams(q)) : toBody('/' + r, q);
    }
    return { ok: false, error: 'op_bad' };
  });
  wireComplements();
  wireOptions();
  wireMessenger();
  require('./voice').wire(view, S.web.webContents, gate);   // 🗣️ the voice and the ear the phone has (VoiceBridge, SttBridge in preload.js); the body's speak uses it
  S.disk = require('./filesystem').wire(page, S.web.webContents.session, { save: require('./share').save, share: hand });   // 💾 the disk the phone has (FileSystemBridge in disk-preload.js), in <data>\fs

  function lastLine(wc) {
    let t = 0, last = '';
    return function (s) {
      const l = String(s).split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean).pop();
      if (l) last = l.slice(0, 160);
      if (last && Date.now() - t > 250 && !wc.isDestroyed()) { t = Date.now(); wc.send('codex:shell:out', last); }
    };
  }
  view.handle('codex:shell:exec', async function (evt, opts) {
    opts = opts || {};
    const command = String(opts.command || '');
    const kind = opts.kind === 'bash' ? 'bash' : 'powershell';
    const host = kind === 'bash' && opts.host ? String(opts.host) : '', shown = host ? 'ssh ' + host + ' ' + command : command;
    const verdict = classify(shown);
    if (verdict.risk !== 'safe') {
      const ok = askOwner(shown, verdict);
      if (!ok) return { held: true, reason: verdict.reason, outputText: '', exit_code: 126 };
    }
    const run = kind === 'bash' ? runBash : runPowerShell;
    const r = await run(command, { host: host, bg: !!opts.bg, timeoutMs: +opts.timeoutMs || 0, description: opts.description, ctx: opts.ctx, area: opts.area, onOut: lastLine(evt.sender) });
    return { outputText: r.outputText, exit_code: r.exit_code, timed_out: r.timed_out, truncated: r.truncated, risk: verdict.risk, bg: r.bg, jobId: r.jobId };
  });
  view.handle('codex:shell:classify', function (evt, command) { return classify(String(command || '')); });

  const nfs = require('fs'), npath = require('path'), nos = require('os');
  function _fsResolve(p) { p = String(p || '').trim(); if (!p) throw new Error('ruta vacía');
    return npath.resolve(nos.homedir(), p.replace(/^~(?=[\\/]|$)/, nos.homedir()).replace(/^\/tmp(?=[\\/]|$)/, nos.tmpdir()).replace(/^\/([a-z])(?=[\\/]|$)/i, function (m, d) { return d.toUpperCase() + ':/'; })); }
  function _fsAsk(title, detail, danger) {
    const w = require('./mode').says({ danger: !!danger, reason: title });
    if (w) return w === 'allow' ? '' : w;
    const opts = { type: danger ? 'warning' : 'question', buttons: ['Cancel', 'Apply'], defaultId: 0, cancelId: 0, title: title, message: title, detail: detail };
    return ((S && S.win) ? dialog.showMessageBoxSync(S.win, opts) : dialog.showMessageBoxSync(opts)) === 1 ? '' : 'denied: the owner did not approve';
  }
  const IMG_EXT = /[.](png|jpe?g|gif|webp|bmp)$/i;
  const IMG_MAX = 6 * 1024 * 1024;   // el base64 viaja en el prompt: una foto enorme se come la ventana
  const RH = /^((?:[^@\s:\\\/]+@)?[\w.-]{2,}):(?!\/\/)(.+)$/, R = require('./spine');
  const far = function (m, e) { return { ok: false, e: m[1] + ': ' + String(e && e.message || e) }; };
  const Q = {}, one = function (k, f) { return (Q[k] = (Q[k] || Promise.resolve()).catch(function () {}).then(f)); };
  let farN = 0;
  view.handle('codex:fs:read', function (evt, p, pages, off, lim, big) {
    const m = RH.exec(String(p || '').trim());
    if (!m) return readAt(p, pages, off, lim, big);
    const t = npath.join(nos.tmpdir(), 'far_' + process.pid + '_' + (++farN) + npath.extname(m[2]));
    return R.remoteGet(m[1], m[2]).then(function (b) {
      nfs.writeFileSync(t, b); const r = readAt(t, pages, off, lim, big); try { nfs.unlinkSync(t); } catch (_) {}
      if (r.content) r.content = r.content.split(t).join(m[0]); r.path = m[0]; return r;
    }, function (e) { return far(m, e); });
  });
  const READ_LINES = 2000, READ_NET = 200000;   // vscodex's default page, and the IPC net; the char budget lives in the glue, where the numbering is
  function readAt(p, pages, off, lim, big) {
    try {
      const abs0 = _fsResolve(p);
      if (/[.]ipynb$/i.test(abs0)) { const r = String(pages || '').split('-');
        return { ok: true, path: abs0, content: require('./docs.js').notebook(abs0, r[0], r[1]) }; }
      if (/[.]pdf$/i.test(abs0)) return { ok: true, path: abs0, content: require('./docs.js').pdf(abs0, pages) };
      if (nfs.statSync(abs0).isDirectory()) {
        const L = nfs.readdirSync(abs0, { withFileTypes: true }), n = L.filter(function (d) { return d.isFile() && IMG_EXT.test(d.name); }).length;
        return { ok: true, path: abs0, content: 'carpeta ' + abs0 + ' · ' + L.length + ' elementos' + (n ? ' · ' + n + ' imagenes: para VERLAS lee cada ruta con Read, varias en la misma vuelta' : '') + '\n'
          + L.slice(0, 300).map(function (d) { return d.isDirectory() ? '📁 ' + d.name : npath.join(abs0, d.name); }).join('\n') + (L.length > 300 ? '\n[...' + (L.length - 300) + ' mas]' : '') };
      }
      if (IMG_EXT.test(abs0)) {
        let b = nfs.readFileSync(abs0);
        const ni = nativeImage.createFromBuffer(b), sz = ni.getSize();
        if (!ni.isEmpty() && Math.max(sz.width, sz.height) > 1568) b = ni.resize(sz.width >= sz.height ? { width: 1568 } : { height: 1568 }).toJPEG(85);
        if (b.length > IMG_MAX) return { ok: false, e: 'imagen muy grande (' + Math.round(b.length / 1024) + ' KB, tope ' + (IMG_MAX / 1024) + ')' };
        return { ok: true, path: abs0, image: b.toString('base64'), bytes: b.length,
                 content: 'imagen ' + abs0 + ' (' + Math.round(b.length / 1024) + ' KB) — la estas viendo' };
      }
    } catch (e) { return { ok: false, e: String(e.message || e) }; }
    try { const abs = _fsResolve(p); let t = nfs.readFileSync(abs, 'utf8');
      const L = t.split('\n'), n = L.length - (t.endsWith('\n') ? 1 : 0);
      const a = Math.max(0, ((off | 0) || 1) - 1), z = Math.min(n, a + ((lim | 0) > 0 ? (lim | 0) : big > 0 ? n : READ_LINES));
      if (a > 0 || (lim | 0) > 0 || z < n) t = L.slice(a, z).join('\n');
      const net = big > 0 ? Math.max(READ_NET, big + 128) : READ_NET;
      if (t.length > net) t = t.slice(0, net) + '\n[...truncated]';   // the IPC net; the glue fits it to budget
      const own = (lim | 0) <= 0 && z < n;
      return { ok: true, path: abs, line: a + 1, lines: n, content: t, more: own ? n - z : 0, next: own ? z + 1 : 0 }; }
    catch (e) { return { ok: false, e: String(e.message || e) }; }
  }
  view.handle('codex:open', function (evt, p) {
    try {
      const abs = _fsResolve(p);
      if (!nfs.existsSync(abs)) return { ok: false, e: 'not found: ' + abs };
      const no = _fsAsk('Open this?', abs, false);
      if (no) return { ok: false, e: no };
      shell.openPath(abs);
      return { ok: true, path: abs };
    } catch (e) { return { ok: false, e: String(e.message || e) }; }
  });
  view.handle('codex:ask', function (evt, question, options) {
    const btns = (Array.isArray(options) ? options : String(options || '').split('|'))
      .map(function (x) { return String(x).trim(); }).filter(Boolean).slice(0, 5);
    if (btns.length < 2) return { ok: false, e: 'needs 2 to 5 options' };
    const o = { type: 'question', buttons: btns, defaultId: 0, cancelId: btns.length - 1,
                title: 'La IA te pregunta', message: String(question || '').slice(0, 400), noLink: true };
    return ((S && S.win) ? dialog.showMessageBox(S.win, o) : dialog.showMessageBox(o))
      .then(function (r) { return { ok: true, choice: btns[r.response], index: r.response }; })
      .catch(function (e) { return { ok: false, e: String(e.message || e) }; });
  });
  view.handle('codex:jobs:log',  function (e, id, n) { try { return require('./spine').jobLog(id, n); } catch (x) { return { ok: false, e: String(x.message || x) }; } });
  view.handle('codex:jobs:kill', function (e, id) { try { return require('./spine').killJob(id); } catch (x) { return { ok: false, e: String(x.message || x) }; } });
  view.handle('codex:cron:add',    function (e, w, p, l, c, o) { try { return require('./cron').add(w, p, l, c, !!o); } catch (x) { return { ok: false, e: String(x.message || x) }; } });
  view.handle('codex:cron:list',   function () { try { return require('./cron').list(); } catch (x) { return { ok: false, e: String(x.message || x) }; } });
  view.handle('codex:cron:cancel', function (e, id) { try { return require('./cron').cancel(id); } catch (x) { return { ok: false, e: String(x.message || x) }; } });
  view.handle('codex:cron:take',   function (e, skip) { try { return require('./cron').take(skip); } catch (x) { return null; } });
  view.handle('codex:cron:absorb', function (e, ch) { try { return require('./cron').absorb(ch); } catch (x) { return ''; } });
  view.handle('codex:cron:done',   function (e, id) { try { return require('./cron').done(id); } catch (x) { return { ok: false, e: String(x.message || x) }; } });  //🔎 Buscar NO cambia nada: corre solo, como read/list. La logica vive en search.js.
  view.handle('codex:search:glob', function (evt, root, pattern) {
    try { return require('./search').globFiles(_fsResolve(root), pattern); } catch (e) { return { ok: false, e: String(e.message || e) }; }
  });
  view.handle('codex:search:grep', function (evt, root, pattern, opts) {
    try { return require('./search').grep(_fsResolve(root), pattern, opts); } catch (e) { return { ok: false, e: String(e.message || e) }; }
  });
  view.handle('codex:fs:write', function (evt, p, content) {
    const m = RH.exec(String(p || '').trim());
    if (m) { content = String(content == null ? '' : content);
      const no = _fsAsk('Write file?', m[0] + '\n\n(' + content.length + ' chars)', true); if (no) return { ok: false, e: no };
      return one(m[0], function () { return R.remotePut(m[1], m[2], Buffer.from(content, 'utf8')); }).then(function (r) { return { ok: true, path: m[0], bytes: Buffer.byteLength(content), created: r.created }; }, function (e) { return far(m, e); }); }
    try { const abs = _fsResolve(p); content = String(content == null ? '' : content); const exists = nfs.existsSync(abs);
      const no = _fsAsk(exists ? 'Overwrite file?' : 'Create file?', abs + '\n\n(' + content.length + ' chars)', exists); if (no) return { ok: false, e: no };
      nfs.mkdirSync(npath.dirname(abs), { recursive: true }); nfs.writeFileSync(abs, content, 'utf8');
      return { ok: true, path: abs, bytes: Buffer.byteLength(content), created: !exists };
    } catch (e) { return { ok: false, e: String(e.message || e) }; }
  });
  function swap(where, b, find, replace, all, put) {
    const enc = b[0] === 0xFF && b[1] === 0xFE ? 'utf16le' : 'utf8', t = b.toString(enc);
    replace = String(replace == null ? '' : replace);
    if (/\r\n/.test(t) && !/(^|[^\r])\n/.test(t)) { find = find.replace(/\r?\n/g, '\r\n'); replace = replace.replace(/\r?\n/g, '\r\n'); }
    const n = t.split(find).length - 1;
    if (n === 0) return { ok: false, e: 'not found: old_string is not in the file' };
    if (n > 1 && !all) return { ok: false, e: 'ambiguous: found ' + n + ' times; add context to make it unique, or replace_all' };
    const no = _fsAsk('Edit file?', where + (n > 1 ? ' (×' + n + ')' : '') + '\n\n− ' + find.slice(0, 280) + '\n+ ' + replace.slice(0, 280), false); if (no) return { ok: false, e: no };
    return Promise.resolve(put(Buffer.from(t.split(find).join(replace), enc))).then(function () { return { ok: true, path: where, n: n }; });
  }
  view.handle('codex:fs:edit', function (evt, p, find, replace, all) {
    find = String(find == null ? '' : find); if (!find) return { ok: false, e: 'old_string is empty' };
    const m = RH.exec(String(p || '').trim());
    if (m) return one(m[0], function () { return R.remoteGet(m[1], m[2]).then(function (b) { return swap(m[0], b, find, replace, all, function (x) { return R.remotePut(m[1], m[2], x); }); }); }).catch(function (e) { return far(m, e); });
    try { const abs = _fsResolve(p); return swap(abs, nfs.readFileSync(abs), find, replace, all, function (x) { nfs.writeFileSync(abs, x); }); }
    catch (e) { return { ok: false, e: String(e.message || e) }; }
  });
}

const SHUT_AI = 'window.pteToggleAI&&pteToggleAI(false);';
const SHUT_MSGS = "var h=document.querySelector('.ch-home-btn');if(h&&h.offsetParent)h.click();";
const GO_HOME_JS = "(function(){" + SHUT_AI + SHUT_MSGS + "if(!window.spaGo)return 'reload';try{spaGo('/?gp=dashboard_provider');return 'ok';}catch(e){return 'reload';}})()";

const GO_MSGS_JS = "(function(){" + SHUT_AI + "if(location.pathname==='/m')return 'here';var b=document.getElementById('azInboxBtn');if(b){b.click();return 'ok';}return 'load';})()";
const OPEN_AI_JS =
  "(function(){return new Promise(function(ok){if(window.pteToggleAI){pteToggleAI(true);return ok('ok');}" +
  "var b=document.querySelector('.js-ai-open');if(b)b.click();var n=0;(function t(){" +
  "if(window.pteToggleAI){pteToggleAI(true);return ok('ok');}if(++n>40)return ok('none');setTimeout(t,125);})();});})()";

const OPEN_CHAT_JS =
  "(function(){return new Promise(function(ok){var n=0;(function t(){" +
  "if(window.pteToggleAI){window.pteToggleAI(true);return ok(true);}" +
  "if(++n>40)return ok(false);setTimeout(t,125);})();});})()";

function startComplements() {
  try { require('./packs').ensureAll().catch(function (e) { console.log('[complements] ' + e.message); }); } catch (_) {}
}

function boot() {
  S = shellWindow.build();
  S.win.on('closed', function () { try { require('./overlay').close(); } catch (_) {} try { require('./eyes').close(); } catch (_) {} try { require('./bodyd').haltAll(); } catch (_) {} });
  try { require('./membio').watch(S.web.webContents.session); } catch (_) {}   // the MemoriaBios engine a complement declares is the one this view loads
  require('./update').start(S);            // primer chequeo a los 90 s, luego cada hora ±10 min
  wireIpc();
  require('./bodyd').page = pageVerb;   // the MemoriaBios cable asks this view
  wireKeyboard(S.web.webContents); wireContextMenu(S.web.webContents); wirePanel();
  startComplements();
  require('./browse').wire();   // 🌐 the body's browser: 53ON's own Chromium, driven through the door (web)
  require('./door').open(7532).catch(function () {});
  require('./cli').sync();   // 🧰 the commands 53ON gives, outside and inside (Fase C)
}

if (TEST_OLLAMA) {
  const fs = require('fs');
  const OUT_FILE = path.join(app.getPath('temp'), 'ollama_fix_test.txt');
  function finish(lines) { try { fs.writeFileSync(OUT_FILE, lines.join('\n')); } catch (_) {} try { console.log('\n' + lines.join('\n')); } catch (_) {} app.quit(); }
  setTimeout(function () { finish(['⏱️ TIMEOUT global — algo colgó']); }, 45000);
  app.whenReady().then(async function () {
    const ORIGIN_URL = 'https://example.com';
    const wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    const PROBE_JS =
      "(function(){var T=function(){return AbortSignal.timeout(3000);};return Promise.all([" +
      "  fetch('http://localhost:11434/api/tags',{signal:T()}).then(function(r){return 'GET '+r.status;}).catch(function(e){return 'GET ERR:'+e.name;})," +
      "  fetch('http://localhost:11434/api/tags',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:T()}).then(function(r){return 'POST '+r.status;}).catch(function(e){return 'POST ERR:'+e.name;})" +
      "]).then(function(a){return a.join(' | ');});})()";
    let seq = 0;
    async function probe(applyFix, webSecurity, js) {
      const s = session.fromPartition('probe-' + (seq++));
      if (applyFix) applyCorsHeaders(s);
      const w = new BrowserWindow({ show: false, webPreferences: { session: s, webSecurity: !!webSecurity, allowRunningInsecureContent: !webSecurity } });
      let out = 'LOAD-ERR';
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await w.loadURL(ORIGIN_URL); out = await w.webContents.executeJavaScript(js || PROBE_JS); break; }
        catch (e) { out = 'LOAD-ERR: ' + e.message; await wait(600); }
      }
      try { w.destroy(); } catch (_) {}
      await wait(500);
      return out;
    }
    const rows = [];
    for (const ws of [false, true]) {
      for (const fix of [false, true]) {
        rows.push((ws ? '  webSecurity ON ' : '  webSecurity OFF') +
          (fix ? ' · bisturi ON  → ' : ' · bisturi OFF → ') + await probe(fix, ws));
      }
    }
    const LAN = process.argv[process.argv.indexOf('--test-ollama') + 1] || '';
    const M5 = "(function(){return fetch('" + LAN + "',{signal:AbortSignal.timeout(6000)})" +
      ".then(function(r){return 'LAN '+r.status;}).catch(function(e){return 'LAN ERR:'+e.name;});})()";
    const m5 = LAN ? await probe(true, true, M5) : 'sin url: no se midio';
    finish(['🔬 https://example.com → Ollama localhost:11434'].concat(rows,
      ['', '🔬 https://example.com → ' + (LAN || '(sin url)') + ' con webSecurity ON: ' + m5]));
  });
} else if (TEST) {
  const i = process.argv.indexOf('--test');
  const cmd = process.argv[i + 1] || '¿Qué versión de Windows corre esta PC? Usa la herramienta.';
  app.whenReady().then(async function () {
    console.log('👤 ' + cmd + '\n');
    try { await runAgent(cmd, {
      onStep: function (e) {
        if (e.type === 'tool') console.log('  · model requests: ' + e.name + '(' + e.cmd + ') [' + e.verdict.risk + (e.verdict.danger ? '/danger' : '') + ']');
        else if (e.type === 'result') console.log('  🔧 ' + e.cmd + '\n     ↳ ' + e.text.replace(/\n/g, ' ').slice(0, 120));
        else if (e.type === 'held') console.log('  🔒 HELD (' + e.reason + ')');
        else if (e.type === 'answer') console.log('\n🤖 ' + e.content);
      },
      confirm: function () { return Promise.resolve(false); },
    }); } catch (e) { console.log('⛔ ' + (e && e.message || e)); }   // no model: it says so and leaves, never hangs
    app.quit();
  });
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', function () {   // alguien intentó abrir otra → enfoca la que ya está
    if (S && S.win) { try { if (S.win.isMinimized()) S.win.restore(); S.win.show(); S.win.focus(); } catch (_) {} }
  });
  app.on('session-created', function (ses) {
    ses.on('will-download', function (e, item) {
      if (!(require('./settings').get().config.downloads || {}).ask) item.setSavePath(require('./share').free(item.getFilename()));
      item.once('done', function (e, st) { if (st === 'completed') toast('share.saved', path.basename(item.getSavePath())); });
    });
  });
  app.whenReady().then(boot);
  app.on('activate', function () { if (BrowserWindow.getAllWindows().length === 0 && !S) boot(); });
}
let quitting = false;
app.on('before-quit', function (e) {
  try { require('./overlay').close(); } catch (_) {} try { require('./eyes').close(); } catch (_) {}
  let b = null;
  try { b = require('./bodyd'); } catch (_) { return; }
  if (quitting) return;
  e.preventDefault(); quitting = true;   // the complements leave first: a memory verb in flight finishes, an idle one is gone at once
  BrowserWindow.getAllWindows().forEach(function (w) { try { w.hide(); } catch (_) {} });
  Promise.race([b.haltAll(), new Promise(function (r) { setTimeout(r, 60000); })]).then(function () { app.quit(); });
});
app.on('window-all-closed', function () { if (!TEST_OLLAMA && process.platform !== 'darwin') app.quit(); });
