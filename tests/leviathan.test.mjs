// Leviathan is its own fight, not a mode of the World Dragon. Fixed-seed replay of that path.
// The stand-in pilot does not draw from the fight seed, so a recorded steer/brake/boost tape replays.
// Golden buckets: tests/fixtures/leviathan-replay.json
// Regenerate: REGEN_SIM_FIXTURES=1 node --test tests/leviathan.test.mjs
// There is no ammo or flare stock. Hull is the rationed resource. A tide strike subtracts level.tide
// (2 on normal and hard), so a yacht on 1 hull ends at -1. summary() clamps that to 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Leviathan, leviCourse, leviSettings, FIGHT, autoLevi } from '../src/sim/leviathan.mjs';
import { Race } from '../src/sim/race-sim.mjs';
import { trace, traceBody, assertSameTrace, matchFixture, tickBound, secondsTicks, BUCKET_TICKS } from './sim-trace.mjs';

const FIXTURE = new URL('./fixtures/leviathan-replay.json', import.meta.url);
const SCRIPT = { difficulty: 'normal', seed: 11, steer: true };

function leviState(L, race) {
  const b = L.me;
  return {
    hull: L.hull, hp: L.hp, phase: L.phase, st: L.st, shots: L.shots, hits: L.hits,
    won: L.won, over: L.over, t: race.lapT, bx: b.x, bz: b.z, bh: b.h, boostE: b.boostE,
  };
}

function runLevi({ difficulty, seed, steer = true, maxTicks, tape = null }) {
  const course = leviCourse();
  const race = new Race(leviSettings(course), course);
  const L = new Leviathan(race, { difficulty, seed });
  const inp = { steer: 0, brake: 0, boost: 0 };
  const tr = trace({
    maxTicks,
    step(i) {
      if (tape) {
        const s = tape[i];
        inp.steer = s.steer; inp.brake = s.brake; inp.boost = s.boost;
      } else if (steer) L.pilot(inp);
      const input = { steer: inp.steer, brake: inp.brake, boost: inp.boost };
      race.step(inp.steer, inp.brake, inp.boost);
      L.step();
      const events = race.events.slice();
      race.events.length = 0;
      const state = leviState(L, race);
      const problem = L.hull < 0 ? { hull: L.hull } : null;
      return { over: L.over, t: race.lapT, input, eventCount: events.length, state, problem, record: { events, state } };
    },
    row(s) { return { hull: s.hull, ammo: null, flares: null, phase: s.phase }; },
  });
  tr.summary = L.summary();
  tr.won = L.won;
  tr.steps = race.step_;
  return tr;
}

test('stand-in replay matches the golden trace, a restart matches, and the steer tape replays', () => {
  const maxTicks = tickBound(FIGHT.capS);
  const live = runLevi({ ...SCRIPT, maxTicks });
  const again = runLevi({ ...SCRIPT, maxTicks });
  const fromTape = runLevi({ ...SCRIPT, maxTicks: live.tape.length, tape: live.tape });
  assert.equal(live.over, true);
  assert.equal(live.steps, live.ticks);
  assert.equal(live.problems.length, 0, JSON.stringify(live.problems[0]));
  assertSameTrace(live, again);
  assertSameTrace(live, fromTape);
  assert.deepEqual(live.summary, again.summary);
  assert.deepEqual(live.summary, fromTape.summary);
  assert.deepEqual(live.summary, autoLevi({ difficulty: 'normal', seed: 11, steer: true, maxS: 330 }).summary());
  matchFixture(FIXTURE, {
    regen: 'REGEN_SIM_FIXTURES=1 node --test tests/leviathan.test.mjs',
    about: 'Stand-in pilot on the Leviathan. One bucket is 120 ticks (1s). hash is sha256 of the JSON lines of events and state in that bucket, with every number rounded to 1e-4 so Node 22 and Node 24 agree. ammo and flares are null: this fight has neither stock. Regenerate on Node 22 with the regen command. Do not edit by hand.',
    sim: 'leviathan',
    bucketTicks: BUCKET_TICKS,
    script: SCRIPT,
    ticks: live.ticks,
    digest: live.digest,
    buckets: live.buckets,
    summary: live.summary,
  });
});

