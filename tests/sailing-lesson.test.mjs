import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSailingLesson, advanceSailingLesson, SAILING_LESSON_STEPS } from '../src/sim/sailing-lesson.mjs';
import { advanceSailing, sailingForces } from '../src/sim/sailing.mjs';
import { JUKUNG_SPEC } from '../src/sim/jukung-spec.mjs';
import { Race } from '../src/sim/race-sim.mjs';
import { bayCourse, voyageSettings } from '../src/sim/voyage.mjs';

const DT = 1 / 120;
const wind = { x: 4, z: -3 }, heading = Math.atan2(wind.z, wind.x);
const boat = () => ({ x: 0, z: 0, y: JUKUNG_SPEC.draft, h: heading,
  vx: 0, vz: 0, r: 0, roll: 0, rr: 0, pitch: 0, pr: 0, vy: 0 });
const sample = (extra = {}) => ({ awa: Math.PI / 2, aws: 5, fill: 0.8,
  trimEfficiency: 0.9, speedThroughWater: 2, heel: -0.025,
  portLoad: 0.28, starboardLoad: 0, sheet: 0.6, crewBalance: 0,
  rudderAngle: 0, noGo: false, autoTrim: true, ...extra });
const stepFor = (l, s, c, seconds) => { for (let i = 0; i < Math.round(seconds / DT); i++) advanceSailingLesson(l, s, c, DT); };
function finishFirst(l) {
  stepFor(l, sample({ rudderAngle: 0.1 }), { autoTrim: true, steer: 0.2 }, 0.3);
  stepFor(l, sample(), { autoTrim: true, steer: 0 }, 4);
  assert.equal(l.stepId, 'trim');
}

test('an idle player or motionless boat cannot collect the wind step', () => {
  const l = makeSailingLesson();
  stepFor(l, sample(), { autoTrim: true, steer: 0 }, 20);
  assert.equal(l.actionTaken, false); assert.equal(l.progress, 0); assert.equal(l.step, 0);
  stepFor(l, sample({ speedThroughWater: 0, rudderAngle: 0.1 }), { autoTrim: true, steer: 0.2 }, 20);
  assert.equal(l.actionTaken, false); assert.equal(l.progress, 0);
  finishFirst(l);
});

test('manual trim requires an applied sheet change as well as useful sailing', () => {
  const l = makeSailingLesson(); finishFirst(l);
  const c = { autoTrim: false, sheet: 0.6, steer: 0 };
  stepFor(l, sample({ autoTrim: false }), c, 15);
  assert.equal(l.actionTaken, false); assert.equal(l.progress, 0);
  stepFor(l, sample({ autoTrim: false, sheet: 0.68, fill: 0.1, trimEfficiency: 0.1 }), { ...c, sheet: 0.68 }, 5);
  assert.equal(l.actionTaken, true); assert.equal(l.progress, 0);
  stepFor(l, sample({ autoTrim: false, sheet: 0.68 }), { ...c, sheet: 0.68 }, 4.1);
  assert.equal(l.stepId, 'balance'); assert.deepEqual(l.completedSteps, ['wind', 'trim']);
});

test('assisted sheet drift followed only by T cannot earn manual trim', () => {
  for (const mirroredBeforeLastStep of [true, false]) {
    const l = makeSailingLesson(); finishFirst(l);
    // The sheet moves from its stage-entry .60 to .75 entirely under assist.
    // Also cover the UI mirroring .75 after the last assisted physics step.
    stepFor(l, sample({ sheet: 0.75 }), { autoTrim: true, sheet: mirroredBeforeLastStep ? 0.75 : 0.6 }, 2);
    const c = { autoTrim: false, sheet: 0.75 }, s = sample({ autoTrim: false, sheet: 0.75 });
    stepFor(l, s, c, 8);
    assert.equal(l.actionTaken, false); assert.equal(l.progress, 0); assert.equal(l.stepId, 'trim');

    // A subsequent actual Q/E nudge must reach the sail before it can count.
    const adjusted = { ...c, sheet: 0.785 };
    advanceSailingLesson(l, s, adjusted, DT);
    assert.equal(l.actionTaken, false); assert.equal(l.progress, 0);
    stepFor(l, { ...s, sheet: adjusted.sheet }, adjusted, 4.1);
    assert.equal(l.stepId, 'balance');
  }
});

test('the first manual slider or Q/E adjustment is kept when leaving assist', () => {
  for (const delta of [0.08, 0.035, -0.035]) {
    const l = makeSailingLesson(); finishFirst(l);
    stepFor(l, sample({ sheet: 0.75 }), { autoTrim: true, sheet: 0.75 }, 1);
    const sheet = 0.75 + delta;
    advanceSailingLesson(l, sample({ autoTrim: false, sheet }), { autoTrim: false, sheet }, DT);
    assert.equal(l.actionTaken, true); assert.equal(l.holding, true); assert.ok(l.progress > 0);
  }
});

