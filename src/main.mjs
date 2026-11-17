// main.mjs: the game. Screens (title, straight-ahead check, courses, race, results, pause, settings, test card), the frame loop
// (fixed 120 Hz simulation, picture interpolated between steps), the race display, sounds, saving, and the frame-rate governor.
// The simulation is sim/race-sim.mjs, the picture view/stage.mjs. Written 2026-11-13 by the yacht project session; revised the
// same day after review round r3 (<local>): the ids P1-P20 and T-01-T-15 in comments name its findings.
// 0.2.2 (2026-11-14): the findings of the outside critic's test of the published 0.2.1 (the other yacht session's read of the
// live page): "finding N" in comments names them; the triage is review/r4-critic/TRIAGE.md of the project.
// 0.3.0 (2026-11-15): the rescue level (sim/rescue.mjs, view/rescue-view.mjs): a third mode beside the race and the time trial.
// 0.3.1 (the same day): the llamas of that level are animated (idle, hop, paddle, walk), from the model of his Friendly Fighters site.
// 0.4.0 (the same day): the crew (view/people.mjs): three of them swim among the llamas of a mission, one stands at each helm in a race;
// and a boss level, The World Dragon (sim/boss.mjs, view/boss-view.mjs): a second card under the Rescue tab.
// 0.4.1 (the same day): every skipper sits at the helm, in one pose made in code (view/people.mjs, seatClip).
// 0.5.0 (the same day): a second boss level, The Leviathan (sim/leviathan.mjs, view/leviathan-view.mjs), built on what research
// step A3 took from the boss fights of the Final Fantasy series: phases, marks, a stagger gauge, a ram, a cast to break.
// 0.6.0 (2026-11-16): three more boats from the owner's sheets (view/fleet.mjs), one for each rival and a choice for the player;
// a camera at the seated driver's head (the eye button in a race, or the C key).
// 0.9.0 (the same day, after the owner's six pictures of 14:14: the project's research/A7-target-pictures): the jukung's look
// follows the pictures (view/jukung.mjs), the telling on the beach has a table of planks with nine palm leaves and their signs,
// the slopes are forested, a village is lit at night, rain falls under the squall, the overdue boat has a canopy.
// 0.13.0 (2026-11-17): two lines of work joined: this session's 0.12.1 (the level on the deck and its headset mode) and another
// writer's sailing trial and bay entrance, which went live under version numbers of their own (the two lines marked "bay").
// 0.12.1 (2026-11-17): in the headset mode two loops ran at once (the page's and the headset's): put right; the smoke test has a
// part of its own for the headset path (tools/smoke.mjs, part l), which found it.
// 0.12.0 (2026-11-17): a first headset mode for the level on the deck (WebXR): a VR button, the player on the foredeck, the gun
// in the hand. Tried against a stand-in headset only (tools/lib/fake-xr.js): the first real try is the owner's.
// 0.11.0 (2026-11-17): a third boss level, Iron Hawk: the level on the deck (sim/deck.mjs, view/deck-view.mjs): a shooter on
// rails built on research step A8; the first weapon that is aimed by hand; its three models made by the model service.
// bay 0.12.0 (2026-11-17): a dedicated Lipah Bay entry, voyage journal and Jack's optional three-step sailing lesson.
// bay 0.11.0 (2026-11-17): Jack's separate sailing practice, researched racing geometry, trim/balance controls and corrected cast poses.
// 0.10.1 (2026-11-17): the same game with lighter model files (tools/slim-assets.mjs): nothing that is shown has changed.
// 0.10.0 (the same day): the two figures of the voyages (view/people.mjs, KING and JACK): the king at the helm of the jukung,
// the little captain as its lookout, in his own boat or by his fire; and the artwork on the sail (view/jukung.mjs).
// 0.8.0 (the same day, plan PLAN-MONKEYKING.md of the project): a sixth boat made wholly in code, the jukung (view/jukung.mjs),
// and the rescue voyages in the bay (sim/voyage.mjs, view/bay-view.mjs): three choices before leaving, the rescue, the telling
// on the beach with nine lesson leaves a voyage; a Voyage tab in the menu; a film camera that travels with the boat.
// 0.7.0 (the same day): each boat handles its own way (sim/boat-stats.mjs), a display inside the cockpit for the view from the
// helm (view/dash.mjs), a fifth boat (the red catamaran without its lettering), and a ghost that remembers its boat.
import { Stage, CAMS } from './view/stage.mjs?v=55436194';
import { LIVERIES, LIVERY_KEYS } from './view/boats.mjs?v=55436194';
import { OWNER, KING, JACK, crewFor } from './view/people.mjs?v=55436194';
import { WORLDS } from './view/sky.mjs?v=55436194';
import { getCourse, COURSE_DEFS, COURSE_KEYS, pointInto, wrapA, wrapS } from './sim/courses.mjs?v=55436194';
import { Race, defaultSettings, DT, TUNES, TUNE_KEYS, BOOST, SIM_VERSION, encodeInputs, decodeInputs } from './sim/race-sim.mjs?v=55436194';
import { Rescue, arenaCourse, rescueSettings, ARENA, RESCUE, S as SHARK } from './sim/rescue.mjs?v=55436194';
import { Boss, dragonCourse, bossSettings, DRAGON, BOSS as FIGHT } from './sim/boss.mjs?v=55436194';
import { Leviathan, leviCourse, leviSettings, LEVI, FIGHT as LFIGHT, PHASES } from './sim/leviathan.mjs?v=55436194';
import { DeckFight, hawkCourse, hawkSettings, HAWK, DECK, HALVES } from './sim/deck.mjs?v=55436194';
import { makeVoyage, bayCourse, voyageSettings, voyageChoices, VOYAGES, VOYAGES_READY as VOYAGE_KEYS } from './sim/voyages.mjs?v=55436194';
const VOYAGES_READY_ALL = VOYAGE_KEYS;
import { FLEET, FLEET_KEYS, rivalBoats } from './view/fleet.mjs?v=55436194';
import { BOAT_STATS, boatTweak } from './sim/boat-stats.mjs?v=55436194';
import { Governor, RefreshWatch, measureRefresh } from './sim/governor.mjs?v=55436194';
import * as PR from './sim/progress.mjs?v=55436194';
import { Controls } from './ui/controls.mjs?v=55436194';
import { Sound } from './ui/sound.mjs?v=55436194';
import * as PF from './ui/platform.mjs?v=55436194';
import { BAY_SAVE_KEY, BAY_JOURNEYS, makeBaySave, bayProgress } from './ui/bay-flow.mjs?v=55436194';
import { makeSailingLesson, advanceSailingLesson } from './sim/sailing-lesson.mjs?v=55436194';

export const VERSION = 'crest-run 0.13.0', BUILD = '2026-11-17 #55436194';
const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const BAY_GAME = document.body.dataset.game === 'bay';
const SAVE_KEY = BAY_GAME ? BAY_SAVE_KEY : PR.SAVE_KEY;
// on a desk (a local address) the page takes two test switches from its address that a published page ignores: the computer at
// the wheel (auto=1) and another sea (seed=), which would book results the player did not drive (finding 11)
const DEV = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const ORD = ['', 'st', 'nd', 'rd', 'th', 'th', 'th', 'th'];
const GAP_M = 10;          // the time gap to another boat is read at marks every 10 m of the course
const RESUME_S = 1.8;      // the count before a paused race goes on
const IDLE_MS = 20000;     // a menu nobody touched for this long draws its sea at half the rate
const canvas = $('c');
// the 3D picture: where the browser gives none (WebGL 2 off, for example in Lockdown Mode) or the start fails, the page says so
// and offers a reload instead of "Loading the sea..." for ever (finding 7)
function bootFail(e, text) {
  window.__error = String((e && e.stack) || e);
  for (const s of document.querySelectorAll('#screens .screen')) s.classList.toggle('show', s.id === 's-boot');
  $('boot-msg').textContent = text; const b = $('b-reload'); b.classList.remove('hidden'); b.onclick = () => location.reload();
}
function makeStage() { try { return new Stage(canvas); } catch (e) { bootFail(e, 'This browser gave the game no 3D picture (WebGL 2). Close other tabs, or allow WebGL for this page (Lockdown Mode switches it off), then reload.'); throw e; } }
const stage = makeStage(), controls = new Controls(), sound = new Sound();
const gov = new Governor({ tier: 'mid', auto: true }), watch = new RefreshWatch();
const G = window.__game = { version: VERSION, build: BUILD, game: BAY_GAME ? 'bay' : 'crest', stage, controls, sound, gov, watch, choices: {}, recalled: {}, save: BAY_GAME ? makeBaySave(PF.loadJSON(SAVE_KEY), PF.loadJSON(PR.SAVE_KEY)) : PR.migrate(PF.loadJSON(SAVE_KEY)), screen: 'boot', mode: 'demo', race: null, ghost: null, run: null,
  sel: null, paused: false, pausedBy: null, timeScale: 1, slowLeft: 0, slowArmed: false, auto: DEV && Q.get('auto') === '1', film: Q.get('film') === '1', frames: 0, errors: [], refresh: null,
  probe: { n: 0, deltas: [] }, probes: 0, lastRuns: [], storage: true, calT: 0, calTry: 0, calDone: 0, resultsAt: null, hudOn: Q.get('hud') !== '0', resumeLeft: 0, resumeShown: '', afterCal: null, dirty: true, filmT: 0, inputAt: performance.now(), draws: 0 };
const settings = () => G.save.settings;
G.sel = { mode: ['trial', 'rescue'].includes(G.save.last.mode) ? G.save.last.mode : 'race', course: COURSE_KEYS.includes(G.save.last.course) ? G.save.last.course : COURSE_KEYS[0],
  tune: G.save.unlocked.tunes.includes(G.save.last.tune) ? G.save.last.tune : 'cruise', livery: G.save.unlocked.liveries.includes(G.save.last.livery) ? G.save.last.livery : 'pearl', difficulty: settings().difficulty, level: ARENA.key, boat: FLEET_KEYS.includes(settings().boat) ? settings().boat : 'yacht' };
if (Q.get('sailing') === '1') G.sel.mode = 'sailing';
if (BAY_GAME) {
  G.sel.level = BAY_JOURNEYS.includes(Q.get('voyage')) ? Q.get('voyage') : bayProgress(G.save).recommended;
  G.sel.mode = Q.get('sailing') === '1' ? 'sailing' : 'rescue'; G.sel.boat = 'jukung'; G.sel.tune = 'cruise'; G.sel.livery = 'pearl';
  G.practiceGuided = !G.save.bay.sailingComplete;
}
G.sailInput = { sheet: 0.5, autoTrim: true, rigBalance: 0, crewBalance: 0 };
G.sailLesson = null;
window.addEventListener('error', (e) => { G.errors.push(String(e.message).slice(0, 200)); });
window.addEventListener('unhandledrejection', (e) => { G.errors.push('rejection: ' + String(e.reason && e.reason.message || e.reason).slice(0, 200)); });
// the elements the race display writes every frame, looked up once (T-10)
const E = {};
for (const [k, id] of Object.entries({ fill: 'h-boost-fill', boost: 'h-boost', btn: 'h-boostbtn', knob: 'h-knob', prog: 'h-prog', progMe: 'h-prog-me', count: 'h-count', msg: 'h-msg', warn: 'h-warn', arrow: 'h-arrow', place: 'h-place',
  edge: 'h-edge', calWheel: 'cal-wheel', calNeedle: 'cal-needle', toast: 'toast', hud: 'hud', play: 'play', cross: 'deck-cross', flare: 'h-flare', nextCourse: 'b-nextcourse', retry: 'b-retry' })) E[k] = $(id);

