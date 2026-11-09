'use strict';
const msg = () => require('./settings').get().config.msg;
const at53 = (w) => { try { return new URL(w.getURL()).origin === 'https://53on.com'; } catch (_) { return false; } };
let wc = null, last = null;   // last: the one id's last message, quoted by the answer (as the page's AI does)

const HOOK = (c) => '(function(c){var E=window.__arnesEar;if(E){E.c=c;return;}E=window.__arnesEar={c:c};' +
  'var A=window.AsistenteIA=window.AsistenteIA||{},inner=A.onMessages,seen={};' +
  'function ear(ms){var rest=[];(ms||[]).forEach(function(m){var k=E.c;' +
  'if(!(m&&k.on&&k.id&&k.to!=="arnes"&&String(m.sender_id)===k.id)){rest.push(m);return;}' +
  'if(seen[m.id])return;seen[m.id]=1;try{CodexNative.heard({id:m.id,sender_id:m.sender_id});}catch(e){}});' +
  'if(rest.length&&inner)return inner(rest);}' +
  'Object.defineProperty(A,"onMessages",{configurable:true,get:function(){return ear;},set:function(f){inner=f;}});' +
  '})(' + JSON.stringify(c) + ')';
const cfgOf = () => { const c = msg(); return { on: c.on, id: c.id, to: c.to }; };

async function READ(a) {
  var SM = window.StorageManager;
  if (!SM) return { err: 'no_store' };
  var find = function () {
    try { SM.ensureChat(a.sid, function () {}); } catch (e) {}
    return (SM.getMessages(a.sid) || []).filter(function (m) { return String(m.id) === String(a.mid); })[0];
  };
  var until = async function (f, ms) {
    var end = Date.now() + ms, m = find();
    while (!f(m) && Date.now() < end) { await new Promise(function (r) { setTimeout(r, 150); }); m = find(); }
    return m;
  };
  var m = await until(function (x) { return x; }, 5000);
  if (!m) return { err: 'not_in_store' };
  var rt = m.extra && m.extra.reply_to, mu = m.media_url;
  if (mu && mu.charAt(0) === '{') { try { var pk = JSON.parse(mu); rt = rt || pk.rt; mu = pk.f || null; } catch (e) {} }
  m = Object.assign({}, m, { media_url: mu });
  try { if (window.MsgSync && MsgSync.sendReadPush) MsgSync.sendReadPush(a.sid, [m.id]); } catch (e) {}
  var out = { text: m.content || m.m || '', type: m.msg_type || 0, path: m.media_url || m.media_ref || '', quote: rt ? String(rt.text || rt.t || '') : '' };
  if (!out.path || +out.type === 8) return out;   // a sticker is a code, not a file
  try {
    var u = m.media_url || '';
    if (!/^https?:/.test(u)) {
      m = (await until(function (x) { return x && x.media_ref; }, 35000)) || m;   // its download gives up at 30 s
      var F = SM.fs, ref = m.media_ref, MIME = { webm: 'audio/webm', ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', pdf: 'application/pdf' };
      if (ref && F && F.isApp && F.readBase64) u = (u = F.readBase64('media/' + ref)) ? 'data:' + (MIME[ref.split('.').pop().toLowerCase()] || 'application/octet-stream') + ';base64,' + u : '';
      else u = ref ? (await new Promise(function (r) { SM.resolveMediaAsync(ref, r); })) || '' : '';
    }
    if (!u) throw new Error('media_missing');
    if (u.indexOf('data:') === 0) { out.mime = u.slice(5, u.indexOf(';')); out.b64 = u.slice(u.indexOf(',') + 1); }
    else {
      var r = await fetch(u);
      if (!r.ok) throw new Error('media_' + r.status);
      var b = new Uint8Array(await r.arrayBuffer()), s = '';
      for (var i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768));
      out.b64 = btoa(s); out.mime = r.headers.get('content-type') || '';
    }
    out.name = m.media_ref || m.doc_name || '';
  } catch (e) { out.mediaErr = String((e && e.message) || e); }
  return out;
}
async function SEND(a) {
  var root = (window.config && config.rootApp) || (window.MSG_CFG && MSG_CFG.rootApp) || 'xsite';
  var fd = new FormData(); fd.append('recipient_id', a.to); fd.append('content', a.text); fd.append('msg_type', '0');
  if (a.reply) fd.append('reply_to', a.reply);
  var t = await (await fetch('/' + root + '/packages/Messaging/Controllers/pst_message_send.php', { method: 'POST', body: fd, credentials: 'same-origin' })).text();
  if (t === 'L') return { ok: false, error: 'session_expired' };
  var r; try { r = JSON.parse(t); } catch (e) { return { ok: false, error: 'bad_answer' }; }
  if (r && r.ok && r.message && window.StorageManager && StorageManager.saveMessage) try { StorageManager.saveMessage(String(a.to), r.message); } catch (e) {}
  return r && r.ok ? { ok: true, message_id: r.message && r.message.id } : { ok: false, error: (r && r.error) || 'send_failed' };
}
async function MEDIA(a) {
  var root = (window.config && config.rootApp) || (window.MSG_CFG && MSG_CFG.rootApp) || 'xsite';
  if (!window.MediaUpload) await new Promise(function (ok) {
    var s = document.createElement('script'); s.src = '/' + root + '/packages/CloudStorage/Assets/media_upload.js'; s.onload = ok; s.onerror = ok; document.head.appendChild(s);
  });
  var bin = Uint8Array.from(atob(a.b64), function (c) { return c.charCodeAt(0); }), blob = new Blob([bin], { type: a.mime });
  var MU = window.MediaUpload, on = false, fd = new FormData();
  try { on = !!(MU && MU.enabled && await MU.enabled()); } catch (e) {}
  if (on) {
    var up; try { up = await MU.push(a.alias, blob); } catch (e) { return { ok: false, error: 'upload_failed' }; }
    fd.append('media_key', up.key); fd.append('mime', up.mime); fd.append('size', String(up.size));
  } else fd.append(a.field, blob, a.name);
  for (var k in a.extras) fd.append(k, String(a.extras[k]));
  var t = await (await fetch('/' + root + a.endpoint, { method: 'POST', body: fd, credentials: 'same-origin' })).text();
  if (t === 'L') return { ok: false, error: 'session_expired' };
  var r; try { r = JSON.parse(t); } catch (e) { return { ok: false, error: 'bad_answer' }; }
  if (r && r.ok && r.message && window.StorageManager && StorageManager.saveMessage) try { StorageManager.saveMessage(String(a.to), r.message); } catch (e) {}
  return r && r.ok ? { ok: true, message_id: r.message && r.message.id } : { ok: false, error: (r && r.error) || 'send_failed' };
}
const run = (f, a) => wc.executeJavaScript('(' + f + ')(' + JSON.stringify(a) + ')', true);