test('crew practice needs a windward shift and tolerates unequal float loading', () => {
  const l = makeSailingLesson(); finishFirst(l);
  stepFor(l, sample({ autoTrim: false, sheet: 0.68 }), { autoTrim: false, sheet: 0.68 }, 4.1);
  const s = sample({ autoTrim: false, sheet: 0.68, crewBalance: 0.35, portLoad: 0.22, starboardLoad: 0 });
  stepFor(l, { ...s, crewBalance: -0.35 }, { autoTrim: false, sheet: 0.68, crewBalance: -0.35 }, 8);
  assert.equal(l.complete, false); assert.equal(l.progress, 0);
  stepFor(l, s, { autoTrim: false, sheet: 0.68, crewBalance: 0.35 }, 4.1);
  assert.equal(l.complete, true); assert.equal(l.progress, 1);
  assert.deepEqual(l.completedSteps, SAILING_LESSON_STEPS.map(s => s.id));

  // A player may explore the weight slider before this step. Starting fully
  // windward must not ask them to move beyond its endpoint to earn the lesson.
  const prebalanced = makeSailingLesson(); finishFirst(prebalanced);
  stepFor(prebalanced, { ...s, crewBalance: 1 }, { autoTrim: false, sheet: 0.68, crewBalance: 1 }, 4.2);
  assert.equal(prebalanced.stepId, 'balance'); assert.equal(prebalanced.progress, 0);
  assert.match(prebalanced.hint, /toward the centre/);
  stepFor(prebalanced, { ...s, crewBalance: 0.8 }, { autoTrim: false, sheet: 0.68, crewBalance: 0.8 }, 4.1);
  assert.equal(prebalanced.complete, true);
});

test('a short correction is forgiving but invalid sailing drains only the current hold', () => {
  const l = makeSailingLesson(); finishFirst(l);
  const c = { autoTrim: false, sheet: 0.68 };
  stepFor(l, sample({ autoTrim: false, sheet: 0.68 }), c, 2);
  const progress = l.progress;
  stepFor(l, sample({ noGo: true, fill: 0 }), c, 0.2);
  assert.equal(l.progress, progress);
  stepFor(l, sample({ noGo: true, fill: 0 }), c, 2);
  assert.equal(l.progress, 0); assert.deepEqual(l.completedSteps, ['wind']);
  stepFor(l, sample({ autoTrim: false, sheet: 0.68 }), c, 4.1);
  assert.equal(l.stepId, 'balance');
});

function physicalLesson(waves = false) {
  const course = waves ? bayCourse() : null, settings = waves ? voyageSettings(course, { boat: 'jukung-racer' }) : null;
  if (settings) settings.sailing = { wind };
  const race = settings ? new Race(settings, course) : null;
  const b = race ? race.boats[0] : boat(), l = makeSailingLesson(), transitions = [], inputs = { steer: 0, autoTrim: true, sheet: 0.5, crewBalance: 0 };
  b.h = b.ph = heading; b.vx = b.vz = b.r = 0;
  let previous = 0, manualSheet = null;
  for (let i = 0; i < 120 * 90 && !l.complete; i++) {
    const t = race ? race.lapT : i * DT;
    // A small real helm adjustment once there is water flow, then ordinary
    // feedback steering toward the original reach. This does not set boat state.
    const headingError = Math.atan2(Math.sin(heading - b.h), Math.cos(heading - b.h));
    const helm = Math.max(-0.4, Math.min(0.4, 2 * headingError - 1.7 * b.r));
    inputs.steer = l.step === 0 && t >= 2 && t < 2.6 ? 0.18 : helm;
    if (l.step >= 1) {
      if (manualSheet === null) manualSheet = Math.min(1, sailingForces(b, { autoTrim: true }, wind).sheet + 0.07);
      inputs.autoTrim = false; inputs.sheet = manualSheet;
    }
    if (l.step >= 2) inputs.crewBalance = 0.35 * Math.sign(b.sailing.awa);
    if (race) race.step(inputs.steer, 0, 0, inputs);
    else advanceSailing(b, inputs, { wind }, DT);
    if (!race || race.racing) advanceSailingLesson(l, b.sailing, inputs, DT);
    if (l.step !== previous || l.complete) { transitions.push({ step: l.step, t, complete: l.complete }); previous = l.step; }
  }
  return { b, l, transitions };
}

test('the complete lesson is reachable with real sailing physics, actual bay waves and fixed-step controls', () => {
  for (const waves of [false, true]) {
    const run = physicalLesson(waves);
    assert.equal(run.l.complete, true, JSON.stringify({ lesson: run.l, sailing: run.b.sailing }));
    assert.equal(run.transitions.length, 3);
    assert.ok(run.transitions[2].t > 12 && run.transitions[2].t < 45);
    assert.ok(run.b.sailing.speedThroughWater > 0.75);
    assert.notEqual(run.b.sailing.portLoad, run.b.sailing.starboardLoad);
    assert.deepEqual(physicalLesson(waves), run, 'same fixed-step inputs produce exactly the same practice outcome');
  }
});

test('restart is independent, completion is inert and malformed input earns no progress', () => {
  const completed = physicalLesson().l, kept = structuredClone(completed);
  advanceSailingLesson(completed, null, {}, DT); assert.deepEqual(completed, kept);
  const fresh = makeSailingLesson();
  assert.equal(fresh.stepId, 'wind'); assert.equal(fresh.complete, false); assert.deepEqual(fresh.completedSteps, []);
  stepFor(fresh, sample({ aws: NaN, rudderAngle: 0.1 }), { steer: Infinity, autoTrim: true }, 20);
  assert.equal(fresh.progress, 0); assert.equal(fresh.actionTaken, false);
  const start = structuredClone(fresh);
  advanceSailingLesson(fresh, sample(), {}, 0); assert.deepEqual(fresh, start);
  assert.throws(() => advanceSailingLesson(fresh, sample(), {}, NaN), /dt/);
  assert.throws(() => advanceSailingLesson(fresh, sample(), {}, 1), /dt/);
  assert.deepEqual(fresh, start);
});
