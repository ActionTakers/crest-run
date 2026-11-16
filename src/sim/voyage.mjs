// voyage.mjs: the rescue voyages in the bay (PLAN-MONKEYKING.md, steps B0 to B4). A voyage is a mission in three steps of the
// 3x3x3 method: Kies (three choices before leaving: place, time, agreement), Doe (the rescue, here) and Veranker (the telling
// on the beach: the page asks, this module only measures). Its three stars are three harmonies: thanks given, people home,
// the sea left well. Nothing is fought and nothing is killed: the opponents are current, wind, lost nets and haste.
// MK-1 "Glass Morning" (depth: Zien). In the four steps a level teaches by (research A6-01): two guests snorkel over the Coral
// Garden, where the boat must come in slowly (the safe first try); two more have drifted with the current toward the corner
// (harder: they move); then the twist: a turtle hangs in a lost net that drifts out to sea, to be cut free and the net taken
// aboard; and the conclusion: everyone home to the beach. A guest comes aboard only when the boat lies close and slow.
// Pure (no DOM, no three.js), fixed step, seeded; it runs on a Race in free mode like sim/rescue.mjs. Every number is tuned
// with the stand-in driver below, never by a person. Tests: tests/voyage.test.mjs.
// World and headings as in race-sim.mjs: forward f = (-sin h, cos h); +z is out to sea, the land lies at low z.
// Written 2026-11-16 by the yacht project session.
import { DT } from './race-sim.mjs?v=e1a47756';
import { buildCourse, wrapA } from './courses.mjs?v=e1a47756';
import { boatTweak } from './boat-stats.mjs?v=e1a47756';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// The bay: a ring course round its middle wide enough to hold all of it; the land is everything below the shore line. The four
// places are the client's own (his site: intake/monkeyking-2026-11-16), laid out by this session, not surveyed.
export const BAY = { key: 'lipah', name: 'The Bay', R: 200, halfWidth: 190, sea: { count: 5, seed: 71, amp: 0.3 }, startA: -Math.PI / 2,
  shoreZ: -232, beach: { x: 0, w: 130, deep: 30 }, start: { x: 0, z: -208, h: 0 },
  places: { garden: { x: -70, z: -150, r: 42, name: 'Coral Garden' }, turtle: { x: 185, z: -60, r: 34, name: 'Turtle Point' },
    temple: { x: 235, z: 70, r: 30, name: 'The Statues' }, wreck: { x: -215, z: 170, r: 36, name: 'The Wreck' } } };
// What a rescue is made of. Speeds in m/s, distances in m, times in s.
export const RULES = { seats: 6, grabR: 7.5, grabV: 5, grabS: 1.0, scareR: 9, scareV: 13, scareGapS: 3, reefV: 9, landV: 6, checkS: 10, capS: 300, edge: 384,
  net: { driftV: 1.3, freeR: 8.5, freeV: 4.5, freeS: 3, takeS: 2, afterS: 40, afterN: 2 },
  levels: { easy: { drift: 0.8 }, normal: { drift: 1.1 }, hard: { drift: 1.45 } } };
