// voyage3.mjs: MK-3 "Under Agung" (depth: Zijn), the sun voyage that becomes a night search (PLAN-MONKEYKING.md, step B4).
// The frame is sim/voyage.mjs. The sunset trip is about to leave, four guests aboard, when a boat is reported overdue beyond
// the statues: nine people on it, its engine dead, one lamp. In the four steps a level teaches by (research A6-01): the way out
// in the last light (the safe first try of steering gently); night falls and the sea answers rough hands with a rising storm
// gauge and calm hands with a falling one (harder); the twist: nine people and six seats: the boat carries six, never more, so
// it is two trips or two boats; and the conclusion: everyone home, the lookout at the helm for the last stretch.
// The gauge has two sides and nothing is beaten: balance is kept or lost (research A5-17). A broach hurts nobody: it costs
// way, time and the third harmony. Pure, fixed step, seeded. Every number is tuned with the stand-in driver, never by a person.
// Written 2026-11-16 by the yacht project session.
import { DT } from './race-sim.mjs?v=ecb8b720';
import { wrapA } from './courses.mjs?v=ecb8b720';
import { BAY, RULES, VOYAGES, Voyage, P, voyageMedal } from './voyage.mjs?v=ecb8b720';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const NIGHT = { boat: { x: 240, z: 150 },                // where the overdue boat lies
  nightAt: 24, ashoreS: 12, capS: 290, pace: 0.5,                // night falls at this second; landing the guests first costs so many; the boat eases off in the dark
  load: { r: 12, v: 5, every: 0.55, jackR: 36 },                  // people step over when the boat lies this close and slow, one at a time
  storm: { start: 0.18, base: 0.012, rough: 0.24, roughFrom: 0.45, calm: 0.04, calmTo: 0.3, lamp: 0.22, lampR: 30, lampGapS: 8, fire: 2, fireR: 170, after: 0.5 },
  broach: { keep: 0.15, turn: 1.1 }, jack: { gap: 15, followV: 22, k: 3, seats: 6 }, findR: 150, helmR: 150,
  levels: { easy: { storm: 0.75 }, normal: { storm: 1 }, hard: { storm: 1.35 } } };
// where the three lamps of the chain stand: on the line from the beach to the overdue boat
export const CHAIN = [0.27, 0.5, 0.73].map((f) => ({ x: BAY.beach.x + (NIGHT.boat.x - BAY.beach.x) * f, z: (BAY.shoreZ + 14) + (NIGHT.boat.z - (BAY.shoreZ + 14)) * f }));
// a person of this voyage: on the overdue boat (wait), in the jukung (aboard), in Jack's boat (jack), on the sand (home)
export const Q = { wait: 5, jack: 6 };

