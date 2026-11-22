// bay-view.mjs: the bay of the rescue voyages as the player sees it (sim/voyage.mjs): the dark beach with boats drawn up, palms
// and open pavilions, green slopes and the volcano behind them, the four places as things to steer by, the guests in the
// water and aboard, the lost net with its turtle, ripples that show the current and birds over the net. Everything is made in
// code except the palms (the scenery kit). The land lies toward low z (toward the mountain), the sea toward high z.
// Written 2026-11-16 by the yacht project session (plan steps B0 to B2, PLAN-MONKEYKING.md).
import * as THREE from 'three';
import * as W from '../sim/waves.mjs?v=4881be4d';
import { BAY, RULES, P as ST } from '../sim/voyage.mjs?v=4881be4d';
import { WIND, B as BT } from '../sim/voyage2.mjs?v=4881be4d';
import { NIGHT, CHAIN, Q as WHO } from '../sim/voyage3.mjs?v=4881be4d';
import { Parts, at, bar, COL, makeJukung, HULL } from './jukung.mjs?v=4881be4d';
import { crewClip, tick, SIT_HIP } from './people.mjs?v=4881be4d';

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), E = new THREE.Euler(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const SAND = 0x4b4038, SAND_WET = 0x2f2924, GREEN = 0x33602f, GREEN_FAR = 0x24482a, THATCH = 0x9a7b4a, VEST = 0xff7a1a, SKIN = 0xb9855a, SHELL = 0x5a4a2a, TURTLE = 0x6f8a4a;
// how high the land is, d metres inland from the water's edge, at x along the shore
const landY = (d, x) => (d < 9 ? -0.7 + 0.16 * d : d < 40 ? 0.74 + 0.045 * (d - 9) : 2.1 + 0.115 * (d - 40) * (1 + 0.35 * Math.sin(x * 0.011 + 1.3) + 0.2 * Math.sin(x * 0.031)));

function landGeometry() {
  const xs = [], ds = [0, 4, 9, 20, 40, 80, 150, 260, 420, 640], pos = [], col = [], idx = [], c = new THREE.Color(), a = new THREE.Color(), b = new THREE.Color();
  for (let x = -1100; x <= 1100; x += 55) xs.push(x);
  for (const x of xs) for (const d of ds) {
    pos.push(x, landY(d, x), BAY.shoreZ + 2 - d);
    if (d < 9) c.copy(a.setHex(SAND_WET)).lerp(b.setHex(SAND), d / 9); else if (d < 40) c.copy(a.setHex(SAND)).lerp(b.setHex(GREEN), Math.max(0, (d - 24) / 16)); else c.copy(a.setHex(GREEN)).lerp(b.setHex(GREEN_FAR), Math.min(1, (d - 40) / 300));
    col.push(c.r, c.g, c.b);
  }
  const n = ds.length; for (let i = 0; i < xs.length - 1; i++) for (let k = 0; k < n - 1; k++) { const p = i * n + k, q = p + 1, r = p + n, s = r + 1; idx.push(p, r, q, q, r, s); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function volcanoGeometry(R = 2500, H = 980) {   // a cone with a worn rim and furrowed flanks; the colour darkens toward the top
  const g = new THREE.ConeGeometry(R, H, 56, 9, true), p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = (y + H / 2) / H, ang = Math.atan2(z, x), k = 1 + 0.07 * Math.sin(ang * 9) * (1 - t) + 0.04 * Math.sin(ang * 23 + 1);
    const top = t > 0.93 ? H * (0.93 - t) * 1.5 * (0.6 + 0.4 * Math.sin(ang * 3)) : 0;
    p.setXYZ(i, x * k * (t > 0.93 ? 1.6 : 1), y + top, z * k * (t > 0.93 ? 1.6 : 1));
    const v = 1 - 0.3 * t; col[3 * i] = v; col[3 * i + 1] = v; col[3 * i + 2] = v * (1 + 0.08 * t);
  }
  g.translate(0, H / 2 - 6, 0); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
}
function pavilions(rnd) {   // open pavilions with thatched roofs along the back of the beach
  const out = new Parts();
  for (let k = 0; k < 7; k++) {
    const x = -260 + k * 86 + (rnd() - 0.5) * 30, d = 24 + rnd() * 10, y = landY(d, x), z = BAY.shoreZ + 2 - d, w = 3.2 + rnd() * 1.4;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.add(bar([x + sx * w * 0.42, y - 0.2, z + sz * w * 0.42], [x + sx * w * 0.42, y + 2.3, z + sz * w * 0.42], 0.09, 5), COL.wood);
    out.add(new THREE.BoxGeometry(w, 0.14, w), COL.wood, at(x, y + 0.55, z));
    out.add(new THREE.ConeGeometry(w * 0.86, 1.7, 4), THATCH, at(x, y + 3.1, z, 1, 1, 1, 0, Math.PI / 4, 0));
  }
  return out;
}
function guestGeometry() {   // a guest in a life vest: head, shoulders and vest; the origin is at the waterline when swimming
  const g = new Parts();
  g.add(new THREE.SphereGeometry(0.2, 10, 8), SKIN, at(0, 0.5, 0)); g.add(new THREE.SphereGeometry(0.21, 8, 5, 0, 6.2832, 0, 1.3), 0x2a2a2a, at(0, 0.53, -0.02));   // head and hair
  g.add(new THREE.CylinderGeometry(0.2, 0.27, 0.48, 10), VEST, at(0, 0.08, 0)); g.add(new THREE.SphereGeometry(0.12, 8, 6), SKIN, at(-0.3, 0.12, 0.02)); g.add(new THREE.SphereGeometry(0.12, 8, 6), SKIN, at(0.3, 0.12, 0.02));
  g.add(bar([0.14, 0.52, 0.16], [0.2, 0.86, 0.1], 0.022, 5), 0xffe14a);                                                                                   // the snorkel
  return g;
}
function fisherGeometry(shirt) {   // a fisher at the helm of his boat: seated, a wide straw hat
  const g = new Parts();
  g.add(new THREE.SphereGeometry(0.19, 10, 8), SKIN, at(0, 0.62, 0)); g.add(new THREE.ConeGeometry(0.42, 0.2, 14), 0xd9c27a, at(0, 0.84, 0));
  g.add(new THREE.CylinderGeometry(0.19, 0.25, 0.55, 10), shirt, at(0, 0.24, 0)); g.add(bar([-0.24, 0.42, 0], [-0.3, 0.2, 0.3], 0.06), SKIN); g.add(bar([0.24, 0.42, 0], [0.3, 0.2, 0.3], 0.06), SKIN);
  return g;
}
function gustTexture() {   // wind on the water: dark, with streaks of white, fading at the band's edges
  const c = document.createElement('canvas'); c.width = 256; c.height = 32; const g = c.getContext('2d'), rnd = mulberry(5);
  g.fillStyle = 'rgba(8, 26, 44, 0.55)'; g.fillRect(0, 0, 256, 32);
  for (let k = 0; k < 70; k++) { g.fillStyle = `rgba(235, 245, 255, ${0.25 + rnd() * 0.5})`; g.fillRect(rnd() * 256, 3 + rnd() * 26, 6 + rnd() * 22, 1 + rnd() * 1.4); }
  const im = g.getImageData(0, 0, 256, 32), d = im.data; for (let y = 0; y < 32; y++) { const e = Math.min(1, Math.min(y, 31 - y) / 9); for (let x = 0; x < 256; x++) d[4 * (y * 256 + x) + 3] *= e; }
  g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(34, 1); return t;
}
function turtleGeometry() {
  const g = new Parts();
  g.add(new THREE.SphereGeometry(0.7, 14, 8), (tri, x, y) => (y > 0.1 ? SHELL : TURTLE), at(0, 0, 0, 0.82, 0.3, 1)); g.add(new THREE.SphereGeometry(0.2, 10, 8), TURTLE, at(0, 0.02, 0.82, 0.9, 0.8, 1.15));
  for (const s of [-1, 1]) { g.add(new THREE.SphereGeometry(0.34, 8, 6), TURTLE, at(s * 0.66, -0.04, 0.38, 1.25, 0.16, 0.5, 0, s * 0.5, 0)); g.add(new THREE.SphereGeometry(0.22, 8, 6), TURTLE, at(s * 0.5, -0.04, -0.6, 1, 0.16, 0.5, 0, -s * 0.5, 0)); }
  return g;
}
function netTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d'); g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(210, 240, 225, 0.95)'; g.lineWidth = 1.6;
  for (let k = -128; k < 256; k += 13) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 128, 128); g.stroke(); g.beginPath(); g.moveTo(k + 128, 0); g.lineTo(k, 128); g.stroke(); }
  const im = g.getImageData(0, 0, 128, 128), d = im.data; for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { const r = Math.hypot(x - 64, y - 64) / 64; d[4 * (y * 128 + x) + 3] *= r > 1 ? 0 : r > 0.8 ? (1 - r) * 5 : 1; }
  g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// where a guest sits in the boat: metres from its middle (x across, z along), in the order they come aboard
