// jukung.mjs: a Balinese double-outrigger sailing canoe made wholly in code (no model file), after how the real boat is built
// (research/A6-voyage-craft, A6-08 to A6-11: a narrow hull with winged stem pieces, upward curving booms, downward curving
// pieces to bamboo floats, a mast with a two-boom triangular sail) and how it sails (A5-21). It is not a copy of any one boat:
// the sail carries a plain sun, the bow the eyes that such boats carry by custom (A5-22), a small tray of flowers lies on the
// foredeck (A5-19). A small monkey made of a few round shapes sits on the bow as lookout; his arm points where the game says.
// makeJukung() gives the same kind of template as boats.mjs loadYacht(): bow toward +z, the waterline at y = 0, +x is port.
// Written 2026-11-16 by the yacht project session (plan step B0, PLAN-MONKEYKING.md).
import * as THREE from 'three';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const COL = { white: 0xf4efe4, red: 0xc0392b, blue: 0x1f6f8f, wood: 0x8a5a33, dark: 0x3a2a1c, bamboo: 0xdcc98a, gold: 0xe2a93b, black: 0x15120f, engine: 0x2b3138,
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
export const HULL = { length: 8, beam: 0.96, floatX: 2.75, floatLen: 6.6, booms: [1.25, -1.45], mast: 0.9, seatZ: -2.35, bowZ: 2.55 };
const halfW = (t) => Math.max(0.015, (HULL.beam / 2) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 2.2)), 0.8));
const yGun = (t) => 0.42 + 0.5 * Math.pow(Math.max(0, t), 3) + 0.38 * Math.pow(Math.max(0, -t), 3);
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
function sunTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#efe3c6'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(120, 96, 60, 0.28)'; g.lineWidth = 2; for (let x = 20; x < 256; x += 34) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x - 40, 256); g.stroke(); }   // the cloth's seams
  const cx = 256 * 0.435, cy = 256 * (1 - 0.40);
  g.fillStyle = '#d99a2b'; for (let k = 0; k < 16; k++) { const a = (k / 16) * 6.2832, r0 = 30, r1 = k % 2 ? 46 : 56, w = 0.13; g.beginPath(); g.moveTo(cx + Math.cos(a - w) * r0, cy + Math.sin(a - w) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a + w) * r0, cy + Math.sin(a + w) * r0); g.closePath(); g.fill(); }
  g.beginPath(); g.arc(cx, cy, 30, 0, 6.2832); g.fill(); g.fillStyle = '#f0c35a'; g.beginPath(); g.arc(cx, cy, 22, 0, 6.2832); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// the sail: a triangle in the boat's middle plane with a belly toward +x; corners in the mast's own frame
