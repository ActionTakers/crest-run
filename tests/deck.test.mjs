// Iron Hawk (Coastal Run) fixed-seed replay. The stand-in gunner is the input script.
// Golden buckets: tests/fixtures/deck-replay.json
// Regenerate: REGEN_SIM_FIXTURES=1 node --test tests/deck.test.mjs
// That command rewrites deck-replay.json only. tests/fixtures/deck-sim-main.json stays as it is.
// The gunner draws its aim error from the fight's mulberry stream (DeckFight.rnd). A captured aim tape
// replayed on a new fight, without those draws, is not the same run. The replay that matches is a new
// DeckFight with the same seed and the same gunner calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DeckFight, hawkCourse, hawkSettings, DECK, autoDeck } from '../src/sim/deck.mjs';
import { Race } from '../src/sim/race-sim.mjs';
import { trace, traceBody, assertSameTrace, matchFixture, tickBound, secondsTicks, BUCKET_TICKS } from './sim-trace.mjs';

const FIXTURE = new URL('./fixtures/deck-replay.json', import.meta.url);
const SCRIPT = { difficulty: 'normal', seed: 5, skill: 0.8 };

function deckState(F, race) {
  const b = F.me;
  return {
    hull: F.hull, mag: F.mag, flares: F.flares, hp: F.hp, st: F.st, half: F.half,
    shots: F.shots, hits: F.hits, won: F.won, over: F.over, t: race.lapT,
    x: F.x, y: F.y, z: F.z, r: F.r, bx: b.x, bz: b.z, bh: b.h,
  };
}

function runDeck({ difficulty, seed, skill = 0.8, maxTicks, tape = null }) {
  const course = hawkCourse();
  const race = new Race(hawkSettings(course), course);
  const F = new DeckFight(race, { difficulty, seed });
  const inp = { steer: 0, brake: 0, boost: 0 };
  const tr = trace({
    maxTicks,
    step(i) {
      if (tape) {
        const s = tape[i];
        inp.steer = s.steer; inp.brake = s.brake; inp.boost = s.boost;
        F.input.ay = s.ay; F.input.ap = s.ap; F.input.fire = s.fire; F.input.flare = s.flare;
      } else {
        F.pilot(inp);
        if (skill !== null) F.gunner(skill);
      }
      const input = {
        steer: inp.steer, brake: inp.brake, boost: inp.boost,
        ay: F.input.ay, ap: F.input.ap, fire: F.input.fire, flare: F.input.flare,
      };
      race.step(inp.steer, inp.brake, inp.boost);
      F.step();
      const events = race.events.slice();
      race.events.length = 0;
      const state = deckState(F, race);
      const problem = F.hull < 0 || F.mag < 0 || F.flares < 0
        ? { hull: F.hull, ammo: F.mag, flares: F.flares } : null;
      return { over: F.over, t: race.lapT, input, eventCount: events.length, state, problem, record: { events, state } };
    },
    row(s) { return { hull: s.hull, ammo: s.mag, flares: s.flares }; },
  });
  tr.summary = F.summary();
  tr.won = F.won;
  tr.steps = race.step_;
  return tr;
}

test('stand-in replay matches the golden trace, and a second run is byte-identical', () => {
  const maxTicks = tickBound(DECK.capS);
  const live = runDeck({ ...SCRIPT, maxTicks });
  const again = runDeck({ ...SCRIPT, maxTicks });
  assert.equal(live.over, true);
  assert.equal(live.steps, live.ticks);
  assert.equal(live.problems.length, 0, JSON.stringify(live.problems[0]));
  assertSameTrace(live, again);
  assert.deepEqual(live.summary, again.summary);
  assert.deepEqual(live.summary, autoDeck({ ...SCRIPT, maxS: 260 }).summary());
  matchFixture(FIXTURE, {
    regen: 'REGEN_SIM_FIXTURES=1 node --test tests/deck.test.mjs',
    about: 'Stand-in gunner on Iron Hawk. One bucket is 120 ticks (1s). hash is sha256 of the JSON lines of events and state in that bucket. Every number in those lines is rounded to 1e-4 so Node 22 and Node 24 (V8 13.6) agree. Regenerate on Node 22 with the regen command. Do not edit by hand, and do not regenerate tests/fixtures/deck-sim-main.json from here.',
    sim: 'deck',
    bucketTicks: BUCKET_TICKS,
    script: SCRIPT,
    ticks: live.ticks,
    digest: live.digest,
    buckets: live.buckets,
    summary: live.summary,
  });
});

