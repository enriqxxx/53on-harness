'use strict';
const crypto = require('crypto'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const KEY = '6A5AA1D4EAFF4E9FB37E23D68491D6F4', VOICE_EDGE = 'es-CO-SalomeNeural';
const DOOR = 'wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1';
const LIST = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=' + KEY;
const HEAD = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
  Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold' };

const pct = (n, x) => { x = Math.round(((x == null ? 1 : +x) - 1) * 100); return x ? ' ' + n + '="' + (x < 0 ? '' : '+') + x + '%"' : ''; };
function ssml(v, text, rate, pitch) {
  const p = pct('rate', rate) + pct('pitch', pitch), t = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="' + v.split('-').slice(0, 2).join('-') + '"><voice name="' + v + '">'
    + (p ? '<prosody' + p + '>' + t + '</prosody>' : t) + '</voice></speak>';
}
function synthOnce(text, voice, rate, pitch) {
  return new Promise((done, fail) => {
    const s = Math.floor(Date.now() / 1000) + 11644473600, id = crypto.randomUUID().replace(/-/g, '');
    const gec = crypto.createHash('sha256').update((s - s % 300) + '0000000' + KEY).digest('hex').toUpperCase();
    const ws = new WebSocket(DOOR + '?Ocp-Apim-Subscription-Key=' + KEY + '&Sec-MS-GEC=' + gec + '&Sec-MS-GEC-Version=1-143.0.3650.96&ConnectionId=' + id, { headers: HEAD });
    const parts = [], ts = new Date().toString();
    let to = setTimeout(() => end(new Error('edge_timeout')), 15000);
    const end = (e) => { if (!to) return; clearTimeout(to); to = 0; try { ws.close(); } catch (_) {} if (e) fail(e); else done(Buffer.concat(parts)); };
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      ws.send('X-Timestamp:' + ts + '\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}');
      ws.send('X-RequestId:' + id + '\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:' + ts + 'Z\r\nPath:ssml\r\n\r\n' + ssml(voice, text, rate, pitch));
    };
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') { const b = Buffer.from(e.data); parts.push(b.subarray(2 + b.readUInt16BE(0))); }   // [2 B header length][header][mp3]
      else if (e.data.includes('Path:turn.end')) end();
    };
    ws.onerror = ws.onclose = () => end(new Error('edge_ws'));
  });
}
async function synth(text, voice, rate, pitch) {
  let err = null;
  for (let i = 0; i < 3; i++) {   // a cold socket can close with no audio: again, never 0 bytes
    try { const b = await synthOnce(text, voice || VOICE_EDGE, rate, pitch); if (b.length) return b; } catch (e) { err = e; }
    await new Promise((r) => setTimeout(r, 250 * (i + 1)));
  }
  throw err || new Error('edge_silent');
}
let list = null, known = '[]';   // the page asks for them synchronously (Android's voicesFor returns a string)
function voices() {
  return list || (list = fetch(LIST).then((r) => { if (!r.ok) throw new Error('voices_' + r.status); return r.json(); })
    .then((l) => { const v = l.map((x) => ({ id: x.ShortName, name: x.ShortName.split('-')[2].replace(/Neural$/, ''), lang: x.Locale, gender: x.Gender })); known = JSON.stringify(v); return v; })
    .catch((e) => { list = null; throw e; }));
}
function organ(p, body, ms) {
  const port = (require('./packs').specOf('53on-body') || {}).port || 7531, data = JSON.stringify(body);
  return new Promise((done) => {
    const q = http.request({ host: '127.0.0.1', port: port, path: p, method: 'POST', timeout: ms, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (r) => {
      let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { done(JSON.parse(d)); } catch (_) { done({ ok: false, error: 'organ_bad' }); } });
    });
    q.on('error', () => done({ ok: false, error: 'no_body' }));
    q.on('timeout', () => { q.destroy(); done({ ok: false, error: 'organ_timeout' }); });
    q.end(data);
  });
}
async function hear(b64, ext) {
  const f = path.join(os.tmpdir(), 'arnes_mic_' + process.pid + '_' + Date.now() + '.' + (/^[a-z0-9]{1,5}$/.test(ext) ? ext : 'webm'));
  fs.writeFileSync(f, Buffer.from(String(b64 || ''), 'base64'));
  try { const r = await organ('/asr', { audioPath: f }, 180000); return r.ok ? { ok: true, text: String(r.text || '') } : { ok: false, e: r.error || 'asr' }; }
  finally { fs.unlink(f, () => {}); }
}
let dec = null, decT = null, decN = 0;
const decWait = {};
function decWin() {
  clearTimeout(decT);
  decT = setTimeout(() => { if (dec && !dec.isDestroyed()) dec.destroy(); }, 60000);
  if (dec && !dec.isDestroyed()) return dec.ready;
  const w = dec = new (require('electron').BrowserWindow)({ show: false, webPreferences: { sandbox: true, contextIsolation: true, preload: path.join(__dirname, 'decoder-preload.js') } });
  w.on('closed', () => { if (dec === w) dec = null; for (const k in decWait) decWait[k]('decoder_gone'); });
  return (w.ready = w.loadFile(path.join(__dirname, '..', 'renderer', 'decoder.html')).then(() => w));
}
async function pcm(file) {
  let b;
  try { b = fs.readFileSync(String(file || '')); } catch (_) { return { ok: false, error: 'no_file' }; }
  if (b.length > 64 << 20) return { ok: false, error: 'too_big' };
  const w = await decWin(), id = ++decN;
  return new Promise((done) => {
    const t = setTimeout(() => decWait[id]('decode_timeout'), 60000);
    decWait[id] = (e, u8) => {
      clearTimeout(t); delete decWait[id];
      if (e) return done({ ok: false, error: e.split(':')[0], why: e });
      const out = path.join(os.tmpdir(), 'arnes_pcm_' + process.pid + '_' + id + '.f32');
      fs.writeFileSync(out, Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength));
      done({ ok: true, path: out, n: u8.byteLength / 4, rate: 16000 });
    };
    w.webContents.send('dec:do', id, b);
  });
}
function decoder(gate) {
  gate((e) => !!dec && e.sender === dec.webContents).on('dec:done', (e, id, err, u8) => {
    const f = decWait[id];
    if (f) f(err ? 'decode_bad: ' + String(err).slice(0, 160) : '', u8 instanceof Uint8Array ? u8 : new Uint8Array(0));
  });
  require('./door').handle('decode', (q) => pcm(q.path));
}

