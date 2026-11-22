// Haptics and hit feedback. The module must not throw when a headset, a
// vibration API, or a gamepad is missing, and a pulse queue must keep
// hit above ram above shot. Combat numbers are not involved.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  HAPTIC_PRIORITY, HAPTIC_PROFILES, VIBRATE_PATTERNS, PLAYER_GESTURES, FLASH_DEFAULT, FLASH_MAX, VIGNETTE_MS,
  SHAKE_METRES, CLASSIC_ROLL, DEFAULT_FEEDBACK_SETTINGS, normalizeSettings, scaleFlash, scalePulse,
  readActuator, canVibrate, createPulseQueue, createFeedback, edgeAnchor, bearingDir, shakePose,
  mergeHaptics, withFirstStep, getActuator,
} from '../src/ui/feedback.mjs';
import { deckHapticName, deckEdge, deckDirection } from '../src/ui/crest-feedback.mjs';
import { freshSave } from '../src/sim/progress.mjs';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('profile constants: shot, weak spot, rocket, ram, sink, and hit > ram > shot', () => {
  assert.deepEqual(HAPTIC_PRIORITY, { shot: 1, ram: 2, hit: 3 });
  assert.ok(HAPTIC_PRIORITY.hit > HAPTIC_PRIORITY.ram && HAPTIC_PRIORITY.ram > HAPTIC_PRIORITY.shot);
  assert.deepEqual(HAPTIC_PROFILES.shot.steps, [{ value: 0.15, duration: 20 }]);
  assert.equal(HAPTIC_PROFILES.shot.hands, 'fire');
  assert.deepEqual(HAPTIC_PROFILES.flare.steps, HAPTIC_PROFILES.shot.steps);
  assert.deepEqual([...PLAYER_GESTURES], ['shot', 'flare']);
  assert.deepEqual(HAPTIC_PROFILES.hitWeak.steps, [{ value: 0.35, duration: 40 }]);
  assert.equal(HAPTIC_PROFILES.hitWeak.priority, 'hit');
  assert.deepEqual(HAPTIC_PROFILES.rocket.steps, [{ value: 0.8, duration: 120 }]);
  assert.equal(HAPTIC_PROFILES.rocket.hands, 'both');
  assert.deepEqual(HAPTIC_PROFILES.ram.steps, [{ value: 1, duration: 200 }, { value: 0.4, duration: 150 }]);
  assert.equal(HAPTIC_PROFILES.ram.priority, 'ram');
  assert.deepEqual(HAPTIC_PROFILES.sink.steps, [{ value: 0.6, duration: 120 }, { value: 0.6, duration: 120 }, { value: 0.6, duration: 120 }]);
  assert.equal(HAPTIC_PROFILES.sink.priority, 'hit');
  assert.deepEqual([...VIBRATE_PATTERNS.rocket], [120]);
  assert.deepEqual([...VIBRATE_PATTERNS.ram], [200, 40, 150]);
  assert.deepEqual([...VIBRATE_PATTERNS.sink], [120, 40, 120, 40, 120]);
  assert.equal(VIBRATE_PATTERNS.shot, undefined);
  assert.equal(VIBRATE_PATTERNS.flare, undefined);
  assert.equal(FLASH_DEFAULT, 0.15);
  assert.equal(FLASH_MAX, 0.3);
  assert.equal(VIGNETTE_MS, 250);
  assert.equal(scaleFlash(undefined), 0.15);
  assert.equal(scaleFlash(0.15), 0.15);
  assert.equal(scaleFlash(0.3), 0.3);
  assert.equal(scaleFlash(1), 0.3);
  assert.equal(scaleFlash(0), 0);
  assert.equal(scalePulse(0.8, 0.5), 0.4);
});

