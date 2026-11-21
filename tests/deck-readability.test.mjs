// Readable targets for Coastal Run: Iron Hawk. The picture may change. The fight may not.
// sim-diff compares the stand-in gunner with fixed seeds to the summaries captured from main.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DeckFight, hawkCourse, hawkSettings, DECK, HAWK, autoDeck } from '../src/sim/deck.mjs';
import { Race } from '../src/sim/race-sim.mjs';
import { deckRange, damageChip, laneLook, passCountdown, threatEdge, impactRing, HULL_NEUTRAL, hullReadsNeutral, DECK_EYE, STAGGER_LIFT, openingAim, acquireAim, aimOffHawk, hawkMarker, chipWorldScale } from '../src/ui/deck-hud.mjs';

const LOCKED = ['nearD: 72', 'mul: 0.35', 'dmg: 0.5', 'dmg: 0.36', 'dmg: 0.12', 'aimS: 1.9', 'stagger: 80', 'stunS: 6.5', 'stunMul: 1.6', 'need: 6', 'graceS: 1.6'];

function fight() {
  const race = new Race(hawkSettings(hawkCourse()), hawkCourse());
  const F = new DeckFight(race, { difficulty: 'normal', seed: 5 });
  F.race.t = F.race.go;
  return F;
}

test('deck combat numbers stay the literals main shipped', () => {
  const src = readFileSync(new URL('../src/sim/deck.mjs', import.meta.url), 'utf8');
  for (const bit of LOCKED) assert.ok(src.includes(bit), bit);
  assert.equal(DECK.nearD, 72);
  assert.equal(DECK.far.mul, 0.35);
  assert.equal(DECK.pod.dmg, 0.5);
  assert.equal(DECK.tail.dmg, 0.36);
  assert.equal(DECK.body.dmg, 0.12);
});

test('sim-diff 0: autoDeck summaries match main', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/deck-sim-main.json', import.meta.url), 'utf8'));
  let diff = 0;
  const missed = [];
  for (const row of fixture.runs) {
    const got = autoDeck({ difficulty: row.difficulty, seed: row.seed, skill: row.skill, maxS: 260 }).summary();
    for (const key of Object.keys(row.summary)) {
      if (got[key] !== row.summary[key]) {
        diff++;
        missed.push(`${row.difficulty}/${row.seed}/${row.skill} ${key}: ${got[key]} != ${row.summary[key]}`);
      }
    }
  }
  assert.equal(diff, 0, missed.slice(0, 8).join('; '));
  assert.equal(fixture.runs.length, 18);
});

test('the crosshair names TOO FAR past nearD and clears inside it', () => {
  const F = fight();
  F.r = DECK.far.r; F.y = DECK.far.y; F.place();
  const far = deckRange(F);
  assert.equal(far.far, true);
  assert.equal(far.label, 'TOO FAR 35%');
  assert.ok(far.dist > DECK.nearD);
  F.r = 18; F.y = 12; F.place();
  const near = deckRange(F);
  assert.equal(near.far, false);
  assert.equal(near.label, '');
  assert.ok(near.dist <= DECK.nearD);
  assert.equal(near.pct, 35);
});

test('a weak-spot chip is larger and gold than a body chip', () => {
  const F = fight();
  F.st = 'pass'; F.r = 20; F.y = 12;
  const pod = damageChip(F, 'pod', 30);
  const tail = damageChip(F, 'tail', 30);
  const body = damageChip(F, 'body', 30);
  assert.equal(pod.gold, true);
  assert.equal(tail.gold, true);
  assert.equal(body.gold, false);
  assert.ok(pod.scale > body.scale);
  assert.ok(tail.scale > body.scale);
  assert.equal(pod.text, '0.50');
  assert.equal(tail.text, '0.36');
  assert.equal(body.text, '0.12');
  assert.equal(damageChip(F, 'pod', DECK.nearD + 8).text, '0.18');
  assert.equal(damageChip(F, 'rocket', 10), null);
  F.st = 'crip';
  assert.equal(damageChip(F, 'pod', 10), null);
});

test('the pass lane stays at least half opaque, and a calm picture does not pulse the edge', () => {
  let low = 1;
  for (let i = 0; i < 40; i++) {
    const look = laneLook(i * 0.17, false);
    low = Math.min(low, look.lane);
    assert.ok(look.lane >= 0.5);
    assert.ok(look.edge >= 0.38);
  }
  assert.ok(low >= 0.5);
  const a = laneLook(0.2, true), b = laneLook(3.7, true);
  assert.ok(a.lane >= 0.5);
  assert.equal(a.edge, b.edge);
  assert.equal(a.lane, b.lane);
});

