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

// ---- screen wake lock: asked inside a tap, asked again whenever the page comes back ----
export const wake = { supported: 'wakeLock' in navigator, state: 'not requested', sentinel: null, releases: 0 };
export async function requestWake() {
  if (!wake.supported) { wake.state = 'not supported'; return false; }
  if (wake.sentinel) return true;
  try {
    wake.sentinel = await navigator.wakeLock.request('screen'); wake.state = 'active';
    wake.sentinel.addEventListener('release', () => { wake.releases++; wake.sentinel = null; wake.state = 'released'; });
    return true;
  } catch (e) { wake.state = 'refused: ' + ((e && e.name) || e); return false; }
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