// ---------- screens ----------
const SCREENS = ['boot', 'title', 'cal', 'menu', 'bay', 'results', 'pause', 'settings', 'card', 'resume', 'sensors', 'rotate', 'kies', 'beach'];
function show(name) {
  if (BAY_GAME && name === 'menu') { paintBay(); name = 'bay'; }
  G.screen = name;
  for (const s of SCREENS) $('s-' + s).classList.toggle('show', s === name);
  const racing = name === 'race';
  E.hud.classList.toggle('hidden', !(racing && G.hudOn)); E.play.classList.toggle('hidden', !racing);
  E.hud.classList.toggle('deck', !!G.rescue && G.rescue.kind === 'deck');   // the level on the deck has its own controls: a crosshair and a flare button
  E.toast.classList.toggle('race', racing);       // in a race notes sit under the clock, clear of speed and boost (P4)
}
let toastT = null;
function toast(text, ms = 2600) { const t = E.toast; t.textContent = text; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
function saveNow() { const ok = PF.saveJSON(SAVE_KEY, G.save); if (!ok && G.storage) toast(BAY_GAME ? 'This browser cannot keep your journal after the page closes.' : 'This browser does not let the game save: best times last until the page closes.', 5000); G.storage = ok; }
function tap(id, fn) { $(id).addEventListener('click', (e) => { e.preventDefault(); sound.resume(); sound.sfx('click'); fn(e); }); }
// restart a one-shot CSS animation on an element (a gate tick, a bump flash, a place change)
function pulse(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

function applySettings() {
  const s = settings();
  stage.setCamera(controls.sailing ? (G.sailingCamera || 'chase') : s.camera, s.motion === 'full' ? 1 : 0.4);
  controls.setOptions({ maxDeg: s.maxDeg, invert: !!s.invert }); controls.prefer = s.steering;
  sound.setLevels({ sound: !!s.sound, music: !!s.music, volume: s.volume });
  gov.auto = s.quality === 'auto'; if (!gov.auto) gov.tier = s.quality;
  if (G.refresh) applyGov();
  $('h-unit').textContent = s.units === 'kn' ? 'kn' : 'km/h';
}
// what the governor decided, shown: a tier change only when the tier really changed (T-13)
function applyGov() { if (gov.tier !== stage.tierKey && !Q.get('tier')) stage.setTier(gov.tier); stage.setScale(gov.scale); }
// the screen stays on while a race runs: asked at every race start and resume, inside the tap, and let go on a pause, on the
// result and on the menus (PF.releaseWake; finding 4). Where the browser refuses, the player is told once (T-08)
function keepAwake() { PF.requestWake().then((ok) => { if (!ok && !G.wakeTold && G.mode === 'race' && !G.film) { G.wakeTold = true; toast('This browser does not keep the screen on: touch the screen now and then during a race.', 5000); } }); }

// ---------- the demo behind the menus: a race with every boat computer-steered, the camera circling the leader ----------
function startDemo(courseKey = G.sel.course) {
  if (BAY_GAME) return startBayDemo();
  controls.sailing = false; E.hud.classList.remove('sailing');
  stage.setCamera(settings().camera, settings().motion === 'full' ? 1 : 0.4);
  const c = getCourse(courseKey), def = COURSE_DEFS[courseKey];
  stage.setWorld(Q.get('world') || def.world); stage.setCourse(c);
  const race = new Race({ ...defaultSettings(c, { rivals: 3, tune: G.sel.tune }), player: -1 }, c);
  G.race = race; G.rescue = null; G.ghost = null; G.mode = 'demo'; G.run = null; G.demoCourse = courseKey; G.timeScale = 1; G.acc = 0; G.paused = false; G.pausedBy = null; G.resumeLeft = 0;
  stage.setSkippers([]); stage.setRescue(null); stage.setBoss(null); stage.setLevi(null); stage.setVoyage(null); stage.setGhost(null); stage.setRace(race, [G.sel.livery, ...LIVERY_KEYS.filter((k) => k !== G.sel.livery)].slice(0, 4).reverse(), 3); stage.setBoats(['yacht', 'yacht', 'yacht', G.sel.boat]);
  stage.setCameraMode('orbit');
  for (let i = 0; i < Math.round(5 / DT); i++) { race.step(0, 0, 0); race.events.length = 0; }   // past the countdown: boats already moving
}

// The dedicated bay entry keeps its own harbour, journal and route through the
// stories. All journeys remain available, including before the sailing lesson.
const BAY_CARDS = {
  mk1: { scene: 'dawn', time: 'FIRST LIGHT', story: 'Find the drifting guests and free a turtle from a lost net.' },
  mk2: { scene: 'squall', time: 'BEFORE THE SQUALL', story: 'Take Jack on a tow line and lead the other boats home.' },
  mk3: { scene: 'night', time: 'AFTER SUNSET', story: 'Find the overdue boat. Nine people wait; your boat has six guest seats.' },
};
function paintBay() {
  if (!BAY_GAME) return;
  const progress = bayProgress(G.save), next = VOYAGES[progress.recommended];
  G.baySuggested = progress.sailingComplete ? progress.recommended : ':practice';
  $('bay-continue').textContent = !progress.sailingComplete ? 'LEARN TO SAIL WITH JACK' : `${progress.journeys.find((one) => one.key === next.key).visited ? 'RETURN TO' : 'BEGIN'} ${next.name.toUpperCase()}`;
  $('bay-continue-note').textContent = !progress.sailingComplete ? 'Three short exercises: wind, sail and balance. Every voyage is also open below.' : progress.explored === 3 ? 'Three stories explored. Choose a voyage to find something new.' : 'Your next suggested voyage. Choose any of the three whenever you like.';
  $('bay-progress').textContent = `${progress.explored}/3 explored \u00B7 ${progress.leaves}/27 leaves`;
  $('bay-practice').querySelector('strong').textContent = progress.sailingComplete ? 'Free sailing with Jack' : 'Sail with Jack';
  $('bay-practice').querySelector('small').textContent = progress.sailingComplete ? 'Open water, at your own pace' : 'Wind, trim and the feel of the floats';
  $('bay-replay').classList.toggle('hidden', !progress.sailingComplete);
  $('bay-journeys').innerHTML = progress.journeys.map((one) => {
    const d = VOYAGES[one.key], card = BAY_CARDS[one.key];
    const state = one.visited ? `${one.harmonies}/3 harmonies \u00B7 ${one.leaves}/9 leaves${!one.reflected ? ' \u00B7 reflection awaits' : ''}` : 'Ready to sail';
    return `<button type="button" class="bay-journey${one.key === progress.recommended ? ' recommended' : ''}${one.explored ? ' complete' : ''}" data-voyage="${one.key}"><span class="bay-journey-scene ${card.scene}" aria-hidden="true"></span><span class="bay-journey-copy"><span class="bay-journey-kicker">0${one.index + 1} \u00B7 ${card.time}</span><strong>${d.name}</strong><span class="bay-journey-story">${card.story}</span><span class="bay-journey-status">${state}</span></span><span class="bay-journey-arrow" aria-hidden="true">\u2197</span></button>`;
  }).join('');
}
function startBayDemo() {
  controls.releaseAll(); controls.sailing = false; G.sailLesson = null;
  E.hud.classList.remove('sailing', 'rescue', 'bossfight', 'final'); $('sail-lesson').classList.add('hidden');
  const c = bayCourse(), race = new Race(voyageSettings(c, { tune: 'cruise' }), c), voyage = makeVoyage(race, { level: 'mk1' });
  // A full voyage snapshot supplies the scenery/crew contract. It never starts:
  // buoyancy continues, while propulsion, missions and recording remain inactive.
  race.go = Infinity; race.nonRanked = true;
  G.race = race; G.rescue = voyage; G.ghost = null; G.mode = 'demo'; G.run = null; G.demoCourse = null;
  G.timeScale = 1; G.acc = 0; G.paused = false; G.pausedBy = null; G.resumeLeft = 0; G.resultsAt = null;
  stage.setRescue(null); stage.setBoss(null); stage.setLevi(null); stage.setGhost(null);
  stage.setWorld('dawn'); stage.setCourse(c); stage.setRace(race, ['pearl'], 0);
  const cast = stage.setVoyage(voyage);
  const ready = Promise.all([stage.setBoats(['jukung']), stage.setSkippers([KING]), cast]);
  stage.setCamera('chase', settings().motion === 'full' ? 1 : 0.4); stage.setCameraMode('orbit');
  return ready;
}
function returnToBay() {
  if (!BAY_GAME) return;
  sound.music('menu'); startBayDemo(); paintBay(); show('bay'); PF.releaseWake();
}
function chooseBayVoyage(key) {
  if (!BAY_GAME || !BAY_JOURNEYS.includes(key)) return;
  G.sel.mode = 'rescue'; G.sel.level = key; G.sel.boat = 'jukung'; G.sel.tune = 'cruise'; G.sel.livery = 'pearl';
  G.save.bay.lastVoyage = key; saveNow(); openKies();
}
function chooseBayPractice(guided = !G.save.bay?.sailingComplete) {
  if (!BAY_GAME) return;
  G.practiceGuided = guided; G.sel.mode = 'sailing'; startRace();
}
function paintSailingLesson() {
  const lesson = G.sailLesson;
  $('sail-lesson').classList.toggle('hidden', !lesson);
  if (!lesson) return;
  $('sail-lesson-step').textContent = lesson.complete ? 'THREE THINGS LEARNED' : `SAIL WITH JACK \u00B7 ${lesson.step + 1}/3`;
  $('sail-lesson-title').textContent = lesson.title; $('sail-lesson-note').textContent = lesson.hint;
  $('sail-lesson-progress').value = lesson.progress;
  $('sail-lesson-skip').classList.toggle('hidden', lesson.complete);
  $('sail-lesson-done').classList.toggle('hidden', !lesson.complete);
}

// the player's own boat in a level's settings: its way of handling (sim/boat-stats.mjs)
function mine(set) { const b = set.boats[set.player]; b.tweak = boatTweak(b.tune, G.sel.boat); return set; }
// ---------- a race the player steers ----------
function startRace() {
  if (BAY_GAME && G.sel.mode !== 'sailing') {
    G.sel.mode = 'rescue'; G.sel.boat = 'jukung';
    if (!BAY_JOURNEYS.includes(G.sel.level)) G.sel.level = bayProgress(G.save).recommended;
  }
  if (G.sel.mode === 'sailing') return startSailingTrial();
  G.sailLesson = null; $('sail-lesson').classList.add('hidden');
  controls.sailing = false; E.hud.classList.remove('sailing');
  stage.setCamera(settings().camera, settings().motion === 'full' ? 1 : 0.4);
  if (G.sel.mode === 'rescue') return startRescue();
  const { mode, course: key, tune, livery, difficulty } = G.sel, c = getCourse(key), def = COURSE_DEFS[key];
  G.rescue = null; stage.setRescue(null); E.hud.classList.remove('rescue'); stage.setBoss(null); stage.setLevi(null); stage.setVoyage(null); E.hud.classList.remove('bossfight');
  stage.setWorld(Q.get('world') || def.world); stage.setCourse(c);
  const set = defaultSettings(c, { tune, rivals: mode === 'race' ? 3 : 0, difficulty });
  // the boats: the player's choice, and for each rival another boat of the fleet, others every race; each handles its own way
  const fleet = rivalBoats(G.sel.boat, 3, G.save.stats.races || 0), boatKeys = set.boats.map((b, i) => (i === set.player ? G.sel.boat : fleet[i % fleet.length]));
  set.boats.forEach((b, i) => { b.tweak = boatTweak(b.tune, boatKeys[i]); });
  if (DEV && Q.get('seed')) set.sea.seed = +Q.get('seed');
  const race = new Race(set, c), n = race.boats.length;
  const others = LIVERY_KEYS.filter((k) => k !== livery), liveries = race.boats.map((b, i) => (i === race.player ? livery : others[i % others.length]));
  G.race = race; G.mode = 'race'; G.acc = 0; G.timeScale = 1; G.slowLeft = 0; G.slowArmed = false; G.paused = false; G.pausedBy = null; G.resultsAt = null; G.resumeLeft = 0;
  // the ghost of the best time trial on this course: the recorded inputs through the same simulation, one boat, no contact
  G.ghost = null;
  const best = G.save.best[`${key}:trial`];
  if (mode === 'trial' && best && best.ghost && best.ghost.sim === SIM_VERSION && best.ghost.tune === tune && (best.ghost.boat || 'yacht') === G.sel.boat) { const d = decodeInputs(best.ghost.inputs); G.ghost = { race: new Race(set, c), steer: d.steer, flags: d.flags }; }
  const nm = Math.ceil(set.laps * c.len / GAP_M) + 2;
  G.run = { mode, course: key, tune, livery, difficulty, at: new Date().toISOString(), frames: 0, late: 0, worst: 0, sumMs: 0, mot0: controls.tilt.counts.mot, th0: performance.now(), steerMode: controls.mode, recentres0: controls.recentres,
    lastHud: 0, countShown: '', wrongT: 0, place0: n, placeT: -9, dots: [], trackW: 1, wake0: PF.wake.releases,
    marks: race.boats.map(() => new Float32Array(nm).fill(-1)), markN: new Int32Array(n), gmarks: G.ghost ? new Float32Array(nm).fill(-1) : null, gmarkN: 0,
    coach: G.save.stats.races < 2 && !G.film && !G.auto, coachRamp: false, coachBoost: false };   // the first two races explain gates, ramps and the boost (P20)
  stage.setRace(race, liveries, race.player); stage.setGhost(G.ghost ? G.ghost.race : null);
  // at the helms: the player's own figure, and three of the crew on the rival yachts, others every race (view/people.mjs)
  const rivals = crewFor(G.save.stats.races, 3, 5); let rk = 0;
  const boatsReady = stage.setBoats(boatKeys);
  const crewReady = Promise.all([boatsReady, stage.setSkippers(race.boats.map((b, i) => (i === race.player ? OWNER : rivals[rk++ % 3])))]);
  stage.setCameraMode('chase'); controls.releaseAll();
  E.hud.classList.toggle('final', false); $('h-of').textContent = mode === 'race' ? '/' + n : ''; E.place.textContent = mode === 'race' ? n : ''; E.count.textContent = ''; E.warn.style.display = 'none';
  for (const k of Object.keys(H)) H[k] = null;
  clearTimeout(msgT); E.msg.className = ''; msgPri = 0; msgUntil = 0;      // no message of the last race lingers into this one
  E.prog.querySelectorAll('i.rv').forEach((e) => e.remove());
  for (let i = 0; i < n; i++) if (i !== race.player) { const d = document.createElement('i'); d.className = 'rv'; d.style.background = '#' + LIVERIES[liveries[i]].accent.toString(16).padStart(6, '0'); E.prog.appendChild(d); G.run.dots.push({ el: d, i, x: null }); }
  clearTimeout(toastT); E.toast.classList.remove('show');       // a note of the menu does not hang over the start (finding 9)
  paintControlsHint(); show('race'); G.run.trackW = E.prog.clientWidth || 1; sound.music('race'); keepAwake();
  return crewReady;       // the figures at the helms have arrived: the film waits for this, a player does not
}
// A separate, unranked practice boat. The research-informed sail model is deliberately opt-in: existing races, records,
// missions and their controls retain their own rules. Its tuning is a game prototype, not a measured polar of Jack's boat.
async function startSailingTrial() {
  const c = bayCourse(), wind = { x: 4, z: -3 }, set = voyageSettings(c, { tune: 'cruise', boat: 'jukung-racer' });
  set.sailing = { wind };
  const race = new Race(set, c), me = race.boats[0];
  // Start across the breeze, so the first lesson is how a filled sail and the floats feel together.
  me.h = me.ph = Math.atan2(wind.z, wind.x); me.vx = me.vz = me.r = 0;
  G.race = race; G.rescue = null; G.ghost = null; G.mode = 'race'; G.acc = 0; G.timeScale = 1;
  G.slowLeft = 0; G.slowArmed = false; G.paused = false; G.pausedBy = null; G.resultsAt = null; G.resumeLeft = 0;
  G.sailInput = { sheet: 0.5, autoTrim: true, rigBalance: 0, crewBalance: 0 };
  G.sailLesson = BAY_GAME && G.practiceGuided !== false ? makeSailingLesson() : null;
  G.run = { mode: 'sailing', course: c.key, tune: 'cruise', livery: 'pearl', difficulty: 'practice', at: new Date().toISOString(),
    frames: 0, late: 0, worst: 0, sumMs: 0, mot0: controls.tilt.counts.mot, th0: performance.now(), steerMode: controls.mode,
    recentres0: controls.recentres, lastHud: 0, countShown: '', wake0: PF.wake.releases, trackW: 1, dots: [], coach: false };
  stage.setRescue(null); stage.setBoss(null); stage.setLevi(null); stage.setVoyage(null); stage.setGhost(null);
  stage.setWorld(Q.get('world') || 'dawn'); stage.setCourse(c); stage.setRace(race, ['pearl'], 0);
  const ready = Promise.all([stage.setBoats(['jukung-racer']), stage.setSkippers([JACK])]);
  stage.setCameraMode('chase'); controls.releaseAll(); controls.sailing = true;
  G.sailingCamera = 'chase'; stage.setCamera('chase', settings().motion === 'full' ? 1 : 0.4);
  E.hud.classList.remove('final', 'rescue', 'bossfight'); E.hud.classList.add('sailing');
  E.count.textContent = ''; E.warn.style.display = 'none'; E.arrow.style.opacity = '0';
  for (const k of Object.keys(H)) H[k] = null;
  clearTimeout(msgT); E.msg.className = ''; msgPri = 0; msgUntil = 0;
  clearTimeout(toastT); E.toast.classList.remove('show');
  $('sail-balance').open = false; paintSailControls(); paintControlsHint(); paintSailingLesson();
  show('race'); sound.music('menu'); sound.frame({ active: false, sailing: true }); keepAwake();
  if (G.film) await ready;
  return ready;
}

function paintSailControls() {
  const input = G.sailInput;
  $('sail-auto').textContent = input.autoTrim ? 'Assist ON' : 'Assist OFF';
  $('sail-auto').setAttribute('aria-pressed', String(input.autoTrim));
  $('sail-sheet').value = Math.round(input.sheet * 100);
  $('sail-rig').value = Math.round(input.rigBalance * 100); $('sail-crew').value = Math.round(input.crewBalance * 100);
  $('sail-rig-value').textContent = Math.abs(input.rigBalance) < 0.04 ? 'Centred' : input.rigBalance > 0 ? 'Forward' : 'Aft';
  $('sail-crew-value').textContent = Math.abs(input.crewBalance) < 0.04 ? 'Centred' : input.crewBalance > 0 ? 'Starboard' : 'Port';
}

function paintSailing(race, run, dt, me) {
  const left = race.go - race.t, ct = left > 0 ? String(Math.ceil(left)) : '';
  if (ct !== run.countShown) { run.countShown = ct; E.count.textContent = ct; }
  run.lastHud += dt; if (run.lastHud < 0.09) return; run.lastHud = 0;
  paintSailingLesson();
  const s = me.sailing;
  setText('h-kmh', 'kmh', fmtSpeed(Math.max(0, me.u)));
  if (!s) return;
  const angle = Math.abs(s.awa), side = s.awa >= 0 ? 'starboard' : 'port';
  $('sail-wind-arrow').style.transform = `rotate(${s.awa * 180 / Math.PI}deg)`;
  $('sail-wind-speed').textContent = `${(Math.max(0, s.aws) * 1.94384).toFixed(1)} kn`;
  $('sail-wind-from').textContent = angle < 0.15 ? 'From ahead' : angle > Math.PI - 0.2 ? 'From astern' : `From ${side}${angle < 1.05 ? ' bow' : angle > 2.1 ? ' quarter' : ''}`;
  const trim = s.noGo ? 'Head off the wind to fill the sail' : s.aws < 0.7 ? 'Waiting for the breeze' : s.luffing || s.fill < 0.25 ? 'Sail luffing \u2014 adjust the sheet' : s.trimEfficiency < 0.55 ? 'Try a little ease or trim' : G.sailInput.autoTrim ? 'Assist is keeping the sail filled' : 'Sail drawing well';
  $('sail-trim-state').textContent = trim;
  $('sail-controls').classList.toggle('luffing', !!s.noGo || !!s.luffing);
  if (G.sailInput.autoTrim) { G.sailInput.sheet = s.sheet; $('sail-sheet').value = Math.round(s.sheet * 100); }
  $('sail-load-port').style.transform = `scaleX(${clamp(s.portLoad, 0, 1)})`;
  $('sail-load-starboard').style.transform = `scaleX(${clamp(s.starboardLoad, 0, 1)})`;
  const high = Math.max(s.portLoad, s.starboardLoad), difference = s.starboardLoad - s.portLoad;
  $('sail-load-state').textContent = high > 0.9 ? 'Float pressed down \u2014 ease or balance' : Math.abs(difference) < 0.12 ? 'Floats sharing the load' : `${difference > 0 ? 'Starboard' : 'Port'} float taking the load`;
  const warn = controls.mode === 'tilt' && controls.flat ? 'Tip the screen up towards you' : Math.abs(me.lat) > Math.max(10, race.c.halfWidth - 35) ? 'Near the edge of the sailing water' : '';
  E.warn.textContent = warn; E.warn.style.display = warn ? 'block' : 'none';
}

// ---------- the rescue level: the yacht roams around the island, llamas swim from the ship to the shore, sharks come for them
// (sim/rescue.mjs). The same boat, controls, camera and display frame as a race; no laps, no rivals. ----------
async function startRescue() {
  if (G.sel.level === DRAGON.key) return startBoss();
  if (G.sel.level === LEVI.key) return startLevi();
  if (G.sel.level === HAWK.key) return startDeck();
  if (VOYAGES[G.sel.level]) return startVoyage();
  if (G.rescueStarting) return; G.rescueStarting = true;
  try {
    if (!stage.rescueView.ready) { toast('Loading the island...', 6000); await stage.rescueLoad; }
    if (!stage.rescueView.ready) return toast('The island did not load. Check the connection, then try again.', 5000);
    const { tune, livery, difficulty } = G.sel, c = arenaCourse(), seed = DEV && Q.get('seed') ? +Q.get('seed') : 5;
    stage.setWorld(Q.get('world') || ARENA.world); stage.setCourse(c);
    const race = new Race(mine(rescueSettings(c, { tune })), c), rescue = new Rescue(race, { difficulty, seed });
    G.race = race; G.rescue = rescue; G.ghost = null; G.mode = 'race'; G.acc = 0; G.timeScale = 1; G.slowLeft = 0; G.slowArmed = false; G.paused = false; G.pausedBy = null; G.resultsAt = null; G.resumeLeft = 0;
    G.run = { mode: 'rescue', course: ARENA.key, tune, livery, difficulty, at: new Date().toISOString(), frames: 0, late: 0, worst: 0, sumMs: 0, mot0: controls.tilt.counts.mot, th0: performance.now(), steerMode: controls.mode, recentres0: controls.recentres,
      lastHud: 0, countShown: '', dots: [], trackW: 1, wake0: PF.wake.releases, marks: [new Float32Array(1)], markN: new Int32Array(1), gmarks: null, gmarkN: 0,
      coach: !(G.save.stats.rescues > 0) && !G.film && !G.auto, coachAim: false, coachFollow: false, coachBoost: false };
    stage.setBoss(null); stage.setRace(race, [livery], 0); stage.setGhost(null); stage.setLevi(null); stage.setVoyage(null); E.hud.classList.remove('bossfight');
    // three of the crew swim among the llamas, others every mission; a film waits for their models, a player does not
    const crewReady = Promise.all([stage.setBoats([G.sel.boat]), stage.setSkippers([OWNER]), stage.setRescue(rescue, crewFor(G.save.stats.rescues || 0, 3, 0))]); if (G.film) await crewReady;
    stage.setCameraMode('chase'); controls.releaseAll();
    E.hud.classList.toggle('final', false); E.hud.classList.add('rescue'); $('h-of').textContent = '/' + rescue.total; E.place.textContent = '0'; E.count.textContent = ''; E.warn.style.display = 'none';
    for (const k of Object.keys(H)) H[k] = null;
    clearTimeout(msgT); E.msg.className = ''; msgPri = 0; msgUntil = 0;
    E.prog.querySelectorAll('i.rv').forEach((e) => e.remove());
    clearTimeout(toastT); E.toast.classList.remove('show');
    paintControlsHint(); show('race'); sound.music('race'); keepAwake();
  } finally { G.rescueStarting = false; }
}
function endRescue() {
  if (G.rescue.kind === 'levi') return endLevi();
  if (G.rescue.kind === 'deck') return endDeck();
  if (G.rescue.kind === 'voyage') return endVoyage();
  if (G.rescue.kind === 'boss') return endBoss();
  const race = G.race, run = G.run, R = G.rescue, sm = R.summary(), rs = race.summary();
  const result = { mode: 'rescue', course: ARENA.key, tune: run.tune, livery: run.livery, difficulty: run.difficulty, finished: sm.finished, saved: sm.saved, total: sm.total, time: sm.time, medal: sm.medal };
  const old = G.save.best[`${ARENA.key}:rescue`], r = PR.applyRescue(G.save, result);
  G.save = r.save; saveNow();
  const dur = Math.max(0.001, (performance.now() - run.th0) / 1000);
  G.lastRuns.push({ at: run.at, course: ARENA.key, mode: 'rescue', tune: run.tune, steer: run.steerMode, difficulty: run.difficulty, saved: sm.saved, total: sm.total, time: sm.time, sunk: sm.sunk, rams: sm.rams, shots: sm.shots, hits: sm.hits,
    topKmh: rs.topKmh, boostS: rs.boostS, why: sm.finished ? 'mission over' : 'left early', frames: run.frames, latePct: run.frames ? +(100 * run.late / run.frames).toFixed(1) : null, meanMs: run.frames ? +(run.sumMs / run.frames).toFixed(1) : null, worstMs: Math.round(run.worst),
    motPerS: +((controls.tilt.counts.mot - run.mot0) / dur).toFixed(0), recentres: controls.recentres - run.recentres0, tier: stage.tierKey, scale: stage.scale, render: stage.renderSize(), wake: PF.wake.state, wakeLost: PF.wake.releases - run.wake0 });
  if (G.lastRuns.length > 6) G.lastRuns.shift();
  const lvl = run.difficulty[0].toUpperCase() + run.difficulty.slice(1);
  $('r-place').innerHTML = `${sm.saved}<small>/${sm.total}</small>`;
  $('r-title').textContent = `${ARENA.name}: rescue, sharks on ${lvl}`;
  $('r-time').textContent = sm.finished ? (sm.saved === sm.total ? 'Everyone safe' : sm.saved === 0 ? 'Nobody made it' : `${sm.saved} safe`) : 'Left before the end';
  $('r-best').textContent = !sm.finished ? '' : old ? (sm.saved > old.saved ? `New best: ${sm.saved - old.saved} more than before` : `Best so far: ${old.saved} of ${old.total}`) : 'First rescue on the board';
  $('r-medal').innerHTML = sm.medal ? `<span class="medal-dot ${sm.medal}"></span><span class="name">${sm.medal}</span>` : '';
  const NEWS = { best: () => 'New best rescue', medal: (n) => `${n.medal[0].toUpperCase() + n.medal.slice(1)} medal` };
  $('r-news').innerHTML = r.news.map((n, i) => `<li style="animation-delay:${(0.9 + 0.4 * i).toFixed(1)}s">${NEWS[n.type](n)}</li>`).join('');
  r.news.forEach((n, i) => setTimeout(() => { if (G.screen === 'results' && G.race === race) sound.sfx('chip', i); }, 900 + 400 * i));
  $('r-table').innerHTML = [['Sharks sunk', sm.sunk], ['by ramming', sm.rams], ['Cannon hits', `${sm.hits}/${sm.shots}`], ['Lost', sm.lost]].map(([k, v]) => `<span></span><span>${k}</span><span>${v}</span>`).join('');
  $('r-stats').innerHTML = [`time ${sm.time === null ? '-' : PR.fmtTime(sm.time)}`, `top ${fmtSpeed(rs.topKmh / 3.6)} ${settings().units === 'kn' ? 'kn' : 'km/h'}`, `boost ${rs.boostS.toFixed(1)} s`].map((t) => `<span>${t}</span>`).join('');
  $('r-tip').textContent = !sm.finished ? '' : sm.saved < RESCUE.medals.bronze ? (run.difficulty !== 'easy' ? 'Tip: on the course screen you can set the sharks to Easy.' : 'Tip: stay near the swimmers; they follow your wake to the shore.')
    : sm.saved === sm.total && run.difficulty !== 'hard' ? 'Tip: everyone safe. Try the sharks one level up.' : '';
  G.nextCourse = null; E.nextCourse.classList.add('hidden'); E.retry.textContent = 'RESCUE AGAIN'; E.retry.className = 'cta';
  if (sm.medal && r.news.some((n) => n.type === 'medal')) setTimeout(() => { if (G.screen === 'results' && G.race === race) sound.sfx('medal'); }, 450);
  race.afterglow = true;
  G.mode = 'after'; G.acc = 0; stage.setCameraMode('orbit'); sound.music('menu'); show('results'); PF.releaseWake();
}
// ---------- the boss level: a dragon the size of an island, one of the crew on its back as the boss, six crystals to break
// (sim/boss.mjs). The same frame as the rescue level: G.rescue holds the fight, its kind is 'boss'. ----------
async function startBoss() {
  if (G.rescueStarting) return; G.rescueStarting = true;
  try {
    if (!stage.bossView.ready) { toast('Waking the dragon...', 6000); await stage.bossView.load(); }
    if (!stage.bossView.ready) return toast('The dragon did not load. Check the connection, then try again.', 5000);
    const { tune, livery, difficulty } = G.sel, c = dragonCourse(), seed = DEV && Q.get('seed') ? +Q.get('seed') : 9;
    stage.setWorld(Q.get('world') || DRAGON.world); stage.setCourse(c);
    const race = new Race(mine(bossSettings(c, { tune })), c), boss = new Boss(race, { difficulty, seed });
    G.race = race; G.rescue = boss; G.ghost = null; G.mode = 'race'; G.acc = 0; G.timeScale = 1; G.slowLeft = 0; G.slowArmed = false; G.paused = false; G.pausedBy = null; G.resultsAt = null; G.resumeLeft = 0;
    G.run = { mode: 'boss', course: DRAGON.key, tune, livery, difficulty, at: new Date().toISOString(), frames: 0, late: 0, worst: 0, sumMs: 0, mot0: controls.tilt.counts.mot, th0: performance.now(), steerMode: controls.mode, recentres0: controls.recentres,
      lastHud: 0, countShown: '', dots: [], trackW: 1, wake0: PF.wake.releases, marks: [new Float32Array(1)], markN: new Int32Array(1), gmarks: null, gmarkN: 0,
      coach: !G.save.best[`${DRAGON.key}:rescue`] && !G.film && !G.auto, coachAim: false, coachFire: false };
    stage.setRescue(null); stage.setLevi(null); stage.setVoyage(null); stage.setRace(race, [livery], 0); stage.setGhost(null);
    // the boss: one of the crew, another every time; a film waits for the models, a player does not
    const ready = Promise.all([stage.setBoats([G.sel.boat]), stage.setSkippers([OWNER]), stage.setBoss(boss, crewFor(G.save.stats.rescues || 0, 1, 8)[0])]); if (G.film) await ready;
    stage.setCameraMode('chase'); controls.releaseAll();
    E.hud.classList.remove('final', 'bossfight'); E.hud.classList.add('rescue'); $('h-of').textContent = '/' + boss.total; E.place.textContent = '0'; E.count.textContent = ''; E.warn.style.display = 'none';
    for (const k of Object.keys(H)) H[k] = null;
    clearTimeout(msgT); E.msg.className = ''; msgPri = 0; msgUntil = 0;
    E.prog.querySelectorAll('i.rv').forEach((e) => e.remove());
    clearTimeout(toastT); E.toast.classList.remove('show');
    paintControlsHint(); show('race'); sound.music('race'); keepAwake();
  } finally { G.rescueStarting = false; }
}
function endBoss() {
  const race = G.race, run = G.run, B = G.rescue, sm = B.summary(), rs = race.summary();
  const result = { mode: 'rescue', course: DRAGON.key, tune: run.tune, livery: run.livery, difficulty: run.difficulty, finished: sm.finished, saved: sm.saved, total: sm.total, time: sm.time, medal: sm.medal, boss: true, won: sm.won };
  const old = G.save.best[`${DRAGON.key}:rescue`], r = PR.applyRescue(G.save, result);
  G.save = r.save; saveNow();
  const dur = Math.max(0.001, (performance.now() - run.th0) / 1000);
  G.lastRuns.push({ at: run.at, course: DRAGON.key, mode: 'boss', tune: run.tune, steer: run.steerMode, difficulty: run.difficulty, saved: sm.saved, total: sm.total, hull: sm.hull, time: sm.time, shots: sm.shots, hits: sm.hits,
    topKmh: rs.topKmh, boostS: rs.boostS, why: !sm.finished ? 'left early' : sm.won ? 'boss beaten' : sm.hull <= 0 ? 'yacht sunk' : 'time up', frames: run.frames, latePct: run.frames ? +(100 * run.late / run.frames).toFixed(1) : null, meanMs: run.frames ? +(run.sumMs / run.frames).toFixed(1) : null, worstMs: Math.round(run.worst),
    motPerS: +((controls.tilt.counts.mot - run.mot0) / dur).toFixed(0), recentres: controls.recentres - run.recentres0, tier: stage.tierKey, scale: stage.scale, render: stage.renderSize(), wake: PF.wake.state, wakeLost: PF.wake.releases - run.wake0 });
  if (G.lastRuns.length > 6) G.lastRuns.shift();
  const lvl = run.difficulty[0].toUpperCase() + run.difficulty.slice(1);
  $('r-place').innerHTML = `${sm.saved}<small>/${sm.total}</small>`;
  $('r-title').textContent = `${DRAGON.name}: boss, fire on ${lvl}`;
  $('r-time').textContent = !sm.finished ? 'Left before the end' : sm.won ? 'The boss is beaten' : sm.hull <= 0 ? 'Your yacht was sunk' : 'Time ran out';
  $('r-best').textContent = !sm.finished ? '' : old ? (sm.saved > old.saved ? `New best: ${sm.saved - old.saved} more than before` : `Best so far: ${old.saved} of ${old.total} crystals`) : 'First fight on the board';
  $('r-medal').innerHTML = sm.medal ? `<span class="medal-dot ${sm.medal}"></span><span class="name">${sm.medal}</span>` : '';
  const NEWS = { best: () => 'New best fight', medal: (n) => `${n.medal[0].toUpperCase() + n.medal.slice(1)} medal` };
  $('r-news').innerHTML = r.news.map((n, i) => `<li style="animation-delay:${(0.9 + 0.4 * i).toFixed(1)}s">${NEWS[n.type](n)}</li>`).join('');
  r.news.forEach((n, i) => setTimeout(() => { if (G.screen === 'results' && G.race === race) sound.sfx('chip', i); }, 900 + 400 * i));
  $('r-table').innerHTML = [['Hull left', `${sm.hull}/${FIGHT.hull}`], ['Hits taken', sm.taken], ['Cannon hits', `${sm.hits}/${sm.shots}`], ['Crystals left', sm.lost]].map(([k, v]) => `<span></span><span>${k}</span><span>${v}</span>`).join('');
  $('r-stats').innerHTML = [`time ${sm.time === null ? '-' : PR.fmtTime(sm.time)}`, `top ${fmtSpeed(rs.topKmh / 3.6)} ${settings().units === 'kn' ? 'kn' : 'km/h'}`, `boost ${rs.boostS.toFixed(1)} s`].map((t) => `<span>${t}</span>`).join('');
  $('r-tip').textContent = !sm.finished ? '' : !sm.won ? (run.difficulty !== 'easy' ? 'Tip: on the course screen you can set the fire to Easy.' : 'Tip: keep turning: the fire lands where you were heading when it was thrown.')
    : sm.medal === 'gold' && run.difficulty !== 'hard' ? 'Tip: gold. Try the fire one level up.' : '';
  G.nextCourse = null; E.nextCourse.classList.add('hidden'); E.retry.textContent = 'FIGHT AGAIN'; E.retry.className = 'cta';
  if (sm.medal && r.news.some((n) => n.type === 'medal')) setTimeout(() => { if (G.screen === 'results' && G.race === race) sound.sfx('medal'); }, 450);
  race.afterglow = true;
  G.mode = 'after'; G.acc = 0; stage.setCameraMode('orbit'); sound.music('menu'); show('results'); PF.releaseWake();
}
// the boss level's display: crystals broken in place of the race position, the hull under the clock, an arrow to the crystal
// that glows when it is not ahead, a warning when fire will land where the yacht is heading
function paintBoss(race, run, dt, me) {
  const B = G.rescue;
  const left = race.go - race.t, ct = left > 0 ? String(Math.ceil(left)) : left > -0.8 ? 'GO' : '';
  if (ct !== run.countShown) { run.countShown = ct; E.count.textContent = ct; if (ct && ct !== 'GO') sound.sfx('count'); }
  run.lastHud += dt; if (run.lastHud < 0.09) return; run.lastHud = 0;
  const t = race.lapT; setText('h-time', 'time', `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`);
  setText('h-place', 'place', String(B.broken)); setText('h-lap', 'lap', 'BROKEN');
  setText('h-gap', 'gap', B.over ? '' : `hull ${Math.max(0, B.hull)} of ${FIGHT.hull}`);
  setText('h-kmh', 'kmh', fmtSpeed(Math.max(0, me.u)));
  setText('h-chain', 'chain', B.taken ? `${B.taken} hit${B.taken > 1 ? 's' : ''} taken` : '');
  const open = B.openCrystal, ang = open ? wrapA(Math.atan2(-(open.x - me.x), open.z - me.z) - me.h) : 0, far = !!open && Math.abs(ang) > 0.42 && race.racing && !B.over;
  if (far !== H.arrowOn) { H.arrowOn = far; E.arrow.style.opacity = far ? '1' : '0'; }
  if (far) { const a = Math.round(ang * 180 / Math.PI / 3) * 3; if (a !== H.arrow) { H.arrow = a; E.arrow.style.transform = `rotate(${a}deg)`; } }
  let incoming = false;
  for (const f of B.fires) { if (!f.on) continue; const tl = FIGHT.fireS - f.t; if (Math.hypot(me.x + me.vx * tl - f.x, me.z + me.vz * tl - f.z) < FIGHT.fireR + 4) incoming = true; }
  const warn = controls.mode === 'tilt' && controls.flat ? 'Tip the screen up towards you' : Math.abs(me.lat) > race.c.halfWidth && Math.hypot(me.x, me.z) > DRAGON.R ? 'Open sea: turn back' : incoming && !B.over ? 'Fire ahead: turn' : '';
  if (warn !== H.warn) { H.warn = warn; E.warn.textContent = warn; E.warn.style.display = warn ? 'block' : 'none'; }
  if (run.coach && race.racing && !B.over) {
    if (!run.coachAim && race.lapT > 2.5) { run.coachAim = true; hudMsg('BREAK THE GLOWING CRYSTAL: POINT YOUR BOW AT IT', 'tip', 2, true); }
    else if (!run.coachFire && B.fires.some((f) => f.on) && race.lapT > 6) { run.coachFire = true; hudMsg('THE RING SHOWS WHERE THE FIRE LANDS: STEER AWAY', 'tip', 2, true); }
  }
}
// ---------- the second boss level: The Leviathan (sim/leviathan.mjs). The same frame as the first: G.rescue holds the fight, its
// kind is 'levi'. The display adds a boss bar: its name and phase, its health, its stagger, the cast of the Tide Wall. ----------
async function startLevi() {
  if (G.rescueStarting) return; G.rescueStarting = true;
  try {
    const { tune, livery, difficulty } = G.sel, c = leviCourse(), seed = DEV && Q.get('seed') ? +Q.get('seed') : 2;
    stage.setWorld(Q.get('world') || LEVI.world); stage.setCourse(c);
    const race = new Race(mine(leviSettings(c, { tune })), c), levi = new Leviathan(race, { difficulty, seed });
    G.race = race; G.rescue = levi; G.ghost = null; G.mode = 'race'; G.acc = 0; G.timeScale = 1; G.slowLeft = 0; G.slowArmed = false; G.paused = false; G.pausedBy = null; G.resultsAt = null; G.resumeLeft = 0;
    G.run = { mode: 'levi', course: LEVI.key, tune, livery, difficulty, at: new Date().toISOString(), frames: 0, late: 0, worst: 0, sumMs: 0, mot0: controls.tilt.counts.mot, th0: performance.now(), steerMode: controls.mode, recentres0: controls.recentres,
      lastHud: 0, countShown: '', dots: [], trackW: 1, wake0: PF.wake.releases, marks: [new Float32Array(1)], markN: new Int32Array(1), gmarks: null, gmarkN: 0,
      coach: !G.save.best[`${LEVI.key}:rescue`] && !G.film && !G.auto, coachAim: false, named: false, bpm0: sound.bpm0 };
    stage.setRescue(null); stage.setBoss(null); stage.setVoyage(null); stage.setRace(race, [livery], 0); stage.setGhost(null); stage.setLevi(levi);
    const ready = Promise.all([stage.setBoats([G.sel.boat]), stage.setSkippers([OWNER])]); if (G.film) await ready;
    stage.setCameraMode('chase'); controls.releaseAll();
    E.hud.classList.remove('final'); E.hud.classList.add('rescue', 'bossfight'); $('h-of').textContent = '%'; E.place.textContent = '0'; E.count.textContent = ''; E.warn.style.display = 'none';
    for (const k of Object.keys(H)) H[k] = null;
    clearTimeout(msgT); E.msg.className = ''; msgPri = 0; msgUntil = 0;
    E.prog.querySelectorAll('i.rv').forEach((e) => e.remove());
    clearTimeout(toastT); E.toast.classList.remove('show');
    paintControlsHint(); show('race'); sound.music('race'); keepAwake();
  } finally { G.rescueStarting = false; }
}
function endLevi() {
  const race = G.race, run = G.run, B = G.rescue, sm = B.summary(), rs = race.summary();
  sound.bpm = run.bpm0;
  const result = { mode: 'rescue', course: LEVI.key, tune: run.tune, livery: run.livery, difficulty: run.difficulty, finished: sm.finished, saved: sm.saved, total: sm.total, time: sm.time, medal: sm.medal, boss: true, won: sm.won };
  const old = G.save.best[`${LEVI.key}:rescue`], r = PR.applyRescue(G.save, result);
  G.save = r.save; saveNow();
  const dur = Math.max(0.001, (performance.now() - run.th0) / 1000);
  G.lastRuns.push({ at: run.at, course: LEVI.key, mode: 'levi', tune: run.tune, steer: run.steerMode, difficulty: run.difficulty, saved: sm.saved, phase: sm.phase, hull: sm.hull, time: sm.time, shots: sm.shots, hits: sm.hits, stuns: sm.stuns, rams: sm.rams,
    topKmh: rs.topKmh, boostS: rs.boostS, why: !sm.finished ? 'left early' : sm.won ? 'boss beaten' : sm.hull <= 0 ? 'yacht sunk' : 'time up', frames: run.frames, latePct: run.frames ? +(100 * run.late / run.frames).toFixed(1) : null, meanMs: run.frames ? +(run.sumMs / run.frames).toFixed(1) : null, worstMs: Math.round(run.worst),
    motPerS: +((controls.tilt.counts.mot - run.mot0) / dur).toFixed(0), recentres: controls.recentres - run.recentres0, tier: stage.tierKey, scale: stage.scale, render: stage.renderSize(), wake: PF.wake.state, wakeLost: PF.wake.releases - run.wake0 });
  if (G.lastRuns.length > 6) G.lastRuns.shift();
  const lvl = run.difficulty[0].toUpperCase() + run.difficulty.slice(1);
  $('r-place').innerHTML = `${sm.saved}<small>%</small>`;
  $('r-title').textContent = `${LEVI.name}: boss, fury on ${lvl}`;
  $('r-time').textContent = !sm.finished ? 'Left before the end' : sm.won ? 'The Leviathan is beaten' : sm.hull <= 0 ? 'Your yacht was sunk' : 'Time ran out';
  $('r-best').textContent = !sm.finished ? '' : old ? (sm.saved > old.saved ? `New best: ${sm.saved - old.saved} % more than before` : `Best so far: ${old.saved} % of its health`) : 'First fight on the board';
  $('r-medal').innerHTML = sm.medal ? `<span class="medal-dot ${sm.medal}"></span><span class="name">${sm.medal}</span>` : '';
  const NEWS = { best: () => 'New best fight', medal: (n) => `${n.medal[0].toUpperCase() + n.medal.slice(1)} medal` };
  $('r-news').innerHTML = r.news.map((n, i) => `<li style="animation-delay:${(0.9 + 0.4 * i).toFixed(1)}s">${NEWS[n.type](n)}</li>`).join('');
  r.news.forEach((n, i) => setTimeout(() => { if (G.screen === 'results' && G.race === race) sound.sfx('chip', i); }, 900 + 400 * i));
  $('r-table').innerHTML = [['Hull left', `${sm.hull}/${LFIGHT.hull}`], ['Reached', `phase ${sm.phase} of 3`], ['Stuns and rams', `${sm.stuns} and ${sm.rams}`], ['Cannon hits', `${sm.hits}/${sm.shots}`]].map(([k, v]) => `<span></span><span>${k}</span><span>${v}</span>`).join('');
  $('r-stats').innerHTML = [`time ${sm.time === null ? '-' : PR.fmtTime(sm.time)}`, `top ${fmtSpeed(rs.topKmh / 3.6)} ${settings().units === 'kn' ? 'kn' : 'km/h'}`, `boost ${rs.boostS.toFixed(1)} s`].map((t) => `<span>${t}</span>`).join('');
  $('r-tip').textContent = !sm.finished ? '' : !sm.won ? (run.difficulty !== 'easy' ? 'Tip: on the course screen you can set its fury to Easy.' : 'Tip: when it lies stunned, ram it at full boost.')
    : sm.medal === 'gold' && run.difficulty !== 'hard' ? 'Tip: gold. Try its fury one level up.' : '';
  G.nextCourse = null; E.nextCourse.classList.add('hidden'); E.retry.textContent = 'FIGHT AGAIN'; E.retry.className = 'cta';
  if (sm.medal && r.news.some((n) => n.type === 'medal')) setTimeout(() => { if (G.screen === 'results' && G.race === race) sound.sfx('medal'); }, 450);
  race.afterglow = true;
  G.mode = 'after'; G.acc = 0; stage.setCameraMode('orbit'); sound.music('menu'); show('results'); PF.releaseWake();
}
// its display: how much of its health is gone in place of the race position, the hull under the clock, the boss bar (name and
// phase, health, stagger, the cast), an arrow to its lures when they are not ahead, a warning for what is about to land
function paintLevi(race, run, dt, me) {
  const B = G.rescue;
  const left = race.go - race.t, ct = left > 0 ? String(Math.ceil(left)) : left > -0.8 ? 'GO' : '';
  if (ct !== run.countShown) { run.countShown = ct; E.count.textContent = ct; if (ct && ct !== 'GO') sound.sfx('count'); }
  run.lastHud += dt; if (run.lastHud < 0.09) return; run.lastHud = 0;
  const t = race.lapT; setText('h-time', 'time', `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`);
  const done = Math.round(100 * (B.hpMax - Math.max(0, B.hp)) / B.hpMax);
  setText('h-place', 'place', String(done)); setText('h-lap', 'lap', 'TAKEN');
  setText('h-gap', 'gap', B.over ? '' : `hull ${Math.max(0, B.hull)} of ${LFIGHT.hull}`);
  setText('h-kmh', 'kmh', fmtSpeed(Math.max(0, me.u)));
  setText('h-chain', 'chain', B.taken ? `${B.taken} hit${B.taken > 1 ? 's' : ''} taken` : '');
  // the boss bar
  setText('bb-name', 'bbname', `${LEVI.name}: ${PHASES[B.phase - 1]}`);
  const hp = Math.round(100 * Math.max(0, B.hp) / B.hpMax), stun = B.st === 'stun', st = stun ? Math.round(100 * (1 - B.t / LFIGHT.stunS)) : Math.round(100 * Math.min(1, B.stag / LFIGHT.stagger));
  if (H.bbhp !== hp) { H.bbhp = hp; $('bb-hp-fill').style.width = hp + '%'; }
  if (H.bbst !== st) { H.bbst = st; $('bb-st-fill').style.width = st + '%'; }
  if (H.bbstun !== stun) { H.bbstun = stun; $('bb-st').classList.toggle('stun', stun); }
  setText('bb-cast', 'bbcast', B.over ? '' : B.st === 'cast' ? `TIDE WALL in ${Math.ceil(B.castLeft)} s: ${B.castHits} of ${LFIGHT.cast.need} hits` : stun ? (B.rammed ? 'stunned: double damage' : 'STUNNED: RAM IT') : B.st === 'dive' ? 'under water' : '');
  if (B.phase !== run.phase) { run.phase = B.phase; sound.bpm = Math.round(run.bpm0 * (1 + 0.07 * (B.phase - 1))); }
  if (!run.named && race.racing) { run.named = true; hudMsg(`I: ${PHASES[0].toUpperCase()}`, 'tip', 3, true); }
  const P = B.at(LEVI.spots[1], {}), ang = wrapA(Math.atan2(-(P.x - me.x), P.z - me.z) - me.h), far = B.exposed && Math.abs(ang) > 0.42 && race.racing && !B.over;
  if (far !== H.arrowOn) { H.arrowOn = far; E.arrow.style.opacity = far ? '1' : '0'; }
  if (far) { const a = Math.round(ang * 180 / Math.PI / 3) * 3; if (a !== H.arrow) { H.arrow = a; E.arrow.style.transform = `rotate(${a}deg)`; } }
  let incoming = false; const q = B.breach;
  for (const m of B.marks) { if (!m.on) continue; const tl = m.land - m.t; if (Math.hypot(me.x + me.vx * tl - m.x, me.z + me.vz * tl - m.z) < LFIGHT.spout.r + 4) incoming = true; }
  const under = q.on && q.locked && Math.hypot(me.x - q.x, me.z - q.z) < LFIGHT.breach.r + 6, dO = Math.hypot(me.x, me.z);
  const warn = B.over ? '' : controls.mode === 'tilt' && controls.flat ? 'Tip the screen up towards you' : Math.abs(me.lat) > race.c.halfWidth && dO > LEVI.R ? 'Open sea: turn back'
    : under ? 'It is under you: move' : B.phase >= 2 && dO < 60 ? 'The maelstrom: steer out' : incoming ? 'Water ahead: turn' : q.on && !q.locked ? 'Its shadow follows you: keep moving' : '';
  if (warn !== H.warn) { H.warn = warn; E.warn.textContent = warn; E.warn.style.display = warn ? 'block' : 'none'; }
  if (run.coach && race.racing && !B.over && !run.coachAim && race.lapT > 3.5) { run.coachAim = true; hudMsg('SHOOT THE GLOWING LURES ON ITS BACK: POINT YOUR BOW AT THEM', 'tip', 2, true); }
}
// ---------- the third boss level: Iron Hawk, the level on the deck (sim/deck.mjs). The same frame as the other fights: G.rescue
// holds it, its kind is 'deck'. The boat sails itself (the fight's handover); the player aims a gun: DK holds where it points
// (radians from the bow, and up), whether it fires, and a flare that is asked for. A finger or the mouse drags the aim and
// fires while it is down; the keys: arrows or WASD aim, the space bar fires, F sends a flare. ----------
const DK = { ay: 0, ap: 0.12, fire: false, flare: false, id: null, x: 0, y: 0, keys: { left: false, right: false, up: false, down: false, fire: false } };
const deckOn = () => !!G.rescue && G.rescue.kind === 'deck' && G.mode === 'race';
const DECK_KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'fire' };
function deckKey(code, down) { if (code === 'KeyF') { if (down) DK.flare = true; return true; } const k = DECK_KEYS[code]; if (!k) return false; DK.keys[k] = down; return true; }
function deckPointer(kind, e) {
  if (kind === 'down') { DK.id = e.pointerId; DK.x = e.clientX; DK.y = e.clientY; DK.fire = true; }
  else if (kind === 'move' && e.pointerId === DK.id) { const k = 1.7 / Math.max(240, window.innerHeight); DK.ay = wrapA(DK.ay + (e.clientX - DK.x) * k); DK.ap = clamp(DK.ap - (e.clientY - DK.y) * k, HAWK.aim.down, HAWK.aim.up); DK.x = e.clientX; DK.y = e.clientY; }
  else if (kind === 'up' && e.pointerId === DK.id) { DK.id = null; DK.fire = false; }
}
// ---- the headset (WebXR): a VR button on this level, where the browser offers an immersive session. In it the frame loop
// runs on the headset's clock, nothing pauses the game, the hand's controller aims and its trigger fires. NOT TRIED in a
// headset on this PC: the first try is the owner's. ----
const XR = { ok: false, on: false, session: null, pulls: 0, overAt: 0 }; G.xr = XR;
// (asked once, when this level first starts: asked at every page start it cost the first seconds their smoothness on the PC of the tests)
function askXr() { if (XR.asked || !navigator.xr || !navigator.xr.isSessionSupported) return; XR.asked = true; navigator.xr.isSessionSupported('immersive-vr').then((ok) => { XR.ok = !!ok; $('h-vr').classList.toggle('hidden', !XR.ok); }).catch(() => {}); }
async function enterXr() {
  if (XR.on || !XR.ok || !deckOn()) return;
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'] });
    XR.session = session; XR.on = true; session.addEventListener('end', leaveXr);
    last = null; stage.renderer.setAnimationLoop(frame); await stage.enterXr(session);   // the loop is handed over BEFORE the session starts: the renderer then stops its page loop by itself (handed over after, two loops ran at once: the smoke test's part l found it)
    G.paused = false; startRace();                              // the fight begins again, in the headset
  } catch (e) { const was = XR.on; XR.on = false; XR.session = null; if (was) { stage.renderer.setAnimationLoop(null); stage.exitXr(); last = null; requestAnimationFrame(frame); } toast('The headset did not start: ' + String((e && e.message) || e).slice(0, 80), 6000); }
}
function leaveXr() { if (!XR.on) return; XR.on = false; XR.session = null; stage.renderer.setAnimationLoop(null); stage.exitXr(); last = null; G.dirty = true; requestAnimationFrame(frame); }
// after a fight in the headset no results screen can be seen there: a new pull of the trigger, two and a half seconds on, starts it again
function xrAgain() { const F = G.rescue; if (!F || F.kind !== 'deck' || !F.over || stage.xrInput.pulls === XR.pulls || performance.now() - XR.overAt < 2500 || G.rescueStarting) return; XR.pulls = stage.xrInput.pulls; G.sel.mode = 'rescue'; G.sel.level = HAWK.key; G.paused = false; startRace(); }
// one step of the fight's input: the computer's gunner (tests and film), or the player's hand
function deckInput(F) {
  if (G.auto) { F.gunner(0.85); DK.ay = F.input.ay; DK.ap = F.input.ap; return; }
  if (XR.on) {                                                 // in the headset: the hand aims, the trigger fires, the grip sends a flare
    const I = stage.xrInput, A = stage.xrAim(F.me.h, DK); if (A) DK.ap = clamp(DK.ap, HAWK.aim.down, HAWK.aim.up);
    F.input.ay = DK.ay; F.input.ap = DK.ap; F.input.fire = I.fire; F.input.flare = I.flare; I.flare = false; return;
  }
  const K = DK.keys; DK.ay = wrapA(DK.ay + ((K.right ? 1 : 0) - (K.left ? 1 : 0)) * 1.5 * DT); DK.ap = clamp(DK.ap + ((K.up ? 1 : 0) - (K.down ? 1 : 0)) * 1.1 * DT, HAWK.aim.down, HAWK.aim.up);
  F.input.ay = DK.ay; F.input.ap = DK.ap; F.input.fire = DK.fire || K.fire; F.input.flare = DK.flare; DK.flare = false;
}
async function startDeck() {
  if (G.rescueStarting) return; G.rescueStarting = true;
  try {
    const { tune, livery, difficulty } = G.sel, c = hawkCourse(), seed = DEV && Q.get('seed') ? +Q.get('seed') : 5;
    stage.setWorld(Q.get('world') || HAWK.world); stage.setCourse(c);
    const race = new Race(mine(hawkSettings(c, { tune })), c), F = new DeckFight(race, { difficulty, seed });
    G.race = race; G.rescue = F; G.ghost = null; G.mode = 'race'; G.acc = 0; G.timeScale = 1; G.slowLeft = 0; G.slowArmed = false; G.paused = false; G.pausedBy = null; G.resultsAt = null; G.resumeLeft = 0;
    G.run = { mode: 'deck', course: HAWK.key, tune, livery, difficulty, at: new Date().toISOString(), frames: 0, late: 0, worst: 0, sumMs: 0, mot0: controls.tilt.counts.mot, th0: performance.now(), steerMode: controls.mode, recentres0: controls.recentres,
      lastHud: 0, countShown: '', dots: [], trackW: 1, wake0: PF.wake.releases, marks: [new Float32Array(1)], markN: new Int32Array(1), gmarks: null, gmarkN: 0, named: false, toldRocket: false, bpm0: sound.bpm0 };
    askXr(); Object.assign(DK, { ay: 0, ap: 0.12, fire: false, flare: false, id: null }); for (const k of Object.keys(DK.keys)) DK.keys[k] = false;
    stage.setRescue(null); stage.setBoss(null); stage.setLevi(null); stage.setVoyage(null); stage.setRace(race, [livery], 0); stage.setGhost(null); const models = stage.setDeck(F);
    const ready = Promise.all([stage.setBoats([G.sel.boat]), stage.setSkippers([OWNER]), models]); if (G.film) await ready;
    stage.setCameraMode('chase'); controls.releaseAll();
    E.hud.classList.remove('final'); E.hud.classList.add('rescue', 'bossfight', 'deck'); $('h-of').textContent = '%'; E.place.textContent = '0'; E.count.textContent = ''; E.warn.style.display = 'none';
    for (const k of Object.keys(H)) H[k] = null;
    clearTimeout(msgT); E.msg.className = ''; msgPri = 0; msgUntil = 0;
    E.prog.querySelectorAll('i.rv').forEach((e) => e.remove());
    clearTimeout(toastT); E.toast.classList.remove('show');
    show('race'); sound.music('race'); keepAwake();
  } finally { G.rescueStarting = false; }
}
function endDeck() {
  const race = G.race, run = G.run, F = G.rescue, sm = F.summary(), rs = race.summary();
  sound.bpm = run.bpm0; E.hud.classList.remove('deck');
  const result = { mode: 'rescue', course: HAWK.key, tune: run.tune, livery: run.livery, difficulty: run.difficulty, finished: sm.finished, saved: sm.saved, total: sm.total, time: sm.time, medal: sm.medal, boss: true, won: sm.won };
  const old = G.save.best[`${HAWK.key}:rescue`], r = PR.applyRescue(G.save, result);
  G.save = r.save; saveNow();
  const dur = Math.max(0.001, (performance.now() - run.th0) / 1000);
  G.lastRuns.push({ at: run.at, course: HAWK.key, mode: 'deck', tune: run.tune, steer: G.auto ? 'computer' : DK.keys.fire || Object.values(DK.keys).some(Boolean) ? 'keys' : 'drag', difficulty: run.difficulty, saved: sm.saved, half: sm.half, hull: sm.hull, time: sm.time, shots: sm.shots, hits: sm.hits, down: sm.down, breaks: sm.breaks, passes: sm.passes, stuns: sm.stuns, bites: sm.bites, wasted: sm.wasted, flares: sm.flares,
    topKmh: rs.topKmh, boostS: rs.boostS, why: !sm.finished ? 'left early' : sm.won ? 'boss beaten' : sm.hull <= 0 ? 'boat sunk' : 'time up', frames: run.frames, latePct: run.frames ? +(100 * run.late / run.frames).toFixed(1) : null, meanMs: run.frames ? +(run.sumMs / run.frames).toFixed(1) : null, worstMs: Math.round(run.worst),
    motPerS: +((controls.tilt.counts.mot - run.mot0) / dur).toFixed(0), recentres: controls.recentres - run.recentres0, tier: stage.tierKey, scale: stage.scale, render: stage.renderSize(), wake: PF.wake.state, wakeLost: PF.wake.releases - run.wake0 });
  if (G.lastRuns.length > 6) G.lastRuns.shift();
  const lvl = run.difficulty[0].toUpperCase() + run.difficulty.slice(1);
  $('r-place').innerHTML = `${sm.saved}<small>%</small>`;
  $('r-title').textContent = `${HAWK.name}: boss, fury on ${lvl}`;
  $('r-time').textContent = !sm.finished ? 'Left before the end' : sm.won ? 'The megalodon took the Iron Hawk' : sm.hull <= 0 ? 'Your boat was sunk' : 'Time ran out';
  $('r-best').textContent = !sm.finished ? '' : old ? (sm.saved > old.saved ? `New best: ${sm.saved - old.saved} % more than before` : `Best so far: ${old.saved} % of its armour`) : 'First fight on the board';
  $('r-medal').innerHTML = sm.medal ? `<span class="medal-dot ${sm.medal}"></span><span class="name">${sm.medal}</span>` : '';
  const NEWS = { best: () => 'New best fight', medal: (n) => `${n.medal[0].toUpperCase() + n.medal.slice(1)} medal` };
  $('r-news').innerHTML = r.news.map((n, i) => `<li style="animation-delay:${(0.9 + 0.4 * i).toFixed(1)}s">${NEWS[n.type](n)}</li>`).join('');
  r.news.forEach((n, i) => setTimeout(() => { if (G.screen === 'results' && G.race === race) sound.sfx('chip', i); }, 900 + 400 * i));
  $('r-table').innerHTML = [['Hull left', `${sm.hull}/${DECK.hull}`], ['Rockets shot down', String(sm.down)], ['Passes broken', `${sm.breaks} of ${sm.passes}`], ['Bites and flares left', `${sm.bites} and ${sm.flares}`]].map(([k, v]) => `<span></span><span>${k}</span><span>${v}</span>`).join('');
  $('r-stats').innerHTML = [`time ${sm.time === null ? '-' : PR.fmtTime(sm.time)}`, `hits ${sm.hits} of ${sm.shots}`, `staggered ${sm.stuns} time${sm.stuns === 1 ? '' : 's'}`].map((t) => `<span>${t}</span>`).join('');
  $('r-tip').textContent = !sm.finished ? '' : !sm.won ? (run.difficulty !== 'easy' ? 'Tip: on the course screen you can set its fury to Easy.' : 'Tip: keep the magazine for its low passes, and shoot the rockets first.')
    : sm.wasted > 0 ? 'Tip: a flare only counts while it is low: on a pass, or when it hangs staggered.' : sm.medal === 'gold' && run.difficulty !== 'hard' ? 'Tip: gold. Try its fury one level up.' : '';
  G.nextCourse = null; E.nextCourse.classList.add('hidden'); E.retry.textContent = 'FIGHT AGAIN'; E.retry.className = 'cta';
  if (sm.medal && r.news.some((n) => n.type === 'medal')) setTimeout(() => { if (G.screen === 'results' && G.race === race) sound.sfx('medal'); }, 450);
  race.afterglow = true;
  G.mode = 'after'; G.acc = 0; stage.setCameraMode('orbit'); sound.music('menu'); show('results'); PF.releaseWake();
}
// its display: how much of its armour is gone in place of the race position, the hull under the clock, the magazine and the
// flares beside it, the boss bar (name and half, armour, stagger, what it does now), and an arrow to it when it is not in view
function paintDeck(race, run, dt, me) {
  const F = G.rescue;
  const left = race.go - race.t, ct = left > 0 ? String(Math.ceil(left)) : left > -0.8 ? 'GO' : '';
  if (ct !== run.countShown) { run.countShown = ct; E.count.textContent = ct; if (ct && ct !== 'GO') sound.sfx('count'); }
  run.lastHud += dt; if (run.lastHud < 0.09) return; run.lastHud = 0;
  const t = race.lapT; setText('h-time', 'time', `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`);
  const done = Math.round(100 * (F.hpMax - Math.max(0, F.hp)) / F.hpMax);
  setText('h-place', 'place', String(done)); setText('h-lap', 'lap', 'TAKEN');
  setText('h-gap', 'gap', F.over ? '' : `hull ${Math.max(0, F.hull)} of ${DECK.hull}`);
  setText('h-chain', 'chain', F.over ? '' : F.reload > 0 ? 'RELOADING' : `${F.mag} / ${F.gun.mag}`);
  const fl = F.half === 2 && !F.over ? String(F.flares) : ''; if (fl !== H.flares) { H.flares = fl; E.flare.classList.toggle('hidden', fl === ''); E.flare.classList.toggle('none', fl === '0'); $('h-flares').textContent = fl; }
  const low = F.low && F.half === 2 && F.flares > 0 && !F.breach.on; if (low !== H.flareOn) { H.flareOn = low; E.flare.classList.toggle('ready', low); }
  setText('bb-name', 'bbname', `${HAWK.name}: ${HALVES[F.half - 1]}`);
  const hp = Math.round(100 * Math.max(0, F.hp) / F.hpMax), stun = F.st === 'stun', st = stun ? Math.round(100 * (1 - F.t / DECK.stunS)) : Math.round(100 * Math.min(1, F.stag / DECK.stagger));
  if (H.bbhp !== hp) { H.bbhp = hp; $('bb-hp-fill').style.width = hp + '%'; }
  if (H.bbst !== st) { H.bbst = st; $('bb-st-fill').style.width = st + '%'; }
  if (H.bbstun !== stun) { H.bbstun = stun; $('bb-st').classList.toggle('stun', stun); }
  setText('bb-cast', 'bbcast', F.over ? '' : F.st === 'aim' || (F.st === 'pass' && !F.struck && !F.broken) ? `THE PASS: ${F.podHits} of ${F.need} hits on its gun pod` : F.st === 'pass' ? (F.broken ? 'pass broken: it is low' : 'it is low')
    : stun ? (F.half === 2 && F.flares > 0 ? 'STAGGERED AND LOW: FIRE A FLARE' : 'staggered: more harm') : F.st === 'crip' ? (F.flares > 0 ? 'CRIPPLED: FIRE A FLARE' : 'crippled: the sea is coming') : F.rockets.some((q) => q.on) ? 'rockets: shoot them down' : 'out of reach: keep the magazine');
  if (F.half !== run.half) { run.half = F.half; sound.bpm = Math.round(run.bpm0 * (1 + 0.08 * (F.half - 1))); }
  if (!run.named && race.racing) { run.named = true; hudMsg(`I: ${HALVES[0].toUpperCase()}. DRAG TO AIM, HOLD TO FIRE`, 'tip', 3, true); }
  const ang = wrapA(Math.atan2(-(F.x - me.x), F.z - me.z) - me.h - DK.ay), far = Math.abs(ang) > 0.5 && race.racing && !F.over;
  if (far !== H.arrowOn) { H.arrowOn = far; E.arrow.style.opacity = far ? '1' : '0'; }
  if (far) { const a = Math.round(ang * 180 / Math.PI / 3) * 3; if (a !== H.arrow) { H.arrow = a; E.arrow.style.transform = `rotate(${a}deg)`; } }
  const warn = F.over || !race.racing ? '' : F.mag === 0 || F.reload > 0 ? '' : F.st === 'crip' && F.flares > 0 ? 'Its armour holds: the FLARE button' : '';
  if (warn !== H.warn) { H.warn = warn; E.warn.textContent = warn; E.warn.style.display = warn ? 'block' : 'none'; }
}
// ---------- the rescue voyages in the bay (sim/voyage.mjs; PLAN-MONKEYKING.md). The same frame again: G.rescue holds the voyage,
// its kind is 'voyage'. The boat is the jukung, whatever boat the races use; nothing is fought. The display shows who is home
// and aboard, what the lookout points at, and a warning when the boat is too fast where it must be gentle. ----------
async function startVoyage() {
  if (G.rescueStarting) return; G.rescueStarting = true;
  try {
    const { tune, livery, difficulty } = G.sel, key = G.sel.level, D = VOYAGES[key], c = bayCourse(), seed = DEV && Q.get('seed') ? +Q.get('seed') : 3;
    stage.setWorld(Q.get('world') || D.world); stage.setCourse(c);
    const race = new Race(voyageSettings(c, { tune }), c), voy = makeVoyage(race, { level: key, difficulty, seed, choices: G.choices[key] || {} });
    G.race = race; G.rescue = voy; G.ghost = null; G.mode = 'race'; G.acc = 0; G.timeScale = 1; G.slowLeft = 0; G.slowArmed = false; G.paused = false; G.pausedBy = null; G.resultsAt = null; G.resumeLeft = 0;
    G.run = { mode: 'voyage', course: key, tune, livery, difficulty, at: new Date().toISOString(), frames: 0, late: 0, worst: 0, sumMs: 0, mot0: controls.tilt.counts.mot, th0: performance.now(), steerMode: controls.mode, recentres0: controls.recentres,
      lastHud: 0, countShown: '', dots: [], trackW: 1, wake0: PF.wake.releases, marks: [new Float32Array(1)], markN: new Int32Array(1), gmarks: null, gmarkN: 0,
      coach: !G.save.best[`${key}:rescue`] && !G.film && !G.auto, coached: {}, bpm0: sound.bpm0 };
    stage.setRescue(null); stage.setBoss(null); stage.setLevi(null); stage.setRace(race, [livery], 0); stage.setGhost(null); const cast = stage.setVoyage(voy);
    const ready = Promise.all([stage.setBoats(['jukung']), stage.setSkippers([KING]), cast]); if (G.film) await ready;   // the king at the helm; where the little captain is, the stage knows
    stage.setCameraMode('chase'); controls.releaseAll();
    E.hud.classList.remove('final', 'bossfight'); E.hud.classList.add('rescue'); if (voy.storm !== undefined) E.hud.classList.add('bossfight'); $('h-of').textContent = `/${voy.total}`; E.place.textContent = '0'; E.count.textContent = ''; E.warn.style.display = 'none';
    for (const k of Object.keys(H)) H[k] = null;
    clearTimeout(msgT); E.msg.className = ''; msgPri = 0; msgUntil = 0;
    E.prog.querySelectorAll('i.rv').forEach((e) => e.remove());
    clearTimeout(toastT); E.toast.classList.remove('show');
    paintControlsHint(); show('race'); sound.music('race'); keepAwake();
  } finally { G.rescueStarting = false; }
}
const STAR_NAMES = [['thanks', 'Thanks given'], ['people', 'People home'], ['sea', 'The sea left well']];
// Kies: the three choices before a voyage (place, time, agreement). What is chosen is kept for this session.
function openKies() { const key = G.sel.level; G.choices[key] = voyageChoices(key, G.choices[key]); G.kies = { recall: VOYAGES[key].recall && !G.recalled[key] ? -1 : null }; paintKies(); show('kies'); }
function paintKies() {
  const key = G.sel.level, D = VOYAGES[key], C = G.choices[key];
  const have = VOYAGES_READY_ALL.reduce((n, k) => n + ((G.save.leaves || {})[k] || []).filter(Boolean).length, 0); $('b-kies-book').textContent = `Leaves ${have}/27`;
  // first one question from the voyage before; its answer is shown, then the choices come
  const R = D.recall, asking = !!R && G.kies && G.kies.recall !== null;
  $('k-title').textContent = asking ? `${D.name}: before you sail` : `${D.name}: choose your way`; $('k-story').textContent = D.story; $('k-ask').textContent = ''; $('b-kies-go').classList.toggle('hidden', asking);
  if (asking) { const a = G.kies.recall; $('k-rows').innerHTML = `<div class="vq"><span>RECALL<small>${R.from}</small></span><p>${R.q}</p><div class="opts">` + R.a.map((t, j) => `<button data-recall="${j}" class="${a === j ? 'on' : ''}">${t}</button>`).join('')
    + (a >= 0 ? '<button data-recall="go" class="next">To the choices</button>' : '') + `</div><div class="told">${a >= 0 ? (a === R.right ? 'Yes. ' : 'Not quite. ') + R.said : ''}</div></div>`; return; }
  $('k-rows').innerHTML = D.rows.map((r, i) => `<div class="krow"><span>${r.label}</span>` + r.opts.map(([v, name, note], j) => `<button data-row="${i}" data-opt="${j}" class="${C[r.key] === v ? 'on' : ''}"><b>${name}</b><small>${note}</small></button>`).join('') + '</div>').join('');
}
// The nine signs burned into the leaves of a voyage, in the order of his picture of the beach (the project's research
// A7-11): a wave, a leaf, a star; a spiral, a mountain, wind; a drop, a young plant, a breaking wave. Drawn here, line by line.
const SIGNS = [
  'M34 28q4-7 8 0t8 0t8 0t8 0M36 36q4-7 8 0t8 0t8 0', 'M41 39C41 27 50 20 60 20C60 31 53 39 41 39ZM41 39L58 22', 'M50 17L53 27L63 30L53 33L50 43L47 33L37 30L47 27ZM43 23l4 4M57 23l-4 4M43 37l4-4M57 37l-4-4',
  'M' + Array.from({ length: 40 }, (_, k) => { const a = k * 0.42, r = 1 + k * 0.27; return (50 + r * Math.cos(a)).toFixed(1) + ' ' + (30 + r * Math.sin(a)).toFixed(1); }).join('L'), 'M33 40L44 23L50 31L56 21L67 40ZM41 28l3 3l3-3M53 26l3 3l3-3', 'M34 25h17a4 4 0 1 0-4-4M34 31h25a4 4 0 1 1-4 4M34 37h13a3 3 0 1 1-3 3',
  'M50 18C56 27 59 31 59 35a9 9 0 1 1-18 0C41 31 44 27 50 18Z', 'M50 41V30M50 31C44 30 41 25 42 20C48 21 50 26 50 31ZM50 31C56 30 59 25 58 20C52 21 50 26 50 31ZM50 34C45 36 41 35 38 31M50 34C55 36 59 35 62 31', 'M32 40C35 24 51 17 60 25C55 23 51 26 53 31C58 26 65 31 68 40M35 33l2 1M39 27l2 2M62 22l1 2M66 26l1 2',
];
const leafSvg = (i) => `<svg viewBox="0 0 100 60" aria-hidden="true"><path class="blade" d="M4 30C24 3 76 3 96 30C76 57 24 57 4 30Z" stroke-width="1.5"/><path class="rib" d="M8 30H92" fill="none" stroke-width="0.8"/><path class="sign" d="${SIGNS[i]}" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
// Veranker: the telling on the beach. Three questions, one for each ring; an answer is a view, not a mark: it earns its leaf and
// shows what the run itself measured. Under them the voyage's nine leaves: Denken, Doen, Delen by Zelf, Samen, Systeem.
function openBeach() { if (!G.beach) return; paintBeach(); show('beach'); }
function paintBeach() {
  const Bc = G.beach, D = VOYAGES[Bc.key], have = (G.save.leaves || {})[Bc.key] || [];
  // the book: the 27 leaves, nine a voyage, one voyage at a time
  if (Bc.book) { const n = (k) => ((G.save.leaves || {})[k] || []).filter(Boolean).length, all = VOYAGES_READY_ALL.reduce((a, k) => a + n(k), 0);
    $('v-title').textContent = `The leaves: ${all} of 27`;
    $('v-qs').innerHTML = '<div class="vq"><span>3 x 3 x 3</span><p></p><div class="opts">' + VOYAGES_READY_ALL.map((k) => `<button data-book="${k}" class="tab ${k === Bc.key ? 'on' : ''}">${VOYAGES[k].depth.toUpperCase()}: ${VOYAGES[k].name}, ${n(k)} of 9</button>`).join('') + '</div><div class="told"></div></div>'; }
  else {
  const told = D.tell(Bc.sm); $('v-title').textContent = `On the beach: ${D.name}`;
  const i = Math.min(Bc.step, D.ask.length - 1), q = D.ask[i], done = Bc.ans[i] >= 0;   // one question at a time: the nine leaves stay in sight under it
  $('v-qs').innerHTML = `<div class="vq"><span>${q.ring}<small>${i + 1} of ${D.ask.length}</small></span><p>${q.q}</p><div class="opts">` + q.a.map((a, j) => `<button data-q="${i}" data-a="${j}" class="${Bc.ans[i] === j ? 'on' : ''}">${a}</button>`).join('')
    + (done && i < D.ask.length - 1 ? '<button data-next="1" class="next">Next question</button>' : '') + `</div><div class="told">${done ? told[i] : ''}</div></div>`; }
  const rows = [['DENKEN', 'think'], ['DOEN', 'do'], ['DELEN', 'share']], cols = [['ZELF', 'me'], ['SAMEN', 'us'], ['SYSTEEM', 'the bay']];
  // the table: nine leaves, each with its sign; a leaf that was earned is pale and can be read, one not yet earned lies dark
  if (Bc.sel === undefined || Bc.selKey !== Bc.key) { Bc.selKey = Bc.key; Bc.sel = -1; }
  const said = Bc.sel >= 0 ? (have[Bc.sel] ? D.leaves[Bc.sel] : 'Not earned yet: ' + D.leaves[Bc.sel]) : `${have.filter(Boolean).length} of 9 leaves. Tap a leaf to read it.`;
  $('v-leaves').innerHTML = '<div class="leaves"><span></span>' + cols.map(([c, e]) => `<span class="hd">${c}<small>${e}</small></span>`).join('')
    + rows.map(([r, e], i) => `<span class="hd">${r}<small>${e}</small></span>` + [0, 1, 2].map((j) => `<button class="leaf ${have[3 * i + j] ? 'on' : ''} ${Bc.sel === 3 * i + j ? 'sel' : ''}" data-leaf="${3 * i + j}" aria-label="${r} ${cols[j][0]}: ${have[3 * i + j] ? D.leaves[3 * i + j] : 'not earned yet'}">${leafSvg(3 * i + j)}</button>`).join('')).join('')
    + `<div id="v-leaftext">${said}</div></div>`;
}
function endVoyage() {
  const race = G.race, run = G.run, Vg = G.rescue, sm = Vg.summary(), rs = race.summary(), D = Vg.def;
  const result = { mode: 'rescue', course: D.key, tune: run.tune, livery: run.livery, difficulty: run.difficulty, finished: sm.finished, saved: sm.nStars, total: 3, time: sm.time, medal: sm.medal, voyage: true, home: sm.saved, leaves: [...sm.leaves, false, false, false] };
  const old = G.save.best[`${D.key}:rescue`], r = PR.applyRescue(G.save, result);
  G.save = r.save; saveNow();
  const dur = Math.max(0.001, (performance.now() - run.th0) / 1000);
  G.lastRuns.push({ at: run.at, course: D.key, mode: 'voyage', tune: run.tune, steer: run.steerMode, difficulty: run.difficulty, saved: sm.saved, total: sm.total, stars: sm.nStars, time: sm.time, scares: sm.scares, reefFast: sm.reefFast, freed: sm.freed, net: sm.netAboard, leaves: sm.leaves.filter(Boolean).length,
    topKmh: rs.topKmh, why: !sm.finished ? 'left early' : sm.time >= Vg.capS ? 'time up' : 'all home', frames: run.frames, latePct: run.frames ? +(100 * run.late / run.frames).toFixed(1) : null, meanMs: run.frames ? +(run.sumMs / run.frames).toFixed(1) : null, worstMs: Math.round(run.worst),
    motPerS: +((controls.tilt.counts.mot - run.mot0) / dur).toFixed(0), recentres: controls.recentres - run.recentres0, tier: stage.tierKey, scale: stage.scale, render: stage.renderSize(), wake: PF.wake.state, wakeLost: PF.wake.releases - run.wake0 });
  if (G.lastRuns.length > 6) G.lastRuns.shift();
  $('r-place').innerHTML = `${sm.nStars}<small>/3</small>`;
  $('r-title').textContent = `${D.name}: ${D.trip}`;
  $('r-time').textContent = !sm.finished ? 'Left before the end' : sm.time >= Vg.capS ? 'Time ran out' : D.endLine(sm);
  $('r-best').textContent = !sm.finished ? '' : old ? (sm.nStars > old.saved ? 'More harmony than before' : `Best so far: ${old.saved} of 3`) : 'First voyage on the board';
  $('r-medal').innerHTML = sm.medal ? `<span class="medal-dot ${sm.medal}"></span><span class="name">${sm.medal}</span>` : '';
  const NEWS = { best: () => 'New best voyage', medal: (n) => `${n.medal[0].toUpperCase() + n.medal.slice(1)} medal`, leaf: (n) => `${n.n} new ${n.n === 1 ? 'leaf' : 'leaves'}: ${n.have} of 9` };
  $('r-news').innerHTML = r.news.map((n, i) => `<li style="animation-delay:${(0.9 + 0.4 * i).toFixed(1)}s">${NEWS[n.type](n)}</li>`).join('');
  r.news.forEach((n, i) => setTimeout(() => { if (G.screen === 'results' && G.race === race) sound.sfx('chip', i); }, 900 + 400 * i));
  $('r-table').innerHTML = [...STAR_NAMES.map(([k, name]) => [name, sm.stars[k] ? 'yes' : 'not yet']), [D.unit, `${sm.saved} of ${sm.total}`]].map(([k, v]) => `<span></span><span>${k}</span><span>${v}</span>`).join('');
  $('r-stats').innerHTML = [`time ${sm.time === null ? '-' : PR.fmtTime(sm.time)}`, ...D.stats(sm)].map((t) => `<span>${t}</span>`).join('');
  $('r-tip').textContent = !sm.finished ? '' : D.tip(sm);
  G.beach = sm.finished ? { key: D.key, sm, ans: [-1, -1, -1], step: 0 } : null;
  G.nextCourse = G.beach ? ':beach' : null; E.nextCourse.classList.toggle('hidden', !G.beach); E.nextCourse.textContent = 'ON THE BEACH'; E.retry.textContent = 'SAIL AGAIN'; E.retry.className = G.beach ? 'ghost' : 'cta';
  if (sm.medal && r.news.some((n) => n.type === 'medal')) setTimeout(() => { if (G.screen === 'results' && G.race === race) sound.sfx('medal'); }, 450);
  race.afterglow = true;
  G.mode = 'after'; G.acc = 0; stage.setCameraMode('orbit'); sound.music('menu'); show('results'); PF.releaseWake();
}
function paintVoyage(race, run, dt, me) {
  const Vg = G.rescue;
  const left = race.go - race.t, ct = left > 0 ? String(Math.ceil(left)) : left > -0.8 ? 'GO' : '';
  if (ct !== run.countShown) { run.countShown = ct; E.count.textContent = ct; if (ct && ct !== 'GO') sound.sfx('count'); }
  run.lastHud += dt; if (run.lastHud < 0.09) return; run.lastHud = 0;
  const t = race.lapT, u = Math.hypot(me.vx, me.vz); setText('h-time', 'time', `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`);
  setText('h-place', 'place', String(Vg.home)); setText('h-lap', 'lap', 'HOME');
  const Hd = Vg.hud(me, u); setText('h-gap', 'gap', Vg.over ? '' : Hd.gap);
  if (Hd.gauge) { setText('bb-name', 'bbname', Hd.gauge.name + ': calm'); if (H.bbhp !== Hd.gauge.calm) { H.bbhp = Hd.gauge.calm; $('bb-hp-fill').style.width = Hd.gauge.calm + '%'; } if (H.bbst !== 0) { H.bbst = 0; $('bb-st-fill').style.width = '0%'; } setText('bb-cast', 'bbcast', Vg.over ? '' : Hd.gauge.note); }
  setText('h-kmh', 'kmh', fmtSpeed(Math.max(0, me.u)));
  const K = Vg.look; setText('h-chain', 'chain', Vg.over || !K ? '' : Vg.def.look[K.kind] || '');
  const ang = K ? wrapA(Math.atan2(-(K.x - me.x), K.z - me.z) - me.h) : 0, far = !!K && Math.abs(ang) > 0.42 && race.racing && !Vg.over;
  if (far !== H.arrowOn) { H.arrowOn = far; E.arrow.style.opacity = far ? '1' : '0'; }
  if (far) { const a = Math.round(ang * 180 / Math.PI / 3) * 3; if (a !== H.arrow) { H.arrow = a; E.arrow.style.transform = `rotate(${a}deg)`; } }
  const warn = Vg.over ? '' : controls.mode === 'tilt' && controls.flat ? 'Tip the screen up towards you' : Math.abs(me.lat) > race.c.halfWidth ? 'Open sea: turn back' : Hd.warn;
  if (warn !== H.warn) { H.warn = warn; E.warn.textContent = warn; E.warn.style.display = warn ? 'block' : 'none'; }
  if (run.coach && race.racing && !Vg.over && !run.coached.first && race.lapT > 2.5) { run.coached.first = true; hudMsg(Vg.def.first, 'tip', 2, true); }
}
// the view in a race: the chase camera or the driver's own eyes (view/stage.mjs, CAMS.helm); kept with the settings
function toggleView() {
  if (G.run && G.run.mode === 'sailing') {
    G.sailingCamera = G.sailingCamera === 'high' ? 'chase' : 'high';
    stage.setCamera(G.sailingCamera, settings().motion === 'full' ? 1 : 0.4);
    toast(G.sailingCamera === 'high' ? 'View: above the sail' : 'View: behind the boat', 1400); return;
  }
  const s = settings(); s.camera = s.camera === 'helm' ? 'chase' : 'helm'; saveNow(); applySettings(); toast(s.camera === 'helm' ? 'View: from the helm' : 'View: behind the boat', 1400);
}
function paintControlsHint() {
  const m = controls.mode, sailing = !!(G.run && G.run.mode === 'sailing' && G.mode === 'race');
  $('h-steer').classList.toggle('hidden', m !== 'touch'); $('h-left').classList.toggle('hidden', m === 'keys' || m === 'none');
  $('h-left-label').textContent = m === 'tilt' ? (sailing ? 'TILT TO STEER' : 'HOLD: DRIFT') : 'SLIDE TO STEER'; $('h-recentre').classList.toggle('hidden', m !== 'tilt');
  $('sail-control-help').textContent = m === 'keys' ? 'A/D or arrows steer. Q eases, E sheets in, T toggles assist. C changes view.' : m === 'tilt' ? 'Tilt to steer. Move the sheet to take over from assist.' : 'Slide your left thumb to steer. Move the sheet to take over from assist.';
}
function endRace() {
  if (G.run && G.run.mode === 'sailing') return; // practice never enters scoring or the results screen
  if (G.rescue) return endRescue();
  const race = G.race, run = G.run, me = race.boats[race.player], sm = race.summary(), st = race.standings(), key = run.course;
  const result = { mode: run.mode, course: key, tune: run.tune, livery: run.livery, finished: me.finished, place: sm.place, time: sm.time, sim: SIM_VERSION, boat: G.sel.boat, summary: sm,
    inputs: run.mode === 'trial' && me.finished ? encodeInputs(race.rec.steer, race.rec.flags) : null };
  const old = G.save.best[`${key}:${run.mode}`], r = PR.applyResult(G.save, result, COURSE_KEYS, COURSE_DEFS[key].medals || null);
  G.save = r.save; saveNow();
  const dur = Math.max(0.001, (performance.now() - run.th0) / 1000);
  G.lastRuns.push({ at: run.at, course: key, mode: run.mode, tune: run.tune, steer: run.steerMode, place: sm.place, boats: sm.boats, time: sm.time, passed: sm.passed, gates: sm.gates, perfects: sm.perfects, clean: sm.clean, rough: sm.rough,
    contacts: sm.contacts, topKmh: sm.topKmh, boostS: sm.boostS, why: sm.why, frames: run.frames, latePct: run.frames ? +(100 * run.late / run.frames).toFixed(1) : null, meanMs: run.frames ? +(run.sumMs / run.frames).toFixed(1) : null, worstMs: Math.round(run.worst),
    motPerS: +((controls.tilt.counts.mot - run.mot0) / dur).toFixed(0), recentres: controls.recentres - run.recentres0, tier: stage.tierKey, scale: stage.scale, render: stage.renderSize(),
    wake: PF.wake.state, wakeLost: PF.wake.releases - run.wake0 });
  if (G.lastRuns.length > 6) G.lastRuns.shift();
  // the result screen, staged: the place, then the medal, then the news one by one (P12)
  const medal = PR.medalFor(result, COURSE_DEFS[key].medals || null), c = getCourse(key);
  $('r-place').innerHTML = run.mode === 'race' ? (me.finished ? `${sm.place}<small>${ORD[sm.place] || 'th'}</small>` : '-') : '';
  $('r-title').textContent = `${c.name}: ${run.mode === 'race' ? 'race' : 'time trial'}`;
  $('r-time').textContent = me.finished ? PR.fmtTime(sm.time) : 'Not finished';
  $('r-best').textContent = me.finished ? (old && old.time <= sm.time ? `Best ${PR.fmtTime(old.time)} (+${(sm.time - old.time).toFixed(2)} s)` : old ? `New best: ${(old.time - sm.time).toFixed(2)} s faster` : 'First time on the board') : 'The race was not finished';
  $('r-medal').innerHTML = medal ? `<span class="medal-dot ${medal}"></span><span class="name">${medal}</span>` : '';
  const NEWS = { best: () => 'New best time', medal: (n) => `${n.medal[0].toUpperCase() + n.medal.slice(1)} medal`,
    unlock: (n) => (n.kind === 'tunes' ? `New tune: ${TUNES[n.key].label}` : n.kind === 'liveries' ? `New colour: ${LIVERIES[n.key].label}` : `New course: ${COURSE_DEFS[n.key].name}`) };
  $('r-news').innerHTML = r.news.map((n, i) => `<li style="animation-delay:${(0.9 + 0.4 * i).toFixed(1)}s">${NEWS[n.type](n)}</li>`).join('');
  r.news.forEach((n, i) => setTimeout(() => { if (G.screen === 'results' && G.race === race) sound.sfx('chip', i); }, 900 + 400 * i));
  // times of boats that were still racing when the player finished are estimates: marked with ~
  $('r-table').innerHTML = run.mode === 'race' ? st.map((x) => `<span class="${x.player ? 'me' : ''}">${x.place}</span><span class="${x.player ? 'me' : ''}">${x.name}</span><span class="${x.player ? 'me' : ''}">${x.time === null ? '-' : (x.finished ? '' : '~') + PR.fmtTime(x.time)}</span>`).join('') : '';
  // the numbers of the race as short pieces: a narrow column wraps between them, never inside one (finding 2)
  $('r-stats').innerHTML = [`Gates ${sm.passed}/${sm.gates}`, `${sm.perfects} perfect`, `longest row ${sm.bestChain}`, `landings ${sm.clean} clean, ${sm.rough} rough`, `top ${fmtSpeed(sm.topKmh / 3.6)} ${settings().units === 'kn' ? 'kn' : 'km/h'}`, `boost ${sm.boostS.toFixed(1)} s`]
    .map((t) => `<span>${t}</span>`).join('');
  // one line of advice where the result asks for it: last on Normal or Hard, or an easy win (tools/balance.mjs: a first-time
  // player reaches the podium on Easy, a practised one wins there every time)
  $('r-tip').textContent = run.mode !== 'race' ? ''
    : !me.finished ? (run.difficulty !== 'easy' ? 'The race ended before your finish. Tip: on the course screen you can set the rivals to Easy.' : 'The race ended before your finish. Tip: a time trial lets you learn the course alone.')
    : sm.place === sm.boats && run.difficulty !== 'easy' ? 'Tip: on the course screen you can set the rivals to Easy.'
    : sm.place === 1 && run.difficulty === 'easy' ? 'Tip: you won on Easy. The rivals on Normal put up more of a fight.' : sm.place === 1 && run.difficulty === 'normal' && G.save.stats.wins >= 3 ? 'Tip: three wins. Try the rivals on Hard.' : '';
  // a course that this race opened becomes the main button; racing again the second
  const opened = r.news.find((n) => n.type === 'unlock' && n.kind === 'courses');
  G.nextCourse = opened ? opened.key : null;
  E.nextCourse.classList.toggle('hidden', !opened); if (opened) E.nextCourse.textContent = `NEXT: ${COURSE_DEFS[opened.key].name.toUpperCase()}`;
  E.retry.textContent = run.mode === 'race' ? 'RACE AGAIN' : 'GO AGAIN'; E.retry.className = opened ? 'ghost' : 'cta';
  if (medal && r.news.some((n) => n.type === 'medal')) setTimeout(() => { if (G.screen === 'results' && G.race === race) sound.sfx('medal'); }, 450);
  race.afterglow = true;       // the boats sail on behind the result screen: the sea and the picture stay alive (T-07)
  G.mode = 'after'; G.acc = 0; stage.setCameraMode('orbit'); sound.music('menu'); show('results'); PF.releaseWake();
}
const fmtSpeed = (ms) => String(Math.round(settings().units === 'kn' ? ms * 1.94384 : ms * 3.6));

// ---------- the race display ----------
// One message slot: a more important message is not wiped by a lesser one within 0.8 s (P17). pri: finish 5, lap 4, landing and
// missed gate 3, perfect gate and tips 2, slipstream 1. long: a tip that stays 2.6 s.
let msgT = null, msgPri = 0, msgUntil = 0;
function hudMsg(text, cls = '', pri = 1, long = false) {
  const nowT = performance.now(); if (nowT < msgUntil && pri < msgPri) return;
  msgPri = pri; msgUntil = nowT + 800;
  const m = E.msg; m.className = ''; void m.offsetWidth; m.textContent = text; m.className = `show ${cls}${long ? ' long' : ''}`;
  clearTimeout(msgT); msgT = setTimeout(() => { m.className = ''; }, long ? 2650 : 1150);
}
const H = { time: null, place: null, lap: null, gap: null, kmh: null, chain: null, warn: null, fill: null, bs: null, knob: null, me: null, arrow: null, arrowOn: null };
function setText(id, key, v) { if (H[key] !== v) { H[key] = v; $(id).textContent = v; } }
// the time gap between two boats: how much later a passed the last 10 m mark that both have passed (null before the first one)
function gapS(aMarks, aN, bMarks, bN) { const k = Math.min(aN, bN) - 1; return k < 0 ? null : aMarks[k] - bMarks[k]; }
const fmtGap = (g, name) => (g === null ? '' : `${Math.min(99.9, Math.abs(g)).toFixed(1)} s ${g >= 0 ? 'behind' : 'ahead of'} ${name}`);
function paintHud(race, run, dt) {
  const me = race.boats[race.player], c = race.c, laps = race.settings.laps;
  if (run.mode === 'sailing') {
    if (controls.mode === 'touch') { const kx = Math.round(78 * controls.steer); if (kx !== H.knob) { H.knob = kx; E.knob.style.transform = `translateX(${kx}px)`; } }
    return paintSailing(race, run, dt, me);
  }
  // every frame, written only when the shown value changes: the boost bar, the button, the steering knob, the progress dots
  const fill = Math.round(500 * me.boostE / BOOST.max);
  if (fill !== H.fill) { H.fill = fill; E.fill.style.transform = `scaleX(${fill / 500})`; }
  const ready = me.boostE >= BOOST.minStart || me.boosting, bs = me.boosting ? 2 : ready ? 1 : 0;
  if (bs !== H.bs) { H.bs = bs; E.boost.classList.toggle('ready', bs === 1); E.boost.classList.toggle('on', bs === 2); E.btn.classList.toggle('ready', bs >= 1); E.btn.classList.toggle('on', bs === 2); }
  if (controls.mode === 'touch') { const kx = Math.round(78 * controls.steer); if (kx !== H.knob) { H.knob = kx; E.knob.style.transform = `translateX(${kx}px)`; } }
  if (G.rescue) return G.rescue.kind === 'voyage' ? paintVoyage(race, run, dt, me) : G.rescue.kind === 'levi' ? paintLevi(race, run, dt, me) : G.rescue.kind === 'deck' ? paintDeck(race, run, dt, me) : G.rescue.kind === 'boss' ? paintBoss(race, run, dt, me) : paintRescue(race, run, dt, me, ready);
  const total = laps * c.len, tw = run.trackW, px = Math.round(tw * clamp(me.prog / total, 0, 1));
  if (px !== H.me) { H.me = px; E.progMe.style.transform = `translateX(${px}px)`; }
  for (let k = 0; k < run.dots.length; k++) { const d = run.dots[k], x = Math.round(tw * clamp(race.boats[d.i].prog / total, 0, 1)); if (x !== d.x) { d.x = x; d.el.style.transform = `translateX(${x}px)`; } }
  // the countdown
  const left = race.go - race.t, ct = left > 0 ? String(Math.ceil(left)) : left > -0.8 ? 'GO' : '';
  if (ct !== run.countShown) { run.countShown = ct; E.count.textContent = ct; if (ct && ct !== 'GO') sound.sfx('count'); }
  // a few times a second: the numbers
  run.lastHud += dt; if (run.lastHud < 0.09) return; run.lastHud = 0;
  const t = race.lapT; setText('h-time', 'time', `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`);
  if (run.mode === 'race') {
    // a place won or lost shows and sounds (P6); side-by-side flicker is held back for 0.8 s
    if (me.place !== run.place0 && race.racing && !me.finished) { if (race.t - run.placeT > 0.8) { const up = me.place < run.place0; pulse(E.place, up ? 'up' : 'down'); E.place.classList.remove(up ? 'down' : 'up'); sound.sfx(up ? 'placeUp' : 'placeDown'); run.placeT = race.t; } run.place0 = me.place; }
    setText('h-place', 'place', String(me.place));
    const o = race.order, k = o.indexOf(race.player), oi = k > 0 ? o[k - 1] : o.length > 1 ? o[1] : -1;
    const g = oi < 0 || !race.racing ? null : k > 0 ? gapS(run.marks[race.player], run.markN[race.player], run.marks[oi], run.markN[oi]) : -gapS(run.marks[oi], run.markN[oi], run.marks[race.player], run.markN[race.player]);
    const ends = race.endsIn;        // every rival is in: the time left to finish takes the place of the gap (finding 5)
    setText('h-gap', 'gap', ends !== null ? `race ends in ${Math.ceil(ends)} s` : oi < 0 || g === null || Number.isNaN(g) ? '' : fmtGap(g, race.boats[oi].name));
  } else {
    const g = G.ghost && race.racing ? gapS(run.marks[race.player], run.markN[race.player], run.gmarks, run.gmarkN) : null;
    setText('h-gap', 'gap', !G.ghost ? 'no ghost yet' : g === null ? '' : fmtGap(g, 'your ghost'));
  }
  setText('h-lap', 'lap', `LAP ${Math.min(laps, me.laps.length + 1)}/${laps}`);
  setText('h-kmh', 'kmh', fmtSpeed(Math.max(0, me.u)));
  setText('h-chain', 'chain', me.chain > 1 ? `x${me.chain} in a row` : '');
  // the arrow to the next gate when it is not ahead; warnings
  const gt = c.gates[me.nextGate], o3 = [0, 0, 0]; pointInto(c, gt.s, (gt.lo + gt.hi) / 2, o3);
  const ang = wrapA(Math.atan2(-(o3[0] - me.x), o3[1] - me.z) - me.h), far = Math.abs(ang) > 0.5 && !me.finished && race.racing;
  if (far !== H.arrowOn) { H.arrowOn = far; E.arrow.style.opacity = far ? '1' : '0'; }
  if (far) { const a = Math.round(ang * 180 / Math.PI / 3) * 3; if (a !== H.arrow) { H.arrow = a; E.arrow.style.transform = `rotate(${a}deg)`; } }
  run.wrongT = race.racing && !me.finished && me.u > 3 && Math.abs(wrapA(Math.atan2(-me.vx, me.vz) - c.H[Math.floor(me.s / c.step) % c.N])) > 2 ? run.wrongT + 0.09 : 0;
  const warn = controls.mode === 'tilt' && controls.flat ? 'Tip the screen up towards you' : run.wrongT > 1.2 ? 'Wrong way' : Math.abs(me.lat) > c.halfWidth ? 'Back to the course' : '';
  if (warn !== H.warn) { H.warn = warn; E.warn.textContent = warn; E.warn.style.display = warn ? 'block' : 'none'; }
  // the first races: what a ramp and the boost are, said once each when they matter
  if (run.coach && race.racing && !me.finished) {
    if (!run.coachRamp) for (const r of c.ramps) { const d = wrapS(c, r.s - me.s); if (d > 35 && d < 85) { run.coachRamp = true; hudMsg('RAMP AHEAD: LAND IT STRAIGHT', 'tip', 2, true); break; } }
    if (!run.coachBoost && ready && !me.boosting && race.lapT > 4) { run.coachBoost = true; hudMsg(controls.mode === 'keys' ? 'BOOST READY: HOLD SPACE' : 'BOOST READY: HOLD YOUR RIGHT THUMB', 'tip', 2, true); }
  }
}
// the rescue level's display: llamas safe in place of the race position, the state of the sea under the clock, an arrow to the
// shark that matters most when it is not ahead
function paintRescue(race, run, dt, me, ready) {
  const R = G.rescue;
  const left = race.go - race.t, ct = left > 0 ? String(Math.ceil(left)) : left > -0.8 ? 'GO' : '';
  if (ct !== run.countShown) { run.countShown = ct; E.count.textContent = ct; if (ct && ct !== 'GO') sound.sfx('count'); }
  run.lastHud += dt; if (run.lastHud < 0.09) return; run.lastHud = 0;
  const t = race.lapT; setText('h-time', 'time', `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`);
  setText('h-place', 'place', String(R.saved)); setText('h-lap', 'lap', 'SAFE');
  setText('h-gap', 'gap', R.over || R.wave < 0 ? '' : `group ${R.wave + 1}/${R.level.waves.length}: ${R.inWater} in the sea, ${R.onDeck} on the ship`);
  setText('h-kmh', 'kmh', fmtSpeed(Math.max(0, me.u)));
  setText('h-chain', 'chain', R.lost ? `${R.lost} lost` : '');
  // the shark that matters most: one with a llama in its jaws, then one about to bite, then the one nearest to its llama
  let urgent = null, us = 1e9;
  for (const s of R.sharks) { if (s.st < SHARK.hunt || s.st > SHARK.stun) continue; const a = s.target >= 0 ? R.llamas[s.target] : null;
    const sc = s.st === SHARK.bite ? -2 : s.st === SHARK.lunge ? -1 : a ? Math.hypot(a.x - s.x, a.z - s.z) : 900; if (sc < us) { us = sc; urgent = s; } }
  const ang = urgent ? wrapA(Math.atan2(-(urgent.x - me.x), urgent.z - me.z) - me.h) : 0, far = !!urgent && Math.abs(ang) > 0.42 && race.racing && !R.over;
  if (far !== H.arrowOn) { H.arrowOn = far; E.arrow.style.opacity = far ? '1' : '0'; }
  if (far) { const a = Math.round(ang * 180 / Math.PI / 3) * 3; if (a !== H.arrow) { H.arrow = a; E.arrow.style.transform = `rotate(${a}deg)`; } }
  const warn = controls.mode === 'tilt' && controls.flat ? 'Tip the screen up towards you' : Math.abs(me.lat) > race.c.halfWidth && Math.hypot(me.x - ARENA.island.x, me.z - ARENA.island.z) > ARENA.R ? 'Open sea: turn back' : urgent && urgent.st === SHARK.bite ? 'A shark has one: hit it' : '';
  if (warn !== H.warn) { H.warn = warn; E.warn.textContent = warn; E.warn.style.display = warn ? 'block' : 'none'; }
  // the first mission: what the cannon, the wake and the boost do, said once each when they matter
  if (run.coach && race.racing && !R.over) {
    if (!run.coachAim && urgent && R.lock < 0 && race.lapT > 11) { run.coachAim = true; hudMsg('POINT YOUR BOW AT A SHARK: THE CANNON FIRES', 'tip', 2, true); }
    else if (!run.coachFollow && R.llamas.some((a) => a.follow)) { run.coachFollow = true; hudMsg('THEY FOLLOW YOUR WAKE: LEAD THEM TO THE SHORE', 'tip', 2, true); }
    else if (!run.coachBoost && run.coachAim && ready && !me.boosting && race.lapT > 25) { run.coachBoost = true; hudMsg(controls.mode === 'keys' ? 'FAR AWAY? HOLD SPACE TO BOOST' : 'FAR AWAY? BOOST WITH YOUR RIGHT THUMB', 'tip', 2, true); }
  }
}
// what the rescue level reports; true when the event was one of its own
function onRescueEvent(e) {
  switch (e.type) {
    case 'go': sound.sfx('go'); break;
    case 'wave': sound.sfx('lap'); hudMsg(e.n === 1 ? 'THE SHIP OPENS: GUARD THE SWIMMERS' : e.n === e.of ? 'LAST GROUP' : `GROUP ${e.n} OF ${e.of}`, 'cool', 4, e.n === 1); break;
    case 'jump': sound.sfx('jump', e.a); break;
    case 'splashIn': sound.sfx('splash'); break;
    case 'shark': sound.sfx('shark'); hudMsg('SHARK', 'bad', 2); break;
    case 'lunge': sound.sfx('alarm'); break;
    case 'grab': sound.sfx('grab'); hudMsg('A SHARK HAS ONE: HIT IT', 'bad', 4); pulse(E.edge, 'hit'); break;
    case 'freed': sound.sfx('perfect', 2); hudMsg('FREED', 'good', 4); break;
    case 'lostA': sound.sfx('miss'); hudMsg('ONE LOST', 'bad', 4); pulse(E.edge, 'hit'); break;
    case 'saved': sound.sfx('gate', Math.min(7, e.saved - 1)); pulse(E.place, 'up'); pulse(E.boost, 'tick'); hudMsg(`${e.saved} SAFE`, 'good', 3); break;
    case 'shot': sound.sfx('shot'); break;
    case 'hit': sound.sfx(e.dead ? 'sunk' : 'hit'); if (e.dead) { hudMsg('SHARK DOWN', 'good', 2); pulse(E.boost, 'tick'); } break;
    case 'ram': sound.sfx('ram'); hudMsg('RAMMED', 'good', 3); pulse(E.boost, 'tick'); break;
    case 'splash': break;
    case 'aground': sound.sfx('bump', e.v); break;
    case 'missionEnd': sound.sfx('finish'); hudMsg(`${e.saved} OF ${e.total} SAFE`, e.saved >= RESCUE.medals.bronze ? 'good' : 'bad', 5, true); G.resultsAt = performance.now() + 3000; stage.setCameraMode('orbit'); break;
    // the second boss level
    case 'lure': sound.sfx('hit'); pulse(E.place, 'up'); break;
    case 'spoutMark': sound.sfx('shark'); break;
    case 'spout': case 'breach': if (e.hit) { sound.sfx('ram'); hudMsg(`HIT: HULL ${Math.max(0, e.hull)} OF ${LFIGHT.hull}`, 'bad', 4); pulse(E.edge, 'hit'); } else sound.sfx('splash'); break;
    case 'breachLock': sound.sfx('alarm'); break;
    case 'maw': sound.sfx('ram'); hudMsg(`THE MAELSTROM TEARS AT THE HULL: ${Math.max(0, e.hull)} OF ${LFIGHT.hull}`, 'bad', 4); pulse(E.edge, 'hit'); break;
    case 'stun': sound.sfx('sunk'); hudMsg(e.why === 'cast' ? 'CAST BROKEN: IT IS STUNNED, RAM IT' : 'STAGGERED: RAM IT AT FULL BOOST', 'good', 5, true); pulse(E.boost, 'tick'); break;
    case 'ramLevi': sound.sfx('ram'); sound.sfx('chip', 2); hudMsg('RAMMED', 'good', 5); break;
    case 'phase': sound.sfx('alarm'); hudMsg(`${['', 'I', 'II', 'III'][e.n]}: ${e.name.toUpperCase()}`, 'tip', 6, true); break;
    case 'castStart': sound.sfx('alarm'); hudMsg(`IT CASTS THE TIDE WALL: ${e.need} HITS BREAK IT`, 'bad', 6, true); break;
    case 'tide': sound.sfx('ram'); hudMsg(`THE TIDE WALL: HULL ${Math.max(0, e.hull)} OF ${LFIGHT.hull}`, 'bad', 6); pulse(E.edge, 'hit'); break;
    case 'surface': sound.sfx('jump'); break;
    case 'vNight': stage.setWorld('night'); hudMsg('NIGHT. LOOK FOR ONE LAMP THAT BLINKS', 'tip', 5, true); break;
    case 'vFound': sound.sfx('count'); hudMsg('THERE: THE OVERDUE BOAT', 'good', 5, true); break;
    case 'vJackLoad': sound.sfx('chip', e.n); hudMsg(`IN JACK'S BOAT: ${e.n}`, 'good', 3); break;
    case 'vBroach': sound.sfx('miss'); sound.sfx('ram'); hudMsg('BROACHED: SMALLER MOVES OF THE WHEEL', 'bad', 7, true); break;
    case 'vLamp': sound.sfx('chip', 2); hudMsg('A LAMP OF THE FLEET: THE SEA EASES', 'good', 2); break;
    case 'vHelm': sound.sfx('finish'); hudMsg('THE LOOKOUT TAKES THE HELM: HE KNOWS THE WAY NOW', 'good', 6, true); break;
    case 'vCall': sound.sfx('count'); hudMsg('CAPTAIN JACK\'S ENGINE IS DEAD, NEAR THE WRECK', 'tip', 6, true); break;
    case 'vTow': sound.sfx('finish'); hudMsg('JACK IS ON THE LINE', 'good', 5, true); break;
    case 'vSnap': sound.sfx('miss'); hudMsg(e.why === 'gust' ? 'THE LINE PARTED: TAKE THE GUST ON THE BOW' : 'THE LINE PARTED: EASY ON IT', 'bad', 6, true); break;
    case 'vHeld': sound.sfx('chip', 2); hudMsg('THE LINE HELD: JACK HAD IT', 'good', 5); break;
    case 'vJoin': sound.sfx('chip', e.n); hudMsg(`IN THE LINE: ${e.n}`, 'good', 4); break;
    case 'vDropped': sound.sfx('miss'); hudMsg('A BOAT LOST THE LINE', 'bad', 5); break;
    case 'vSquall': sound.sfx('count'); stage.setWorld('squall'); hudMsg('THE SQUALL IS HERE EARLY: GATHER THE FLEET', 'tip', 6, true); break;
    case 'vRode': if (e.i === undefined) { sound.sfx('chip', 1); hudMsg(e.lee ? 'THE LAND BREAKS THE GUST' : 'RODE IT', 'good', 2); } break;
    case 'vBuried': sound.sfx('miss'); hudMsg('A FLOAT WENT UNDER: BOW OR STERN TO THE GUST', 'bad', 5); break;
    case 'vAboard': sound.sfx('chip', e.aboard); hudMsg(`ABOARD: ${e.aboard}`, 'good', 3); break;
    case 'vFull': hudMsg(`THE BOAT IS FULL: ${e.seats} AND NO MORE`, 'bad', 4); break;
    case 'vScare': sound.sfx('miss'); hudMsg('TOO FAST: YOU SCARED A SWIMMER', 'bad', 4); break;
    case 'vReef': sound.sfx('miss'); hudMsg('SLOW OVER THE REEF', 'bad', 4); break;
    case 'vTwist': sound.sfx('count'); hudMsg('LOOKOUT: A TURTLE IN A NET, DRIFTING OUT', 'tip', 6, true); break;
    case 'vFreed': sound.sfx('finish'); hudMsg('THE TURTLE IS FREE', 'good', 6, true); break;
    case 'vNet': sound.sfx('chip', 3); hudMsg('THE NET IS ABOARD', 'good', 5); break;
    case 'vNetGone': sound.sfx('miss'); hudMsg(e.freed ? 'THE NET DRIFTED OUT TO SEA' : 'THE NET AND ITS TURTLE ARE GONE', 'bad', 6, true); break;
    case 'vLost': sound.sfx('miss'); hudMsg('A GUEST DRIFTED OUT OF THE BAY', 'bad', 6, true); break;
    case 'vHome': sound.sfx('finish'); hudMsg(`HOME: ${e.home} OF ${e.total}`, 'good', 5); break;
    case 'vEnd': sound.sfx(e.stars >= 2 ? 'finish' : 'miss'); hudMsg(e.home === e.total ? 'EVERYONE IS HOME' : 'THE VOYAGE IS OVER', e.stars >= 2 ? 'good' : 'bad', 7, true); G.resultsAt = performance.now() + (G.film ? 1e9 : 2600); break;
    // ---- the level on the deck (sim/deck.mjs): what the gun, the helicopter and the megalodon say ----
    case 'dShot': sound.sfx('shot'); if (e.hit) pulse(E.cross, 'hit'); break;
    case 'dReload': sound.sfx('empty'); break;
    case 'dLoaded': sound.sfx('click'); break;
    case 'dRocket': sound.sfx('launch'); if (!G.run.toldRocket) { G.run.toldRocket = true; hudMsg('ROCKETS: SHOOT THEM DOWN', 'tip', 4, true); } break;
    case 'dRocketDown': sound.sfx('chip', 1); break;
    case 'dRocketHit': if (e.hit) { sound.sfx('ram'); hudMsg(`A ROCKET HIT: HULL ${Math.max(0, e.hull)} OF ${DECK.hull}`, 'bad', 4); pulse(E.edge, 'hit'); } else sound.sfx('splash'); break;
    case 'dAim': sound.sfx('count'); hudMsg(`IT TURNS ON YOU: ${e.need} HITS ON ITS GUN POD BREAK THE PASS`, 'tip', 5, true); break;
    case 'dBroken': sound.sfx('perfect', 2); hudMsg('THE PASS IS BROKEN', 'good', 5); break;
    case 'dStrafe': if (e.hit) { sound.sfx('ram'); hudMsg(`STRAFED: HULL ${Math.max(0, e.hull)} OF ${DECK.hull}`, 'bad', 5); pulse(E.edge, 'hit'); } break;
    case 'dStun': sound.sfx('land'); hudMsg(G.rescue.half === 2 ? 'IT HANGS LOW: FIRE A FLARE' : 'STAGGERED: IT HANGS LOW. UNLOAD', 'good', 6, true); break;
    case 'dHalf': sound.sfx('final'); stage.setWorld(HAWK.world2); hudMsg(`II: ${e.name.toUpperCase()}. THREE FLARES: FIRE ONE WHILE IT IS LOW`, 'tip', 7, true); break;
    case 'dFlare': sound.sfx('launch'); hudMsg(e.ok ? 'THE FLARE IS ON IT: THE SEA ANSWERS' : G.rescue.low ? 'THE FLARE MISSED IT' : 'TOO HIGH: THE FLARE IS WASTED', e.ok ? 'good' : 'bad', 5, true); break;
    case 'dBite': sound.sfx('rough'); hudMsg('THE MEGALODON TEARS AT IT', 'good', 6, true); break;
    case 'dBreachMiss': sound.sfx('splash'); break;
    case 'dCrippled': sound.sfx('final'); hudMsg(G.rescue.flares > 0 ? 'CRIPPLED: ITS ARMOUR HOLDS. FIRE A FLARE' : 'CRIPPLED: THE SEA IS COMING FOR IT', 'tip', 7, true); break;
    case 'dDevour': sound.sfx('rough'); break;
    case 'dEnd': XR.pulls = stage.xrInput.pulls; XR.overAt = performance.now(); sound.sfx(e.won ? 'finish' : 'miss'); hudMsg(e.won ? 'THE MEGALODON TAKES THE IRON HAWK' : e.hull <= 0 ? 'YOUR BOAT IS SUNK' : 'TIME IS UP', e.won ? 'good' : 'bad', 7, true); G.resultsAt = performance.now() + (e.won ? 4200 : 3000); if (!e.won) stage.setCameraMode('orbit'); break;
    case 'leviEnd': sound.sfx(e.won ? 'finish' : 'miss'); hudMsg(e.won ? 'THE LEVIATHAN IS BEATEN' : e.hull <= 0 ? 'YOUR YACHT IS SUNK' : 'TIME IS UP', e.won ? 'good' : 'bad', 7, true); G.resultsAt = performance.now() + 3000; stage.setCameraMode('orbit'); break;
    // the boss level
    case 'throw': sound.sfx('alarm'); break;
    case 'fire': if (e.hit) { sound.sfx('ram'); hudMsg(`HIT: HULL ${Math.max(0, e.hull)} OF ${FIGHT.hull}`, 'bad', 4); pulse(E.edge, 'hit'); } else sound.sfx('splash'); break;
    case 'crystal': sound.sfx(e.broken ? 'sunk' : 'hit'); if (e.broken) { hudMsg(e.left ? `CRYSTAL BROKEN: ${e.left} LEFT` : 'THE LAST CRYSTAL IS BROKEN', 'good', 4); pulse(E.place, 'up'); pulse(E.boost, 'tick'); } break;
    case 'bossEnd': sound.sfx(e.won ? 'finish' : 'miss'); hudMsg(e.won ? 'THE BOSS IS BEATEN' : e.hull <= 0 ? 'YOUR YACHT IS SUNK' : 'TIME IS UP', e.won ? 'good' : 'bad', 5, true); G.resultsAt = performance.now() + 3000; stage.setCameraMode('orbit'); break;
    default: return false;
  }
  return true;
}
function onRaceEvent(e, race, run) {
  stage.onEvent(e);
  if (run.mode === 'sailing') return;
  if (G.rescue && onRescueEvent(e)) return;
  const mine = e.i === race.player || e.j === race.player, me = race.boats[race.player], laps = race.settings.laps;
  if (e.type === 'go') { sound.sfx('go'); if (run.coach) hudMsg('PASS BETWEEN THE LIT BUOYS', 'tip', 2, true); }
  if (e.type === 'lastIn') { sound.sfx('final'); hudMsg(`LAST RIVAL IS IN: ${e.left} S TO FINISH`, 'bad', 4, true); }
  if (!mine) return;
  switch (e.type) {
    case 'gate': sound.sfx(e.perfect ? 'perfect' : 'gate', Math.min(7, e.chain - 1)); pulse(E.boost, 'tick'); if (e.perfect) hudMsg('PERFECT', 'good', 2); break;   // every gate ticks the boost bar (P6)
    case 'miss': sound.sfx('miss'); hudMsg('MISSED GATE', 'bad', 3); pulse(E.boost, 'drop'); pulse(E.edge, 'hit'); break;
    case 'launch': sound.sfx('launch'); G.slowArmed = settings().motion === 'full'; break;
    case 'land': if (e.ramp) { sound.sfx(e.clean ? 'land' : 'rough'); hudMsg(e.clean ? 'CLEAN LANDING' : 'ROUGH LANDING', e.clean ? 'good' : 'bad', 3); if (e.clean) pulse(E.boost, 'tick'); } else sound.sfx('hop', e.impact / 8); break;
    case 'boostOn': sound.sfx('boost'); break;
    case 'contact': sound.sfx('bump', e.v); if (e.v > 1.5) pulse(E.edge, 'hit'); break;   // a rub sounds softly; a real hit also flashes the screen edge (P6)
    case 'draft': sound.sfx('draft'); hudMsg('SLIPSTREAM', 'cool', 1); break;
    case 'lap': if (e.i === race.player && e.lap < laps) { const fin = e.lap === laps - 1; sound.sfx(fin ? 'final' : 'lap'); hudMsg(fin ? 'FINAL LAP' : `LAP ${e.lap + 1}`, 'cool', 4); E.hud.classList.toggle('final', fin); } break;
    case 'finish': if (e.i === race.player) { sound.sfx('finish'); hudMsg(run.mode === 'race' ? `${me.place}${ORD[me.place] || 'th'} PLACE` : 'FINISH', 'good', 5); G.resultsAt = performance.now() + 2600; stage.setCameraMode('orbit'); } break;
    default: break;
  }
}
// the boost was asked for with too little in the bar: say so (P6)
function boostPressed() { const r = G.race; if (G.mode !== 'race' || G.paused || !r || !r.racing || G.run.mode === 'sailing') return; const me = r.boats[r.player]; if (!me.boosting && !me.finished && me.boostE < BOOST.minStart) { sound.sfx('empty'); pulse(E.btn, 'no'); } }