VOYAGES.mk3 = { key: 'mk3', name: 'Under Agung', depth: 'Zijn', world: 'agung', trip: 'the sun voyage',
  choices: { guests: ['ashore', 'along'], jack: ['comes', 'fire'], fleet: ['chain', 'alone'] },
  recall: { from: 'Before the Wind', q: 'How do you take a gust?', a: ['On the beam, and fast', 'On the bow or the stern', 'With the engine off'], right: 1, said: 'Bow or stern, and early. Tonight the same calm hands keep the sea down.' },
  story: 'The sunset trip is about to leave when a boat is reported overdue beyond the statues: nine people, a dead engine, one lamp. The boat carries six, never more.',
  rows: [
    { key: 'guests', label: 'MY GUESTS', opts: [['ashore', 'Land them first', 'safe is more important than scheduled: 12 s'], ['along', 'Take them along', 'at once, with four of six seats taken']] },
    { key: 'jack', label: 'JACK', opts: [['comes', 'Jack comes with his boat', 'six more seats beside you'], ['fire', 'Jack keeps a fire on the beach', 'a light to steer for; the sea is calmer near it']] },
    { key: 'fleet', label: 'THE FLEET', opts: [['chain', 'A chain of lamps', 'three boats hold the line; each lamp passed calms the sea'], ['alone', 'Nobody else goes out', 'no more boats in the dark']] },
  ],
  leaves: ['Safe before scheduled: I landed my guests first.', 'Six seats: I knew who came and who waited.', 'A night search is the fleet\'s: I asked for the lamps.',
    'Calm hands, calm sea: I never broached.', 'Nine people, six seats: all of them came home.', 'I came home along the lamps of the others.',
    'What I would tell myself.', 'What the people I carried saw.', 'What the next crew should know.'],
  ask: [
    { ring: 'ZELF', q: 'What would you tell yourself at the start?', a: ['Land the guests first', 'Keep your hands quiet', 'Count the seats'] },
    { ring: 'SAMEN', q: 'What did the people you carried see?', a: ['Six seats and a calm hand', 'A boat too full to feel safe', 'Two boats working as one'] },
    { ring: 'SYSTEEM', q: 'What should the next crew know?', a: ['Follow the lamps', 'The fleet goes together', 'The sea gives calm for calm'] },
  ],
  look: { lamp: 'The lamp of the overdue boat', beach: 'Bring them home', wait: 'Hold still: they step over' }, unit: 'People home',
  first: 'STEER GENTLY: THE SEA ANSWERS CALM WITH CALM',
  endLine: (sm) => (sm.saved === sm.total ? 'Everyone is home' : `${sm.saved} of ${sm.total} came home before the night was over`),
  stats: (sm) => [`trips ${sm.landings}`, `broached ${sm.broaches} times`, `the storm at most ${Math.round(sm.stormPeak * 100)} %`],
  tip: (sm) => (!sm.stars.people ? 'Tip: six seats. Land your guests first, and let Jack bring his boat.' : !sm.stars.sea ? 'Tip: small, slow moves of the wheel bring the storm gauge down.' : !sm.stars.thanks ? 'Tip: landing your guests first is a choice before you sail.' : ''),
  tell: (sm) => [
    sm.choices.guests === 'ashore' ? `You landed your guests first and still made it in ${sm.landings} landing${sm.landings === 1 ? '' : 's'}.` : 'You took your guests into the night: four of six seats were gone before you found anyone.',
    sm.broaches === 0 ? `Nobody you carried felt the boat go over. The storm reached ${Math.round(sm.stormPeak * 100)} % at most.` : `The boat broached ${sm.broaches} time${sm.broaches === 1 ? '' : 's'} with people in her. Next time: smaller moves of the wheel, sooner.`,
    `${sm.saved} of ${sm.total} came home; the boat never carried more than six.` + (sm.choices.fleet === 'chain' ? ` You passed ${sm.lampsHome} of 3 lamps on the way in.` : ' You went alone: the fleet\'s lamps were not asked for.'),
  ] };

