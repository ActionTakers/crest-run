// race-sim.mjs: the race of the game. Several boats with the same physics (the player's and the computer's), laps, gates, ramps,
// boost, contact between boats, places and a recording of the player's inputs. Pure (no DOM, no three.js) with a fixed time step,
// so the same inputs give the same race: a recorded run replays exactly on the same browser engine (another engine may differ in
// the last bits of Math.sin and friends).
// The boat physics (steering, drag, carving, the hull on six wave points, ramps, heave, pitch and roll) is ported from
// shared/boat-sim.mjs of <local> (commit 26df76d, written 2026-11-08 by an earlier session; original in
// vendor/spikes/boat-sim.mjs). New here, 2026-11-13, yacht project session: any number of boats, each with full physics and its
// own driver; two-way contact; a boost the driver controls; landings judged by steering; drafting; places; no per-step garbage.
// World: metres; x and z on the water, y up. Heading h: forward f = (-sin h, cos h), right r = (-cos h, -sin h). Positive steer,
// positive h and positive lateral offsets all mean right. Tests: tests/race-sim.test.mjs.
import * as W from './waves.mjs?v=7d4a3824';
import { wrapA, wrapS, projectInto, pointInto, lineOffAt, speedProfile } from './courses.mjs?v=7d4a3824';
import { JUKUNG_SPEC, JUKUNG_PHYSICS } from './jukung-spec.mjs?v=7d4a3824';
import { makeSailingState, advanceSailing } from './sailing.mjs?v=7d4a3824';

export const DT = 1 / 120;                 // physics step, s
export const COUNTDOWN_S = 3;
export const LAST_IN_S = 45;               // once every rival has finished, the player has this long to finish too
export const SIM_VERSION = 'crest-1';      // existing ranked/replay physics unchanged; sailing practice records no ghost
const AIR = 0.3;                           // m above the water before the hull counts as airborne
const DEG = Math.PI / 180;
const K_HULL = 1 - Math.exp(-DT / 0.08);   // the hull bridges short chop: buoyancy follows the six-point mean through 80 ms
const K_BOOST = 1 - Math.exp(-DT / 0.16);  // the boost fades in and out over about 0.16 s
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Optional racing jukung hull + two float capsules. Their open gaps remain open; the
// outrigger span must not become one solid, broad collision hull. Ordinary
// boat-vs-boat pairs, including the tour jukung, retain their original contacts.
function contactShapes(b) {
  const P = b.P, isRacer = P.craft === 'jukung-racer';
  const shapes = b._contactShapes || (b._contactShapes = Array.from({ length: isRacer ? 3 : 2 }, () => ({})));
  const fx = -Math.sin(b.h), fz = Math.cos(b.h), rx = -Math.cos(b.h), rz = -Math.sin(b.h);
  for (let k = 0; k < shapes.length; k++) {
    const q = shapes[k], floating = isRacer && k > 0;
    const side = floating ? (k === 1 ? -1 : 1) * P.floatOffset : 0;
    const forward = isRacer ? 0 : (k === 0 ? -1 : 1) * P.length * 0.27;
    q.radius = isRacer ? (floating ? P.floatRadius : P.beam / 2) : P.beam * 0.55;
    const half = isRacer ? Math.max(0, (floating ? P.floatLength : P.length) / 2 - q.radius) : 0;
    q.ax = b.x + rx * side + fx * (forward - half); q.az = b.z + rz * side + fz * (forward - half);
    q.bx = b.x + rx * side + fx * (forward + half); q.bz = b.z + rz * side + fz * (forward + half);
  }
  return shapes;
}

