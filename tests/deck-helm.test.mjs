// B1 helm-dodge. The ring is unchanged when the lane stays in the middle.
// A strafe that was announced on another lane does not take hull.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DeckFight, hawkCourse, hawkSettings, HAWK, HELM, laneCentre, helmLane, stepLane, stickFlick, tiltLane, swipeStep, thumbstickX, xrStickStep } from '../src/sim/deck.mjs';
import { DT, Race } from '../src/sim/race-sim.mjs';

function fight() {
  const course = hawkCourse();
  const race = new Race(hawkSettings(course), course);
  const F = new DeckFight(race, { difficulty: 'normal', seed: 5 });
  race.t = race.go;
  return { race, F };
}

// Run to the first strafe. Rockets stay off so the hull change is the strafe's own.
// dodge is applied only after the pass has announced its lane, so the stand-in leaves that lane.
function firstStrafe(dodge) {
  const { race, F } = fight();
  F.rocketT = 1e9;
  for (const q of F.rockets) q.on = false;
  const inp = { steer: 0, brake: 0, boost: 0 };
  let strafe = null, announced = false, hullBefore = F.hull;
  for (let i = 0; i < 4000 && !strafe && !F.over; i++) {
    if (announced && dodge) F.input.lane = dodge;
    hullBefore = F.hull;
    F.pilot(inp);
    race.step(inp.steer, inp.brake, inp.boost);
    F.step();
    if (race.events.some((e) => e.type === 'dAim')) announced = true;
    strafe = race.events.find((e) => e.type === 'dStrafe') || null;
    if (!strafe) race.events.length = 0;
  }
  return { F, strafe, hullBefore, announced };
}

test('the three lane centres sit inside halfWidth', () => {
  const half = HAWK.halfWidth;
  assert.equal(half, 120);
  const centres = [-1, 0, 1].map((i) => laneCentre(i, half));
  assert.deepEqual(centres, [-80, 0, 80]);
  for (const c of centres) assert.ok(Math.abs(c) <= half);
  assert.equal(helmLane(0, half), 0);
  assert.equal(helmLane(-80, half), -1);
  assert.equal(helmLane(80, half), 1);
  assert.equal(laneCentre(9, half), 80);
  assert.equal(laneCentre(-9, half), -80);
});

test('a lane switch stays inside halfWidth, including a wild offset', () => {
  const { F } = fight();
  F.input.lane = 1;
  for (let i = 0; i < 80; i++) {
    F.step();
    assert.ok(Math.abs(F.laneOff) <= HAWK.halfWidth, String(F.laneOff));
  }
  assert.equal(F.lane, 1);
  assert.ok(Math.abs(F.laneOff - laneCentre(1)) < 1e-6);
  F.laneOff = HAWK.halfWidth + 80;
  F.input.lane = -1;
  F.step();
  assert.ok(Math.abs(F.laneOff) <= HAWK.halfWidth);
  assert.ok(Math.abs(stepLane(500, laneCentre(1), HAWK.halfWidth)) <= HAWK.halfWidth);
  assert.ok(Math.abs(stepLane(-500, laneCentre(-1), HAWK.halfWidth)) <= HAWK.halfWidth);
});

test('lane-change speed is constant: no ramp, then a stop on the lane', () => {
  const { F } = fight();
  F.input.lane = 1;
  const deltas = [];
  let prev = F.laneOff;
  for (let i = 0; i < 60; i++) {
    F.step();
    deltas.push(F.laneOff - prev);
    prev = F.laneOff;
  }
  const cap = HELM.speed * DT;
  const moving = deltas.filter((d) => d !== 0);
  assert.ok(moving.length >= 3);
  assert.equal(moving[0], moving[1]);
  for (let i = 1; i < moving.length; i++) {
    assert.ok(Math.abs(moving[i]) <= Math.abs(moving[0]) + 1e-9);
    assert.ok(Math.abs(moving[i]) <= cap + 1e-9);
  }
  // the first step is already at full speed. Nothing eases in.
  assert.ok(Math.abs(Math.abs(moving[0]) - cap) < 1e-6);
  const arrived = deltas.findIndex((d, i) => i > 0 && d === 0 && deltas[i - 1] !== 0);
  assert.ok(arrived > 0);
  assert.ok(deltas.slice(arrived).every((d) => d === 0));
});

