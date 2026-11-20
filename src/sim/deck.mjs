// deck.mjs: the third boss level, "Iron Hawk": the level on the deck. Built on research step A8 (how the Final Fantasy games
// build boss LEVELS: <local>, teachings T13 to T25, on top of T1 to T12 of step
// A3; no name, character, picture, tune or level of that series is used) and on the owner's words of 2026-11-17 ("stand on
// the deck of the driving boat ... an attack helicopter flying over that gets eaten by a massive megaladon").
// One theme and one kind of game, unlike every other level (T13): a shooter on rails. The boat sails a wide ring by itself;
// the player stands on the foredeck and aims a gun by hand (the first weapon of the game that is aimed and not steered).
// The story the fight tells (T14): a gunship hunts the boat, and the sea answers. Two halves with different ideas (T15):
// I The Hunt: the gunner against the helicopter; II The Deep Answers: a megalodon circles, and the great blow is its own.
// Range is the mechanic (T16): from afar the helicopter sends rockets, which can be shot down, and bullets hardly hurt it;
// on its low passes over the boat its gun pod and tail rotor are open. The helicopter's body announces the pass and the
// lane it will fly is lit on the water (T18); enough hits on the gun pod before it arrives break the pass (T9).
// Hits fill a stagger gauge: full, it hangs low and smoking and takes double damage (T7). In the second half the player has
// three flares (T17: rationed, and only at the right range): a flare at the helicopter while it is low calls the megalodon,
// which leaps and bites (T20); a flare while it is high is wasted, not fatal (T21). The last blow is the megalodon's.
// The play never stops for the show (T22): the breach happens while the player still holds the gun.
// Pure (no DOM, no three.js), fixed step, seeded; it runs on a Race in free mode like sim/leviathan.mjs. Every number is
// tuned with the stand-in gunner below, never by a person. Tests: tests/deck.test.mjs.
// Written 2026-11-17 by the yacht project session.
import { DT, Race } from './race-sim.mjs?v=b016c49c';
import { buildCourse, wrapA } from './courses.mjs?v=b016c49c';

const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// One player-facing name for this mode. The fight key stays 'hawk' and the sim kind stays 'deck'.
export const COASTAL_NAME = 'Coastal Run: Iron Hawk';
export const HAWK = { key: 'hawk', name: 'Iron Hawk', title: COASTAL_NAME, world: 'agung', world2: 'squall', R: 250, halfWidth: 120, sea: { count: 5, seed: 83, amp: 0.4 }, startA: 250 * DEG, pace: 0.5,
  gun: { ahead: 2.4, up: 3.0 },                                  // where the gunner's eyes and gun are: metres ahead of the boat's middle and over the water
  aim: { down: -0.3, up: 1.4 } };                                // the gun turns all the way round (the gunner turns with it); how far down and up it points
export const HALVES = ['The Hunt', 'The Deep Answers'];
export const DECK = {
  hp: 100, half2: 0.55, crippled: 0.12, hull: 5, graceS: 1.6, capS: 240,
  gun: [{ mag: 36, rate: 9, reloadS: 1.5 }, { mag: 54, rate: 12, reloadS: 1.3 }],      // the gun of each half: it grows in the player's hands (T24)
  spread: 0.004, cone: 0.011,                                    // a seeded scatter (radians), and how much wider a target counts for each metre of distance
  far: { r: 112, y: 40, mul: 0.35, stag: 0.15 }, nearD: 72,      // its orbit; from farther than nearD a bullet does `mul` of its harm and `stag` of its stagger
  body: { r: 4.2, dmg: 0.12, stag: 0.3 }, pod: { r: 2.3, dmg: 0.5, stag: 1.2, ahead: 3.2, down: 1.7 }, tail: { r: 2.1, dmg: 0.36, stag: 0.9, back: 7.6, up: 0.5 },
  orbit: { w: 0.2, s: [11, 9] },                                  // radians a second round the boat; seconds of orbit before a pass, per half
  rocket: { n: [2, 3], every: [9, 7], v: 26, r: 2.1, first: 4, stag: 2 },
  pass: { aimS: 1.9, s: 4.6, low: 12, hitR: 26, need: 6, brokenStag: 18 },   // the announced pass: `need` hits on the gun pod before it arrives break it
  stagger: 80, stunS: 6.5, stunMul: 1.6, stun: { r: 44, y: 14 },
  flares: 3, flareR: 12, biteAlt: 22, breachS: 1.15, bite: 0.3, climbS: 3.2,
  crip: { r: 48, y: 13, w: 0.32, mercyS: 7 },                    // crippled it cannot climb; without a flare left the megalodon comes by itself after mercyS
  levels: { easy: { hp: 0.8, aim: 1.7, rocket: 0.85, need: 0.7 }, normal: { hp: 1, aim: 1.35, rocket: 1, need: 1 }, hard: { hp: 1.2, aim: 1.05, rocket: 1.15, need: 1.3 } },
};