const SAIL = { tack: [0, 1.4, 1.9], peak: [0, 5.0, -1.3], clew: [0, 2.1, -2.7] };
function sailGeometry(n = 8, belly = 0.38) {
  const pos = [], uv = [], idx = [], T = SAIL.tack, P = SAIL.peak, C = SAIL.clew, row = [];
  for (let i = 0; i <= n; i++) { row.push(pos.length / 3); for (let j = 0; j <= n - i; j++) {
    const a = i / n, b = j / n, c = 1 - a - b, y = T[1] * c + P[1] * a + C[1] * b, z = T[2] * c + P[2] * a + C[2] * b;
    pos.push(belly * 27 * a * b * c + 0.0, y, z); uv.push((z + 2.7) / 4.6, (y - 1.4) / 3.6);
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
// trim: the colour of the gunwale stripe, the stem pieces and the booms (another boat of the fleet has another)
export function makeJukung({ lookout = true, trim = COL.red } = {}) {
  const t0 = performance.now(), M = materials(), L = HULL.length, body = new Parts(), group = new THREE.Group(); group.name = 'jukung';
  // the hull: red along the gunwale, white below it, sea blue under the water
  const NU = 13;
  body.add(hullGeometry(25, NU), (tri) => { const k = Math.floor(tri / 2) % (NU - 1), e = Math.min(k, NU - 2 - k); return e === 0 ? trim : e <= 2 ? COL.white : COL.blue; });
  // the floor inside, and four thwarts (the helm's seat is the last)
  body.add(new THREE.BoxGeometry(0.5, 0.03, L * 0.72), COL.wood, at(0, 0.1, -0.1));
  for (const z of [HULL.seatZ, -1.15, 0.2, 1.7]) { const w = 2 * halfW((2 * z) / L) * 0.94; body.add(new THREE.BoxGeometry(w, 0.045, 0.2), COL.wood, at(0, 0.37, z)); }
  // the two winged stem pieces: flat carved boards that sweep up to a point
  body.add(board([[3.45, 0.5], [3.95, 0.62], [4.45, 1.05], [4.95, 1.95], [4.55, 1.5], [4.05, 1.12], [3.5, 0.95]], 0.07), (tri, x, y) => (y > 1.45 ? COL.gold : trim));
  body.add(board([[-3.5, 0.5], [-3.95, 0.6], [-4.35, 0.95], [-4.6, 1.6], [-4.3, 1.25], [-3.95, 0.98], [-3.5, 0.85]], 0.07), (tri, x, y) => (y > 1.25 ? COL.gold : trim));
  // the eyes on the bow, one a side
  for (const s of [-1, 1]) { const x = s * (halfW(0.72) + 0.012); body.add(new THREE.SphereGeometry(0.115, 12, 8), COL.white, at(x, 0.52, 2.88, 0.22, 0.8, 1)); body.add(new THREE.SphereGeometry(0.052, 10, 6), COL.black, at(x + s * 0.016, 0.52, 2.9, 0.3, 1, 1)); }
  // the booms: one curved bar across the boat at each of two places, up from the gunwales and down to the floats
  for (const z of HULL.booms) {
    const pts = [-1, 1].map((s) => [[s * HULL.floatX, 0.16], [s * (HULL.floatX - 0.06), 0.6], [s * 2.3, 1.2], [s * 1.65, 1.38], [s * 0.9, 1.0], [s * 0.4, 0.62]]);
    const line = [...pts[0], [0, 0.55], ...pts[1].reverse()].map(([x, y]) => new THREE.Vector3(x, y, z));
    body.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(line, false, 'catmullrom', 0.4), 44, 0.055, 6, false), (tri, x) => (Math.abs(x) > 2.2 ? COL.wood : trim));
  }
  // the bamboo floats, with a ring at each joint
  for (const s of [-1, 1]) {
    body.add(bar([s * HULL.floatX, 0.1, -HULL.floatLen / 2 - 0.1], [s * HULL.floatX, 0.1, HULL.floatLen / 2 - 0.3], 0.105, 8), COL.bamboo);
    body.add(bar([s * HULL.floatX, 0.1, HULL.floatLen / 2 - 0.3], [s * HULL.floatX, 0.24, HULL.floatLen / 2 + 0.25], 0.085, 8), COL.bamboo);
    for (const z of HULL.booms) body.add(new THREE.TorusGeometry(0.115, 0.022, 5, 10), COL.dark, at(s * HULL.floatX, 0.1, z));
  }
  // the mast with its stay, a pennant at the top
  body.add(bar([0, 0.3, HULL.mast], [0, 4.45, HULL.mast - 0.12], 0.05), COL.wood);
  body.add(board([[HULL.mast - 0.15, 4.42], [HULL.mast - 0.15, 4.2], [HULL.mast - 1.0, 4.28]], 0.012), trim);
  // the engine on the stern and the helm's tiller
  body.add(new THREE.BoxGeometry(0.26, 0.42, 0.3), COL.engine, at(0, 0.62, -3.62)); body.add(bar([0, 0.5, -3.72], [0, -0.35, -3.9], 0.035), COL.engine); body.add(bar([0, 0.72, -3.5], [0.12, 0.78, -2.85], 0.022), COL.dark);
  // the tray of flowers on the foredeck
  body.add(new THREE.BoxGeometry(0.2, 0.02, 0.2), COL.leaf, at(0, yGun(0.8) - 0.16, 3.2)); [[-0.04, 0.03, COL.petalA], [0.05, 0.02, COL.petalB], [0, -0.05, COL.petalC]].forEach(([x, z, c]) => body.add(new THREE.SphereGeometry(0.035, 6, 4), c, at(x, yGun(0.8) - 0.135, 3.2 + z)));
  group.add(body.mesh(M.body, 'jk-body'));
  // the sail on its own pivot at the mast, so it can swing and fill
  const pivot = new THREE.Group(); pivot.name = 'jk-sail'; pivot.position.set(-0.08, 0, HULL.mast);
  const sail = new THREE.Mesh(sailGeometry(), M.sail); sail.name = 'jk-cloth'; pivot.add(sail);
  const spars = new Parts(); spars.add(bar(SAIL.tack, SAIL.peak, 0.035), COL.wood); spars.add(bar(SAIL.tack, SAIL.clew, 0.035), COL.wood); spars.add(bar([0, 4.35, -0.1], [0, 3.4, -0.02], 0.012, 4), COL.dark);
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
// starboard; null: he points at nothing) }.
export function tickJukung(group, s) {
  let P = group.userData.jk;
  if (!P) P = group.userData.jk = { sail: group.getObjectByName('jk-sail'), cloth: group.getObjectByName('jk-cloth'), look: group.getObjectByName('jk-lookout'), arm: group.getObjectByName('jk-arm'), y0: null, a: 0, up: 0 };
  const k = clamp(s.u / (s.top || 27), 0, 1.2);
  if (P.sail) { P.sail.rotation.y = 0.42 + clamp(0.3 * s.turn, -0.3, 0.3) + 0.025 * Math.sin(s.t * 2.3) * (0.4 + k); if (P.cloth) P.cloth.scale.x = 0.45 + 0.7 * Math.min(1, k) + 0.06 * Math.sin(s.t * 5.1); }
  if (P.look) {
    if (P.y0 === null) P.y0 = P.look.position.y;
    const has = s.look !== null && s.look !== undefined && Number.isFinite(s.look), want = has ? clamp(-s.look, -2.4, 2.4) : 0;
    P.a += (want - P.a) * 0.12; P.up += ((has ? 1 : 0) - P.up) * 0.1;
    P.look.rotation.y = P.a * 0.55; P.look.position.y = P.y0 + 0.012 * Math.sin(s.t * 3.1) * (1 + 2 * k);
    if (P.arm) P.arm.rotation.set(1.15 - 1.45 * P.up, P.a * 0.45, 0, 'YXZ');
  }
}
