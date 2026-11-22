// feedback.mjs: haptics and hit feedback with no game types in it.
// Friendly Fighters (and any other game) can import this file alone. Call
// createFeedback(), then play() with a profile name, that game's own XR input
// sources, and its own settings object. Nothing here imports Crest Run.
//
// A missing actuator, vibrate(), or gamepad is a no-op. Game state must not
// depend on a pulse landing. Repeated pulse() calls overwrite each other, so
// the queue lets the stronger one speak: hit, then ram, then shot.

export const HAPTIC_PRIORITY = Object.freeze({ shot: 1, ram: 2, hit: 3 });

export const FLASH_DEFAULT = 0.15;
export const FLASH_MAX = 0.3;
export const VIGNETTE_MS = 250;
export const SHAKE_METRES = 0.07;
export const CLASSIC_ROLL = 0.012;

const step = (value, duration) => Object.freeze({ value, duration });
function makeProfile(priority, hands, steps) {
  return Object.freeze({ priority, hands, steps: Object.freeze(steps) });
}

// Values are intensity 0..1 and milliseconds. hands: 'fire' is the hand that
// fired; 'both' is every hand in the session. flare matches shot: it is the
// player's own action, not a second intensity.
export const HAPTIC_PROFILES = Object.freeze({
  shot: makeProfile('shot', 'fire', [step(0.15, 20)]),
  flare: makeProfile('shot', 'fire', [step(0.15, 20)]),
  hitWeak: makeProfile('hit', 'fire', [step(0.35, 40)]),
  rocket: makeProfile('hit', 'both', [step(0.8, 120)]),
  ram: makeProfile('ram', 'both', [step(1, 200), step(0.4, 150)]),
  sink: makeProfile('hit', 'both', [step(0.6, 120), step(0.6, 120), step(0.6, 120)]),
});

// Android's Vibration API has durations, not intensity. Hits and rams only.
// A short gap keeps the ram's after-pulse and the sink's three beats apart.
// Shots and flares are absent on purpose.
export const VIBRATE_PATTERNS = Object.freeze({
  hitWeak: Object.freeze([40]),
  rocket: Object.freeze([120]),
  ram: Object.freeze([200, 40, 150]),
  sink: Object.freeze([120, 40, 120, 40, 120]),
});

export const PLAYER_GESTURES = Object.freeze(['shot', 'flare']);

export const DEFAULT_FEEDBACK_SETTINGS = Object.freeze({
  haptics: 'on',
  hapticStrength: 1,
  shake: 'on',
  shakeStrength: 1,
  shakeStyle: 'rig',
  flash: FLASH_DEFAULT,
  vignette: 'on',
});

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => clamp(Number(v) || 0, 0, 1);

function flag(value, onWord) {
  if (value === true || value === 'on' || value === onWord) return 'on';
  if (value === false || value === 'off') return 'off';
  return null;
}

// Accepts the module defaults, a Crest Run save, or a boolean left over from
// an older haptics flag. Unknown keys are ignored, so a game speed field
// cannot ride along.
export function normalizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const haptics = flag(src.haptics, 'on') || DEFAULT_FEEDBACK_SETTINGS.haptics;
  const shake = flag(src.shake, 'on') || DEFAULT_FEEDBACK_SETTINGS.shake;
  const vignette = flag(src.vignette, 'on') || DEFAULT_FEEDBACK_SETTINGS.vignette;
  const flashN = Number(src.flash);
  const hapN = Number(src.hapticStrength);
  const shN = Number(src.shakeStrength);
  return {
    haptics,
    hapticStrength: Number.isFinite(hapN) ? clamp01(hapN) : DEFAULT_FEEDBACK_SETTINGS.hapticStrength,
    shake,
    shakeStrength: Number.isFinite(shN) ? clamp01(shN) : DEFAULT_FEEDBACK_SETTINGS.shakeStrength,
    shakeStyle: src.shakeStyle === 'classic' ? 'classic' : 'rig',
    flash: Number.isFinite(flashN) ? clamp(flashN, 0, FLASH_MAX) : FLASH_DEFAULT,
    vignette,
  };
}

