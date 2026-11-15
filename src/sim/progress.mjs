// progress.mjs: what lasts between sessions: best times, ghosts, medals, unlocks, settings. Pure functions on a plain object; the
// page stores it as JSON (localStorage). A plain browser tab can lose script-written storage after seven days without a visit; a
// Home Screen app keeps it (research/F2-stack, F2-ios-02 and -03). Tests: tests/progress.test.mjs.
// Written 2026-11-13 by the yacht project session.
export const SAVE_VERSION = 1;
export const SAVE_KEY = 'crest-run-save';

export const DEFAULT_SETTINGS = { steering: 'auto', maxDeg: 25, invert: false, camera: 'chase', motion: 'full', sound: true, music: true, volume: 0.8,
  quality: 'auto', difficulty: 'normal', units: 'kmh', haptics: true };
// what each thing takes to unlock (shown on its lock in the menu). Spread so that the first race pays one colour and, on a
// podium, the next course, and later races still have something to give (review r3, P12).
export const UNLOCKS = {
  tunes: { cruise: 'from the start', sport: 'finish three races', race: 'win a race' },
  liveries: { pearl: 'from the start', gold: 'from the start', navy: 'finish a race', coral: 'pass 10 gates perfectly', mint: 'win a medal in a time trial', violet: 'win gold in a race on every course' },
};
export const SPORT_RACES = 3, CORAL_PERFECTS = 10;
const MEDALS = ['gold', 'silver', 'bronze'];
const better = (a, b) => (a && (!b || MEDALS.indexOf(a) < MEDALS.indexOf(b)) ? a : b);