export class NightVoyage extends Voyage {
  setup() {
    const N = NIGHT, C = this.choices; this.lv = N.levels[this.difficulty] || N.levels.normal;
    this.net = { on: false, gone: false, freed: false, aboard: false, x: 0, z: 0, dx: 0, dz: 1, t: 0, held: false };      // no net in this voyage
    const ashore = C.guests === 'ashore';
    this.people = []; for (let i = 0; i < 4; i++) this.people.push({ i, group: 'guest', st: ashore ? P.home : P.aboard, x: 0, z: 0, t: 0 });
    for (let i = 0; i < 9; i++) this.people.push({ i: 4 + i, group: 'overdue', st: Q.wait, x: N.boat.x, z: N.boat.z, t: 0 });
    this.total = this.people.length; this.aboard = ashore ? 0 : 4; this.home = ashore ? 4 : 0; this.t0 = ashore ? N.ashoreS : 0;      // landing them first has cost time
    this.O = { x: N.boat.x, z: N.boat.z, h: 0.8, found: false };
    this.jack = C.jack === 'comes' ? { x: BAY.start.x + 14, z: BAY.start.z - 2, h: 0, load: 0, on: true } : null;
    this.fire = C.jack === 'fire'; this.lamps = C.fleet === 'chain' ? CHAIN.map((p, i) => ({ i, x: p.x, z: p.z, t: -1e9, home: false })) : [];
    this.night = false; this.storm = N.storm.start; this.stormPeak = this.storm; this.broaches = 0; this.fulls = 0; this.loadT = 0; this.handover = false; this.capS = N.capS; this.maxAboard = this.aboard;
  }
  get waiting() { let n = 0; for (const p of this.people) if (p.st === Q.wait) n++; return n; }
  stepLevel(b, u, T) {
    const N = NIGHT, S = N.storm, Tn = T + this.t0;
    if (!this.night && Tn >= N.nightAt) { this.night = true; this.ev({ type: 'vNight' }); }
    b.pace = this.night ? N.pace : 1; if (!this.away && Math.hypot(b.x - BAY.beach.x, b.z - BAY.shoreZ) > 110) this.away = true;
    // the gauge: rough hands and the passing night raise it, calm hands bring it down; near the fire it falls faster
    const st = Math.abs(b.steer || 0), nearFire = this.fire && Math.hypot(b.x - BAY.beach.x, b.z - (BAY.shoreZ + 10)) < S.fireR;
    let ds = (this.night ? S.base : S.base * 0.3) * this.lv.storm + S.rough * Math.max(0, st - S.roughFrom) * this.lv.storm;
    if (st < S.calmTo && u > 2) ds -= S.calm * (nearFire ? S.fire : 1);
    this.storm = clamp(this.storm + ds * DT, 0, 1);
    for (const L of this.lamps) if (Math.hypot(L.x - b.x, L.z - b.z) < S.lampR && T - L.t > S.lampGapS) { L.t = T; this.storm = Math.max(0, this.storm - S.lamp); if (this.aboard > 0 || (this.jack && this.jack.load > 0)) L.home = true; this.ev({ type: 'vLamp', i: L.i }); }
    if (this.storm > this.stormPeak) this.stormPeak = this.storm;
    if (this.storm >= 1) {                                                    // balance lost: the boat broaches
      this.broaches++; this.storm = S.after; b.vx *= N.broach.keep; b.vz *= N.broach.keep; b.h = wrapA(b.h + (this.rnd() < 0.5 ? -1 : 1) * N.broach.turn); b.r = 0;
      this.ev({ type: 'vBroach', n: this.broaches, aboard: this.aboard });
    }
    // the overdue boat: found when the boat is near; its people step over while the boat lies close and slow, one at a time, never a seventh
    const O = this.O, d = Math.hypot(O.x - b.x, O.z - b.z);
    if (!O.found && d < N.findR) { O.found = true; this.ev({ type: 'vFound' }); }
    const J = this.jack;
    if (d < N.load.r && u < N.load.v && this.waiting > 0) {
      this.loadT += DT;
      if (this.loadT >= N.load.every) {
        this.loadT = 0; const p = this.people.find((q) => q.st === Q.wait);
        if (this.aboard < RULES.seats) { p.st = P.aboard; this.aboard++; if (this.aboard > this.maxAboard) this.maxAboard = this.aboard; this.ev({ type: 'vAboard', i: p.i, aboard: this.aboard, group: p.group }); }
        else if (J && J.load < N.jack.seats && Math.hypot(J.x - O.x, J.z - O.z) < N.load.jackR) { p.st = Q.jack; J.load++; this.ev({ type: 'vJackLoad', n: J.load }); }
        else if (T - this.fullT > 4) { this.fullT = T; this.fulls++; this.ev({ type: 'vFull', seats: RULES.seats }); }
      }
    } else this.loadT = 0;
    if (J) { const dx = b.x + Math.sin(b.h) * 4 + Math.cos(b.h) * 9 - J.x, dz = b.z - Math.cos(b.h) * 4 + Math.sin(b.h) * 9 - J.z, dd = Math.hypot(dx, dz) || 1e-6, v = clamp((dd - 3) * N.jack.k, 0, N.jack.followV);   // off the boat's quarter
      J.x += (dx / dd) * v * DT; J.z += (dz / dd) * v * DT; if (J.z < BAY.shoreZ + 8) J.z = BAY.shoreZ + 8; if (v > 0.3) J.h = wrapA(J.h + clamp(wrapA(Math.atan2(-dx, dz) - J.h), -2.5 * DT, 2.5 * DT)); }
    // the last stretch: nobody is left out there and the beach is near: the lookout takes the helm
    if (!this.handover && this.waiting === 0 && (this.aboard > 0 || (J && J.load > 0)) && Math.hypot(b.x - BAY.beach.x, b.z - BAY.shoreZ) < N.helmR) { this.handover = true; this.ev({ type: 'vHelm' }); }
  }
  // on the beach, slowly: who came in Jack's boat is home too
  atHome(b, u, T) {
    const J = this.jack; if (!J || J.load === 0 || !this.atBeach(b) || u >= RULES.landV || Math.hypot(J.x - b.x, J.z - b.z) > 110) return;
    let n = 0; for (const p of this.people) if (p.st === Q.jack) { p.st = P.home; n++; }
    J.load = 0; this.home += n; this.ev({ type: 'vHome', n, home: this.home, total: this.total });
  }
  canLand() { return !!this.away; }                                          // guests taken along stay aboard until the boat has been out
  done() { return this.home === this.total; }
  get inWater() { return 0; }
  // where the boat should go next (the stand-in driver's own knowledge)
  goal() {
    const J = this.jack, room = this.aboard < RULES.seats || (J && J.load < NIGHT.jack.seats && this.aboard >= RULES.seats);
    if (this.waiting > 0 && room && !(this.aboard >= RULES.seats && !J)) return { x: this.O.x, z: this.O.z, kind: 'lamp' };
    if (this.aboard > 0 || (J && J.load > 0)) return { x: BAY.beach.x, z: BAY.shoreZ + 12, kind: 'beach' };
    return this.waiting > 0 ? { x: this.O.x, z: this.O.z, kind: 'lamp' } : null;
  }
  // what the lookout points at: in this voyage he does not point at what is not found yet: he asks where to look
  target() { const g = this.goal(); if (!g) return null; if (g.kind === 'lamp' && !this.O.found) return null; const b = this.me; if (g.kind === 'lamp' && Math.hypot(this.O.x - b.x, this.O.z - b.z) < NIGHT.load.r + 4) return { ...g, kind: 'wait' }; return g; }
  hud(b, u) {
    const g = this.goal(), d = g ? Math.hypot(g.x - b.x, g.z - b.z) : 1e9, pct = Math.round(this.storm * 100);
    return { gap: `aboard ${this.aboard} of ${RULES.seats}` + (this.jack ? `, Jack ${this.jack.load}` : ''), gauge: { name: this.night ? 'The night sea' : 'The evening sea', calm: 100 - pct, note: this.storm > 0.7 ? 'STEADY HANDS' : this.handover ? 'the lookout has the helm' : '' },
      warn: this.storm > 0.82 ? 'Small moves of the wheel: the sea is rising' : !this.O.found && this.night ? 'Look for one lamp that blinks' : g && g.kind === 'lamp' && d < 40 && u > NIGHT.load.v ? 'Come alongside slowly: brake'
        : g && g.kind === 'beach' && b.z < BAY.shoreZ + 70 && u > RULES.landV ? 'Slow down for the beach' : this.aboard >= RULES.seats && this.waiting > 0 ? 'Six and no more: bring these home first' : '' };
  }
  summary() {
    const rd = (v, n = 1) => Math.round(v * 10 ** n) / 10 ** n, C = this.choices, over = this.people.filter((p) => p.group === 'overdue'), overHome = over.filter((p) => p.st === P.home).length, lampsHome = this.lamps.filter((L) => L.home).length;
    const stars = { thanks: C.guests === 'ashore', people: this.over && this.home === this.total, sea: this.over && this.broaches === 0 };
    const leaves = [C.guests === 'ashore', this.over && this.fulls === 0 && overHome === 9, C.fleet === 'chain', this.over && this.broaches === 0 && this.stormPeak < 0.9, overHome === 9, C.fleet === 'chain' && lampsHome === 3];
    const nStars = (stars.thanks ? 1 : 0) + (stars.people ? 1 : 0) + (stars.sea ? 1 : 0);
    return { level: this.key, difficulty: this.difficulty, choices: { ...C }, finished: this.over, time: this.endT === null ? null : rd(this.endT, 2),
      total: this.total, saved: this.home, lost: 0, stars, nStars, medal: voyageMedal(nStars, this.over && this.home > 0), leaves,
      broaches: this.broaches, stormPeak: rd(this.stormPeak, 2), fulls: this.fulls, overHome, lampsHome, maxAboard: this.maxAboard, landings: this.landings, scares: 0, reefFast: 0 };
  }
  // the people still out when the night is over are fetched by the village: nobody is lost at sea in this game
  step() { super.step(); if (this.over && this.lost) { for (const p of this.people) if (p.st === P.lost) p.st = Q.wait; this.lost = 0; } }
  // The stand-in driver. skill 1: small moves of the wheel, alongside slowly; skill 0: hard over, never slow.
  pilot(out, skill = 1) {
    const b = this.me, t = this.goal(), u = Math.hypot(b.vx, b.vz);
    out.steer = 0; out.brake = 0; out.boost = 0;
    if (!t) return out;
    const dist = Math.hypot(t.x - b.x, t.z - b.z), rel = wrapA(Math.atan2(-(t.x - b.x), t.z - b.z) - b.h);
    if (skill <= 0) { out.steer = rel > 0.02 ? 1 : rel < -0.02 ? -1 : 0; return out; }
    const cap = this.storm > 0.6 ? 0.28 : Math.abs(rel) > 0.9 ? 0.8 : 0.42;         // gentle, and gentler when the sea is up; firm only for a turn right round
    out.steer = Math.round(clamp(rel * 1.4, -cap, cap) * 100) / 100 || 0;
    const stopD = (u * u) / 14 + 5;
    if (t.kind === 'beach') { if (b.z < BAY.shoreZ + BAY.beach.deep + stopD && u > RULES.landV - 1.5) out.brake = 1; }
    else if (dist < stopD + 3 && u > 2.2) out.brake = 1; else if (dist < NIGHT.load.r - 2) out.brake = 1;
    return out;
  }
}
