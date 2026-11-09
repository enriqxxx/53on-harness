'use strict';
const fs = require('fs');
const path = require('path');
const { app, screen, desktopCapturer, BrowserWindow, ipcMain, nativeImage } = require('electron');

let win = null, wired = false, seq = 0;
const jobs = new Map();

function dir() {
  const d = path.join(app.getPath('userData'), 'eyes');
  try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
  return d;
}
function stamp(kind) { return path.join(dir(), kind + '_' + Date.now().toString(36) + (++seq).toString(36) + '.png'); }   // two in one ms never share a name
function give(img, kind, o) {
  const s = img.getSize();
  if (o.data) return { ok: true, image: 'data:image/jpeg;base64,' + img.toJPEG(80).toString('base64'), w: s.width, h: s.height };
  const f = stamp(kind);
  try { fs.writeFileSync(f, img.toPNG()); } catch (e) { return { ok: false, error: String(e.message || e) }; }
  return { ok: true, file: f, w: s.width, h: s.height };
}

async function shot(o) {
  o = o || {};
  const ds = screen.getAllDisplays();
  const i = Math.min(Math.max(+o.display || 0, 0), ds.length - 1), d = ds[i];
  const sf = d.scaleFactor || 1;
  const src = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(d.size.width * sf), height: Math.round(d.size.height * sf) },
  });
  const pick = src.find((x) => x.display_id === String(d.id)) || src[i] || src[0];   // its own screen's source: their order is not the displays'
  if (!pick || pick.thumbnail.isEmpty()) return { ok: false, error: 'no screen source' };
  let img = pick.thumbnail;
  if (o.max && img.getSize().width > o.max) img = img.resize({ width: +o.max });
  return give(img, 'screen', o);
}

function wire() {
  if (wired) return;
  wired = true;
  ipcMain.on('eyes-done', (e, m) => {
    if (!m || !win || e.sender !== win.webContents) return;   // only its own window answers a grab
    const j = jobs.get(m.id);
    if (j) { jobs.delete(m.id); j(m.r || { ok: false, error: 'empty' }); }
  });
}

function ensure() {
  if (win && !win.isDestroyed()) return Promise.resolve(win);
  wire();
  win = new BrowserWindow({
    show: false, width: 320, height: 240,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true, backgroundThrottling: false,
      preload: path.join(__dirname, 'eyes-preload.js'),
    },
  });
  win.on('closed', () => { win = null; });
  const w = win;
  return w.loadFile(path.join(__dirname, '..', 'renderer', 'eyes', 'eyes.html')).then(() => w);
}

function ask(job, ms) {
  return ensure().then((w) => new Promise((resolve) => {
    const id = 'e' + (++seq);
    const t = setTimeout(() => { if (jobs.delete(id)) resolve({ ok: false, error: 'timeout' }); }, ms || 20000);
    jobs.set(id, (r) => { clearTimeout(t); resolve(r); });
    w.webContents.send('grab', Object.assign({ id: id }, job));
  })).catch((e) => ({ ok: false, error: String((e && e.message) || e) }));
}

async function camera(o) {
  o = o || {};
  const r = await ask({ device: o.device || '', max: +o.max || 0, warm: +o.warm || 12 }, 25000);
  if (!r.ok) return r;
  if (o.data) return give(nativeImage.createFromBuffer(Buffer.from(r.data, 'base64')), 'camera', o);
  const f = stamp('camera');
  try { fs.writeFileSync(f, Buffer.from(r.data, 'base64')); } catch (e) { return { ok: false, error: String(e.message || e) }; }
  return { ok: true, file: f, w: r.w, h: r.h };
}

module.exports = {
  screen: shot,
  camera: camera,
  cameras: () => ask({ list: true }, 8000),
  listen: () => ask({ listen: true }, 45000).then((r) => (r.ok ? require('./voice').hear(r.data, 'webm') : r)),
  close: () => { if (win && !win.isDestroyed()) { try { win.destroy(); } catch (_) {} } win = null; },
};
