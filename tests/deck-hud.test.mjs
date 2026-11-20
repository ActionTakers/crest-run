// Coastal Run: Iron Hawk HUD. The snapshot is the deck's own fields. Restart staying in deck mode is covered
// with the game harness in tests/bay-ui-lifecycle.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DeckFight, hawkCourse, hawkSettings, DECK, COASTAL_NAME } from '../src/sim/deck.mjs';
import { Race } from '../src/sim/race-sim.mjs';
import { freshSave, applyRescue } from '../src/sim/progress.mjs';
import { deckGoal, deckHudSnapshot, hullMarks, armourMarks } from '../src/ui/deck-hud.mjs';

const RACE_FIELDS = ['taken', 'place', 'gap', 'lap', 'boost', 'kmh', 'speed', 'chain', 'position'];

function fight() {
  const race = new Race(hawkSettings(hawkCourse()), hawkCourse());
  const F = new DeckFight(race, { difficulty: 'normal', seed: 5 });
  F.race.t = F.race.go;
  return F;
}

test('deck HUD snapshot uses hull, ammo, flares and hawk armour, and omits race fields', () => {
  const F = fight();
  F.hull = 3; F.mag = 36; F.flares = 3; F.hp = F.hpMax * 0.75; F.shots = 4; F.st = 'orbit';
  const snap = deckHudSnapshot(F);
  assert.equal(snap.title, COASTAL_NAME);
  assert.equal(snap.title, 'Coastal Run: Iron Hawk');
  assert.equal(snap.mode, 'deck');
  assert.equal(snap.hull, 'HULL ' + hullMarks(3, DECK.hull));
  assert.equal(snap.hull, 'HULL \u25CF\u25CF\u25CF\u25CB\u25CB');
  assert.equal(snap.ammo, 'AMMO 36');
  assert.equal(snap.flares, 'FLARES 3');
  assert.equal(snap.armour, 'HAWK ARMOUR ' + armourMarks(0.75));
  assert.equal(snap.armour, 'HAWK ARMOUR \u25AE\u25AE\u25AE\u25AF');
  assert.equal(snap.hullMax, DECK.hull);
  assert.equal(snap.reloading, false);
  for (const key of RACE_FIELDS) assert.equal(Object.hasOwn(snap, key), false, key);
  assert.doesNotMatch(JSON.stringify(snap), /TAKEN|\bLAP\b|behind|ahead|km\/h|BOOST/);
});

test('the goal line stays until that objective is fulfilled', () => {
  const F = fight();
  F.st = 'aim'; F.podHits = 2; F.broken = false; F.struck = false; F.shots = 1;
  const aimed = deckGoal(F);
  assert.match(aimed, /BREAK THE PASS: 2 OF \d+ HITS ON THE GUN POD/);
  F.race.t += 8;
  assert.equal(deckGoal(F), aimed);
  assert.equal(deckHudSnapshot(F).goal, aimed);
  F.podHits = 3;
  const later = deckGoal(F);
  assert.match(later, /BREAK THE PASS: 3 OF/);
  assert.notEqual(later, '');
  F.broken = true; F.st = 'orbit'; F.shots = 6;
  const done = deckGoal(F);
  assert.equal(done, 'KEEP THE MAGAZINE FOR ITS LOW PASS');
  assert.notEqual(done, aimed);
  F.rockets[0].on = true;
  const rockets = deckGoal(F);
  assert.equal(rockets, 'SHOOT THE ROCKETS DOWN');
  assert.equal(deckGoal(F), rockets);
  F.rockets[0].on = false;
  assert.equal(deckGoal(F), done);
});

test('a deck result remembers mode deck and a rescue result stays rescue', () => {
  const deckSave = applyRescue(freshSave(), {
    mode: 'deck', course: 'hawk', tune: 'cruise', livery: 'pearl', difficulty: 'normal',
    finished: false, saved: 0, total: 100, time: null, medal: null,
  }).save;
  assert.equal(deckSave.last.mode, 'deck');
  const rescueSave = applyRescue(freshSave(), {
    mode: 'rescue', course: 'alpaca', tune: 'cruise', livery: 'pearl', difficulty: 'normal',
    finished: false, saved: 0, total: 9, time: null, medal: null,
  }).save;
  assert.equal(rescueSave.last.mode, 'rescue');
});
