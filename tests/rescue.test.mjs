// Llama Island rescue fixed-seed replay. The stand-in pilot does not draw from the fight seed, so a recorded
// steer/brake/boost tape replays on a new Rescue with the same seed.
// Golden buckets: tests/fixtures/rescue-replay.json
// Regenerate: REGEN_SIM_FIXTURES=1 node --test tests/rescue.test.mjs
// This mission has no player hull, ammo or flares. saved and lost stay non-negative. A ram calls hurt(shark, 99)
// and does not clamp, so a dead shark's hp goes to -96 (full hard hp 3) or -97 (already hit once). The invariant
// is the living sharks only: not dead and not gone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Rescue, arenaCourse, rescueSettings, RESCUE, S, autoRescue } from '../src/sim/rescue.mjs';
import { Race } from '../src/sim/race-sim.mjs';
import { trace, traceBody, assertSameTrace, matchFixture, tickBound, secondsTicks, BUCKET_TICKS } from './sim-trace.mjs';

const FIXTURE = new URL('./fixtures/rescue-replay.json', import.meta.url);
const SCRIPT = { difficulty: 'normal', seed: 5, skill: 1 };

function sharkFloors(R) {
  let live = null, dead = null;
  for (const s of R.sharks) {
    if (s.st === S.dead || s.st === S.gone) { if (dead === null || s.hp < dead) dead = s.hp; }
    else if (live === null || s.hp < live) live = s.hp;
  }
  return { live, dead };
}

function rescueState(R, race) {
  const b = R.me;
  const floors = sharkFloors(R);
  return {
    saved: R.saved, lost: R.lost, sunk: R.sunk, shots: R.shots, hits: R.hits, rams: R.rams,
    liveHp: floors.live, over: R.over, t: race.lapT, bx: b.x, bz: b.z, bh: b.h, boostE: b.boostE,
  };
}

function runRescue({ difficulty, seed, skill = 1, maxTicks, tape = null }) {
  const course = arenaCourse();
  const race = new Race(rescueSettings(course), course);
  const R = new Rescue(race, { difficulty, seed });
  const inp = { steer: 0, brake: 0, boost: 0 };
  const tr = trace({
    maxTicks,
    step(i) {
      if (tape) {
        const s = tape[i];
        inp.steer = s.steer; inp.brake = s.brake; inp.boost = s.boost;
      } else if (skill > 0) R.pilot(inp, skill);
      const input = { steer: inp.steer, brake: inp.brake, boost: inp.boost };
      race.step(inp.steer, inp.brake, inp.boost);
      R.step();
      const events = race.events.slice();
      race.events.length = 0;
      const state = rescueState(R, race);
      const problem = R.saved < 0 || R.lost < 0 || (state.liveHp !== null && state.liveHp < 0)
        ? { saved: R.saved, lost: R.lost, liveHp: state.liveHp } : null;
      return { over: R.over, t: race.lapT, input, eventCount: events.length, state, problem, record: { events, state } };
    },
    row(s) { return { hull: null, ammo: null, flares: null, saved: s.saved, lost: s.lost }; },
  });
  tr.summary = R.summary();
  tr.steps = race.step_;
  tr.saved = R.saved;
  tr.lost = R.lost;
  tr.total = R.total;
  return tr;
}