// The slider value is the flash. 0.15 is the default; 0.3 is as bright as it gets.
export function scaleFlash(setting) {
  const n = Number(setting);
  if (!Number.isFinite(n)) return FLASH_DEFAULT;
  return clamp(n, 0, FLASH_MAX);
}

export function scalePulse(value, strength) {
  return clamp(value * clamp01(strength), 0, 1);
}

export function scalePattern(pattern, strength) {
  const k = clamp01(strength);
  return pattern.map((ms) => Math.max(1, Math.round(ms * k)));
}

// The first actuator that can pulse, or null. Never throws. hapticActuators[0]
// is the path Quest documents; vibrationActuator is the later name for the
// same pulse() and is accepted when the array is missing.
export function readActuator(inputSource) {
  try {
    if (!inputSource) return null;
    const pad = inputSource.gamepad;
    if (!pad) return null;
    const list = pad.hapticActuators;
    if (list && typeof list.length === 'number' && list.length > 0) {
      const actuator = list[0];
      if (actuator && typeof actuator.pulse === 'function') return actuator;
    }
    const one = pad.vibrationActuator;
    if (one && typeof one.pulse === 'function') return one;
    return null;
  } catch (e) {
    return null;
  }
}

export function canVibrate(nav) {
  try {
    return !!(nav && typeof nav.vibrate === 'function');
  } catch (e) {
    return false;
  }
}

function copySteps(profile) {
  return profile.steps.map((s) => ({ value: s.value, duration: s.duration }));
}

// One channel per actuator. A higher rank replaces what is playing. An equal
// or lower rank waits, and a second event of a rank that is already waiting
// is dropped so a stream of shots cannot pile up behind a hit.
export function createPulseQueue() {
  const channels = new Map();
  function state(key) {
    let s = channels.get(key);
    if (!s) {
      s = { rank: 0, until: 0, next: null, wait: [] };
      channels.set(key, s);
    }
    return s;
  }
  return {
    keys() { return [...channels.keys()]; },
    offer(key, profile, now) {
      const rank = HAPTIC_PRIORITY[profile.priority] || 0;
      const steps = copySteps(profile);
      const s = state(key);
      const idle = now >= s.until && !s.next;
      if (idle || rank > s.rank) {
        const played = steps.shift();
        s.rank = rank;
        s.until = now + played.duration;
        s.next = steps.length ? steps : null;
        s.wait = s.wait.filter((job) => job.rank > rank);
        return { action: 'play', step: played, rank };
      }
      if (s.wait.some((job) => job.rank === rank)) return { action: 'drop', rank };
      s.wait.push({ rank, steps });
      s.wait.sort((a, b) => b.rank - a.rank);
      return { action: 'wait', rank };
    },
    poll(key, now) {
      const s = channels.get(key);
      if (!s || now < s.until) return null;
      if (s.next && s.next.length) {
        const played = s.next.shift();
        s.until = now + played.duration;
        if (!s.next.length) s.next = null;
        return { action: 'play', step: played, rank: s.rank };
      }
      s.next = null;
      if (!s.wait.length) { s.rank = 0; s.until = 0; return null; }
      const job = s.wait.shift();
      const played = job.steps.shift();
      s.rank = job.rank;
      s.until = now + played.duration;
      s.next = job.steps.length ? job.steps : null;
      return { action: 'play', step: played, rank: s.rank };
    },
  };
}

function safePulse(actuator, value, duration) {
  try {
    const pending = actuator.pulse(value, duration);
    if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    return true;
  } catch (e) {
    return false;
  }
}

// dir.x > 0 is to the player's right. dir.y > 0 is up. The anchor is where the
// colour sits: a CSS percentage, and a gradient angle whose last stop is that
// edge. 0 degrees is up. One fade of VIGNETTE_MS, not a loop.
export function edgeAnchor(dir) {
  const x = clamp(Number(dir && dir.x) || 0, -1, 1);
  const y = clamp(Number(dir && dir.y) || 0, -1, 1);
  const angle = Math.atan2(x, y || (x === 0 ? 1 : 0)) * 180 / Math.PI;
  return { x: 50 + x * 50, y: 50 - y * 50, angle, ms: VIGNETTE_MS };
}

