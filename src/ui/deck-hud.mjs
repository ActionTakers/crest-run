// deck-hud.mjs: the Coastal Run: Iron Hawk display. The race HUD's place, gap, lap, speed and boost
// are not reused here. The goal line stays until the fight state that asked for it has changed.
import { COASTAL_NAME, DECK, HAWK, aimAt, helmLane, laneName } from '../sim/deck.mjs?v=4881be4d';

const FILLED = '\u25CF', EMPTY = '\u25CB', ARMOUR_ON = '\u25AE', ARMOUR_OFF = '\u25AF';
const ARMOUR_CELLS = 4;

export function hullMarks(hull, max = DECK.hull) {
  const left = Math.max(0, Math.min(max, Math.round(Number(hull) || 0)));
  return FILLED.repeat(left) + EMPTY.repeat(Math.max(0, max - left));
}

export function armourMarks(ratio, cells = ARMOUR_CELLS) {
  const n = Math.max(0, Math.min(cells, Math.round(Math.max(0, Math.min(1, ratio)) * cells)));
  return ARMOUR_ON.repeat(n) + ARMOUR_OFF.repeat(cells - n);
}

// The current objective. The same fight state always returns the same line, so the display
// holds it until that step is fulfilled (the state moves on) rather than flashing it away.
export function deckGoal(F) {
  if (!F) return '';
  if (F.over) return F.won ? 'THE MEGALODON TAKES THE IRON HAWK' : F.hull <= 0 ? 'YOUR BOAT IS SUNK' : 'TIME IS UP';
  const racing = !!(F.race && F.race.racing);
  if (!racing) return 'DRAG TO AIM, HOLD TO FIRE';
  if (F.st === 'crip') return F.flares > 0 ? 'CRIPPLED: FIRE A FLARE' : 'CRIPPLED: THE SEA IS COMING';
  if (F.st === 'aim' || (F.st === 'pass' && !F.struck && !F.broken)) return `BREAK THE PASS: ${F.podHits} OF ${F.need} HITS ON THE GUN POD`;
  if (F.rockets && F.rockets.some((q) => q.on)) return 'SHOOT THE ROCKETS DOWN';
  if (F.st === 'stun') return F.half === 2 && F.flares > 0 ? 'IT HANGS LOW: FIRE A FLARE' : 'STAGGERED: IT HANGS LOW. UNLOAD';
  if (F.half === 2 && F.flares > 0 && F.low && !(F.breach && F.breach.on)) return 'FIRE A FLARE WHILE IT IS LOW';
  if (F.half === 2 && F.flares > 0 && !F.bites) return 'THREE FLARES: FIRE ONE WHILE IT IS LOW';
  if (!F.shots) return 'DRAG TO AIM, HOLD TO FIRE';
  return F.half === 2 ? 'KEEP THE GUN ON IT' : 'KEEP THE MAGAZINE FOR ITS LOW PASS';
}

// Which lane the boat is in, and, while a pass is lit, which lane that pass committed to.
// The brackets are the boat. STRAFE names the lit lane. The two together say whether that lane is safe.
export function deckLaneReadout(F) {
  const half = F && F.race && F.race.c && F.race.c.halfWidth > 0 ? F.race.c.halfWidth : HAWK.halfWidth;
  const lane = F ? helmLane(F.laneOff || 0, half) : 0;
  const pass = F && (F.passLane === -1 || F.passLane === 1) ? F.passLane : 0;
  const live = !!(F && !F.over && (F.st === 'aim' || (F.st === 'pass' && !F.struck && !F.broken)));
  const safe = live && lane !== pass;
  const hot = live && lane === pass;
  const names = [-1, 0, 1].map((i) => (i === lane ? `[${laneName(i)}]` : laneName(i))).join('  ');
  const text = live ? `${names}  ·  STRAFE ${laneName(pass)}` : names;
  return { lane, pass, live, safe, hot, text };
}

