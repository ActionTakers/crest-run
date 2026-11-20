// boat-stats.mjs: how each boat of the fleet handles (0.7.0). Four factors on the numbers of the tune the boat sails (sim/
// race-sim.mjs, TUNES): top speed, acceleration, turn rate and grip. The yacht is the measure (all 1). Small on purpose: a
// boat should feel different, not decide the race; a rival's pace is still held to what the player's boat can do (race-sim.mjs).
// Pure. Chosen by this session on 2026-11-16 from what each boat is (a light RIB, a long jet racer, a twin-hulled boat); no
// person has sailed them: PROPOSAL until the owner has. Tests: tests/boat-stats.test.mjs.
import { TUNES } from './race-sim.mjs?v=b691c4e1';
import { JUKUNG_PHYSICS } from './jukung-spec.mjs?v=b691c4e1';

export const BOAT_STATS = {
  yacht: { top: 1, accel: 1, turnRate: 1, grip: 1, note: 'the all-rounder' },
  rib: { top: 0.96, accel: 1.14, turnRate: 1.18, grip: 1.12, note: 'quick off the line and tight in the turns, lower top speed' },
  jet: { top: 1.05, accel: 0.97, turnRate: 0.9, grip: 0.9, note: 'fastest on the straight, wide in the turns' },
  heart: { top: 1.0, accel: 1.07, turnRate: 1.06, grip: 1.0, note: 'lively: a little quicker and nimbler than the yacht' },
  cat: { top: 1.03, accel: 0.92, turnRate: 0.94, grip: 1.2, note: 'steady: holds its line, slow to get going' },
  jukung: { top: 0.93, accel: 1.08, turnRate: 1.08, grip: 1.2, note: 'light and sure-footed on its floats, not the fastest' },
};
export const STAT_KEYS = ['top', 'accel', 'turnRate', 'grip'];
// the numbers a boat changes on its tune, for a race boat's `tweak` (race-sim.mjs makeBoat); an unknown boat changes nothing
export function boatTweak(tune, boat) {
  // Practice-only racing geometry; propulsion belongs to the optional sailing model.
  // The regular tour jukung retains its existing tune and dimensions.
  if (boat === 'jukung-racer') return { ...JUKUNG_PHYSICS };
  const T = TUNES[tune] || TUNES.cruise, f = BOAT_STATS[boat]; if (!f) return {};
  const out = {}; for (const k of STAT_KEYS) out[k] = Math.round(T[k] * f[k] * 1000) / 1000;
  return out;
}
