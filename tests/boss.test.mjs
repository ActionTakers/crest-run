// World Dragon fixed-seed replay. The stand-in pilot is the input script, and it does not draw from the fight seed,
// so the recorded steer/brake/boost tape replays on a new Boss with the same seed.
// Golden buckets: tests/fixtures/boss-replay.json
// Regenerate: REGEN_SIM_FIXTURES=1 node --test tests/boss.test.mjs
// There is no ammo or flare stock. Hull is the rationed resource. The cannon draws from a fixed shell pool.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Boss, dragonCourse, bossSettings, BOSS, autoBoss } from '../src/sim/boss.mjs';
import { Race } from '../src/sim/race-sim.mjs';
import { trace, traceBody, assertSameTrace, matchFixture, tickBound, secondsTicks, BUCKET_TICKS } from './sim-trace.mjs';

const FIXTURE = new URL('./fixtures/boss-replay.json', import.meta.url);
const SCRIPT = { difficulty: 'normal', seed: 9, steer: true };

function bossState(B, race) {
  const b = B.me;
  return {
    hull: B.hull, broken: B.broken, shots: B.shots, hits: B.hits, taken: B.taken,
    won: B.won, over: B.over, t: race.lapT, bx: b.x, bz: b.z, bh: b.h, boostE: b.boostE,
  };
}

function runBoss({ difficulty, seed, steer = true, maxTicks, tape = null }) {
  const course = dragonCourse();
  const race = new Race(bossSettings(course), course);
  const B = new Boss(race, { difficulty, seed });
  const inp = { steer: 0, brake: 0, boost: 0 };
  const tr = trace({
    maxTicks,
    step(i) {
      if (tape) {
        const s = tape[i];
        inp.steer = s.steer; inp.brake = s.brake; inp.boost = s.boost;
      } else if (steer) B.pilot(inp);
      const input = { steer: inp.steer, brake: inp.brake, boost: inp.boost };
      race.step(inp.steer, inp.brake, inp.boost);
      B.step();
      const events = race.events.slice();
      race.events.length = 0;
      const state = bossState(B, race);
      const problem = B.hull < 0 ? { hull: B.hull } : null;
      return { over: B.over, t: race.lapT, input, eventCount: events.length, state, problem, record: JSON.stringify({ events, state }) };
    },
    row(s) { return { hull: s.hull, ammo: null, flares: null, broken: s.broken }; },
  });
  tr.summary = B.summary();
  tr.won = B.won;
  tr.steps = race.step_;
  return tr;
}

test('stand-in replay matches the golden trace, a restart matches, and the steer tape replays', () => {
  const maxTicks = tickBound(BOSS.capS);
  const live = runBoss({ ...SCRIPT, maxTicks });
  const again = runBoss({ ...SCRIPT, maxTicks });
  const fromTape = runBoss({ ...SCRIPT, maxTicks: live.tape.length, tape: live.tape });
  assert.equal(live.over, true);
  assert.equal(live.steps, live.ticks);
  assert.equal(live.problems.length, 0, JSON.stringify(live.problems[0]));
  assertSameTrace(live, again);
  assertSameTrace(live, fromTape);
  assert.deepEqual(live.summary, again.summary);
  assert.deepEqual(live.summary, fromTape.summary);
  assert.deepEqual(live.summary, autoBoss({ difficulty: 'normal', seed: 9, steer: true, maxS: 300 }).summary());
  matchFixture(FIXTURE, {
    regen: 'REGEN_SIM_FIXTURES=1 node --test tests/boss.test.mjs',
    about: 'Stand-in pilot on the World Dragon. One bucket is 120 ticks (1s). hash is sha256 of the JSON lines of events and state in that bucket. ammo and flares are null: this fight has neither stock. Regenerate with the regen command. Do not edit by hand.',
    sim: 'boss',
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
  const live = runBoss({ difficulty: 'normal', seed: 9, steer: true, maxTicks });
  const otherStandIn = runBoss({ difficulty: 'normal', seed: 10, steer: true, maxTicks });
  const otherTape = runBoss({ difficulty: 'normal', seed: 10, steer: false, maxTicks: live.tape.length, tape: live.tape });
  assert.notEqual(live.digest, otherStandIn.digest);
  assert.notEqual(live.digest, otherTape.digest);
  assert.notEqual(JSON.stringify(traceBody(live)), JSON.stringify(traceBody(otherTape)));
});

for (const difficulty of ['easy', 'normal', 'hard']) {
  test(`boss ${difficulty}: the stand-in wins inside the tick bound and a restart matches`, () => {
    const maxTicks = tickBound(BOSS.capS);
    const won = runBoss({ difficulty, seed: 9, steer: true, maxTicks });
    const restart = runBoss({ difficulty, seed: 9, steer: true, maxTicks });
    assert.equal(won.over, true);
    assert.equal(won.won, true);
    assert.ok(won.ticks <= maxTicks, `${won.ticks} > ${maxTicks}`);
    assert.equal(won.problems.length, 0, JSON.stringify(won.problems[0]));
    assert.ok(won.summary.hull >= 0);
    assertSameTrace(won, restart);
    assert.deepEqual(won.summary, restart.summary);
  });

  test(`boss ${difficulty}: nobody at the wheel loses inside the tick bound with hull at least 0`, () => {
    const maxTicks = tickBound(BOSS.capS);
    const lost = runBoss({ difficulty, seed: 9, steer: false, maxTicks });
    assert.equal(lost.over, true);
    assert.equal(lost.won, false);
    assert.ok(lost.ticks <= maxTicks, `${lost.ticks} > ${maxTicks}`);
    assert.equal(lost.problems.length, 0, JSON.stringify(lost.problems[0]));
    assert.equal(lost.summary.finished, true);
    assert.ok(lost.summary.hull >= 0);
  });
}
