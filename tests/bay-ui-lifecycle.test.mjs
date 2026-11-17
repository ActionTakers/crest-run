// CPU lifecycle coverage: the complete main and controls sources (including boot),
// actual simulation/progress/lesson modules, and stub DOM/render/audio/platform.
// This verifies routing and state changes; it makes no WebGL or layout claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as race from '../src/sim/race-sim.mjs';
import * as courses from '../src/sim/courses.mjs';
import * as rescue from '../src/sim/rescue.mjs';
import * as boss from '../src/sim/boss.mjs';
import * as levi from '../src/sim/leviathan.mjs';
import * as voyage from '../src/sim/voyages.mjs';
import * as stats from '../src/sim/boat-stats.mjs';
import * as governor from '../src/sim/governor.mjs';
import * as PR from '../src/sim/progress.mjs';
import * as bay from '../src/ui/bay-flow.mjs';
import * as lesson from '../src/sim/sailing-lesson.mjs';
import { TiltInput } from '../src/sim/tilt-input.mjs';
import { sailingForces } from '../src/sim/sailing.mjs';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const executable = source => source.replace(/^import .*;\n/gm, '').replace(/^export (?=const |class |function )/gm, '');
const mainSource = executable(read('src/main.mjs'));
const controlsSource = executable(read('src/ui/controls.mjs'));
const plain = value => JSON.parse(JSON.stringify(value));
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

class Node {
  constructor(id = '', attributes = '') {
    this.id = id; this.handlers = {}; this.dataset = {}; this.children = []; this.selected = new Map();
    this.style = { setProperty(name, value) { this[name] = value; } };
    this.clientWidth = 400; this.innerHTML = ''; this.textContent = ''; this.value = ''; this.open = false;
    this.classes = new Set((attributes.match(/\bclass="([^"]*)"/)?.[1] || '').split(/\s+/).filter(Boolean));
    this.classList = {
      add: (...names) => names.forEach(name => this.classes.add(name)),
      remove: (...names) => names.forEach(name => this.classes.delete(name)),
      contains: name => this.classes.has(name),
      toggle: (name, value = !this.classes.has(name)) => { value ? this.classes.add(name) : this.classes.delete(name); return value; },
    };
  }
  get className() { return [...this.classes].join(' '); }
  set className(value) { this.classes = new Set(String(value).split(/\s+/).filter(Boolean)); }
  addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); }
  querySelector(selector) { if (!this.selected.has(selector)) this.selected.set(selector, new Node()); return this.selected.get(selector); }
  querySelectorAll() { return []; }
  appendChild(child) { this.children.push(child); }
  setAttribute(name, value) { this[name] = value; }
  remove() {} setPointerCapture() {} closest() { return null; } matches() { return false; }
}

class Stage {
  constructor() {
    this.boats = []; this.calls = []; this.tierKey = 'mid'; this.scale = 1; this.dash = { set() {} };
    this.rescueView = { ready: true }; this.rescueLoad = Promise.resolve(true);
  }
  async load(base, options) { this.loadArgs = { base, options: plain(options) }; return { yacht: { triangles: 1, ms: 0 } }; }
  setCamera(camera) { this.camera = camera; } setCameraMode(mode) { this.cameraMode = mode; }
  setWorld(world) { this.world = world; } setCourse(course) { this.course = course; }
  setRace(current) { this.race = current; this.boats = current.boats.map(() => ({ vis: { setLivery() {} } })); }
  async setBoats(keys) { this.calls.push(['boats', [...keys]]); this.boats.forEach((boat, i) => { boat.key = keys[i]; }); }
  async setSkippers(ids) { this.skippers = [...ids]; this.calls.push(['skippers', [...ids]]); }
  async setRescue(value) { this.rescue = value; } async setBoss(value) { this.boss = value; }
  setLevi(value) { this.levi = value; } setGhost(value) { this.ghost = value; }
  async setVoyage(value) {
    if (value) assert.ok(value.race && value.me && Array.isArray(value.people), 'the scene receives a complete voyage snapshot');
    this.voyage = value;
  }
  setTier(value) { this.tierKey = value; } setScale(value) { this.scale = value; }
  resize() {} update() {} render() {} onEvent() {} renderSize() { return '844x390'; }
}

class Sound {
  constructor() { this.bpm0 = 112; }
  start() { return true; } resume() {} sfx() {} music() {} frame() {} setLevels() {}
}