// Closest points on two finite 2D segments, including zero-length circles.
function capsuleDelta(a, b, out) {
  const ux = a.bx - a.ax, uz = a.bz - a.az, vx = b.bx - b.ax, vz = b.bz - b.az;
  const rx = a.ax - b.ax, rz = a.az - b.az;
  const A = ux * ux + uz * uz, E = vx * vx + vz * vz, F = vx * rx + vz * rz;
  let s = 0, t = 0;
  if (A <= 1e-12) t = E > 1e-12 ? clamp(F / E, 0, 1) : 0;
  else {
    const C = ux * rx + uz * rz;
    if (E <= 1e-12) s = clamp(-C / A, 0, 1);
    else {
      const B = ux * vx + uz * vz, den = A * E - B * B;
      if (den > 1e-12) s = clamp((B * F - C * E) / den, 0, 1);
      t = (B * s + F) / E;
      if (t < 0) { t = 0; s = clamp(-C / A, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((B - C) / A, 0, 1); }
    }
  }
  out[0] = a.ax + ux * s - b.ax - vx * t;
  out[1] = a.az + uz * s - b.az - vz * t;
}

function resolveRacingJukungContact(a, b) {
  const A = contactShapes(a), B = contactShapes(b), delta = [0, 0];
  let hit = false, closing = 0;
  for (const ca of A) for (const cb of B) {
    capsuleDelta(ca, cb, delta);
    let dx = delta[0], dz = delta[1], d = Math.hypot(dx, dz);
    const radius = ca.radius + cb.radius;
    if (d >= radius) continue;
    if (d < 1e-9) { dx = a.x - b.x; dz = a.z - b.z; d = Math.hypot(dx, dz); if (d < 1e-9) { dx = -Math.cos(a.h); dz = -Math.sin(a.h); d = 1; } }
    hit = true;
    const nx = dx / d, nz = dz / d, push = Math.max(0, radius - Math.hypot(delta[0], delta[1])) / 2;
    a.x += nx * push; a.z += nz * push; b.x -= nx * push; b.z -= nz * push;
    // Apply the same translation to cached endpoints before the next contact.
    for (const q of A) { q.ax += nx * push; q.bx += nx * push; q.az += nz * push; q.bz += nz * push; }
    for (const q of B) { q.ax -= nx * push; q.bx -= nx * push; q.az -= nz * push; q.bz -= nz * push; }
    const vn = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
    closing = Math.max(closing, -vn);
    if (vn < 0.6) {
      const impulse = vn < 0 ? -1.3 * vn / 2 : (0.6 - vn) / 2;
      a.vx += impulse * nx; a.vz += impulse * nz; b.vx -= impulse * nx; b.vz -= impulse * nz;
    }
  }
  return { hit, closing };
}

// Handling of the yacht, three tunes of one hull. turnRate: yaw rate cap, deg/s, reached from turnRef m/s; yawTau: yaw response
// time; grip: decay rate of sideways speed (1/s); carve: share of lost sideways speed turned into forward speed; surf: how much
// wave slopes push; gMul: extra gravity once the hull leaves the water (arcade weight). Tuned by eye; NOT_ASSESSED on a phone.
const HULL = { brake: 9, turnRef: 12, gripBrake: 1.2, brakeTurn: 1.25, surf: 0.35, length: 9.5, beam: 2.9, draft: 0.30, lift: 0.22, trim: 0.06,
  heaveK: 140, heaveZeta: 0.9, pitchK: 32, rollK: 28, gMul: 1.25, slamLoss: 0.022 };
export const TUNES = {
  cruise: { ...HULL, label: 'Cruise', top: 27.0, accel: 7.6, turnRate: 54, yawTau: 0.24, grip: 3.3, carve: 0.45, bankK: 0.55 },
  sport: { ...HULL, label: 'Sport', top: 28.5, accel: 8.6, turnRate: 66, yawTau: 0.17, grip: 2.7, carve: 0.55, bankK: 0.7, gripBrake: 1.0 },
  race: { ...HULL, label: 'Pro', top: 30.5, accel: 8.1, turnRate: 58, yawTau: 0.21, grip: 2.3, carve: 0.6, bankK: 0.65, gripBrake: 0.9 },
};
export const TUNE_KEYS = Object.keys(TUNES);

// The boost: a bar from 0 to max. Gates and clean ramp landings fill it; holding the boost burns it for more thrust and top speed.
export const BOOST = { max: 100, burn: 34, speed: 0.28, accel: 0.9, minStart: 12, gate: 4, perfect: 10, perfectM: 2.2, landing: 35, draft: 6,
  missCost: 10, missSlow: 0.82, kickS: 0.7, kickA: 3 };

function makeBoat(i, spec, c, slotS, slotLat) {
  const P = { ...TUNES[spec.tune || 'cruise'], ...(spec.tweak || {}) }, o = [0, 0, 0]; pointInto(c, slotS, slotLat, o);
  return { i, name: spec.name || `Boat ${i + 1}`, tune: spec.tune || 'cruise', P, ai: spec.ai ? { skill: 0.94, bias: 0, boostAt: 55, dodge: 0, holding: false, ...spec.ai } : null,
    x: o[0], z: o[1], h: o[2], vx: 0, vz: 0, r: 0, y: P.draft, vy: 0, pitch: 0, pr: 0, roll: 0, rr: 0, air: false, airT: 0, rampAir: false, onRamp: null,
    s: ((slotS % c.len) + c.len) % c.len, lat: slotLat, prog: slotS, u: 0, v: 0, kick: 0, hull: NaN,
    boostE: 0, boostLv: 0, boosting: false, chain: 0, bestChain: 0, nextGate: 0, lapGate: 0, laps: [], finished: false, finishT: null, estimated: false, place: i + 1,
    gatesOk: 0, gatesMiss: 0, perfects: 0, clean: 0, rough: 0, contacts: 0, topU: 0, sumU: 0, nU: 0, offS: 0, airS: 0, boostS: 0, draft: 0, drafting: false, pace: 1,
    steer: 0, brake: 0, boostIn: 0, px: o[0], py: P.draft, pz: o[1], ph: o[2], ppitch: 0, proll: 0,
    kYaw: 1 - Math.exp(-DT / P.yawTau), kGrip: Math.exp(-P.grip * DT), kGripB: Math.exp(-P.gripBrake * DT), prof: null,
    auto: { skill: 1, bias: 0, boostAt: 55, dodge: 0, holding: false } };   // the driver of a boat without its own (the player's after the finish, a demo)
}

// settings: { laps, sea: { count, seed, amp }, boats: [{ tune, name, ai: null | { skill, bias, boostAt }, tweak }], player: index of
// the boat steered through step() (or -1: every boat is computer-steered), band: how much the computer's pace follows the player
// (0 = not at all), grid: 'back' (the player starts last) or 'front' }
export function defaultSettings(course, { tune = 'cruise', rivals = 3, difficulty = 'normal', laps = null } = {}) {
  const skills = { easy: [0.87, 0.83, 0.79, 0.77, 0.75], normal: [0.955, 0.925, 0.895, 0.87, 0.85], hard: [1.0, 0.97, 0.94, 0.915, 0.89] }[difficulty] || [0.955, 0.925, 0.895, 0.87, 0.85];
  const names = ['Marlin', 'Osprey', 'Tempest', 'Corsair', 'Halcyon'];
  const boats = [];   // the rivals sail the player's tune: the same boat, so a rival's pace never needs more than the player has
  for (let k = 0; k < rivals; k++) boats.push({ name: names[k % names.length], tune, ai: { skill: skills[k % skills.length], bias: [0, 1.5, -1.5, 0.8, -0.8][k % 5] } });
  boats.push({ name: 'You', tune, ai: null });
  return { laps: laps || (course.def && course.def.laps) || 2, sea: { ...((course.def && course.def.sea) || { count: 5, seed: 7, amp: 0.4 }) }, boats, player: boats.length - 1, band: 0.012, grid: 'back' };
}

export class Race {
  constructor(settings, course) {
    this.settings = JSON.parse(JSON.stringify(settings));
    this.c = course;
    const sea = this.settings.sea;
    this.waves = W.makeWaves({ count: sea.count, seed: sea.seed, amp: sea.amp });
    this.t = 0; this.step_ = 0; this.go = COUNTDOWN_S; this.over = false; this.done = false; this.why = null; this.overAt = null; this.afterglow = false;
    const n = this.settings.boats.length;
    this.player = this.settings.player;
    this.boats = this.settings.boats.map((spec, i) => makeBoat(i, spec, course, -8 - 11 * Math.floor(i / 2), i % 2 === 0 ? -5 : 5));
    // Optional sailing trial: one player, explicit wind/trim, no rankings or ghost
    // recording. Only this player becomes a jukung-racer. The normal tour jukung,
    // existing fleet races and voyage propulsion stay on their arcade
    // model until those missions/AI are deliberately retuned for sailing speeds.
    this.nonRanked = !!this.settings.sailing;
    this.sailingOptions = typeof this.settings.sailing === 'object' ? this.settings.sailing : {};
    if (this.nonRanked && this.boats[this.player]) {
      const b = this.boats[this.player];
      Object.assign(b.P, JUKUNG_PHYSICS);
      b.y = b.py = JUKUNG_SPEC.draft;
      b.sailing = makeSailingState(this.sailingOptions);
    }
    // what the boat can do with the boost on (a driver's skill scales it: pace); corners limit it, straights do not
    for (const b of this.boats) { b.prof = speedProfile(course, { ...b.P, top: b.P.top * (1 + BOOST.speed) }, 1); if (b.ai) b.pace = b.ai.skill; }
    this.order = this.boats.map((b) => b.i);          // boat indices by place, the leader first
    this.rec = { steer: [], flags: [] };             // the player's inputs per step (steer in hundredths; bit 0 brake, bit 1 boost)
    this.events = [];                                // what happened this step, for sound and effects; the caller empties it
    // free: no laps, no gates and no time cap: the boat roams the course's lane and another module decides when it ends
    // (sim/rescue.mjs, 2026-11-15)
    this.free = this.nonRanked || !!this.settings.free;
    this.capS = this.free ? Infinity : this.settings.laps * course.len / 6 + 30;
    this.lastInT = null;                             // the race time at which the last rival finished with the player still out
    this._o = [0, 0, 0]; this._h = new Float64Array(6); this._in = { steer: 0, brake: 0, boost: 0 };
    this._contact = new Uint8Array(n * n); this._contactT = new Float64Array(n * n).fill(-1e9);
    this.n = n;
  }
  get lapT() { return Math.max(0, this.t - this.go); }
  get racing() { return this.t >= this.go; }
  rampAt(s, lat) {   // the ramp under (s, lat), or null; this._rd = metres up the ramp
    for (const r of this.c.ramps) { let d = s - r.s; if (d < -this.c.len / 2) d += this.c.len; if (d >= 0 && d <= r.len && Math.abs(lat - r.lat) <= r.halfW) { this._rd = d; return r; } }
    return null;
  }
  // One step. steer in [-1, 1] (quantised to hundredths here, so a live run and its replay see the same numbers), brake and
  // boost 0 or 1: the inputs of the player's boat. Computer-steered boats drive themselves.
  step(steerIn = 0, brakeIn = 0, boostIn = 0, sailingInput = {}) {
    // a finished race stands still, unless the caller keeps it alive as a backdrop (afterglow: the result screen; every boat then
    // sails on under the computer, nothing is recorded or scored any more)
    if (this.done && !this.afterglow) return;
    const q = Math.round(clamp(Number.isFinite(steerIn) ? steerIn : 0, -1, 1) * 100) || 0, brk = brakeIn ? 1 : 0, bst = boostIn ? 1 : 0;   // || 0: no -0
    if (!this.done && !this.nonRanked) { this.rec.steer.push(q); this.rec.flags.push(brk | (bst << 1)); }
    const racing = this.t >= this.go, B = this.boats, inp = this._in;
    if (racing && this.t - DT < this.go) this.events.push({ type: 'go' });
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      b.px = b.x; b.py = b.y; b.pz = b.z; b.ph = b.h; b.ppitch = b.pitch; b.proll = b.roll;
      if (i === this.player && !b.finished && !this.done) { inp.steer = q / 100; inp.brake = brk; inp.boost = bst; }
      else this.drive(b, inp);
      if (b.sailing) { inp.brake = 0; inp.boost = 0; }
      b.steer = inp.steer; b.brake = inp.brake; b.boostIn = inp.boost;
      this.stepBoat(b, inp.steer, inp.brake, inp.boost, racing, sailingInput);
    }
    if (racing) { this.contacts(); if (!this.nonRanked) this.drafts(); this.places(); }
    this.t += DT; this.step_++;
    if (this.over && this.t - this.overAt > 6) this.finish('finished');
    // Every rival is in and the player is still out: the race ends LAST_IN_S later. Without this a player who cannot finish
    // waited out the long cap alone, five minutes and more (the outside critic's finding 5, 2026-11-14; the slowest stand-in of
    // tools/balance.mjs finishes at most 17.5 s behind the winner).
    // (a race without a player, the demo behind the menus, is over at its last finish and never comes here with every boat in)
    if (!this.nonRanked && B.length > 1 && !this.over) {
      if (this.lastInT === null) { let all = true; for (let i = 0; i < B.length; i++) if (i !== this.player && !B[i].finished) { all = false; break; } if (all) { this.lastInT = this.lapT; this.events.push({ type: 'lastIn', left: LAST_IN_S }); } }
      else if (this.lapT - this.lastInT > LAST_IN_S) this.finish('time limit');
    }
    if (this.lapT > this.capS) this.finish('time limit');
  }
  // seconds left to finish once every rival is in; null while a rival still races or after the player's own finish
  get endsIn() { return this.lastInT === null || this.over ? null : Math.max(0, LAST_IN_S - (this.lapT - this.lastInT)); }
  // ---------- the computer's driver: the racing line's curvature a little ahead as feed-forward, plus feedback on the heading of
  // travel and the sideways distance to the line; it brakes for corners from its speed profile, steps aside for a boat ahead and
  // burns its boost on straights. The same rules and the same boat as the player's. ----------
  drive(b, out) {
    const c = this.c, P = b.P, A = b.ai || b.auto;
    // keep clear of other boats (deterministic, so replays hold): step aside for a slower boat close ahead in the same lane,
    // and hold a gap to a boat alongside
    let want = 0, near = 1e9;
    for (let k = 0; k < this.boats.length; k++) {
      const q = this.boats[k]; if (q === b) continue;
      const ds = wrapS(c, q.s - b.s), dl = q.lat - b.lat;
      if (ds > 6 && ds < 24 && ds < near && Math.abs(dl) < 4.2 && q.u < b.u + 2) { near = ds; want = dl > 0 ? -5.5 : 5.5; }
      else if (ds >= -12 && ds <= 6 && Math.abs(dl) < 6.2 && near > 1e8) want = clamp(want + (dl > 0 ? -1 : 1) * (6.2 - Math.abs(dl)) * 2.5, -6, 6);
    }
    A.dodge += clamp(want - A.dodge, -10 * DT, 10 * DT);
    let bias = A.bias + A.dodge;
    // the shifted line must still pass through the next gate
    const g = c.gates[b.nextGate], dg = wrapS(c, g.s - b.s);
    if (dg > -2 && dg < 90) { const lo = g.lo + 2.6, hi = g.hi - 2.6, tl = lineOffAt(c, g.s) + bias; if (tl < lo) bias += lo - tl; else if (tl > hi) bias -= tl - hi; }
    // a ramp ahead on the line: take it, unless a boat next to this one has the right of way (it is ahead, or level and
    // listed first); then pass beside the ramp instead of leaning on that boat all the way up to it
    for (let k = 0; k < c.ramps.length; k++) {
      const r = c.ramps[k], dr = wrapS(c, r.s - b.s); if (!r.onLine || dr <= -r.len || dr >= 70) continue;
      let side = 0;
      for (let j = 0; j < this.boats.length; j++) {
        const q = this.boats[j]; if (q === b) continue;
        const ds = wrapS(c, q.s - b.s);
        if (ds > -6 && ds < 14 && Math.abs(q.lat - r.lat) < r.halfW + 1.5 && Math.abs(q.lat - b.lat) < 7 && (ds > 1.5 || (ds > -1.5 && q.i < b.i))) side = b.lat >= q.lat ? 1 : -1;
      }
      const tl = lineOffAt(c, r.s) + bias;
      if (side) bias += r.lat + side * (r.halfW + 2.6) - tl;
      else { const w = r.halfW - 2.2; if (tl < r.lat - w) bias += r.lat - w - tl; else if (tl > r.lat + w) bias -= tl - r.lat - w; }
    }
    const u = Math.max(3, b.u);
    const sf = b.s + u * 0.6, kap = wrapA(this.lineH(sf, bias) - this.lineH(sf - 2, bias)) / 4;
    const hl = this.lineH(b.s + u * 0.2, bias), hv = Math.atan2(-b.vx, b.vz), ey = lineOffAt(c, b.s) + bias - b.lat;
    const rWant = u * kap + 2.2 * wrapA(hl - (b.u > 3 ? hv : b.h)) + 0.03 * ey;
    const auth = clamp(Math.abs(b.u) / P.turnRef, 0.2, 1);
    const lim0 = b.air ? 0.3 : 1;   // in the air the wheel does little: hold it near straight for the landing
    out.steer = Math.round(clamp(rWant / (P.turnRate * DEG * auth), -lim0, lim0) * 100) / 100 || 0;
    // brake when faster than the profile allows within the next 45 m
    let lim = Infinity; const v = b.prof.v, pace = b.pace;
    for (let d = 0; d <= 45; d += 3) { const i = Math.floor(((((b.s + d) / c.step) % c.N) + c.N) % c.N), l = Math.sqrt((v[i] * pace) ** 2 + 14 * d); if (l < lim) lim = l; }
    out.brake = b.u > lim * 1.05 ? 1 : 0;
    // boost: start with enough in the bar and a clear straight ahead, hold until it runs low or a corner comes
    let clear = b.u < lim * 0.98 && !b.air && !(g.kind === 'slalom' && dg > -2 && dg < 110);   // no boost into a slalom
    if (clear) for (let d = 0; d <= 60; d += 6) { const i = Math.floor(((((b.s + d) / c.step) % c.N) + c.N) % c.N); if (Math.abs(c.K[i]) > 1 / 95) { clear = false; break; } }
    if (!A.holding && clear && b.boostE >= A.boostAt) A.holding = true;
    if (A.holding && (!clear || b.boostE < 3)) A.holding = false;
    out.boost = A.holding && !b.finished ? 1 : 0;
  }
  // heading of the racing line (shifted sideways by bias) over the 2 m after arc length s
  lineH(s, bias) {
    const c = this.c, o = this._o;
    pointInto(c, s, lineOffAt(c, s) + bias, o); const x0 = o[0], z0 = o[1];
    pointInto(c, s + 2, lineOffAt(c, s + 2) + bias, o);
    return Math.atan2(-(o[0] - x0), o[1] - z0);
  }
  // ---------- one boat, one step ----------
  stepBoat(b, s, brk, bst, racing, sailingInput = {}) {
    if (b.sailing) { this.stepSailingBoat(b, s, sailingInput, racing); return; }
    const P = b.P, dt = DT, c = this.c, wv = this.waves, t = this.t, h6 = this._h;
    // ---- planar motion ----
    let fx = -Math.sin(b.h), fz = Math.cos(b.h), rx = -Math.cos(b.h), rz = -Math.sin(b.h);
    let u = b.vx * fx + b.vz * fz, v = b.vx * rx + b.vz * rz;
    const ctrl = b.air ? 0.2 : 1;
    const auth = clamp(Math.abs(u) / P.turnRef, 0, 1) * (Math.abs(u) > 0.5 ? 1 : 0);
    const rT = racing ? s * P.turnRate * DEG * auth * ctrl * (brk ? P.brakeTurn : 1) : 0;
    b.r += (rT - b.r) * b.kYaw;
    b.h = wrapA(b.h + b.r * dt);
    fx = -Math.sin(b.h); fz = Math.cos(b.h); rx = -Math.cos(b.h); rz = -Math.sin(b.h);
    u = b.vx * fx + b.vz * fz; v = b.vx * rx + b.vz * rz;
    if (!b.air) {
      const v1 = v * (brk ? b.kGripB : b.kGrip);
      // carving: part of the energy of the lost sideways speed goes forward (never more than all of it)
      u = Math.sign(u || 1) * Math.sqrt(u * u + P.carve * (v * v - v1 * v1)); v = v1;
    }
    // ---- boost ----
    const want = !!(bst && racing && !b.finished && b.boostE > 0 && (b.boosting || b.boostE >= BOOST.minStart));
    if (want !== b.boosting) { b.boosting = want; this.events.push({ type: want ? 'boostOn' : 'boostOff', i: b.i }); }
    if (b.boosting) { b.boostE = Math.max(0, b.boostE - BOOST.burn * dt); b.boostS += dt; }
    b.boostLv += ((b.boosting ? 1 : 0) - b.boostLv) * K_BOOST;
    // ---- thrust and drag: top speed is where they balance ----
    const top = P.top * (1 + BOOST.speed * b.boostLv) * b.pace * (b.finished ? 0.5 : 1);
    const A = P.accel * (1 + BOOST.accel * b.boostLv), on = racing && !b.air && !brk ? 1 : 0;
    let du = A * (on - (u / top) * Math.abs(u / top)) - (brk && racing ? P.brake * Math.sign(u) * Math.min(1, Math.abs(u)) : 0);
    if (b.kick > 0) { du += BOOST.kickA; b.kick = Math.max(0, b.kick - dt); }
    if (b.drafting && !b.air) du += 0.5;
    const off = Math.abs(b.lat) > c.halfWidth;
    if (off) du -= 0.8 * u;
    // ---- the sea under the hull: six points (bow, middle, stern on each side) ----
    const L = P.length * 0.45, Bm = (P.supportBeam || P.beam) * 0.5;
    h6[0] = W.heightFast(wv, b.x + fx * L - rx * Bm, b.z + fz * L - rz * Bm, t, 3); h6[1] = W.heightFast(wv, b.x + fx * L + rx * Bm, b.z + fz * L + rz * Bm, t, 3);
    h6[2] = W.heightFast(wv, b.x - rx * Bm, b.z - rz * Bm, t, 3); h6[3] = W.heightFast(wv, b.x + rx * Bm, b.z + rz * Bm, t, 3);
    h6[4] = W.heightFast(wv, b.x - fx * L - rx * Bm, b.z - fz * L - rz * Bm, t, 3); h6[5] = W.heightFast(wv, b.x - fx * L + rx * Bm, b.z - fz * L + rz * Bm, t, 3);
    const hb = (h6[0] + h6[1]) / 2, hs = (h6[4] + h6[5]) / 2, hp = (h6[0] + h6[2] + h6[4]) / 3, hr = (h6[1] + h6[3] + h6[5]) / 3;
    // waves push along their slope (surfing)
    if (!b.air) { du -= W.G * ((hb - hs) / (2 * L)) * P.surf; v -= W.G * ((hr - hp) / (2 * Bm)) * P.surf * 0.3 * dt; }
    if (!racing) { u = 0; v = 0; du = 0; }
    u += du * dt;
    b.vx = fx * u + rx * v; b.vz = fz * u + rz * v;
    if (off) { pointInto(c, b.s, 0, this._o); const ph = this._o[2], dir = -Math.sign(b.lat); b.vx += -Math.cos(ph) * dir * 3 * dt; b.vz += -Math.sin(ph) * dir * 3 * dt; }
    b.x += b.vx * dt; b.z += b.vz * dt; b.u = u; b.v = v;
    // ---- progress along the course ----
    projectInto(c, b.x, b.z, b.s, this._o);
    const ds = wrapS(c, this._o[0] - b.s), prevProg = b.prog;
    b.s = this._o[0]; b.lat = this._o[1]; b.prog += ds;
    // ---- vertical: water or ramp under the hull, a one-sided buoyancy spring, free fall above ----
    const mean = (h6[0] + h6[1] + h6[2] + h6[3] + h6[4] + h6[5]) / 6;
    b.hull = Number.isNaN(b.hull) ? mean : b.hull + (mean - b.hull) * K_HULL;
    const support0 = b.hull + P.draft + P.lift * clamp(u / P.top, 0, 1);
    const ramp = this.rampAt(b.s, b.lat);
    let support = support0;
    if (ramp && !b.air) {
      const topY = W.heightFast(wv, b.x, b.z, t, 3) + P.draft + ramp.height * (this._rd / ramp.len);
      if (b.y <= topY + 0.3) { support = topY; b.y = topY; b.vy = Math.max(b.vy, u * (ramp.height / ramp.len)); b.onRamp = ramp; }
    } else if (b.onRamp && !ramp) { b.onRamp = null; b.air = true; b.airT = 0; b.rampAir = true; this.events.push({ type: 'launch', i: b.i, u }); }
    const g = W.G * P.gMul;
    if (b.air || b.y > support + AIR) {
      if (!b.onRamp) { b.air = true; b.vy -= g * dt; b.y += b.vy * dt; }
      if (b.air && b.y <= support && b.vy < 0) {   // touchdown
        const impact = -b.vy, airT = b.airT, fromRamp = b.rampAir;
        b.air = false; b.y = support; b.vy = 0; b.rampAir = false;
        // a clean landing: off a ramp, with the wheel near straight and the hull pointing where it travels
        const clean = fromRamp && airT > 0.35 && Math.abs(s) <= 0.45 && Math.abs(v) < 6;
        const keep = clean ? 1 : 1 - Math.min(0.3, P.slamLoss * impact * (fromRamp ? 1.6 : 1));
        b.vx *= keep; b.vz *= keep;
        if (clean) { b.boostE = Math.min(BOOST.max, b.boostE + BOOST.landing); b.kick = BOOST.kickS; if (!b.finished) b.clean++; } else if (fromRamp && !b.finished) b.rough++;
        if (airT > 0.15) this.events.push({ type: 'land', i: b.i, clean, ramp: fromRamp, impact, airT });
      }
    } else if (!b.onRamp) {
      const k = P.heaveK, cz = 2 * P.heaveZeta * Math.sqrt(k);
      b.vy += (k * (support - b.y) - cz * b.vy) * dt; b.y += b.vy * dt;
    }
    if (b.air) { b.airT += dt; if (racing) b.airS += dt; } else b.airT = 0;
    // ---- pitch and roll: springs to the water's slope, the planing trim and the bank into the turn ----
    const pT = b.air ? Math.atan2(b.vy, Math.max(1, u)) * 0.6 : Math.atan2(hb - hs, 2 * L) + P.trim * clamp(u / P.top, 0, 1);
    const rT2 = b.air ? b.roll * 0.98 : Math.atan2(hp - hr, 2 * Bm) + clamp(b.r * Math.max(0, u) * P.bankK / 20, -0.45, 0.45);
    b.pr += (P.pitchK * (pT - b.pitch) - 2 * 0.7 * Math.sqrt(P.pitchK) * b.pr) * dt; b.pitch += b.pr * dt;
    b.rr += (P.rollK * (rT2 - b.roll) - 2 * 0.7 * Math.sqrt(P.rollK) * b.rr) * dt; b.roll += b.rr * dt;
    // ---- gates, laps, statistics ----
    if (racing && !b.finished) {
      if (u > b.topU) b.topU = u;
      b.sumU += u; b.nU++;
      if (off) b.offS += dt;
      if (!this.free) this.scoreGates(b, prevProg, b.prog);
      const lapsDone = b.laps.length;
      if (!this.free && b.prog >= (lapsDone + 1) * c.len) {
        const frac = ds > 1e-9 ? ((lapsDone + 1) * c.len - prevProg) / ds : 0, tx = this.t + frac * dt - this.go;
        b.laps.push(tx - (lapsDone ? b.laps.reduce((a, x) => a + x, 0) : 0));
        this.events.push({ type: 'lap', i: b.i, lap: b.laps.length, t: tx });
        if (b.laps.length >= this.settings.laps) {
          b.finished = true; b.finishT = tx;
          this.events.push({ type: 'finish', i: b.i, t: tx });
          if (b.i === this.player || this.player < 0 && this.boats.every((q) => q.finished)) this.playerDone();
        }
      }
    }
  }
  stepSailingBoat(b, steer, input, racing) {
    if (!racing) return;
    const fX = -Math.sin(b.h), fZ = Math.cos(b.h), rX = -Math.cos(b.h), rZ = -Math.sin(b.h);
    const L = JUKUNG_SPEC.hullLength * 0.45, F = JUKUNG_SPEC.floatOffset;
    const at = (forward, right) => W.heightFast(this.waves,
      b.x + fX * forward + rX * right, b.z + fZ * forward + rZ * right, this.t, 3);
    const water = { bow: at(L, 0), centre: at(0, 0), stern: at(-L, 0), port: at(0, -F), starboard: at(0, F) };
    advanceSailing(b, { ...input, steer }, this.sailingOptions, DT, water);
    b.hull = water.centre;
    projectInto(this.c, b.x, b.z, b.s, this._o);
    b.prog += wrapS(this.c, this._o[0] - b.s); b.s = this._o[0]; b.lat = this._o[1];
    b.topU = Math.max(b.topU, b.u); b.sumU += b.u; b.nU++;
  }
  scoreGates(b, p0, p1) {
    const gs = this.c.gates;
    for (;;) {
      const g = gs[b.nextGate], gp = b.lapGate * this.c.len + g.s;
      if (!(p0 < gp && p1 >= gp)) break;
      const lat = b.lat, ok = lat >= g.lo && lat <= g.hi;
      if (ok) {
        const dIn = g.inner === 'hi' ? g.hi - lat : g.inner === 'lo' ? lat - g.lo : Math.min(g.hi - lat, lat - g.lo), perfect = dIn <= BOOST.perfectM;
        b.gatesOk++; b.chain++; if (b.chain > b.bestChain) b.bestChain = b.chain; if (perfect) b.perfects++;
        b.boostE = Math.min(BOOST.max, b.boostE + (perfect ? BOOST.perfect : BOOST.gate));
        this.events.push({ type: 'gate', i: b.i, gate: g.i, perfect, chain: b.chain });
      } else {
        b.gatesMiss++; b.chain = 0; b.boostE = Math.max(0, b.boostE - BOOST.missCost);
        b.vx *= BOOST.missSlow; b.vz *= BOOST.missSlow;   // a missed gate costs speed at once: clear to the player, no penalty maths later
        this.events.push({ type: 'miss', i: b.i, gate: g.i });
      }
      b.nextGate++; if (b.nextGate >= gs.length) { b.nextGate = 0; b.lapGate++; }
    }
  }
  // two-way contact: each hull is two circles (bow and stern); overlapping boats are pushed apart and trade the speed along the hit
  contacts() {
    const B = this.boats, n = B.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = B[i], b = B[j];
      if ((a.x - b.x) ** 2 + (a.z - b.z) ** 2 > 196) { this._contact[i * n + j] = 0; continue; }
      let hit = false, closing = 0;
      if (a.P.craft === 'jukung-racer' || b.P.craft === 'jukung-racer') ({ hit, closing } = resolveRacingJukungContact(a, b));
      else for (let ka = -1; ka <= 1; ka += 2) for (let kb = -1; kb <= 1; kb += 2) {
        const la = a.P.length * 0.27 * ka, lb = b.P.length * 0.27 * kb;
        const ax = a.x - Math.sin(a.h) * la, az = a.z + Math.cos(a.h) * la, bx = b.x - Math.sin(b.h) * lb, bz = b.z + Math.cos(b.h) * lb;
        const dx = ax - bx, dz = az - bz, d = Math.hypot(dx, dz), rr = a.P.beam * 0.55 + b.P.beam * 0.55;
        if (d >= rr || d < 1e-6) continue;
        hit = true;
        const nx = dx / d, nz = dz / d, push = (rr - d) / 2;
        a.x += nx * push; a.z += nz * push; b.x -= nx * push; b.z -= nz * push;
        const vn = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (-vn > closing) closing = -vn;
        if (vn < 0) { const jimp = -1.3 * vn / 2; a.vx += jimp * nx; a.vz += jimp * nz; b.vx -= jimp * nx; b.vz -= jimp * nz; }
        else if (vn < 0.6) { const part = (0.6 - vn) / 2; a.vx += part * nx; a.vz += part * nz; b.vx -= part * nx; b.vz -= part * nz; }   // hulls that rub drift apart
      }
      // one bump = one contact: touching again within half a second is the same bump
      if (hit && this.t - this._contactT[i * n + j] > 0.5) { a.contacts++; b.contacts++; this.events.push({ type: 'contact', i: a.i, j: b.i, v: closing }); }   // v: how fast the hulls closed (m/s): a rub or a crash
      if (hit) this._contactT[i * n + j] = this.t;
      this._contact[i * n + j] = hit ? 1 : 0;
    }
  }
  // drafting: close behind another boat, in its lane, the bar fills slowly and the hull gets a small pull
  drafts() {
    const B = this.boats;
    for (let i = 0; i < B.length; i++) {
      const b = B[i]; let on = false;
      if (!b.finished && b.u > 8) {
        const fx = -Math.sin(b.h), fz = Math.cos(b.h);
        for (let k = 0; k < B.length && !on; k++) {
          if (k === i) continue;
          const q = B[k], dx = q.x - b.x, dz = q.z - b.z, ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
          on = ahead > 5 && ahead < 20 && side < 2.8 && q.u > 8;
        }
      }
      b.draft = clamp(b.draft + (on ? DT / 0.6 : -DT / 0.3), 0, 1);
      const d = b.draft > 0.5;
      if (d !== b.drafting) { b.drafting = d; if (d) this.events.push({ type: 'draft', i: b.i }); }
      if (d) b.boostE = Math.min(BOOST.max, b.boostE + BOOST.draft * DT);
    }
  }
  // places: finished boats by finish time, then the others by progress; the computer's pace follows the player a little
  places() {
    const B = this.boats, o = this.order;
    for (let i = 1; i < o.length; i++) {   // insertion sort: the order changes rarely
      const x = o[i]; let j = i - 1;
      while (j >= 0 && this.ahead(B[x], B[o[j]])) { o[j + 1] = o[j]; j--; }
      o[j + 1] = x;
    }
    for (let i = 0; i < o.length; i++) B[o[i]].place = i + 1;
    const p = this.player >= 0 ? B[this.player] : null, band = this.settings.band || 0;
    for (const b of B) {
      if (!b.ai || !p) { b.pace = b.ai ? b.ai.skill : 1; continue; }
      // ahead of the player: a little slower; behind: a little faster; never beyond -5 % .. +4 %, and never above the player's top
      const gapS = (b.prog - p.prog) / Math.max(8, p.u);
      b.pace = b.ai.skill * clamp(1 - band * gapS, 0.95, 1.04);
      if (b.P.top * b.pace > p.P.top) b.pace = p.P.top / b.P.top;
    }
  }
  ahead(a, b) { if (a.finished !== b.finished) return a.finished; return a.finished ? a.finishT < b.finishT : a.prog > b.prog; }
  playerDone() {
    if (this.over) return;
    this.over = true; this.overAt = this.t;
    // boats still racing get an estimated finish time from the distance left and their speed so far
    for (const b of this.boats) if (!b.finished) {
      const left = this.settings.laps * this.c.len - b.prog, mean = b.nU ? b.sumU / b.nU : 10;
      b.estT = this.lapT + left / Math.max(6, mean);
    }
  }
  finish(why) { if (this.done) return; this.done = true; this.why = why; if (!this.over) this.playerDone(); }
  // the final table: finished boats first by time, then the others by their estimate
  standings() {
    const rows = this.boats.map((b) => ({ i: b.i, name: b.name, player: b.i === this.player, finished: b.finished, time: b.finished ? b.finishT : (b.estT ?? null), laps: b.laps.slice() }));
    rows.sort((x, y) => (x.finished === y.finished ? (x.time ?? 1e9) - (y.time ?? 1e9) : x.finished ? -1 : 1));
    rows.forEach((r, k) => { r.place = k + 1; });
    return rows;
  }
  summary(i = this.player >= 0 ? this.player : 0) {
    const b = this.boats[i], rd = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d, st = this.standings();
    return { sim: SIM_VERSION, why: this.why, course: this.c.key, laps: b.laps.map((x) => rd(x, 3)), time: b.finished ? rd(b.finishT, 3) : null, place: st.find((r) => r.i === i).place, boats: this.boats.length,
      gates: b.gatesOk + b.gatesMiss, passed: b.gatesOk, missed: b.gatesMiss, perfects: b.perfects, bestChain: b.bestChain, clean: b.clean, rough: b.rough, contacts: b.contacts,
      topKmh: rd(b.topU * 3.6, 1), meanKmh: rd((b.nU ? b.sumU / b.nU : 0) * 3.6, 1), boostS: rd(b.boostS), airS: rd(b.airS), offS: rd(b.offS), steps: this.step_,
      end: { x: rd(b.x, 4), z: rd(b.z, 4), h: rd(b.h, 5) } };
  }
}

