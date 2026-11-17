// Optional racing jukung, separate from the existing eight-metre tour boat.
// Shared dimensions are a designer baseline in sim/jukung-spec.mjs, not measurements of Jack's own boat.
// Construction references: Southern Woodenboat Sailing's Padangbai build;
// Horridge 2008 Fig.14 (short mast / two-spar rig); doi:10.1080/10572414.2025.2580936.
// The owner's approved ivory/teal/red/gold palette and existing sail emblem are reused.
// Bow +z, waterline y=0, +x port. Actual Captain Jack is seated by Stage; no engine or duplicate lookout.
import * as THREE from 'three';
import { JUKUNG_SPEC, JUKUNG_SPAN } from '../sim/jukung-spec.mjs?v=be984f14';
import { Parts, at, bar, COL as TOUR_COL, makeLookout } from './jukung.mjs?v=be984f14';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const COL = { ...TOUR_COL, white: TOUR_COL.cream, blue: TOUR_COL.teal };

// ---- the hull: stations along its length, each a U-shaped section; t = -1 (stern) to 1 (bow) ----
// Racing aliases: all plan dimensions come from the same simulation spec; tour geometry is independent.
export const HULL = Object.freeze({ length: JUKUNG_SPEC.hullLength, beam: JUKUNG_SPEC.hullBeam,
  floatX: JUKUNG_SPEC.floatOffset, floatLen: JUKUNG_SPEC.floatLength, booms: JUKUNG_SPEC.boomZ,
  mast: JUKUNG_SPEC.mastZ, seatZ: JUKUNG_SPEC.seatZ, bowZ: JUKUNG_SPEC.bowZ });