async function createGame({ edition = 'bay', query = '', storage = new Map() } = {}) {
  const html = read(edition === 'bay' ? 'bay/index.html' : 'index.html');
  const tags = [...html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)];
  const nodes = new Map(tags.map(match => [match[1], new Node(match[1], match[0])]));
  assert.equal(nodes.size, tags.length, 'static HTML IDs are unique');
  const get = id => { assert.ok(nodes.has(id), 'main requested a missing HTML ID: ' + id); return nodes.get(id); };
  const pageURL = new URL(edition === 'bay' ? 'bay/' : './', 'https://example.test/crest-run/');
  const body = new Node('body'); body.dataset.game = html.match(/<body[^>]*data-game="([^"]+)"/)?.[1];
  const document = {
    body, baseURI: new URL(html.match(/<base[^>]*href="([^"]+)"/)?.[1] || './', pageURL).href,
    visibilityState: 'visible', getElementById: get, addEventListener() {},
    querySelector: selector => get('s-title').querySelector(selector),
    querySelectorAll: selector => selector === '#screens .screen' ? [...nodes.values()].filter(n => n.id.startsWith('s-')) : [],
    createElement: () => new Node(),
  };
  const writes = [], frames = [], window = new Node('window');
  Object.assign(window, { innerWidth: 844, innerHeight: 390, devicePixelRatio: 1 });
  const PF = {
    loadJSON: key => storage.has(key) ? structuredClone(storage.get(key)) : null,
    saveJSON: (key, value) => { storage.set(key, plain(value)); writes.push(key); return true; },
    requestWake: async () => true, releaseWake() {}, initHaptic() {}, haptic() {},
    env: { touch: false, secure: true }, wake: { releases: 0 }, landscape: () => true,
  };
  const fleet = Object.fromEntries(['yacht', 'jukung', 'jukung-racer'].map(key => [key, { label: key }]));
  const liveries = Object.fromEntries(['pearl', 'navy', 'coral', 'gold', 'mint', 'violet'].map(key => [key, { label: key, color: [1, 1, 1], accent: 0xffffff }]));
  const context = vm.createContext({
    ...race, ...courses, ...stats, ...voyage, ...governor, ...bay, ...lesson, VOYAGE_KEYS: voyage.VOYAGES_READY,
    Rescue: rescue.Rescue, arenaCourse: rescue.arenaCourse, rescueSettings: rescue.rescueSettings,
    ARENA: rescue.ARENA, RESCUE: rescue.RESCUE, SHARK: rescue.S,
    Boss: boss.Boss, dragonCourse: boss.dragonCourse, bossSettings: boss.bossSettings, DRAGON: boss.DRAGON, FIGHT: boss.BOSS,
    Leviathan: levi.Leviathan, leviCourse: levi.leviCourse, leviSettings: levi.leviSettings, LEVI: levi.LEVI, LFIGHT: levi.FIGHT, PHASES: levi.PHASES,
    Stage, Sound, TiltInput, PR, PF, CAMS: {}, OWNER: 'f01', KING: 'king', JACK: 'jack', crewFor: () => [],
    FLEET: fleet, FLEET_KEYS: ['yacht', 'jukung'], rivalBoats: () => ['yacht', 'yacht', 'yacht'],
    LIVERIES: liveries, LIVERY_KEYS: Object.keys(liveries),
    WORLDS: { sunset: { label: 'Sunset', zenith: [1, 1, 1], horizon: [1, 1, 1], scatter: [1, 1, 1] } },
    document, window, location: { search: query, hostname: 'example.test' }, URL, URLSearchParams,
    Element: Node, performance, console, navigator: {}, setTimeout: () => 0, clearTimeout() {},
    requestAnimationFrame: fn => frames.push(fn), confirm: () => false,
  });
  // Imports alone are supplied by the harness; no production function or boot
  // branch is removed. Controls run in the same browser-like global context.
  vm.runInContext(controlsSource, context, { filename: 'controls.mjs' });
  const api = await vm.runInContext(`(async () => {\n${mainSource}\nreturn { G, stepRace, simulate, stepResume, paintSailingLesson };\n})()`, context, { filename: 'main.mjs' });
  assert.equal(window.__error, undefined, 'boot must not fall back to its error screen');
  assert.equal(window.__ready, true);
  const emit = async (id, type = 'click', target = get(id)) => {
    const handlers = get(id).handlers[type] || [];
    assert.ok(handlers.length, `${id} has a wired ${type} handler`);
    for (const handler of handlers) await handler({ target, preventDefault() {}, stopPropagation() {} });
    await settle();
  };
  const choice = async (container, dataset) => {
    for (const [key, value] of Object.entries(dataset)) assert.ok(get(container).innerHTML.includes(`data-${key}="${value}"`), `${container} contains option ${key}=${value}`);
    const target = new Node(); target.dataset = dataset; target.closest = selector => selector.startsWith('button') ? target : null;
    await emit(container, 'click', target);
  };
  const input = (id, value) => {
    for (const handler of get(id).handlers.input || []) handler({ target: { value: String(value) } });
  };
  const start = async () => { await emit('b-start'); assert.equal(api.G.screen, 'cal'); await emit('b-cal-touch'); };
  return { ...api, nodes, get, emit, choice, input, start, storage, writes, frames };
}

