// Optional bay sailing practice. This observes the existing numeric sailing model;
// it never steers the boat, changes its forces, locks voyages or records a score.
// Call after an active fixed physics step, not during countdown or pause. Metres,
// seconds and radians follow sailing.mjs. These are game goals, not sailing certification.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const DEG = Math.PI / 180;
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;

export const SAILING_LESSON_STEPS = Object.freeze([
  Object.freeze({ id: 'wind', title: 'Find the wind', holdSeconds: 4,
    hint: 'Steer gently across the wind. Then hold a steady course with trim assist on.' }),
  Object.freeze({ id: 'trim', title: 'Feel the sail', holdSeconds: 4,
    hint: 'Move the sheet to take over from assist. Keep the sail drawing as the boat moves.' }),
  Object.freeze({ id: 'balance', title: 'Balance the boat', holdSeconds: 4,
    hint: 'Move your weight toward the incoming wind. Keep sailing while the boat settles.' }),
]);

// A fresh object is also the restart contract; no saved progress is needed to try
// again. The caller may persist only the completion flag in its own bay journal.
export function makeSailingLesson() {
  const first = SAILING_LESSON_STEPS[0];
  return { step: 0, stepId: first.id, title: first.title, hint: first.hint,
    progress: 0, complete: false, actionTaken: false, holding: false,
    hold: 0, lostTime: 0, steeringTime: 0, anchor: null, completedSteps: [] };
}

function actionAnchor(sailing, controls) {
  return { sheet: sailing.sheet, sheetInput: clamp(finite(controls.sheet, sailing.sheet), 0, 1), crew: sailing.crewBalance };
}

function enterStep(state, step, sailing, controls) {
  const def = SAILING_LESSON_STEPS[step];
  Object.assign(state, { step, stepId: def.id, title: def.title, hint: def.hint,
    progress: 0, hold: 0, lostTime: 0, steeringTime: 0, actionTaken: false,
    holding: false, anchor: actionAnchor(sailing, controls) });
}

function validTelemetry(s) {
  if (!s || typeof s !== 'object') return false;
  const numbers = ['awa', 'aws', 'fill', 'trimEfficiency', 'speedThroughWater',
    'heel', 'portLoad', 'starboardLoad', 'sheet', 'crewBalance', 'rudderAngle'];
  return numbers.every((key) => Number.isFinite(s[key])) && s.aws >= 0
    && s.speedThroughWater >= 0 && s.fill >= 0 && s.fill <= 1
    && s.trimEfficiency >= 0 && s.trimEfficiency <= 1
    && s.portLoad >= 0 && s.starboardLoad >= 0
    && s.portLoad <= 1.5 && s.starboardLoad <= 1.5;
}