// A plain snapshot of the deck HUD. Race fields (place, gap, lap, TAKEN, boost, speed) are absent.
export function deckHudSnapshot(F) {
  const hullLeft = Math.max(0, Math.round(Number(F.hull) || 0));
  const ratio = F.hpMax > 0 ? Math.max(0, Math.min(1, F.hp / F.hpMax)) : 0;
  const ammoCount = Math.max(0, Math.round(Number(F.mag) || 0));
  const flaresCount = Math.max(0, Math.round(Number(F.flares) || 0));
  const lanes = deckLaneReadout(F);
  return {
    title: COASTAL_NAME,
    mode: 'deck',
    hull: `HULL ${hullMarks(hullLeft)}`,
    ammo: `AMMO ${ammoCount}`,
    flares: `FLARES ${flaresCount}`,
    armour: `HAWK ARMOUR ${armourMarks(ratio)}`,
    armourRatio: ratio,
    goal: deckGoal(F),
    lane: lanes.text,
    laneSafe: lanes.safe,
    laneHot: lanes.hot,
    hullLeft,
    hullMax: DECK.hull,
    ammoCount,
    flaresCount,
    reloading: F.reload > 0,
  };
}

// ---- readable targets (phone and VR). None of this changes a combat number. ----
// The airframe reads as blue-grey. Gold weak spots sit on it. Green and khaki do not.
export const HULL_NEUTRAL = 0x8d99a8;
export const HULL_NEUTRAL_DARK = 0x5e6a76;
// Eyes sit above and beside the mast. These offsets are the picture only; the sim gun stays at HAWK.gun.
export const DECK_EYE = { up: 3.4, side: 1.35 };
// Above the rotor disc, so the mast and the blades do not cover the stagger bar.
export const STAGGER_LIFT = 11.8;

export function hullReadsNeutral(hex) {
  const n = Number(hex) >>> 0;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return b >= g - 6 && b >= r - 6 && spread < 55 && g < 190 && b > 90;
}

// Where the gun looks so the helicopter, not the empty bow, fills the sight. Does not move the helicopter.
export function openingAim(F) {
  const g = F.gunAt();
  return aimAt(F.me.h, g.x, g.y, g.z, F.x, F.y, F.z);
}

// Until the player takes the gun, the sight stays on the hawk. A touch returns null and the player's aim is kept.
export function acquireAim(F, touched) {
  if (touched || !F || F.over) return null;
  const aim = openingAim(F);
  const ap = Math.min(HAWK.aim.up, Math.max(HAWK.aim.down, aim.ap));
  return { ay: aim.ay, ap };
}

// How far the aim sits from the hawk, radians. Zero means the weak spots are in front of the barrel.
export function aimOffHawk(F, ay, ap) {
  const want = openingAim(F);
  const dy = Math.atan2(Math.sin(want.ay - ay), Math.cos(want.ay - ay));
  return Math.hypot(dy, want.ap - ap);
}

// A gold HAWK tag at the edge when the helicopter is beside or behind the sight, as plain as TOO FAR.
export function hawkMarker(ndc) {
  if (!ndc) return { on: false };
  const beside = !!ndc.behind || Math.abs(ndc.x) > 0.42 || Math.abs(ndc.y) > 0.42;
  if (!beside) return { on: false };
  const far = ndc.behind || Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1;
  const edge = far ? threatEdge(ndc, 0.8) : threatEdge({ x: ndc.x * 4, y: ndc.y * 4, behind: false }, 0.8);
  if (!edge.off) return { on: false };
  return { on: true, label: 'HAWK', left: edge.left, top: edge.top, angle: edge.angle };
}

// World size of a damage chip. Weak spots stay larger than body hits at every distance.
export function chipWorldScale(weak, dist) {
  const k = Math.min(4.4, Math.max(1.35, (Number(dist) || 0) / 32));
  const base = weak ? 3.6 : 2.0;
  return { x: base * k, y: base * k * 0.5, k };
}

// Gold on blue-grey. The weak spots are never marked red against green.
export const WEAK_GOLD = '#ffc24a';
export const RANGE_GREY = '#9aa3ab';
export const THREAT_BLUE = '#7ec8ff';
const EDGE_MARGIN = 0.74;

