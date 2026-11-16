// jukung.mjs: a Balinese double-outrigger sailing canoe made wholly in code (no model file), after how the real boat is built
// (research/A6-voyage-craft, A6-08 to A6-11: a narrow hull with winged stem pieces, upward curving booms, downward curving
// pieces to bamboo floats, a mast with a two-boom triangular sail) and how it sails (A5-21). It is not a copy of any one boat:
// the sail carries a plain sun, the bow the eyes that such boats carry by custom (A5-22), a small tray of flowers lies on the
// foredeck (A5-19). A small monkey made of a few round shapes sits on the bow as lookout; his arm points where the game says.
// makeJukung() gives the same kind of template as boats.mjs loadYacht(): bow toward +z, the waterline at y = 0, +x is port.
// Since 0.9.0 its look follows the owner's six pictures of 2026-11-16 14:14 (the project's research/A7-target-pictures,
// A7-05 to A7-09): cream hull, teal band with gold lines, a low notched bow, a tall stern board, arched booms with lashings,
// pointed bamboo floats, a large sail on a yard and a boom, a rudder and a tiller. The sail carries the client's artwork.
// Written 2026-11-16 by the yacht project session (plan step B0, PLAN-MONKEYKING.md).
import * as THREE from 'three';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const COL = { cream: 0xefe6d2, creamLow: 0xd8cfbb, teal: 0x1c5d68, joint: 0xc4b488, rope: 0xb98a3a, white: 0xf4efe4, red: 0xb3262b, blue: 0x1f6f8f, wood: 0x8a5a33, dark: 0x3a2a1c, bamboo: 0xdcc98a, gold: 0xe2a93b, black: 0x15120f, engine: 0x2b3138,
  leaf: 0x3f7f3a, petalA: 0xf6e7c8, petalB: 0xf2b430, petalC: 0xd9486e, fur: 0x6b4a2e, face: 0xd9b48c };

// ---- one mesh out of many small parts: each part keeps its own colour in a vertex colour ----
export class Parts {
  constructor() { this.pos = []; this.nor = []; this.col = []; this._c = new THREE.Color(); }
  // geo: any geometry (it is used up); colour: a hex number, or a function (triangle index, mean of the triangle's corners) -> hex
  add(geo, colour, matrix = null) {
    if (matrix) geo.applyMatrix4(matrix);
    const g = geo.index ? geo.toNonIndexed() : geo; if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i += 3) {
      const hex = typeof colour === 'function' ? colour(i / 3, (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3) : colour;
      this._c.setHex(hex);
      for (let k = i; k < i + 3; k++) { this.pos.push(p.getX(k), p.getY(k), p.getZ(k)); this.nor.push(n.getX(k), n.getY(k), n.getZ(k)); this.col.push(this._c.r, this._c.g, this._c.b); }
    }
    if (g !== geo) g.dispose(); geo.dispose();
    return this;
  }
  get triangles() { return this.pos.length / 9; }
  mesh(material, name) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    const m = new THREE.Mesh(g, material); m.name = name; return m;
  }
}
export const at = (x, y, z, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
// a round bar from a to b
export function bar(a, b, r, seg = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), g = new THREE.CylinderGeometry(r, r, A.distanceTo(B), seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1))); return g;
}