test('feature-detect: no crash when hapticActuators, vibrate, or gamepad are missing', () => {
  const samples = [
    undefined, null, {}, { gamepad: null }, { gamepad: {} },
    { gamepad: { hapticActuators: [] } },
    { gamepad: { hapticActuators: [null] } },
    { gamepad: { hapticActuators: [{}] } },
    { gamepad: { hapticActuators: [{ pulse: 'no' }] } },
    { get gamepad() { throw new Error('gamepad missing'); } },
  ];
  assert.doesNotThrow(() => {
    for (const sample of samples) assert.equal(readActuator(sample), null);
    assert.equal(canVibrate(undefined), false);
    assert.equal(canVibrate(null), false);
    assert.equal(canVibrate({}), false);
    assert.equal(canVibrate({ get vibrate() { throw new Error('vibrate missing'); } }), false);
  });
  const pulses = [];
  const fb = createFeedback({
    vibrate() { throw new Error('vibrate missing'); },
    ios: () => false,
  });
  assert.doesNotThrow(() => {
    const missed = fb.play('rocket', { xr: true, sources: samples, hand: 0, now: 0 });
    assert.equal(missed.played, false);
    assert.equal(missed.reason, 'missing');
    fb.play('shot', { now: 20 });
    fb.tick(500);
    const quiet = createFeedback({ vibrate() { throw new Error('vibrate missing'); }, ios: () => false });
    const ram = quiet.play('ram', { now: 0 });
    assert.equal(ram.played, false);
    assert.equal(ram.reason, 'missing');
  });
  assert.deepEqual(pulses, []);
  const actuator = { pulse(value, ms) { pulses.push([value, ms]); } };
  assert.equal(readActuator({ gamepad: { hapticActuators: [actuator] } }), actuator);
  assert.equal(readActuator({ gamepad: { vibrationActuator: actuator } }), actuator);
  assert.equal(canVibrate({ vibrate() {} }), true);
});

test('pulse queue: hit interrupts ram, ram holds off a shot, ram and sink keep their later steps', () => {
  const q = createPulseQueue();
  const ram = q.offer('hand', HAPTIC_PROFILES.ram, 0);
  assert.equal(ram.action, 'play');
  assert.equal(ram.step.value, 1);
  assert.equal(ram.step.duration, 200);
  const shot = q.offer('hand', HAPTIC_PROFILES.shot, 10);
  assert.equal(shot.action, 'wait');
  const again = q.offer('hand', HAPTIC_PROFILES.shot, 12);
  assert.equal(again.action, 'drop');
  assert.equal(q.poll('hand', 199), null);
  const after = q.poll('hand', 200);
  assert.equal(after.step.value, 0.4);
  assert.equal(after.step.duration, 150);
  const queuedShot = q.poll('hand', 350);
  assert.equal(queuedShot.step.value, 0.15);
  assert.equal(queuedShot.step.duration, 20);

  const hit = q.offer('hand', HAPTIC_PROFILES.ram, 1000);
  assert.equal(hit.step.value, 1);
  const over = q.offer('hand', HAPTIC_PROFILES.rocket, 1050);
  assert.equal(over.action, 'play');
  assert.equal(over.step.value, 0.8);
  assert.equal(over.step.duration, 120);
  assert.equal(q.poll('hand', 1170), null);

  let t = 2000;
  const sink = [q.offer('other', HAPTIC_PROFILES.sink, t)];
  t += 120; sink.push(q.poll('other', t));
  t += 120; sink.push(q.poll('other', t));
  assert.deepEqual(sink.map((s) => s.step.value), [0.6, 0.6, 0.6]);
  assert.deepEqual(sink.map((s) => s.step.duration), [120, 120, 120]);
  assert.equal(q.poll('other', t + 120), null);
});

test('iPhone taps only its own shot or flare, and never a delayed hit', () => {
  const taps = [];
  const fb = createFeedback({ ios: () => true, iosTap: () => taps.push('tap') });
  assert.equal(fb.play('shot', { gesture: true, now: 0 }).via, 'ios');
  assert.equal(fb.play('flare', { gesture: true, now: 1 }).via, 'ios');
  assert.deepEqual(taps, ['tap', 'tap']);
  const hit = fb.play('rocket', { gesture: true, now: 2 });
  assert.equal(hit.played, false);
  assert.equal(hit.reason, 'visual');
  assert.equal(fb.play('shot', { gesture: false, now: 3 }).played, false);
  fb.tick(5000);
  assert.deepEqual(taps, ['tap', 'tap']);
  fb.configure({ haptics: 'off' });
  assert.equal(fb.play('shot', { gesture: true, now: 6 }).reason, 'off');
  assert.equal(taps.length, 2);
});

test('Android vibrates for a hit or a ram, not for a shot, and a hit outranks a ram', () => {
  const calls = [];
  const fb = createFeedback({ ios: () => false, vibrate: (pattern) => { calls.push(pattern); return true; } });
  assert.equal(fb.play('shot', { now: 0 }).reason, 'none');
  assert.equal(fb.play('flare', { now: 0 }).reason, 'none');
  assert.deepEqual(calls, []);
  const rocket = fb.play('rocket', { now: 0 });
  assert.equal(rocket.via, 'vibrate');
  assert.deepEqual(rocket.pattern, [120]);
  const ram = fb.play('ram', { now: 10 });
  assert.equal(ram.reason, 'wait');
  assert.equal(calls.length, 1);
  fb.tick(120);
  assert.deepEqual(calls[1], [200, 40, 150]);
  fb.configure({ hapticStrength: 0.5 });
  const weak = fb.play('hitWeak', { now: 1000 });
  assert.deepEqual(weak.pattern, [20]);
});

