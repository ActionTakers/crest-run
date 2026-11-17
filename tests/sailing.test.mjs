import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JUKUNG_SPEC as J, JUKUNG_PHYSICS, JUKUNG_SPAN } from '../src/sim/jukung-spec.mjs';
import { sailingForces, floatLoads, advanceSailing, makeSailingState, sailingInputs } from '../src/sim/sailing.mjs';
import { Race, defaultSettings, DT, SIM_VERSION, TUNE_KEYS } from '../src/sim/race-sim.mjs';
import { getCourse, COURSE_KEYS } from '../src/sim/courses.mjs?v=7d4a3824';
import { boatTweak } from '../src/sim/boat-stats.mjs';
import { bayCourse, voyageSettings, Voyage, RULES } from '../src/sim/voyage.mjs?v=7d4a3824';

const close = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const boat = (extra = {}) => ({ x: 0, z: 0, y: J.draft, h: 0, vx: 0, vz: 0,
  r: 0, roll: 0, rr: 0, pitch: 0, pr: 0, vy: 0, ...extra });

// Load the verified published baseline directly from Git. Its stat/mission
// modules import the original Race, so a changed current tune cannot mask a
// regression. Unchanged wave/course modules are shared with the working tree.
const BASELINE_HEAD = 'e29e97012f19096e70c135e3ff994daf2762d5a8';
const simBase = new URL('../src/sim/', import.meta.url);
function baselineModule(name, dependencies = {}) {
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const source = execFileSync('git', ['show', `${BASELINE_HEAD}:src/sim/${name}`], { cwd, encoding: 'utf8' });
  const portable = source.replace(/from '\.\/([^']+)'/g, (_, path) =>
    `from '${dependencies[path.split('?')[0]] || new URL(path, simBase).href}'`);
  return 'data:text/javascript;base64,' + Buffer.from(portable).toString('base64');
}
let baselinePromise;
function baseline() {
  if (!baselinePromise) {
    const race = baselineModule('race-sim.mjs');
    const stats = baselineModule('boat-stats.mjs', { 'race-sim.mjs': race });
    const voyage = baselineModule('voyage.mjs', { 'race-sim.mjs': race, 'boat-stats.mjs': stats });
    baselinePromise = Promise.all([import(race), import(stats), import(voyage)])
      .then(([race, stats, voyage]) => ({ race, stats, voyage }));
  }
  return baselinePromise;
}
function sameRun(before, after) {
  const keys = ['x', 'y', 'z', 'h', 'vx', 'vz', 'u', 'v', 'r', 'pitch', 'roll',
    'boostE', 'boostLv', 'prog', 'contacts', 'gatesOk', 'gatesMiss', 'finished'];
  assert.equal(after.boats.length, before.boats.length);
  for (let i = 0; i < after.boats.length; i++) {
    assert.deepEqual(after.boats[i].P, before.boats[i].P, `boat ${i} parameters`);
    for (const key of keys) assert.equal(after.boats[i][key], before.boats[i][key], `boat ${i} ${key}`);
  }
  assert.deepEqual(after.rec, before.rec);
  assert.deepEqual(after.events, before.events);
  assert.deepEqual(after.summary(), before.summary());
}

test('the central hull and outrigger support span remain distinct', () => {
  const P = boatTweak('cruise', 'jukung-racer');
  assert.equal(P.length, J.hullLength);
  assert.equal(P.beam, J.hullBeam);
  assert.equal(P.supportBeam, 2 * J.floatOffset);
  assert.ok(P.length / P.beam > 10);
  assert.ok(P.beam < P.supportBeam && P.supportBeam < JUKUNG_SPAN);
  assert.equal(P.craft, 'jukung-racer');
  assert.equal(boatTweak('cruise', 'yacht').craft, undefined);
  assert.equal(boatTweak('cruise', 'jukung').craft, undefined);
  assert.equal(boatTweak('cruise', 'jukung').beam, undefined, 'tour jukung keeps its inherited baseline beam');
  assert.match(J.provenance, /not measured/i);
});

test('calm air cannot propel a stationary boat, and a coasting boat loses energy', () => {
  const calm = { wind: { x: 0, z: 0 } }, b = boat();
  for (let i = 0; i < 1200; i++) advanceSailing(b, {}, calm, DT);
  close(b.x, 0); close(b.z, 0); close(b.u, 0); close(b.sailing.drive, 0);
  const moving = boat({ vz: 3 }); let energy = 9;
  for (let i = 0; i < 600; i++) {
    advanceSailing(moving, {}, calm, DT);
    const next = moving.vx ** 2 + moving.vz ** 2;
    assert.ok(next <= energy + 1e-12); energy = next;
    close(moving.sailing.drive, 0);
  }
  assert.ok(energy < 9);
});