test('a stand-in that stays in the announced strafe lane takes the normal hit', () => {
  const { F, strafe, hullBefore, announced } = firstStrafe(0);
  assert.equal(announced, true);
  assert.ok(strafe);
  assert.equal(F.passLane, 0);
  assert.equal(F.lane, 0);
  assert.equal(strafe.hit, true);
  assert.equal(strafe.hull, hullBefore - 1);
  assert.equal(F.hull, hullBefore - 1);
});

test('a stand-in that dodges out of the announced strafe lane loses 0 hull from that strafe', () => {
  const { F, strafe, hullBefore, announced } = firstStrafe(-1);
  assert.equal(announced, true);
  assert.ok(strafe);
  assert.equal(F.passLane, 0);
  assert.equal(F.lane, -1);
  assert.ok(Math.abs(F.laneOff) <= HAWK.halfWidth);
  assert.notEqual(F.lane, F.passLane);
  assert.equal(strafe.hit, false);
  assert.equal(strafe.hull, hullBefore);
  assert.equal(F.hull, hullBefore);
  assert.equal(F.taken, 0);
});

test('a thumbstick flick switches one lane and a hold does not repeat', () => {
  let armed = true, lane = 0;
  const flick = (axis) => {
    const r = stickFlick(axis, armed);
    armed = r.armed;
    if (r.step) lane = Math.max(-1, Math.min(1, lane + r.step));
    return r;
  };
  assert.equal(flick(0.2).step, 0);
  assert.equal(flick(0.9).step, 1);
  assert.equal(lane, 1);
  assert.equal(flick(0.9).step, 0);
  assert.equal(flick(1).step, 0);
  assert.equal(lane, 1);
  assert.equal(flick(0).armed, true);
  assert.equal(flick(-0.85).step, -1);
  assert.equal(lane, 0);
  assert.equal(flick(-0.85).step, 0);
  assert.equal(flick(0).armed, true);
  assert.equal(flick(-0.9).step, -1);
  assert.equal(lane, -1);
});

test('tilt and swipe pick a lane without a ramp and without stealing a vertical drag', () => {
  assert.equal(tiltLane(0), 0);
  assert.equal(tiltLane(0.2), 0);
  assert.equal(tiltLane(HELM.tilt), 1);
  assert.equal(tiltLane(-0.8), -1);
  const small = swipeStep(12, 4, false);
  assert.equal(small.step, 0);
  assert.equal(small.sent, false);
  const vertical = swipeStep(20, 90, false);
  assert.equal(vertical.step, 0);
  const right = swipeStep(70, 8, false);
  assert.equal(right.step, 1);
  assert.equal(right.sent, true);
  const again = swipeStep(140, 8, true);
  assert.equal(again.step, 0);
  assert.equal(swipeStep(-70, 5, false).step, -1);
});