// ---------- pause, background, rotation ----------
// by: 'button', 'hidden' (the page went to the background), 'away' (the window lost the focus: a system panel over the game,
// another window in front), 'rotate' (the phone was turned upright), 'sensors' (motion data stopped)
function pause(by = 'button') {
  if (XR.on) return;                                             // in the headset the page loses its focus: that is no reason to pause
  if (G.mode !== 'race' || !G.race || G.race.over) return;
  if (G.paused && !(G.resumeLeft > 0)) return;                       // already on a pause screen
  G.paused = true; G.pausedBy = by; G.resumeLeft = 0; G.dirty = true; E.count.textContent = ''; if (G.run) G.run.countShown = null;
  controls.releaseAll(); sound.frame({ active: false }); PF.releaseWake();
  show(by === 'hidden' ? 'resume' : by === 'rotate' ? 'rotate' : by === 'sensors' ? 'sensors' : 'pause');
}
// RESUME shows the frozen race with a short count, so the hands are back on the phone before the boat moves (P8)
function resume() {
  if (!G.paused || G.resumeLeft > 0 || G.mode !== 'race') return;
  sound.resume(); keepAwake(); controls.releaseAll();
  G.resumeLeft = RESUME_S; G.resumeShown = ''; show('race');
  if (controls.mode === 'tilt') hudMsg('HOLD IT STRAIGHT', 'tip', 6, true);
}
function stepResume(dt) {
  G.resumeLeft -= dt;
  const txt = G.resumeLeft > 0 ? String(Math.ceil(G.resumeLeft / (RESUME_S / 3))) : '';
  if (txt !== G.resumeShown) { G.resumeShown = txt; E.count.textContent = txt; if (txt) sound.sfx('count'); }
  if (G.resumeLeft > 0) return;
  G.resumeLeft = 0; G.paused = false; G.pausedBy = null; if (G.run) G.run.countShown = null;
  if (controls.mode === 'tilt') controls.recentre();   // the phone was put down or turned: the pose held now is straight ahead
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { pause('hidden'); sound.frame({ active: false }); }
  else { sound.resume(); if (G.started) reprobe(); last = null; }   // back: the display's rate may have changed (Low Power Mode, T-02); the screen lock comes back with RESUME
});
// A system panel pulled over the game, or another window in front, does not hide the page but takes the hands off it: pause
// (finding 8). Whether an iPhone reports Control Centre this way is a question for the phone (PHONE-TEST.md).
window.addEventListener('blur', () => { if (document.visibilityState !== 'hidden') pause('away'); });
window.addEventListener('pagehide', () => pause('hidden'));
function checkRotation() {
  const portrait = PF.env.touch && !PF.landscape();
  if (portrait && G.screen !== 'rotate') { G.before = G.screen; if (G.mode === 'race' && (!G.paused || G.resumeLeft > 0) && G.race && !G.race.over) pause('rotate'); else show('rotate'); }
  else if (!portrait && G.screen === 'rotate') {
    if (G.before === 'cal') beginCal();                    // the straight-ahead check was up: start it again (it keeps where it must return to)
    else if (G.paused) show(G.pausedBy === 'sensors' ? 'sensors' : 'pause');
    else show(G.before && G.before !== 'rotate' ? G.before : 'title');
  }
}
function size() { stage.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1); G.dirty = true; if (G.run) G.run.trackW = E.prog.clientWidth || G.run.trackW; checkRotation(); }
// a browser whose bars slide in and out sends a stream of resize events: the rotation check runs on each one, the picture's
// buffers are rebuilt once the stream pauses (finding 11)
let sizeT = 0;
window.addEventListener('resize', () => { checkRotation(); clearTimeout(sizeT); sizeT = setTimeout(size, 120); });
window.addEventListener('orientationchange', () => setTimeout(size, 250));

