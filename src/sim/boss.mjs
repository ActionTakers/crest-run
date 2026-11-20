// boss.mjs: the boss level "The World Dragon". A dragon the size of an island lies in the sea; one of the crew stands on its back
// as the boss and throws fire at the yacht; six crystals glow along the dragon's flanks at the waterline. The yacht roams freely
// around the dragon (a Race in free mode on a ring course, as in sim/rescue.mjs); its bow cannon fires by itself at a crystal
// inside its cone; a fireball that lands near the yacht costs a part of its hull. Six crystals broken: the boss is beaten. Hull
// gone: the mission is lost. Pure (no DOM, no three.js), fixed step, seeded. Written 2026-11-15 by the yacht project session on
// the owner's words of that day ("think about fighting bosses while racing and create amazing boss levels"; of the crew: "weer
// anderen magen we bosslevels"; <local>). A first playable: every number is tuned on this PC with the
// stand-in driver below, never by a person on a phone. Tests: tests/boss.test.mjs.
// World and headings as in race-sim.mjs. The dragon lies along the x axis with its middle at the origin.
import { DT, BOOST, Race } from './race-sim.mjs?v=91fc8c31';
import { buildCourse, wrapA } from './courses.mjs?v=91fc8c31';

const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// The arena: a ring of radius R around the dragon, halfWidth wide to each side (the lane begins 60 m from the middle, so the
// water along the flanks, where the crystals are, is open: a first version slowed the yacht there). The dragon is solid: five circles along its
// length (half length 117 m, half width 50 m at the model's scale of 30). The boss stands on its back, `boss.y` above the sea.
export const DRAGON = { key: 'dragon', name: 'The World Dragon', world: 'dusk', R: 190, halfWidth: 130, sea: { count: 5, seed: 47, amp: 0.3 }, scale: 30,
  body: [-70, -35, 0, 35, 70].map((x) => ({ x, z: 0, r: 50 })), boss: { x: -10, y: 59.5, z: 0 }, startA: 250 * DEG };   // boss.y: the temple roof there, measured 59.7 to 61.6 m with rays onto the model
// crystals: x along the dragon, side -1 or +1 (which flank), a little outside the body
export const CRYSTALS = [[-78, -1], [-78, 1], [0, -1], [0, 1], [74, -1], [74, 1]].map(([x, side], i) => ({ i, x, z: side * 60 }));
// one crystal glows at a time and only that one can be hit; each next one is on the other flank, so the yacht has to go round
// the dragon's head or tail between them (with all six open at once the stand-in driver broke them in 27 s from one spot)
export const ORDER = [0, 3, 4, 1, 2, 5];
export const BOSS = {
  range: 90, cone: 32 * DEG, rate: 4.5, shellV: 130, hitR: 4, spread: 0.012, crystalHp: 10,
  hull: 5, fireS: 2.7, fireR: 8, hitKeep: 0.55, boost0: 40, boostCrystal: 20, boostRegen: 2.5, capS: 240,
  // per level: seconds between throws; from how many crystals broken on he throws two at once; how far his aim can be off (m)
  levels: { easy: { every: 4.6, two: 99, aim: 13 }, normal: { every: 3.9, two: 5, aim: 8 }, hard: { every: 3.1, two: 3, aim: 6.5 } },
};

let built = null;
export function dragonCourse() {
  if (built) return built;
  const control = [];
  for (let k = 0; k < 16; k++) { const a = DRAGON.startA + (k * 2 * Math.PI) / 16; control.push([Math.cos(a) * DRAGON.R, Math.sin(a) * DRAGON.R]); }
  built = buildCourse({ key: DRAGON.key, name: DRAGON.name, world: DRAGON.world, sea: DRAGON.sea, laps: 1, control, halfWidth: DRAGON.halfWidth, cornerGates: false,
    extraGates: [{ s: 60, lat: 0, width: 2 * DRAGON.halfWidth }], ramps: [], arena: true, scenery: { islands: 7, liner: 0, cargo: 0, tug: 0, sails: 3, towers: 1 } });
  return built;
}
export function bossSettings(course, { tune = 'cruise' } = {}) {
  return { laps: 1, sea: { ...DRAGON.sea }, boats: [{ name: 'You', tune, ai: null }], player: 0, band: 0, grid: 'back', free: true };
}
// gold: won with at most one hit taken and inside 120 s; silver: won with at least two parts of the hull left; bronze: won
export function bossMedal(won, hull, time) { return !won ? null : hull >= BOSS.hull - 1 && time <= 120 ? 'gold' : hull >= 2 ? 'silver' : 'bronze'; }

