// Shared geometry, support points and contact dimensions for the optional
// JUKUNG-RACER only. The normal 8 m tour jukung and its guest layout stay separate.
// DESIGNER RACING BASELINE, 2026-11-17: not a survey of Captain Jack's boat.
// Hull length/beam are informed by the researched slender Balinese craft; float,
// rig, seating and performance values remain a prototype to validate with Jack.
export const JUKUNG_SPEC = Object.freeze({
  hullLength: 6.5,
  hullBeam: 0.55,
  hullDepth: 0.65,
  draft: 0.22,
  floatOffset: 1.65,
  floatLength: 6.8,
  floatRadius: 0.09,
  floatCentreY: 0.08,
  boomZ: Object.freeze([1.55, -1.55]),
  mastZ: 1.65,
  mastHeight: 1.75,
  seatZ: -1.9,
  bowZ: 2.75,
  provenance: 'Designer racing baseline; not measured from Captain Jack\'s boat',
});

export const JUKUNG_SPAN = 2 * (JUKUNG_SPEC.floatOffset + JUKUNG_SPEC.floatRadius);

// beam is the CENTRAL hull for resistance/contact. supportBeam spans the floats
// for the legacy arcade water response. A float span is not a solid broad hull.
export const JUKUNG_PHYSICS = Object.freeze({
  craft: 'jukung-racer',
  length: JUKUNG_SPEC.hullLength,
  beam: JUKUNG_SPEC.hullBeam,
  supportBeam: 2 * JUKUNG_SPEC.floatOffset,
  floatOffset: JUKUNG_SPEC.floatOffset,
  floatLength: JUKUNG_SPEC.floatLength,
  floatRadius: JUKUNG_SPEC.floatRadius,
  draft: JUKUNG_SPEC.draft,
});