export function showEdge(el, dir) {
  if (!el || !el.classList || !el.style) return null;
  const anchor = edgeAnchor(dir);
  try {
    el.style.setProperty('--hit-x', anchor.x + '%');
    el.style.setProperty('--hit-y', anchor.y + '%');
    el.style.setProperty('--hit-angle', anchor.angle + 'deg');
  } catch (e) { /* the page can still flash the full ring */ }
  if (dir) el.classList.add('dir'); else el.classList.remove('dir');
  el.classList.remove('hit');
  void el.offsetWidth;
  el.classList.add('hit');
  return anchor;
}

// from has { x, z, h } with h the facing yaw. to has { x, z }. Right is +x
// in the returned direction. Ahead sits a little high on the screen.
export function bearingDir(from, to) {
  const dx = (to && to.x || 0) - (from && from.x || 0);
  const dz = (to && to.z || 0) - (from && from.z || 0);
  const h = from && from.h || 0;
  const right = dx * Math.cos(h) + dz * Math.sin(h);
  const ahead = dx * -Math.sin(h) + dz * Math.cos(h);
  const len = Math.hypot(right, ahead);
  if (len < 1e-4) return { x: 0, y: 0.35 };
  return { x: clamp(right / len, -1, 1), y: clamp(ahead >= 0 ? 0.45 : -0.7, -1, 1) };
}

// Translation is in deck axes: x right, y up, z forward. roll is the old
// phone camera roll, in radians, before the sin. In XR, roll is always 0:
// the cabin may move, the horizon may not.
export function shakePose(amount, time, settings, opts = {}) {
  const s = normalizeSettings(settings);
  const mag = Math.max(0, Number(amount) || 0);
  const zero = { x: 0, y: 0, z: 0, roll: 0 };
  if (s.shake !== 'on' || s.shakeStrength <= 0 || mag <= 0) return zero;
  const k = mag * s.shakeStrength;
  if (!opts.xr && s.shakeStyle === 'classic') return { x: 0, y: 0, z: 0, roll: CLASSIC_ROLL * k };
  const t = Number(time) || 0;
  return {
    x: SHAKE_METRES * k * Math.sin(t * 71),
    y: SHAKE_METRES * 0.62 * k * Math.sin(t * 63 + 1.1),
    z: SHAKE_METRES * 0.45 * k * Math.sin(t * 53),
    roll: 0,
  };
}

function defaultVibrate(pattern) {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
    navigator.vibrate(pattern);
    return true;
  } catch (e) {
    return false;
  }
}