// Mutates and returns `state`. UI fields: step (0..2), stepId, title, hint,
// progress (0..1), actionTaken, holding and complete. Completion keeps step=2,
// progress=1 and becomes inert, so the player can continue free sailing.
// `controls` must include the actual helm input as `steer`, alongside the sheet,
// autoTrim and crewBalance inputs already passed to Race.step().
export function advanceSailingLesson(state, sailing, controls = {}, dt = 1 / 120) {
  if (!Number.isFinite(dt) || dt < 0 || dt > 0.1) throw new RangeError('lesson dt must be finite and in [0, 0.1]');
  if (!state || !Number.isInteger(state.step) || state.step < 0 || state.step >= SAILING_LESSON_STEPS.length) throw new TypeError('invalid sailing lesson state');
  if (dt === 0 || state.complete) return state;
  const def = SAILING_LESSON_STEPS[state.step], s = sailing;
  const valid = validTelemetry(s);
  if (valid && !state.anchor) state.anchor = actionAnchor(s, controls);

  let good = false, hint = def.hint;
  if (valid) {
    const steer = clamp(finite(controls.steer), -1, 1), angle = Math.abs(s.awa);
    const reaching = !s.noGo && angle >= 48 * DEG && angle <= 140 * DEG;
    const drawing = reaching && s.aws >= 0.8 && s.fill >= 0.45
      && s.trimEfficiency >= 0.6 && s.speedThroughWater >= 0.75;
    const assisted = s.autoTrim === true && controls.autoTrim !== false;

    if (state.step === 0) {
      // An unattended boat begins on a useful reach. Flow plus a deliberate helm
      // input is therefore required before simply holding that course can count.
      if (assisted && s.speedThroughWater >= 0.4 && Math.abs(steer) >= 0.08 && Math.abs(s.rudderAngle) >= 0.03) state.steeringTime += dt;
      state.actionTaken ||= state.steeringTime >= 0.18 - 1e-9;
      good = state.actionTaken && assisted && drawing && Math.abs(steer) <= 0.65;
      if (!assisted) hint = 'Switch trim assist on for this first practice. Then steer gently across the wind.';
      else if (state.actionTaken) hint = good ? 'The sail is drawing. Hold this gentle course a little longer.' : 'Turn gently across the wind until the sail fills and the boat moves.';
    } else if (state.step === 1) {
      const manual = controls.autoTrim === false && s.autoTrim === false;
      const sheetInput = clamp(finite(controls.sheet, s.sheet), 0, 1);
      // Assist keeps moving the sail and the UI periodically mirrors that into
      // the sheet input. Follow both values until manual control begins, so a
      // toggle alone earns nothing, even immediately after a UI mirror update.
      if (assisted) { state.anchor.sheet = s.sheet; state.anchor.sheetInput = sheetInput; }
      // Retain the previous assisted baseline on the first manual frame: a real
      // slider move or one Q/E nudge can count once it reaches the sail itself.
      if (manual && Number.isFinite(controls.sheet)
        && Math.abs(sheetInput - state.anchor.sheetInput) >= 0.025 - 1e-9
        && Math.abs(s.sheet - state.anchor.sheet) >= 0.025 - 1e-9) state.actionTaken = true;
      good = state.actionTaken && manual && Number.isFinite(controls.sheet) && drawing;
      if (good) hint = 'You have the sheet. Keep the sail drawing a little longer.';
      else if (state.actionTaken && manual) hint = 'Ease or sheet in a little until the sail draws again. Keep across the wind.';
    } else {
      const crew = clamp(finite(controls.crewBalance), -1, 1), windward = Math.sign(s.awa);
      if (Number.isFinite(controls.crewBalance) && Math.abs(s.crewBalance - state.anchor.crew) >= 0.14) state.actionTaken = true;
      // Positive crew input shifts to starboard; positive AWA arrives from there.
      // A useful windward shift and controlled immersion count. Requiring equal
      // float loads would be wrong for the existing heeled, wave-sampled model.
      const counterweight = windward * crew >= 0.14 && windward * s.crewBalance >= 0.14;
      good = state.actionTaken && Number.isFinite(controls.crewBalance) && counterweight
        && drawing && Math.abs(s.heel) <= 0.07 && Math.max(s.portLoad, s.starboardLoad) <= 0.75;
      const side = windward >= 0 ? 'starboard' : 'port';
      hint = good ? 'The boat is settled and still making way. Hold that balance.'
        : `Move some weight to ${side}, toward the incoming wind. Keep the sail drawing.`;
      if (!state.actionTaken && windward * state.anchor.crew >= 0.85) hint = `Ease a little toward the centre. Keep some weight to ${side} as the boat settles.`;
    }

    if (s.aws < 0.8) hint = 'Let the breeze return before continuing. You can keep exploring.';
    else if (s.noGo) hint = 'Turn away from the wind until the sail fills. Then settle onto a gentle course.';
  } else hint = 'Waiting for the boat and breeze. Your completed steps are kept.';

  state.holding = good;
  if (good) { state.lostTime = 0; state.hold = Math.min(def.holdSeconds, state.hold + dt); }
  else {
    // Brief wave or steering corrections are forgiving; prolonged loss gently
    // drains only the current step. Earlier completed steps never disappear.
    const before = Math.max(0, state.lostTime - 0.35);
    state.lostTime += dt;
    const decayTime = Math.max(0, state.lostTime - 0.35) - before;
    state.hold = Math.max(0, state.hold - 1.5 * decayTime);
  }
  state.progress = clamp(state.hold / def.holdSeconds, 0, 1); state.hint = hint;
  if (state.hold >= def.holdSeconds - 1e-9) {
    state.completedSteps.push(def.id);
    if (state.step < SAILING_LESSON_STEPS.length - 1) enterStep(state, state.step + 1, s, controls);
    else Object.assign(state, { progress: 1, complete: true, holding: false,
      title: 'Ready for the bay', hint: 'You found the wind, trimmed the sail and balanced the boat. Keep exploring or return to the beach.' });
  }
  return state;
}
