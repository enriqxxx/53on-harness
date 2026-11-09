'use strict';
(function () {
  var $ = function (id) { return document.getElementById(id); }, T = {};
  var LABELS = ['h', 'sub', 'tApp', 'lUi', 'lZoom', 'lMode', 'dMode', 'tAi', 'dAi', 'ai', 'tTheme', 'dTheme', 'theme', 'tMsg', 'dMsg', 'lId', 'lTo', 'lTone', 'lSay', 'tDl', 'pickDir', 'lAsk', 'tPacks'];
  function labels() { LABELS.forEach(function (k) { $(k).textContent = T[k] || ''; }); document.title = T.h || 'Options'; }
  var fill = function (sel, opts, v) {   // its options, then its value (one it does not list is added, never lost)
    if (!opts.some(function (o) { return o[0] === v; }) && v != null) opts = opts.concat([[v, String(v)]]);
    var key = JSON.stringify(opts);
    if (sel.dataset.k !== key) { sel.textContent = ''; opts.forEach(function (o) { var e = document.createElement('option'); e.value = o[0]; e.textContent = o[1]; if (o[2]) e.disabled = true; sel.appendChild(e); }); sel.dataset.k = key; }
    if (document.activeElement !== sel) sel.value = v;
  };
  function say(r) { $('msg').className = r.ok ? 'ok' : 'err'; $('msg').textContent = r.ok ? (r.opened ? T.opened : r.shown ? T.shown : r.relaunched ? T.relaunched : T.saved) : (T[r.error] || r.error || 'error'); }
  function paint(s) {
    if (s.t) { T = s.t; labels(); }
    fill($('ui'), (s.langs || []).map(function (l) { return [l.code, l.name]; }), s.lang);
    fill($('zoom'), [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2].map(function (z) { return [String(z), Math.round(z * 100) + ' %']; }), String(s.zoom));
    fill($('mode'), s.modes.map(function (m) { return [m, T[m] || m]; }), s.mode);
    var d = s.door || {};   // the body's door (53ON's own): open, or whoever holds its port
    $('dDoor').textContent = !d.port ? '' : d.open ? T.door.replace('{p}', d.port).replace('{n}', d.peers) : /^port_taken/.test(d.error) ? T.taken.replace('{p}', d.port) : d.error || '';
    $('dDoor').className = 'd' + (d.port && !d.open ? ' err' : '');
    var c = s.config;
    $('mon').checked = !!c.msg.on;
    if (document.activeElement !== $('uid')) $('uid').value = c.msg.id;
    fill($('to'), [['arnes', '53ON'], ['vscodex', 'vscodex']], c.msg.to);
    fill($('tone'), [['voice', T.voice], ['t1', T.tone + ' 1'], ['t2', T.tone + ' 2'], ['t3', T.tone + ' 3'], ['custom', T.custom], ['off', T.silent]], c.msg.tone);
    if (document.activeElement !== $('say')) $('say').value = c.msg.say;
    $('dl').textContent = s.dl || ''; $('ask').checked = !!(c.downloads || {}).ask;   // where downloads land, and whether it asks
    $('say').placeholder = T.sayDef || ''; $('say').parentNode.style.display = c.msg.tone === 'voice' ? '' : 'none';   // what the voice says, its owner's words; empty = the default in its language
    var box = $('packs'); box.textContent = '';
    if (!s.packs.length) box.textContent = T.none;
    s.packs.forEach(function (p) {
      var row = document.createElement('div'), txt = document.createElement('div'), sw = document.createElement('label'), cb = document.createElement('input'), knob = document.createElement('span');
      row.className = 'row uid'; txt.textContent = p.ttl + ' · ' + p.ver + (p.kind === 'plug' ? '' : ' · ' + (p.running ? T.run : T.stop));
      sw.className = 'sw'; cb.type = 'checkbox'; cb.checked = p.on;
      cb.addEventListener('change', function () { cb.disabled = true; save({ pack: { id: p.id, on: cb.checked } }); });
      sw.appendChild(cb); sw.appendChild(knob); row.appendChild(txt); row.appendChild(sw); box.appendChild(row);
    });
  }
  function load() { Options.get().then(function (s) { if (s && s.ok !== false) paint(s); }); }
  function save(p) { Options.set(p).then(function (s) { if (s && s.config) paint(s); say(s || {}); }); }
  $('ui').addEventListener('change', function () { save({ lang: this.value }); });
  $('zoom').addEventListener('change', function () { save({ zoom: +this.value }); });
  $('mode').addEventListener('change', function () { save({ mode: this.value }); });
  $('ai').addEventListener('click', function () { save({ ai: 1 }); });
  $('theme').addEventListener('click', function () { save({ theme: 1 }); });
  var msg = function () { save({ msg: { on: $('mon').checked, id: $('uid').value, to: $('to').value } }); };
  ['mon', 'uid', 'to'].forEach(function (k) { $(k).addEventListener('change', msg); });
  $('tone').addEventListener('change', function () { save(this.value === 'custom' ? { pickTone: true } : { msg: { tone: this.value } }); });
  $('say').addEventListener('change', function () { save({ msg: { say: this.value.trim() } }); });
  $('pickDir').addEventListener('click', function () { save({ pickDir: 1 }); });
  $('ask').addEventListener('change', function () { save({ downloads: { ask: this.checked } }); });
  load(); setInterval(load, 3000);   // a complement changes on its own (it starts, it fails)
})();
