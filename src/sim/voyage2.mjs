// voyage2.mjs: MK-2 "Before the Wind" (depth: Kunnen), the fishing voyage (PLAN-MONKEYKING.md, step B3). The frame is
// sim/voyage.mjs. In the four steps a level teaches by (research A6-01): out to the fishing ground, where the first gusts
// cross and the boat learns to take them bow or stern on (the safe first try); Captain Jack's engine has died near the wreck:
// come alongside slowly and he is on the tow line, which parts when a gust takes the boat on the beam (harder); then the
// twist: the squall is here early and three boats of the fleet no longer know the way: gather them into one line; and the
// conclusion: lead the line home to the beach before the squall is at its worst. Near the land the wind is half as strong.
// Nobody is lost at sea in this game: a boat that is not home when time runs out is fetched by the village.
// Pure, fixed step, seeded. Every number is tuned with the stand-in driver below, never by a person.
// Written 2026-11-16 by the yacht project session.
import { DT } from './race-sim.mjs?v=03fa7436';
import { wrapA } from './courses.mjs?v=03fa7436';
import { BAY, RULES, VOYAGES, Voyage, voyageMedal } from './voyage.mjs?v=03fa7436';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const DEG = Math.PI / 180;
// The wind blows from the open sea onto the land. A gust is a band across the whole bay that runs with the wind.
export const WIND = { dir: { x: -0.2588, z: -0.9659 },
  gust: { w: 26, v: 30, from: -430, to: 300, rideDeg: 42, shove: 7, keep: 0.55, kick: 2.5, lee: 0.5, leeZ: -130, soft: 0.5, callS: 4 },
  tow: { len: 12, followV: 16, k: 3, snap: 6.5, pace: 0.5, leadPace: 0.58, joinR: 8.5, joinV: 5, joinS: 1.0, driftV: 1.0 },
  fleet: { gatherR: 16, gatherV: 14, gap: 9, dropD: 48, driftV: 0.6 },
  every: [13, 7], strong: 1.25,                         // seconds between gusts before and in the squall; how much stronger they are in it
  squallAt: 70, peak: { early: 125, late: 100 },         // the squall begins when Jack is on the line or at this second; then seconds until its peak
  ground: { x: -120, z: 250, r: 38 },                   // the fishing ground beyond the wreck
  levels: { easy: { gust: 0.8 }, normal: { gust: 1 }, hard: { gust: 1.25 } } };
// a boat of the fleet, Captain Jack's among them
export const B = { fishing: 0, adrift: 1, towed: 2, lost: 3, following: 4, home: 5 };

