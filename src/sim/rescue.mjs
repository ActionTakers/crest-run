// rescue.mjs: the rescue level. A big ship lets llamas into the sea; they swim for the island, where the emperor rides his llama
// along the shore; sharks come for them. The player's yacht roams freely (a Race in free mode on a ring course around the
// island), its bow cannon fires by itself at a shark inside its cone, a shark rammed at speed sinks too, and llamas near the yacht
// follow its wake, so the player can lead them in. Pure (no DOM, no three.js), fixed step, seeded: the same inputs give the same
// mission. Written 2026-11-15 by the yacht project session on the owner's words of that day (<local>
// "alpaca's trapped in the big ship ... attrackting sharks and monsters that need to be fought to savely guide the alpaca's to
// the shores of the islands"). A first playable: every number here is tuned on this PC with the stand-in driver below (pilot),
// never by a person on a phone. Tests: tests/rescue.test.mjs.
// World and headings as in race-sim.mjs: forward f = (-sin h, cos h), right r = (-cos h, -sin h); an angle a around the island
// puts a point at (cos a, sin a) * radius, and a boat that circles with growing a has heading h = a and the island on its right.
import { DT, BOOST, Race } from './race-sim.mjs?v=7d4a3824';
import { buildCourse, wrapA } from './courses.mjs?v=7d4a3824';

const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// The arena: the island in the middle, the ship on the outside, the yacht's lane between them (a ring of radius R, halfWidth
// wide to each side: leaving it slows the boat and pushes it back, as off a race course).
export const ARENA = { key: 'llama', name: 'Llama Island', world: 'sunset', R: 165, halfWidth: 115, sea: { count: 5, seed: 31, amp: 0.36 },
  island: { x: 0, z: 0, r: 40 }, ship: { a: 90 * DEG, r: 238, len: 90, beam: 15 }, startA: 64.8 * DEG };
export const SHIP = (() => { const s = ARENA.ship; return { x: Math.cos(s.a) * s.r, z: Math.sin(s.a) * s.r, ax: -Math.sin(s.a), az: Math.cos(s.a), nx: -Math.cos(s.a), nz: -Math.sin(s.a), len: s.len, beam: s.beam }; })();   // a: its axis, n: toward the island

// What the mission is made of. Speeds in m/s, distances in m, times in s.
export const RESCUE = {
  swimV: 2.6, followV: 6.5, followR: 30, followMinU: 3, shoreFree: 24, beachS: 2.6, jumpS: 1.25, grabS: 2.2,
  sharkTurn: 1.7, lungeR: 7.5, lungeS: 0.85, biteR: 5, stunS: 1.3, fleeV: 9.5, sinkS: 2.2,
  range: 90, cone: 32 * DEG, rate: 4.5, shellV: 130, hitR: 2.4, spread: 0.012,
  ramV: 11, ramKeep: 0.72, boost0: 40, boostShark: 18, boostSaved: 25, boostRegen: 2.5,
  waveGapS: 42, waveMinS: 12, capS: 260,
  medals: { gold: 11, silver: 9, bronze: 6 },
};
// per difficulty: sharks per wave, their speed and how many hits one takes
export const LEVELS = {
  easy: { waves: [4, 4, 4], sharks: [2, 3, 5], sharkV: 7.4, hp: 1 },
  normal: { waves: [4, 4, 4], sharks: [3, 5, 7], sharkV: 8.2, hp: 2 },
  hard: { waves: [4, 4, 4], sharks: [4, 6, 9], sharkV: 9.0, hp: 3 },
};
// llama states
export const A = { deck: 0, jump: 1, swim: 2, grab: 3, lost: 4, beach: 5, safe: 6 };
// shark states (none: not in the sea yet)
export const S = { none: 0, hunt: 1, lunge: 2, bite: 3, stun: 4, flee: 5, dead: 6, gone: 7 };