// Distance from the gun to the helicopter. Past nearD the crosshair reads TOO FAR and the percent is far.mul.
export function deckRange(F) {
  const pct = Math.round(DECK.far.mul * 100);
  if (!F || typeof F.gunAt !== 'function') return { far: false, dist: 0, pct, label: '' };
  const g = F.gunAt();
  const dist = Math.hypot(F.x - g.x, F.y - g.y, F.z - g.z);
  const far = dist > DECK.nearD && !F.over;
  return { far, dist, pct, label: far ? `TOO FAR ${pct}%` : '' };
}

// The chip drawn on a hit. A weak spot (pod or tail) is larger and gold. The number is the harm the sim just applied.
export function damageChip(F, what, dist) {
  if (!F || !what || what === 'rocket' || !DECK[what] || F.st === 'crip') return null;
  const P = DECK[what];
  const weak = what !== 'body';
  const far = dist > DECK.nearD;
  const open = F.open || !weak;
  const mul = (far ? DECK.far.mul : 1) * (F.st === 'stun' ? DECK.stunMul : 1) * (weak && !open ? 0.4 : 1);
  const n = P.dmg * mul;
  if (!(n > 0)) return null;
  const text = n >= 10 ? String(Math.round(n)) : (Math.round(n * 100) / 100).toFixed(2);
  return { what, weak, gold: weak, text, scale: weak ? 1.65 : 1 };
}

// The lit lane stays at or above half opacity. Its edge pulses, unless the picture is being kept calm.
export function laneLook(t, still) {
  const pulse = still ? 1 : 0.5 + 0.5 * Math.sin(t * 2.2);
  return {
    lane: still ? 0.62 : 0.55 + 0.18 * pulse,
    edge: still ? 0.72 : 0.38 + 0.57 * pulse,
  };
}

// Seconds from the start of the dive until the strafing run reaches the boat (fly(): r = r0 * (1 - 2k)).
export function strafeLead(r0) {
  const r = Math.abs(r0 || DECK.far.r);
  const k = 0.5 * (1 - Math.min(0.9, DECK.pass.hitR / Math.max(DECK.pass.hitR + 1, r)));
  return k * DECK.pass.s;
}

// 3, 2, 1 while the pass lane is lit and the strafe is under three seconds out. Otherwise no digit.
export function passCountdown(F) {
  const none = { n: 0, label: '', eta: null };
  if (!F || F.over) return none;
  const live = F.st === 'aim' || (F.st === 'pass' && !F.struck && !F.broken);
  if (!live) return none;
  const lead = strafeLead(F.st === 'pass' ? (F.r0 || F.r) : F.r);
  const eta = F.st === 'aim' ? Math.max(0, DECK.pass.aimS - F.t) + lead : lead - F.t;
  if (!(eta > 0) || eta > 3) return none;
  const n = Math.ceil(eta - 1e-9);
  if (n < 1 || n > 3) return none;
  return { n, label: String(n), eta };
}

// Share of the ring still to go. It closes as the rocket's flight runs out.
export function impactRing(t, T) {
  const k = T > 0 ? Math.min(1, Math.max(0, t / T)) : 1;
  return { k, remain: 1 - k, left: Math.max(0, (T || 0) - (t || 0)) };
}

// ndc: projected x, y, and behind (the point is not in front of the camera).
// Behind is flipped once here, so the caller passes the raw projection.
export function threatEdge(ndc, margin = EDGE_MARGIN) {
  if (!ndc) return { off: false };
  const on = !ndc.behind && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
  if (on) return { off: false };
  let x = ndc.x, y = ndc.y;
  if (ndc.behind) { x = -x; y = -y; }
  if (Math.abs(x) < 1e-4 && Math.abs(y) < 1e-4) y = -1;
  const lim = Math.max(Math.abs(x), Math.abs(y), 1e-4);
  const ex = (x / lim) * margin;
  const ey = (y / lim) * margin;
  return {
    off: true,
    left: (ex * 0.5 + 0.5) * 100,
    top: (-ey * 0.5 + 0.5) * 100,
    angle: Math.atan2(ex, ey) * 180 / Math.PI,
  };
}