// The voyages. choices: what the Kies step offers (the first option of each is the default).
export const VOYAGES = {
  mk1: { key: 'mk1', name: 'Glass Morning', depth: 'Zien', world: 'dawn', trip: 'the snorkel voyage',
    choices: { first: ['garden', 'corner'], check: [true, false], call: ['people', 'sea'] },
    // the words of the page: the story before leaving, the three choices (place, time, agreement), the nine leaves in the order
    // Denken, Doen, Delen by Zelf, Samen, Systeem, and the three questions asked on the beach (their answers are views, not marks)
    story: 'First light, and the sea is glass. Two guests are over the Coral Garden. Two more have drifted toward the corner.',
    rows: [
      { key: 'first', label: 'PLACE', opts: [['garden', 'The garden first', 'the two close by'], ['corner', 'The corner first', 'the two who drift']] },
      { key: 'check', label: 'TIME', opts: [[true, 'After the boat check', 'vests, line, radio and a moment of thanks: 10 s'], [false, 'At once', 'no check: every second counts']] },
      { key: 'call', label: 'AGREED', opts: [['people', 'The lookout calls people first', 'swimmers before all else'], ['sea', 'The lookout calls the sea first', 'nets and currents before swimmers']] },
    ],
    leaves: ['A ready boat sees more: I checked her before I left.', 'People drift where the water goes: I found them early.', 'Birds and ripples show what the sea carries: I found the net.',
      'Slow water shows what fast water hides: I came in gently.', 'Everyone I could see, I brought home.', 'What is cut loose must come aboard: I took the net.',
      'What I saw first.', 'What my guest saw of me.', 'What the turtle saw of us.'],
    ask: [
      { ring: 'ZELF', q: 'What did you look at most?', a: ['The lookout\'s arm', 'The water ahead', 'The clock'] },
      { ring: 'SAMEN', q: 'What did a guest in the water see of you?', a: ['A boat that came gently', 'A boat that came fast', 'Nothing, until I was there'] },
      { ring: 'SYSTEEM', q: 'And the turtle?', a: ['A knife and a friend', 'A net that stayed', 'Nobody came'] },
    ],
    // the result screen: its line, its table, its small print and its tip
    look: { person: 'A guest in the water', net: 'The net and its turtle', beach: 'Bring them home' }, unit: 'Guests home', first: 'THE LOOKOUT POINTS THE WAY. COME IN SLOWLY: HOLD THE BRAKE',
    endLine: (sm) => (sm.saved === sm.total ? 'Everyone is home' : `${sm.saved} of ${sm.total} came home`),
    stats: (sm) => [`swimmers scared ${sm.scares}`, `fast over the reef ${sm.reefFast} s`],
    tip: (sm) => (!sm.stars.sea ? (sm.netAboard ? 'Tip: the reef is ten steps off the boat. Brake before the garden.' : 'Tip: lie still beside the net until it is aboard.') : !sm.stars.people ? 'Tip: a guest comes aboard when the boat lies close and slow.' : !sm.stars.thanks ? 'Tip: the morning\'s boat check is a choice before you leave.' : ''),
    // what the run itself says to each question (sm: its summary): what happened, and what to do next time
    tell: (sm) => [
      sm.reefFast < 1 && sm.scares === 0 ? 'You came in gently every time.' : `You were fast over the reef for ${sm.reefFast} s and scared ${sm.scares} swimmer${sm.scares === 1 ? '' : 's'}. Next time: brake before you are there.`,
      `${sm.saved} of ${sm.total} guests came home.` + (sm.leaves[1] ? ' You found the drifters early.' : ' The drifters were far out: go to them first, or leave sooner.'),
      sm.netAboard ? 'The turtle is free and the net is out of the sea.' : sm.freed ? 'The turtle is free, but the net is still out there. Next time: stay until it is aboard.' : 'The net drifted out with the turtle in it. Next time: follow the birds as soon as the lookout calls.',
    ] },
};
// the voyages in their order; MK-2 and MK-3 put their own entry into VOYAGES (sim/voyage2.mjs, voyage3.mjs; sim/voyages.mjs loads all)
export const VOYAGE_KEYS = ['mk1', 'mk2', 'mk3'];
// a person in the water
export const P = { water: 0, hold: 1, aboard: 2, home: 3, lost: 4 };

let built = null;
export function bayCourse() {
  if (built) return built;
  const control = [];
  for (let k = 0; k < 16; k++) { const a = BAY.startA + (k * 2 * Math.PI) / 16; control.push([Math.cos(a) * BAY.R, Math.sin(a) * BAY.R]); }
  built = buildCourse({ key: BAY.key, name: BAY.name, world: 'dawn', sea: BAY.sea, laps: 1, control, halfWidth: BAY.halfWidth, cornerGates: false,
    extraGates: [{ s: 60, lat: 0, width: 2 * BAY.halfWidth }], ramps: [], arena: true, bay: true, scenery: { islands: 4, liner: 0, cargo: 0, tug: 0, sails: 3, towers: 0 } });
  return built;
}
// a voyage is sailed in the jukung: its handling goes with it (sim/boat-stats.mjs)
export function voyageSettings(course, { tune = 'cruise', boat = 'jukung' } = {}) {
  return { laps: 1, sea: { ...BAY.sea }, boats: [{ name: 'You', tune, ai: null, tweak: boatTweak(tune, boat) }], player: 0, band: 0, grid: 'back', free: true };
}
export const voyageMedal = (stars, finished) => (!finished ? null : stars >= 3 ? 'gold' : stars === 2 ? 'silver' : stars === 1 ? 'bronze' : null);
// the choices of a voyage made whole: anything missing or unknown becomes that choice's first option
export function voyageChoices(key, given = {}) { const V = VOYAGES[key] || VOYAGES.mk1, out = {}; for (const [k, opts] of Object.entries(V.choices)) out[k] = opts.includes(given[k]) ? given[k] : opts[0]; return out; }