let built = null;
export function arenaCourse() {
  if (built) return built;
  const control = [];
  for (let k = 0; k < 16; k++) { const a = ARENA.startA + (k * 2 * Math.PI) / 16; control.push([Math.cos(a) * ARENA.R, Math.sin(a) * ARENA.R]); }
  // one gate as wide as the lane keeps the course builder and the computer's driver (after the mission) happy; it is never scored
  built = buildCourse({ key: ARENA.key, name: ARENA.name, world: ARENA.world, sea: ARENA.sea, laps: 1, control, halfWidth: ARENA.halfWidth, cornerGates: false,
    extraGates: [{ s: 60, lat: 0, width: 2 * ARENA.halfWidth }], ramps: [], arena: true, scenery: { islands: 9, liner: 1, cargo: 0, tug: 1, sails: 4, towers: 1 } });
  return built;
}
export function rescueSettings(course, { tune = 'cruise' } = {}) {
  return { laps: 1, sea: { ...ARENA.sea }, boats: [{ name: 'You', tune, ai: null }], player: 0, band: 0, grid: 'back', free: true };
}
export function medalFor(saved) { const m = RESCUE.medals; return saved >= m.gold ? 'gold' : saved >= m.silver ? 'silver' : saved >= m.bronze ? 'bronze' : null; }

export class Rescue {
  constructor(race, { difficulty = 'normal', seed = 5 } = {}) {
    this.race = race; this.level = LEVELS[difficulty] || LEVELS.normal; this.difficulty = LEVELS[difficulty] ? difficulty : 'normal';
    this.rnd = mulberry(seed);
    const L = this.level, I = ARENA.island;
    this.total = L.waves.reduce((a, x) => a + x, 0);
    this.llamas = []; this.sharks = []; this.shells = [];
    let k = 0;
    // the swimmers: llamas, and as the last of each group one of the crew (kind 'person', who: which of this mission's three);
    // the rules are the same for both, only the picture differs
    L.waves.forEach((n, w) => { for (let j = 0; j < n; j++, k++) {
      // on deck: a row along the rail that faces the island; its beach spot: a place on the sand under the ship's side of the island
      const along = (k - (this.total - 1) / 2) * 4.6, dx = SHIP.x + SHIP.ax * along + SHIP.nx * (SHIP.beam / 2 - 1.6), dz = SHIP.z + SHIP.az * along + SHIP.nz * (SHIP.beam / 2 - 1.6);
      const ba = ARENA.ship.a + (k - (this.total - 1) / 2) * 5.5 * DEG;
      this.llamas.push({ i: k, wave: w, j, kind: j === n - 1 ? 'person' : 'llama', who: j === n - 1 ? w : -1, st: A.deck, x: dx, z: dz, h: Math.atan2(-SHIP.nx, SHIP.nz), v: 0, t: 0, x0: dx, z0: dz, x1: 0, z1: 0, by: -1, follow: false, bx: I.x + Math.cos(ba) * (I.r - 6), bz: I.z + Math.sin(ba) * (I.r - 6) });
    } });
    L.sharks.forEach((n, w) => { for (let j = 0; j < n; j++) this.sharks.push({ i: this.sharks.length, wave: w, j, st: S.none, x: 0, z: 0, h: 0, v: 0, hp: L.hp, t: 0, target: -1, at: 0 }); });
    for (let i = 0; i < 28; i++) this.shells.push({ on: false, x: 0, z: 0, vx: 0, vz: 0, t: 0, life: 0 });
    this.wave = -1; this.waveT = -1e9; this.saved = 0; this.lost = 0; this.over = false; this.endT = null;
    this.cool = 0; this.lock = -1; this.shots = 0; this.hits = 0; this.sunk = 0; this.rams = 0; this.agroundT = -1e9;
    this.me = race.boats[race.player >= 0 ? race.player : 0];
    this.me.boostE = RESCUE.boost0;
    this.auto = { target: -1, retT: 0 };
  }
  get inWater() { let n = 0; for (const a of this.llamas) if (a.st === A.jump || a.st === A.swim || a.st === A.grab) n++; return n; }
  get onDeck() { let n = 0; for (const a of this.llamas) if (a.st === A.deck) n++; return n; }
  get sharksUp() { let n = 0; for (const s of this.sharks) if (s.st >= S.hunt && s.st <= S.flee) n++; return n; }
  ev(e) { this.race.events.push(e); }