test('stand-in replay matches the golden trace, a restart matches, and the steer tape replays', () => {
  const maxTicks = tickBound(RESCUE.capS);
  const live = runRescue({ ...SCRIPT, maxTicks });
  const again = runRescue({ ...SCRIPT, maxTicks });
  const fromTape = runRescue({ ...SCRIPT, maxTicks: live.tape.length, tape: live.tape });
  assert.equal(live.over, true);
  assert.equal(live.steps, live.ticks);
  assert.equal(live.problems.length, 0, JSON.stringify(live.problems[0]));
  assertSameTrace(live, again);
  assertSameTrace(live, fromTape);
  assert.deepEqual(live.summary, again.summary);
  assert.deepEqual(live.summary, fromTape.summary);
  assert.deepEqual(live.summary, autoRescue({ difficulty: 'normal', seed: 5, skill: 1, maxS: 320 }).summary());
  matchFixture(FIXTURE, {
    regen: 'REGEN_SIM_FIXTURES=1 node --test tests/rescue.test.mjs',
    about: 'Stand-in pilot on Llama Island. One bucket is 120 ticks (1s). hash is sha256 of the JSON lines of events and state in that bucket, with every number rounded to 1e-4 so Node 22 and Node 24 agree. hull, ammo and flares are null: the rescue has none. liveHp is the lowest hp among sharks that are not dead or gone. Regenerate on Node 22 with the regen command. Do not edit by hand.',
    sim: 'rescue',
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
  const live = runRescue({ difficulty: 'normal', seed: 5, skill: 1, maxTicks });
  const otherStandIn = runRescue({ difficulty: 'normal', seed: 6, skill: 1, maxTicks });
  const otherTape = runRescue({ difficulty: 'normal', seed: 6, skill: 0, maxTicks: live.tape.length, tape: live.tape });
  assert.notEqual(live.digest, otherStandIn.digest);
  assert.notEqual(live.digest, otherTape.digest);
  assert.notEqual(JSON.stringify(traceBody(live)), JSON.stringify(traceBody(otherTape)));
});

for (const difficulty of ['easy', 'normal', 'hard']) {
  test(`rescue ${difficulty}: the stand-in finishes under the cap, which is only a runaway net, and a restart matches`, () => {
    const maxTicks = tickBound(RESCUE.capS);
    const done = runRescue({ difficulty, seed: 5, skill: 1, maxTicks });
    const restart = runRescue({ difficulty, seed: 5, skill: 1, maxTicks });
    assert.equal(done.over, true);
    assert.equal(done.saved, done.total);
    assert.ok(done.ticks <= maxTicks, `safety net ${maxTicks}, ran ${done.ticks}`);
    assert.equal(done.problems.length, 0, JSON.stringify(done.problems[0]));
    assert.equal(done.summary.finished, true);
    assert.ok(done.summary.saved >= 0);
    assert.ok(done.summary.lost >= 0);
    assertSameTrace(done, restart);
    assert.deepEqual(done.summary, restart.summary);
  });

  test(`rescue ${difficulty}: nobody at the wheel ends the mission under the cap`, () => {
    const maxTicks = tickBound(RESCUE.capS);
    const lost = runRescue({ difficulty, seed: 5, skill: 0, maxTicks });
    assert.equal(lost.over, true);
    assert.ok(lost.saved < lost.total);
    assert.equal(lost.saved + lost.lost, lost.total);
    assert.equal(lost.summary.medal, null);
    assert.ok(lost.ticks <= maxTicks, `safety net ${maxTicks}, ran ${lost.ticks}`);
    assert.equal(lost.problems.length, 0, JSON.stringify(lost.problems[0]));
    assert.equal(lost.summary.finished, true);
    assert.ok(lost.summary.saved >= 0);
    assert.ok(lost.summary.lost >= 0);
  });
}

// Seeds 1 through 40, hard, stand-in at the wheel. A ram does not clamp. Measured on Node 22 and Node 24.
const SWEEP = Array.from({ length: 40 }, (_, i) => i + 1);
const RAMMED = { 10: -96, 26: -97, 37: -96 };

function watchRescue(seed) {
  const course = arenaCourse();
  const race = new Race(rescueSettings(course), course);
  const R = new Rescue(race, { difficulty: 'hard', seed });
  const inp = { steer: 0, brake: 0, boost: 0 };
  const maxTicks = tickBound(RESCUE.capS);
  let minLive = null, minDead = null, ticks = 0;
  for (; ticks < maxTicks && !R.over; ticks++) {
    R.pilot(inp, 1);
    race.step(inp.steer, inp.brake, inp.boost); R.step(); race.events.length = 0;
    const floors = sharkFloors(R);
    if (floors.live !== null && (minLive === null || floors.live < minLive)) minLive = floors.live;
    if (floors.dead !== null && (minDead === null || floors.dead < minDead)) minDead = floors.dead;
  }
  return { ticks, over: R.over, saved: R.saved, lost: R.lost, rams: R.rams, minLive, minDead, maxTicks };
}

test('rescue hard seeds 1..40: living sharks stay non-negative, and rams on seeds 10, 26 and 37 leave a dead hp of -96 or -97', () => {
  const rammed = [];
  for (const seed of SWEEP) {
    const row = watchRescue(seed);
    assert.equal(row.over, true, `seed ${seed} did not finish`);
    assert.ok(row.ticks <= row.maxTicks, `seed ${seed} safety net ${row.maxTicks}, ran ${row.ticks}`);
    assert.ok(row.saved >= 0 && row.lost >= 0, `seed ${seed}`);
    assert.ok(row.minLive === null || row.minLive >= 0, `seed ${seed} live hp ${row.minLive}`);
    if (row.rams > 0) {
      rammed.push(seed);
      assert.equal(row.minDead, RAMMED[seed], `seed ${seed} dead hp ${row.minDead}`);
    } else if (row.minDead !== null) assert.ok(row.minDead >= 0, `seed ${seed} dead hp ${row.minDead}`);
  }
  assert.deepEqual(rammed, [10, 26, 37]);
});