test('an XR pulse uses the firing hand or both hands, and does not also vibrate', () => {
  const left = [], right = [];
  const hands = [
    { gamepad: { hapticActuators: [{ pulse(v, ms) { left.push([v, ms]); } }] } },
    { gamepad: { hapticActuators: [{ pulse(v, ms) { right.push([v, ms]); } }] } },
  ];
  const buzz = [];
  const fb = createFeedback({ ios: () => false, vibrate: (pattern) => { buzz.push(pattern); return true; } });
  fb.play('shot', { xr: true, sources: hands, hand: 1, now: 0 });
  assert.deepEqual(left, []);
  assert.deepEqual(right, [[0.15, 20]]);
  fb.play('rocket', { xr: true, sources: hands, hand: 1, now: 5 });
  assert.deepEqual(left, [[0.8, 120]]);
  assert.deepEqual(right.at(-1), [0.8, 120]);
  assert.deepEqual(buzz, []);
  fb.tick(5 + 120);
  assert.equal(right.filter((p) => p[0] === 0.15).length, 1);
});

test('shake is deck translation, classic roll is phone-only, and XR roll stays at zero', () => {
  const t = Math.PI / 2 / 71;
  const rig = shakePose(1, t, { shake: 'on', shakeStrength: 1, shakeStyle: 'rig' }, { xr: false });
  assert.equal(rig.roll, 0);
  assert.ok(Math.abs(rig.x - SHAKE_METRES) < 1e-9);
  const classic = shakePose(1, t, { shake: 'on', shakeStrength: 1, shakeStyle: 'classic' }, { xr: false });
  assert.equal(classic.roll, CLASSIC_ROLL);
  assert.equal(classic.x, 0);
  const xr = shakePose(1, t, { shake: 'on', shakeStrength: 1, shakeStyle: 'classic' }, { xr: true });
  assert.equal(xr.roll, 0);
  assert.ok(Math.abs(xr.x - SHAKE_METRES) < 1e-9);
  assert.deepEqual(shakePose(1, t, { shake: 'off', shakeStrength: 1, shakeStyle: 'rig' }), { x: 0, y: 0, z: 0, roll: 0 });
  const half = shakePose(0.9, t, { shake: 'on', shakeStrength: 0.5, shakeStyle: 'rig' });
  assert.ok(Math.abs(half.x - SHAKE_METRES * 0.45) < 1e-9);
});

test('comfort settings normalise without a game-speed field', () => {
  const fresh = freshSave().settings;
  assert.equal(fresh.haptics, 'on');
  assert.equal(fresh.hapticStrength, 1);
  assert.equal(fresh.shake, 'on');
  assert.equal(fresh.shakeStrength, 1);
  assert.equal(fresh.shakeStyle, 'rig');
  assert.equal(fresh.flash, 0.15);
  assert.equal(fresh.vignette, 'on');
  assert.equal(fresh.motion, 'full');
  const old = normalizeSettings({ haptics: true, shake: false, vignette: false, flash: 0.9, hapticStrength: 4, shakeStyle: 'sideways', timeScale: 0.2 });
  assert.equal(old.haptics, 'on');
  assert.equal(old.shake, 'off');
  assert.equal(old.vignette, 'off');
  assert.equal(old.flash, 0.3);
  assert.equal(old.hapticStrength, 1);
  assert.equal(old.shakeStyle, 'rig');
  assert.equal('timeScale' in old, false);
  assert.deepEqual(Object.keys(normalizeSettings({})).sort(), Object.keys(DEFAULT_FEEDBACK_SETTINGS).sort());
  const anchor = edgeAnchor({ x: -1, y: 0 });
  assert.equal(anchor.x, 0);
  assert.equal(anchor.y, 50);
  assert.equal(anchor.angle, -90);
  assert.equal(anchor.ms, 250);
  const ahead = bearingDir({ x: 0, z: 0, h: 0 }, { x: -10, z: 30 });
  assert.ok(ahead.x < 0);
  assert.ok(ahead.y > 0);
});