VOYAGES.mk2 = { key: 'mk2', name: 'Before the Wind', depth: 'Kunnen', world: 'noon', trip: 'the fishing voyage',
  choices: { time: ['early', 'late'], jack: ['wind', 'line'], way: ['shore', 'straight'] },
  // one question from the voyage before, asked before the choices (right: the place of the answer that the first voyage taught)
  recall: { from: 'Glass Morning', q: 'When does a guest in the water come aboard?', a: ['When the boat lies close and slow', 'When the boat passes fast', 'When the lookout calls'], right: 0, said: 'Close and slow. The same hand brings Captain Jack onto your line today.' },
  story: 'Out past the drop-off for the golden fish. The trick is showing up before the wind does. Captain Jack fishes near the wreck.',
  rows: [
    { key: 'time', label: 'TIME', opts: [['early', 'Leave with the dawn', 'thanks given, and more time before the squall'], ['late', 'Leave late', 'more fish, less time before its peak']] },
    { key: 'jack', label: 'AGREED', opts: [['wind', 'Jack watches the wind', 'he calls every gust four seconds ahead'], ['line', 'Jack watches the line', 'the tow line holds through one bad gust']] },
    { key: 'way', label: 'PLACE', opts: [['shore', 'Home along the shore', 'longer, but the land breaks the wind'], ['straight', 'Straight home', 'short, and open to every gust']] },
  ],
  leaves: ['A plan is a time: I left before the wind.', 'Two crews, one plan: what we agreed held.', 'I chose a way the whole line could follow, with time to spare.',
    'Bow or stern to the gust: no float went under.', 'An easy hand keeps a line whole: Jack came home on it.', 'One line toward the mountain: I gathered the fleet.',
    'What my own numbers say.', 'What Jack saw me do.', 'What the elder adds.'],
  ask: [
    { ring: 'ZELF', q: 'What do your own numbers say?', a: ['I rode the gusts', 'I fought them', 'I did not see them coming'] },
    { ring: 'SAMEN', q: 'What does Captain Jack say?', a: ['You kept my line whole', 'You pulled too hard', 'You came back for me'] },
    { ring: 'SYSTEEM', q: 'What does the elder of the fleet add?', a: ['One line, one way home', 'Leave before the wind', 'Count the boats on the sand'] },
  ],
  look: { place: 'The fishing ground', jack: 'Captain Jack, adrift', boat: 'A boat of the fleet', beach: 'Lead them home', lee: 'Into the lee of the land' }, unit: 'Boats home',
  first: 'A GUST IS A DARK BAND ON THE WATER. TURN YOUR BOW OR YOUR STERN TO IT',
  endLine: (sm) => (sm.saved === sm.total ? 'The whole fleet is on the sand' : `${sm.saved} of ${sm.total} boats came home before the peak`),
  stats: (sm) => [`gusts ridden ${sm.rode} of ${sm.gusts}`, `a float under ${sm.buried} times`, `the line parted ${sm.breaks} times`],
  tip: (sm) => (!sm.stars.people ? 'Tip: lead a line and your boat eases off by itself. Head for the land: there the wind is half as strong.' : !sm.stars.sea ? 'Tip: when the dark band comes, turn your bow or your stern to it.' : !sm.stars.thanks ? 'Tip: leaving with the dawn is a choice before you sail.' : ''),
  tell: (sm) => [
    `You rode ${sm.rode} of ${sm.gusts} gusts; a float went under ${sm.buried} time${sm.buried === 1 ? '' : 's'}.` + (sm.buried ? ' Next time: turn bow or stern to the dark band before it is on you.' : ''),
    sm.jackHome && sm.breaks === 0 ? 'Jack: "Smooth hands. The line never jerked."' : sm.jackHome ? `Jack: "We made it, but the line parted ${sm.breaks} time${sm.breaks === 1 ? '' : 's'}. Take the gust on the bow when you tow."` : 'Jack: "I was still out there when the worst came. Come alongside slowly, and I am on your line."',
    `${sm.saved} of ${sm.total} boats were on the sand before the peak. The elder: "A fleet goes home as one line, and the slowest boat sets the pace."`,
  ] };