// ---------- recording: per-step inputs, run-length encoded, base64 (copyable text) ----------
export function encodeInputs(steer, flags) {
  const bytes = [];
  for (let i = 0; i < steer.length;) {
    let k = 1; while (i + k < steer.length && k < 255 && steer[i + k] === steer[i] && flags[i + k] === flags[i]) k++;
    bytes.push(steer[i] + 100, flags[i] & 3, k); i += k;   // value 0..200, flags, count
  }
  const u8 = Uint8Array.from(bytes);
  let bin = ''; for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return typeof btoa === 'function' ? btoa(bin) : Buffer.from(u8).toString('base64');
}
export function decodeInputs(b64) {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const steer = [], flags = [];
  for (let i = 0; i + 2 < bin.length; i += 3) { const v = bin.charCodeAt(i) - 100, f = bin.charCodeAt(i + 1), k = bin.charCodeAt(i + 2); for (let j = 0; j < k; j++) { steer.push(v); flags.push(f); } }
  return { steer, flags };
}
// Re-run recorded inputs through a fresh Race with the same settings; returns the race.
export function replay(settings, course, steer, flags) {
  const r = new Race(settings, course);
  for (let i = 0; i < steer.length && !r.done; i++) { r.step(steer[i] / 100, flags[i] & 1, (flags[i] >> 1) & 1); r.events.length = 0; }
  return r;
}
// A race with every boat computer-steered, run to the end (for tests, balance checks and the title screen's demo).
export function autoRace(settings, course, maxS = 600) {
  const r = new Race({ ...settings, player: -1 }, course);
  const steps = Math.round(maxS / DT);
  for (let i = 0; i < steps && !r.done; i++) { r.step(0, 0, 0); r.events.length = 0; }
  return r;
}