test('a different seed changes the trace, so the seed is used', () => {
  const maxTicks = secondsTicks(12);
  const a = runDeck({ difficulty: 'normal', seed: 5, skill: 0.8, maxTicks });
  const b = runDeck({ difficulty: 'normal', seed: 6, skill: 0.8, maxTicks });
  assert.equal(a.ticks, b.ticks);
  assert.notEqual(a.digest, b.digest);
  assert.notEqual(JSON.stringify(traceBody(a)), JSON.stringify(traceBody(b)));
});

test('a captured aim tape is not a deck replay, because the gunner draws from the fight seed', () => {
  const maxTicks = secondsTicks(12);
  const live = runDeck({ difficulty: 'normal', seed: 5, skill: 0.8, maxTicks });
  const replayed = runDeck({ difficulty: 'normal', seed: 5, skill: null, maxTicks: live.tape.length, tape: live.tape });
  assert.equal(live.tape.length, maxTicks);
  assert.notEqual(live.digest, replayed.digest);
});

for (const difficulty of ['easy', 'normal', 'hard']) {
  test(`deck ${difficulty}: the stand-in wins under the cap, which is only a runaway net, and a restart matches`, () => {
    const maxTicks = tickBound(DECK.capS);
    const won = runDeck({ difficulty, seed: 5, skill: 0.8, maxTicks });
    const restart = runDeck({ difficulty, seed: 5, skill: 0.8, maxTicks });
    assert.equal(won.over, true);
    assert.equal(won.won, true);
    assert.ok(won.ticks <= maxTicks, `safety net ${maxTicks}, ran ${won.ticks}`);
    assert.equal(won.problems.length, 0, JSON.stringify(won.problems[0]));
    assert.ok(won.summary.hull >= 0);
    assert.ok(won.summary.flares >= 0);
    assertSameTrace(won, restart);
    assert.deepEqual(won.summary, restart.summary);
  });

  test(`deck ${difficulty}: an idle gun loses under the cap, with hull, ammo and flares at least 0`, () => {
    const maxTicks = tickBound(DECK.capS);
    const lost = runDeck({ difficulty, seed: 5, skill: null, maxTicks });
    assert.equal(lost.over, true);
    assert.equal(lost.won, false);
    assert.ok(lost.ticks <= maxTicks, `safety net ${maxTicks}, ran ${lost.ticks}`);
    assert.equal(lost.problems.length, 0, JSON.stringify(lost.problems[0]));
    assert.equal(lost.summary.finished, true);
    assert.ok(lost.summary.hull >= 0);
    assert.ok(lost.summary.flares >= 0);
  });
}

// Seeds 1 through 40, hard, stand-in gunner. No golden hashes: counters only.
const SWEEP = Array.from({ length: 40 }, (_, i) => i + 1);

function watchDeck(seed) {
  const course = hawkCourse();
  const race = new Race(hawkSettings(course), course);
  const F = new DeckFight(race, { difficulty: 'hard', seed });
  const inp = { steer: 0, brake: 0, boost: 0 };
  const maxTicks = tickBound(DECK.capS);
  let minHull = F.hull, minMag = F.mag, minFlares = F.flares, ticks = 0;
  for (; ticks < maxTicks && !F.over; ticks++) {
    F.pilot(inp); F.gunner(0.8);
    race.step(inp.steer, inp.brake, inp.boost); F.step(); race.events.length = 0;
    if (F.hull < minHull) minHull = F.hull;
    if (F.mag < minMag) minMag = F.mag;
    if (F.flares < minFlares) minFlares = F.flares;
  }
  return { ticks, over: F.over, won: F.won, minHull, minMag, minFlares, maxTicks };
}

test('deck hard seeds 1..40: hull, ammo and flares stay non-negative, and each fight ends under the cap', () => {
  for (const seed of SWEEP) {
    const row = watchDeck(seed);
    assert.equal(row.over, true, `seed ${seed} did not finish`);
    assert.ok(row.ticks <= row.maxTicks, `seed ${seed} safety net ${row.maxTicks}, ran ${row.ticks}`);
    assert.ok(row.minHull >= 0, `seed ${seed} hull ${row.minHull}`);
    assert.ok(row.minMag >= 0, `seed ${seed} ammo ${row.minMag}`);
    assert.ok(row.minFlares >= 0, `seed ${seed} flares ${row.minFlares}`);
  }
});
