'use strict';
const fs = require('fs'), path = require('path');
const { app } = require('electron');
const file = () => path.join(app.getPath('userData'), 'push.json');   // its credentials, the pushes already seen, who it registered for
let wc = null, rx = null, st = null, busy = false;
const log = (m) => { try { fs.appendFileSync(path.join(app.getPath('userData'), 'packs.log'), new Date().toISOString() + ' push ' + m + '\n'); } catch (_) {} };
const save = () => { try { require('./packs').writeJson(file(), st); } catch (e) { log('save ' + e.message); } };
const at53 = () => { try { return !!wc && !wc.isDestroyed() && new URL(wc.getURL()).origin === 'https://53on.com'; } catch (_) { return false; } };

const PAGE = '(function(){return{cfg:window.PUSHWEB_CONFIG||null,uid:String(window.MY_UID||(window.chatConfig&&chatConfig.user_id)||"")};})()';
async function REGISTER(a) {
  var root = (window.config && config.rootApp) || (window.MSG_CFG && MSG_CFG.rootApp) || 'xsite';
  var r = await fetch('/' + root + '/packages/Push/Controllers/pst_register_fcm_token.php', { method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'token=' + encodeURIComponent(a.token) + '&platform=web' });
  try { return await r.json(); } catch (e) { return { ok: false }; }
}
function DELIVER(d) {   // as PushWeb's foreground path: a blocked sender only syncs, the rest goes to the page's PushHandler
  if (!window.PushHandler) return false;
  var s = d.sender_id || d.other_user_id || '';
  if (s && window.MsgSync && MsgSync.isBlocked && MsgSync.isBlocked(s)) { if (PushHandler.fetch) PushHandler.fetch(); return true; }
  PushHandler.handlePushData(d);
  return true;
}
const run = (f, a) => wc.executeJavaScript('(' + f + ')(' + JSON.stringify(a) + ')', true);

async function start() {
  if (busy || !at53()) return;
  busy = true;
  try {
    const m = require('./settings').get().config.msg;
    if (!m.on || !m.id) return;
    const v = await wc.executeJavaScript(PAGE, true).catch(() => null);
    if (!v || !v.cfg || !v.cfg.firebaseConfig || !v.uid) return;   // no session, or not the web page
    if (v.uid === m.id) { log('skip: this view has the one id\'s own account (' + v.uid + '): its phone keeps its pushes'); return; }
    st = st || load();
    if (!rx) {   // kept only once connected: a failed connect is tried again at the next load
      const { PushReceiver } = require('@eneris/push-receiver');
      const r = new PushReceiver({ firebase: v.cfg.firebaseConfig, vapidKey: v.cfg.vapidKey, credentials: st.credentials || undefined, persistentIds: st.ids || [], chromePlatform: 1 });
      r.onCredentialsChanged(({ newCredentials }) => { st.credentials = newCredentials; st.reg = ''; save(); });
      r.onNotification((env) => {
        st.ids = (st.ids || []).concat(env.persistentId).slice(-100);
        save();
        const d = (env.message && env.message.data) || {};
        if (at53()) run(DELIVER, d).catch((e) => log('deliver ' + e.message));
      });
      try { await r.connect(); } catch (e) { try { r.destroy(); } catch (_) {} throw e; }
      rx = r;
      log('connected');
    }
    const key = v.uid + ':' + rx.fcmToken;
    if (rx.fcmToken && st.reg !== key) {
      const r = await run(REGISTER, { token: rx.fcmToken }).catch(() => null);
      if (r && r.ok) { st.reg = key; save(); log('registered for ' + v.uid); } else log('register failed');
    }
  } catch (e) { log('start ' + ((e && e.message) || e)); }
  finally { busy = false; }
}
function load() { try { return JSON.parse(fs.readFileSync(file(), 'utf8')) || {}; } catch (_) { return {}; } }

function wire(w) {
  wc = w;
  w.on('did-finish-load', () => { start(); });
}

module.exports = { wire: wire, start: start, page: { REGISTER: REGISTER, DELIVER: DELIVER } };