async function VOICE(a) {
  var A = window.AutoCall, W = function () { return window.WebViewApp || {}; };
  if (!W().voice && A && A.loadScripts) await new Promise(function (ok) { A.loadScripts((A.MODULES || []).filter(function (m) { return m.name === 'Voice.app.js'; }), ok); });
  var V = W(), d = (V.voice && V.voice.getDefaults()) || {};
  if (!V.voice) return { ok: false, e: 'no_voice' };
  if (d.pack === 'edge') return { ok: false, e: 'edge', edge: d.voice || '', rate: d.rate, pitch: d.pitch };   // the Arnés synthesizes it
  if (d.pack !== 'azure' || !d.az || !d.az.k || !d.voice) return a.say ? new Promise(function (ok) { V.voice.speak(a.text, {}, function (r) { ok(r && r.ok ? { ok: true, said: 1 } : { ok: false, e: (r && r.e) || 'native' }); }); }) : { ok: false, e: 'native' };
  if (!V.voiceAzure) {   // the bridge fetches it, at its ?v, as soon as its card says azure: that copy is awaited, never a second one
    var s = document.querySelector('script[src*="/Voice.azure.js"]');
    if (s) await new Promise(function (ok) { s.addEventListener('load', ok); s.addEventListener('error', ok); });
    if (!V.voiceAzure) return { ok: false, e: 'no_azure_js' };
  }
  var r = await new Promise(function (ok) { V.voiceAzure.synth(a.text, { voice: d.voice, style: a.style || d.style || '', rate: d.rate != null ? d.rate : 1, pitch: d.pitch != null ? d.pitch : 1 }, ok); });
  if (!r || !r.ok) return { ok: false, e: (r && r.e) || 'azure' };
  var b = new Uint8Array(await r.blob.arrayBuffer()), t = '';
  for (var i = 0; i < b.length; i += 32768) t += String.fromCharCode.apply(null, b.subarray(i, i + 32768));
  return { ok: true, b64: btoa(t), voice: r.backend || d.voice };
}
async function say(view, q, ms) {
  const text = String((q && q.text) || ''), style = String((q && q.style) || '').replace(/[^a-z-]/g, '');
  let r = { e: 'view' }, to;
  try {
    if (view && !view.isDestroyed() && new URL(view.getURL()).origin === 'https://53on.com') r = await Promise.race([view.executeJavaScript('(' + VOICE + ')(' + JSON.stringify({ text: text, style: style, say: !!(q && q.say) }) + ')', true),
      new Promise((ok) => (to = setTimeout(ok, ms || 2e4 + 90 * text.length, { e: 'page_timeout' })))]);
  } catch (e) { r = { e: 'page: ' + e.message }; }
  clearTimeout(to);
  if (r && r.ok) return r;
  const why = (r && r.e) || 'page';
  if (why !== 'edge') return { ok: false, error: 'no_voice', why: why };
  try { return { ok: true, b64: (await synth(text, r.edge, r.rate, r.pitch)).toString('base64'), voice: r.edge || VOICE_EDGE }; } catch (e) { return { ok: false, error: e.message, why: why }; }
}
async function pageLang(view) {
  try {
    if (!view || view.isDestroyed() || new URL(view.getURL()).origin !== 'https://53on.com') return { ok: false, error: 'view' };
    const l = String(await view.executeJavaScript('document.documentElement.lang || ""', true)).toLowerCase();
    return /^[a-z]{2}/.test(l) ? { ok: true, lang: l.slice(0, 2) } : { ok: false, error: 'no_lang' };
  } catch (_) { return { ok: false, error: 'view' }; }
}
function wire(gate, view, mk) {
  voices().catch(() => {});
  if (view) { require('./door').handle('voice', (q) => say(view, q)); require('./door').handle('lang', () => pageLang(view)); }
  if (mk) decoder(mk);
  gate.handle('voice:synth', async (e, o) => {
    o = o || {};
    try { return { ok: true, b64: (await synth(String(o.text || ''), o.voice, o.rate, o.pitch)).toString('base64') }; } catch (x) { return { ok: false, e: x.message }; }
  });
  gate.on('voice:voices', (e) => { e.returnValue = known; if (known === '[]') voices().catch(() => {}); });
  gate.handle('stt:hear', (e, b64, ext) => hear(b64, ext));
  gate.on('stt:ready', (e) => { e.returnValue = require('./bodyd').info('53on-body').running === true; });
}

module.exports = { wire: wire, synth: synth, voices: voices, hear: hear, ssml: ssml, say: say, pcm: pcm, decoder: decoder, pageLang: pageLang, page: { VOICE: VOICE } };