function assertBay(h) {
  assert.equal(h.G.screen, 'bay'); assert.equal(h.G.mode, 'demo'); assert.equal(h.G.run, null);
  assert.equal(h.G.controls.sailing, false); assert.equal(h.G.sailLesson, null);
  assert.equal(h.get('s-menu').classList.contains('show'), false);
  assert.equal(h.get('s-bay').classList.contains('show'), true);
  assert.deepEqual(h.G.stage.boats.map(b => b.key), ['jukung']);
  assert.deepEqual(h.G.stage.skippers, ['king']);
  assert.equal(h.G.stage.voyage.key, 'mk1');
}

async function clearRecall(h) {
  if (h.G.kies.recall !== null) {
    await h.choice('k-rows', { recall: '0' });
    await h.choice('k-rows', { recall: 'go' });
  }
}

test('bay boot loads its own assets and stationary crew preview, then title/calibration opens the hub', async () => {
  const h = await createGame();
  assert.deepEqual(h.G.stage.loadArgs, { base: 'https://example.test/crest-run/assets/', options: { bay: true } });
  assert.equal(h.G.screen, 'title'); assert.equal(h.G.race.go, Infinity);
  assert.equal(h.G.race.boats.length, 1); assert.equal(h.G.race.nonRanked, true);
  const people = plain(h.G.rescue.people), p = [h.G.race.boats[0].x, h.G.race.boats[0].z];
  for (let i = 0; i < 120; i++) h.simulate(1 / 60);
  assert.deepEqual(plain(h.G.rescue.people), people);
  assert.deepEqual([h.G.race.boats[0].x, h.G.race.boats[0].z], p);
  assert.equal(h.G.race.rec.steer.length, 0); assert.equal(h.G.rescue.over, false);
  await h.start(); assertBay(h);
  assert.equal(h.G.baySuggested, ':practice');
  assert.equal((h.get('bay-journeys').innerHTML.match(/data-voyage=/g) || []).length, 3);
  assert.ok(!h.get('bay-journeys').innerHTML.includes('disabled'));
  assert.match(h.get('title-note').textContent, /Jack/);
});

test('each voyage opens choices and its leaf book, cancels to bay, and quits from play back to bay', async () => {
  const h = await createGame(); await h.start();
  for (const key of bay.BAY_JOURNEYS) {
    await h.choice('bay-journeys', { voyage: key });
    assert.equal(h.G.screen, 'kies'); assert.equal(h.G.sel.level, key);
    assert.equal(h.storage.get(bay.BAY_SAVE_KEY).bay.lastVoyage, key);
    await h.emit('b-kies-book'); assert.equal(h.G.screen, 'beach'); assert.equal(h.G.beach.book, true);
    await h.choice('v-qs', { book: 'mk1' });
    await h.emit('b-beach-done'); assert.equal(h.G.screen, 'kies'); assert.equal(h.G.sel.level, key);
    await h.emit('b-kies-back'); assertBay(h);
    await h.choice('bay-journeys', { voyage: key }); await clearRecall(h); await h.emit('b-kies-go');
    assert.equal(h.G.screen, 'race'); assert.equal(h.G.run.mode, 'voyage'); assert.equal(h.G.run.course, key);
    assert.equal(h.G.controls.sailing, false); assert.equal(h.G.sailLesson, null);
    assert.deepEqual(h.G.stage.skippers, ['king']); assert.equal(h.G.stage.voyage.key, key);
    await h.emit('h-pause'); assert.equal(h.G.screen, 'pause');
    await h.emit('b-restart'); assert.equal(h.G.run.course, key); assert.equal(h.G.screen, 'race');
    await h.emit('h-pause'); await h.emit('b-quit'); assertBay(h);
  }
  assert.ok(h.writes.every(key => key === bay.BAY_SAVE_KEY));
});