let built = null;
export function hawkCourse() {
  if (built) return built;
  const control = [];
  for (let k = 0; k < 16; k++) { const a = HAWK.startA + (k * 2 * Math.PI) / 16; control.push([Math.cos(a) * HAWK.R, Math.sin(a) * HAWK.R]); }
  built = buildCourse({ key: HAWK.key, name: HAWK.name, world: HAWK.world, sea: HAWK.sea, laps: 1, control, halfWidth: HAWK.halfWidth, cornerGates: false,
    extraGates: [{ s: 60, lat: 0, width: 2 * HAWK.halfWidth }], ramps: [], arena: true, scenery: { islands: 5, liner: 0, cargo: 1, tug: 0, sails: 0, towers: 0 } });
  return built;
}
export function hawkSettings(course, { tune = 'cruise' } = {}) {
  return { laps: 1, sea: { ...HAWK.sea }, boats: [{ name: 'You', tune, ai: null }], player: 0, band: 0, grid: 'back', free: true };
}
// gold: won with at most one part of the hull lost, inside 150 s, and a flare to spare; silver: won with two parts left; bronze: won
export function hawkMedal(won, hull, time, flares) { return !won ? null : hull >= DECK.hull - 1 && time <= 150 && flares >= 1 ? 'gold' : hull >= 2 ? 'silver' : 'bronze'; }
// the direction of the gun: yaw from the bow (plus = to starboard, as a heading turns), pitch up; h: the boat's heading
export function aimDir(h, ay, ap, out = {}) { const y = h + ay, c = Math.cos(ap); out.x = -Math.sin(y) * c; out.y = Math.sin(ap); out.z = Math.cos(y) * c; return out; }
// the yaw and pitch that point the gun from (gx, gy, gz) at (x, y, z), for a boat heading h
export function aimAt(h, gx, gy, gz, x, y, z, out = {}) { const dx = x - gx, dy = y - gy, dz = z - gz; out.ay = wrapA(Math.atan2(-dx, dz) - h); out.ap = Math.atan2(dy, Math.hypot(dx, dz)); return out; }

