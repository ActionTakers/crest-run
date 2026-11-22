// Shared runner for the fixed-seed fight traces. Not a test file: `node --test tests/*.test.mjs` does not load it on its own.
// A bucket is one second (120 steps of DT). The hash is sha256 of that bucket's event JSON and the state at each step.
// Regenerate a fixture with REGEN_SIM_FIXTURES=1 node --test tests/<sim>.test.mjs
// That flag rewrites only the fixture the test asks for. It does not touch tests/fixtures/deck-sim-main.json.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { DT, COUNTDOWN_S } from '../src/sim/race-sim.mjs';

export const BUCKET_TICKS = 120;

export function tickBound(capS) {
  return Math.ceil((COUNTDOWN_S + capS) / DT) + 2;
}

export function secondsTicks(seconds) {
  return Math.round(seconds / DT);
}

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

// step(i) returns { over, t, input, record, eventCount, state, problem }.
// record is one canonical line (events + state) for that tick. row(state) is the small fixture summary.
export function trace({ maxTicks, bucketTicks = BUCKET_TICKS, step, row }) {
  let pending = [];
  let eventCount = 0;
  const buckets = [];
  const tape = [];
  const problems = [];
  let ticks = 0;
  let over = false;
  for (; ticks < maxTicks; ticks++) {
    const frame = step(ticks);
    if (frame.problem) problems.push({ tick: ticks + 1, problem: frame.problem });
    if (frame.input) tape.push(frame.input);
    pending.push(frame.record);
    eventCount += frame.eventCount;
    if (pending.length === bucketTicks || frame.over) {
      buckets.push({
        tick: ticks + 1,
        hash: sha256(pending.join('\n')),
        t: Math.round(frame.t * 100) / 100,
        events: eventCount,
        ...row(frame.state),
      });
      pending = [];
      eventCount = 0;
    }
    if (frame.over) { over = true; ticks += 1; break; }
  }
  return {
    ticks,
    over,
    buckets,
    digest: sha256(buckets.map((b) => b.hash).join('\n')),
    tape,
    problems,
  };
}

export function traceBody(tr) {
  return { ticks: tr.ticks, over: tr.over, digest: tr.digest, buckets: tr.buckets };
}

export function assertSameTrace(a, b) {
  assert.equal(a.digest, b.digest);
  assert.equal(JSON.stringify(traceBody(a)), JSON.stringify(traceBody(b)));
}

export function matchFixture(fileUrl, payload) {
  const text = JSON.stringify(payload, null, 2) + '\n';
  if (process.env.REGEN_SIM_FIXTURES === '1') writeFileSync(fileUrl, text);
  let disk;
  try { disk = readFileSync(fileUrl, 'utf8'); }
  catch { assert.fail(`missing ${fileUrl.pathname}. Regenerate with REGEN_SIM_FIXTURES=1 node --test and the test file that owns this fixture.`); }
  const saved = JSON.parse(disk);
  assert.equal(saved.digest, payload.digest, 'fixture digest');
  assert.equal(disk, text);
}