test('the same steer script with another seed changes the trace', () => {
  const maxTicks = secondsTicks(12);
  const live = runLevi({ difficulty: 'normal', seed: 11, steer: true, maxTicks });
  const otherStandIn = runLevi({ difficulty: 'normal', seed: 12, steer: true, maxTicks });
  const otherTape = runLevi({ difficulty: 'normal', seed: 12, steer: false, maxTicks: live.tape.length, tape: live.tape });
  assert.notEqual(live.digest, otherStandIn.digest);
  assert.notEqual(live.digest, otherTape.digest);
  assert.notEqual(JSON.stringify(traceBody(live)), JSON.stringify(traceBody(otherTape)));
});

for (const difficulty of ['easy', 'normal', 'hard']) {
  test(`leviathan ${difficulty}: the stand-in wins under the cap, which is only a runaway net, and a restart matches`, () => {
    const maxTicks = tickBound(FIGHT.capS);
    const won = runLevi({ difficulty, seed: 11, steer: true, maxTicks });
    const restart = runLevi({ difficulty, seed: 11, steer: true, maxTicks });
    assert.equal(won.over, true);
    assert.equal(won.won, true);
    assert.ok(won.ticks <= maxTicks, `safety net ${maxTicks}, ran ${won.ticks}`);
    assert.equal(won.problems.length, 0, JSON.stringify(won.problems[0]));
    assert.ok(won.summary.hull >= 0);
    assertSameTrace(won, restart);
    assert.deepEqual(won.summary, restart.summary);
  });

  test(`leviathan ${difficulty}: nobody at the wheel loses under the cap with hull at least 0`, () => {
    const maxTicks = tickBound(FIGHT.capS);
    const lost = runLevi({ difficulty, seed: 11, steer: false, maxTicks });
    assert.equal(lost.over, true);
    assert.equal(lost.won, false);
    assert.ok(lost.ticks <= maxTicks, `safety net ${maxTicks}, ran ${lost.ticks}`);
    assert.equal(lost.problems.length, 0, JSON.stringify(lost.problems[0]));
    assert.equal(lost.summary.finished, true);
    assert.ok(lost.summary.hull >= 0);
  });
}

// Seeds 1 through 40, hard, stand-in at the wheel. Tide damage is 2, so hull 1 becomes -1.
// Measured on Node 22 and Node 24: seeds 10, 15, 27 and 38. summary() reports 0.
const SWEEP = Array.from({ length: 40 }, (_, i) => i + 1);

function watchLevi(seed) {
  const course = leviCourse();
  const race = new Race(leviSettings(course), course);
  const L = new Leviathan(race, { difficulty: 'hard', seed });
  const inp = { steer: 0, brake: 0, boost: 0 };
  const maxTicks = tickBound(FIGHT.capS);
  let minHull = L.hull, ticks = 0;
  for (; ticks < maxTicks && !L.over; ticks++) {
    L.pilot(inp);
    race.step(inp.steer, inp.brake, inp.boost); L.step(); race.events.length = 0;
    if (L.hull < minHull) minHull = L.hull;
  }
  return { ticks, over: L.over, won: L.won, minHull, summaryHull: L.summary().hull, maxTicks };
}

test('leviathan hard seeds 1..40: raw hull reaches -1 on seeds 10, 15, 27 and 38, and the summary clamps it to 0', () => {
  const negative = [];
  for (const seed of SWEEP) {
    const row = watchLevi(seed);
    assert.equal(row.over, true, `seed ${seed} did not finish`);
    assert.ok(row.ticks <= row.maxTicks, `seed ${seed} safety net ${row.maxTicks}, ran ${row.ticks}`);
    assert.ok(row.minHull >= -1, `seed ${seed} hull ${row.minHull}`);
    assert.ok(row.summaryHull >= 0, `seed ${seed} summary hull ${row.summaryHull}`);
    if (row.minHull < 0) {
      negative.push(seed);
      assert.equal(row.minHull, -1, `seed ${seed}`);
      assert.equal(row.summaryHull, 0, `seed ${seed}`);
      assert.equal(row.won, false, `seed ${seed}`);
    }
  }
  assert.deepEqual(negative, [10, 15, 27, 38]);
});
