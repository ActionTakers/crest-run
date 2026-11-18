// The bay has its own entry and journal. Reuse voyage progress already earned in
// Crest Run on the first visit, without importing its races, ghosts or unlocks.
import { freshSave, migrate, SAVE_VERSION } from '../sim/progress.mjs?v=5e9464f8';

export const BAY_SAVE_KEY = 'monkeyking-jack-bay-save';
export const BAY_JOURNEYS = Object.freeze(['mk1', 'mk2', 'mk3']);
const object = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const clone = (value) => JSON.parse(JSON.stringify(value));

function journal(value = {}) {
  return {
    sailingComplete: value.sailingComplete === true,
    lastVoyage: BAY_JOURNEYS.includes(value.lastVoyage) ? value.lastVoyage : 'mk1',
  };
}

export function makeBaySave(raw, legacy = null) {
  let save;
  if (object(raw) && raw.v === SAVE_VERSION) save = migrate(raw);
  else {
    save = freshSave();
    if (object(legacy) && legacy.v === SAVE_VERSION) {
      const old = migrate(legacy);
      save.settings = { ...old.settings };
      save.leaves = {};
      for (const key of BAY_JOURNEYS) {
        if (object(old.best[`${key}:rescue`])) save.best[`${key}:rescue`] = clone(old.best[`${key}:rescue`]);
        if (['gold', 'silver', 'bronze'].includes(old.medals[`${key}:rescue`])) save.medals[`${key}:rescue`] = old.medals[`${key}:rescue`];
        if (Array.isArray(old.leaves?.[key])) save.leaves[key] = Array.from({ length: 9 }, (_, i) => old.leaves[key][i] === true);
      }
      save.stats.guests = Number.isFinite(old.stats.guests) ? Math.max(0, old.stats.guests) : 0;
    }
    save.settings.boat = 'jukung';
  }
  save.bay = journal(object(save.bay) ? save.bay : {});
  return save;
}

// A recorded voyage means a completed attempt, not necessarily that everybody
// came home. Reflection guides the suggested route; every journey stays open.
export function bayProgress(save) {
  const journeys = BAY_JOURNEYS.map((key, index) => {
    const best = save?.best?.[`${key}:rescue`];
    const visited = object(best) && Number.isFinite(best.saved);
    const leaves = Array.from({ length: 9 }, (_, i) => save?.leaves?.[key]?.[i] === true);
    return {
      key, index, visited,
      harmonies: visited ? Math.max(0, Math.min(3, best.saved)) : 0,
      leaves: leaves.filter(Boolean).length,
      reflected: leaves.slice(6).every(Boolean),
      explored: visited && leaves.slice(6).every(Boolean),
    };
  });
  const state = journal(object(save?.bay) ? save.bay : {});
  const recommended = journeys.find((one) => !one.explored)?.key || state.lastVoyage;
  return {
    ...state, journeys, recommended,
    leaves: journeys.reduce((sum, one) => sum + one.leaves, 0),
    explored: journeys.filter((one) => one.explored).length,
  };
}