const halfW = (t) => Math.max(0.008, (HULL.beam / 2) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 2.4)), 0.65));
const yGun = (t) => JUKUNG_SPEC.hullDepth - JUKUNG_SPEC.draft + 0.08 * Math.pow(Math.abs(t), 3);
const yKeel = (t) => -JUKUNG_SPEC.draft * (1 - Math.pow(Math.abs(t), 3)) + 0.27 * Math.pow(Math.abs(t), 6);
function hullGeometry(NS = 29, NU = 15, inside = false) {
  const pos = [], idx = [], L = HULL.length;
  for (let i = 0; i < NS; i++) {
    const t = -1 + (2 * i) / (NS - 1), hw = Math.max(0.004, halfW(t) - (inside ? 0.026 : 0)), yg = yGun(t), yk = yKeel(t) + (inside ? 0.035 : 0);
    for (let k = 0; k < NU; k++) { const u = -1 + (2 * k) / (NU - 1); pos.push(hw * u, yk + (yg - yk) * Math.pow(Math.abs(u), 2.4), (t * L) / 2); }
  }
  for (let i = 0; i < NS - 1; i++) for (let k = 0; k < NU - 1; k++) { const a = i * NU + k, b = a + 1, c = a + NU, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function hullStripe(drop, height) {
  const pos = [], idx = [], N = 29;
  for (const side of [-1, 1]) {
    const start = pos.length / 3;
    for (let i = 0; i < N; i++) {
      const t = -1 + 2 * i / (N - 1), yg = yGun(t), yk = yKeel(t);
      for (const d of [drop, drop + height]) {
        const y = yg - d, x = halfW(t) * Math.pow(clamp((y - yk) / (yg - yk), 0, 1), 1 / 2.4);
        pos.push(side * (x + 0.003), y, t * HULL.length / 2);
      }
    }
    for (let i = 0; i < N - 1; i++) { const a = start + 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// A cut aft end, faired rising forward end and flattened underside; no rounded capsule endcaps.
function floatGeometry() {
  const L = JUKUNG_SPEC.floatLength, R = JUKUNG_SPEC.floatRadius, Y = JUKUNG_SPEC.floatCentreY;
  const rings = [[-L / 2, 0.88, 0], [-L / 2 + 0.18, 1, 0], [0, 1, 0], [L / 2 - 0.65, 0.97, 0.006], [L / 2 - 0.22, 0.54, 0.035], [L / 2, 0.06, 0.08]];
  const pos = [], idx = [], n = 8;
  for (const [z, radius, rise] of rings) for (let k = 0; k < n; k++) {
    const a = 2 * Math.PI * k / n, c = Math.cos(a), vertical = c < 0 ? Math.max(-0.7, c) / 0.7 : c;
    pos.push(R * radius * Math.sin(a), Y + rise + R * radius * vertical, z);
  }
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < n; k++) { const a = i * n + k, b = i * n + (k + 1) % n; idx.push(a, b, a + n, b, b + n, a + n); }
  for (const i of [0, rings.length - 1]) {
    const middle = pos.length / 3; pos.push(0, Y + rings[i][2], rings[i][0]);
    for (let k = 0; k < n; k++) idx.push(middle, i * n + k, i * n + (k + 1) % n);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function curvedBar(points, radius, steps = 12) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.3), steps, radius, 6, false);
}
function wraps(parts, centre, axis, radius, colour = COL.dark, n = 3) {
  const p = new THREE.Vector3(...centre), a = new THREE.Vector3(...axis).normalize();
  for (let k = 0; k < n; k++) {
    const c = p.clone().addScaledVector(a, (k - (n - 1) / 2) * 0.018);
    parts.add(bar(c.clone().addScaledVector(a, -0.006).toArray(), c.clone().addScaledVector(a, 0.006).toArray(), radius, 8), colour);
  }
}
// a flat carved board in the boat's middle plane: pts = [[z, y], ...] (its side view), thick = its width across the boat
function board(pts, thick) {
  const sh = new THREE.Shape(); pts.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y))); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false }); g.rotateY(-Math.PI / 2); g.translate(thick / 2, 0, 0); return g;
}
// The approved emblem is multiplied over cloth. These UV axes compensate for the racing triangle's
// 5.3 m width and 4.94 m height so its ring stays circular in the sail plane and fits within all three edges.
const SAIL_ART = { u: 0.621, v: 0.358, rx: 0.236, ry: 0.253 };
function sunTexture() {
  const N = 512, c = document.createElement('canvas'); c.width = N; c.height = N; const g = c.getContext('2d');
  const cx = N * SAIL_ART.u, cy = N * (1 - SAIL_ART.v), rx = N * SAIL_ART.rx, ry = N * SAIL_ART.ry;
  const cloth = () => { g.globalCompositeOperation = 'source-over'; g.fillStyle = '#efe3c6'; g.fillRect(0, 0, N, N); g.strokeStyle = 'rgba(120, 96, 60, 0.28)'; g.lineWidth = 3; for (let x = 40; x < N; x += 68) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x - 80, N); g.stroke(); } };   // the cloth and its seams
  cloth();
  g.save(); g.translate(cx, cy); g.scale(rx / 100, ry / 100);                  // the plain sun, drawn in a circle of 100
  g.fillStyle = '#d99a2b'; for (let k = 0; k < 16; k++) { const a = (k / 16) * 6.2832, r0 = 40, r1 = k % 2 ? 60 : 74, w = 0.13; g.beginPath(); g.moveTo(Math.cos(a - w) * r0, Math.sin(a - w) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.lineTo(Math.cos(a + w) * r0, Math.sin(a + w) * r0); g.closePath(); g.fill(); }
  g.beginPath(); g.arc(0, 0, 40, 0, 6.2832); g.fill(); g.fillStyle = '#f0c35a'; g.beginPath(); g.arc(0, 0, 30, 0, 6.2832); g.fill();
  g.strokeStyle = '#c98a1f'; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 94, 0, 6.2832); g.stroke(); g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const img = new Image(); img.onload = () => { cloth(); g.globalCompositeOperation = 'multiply'; g.drawImage(img, cx - rx, cy - ry, 2 * rx, 2 * ry); g.globalCompositeOperation = 'source-over'; t.needsUpdate = true; t.userData.art = true; };
  img.src = new URL('../../assets/textures/sail-emblem.webp', import.meta.url).href;
  return t;
}
// the sail: a triangle in the boat's middle plane with a belly toward +x; corners in the mast's own frame
// The upper yard is steep beside the short forward mast (Horridge Fig.14); it is not the mast itself.
// Endpoint positions are an art/rig baseline, not measured rigging instructions. Values are local to the mast pivot.
export const SAIL = Object.freeze({ tack: [0, 0.56, 0.5], peak: [0, 5.5, -0.65], clew: [0, 1.1, -4.8] });
function sailGeometry(n = 10, belly = 0.26) {
  const pos = [], uv = [], idx = [], T = SAIL.tack, P = SAIL.peak, C = SAIL.clew, row = [];
  for (let i = 0; i <= n; i++) { row.push(pos.length / 3); for (let j = 0; j <= n - i; j++) {
    const a = i / n, b = j / n, c = 1 - a - b, y = T[1] * c + P[1] * a + C[1] * b, z = T[2] * c + P[2] * a + C[2] * b;
    pos.push(belly * 27 * a * b * c, y, z); uv.push((z - C[2]) / (T[2] - C[2]), (y - T[1]) / (P[1] - T[1]));
  } }
  for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) { const a = row[i] + j, b = a + 1, c = row[i + 1] + j; idx.push(a, b, c); if (j < n - i - 1) idx.push(b, c + 1, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

let shared = null;   // the materials and the sail's picture, made once
function materials() {
  if (shared) return shared;
  shared = { body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.02, side: THREE.DoubleSide }),
    sail: new THREE.MeshStandardMaterial({ map: sunTexture(), roughness: 0.92, metalness: 0, side: THREE.DoubleSide }),
    fur: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }) };
  return shared;
}

