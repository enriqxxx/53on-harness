'use strict';
(function () {
  const P = window.CodexPanel, $ = (i) => document.getElementById(i), main = $('main'), tabsEl = $('tabs'), H = document.documentElement, SB = 22;
  let ring = [], W = {}, tabs = [], ports = [], cur = '', open = false, q = '', maxed = 0, cut = { output: 0, console: 0 }, notes = [], unread = 0;
  const mine = ['problems', 'output', 'console'];
  const pad = (n) => String(n).padStart(2, '0'), hh = (t) => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
  const prob = (e) => e.k === 'tool' ? !e.ok : e.l >= 2;
  const pass = (e) => !q || q.split(/\s+/).filter(Boolean).every((w) => { const s = (e.v + ' ' + e.a + ' ' + (e.o || '')).toLowerCase(); return w[0] === '!' ? s.indexOf(w.slice(1)) < 0 : s.indexOf(w) >= 0; });
  const fits = (e, k) => k === 'problems' ? prob(e) && pass(e) : e.n > (cut[k] || 0) && (k === 'output' ? e.k === 'tool' : e.k === 'log');
  const el = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = txt; return x; };
  const keep = (k) => { try { localStorage.setItem('tab', k); } catch (_) {} };
  function row(e) {
    const r = el('div', 'row ' + (e.k === 'tool' ? 'tool' + (e.ok ? '' : ' bad') : 'l' + e.l));
    r.append(el('span', 't', hh(e.t)));
    if (e.k === 'tool') { r.append(el('span', 'v', (e.ok ? '' : '✗ ') + e.v), document.createTextNode(e.a), el('span', 'ms', e.ms + ' ms'), el('div', 'o', e.o || '')); r.onclick = () => r.classList.toggle('open'); }
    else r.append(document.createTextNode(e.a));
    return r;
  }
  const near = () => main.scrollHeight - main.scrollTop - main.clientHeight < 40;
  function show(k) {
    cur = k; keep(k); main.className = ''; main.textContent = '';
    for (const b of tabsEl.children) b.classList.toggle('on', b.dataset.k === k);
    $('clear').style.display = k === 'output' || k === 'console' || k === 'notes' ? '' : 'none';
    $('filt').style.display = k === 'problems' ? 'block' : 'none';
    if (k === 'notes') {
      if (!notes.length) main.append(el('div', 'empty', W.nonotes));
      notes.forEach((n) => { const r = el('div', 'row tool'); r.append(el('span', 't', hh(n.t)), el('span', 'v', n.title), document.createTextNode(n.body)); r.onclick = () => P.note(n.tag); main.append(r); });
      if (unread) P.seen(false);
      return;
    }
    const t = tabs.find((x) => x.id === k);
    if (t) { main.className = 'frame'; const f = el('iframe'); f.src = t.url + '?theme=' + (H.dataset.theme || 'dark'); main.append(f); return; }
    if (k === 'ports') {
      const tb = el('table'), h = el('tr'); [W.name, W.port, W.state].forEach((x) => h.append(el('th', '', x))); tb.append(h);
      ports.forEach((p) => { const r = el('tr', p.on ? '' : 'off'); [p.name, p.port, p.on ? '●' : W.off].forEach((x) => r.append(el('td', '', String(x)))); tb.append(r); });
      main.append(tb); return;
    }
    const l = ring.filter((e) => fits(e, k));
    if (!l.length) main.append(el('div', 'empty', k === 'problems' ? W.none : W.empty));
    l.forEach((e) => main.append(row(e)));
    main.scrollTop = main.scrollHeight;
  }
  function count() {
    const ne = ring.filter((e) => e.k === 'tool' ? !e.ok : e.l >= 3).length, nw = ring.filter((e) => e.k === 'log' && e.l === 2).length, b = tabsEl.querySelector('[data-k=problems] .n');
    $('ne').textContent = ne; $('nw').textContent = nw;
    if (b) { b.textContent = ne + nw; b.style.display = ne + nw ? '' : 'none'; }
  }
  function draw() {
    tabsEl.textContent = '';
    const add = (k, name, on) => { const b = el('button', '', name); b.dataset.k = k; if (on === false) { b.disabled = true; b.title = W.off; } b.onclick = () => show(k); tabsEl.append(b); return b; };
    mine.forEach((k) => { const b = add(k, W[k]); if (k === 'problems') b.append(el('span', 'n')); });
    tabs.forEach((t) => add(t.id, t.name, t.on));
    add('ports', W.ports);
    count();
  }
  const pick = (k) => k === 'terminal' ? ((tabs.find((y) => /terminal/i.test(y.name) && y.on) || tabs.find((y) => y.on) || {}).id || 'problems') : k;
  const fresh = () => P.refresh().then((x) => { tabs = x.tabs; ports = x.ports; draw(); });
  P.onEntry((e) => {
    ring.push(e); if (ring.length > 500) ring.shift();
    count();
    if (open && mine.indexOf(cur) >= 0 && fits(e, cur)) { const end = near(), em = main.querySelector('.empty'); if (em) em.remove(); main.append(row(e)); if (end) main.scrollTop = main.scrollHeight; }
  });
  P.onState((o) => { open = !!o; H.classList.toggle('closed', !open); if (open) fresh().then(() => show(cur || 'problems')); });
  P.onTab((k) => fresh().then(() => show(pick(k))));
  $('clear').onclick = () => { if (cur === 'notes') return P.seen(true); cut[cur] = ring.length ? ring[ring.length - 1].n : 0; show(cur); };
  const bell = () => { $('dot').style.display = unread ? '' : 'none'; $('bell').title = W.notes + (unread ? ' (' + unread + ')' : ''); };
  P.onNotes((l, n) => { notes = l; unread = n; bell(); if (open && cur === 'notes') show('notes'); });
  $('close').onclick = () => P.close();
  $('max').onclick = () => {
    if (!maxed) { maxed = innerHeight - SB; P.drag(false, 99999); } else { P.drag(false, maxed); maxed = 0; }
    $('maxp').setAttribute('d', maxed ? 'M4 7h3V4H6v2H4v1zm5-3v3h3V6h-2V4H9zm-2 8V9H4v1h2v2h1zm2-3v3h1v-2h2V9H9z' : 'M3 3v4h1V4h3V3H3zm10 0H9v1h3v3h1V3zM4 9H3v4h4v-1H4V9zm8 3H9v1h4V9h-1v3z');
    $('max').title = maxed ? W.restore : W.max;
  };
  $('q').oninput = (e) => { q = e.target.value.trim().toLowerCase(); show('problems'); };
  document.querySelector('footer').onclick = () => P.flip();
  $('cnt').onclick = (e) => { e.stopPropagation(); if (open && cur === 'problems') P.close(); else { P.open(); cur = 'problems'; } };
  $('bell').onclick = (e) => { e.stopPropagation(); if (open && cur === 'notes') P.close(); else if (open) show('notes'); else { cur = 'notes'; P.open(); } };
  const d = $('div'), g = $('guide');
  d.onpointerdown = (ev) => {
    d.setPointerCapture(ev.pointerId); g.style.top = '-9px'; H.classList.add('drag'); P.drag(true); maxed = 0;
    d.onpointermove = (m) => { g.style.top = m.clientY + 'px'; };
    d.onpointerup = (u) => { d.onpointermove = d.onpointerup = null; H.classList.remove('drag'); P.drag(false, innerHeight - u.clientY - SB); };
  };
  new MutationObserver(() => { if (tabs.some((t) => t.id === cur)) show(cur); }).observe(H, { attributes: true, attributeFilter: ['data-theme'] });
  P.watch().then((x) => {
    ring = x.ring; W = x.words; tabs = x.tabs; ports = x.ports; open = !!x.open; H.classList.toggle('closed', !open); notes = x.notes || []; unread = x.unread || 0; bell();
    $('clear').title = W.clear; $('close').title = W.close; $('max').title = W.max; $('q').placeholder = W.filter; $('cnt').title = W.problems;
    let k = 'problems'; try { k = localStorage.getItem('tab') || k; } catch (_) {}
    draw(); show(mine.concat('ports').indexOf(k) >= 0 || tabs.some((t) => t.id === k && t.on) ? k : 'problems');
  });
})();