test('deck events map onto the shared profiles and a directional edge', () => {
  assert.equal(deckHapticName({ type: 'dShot', hit: '' }), 'shot');
  assert.equal(deckHapticName({ type: 'dShot', hit: 'pod' }), 'hitWeak');
  assert.equal(deckHapticName({ type: 'dShot', hit: 'tail' }), 'hitWeak');
  assert.equal(deckHapticName({ type: 'dShot', hit: 'rocket' }), 'shot');
  assert.equal(deckHapticName({ type: 'dFlare' }), 'flare');
  assert.equal(deckHapticName({ type: 'dRocketHit', hit: true }), 'rocket');
  assert.equal(deckHapticName({ type: 'dRocketHit', hit: false }), null);
  assert.equal(deckHapticName({ type: 'dStrafe', hit: true }), 'rocket');
  assert.equal(deckHapticName({ type: 'dRam' }), 'ram');
  assert.equal(deckHapticName({ type: 'dEnd', won: false, hull: 0 }), 'sink');
  assert.equal(deckHapticName({ type: 'dEnd', won: true, hull: 0 }), null);
  assert.equal(deckEdge({ type: 'dShot', hit: 'pod' }), false);
  assert.equal(deckEdge({ type: 'dRocketHit', hit: true }), true);
  assert.equal(deckEdge({ type: 'dStrafe', hit: false }), false);
  const dir = deckDirection({ type: 'dRocketHit', hit: true, x: -8, z: 12 }, { x: 0, z: 0, h: 0, hawkX: 4, hawkZ: 40 });
  assert.ok(dir.x < 0);
  const sink = deckDirection({ type: 'dEnd', won: false, hull: 0 }, null);
  assert.ok(sink.y < 0);
  const feedbackSrc = read('src/ui/feedback.mjs');
  assert.doesNotMatch(feedbackSrc, /deck\.mjs|DeckFight|HAWK|from '\.\.\/sim\//);
  const stageSrc = read('src/view/stage.mjs');
  assert.doesNotMatch(stageSrc, /0\.012 \* S\.shake/);
  assert.match(stageSrc, /shakePose\(S\.shake/);
  const mainSrc = read('src/main.mjs');
  const apply = mainSrc.slice(mainSrc.indexOf('function applySettings'), mainSrc.indexOf('function applyGov'));
  assert.doesNotMatch(apply, /timeScale/);
  for (const page of ['index.html', 'bay/index.html']) {
    const html = read(page);
    assert.match(html, /id="h-comfort"/);
    assert.match(html, /data-set="shake"/);
    assert.match(html, /data-set="shakeStyle"/);
    assert.match(html, /data-set="vignette"/);
    assert.match(html, /data-set="haptics"/);
    assert.match(html, /id="set-flash"/);
    assert.match(html, /max="0\.3"/);
  }
  const css = read('css/game.css');
  const edgeCss = css.slice(css.indexOf('#h-edge {'), css.indexOf('#h-prog {'));
  assert.match(edgeCss, /#h-edge\.hit \{ animation: edge 250ms ease-out 1; \}/);
  assert.match(edgeCss, /--hit-angle/);
  assert.doesNotMatch(edgeCss, /infinite|alternate/);
  assert.match(feedbackSrc, /2 a second/);
  assert.match(feedbackSrc, /never be applied to the XR camera/);
});

test('a game can merge its own profiles and ranks without changing the Crest defaults', () => {
  const crestHit = HAPTIC_PRIORITY.hit;
  const crestRocket = HAPTIC_PROFILES.rocket.steps[0].value;
  const merged = mergeHaptics({
    priorities: { block: 1, hit: 2, punish: 3, ko: 4, speed: 'fast' },
    profiles: {
      jab: { priority: 'hit', hands: 'fire', steps: [{ value: 0.2, duration: 25 }] },
      block: { priority: 'block', hands: 'both', steps: [{ value: 0.3, duration: 40 }] },
      punish: { priority: 'punish', hands: 'fire', steps: [{ value: 0.7, duration: 80 }] },
      ko: { priority: 'ko', hands: 'both', steps: [{ value: 1, duration: 160 }, { value: 0.4, duration: 80 }] },
      broken: { timeScale: 1 },
    },
    vibratePatterns: { ko: [160, 40, 80], jab: 'no' },
    timeScale: 0.2,
  });
  assert.equal(HAPTIC_PRIORITY.hit, crestHit);
  assert.equal(HAPTIC_PROFILES.rocket.steps[0].value, crestRocket);
  assert.ok(merged.priorities.ko > merged.priorities.punish);
  assert.ok(merged.priorities.punish > merged.priorities.hit);
  assert.ok(merged.priorities.hit > merged.priorities.block);
  assert.equal(merged.priorities.shot, 1);
  assert.equal(merged.priorities.speed, undefined);
  assert.equal(merged.profiles.jab.steps[0].duration, 25);
  assert.equal(merged.profiles.shot.steps[0].value, 0.15);
  assert.equal(merged.profiles.broken, undefined);
  assert.deepEqual([...merged.patterns.ko], [160, 40, 80]);
  assert.equal(merged.patterns.jab, undefined);
  assert.equal(merged.timeScale, undefined);
  const pulses = [];
  const actuator = { pulse(v, ms) { pulses.push([v, ms]); } };
  const ff = createFeedback({
    profiles: merged.profiles,
    priorities: merged.priorities,
    vibratePatterns: { ko: [160, 40, 80] },
    ios: () => false,
    vibrate: () => false,
  });
  ff.play('punish', { xr: true, sources: [{ gamepad: { hapticActuators: [actuator] } }], now: 0 });
  ff.play('block', { xr: true, sources: [{ gamepad: { hapticActuators: [actuator] } }], now: 10 });
  ff.play('ko', { xr: true, sources: [{ gamepad: { hapticActuators: [actuator] } }], now: 20 });
  assert.deepEqual(pulses[0], [0.7, 80]);
  assert.deepEqual(pulses.at(-1), [1, 160]);
  ff.tick(20 + 160);
  assert.deepEqual(pulses.at(-1), [0.4, 80]);
  const buzz = [];
  const phone = createFeedback({
    profiles: { ko: merged.profiles.ko },
    priorities: { ko: 4 },
    vibratePatterns: { ko: [160, 40, 80] },
    ios: () => false,
    vibrate: (pattern) => { buzz.push(pattern); return true; },
  });
  assert.deepEqual(phone.play('ko', { now: 0 }).pattern, [160, 40, 80]);
  assert.equal(phone.play('shot', { now: 0 }).reason, 'none');
  assert.deepEqual(buzz, [[160, 40, 80]]);
});

test('value and duration override only the first step, and a disabled override does not throw', () => {
  const pulses = [];
  const actuator = { pulse(v, ms) { pulses.push([v, ms]); } };
  const source = { gamepad: { hapticActuators: [actuator] } };
  const fb = createFeedback({ ios: () => false, vibrate: () => false });
  fb.play('ram', { xr: true, sources: [source], value: 0.55, duration: 80, now: 0 });
  assert.deepEqual(pulses[0], [0.55, 80]);
  fb.tick(80);
  assert.deepEqual(pulses[1], [0.4, 150]);
  fb.play('shot', { xr: true, sources: [source], value: 4, duration: -3, now: 1000 });
  assert.deepEqual(pulses.at(-1), [1, 20]);
  const shaped = withFirstStep(HAPTIC_PROFILES.ram, { value: 0.2, duration: 30 });
  assert.equal(shaped.steps[0].value, 0.2);
  assert.equal(shaped.steps[0].duration, 30);
  assert.equal(shaped.steps[1].value, 0.4);
  assert.equal(HAPTIC_PROFILES.ram.steps[0].value, 1);
  fb.configure({ haptics: 'off' });
  assert.doesNotThrow(() => {
    const quiet = fb.play('ram', { xr: true, sources: [null, { get gamepad() { throw new Error('gone'); } }], value: { bad: true }, duration: 'nope', now: 2000 });
    assert.equal(quiet.reason, 'off');
  });
  assert.equal(pulses.length, 3);
});

test('left and right select a hand, and an index still addresses sources', () => {
  const left = [], right = [], hooked = [];
  const sources = [
    { handedness: 'left', gamepad: { hapticActuators: [{ pulse(v, ms) { left.push([v, ms]); } }] } },
    { handedness: 'right', gamepad: { hapticActuators: [{ pulse(v, ms) { right.push([v, ms]); } }] } },
  ];
  const fb = createFeedback({ ios: () => false, vibrate: () => false });
  fb.play('shot', { xr: true, sources, hand: 'right', now: 0 });
  assert.deepEqual(right, [[0.15, 20]]);
  assert.deepEqual(left, []);
  fb.play('shot', { xr: true, sources, hand: 0, now: 100 });
  assert.deepEqual(left, [[0.15, 20]]);
  assert.equal(getActuator('left', sources), sources[0].gamepad.hapticActuators[0]);
  assert.equal(getActuator('missing', [{ get gamepad() { throw new Error('no pad'); } }]), null);
  assert.doesNotThrow(() => fb.play('shot', { xr: true, sources: [{ gamepad: null }], hand: 'left', now: 200 }));
  const viaHook = createFeedback({
    ios: () => false,
    vibrate: () => false,
    getActuator(hand) { return hand === 'right' ? { pulse(v, ms) { hooked.push([v, ms]); } } : null; },
  });
  viaHook.play('shot', { xr: true, sources, hand: 'right', now: 0 });
  assert.deepEqual(hooked, [[0.15, 20]]);
  assert.equal(right.length, 1);
});