export function freshSave() {
  return { v: SAVE_VERSION, best: {}, medals: {}, unlocked: { tunes: ['cruise'], liveries: ['pearl', 'gold'], courses: [] }, settings: { ...DEFAULT_SETTINGS },
    stats: { races: 0, finished: 0, racesFinished: 0, wins: 0, podiums: 0, gates: 0, perfects: 0, cleanLandings: 0, bestChain: 0, topKmh: 0 }, last: { course: null, tune: 'cruise', livery: 'pearl', mode: 'race' } };
}
// Turns whatever was stored into a valid save: unknown or broken data gives a fresh save, missing parts get their defaults.
export function migrate(raw) {
  const f = freshSave();
  if (!raw || typeof raw !== 'object' || raw.v !== SAVE_VERSION) return f;
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const s = { ...f, ...raw };
  s.best = obj(raw.best); s.medals = obj(raw.medals);
  s.settings = { ...DEFAULT_SETTINGS, ...obj(raw.settings) };
  s.stats = { ...f.stats, ...obj(raw.stats) };
  s.last = { ...f.last, ...obj(raw.last) };
  const u = obj(raw.unlocked), list = (v, d) => (Array.isArray(v) ? [...new Set([...d, ...v.filter((x) => typeof x === 'string')])] : d);
  s.unlocked = { tunes: list(u.tunes, f.unlocked.tunes), liveries: list(u.liveries, f.unlocked.liveries), courses: list(u.courses, []) };
  return s;
}
// The medal of a result. A race: by place. A time trial: by the course's medal times { gold, silver, bronze } in seconds.
export function medalFor(result, medalTimes) {
  if (!result.finished) return null;
  if (result.mode === 'trial') { if (!medalTimes) return null; return result.time <= medalTimes.gold ? 'gold' : result.time <= medalTimes.silver ? 'silver' : result.time <= medalTimes.bronze ? 'bronze' : null; }
  return result.place === 1 ? 'gold' : result.place === 2 ? 'silver' : result.place === 3 ? 'bronze' : null;
}
// Books a finished or abandoned run. result: { mode: 'race' | 'trial', course, tune, finished, place, time, sim, inputs (trial only),
// summary: { passed, perfects, clean, bestChain, topKmh } }. courseKeys: every course in order (the next one unlocks on a podium).
// Returns { save (a new object), news: [{ type: 'best' | 'medal' | 'unlock', ... }] } for the result screen.
export function applyResult(save, result, courseKeys, medalTimes = null) {
  const s = JSON.parse(JSON.stringify(save)), news = [], sm = result.summary || {};
  s.stats.races++;
  s.stats.gates += sm.passed || 0; s.stats.perfects += sm.perfects || 0; s.stats.cleanLandings += sm.clean || 0;
  s.stats.bestChain = Math.max(s.stats.bestChain, sm.bestChain || 0); s.stats.topKmh = Math.max(s.stats.topKmh, sm.topKmh || 0);
  s.last = { course: result.course, tune: result.tune, livery: result.livery || s.last.livery, mode: result.mode };
  if (!result.finished) return { save: s, news };
  s.stats.finished++;
  const key = `${result.course}:${result.mode}`, old = s.best[key];
  if (!old || result.time < old.time) {
    s.best[key] = { time: result.time, tune: result.tune, sim: result.sim, place: result.place ?? null };
    if (result.mode === 'trial' && result.inputs) s.best[key].ghost = { inputs: result.inputs, tune: result.tune, sim: result.sim };
    news.push({ type: 'best', time: result.time, was: old ? old.time : null });
  }
  const medal = medalFor(result, medalTimes), had = s.medals[key] || null, now = better(medal, had);
  if (now !== had) { s.medals[key] = now; news.push({ type: 'medal', medal: now }); }
  if (result.mode === 'race') { if (result.place === 1) s.stats.wins++; if (result.place <= 3) s.stats.podiums++; }
  const add = (kind, k) => { if (!s.unlocked[kind].includes(k)) { s.unlocked[kind].push(k); news.push({ type: 'unlock', kind, key: k }); } };
  if (result.mode === 'race') {
    s.stats.racesFinished = (s.stats.racesFinished || 0) + 1;
    add('liveries', 'navy');
    if (result.place <= 3) { const i = courseKeys.indexOf(result.course); if (i >= 0 && i + 1 < courseKeys.length) add('courses', courseKeys[i + 1]); }
    if (s.stats.racesFinished >= SPORT_RACES) add('tunes', 'sport');
    if (result.place === 1) add('tunes', 'race');
    if (courseKeys.every((c) => s.medals[`${c}:race`] === 'gold')) add('liveries', 'violet');
  } else if (now) add('liveries', 'mint');
  if (s.stats.perfects >= CORAL_PERFECTS) add('liveries', 'coral');
  return { save: s, news };
}
// Books a rescue mission (sim/rescue.mjs). result: { mode: 'rescue', course (the level), tune, livery, difficulty, finished, saved,
// total, time, medal }. The best mission is the one with the most llamas safe; with as many, the quicker one.
export function applyRescue(save, result) {
  const s = JSON.parse(JSON.stringify(save)), news = [];
  s.stats.rescues = (s.stats.rescues || 0) + 1;
  s.last = { ...s.last, tune: result.tune, livery: result.livery || s.last.livery, mode: 'rescue' };
  if (!result.finished) return { save: s, news };
  s.stats.llamas = (s.stats.llamas || 0) + result.saved;
  const key = `${result.course}:rescue`, old = s.best[key];
  if (!old || result.saved > old.saved || (result.saved === old.saved && result.time < old.time)) {
    s.best[key] = { saved: result.saved, total: result.total, time: result.time, tune: result.tune, difficulty: result.difficulty };
    news.push({ type: 'best', saved: result.saved, was: old ? old.saved : null });
  }
  const had = s.medals[key] || null, now = better(result.medal || null, had);
  if (now !== had) { s.medals[key] = now; news.push({ type: 'medal', medal: now }); }
  return { save: s, news };
}
export const courseOpen = (save, courseKeys, key) => courseKeys.indexOf(key) === 0 || save.unlocked.courses.includes(key);
export function fmtTime(t) { if (typeof t !== 'number' || !(t >= 0)) return '-:--.--'; const m = Math.floor(t / 60), s = t - 60 * m; return `${m}:${s.toFixed(2).padStart(5, '0')}`; }
