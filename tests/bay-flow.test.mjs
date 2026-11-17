import test from 'node:test';
import assert from 'node:assert/strict';
import { BAY_SAVE_KEY, BAY_JOURNEYS, makeBaySave, bayProgress } from '../src/ui/bay-flow.mjs';
import { SAVE_KEY, freshSave, applyRescue, addLeaves } from '../src/sim/progress.mjs';
import { DT, Race } from '../src/sim/race-sim.mjs';
import { bayCourse, voyageSettings, makeVoyage, RULES } from '../src/sim/voyages.mjs';

const copy = (value) => structuredClone(value);
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}

function legacySave() {
  const old = freshSave();
  old.settings = { ...old.settings, steering: 'touch', sound: false, volume: 0.4, boat: 'yacht' };
  old.best = {
    'mk1:rescue': { saved: 2, total: 3, time: 125, tune: 'cruise', difficulty: 'normal' },
    'mk3:rescue': { saved: 0, total: 3, time: 300, tune: 'cruise', difficulty: 'normal' },
    'harbour:race': { time: 83, place: 1, tune: 'race' },
    'harbour:trial': { time: 79, ghost: { inputs: 'recorded-arcade-inputs', tune: 'race' } },
    'alpaca:rescue': { saved: 8, total: 8, time: 145, tune: 'sport' },
  };
  old.medals = { 'mk1:rescue': 'silver', 'harbour:race': 'gold', 'alpaca:rescue': 'gold' };
  old.leaves = { mk1: [true, false, true, false, true, false, true, true, true], mk3: [false, false, false, false, false, false, true, false, false] };
  old.unlocked = { courses: ['harbour', 'volcano'], tunes: ['cruise', 'sport', 'race'], liveries: ['pearl', 'gold', 'violet'] };
  old.stats = { ...old.stats, races: 25, finished: 20, wins: 9, guests: 12, llamas: 36 };
  old.last = { course: 'volcano', tune: 'race', livery: 'violet', mode: 'trial' };
  return old;
}

function bookVoyage(save, key, stars = 0) {
  return applyRescue(save, {
    mode: 'rescue', course: key, tune: 'cruise', livery: 'pearl', difficulty: 'normal',
    finished: true, saved: stars, total: 3, time: 300, medal: null,
    voyage: true, home: 0, leaves: [true, false, false, false, false, false, false, false, false],
  }).save;
}

test('first bay visit preserves voyage records and preferences without importing arcade progression', () => {
  const legacy = freeze(legacySave()), before = copy(legacy);
  const save = makeBaySave(null, legacy), fresh = freshSave();
  assert.notEqual(BAY_SAVE_KEY, SAVE_KEY);
  assert.deepEqual(Object.keys(save.best).sort(), ['mk1:rescue', 'mk3:rescue']);
  assert.deepEqual(save.best['mk1:rescue'], legacy.best['mk1:rescue']);
  assert.deepEqual(save.best['mk3:rescue'], legacy.best['mk3:rescue']);
  assert.deepEqual(save.medals, { 'mk1:rescue': 'silver' });
  assert.deepEqual(save.leaves, legacy.leaves);
  assert.deepEqual(save.settings, { ...legacy.settings, boat: 'jukung' });
  assert.deepEqual(save.unlocked, fresh.unlocked);
  assert.deepEqual(save.last, fresh.last);
  assert.deepEqual(save.stats, { ...fresh.stats, guests: 12 });
  assert.deepEqual(save.bay, { sailingComplete: false, lastVoyage: 'mk1' });
  assert.deepEqual(legacy, before, 'migration cannot change the player’s original Crest Run save');
  save.best['mk1:rescue'].saved = 3;
  save.leaves.mk1[1] = true;
  assert.deepEqual(legacy, before, 'the imported records are independent copies');
});

test('an existing bay save wins over stale legacy progress on every later visit', () => {
  let current = makeBaySave();
  current = bookVoyage(current, 'mk2', 1);
  current = addLeaves(current, 'mk2', [6, 7, 8]).save;
  current.settings.volume = 0.25;
  current.bay = { sailingComplete: true, lastVoyage: 'mk2' };
  const before = copy(current), loaded = makeBaySave(freeze(current), freeze(legacySave()));
  assert.deepEqual(loaded, before);
  assert.deepEqual(Object.keys(loaded.best), ['mk2:rescue']);
  assert.equal(loaded.best['mk1:rescue'], undefined);
  assert.equal(loaded.settings.volume, 0.25);
  assert.deepEqual(current, before);
});