export class Voyage {
  constructor(race, { level = 'mk1', difficulty = 'normal', seed = 3, choices = {} } = {}) {
    this.kind = 'voyage'; this.race = race; this.def = VOYAGES[level] || VOYAGES.mk1; this.key = this.def.key;
    this.difficulty = RULES.levels[difficulty] ? difficulty : 'normal'; this.level = RULES.levels[this.difficulty];
    this.choices = voyageChoices(this.key, choices); this.rnd = mulberry(seed);
    const b = this.me = race.boats[race.player >= 0 ? race.player : 0], S = BAY.start;
    b.x = b.px = S.x; b.z = b.pz = S.z; b.h = b.ph = S.h; b.vx = 0; b.vz = 0; b.u = 0; b.r = 0;                    // on the beach, bow to the sea
    this.people = []; this.total = 0; this.aboard = 0; this.home = 0; this.lost = 0; this.capS = RULES.capS;
    this.scares = 0; this.reefFast = 0; this.reefT = -1e9; this.fullT = -1e9; this.agroundT = -1e9; this.landings = 0;
    this.over = false; this.endT = null; this.look = null;
    this.setup();
  }
  // what this voyage is made of. Here: MK-1. Another voyage replaces setup, stepLevel, done, target, summary, hud and pilot.
  setup() {
    const G = BAY.places.garden, T = BAY.places.turtle, dx = T.x - G.x, dz = T.z - G.z, dl = Math.hypot(dx, dz);
    this.drift = { x: dx / dl, z: dz / dl, v: RULES.net.driftV * 0.85 * this.level.drift };                      // the current: from the garden toward the corner
    const head = this.choices.check ? RULES.checkS : 0;                                                          // the boat check takes time: the drifters are that much further
    this.people = [
      { i: 0, group: 'garden', st: P.water, x: G.x - 9, z: G.z + 6, t: 0, scareT: -1e9, moved: 0 },
      { i: 1, group: 'garden', st: P.water, x: G.x + 11, z: G.z - 8, t: 0, scareT: -1e9, moved: 0 },
      { i: 2, group: 'corner', st: P.water, x: G.x + this.drift.x * (70 + head * this.drift.v), z: G.z + this.drift.z * (70 + head * this.drift.v), t: 0, scareT: -1e9, moved: 0 },
      { i: 3, group: 'corner', st: P.water, x: G.x + this.drift.x * (96 + head * this.drift.v) + 7, z: G.z + this.drift.z * (96 + head * this.drift.v) - 5, t: 0, scareT: -1e9, moved: 0 },
    ];
    this.total = this.people.length;
    this.net = { on: false, gone: false, freed: false, aboard: false, x: T.x + 8, z: T.z + 14, dx: 0.66, dz: 0.75, t: 0, held: false };
  }
  ev(e) { this.race.events.push(e); }
  get inWater() { let n = 0; for (const p of this.people) if (p.st === P.water || p.st === P.hold) n++; return n; }
  get netOpen() { return this.net.on && !this.net.gone && !this.net.aboard; }