// ---------- start, straight-ahead check ----------
// START, all inside the tap: motion access and sound. The straight-ahead screen comes up at once and waits there for the answer
// to the phone's motion question, however long the player takes over it (finding 1).
function onStart() {
  if (G.starting) return null; G.starting = true;
  PF.initHaptic(); PF.haptic();
  const audio = sound.start();
  const p = controls.start();
  sound.music('menu'); if (audio) setTimeout(() => sound.sfx('check'), 250);
  G.started = true; G.afterCal = Q.get('sailing') === '1' ? 'sailing' : BAY_GAME ? (BAY_JOURNEYS.includes(Q.get('voyage')) ? 'bay-voyage' : 'bay') : null;
  beginCal();
  return p;
}
// The check takes at least 1.5 s while a ring fills (time to bring the phone into the steering pose), needs the phone still for
// the last 0.6 s, and shows that it worked for a beat before the next screen (P15).
const CAL_HOLD_MS = 1500, CAL_DONE_MS = 800;
function beginCal() {
  G.calT = performance.now(); G.calTry = 0; G.calDone = 0; G.calP = '';
  $('b-cal-anyway').classList.add('hidden'); E.calWheel.classList.remove('ok'); E.calWheel.style.setProperty('--p', '0');
  $('cal-title').textContent = 'Hold your phone like a steering wheel'; $('cal-msg').textContent = 'Looking for the motion sensors...';
  show('cal');
}
// back to where the check was asked for: the pause menu of a running race (P1, T-06), otherwise the courses
function finishCal(mode, note) {
  controls.setMode(mode);
  const back = G.afterCal; G.afterCal = null;
  if (back === 'pause' && G.mode === 'race' && G.paused) { paintControlsHint(); show('pause'); }
  else if (back === 'sailing') { G.sel.mode = 'sailing'; startRace(); }
  else if (BAY_GAME && back === 'bay-voyage') chooseBayVoyage(G.sel.level);
  else if (BAY_GAME) returnToBay();
  else { paintMenu(); show('menu'); }
  if (note && G.sel.mode === 'sailing') note = PF.env.touch ? 'Steer with your left thumb or tilt. Move the sheet to trim the sail.' : 'A/D or arrows steer. Q eases, E sheets in, T toggles trim assist.';
  else if (note && BAY_GAME) note = PF.env.touch ? 'Steer with your left thumb or tilt. Choose a voyage when you are ready.' : 'A/D or arrows steer. S slows the boat on a voyage.';
  if (note) toast(note, 4200);
}
function stepCal(th) {
  if (G.calDone) { if (th - G.calDone > CAL_DONE_MS) { G.calDone = 0; finishCal('tilt'); } return; }   // this screen has just said that it is set: no note over the course cards (finding 9)
  const st = controls.sensorState();
  // the phone's motion question is still open: the check starts when the answer is in, however long that takes (finding 1)
  if (st === 'asking') { G.calT = th; if (G.calP !== 'ask') { G.calP = 'ask'; $('cal-msg').textContent = 'Waiting for your answer to the motion question: Allow lets you steer by tilting.'; } return; }
  if (G.calP === 'ask') { G.calP = ''; $('cal-msg').textContent = 'Looking for the motion sensors...'; }
  if (st === 'touch') { finishCal('touch', controls.perm && [controls.perm.motion, controls.perm.orientation].includes('denied') ? 'Motion access was refused, so steering is by touch: slide your left thumb, boost with your right.'
    : PF.env.touch ? 'No motion data on this device, so steering is by touch: slide your left thumb, boost with your right.' : 'No motion sensor here: steer with the arrow keys or A and D, space boosts.'); return; }
  if (st !== 'tilt') { if (th - G.calT > 2500 && controls.mode !== 'keys') finishCal('touch', 'No motion data: slide your left thumb to steer.'); return; }
  const g = controls.tilt.gEma;
  if (g) E.calNeedle.style.transform = `rotate(${clamp(Math.atan2(g[1], Math.abs(g[0]) + 1e-6) * 180 / Math.PI, -60, 60).toFixed(1)}deg)`;
  const p = clamp((th - G.calT) / CAL_HOLD_MS, 0, 1), ps = p.toFixed(2);
  if (ps !== G.calP) { G.calP = ps; E.calWheel.style.setProperty('--p', ps); }
  if (p < 1) { $('cal-msg').textContent = 'Hold it the way you want to steer straight.'; return; }
  if (th - G.calTry < 250) return;
  G.calTry = th;
  const r = controls.calibrate();
  if (r.ok) { E.calWheel.classList.add('ok'); $('cal-title').textContent = 'Straight ahead is set'; $('cal-msg').textContent = 'Tilt left and right to steer.'; G.calDone = th; return; }
  $('cal-msg').textContent = r.why === 'moved' ? 'Keep it still for a moment...' : 'Waiting for the sensors...';
  if (th - G.calT > 5000) $('b-cal-anyway').classList.remove('hidden');
}

