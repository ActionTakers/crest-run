// platform.mjs: the phone around the game: keeping the screen on, saving, knowing whether the page runs as a Home Screen app, the
// screen's orientation, and a small haptic tap where the browser offers one. Written 2026-11-13 by the yacht project session.
// Sources: Screen Wake Lock held on his iPhone (S1-11); no Vibration API and no fullscreen API on iPhone, a Home Screen app is the
// full-screen route and keeps storage (research/F2-stack/summary.md); a switch control gives a haptic tap in Safari on iOS 18 and
// later (F2-ios-M1), NOT_ASSESSED on his phone.

export const env = {
  ios: /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  standalone: (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true,
  touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
  secure: window.isSecureContext,
};
export const landscape = () => window.innerWidth >= window.innerHeight;
export function shortUA() {
  const u = navigator.userAgent, m = u.match(/(iPhone OS [\d_]+|Android [\d.]+|Windows NT [\d.]+|Mac OS X [\d_]+)/), b = u.match(/(CriOS|FxiOS|EdgiOS|Chrome|Version|Firefox)\/([\d.]+)/);
  return `${m ? m[1].replace(/_/g, '.') : '?'} ${b ? b[1] + ' ' + b[2] : ''}`.trim();
}

// ---- screen wake lock: held while a race runs (asked inside the tap that starts or resumes it) and let go on a pause, on the
// result and on the menus, so the phone can dim and sleep there as it always does (the outside critic's finding 4, 2026-11-14).
// releases counts the times the phone took the lock away; given counts the times the game let it go.
export const wake = { supported: 'wakeLock' in navigator, state: 'not requested', sentinel: null, releases: 0, given: 0, wanted: false, pending: null };
export function requestWake() {
  if (!wake.supported) { wake.state = 'not supported'; return Promise.resolve(false); }
  wake.wanted = true;
  if (wake.sentinel) return Promise.resolve(true);
  if (wake.pending) return wake.pending;
  wake.pending = (async () => {
    try {
      const s = await navigator.wakeLock.request('screen');
      s.addEventListener('release', () => { if (wake.sentinel === s) { wake.sentinel = null; wake.releases++; wake.state = 'taken away by the phone'; } });
      if (!wake.wanted) { wake.given++; wake.state = 'let go (no race running)'; try { await s.release(); } catch (e) { /* already gone */ } return true; }   // let go while the request was on its way
      wake.sentinel = s; wake.state = 'active';
      return true;
    } catch (e) { wake.state = 'refused: ' + ((e && e.name) || e); return false; } finally { wake.pending = null; }
  })();
  return wake.pending;
}
export function releaseWake() {
  wake.wanted = false;
  const s = wake.sentinel; if (!s) return;
  wake.sentinel = null; wake.given++; wake.state = 'let go (no race running)';
  try { const p = s.release(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* already gone */ }
}

// ---- storage: JSON under one key; the game runs without it (private browsing, storage full) ----
export function loadJSON(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }
export function saveJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } }

// ---- haptic tap: toggling a hidden switch control. Only inside a tap; does nothing where the browser has no such haptic ----
let hapticLabel = null;
export function initHaptic(parent = document.body) {
  if (hapticLabel) return;
  const label = document.createElement('label'), input = document.createElement('input');
  input.type = 'checkbox'; input.setAttribute('switch', ''); input.tabIndex = -1;
  label.setAttribute('aria-hidden', 'true'); label.style.cssText = 'position:fixed;left:-200px;top:0;width:1px;height:1px;opacity:0;overflow:hidden;';
  label.appendChild(input); parent.appendChild(label); hapticLabel = label;
}
export function haptic() { try { if (hapticLabel) hapticLabel.click(); } catch (e) { /* no haptic here */ } }