test('real voyage results retain the beach gate, reflection returns to bay, and retry stays a voyage', async () => {
  const saved = bay.makeBaySave(); saved.bay.sailingComplete = true;
  const h = await createGame({ storage: new Map([[bay.BAY_SAVE_KEY, saved]]) }); await h.start();
  await h.emit('bay-continue'); assert.equal(h.G.sel.level, 'mk1'); await h.emit('b-kies-go');
  h.G.skip(360);
  assert.equal(h.G.rescue.over, true, 'the actual voyage simulator reaches its conclusion');
  h.G.endRace();
  assert.equal(h.G.screen, 'results'); assert.equal(h.G.nextCourse, ':beach');
  await h.emit('b-nextcourse'); assert.equal(h.G.screen, 'beach'); assert.equal(h.G.beach.book, undefined);
  for (let q = 0; q < 3; q++) {
    await h.choice('v-qs', { q: String(q), a: '0' });
    if (q < 2) await h.choice('v-qs', { next: '1' });
  }
  assert.deepEqual(plain(h.G.save.leaves.mk1.slice(6)), [true, true, true]);
  await h.emit('b-beach-done'); assertBay(h);
  assert.equal(bay.bayProgress(h.G.save).recommended, 'mk2');
  await h.emit('bay-continue'); assert.equal(h.G.screen, 'kies'); assert.equal(h.G.sel.level, 'mk2');
  await clearRecall(h); await h.emit('b-kies-go');
  h.G.endRace(); assert.equal(h.G.screen, 'results'); assert.equal(h.G.nextCourse, null);
  const abandoned = h.G.race;
  await h.emit('b-retry'); assert.equal(h.G.run.mode, 'voyage'); assert.equal(h.G.run.course, 'mk2'); assert.notEqual(h.G.race, abandoned);
  h.G.endRace(); await h.emit('b-next'); assertBay(h);
});

test('settings return to their title, hub or pause origin; recalibration keeps the bay route', async () => {
  const h = await createGame();
  await h.emit('b-title-settings'); assert.equal(h.G.screen, 'settings');
  await h.emit('b-set-done'); assert.equal(h.G.screen, 'title');
  await h.start(); await h.emit('bay-settings'); assert.equal(h.G.screen, 'settings');
  await h.emit('b-set-done'); assertBay(h);
  await h.emit('bay-settings'); h.G.controls.tilt.source = 'tilt';
  await h.emit('b-recal'); assert.equal(h.G.screen, 'cal');
  await h.emit('b-cal-touch'); assertBay(h);
  await h.choice('bay-journeys', { voyage: 'mk1' }); await h.emit('b-kies-go');
  await h.emit('h-pause'); await h.emit('b-pause-settings'); await h.emit('b-set-done');
  assert.equal(h.G.screen, 'pause'); assert.equal(h.G.paused, true);
  await h.emit('b-pause-settings'); await h.emit('b-recal'); await h.emit('b-cal-touch');
  assert.equal(h.G.screen, 'pause'); assert.equal(h.G.paused, true);
  await h.emit('b-resume'); h.stepResume(2);
  assert.equal(h.G.screen, 'race'); assert.equal(h.G.paused, false);
  await h.emit('h-pause'); await h.emit('b-quit'); assertBay(h);
});

test('practice can be skipped, completed with real sailing inputs, saved, and replayed independently', async () => {
  const h = await createGame(); await h.start(); await h.emit('bay-continue');
  assert.equal(h.G.run.mode, 'sailing'); assert.deepEqual(h.G.stage.skippers, ['jack']);
  assert.equal(h.G.stage.voyage, null); assert.equal(h.G.sailLesson.step, 0);
  await h.emit('sail-lesson-skip'); assert.equal(h.G.sailLesson, null);
  assert.equal(h.G.save.bay.sailingComplete, false); assert.equal(h.G.screen, 'race');
  await h.emit('h-pause'); await h.emit('b-quit'); assertBay(h);
  await h.emit('bay-practice'); assert.equal(h.G.sailLesson.step, 0);
  const boat = h.G.race.boats[0], heading = boat.h;
  let manualSheet = null, balanceSet = false;
  for (let i = 0; i < 90 / race.DT && !h.G.sailLesson.complete; i++) {
    const current = h.G.sailLesson, t = h.G.race.lapT;
    const error = Math.atan2(Math.sin(heading - boat.h), Math.cos(heading - boat.h));
    h.G.controls.steer = current.step === 0 && t >= 2 && t < 2.6 ? 0.18 : Math.max(-0.4, Math.min(0.4, 2 * error - 1.7 * boat.r));
    if (current.step >= 1 && manualSheet === null) {
      manualSheet = Math.min(1, sailingForces(boat, { autoTrim: true }, { x: 4, z: -3 }).sheet + 0.07);
      h.input('sail-sheet', manualSheet * 100);
    }
    if (current.step >= 2 && !balanceSet) { h.input('sail-crew', 35 * Math.sign(boat.sailing.awa)); balanceSet = true; }
    h.stepRace(h.G.race, h.G.run);
  }
  h.paintSailingLesson();
  assert.equal(h.G.sailLesson.complete, true, JSON.stringify(h.G.sailLesson));
  assert.deepEqual(plain(h.G.sailLesson.completedSteps), ['wind', 'trim', 'balance']);
  assert.equal(h.G.save.bay.sailingComplete, true);
  assert.equal(h.storage.get(bay.BAY_SAVE_KEY).bay.sailingComplete, true);
  assert.equal(h.G.race.rec.steer.length, 0); assert.equal(h.G.race.done, false);
  assert.deepEqual(h.writes, [bay.BAY_SAVE_KEY], 'lesson completion writes once, without race records');
  await h.emit('sail-lesson-done'); assertBay(h);
  assert.equal(h.get('bay-replay').classList.contains('hidden'), false);
  await h.emit('bay-practice'); assert.equal(h.G.sailLesson, null, 'completed practice defaults to free sailing');
  await h.emit('h-pause'); await h.emit('b-quit');
  await h.emit('bay-replay'); assert.equal(h.G.sailLesson.step, 0); assert.equal(h.G.sailLesson.complete, false);
  assert.equal(h.G.save.bay.sailingComplete, true, 'replay does not erase the earned flag');
  const reloaded = await createGame({ storage: h.storage }); await reloaded.start();
  assert.equal(reloaded.G.baySuggested, 'mk1');
  await reloaded.emit('bay-practice'); assert.equal(reloaded.G.sailLesson, null);
});