// ---- the hull: stations along its length, each a U-shaped section; t = -1 (stern) to 1 (bow) ----
export const HULL = { length: 8, beam: 0.96, floatX: 2.75, floatLen: 6.8, booms: [1.6, -1.7], mast: 1.3, seatZ: -2.35, bowZ: 2.55 };
const halfW = (t) => Math.max(0.015, (HULL.beam / 2) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 2.2)), 0.8));
const yGun = (t) => 0.44 + 0.2 * Math.pow(Math.max(0, t), 3) + 0.26 * Math.pow(Math.max(0, -t), 3);
const yKeel = (t) => -0.28 * (1 - Math.pow(Math.abs(t), 3)) + 0.25 * Math.pow(Math.abs(t), 6);
function hullGeometry(NS = 25, NU = 13) {
  const pos = [], idx = [], L = HULL.length;
  for (let i = 0; i < NS; i++) {
    const t = -1 + (2 * i) / (NS - 1), hw = halfW(t), yg = yGun(t), yk = yKeel(t);
    for (let k = 0; k < NU; k++) { const u = -1 + (2 * k) / (NU - 1); pos.push(hw * u, yk + (yg - yk) * Math.pow(Math.abs(u), 2.4), (t * L) / 2); }
  }
  for (let i = 0; i < NS - 1; i++) for (let k = 0; k < NU - 1; k++) { const a = i * NU + k, b = a + 1, c = a + NU, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// a flat carved board in the boat's middle plane: pts = [[z, y], ...] (its side view), thick = its width across the boat
function board(pts, thick) {
  const sh = new THREE.Shape(); pts.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y))); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false }); g.rotateY(-Math.PI / 2); g.translate(thick / 2, 0, 0); return g;
}
// The sail's cloth with its artwork: the face in the sun, in a ring (assets/textures/sail-emblem.webp: cut from a picture the
// owner supplied, assets/SOURCES.md; his words of 2026-11-16 18:24: "The sail is artwork"). The artwork is a drawing on white
// and is laid over the cloth by multiplying. Until it has arrived, and if it never does, the sail shows a plain sun in a ring.
// Where it sits: round the middle of the cloth's triangle; the picture is as wide and as high as the cloth, so a circle on
// the sail is an ellipse here (SAIL_ART: its middle and half axes as shares of the picture).
const SAIL_ART = { u: 0.311, v: 0.387, rx: 0.223, ry: 0.262 };
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
const SAIL = { tack: [0, 1.3, 2.25], peak: [0, 5.9, -2.3], clew: [0, 1.85, -3.15] };
function sailGeometry(n = 8, belly = 0.38) {
  const pos = [], uv = [], idx = [], T = SAIL.tack, P = SAIL.peak, C = SAIL.clew, row = [];
  for (let i = 0; i <= n; i++) { row.push(pos.length / 3); for (let j = 0; j <= n - i; j++) {
    const a = i / n, b = j / n, c = 1 - a - b, y = T[1] * c + P[1] * a + C[1] * b, z = T[2] * c + P[2] * a + C[2] * b;
    pos.push(belly * 27 * a * b * c + 0.0, y, z); uv.push((z - C[2]) / (T[2] - C[2]), (y - T[1]) / (P[1] - T[1]));
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

// The template: { template, triangles, ms, length, beam, height } as loadYacht gives it. height is 1: a seat's y is in metres.
// trim: the colour of the booms, the stern board and the ribbons (another boat of the fleet has another)
export function makeJukung({ lookout = true, trim = COL.red } = {}) {
  const t0 = performance.now(), M = materials(), L = HULL.length, body = new Parts(), group = new THREE.Group(); group.name = 'jukung';
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z), tube = (pts, r, seg = 40, rad = 5) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4), seg, r, rad, false);
  // the hull: a teal band along the top, cream below it, a shade darker under the water
  const NU = 13;
  body.add(hullGeometry(25, NU), (tri) => { const k = Math.floor(tri / 2) % (NU - 1), e = Math.min(k, NU - 2 - k); return e === 0 ? COL.teal : e <= 3 ? COL.cream : COL.creamLow; });
  // thin gold lines along the gunwale and under the band, on both sides
  for (const s of [-1, 1]) for (const u of [1, 1 - 2 / (NU - 1)]) { const pts = []; for (let i = 0; i <= 24; i++) { const t = -0.965 + (1.93 * i) / 24, yk = yKeel(t); pts.push(V3(s * (halfW(t) * u + 0.012), yk + (yGun(t) - yk) * Math.pow(u, 2.4) + (u === 1 ? 0.012 : 0), (t * L) / 2)); } body.add(tube(pts, 0.016, 48, 4), COL.gold); }
  // the floor inside, and four thwarts (the helm's seat is the last)
  body.add(new THREE.BoxGeometry(0.5, 0.03, L * 0.72), COL.wood, at(0, 0.1, -0.1));
  for (const z of [HULL.seatZ, -1.15, 0.2, 1.9]) { const w = 2 * halfW((2 * z) / L) * 0.94; body.add(new THREE.BoxGeometry(w, 0.045, 0.2), COL.wood, at(0, 0.37, z)); }
  // the bow: low and blunt, with a stepped notch; the stern: a tall board in the boat's own colour, its edge in gold
  body.add(board([[3.5, 0.5], [3.96, 0.5], [4.14, 0.74], [4.14, 1.08], [3.94, 1.08], [3.94, 0.94], [3.56, 0.94]], 0.11), COL.cream);
  body.add(new THREE.BoxGeometry(0.13, 0.03, 0.22), COL.gold, at(0, 1.095, 4.04));
  body.add(board([[-3.4, 0.5], [-3.95, 0.52], [-4.22, 1.15], [-4.42, 2.45], [-4.2, 2.1], [-3.98, 1.3], [-3.58, 0.92]], 0.1), trim);
  body.add(tube([V3(0, 0.52, -3.97), V3(0, 1.15, -4.24), V3(0, 1.9, -4.37), V3(0, 2.47, -4.44)], 0.03, 16, 5), COL.gold);
  body.add(new THREE.SphereGeometry(0.11, 10, 8), COL.gold, at(0, 1.45, -4.07, 0.7, 1, 1));
  // the eyes near the bow, one a side: almond-shaped, dark-rimmed
  for (const s of [-1, 1]) { const x = s * 0.205; body.add(new THREE.SphereGeometry(0.17, 12, 8), COL.black, at(x, 0.2, 3.0, 0.16, 0.5, 1)); body.add(new THREE.SphereGeometry(0.145, 12, 8), COL.white, at(x + s * 0.012, 0.2, 3.0, 0.16, 0.42, 1)); body.add(new THREE.SphereGeometry(0.058, 10, 6), 0x5a3a1c, at(x + s * 0.024, 0.2, 3.01, 0.3, 1, 1)); body.add(new THREE.SphereGeometry(0.03, 8, 6), COL.black, at(x + s * 0.034, 0.2, 3.01, 0.3, 1, 1)); }
  // the booms: one arch across the boat at each of two places, high over the water and down to the floats, bound in rope
  for (const z of HULL.booms) {
    const side = (s) => [[s * HULL.floatX, 0.14], [s * (HULL.floatX - 0.04), 0.7], [s * 2.36, 1.32], [s * 1.7, 1.56], [s * 0.95, 1.22], [s * 0.42, 0.66]];
    const line = [...side(-1), [0, 0.6], ...side(1).reverse()].map(([x, y]) => V3(x, y, z));
    body.add(tube(line, 0.062, 52, 6), trim);
    for (const s of [-1, 1]) { body.add(bar([s * HULL.floatX, 0.12, z], [s * (HULL.floatX - 0.02), 0.46, z], 0.08, 7), COL.rope); body.add(bar([s * 0.4, 0.6, z], [s * 0.56, 0.84, z], 0.078, 7), COL.rope); body.add(new THREE.TorusGeometry(0.125, 0.03, 5, 12), COL.rope, at(s * HULL.floatX, 0.1, z)); }
  }
  // the bamboo floats: joints along them, pointed at both ends
  for (const s of [-1, 1]) {
    const x = s * HULL.floatX, h = HULL.floatLen / 2;
    body.add(bar([x, 0.1, -h], [x, 0.1, h], 0.11, 9), COL.bamboo);
    for (const e of [-1, 1]) body.add(new THREE.ConeGeometry(0.11, 0.75, 9), COL.bamboo, at(x, 0.1, e * (h + 0.37), 1, 1, 1, e * Math.PI / 2, 0, 0));
    for (let z = -h + 0.5; z < h; z += 0.95) body.add(new THREE.TorusGeometry(0.113, 0.012, 4, 10), COL.joint, at(x, 0.1, z));
  }
  // the mast: short and stout, bound in rope, a gold top and a small pennant
  body.add(bar([0, 0.3, HULL.mast], [0, 3.3, HULL.mast], 0.075, 8), COL.wood); body.add(new THREE.SphereGeometry(0.1, 10, 8), COL.gold, at(0, 3.38, HULL.mast, 1, 1.3, 1));
  for (const y of [0.7, 0.84, 0.98]) body.add(new THREE.TorusGeometry(0.085, 0.022, 5, 10), COL.rope, at(0, y, HULL.mast, 1, 1, 1, Math.PI / 2, 0, 0));
  body.add(board([[HULL.mast - 0.06, 3.22], [HULL.mast - 0.06, 2.96], [HULL.mast - 0.8, 3.06]], 0.012), trim);
  // the rudder on the quarter and its curved tiller (no engine)
  body.add(new THREE.BoxGeometry(0.05, 1.15, 0.34), COL.teal, at(-0.5, 0.0, -3.1)); body.add(new THREE.BoxGeometry(0.055, 1.15, 0.035), COL.gold, at(-0.5, 0.0, -3.28)); body.add(bar([-0.5, 0.55, -3.1], [-0.5, 0.86, -3.1], 0.035), COL.wood);
  body.add(tube([V3(-0.5, 0.84, -3.1), V3(-0.42, 0.94, -2.9), V3(-0.3, 0.92, -2.62), V3(-0.22, 0.84, -2.42)], 0.03, 12, 5), COL.wood);
  // the tray of flowers on the foredeck
  body.add(new THREE.BoxGeometry(0.2, 0.02, 0.2), COL.leaf, at(0, yGun(0.8) - 0.16, 3.2)); [[-0.04, 0.03, COL.petalA], [0.05, 0.02, COL.petalB], [0, -0.05, COL.petalC]].forEach(([x, z, c]) => body.add(new THREE.SphereGeometry(0.035, 6, 4), c, at(x, yGun(0.8) - 0.135, 3.2 + z)));
  group.add(body.mesh(M.body, 'jk-body'));
  // the sail on its own pivot at the mast, so it can swing and fill: a yard from the bow up to the peak, a boom along the foot
  const pivot = new THREE.Group(); pivot.name = 'jk-sail'; pivot.position.set(-0.1, 0, HULL.mast);
  const sail = new THREE.Mesh(sailGeometry(), M.sail); sail.name = 'jk-cloth'; pivot.add(sail);
  const spars = new Parts(), T = SAIL.tack, P = SAIL.peak, C = SAIL.clew, ext = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  spars.add(bar(ext(T, P, -0.07), ext(T, P, 1.05), 0.042, 7), COL.bamboo); spars.add(bar(ext(T, C, -0.04), ext(T, C, 1.04), 0.042, 7), COL.bamboo);
  spars.add(bar([0, 3.25, 0], ext(T, P, 0.42), 0.014, 4), COL.dark);                                                       // the rope that holds the yard to the mast
  { const rb = new THREE.PlaneGeometry(2.6, 0.3, 12, 1), p = rb.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i) + 1.3; p.setXYZ(i, 0.1 * Math.sin(x * 2.4) * (x / 2.6), P[1] + 0.25 + p.getY(i) * (1 - 0.25 * x / 2.6) + 0.16 * Math.sin(x * 3.1), P[2] - 0.1 - x); } rb.computeVertexNormals(); spars.add(rb, trim); }   // the long ribbon at the peak
  pivot.add(spars.mesh(M.body, 'jk-spars')); group.add(pivot);
  let tris = body.triangles + spars.triangles + 64;
  if (lookout) { const lk = makeLookout(); lk.position.set(0, yGun((2 * HULL.bowZ) / L) - 0.02, HULL.bowZ); group.add(lk); tris += lk.userData.triangles; }
  const template = new THREE.Group(); template.add(group);
  return { template, triangles: Math.round(tris), ms: Math.round(performance.now() - t0), length: L, beam: 2 * HULL.floatX + 0.2, height: 1, made: true };
}

