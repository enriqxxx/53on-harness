'use strict';
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var titlebar = $('#titlebar');
  var pill = $('#pill'), pillText = $('#pill-text');

  var T = window.ShellNav.t();   // the Arnés's language (i18n.js); English when a word is missing
  [['#menu', 'menu'], ['#home', 'home'], ['#msgs', 'messages'], ['#ai', 'ai'], ['#update', 'update'], ['#pill', 'page']].forEach(function (x) { var e = $(x[0]); if (e && T[x[1]]) e.title = T[x[1]]; });
  if (T.update) $('#update').textContent = T.update;
  if (T.ai) $('#ai').textContent = T.ai;
  $('#menu').addEventListener('click', function () { window.ShellApp.menu(); });
  $('#home').addEventListener('click', function () { window.ShellNav.home(); });
  $('#msgs').addEventListener('click', function () { window.ShellNav.messages(); });
  $('#ai').addEventListener('click', function () { window.ShellNav.ai(); });
  window.ShellNav.onAi(function (on) { $('#ai').disabled = !on; });   // as the page's own: dead and grey while its AI is not in Play

  window.ShellNav.onState(function (s) {
    var label = s.url || '';
    try {
      var u = new URL(s.url);
      var seg = decodeURIComponent(u.pathname || '').replace(/^\/+/, '');
      if (!seg && u.search) seg = u.search.replace(/^\?/, '');
      label = u.hostname + (seg ? ' · ' + (seg.length > 42 ? seg.slice(0, 42) + '…' : seg) : '');
    } catch (_) {}
    pillText.textContent = label;
    pill.classList.toggle('off', !!s.offline);
  });

  window.ShellApp.onFocus(function (active) { titlebar.classList.toggle('inactive', !active); });

  window.ShellApp.onNotify(function () {});
  var upd = $('#update'), updVer = '';
  upd.addEventListener('click', function () { if (upd.dataset.state === 'downloading') return; upd.textContent = '0%'; upd.dataset.state = 'downloading'; window.ShellApp.update(); });
  window.ShellApp.onUpdate(function (u) {
    if (!u) return;
    if (u.state === 'available') { updVer = u.ver; upd.textContent = 'Update ' + u.ver; upd.title = 'Update to ' + u.ver + (u.sz ? ' · ' + Math.round(u.sz / 1048576) + ' MB' : ''); upd.style.display = ''; }
    else if (u.state === 'downloading') upd.textContent = (u.pct || 0) + '%';
    else if (u.state === 'restarting') upd.textContent = 'Restarting…';
    else if (u.state === 'error') { upd.textContent = 'Retry ' + updVer; upd.title = String(u.e || 'error'); }
    upd.dataset.state = u.state;
  });
})();