test('head-to-wind has no drive; the same wind on the beam provides drive', () => {
  const head = sailingForces(boat(), {}, { x: 0, z: -6 });
  const reach = sailingForces(boat(), {}, { x: 6, z: 0 });
  assert.equal(head.noGo, true); close(head.drive, 0);
  assert.equal(reach.noGo, false); assert.ok(reach.drive > 0.5);
});

test('manual sheet angle can depower a beam reach; auto trim is an explicit assist', () => {
  const w = { x: 6, z: 0 }, b = boat();
  const auto = sailingForces(b, { autoTrim: true }, w);
  const eased = sailingForces(b, { autoTrim: false, sheet: 0 }, w);
  assert.ok(eased.drive < auto.drive * 0.2);
  assert.ok(eased.trimEfficiency < auto.trimEfficiency);
  assert.equal(eased.autoTrim, false);
  const manualAtOptimum = sailingForces(b, { autoTrim: false, sheet: auto.sheet }, w);
  close(manualAtOptimum.drive, auto.drive);
});

test('port and starboard wind cases are mirror symmetric over a fixed-step run', () => {
  const port = boat(), starboard = boat();
  for (let i = 0; i < 1200; i++) {
    advanceSailing(port, {}, { wind: { x: 6, z: 0 } }, DT);
    advanceSailing(starboard, {}, { wind: { x: -6, z: 0 } }, DT);
  }
  close(port.x, -starboard.x); close(port.z, starboard.z);
  close(port.h, -starboard.h); close(port.roll, -starboard.roll);
  close(port.sailing.portLoad, starboard.sailing.starboardLoad);
  close(port.sailing.sailAngle, -starboard.sailing.sailAngle);
});

test('float loading responds independently to heel and local water height, and adds drag', () => {
  const b = boat({ roll: 0.035, vz: 3 }), a = floatLoads(b);
  assert.ok(a.starboardLoad > a.portLoad);
  const separateWave = floatLoads(boat(), { port: 0.12, starboard: 0 });
  assert.ok(separateWave.portLoad > separateWave.starboardLoad);
  const dry = sailingForces(b, {}, { x: 6, z: 0 }, { portLoad: 0, starboardLoad: 0 });
  const wet = sailingForces(b, {}, { x: 6, z: 0 }, { portLoad: 0, starboardLoad: 1 });
  assert.ok(wet.resistance > dry.resistance);
});

test('rudder needs forward flow and costs speed; effort balance changes helm tendency', () => {
  const w = { x: 6, z: 0 }; // air travels to port: it arrives from starboard
  close(sailingForces(boat(), { steer: 1 }, w).yawTarget, 0);
  const moving = boat({ vz: 3 });
  const straight = sailingForces(moving, { steer: 0 }, w);
  const turning = sailingForces(moving, { steer: 1 }, w);
  assert.ok(turning.resistance > straight.resistance);
  assert.ok(turning.yawTarget > straight.yawTarget);
  const fore = sailingForces(moving, { rigBalance: 1 }, w);
  const aft = sailingForces(moving, { rigBalance: -1 }, w);
  assert.ok(fore.yawTarget < aft.yawTarget);
});