test('the pass countdown ticks 3 then 2 then 1 and then stops', () => {
  const F = fight();
  F.r = DECK.far.r; F.y = 26; F.struck = false; F.broken = false; F.over = false;
  F.st = 'aim'; F.t = 0;
  assert.equal(passCountdown(F).n, 0);
  F.t = 0.85;
  assert.equal(passCountdown(F).label, '3');
  F.t = 1.7;
  assert.equal(passCountdown(F).label, '2');
  F.st = 'pass'; F.t = 0; F.r0 = DECK.far.r;
  assert.equal(passCountdown(F).label, '2');
  F.t = 0.9;
  assert.equal(passCountdown(F).label, '1');
  F.t = 1.8;
  assert.equal(passCountdown(F).n, 0);
  F.st = 'orbit';
  assert.equal(passCountdown(F).label, '');
});

test('the opening sight is on the hawk and the sim bearing is untouched', () => {
  const F = fight();
  const th = F.th;
  F.place();
  const aim = openingAim(F);
  assert.ok(aimOffHawk(F, aim.ay, aim.ap) < 0.02);
  const held = acquireAim(F, false);
  assert.ok(aimOffHawk(F, held.ay, held.ap) < 0.02);
  assert.equal(acquireAim(F, true), null);
  assert.equal(F.th, th);
  assert.equal(th, 0.9);
  assert.equal(HAWK.gun.up, 3);
  assert.ok(DECK_EYE.up > 1);
  assert.notEqual(DECK_EYE.side, 0);
  assert.ok(STAGGER_LIFT > 9);
});

test('the hull fallback is blue-grey and a side hawk gets a HAWK tag', () => {
  assert.equal(hullReadsNeutral(HULL_NEUTRAL), true);
  assert.equal(hullReadsNeutral(0x3d4a3f), false);
  assert.equal(hawkMarker({ x: 0, y: 0, behind: false }).on, false);
  const side = hawkMarker({ x: 0.7, y: 0.1, behind: false });
  assert.equal(side.on, true);
  assert.equal(side.label, 'HAWK');
  assert.ok(side.left > 70 || side.left < 30);
  const weak = chipWorldScale(true, 100), body = chipWorldScale(false, 100);
  assert.ok(weak.x > body.x);
  assert.ok(weak.x > 8);
});

test('deck layout keeps the race count off the sight and the clock hidden', () => {
  const css = readFileSync(new URL('../css/game.css', import.meta.url), 'utf8');
  const clock = css.split('}').find((block) => block.includes('#hud.deck #h-clock') && block.includes('#hud.deck #h-time'));
  assert.ok(clock);
  assert.match(clock, /display:\s*none/);
  const count = css.split('}').find((block) => block.includes('#hud.deck #h-count') && block.includes('transform: none'));
  assert.ok(count);
  assert.match(count, /left:\s*calc\(16px/);
  assert.doesNotMatch(count, /top:\s*46%/);
  assert.match(css, /#deck-range \{[^}]*top:\s*54px/);
  const main = readFileSync(new URL('../src/main.mjs', import.meta.url), 'utf8');
  assert.match(main, /setText\('h-time', 'time', ''\)/);
  assert.doesNotMatch(main.slice(main.indexOf('function paintDeck'), main.indexOf('function paintDeckReadout')), /lapT/);
});

test('an off-screen rocket gets an edge arrow and a closing ring', () => {
  assert.equal(threatEdge({ x: 0.2, y: -0.3, behind: false }).off, false);
  const right = threatEdge({ x: 4, y: 0, behind: false });
  assert.equal(right.off, true);
  assert.ok(right.left > 80);
  assert.ok(Math.abs(right.angle - 90) < 0.01);
  const behind = threatEdge({ x: 2, y: 0.1, behind: true });
  assert.equal(behind.off, true);
  assert.ok(behind.left < 20);
  const early = impactRing(0.2, 2), late = impactRing(1.6, 2);
  assert.ok(late.remain < early.remain);
  assert.ok(early.remain > 0.8);
  assert.ok(late.remain < 0.3);
});