const SEATS = [[0.17, 1.7], [-0.17, 0.2], [0.17, 0.2], [-0.17, -1.15], [0.17, -1.15], [-0.17, 1.7]];

export class BayView {
  constructor(scene, sea, spray, scenery) {
    this.scene = scene; this.sea = sea; this.spray = spray; this.scenery = scenery; this.voyage = null; this.built = false; this.t = 0;
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
  }
  build() {
    if (this.built) return; this.built = true;
    const G = this.group, rnd = mulberry(77), flat = (m) => { m.frustumCulled = false; return m; };
    const std = this.std = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    G.add(flat(new THREE.Mesh(landGeometry(), std)));
    this.farMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    const vol = this.volcano = flat(new THREE.Mesh(volcanoGeometry(), this.farMat)); vol.position.set(-420, 0, BAY.shoreZ - 3500); vol.renderOrder = 8; G.add(vol);
    G.add(flat(pavilions(rnd).mesh(std, 'bay-pavilions')));
    // palms from the scenery kit, where the sand turns green
    const palms = []; for (let k = 0; k < 64; k++) { const x = -520 + rnd() * 1040, d = 15 + rnd() * 34; palms.push({ x, y: landY(d, x) - 0.3, z: BAY.shoreZ + 2 - d, ry: rnd() * 6.28, s: 0.8 + rnd() * 0.7 }); }
    this.own = [...this.scenery.kitInstances('pk_palm-detailed-bend', palms.filter((_, i) => i % 2 === 0), 8.5, G), ...this.scenery.kitInstances('pk_palm-detailed-straight', palms.filter((_, i) => i % 2 === 1), 9, G)];
    for (const m of this.own) { const i = this.scenery.owned.indexOf(m); if (i >= 0) this.scenery.owned.splice(i, 1); }   // these stay when another course is set
    // boats drawn up on the sand: the same hull, without sail or lookout, one draw call for all
    const hull = makeJukung({ lookout: false }).template.getObjectByName('jk-body'), n = 7;
    const fleet = this.fleet = flat(new THREE.InstancedMesh(hull.geometry, hull.material, n));
    for (let k = 0; k < n; k++) { const x = (k < 3 ? -150 + k * 34 : 80 + (k - 3) * 30) + (rnd() - 0.5) * 8, d = 6 + rnd() * 3; M4.compose(V.set(x, landY(d, x) + 0.28, BAY.shoreZ + 2 - d), Q.setFromEuler(E.set(-0.05, Math.PI + (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.12, 'YXZ')), S1); fleet.setMatrixAt(k, M4); }
    fleet.instanceMatrix.needsUpdate = true; G.add(fleet);
    // the four places: a pennant buoy at each, and what lies under the water there
    const mark = new Parts(), under = [];
    const tint = { garden: 0x38c9b0, turtle: 0xf2b430, temple: 0xd9486e, wreck: 0xc0392b };
    for (const [k, p] of Object.entries(BAY.places)) {
      mark.add(new THREE.SphereGeometry(0.7, 10, 8), 0xf4efe4, at(p.x, 0.1, p.z, 1, 0.7, 1)); mark.add(bar([p.x, 0.2, p.z], [p.x, 4.6, p.z], 0.06, 5), COL.dark);
      const fl = new THREE.BufferGeometry(); fl.setAttribute('position', new THREE.Float32BufferAttribute([p.x, 4.6, p.z, p.x, 3.5, p.z, p.x + 1.9, 4.05, p.z, p.x, 4.6, p.z, p.x + 1.9, 4.05, p.z, p.x, 3.5, p.z], 3)); fl.computeVertexNormals(); mark.add(fl, tint[k]);
    }
    this.marks = flat(mark.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }), 'bay-marks')); G.add(this.marks);
    const patch = (x, z, rx, rz, hex, op, ry = 0) => { const m = flat(new THREE.Mesh(new THREE.CircleGeometry(1, 36), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: op, depthWrite: false }))); m.rotation.set(-Math.PI / 2, 0, ry, 'YXZ'); m.scale.set(rx, rz, 1); m.position.set(x, 0.05, z); m.renderOrder = 2; m.userData.op = op; G.add(m); under.push(m); return m; };
    const pl = BAY.places;
    patch(pl.garden.x, pl.garden.z, pl.garden.r, pl.garden.r * 0.8, 0x4fe0c8, 0.2); for (let k = 0; k < 9; k++) patch(pl.garden.x + (rnd() - 0.5) * 56, pl.garden.z + (rnd() - 0.5) * 44, 3 + rnd() * 4, 2.5 + rnd() * 3, [0xff8a6b, 0xf2c14e, 0xb46be0][k % 3], 0.3);
    patch(pl.wreck.x, pl.wreck.z, 21, 5.2, 0x0a1620, 0.5, 0.5); patch(pl.wreck.x + 3, pl.wreck.z - 1, 6, 3, 0x0a1620, 0.4, 0.5);
    for (let k = 0; k < 7; k++) patch(pl.temple.x + (k % 3 - 1) * 7 + (rnd() - 0.5) * 2, pl.temple.z + (Math.floor(k / 3) - 1) * 8, 1.6, 1.6, 0x101a22, 0.5);
    patch(pl.turtle.x + 14, pl.turtle.z + 4, 30, 9, 0x0c2a3c, 0.28, -0.9);
    this.under = under;
    // the current: ripples that run from the garden toward the corner and on
    this.ripple = flat(new THREE.InstancedMesh(new THREE.PlaneGeometry(5.5, 0.32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }), 18)); this.ripple.renderOrder = 3; G.add(this.ripple);
    // the guests
    this.guests = flat(guestGeometry().mesh(std, 'bay-guest')); const gg = this.guests.geometry; G.remove(this.guests);
    this.guests = flat(new THREE.InstancedMesh(gg, std, 16)); G.add(this.guests);
    // the net and its turtle, and the birds over them
    this.net = flat(new THREE.Mesh(new THREE.CircleGeometry(5.2, 28), new THREE.MeshBasicMaterial({ map: netTexture(), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }))); this.net.rotation.x = -Math.PI / 2; this.net.renderOrder = 3; G.add(this.net);
    this.floats = flat(new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshStandardMaterial({ color: VEST, roughness: 0.5 }), 8)); G.add(this.floats);
    this.turtle = flat(turtleGeometry().mesh(std, 'bay-turtle')); G.add(this.turtle);
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, -0.9, 0.22, -0.15, -0.1, 0, -0.1, 0, 0, 0.25, 0.1, 0, -0.1, 0.9, 0.22, -0.15], 3));
    this.birds = flat(new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ color: 0x1c1c22, side: THREE.DoubleSide }), 7)); G.add(this.birds);
    this.ring = flat(new THREE.Mesh(new THREE.RingGeometry(RULES.net.freeR - 0.5, RULES.net.freeR, 44), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }))); this.ring.rotation.x = -Math.PI / 2; this.ring.renderOrder = 3; G.add(this.ring);
    this.beachRing = flat(new THREE.Mesh(new THREE.PlaneGeometry(BAY.beach.w, 1.2), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }))); this.beachRing.rotation.x = -Math.PI / 2; this.beachRing.position.set(BAY.beach.x, 0.1, BAY.shoreZ + BAY.beach.deep); this.beachRing.renderOrder = 3; G.add(this.beachRing);
    this.turtleAway = 0;
    // the other boats of a voyage (the second: Captain Jack and three of the fleet): each a jukung in its own colour with a fisher at the helm
    const TRIM = [0x1f8a5a, 0x2a62c9, 0xe0a020, 0xd9622b], SHIRT = [0x2f6f5a, 0x35557f, 0x7f6a35, 0x7f4a35];
    this.others = TRIM.map((trim, k) => { const o = makeJukung({ lookout: false, trim }).template; o.visible = false; const f = flat(fisherGeometry(SHIRT[k]).mesh(std, 'bay-fisher')); f.position.set(0, 0.0, HULL.seatZ); o.children[0].add(f); o.traverse((m) => { m.frustumCulled = false; }); G.add(o); return o; });
    this.rope = flat(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 1), new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1 }))); this.rope.visible = false; G.add(this.rope);
    const gt = gustTexture();
    this.gusts = [0, 1, 2, 3, 4, 5].map(() => { const m = flat(new THREE.Mesh(new THREE.PlaneGeometry(1100, WIND.gust.w), new THREE.MeshBasicMaterial({ map: gt, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }))); m.rotation.set(-Math.PI / 2, Math.atan2(WIND.dir.x, WIND.dir.z) + Math.PI / 2, 0, 'YXZ'); m.renderOrder = 3; m.visible = false; G.add(m); return m; });
    // the third voyage: the overdue boat (a bigger hull, its sail down), and lamps: small bright lights that the picture's glow picks up
    const big = makeJukung({ lookout: false, trim: 0x8a8f96 }).template; big.scale.setScalar(1.4); const sl = big.getObjectByName('jk-sail'); if (sl) sl.visible = false; big.visible = false; big.traverse((m) => { m.frustumCulled = false; }); G.add(big); this.overdue = big;
    this.lamps = flat(new THREE.InstancedMesh(new THREE.SphereGeometry(0.34, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 4.6, 1.7), fog: false }), 20)); this.lamps.visible = false; G.add(this.lamps);
    // a canopy over the overdue boat: four posts and a cloth roof
    { const cp = new Parts(); for (const sx of [-1, 1]) for (const z of [-1.9, 1.3]) cp.add(bar([sx * 0.36, 0.4, z], [sx * 0.42, 2.05, z], 0.03, 5), COL.wood); cp.add(new THREE.BoxGeometry(1.05, 0.05, 3.7), 0xe9dcc0, at(0, 2.08, -0.3)); cp.add(new THREE.BoxGeometry(1.09, 0.12, 0.05), 0x2a62c9, at(0, 2.0, 1.55)); cp.add(new THREE.BoxGeometry(1.09, 0.12, 0.05), 0x2a62c9, at(0, 2.0, -2.15)); big.children[0].add(flat(cp.mesh(std, 'bay-canopy'))); }
    // forest on the slopes: round crowns in three greens, one draw call
    { const n = 420, crowns = this.forest = flat(new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, flatShading: true }), n)), c = new THREE.Color(), tones = [0x2f6a33, 0x3d7a3a, 0x25562c, 0x4a8a3e];
      for (let k = 0; k < n; k++) { const x = -1050 + rnd() * 2100, d = 44 + Math.pow(rnd(), 1.6) * 520, r = 5 + rnd() * 7 + d * 0.012; M4.compose(V.set(x, landY(d, x) + r * 0.45, BAY.shoreZ + 2 - d), Q.setFromEuler(E.set(0, rnd() * 6.28, 0)), V.clone().set(r, r * (0.7 + rnd() * 0.35), r)); crowns.setMatrixAt(k, M4); crowns.setColorAt(k, c.setHex(tones[k % 4]).multiplyScalar(0.85 + rnd() * 0.3)); }
      crowns.instanceMatrix.needsUpdate = true; G.add(crowns); }
    // cloud at the volcano's shoulder
    { const n = 9, cl = this.clouds = flat(new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6), new THREE.MeshBasicMaterial({ fog: false, transparent: true, opacity: 0.86 }), n)); for (let k = 0; k < n; k++) { const a = (k / n - 0.5) * 1.5, r = 150 + rnd() * 120; M4.compose(V.set(-420 + Math.sin(a) * 1500, 330 + rnd() * 80, BAY.shoreZ - 3500 + 1750 * Math.cos(a) - 300), Q.identity(), V.clone().set(r * 1.6, r * 0.34, r * 0.8)); cl.setMatrixAt(k, M4); } cl.instanceMatrix.needsUpdate = true; cl.renderOrder = 9; G.add(cl); }
    // the village: warm lights among the palms, lit when the light is low
    { const n = 46, vl = this.village = flat(new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(5.5, 3.4, 1.3), fog: false }), n)); for (let k = 0; k < n; k++) { const x = -600 + rnd() * 1200, d = 14 + rnd() * 90; M4.compose(V.set(x, landY(d, x) + 1.6 + rnd() * 2, BAY.shoreZ + 2 - d), Q.identity(), V.clone().set(1, 1, 1).multiplyScalar(0.6 + rnd() * 0.8)); vl.setMatrixAt(k, M4); } vl.instanceMatrix.needsUpdate = true; vl.visible = false; G.add(vl); }
    // rain: short streaks that fall round the camera, slanted with the wind (shown under the squall)
    { const n = 900, pos = new Float32Array(n * 6), seed = new Float32Array(n * 2), wx = WIND.dir.x * 0.9, wz = WIND.dir.z * 0.9; for (let k = 0; k < n; k++) { const x = (rnd() - 0.5) * 90, y = rnd() * 34, z = (rnd() - 0.5) * 90, sd = rnd(); pos.set([x, y, z, x + wx, y - 1.9, z + wz], 6 * k); seed[2 * k] = seed[2 * k + 1] = sd; }
      const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); rg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      this.rainU = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2(WIND.dir.x, WIND.dir.z) }, uAmt: { value: 0 } };
      this.rain = flat(new THREE.LineSegments(rg, new THREE.ShaderMaterial({ uniforms: this.rainU, transparent: true, depthWrite: false,
        vertexShader: 'attribute float aSeed; uniform float uTime; uniform vec3 uCam; uniform vec2 uWind; void main() { vec3 p = position; float fall = mod(uTime * (24.0 + 9.0 * aSeed) + aSeed * 34.0, 34.0); p.y = mod(position.y - fall + 34.0, 34.0) - 4.0; p.xz += uWind * fall * 0.45; p.xz = mod(p.xz + 45.0, 90.0) - 45.0; p += vec3(uCam.x, 0.0, uCam.z); gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }',
        fragmentShader: 'uniform float uAmt; void main() { gl_FragColor = vec4(0.82, 0.88, 0.95, 0.34 * uAmt); }' }))); this.rain.visible = false; this.rain.renderOrder = 12; G.add(this.rain); }
    this.ground = flat(new THREE.Mesh(new THREE.RingGeometry(WIND.ground.r - 0.8, WIND.ground.r, 56), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }))); this.ground.rotation.x = -Math.PI / 2; this.ground.position.set(WIND.ground.x, 0.08, WIND.ground.z); this.ground.renderOrder = 3; this.ground.visible = false; G.add(this.ground);
  }
  // the volcano stands in the haze: between the sky's two colours, a little darker, warmed by a low sun
  setWorld(w) {
    this.w = w; if (!this.farMat) return;
    this.village.visible = w.ambient < 0.9;                                    // evening and night
    this.clouds.material.color.setRGB(Math.min(1, w.cloudLit[0] * 0.9 + w.horizon[0] * 0.2), Math.min(1, w.cloudLit[1] * 0.9 + w.horizon[1] * 0.2), Math.min(1, w.cloudLit[2] * 0.9 + w.horizon[2] * 0.2)); this.clouds.material.opacity = w.fog > 0.0025 ? 0.2 : w.ambient < 0.6 ? 0.28 : 0.6; const k = Math.min(0.92, Math.max(0, (w.fog - 0.001) / 0.002));   // thick air hides it: it takes the horizon's colour
    const r = (w.horizon[0] * 0.42 + w.zenith[0] * 0.5) * 0.9 + w.sunCol[0] * 0.06, g = (w.horizon[1] * 0.42 + w.zenith[1] * 0.5) * 0.86, b = (w.horizon[2] * 0.42 + w.zenith[2] * 0.55) * 0.92;
    this.farMat.color.setRGB(r + (w.horizon[0] - r) * k, g + (w.horizon[1] - g) * k, b + (w.horizon[2] - b) * k);
  }
  // the voyage to show, or null for none
  setVoyage(v, world = null) {
    this.voyage = v || null; this.group.visible = !!v; if (!v) return;
    this.build(); if (world) this.setWorld(world); this.turtleAway = 0; this.t = 0;
  }
  // Little Captain Jack (a figure of view/people.mjs that the stage made), where = 'boat': at the helm of his own boat, the
  // first of the other boats, in the place of its fisher of round shapes; 'beach': standing by his fire. null: not here.
  setJack(one, where = null) {
    this.jack = one || null; this.jackAt = one ? where : null; if (!this.others) return;
    const boat = this.others[0], f = boat.getObjectByName('bay-fisher'); if (f) f.visible = !(one && where === 'boat');
    if (!one) return;
    if (where === 'boat') { boat.children[0].add(one.hold); one.hold.position.set(0, -0.04 + (one.act.sit ? SIT_HIP - one.hip : 0), -2.1); one.hold.rotation.set(0, 0, 0); }
    else { const x = BAY.beach.x + 33.5; this.group.add(one.hold); one.hold.position.set(x, landY(8, x), BAY.shoreZ - 6); one.hold.rotation.set(0, 0.35, 0); }   // beside the fire, above the wash of the waves, looking out to sea
    one.hold.visible = true;
  }
  seaY(wv, x, z, t) { const f = this.sea.fadeAt(x, z); return f > 0.01 ? W.heightFast(wv, x, z, t, 2) * f : 0; }
  onEvent(e, stage) {
    const v = this.voyage; if (!v) return; const b = v.me;
    if (e.type === 'vBroach') { this.spray.emit(b.x, 0.3, b.z, b.h, 8, 220, 7, 7, 0, 3); stage.cam.shake = Math.max(stage.cam.shake, 1); stage.fx.flash = 0.22; stage.fx.flashCol = [0.6, 0.7, 1]; }
    else if (e.type === 'vLamp') { stage.fx.bloomPulse = Math.max(stage.fx.bloomPulse, 0.8); }
    else if (e.type === 'vBuried') { this.spray.emit(b.x, 0.3, b.z, b.h, 8, 150, 6, 6, 0, 3); stage.cam.shake = Math.max(stage.cam.shake, 0.7); stage.fx.flash = 0.18; stage.fx.flashCol = [1, 0.3, 0.2]; }
    else if (e.type === 'vRode' || e.type === 'vShoved') this.spray.emit(b.x, 0.3, b.z, b.h, 6, 50, 4, 4, 1, 2);
    else if (e.type === 'vSnap' || e.type === 'vDropped') { stage.fx.flash = 0.2; stage.fx.flashCol = [1, 0.25, 0.2]; stage.cam.shake = Math.max(stage.cam.shake, 0.5); }
    else if (e.type === 'vTow' || e.type === 'vJoin') { stage.fx.flash = 0.12; stage.fx.flashCol = [0.7, 1, 0.8]; }
    else if (e.type === 'vAboard') this.spray.emit(b.x, 0.2, b.z, b.h, 3, 26, 3.5, 2.5, 0, 1.5);
    else if (e.type === 'vFreed') { this.turtleAway = 0.001; this.spray.emit(e.x, 0.2, e.z, 0, 4, 60, 5, 4, 0, 2); stage.fx.flash = 0.16; stage.fx.flashCol = [0.6, 1, 0.8]; }
    else if (e.type === 'vNet') this.spray.emit(v.net.x, 0.2, v.net.z, 0, 2, 30, 3, 3, 0, 2);
    else if (e.type === 'vScare' || e.type === 'vReef') { stage.fx.flash = Math.max(stage.fx.flash, 0.14); stage.fx.flashCol = [1, 0.3, 0.2]; }
    else if (e.type === 'vHome') { stage.fx.bloomPulse = 1; }
    else if (e.type === 'aground') stage.cam.shake = Math.max(stage.cam.shake, 0.4);
  }
  // boat: the stage's own pose of the player's boat { x, y, z, h, pitch, roll }
  update(dt, t, camera, boat) {
    const v = this.voyage; if (!v) return; this.t += dt;
    const wv = v.race.waves, T = this.t, N = v.net, mk1 = v.key === 'mk1';
    this.guests.visible = v.people.length > 0; this.ripple.visible = mk1; for (const m of this.under) m.visible = true;
    this.updateBoats(v, wv, t, T, boat);
    if (this.jack) { crewClip(this.jack, this.jackAt === 'boat' && this.jack.act.sit ? 'sit' : 'idle'); tick(this.jack, dt, 2); }
    const wet = !!v.squall; this.rain.visible = wet || this.rainU.uAmt.value > 0.02; this.rainU.uAmt.value += ((wet ? 1 : 0) - this.rainU.uAmt.value) * Math.min(1, dt * 0.8); this.rainU.uTime.value = T; this.rainU.uCam.value.copy(camera.position);
    // guests: in the water they bob and are carried; aboard they sit on the thwarts; home they stand on the sand
    let seat = 0, home = 0;
    let onO = 0, onJ = 0; const O = v.O, Jk = v.key === 'mk3' ? v.jack : null;
    for (let i = 0; i < 16; i++) {
      const p = v.people[i]; if (!p || p.st === ST.lost) { this.guests.setMatrixAt(i, ZERO); continue; }
      if (p.st === WHO.wait && O) { const k = onO++, a = O.h, lx = (k % 2 ? 0.3 : -0.3), lz = -3.4 + 0.85 * k, ch = Math.cos(a), sh = Math.sin(a); M4.compose(V.set(O.x + lx * ch - lz * sh, this.seaY(wv, O.x, O.z, t) + 0.8, O.z + lx * sh + lz * ch), Q.setFromEuler(E.set(0, -a + (k % 2 ? 0.5 : -0.5), 0.06 * Math.sin(T * 2 + k), 'YXZ')), S1); this.guests.setMatrixAt(i, M4); continue; }
      if (p.st === WHO.jack && Jk) { const s = SEATS[onJ++ % SEATS.length], ch = Math.cos(Jk.h), sh = Math.sin(Jk.h); M4.compose(V.set(Jk.x + s[0] * ch - s[1] * sh, this.seaY(wv, Jk.x, Jk.z, t) + 0.62, Jk.z + s[0] * sh + s[1] * ch), Q.setFromEuler(E.set(0, -Jk.h, 0, 'YXZ')), S1); this.guests.setMatrixAt(i, M4); continue; }
      if (p.st === ST.water || p.st === ST.hold) { const y = this.seaY(wv, p.x, p.z, t) - 0.12 + 0.05 * Math.sin(T * 2.2 + i); M4.compose(V.set(p.x, y, p.z), Q.setFromEuler(E.set(0.12 * Math.sin(T * 1.7 + i), Math.atan2(boat.x - p.x, boat.z - p.z), 0, 'YXZ')), S1); }
      else if (p.st === ST.aboard) { const s = SEATS[seat++ % SEATS.length], ch = Math.cos(boat.h), sh = Math.sin(boat.h); M4.compose(V.set(boat.x + s[0] * ch - s[1] * sh, boat.y + 0.62, boat.z + s[0] * sh + s[1] * ch), Q.setFromEuler(E.set(-boat.pitch, -boat.h, boat.roll, 'YXZ')), S1); }
      else { const x = BAY.beach.x - 20 + 3.1 * home++, d = 5; M4.compose(V.set(x, landY(d, x) + 0.55, BAY.shoreZ + 2 - d), Q.setFromEuler(E.set(0, 0, 0)), S1); }
      this.guests.setMatrixAt(i, M4);
    }
    this.guests.instanceMatrix.needsUpdate = true;
    // the net, its floats, the turtle and the birds
    const show = N.on && !N.gone && !N.aboard; this.net.visible = show; this.floats.visible = show; this.ring.visible = show && !N.held; this.birds.visible = N.on && !N.gone && !N.aboard;
    // birds over the fishing ground until the boat is there; a ring round a boat that waits for the line
    const fish = !!v.boats && !v.reached && !v.squall, J = v.jack && v.jack.st === BT.adrift ? v.jack : null;
    if (fish || J) { const cx = fish ? WIND.ground.x : J.x, cz = fish ? WIND.ground.z : J.z; this.birds.visible = fish; if (fish) { for (let k = 0; k < 7; k++) { const a = T * (0.5 + 0.05 * k) + k * 0.9, r = 9 + 2.2 * k; M4.compose(V.set(cx + Math.cos(a) * r, 9 + 1.6 * k + Math.sin(T * 0.8 + k), cz + Math.sin(a) * r), Q.setFromEuler(E.set(0, -a, 0.35 * Math.sin(T * 6 + k), 'YXZ')), V.clone().set(1.5, 1.5, 1.5)); this.birds.setMatrixAt(k, M4); } this.birds.instanceMatrix.needsUpdate = true; }
      if (J) { this.ring.visible = true; this.ring.position.set(cx, this.seaY(wv, cx, cz, t) + 0.08, cz); this.ring.material.opacity = 0.45 + 0.25 * Math.sin(T * 4); } }
    this.ground.visible = fish; if (fish) this.ground.material.opacity = 0.4 + 0.2 * Math.sin(T * 3);
    if (show) {
      const y = this.seaY(wv, N.x, N.z, t) + 0.06; this.net.position.set(N.x, y, N.z); this.net.rotation.z = T * 0.08; this.ring.position.set(N.x, y + 0.02, N.z); this.ring.material.opacity = 0.45 + 0.25 * Math.sin(T * 4);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.2832 + T * 0.08, fx = N.x + Math.cos(a) * 4.8, fz = N.z + Math.sin(a) * 4.8; M4.makeTranslation(fx, this.seaY(wv, fx, fz, t) + 0.1, fz); this.floats.setMatrixAt(k, M4); }
      this.floats.instanceMatrix.needsUpdate = true;
      for (let k = 0; k < 7; k++) { const a = T * (0.5 + 0.05 * k) + k * 0.9, r = 9 + 2.2 * k; M4.compose(V.set(N.x + Math.cos(a) * r, 9 + 1.6 * k + Math.sin(T * 0.8 + k), N.z + Math.sin(a) * r), Q.setFromEuler(E.set(0, -a, 0.35 * Math.sin(T * 6 + k), 'YXZ')), V.clone().set(1.5, 1.5, 1.5)); this.birds.setMatrixAt(k, M4); }
      this.birds.instanceMatrix.needsUpdate = true;
    }
    if (this.turtleAway > 0) this.turtleAway += dt;
    const ta = this.turtleAway; this.turtle.visible = N.on && !N.gone && (!N.freed || ta < 6);
    if (this.turtle.visible) {
      if (!N.freed) this.turtle.position.set(N.x, this.seaY(wv, N.x, N.z, t) + 0.1 + 0.04 * Math.sin(T * 5), N.z), this.turtle.rotation.set(0.1 * Math.sin(T * 4), T * 0.08, 0.12 * Math.sin(T * 7), 'YXZ');
      else { const a = Math.atan2(N.dx, N.dz) + 0.5, d = ta * (1.5 + ta); this.turtle.position.set(N.x + Math.sin(a) * d, this.seaY(wv, N.x, N.z, t) + 0.1 - 0.16 * ta * ta * 0.4, N.z + Math.cos(a) * d); this.turtle.rotation.set(0.25, a, 0.2 * Math.sin(T * 9), 'YXZ'); }
    }
    // the current's ripples
    const D = v.drift || { x: 1, z: 0, v: 0 }, G0 = BAY.places.garden, len = 330;
    if (mk1) for (let k = 0; k < 18; k++) { const s = ((T * D.v * 4 + k * (len / 18)) % len), off = ((k * 37) % 23) - 11, x = G0.x + D.x * s - D.z * off, z = G0.z + D.z * s + D.x * off; M4.compose(V.set(x, this.seaY(wv, x, z, t) + 0.07, z), Q.setFromEuler(E.set(-Math.PI / 2, 0, Math.atan2(D.x, D.z) + Math.PI / 2, 'YXZ')), S1); this.ripple.setMatrixAt(k, M4); }
    this.ripple.instanceMatrix.needsUpdate = true;
    // the beach line shows when there is someone to bring home
    // (a true or false: three.js draws whatever is not exactly false)
    this.beachRing.visible = !!((v.aboard > 0 || (v.line && v.line.length > 0)) && !v.over); this.beachRing.material.opacity = 0.35 + 0.2 * Math.sin(T * 3);
    for (const m of this.under) m.position.y = 0.04;
  }
  // the third voyage: Jack's boat beside the player's, the lamp boats of the chain, the overdue boat, and every light of the night
  updateNight(v, wv, t, T, boat) {
    const J = v.jack, O = v.O, place = (o, x, z, h, k) => { o.visible = true; o.position.set(x, this.seaY(wv, x, z, t) + 0.02, z); o.rotation.set(0.05 * Math.sin(T * 1.3 + k), -h, 0.07 * Math.sin(T * 1.9 + 2 * k), 'YXZ'); };
    this.others.forEach((o, k) => { o.visible = false; if (k === 0 && J) place(o, J.x, J.z, J.h, 0); if (k > 0 && v.lamps[k - 1]) place(o, v.lamps[k - 1].x, v.lamps[k - 1].z, 0.6 + k, k); });
    place(this.overdue, O.x, O.z, O.h, 5); this.rope.visible = false; for (const m of this.gusts) m.visible = false;
    let n = 0; const lamp = (x, y, z, s = 1) => { M4.compose(V.set(x, y, z), Q.identity(), V.clone().set(s, s, s)); this.lamps.setMatrixAt(n++, M4); };
    const dark = v.night ? 1 : 0.55, blink = Math.sin(T * 5.2) > -0.2 ? 1.5 : 0.25;
    lamp(O.x, this.seaY(wv, O.x, O.z, t) + 3.4, O.z, dark * blink);                                           // the one lamp that blinks
    lamp(boat.x - Math.sin(boat.h) * 3.1, boat.y + 1.25, boat.z + Math.cos(boat.h) * 3.1, dark * 0.95);        // the boat's own lantern, at the bow
    if (J) lamp(J.x, this.seaY(wv, J.x, J.z, t) + 4.4, J.z, dark * 0.9);
    for (const q of v.lamps) lamp(q.x, this.seaY(wv, q.x, q.z, t) + 4.4, q.z, dark * (1.25 + 0.2 * Math.sin(T * 3 + q.i)));
    for (let k = 0; k < 6; k++) { const x = BAY.beach.x - 60 + 24 * k; lamp(x, landY(7, x) + 1.5, BAY.shoreZ + 2 - 7, dark * (0.7 + 0.15 * Math.sin(T * 7 + k))); }   // torches along the beach
    if (v.fire) for (let k = 0; k < 3; k++) lamp(BAY.beach.x + 30 + 0.5 * Math.sin(T * 9 + k), landY(5, BAY.beach.x + 30) + 0.9 + 0.5 * k, BAY.shoreZ - 3, dark * (2.2 - 0.5 * k + 0.5 * Math.sin(T * 11 + k)));   // Jack's fire
    for (let k = n; k < 20; k++) this.lamps.setMatrixAt(k, ZERO);
    this.lamps.instanceMatrix.needsUpdate = true; this.lamps.visible = true;
  }
  // the other boats of a voyage, the tow line and the gusts
  updateBoats(v, wv, t, T, boat) {
    this.overdue.visible = false; this.lamps.visible = false;
    if (v.key === 'mk3') return this.updateNight(v, wv, t, T, boat);
    const list = v.boats || [];
    this.others.forEach((o, k) => {
      const q = list[k]; o.visible = !!q; if (!q) return;
      if (q.st === BT.home) { const x = BAY.beach.x + 22 + 9 * k, d = 3; o.position.set(x, landY(d, x) + 0.3, BAY.shoreZ + 2 - d); o.rotation.set(-0.05, Math.PI + 0.2 * (k - 1.5), 0.05, 'YXZ'); return; }
      const y = this.seaY(wv, q.x, q.z, t), lost = q.st === BT.lost || q.st === BT.adrift;
      o.position.set(q.x, y + 0.02, q.z); o.rotation.set(0.05 * Math.sin(T * 1.3 + k), -q.h, (lost ? 0.12 : 0.05) * Math.sin(T * 1.9 + 2 * k), 'YXZ');
    });
    const J = v.jack, tow = !!J && J.st === BT.towed; this.rope.visible = tow;
    if (tow) { const sx = boat.x + Math.sin(boat.h) * 3.9, sz = boat.z - Math.cos(boat.h) * 3.9, bx = J.x - Math.sin(J.h) * 3.6, bz = J.z + Math.cos(J.h) * 3.6, dx = bx - sx, dz = bz - sz, len = Math.hypot(dx, dz) || 0.01;
      this.rope.position.set((sx + bx) / 2, boat.y + 0.55, (sz + bz) / 2); this.rope.rotation.set(0, Math.atan2(dx, dz), 0); this.rope.scale.set(1, 1, len); }
    const gs = v.gusts || [];
    this.gusts.forEach((m, k) => { const q = gs[k]; m.visible = !!q && q.on; if (!m.visible) return; m.position.set(WIND.dir.x * q.s, 0.12, WIND.dir.z * q.s); m.material.opacity = Math.min(0.95, 0.45 + 0.4 * q.k); m.material.map.offset.x = T * 0.05; });
  }
}
