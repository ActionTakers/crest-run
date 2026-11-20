// voyages.mjs: all the rescue voyages together (PLAN-MONKEYKING.md): MK-1 in sim/voyage.mjs, the others in files of their own.
// The page and the tests take everything from here, so that every voyage has put its entry into VOYAGES.
// Written 2026-11-16 by the yacht project session.
import { DT, Race } from './race-sim.mjs?v=b691c4e1';
import { Voyage, VOYAGES, bayCourse, voyageSettings } from './voyage.mjs?v=b691c4e1';
import { WindVoyage } from './voyage2.mjs?v=b691c4e1';
import { NightVoyage } from './voyage3.mjs?v=b691c4e1';
export * from './voyage.mjs?v=b691c4e1';
export { WIND, B as BOAT } from './voyage2.mjs?v=b691c4e1';
export { NIGHT, CHAIN, Q as WHO } from './voyage3.mjs?v=b691c4e1';

const MAKERS = { mk1: Voyage, mk2: WindVoyage, mk3: NightVoyage };
export function makeVoyage(race, opts = {}) { const M = MAKERS[opts.level] || Voyage; return new M(race, { ...opts, level: MAKERS[opts.level] ? opts.level : 'mk1' }); }
export const VOYAGES_READY = Object.keys(MAKERS);   // the voyages that can be sailed in this build
// a whole voyage by its stand-in driver, for tests, tuning and the film
export function autoVoyage({ level = 'mk1', difficulty = 'normal', seed = 3, skill = 1, tune = 'cruise', choices = {}, maxS = 420 } = {}) {
  const c = bayCourse(), race = new Race(voyageSettings(c, { tune }), c), V = makeVoyage(race, { level, difficulty, seed, choices }), inp = { steer: 0, brake: 0, boost: 0 };
  const steps = Math.round(maxS / DT);
  for (let i = 0; i < steps && !V.over; i++) { V.pilot(inp, skill); race.step(inp.steer, inp.brake, inp.boost); V.step(); race.events.length = 0; }
  return V;
}