// The template contract matches loadYacht. height stays 1 so fleet seat y is in metres.
export function makeRacingJukung({ lookout = false, trim = COL.red } = {}) {
  const t0 = performance.now(), M = materials(), L = HULL.length, body = new Parts(), group = new THREE.Group(); group.name = 'jukung-racer';
  const metadata = { ...JUKUNG_SPEC, overallBeam: JUKUNG_SPAN, designerBaseline: true, practiceOnly: true };
  group.userData.jukung = metadata;
  // Two skins and a narrow gunwale leave a visibly open U section, never a decked dinghy or square transom.
  body.add(hullGeometry(), COL.white); body.add(hullGeometry(29, 15, true), COL.wood);
  body.add(hullStripe(0.02, 0.075), COL.blue); body.add(hullStripe(0.099, 0.012), COL.gold);
  for (const side of [-1, 1]) {
    const points = Array.from({ length: 25 }, (_, i) => { const t = -1 + i / 12; return [side * (halfW(t) - 0.012), yGun(t), t * L / 2]; });
    body.add(curvedBar(points, 0.017, 30), COL.blue);
  }
  body.add(new THREE.BoxGeometry(0.22, 0.025, L * 0.56), COL.wood, at(0, 0.01, 0));
  for (const z of [HULL.seatZ, -0.6, 0.65, HULL.bowZ]) {
    const w = Math.max(0.08, 2 * halfW(2 * z / L) - 0.05);
    body.add(new THREE.BoxGeometry(w, 0.04, 0.18), COL.wood, at(0, 0.38, z));
  }
  // The high finial is aft (-z). The lower, forward (+z) end carries the eyes.
  body.add(board([[-2.76, 0.44], [-3.25, 0.51], [-3.25, 1.64], [-3.13, 1.41], [-3.12, 1.05], [-2.94, 0.70], [-2.76, 0.62]], 0.055), (tri, x, y) => y > 1.42 ? COL.gold : trim);
  body.add(board([[2.73, 0.43], [3.25, 0.51], [3.25, 0.91], [3.08, 0.75], [2.73, 0.63]], 0.055), COL.white);
  for (const side of [-1, 1]) {
    const z = 2.56, t = 2 * z / L, y = 0.31, x = side * (halfW(t) * Math.pow((y - yKeel(t)) / (yGun(t) - yKeel(t)), 1 / 2.4) + 0.009);
    body.add(new THREE.SphereGeometry(0.09, 10, 6), COL.dark, at(x, y, z, 0.12, 0.63, 1.3));
    body.add(new THREE.SphereGeometry(0.072, 10, 6), COL.white, at(x + side * 0.008, y, z, 0.12, 0.62, 1.3));
    body.add(new THREE.SphereGeometry(0.039, 8, 6), COL.black, at(x + side * 0.018, y, z + 0.012, 0.18, 1, 1));
  }
  // Curved upper arms meet separate downward connectors. Pegs and lashing collars make the joints readable.
  for (const z of HULL.booms) {
    body.add(bar([-0.30, 0.46, z], [0.30, 0.46, z], 0.037), trim);
    for (const side of [-1, 1]) {
      const upper = [[side * 0.23, 0.46, z], [side * 0.64, 0.72, z], [side * 1.03, 0.80, z], [side * 1.28, 0.64, z]];
      const lower = [[side * 1.24, 0.68, z], [side * 1.44, 0.46, z], [side * 1.60, 0.23, z], [side * HULL.floatX, JUKUNG_SPEC.floatCentreY + 0.09, z]];
      body.add(curvedBar(upper, 0.037), trim); body.add(curvedBar(lower, 0.033, 9), trim);
      wraps(body, [side * 0.28, 0.49, z], [side, 0.6, 0], 0.047, COL.dark, 4);
      wraps(body, [side * 1.26, 0.66, z], [side, -1, 0], 0.047, COL.dark, 4);
      body.add(bar([side * 1.27, 0.66, z - 0.055], [side * 1.27, 0.66, z + 0.055], 0.025, 8), COL.gold);
      wraps(body, [side * HULL.floatX, JUKUNG_SPEC.floatCentreY, z], [0, 0, 1], JUKUNG_SPEC.floatRadius + 0.011, COL.dark, 4);
    }
  }
  for (const side of [-1, 1]) {
    body.add(floatGeometry(), COL.bamboo, at(side * HULL.floatX, 0, 0));
    for (let z = -2.75; z < 2.5; z += 0.72) body.add(new THREE.TorusGeometry(JUKUNG_SPEC.floatRadius, 0.005, 4, 8), COL.gold, at(side * HULL.floatX, JUKUNG_SPEC.floatCentreY, z));
  }
  // A short stepped mast, with a small pennant at its actual head, supports the much longer upper yard.
  body.add(bar([0, -0.02, HULL.mast], [0, JUKUNG_SPEC.mastHeight, HULL.mast], 0.041, 8), COL.wood);
  body.add(new THREE.BoxGeometry(0.16, 0.10, 0.16), COL.dark, at(0, 0.02, HULL.mast));
  // A transverse mast partner, as in the Padangbai construction photo. Four pieces leave a real opening around the pole.
  const partnerHalf = halfW(2 * HULL.mast / L) - 0.012, holeHalf = 0.055;
  for (const side of [-1, 1]) {
    body.add(new THREE.BoxGeometry(partnerHalf - holeHalf, 0.075, 0.23), COL.wood, at(side * (partnerHalf + holeHalf) / 2, 0.40, HULL.mast));
    body.add(new THREE.BoxGeometry(2 * holeHalf, 0.075, 0.06), COL.wood, at(0, 0.40, HULL.mast + side * 0.085));
  }
  wraps(body, [0, 0.46, HULL.mast], [0, 1, 0], 0.05, COL.gold, 4);
  body.add(board([[HULL.mast, JUKUNG_SPEC.mastHeight], [HULL.mast, JUKUNG_SPEC.mastHeight - 0.20], [HULL.mast - 0.48, JUKUNG_SPEC.mastHeight - 0.09]], 0.01), trim, at(0.06, 0, 0));
  // The removable pancer is on the port quarter, not a centreline transom outboard.
  body.add(bar([0.09, 0.41, -2.32], [0.43, 0.48, -2.32], 0.028), COL.wood);
  wraps(body, [0.38, 0.48, -2.32], [0, 1, 0], 0.045, COL.gold, 4);
  group.add(body.mesh(M.body, 'jk-body'));

  const rudder = new THREE.Group(); rudder.name = 'jk-rudder'; rudder.position.set(0.38, 0.38, -2.32);
  const blade = new Parts();
  blade.add(bar([0, 0.38, 0], [0, -0.89, -0.07], 0.025), COL.wood);
  blade.add(board([[0.03, -0.18], [-0.16, -0.28], [-0.39, -0.82], [-0.34, -1.00], [0.03, -0.97], [0.12, -0.54]], 0.035), (tri, x, y) => y < -0.45 ? COL.blue : COL.wood);
  blade.add(bar([0, 0.28, 0], [0, 0.32, 1.05], 0.023), COL.wood);
  wraps(blade, [0, 0.32, 0.91], [0, 0, 1], 0.026, COL.dark, 4);
  rudder.add(blade.mesh(M.body, 'jk-pancer')); group.add(rudder);

  const pivot = new THREE.Group(); pivot.name = 'jk-sail'; pivot.position.set(-0.055, 0, HULL.mast); pivot.rotation.y = 0.20;
  const sail = new THREE.Mesh(sailGeometry(), M.sail); sail.name = 'jk-cloth'; pivot.add(sail);
  const spars = new Parts();
  spars.add(bar(SAIL.tack, SAIL.peak, 0.031), COL.bamboo); spars.add(bar(SAIL.tack, SAIL.clew, 0.029), COL.bamboo);
  const yard = new THREE.Vector3(...SAIL.tack).lerp(new THREE.Vector3(...SAIL.peak), 0.20);
  spars.add(bar([0.055, JUKUNG_SPEC.mastHeight, 0], yard.toArray(), 0.008, 4), COL.dark);
  wraps(spars, SAIL.tack, [0, 1, -0.2], 0.039, COL.dark, 4);
  for (let k = 1; k < 7; k++) {
    const p = new THREE.Vector3(...SAIL.tack).lerp(new THREE.Vector3(...SAIL.peak), k / 8);
    wraps(spars, p.toArray(), [0, 1, -0.23], 0.036, COL.gold, 1);
  }
  pivot.add(spars.mesh(M.body, 'jk-spars')); group.add(pivot);
  // Sheet and tutup terminate on the moving spars. Their hull ends stay fixed while the rig trims.
  for (const [name, moving, fixed] of [
    ['jk-sheet', SAIL.clew, [0.08, 0.40, -1.64]],
    ['jk-tutup', new THREE.Vector3(...SAIL.tack).lerp(new THREE.Vector3(...SAIL.peak), 0.56).toArray(), [0.10, 0.41, -0.60]],
  ]) {
    const rope = new Parts().add(new THREE.CylinderGeometry(0.006, 0.006, 1, 4), COL.dark).mesh(M.body, name);
    rope.userData.rigLine = { moving, fixed }; poseRigLine(rope, pivot); group.add(rope);
  }
  if (lookout) { const lk = makeLookout(); lk.position.set(0, 0.40, HULL.bowZ); group.add(lk); }
  const template = new THREE.Group(); template.add(group); template.userData.jukung = metadata;
  let triangles = 0; template.traverse((m) => { if (m.isMesh) triangles += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
  return { template, triangles: Math.round(triangles), ms: Math.round(performance.now() - t0), length: L, beam: JUKUNG_SPAN, height: 1, made: true };
}

const lineA = new THREE.Vector3(), lineB = new THREE.Vector3(), lineD = new THREE.Vector3(), upY = new THREE.Vector3(0, 1, 0);
function poseRigLine(line, pivot) {
  lineA.fromArray(line.userData.rigLine.moving).applyEuler(pivot.rotation).add(pivot.position);
  lineB.fromArray(line.userData.rigLine.fixed); lineD.subVectors(lineA, lineB);
  line.position.copy(lineA).add(lineB).multiplyScalar(0.5); line.scale.y = lineD.length();
  line.quaternion.setFromUnitVectors(upY, lineD.normalize());
}

// Existing arcade fields remain supported. sailing is the simulation's telemetry, never inferred from boat speed:
// { sailAngle (rad, +port), fill (0..1), awa (rad, wind from +starboard), rudderAngle (rad, +starboard turn) }.
// Stage already applies simulation pitch/heel to the complete boat; do not apply them a second time here.
export function tickRacingJukung(group, s) {
  let P = group.userData.jk;
  if (!P) P = group.userData.jk = { sail: group.getObjectByName('jk-sail'), cloth: group.getObjectByName('jk-cloth'), rudder: group.getObjectByName('jk-rudder'),
    lines: ['jk-sheet', 'jk-tutup'].map((name) => group.getObjectByName(name)).filter(Boolean), look: group.getObjectByName('jk-lookout'), arm: group.getObjectByName('jk-arm'), y0: null, a: 0, up: 0 };
  const k = clamp((s.u || 0) / (s.top || 27), 0, 1.2), time = s.t || 0, turn = clamp(s.turn || 0, -1, 1), sailing = s.sailing;
  if (P.sail) {
    if (sailing) {
      // sailAngle describes the aft clew moving +port; its negative-z lever arm needs negative local yaw.
      P.sail.rotation.y = Number.isFinite(sailing.sailAngle) ? -sailing.sailAngle : 0;
      const fill = clamp(Number.isFinite(sailing.fill) ? sailing.fill : 0, 0, 1), side = (sailing.awa || 0) >= 0 ? 1 : -1;
      if (P.cloth) P.cloth.scale.x = side * (0.05 + 0.95 * fill) + Math.sin(time * 9.1) * 0.055 * (1 - fill);
    } else {
      P.sail.rotation.y = 0.28 + 0.22 * turn + 0.02 * Math.sin(time * 2.3);
      if (P.cloth) P.cloth.scale.x = 0.45 + 0.55 * Math.min(1, k) + 0.035 * Math.sin(time * 5.1);
    }
    for (const line of P.lines) poseRigLine(line, P.sail);
  }
  // Positive local yaw moves the forward tiller to port and the trailing blade to starboard.
  if (P.rudder) P.rudder.rotation.y = sailing && Number.isFinite(sailing.rudderAngle) ? sailing.rudderAngle : 0.30 * turn;
  if (P.cloth) {
    const opacity = clamp(Number.isFinite(s.see) ? s.see : 1, 0, 1);
    P.cloth.material.opacity = opacity; P.cloth.material.depthWrite = opacity >= 0.99;
  }
  if (P.look) {
    P.look.visible = s.own !== false;
    if (P.y0 === null) P.y0 = P.look.position.y;
    const has = s.look !== null && s.look !== undefined && Number.isFinite(s.look), want = has ? clamp(-s.look, -2.4, 2.4) : 0;
    P.a += (want - P.a) * 0.12; P.up += ((has ? 1 : 0) - P.up) * 0.1;
    P.look.rotation.y = P.a * 0.55; P.look.position.y = P.y0 + 0.012 * Math.sin(time * 3.1) * (1 + 2 * k);
    if (P.arm) P.arm.rotation.set(1.15 - 1.45 * P.up, P.a * 0.45, 0, 'YXZ');
  }
}