export class Boss {
  constructor(race, { difficulty = 'normal', seed = 9 } = {}) {
    this.kind = 'boss'; this.race = race; this.difficulty = BOSS.levels[difficulty] ? difficulty : 'normal'; this.level = BOSS.levels[this.difficulty];
    this.rnd = mulberry(seed);
    this.crystals = CRYSTALS.map((c) => ({ ...c, hp: BOSS.crystalHp, on: true, hitT: -9 }));
    this.shells = []; for (let i = 0; i < 28; i++) this.shells.push({ on: false, x: 0, z: 0, vx: 0, vz: 0, t: 0, life: 0 });
    this.fires = []; for (let i = 0; i < 6; i++) this.fires.push({ on: false, x: 0, z: 0, t: 0, x0: DRAGON.boss.x, z0: DRAGON.boss.z });
    this.open = 0;                                   // how far along ORDER the fight is
    this.total = this.crystals.length; this.broken = 0; this.hull = BOSS.hull; this.over = false; this.won = false; this.endT = null;
    this.cool = 0; this.lock = -1; this.shots = 0; this.hits = 0; this.taken = 0; this.dodged = 0; this.nextFire = 4; this.agroundT = -1e9; this.throwT = -9;
    this.me = race.boats[race.player >= 0 ? race.player : 0]; this.me.boostE = BOSS.boost0;
    this.auto = { target: -1, away: false, dodge: 0 };
  }
  ev(e) { this.race.events.push(e); }
  get openCrystal() { return this.open < ORDER.length ? this.crystals[ORDER[this.open]] : null; }
  // One step, right after race.step().
  step() {
    const race = this.race, b = this.me, T = race.lapT;
    this.keepOut(b);
    if (!race.racing) return;
    if (!this.over) { b.boostE = Math.min(BOOST.max, b.boostE + BOSS.boostRegen * DT); this.cannon(b); this.throwFire(b, T); }
    this.stepShells(T); this.stepFires(b);
    if (!this.over && (this.broken >= this.total || this.hull <= 0 || T > BOSS.capS)) {
      this.over = true; this.won = this.broken >= this.total; this.endT = T; this.lock = -1;
      this.ev({ type: 'bossEnd', won: this.won, broken: this.broken, total: this.total, hull: this.hull });
      race.playerDone();
    }
  }
  // the dragon is solid; a bow that points into it swings round to run along it (as the island of the rescue level)
  keepOut(b) {
    let v = 0;
    for (const c of DRAGON.body) {
      const rad = c.r + 4.5, dx = b.x - c.x, dz = b.z - c.z, d = Math.hypot(dx, dz); if (d >= rad || d < 1e-6) continue;
      const nx = dx / d, nz = dz / d, vn = b.vx * nx + b.vz * nz;
      b.x = c.x + nx * rad; b.z = c.z + nz * rad;
      if (vn < 0) { b.vx -= vn * nx * 1.2; b.vz -= vn * nz * 1.2; v = Math.max(v, -vn); }
      const fx = -Math.sin(b.h), fz = Math.cos(b.h), fn = fx * nx + fz * nz;
      if (fn < 0.25) { const tx = -nz, tz = nx, k = fx * tx + fz * tz >= 0 ? 1 : -1, hd = Math.atan2(-(tx * k + nx * 0.3), tz * k + nz * 0.3); b.h = wrapA(b.h + clamp(wrapA(hd - b.h), -2.2 * DT, 2.2 * DT)); }
    }
    if (v > 1.5 && this.race.t - this.agroundT > 0.6) { this.agroundT = this.race.t; this.ev({ type: 'aground', v }); }
  }
  // the bow cannon: the nearest crystal that still glows, inside the range and the cone
  cannon(b) {
    this.cool -= DT;
    const bx = b.x - Math.sin(b.h) * 5, bz = b.z + Math.cos(b.h) * 5;
    let best = -1, bs = 1e9;
    for (const c of this.crystals) {
      if (!c.on || c !== this.openCrystal) continue;
      const dx = c.x - bx, dz = c.z - bz, d = Math.hypot(dx, dz); if (d > BOSS.range) continue;
      const rel = Math.abs(wrapA(Math.atan2(-dx, dz) - b.h)); if (rel > BOSS.cone) continue;
      if (d + rel * 40 < bs) { bs = d + rel * 40; best = c.i; }
    }
    this.lock = best;
    if (best < 0 || this.cool > 0) return;
    const c = this.crystals[best], sh = this.shells.find((q) => !q.on); if (!sh) return;
    const ah = Math.atan2(-(c.x - bx), c.z - bz) + (this.rnd() - 0.5) * 2 * BOSS.spread, d = Math.hypot(c.x - bx, c.z - bz);
    sh.on = true; sh.x = bx; sh.z = bz; sh.vx = -Math.sin(ah) * BOSS.shellV; sh.vz = Math.cos(ah) * BOSS.shellV; sh.t = 0; sh.life = d / BOSS.shellV + 0.1;
    this.cool = 1 / BOSS.rate; this.shots++;
    this.ev({ type: 'shot', x: bx, z: bz });
  }
  stepShells(T) {
    for (const sh of this.shells) {
      if (!sh.on) continue;
      sh.x += sh.vx * DT; sh.z += sh.vz * DT; sh.t += DT;
      let hit = null;
      for (const c of this.crystals) if (c.on && c === this.openCrystal && (c.x - sh.x) ** 2 + (c.z - sh.z) ** 2 < BOSS.hitR * BOSS.hitR) { hit = c; break; }
      if (hit) {
        sh.on = false; this.hits++; hit.hp--; hit.hitT = T;
        if (hit.hp <= 0) { hit.on = false; this.broken++; this.open++; this.me.boostE = Math.min(BOOST.max, this.me.boostE + BOSS.boostCrystal); }
        this.ev({ type: 'crystal', c: hit.i, x: hit.x, z: hit.z, broken: !hit.on, left: this.total - this.broken, next: this.openCrystal ? this.openCrystal.i : -1 });
      } else if (sh.t >= sh.life) { sh.on = false; this.ev({ type: 'splash', x: sh.x, z: sh.z }); }
    }
  }
  // the boss throws: at where the yacht will be when the fire lands, give or take his aim; two at once late in the fight
  throwFire(b, T) {
    if (T < this.nextFire) return;
    this.nextFire = T + this.level.every; this.throwT = T;
    const n = this.broken >= this.level.two ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const f = this.fires.find((q) => !q.on); if (!f) break;
      const lead = BOSS.fireS * (k === 0 ? 1 : 0.55), ang = this.rnd() * 2 * Math.PI, err = this.level.aim * this.rnd();
      f.on = true; f.t = 0; f.x = b.x + b.vx * lead + Math.cos(ang) * err; f.z = b.z + b.vz * lead + Math.sin(ang) * err;
      this.ev({ type: 'throw', f: this.fires.indexOf(f), x: f.x, z: f.z });
    }
  }
  stepFires(b) {
    for (const f of this.fires) {
      if (!f.on) continue;
      f.t += DT; if (f.t < BOSS.fireS) continue;
      f.on = false;
      const d = Math.hypot(b.x - f.x, b.z - f.z), hit = d < BOSS.fireR && !this.over;
      if (hit) { this.hull--; this.taken++; b.vx *= BOSS.hitKeep; b.vz *= BOSS.hitKeep; } else if (!this.over && d < BOSS.fireR * 2.5) this.dodged++;
      this.ev({ type: 'fire', x: f.x, z: f.z, hit, hull: this.hull });
    }
  }
  // seconds until fire f lands, or -1
  fireLeft(f) { return f.on ? BOSS.fireS - f.t : -1; }
  // ---------- a stand-in for a player: runs at the nearest crystal, turns away when close, and swerves when fire is on its way to
  // where it is heading. For the tests (can the boss be beaten, is a yacht nobody steers sunk), the film and the test switch. ----------
  pilot(out) {
    const b = this.me, A = this.auto;
    { const oc = this.openCrystal, t = oc ? oc.i : -1; if (A.target !== t) { A.target = t; A.away = false; } }
    let tx = b.x - Math.sin(b.h) * 50, tz = b.z + Math.cos(b.h) * 50;
    if (A.target >= 0) {
      const c = this.crystals[A.target], d = Math.hypot(c.x - b.x, c.z - b.z);
      if (d < 34) A.away = true; else if (d > 78) A.away = false;
      if (A.away) { const ox = c.x - 0, oz = c.z - 0, o = Math.hypot(ox, oz) || 1; tx = c.x + (ox / o) * 120; tz = c.z + (oz / o) * 120; }   // straight out from the dragon
      else { tx = c.x; tz = c.z; }
      // never straight through the dragon: go round its nearer end
      const side = Math.sign(c.z) || 1; if (Math.sign(b.z) !== side && Math.abs(b.x) < 150) { const end = b.x >= 0 ? 1 : -1; tx = end * 175; tz = side * 40; if (Math.abs(b.x) > 140 && Math.abs(b.z) < 60) { tx = c.x + end * 60; tz = side * 110; } }
    }
    let rel = wrapA(Math.atan2(-(tx - b.x), tz - b.z) - b.h);
    // fire on its way to where the yacht will be: swerve and boost
    // (away from the side the fire will land on, and it keeps the turn until its path is well clear: a first version turned
    // back at once and sailed into the fire it had just avoided)
    let dodge = 0;
    for (const f of this.fires) { if (!f.on) continue; const left = BOSS.fireS - f.t, px = b.x + b.vx * left, pz = b.z + b.vz * left;
      if (Math.hypot(px - f.x, pz - f.z) < BOSS.fireR + (A.dodge ? 14 : 6)) dodge = A.dodge || (wrapA(Math.atan2(-(f.x - b.x), f.z - b.z) - b.h) > 0 ? -1 : 1); }
    A.dodge = dodge; const danger = dodge !== 0;
    out.steer = Math.round(clamp(danger ? dodge : rel * 2.4, -1, 1) * 100) / 100 || 0;
    out.brake = 0;                                             // speed is what keeps the fire off: wide turns, never the brake
    out.boost = danger && b.boostE > 14 ? 1 : 0;
    return out;
  }
  summary() {
    const rd = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
    return { level: DRAGON.key, difficulty: this.difficulty, total: this.total, saved: this.broken, lost: this.total - this.broken, won: this.won, hull: Math.max(0, this.hull), taken: this.taken,
      time: this.endT === null ? null : rd(this.endT, 2), shots: this.shots, hits: this.hits, medal: this.over ? bossMedal(this.won, this.hull, this.endT) : null, finished: this.over };
  }
}

// A whole fight with the stand-in at the wheel (steer false: nobody steers). Returns the Boss.
export function autoBoss({ difficulty = 'normal', seed = 9, steer = true, tune = 'cruise', maxS = 300 } = {}) {
  const c = dragonCourse(), race = new Race(bossSettings(c, { tune }), c), B = new Boss(race, { difficulty, seed }), inp = { steer: 0, brake: 0, boost: 0 };
  const steps = Math.round(maxS / DT);
  for (let i = 0; i < steps && !B.over; i++) { if (steer) B.pilot(inp); race.step(inp.steer, inp.brake, inp.boost); B.step(); race.events.length = 0; }
  return B;
}