// ---------- menu ----------
function paintMenu() {
  if (BAY_GAME) return paintBay();
  const s = G.save, sel = G.sel, lock = '<i class="lock"></i>';
  const sailing = sel.mode === 'sailing';
  $('s-menu').classList.toggle('sailing-menu', sailing);
  $('p-tune').classList.toggle('hidden', sailing); $('p-colour').classList.toggle('hidden', sailing);
  const voyTab = sel.mode === 'rescue' && !!VOYAGES[sel.level];
  $('m-modes').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.mode === 'voyage' ? voyTab : b.dataset.mode === sel.mode && !voyTab));
  if (sailing) {
    $('m-diff-wrap').classList.add('hidden');
    $('m-courses').innerHTML = '<article class="sailing-card"><div><span class="sail-eyebrow">OPEN WATER \u00B7 JUKUNG</span><h2>Jack\u2019s sailing trial</h2><p>Read the breeze. Feel the floats. Find the balance.</p><p class="dim small">A sailing practice inspired by traditional boat craft, ready for Jack to put through its paces.</p></div><div class="sailing-card-notes"><span><b>01</b> Steer across the wind</span><span><b>02</b> Ease and trim the sheet</span><span><b>03</b> Balance rig and crew</span></div></article>';
    $('m-hint').textContent = 'Trim assist starts on. Move the sheet for manual control; open Balance the boat to adjust rig and crew weight.';
    $('b-go').textContent = 'SAIL'; return;
  }
  const rescue = sel.mode === 'rescue';
  if (rescue) {
    const rgb = (a) => `rgb(${a.map((v) => Math.round(255 * Math.min(1, Math.sqrt(v)))).join(',')})`;
    const card = (Lv, line, bestText) => { const best = s.best[`${Lv.key}:rescue`], medal = s.medals[`${Lv.key}:rescue`], w = WORLDS[Lv.world] || WORLDS.sunset;
      return `<button class="card ${sel.level === Lv.key ? 'on' : ''}" data-level="${Lv.key}"><span class="sw" style="background:linear-gradient(180deg, ${rgb(w.zenith)} 0%, ${rgb(w.horizon)} 78%, ${rgb(w.scatter)} 100%)"></span>`
        + `<span class="medal"><span class="medal-dot ${medal || 'none'}"></span></span><b>${Lv.name}</b><small>${line}</small><small>${best ? bestText(best) : 'Not played yet'}</small></button>`; };
    if (voyTab) $('m-courses').innerHTML = VOYAGE_KEYS.map((k) => card(VOYAGES[k], `${VOYAGES[k].depth}: ${VOYAGES[k].trip}`, (b) => `Best: ${b.saved} of 3 harmonies, ${((s.leaves || {})[k] || []).filter(Boolean).length} of 9 leaves`)).join('');
    else $('m-courses').innerHTML = card(ARENA, 'Nine llamas and three of the crew leave the ship', (b) => `Best: ${b.saved} of ${b.total} safe`)
      + card(DRAGON, 'A boss on a dragon the size of an island', (b) => `Best: ${b.saved} of ${b.total} crystals`)
      + card(LEVI, 'A sea guardian in three phases', (b) => `Best: ${b.saved} % of its health`)
      + card(HAWK, 'On the deck with a gun: a gunship above, something below', (b) => `Best: ${b.saved} % of its armour`);
  } else
  $('m-courses').innerHTML = COURSE_KEYS.map((k, i) => {
    const d = COURSE_DEFS[k], open = PR.courseOpen(s, COURSE_KEYS, k), best = s.best[`${k}:${sel.mode}`], medal = s.medals[`${k}:${sel.mode}`], w = WORLDS[d.world] || WORLDS.sunset;
    const rgb = (a) => `rgb(${a.map((v) => Math.round(255 * Math.min(1, Math.sqrt(v)))).join(',')})`;
    return `<button class="card ${k === sel.course ? 'on' : ''} ${open ? '' : 'locked'}" data-course="${k}"><span class="sw" style="background:linear-gradient(180deg, ${rgb(w.zenith)} 0%, ${rgb(w.horizon)} 78%, ${rgb(w.scatter)} 100%)"></span>`
      + `<span class="medal"><span class="medal-dot ${medal || 'none'}"></span></span><b>${d.name}</b><small>${open ? `${w.label}, ${d.laps} laps` : `Finish in the top 3 on ${COURSE_DEFS[COURSE_KEYS[i - 1]].name}`}</small><small>${open ? (best ? 'Best ' + PR.fmtTime(best.time) : 'No time yet') : lock + 'Locked'}</small></button>`;
  }).join('');
  $('m-tunes').innerHTML = TUNE_KEYS.map((k) => { const open = s.unlocked.tunes.includes(k); return `<button data-tune="${k}" class="${k === sel.tune ? 'on' : ''} ${open ? '' : 'locked'}">${open ? '' : lock}${TUNES[k].label}</button>`; }).join('');
  $('m-liveries').innerHTML = LIVERY_KEYS.map((k) => { const L = LIVERIES[k], col = L.amount ? `rgb(${L.color.map((v) => Math.round(255 * Math.sqrt(v))).join(',')})` : '#f6f6f2', open = s.unlocked.liveries.includes(k);
    return `<button data-livery="${k}" aria-label="${L.label}" class="${k === sel.livery && sel.boat === 'yacht' ? 'on' : ''} ${open ? '' : 'locked'}"><i style="background:${col}"></i>${open ? '' : '<span class="lock"></span>'}</button>`; }).join('')
    + `<button data-boat="next" aria-label="Boat: ${FLEET[sel.boat].label}. Tap for the next boat" class="boat ${sel.boat !== 'yacht' ? 'on' : ''}">${FLEET[sel.boat].label}</button>`;   // the yacht's six colours, then one button that steps through the boats (three chips did not fit a phone: smoke part f)
  $('m-diff').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.diff === sel.difficulty));
  $('m-diff-wrap').classList.toggle('hidden', sel.mode === 'trial'); $('m-diff-label').textContent = rescue ? (sel.level === DRAGON.key ? 'Fire' : sel.level === LEVI.key || sel.level === HAWK.key ? 'Fury' : VOYAGES[sel.level] ? 'Current' : 'Sharks') : 'Rivals';
  $('b-go').textContent = sel.mode === 'race' ? 'RACE' : rescue ? (sel.level === DRAGON.key || sel.level === LEVI.key || sel.level === HAWK.key ? 'FIGHT' : VOYAGES[sel.level] ? 'SAIL' : 'RESCUE') : 'GO';
  const T = TUNES[sel.tune];
  if (rescue && VOYAGES[sel.level]) { $('m-hint').innerHTML = 'The lookout points the way. A guest comes aboard when the boat lies close and slow.<span class="more"> You sail the jukung; nothing is fought.</span>'; return; }
  if (rescue && sel.level === HAWK.key) { $('m-hint').innerHTML = 'The boat sails itself: drag to aim, hold to fire. Shoot its rockets down; hit the gun pod on its low passes.<span class="more"> Later a flare, fired while it is low, calls what swims below.</span>'; return; }
  if (rescue && sel.level === LEVI.key) { $('m-hint').innerHTML = 'Shoot the glowing lures on its back while it is up.<span class="more"> Stagger it, then ram it at full boost.</span>'; return; }
  if (rescue && sel.level === DRAGON.key) { $('m-hint').innerHTML = 'Point your bow at the glowing crystal and the cannon fires.<span class="more"> Keep turning: the fire lands where you were heading.</span>'; return; }
  if (rescue) { $('m-hint').innerHTML = 'Point your bow at a shark and the cannon fires; ram one at speed.<span class="more"> Swimmers near your yacht follow its wake to the shore.</span>'; return; }
  // the second sentence makes way for the course cards on a small phone (css: .more; finding 9)
  $('m-hint').innerHTML = `${T.label}: top ${fmtSpeed(T.top)} ${settings().units === 'kn' ? 'kn' : 'km/h'}, ${T.turnRate >= 62 ? 'quick turns' : T.grip < 2.5 ? 'slides wide' : 'steady'}.`
    + `<span class="more"> ${sel.mode === 'race' ? 'Gates and clean landings fill the boost; clip a gate\'s inside buoy for PERFECT.' : 'Alone against the clock and your own ghost.'}</span>`;
}
function menuClick(e) {
  const b = e.target.closest('button'); if (!b) return; const s = G.save, sel = G.sel; sound.resume(); sound.sfx('click');
  if (b.dataset.mode === 'voyage') { sel.mode = 'rescue'; if (!VOYAGES[sel.level]) { sel.fight = sel.level; sel.level = sel.voyage || VOYAGE_KEYS[0]; } }
  else if (b.dataset.mode) { sel.mode = b.dataset.mode; if (VOYAGES[sel.level]) { sel.voyage = sel.level; sel.level = sel.fight || ARENA.key; } }
  else if (b.dataset.level) sel.level = b.dataset.level;
  else if (b.dataset.course) { if (!PR.courseOpen(s, COURSE_KEYS, b.dataset.course)) return toast(`Finish in the top 3 on ${COURSE_DEFS[COURSE_KEYS[COURSE_KEYS.indexOf(b.dataset.course) - 1]].name} to open this course.`); sel.course = b.dataset.course; if (G.demoCourse !== sel.course) startDemo(sel.course); }
  else if (b.dataset.tune) { if (!s.unlocked.tunes.includes(b.dataset.tune)) return toast(`${TUNES[b.dataset.tune].label} tune: ${PR.UNLOCKS.tunes[b.dataset.tune]}.`); sel.tune = b.dataset.tune; }
  else if (b.dataset.livery) { if (!s.unlocked.liveries.includes(b.dataset.livery)) return toast(`${LIVERIES[b.dataset.livery].label}: ${PR.UNLOCKS.liveries[b.dataset.livery]}.`); sel.livery = b.dataset.livery; sel.boat = 'yacht'; settings().boat = 'yacht'; saveNow(); stage.setBoats(['yacht', 'yacht', 'yacht', 'yacht']); stage.boats[3] && stage.boats[3].vis.setLivery(sel.livery); }
  else if (b.dataset.boat) { sel.boat = FLEET_KEYS[(FLEET_KEYS.indexOf(sel.boat) + 1) % FLEET_KEYS.length]; settings().boat = sel.boat; saveNow(); stage.setBoats(['yacht', 'yacht', 'yacht', sel.boat]); toast(`${FLEET[sel.boat].label}: ${BOAT_STATS[sel.boat].note}.`, 3200); }
  else if (b.dataset.diff) { sel.difficulty = b.dataset.diff; settings().difficulty = sel.difficulty; saveNow(); }
  paintMenu();
}