function gate(q) {
  const c = msg(), to = String(q.to == null || q.to === '' ? c.id : q.to);
  if (!c.on) return 'msg_off';
  if (!c.id) return 'no_id';
  if (to !== c.id) return 'not_allowed';   // the AI answers only its one id
  if (!wc || wc.isDestroyed() || !at53(wc)) return 'no_view';
  return '';
}
const reply = (id) => (last && last.sid === id ? JSON.stringify({ id: last.mid, text: String(last.text).slice(0, 200), sender_id: id, sender_name: '', msg_type: last.type || 0 }) : '');
async function send(q) {
  const no = gate(q), text = String(q.text || '');
  if (no) return { ok: false, error: no };
  if (!text) return { ok: false, error: 'text_required' };
  const id = msg().id;
  try { return await run(SEND, { to: id, text: text, reply: reply(id) }); } catch (_) { return { ok: false, error: 'view_failed' }; }
}
const KINDS = {   // by name: what each kind of media is on 53on.com, as the page's AI sends it
  voice: { alias: 'chat_voice', field: 'audio', name: 'voice.mp3', endpoint: '/packages/Messaging/Controllers/pst_message_voice.php' },
  image: { alias: 'chat_image', field: 'image', name: 'image.jpg', endpoint: '/packages/Messaging/Controllers/pst_message_image.php' },
};
async function media(q) {
  const no = gate(q), k = KINDS[q.kind];
  if (no) return { ok: false, error: no };
  if (!k || !q.b64 || !/^(audio|image)\/[\w.+-]+$/.test(String(q.mime || ''))) return { ok: false, error: 'media_bad' };
  const id = msg().id, extras = { recipient_id: id };
  if (q.kind === 'voice') { extras.duration = String(Math.max(1, Math.round(+q.duration || 1))); if (reply(id)) extras.reply_to = reply(id); }
  else if (q.caption) extras.content = String(q.caption);
  const name = q.kind === 'image' && q.ext ? 'image.' + String(q.ext).replace(/\W/g, '') : k.name;
  try { return await run(MEDIA, Object.assign({ to: id, b64: String(q.b64), mime: q.mime, extras: extras }, k, { name: name })); }
  catch (_) { return { ok: false, error: 'view_failed' }; }
}

async function heard(m) {
  const c = msg(), sid = String((m && m.sender_id) || '');
  if (!c.on || !c.id || sid !== c.id || c.to === 'arnes' || !wc || wc.isDestroyed()) return false;
  let r;
  try { r = await run(READ, { sid: +sid, mid: m.id }); } catch (e) { r = { err: 'view_failed' }; }
  r = r || {};
  last = { sid: sid, mid: m.id, text: String(r.text || ''), type: r.type || 0 };
  return require('./door').tell({ type: 'msg', uid: sid, mid: m.id, text: String(r.text || ''), path: r.path || '', quote: String(r.quote || ''),
    media: r.b64 ? { b64: r.b64, mime: r.mime, name: r.name } : r.mediaErr ? { err: r.mediaErr } : null }) > 0;
}

function sync() { if (wc && !wc.isDestroyed() && at53(wc)) wc.executeJavaScript(HOOK(cfgOf()), true).catch(function () {}); }
function wire(w) {
  wc = w;
  w.on('did-finish-load', sync);
}

module.exports = { wire: wire, sync: sync, heard: heard, send: send, media: media, HOOK: HOOK, page: { READ: READ, SEND: SEND, MEDIA: MEDIA } };
