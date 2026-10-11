(() => {
  'use strict';

  // Small fullscreen button (bottom-right). Hidden while the page is fullscreen.
  // Browsers drop fullscreen on every page change, so once a player turns it on we
  // remember that for the session and re-enter on their first tap on the next page.
  const WANT = 'ecosystemArcade.fullscreen';
  const root = document.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  if (!request) return; // e.g. iPhone Safari: no page fullscreen. Use "Add to Home Screen" there.

  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  const browserFullscreen = () =>
    matchMedia('(display-mode: fullscreen)').matches ||
    (Math.abs(innerWidth - screen.width) <= 2 && Math.abs(innerHeight - screen.height) <= 2);
  const isFull = () => !!fsElement() || browserFullscreen();

  const want = () => { try { return sessionStorage.getItem(WANT) === '1'; } catch { return false; } };
  const setWant = (on) => { try { on ? sessionStorage.setItem(WANT, '1') : sessionStorage.removeItem(WANT); } catch { /* ignore */ } };

  function enter() {
    if (isFull()) return;
    try {
      const p = request.call(root, { navigationUI: 'hide' });
      if (p && p.catch) p.catch(() => {});
    } catch { /* not allowed without a tap */ }
  }

  function mount() {
    const s = document.createElement('style');
    s.textContent = `
      .eaf-btn{position:fixed;right:calc(10px + env(safe-area-inset-right));bottom:calc(10px + env(safe-area-inset-bottom));z-index:9995;
        width:clamp(34px,4.4vmin,48px);height:clamp(34px,4.4vmin,48px);border-radius:12px;border:0;padding:0;cursor:pointer;
        display:grid;place-items:center;background:rgba(10,10,30,.55);color:#fff;backdrop-filter:blur(6px);
        box-shadow:0 4px 14px rgba(0,0,0,.35);opacity:.75;transition:opacity .2s,transform .1s;touch-action:manipulation}
      .eaf-btn:hover{opacity:1}
      .eaf-btn:active{transform:scale(.92)}
      .eaf-btn svg{width:58%;height:58%}
      .eaf-btn[hidden]{display:none}
    `;
    document.head.append(s);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'eaf-btn';
    btn.title = 'Fullscreen';
    btn.setAttribute('aria-label', 'Enter fullscreen');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
    btn.addEventListener('click', (e) => { e.stopPropagation(); setWant(true); enter(); });
    document.body.append(btn);

    const sync = () => { btn.hidden = isFull(); };
    let leaving = false;
    addEventListener('beforeunload', () => { leaving = true; });
    addEventListener('pagehide', () => { leaving = true; });
    const onChange = () => {
      // Player pressed Esc / exited on purpose: stop forcing fullscreen back on.
      if (!fsElement() && !leaving) setWant(false);
      sync();
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    addEventListener('resize', sync);
    sync();

    // Carry fullscreen across pages: first tap or key press on this page re-enters it.
    const resume = (e) => {
      if (e.type === 'keydown' && e.key === 'Escape') return;
      if (want() && !isFull()) enter();
    };
    for (const type of ['pointerup', 'touchend', 'keydown']) addEventListener(type, resume, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