// ---------- settings and the test card ----------
function paintSettings() {
  const s = settings();
  document.querySelectorAll('#set-grid [data-set]').forEach((box) => box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(s[box.dataset.set]) === b.dataset.v)));
  $('set-maxdeg').value = s.maxDeg; $('set-maxdeg-v').textContent = s.maxDeg;
}
function settingsClick(e) {
  const b = e.target.closest('button'), box = b && b.closest('[data-set]'); if (!box) return; sound.resume(); sound.sfx('click');
  const k = box.dataset.set, v = b.dataset.v; settings()[k] = v === 'true' ? true : v === 'false' ? false : v;
  if (k === 'steering') { if (v === 'touch') controls.setMode('touch'); else if (controls.tiltAvailable() && controls.tilt.cal) controls.setMode('tilt'); else if (v === 'tilt') toast(controls.tiltAvailable() ? 'Press "Set straight ahead again".' : 'No motion data on this device: touch steering stays on.'); }
  applySettings(); saveNow(); paintSettings(); paintControlsHint();
}
function cardText() {
  const s = settings(), I = controls.info(), gl = stage.renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info'), L = [], mem = stage.renderer.info.memory;
  L.push(`Crest Run test card | ${VERSION} built ${BUILD}, sim ${SIM_VERSION} | device clock ${new Date().toISOString()} | ${location.host}`);
  L.push(`Device: ${PF.shortUA()} (may be frozen) | GPU ${dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)} | DPR ${window.devicePixelRatio} | screen ${screen.width}x${screen.height} | window ${window.innerWidth}x${window.innerHeight} | Home Screen app ${PF.env.standalone ? 'yes' : 'no'} | https ${PF.env.secure ? 'yes' : 'no'}`);
  L.push(`Picture: tier ${stage.tierKey} (${s.quality}), render ${stage.renderSize()} at scale ${stage.scale}, bloom pipeline ${stage.post.enabled ? 'on' : 'off'} (half-float targets ${stage.post.hdr ? 'yes' : 'no'}) | refresh seen ${G.refresh ? (1000 / G.refresh.interval).toFixed(1) + ' Hz' + (G.refresh.snapped ? '' : ' (not a usual rate)') + (G.refresh.interval > 30 ? ': 30 Hz, Low Power Mode or a slow frame' : '') : '?'}, measured ${G.probes}x | draw calls ${stage.stats.calls}, triangles ${stage.stats.triangles} | GPU objects: ${mem.geometries} geometries, ${mem.textures} textures, ${stage.renderer.info.programs ? stage.renderer.info.programs.length : '?'} programs`);
  L.push(`Governor changes [s, scale, tier, why]: ${gov.changes.length ? gov.changes.map((c) => c.join(' ')).join('; ') : 'none'}`);
  L.push(`Steering: ${I.mode} (setting ${s.steering}) | permission ${I.perm ? `${I.perm.motion}/${I.perm.orientation}` : 'not asked'} | gyro ${I.tilt.gyro} | events/s motion ${I.rates.mot.toFixed(0)}, orientation ${I.rates.ori.toFixed(0)} | interval ${I.tilt.interval || '?'} | calibrations ${I.tilt.calOk} ok, ${I.tilt.calRejected} refused${I.tilt.cal ? ` (last: moved ${I.tilt.cal.spread} deg, tilted back ${I.tilt.cal.tiltBack} deg)` : ''} | recentres ${I.recentres} | full lock ${I.maxDeg} deg, reverse ${I.invert ? 'on' : 'off'}`);
  L.push(`Sound: ${s.sound ? 'on' : 'off'}, music ${s.music ? 'on' : 'off'}, engine ${sound.state}, audio session ${sound.session}, effects played ${sound.tones} | screen lock ${PF.wake.state} (taken away by the phone ${PF.wake.releases}x, let go by the game ${PF.wake.given}x)${G.wakeTold ? ', the player was told to touch the screen' : ''} | storage ${G.storage ? 'ok' : 'FAILED'} | camera ${s.camera}, motion ${s.motion}`);
  if (!G.lastRuns.length) L.push('Runs: none yet');
  G.lastRuns.forEach((r, i) => L.push((r.mode === 'deck' ? `Run ${i + 1} ${r.course} deck ${r.tune} (${r.steer}), fury ${r.difficulty}: ${r.why}, armour taken ${r.saved} %, half ${r.half}, hull ${r.hull}/${DECK.hull}, time ${r.time ?? '-'} s, shots ${r.hits}/${r.shots}, rockets down ${r.down}, passes broken ${r.breaks}/${r.passes}, stuns ${r.stuns}, bites ${r.bites}, flares wasted ${r.wasted}, left ${r.flares}`
    : r.mode === 'levi' ? `Run ${i + 1} ${r.course} boss ${r.tune} (${r.steer}), fury ${r.difficulty}: ${r.why}, health taken ${r.saved} %, phase ${r.phase}, hull ${r.hull}/${LFIGHT.hull}, time ${r.time ?? '-'} s, stuns ${r.stuns}, rams ${r.rams}, cannon hits ${r.hits}/${r.shots}, top ${r.topKmh} km/h, boost ${r.boostS} s`
    : r.mode === 'boss' ? `Run ${i + 1} ${r.course} boss ${r.tune} (${r.steer}), fire ${r.difficulty}: ${r.why}, crystals ${r.saved}/${r.total}, hull ${r.hull}/${FIGHT.hull}, time ${r.time ?? '-'} s, cannon hits ${r.hits}/${r.shots}, top ${r.topKmh} km/h, boost ${r.boostS} s`
    : r.mode === 'rescue' ? `Run ${i + 1} ${r.course} rescue ${r.tune} (${r.steer}), sharks ${r.difficulty}: ${r.why}, safe ${r.saved}/${r.total}, time ${r.time ?? '-'} s, sharks sunk ${r.sunk} (${r.rams} rammed), cannon hits ${r.hits}/${r.shots}, top ${r.topKmh} km/h, boost ${r.boostS} s`
    : `Run ${i + 1} ${r.course} ${r.mode} ${r.tune} (${r.steer}): ${r.why}, place ${r.place}/${r.boats}, time ${r.time ?? '-'} s, gates ${r.passed}/${r.gates} (${r.perfects} perfect), landings ${r.clean} clean ${r.rough} rough, contacts ${r.contacts}, top ${r.topKmh} km/h, boost ${r.boostS} s`)
    + ` | frames ${r.frames}, late ${r.latePct} %, mean ${r.meanMs} ms, worst ${r.worstMs} ms | motion events ${r.motPerS}/s | recentres ${r.recentres} | tier ${r.tier}, scale ${r.scale}, render ${r.render} | screen lock at the finish: ${r.wake}, taken away ${r.wakeLost}x`));
  L.push(`Progress: races ${G.save.stats.races}, finished ${G.save.stats.finished}, wins ${G.save.stats.wins} | page errors ${G.errors.length}${G.errors.length ? ': ' + G.errors.slice(-3).join(' / ') : ''}`);
  return L.join('\n').replace(/[^\x20-\x7e\n]/g, '?');
}

