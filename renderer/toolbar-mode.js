(function () {
  var FACE = { manual: 'Manual', plan: 'Plan', auto: 'Auto', bypass: 'Bypass permissions' };
  var COLOR = { manual: '', plan: '#2f6fb2', auto: '#c47f00', bypass: '#c0392b' };
  var ORDER = ['manual', 'plan', 'auto', 'bypass'];
  var now = 'manual';

  function paint() {
    var b = document.getElementById('mode');
    if (b && b.textContent !== FACE[now]) { b.textContent = FACE[now] || now; b.style.color = COLOR[now] || ''; }
  }
  function pull() {
    if (!window.ShellMode) return setTimeout(pull, 300);   // the bar can load before the bridge
    ShellMode.get().then(function (r) { if (r && r.ok) { now = r.mode; paint(); } });
  }
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('#mode') : null;
    if (!t || !window.ShellMode) return;
    var m = ORDER[(ORDER.indexOf(now) + 1) % ORDER.length];
    ShellMode.set(m).then(function (r) { if (r && r.ok) { now = r.mode; paint(); } });
  });
  setInterval(paint, 1000);   // the button can be reborn without its face
  pull();
})();