test('an xr-standard Quest stick on axes[2] changes one lane, and a short pad still uses axes[0]', () => {
  const quest = (x, y = 0) => [{ gamepad: { mapping: 'xr-standard', axes: [0, 0, x, y] }, handedness: 'right' }];
  assert.equal(thumbstickX([0, 0, 0.95, 0]), 0.95);
  assert.equal(thumbstickX([0, 0, -0.95, 0]), -0.95);
  // a centred stick must not be replaced by a touchpad value sitting in axes[0]
  assert.equal(thumbstickX([0.95, 0, 0, 0]), 0);
  let armed = true, lane = 0;
  const step = (axes) => {
    const r = xrStickStep([{ gamepad: { mapping: 'xr-standard', axes } }], armed, lane);
    armed = r.armed; lane = r.lane; return r;
  };
  assert.equal(step([0, 0, 0.95, 0]).step, 1);
  assert.equal(lane, 1);
  assert.equal(step([0, 0, 0.95, 0]).step, 0);
  assert.equal(lane, 1);
  assert.equal(step([0, 0, 0, 0]).armed, true);
  assert.equal(step([0, 0, -0.95, 0]).step, -1);
  assert.equal(lane, 0);
  const legacy = xrStickStep([{ gamepad: { axes: [0.95, 0.2] } }], true, 0);
  assert.equal(legacy.step, 1);
  assert.equal(legacy.lane, 1);
  const quiet = xrStickStep(quest(0), true, 0);
  assert.equal(quiet.step, 0);
  assert.equal(quiet.lane, 0);
});

test('a rocket meets the shown boat in a side lane and does not hit the ring 80 m away', () => {
  const { F } = fight();
  F.laneOff = 80;
  F.lane = 1;
  const b = F.me;
  const shownX = b.x - Math.cos(b.h) * F.laneOff;
  const shownZ = b.z - Math.sin(b.h) * F.laneOff;
  const q = F.rockets[0];
  q.on = true; q.t = 0.5; q.T = 0.5 + DT / 2; q.w = 6; q.lift = 3;
  q.sx = shownX - 30; q.sy = 18; q.sz = shownZ + 12; q.x = q.sx; q.y = q.sy; q.z = q.sz;
  F.safeT = -1e9;
  const hull = F.hull;
  F.stepRockets();
  const toBoat = Math.hypot(q.x - shownX, q.z - shownZ);
  const toRing = Math.hypot(q.x - b.x, q.z - b.z);
  const ev = F.race.events.find((e) => e.type === 'dRocketHit');
  assert.ok(ev, 'the rocket arrives');
  assert.ok(toBoat < 12, `impact is ${toBoat} m from the shown boat`);
  assert.ok(toRing > 70, `impact is ${toRing} m from the ring`);
  assert.equal(ev.hit, true);
  assert.equal(F.hull, hull - 1);
  assert.ok(Math.hypot(ev.x - shownX, ev.z - shownZ) < 12);
  assert.ok(Math.hypot(ev.x - b.x, ev.z - b.z) > 70);
});

test('a middle lane leaves the gun where it was, and the headset rig does not roll', () => {
  const { F } = fight();
  const b = F.me;
  const g = F.gunAt();
  assert.equal(g.x, b.x - Math.sin(b.h) * HAWK.gun.ahead);
  assert.equal(g.y, HAWK.gun.up);
  assert.equal(g.z, b.z + Math.cos(b.h) * HAWK.gun.ahead);
  assert.equal(F.laneOff, 0);
  const view = readFileSync(new URL('../src/view/deck-view.mjs', import.meta.url), 'utf8');
  const rig = view.slice(view.indexOf('placeRig('), view.indexOf('update(dt'));
  assert.match(rig, /rotation\.set\(0,/);
  assert.doesNotMatch(rig, /rotateZ/);
  const stage = readFileSync(new URL('../src/view/stage.mjs', import.meta.url), 'utf8');
  const shift = stage.slice(stage.indexOf('helm-dodge shifts'), stage.indexOf('this.placeCamera(me, M, dt)'));
  assert.match(shift, /laneOff/);
  assert.doesNotMatch(shift, /rotateZ|rotation/);
  const main = readFileSync(new URL('../src/main.mjs', import.meta.url), 'utf8');
  assert.match(main, /laneMoving\) feedback\.comfort/);
  const feedback = readFileSync(new URL('../src/ui/feedback.mjs', import.meta.url), 'utf8');
  assert.match(feedback, /if \(settings\.vignette !== 'on'\) return/);
});
