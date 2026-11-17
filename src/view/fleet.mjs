// fleet.mjs: the boats of the game. The yacht of the first builds, and four boats made from the owner's own sheets of
// 2026-11-15 (assets/SOURCES.md): a RIB, a jet racer, a racer with a heart and a catamaran. Per boat: its file, its length in metres, how
// deep it sits (keel, a share of its length), whether a livery colour tints it (the new boats keep their own paint), and
// where its driver sits: y a share of the boat's height above the waterline's zero, z a share of its length from the middle
// (minus = aft), drop how far a seated figure is lowered onto the seat, in metres. The seats were found with pictures.
// How each boat handles is in sim/boat-stats.mjs (0.7.0).
// The jukung (0.8.0) has no file: view/jukung.mjs makes it in code (make: 'jukung'); its seat's y is in metres.
// Written 2026-11-16 by the yacht project session.
import { JUKUNG_SPEC } from '../sim/jukung-spec.mjs?v=be984f14';

export const FLEET = {
  yacht: { label: 'Yacht', file: 'yacht-b04.glb', length: 10.5, keel: 0.058, paint: true, seat: { y: 0.47, z: -0.02, drop: 0.44 } },
  rib: { label: 'RIB', file: 'boats/rib.glb', length: 7.2, keel: 0.045, paint: false, seat: { y: 0.36, z: -0.1, drop: 0.44 } },
  jet: { label: 'Jet', file: 'boats/jet.glb', length: 9.6, keel: 0.035, paint: false, seat: { y: 0.36, z: -0.04, drop: 0.44 } },
  heart: { label: 'Heart', file: 'boats/heart.glb', length: 9.6, keel: 0.035, paint: false, seat: { y: 0.36, z: -0.04, drop: 0.44 } },
  cat: { label: 'Cat', file: 'boats/cat.glb', length: 10.0, keel: 0.03, paint: false, seat: { y: 0.36, z: -0.04, drop: 0.44 } },
  jukung: { label: 'Jukung', make: 'jukung', length: 8.0, keel: 0, paint: false, seat: { y: -0.04, z: -0.262, drop: 0.44 } },
  // The racer is available only in the unranked sailing trial. Seat y is a direct pelvis target in metres.
  'jukung-racer': { label: "Jack's sailing jukung", make: 'jukung-racer', length: JUKUNG_SPEC.hullLength, keel: 0, paint: false, practiceOnly: true,
    seat: { y: 0.55, z: JUKUNG_SPEC.seatZ / JUKUNG_SPEC.hullLength, drop: 0 } },
};
export const FLEET_KEYS = Object.keys(FLEET).filter((key) => !FLEET[key].practiceOnly);
// the rivals' boats when the player sails `mine`: n of the others, starting one further along the fleet every race (turn)
export function rivalBoats(mine, n = 3, turn = 0) { const o = FLEET_KEYS.filter((k) => k !== mine), out = []; for (let i = 0; i < n; i++) out.push(o[(((turn % o.length) + o.length) % o.length + i) % o.length]); return out; }