export class DeckFight {
  constructor(race, { difficulty = 'normal', seed = 5 } = {}) {
    this.kind = 'deck'; this.race = race; this.difficulty = DECK.levels[difficulty] ? difficulty : 'normal'; this.level = DECK.levels[this.difficulty];
    this.rnd = mulberry(seed); this.handover = true;                 // the boat sails by itself from the first second (main.mjs stepRace)
    this.hpMax = Math.round(DECK.hp * this.level.hp); this.hp = this.hpMax; this.half = 1; this.hull = DECK.hull; this.stag = 0;
    this.st = 'orbit'; this.t = 0; this.th = 0.9; this.r = DECK.far.r; this.y = DECK.far.y; this.dir = 1; this.x = 0; this.z = 0; this.nx = 0; this.nz = 1;   // the helicopter: state, seconds in it, bearing from the bow, distance, height
    this.podHits = 0; this.broken = false; this.struck = false; this.rocketT = DECK.rocket.first;
    this.rockets = []; for (let i = 0; i < 6; i++) this.rockets.push({ on: false, t: 0, T: 1, sx: 0, sy: 0, sz: 0, x: 0, y: 0, z: 0, w: 0, lift: 0 });
    this.input = { ay: 0, ap: 0.12, fire: false, flare: false }; this.flareHeld = false;
    this.mag = DECK.gun[0].mag; this.cool = 0; this.reload = 0; this.flares = 0; this.breach = { on: false, t: 0, x: 0, z: 0, hit: false, devour: false, called: false };
    this.fin = 0;                                                    // the megalodon's fin: its bearing round the boat (radians), for the picture
    this.shots = 0; this.hits = 0; this.weak = 0; this.down = 0; this.taken = 0; this.stuns = 0; this.bites = 0; this.wasted = 0; this.breaks = 0; this.passes = 0; this.safeT = -1e9; this.cripT = 0;
    this.over = false; this.won = false; this.endT = null; this.me = race.boats[race.player];
    this.auto = { ay: 0, ap: 0.12, wait: 0, err: 0, errT: 0 };
    this.place();
  }
  ev(e) { this.race.events.push(e); }
  get gun() { return DECK.gun[this.half - 1]; }
  get low() { return this.y <= DECK.biteAlt && (this.st === 'pass' || this.st === 'stun' || this.st === 'crip'); }
  get open() { return this.st === 'pass' || this.st === 'aim' || this.st === 'stun'; }        // its weak points can be hurt
  // where the helicopter is, from its bearing, distance and height; its nose points along (nx, nz)
  place() {
    const b = this.me, a = b.h + this.th; this.x = b.x - Math.sin(a) * this.r; this.z = b.z + Math.cos(a) * this.r;
    if (this.st === 'orbit' || this.st === 'crip' || this.st === 'climb') { const s = this.dir * Math.sign(this.r || 1); this.nx = -Math.cos(a) * s; this.nz = -Math.sin(a) * s; }   // along its circle
    else { const k = this.st === 'pass' ? 1 : Math.sign(this.r || 1); this.nx = Math.sin(a) * k; this.nz = -Math.cos(a) * k; }                                                   // toward the boat, and on through
  }
  part(name, out = {}) { const P = DECK[name]; if (name === 'pod') { out.x = this.x + this.nx * P.ahead; out.y = this.y - P.down; out.z = this.z + this.nz * P.ahead; } else if (name === 'tail') { out.x = this.x - this.nx * P.back; out.y = this.y + P.up; out.z = this.z - this.nz * P.back; } else { out.x = this.x; out.y = this.y; out.z = this.z; } return out; }
  gunAt(out = {}) { const b = this.me; out.x = b.x - Math.sin(b.h) * HAWK.gun.ahead; out.y = HAWK.gun.up; out.z = b.z + Math.cos(b.h) * HAWK.gun.ahead; return out; }

