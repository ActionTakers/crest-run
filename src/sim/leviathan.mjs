// leviathan.mjs: the second boss level, "The Leviathan", built on what research step A3 took from the way the Final Fantasy
// series makes its boss fights (<local>, teachings T1 to T12; no name, character,
// picture or tune of that series is used). A sea guardian sixty metres long swims a circle round a maelstrom. Three phases
// that change what the player must do (T3), each with a name (T4): The Hunt, The Maelstrom, The Tide Wall. Every attack is
// marked on the water before it lands (T5). Three glowing lures on its back are its weak points, open only while it is at the
// surface (T6). Hits fill a stagger gauge; full, the beast lies stunned and takes double damage (T7), and the player's big
// move is to ram it at boost speed (T8). Its health, its stagger and the cast of its great attack are clocks the player sees
// (T9); the cast can be broken by hitting it often enough. Pure (no DOM, no three.js), fixed step, seeded; it runs on a Race in
// free mode like sim/boss.mjs. Written 2026-11-15 by the yacht project session on the owner's words of that day ("make our
// next one according to these teachings", DECISIONS.md). Every number is tuned with the stand-in driver below, never by a
// person. Tests: tests/leviathan.test.mjs.
import { DT, BOOST, Race } from './race-sim.mjs?v=5e9464f8';
import { buildCourse, wrapA } from './courses.mjs?v=5e9464f8';

const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// The arena: a ring course of radius R round the maelstrom at the origin; the beast swims a circle of radius swimR, head first,
// counter-clockwise. len: its length; spots: where its three lures sit, metres behind the head; body: its solid circles.
export const LEVI = { key: 'leviathan', name: 'The Leviathan', world: 'noon', R: 190, halfWidth: 130, sea: { count: 5, seed: 61, amp: 0.42 }, swimR: 78, len: 60,
  spots: [14, 30, 46], body: [4, 16, 28, 40, 52].map((s) => ({ s, r: 6.5 })), startA: 250 * DEG };
export const PHASES = ['The Hunt', 'The Maelstrom', 'The Tide Wall'];
export const FIGHT = {
  hp: 230, p2: 0.62, p3: 0.28,                              // its health, and the shares of it at which phases two and three begin
  range: 90, cone: 32 * DEG, rate: 4.5, shellV: 130, hitR: 5, spread: 0.012,
  hull: 5, hitKeep: 0.55, boost0: 40, boostRegen: 2.5, boostStun: 30, capS: 300,
  graceS: 2.2,                                              // after a hit nothing can hit the yacht for this long (a first version sank it in a chain)
  swimV: [13, 15, 17], surfaceS: [12, 10, 9], diveS: [4.5, 4.5, 4],            // per phase: its speed, seconds at the surface, seconds under
  stagger: 30, stunS: 7, stunMul: 2, ramV: 14, ramDmg: 22, ramKeep: 0.6,        // hits to stun it; a ram needs this speed (m/s)
  spout: { n: [3, 4, 5], every: [5.4, 4.6, 4.0], fallS: 2.4, gap: 0.3, r: 7, spread: 24 },
  breach: { followS: 2.6, lockS: 1.0, r: 10 },                                  // from phase two: it comes up under the yacht
  pull: { a: 2.2, far: 170, coreR: 24, coreS: 2.5 },                            // from phase two: the maelstrom draws the yacht in
  cast: { first: 5, every: 24, castS: 10, need: 12 },                    // phase three: the Tide Wall, broken by `need` hits
  levels: { easy: { pace: 1.25, aim: 12, hp: 0.85, tide: 1 }, normal: { pace: 1, aim: 7, hp: 1, tide: 2 }, hard: { pace: 0.85, aim: 5, hp: 1.15, tide: 2 } },
};