// ---------- the frame loop ----------
let last = null;
const AUTO = { steer: 0, brake: 0, boost: 0 };
// one physics step of the player's race: the player's inputs (or the computer's, for tests and film), the ghost in step, events
function stepRace(race, run) {
  if (run.mode === 'sailing') {
    race.step(controls.steer, 0, 0, G.sailInput);
    if (G.sailLesson && race.racing) {
      const wasStep = G.sailLesson.step, wasComplete = G.sailLesson.complete;
      advanceSailingLesson(G.sailLesson, race.boats[race.player].sailing, { ...G.sailInput, steer: controls.steer }, DT);
      if (G.sailLesson.step !== wasStep) {
        sound.sfx('check');
        if (G.sailLesson.step === 2) $('sail-balance').open = true;
      }
      if (!wasComplete && G.sailLesson.complete) { G.save.bay.sailingComplete = true; saveNow(); sound.sfx('check'); }
    }
    for (const e of race.events) onRaceEvent(e, race, run);
    race.events.length = 0; return;
  }
  if (G.auto || (G.rescue && G.rescue.handover && !G.rescue.over)) { if (G.rescue) G.rescue.pilot(AUTO); else race.drive(race.boats[race.player], AUTO); race.step(AUTO.steer, AUTO.brake, AUTO.boost); }
  else race.step(controls.steer, controls.brake, controls.boost);
  if (G.rescue && G.rescue.kind === 'deck') deckInput(G.rescue);
  if (G.rescue) G.rescue.step();
  if (G.ghost && !G.ghost.race.done) { const gh = G.ghost, k = gh.race.step_; if (k < gh.steer.length) gh.race.step(gh.steer[k] / 100, gh.flags[k] & 1, (gh.flags[k] >> 1) & 1); gh.race.events.length = 0; }
  // when each boat passes each 10 m mark, for the time gaps of the display (P13)
  const B = race.boats, mk = run.marks, mn = run.markN;
  for (let i = 0; i < B.length; i++) { const p = B[i].prog, m = mk[i]; while (mn[i] < m.length && p >= mn[i] * GAP_M) m[mn[i]++] = race.t; }
  if (run.gmarks) { const p = G.ghost.race.boats[0].prog, m = run.gmarks; while (run.gmarkN < m.length && p >= run.gmarkN * GAP_M) m[run.gmarkN++] = G.ghost.race.t; }
  for (const e of race.events) onRaceEvent(e, race, run);
  race.events.length = 0;
}
function simulate(dt) {
  const race = G.race, run = G.run;
  if (G.mode === 'race' && !G.paused) {
    const me = race.boats[race.player];
    // a beat of slow motion at the top of a ramp jump (sim time slows, the simulation itself is unchanged)
    if (G.slowArmed && me.air && me.rampAir && me.vy <= 0.6) { G.slowArmed = false; G.slowLeft = 0.26; }
    G.slowLeft = Math.max(0, G.slowLeft - dt);
    G.timeScale += ((G.slowLeft > 0 ? 0.3 : 1) - G.timeScale) * (1 - Math.exp(-dt / 0.06));
    controls.sample(performance.now(), dt);
    if (G.paused) return;                                  // the sensors stopped in this very frame: the race is paused now (P5)
    G.acc += dt * G.timeScale;
    while (G.acc >= DT) { stepRace(race, run); G.acc -= DT; if (race.done) break; }
    if (run.mode !== 'sailing' && (G.resultsAt !== null && (performance.now() >= G.resultsAt || race.done) || race.done)) { endRace(); return; }
    paintHud(race, run, dt);
    // the display inside the cockpit shows what the flat display shows (view/dash.mjs; drawn only in the view from the helm)
    stage.dash.set({ speed: E.kmh ? E.kmh.textContent : $('h-kmh').textContent, unit: settings().units === 'kn' ? 'kn' : 'km/h', boost: me.boostE / BOOST.max, place: E.place.textContent + $('h-of').textContent });
    // on the deck the panel shows the magazine, the hull, the flares and the helicopter's armour (in a headset it is the only display)
    if (G.rescue && G.rescue.kind === 'deck') { const F = G.rescue; stage.dash.set({ speed: F.over ? (F.won ? 'WON' : 'LOST') : F.reload > 0 ? '...' : String(F.mag), unit: F.over ? 'trigger: again' : F.reload > 0 ? 'reloading' : 'rounds', boost: Math.max(0, F.hp) / F.hpMax, place: `H${Math.max(0, F.hull)}${F.half === 2 ? ' F' + F.flares : ''}` }); }
    sound.frame({ speed: run.mode === 'sailing' ? me.u / 6 : me.u / me.P.top, boost: me.boostLv, air: me.air, active: !me.finished,
      sailing: run.mode === 'sailing', wind: me.sailing ? me.sailing.aws : 0 });
  } else if (G.mode === 'demo' || G.mode === 'after') {
    // behind the menus and the result screen every boat sails under the computer; a finished demo starts again, a finished race
    // of the player's sails on (afterglow) so the sea never stands still (T-07)
    G.acc += dt;
    while (G.acc >= DT) {
      race.step(0, 0, 0); if (G.rescue) G.rescue.step(); for (const e of race.events) stage.onEvent(e); race.events.length = 0; G.acc -= DT;
      if (race.done && G.mode === 'demo') { startDemo(G.demoCourse); break; }
    }
    sound.frame({ active: false });
  }
}
// ---- the display's own rate: measured with a small, light picture at the start, and again when it seems to have changed ----
function endProbe(P) {
  const m = measureRefresh(P.deltas), was = gov.interval; G.refresh = m; G.probes++;
  if (!P.again) { gov.setInterval(m.interval); watch.setInterval(m.interval); if (m.interval > 30 && gov.auto) gov.tier = 'low'; stage.setTier(Q.get('tier') || gov.tier); }
  else if (Math.abs(m.interval - was) / was > 0.2) { gov.setInterval(m.interval); watch.setInterval(m.interval); gov.set(1, gov.tier, `display now ${(1000 / m.interval).toFixed(0)} Hz`); }
  stage.setScale(gov.scale);
}
function reprobe() { if (G.film || !G.refresh) return; G.refresh = null; G.probe = { n: 0, deltas: [], again: true }; stage.setScale(0.5); }
function frame(ts) {
  if (!G.film && !XR.on) requestAnimationFrame(frame);          // in the headset the renderer calls this, on the headset's clock
  if (XR.on) xrAgain();
  const d = last === null ? 16.7 : ts - last, dt = Math.min(0.1, d / 1000); last = ts; G.frames++;
  if (!G.refresh) { const P = G.probe; if (P.n++ > 4 && d > 0) P.deltas.push(d); if (P.deltas.length >= 36) endProbe(P); }
  else if (!G.paused) {
    const w = watch.feed(d);
    if (w === 'probe') reprobe();                                                           // steadily slower: Low Power Mode, or an overloaded phone? Measure.
    else if (w) { G.refresh = { interval: w.interval, snapped: true, n: 0 }; G.probes++; gov.setInterval(w.interval); watch.setInterval(w.interval); }   // faster frames than the interval: a faster display
    else if (gov.frame(d)) applyGov();
  }
  if (G.run && G.mode === 'race' && !G.paused && G.refresh) { const r = G.run; r.frames++; r.sumMs += d; if (d > r.worst) r.worst = d; if (Math.round(d / G.refresh.interval) > 1) r.late++; }
  if (G.screen === 'cal') stepCal(performance.now());
  if (G.resumeLeft > 0) stepResume(dt);
  if (G.testBusyMs > 0) { const e = performance.now() + G.testBusyMs; while (performance.now() < e) { /* test hook: a planted slow frame */ } }
  if (G.race) {
    simulate(dt);
    // a paused race is a still picture: nothing moves, and it is drawn only now and then (T-12)
    const still = G.paused;
    stage.update(G.acc / DT, still ? 0 : dt * (G.mode === 'race' ? G.timeScale : 1), G.race.t - (1 - G.acc / DT) * DT);
    // behind a menu or a result that nobody has touched for a while the sea is drawn every second frame: half the work (finding 4)
    const every = still ? 6 : G.mode !== 'race' && !G.film && performance.now() - G.inputAt > IDLE_MS ? 2 : 1;
    if (XR.on || G.dirty || G.frames % every === 0) { stage.render(); G.dirty = false; G.draws++; }    // a headset needs every frame
  }
  // test hook: play a display with this frame time (ms), whatever the frame itself cost: wait out the rest of the interval
  // (measured on the page's own clock from the end of the last frame: the time stamp a frame is given can be milliseconds old)
  if (G.testPaceMs > 0) { const e = (G.paceLast || performance.now()) + G.testPaceMs; while (performance.now() < e) { /* a capped display */ } G.paceLast = performance.now(); } else G.paceLast = 0;
}