  step() {
    const race = this.race, b = this.me, T = race.lapT;
    b.pace = HAWK.pace;
    if (!race.racing) { this.place(); return; }
    if (!this.over) { this.fly(T); this.salvo(T); this.shoot(); this.flare(); }
    this.place(); this.stepRockets(); this.stepBreach();
    if (this.half === 2 || this.breach.on) this.fin = wrapA(this.fin + 0.5 * DT);
    if (!this.over && (this.won || this.hull <= 0 || T > DECK.capS)) {
      this.over = true; this.endT = T; for (const q of this.rockets) q.on = false;
      this.ev({ type: 'dEnd', won: this.won, hp: Math.max(0, this.hp), hull: this.hull });
      race.playerDone();
    }
  }
  // the helicopter: orbit, an announced pass, the pass, stunned, climbing away, crippled
  fly(T) {
    const D = DECK, h = this.half - 1, ease = (v, to, k) => v + (to - v) * Math.min(1, k * DT); this.t += DT;
    if (this.st === 'orbit') {
      this.th = wrapA(this.th + this.dir * D.orbit.w * DT); this.r = ease(this.r, D.far.r, 1.2); this.y = ease(this.y, D.far.y, 1.2);
      if (this.t >= D.orbit.s[h]) { this.st = 'aim'; this.t = 0; this.podHits = 0; this.broken = false; this.struck = false; this.passes++; this.ev({ type: 'dAim', need: this.need }); }
    } else if (this.st === 'aim') {
      this.y = ease(this.y, 26, 1.6);
      if (this.t >= D.pass.aimS) { this.st = 'pass'; this.t = 0; this.r0 = this.r; this.ev({ type: 'dPass' }); }
    } else if (this.st === 'pass') {
      const k = Math.min(1, this.t / D.pass.s); this.r = this.r0 * (1 - 2 * k); this.y = D.pass.low + (26 - D.pass.low) * Math.abs(1 - 2 * k) ** 1.5;
      if (!this.struck && !this.broken && Math.abs(this.r) < D.pass.hitR) { this.struck = true; const hit = this.strike(1); this.ev({ type: 'dStrafe', hit, hull: this.hull }); }
      if (k >= 1) { this.th = wrapA(this.th + Math.PI); this.r = -this.r; this.dir = -this.dir; this.st = 'orbit'; this.t = 0; }
    } else if (this.st === 'stun') {
      this.r = ease(this.r, D.stun.r, 1.5); this.y = ease(this.y, D.stun.y, 1.8); this.th = wrapA(this.th + 0.05 * DT);
      if (this.t >= D.stunS) { this.stag = 0; this.st = 'climb'; this.t = 0; this.ev({ type: 'dStunEnd' }); }
    } else if (this.st === 'climb') {
      this.r = ease(this.r, D.far.r, 0.9); this.y = ease(this.y, D.far.y, 0.9); this.th = wrapA(this.th + this.dir * D.orbit.w * DT);
      if (this.t >= D.climbS) { this.st = 'orbit'; this.t = 0; }
    } else if (this.st === 'crip') {
      this.r = ease(this.r, D.crip.r, 1.2); this.y = ease(this.y, D.crip.y + 1.5 * Math.sin(T * 2.1), 1.5); this.th = wrapA(this.th + this.dir * D.crip.w * DT); this.cripT += DT;
      if (this.flares <= 0 && !this.breach.on && this.cripT >= D.crip.mercyS) this.call(true);     // no flare left: the sea comes by itself
    }
    if (this.r < 0 && this.st !== 'pass') { this.r = -this.r; this.th = wrapA(this.th + Math.PI); }
  }
  get need() { return Math.max(2, Math.round(DECK.pass.need * this.level.need)); }
  // rockets: from afar only, each one a target that can be shot down
  salvo(T) {
    if (this.st !== 'orbit' || T < this.rocketT) return;
    const R = DECK.rocket, h = this.half - 1, b = this.me; this.rocketT = T + R.every[h] / this.level.rocket; let n = 0;
    for (const q of this.rockets) { if (q.on || n >= R.n[h]) continue; n++;
      q.on = true; q.t = 0; q.sx = this.x; q.sy = this.y - 1.2; q.sz = this.z; q.T = Math.hypot(this.x - b.x, this.z - b.z) / R.v * (1 + 0.16 * n); q.w = (this.rnd() - 0.5) * 34; q.lift = 4 + this.rnd() * 9; q.x = q.sx; q.y = q.sy; q.z = q.sz; }
    if (n) this.ev({ type: 'dRocket', n });
  }
  stepRockets() {
    const b = this.me;
    for (const q of this.rockets) { if (!q.on) continue; q.t += DT; const k = Math.min(1, q.t / q.T), s = Math.sin(Math.PI * k), a = b.h + this.th;
      q.x = q.sx + (b.x - q.sx) * k - Math.cos(a) * q.w * s; q.z = q.sz + (b.z - q.sz) * k - Math.sin(a) * q.w * s; q.y = q.sy + (1.6 - q.sy) * k + q.lift * s;
      if (k >= 1) { q.on = false; const hit = this.strike(1); this.ev({ type: 'dRocketHit', hit, hull: this.hull, x: q.x, z: q.z }); } }
  }
  strike(n) { const T = this.race.lapT; if (this.over || T < this.safeT) return false; this.safeT = T + DECK.graceS; this.hull -= n; this.taken += n; return true; }
  // the gun: a bullet flies straight and at once; the nearest thing on its line is hit
  shoot() {
    const G = this.gun, I = this.input; this.cool -= DT;
    if (this.reload > 0) { this.reload -= DT; if (this.reload <= 0) { this.mag = G.mag; this.ev({ type: 'dLoaded' }); } return; }
    if (this.mag <= 0 || (!I.fire && this.mag < 0.6 * G.mag && this.idle >= 1.2)) { this.reload = G.reloadS; this.idle = 0; this.ev({ type: 'dReload' }); return; }
    if (!I.fire) { this.idle = (this.idle || 0) + DT; return; }
    this.idle = 0; if (this.cool > 0) return;
    this.cool = 1 / G.rate; this.mag--; this.shots++;
    const A = HAWK.aim, ay = wrapA(I.ay) + (this.rnd() - 0.5) * 2 * DECK.spread, ap = clamp(I.ap, A.down, A.up) + (this.rnd() - 0.5) * 2 * DECK.spread;
    const g = this.gunAt(), d = aimDir(this.me.h, ay, ap), P = {}; let best = null, bt = 1e9;
    const test = (x, y, z, r, what, i) => { const vx = x - g.x, vy = y - g.y, vz = z - g.z, t = vx * d.x + vy * d.y + vz * d.z; if (t <= 0 || t >= bt) return; const p2 = vx * vx + vy * vy + vz * vz - t * t, re = r * this.level.aim + t * DECK.cone; if (p2 <= re * re) { bt = t; best = { what, i }; } };
    this.rockets.forEach((q, i) => { if (q.on) test(q.x, q.y, q.z, DECK.rocket.r, 'rocket', i); });
    this.part('pod', P); test(P.x, P.y, P.z, DECK.pod.r, 'pod'); this.part('tail', P); test(P.x, P.y, P.z, DECK.tail.r, 'tail'); test(this.x, this.y, this.z, DECK.body.r, 'body');
    const e = { type: 'dShot', hit: best ? best.what : '', x: g.x + d.x * (best ? bt : 160), y: g.y + d.y * (best ? bt : 160), z: g.z + d.z * (best ? bt : 160) };
    if (best) { this.hits++; if (best.what === 'rocket') { this.rockets[best.i].on = false; this.down++; this.addStag(DECK.rocket.stag); this.ev({ type: 'dRocketDown', x: e.x, y: e.y, z: e.z }); } else this.hurtBy(best.what, bt); }
    this.ev(e);
  }
  hurtBy(what, dist) {
    if (this.st === 'crip') return;                                  // its armour holds now: the last blow is the sea's
    const P = DECK[what], weak = what !== 'body', far = dist > DECK.nearD, open = this.open || !weak;
    const mul = (far ? DECK.far.mul : 1) * (this.st === 'stun' ? DECK.stunMul : 1) * (weak && !open ? 0.4 : 1);
    if (weak) this.weak++;
    if (what === 'pod' && (this.st === 'aim' || this.st === 'pass') && !this.struck && !this.broken) { this.podHits++; if (this.podHits >= this.need) { this.broken = true; this.breaks++; this.addStag(DECK.pass.brokenStag); this.ev({ type: 'dBroken' }); } }
    this.addStag(P.stag * (far ? DECK.far.stag : 1)); this.hurt(P.dmg * mul);
  }
  addStag(n) { if (this.st === 'stun' || this.st === 'crip' || this.over) return; this.stag += n; if (this.stag >= DECK.stagger) { this.stag = DECK.stagger; this.st = 'stun'; this.t = 0; this.stuns++; this.ev({ type: 'dStun' }); } }
  hurt(n) {
    if (this.over || this.st === 'crip') return; this.hp -= n;
    const floor = DECK.crippled * this.hpMax;
    if (this.half === 1 && this.hp <= DECK.half2 * this.hpMax) { this.half = 2; this.flares = DECK.flares; this.mag = this.gun.mag; this.reload = 0; this.ev({ type: 'dHalf', n: 2, name: HALVES[1] }); }
    if (this.hp <= floor) { this.hp = floor; this.st = 'crip'; this.t = 0; this.cripT = 0; this.stag = 0; if (this.half === 1) { this.half = 2; this.flares = DECK.flares; this.ev({ type: 'dHalf', n: 2, name: HALVES[1] }); } this.ev({ type: 'dCrippled' }); }
  }
  // a flare: once a press. It calls the megalodon only at a helicopter that is low, and that the gun points at
  flare() {
    const I = this.input, edge = I.flare && !this.flareHeld; this.flareHeld = I.flare;
    if (!edge || this.half < 2 || this.flares <= 0 || this.breach.on) return;
    this.flares--;
    const g = this.gunAt(), d = aimDir(this.me.h, wrapA(I.ay), clamp(I.ap, HAWK.aim.down, HAWK.aim.up)), vx = this.x - g.x, vy = this.y - g.y, vz = this.z - g.z, t = vx * d.x + vy * d.y + vz * d.z;
    const off = t > 0 ? Math.sqrt(Math.max(0, vx * vx + vy * vy + vz * vz - t * t)) : 1e9, ok = this.low && off <= DECK.flareR * this.level.aim;
    this.ev({ type: 'dFlare', ok, left: this.flares });
    if (ok) this.call(false); else { this.wasted++; const q = this.breach; q.on = true; q.t = 0; q.called = false; q.hit = false; q.devour = false; q.x = g.x + d.x * 60; q.z = g.z + d.z * 60; }
  }
  call(mercy) { const q = this.breach; q.on = true; q.t = 0; q.called = true; q.hit = false; q.devour = false; q.mercy = mercy; q.x = this.x; q.z = this.z; this.ev({ type: 'dCall', mercy }); }
  // the megalodon: it comes up where the helicopter is when its leap is at its top; a helicopter that got away is missed
  stepBreach() {
    const q = this.breach; if (!q.on) return; q.t += DT;
    if (q.called && q.t < DECK.breachS) { q.x = this.x; q.z = this.z; }
    if (q.t >= DECK.breachS && !q.done) {
      q.done = true;
      if (q.called && this.y <= DECK.biteAlt + 3 && !this.over) {
        q.hit = true; this.bites++;
        if (this.st === 'crip') { q.devour = true; this.hp = 0; this.won = true; this.ev({ type: 'dDevour', x: q.x, z: q.z }); }
        else { const was = this.st; this.ev({ type: 'dBite', x: q.x, z: q.z }); this.hurt(DECK.bite * this.hpMax); if (this.st === was || this.st !== 'crip') { this.st = 'climb'; this.t = 0; this.stag = 0; } }
      } else this.ev({ type: 'dBreachMiss', x: q.x, z: q.z });
    }
    if (q.t >= DECK.breachS + 2.4) { q.on = false; q.done = false; }
  }
  // the boat keeps to its ring by itself
  pilot(out) {
    const b = this.me, a = Math.atan2(b.z, b.x) + 0.3, tx = Math.cos(a) * HAWK.R, tz = Math.sin(a) * HAWK.R, rel = wrapA(Math.atan2(-(tx - b.x), tz - b.z) - b.h);
    out.steer = Math.round(clamp(rel * 2.4, -1, 1) * 100) / 100 || 0; out.brake = 0; out.boost = 0; return out;
  }
  // the stand-in gunner (tests, tuning, film): it turns the gun toward what matters most at a limited speed, with a wandering
  // error that is smaller for a better gunner, fires when the gun is nearly on, and sends a flare when the helicopter is low
  gunner(skill = 0.8) {
    const A = this.auto, I = this.input, g = this.gunAt(), P = {}, h = this.me.h; let tgt = null;
    let soon = 1e9; for (const q of this.rockets) if (q.on && q.T - q.t < soon) { soon = q.T - q.t; tgt = { x: q.x, y: q.y, z: q.z }; }
    if (!tgt || (this.open && soon > 2.2)) { this.part(this.st === 'stun' && this.nx * (g.x - this.x) + this.nz * (g.z - this.z) < 0 ? 'tail' : 'pod', P); tgt = this.open ? P : tgt || { x: this.x, y: this.y, z: this.z }; }
    A.errT -= DT; if (A.errT <= 0) { A.errT = 0.35; A.ex = (this.rnd() - 0.5) * 0.5 * (1 - skill); A.ey = (this.rnd() - 0.5) * 0.5 * (1 - skill); }
    const want = aimAt(h, g.x, g.y, g.z, tgt.x, tgt.y, tgt.z), slew = (1.2 + 2.6 * skill) * DT;
    A.ay += clamp(wrapA(want.ay + A.ex - A.ay), -slew, slew); A.ap += clamp(want.ap + A.ey - A.ap, -slew, slew);
    A.ay = wrapA(A.ay); A.ap = clamp(A.ap, HAWK.aim.down, HAWK.aim.up);
    const on = Math.abs(wrapA(want.ay - A.ay)) < 0.05 + 0.05 * (1 - skill) && Math.abs(want.ap - A.ap) < 0.05 + 0.05 * (1 - skill);
    const worth = soon < 1e8 || this.open;                           // a rocket in the air, or its weak points open: else the magazine is kept
    I.ay = A.ay; I.ap = A.ap; I.fire = on && worth && this.race.racing && !this.over && !(this.st === 'crip');
    const aimedAtIt = Math.abs(wrapA(aimAt(h, g.x, g.y, g.z, this.x, this.y, this.z).ay - A.ay)) < 0.06;
    A.wait = this.low && this.half === 2 && this.flares > 0 && !this.breach.on && aimedAtIt ? A.wait + DT : 0;
    I.flare = A.wait > 0.5 - 0.3 * skill && (this.st !== 'pass' || this.t > 1.2);
    if (this.st === 'crip') { const w = aimAt(h, g.x, g.y, g.z, this.x, this.y, this.z); A.ay += clamp(wrapA(w.ay - A.ay), -slew, slew); A.ap += clamp(w.ap - A.ap, -slew, slew); I.ay = A.ay; I.ap = A.ap; }
    return I;
  }
  summary() {
    const rd = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d, done = Math.round(100 * (this.hpMax - Math.max(0, this.hp)) / this.hpMax);
    return { level: HAWK.key, difficulty: this.difficulty, total: 100, saved: done, lost: 100 - done, won: this.won, half: this.half, hull: Math.max(0, this.hull), taken: this.taken,
      time: this.endT === null ? null : rd(this.endT, 2), shots: this.shots, hits: this.hits, weak: this.weak, down: this.down, stuns: this.stuns, breaks: this.breaks, passes: this.passes, bites: this.bites, wasted: this.wasted, flares: this.flares,
      medal: this.over ? hawkMedal(this.won, this.hull, this.endT, this.flares) : null, finished: this.over };
  }
}

// A whole fight with the stand-in gunner (skill 0 to 1; null: nobody touches the gun). Returns the fight.
export function autoDeck({ difficulty = 'normal', seed = 5, skill = 0.8, tune = 'cruise', maxS = 260 } = {}) {
  const c = hawkCourse(), race = new Race(hawkSettings(c, { tune }), c), F = new DeckFight(race, { difficulty, seed }), inp = { steer: 0, brake: 0, boost: 0 };
  const steps = Math.round(maxS / DT);
  for (let i = 0; i < steps && !F.over; i++) { F.pilot(inp); if (skill !== null) F.gunner(skill); race.step(inp.steer, inp.brake, inp.boost); F.step(); race.events.length = 0; }
  return F;
}