let built = null;
export function leviCourse() {
  if (built) return built;
  const control = [];
  for (let k = 0; k < 16; k++) { const a = LEVI.startA + (k * 2 * Math.PI) / 16; control.push([Math.cos(a) * LEVI.R, Math.sin(a) * LEVI.R]); }
  built = buildCourse({ key: LEVI.key, name: LEVI.name, world: LEVI.world, sea: LEVI.sea, laps: 1, control, halfWidth: LEVI.halfWidth, cornerGates: false,
    extraGates: [{ s: 60, lat: 0, width: 2 * LEVI.halfWidth }], ramps: [], arena: true, scenery: { islands: 6, liner: 0, cargo: 0, tug: 0, sails: 2, towers: 0 } });
  return built;
}
export function leviSettings(course, { tune = 'cruise' } = {}) {
  return { laps: 1, sea: { ...LEVI.sea }, boats: [{ name: 'You', tune, ai: null }], player: 0, band: 0, grid: 'back', free: true };
}
// gold: won with at most one part of the hull lost and inside 180 s; silver: won with two parts left; bronze: won
export function leviMedal(won, hull, time) { return !won ? null : hull >= FIGHT.hull - 1 && time <= 180 ? 'gold' : hull >= 2 ? 'silver' : 'bronze'; }

