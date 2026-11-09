
(function () {
    const root = document.getElementById('root');

    const style = document.createElement('style');
    style.textContent = `
        @keyframes ov_ring { from { stroke-dashoffset: var(--c); } to { stroke-dashoffset: 0; } }
        @keyframes ov_ripple { to { transform: translate(-50%,-50%) scale(10); opacity: 0; } }
        @keyframes ov_fade { to { opacity: 0; } }
        @keyframes ov_eyePulse {
            0%,100% { box-shadow: 0 0 0 3px rgba(59,130,246,.35), inset 0 0 0 1px rgba(255,255,255,.6); }
            50% { box-shadow: 0 0 0 8px rgba(59,130,246,.15), inset 0 0 0 1px rgba(255,255,255,.8); }
        }
        @keyframes ov_pointBounce {
            0%,100% { transform: translate(-50%,-100%) scale(1); }
            50% { transform: translate(-50%,-100%) scale(1.12); }
        }
        @keyframes ov_stickerPop {
            0% { transform: translate(-50%,-50%) scale(0) rotate(-12deg); opacity: 0; }
            60% { transform: translate(-50%,-50%) scale(1.25) rotate(8deg); opacity: 1; }
            100% { transform: translate(-50%,-50%) scale(1) rotate(0); opacity: 1; }
        }
        @keyframes ov_stickerFade {
            from { opacity: 1; transform: translate(-50%,-50%) scale(1); }
            to { opacity: 0; transform: translate(-50%,-70%) scale(.9); }
        }
        @keyframes ov_stickerWobble {
            0%,100% { transform: translate(-50%,-50%) rotate(-4deg); }
            50% { transform: translate(-50%,-50%) rotate(4deg); }
        }
        @keyframes ov_stickerShake {
            0%,100% { transform: translate(-50%,-50%) translateX(0); }
            25% { transform: translate(-50%,-50%) translateX(-8px); }
            75% { transform: translate(-50%,-50%) translateX(8px); }
        }
        @keyframes ov_toastIn {
            from { opacity: 0; transform: translateY(-20px) scale(.9); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes ov_toastOut {
            to { opacity: 0; transform: translateY(-10px) scale(.95); }
        }
    `;
    document.head.appendChild(style);

    function mkHand() {
        const el = document.createElement('div');
        el.style.cssText = [
            'position:absolute', 'font-size:56px', 'line-height:1',
            'transform:translate(-50%,-50%) scale(1)',
            'transition:transform .12s ease-out,opacity .15s',
            'filter:drop-shadow(0 4px 10px rgba(0,0,0,.55))',
            'opacity:0', 'will-change:transform,left,top'
        ].join(';');
        el.textContent = '👆';
        root.appendChild(el);
        return el;
    }

    const h1 = mkHand();
    const h2 = mkHand();
    const _handPool = [h1, h2];
    function _getHands(n) {
        while (_handPool.length < n) _handPool.push(mkHand());
        return _handPool.slice(0, n);
    }

    function place(el, x, y) { el.style.left = x + 'px'; el.style.top = y + 'px'; }
    function show(el, x, y) {
        place(el, x, y);
        el.style.opacity = '1';
        el.style.transform = 'translate(-50%,-50%) scale(1)';
    }
    function hide(el) { el.style.opacity = '0'; }

    function ripple(x, y, color) {
        const r = document.createElement('div');
        r.style.cssText = [
            'position:absolute', `left:${x}px`, `top:${y}px`,
            'width:14px', 'height:14px', 'border-radius:50%',
            `background:${color || 'rgba(239,68,68,.6)'}`,
            'transform:translate(-50%,-50%) scale(1)',
            'animation:ov_ripple .5s ease-out forwards'
        ].join(';');
        root.appendChild(r);
        setTimeout(() => r.remove(), 520);
    }

    function trailDot(x, y, color) {
        const d = document.createElement('div');
        d.style.cssText = [
            'position:absolute', `left:${x}px`, `top:${y}px`,
            'width:10px', 'height:10px', 'margin:-5px 0 0 -5px',
            'border-radius:50%', `background:${color || 'rgba(59,130,246,.55)'}`,
            'animation:ov_fade .55s ease-out forwards'
        ].join(';');
        root.appendChild(d);
        setTimeout(() => d.remove(), 600);
    }

    const hand = {
        tap(x, y) {
            show(h1, x, y);
            h1.style.transform = 'translate(-50%,-50%) scale(.82)';
            ripple(x, y);
            setTimeout(() => h1.style.transform = 'translate(-50%,-50%) scale(1)', 90);
            setTimeout(() => hide(h1), 420);
        },
        longpress(x, y, ms = 600) {
            show(h1, x, y);
            h1.style.transform = 'translate(-50%,-50%) scale(.82)';
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', '80'); svg.setAttribute('height', '80');
            svg.style.cssText = `position:absolute;left:${x}px;top:${y}px;margin:-40px 0 0 -40px;`;
            const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            c.setAttribute('cx', '40'); c.setAttribute('cy', '40'); c.setAttribute('r', '34');
            c.setAttribute('fill', 'none'); c.setAttribute('stroke', 'rgba(239,68,68,.9)');
            c.setAttribute('stroke-width', '5'); c.setAttribute('stroke-linecap', 'round');
            const C = 2 * Math.PI * 34;
            c.style.cssText = `--c:${C};stroke-dasharray:${C};stroke-dashoffset:${C};transform:rotate(-90deg);transform-origin:40px 40px;animation:ov_ring ${ms}ms linear forwards`;
            svg.appendChild(c);
            root.appendChild(svg);
            setTimeout(() => {
                svg.remove();
                h1.style.transform = 'translate(-50%,-50%) scale(1)';
                hide(h1);
            }, ms + 180);
        },
        swipe(x1, y1, x2, y2, ms = 300) {
            show(h1, x1, y1);
            h1.style.transition = `left ${ms}ms ease-out,top ${ms}ms ease-out,opacity .15s`;
            const N = 12;
            for (let i = 1; i < N; i++) {
                const k = i;
                setTimeout(() => {
                    const t = k / N;
                    trailDot(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
                }, (ms * k) / N);
            }
            requestAnimationFrame(() => place(h1, x2, y2));
            setTimeout(() => {
                h1.style.transition = 'transform .12s ease-out,opacity .15s';
                hide(h1);
            }, ms + 140);
        },
        pinch(cx, cy, fromD, toD, ms = 400) {
            const ax = cx - fromD / 2, bx = cx + fromD / 2;
            const tax = cx - toD / 2, tbx = cx + toD / 2;
            show(h1, ax, cy); show(h2, bx, cy);
            h1.style.transition = h2.style.transition = `left ${ms}ms ease-out,top ${ms}ms ease-out,opacity .15s`;
            requestAnimationFrame(() => { h1.style.left = tax + 'px'; h2.style.left = tbx + 'px'; });
            setTimeout(() => {
                h1.style.transition = h2.style.transition = 'transform .12s ease-out,opacity .15s';
                hide(h1); hide(h2);
            }, ms + 140);
        },
        multitouch(fromPts, toPts, ms = 400) {
            const n = Math.min(fromPts.length, toPts.length);
            const hs = _getHands(n);
            hs.forEach((h, i) => {
                const f = fromPts[i], t = toPts[i];
                show(h, f.x, f.y);
                h.style.transition = `left ${ms}ms ease-out,top ${ms}ms ease-out,opacity .15s`;
                requestAnimationFrame(() => place(h, t.x, t.y));
            });
            setTimeout(() => {
                hs.forEach(h => {
                    h.style.transition = 'transform .12s ease-out,opacity .15s';
                    hide(h);
                });
            }, ms + 140);
        },
        drag(x1, y1, x2, y2, ms = 500) {
            h1.textContent = '✊';
            show(h1, x1, y1);
            h1.style.transition = `left ${ms}ms ease-out,top ${ms}ms ease-out,opacity .15s`;
            const N = 16;
            for (let i = 1; i < N; i++) {
                const k = i;
                setTimeout(() => {
                    const t = k / N;
                    trailDot(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 'rgba(168,85,247,.55)');
                }, (ms * k) / N);
            }
            requestAnimationFrame(() => place(h1, x2, y2));
            setTimeout(() => {
                h1.style.transition = 'transform .12s ease-out,opacity .15s';
                h1.textContent = '👆';
                hide(h1);
            }, ms + 180);
        }
    };

    const eyeBox = document.createElement('div');
    eyeBox.style.cssText = [
        'position:absolute', 'display:none',
        'border:2px solid rgba(59,130,246,.9)', 'border-radius:10px',
        'transition:opacity .2s', 'animation:ov_eyePulse 1.2s steps(6) infinite'
    ].join(';');
    const eyeBadge = document.createElement('div');
    eyeBadge.style.cssText = [
        'position:absolute', 'top:-36px', 'left:50%',
        'transform:translateX(-50%)', 'font-size:28px', 'line-height:1',
        'filter:drop-shadow(0 2px 4px rgba(0,0,0,.6))'
    ].join(';');
    eyeBadge.textContent = '👀';
    eyeBox.appendChild(eyeBadge);
    root.appendChild(eyeBox);

    const eye = {
        look(x, y, w, h, ms = 900) {
            eyeBox.style.left = x + 'px';
            eyeBox.style.top = y + 'px';
            eyeBox.style.width = w + 'px';
            eyeBox.style.height = h + 'px';
            eyeBox.style.display = 'block';
            eyeBox.style.opacity = '0';
            requestAnimationFrame(() => eyeBox.style.opacity = '1');
            clearTimeout(eyeBox.__t);
            if (ms > 0) {
                eyeBox.__t = setTimeout(() => {
                    eyeBox.style.opacity = '0';
                    setTimeout(() => eyeBox.style.display = 'none', 220);
                }, ms);
            }
        },
        hide() {
            clearTimeout(eyeBox.__t);
            eyeBox.style.opacity = '0';
            setTimeout(() => eyeBox.style.display = 'none', 220);
        }
    };

    const reminderStack = document.createElement('div');
    reminderStack.style.cssText = [
        'position:absolute', 'bottom:24px', 'left:24px',
        'display:flex', 'flex-direction:column-reverse', 'gap:8px',
        'max-width:380px', 'pointer-events:none'
    ].join(';');
    root.appendChild(reminderStack);

    const ovb = window.__overlay, hotRect = (id, r) => { try { ovb && ovb.hotRect(id, r); } catch (e) {} };
    const hotOf = (el, P) => { const r = el.getBoundingClientRect(); return r.width ? { x: r.left - P, y: r.top - P, w: r.width + 2 * P, h: r.height + 2 * P } : null; };
    let grab = null;
    function movable(key, at, put, hot) {
        try { const s = JSON.parse(localStorage.getItem(key)); if (s) put(s.l, s.b); } catch (e) {}
        return (e, cap) => {
            const p = at();
            grab = { key, at, put, hot, l: p.l - e.clientX, b: p.b + e.clientY };
            cap.setPointerCapture(e.pointerId);
            hotRect('__drag', { x: 0, y: 0, w: innerWidth, h: innerHeight });
        };
    }
    addEventListener('pointermove', e => { if (grab) grab.put(grab.l + e.clientX, grab.b - e.clientY); });
    const drop = () => {
        const g = grab;
        grab = null;
        hotRect('__drag', null);
        if (!g) return;
        g.hot();
        try { localStorage.setItem(g.key, JSON.stringify(g.at())); } catch (e) {}
    };
    addEventListener('pointerup', drop);
    addEventListener('pointercancel', drop);
    addEventListener('blur', drop);

    const stackHot = () => hotRect('__stack', reminderStack.children.length ? hotOf(reminderStack, 16) : null);
    const grabStack = movable('ov_stack', () => { const r = reminderStack.getBoundingClientRect(); return { l: r.left, b: innerHeight - r.bottom }; }, (l, b) => {
        const r = reminderStack.getBoundingClientRect();
        reminderStack.style.left = Math.max(40 - r.width, Math.min(innerWidth - 40, l)) + 'px';
        reminderStack.style.bottom = Math.max(40 - r.height, Math.min(innerHeight - 40, b)) + 'px';
    }, stackHot);
    reminderStack.addEventListener('pointerdown', e => {
        const card = e.target.closest('[data-rid]');
        if (e.button === 0 && card && !e.target.closest('.ov_rem_x,.ov_rem_go')) grabStack(e, card);
    });

    const bandEl = root.appendChild(document.createElement('div'));
    bandEl.style.cssText = 'position:absolute;left:50%;bottom:24px;transform:translateX(-50%);display:none;opacity:0;transition:opacity .2s;background:#000;color:#fff;padding:6px 16px;border-radius:8px;font:600 15px system-ui;white-space:nowrap;max-width:60vw;overflow:hidden;text-overflow:ellipsis;pointer-events:auto;cursor:grab;box-shadow:0 4px 14px rgba(0,0,0,.45)';
    const bandHot = () => hotRect('__band', bandEl.style.display === 'none' ? null : hotOf(bandEl, 8));
    const grabBand = movable('ov_band', () => { const r = bandEl.getBoundingClientRect(); return { l: r.left + r.width / 2, b: innerHeight - r.bottom }; }, (l, b) => {
        bandEl.style.left = Math.max(40, Math.min(innerWidth - 40, l)) + 'px';
        bandEl.style.bottom = Math.max(0, Math.min(innerHeight - 40, b)) + 'px';
    }, bandHot);
    bandEl.addEventListener('pointerdown', e => { if (e.button === 0) grabBand(e, bandEl); });
    const animEl = root.appendChild(document.createElement('div'));
    animEl.style.cssText = 'position:absolute;top:40px;right:40px;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:auto;cursor:grab';
    const animHot = () => hotRect('__anim', animEl.children.length ? hotOf(animEl, 8) : null);
    const grabAnim = movable('ov_anim', () => { const r = animEl.getBoundingClientRect(); return { l: r.left + r.width / 2, b: innerHeight - r.bottom }; }, (l, b) => {
        Object.assign(animEl.style, { top: 'auto', right: 'auto', transform: 'translateX(-50%)' });
        animEl.style.left = Math.max(40, Math.min(innerWidth - 40, l)) + 'px';
        animEl.style.bottom = Math.max(0, Math.min(innerHeight - 40, b)) + 'px';
    }, animHot);
    animEl.addEventListener('pointerdown', e => { if (e.button === 0) grabAnim(e, animEl); });
    let bandT = null;
    const bandOn = new Map(), HEX = /^#[0-9a-f]{6}$/i;   // who -> until · its colours, the body's own Options
    function band(who, ms, c) {
        bandOn.set(who, Math.max(bandOn.get(who) || 0, Date.now() + ms));
        if (c) { bandEl.style.color = HEX.test(c.fg) ? c.fg : '#fff'; bandEl.style.background = HEX.test(c.bg) ? c.bg : '#000'; }
        paintBand();
    }
    function paintBand() {
        clearTimeout(bandT);
        const now = Date.now();
        for (const [w, t] of bandOn) if (t <= now) bandOn.delete(w);
        if (!bandOn.size) {
            if (grab && grab.key === 'ov_band') { bandT = setTimeout(paintBand, 400); return; }   // never from under the owner's hand
            bandEl.style.opacity = '0';
            bandT = setTimeout(() => { bandEl.style.display = 'none'; bandHot(); }, 220);
            return;
        }
        bandEl.textContent = [...bandOn.keys()].join(' · ');
        bandEl.style.display = 'block';
        requestAnimationFrame(() => { bandEl.style.opacity = '1'; bandHot(); });
        bandT = setTimeout(paintBand, Math.min(...bandOn.values()) - now);
    }

    function audioPlayer(audio, label) {
        const id = 'ap_' + Date.now(), el = document.createElement('div'), stop = document.createElement('button'), txt = document.createElement('span');
        el.style.cssText = 'position:absolute;bottom:26px;left:50%;transform:translateX(-50%);background:rgba(15,15,18,.9);color:#fff;padding:12px 18px;border-radius:16px;font:600 14px system-ui;display:flex;align-items:center;gap:14px;z-index:120;pointer-events:auto;max-width:460px;box-shadow:0 6px 24px rgba(0,0,0,.5)';
        stop.textContent = '⏹';
        stop.style.cssText = 'width:38px;height:38px;border-radius:50%;background:#e23b3b;border:none;color:#fff;font-size:17px;cursor:pointer;flex:0 0 auto;line-height:1';
        txt.textContent = '🎵 ' + String(label || '').slice(0, 80);
        txt.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        el.appendChild(stop); el.appendChild(txt); root.appendChild(el);
        const close = () => { try { ovb && ovb.hotRect(id, null); } catch (e) {} el.remove(); };
        stop.addEventListener('click', () => { try { audio.pause(); } catch (e) {} if (window._curAudio === audio) window._curAudio = null; close(); });
        audio.addEventListener('ended', close);
        const P = 16, hot = () => { const r = stop.getBoundingClientRect(); if (r.width) try { ovb && ovb.hotRect(id, { x: r.left - P, y: r.top - P, w: r.width + 2 * P, h: r.height + 2 * P }); } catch (e) {} };
        requestAnimationFrame(hot); setTimeout(hot, 300);
    }

    function reminder(opts) {
        opts = opts || {};
        const id = opts.id || 'r_' + Date.now();
        const icon = opts.icon || '💡';
        const gif = opts.gif;  // URL opcional — Noto animado del CDN o dataURL local
        const text = opts.text || '';
        const ms = opts.ms != null ? opts.ms : 120000;  // default 2 min
        const position = opts.position || 'bottom-left'; // 'top-right' | 'bottom-left'
        const imgSize = opts.image_size || 28;  // px · default chico (notif), grande (show) lo override
        const existing = root.querySelector('[data-rid="' + id + '"]');
        if (existing && existing._update && !gif && imgSize < 100) { existing._update(opts); return id; }
        if (existing) existing._close ? existing._close(true) : existing.remove();

        const el = document.createElement('div');
        el.setAttribute('data-rid', id);
        const isLarge = imgSize >= 100;
        const posCSS = isLarge
            ? 'position:absolute;inset:0;margin:auto;width:fit-content;height:fit-content;max-width:92vw;max-height:90vh;'
            : (position === 'top-right'
                ? 'position:absolute;top:110px;right:40px;max-width:380px;' // debajo del stack de toasts
                : '');
        el.style.cssText = posCSS + [
            'display:flex',
            isLarge ? 'flex-direction:column' : 'align-items:center',
            'gap:10px',
            'background:linear-gradient(135deg,rgba(30,41,59,.96),rgba(15,23,42,.96))',
            'color:#fff', 'padding:10px 14px', 'border-radius:12px',
            'border-left:3px solid #fbbf24',
            'box-shadow:0 6px 16px rgba(0,0,0,.5)',
            'font:500 13px system-ui', 'line-height:1.3',
            'animation:ov_toastIn .3s ease-out',
            'min-width:220px'
        ].join(';');
        const imgCSS = isLarge
            ? `max-width:min(${imgSize}px,88vw);max-height:82vh;width:auto;height:auto;border-radius:8px;display:block;cursor:pointer` // cabe en pantalla, no se corta
            : `height:${imgSize}px;width:auto;flex-shrink:0`;
        if (isLarge) el.style.pointerEvents = 'auto';
        const visual = gif
            ? '<img class="ov_rem_img" src="' + gif + '" style="' + imgCSS + '" title="click para fijar · X para cerrar">'
            : '<span style="font-size:20px;flex-shrink:0">' + icon + '</span>';
        const textHtml = '<span class="ov_rem_txt" style="flex:1">' + text + '</span>';
        const cancelable = !!opts.cancel;
        const xBtnHtml = (isLarge || cancelable)
            ? '<button class="ov_rem_x" style="' + (cancelable && !isLarge
                ? 'position:absolute;top:-9px;right:-9px;width:24px;height:24px;background:#ef4444;border:2px solid rgba(15,23,42,.95);box-shadow:0 2px 6px rgba(0,0,0,.5);'
                : 'position:absolute;top:14px;right:14px;width:34px;height:34px;background:rgba(0,0,0,.7);border:2px solid rgba(255,255,255,.5);') +
              'border-radius:50%;color:#fff;font:700 14px system-ui;cursor:pointer;line-height:1;padding:0;display:flex;align-items:center;justify-content:center;z-index:5" title="' +
              (cancelable ? 'cancelar' : 'cerrar') + '">×</button>'
            : '';
        const goable = cancelable && !!opts.now && !isLarge;
        const goHtml = goable
            ? '<button class="ov_rem_go" style="position:absolute;top:-9px;right:21px;width:24px;height:24px;background:#22c55e;border:2px solid rgba(15,23,42,.95);box-shadow:0 2px 6px rgba(0,0,0,.5);border-radius:50%;color:#fff;font:700 10px system-ui;cursor:pointer;line-height:1;padding:0 0 0 2px;display:flex;align-items:center;justify-content:center;z-index:5" title="ya">▶</button>'
            : '';
        if (isLarge || cancelable) el.style.position = 'relative';
        if (cancelable) el.style.overflow = 'visible';
        if (cancelable) el.style.pointerEvents = 'auto';
        el.innerHTML = visual + textHtml + goHtml + xBtnHtml;
        const inStack = !(isLarge || position === 'top-right');
        if (inStack) { el.style.pointerEvents = 'auto'; el.style.cursor = 'grab'; }
        (inStack ? reminderStack : root).appendChild(el); // grande/top-right → root (centrado/fijo); chico → stack abajo-izq

        let timer = null;
        const ov = window.__overlay;
        const close = (now) => {
            if (timer) { clearTimeout(timer); timer = null; }
            try { ov && ov.hotRect(id, null); } catch (e) {}   // desregistra la zona clickeable
            const gone = () => { el.remove(); stackHot(); };
            if (now === true) return gone();
            el.style.animation = 'ov_toastOut .3s ease-in forwards';
            setTimeout(gone, 320);
        };
        el._close = close;
        const arm = (t) => { if (timer) clearTimeout(timer); timer = t > 0 ? setTimeout(close, t) : null; };
        arm(ms);
        el._update = (o) => {
            const t = el.querySelector('.ov_rem_txt');
            if (t) t.innerHTML = o.text || '';
            arm(o.ms != null ? o.ms : 120000);
            stackHot();
        };
        if (inStack) { requestAnimationFrame(stackHot); setTimeout(stackHot, 400); }
        const xBtn = (cancelable || isLarge) && el.querySelector('.ov_rem_x');
        if (xBtn) {
            el.style.pointerEvents = 'auto';
            const P = 16, hot = () => { const r = xBtn.getBoundingClientRect(); if (r.width) ov && ov.hotRect(id, { x: r.left - P, y: r.top - P, w: r.width + 2 * P, h: r.height + 2 * P }); };
            if (!inStack) { requestAnimationFrame(hot); setTimeout(hot, 400); }
            xBtn.addEventListener('click', () => { if (cancelable) try { ov && ov.send({ type: 'reminder-cancel', id }); } catch (e) {} close(); });
        }
        const goBtn = goable && el.querySelector('.ov_rem_go');
        if (goBtn) goBtn.addEventListener('click', () => { try { ov && ov.send({ type: 'reminder-now', id }); } catch (e) {} goBtn.remove(); });
        return id;
    }
    function dismissReminder(id) {
        const el = root.querySelector('[data-rid="' + id + '"]');
        if (el) el._close ? el._close() : el.remove();
    }
    function clearReminders() {
        Array.from(reminderStack.children).forEach(c => c._close ? c._close(true) : c.remove());
        stackHot();
    }

    function point(x, y, label, ms = 2000) {
        const el = document.createElement('div');
        el.style.cssText = [
            'position:absolute', `left:${x}px`, `top:${y}px`,
            'transform:translate(-50%,-100%)', 'animation:ov_pointBounce 1.2s steps(6) infinite',
            'filter:drop-shadow(0 3px 6px rgba(0,0,0,.5))',
            'font-size:14px', 'color:#fff',
            'background:linear-gradient(180deg,#3b82f6,#2563eb)',
            'padding:6px 12px 10px', 'border-radius:10px',
            'white-space:nowrap', 'font-weight:600',
            'transition:opacity .25s', 'opacity:0'
        ].join(';');
        el.textContent = label || '👉 aquí';
        const tip = document.createElement('div');
        tip.style.cssText = 'position:absolute;bottom:-5px;left:50%;transform:translateX(-50%) rotate(45deg);width:10px;height:10px;background:#2563eb;';
        el.appendChild(tip);
        root.appendChild(el);
        requestAnimationFrame(() => el.style.opacity = '1');
        setTimeout(() => {
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 300);
        }, ms);
    }

    const MOODS = {
        ok:        { emoji: '👍', anim: 'pop' },
        done:      { emoji: '✅', anim: 'pop' },
        happy:     { emoji: '🎉', anim: 'pop' },
        party:     { emoji: '🥳', anim: 'wobble' },
        fire:      { emoji: '🔥', anim: 'pop' },
        rocket:    { emoji: '🚀', anim: 'pop' },
        sparkle:   { emoji: '✨', anim: 'wobble' },
        think:     { emoji: '🤔', anim: 'wobble' },
        brain:     { emoji: '🧠', anim: 'wobble' },
        search:    { emoji: '🔍', anim: 'wobble' },
        inspect:   { emoji: '🧐', anim: 'wobble' },
        watch:     { emoji: '👀', anim: 'wobble' },
        surprise:  { emoji: '😳', anim: 'pop' },
        mindblown: { emoji: '🤯', anim: 'shake' },
        wow:       { emoji: '😮', anim: 'pop' },
        error:     { emoji: '⚠️', anim: 'shake' },
        fail:      { emoji: '❌', anim: 'shake' },
        boom:      { emoji: '💥', anim: 'shake' },
        frown:     { emoji: '😤', anim: 'shake' },
        tired:     { emoji: '😮‍💨', anim: 'wobble' },
        sweat:     { emoji: '🥵', anim: 'wobble' },
        love:      { emoji: '❤️', anim: 'pop' },
        laugh:     { emoji: '😂', anim: 'wobble' },
        smirk:     { emoji: '😏', anim: 'pop' },
        bye:       { emoji: '👋', anim: 'wobble' }
    };
    const PILL = 'color:#fff;background:rgba(17,24,39,.85);padding:4px 10px;border-radius:8px;font-size:13px;font-weight:600;margin-top:8px;text-align:center';   // a picture's label, under it
    function sticker(x, y, opts) {
        opts = opts || {};
        const mood = opts.mood && MOODS[opts.mood] ? MOODS[opts.mood] : null;
        const emoji = opts.emoji || (mood && mood.emoji) || '✨';
        const anim = opts.anim || (mood && mood.anim) || 'pop';
        const size = opts.size || 110;
        const ms = opts.ms || 1600;
        const toast = opts.toast;    // si true → arriba-derecha ignorando x,y
        const label = opts.label;    // texto opcional debajo
        const gifUrl = opts.gif;     // si viene, pinta <img> en vez de emoji
        const el = document.createElement('div');
        const isToast = toast || (x == null && y == null);
        if (opts.who) band(String(opts.who), ms, opts.bc);   // who does it rides the band, apart
        if (isToast) {
            el.style.cssText = 'display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 6px 14px rgba(0,0,0,.5));animation:ov_toastIn .25s ease-out';
            const pic = el.appendChild(document.createElement(gifUrl ? 'img' : 'span'));   // built, never HTML: an address is the owner's text
            if (gifUrl) { pic.src = gifUrl; pic.draggable = false; pic.style.cssText = 'height:72px;width:auto;display:block'; }
            else { pic.textContent = emoji; pic.style.cssText = 'font-size:48px;line-height:1'; }
            if (label) { const t = el.appendChild(document.createElement('div')); t.textContent = label; t.style.cssText = PILL; }
            animEl.appendChild(el);
            requestAnimationFrame(animHot);
            setTimeout(() => {
                el.style.animation = 'ov_toastOut .3s ease-in forwards';
                setTimeout(() => { el.remove(); if (!grab || grab.key !== 'ov_anim') animHot(); }, 320);   // never from under the owner's hand
            }, ms);
            return;
        }
        if (gifUrl) {
            const gifSize = opts.size || 280;
            el.style.cssText = [
                'position:absolute', `left:${x}px`, `top:${y}px`,
                'transform:translate(-50%,-50%)',
                'filter:drop-shadow(0 8px 20px rgba(0,0,0,.55))',
                `animation:ov_stickerPop .4s cubic-bezier(.34,1.56,.64,1) forwards`
            ].join(';');
            const img = document.createElement('img');
            img.src = gifUrl;
            img.style.cssText = `height:${gifSize}px;width:auto;border-radius:14px;display:block;`;
            el.appendChild(img);
            if (label) {
                const lbl = document.createElement('div');
                lbl.style.cssText = PILL;
                lbl.textContent = label;
                el.appendChild(lbl);
            }
        } else {
            el.style.cssText = [
                'position:absolute', `left:${x}px`, `top:${y}px`,
                `font-size:${size}px`, 'line-height:1',
                'filter:drop-shadow(0 6px 12px rgba(0,0,0,.55))',
                'transform:translate(-50%,-50%)',
                `animation:ov_stickerPop .4s cubic-bezier(.34,1.56,.64,1) forwards`
            ].join(';');
            el.textContent = emoji;
        }
        root.appendChild(el);
        setTimeout(() => {
            if (anim === 'wobble') el.style.animation = 'ov_stickerWobble .6s steps(4) infinite';
            else if (anim === 'shake') el.style.animation = 'ov_stickerShake .25s ease-in-out 3';
        }, 400);
        setTimeout(() => {
            el.style.animation = 'ov_stickerFade .35s ease-in forwards';
        }, ms);
        setTimeout(() => el.remove(), ms + 400);
    }

    function clearAll() {
        hide(h1); hide(h2);
        eye.hide();
        clearReminders();
        clearTimeout(bandT); bandOn.clear(); bandEl.style.display = 'none'; bandEl.style.opacity = '0'; bandHot();
        animEl.textContent = ''; animHot();
        Array.from(root.children).forEach(c => {
            if (!_handPool.includes(c) && c !== eyeBox && c !== reminderStack && c !== bandEl && c !== animEl) c.remove();
        });
    }

    const actions = {
        tap: (m) => hand.tap(m.x, m.y),
        longpress: (m) => hand.longpress(m.x, m.y, m.ms),
        swipe: (m) => hand.swipe(m.x1, m.y1, m.x2, m.y2, m.ms),
        pinch: (m) => hand.pinch(m.cx, m.cy, m.fromD, m.toD, m.ms),
        multitouch: (m) => hand.multitouch(m.from, m.to, m.ms),
        drag: (m) => hand.drag(m.x1, m.y1, m.x2, m.y2, m.ms),
        look: (m) => eye.look(m.x, m.y, m.w, m.h, m.ms),
        point: (m) => point(m.x, m.y, m.label, m.ms),
        sticker: (m) => sticker(m.x, m.y, m),
        reminder: (m) => reminder(m),
        dismissReminder: (m) => dismissReminder(m.id),
        audio: (m) => {
            const mime = m.mime || 'audio/mp3';
            const a = new Audio('data:' + mime + ';base64,' + m.data);
            window._curAudio = a;
            a.play().catch(err => console.warn('audio play err:', err));
            if (m.player) audioPlayer(a, m.label);
        },
        'audio-stop': () => {
            try { if (window._curAudio) { window._curAudio.pause(); window._curAudio = null; } } catch (_) {}
        },
        clear: () => clearAll(),
        home: () => {
            ['ov_band', 'ov_stack', 'ov_anim'].forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
            Object.assign(reminderStack.style, { left: '24px', bottom: '24px' });
            Object.assign(bandEl.style, { left: '50%', bottom: '24px', transform: 'translateX(-50%)' });
            Object.assign(animEl.style, { top: '40px', right: '40px', left: 'auto', bottom: 'auto', transform: 'none' });
            stackHot(); bandHot(); animHot();
        }
    };

    if (window.__overlay && window.__overlay.onAction) {
        window.__overlay.onAction((msg) => {
            const fn = actions[msg.action];
            if (fn) try { fn(msg); } catch (e) { console.error('action err:', e); }
        });
    }
})();