test('crew balance changes the supported heel and finite telemetry is deterministic', () => {
  const one = boat(), two = boat(), balanced = boat();
  for (let i = 0; i < 2400; i++) {
    const input = { autoTrim: false, sheet: 0.6, steer: 0.1 * Math.sin(i * 0.003), crewBalance: 0.5, rigBalance: 0.2 };
    const opts = { wind: { x: -5, z: 1 } };
    const water = { bow: 0.03 * Math.sin(i * 0.01), centre: 0, stern: 0, port: 0, starboard: 0 };
    advanceSailing(one, input, opts, DT, water);
    advanceSailing(two, input, opts, DT, water);
    advanceSailing(balanced, { ...input, crewBalance: 0 }, opts, DT, water);
  }
  assert.deepEqual(one, two);
  assert.notEqual(one.roll, balanced.roll);
  for (const value of Object.values(one.sailing)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
  assert.ok(Math.abs(one.roll) < 0.55);
  const safe = sailingInputs({ sheet: NaN, rigBalance: Infinity, crewBalance: -Infinity });
  assert.ok(Object.values(safe).every(x => typeof x !== 'number' || Number.isFinite(x)));
  assert.throws(() => advanceSailing(boat(), {}, {}, NaN), /dt/);
});

test('sailing trial is unranked, ignores boost/brake propulsion and records no ghost inputs', () => {
  const c = getCourse(COURSE_KEYS[0]);
  const settings = defaultSettings(c, { rivals: 0 });
  settings.sailing = { wind: { x: 0, z: 0 } };
  const r = new Race(settings, c);
  for (let i = 0; i < 1000; i++) r.step(0, 1, 1, { sheet: 1, autoTrim: false });
  const b = r.boats[0];
  assert.equal(r.nonRanked, true); assert.equal(r.free, true); assert.equal(r.capS, Infinity);
  assert.equal(r.done, false); assert.equal(r.rec.steer.length, 0); assert.equal(r.rec.flags.length, 0);
  close(b.u, 0); close(b.boostLv, 0); close(b.boostE, 0);
  assert.equal(b.P.beam, JUKUNG_PHYSICS.beam);
  assert.equal(b.P.craft, 'jukung-racer');
});

test('racing jukung contacts include its thin floats while leaving the hull-to-float gap open', () => {
  const c = getCourse(COURSE_KEYS[0]);
  function encounter(x) {
    const settings = defaultSettings(c, { rivals: 1 });
    settings.boats[0].tweak = boatTweak('cruise', 'jukung-racer');
    settings.boats[1].tweak = { length: 1, beam: 0.3 };
    const r = new Race(settings, c);
    Object.assign(r.boats[0], { x: 0, z: 0, h: 0, vx: 0, vz: 0 });
    Object.assign(r.boats[1], { x, z: 0, h: 0, vx: 0, vz: 0 });
    r.contacts(); return r.events.some(e => e.type === 'contact');
  }
  assert.equal(encounter(0.15), true, 'central hull is solid along its middle');
  assert.equal(encounter(J.floatOffset + 0.1), true, 'the float can be contacted');
  assert.equal(encounter(0.85), false, 'the open gap is not a broad virtual hull');
});

test('ordinary yacht race and replay behavior match the verified e29e970 baseline exactly', async () => {
  const original = await baseline();
  const c = getCourse(COURSE_KEYS[0]), settings = defaultSettings(c, { rivals: 3 });
  const before = new original.race.Race(settings, c), after = new Race(settings, c);
  assert.equal(SIM_VERSION, original.race.SIM_VERSION, 'existing ghosts keep their compatible version');
  for (let i = 0; i < 1800; i++) {
    const s = Math.sin(i * 0.007) * 0.2, brake = i % 300 > 260 ? 1 : 0, boost = i % 240 > 160 ? 1 : 0;
    before.step(s, brake, boost); after.step(s, brake, boost);
  }
  sameRun(before, after);
});

test('normal tour jukung voyage, six guest places and handling match e29e970 exactly', async () => {
  const original = await baseline(), c = bayCourse();
  for (const tune of TUNE_KEYS) assert.deepEqual(boatTweak(tune, 'jukung'), original.stats.boatTweak(tune, 'jukung'));
  assert.deepEqual(RULES, original.voyage.RULES);
  assert.equal(RULES.seats, 6);
  const beforeSettings = original.voyage.voyageSettings(c), afterSettings = voyageSettings(c);
  assert.deepEqual(afterSettings, beforeSettings, 'tour settings must not inherit the narrow racing geometry');
  const before = new original.race.Race(beforeSettings, c), after = new Race(afterSettings, c);
  const beforeVoyage = new original.voyage.Voyage(before, { seed: 3 });
  const afterVoyage = new Voyage(after, { seed: 3 });
  assert.equal(after.boats[0].sailing, undefined);
  assert.equal(after.nonRanked, false);
  for (let i = 0; i < 3600; i++) {
    const steer = Math.sin(i * 0.005) * 0.15, brake = i % 480 > 390 ? 1 : 0, boost = i % 600 > 500 ? 1 : 0;
    before.step(steer, brake, boost); after.step(steer, brake, boost);
    beforeVoyage.step(); afterVoyage.step();
  }
  sameRun(before, after);
  assert.deepEqual(afterVoyage.summary(), beforeVoyage.summary());
  assert.deepEqual(afterVoyage.people, beforeVoyage.people);
  assert.deepEqual(afterVoyage.net, beforeVoyage.net);
});
