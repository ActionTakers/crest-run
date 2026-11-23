// Captain Jack's optional, non-ranked JUKUNG-RACER sailing trial. Pure numeric module: no DOM,
// renderer, network, randomness or runtime dependencies. This is a bounded GAME
// MODEL, not a measured jukung VPP or sailing instruction. Its aerodynamic polar,
// mass, drag, sail area and restoring coefficients need calibration with Jack.
// Metres, seconds, radians. h follows race-sim: forward=(-sin(h),cos(h)),
// starboard=(-cos(h),-sin(h)). Wind is air velocity TOWARDS world x/z.
import { JUKUNG_SPEC as J } from './jukung-spec.mjs?v=03fa7436';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const finite = (x, fallback = 0) => Number.isFinite(x) ? x : fallback;
const DEG = Math.PI / 180;
const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));

export const SAILING_TUNE = Object.freeze({
  mass: 240, sailArea: 10, airDensity: 1.225,
  hullDrag: 0.044, lateralDamping: 1.2, floatDrag: 0.025,
  rudderDrag: 0.07, maxRudder: 30 * DEG, maxYawRate: 0.48,
  noGoAngle: 34 * DEG, minSheetAngle: 7 * DEG, maxSheetAngle: 85 * DEG,
  defaultWind: Object.freeze({ x: 4, z: -3 }),
});

// A deliberately simple, symmetric envelope. These are gameplay coefficients,
// not claimed measurements of a traditional racing rig.
const POLAR = [[0, 0], [34, 0], [45, 0.52], [65, 0.82], [90, 1], [120, 1.04], [150, 0.86], [180, 0.65]];
function polar(a) {
  const d = clamp(a / DEG, 0, 180);
  for (let i = 1; i < POLAR.length; i++) if (d <= POLAR[i][0]) {
    const [a0, v0] = POLAR[i - 1], [a1, v1] = POLAR[i];
    return v0 + (v1 - v0) * (d - a0) / (a1 - a0);
  }
  return 0;
}

export function sailingInputs(input = {}, previous = {}) {
  return {
    sheet: clamp(finite(input.sheet, finite(previous.sheet, 0.55)), 0, 1),
    autoTrim: input.autoTrim === undefined ? previous.autoTrim !== false : !!input.autoTrim,
    rigBalance: clamp(finite(input.rigBalance, finite(previous.rigBalance)), -1, 1),
    crewBalance: clamp(finite(input.crewBalance, finite(previous.crewBalance)), -1, 1),
    steer: clamp(finite(input.steer), -1, 1),
  };
}

export function makeSailingState(options = {}) {
  const w = options.wind || SAILING_TUNE.defaultWind;
  return {
    ...sailingInputs(options),
    trueWind: { x: finite(w.x), z: finite(w.z) },
    awa: 0, aws: 0, sailAngle: 0, fill: 0, trimEfficiency: 0,
    heelTarget: 0, heel: 0, portLoad: 0, starboardLoad: 0,
    leeway: 0, rudderAngle: 0, speedThroughWater: 0,
    noGo: true, luffing: true, drive: 0, resistance: 0,
    designStatus: 'Uncalibrated prototype; not measured boat performance',
  };
}

// Evaluate the rig at the current state without changing it. Exposed separately
// so meaningful wind/trim symmetry and no-energy tests do not need a renderer.
export function sailingForces(b, input = {}, wind = SAILING_TUNE.defaultWind, loading = {}) {
  const C = SAILING_TUNE, controls = sailingInputs(input, b.sailing || {});
  const h = finite(b.h), vx = finite(b.vx), vz = finite(b.vz);
  const fx = -Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = -Math.sin(h);
  const wx = finite(wind.x), wz = finite(wind.z), ax = wx - vx, az = wz - vz;
  const af = ax * fx + az * fz, ar = ax * rx + az * rz;
  const aws = Math.hypot(ax, az), awa = aws > 1e-8 ? Math.atan2(-ar, -af) : 0;
  const absAWA = Math.abs(awa), u = vx * fx + vz * fz, v = vx * rx + vz * rz;
  const idealAngle = clamp(7 * DEG + Math.max(0, absAWA - C.noGoAngle) * 0.70, C.minSheetAngle, C.maxSheetAngle);
  const angle = controls.autoTrim ? idealAngle : C.maxSheetAngle - controls.sheet * (C.maxSheetAngle - C.minSheetAngle);
  const sheet = (C.maxSheetAngle - angle) / (C.maxSheetAngle - C.minSheetAngle);
  const noGo = absAWA <= C.noGoAngle;
  const efficiency = Math.exp(-Math.pow((angle - idealAngle) / (23 * DEG), 2));
  const hasWind = Math.hypot(wx, wz) > 0.02;
  const trimEfficiency = hasWind && !noGo ? efficiency : 0;
  const pressure = 0.5 * C.airDensity * C.sailArea * aws * aws / C.mass;
  const drive = pressure * polar(absAWA) * trimEfficiency;
  const side = -Math.sign(awa) * pressure * 0.43 * Math.sin(absAWA) * trimEfficiency;
  const portLoad = clamp(finite(loading.portLoad), 0, 1.5), starboardLoad = clamp(finite(loading.starboardLoad), 0, 1.5);
  const rudderAngle = controls.steer * C.maxRudder;
  const resistance = (C.hullDrag + C.floatDrag * (portLoad + starboardLoad)
    + C.rudderDrag * Math.sin(rudderAngle) ** 2) * u * Math.abs(u);
  const lateral = side - C.lateralDamping * v - 0.2 * v * Math.abs(v);
  const authority = Math.min(1, Math.abs(u) / 2.6);
  // Moving sail effort forward reduces this prototype's weather-helm tendency.
  const weatherHelm = Math.sign(awa) * (0.025 - 0.065 * controls.rigBalance) * Math.min(1.5, drive);
  const yawTarget = (controls.steer * C.maxYawRate * Math.sign(u || 1) + weatherHelm) * authority;
  const heelTarget = clamp(-Math.sign(awa) * pressure * 0.27 * trimEfficiency * Math.sin(absAWA)
    + controls.crewBalance * 0.16, -0.32, 0.32);
  return {
    ...controls, sheet, awa, aws, noGo, trimEfficiency,
    sailAngle: (Math.sign(awa) || 1) * angle,
    fill: clamp(trimEfficiency * polar(absAWA), 0, 1),
    luffing: noGo || trimEfficiency < 0.25 || aws < 0.25,
    trueWind: { x: wx, z: wz }, rudderAngle, heelTarget, yawTarget,
    drive, resistance, ax: fx * (drive - resistance) + rx * lateral,
    az: fz * (drive - resistance) + rz * lateral,
    u, v, fx, fz, rx, rz,
  };
}