export class Leviathan {
  constructor(race, { difficulty = 'normal', seed = 11 } = {}) {
    this.kind = 'levi'; this.race = race; this.difficulty = FIGHT.levels[difficulty] ? difficulty : 'normal'; this.level = FIGHT.levels[this.difficulty];
    this.rnd = mulberry(seed);
    this.hpMax = Math.round(FIGHT.hp * this.level.hp); this.hp = this.hpMax; this.phase = 1; this.hull = FIGHT.hull;
    this.th = 20 * DEG; this.st = 'swim'; this.t = 0; this.up = 1;             // head angle on its circle; state; seconds in it; how far it is out of the water (0 to 1)
    this.stag = 0; this.rammed = false; this.castAt = 1e9; this.castHits = 0;
    this.shells = []; for (let i = 0; i < 28; i++) this.shells.push({ on: false, x: 0, z: 0, vx: 0, vz: 0, t: 0, life: 0 });
    this.marks = []; for (let i = 0; i < 8; i++) this.marks.push({ on: false, x: 0, z: 0, t: 0, land: 0 });
    this.breach = { on: false, x: 0, z: 0, t: 0, locked: false };
    this.nextSpout = 5; this.mawT = 0; this.safeT = -1; this.cool = 0; this.lock = -1;
    this.over = false; this.won = false; this.endT = null; this.shots = 0; this.hits = 0; this.taken = 0; this.stuns = 0; this.rams = 0; this.breaks = 0; this.agroundT = -1e9;
    this.me = race.boats[race.player >= 0 ? race.player : 0]; this.me.boostE = FIGHT.boost0;
    this.auto = { away: false, dodge: 0 };
  }
  ev(e) { this.race.events.push(e); }
  // a point of its body, s metres behind the head along its circle, and which way that point moves
  at(s, out = {}) { const a = this.th - s / LEVI.swimR; out.x = Math.cos(a) * LEVI.swimR; out.z = Math.sin(a) * LEVI.swimR; out.tx = -Math.sin(a); out.tz = Math.cos(a); return out; }
  get exposed() { return this.up > 0.6 && this.st !== 'dive' && !this.over; }
  get speed() { return this.st === 'swim' || this.st === 'dive' ? FIGHT.swimV[this.phase - 1] : 0; }
  get castLeft() { return this.st === 'cast' ? Math.max(0, FIGHT.cast.castS - this.t) : -1; }
  // One step, right after race.step().
  step() {
    const race = this.race, b = this.me, T = race.lapT, ph = this.phase - 1;
    this.keepOut(b);
    if (!race.racing) return;
    if (!this.over) {
      b.boostE = Math.min(BOOST.max, b.boostE + FIGHT.boostRegen * DT);
      this.move(T, ph); this.cannon(b); this.spouts(b, T, ph); this.pull(b);
    }
    this.stepShells(T); this.stepMarks(b, T); this.stepBreach(b);
    if (!this.over && (this.hp <= 0 || this.hull <= 0 || T > FIGHT.capS)) {
      this.over = true; this.won = this.hp <= 0; this.endT = T; this.lock = -1; this.breach.on = false;
      this.ev({ type: 'leviEnd', won: this.won, hp: Math.max(0, this.hp), hull: this.hull });
      race.playerDone();
    }
  }
  // the beast: swims, dives, comes up again; stunned or casting it lies still at the surface
  move(T, ph) {
    this.t += DT; this.th = wrapA(this.th + (this.speed / LEVI.swimR) * DT);
    this.up = clamp(this.up + (this.st === 'dive' ? -1 : 1) * DT / 1.1, 0, 1);
    if (this.st === 'swim') {
      if (this.phase === 3 && T >= this.castAt) { this.st = 'cast'; this.t = 0; this.castHits = 0; this.ev({ type: 'castStart', need: FIGHT.cast.need, s: FIGHT.cast.castS }); }
      else if (this.t >= FIGHT.surfaceS[ph]) { this.st = 'dive'; this.t = 0; this.ev({ type: 'dive' }); if (this.phase >= 2) { const q = this.breach; q.on = true; q.t = 0; q.locked = false; q.x = this.me.x; q.z = this.me.z; this.ev({ type: 'breachMark' }); } }
    } else if (this.st === 'dive') {
      if (this.t >= FIGHT.diveS[ph]) { this.st = 'swim'; this.t = 0; this.ev({ type: 'surface' }); }
    } else if (this.st === 'stun') {
      if (this.t >= FIGHT.stunS) { this.st = 'dive'; this.t = 0; this.stag = 0; this.ev({ type: 'stunEnd' }); this.ev({ type: 'dive' }); }
    } else if (this.st === 'cast' && this.t >= FIGHT.cast.castS) {
      this.castAt = T + FIGHT.cast.every; this.st = 'swim'; this.t = 0;
      const hit = this.strike(this.level.tide);
      this.ev({ type: 'tide', hit, hull: this.hull });
    }
  }
  // a hit on the yacht: n parts of the hull, some of its speed, and a moment in which nothing else can hit it. False while it is safe
  strike(n, keep = FIGHT.hitKeep) { const T = this.race.lapT; if (this.over || T < this.safeT) return false; this.safeT = T + FIGHT.graceS; this.hull -= n; this.taken += n; this.me.vx *= keep; this.me.vz *= keep; return true; }
  stun(why) { this.st = 'stun'; this.t = 0; this.rammed = false; this.stuns++; this.me.boostE = Math.min(BOOST.max, this.me.boostE + FIGHT.boostStun); this.ev({ type: 'stun', why }); }
  // damage to the beast; a new phase when its health crosses a mark
  hurt(n) {
    this.hp -= n;
    const f = this.hp / this.hpMax, p = f > FIGHT.p2 ? 1 : f > FIGHT.p3 ? 2 : 3;
    if (p > this.phase && this.hp > 0) { this.phase = p; if (p === 3) this.castAt = this.race.lapT + FIGHT.cast.first; this.ev({ type: 'phase', n: p, name: PHASES[p - 1] }); this.shift(); }
  }
  // a new phase begins under water: whatever it was doing, the beast dives (a stun ends, the stagger is gone) and comes for the
  // yacht from below. A first version let a stun carry over, and the stand-in burned through phase two in seven seconds
  shift() {
    this.st = 'dive'; this.t = 0; this.stag = 0; this.ev({ type: 'dive' });
    const q = this.breach; q.on = true; q.t = 0; q.locked = false; q.x = this.me.x; q.z = this.me.z; this.ev({ type: 'breachMark' });
  }
  // its body is solid while it is up; a yacht that meets the stunned beast at speed rams it, once a stun
  keepOut(b) {
    if (this.up < 0.5) return;
    let v = 0; const P = {};
    for (const c of LEVI.body) {
      this.at(c.s, P); const rad = c.r + 4.5, dx = b.x - P.x, dz = b.z - P.z, d = Math.hypot(dx, dz); if (d >= rad || d < 1e-6) continue;
      const nx = dx / d, nz = dz / d, vn = b.vx * nx + b.vz * nz, sp = Math.hypot(b.vx, b.vz);
      if (this.st === 'stun' && !this.rammed && !this.over && sp >= FIGHT.ramV) { this.rammed = true; this.rams++; this.hurt(FIGHT.ramDmg); b.vx *= FIGHT.ramKeep; b.vz *= FIGHT.ramKeep; this.ev({ type: 'ramLevi', x: P.x, z: P.z, hp: Math.max(0, this.hp) }); }
      b.x = P.x + nx * rad; b.z = P.z + nz * rad;
      if (vn < 0) { b.vx -= vn * nx * 1.2; b.vz -= vn * nz * 1.2; v = Math.max(v, -vn); }
      const fx = -Math.sin(b.h), fz = Math.cos(b.h), fn = fx * nx + fz * nz;
      if (fn < 0.25) { const tx = -nz, tz = nx, k = fx * tx + fz * tz >= 0 ? 1 : -1, hd = Math.atan2(-(tx * k + nx * 0.3), tz * k + nz * 0.3); b.h = wrapA(b.h + clamp(wrapA(hd - b.h), -2.2 * DT, 2.2 * DT)); }
    }
    if (v > 1.5 && this.race.t - this.agroundT > 0.6) { this.agroundT = this.race.t; this.ev({ type: 'aground', v }); }
  }
  // the bow cannon: the nearest lure that is out of the water, inside the range and the cone; it aims ahead of a moving lure
  cannon(b) {
    this.cool -= DT;
    const bx = b.x - Math.sin(b.h) * 5, bz = b.z + Math.cos(b.h) * 5, P = {}, u = this.speed;
    let best = -1, bs = 1e9, ax = 0, az = 0;
    if (this.exposed) for (let i = 0; i < LEVI.spots.length; i++) {
      this.at(LEVI.spots[i], P); let dx = P.x - bx, dz = P.z - bz; const d = Math.hypot(dx, dz); if (d > FIGHT.range) continue;
      const lead = d / FIGHT.shellV; dx += P.tx * u * lead; dz += P.tz * u * lead;
      const rel = Math.abs(wrapA(Math.atan2(-dx, dz) - b.h)); if (rel > FIGHT.cone) continue;
      if (d + rel * 40 < bs) { bs = d + rel * 40; best = i; ax = dx; az = dz; }
    }
    this.lock = best;
    if (best < 0 || this.cool > 0) return;
    const sh = this.shells.find((q) => !q.on); if (!sh) return;
    const ah = Math.atan2(-ax, az) + (this.rnd() - 0.5) * 2 * FIGHT.spread, d = Math.hypot(ax, az);
    sh.on = true; sh.x = bx; sh.z = bz; sh.vx = -Math.sin(ah) * FIGHT.shellV; sh.vz = Math.cos(ah) * FIGHT.shellV; sh.t = 0; sh.life = d / FIGHT.shellV + 0.12;
    this.cool = 1 / FIGHT.rate; this.shots++;
    this.ev({ type: 'shot', x: bx, z: bz });
  }
  stepShells() {
    const P = {};
    for (const sh of this.shells) {
      if (!sh.on) continue;
      sh.x += sh.vx * DT; sh.z += sh.vz * DT; sh.t += DT;
      let hit = -1;
      if (this.exposed) for (let i = 0; i < LEVI.spots.length; i++) { this.at(LEVI.spots[i], P); if ((P.x - sh.x) ** 2 + (P.z - sh.z) ** 2 < FIGHT.hitR * FIGHT.hitR) { hit = i; break; } }
      if (hit >= 0) {
        sh.on = false; this.hits++;
        const stunned = this.st === 'stun'; this.hurt(stunned ? FIGHT.stunMul : 1);
        if (this.st === 'cast') { this.castHits++; if (this.castHits >= FIGHT.cast.need) { this.breaks++; this.castAt = this.race.lapT + FIGHT.cast.every; this.ev({ type: 'castBreak' }); this.stun('cast'); } }
        else if (!stunned) { this.stag++; if (this.stag >= FIGHT.stagger) this.stun('stagger'); }
        this.ev({ type: 'lure', i: hit, x: sh.x, z: sh.z, hp: Math.max(0, this.hp), stunned });
      } else if (sh.t >= sh.life) { sh.on = false; this.ev({ type: 'splash', x: sh.x, z: sh.z }); }
    }
  }
  // water it throws up: marks round where the yacht will be, each landing a moment after the one before
  spouts(b, T, ph) {
    if (T < this.nextSpout || this.st === 'stun') return;
    this.nextSpout = T + FIGHT.spout.every[ph] * this.level.pace;
    for (let k = 0; k < FIGHT.spout.n[ph]; k++) {
      const m = this.marks.find((q) => !q.on); if (!m) break;
      const lead = FIGHT.spout.fallS + FIGHT.spout.gap * k, ang = this.rnd() * 2 * Math.PI, err = (k === 0 ? this.level.aim : FIGHT.spout.spread) * this.rnd();
      m.on = true; m.t = 0; m.land = lead; m.x = b.x + b.vx * lead + Math.cos(ang) * err; m.z = b.z + b.vz * lead + Math.sin(ang) * err;
    }
    this.ev({ type: 'spoutMark', n: FIGHT.spout.n[ph] });
  }
  stepMarks(b) {
    for (const m of this.marks) {
      if (!m.on) continue;
      m.t += DT; if (m.t < m.land) continue;
      m.on = false;
      const hit = Math.hypot(b.x - m.x, b.z - m.z) < FIGHT.spout.r && this.strike(1);
      this.ev({ type: 'spout', x: m.x, z: m.z, hit, hull: this.hull });
    }
  }
  // it comes up under the yacht: its shadow follows the yacht, then stays where it is, then the beast breaks the surface there
  stepBreach(b) {
    const q = this.breach; if (!q.on) return;
    q.t += DT;
    if (q.t < FIGHT.breach.followS) { q.x = b.x; q.z = b.z; return; }
    if (!q.locked) { q.locked = true; this.ev({ type: 'breachLock', x: q.x, z: q.z }); }
    if (q.t < FIGHT.breach.followS + FIGHT.breach.lockS) return;
    q.on = false;
    const hit = Math.hypot(b.x - q.x, b.z - q.z) < FIGHT.breach.r && this.strike(1, FIGHT.hitKeep * 0.8);
    this.ev({ type: 'breach', x: q.x, z: q.z, hit, hull: this.hull });
  }
  // the maelstrom, from phase two: it draws the yacht toward the middle; in its core the hull breaks, a part every coreS seconds
  pull(b) {
    if (this.phase < 2) return;
    const d = Math.hypot(b.x, b.z), Q = FIGHT.pull; if (d < 1) return;
    const a = Q.a * clamp(1 - d / Q.far, 0, 1); b.vx -= (b.x / d) * a * DT; b.vz -= (b.z / d) * a * DT;
    if (d < Q.coreR) { this.mawT += DT; if (this.mawT >= Q.coreS) { this.mawT = 0; if (this.strike(1, 1)) this.ev({ type: 'maw', hull: this.hull }); } } else this.mawT = Math.max(0, this.mawT - DT);
  }
  // ---------- a stand-in for a player: runs at a lure with its bow on it, turns away when close, comes again; swerves out of a
  // mark it is heading into; keeps out of the middle; rams the stunned beast with the boost. For the tests and the film. ----------
  pilot(out) {
    const b = this.me, A = this.auto, P = this.at(LEVI.spots[1], {}), d = Math.hypot(P.x - b.x, P.z - b.z), dO = Math.hypot(b.x, b.z);
    let tx, tz, boost = 0;
    const lead = this.speed * clamp(d / 30, 0, 2.5), ox = P.x / LEVI.swimR, oz = P.z / LEVI.swimR;      // outward from the middle at the lure
    if (this.st === 'stun' && !this.rammed) { tx = P.x; tz = P.z; boost = 1; A.away = false; }
    else if (!this.exposed) { tx = (P.x + P.tx * lead) + ox * 62; tz = (P.z + P.tz * lead) + oz * 62; A.away = false; }   // wait outside its circle, ahead of it
    else {
      if (d < (this.st === 'cast' ? 20 : 36)) A.away = true; else if (d > (this.st === 'cast' ? 44 : 74)) A.away = false;      // closer and longer on a cast: the hits must come fast
      if (A.away) { tx = P.x + ox * 130; tz = P.z + oz * 130; } else { tx = P.x + P.tx * lead; tz = P.z + P.tz * lead; }
    }
    if (this.phase >= 2 && dO < 62 && !(this.st === 'stun' && !this.rammed)) { tx = b.x * 3; tz = b.z * 3; boost = 1; }     // out of the maelstrom
    let rel = wrapA(Math.atan2(-(tx - b.x), tz - b.z) - b.h), dodge = 0;
    const danger = (x, z, left, r) => { const px = b.x + b.vx * left, pz = b.z + b.vz * left; if (Math.hypot(px - x, pz - z) < r + (A.dodge ? 13 : 6)) dodge = A.dodge || (wrapA(Math.atan2(-(x - b.x), z - b.z) - b.h) > 0 ? -1 : 1); };
    for (const m of this.marks) if (m.on) danger(m.x, m.z, m.land - m.t, FIGHT.spout.r);
    const q = this.breach; if (q.on && q.locked) danger(q.x, q.z, FIGHT.breach.followS + FIGHT.breach.lockS - q.t, FIGHT.breach.r);
    A.dodge = dodge;
    out.steer = Math.round(clamp(dodge ? dodge : rel * 2.4, -1, 1) * 100) / 100 || 0;
    out.brake = 0; out.boost = (dodge || boost || (q.on && !q.locked)) && b.boostE > 12 ? 1 : 0;
    return out;
  }
  summary() {
    const rd = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d, done = Math.round(100 * (this.hpMax - Math.max(0, this.hp)) / this.hpMax);
    return { level: LEVI.key, difficulty: this.difficulty, total: 100, saved: done, lost: 100 - done, won: this.won, phase: this.phase, hull: Math.max(0, this.hull), taken: this.taken,
      time: this.endT === null ? null : rd(this.endT, 2), shots: this.shots, hits: this.hits, stuns: this.stuns, rams: this.rams, breaks: this.breaks, medal: this.over ? leviMedal(this.won, this.hull, this.endT) : null, finished: this.over };
  }
}

// A whole fight with the stand-in at the wheel (steer false: nobody steers). Returns the Leviathan.
export function autoLevi({ difficulty = 'normal', seed = 11, steer = true, tune = 'cruise', maxS = 330 } = {}) {
  const c = leviCourse(), race = new Race(leviSettings(c, { tune }), c), L = new Leviathan(race, { difficulty, seed }), inp = { steer: 0, brake: 0, boost: 0 };
  const steps = Math.round(maxS / DT);
  for (let i = 0; i < steps && !L.over; i++) { if (steer) L.pilot(inp); race.step(inp.steer, inp.brake, inp.boost); L.step(); race.events.length = 0; }
  return L;
}