// The lookout: a small monkey of round shapes, sitting, about 0.9 m high. His right arm is a part of its own ('jk-arm').
export function makeLookout(scale = 1.5) {
  const M = materials(), g = new THREE.Group(); g.name = 'jk-lookout'; g.scale.setScalar(scale);
  const b = new Parts(), S = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
  b.add(S(0.17), COL.fur, at(0, 0.2, -0.02, 0.92, 1.12, 0.88));                       // the body
  b.add(S(0.125), COL.fur, at(0, 0.47, 0.01)); b.add(S(0.088), COL.face, at(0, 0.455, 0.07, 1, 0.95, 0.8)); b.add(S(0.045), COL.face, at(0, 0.43, 0.125, 1.1, 0.8, 0.9));   // head, face, muzzle
  for (const s of [-1, 1]) { b.add(S(0.045, 8, 6), COL.face, at(s * 0.125, 0.5, 0, 0.5, 1, 1)); b.add(S(0.018, 6, 4), COL.black, at(s * 0.04, 0.475, 0.135)); b.add(S(0.07, 8, 6), COL.fur, at(s * 0.11, 0.07, 0.1, 0.8, 0.7, 1.5)); }   // ears, eyes, legs
  b.add(bar([-0.15, 0.3, 0.0], [-0.17, 0.1, 0.09], 0.04), COL.fur);                    // the left arm rests on his knee
  b.add(new THREE.TorusGeometry(0.118, 0.022, 5, 14), COL.red, at(0, 0.535, 0.005, 1, 1, 1, Math.PI / 2 - 0.12, 0, 0)); b.add(new THREE.SphereGeometry(0.03, 6, 5), COL.gold, at(0, 0.552, 0.118));   // his headband
  b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0, 0.08, -0.14], [0, 0.22, -0.32], [0.04, 0.42, -0.34], [0.1, 0.5, -0.24], [0.08, 0.44, -0.18]].map((p) => new THREE.Vector3(...p))), 16, 0.026, 5, false), COL.fur);   // the tail
  g.add(b.mesh(M.fur, 'jk-monkey'));
  const arm = new THREE.Group(); arm.name = 'jk-arm'; arm.position.set(0.15, 0.31, 0.02);
  const a = new Parts(); a.add(bar([0, 0, 0], [0, 0, 0.3], 0.04), COL.fur); a.add(S(0.045, 8, 6), COL.face, at(0, 0, 0.32));
  arm.add(a.mesh(M.fur, 'jk-arm-mesh')); arm.rotation.set(1.15, 0, 0, 'YXZ'); g.add(arm);
  g.userData.triangles = b.triangles + a.triangles;
  return g;
}