// ---------- wiring ----------
function wire() {
  tap('b-start', onStart);
  tap('bay-continue', () => { if (!BAY_GAME) return; if (G.baySuggested === ':practice') chooseBayPractice(true); else chooseBayVoyage(G.baySuggested); });
  tap('bay-practice', () => chooseBayPractice());
  tap('bay-replay', () => chooseBayPractice(true));
  tap('bay-settings', () => { if (!BAY_GAME) return; G.back = 'bay'; paintSettings(); show('settings'); });
  $('bay-journeys').addEventListener('click', (e) => { const b = e.target.closest('button[data-voyage]'); if (!b || !BAY_GAME) return; sound.resume(); sound.sfx('click'); chooseBayVoyage(b.dataset.voyage); });
  tap('sail-lesson-skip', () => { G.sailLesson = null; paintSailingLesson(); });
  tap('sail-lesson-done', returnToBay);
  tap('b-title-settings', () => { G.back = 'title'; paintSettings(); show('settings'); });
  tap('b-menu-settings', () => { G.back = 'menu'; paintSettings(); show('settings'); });
  tap('b-pause-settings', () => { G.back = 'pause'; paintSettings(); show('settings'); });
  tap('b-set-done', () => { if (G.back === 'menu') paintMenu(); if (BAY_GAME && G.back === 'bay') paintBay(); show(G.back || 'menu'); });
  tap('b-recal', () => { if (!G.started) return toast('Press START first.'); if (!controls.tiltAvailable()) return toast('No motion data on this device.'); G.afterCal = G.back; controls.mode = 'none'; beginCal(); });
  tap('b-card', () => { $('card-text').textContent = cardText(); show('card'); });
  tap('b-card-done', () => { paintSettings(); show('settings'); });
  tap('b-card-copy', async () => { const t = cardText(); $('card-text').textContent = t; try { await navigator.clipboard.writeText(t); toast('Card copied: paste it in the chat.'); } catch (e) { toast('Copy failed: select the text and copy it by hand.'); } });
  tap('b-card-reset', () => { if (!confirm(BAY_GAME ? 'Erase the bay journal and lesson progress on this device?' : 'Erase every best time, medal and unlock on this device?')) return; const keep = settings(); G.save = BAY_GAME ? makeBaySave(null) : PR.freshSave(); G.save.settings = keep; saveNow();
    // what is locked again cannot stay chosen (finding 11)
    const u = G.save.unlocked, sel = G.sel; if (!u.tunes.includes(sel.tune)) sel.tune = 'cruise'; if (!u.liveries.includes(sel.livery)) sel.livery = 'pearl'; if (!PR.courseOpen(G.save, COURSE_KEYS, sel.course)) sel.course = COURSE_KEYS[0];
    if (G.mode === 'demo') { if (G.demoCourse !== sel.course) startDemo(sel.course); else if (stage.boats[3]) stage.boats[3].vis.setLivery(sel.livery); }
    toast('Progress erased.'); });
  tap('b-cal-touch', () => finishCal('touch', 'Touch steering: slide your left thumb, boost with your right.'));
  tap('b-cal-anyway', () => { const r = controls.calibrate(true); if (r.ok) finishCal('tilt', 'Straight ahead is set.'); else toast('Still moving too much: rest your elbows, or steer by touch.'); });
  $('s-menu').addEventListener('click', menuClick);
  $('set-grid').addEventListener('click', settingsClick);
  $('set-maxdeg').addEventListener('input', (e) => { settings().maxDeg = +e.target.value; $('set-maxdeg-v').textContent = e.target.value; controls.setOptions({ maxDeg: settings().maxDeg, invert: !!settings().invert }); });
  $('set-maxdeg').addEventListener('change', saveNow);
  tap('b-go', () => { if (G.sel.mode === 'rescue' && VOYAGES[G.sel.level]) return openKies(); if (G.sel.mode !== 'sailing' && !PR.courseOpen(G.save, COURSE_KEYS, G.sel.course)) return; startRace(); });
  tap('b-kies-go', startRace); tap('b-kies-back', () => { if (BAY_GAME) return returnToBay(); paintMenu(); show('menu'); });
  $('k-rows').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; sound.resume(); sound.sfx('click'); if (b.dataset.recall !== undefined) { if (b.dataset.recall === 'go') { G.kies.recall = null; G.recalled[G.sel.level] = true; } else G.kies.recall = +b.dataset.recall; return paintKies(); } const key = G.sel.level, C = G.choices[key] = voyageChoices(key, G.choices[key]); const row = VOYAGES[key].rows[+b.dataset.row]; C[row.key] = row.opts[+b.dataset.opt][0]; paintKies(); });
  tap('b-beach-done', () => { if (G.beach && G.beach.book) { G.beach = G.beach.keep; paintKies(); return show('kies'); } if (BAY_GAME) return returnToBay(); show('results'); });
  $('v-leaves').addEventListener('click', (e) => { const b = e.target.closest('button[data-leaf]'); if (!b || !G.beach) return; sound.resume(); sound.sfx('click'); G.beach.sel = +b.dataset.leaf; G.beach.selKey = G.beach.key; paintBeach(); });
  tap('b-kies-book', () => { G.beach = { book: true, key: G.sel.level, keep: G.beach }; paintBeach(); show('beach'); });
  $('v-qs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || !G.beach) return; sound.resume(); if (b.dataset.book) { sound.sfx('click'); G.beach.key = b.dataset.book; return paintBeach(); } if (b.dataset.next) { sound.sfx('click'); G.beach.step++; return paintBeach(); } sound.sfx('chip', +b.dataset.q); G.beach.ans[+b.dataset.q] = +b.dataset.a; const r = PR.addLeaves(G.save, G.beach.key, [6 + +b.dataset.q]); if (r.fresh) { G.save = r.save; saveNow(); } paintBeach(); });
  tap('b-retry', startRace);
  tap('b-nextcourse', () => { if (G.nextCourse === ':beach') return openBeach(); if (BAY_GAME) return returnToBay(); if (G.nextCourse && PR.courseOpen(G.save, COURSE_KEYS, G.nextCourse)) G.sel.course = G.nextCourse; startRace(); });
  tap('b-next', () => { if (BAY_GAME) return returnToBay(); startDemo(G.sel.course); paintMenu(); show('menu'); });
  tap('h-pause', () => pause('button'));
  tap('h-vr', () => { enterXr(); });
  tap('h-view', toggleView);
  tap('h-recentre', () => { const r = controls.recentre(); toast(r.ok ? 'Straight ahead set again.' : 'Hold the phone still to recentre.', 1500); });
  tap('b-resume', resume); tap('b-resume2', resume); tap('b-resume3', resume);
  tap('b-sensors-tilt', () => { if (controls.tiltFresh()) { controls.setMode('tilt'); paintControlsHint(); resume(); } else toast('Still no motion data: steering stays on touch.'); });
  tap('b-restart', () => { G.paused = false; startRace(); });
  tap('b-quit', () => { if (BAY_GAME) return returnToBay(); G.paused = false; sound.music('menu'); startDemo(G.sel.course); paintMenu(); show('menu'); });
  tap('sail-auto', () => { G.sailInput.autoTrim = !G.sailInput.autoTrim; paintSailControls(); });
  $('sail-sheet').addEventListener('input', (e) => { G.sailInput.sheet = +e.target.value / 100; G.sailInput.autoTrim = false; paintSailControls(); });
  $('sail-rig').addEventListener('input', (e) => { G.sailInput.rigBalance = +e.target.value / 100; paintSailControls(); });
  $('sail-crew').addEventListener('input', (e) => { G.sailInput.crewBalance = +e.target.value / 100; paintSailControls(); });
  // The controls are their own touch surface: a range drag never becomes a helm gesture or a held boost.
  for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) $('sail-controls').addEventListener(ev, (e) => e.stopPropagation());
  // the play layer: thumbs
  const play = E.play;
  play.addEventListener('pointerdown', (e) => { e.preventDefault(); try { play.setPointerCapture(e.pointerId); } catch (x) { /* older browsers */ } if (deckOn()) { deckPointer('down', e); return; } const k = controls.down(e.pointerId, e.clientX, window.innerWidth); if (k === 'boost') { PF.haptic(); boostPressed(); } });
  play.addEventListener('pointermove', (e) => { if (deckOn()) deckPointer('move', e); else controls.move(e.pointerId, e.clientX); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) play.addEventListener(ev, (e) => { deckPointer('up', e); controls.up(e.pointerId); });
  tap('h-flare', () => { if (deckOn()) { DK.flare = true; PF.haptic(); } });
  window.addEventListener('keydown', (e) => {
    const editing = e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]');
    // A focused slider keeps its native navigation keys; the sailing shortcuts still work after a drag.
    if (editing && (!editing.matches('input[type="range"]') || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.code))) return;
    if (G.screen === 'race' && G.run && G.run.mode === 'sailing' && !G.paused && ['KeyQ', 'KeyE', 'KeyT'].includes(e.code)) {
      e.preventDefault();
      if (e.code === 'KeyT') { if (e.repeat) return; G.sailInput.autoTrim = !G.sailInput.autoTrim; }
      else { G.sailInput.autoTrim = false; G.sailInput.sheet = clamp(G.sailInput.sheet + (e.code === 'KeyE' ? 0.035 : -0.035), 0, 1); }
      paintSailControls(); return;
    }
    if (e.repeat) return;
    if (e.code === 'KeyC' && G.screen === 'race') { toggleView(); return; }
    if (e.code === 'Escape' || e.code === 'KeyP') { if (['pause', 'resume', 'sensors'].includes(G.screen)) resume(); else if (G.screen === 'race') pause('button'); return; }
    if (deckOn() && deckKey(e.code, true)) { e.preventDefault(); return; }
    if (controls.key(e.code, true)) { e.preventDefault(); if (controls.k.boost && (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW')) boostPressed(); }
  });
  window.addEventListener('keyup', (e) => { deckKey(e.code, false); controls.key(e.code, false); });
  for (const ev of ['contextmenu', 'gesturestart', 'dblclick']) document.addEventListener(ev, (e) => e.preventDefault());
  // a sound engine that was interrupted starts again only inside a tap: every tap and key press tries (T-09)
  for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) document.addEventListener(ev, () => sound.resume(), { capture: true, passive: true });
  for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, () => { G.inputAt = performance.now(); }, { capture: true, passive: true });
  // motion data stopped in the middle of a race: pause and say so, instead of changing the steering under the player's hands (P5)
  controls.onChange = (what) => {
    paintControlsHint();
    if (what !== 'touch-lost') return;
    if (G.mode === 'race' && !G.paused && G.race && !G.race.over) pause('sensors'); else toast('The motion sensors stopped: steering is by touch now.', 4000);
  };
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); G.errors.push('graphics context lost'); if (G.mode === 'race') pause('button'); toast('The phone took the graphics away. Reloading...', 4000); setTimeout(() => location.reload(), 1800); });
}

// ---------- test and film hooks ----------
G.platform = PF; G.startRace = startRace; G.startDemo = startDemo; G.endRace = endRace; G.show = show; G.cardText = cardText; G.pause = pause; G.resume = resume; G.onStart = onStart; G.paintMenu = paintMenu; G.reprobe = reprobe;
// test hook: run the simulation forward without drawing (a player's race is steered by the computer while skipping)
G.skip = (seconds) => { const n = Math.round(seconds / DT), race = G.race, was = G.auto; if (G.mode === 'race') G.auto = true;
  for (let i = 0; i < n && !race.done; i++) { if (G.mode === 'race') stepRace(race, G.run); else { race.step(0, 0, 0); for (const e of race.events) stage.onEvent(e); race.events.length = 0; } }
  G.auto = was; return race.lapT; };
// film: the caller owns the clock. step(ms) advances the game by exactly that much and draws one frame.
G.filmStep = (ms) => { G.filmT += ms / 1000; frame((last === null ? 0 : last) + ms); return { t: G.race ? G.race.lapT : 0, mode: G.mode, screen: G.screen }; };
// the pixels of the frame just drawn (call it right after filmStep, before the browser presents). framePixels: base64 of RGBA
// rows from the bottom; frameHash: FNV-1a over them. Two film runs give the same picture; a single pixel can differ by one step
// of 255 on some frames (measured 2026-11-13 on this PC's GPU), so compare pixels with a tolerance, not hashes.
function readFrame() { const gl = stage.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4); stage.renderer.setRenderTarget(null); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return { w, h, px }; }
G.frameHash = () => { const { w, h, px } = readFrame(); let x = 0x811c9dc5; for (let i = 0; i < px.length; i++) { x ^= px[i]; x = Math.imul(x, 0x01000193); } return `${w}x${h}:${(x >>> 0).toString(16).padStart(8, '0')}`; };
G.framePixels = () => { const { w, h, px } = readFrame(); let s = ''; for (let i = 0; i < px.length; i += 8192) s += String.fromCharCode.apply(null, px.subarray(i, i + 8192)); return { w, h, b64: btoa(s) }; };
// The film's sound track: in film mode every call to the sound engine is logged with the film clock (the page itself is silent:
// no tap started its sound). renderSound plays that log into an offline context, the same engine and the same calls, and returns
// the seconds from..to as a 16-bit mono WAV in base64, with its levels. Offline rendering: it takes a second or two.
G.renderSound = async (from, to, rate = 44100, mute = []) => {
  const log = G.soundLog || [], ctx = new OfflineAudioContext(1, Math.ceil(to * rate), rate), s = settings();
  const snd = Sound.forRender(ctx, { sound: true, music: true, volume: s.volume });
  // mute: parts to leave out ('engine', 'water', 'jet', 'music', 'sfx'), to hear or measure one part alone
  const cut = { engine: () => snd.engGain.disconnect(), water: () => snd.water.g.disconnect(), jet: () => snd.jet.g.disconnect(), music: () => snd.musBus.disconnect(), sfx: () => snd.sfxBus.disconnect() };
  for (const m of mute) if (cut[m]) cut[m]();
  let k = 0; const run = (until) => { for (; k < log.length && log[k][0] <= until + 1e-9; k++) { const [, fn, ...a] = log[k]; snd[fn](...a); } snd.schedule(); };
  const times = [...new Set(log.map((e) => e[0]).filter((t) => t > 0 && t < to - 2 / rate))].sort((a, b) => a - b);   // not at the very end: the context refuses a stop there
  run(0);
  for (const t of times) ctx.suspend(t).then(() => { run(t); ctx.resume(); });
  const buf = await ctx.startRendering(), all = buf.getChannelData(0), i0 = Math.floor(from * rate), x = all.subarray(i0);
  let peak = 0, sum = 0, clipped = 0, dc = 0; for (let i = 0; i < x.length; i++) { const v = x[i], a = Math.abs(v); if (a > peak) peak = a; if (a >= 0.999) clipped++; sum += v * v; dc += v; }
  const perS = []; for (let sec = 0; sec * rate < x.length; sec++) { let q = 0, n = 0; for (let i = sec * rate; i < Math.min(x.length, (sec + 1) * rate); i++) { q += x[i] * x[i]; n++; } perS.push(+(10 * Math.log10(q / n + 1e-12)).toFixed(1)); }
  const pcm = new Int16Array(x.length); for (let i = 0; i < x.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767)));
  const head = new DataView(new ArrayBuffer(44)), W4 = (o, t) => { for (let i = 0; i < 4; i++) head.setUint8(o + i, t.charCodeAt(i)); };
  W4(0, 'RIFF'); head.setUint32(4, 36 + pcm.length * 2, true); W4(8, 'WAVE'); W4(12, 'fmt '); head.setUint32(16, 16, true); head.setUint16(20, 1, true); head.setUint16(22, 1, true); head.setUint32(24, rate, true); head.setUint32(28, rate * 2, true); head.setUint16(32, 2, true); head.setUint16(34, 16, true); W4(36, 'data'); head.setUint32(40, pcm.length * 2, true);
  const bytes = new Uint8Array(44 + pcm.length * 2); bytes.set(new Uint8Array(head.buffer), 0); bytes.set(new Uint8Array(pcm.buffer), 44);
  let bin = ''; for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return { rate, seconds: x.length / rate, events: log.length, peak: +peak.toFixed(4), clipped, rmsDb: +(10 * Math.log10(sum / x.length + 1e-12)).toFixed(1), dc: +(dc / x.length).toFixed(5), perSecondDb: perS, wav: btoa(bin) };
};

// ---------- boot ----------
try {
  wire(); applySettings(); size();
  $('boot-bar').style.width = '30%';
  const loaded = await stage.load(new URL('./assets/', document.baseURI).href, { bay: BAY_GAME }); G.loaded = loaded;
  $('boot-bar').style.width = '100%';
  stage.setTier('low'); stage.setScale(0.5);              // light and small while the screen's frame rate is measured
  if (G.film) {
    const w = +(Q.get('w') || 1920), h = +(Q.get('h') || 1080); canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; stage.resize(w, h, 1); G.refresh = { interval: 16.67, snapped: true }; gov.auto = false; stage.setTier(Q.get('tier') || 'high'); stage.setScale(1);
    const log = G.soundLog = []; for (const fn of ['frame', 'sfx', 'music']) { const f = sound[fn].bind(sound); sound[fn] = (...a) => { log.push([G.filmT, fn, ...a]); return f(...a); }; }
  }
  await startDemo(Q.get('course') && COURSE_KEYS.includes(Q.get('course')) ? Q.get('course') : G.sel.course);
  $('title-note').textContent = BAY_GAME
    ? (PF.env.touch ? 'Hold the phone sideways. Enter the bay to set up steering and sound.' : 'A/D or arrows steer. Jack will show you the sail controls.')
    : !PF.env.touch ? 'Keys: A and D or the arrows steer, space boosts, S brakes.'
    : (PF.env.secure ? 'Hold the phone sideways. START asks for motion access and turns the sound on.' : 'This page is not on https, so the phone gives it no motion data: you steer by touch.') + (PF.env.ios && !PF.env.standalone ? ' Tip: Share, Add to Home Screen gives full screen.' : '');
  $('title-build').textContent = `${BAY_GAME ? VERSION.replace('crest-run', 'Lipah Bay') : VERSION}, built ${BUILD}`;
  if (Q.get('sailing') === '1') {
    $('b-start').textContent = BAY_GAME ? 'SAIL WITH JACK' : 'SAILING TRIAL';
    document.querySelector('#s-title .tag').textContent = 'Read the wind. Feel the floats. Find the balance.';
    $('title-note').textContent = PF.env.touch ? 'Hold the phone sideways. Start sets up steering and sound.' : 'A/D or arrows steer \u00B7 Q/E trim \u00B7 T toggles trim assist';
  }
  show('title'); checkRotation();
  // film: no menus; the race starts at once with the computer at the wheel and the caller owns the clock (G.filmStep)
  if (G.film) {
    G.started = true; G.auto = true; controls.mode = 'keys';
    if (!BAY_GAME) {
      if (Q.get('course') && COURSE_KEYS.includes(Q.get('course'))) G.sel.course = Q.get('course');
      if (Q.get('mode') === 'trial') G.sel.mode = 'trial';
      if (Q.get('mode') === 'rescue') G.sel.mode = 'rescue';
      if (Q.get('level') === DRAGON.key) G.sel.level = DRAGON.key;
      if (Q.get('level') === LEVI.key) G.sel.level = LEVI.key;
      if (Q.get('level') === HAWK.key) G.sel.level = HAWK.key;
    }
    if (VOYAGES[Q.get('level')]) G.sel.level = Q.get('level');
    await startRace();
  }
  if (!G.film) requestAnimationFrame(frame);
  window.__ready = true;
} catch (e) { bootFail(e, 'The game could not start: ' + String((e && e.message) || e)); }