test('a finished zero-harmony attempt is visited, without claiming guests were saved', () => {
  const save = bookVoyage(makeBaySave(), 'mk1', 0), progress = bayProgress(save);
  const morning = progress.journeys[0];
  assert.equal(morning.visited, true);
  assert.equal(morning.harmonies, 0);
  assert.equal(morning.reflected, false);
  assert.equal(morning.explored, false);
  assert.equal(save.stats.guests, 0);
  assert.equal(progress.recommended, 'mk1');
  assert.deepEqual(progress.journeys.map(one => one.key), ['mk1', 'mk2', 'mk3']);
});

test('reflection suggests the next voyage while all three remain available in every state', () => {
  let save = makeBaySave();
  const available = () => assert.deepEqual(bayProgress(save).journeys.map(one => one.key), BAY_JOURNEYS);
  available();
  assert.equal(bayProgress(save).recommended, 'mk1');
  save = addLeaves(save, 'mk2', [6, 7, 8]).save;
  assert.equal(bayProgress(save).journeys[1].explored, false, 'reflection alone is not a sailed voyage');
  save = bookVoyage(save, 'mk1');
  save = addLeaves(save, 'mk1', [6, 7]).save;
  assert.equal(bayProgress(save).recommended, 'mk1'); available();
  save = addLeaves(save, 'mk1', [8]).save;
  assert.equal(bayProgress(save).recommended, 'mk2'); available();
  save = bookVoyage(save, 'mk2', 2);
  assert.equal(bayProgress(save).recommended, 'mk3'); available();
  save = bookVoyage(save, 'mk3', 3);
  save = addLeaves(save, 'mk3', [6, 7, 8]).save;
  save.bay = { sailingComplete: true, lastVoyage: 'mk2' };
  const progress = bayProgress(save);
  assert.equal(progress.explored, 3);
  assert.equal(progress.leaves, 12);
  assert.equal(progress.recommended, 'mk2', 'after all voyages are explored, suggest the most recent one');
  assert.equal(progress.sailingComplete, true); available();
});

test('malformed bay metadata and absent records normalize to a usable, open journal', () => {
  for (const metadata of [null, [], 'mk3', { sailingComplete: 1, lastVoyage: 'alpaca' }, { sailingComplete: 'true', lastVoyage: null }]) {
    const raw = { ...freshSave(), bay: metadata }, before = copy(raw);
    const save = makeBaySave(freeze(raw)), progress = bayProgress(save);
    assert.deepEqual(save.bay, { sailingComplete: false, lastVoyage: 'mk1' });
    assert.equal(progress.recommended, 'mk1');
    assert.equal(progress.leaves, 0);
    assert.equal(progress.explored, 0);
    assert.deepEqual(progress.journeys.map(one => one.key), BAY_JOURNEYS);
    assert.deepEqual(raw, before);
  }
  const progress = bayProgress({ best: { 'mk1:rescue': { saved: NaN } }, leaves: { mk1: [1, 'true', true] }, bay: { lastVoyage: 'mk9' } });
  assert.equal(progress.journeys[0].visited, false);
  assert.equal(progress.journeys[0].leaves, 1);
  assert.equal(progress.recommended, 'mk1');
});

test('unknown save versions are not treated as compatible progress', () => {
  const legacy = legacySave();
  assert.equal(bayProgress(makeBaySave({ v: -1 }, legacy)).journeys[0].visited, true, 'recover from compatible legacy when the bay save is unusable');
  assert.deepEqual(makeBaySave({ v: -1 }, { ...legacy, v: -1 }).best, {});
});

test('the hub preview floats without starting a mission, taking seats or recording inputs', () => {
  const course = bayCourse(), race = new Race(voyageSettings(course), course);
  const voyage = makeVoyage(race, { level: 'mk1' });
  race.go = Infinity;
  race.nonRanked = true;
  const people = copy(voyage.people), net = copy(voyage.net), boat = race.boats[0];
  const position = [boat.x, boat.z], heights = new Set();
  for (let step = 0; step < 30 / DT; step++) {
    race.step(0, 0, 0);
    voyage.step();
    race.events.length = 0;
    heights.add(boat.y);
  }
  assert.equal(RULES.seats, 6, 'the tour boat keeps six guest places');
  assert.deepEqual(voyage.people, people);
  assert.deepEqual(voyage.net, net);
  assert.deepEqual([boat.x, boat.z], position);
  assert.equal(voyage.aboard, 0); assert.equal(voyage.home, 0); assert.equal(voyage.over, false);
  assert.equal(race.racing, false); assert.equal(race.done, false); assert.equal(race.lapT, 0);
  assert.equal(race.rec.steer.length, 0); assert.equal(race.rec.flags.length, 0);
  assert.ok(heights.size > 1, 'the stationary preview still responds to waves');
  for (const key of ['x', 'y', 'z', 'pitch', 'roll']) assert.ok(Number.isFinite(boat[key]), `finite ${key}`);
});
