// fleet.mjs: the boats of the game. The yacht of the first builds, and three boats made from the owner's own sheets of
// 2026-11-15 (assets/SOURCES.md): a RIB, a jet racer and a racer with a heart. Per boat: its file, its length in metres, how
// deep it sits (keel, a share of its length), whether a livery colour tints it (the new boats keep their own paint), and
// where its driver sits: y a share of the boat's height above the waterline's zero, z a share of its length from the middle
// (minus = aft), drop how far a seated figure is lowered onto the seat, in metres. The seats were found with pictures.
// In this build every boat handles alike (the tune decides); handling per boat and per driver is a later step.
// Written 2026-11-16 by the yacht project session.
export const FLEET = {
  yacht: { label: 'Yacht', file: 'yacht-b04.glb', length: 10.5, keel: 0.058, paint: true, seat: { y: 0.47, z: -0.02, drop: 0.44 } },
  rib: { label: 'RIB', file: 'boats/rib.glb', length: 7.2, keel: 0.045, paint: false, seat: { y: 0.36, z: -0.1, drop: 0.44 } },
  jet: { label: 'Jet', file: 'boats/jet.glb', length: 9.6, keel: 0.035, paint: false, seat: { y: 0.36, z: -0.04, drop: 0.44 } },
  heart: { label: 'Heart', file: 'boats/heart.glb', length: 9.6, keel: 0.035, paint: false, seat: { y: 0.36, z: -0.04, drop: 0.44 } },
};
export const FLEET_KEYS = Object.keys(FLEET);
// the rivals' boats when the player sails `mine`: the others, in the fleet's order
export function rivalBoats(mine, n = 3) { return FLEET_KEYS.filter((k) => k !== mine).slice(0, n); }