// Float load is normalized immersion of the round floats, independently sampled.
// It is a simple buoyancy/contact approximation, not a submerged-volume solver.
export function floatLoads(b, water = {}) {
  const roll = finite(b.roll), centre = finite(b.y, J.draft) - J.draft;
  const rise = Math.sin(roll) * J.floatOffset;
  const depth = (surface, y) => clamp((finite(surface) - y + J.floatRadius) / (2 * J.floatRadius), 0, 1.5);
  return {
    portLoad: depth(water.port, centre + J.floatCentreY + rise),
    starboardLoad: depth(water.starboard, centre + J.floatCentreY - rise),
  };
}

// Advance one numeric boat state; all environmental input is supplied by caller.
// `water` contains heights at bow, centre, stern and the two floats (metres).
export function advanceSailing(b, input = {}, options = {}, dt = 1 / 120, water = {}) {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) throw new RangeError('sailing dt must be finite and in (0, 0.1]');
  if (!b.sailing) b.sailing = makeSailingState(options);
  const S = b.sailing, wind = options.wind || S.trueWind || SAILING_TUNE.defaultWind;
  const loads = floatLoads(b, water), f = sailingForces(b, input, wind, loads);
  b.vx = finite(b.vx) + f.ax * dt; b.vz = finite(b.vz) + f.az * dt;
  b.r = finite(b.r) + (f.yawTarget - finite(b.r)) * (1 - Math.exp(-dt / 0.48));
  b.h = wrap(finite(b.h) + b.r * dt);
  b.x = finite(b.x) + b.vx * dt; b.z = finite(b.z) + b.vz * dt;
  const fx = -Math.sin(b.h), fz = Math.cos(b.h), rx = -Math.cos(b.h), rz = -Math.sin(b.h);
  b.u = b.vx * fx + b.vz * fz; b.v = b.vx * rx + b.vz * rz;
  const support = (finite(water.bow) + 2 * finite(water.centre) + finite(water.stern)) / 4 + J.draft;
  b.y = finite(b.y, support); b.vy = finite(b.vy);
  b.vy += (38 * (support - b.y) - 11 * b.vy) * dt; b.y += b.vy * dt;
  const pitchTarget = Math.atan2(finite(water.bow) - finite(water.stern), J.hullLength * 0.9);
  b.pitch = finite(b.pitch); b.pr = finite(b.pr);
  b.pr += (16 * (pitchTarget - b.pitch) - 6 * b.pr) * dt; b.pitch += b.pr * dt;
  b.roll = finite(b.roll); b.rr = finite(b.rr);
  b.rr += (6 * (f.heelTarget - b.roll) + 2.5 * (loads.portLoad - loads.starboardLoad) - 3.4 * b.rr) * dt;
  b.roll = clamp(b.roll + b.rr * dt, -0.55, 0.55);
  b.air = false; b.airT = 0; b.rampAir = false; b.onRamp = null;
  b.boostE = 0; b.boostLv = 0; b.boosting = false; b.drafting = false;
  const postLoad = floatLoads(b, water);
  Object.assign(S, {
    sheet: f.sheet, autoTrim: f.autoTrim, rigBalance: f.rigBalance, crewBalance: f.crewBalance,
    trueWind: f.trueWind, awa: f.awa, aws: f.aws, sailAngle: f.sailAngle,
    fill: f.fill, trimEfficiency: f.trimEfficiency, heelTarget: f.heelTarget,
    heel: b.roll, ...postLoad, rudderAngle: f.rudderAngle, noGo: f.noGo,
    luffing: f.luffing, speedThroughWater: Math.hypot(b.vx, b.vz),
    leeway: Math.atan2(b.v, Math.max(0.01, Math.abs(b.u))),
    drive: f.drive, resistance: f.resistance,
  });
  return S;
}
