'use strict';
const path = require('path');
const { BrowserWindow, screen, ipcMain, powerMonitor } = require('electron');

const PAINTS = ['sticker', 'look', 'point', 'reminder', 'audio'];   // lo que se ve o se oye
let win = null, backCb = null, wired = false, ready = false;
const hotRects = new Map(), pend = [];   // pend: what arrived while the window was being born
let hotTimer = null, hotOn = false;

function build() {
  const d = screen.getPrimaryDisplay();
  const w = new BrowserWindow({
    x: d.bounds.x, y: d.bounds.y, width: d.size.width, height: d.size.height,
    frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true,
    resizable: false, movable: false, focusable: false, hasShadow: false, thickFrame: false,
    show: false,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'overlay-preload.js'),
      backgroundThrottling: false,
    },
  });
  w.setIgnoreMouseEvents(true, { forward: true });
  w.setAlwaysOnTop(true, 'screen-saver');
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  ready = false;
  w.webContents.once('did-finish-load', () => {   // a message sent before its page listens is lost: the first voice too
    if (win !== w) return;
    ready = true;
    pend.splice(0).forEach((m) => { try { w.webContents.send('action', m); } catch (_) {} });
  });
  w.loadFile(path.join(__dirname, '..', 'renderer', 'overlay', 'overlay.html'));
  w.once('ready-to-show', () => { try { w.showInactive(); } catch (_) {} });
  w.webContents.on('render-process-gone', () => {
    if (win !== w) return;
    win = null; hotRects.clear(); hotStop();
    try { w.destroy(); } catch (_) {}
    ensure();
  });
  w.on('closed', () => { if (win === w) { win = null; hotStop(); } });
  return w;
}

function ensure() {
  if (!win || win.isDestroyed()) { win = build(); wire(); }
  return win;
}

function hotStop() {
  if (hotTimer) { clearInterval(hotTimer); hotTimer = null; }
  if (hotOn && win && !win.isDestroyed()) { try { win.setIgnoreMouseEvents(true, { forward: true }); } catch (_) {} }
  hotOn = false;
}
function hotTick() {
  try {
    if (!win || win.isDestroyed() || !hotRects.size) return hotStop();
    const p = screen.getCursorScreenPoint(), b = win.getContentBounds();
    let over = false;
    for (const r of hotRects.values()) {
      if (p.x >= b.x + r.x && p.x <= b.x + r.x + r.w && p.y >= b.y + r.y && p.y <= b.y + r.y + r.h) { over = true; break; }
    }
    if (over !== hotOn) { hotOn = over; win.setIgnoreMouseEvents(!over, { forward: true }); }
  } catch (_) {}
}

function wire() {
  if (wired) return;
  wired = true;
  const mine = (e) => !!win && e.sender === win.webContents;
  ipcMain.on('overlay-msg', (e, msg) => { if (mine(e)) try { if (backCb) backCb(msg); } catch (_) {} });
  ipcMain.on('overlay-hotrect', (e, m) => {
    if (!m || !mine(e)) return;
    if (m.rect) hotRects.set(m.id, m.rect); else hotRects.delete(m.id);
    if (hotRects.size && !hotTimer) hotTimer = setInterval(hotTick, 60);
    else if (!hotRects.size) hotStop();
  });
}

function send(msg) {
  if (!msg || !msg.action) return false;
  const w = ensure();
  if (PAINTS.indexOf(msg.action) >= 0) { try { w.setAlwaysOnTop(false); w.setAlwaysOnTop(true, 'screen-saver'); } catch (_) {} }
  if (!ready) { if (pend.length < 50) pend.push(msg); return true; }
  try { w.webContents.send('action', msg); } catch (_) { return false; }
  return true;
}

function query(q) {
  if (q === 'displays') {
    const prim = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((d, i) => ({
      index: i, id: d.id, primary: d.id === prim, bounds: d.bounds, size: d.size,
      scale: d.scaleFactor, label: d.label || '',
    }));
  }
  if (q === 'idle') return { idleSec: powerMonitor.getSystemIdleTime(), state: powerMonitor.getSystemIdleState(60) };
  return null;
}

function moveToDisplay(i) {
  const ds = screen.getAllDisplays();
  if (!(i >= 0 && i < ds.length)) return false;
  const d = ds[i];
  try { ensure().setBounds({ x: d.bounds.x, y: d.bounds.y, width: d.size.width, height: d.size.height }); } catch (_) { return false; }
  return true;
}

module.exports = {
  send: send,
  query: query,
  moveToDisplay: moveToDisplay,
  onBack: (cb) => { backCb = cb; },
  alive: () => !!(win && !win.isDestroyed()),
  close: () => { hotRects.clear(); hotStop(); if (win && !win.isDestroyed()) { try { win.destroy(); } catch (_) {} } win = null; },
};
