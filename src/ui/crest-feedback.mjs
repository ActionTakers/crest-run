// crest-feedback.mjs: the Crest Run names for the shared feedback module.
// Friendly Fighters does not import this file. It calls feedback.mjs with its
// own event names. The strings below are the deck fight's events only.

import { bearingDir } from './feedback.mjs?v=03fa7436';

// A weak-spot confirm replaces the shot pulse on that hand. pulse() would
// overwrite the shot anyway, and hit outranks shot. A rocket the player shot
// down stays a shot: the rocket profile is for a rocket that hit the boat.
export function deckHapticName(event) {
  if (!event || typeof event.type !== 'string') return null;
  switch (event.type) {
    case 'dShot':
      if (event.hit === 'pod' || event.hit === 'tail') return 'hitWeak';
      return 'shot';
    case 'dFlare': return 'flare';
    case 'dRocketHit': return event.hit ? 'rocket' : null;
    case 'dStrafe': return event.hit ? 'rocket' : null;
    case 'dRam': return 'ram';
    case 'dEnd': return !event.won && event.hull <= 0 ? 'sink' : null;
    default: return null;
  }
}

// The red edge is for damage taken. A shot and a flare do not flash it.
export function deckEdge(event) {
  if (!event || typeof event.type !== 'string') return false;
  if (event.type === 'dRocketHit' || event.type === 'dStrafe' || event.type === 'dRam') return !!event.hit || event.type === 'dRam';
  if (event.type === 'dEnd') return !event.won && event.hull <= 0;
  return false;
}

// pose: { x, z, h, hawkX, hawkZ } from the boat and the helicopter. The sim
// event is not given new fields. A rocket uses its own impact point.
export function deckDirection(event, pose) {
  if (!event) return { x: 0, y: 0.4 };
  if (event.type === 'dEnd') return { x: 0, y: -0.85 };
  if (event.type === 'dRocketHit' && Number.isFinite(event.x) && Number.isFinite(event.z)) return bearingDir(pose, { x: event.x, z: event.z });
  if ((event.type === 'dStrafe' || event.type === 'dRam') && pose && Number.isFinite(pose.hawkX) && Number.isFinite(pose.hawkZ)) {
    return bearingDir(pose, { x: pose.hawkX, z: pose.hawkZ });
  }
  return { x: 0, y: 0.65 };
}