  // One step, right after race.step(): the boat has moved.
  step() {
    const race = this.race, b = this.me, T = race.lapT, u = Math.hypot(b.vx, b.vz);
    this.keepOut(b);
    if (!race.racing || this.over) { this.look = this.over ? null : this.target(); return; }
    this.stepLevel(b, u, T);
    // home: on the beach, slow
    if (this.aboard > 0 && this.atBeach(b) && u < RULES.landV && this.canLand(b)) {
      let n = 0; for (const p of this.people) if (p.st === P.aboard) { p.st = P.home; n++; }
      this.aboard = 0; this.home += n; this.landings++; this.ev({ type: 'vHome', n, home: this.home, total: this.total });
    }
    this.atHome(b, u, T);
    this.look = this.target();
    if (this.done(T) || T > this.capS) {
      for (const p of this.people) if (p.st !== P.home && p.st !== P.lost) { p.st = P.lost; this.lost++; }          // time ran out with people still out
      this.aboard = 0; this.over = true; this.endT = T; this.look = null;
      const sm = this.summary(); this.ev({ type: 'vEnd', stars: sm.nStars, home: this.home, total: this.total, medal: sm.medal });
      race.playerDone();
    }
  }
  // MK-1's own step: the guests, the net, and the reef under the garden (fast water over it harms it)
  stepLevel(b, u, T) {
    this.stepPeople(b, u, T); this.stepNet(b, u, T);
    const G = BAY.places.garden;
    if (Math.hypot(b.x - G.x, b.z - G.z) < G.r && u > RULES.reefV) { this.reefFast += DT; if (T - this.reefT > 2.5) { this.reefT = T; this.ev({ type: 'vReef' }); } }
  }
  canLand() { return true; }
  atHome() {}                                                                // a voyage's own business on the beach
  done() { return this.inWater + this.aboard + (this.netOpen ? 1 : 0) === 0 && this.net.on; }
  // the two lines of the display that are the voyage's own: what is aboard, and a warning (b: the boat, u: its speed, look: what the lookout points at)
  hud(b, u) {
    const K = this.look, G = BAY.places.garden, d = K ? Math.hypot(K.x - b.x, K.z - b.z) : 1e9, reef = Math.hypot(b.x - G.x, b.z - G.z) < G.r + 10 && u > RULES.reefV - 1;
    return { gap: `aboard ${this.aboard} of ${RULES.seats}`, warn: reef ? 'The reef: brake' : K && K.kind !== 'beach' && d < 34 && u > RULES.grabV ? 'Come in slowly: brake'
      : K && K.kind === 'net' && d < RULES.net.freeR ? (this.net.freed ? 'Hold still: the net comes aboard' : 'Hold still: cutting it free') : K && K.kind === 'beach' && b.z < BAY.shoreZ + 70 && u > RULES.landV ? 'Slow down for the beach' : '' };
  }
  atBeach(b) { return Math.abs(b.x - BAY.beach.x) < BAY.beach.w / 2 && b.z < BAY.shoreZ + BAY.beach.deep; }
  // the land is solid: the boat is held at the water's edge and its bow swings back to the sea
  keepOut(b) {
    const lim = BAY.shoreZ + 3; if (b.z >= lim) return;
    const v = -b.vz; b.z = lim; if (b.vz < 0) b.vz = 0;
    const fz = Math.cos(b.h); if (fz < 0.3) b.h = wrapA(b.h + clamp(wrapA(0 - b.h), -2.2 * DT, 2.2 * DT));
    if (v > 2.5 && this.race.t - this.agroundT > 0.8) { this.agroundT = this.race.t; this.ev({ type: 'aground', v }); }
  }
  stepPeople(b, u, T) {
    const R = RULES, D = this.drift;
    for (const p of this.people) {
      if (p.st !== P.water && p.st !== P.hold) continue;
      const d = Math.hypot(p.x - b.x, p.z - b.z), near = d < R.grabR && u < R.grabV;
      if (near && this.aboard >= R.seats) { if (T - this.fullT > 3) { this.fullT = T; this.ev({ type: 'vFull', seats: R.seats }); } p.st = P.water; p.t = 0; }
      else if (near) { p.st = P.hold; p.t += DT; if (p.t >= R.grabS) { p.st = P.aboard; this.aboard++; p.at = T; this.ev({ type: 'vAboard', i: p.i, aboard: this.aboard, group: p.group }); } }
      else { p.st = P.water; p.t = Math.max(0, p.t - DT * 0.5); }
      if (p.st === P.water && p.group === 'corner') {                           // the current carries them
        p.x += D.x * D.v * DT; p.z += D.z * D.v * DT; p.moved += D.v * DT;
        if (Math.hypot(p.x, p.z) > R.edge) { p.st = P.lost; this.lost++; this.ev({ type: 'vLost', i: p.i }); }
      }
      if (p.st === P.water && d < R.scareR && u > R.scareV && T - p.scareT > R.scareGapS) { p.scareT = T; this.scares++; this.ev({ type: 'vScare', i: p.i, u }); }
    }
  }
  // the twist: a turtle in a lost net, drifting out. Lie alongside, slow: it is cut free, then the net comes aboard.
  stepNet(b, u, T) {
    const N = this.net, R = RULES.net;
    if (!N.on) { let got = 0; for (const p of this.people) if (p.st >= P.aboard) got++; if (got >= R.afterN || T > R.afterS) { N.on = true; this.ev({ type: 'vTwist', x: N.x, z: N.z }); } return; }
    if (N.gone || N.aboard) return;
    const d = Math.hypot(N.x - b.x, N.z - b.z); N.held = d < R.freeR && u < R.freeV;
    if (N.held) {
      N.t += DT;
      if (!N.freed && N.t >= R.freeS) { N.freed = true; this.ev({ type: 'vFreed', x: N.x, z: N.z }); }
      if (N.freed && N.t >= R.freeS + R.takeS) { N.aboard = true; this.ev({ type: 'vNet' }); }
    } else {
      N.t = N.freed ? R.freeS : Math.max(0, N.t - DT * 0.5);
      N.x += N.dx * R.driftV * this.level.drift * DT; N.z += N.dz * R.driftV * this.level.drift * DT;
      if (Math.hypot(N.x, N.z) > RULES.edge) { N.gone = true; this.ev({ type: 'vNetGone', freed: N.freed }); }
    }
  }
  // what the lookout points at now: { x, z, kind: 'person' | 'net' | 'beach', slow } or null
  target() {
    const b = this.me, C = this.choices; let best = null, bd = 1e9;
    const groups = C.first === 'corner' ? ['corner', 'garden'] : ['garden', 'corner'];
    const person = () => { for (const g of groups) { best = null; bd = 1e9; for (const p of this.people) if ((p.st === P.water || p.st === P.hold) && p.group === g) { const d = Math.hypot(p.x - b.x, p.z - b.z); if (d < bd) { bd = d; best = p; } } if (best) return { x: best.x, z: best.z, kind: 'person', i: best.i }; } return null; };
    const net = () => (this.netOpen ? { x: this.net.x, z: this.net.z, kind: 'net' } : null);
    const room = this.aboard < RULES.seats;
    const t = room ? (C.call === 'sea' ? net() || person() : person() || net()) : null;
    if (t) return t;
    return this.aboard > 0 ? { x: BAY.beach.x, z: BAY.shoreZ + 12, kind: 'beach' } : null;
  }
  // the three harmonies, the six leaves the run itself can earn (the other three are answered on the beach), and what the
  // telling on the beach is made from
  summary() {
    const rd = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d, N = this.net, C = this.choices;
    const G = BAY.places.garden, T = BAY.places.turtle, reach = Math.hypot(T.x - G.x, T.z - G.z) + 25;
    const drifters = this.people.filter((p) => p.group === 'corner'), early = drifters.every((p) => p.st >= P.aboard && p.st !== P.lost && 70 + p.moved < reach);
    const stars = { thanks: !!C.check, people: this.over && this.home === this.total, sea: N.freed && N.aboard && this.reefFast < 2 };
    const leaves = [!!C.check, early, N.freed, this.reefFast < 1 && this.scares === 0 && this.over, this.over && this.home === this.total, N.aboard];
    const nStars = (stars.thanks ? 1 : 0) + (stars.people ? 1 : 0) + (stars.sea ? 1 : 0);
    return { level: this.key, difficulty: this.difficulty, choices: { ...C }, finished: this.over, time: this.endT === null ? null : rd(this.endT, 2),
      total: this.total, saved: this.home, lost: this.lost, stars, nStars, medal: voyageMedal(nStars, this.over && this.home > 0), leaves,
      scares: this.scares, reefFast: rd(this.reefFast), freed: N.freed, netAboard: N.aboard, netGone: N.gone, landings: this.landings };
  }
  // A stand-in driver for tests and the film. skill 1: comes in slowly and lies still where it must; skill 0: never slows.
  pilot(out, skill = 1) {
    const b = this.me, t = this.target(), u = Math.hypot(b.vx, b.vz);
    out.steer = 0; out.brake = 0; out.boost = 0;
    if (!t) return out;
    const d = Math.hypot(t.x - b.x, t.z - b.z), rel = wrapA(Math.atan2(-(t.x - b.x), t.z - b.z) - b.h);
    out.steer = Math.round(clamp(rel * 2.6, -1, 1) * 100) / 100 || 0;
    if (skill <= 0) return out;
    const G = BAY.places.garden, overReef = Math.hypot(b.x - G.x, b.z - G.z) < G.r + 14;
    const stopD = (u * u) / 14 + 5;                                           // room to slow down in
    if (t.kind === 'beach') { if (b.z < BAY.shoreZ + BAY.beach.deep + stopD && u > RULES.landV - 1.5) out.brake = 1; }
    else if (d < stopD + (t.kind === 'net' ? 3 : 2) && u > 2.2) out.brake = 1;
    else if (d < RULES.grabR - 1.5) out.brake = 1;                             // lie still alongside
    if (overReef && u > RULES.reefV - 1.2) out.brake = 1;
    if (Math.abs(rel) > 1.2 && u > 8) out.brake = 1;                           // a tight turn back: slow first
    return out;
  }
}
