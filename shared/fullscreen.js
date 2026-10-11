(() => {
  'use strict';

  // Small fullscreen button (bottom-right) plus the F key. Button hides while fullscreen.
  //
  // Inside the arcade frame (index.html) we ask the frame to go fullscreen. The frame never
  // navigates, so fullscreen stays on while players move between the home screen and games.
  // A page opened on its own falls back to its own fullscreen; browsers drop that on every
  // page change, so we remember it for the session and re-enter on the next tap.
  const inFrame = window.parent !== window;

  // The home screen belongs inside the frame: opened directly, load the frame instead.
  if (!inFrame && /\/home\.html$/i.test(location.pathname)) { location.replace('index.html'); return; }

  const root = document.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  if (!request) return; // e.g. iPhone Safari: no page fullscreen. Use "Add to Home Screen" there.

  const WANT = 'ecosystemArcade.fullscreen';
  const want = () => { try { return sessionStorage.getItem(WANT) === '1'; } catch { return false; } };
  const setWant = (on) => { try { on ? sessionStorage.setItem(WANT, '1') : sessionStorage.removeItem(WANT); } catch { /* ignore */ } };

  let frameFull = false; // fullscreen state reported by the frame
  const ownFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const browserFull = () =>
    matchMedia('(display-mode: fullscreen)').matches ||
    (Math.abs(innerWidth - screen.width) <= 2 && Math.abs(innerHeight - screen.height) <= 2);
  const isFull = () => (inFrame ? frameFull : ownFull()) || browserFull();

  function enter() {
    if (isFull()) return;
    if (inFrame) { window.parent.postMessage({ eaFullscreen: 'enter' }, '*'); return; }
    try {
      const p = request.call(root, { navigationUI: 'hide' });
      if (p && p.catch) p.catch(() => {});
    } catch { /* not allowed without a tap */ }
  }
  function exit() {
    if (inFrame) { window.parent.postMessage({ eaFullscreen: 'exit' }, '*'); return; }
    if (ownFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
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
    btn.title = 'Fullscreen (F)';
    btn.setAttribute('aria-label', 'Enter fullscreen');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
    btn.addEventListener('click', (e) => { e.stopPropagation(); setWant(true); enter(); });
    document.body.append(btn);

    const sync = () => { btn.hidden = isFull(); };
    addEventListener('resize', sync);

    if (inFrame) {
      addEventListener('message', (e) => {
        if (e.source !== window.parent || !e.data || typeof e.data.eaFullscreenState !== 'boolean') return;
        frameFull = e.data.eaFullscreenState;
        sync();
      });
      window.parent.postMessage({ eaFullscreen: 'state' }, '*');
    } else {
      let leaving = false;
      addEventListener('beforeunload', () => { leaving = true; });
      addEventListener('pagehide', () => { leaving = true; });
      const onChange = () => {
        // Player pressed Esc / exited on purpose: stop forcing fullscreen back on.
        if (!ownFull() && !leaving) setWant(false);
        sync();
      };
      document.addEventListener('fullscreenchange', onChange);
      document.addEventListener('webkitfullscreenchange', onChange);
      // Carry fullscreen across pages: first tap or key press on this page re-enters it.
      const resume = (e) => {
        if (e.type === 'keydown' && (e.key === 'Escape' || e.key.toLowerCase() === 'f')) return;
        if (want() && !isFull()) enter();
      };
      for (const type of ['pointerup', 'touchend', 'keydown']) addEventListener(type, resume, true);
    }
    sync();

    // Keyboard shortcut: F toggles fullscreen (ignored while a name is being typed).
    const typingName = () => [...document.querySelectorAll('#signin, #entry')].some((el) => !el.hidden);
    addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey || e.repeat || typingName()) return;
      if ((inFrame ? frameFull : ownFull())) { setWant(false); exit(); } else { setWant(true); enter(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