// One frame of a jukung's own motion. group: the boat's picture (a clone of the template). s: { t (seconds), u and top (speed,
// m/s), turn (-1 to 1, plus = to starboard), look (the bearing of what the lookout points at, radians from the bow, plus = to
// starboard; null: he points at nothing), see (how solid the sail's cloth is, 0 to 1: the chase camera looks through it),
// own (false: the round monkey is not shown, because a figure of view/people.mjs sits in his place) }.
export function tickJukung(group, s) {
  let P = group.userData.jk;
  if (!P) P = group.userData.jk = { sail: group.getObjectByName('jk-sail'), cloth: group.getObjectByName('jk-cloth'), look: group.getObjectByName('jk-lookout'), arm: group.getObjectByName('jk-arm'), y0: null, a: 0, up: 0 };
  const k = clamp(s.u / (s.top || 27), 0, 1.2);
  if (P.sail) { P.sail.rotation.y = 0.42 + clamp(0.3 * s.turn, -0.3, 0.3) + 0.025 * Math.sin(s.t * 2.3) * (0.4 + k); if (P.cloth) { P.cloth.scale.x = 0.45 + 0.7 * Math.min(1, k) + 0.06 * Math.sin(s.t * 5.1); const o = s.see === undefined ? 1 : s.see; if (P.cloth.material.opacity !== o) { P.cloth.material.opacity = o; P.cloth.material.depthWrite = o >= 0.99; } } }
  if (P.look) {
    P.look.visible = s.own !== false;
    if (P.y0 === null) P.y0 = P.look.position.y;
    const has = s.look !== null && s.look !== undefined && Number.isFinite(s.look), want = has ? clamp(-s.look, -2.4, 2.4) : 0;
    P.a += (want - P.a) * 0.12; P.up += ((has ? 1 : 0) - P.up) * 0.1;
    P.look.rotation.y = P.a * 0.55; P.look.position.y = P.y0 + 0.012 * Math.sin(s.t * 3.1) * (1 + 2 * k);
    if (P.arm) P.arm.rotation.set(1.15 - 1.45 * P.up, P.a * 0.45, 0, 'YXZ');
  }
}