  // One step, right after race.step(): the yacht has moved.
  step() {
    const race = this.race, b = this.me, T = race.lapT;
    this.keepOut(b);
    if (!race.racing) return;
    if (!this.over) { this.waves(T); b.boostE = Math.min(BOOST.max, b.boostE + RESCUE.boostRegen * DT); }
    this.stepLlamas(b);
    this.stepSharks(b);
    if (!this.over) this.cannon(b);
    this.stepShells();
    if (!this.over && (this.saved + this.lost >= this.total || T > RESCUE.capS)) {
      for (const a of this.llamas) if (a.st !== A.safe && a.st !== A.lost && a.st !== A.beach) { a.st = A.lost; this.lost++; }   // the time ran out with llamas still in the sea
      for (const a of this.llamas) if (a.st === A.beach) { a.st = A.safe; a.x = a.bx; a.z = a.bz; }
      this.over = true; this.endT = T; this.lock = -1;
      for (const s of this.sharks) if (s.st >= S.hunt && s.st <= S.stun) { s.st = S.flee; s.t = 0; }
      this.ev({ type: 'missionEnd', saved: this.saved, lost: this.total - this.saved, total: this.total });
      race.playerDone();
    }
  }
  // the island and the ship are solid for the yacht
  keepOut(b) {
    const I = ARENA.island, hit = (cx, cz, rad) => {
      const dx = b.x - cx, dz = b.z - cz, d = Math.hypot(dx, dz); if (d >= rad || d < 1e-6) return 0;
      const nx = dx / d, nz = dz / d, vn = b.vx * nx + b.vz * nz;
      b.x = cx + nx * rad; b.z = cz + nz * rad;
      if (vn < 0) { b.vx -= vn * nx * 1.2; b.vz -= vn * nz * 1.2; }
      // a bow that points into the shore swings round to run along it: a yacht has no reverse, and without this a boat that
      // nosed into the island stayed there (found with the stand-in driver, 2026-11-15)
      const fx = -Math.sin(b.h), fz = Math.cos(b.h), fn = fx * nx + fz * nz;
      if (fn < 0.25) { const tx = -nz, tz = nx, k = fx * tx + fz * tz >= 0 ? 1 : -1, hd = Math.atan2(-(tx * k + nx * 0.3), tz * k + nz * 0.3); b.h = wrapA(b.h + clamp(wrapA(hd - b.h), -2.2 * DT, 2.2 * DT)); }
      return vn < 0 ? -vn : 0.01;
    };
    let v = hit(I.x, I.z, I.r + 4.5);
    for (let k = -2; k <= 2; k++) v = Math.max(v, hit(SHIP.x + SHIP.ax * k * SHIP.len * 0.2, SHIP.z + SHIP.az * k * SHIP.len * 0.2, SHIP.beam * 0.5 + 4));
    if (v > 1.5 && this.race.t - this.agroundT > 0.6) { this.agroundT = this.race.t; this.ev({ type: 'aground', v }); }
  }
  // waves: the ship lets the next group go when the time has come, or early once the sea is empty
  waves(T) {
    const L = this.level, R = RESCUE;
    if (this.wave + 1 < L.waves.length) {
      const empty = this.inWater === 0 && this.sharksUp === 0;
      if (this.wave < 0 ? T >= 1 : T - this.waveT >= R.waveGapS || (empty && T - this.waveT >= R.waveMinS)) {
        this.wave++; this.waveT = T; this.ev({ type: 'wave', n: this.wave + 1, of: L.waves.length });
        const ns = L.sharks[this.wave];
        for (const s of this.sharks) if (s.wave === this.wave) s.at = T + 9 + s.j * (24 / ns) + this.rnd() * 2;
      }
    }
    for (const a of this.llamas) if (a.st === A.deck && a.wave <= this.wave && T >= this.waveTOf(a) + a.j * 1.5) this.jump(a);
    for (const s of this.sharks) if (s.st === S.none && s.wave <= this.wave && s.at > 0 && T >= s.at) this.spawn(s);
  }
  waveTOf(a) { return a.wave === this.wave ? this.waveT : -1e9; }   // llamas of an earlier wave are long gone from the deck
  jump(a) {
    a.st = A.jump; a.t = 0; a.x0 = a.x; a.z0 = a.z;
    const out = SHIP.beam / 2 + 7 + this.rnd() * 5, side = (this.rnd() - 0.5) * 6;
    a.x1 = a.x + SHIP.nx * out + SHIP.ax * side; a.z1 = a.z + SHIP.nz * out + SHIP.az * side;
    this.ev({ type: 'jump', a: a.i });
  }
  spawn(s) {
    const I = ARENA.island, b = this.me;
    for (let tries = 0; tries < 12; tries++) {
      const side = this.rnd() < 0.5 ? -1 : 1, ang = ARENA.ship.a + side * (32 + this.rnd() * 70) * DEG, rad = 130 + this.rnd() * 120;
      s.x = I.x + Math.cos(ang) * rad; s.z = I.z + Math.sin(ang) * rad;
      if (Math.hypot(s.x - b.x, s.z - b.z) > 55 && !this.llamas.some((a) => a.st === A.swim && Math.hypot(a.x - s.x, a.z - s.z) < 45)) break;
    }
    s.st = S.hunt; s.t = 0; s.hp = this.level.hp; s.target = -1; s.v = this.level.sharkV * 0.6; s.h = Math.atan2(-(I.x - s.x), I.z - s.z);
    this.ev({ type: 'shark', s: s.i, x: s.x, z: s.z });
  }
  stepLlamas(b) {
    const R = RESCUE, I = ARENA.island, fx = -Math.sin(b.h), fz = Math.cos(b.h);
    let rank = 0;
    for (const a of this.llamas) {
      if (a.st === A.jump) {
        a.t += DT; const p = Math.min(1, a.t / R.jumpS);
        a.x = a.x0 + (a.x1 - a.x0) * p; a.z = a.z0 + (a.z1 - a.z0) * p;
        if (p >= 1) { a.st = A.swim; a.t = 0; a.v = 0; a.h = Math.atan2(-(I.x - a.x), I.z - a.z); this.ev({ type: 'splashIn', a: a.i, x: a.x, z: a.z }); }
      } else if (a.st === A.swim) {
        const dI = Math.hypot(a.x - I.x, a.z - I.z);
        if (dI <= I.r + 1) { a.st = A.beach; a.t = 0; a.x0 = a.x; a.z0 = a.z; a.follow = false; continue; }
        const dB = Math.hypot(a.x - b.x, a.z - b.z);
        a.follow = !this.over && dB < R.followR && b.u > R.followMinU && dI > I.r + R.shoreFree;
        let tx = I.x, tz = I.z, want = R.swimV;
        if (a.follow) { const back = 9 + 2.4 * rank++; tx = b.x - fx * back; tz = b.z - fz * back; want = Math.min(R.followV, Math.hypot(tx - a.x, tz - a.z) * 1.5); }
        const hw = Math.atan2(-(tx - a.x), tz - a.z);
        a.h = wrapA(a.h + clamp(wrapA(hw - a.h), -2.6 * DT, 2.6 * DT));
        a.v += (want - a.v) * (1 - Math.exp(-DT / 0.5));
        a.x += -Math.sin(a.h) * a.v * DT; a.z += Math.cos(a.h) * a.v * DT;
      } else if (a.st === A.grab) {
        const s = this.sharks[a.by]; a.t += DT;
        if (s && s.st === S.bite) { a.x = s.x - Math.sin(s.h) * 2.4; a.z = s.z + Math.cos(s.h) * 2.4; }
        if (a.t >= R.grabS) { a.st = A.lost; this.lost++; if (s && s.st === S.bite) { s.st = S.flee; s.t = 0; } this.ev({ type: 'lostA', a: a.i, lost: this.lost, x: a.x, z: a.z }); }
      } else if (a.st === A.beach) {
        a.t += DT; const p = Math.min(1, a.t / R.beachS);
        a.x = a.x0 + (a.bx - a.x0) * p; a.z = a.z0 + (a.bz - a.z0) * p; a.h = Math.atan2(-(a.bx - a.x0), a.bz - a.z0);
        if (p >= 1) { a.st = A.safe; this.saved++; this.me.boostE = Math.min(BOOST.max, this.me.boostE + R.boostSaved); this.ev({ type: 'saved', a: a.i, saved: this.saved }); }
      }
    }
    // swimmers keep a little room between them
    const L = this.llamas;
    for (let i = 0; i < L.length; i++) { const p = L[i]; if (p.st !== A.swim) continue; for (let j = i + 1; j < L.length; j++) { const q = L[j]; if (q.st !== A.swim) continue;
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz); if (d < 2.4 && d > 1e-6) { const k = (2.4 - d) / 2 / d; p.x -= dx * k; p.z -= dz * k; q.x += dx * k; q.z += dz * k; } } }
  }
  release(s) {   // a shark that is hit lets go of its llama
    for (const a of this.llamas) if (a.st === A.grab && a.by === s.i) { a.st = A.swim; a.by = -1; a.t = 0; a.v = 0; this.ev({ type: 'freed', a: a.i, x: a.x, z: a.z }); }
  }
  hurt(s, dmg, how) {
    if (s.st === S.bite) this.release(s);
    s.hp -= dmg;
    if (s.hp <= 0) { s.st = S.dead; s.t = 0; s.target = -1; this.sunk++; if (how === 'ram') this.rams++; this.me.boostE = Math.min(BOOST.max, this.me.boostE + RESCUE.boostShark); }
    else if (s.st !== S.flee) { s.st = S.stun; s.t = 0; }
    this.ev({ type: how === 'ram' ? 'ram' : 'hit', s: s.i, x: s.x, z: s.z, dead: s.hp <= 0 });
  }
  stepSharks(b) {
    const R = RESCUE, I = ARENA.island, V = this.level.sharkV, fx = -Math.sin(b.h), fz = Math.cos(b.h), rx = -Math.cos(b.h), rz = -Math.sin(b.h);
    for (const s of this.sharks) {
      if (s.st === S.none || s.st === S.gone) continue;
      s.t += DT;
      let hw = s.h, want = 0;
      if (s.st === S.hunt) {
        // the nearest swimming llama that no other shark is already after (two sharks never queue for one llama while another swims free)
        let best = -1, bd = 1e9;
        for (const a of this.llamas) { if (a.st !== A.swim) continue; let taken = 0; for (const q of this.sharks) if (q !== s && q.target === a.i && (q.st === S.hunt || q.st === S.lunge)) taken++;
          const d = Math.hypot(a.x - s.x, a.z - s.z) + taken * 60; if (d < bd) { bd = d; best = a.i; } }
        s.target = best;
        if (best < 0) { if (this.onDeck === 0 || this.over) { s.st = S.flee; s.t = 0; } else { hw = Math.atan2(-(I.x - s.x), I.z - s.z) + 1.45; want = V * 0.45; } }   // nothing to hunt yet: circle
        else {
          const a = this.llamas[best], d = Math.hypot(a.x - s.x, a.z - s.z);
          hw = Math.atan2(-(a.x - s.x), a.z - s.z); want = V;
          if (d < R.lungeR) { s.st = S.lunge; s.t = 0; this.ev({ type: 'lunge', s: s.i, a: a.i, x: s.x, z: s.z }); }
        }
      } else if (s.st === S.lunge) {
        const a = this.llamas[s.target];
        if (!a || a.st !== A.swim) { s.st = S.hunt; s.t = 0; }
        else {
          hw = Math.atan2(-(a.x - s.x), a.z - s.z); want = 3.2 + 7 * Math.max(0, s.t / R.lungeS - 0.6);
          if (s.t >= R.lungeS) {
            if (Math.hypot(a.x - s.x, a.z - s.z) < R.biteR) { s.st = S.bite; s.t = 0; a.st = A.grab; a.by = s.i; a.t = 0; a.follow = false; this.ev({ type: 'grab', s: s.i, a: a.i, x: a.x, z: a.z }); }
            else { s.st = S.hunt; s.t = 0; }
          }
        }
      } else if (s.st === S.bite) { hw = Math.atan2(-(s.x - I.x), s.z - I.z); want = 2.2; }
      else if (s.st === S.stun) { want = 1; if (s.t >= R.stunS) { s.st = S.hunt; s.t = 0; } }
      else if (s.st === S.flee) { hw = Math.atan2(-(s.x - I.x), s.z - I.z); want = R.fleeV; if (s.t > 14 || Math.hypot(s.x - I.x, s.z - I.z) > 320) { s.st = S.gone; continue; } }
      else if (s.st === S.dead) { want = 0; if (s.t >= R.sinkS) { s.st = S.gone; continue; } }
      s.h = wrapA(s.h + clamp(wrapA(hw - s.h), -R.sharkTurn * DT, R.sharkTurn * DT));
      s.v += (want - s.v) * (1 - Math.exp(-DT / 0.6));
      s.x += -Math.sin(s.h) * s.v * DT; s.z += Math.cos(s.h) * s.v * DT;
      // the island is solid for a shark too
      const dI = Math.hypot(s.x - I.x, s.z - I.z); if (dI < I.r + 5 && dI > 1e-6) { s.x = I.x + ((s.x - I.x) / dI) * (I.r + 5); s.z = I.z + ((s.z - I.z) / dI) * (I.r + 5); }
      // the yacht's hull against the shark: fast enough and it sinks; slower and it is only knocked aside
      if (s.st >= S.hunt && s.st <= S.flee) {
        const dx = s.x - b.x, dz = s.z - b.z, along = dx * fx + dz * fz, side = dx * rx + dz * rz;
        if (Math.abs(along) < 6.2 && Math.abs(side) < 2.9) {
          if (b.u >= R.ramV) { b.vx *= R.ramKeep; b.vz *= R.ramKeep; this.hurt(s, 99, 'ram'); }
          else { const k = side >= 0 ? 1 : -1; s.x += rx * k * 0.25; s.z += rz * k * 0.25; if (s.st === S.hunt || s.st === S.lunge) { s.st = S.stun; s.t = R.stunS * 0.5; } }
        }
      }
    }
  }
  // the bow cannon: the shark inside the cone that matters most (one with a llama in its jaws first, then one about to bite,
  // then the nearest); fires by itself, leading the target
  cannon(b) {
    const R = RESCUE; this.cool -= DT;
    const bx = b.x - Math.sin(b.h) * 5, bz = b.z + Math.cos(b.h) * 5;
    let best = -1, bs = 1e9;
    for (const s of this.sharks) {
      if (s.st < S.hunt || s.st > S.flee) continue;
      const dx = s.x - bx, dz = s.z - bz, d = Math.hypot(dx, dz); if (d > R.range) continue;
      const rel = Math.abs(wrapA(Math.atan2(-dx, dz) - b.h)); if (rel > R.cone) continue;
      const score = d + rel * 40 - (s.st === S.bite ? 200 : s.st === S.lunge ? 100 : s.st === S.flee ? -80 : 0);
      if (score < bs) { bs = score; best = s.i; }
    }
    this.lock = best;
    if (best < 0 || this.cool > 0) return;
    const s = this.sharks[best], sh = this.shells.find((q) => !q.on); if (!sh) return;
    const svx = -Math.sin(s.h) * s.v, svz = Math.cos(s.h) * s.v;
    let tt = Math.hypot(s.x - bx, s.z - bz) / R.shellV; tt = Math.hypot(s.x + svx * tt - bx, s.z + svz * tt - bz) / R.shellV;
    const ax = s.x + svx * tt - bx, az = s.z + svz * tt - bz, ah = Math.atan2(-ax, az) + (this.rnd() - 0.5) * 2 * R.spread;
    sh.on = true; sh.x = bx; sh.z = bz; sh.vx = -Math.sin(ah) * R.shellV; sh.vz = Math.cos(ah) * R.shellV; sh.t = 0; sh.life = Math.min(R.range / R.shellV + 0.1, tt + 0.12);
    this.cool = 1 / R.rate; this.shots++;
    this.ev({ type: 'shot', x: bx, z: bz });
  }
  stepShells() {
    const R = RESCUE;
    for (const sh of this.shells) {
      if (!sh.on) continue;
      sh.x += sh.vx * DT; sh.z += sh.vz * DT; sh.t += DT;
      let hit = null;
      for (const s of this.sharks) if (s.st >= S.hunt && s.st <= S.flee && (s.x - sh.x) ** 2 + (s.z - sh.z) ** 2 < R.hitR * R.hitR) { hit = s; break; }
      if (hit) { sh.on = false; this.hits++; this.hurt(hit, 1, 'cannon'); }
      else if (sh.t >= sh.life) { sh.on = false; this.ev({ type: 'splash', x: sh.x, z: sh.z }); }
    }
  }
  // ---------- a stand-in for a player: steers at the shark that matters most, boosts to reach it, leads the swimmers in when the
  // sea is calm. For the tests (can the mission be won, does a boat that does nothing lose it), the film and the test switch. ----------
  pilot(out, skill = 1) {
    const b = this.me, I = ARENA.island, T = this.race.lapT;
    let tx = null, tz = null, urgent = false, slow = false;   // slow: a gentle pace the swimmers can follow
    if (T >= this.auto.retT || this.auto.target < 0 || !(this.sharks[this.auto.target].st >= S.hunt && this.sharks[this.auto.target].st <= S.stun)) {
      let best = -1, bs = 1e9;
      for (const s of this.sharks) {
        if (s.st < S.hunt || s.st > S.stun) continue;
        const a = s.target >= 0 ? this.llamas[s.target] : null, toBite = a ? Math.hypot(a.x - s.x, a.z - s.z) / this.level.sharkV : 30;
        const score = (s.st === S.bite ? -20 : s.st === S.lunge ? -10 : toBite) + Math.hypot(s.x - b.x, s.z - b.z) / 40;
        if (score < bs) { bs = score; best = s.i; }
      }
      this.auto.target = best; this.auto.retT = T + (skill >= 1 ? 0.5 : 2.5);
    }
    if (this.auto.target >= 0) { const s = this.sharks[this.auto.target], d = Math.hypot(s.x - b.x, s.z - b.z), lead = Math.min(1.5, d / 45); tx = s.x - Math.sin(s.h) * s.v * lead; tz = s.z + Math.cos(s.h) * s.v * lead; urgent = true; }
    else {
      // no shark: fetch the swimmers and lead them in. With swimmers in the wake and no free one close by: a slow line to the
      // nearest point of the shore (they let go there); otherwise to the free swimmer farthest out; otherwise wait off the ship
      let lead = 0, far = null, fd = -1;
      for (const a of this.llamas) if (a.st === A.swim) { if (a.follow) lead++; else { const d = Math.hypot(a.x - I.x, a.z - I.z); if (d > I.r + RESCUE.shoreFree && d > fd) { fd = d; far = a; } } }
      if (lead > 0 && !(far && Math.hypot(far.x - b.x, far.z - b.z) < 45)) { const d = Math.hypot(b.x - I.x, b.z - I.z) || 1; tx = I.x + ((b.x - I.x) / d) * (I.r + 14); tz = I.z + ((b.z - I.z) / d) * (I.r + 14); slow = true; }
      else if (far) { tx = far.x; tz = far.z; slow = Math.hypot(far.x - b.x, far.z - b.z) < 40; }
      else { tx = SHIP.x + SHIP.nx * 60; tz = SHIP.z + SHIP.nz * 60; slow = Math.hypot(tx - b.x, tz - b.z) < 40; }
    }
    // never straight through the island: aim past its edge on the nearer side
    const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d, ix = I.x - b.x, iz = I.z - b.z, along = ix * ux + iz * uz, off = ix * uz - iz * ux;
    if (along > 0 && along < d && Math.abs(off) < I.r + 14) { const k = off >= 0 ? -1 : 1, px = I.x + uz * k * (I.r + 26), pz = I.z - ux * k * (I.r + 26); tx = px; tz = pz; }
    const rel = wrapA(Math.atan2(-(tx - b.x), tz - b.z) - b.h), dist = Math.hypot(tx - b.x, tz - b.z);
    out.steer = Math.round(clamp(rel * (skill >= 1 ? 2.4 : 1.4), -1, 1) * 100) / 100 || 0;
    out.brake = (Math.abs(rel) > 1.3 && b.u > 12) || (slow && b.u > 7) ? 1 : 0;
    out.boost = skill >= 1 && urgent && dist > 75 && Math.abs(rel) < 0.3 && b.boostE > 20 ? 1 : 0;
    return out;
  }
  summary() {
    const rd = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
    return { level: ARENA.key, difficulty: this.difficulty, total: this.total, saved: this.saved, lost: this.total - this.saved, time: this.endT === null ? null : rd(this.endT, 2), sunk: this.sunk, rams: this.rams,
      shots: this.shots, hits: this.hits, medal: this.over ? medalFor(this.saved) : null, finished: this.over };
  }
}

// A whole mission with the stand-in at the wheel (skill 1: practised; below 1: a beginner; 0: nobody steers and the cannon never
// finds a shark by aim). Returns the Rescue.
export function autoRescue({ difficulty = 'normal', seed = 5, skill = 1, tune = 'cruise', maxS = 320 } = {}) {
  const c = arenaCourse(), race = new Race(rescueSettings(c, { tune }), c), R = new Rescue(race, { difficulty, seed }), inp = { steer: 0, brake: 0, boost: 0 };
  const steps = Math.round(maxS / DT);
  for (let i = 0; i < steps && !R.over; i++) { if (skill > 0) R.pilot(inp, skill); race.step(inp.steer, inp.brake, inp.boost); R.step(); race.events.length = 0; }
  return R;
}