export function createFeedback(options = {}) {
  const settings = normalizeSettings(options.settings);
  const pulseQueue = createPulseQueue();
  const isIos = typeof options.ios === 'function' ? options.ios : () => !!options.ios;
  const iosTap = typeof options.iosTap === 'function' ? options.iosTap : () => {};
  const vibrate = typeof options.vibrate === 'function' ? options.vibrate : defaultVibrate;
  const clock = typeof options.now === 'function' ? options.now : () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const buzz = { rank: 0, until: 0, wait: [] };
  let comfortAmt = 0;
  let comfortUntil = 0;

  function enabled() {
    return settings.haptics === 'on' && settings.hapticStrength > 0;
  }
  function offerBuzz(name, now) {
    const pattern = VIBRATE_PATTERNS[name];
    const profile = HAPTIC_PROFILES[name];
    if (!pattern || !profile) return { action: 'skip' };
    const played = scalePattern(pattern, settings.hapticStrength);
    const dur = played.reduce((sum, ms) => sum + ms, 0);
    const rank = HAPTIC_PRIORITY[profile.priority] || 0;
    const idle = now >= buzz.until;
    if (idle || rank > buzz.rank) {
      buzz.rank = rank;
      buzz.until = now + dur;
      buzz.wait = buzz.wait.filter((job) => job.rank > rank);
      return { action: 'play', pattern: played, rank };
    }
    if (buzz.wait.some((job) => job.rank === rank)) return { action: 'drop', rank };
    buzz.wait.push({ rank, name });
    buzz.wait.sort((a, b) => b.rank - a.rank);
    return { action: 'wait', rank };
  }
  function sendBuzz(name, now) {
    const decision = offerBuzz(name, now);
    if (decision.action !== 'play') return { played: decision.action === 'wait', via: 'vibrate', reason: decision.action };
    let ok = false;
    try { ok = vibrate(decision.pattern); } catch (e) { ok = false; }
    if (ok === false) return { played: false, via: 'vibrate', reason: 'missing' };
    return { played: true, via: 'vibrate', pattern: decision.pattern };
  }
  function sendPulse(profile, sources, hand, now) {
    const list = Array.isArray(sources) ? sources : [];
    const chosen = [];
    if (profile.hands === 'both') {
      for (const source of list) {
        const actuator = readActuator(source);
        if (actuator && !chosen.includes(actuator)) chosen.push(actuator);
      }
    } else {
      const index = Number.isFinite(hand) ? hand : 0;
      const source = list[index] || list[0];
      const actuator = readActuator(source);
      if (actuator) chosen.push(actuator);
    }
    if (!chosen.length) return null;
    let played = false;
    for (const actuator of chosen) {
      const decision = pulseQueue.offer(actuator, profile, now);
      if (decision.action === 'play') {
        const value = scalePulse(decision.step.value, settings.hapticStrength);
        if (safePulse(actuator, value, decision.step.duration)) played = true;
      } else if (decision.action === 'wait') played = true;
    }
    // handled: an actuator owns this event. Do not also call vibrate(), which
    // would overwrite a pulse that is already speaking on the headset.
    return { played, via: 'pulse', handled: true };
  }

  return {
    settings,
    queue: pulseQueue,
    configure(raw) {
      Object.assign(settings, normalizeSettings({ ...settings, ...(raw && typeof raw === 'object' ? raw : {}) }));
      return settings;
    },
    play(name, ctx = {}) {
      try {
        const profile = HAPTIC_PROFILES[name];
        if (!profile) return { played: false, reason: 'unknown' };
        if (!enabled()) return { played: false, reason: 'off' };
        const now = Number.isFinite(ctx.now) ? ctx.now : clock();
        // iPhone has no Vibration API. The switch tap only lands inside the
        // gesture that fired or flared, and a hit never schedules one for later.
        if (isIos()) {
          if (ctx.gesture && PLAYER_GESTURES.includes(name)) {
            try { iosTap(); } catch (e) { /* no switch tap here */ }
            return { played: true, via: 'ios' };
          }
          return { played: false, via: 'ios', reason: 'visual' };
        }
        if (ctx.iosOnly) return { played: false, reason: 'ios-only' };
        if (ctx.xr) {
          const pulsed = sendPulse(profile, ctx.sources, ctx.hand, now);
          if (pulsed && pulsed.handled) return pulsed;
        }
        if (!VIBRATE_PATTERNS[name]) return { played: false, reason: 'none' };
        return sendBuzz(name, now);
      } catch (e) {
        return { played: false, reason: 'error' };
      }
    },
    tick(now) {
      const t = Number.isFinite(now) ? now : clock();
      try {
        if (!isIos() && enabled()) {
          for (const key of pulseQueue.keys()) {
            const decision = pulseQueue.poll(key, t);
            if (decision && decision.action === 'play' && key && typeof key.pulse === 'function') {
              safePulse(key, scalePulse(decision.step.value, settings.hapticStrength), decision.step.duration);
            }
          }
          if (t >= buzz.until && buzz.wait.length) {
            const job = buzz.wait.shift();
            const decision = offerBuzz(job.name, t);
            if (decision.action === 'play') {
              try { vibrate(decision.pattern); } catch (e) { /* already gone */ }
            }
          }
        }
      } catch (e) { /* a dead actuator must not stop the frame */ }
      return { comfort: t < comfortUntil && settings.vignette === 'on' };
    },
    // Comfort tunnel for a hit now, and for dodge or knockback when those
    // events exist. Amount is 0..1. Off in settings means this does nothing.
    comfort(amount, now) {
      if (settings.vignette !== 'on') return { on: false, ms: VIGNETTE_MS };
      const t = Number.isFinite(now) ? now : clock();
      comfortAmt = clamp01(amount === undefined ? 0.5 : amount);
      comfortUntil = t + VIGNETTE_MS;
      return { on: true, amount: comfortAmt, ms: VIGNETTE_MS };
    },
    comfortActive(now) {
      const t = Number.isFinite(now) ? now : clock();
      return settings.vignette === 'on' && t < comfortUntil;
    },
    comfortAmount() { return comfortAmt; },
  };
}
