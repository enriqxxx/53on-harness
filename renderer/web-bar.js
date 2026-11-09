'use strict';
const $ = (i) => document.getElementById(i), u = $('u'), W = window.WebBar.words || {};
let at = '';
u.placeholder = W.address || 'Search or type a URL';
$('b').title = W.back || 'Back'; $('f').title = W.forward || 'Forward'; $('r').title = W.reload || 'Reload';
$('b').onclick = () => WebBar.go('back');
$('f').onclick = () => WebBar.go('forward');
$('r').onclick = () => WebBar.go('reload');
u.onfocus = () => u.select();
u.onkeydown = (e) => {
  if (e.key === 'Enter' && u.value.trim()) { WebBar.go('go', u.value); u.blur(); }
  else if (e.key === 'Escape') { u.value = at; u.blur(); }
};
WebBar.on((s) => {
  at = s.url === 'about:blank' ? '' : s.url;
  if (document.activeElement !== u) u.value = at;
  $('b').disabled = !s.back; $('f').disabled = !s.fwd;
  $('r').classList.toggle('busy', !!s.loading);
});