export class WindVoyage extends Voyage {
  setup() {
    const W = WIND, C = this.choices; this.wind = W.levels[this.difficulty] || W.levels.normal;
    this.people = []; this.total = 4; this.net = { on: false, gone: false, freed: false, aboard: false, x: 0, z: 0, dx: 0, dz: 1, t: 0, held: false };   // no net in this voyage
    const K = BAY.places.wreck;
    this.jack = { i: 0, name: 'jack', st: B.fishing, x: K.x + 34, z: K.z - 16, h: 2.2, t: 0, lead: null };
    this.fleet = [{ i: 1, st: B.fishing, x: 70, z: 255, h: 0.6 }, { i: 2, st: B.fishing, x: 225, z: 150, h: -1.1 }, { i: 3, st: B.fishing, x: -30, z: 120, h: 2.6 }].map((f) => ({ ...f, t: 0, lead: null }));
    this.boats = [this.jack, ...this.fleet];
    this.gusts = []; for (let i = 0; i < 6; i++) this.gusts.push({ on: false, s: 0, k: 1, in: false });
    this.gustT = 6; this.nGusts = 0; this.rode = 0; this.buried = 0; this.breaks = 0; this.dropped = 0; this.saves = C.jack === 'line' ? 1 : 0;
    this.phase = 0; this.squall = false; this.squallT = null; this.reached = false; this.capS = 1e9; this.call = null;
  }
  get line() { return this.boats.filter((q) => q.st === B.towed || q.st === B.following); }
  // one step of the voyage's own
  stepLevel(b, u, T) {
    const W = WIND, G = W.ground;
    if (!this.reached && Math.hypot(b.x - G.x, b.z - G.z) < G.r) { this.reached = true; this.phase = 1; this.jack.st = B.adrift; this.ev({ type: 'vCall', x: this.jack.x, z: this.jack.z }); }
    if (!this.squall && (this.jack.st === B.towed || T > W.squallAt)) {
      this.squall = true; this.squallT = T; this.capS = T + W.peak[this.choices.time]; this.phase = Math.max(this.phase, 2); if (this.jack.st === B.fishing) { this.jack.st = B.adrift; this.reached = true; }
      for (const f of this.fleet) if (f.st === B.fishing) f.st = B.lost;
      this.ev({ type: 'vSquall', peakIn: W.peak[this.choices.time] });
    }
    this.stepGusts(b, u, T); this.stepJack(b, u, T); this.stepFleet(b, u, T);
    b.pace = this.jack.st === B.towed ? W.tow.pace : this.line.length ? W.tow.leadPace : 1;      // the boat eases off for whoever follows it
  }
  stepGusts(b, u, T) {
    const W = WIND, g = W.gust, d = W.dir, pp = b.x * d.x + b.z * d.z;
    this.gustT -= DT;
    if (this.gustT <= 0) {
      const q = this.gusts.find((x) => !x.on);
      if (q) { this.nGusts++; q.on = true; q.s = g.from; q.in = false; q.k = (this.nGusts <= 2 ? g.soft : 1) * (this.squall ? W.strong : 1) * this.wind.gust; }      // the first two are gentle
      this.gustT = W.every[this.squall ? 1 : 0];
    }
    let call = null;
    for (const q of this.gusts) {
      if (!q.on) continue;
      q.s += g.v * DT; if (q.s > g.to) { q.on = false; continue; }
      const inside = Math.abs(pp - q.s) < g.w / 2, ahead = (pp - q.s - g.w / 2) / g.v;
      if (!q.in && ahead > 0 && (call === null || ahead < call)) call = ahead;
      if (inside && !q.in) {
        q.in = true;
        const lee = b.z < g.leeZ, k = q.k * (lee ? g.lee : 1), fx = -Math.sin(b.h), fz = Math.cos(b.h), along = fx * d.x + fz * d.z, ok = Math.abs(along) >= Math.cos(g.rideDeg * DEG);
        if (ok || u < 3) { this.rode++; if (along > 0 && u > 3) { b.vx += fx * g.kick * k; b.vz += fz * g.kick * k; } this.ev({ type: 'vRode', k, lee }); }
        else {
          b.vx = b.vx * g.keep + d.x * g.shove * k; b.vz = b.vz * g.keep + d.z * g.shove * k;
          if (lee || q.k <= g.soft * this.wind.gust * W.strong + 1e-9) { this.rode++; this.ev({ type: 'vShoved', k, lee }); }   // in the lee, and in the first gentle gusts, a shove and no more
          else { this.buried++; this.ev({ type: 'vBuried', k }); this.strain(); }
        }
      }
    }
    this.call = call;
  }
  // a gust on the beam strains whatever follows: the tow line parts (once it holds, if Jack watches it), or the last boat of the line breaks away
  strain() {
    const J = this.jack;
    if (J.st === B.towed) { if (this.saves > 0) { this.saves--; this.ev({ type: 'vHeld' }); return; } this.part('gust'); return; }
    const L = this.line; if (L.length) { const last = L[L.length - 1]; last.st = B.lost; last.lead = null; this.dropped++; this.relink(); this.ev({ type: 'vDropped', i: last.i }); }
  }
  part(why) { const J = this.jack; J.st = B.adrift; J.t = 0; J.lead = null; this.breaks++; this.relink(); this.ev({ type: 'vSnap', why }); }
  // who follows whom: Jack on the tow first, then the boats in the order they joined
  relink() { let lead = null; if (this.jack.st === B.towed) { this.jack.lead = null; lead = this.jack; } for (const f of this.fleet.filter((q) => q.st === B.following).sort((a, c) => a.joined - c.joined)) { f.lead = lead; lead = f; } }
  follow(q, tx, tz, gap, T) {
    const W = WIND.tow, dx = tx - q.x, dz = tz - q.z, d = Math.hypot(dx, dz) || 1e-6, v = clamp((d - gap) * W.k, 0, W.followV);
    q.x += (dx / d) * v * DT; q.z += (dz / d) * v * DT; if (v > 0.3) q.h = wrapA(q.h + clamp(wrapA(Math.atan2(-dx, dz) - q.h), -2.5 * DT, 2.5 * DT));
    return d - gap;
  }
  stepJack(b, u, T) {
    const J = this.jack, W = WIND.tow, d = WIND.dir;
    if (J.st === B.adrift) {
      J.x += d.x * W.driftV * DT; J.z += d.z * W.driftV * DT; if (J.z < BAY.shoreZ + 14) J.z = BAY.shoreZ + 14;
      const near = Math.hypot(J.x - b.x, J.z - b.z) < W.joinR && u < W.joinV;
      J.t = near ? J.t + DT : Math.max(0, J.t - DT * 0.5);
      if (J.t >= W.joinS) { J.st = B.towed; J.t = 0; this.phase = Math.max(this.phase, 2); this.relink(); this.ev({ type: 'vTow' }); }
    } else if (J.st === B.towed) {
      const stretch = this.follow(J, b.x + Math.sin(b.h) * 4, b.z - Math.cos(b.h) * 4, W.len, T);
      if (stretch > W.snap) this.part('pull');
    }
  }
  stepFleet(b, u, T) {
    const F = WIND.fleet, d = WIND.dir;
    for (const f of this.fleet) {
      if (f.st === B.lost) {
        f.x += d.x * F.driftV * DT; f.z += d.z * F.driftV * DT; f.h = wrapA(f.h + 0.5 * DT);                       // it turns in circles: it has lost the way
        let near = Math.hypot(f.x - b.x, f.z - b.z) < F.gatherR; for (const q of this.line) if (Math.hypot(f.x - q.x, f.z - q.z) < F.gatherR) near = true;
        if (near && u < F.gatherV) { f.st = B.following; f.joined = T; this.relink(); this.ev({ type: 'vJoin', i: f.i, n: this.line.length }); }
      } else if (f.st === B.following) {
        const L = f.lead, tx = L ? L.x : b.x + Math.sin(b.h) * 4, tz = L ? L.z : b.z - Math.cos(b.h) * 4;
        if (this.follow(f, tx, tz, F.gap, T) > F.dropD) { f.st = B.lost; f.lead = null; this.dropped++; this.relink(); this.ev({ type: 'vDropped', i: f.i }); }
      }
    }
  }
  // on the beach, slowly: every boat of the line that is close is home
  atHome(b, u, T) {
    if (!this.atBeach(b) || u >= RULES.landV) return;
    let n = 0; for (const q of this.line) if (Math.hypot(q.x - b.x, q.z - b.z) < 110) { q.st = B.home; q.lead = null; n++; }
    if (n) { this.home += n; this.landings++; this.relink(); this.ev({ type: 'vHome', n, home: this.home, total: this.total }); }
  }
  done() { return this.home === this.total; }
  target() {
    const b = this.me, J = this.jack, W = WIND;
    if (!this.reached && !this.squall) return { x: W.ground.x, z: W.ground.z, kind: 'place' };
    if (J.st === B.adrift) return { x: J.x, z: J.z, kind: 'jack' };
    let best = null, bd = 1e9; for (const f of this.fleet) if (f.st === B.lost) { const d = Math.hypot(f.x - b.x, f.z - b.z); if (d < bd) { bd = d; best = f; } }
    if (best) return { x: best.x, z: best.z, kind: 'boat', i: best.i };
    if (!this.line.length) return { x: BAY.beach.x, z: BAY.shoreZ + 12, kind: 'beach' };            // nobody to lead yet: wait off the beach
    if (this.choices.way === 'shore' && b.z > W.gust.leeZ - 12) return { x: clamp(b.x * 0.55, -200, 200), z: W.gust.leeZ - 40, kind: 'lee' };
    return { x: BAY.beach.x, z: BAY.shoreZ + 12, kind: 'beach' };
  }
  hud(b, u) {
    const K = this.look, J = this.jack, d = K ? Math.hypot(K.x - b.x, K.z - b.z) : 1e9, peak = this.squall ? Math.max(0, this.capS - this.race.lapT) : null;
    const called = this.choices.jack === 'wind' && this.call !== null && this.call < WIND.gust.callS;
    return { gap: this.squall ? `the peak in ${Math.ceil(peak)} s` : `in the line: ${this.line.length}`,
      warn: called ? `Jack: gust in ${Math.ceil(this.call)}: bow or stern to it` : K && K.kind === 'jack' && d < 34 && u > WIND.tow.joinV ? 'Come alongside slowly: brake' : K && K.kind === 'jack' && d < WIND.tow.joinR ? 'Hold still: the line goes over'
        : K && K.kind === 'beach' && b.z < BAY.shoreZ + 70 && u > RULES.landV ? 'Slow down for the beach' : J.st === B.towed && this.saves === 0 && this.choices.jack === 'line' && this.breaks === 0 && this.buried > 0 ? 'The line held once: it will not again' : '' };
  }
  summary() {
    const rd = (v, n = 1) => Math.round(v * 10 ** n) / 10 ** n, C = this.choices, jackHome = this.jack.st === B.home, fleetHome = this.fleet.filter((f) => f.st === B.home).length;
    const spare = this.over && this.endT !== null && this.capS - this.endT >= 15;
    const stars = { thanks: C.time === 'early', people: this.over && this.home === this.total, sea: this.over && this.breaks === 0 && this.dropped === 0 && this.buried <= 1 };
    const leaves = [C.time === 'early', jackHome && (C.jack === 'wind' ? this.buried <= 1 : this.breaks === 0), this.home === this.total && spare,
      this.over && this.rode >= 3 && this.buried === 0, jackHome && this.breaks === 0, fleetHome === 3 && this.dropped === 0];
    const nStars = (stars.thanks ? 1 : 0) + (stars.people ? 1 : 0) + (stars.sea ? 1 : 0);
    return { level: this.key, difficulty: this.difficulty, choices: { ...C }, finished: this.over, time: this.endT === null ? null : rd(this.endT, 2),
      total: this.total, saved: this.home, lost: 0, stars, nStars, medal: voyageMedal(nStars, this.over && this.home > 0), leaves,
      gusts: this.nGusts, rode: this.rode, buried: this.buried, breaks: this.breaks, dropped: this.dropped, jackHome, fleetHome, squallAt: this.squallT === null ? null : rd(this.squallT), scares: 0, reefFast: 0, landings: this.landings };
  }
  // The stand-in driver. skill 1: turns bow or stern to a gust that is about to arrive and comes alongside slowly; skill 0: neither.
  pilot(out, skill = 1) {
    const b = this.me, t = this.target(), u = Math.hypot(b.vx, b.vz), g = WIND.gust, d = WIND.dir;
    out.steer = 0; out.brake = 0; out.boost = 0;
    if (!t) return out;
    const dist = Math.hypot(t.x - b.x, t.z - b.z); let rel = wrapA(Math.atan2(-(t.x - b.x), t.z - b.z) - b.h);
    if (skill > 0 && this.call !== null && this.call < 1.9 && !(b.z < g.leeZ)) {                 // a gust is nearly here: bow or stern to it, whichever is nearer
      const up = Math.atan2(d.x, -d.z), down = Math.atan2(-d.x, d.z), a = wrapA(up - b.h), c = wrapA(down - b.h); rel = Math.abs(a) < Math.abs(c) ? a : c;
    }
    out.steer = Math.round(clamp(rel * 2.6, -1, 1) * 100) / 100 || 0;
    if (skill <= 0) return out;
    const stopD = (u * u) / 14 + 5;
    if (t.kind === 'beach') { if (b.z < BAY.shoreZ + BAY.beach.deep + stopD && u > RULES.landV - 1.5) out.brake = 1; }
    else if (t.kind === 'jack') { if (dist < stopD + 2 && u > 2.2) out.brake = 1; else if (dist < WIND.tow.joinR - 2) out.brake = 1; }
    if (Math.abs(rel) > 1.2 && u > 8 && this.jack.st !== B.towed) out.brake = 1;
    return out;
  }
}