test('bay deep links allow its voyages and practice while arcade film overrides stay inside the bay', async () => {
  const linked = await createGame({ query: '?voyage=mk2' }); await linked.start();
  assert.equal(linked.G.screen, 'kies'); assert.equal(linked.G.sel.level, 'mk2');
  await linked.emit('b-kies-back'); assertBay(linked);
  const sailing = await createGame({ query: '?sailing=1&mode=trial&level=' + boss.DRAGON.key }); await sailing.start();
  assert.equal(sailing.G.run.mode, 'sailing'); assert.ok(sailing.G.sailLesson);
  await sailing.emit('h-pause'); await sailing.emit('b-quit'); assertBay(sailing);
  for (const level of [boss.DRAGON.key, levi.LEVI.key, rescue.ARENA.key]) {
    const h = await createGame({ query: '?film=1&mode=trial&level=' + level });
    assert.equal(h.G.run.mode, 'voyage'); assert.equal(h.G.run.course, 'mk1');
    assert.equal(h.G.stage.loadArgs.options.bay, true);
    assert.equal(h.G.stage.boss, null); assert.equal(h.G.stage.levi, null); assert.equal(h.G.stage.rescue, null);
  }
  const filmed = await createGame({ query: '?film=1&mode=trial&level=mk3' });
  assert.equal(filmed.G.run.mode, 'voyage'); assert.equal(filmed.G.run.course, 'mk3');
});

test('the original entry still boots yachts, opens its menu and runs arcade race, rescue and sailing routes', async () => {
  const h = await createGame({ edition: 'crest' });
  assert.equal(h.G.stage.loadArgs.options.bay, false); assert.equal(h.G.game, 'crest');
  assert.equal(h.G.race.boats.length, 4); assert.deepEqual(h.G.stage.boats.map(b => b.key), ['yacht', 'yacht', 'yacht', 'yacht']);
  await h.start(); assert.equal(h.G.screen, 'menu');
  await h.emit('b-go'); assert.equal(h.G.run.mode, 'race'); assert.equal(h.G.race.boats.length, 4);
  await h.emit('h-pause'); await h.emit('b-quit'); assert.equal(h.G.screen, 'menu');
  h.G.sel.mode = 'rescue'; h.G.sel.level = rescue.ARENA.key; await h.G.startRace();
  assert.equal(h.G.run.mode, 'rescue'); assert.ok(h.G.rescue instanceof rescue.Rescue);
  await h.emit('h-pause'); await h.emit('b-quit'); assert.equal(h.G.screen, 'menu');
  const sailing = await createGame({ edition: 'crest', query: '?sailing=1' }); await sailing.start();
  assert.equal(sailing.G.run.mode, 'sailing'); assert.equal(sailing.G.sailLesson, null);
  await sailing.emit('h-pause'); await sailing.emit('b-quit'); assert.equal(sailing.G.screen, 'menu');
  const filmed = await createGame({ edition: 'crest', query: '?film=1&mode=trial' });
  assert.equal(filmed.G.run.mode, 'trial');
});
