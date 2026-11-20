// deck-hud.mjs: the Coastal Run: Iron Hawk display. The race HUD's place, gap, lap, speed and boost
// are not reused here. The goal line stays until the fight state that asked for it has changed.
import { COASTAL_NAME, DECK } from '../sim/deck.mjs?v=b016c49c';

const FILLED = '\u25CF', EMPTY = '\u25CB', ARMOUR_ON = '\u25AE', ARMOUR_OFF = '\u25AF';
const ARMOUR_CELLS = 4;

export function hullMarks(hull, max = DECK.hull) {
  const left = Math.max(0, Math.min(max, Math.round(Number(hull) || 0)));
  return FILLED.repeat(left) + EMPTY.repeat(Math.max(0, max - left));
}

export function armourMarks(ratio, cells = ARMOUR_CELLS) {
  const n = Math.max(0, Math.min(cells, Math.round(Math.max(0, Math.min(1, ratio)) * cells)));
  return ARMOUR_ON.repeat(n) + ARMOUR_OFF.repeat(cells - n);
}

// The current objective. The same fight state always returns the same line, so the display
// holds it until that step is fulfilled (the state moves on) rather than flashing it away.
export function deckGoal(F) {
  if (!F) return '';
  if (F.over) return F.won ? 'THE MEGALODON TAKES THE IRON HAWK' : F.hull <= 0 ? 'YOUR BOAT IS SUNK' : 'TIME IS UP';
  const racing = !!(F.race && F.race.racing);
  if (!racing) return 'DRAG TO AIM, HOLD TO FIRE';
  if (F.st === 'crip') return F.flares > 0 ? 'CRIPPLED: FIRE A FLARE' : 'CRIPPLED: THE SEA IS COMING';
  if (F.st === 'aim' || (F.st === 'pass' && !F.struck && !F.broken)) return `BREAK THE PASS: ${F.podHits} OF ${F.need} HITS ON THE GUN POD`;
  if (F.rockets && F.rockets.some((q) => q.on)) return 'SHOOT THE ROCKETS DOWN';
  if (F.st === 'stun') return F.half === 2 && F.flares > 0 ? 'IT HANGS LOW: FIRE A FLARE' : 'STAGGERED: IT HANGS LOW. UNLOAD';
  if (F.half === 2 && F.flares > 0 && F.low && !(F.breach && F.breach.on)) return 'FIRE A FLARE WHILE IT IS LOW';
  if (F.half === 2 && F.flares > 0 && !F.bites) return 'THREE FLARES: FIRE ONE WHILE IT IS LOW';
  if (!F.shots) return 'DRAG TO AIM, HOLD TO FIRE';
  return F.half === 2 ? 'KEEP THE GUN ON IT' : 'KEEP THE MAGAZINE FOR ITS LOW PASS';
}

// A plain snapshot of the deck HUD. Race fields (place, gap, lap, TAKEN, boost, speed) are absent.
export function deckHudSnapshot(F) {
  const hullLeft = Math.max(0, Math.round(Number(F.hull) || 0));
  const ratio = F.hpMax > 0 ? Math.max(0, Math.min(1, F.hp / F.hpMax)) : 0;
  const ammoCount = Math.max(0, Math.round(Number(F.mag) || 0));
  const flaresCount = Math.max(0, Math.round(Number(F.flares) || 0));
  return {
    title: COASTAL_NAME,
    mode: 'deck',
    hull: `HULL ${hullMarks(hullLeft)}`,
    ammo: `AMMO ${ammoCount}`,
    flares: `FLARES ${flaresCount}`,
    armour: `HAWK ARMOUR ${armourMarks(ratio)}`,
    armourRatio: ratio,
    goal: deckGoal(F),
    hullLeft,
    hullMax: DECK.hull,
    ammoCount,
    flaresCount,
    reloading: F.reload > 0,
  };
}
