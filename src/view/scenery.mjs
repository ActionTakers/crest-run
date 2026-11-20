// scenery.mjs: the course as the player sees it: gate buoys with a beacon on the next gate, edge markers, ramps, the start gantry,
// and the world around it: islands with palms and rocks, a lighthouse, anchored ships, sails, far hills. Buoys, ramps and gantry are
// made in code; palms, rocks, towers and ships come from assets/models/kit.glb (Kenney kits, CC0; see assets/SOURCES.md).
// Everything that repeats is instanced, so the scenery costs a handful of draw calls. Written 2026-11-13, yacht project session.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as W from '../sim/waves.mjs?v=b016c49c';
import { pointInto } from '../sim/courses.mjs?v=b016c49c';

function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const COL = { gate: new THREE.Color(0xff8a1f), slalom: new THREE.Color(0xffc21a), corner: new THREE.Color(0xff8a1f), ok: new THREE.Color(0x35d07a), miss: new THREE.Color(0xe8343c), edge: new THREE.Color(0xf4f4f4) };
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1), E = new THREE.Euler();

function buoyGeometry() {   // a float with a mast: a lathe profile (radius, height)
  const pts = [[0, -0.5], [0.85, -0.5], [1.0, -0.05], [0.95, 0.4], [0.5, 0.62], [0.36, 2.5], [0.2, 2.85], [0.2, 3.3]].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, 12);
}
function chevronTexture() {   // the ramp's deck: chevrons that point up the slope
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#1d2b3a'; g.fillRect(0, 0, 128, 256);
  for (let k = 0; k < 6; k++) { const y = 236 - k * 42; g.fillStyle = k % 2 ? '#ffffff' : '#ff9a1f'; g.beginPath(); g.moveTo(8, y); g.lineTo(64, y - 30); g.lineTo(120, y); g.lineTo(120, y - 16); g.lineTo(64, y - 46); g.lineTo(8, y - 16); g.closePath(); g.fill(); }
  g.fillStyle = '#ff9a1f'; g.fillRect(0, 0, 6, 256); g.fillRect(122, 0, 6, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function checkerTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 16; const g = c.getContext('2d');
  for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#101418' : '#f4f4f4'; g.fillRect(i * 4, j * 4, 4, 4); }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function islandGeometry(rnd, radius, height) {   // a low mound with a rough rim: sand at the water, rock and green higher up
  const g = new THREE.CylinderGeometry(radius * 0.25, radius, height, 14, 3, false), p = g.attributes.position, col = new Float32Array(p.count * 3);
  const sand = new THREE.Color(0xe8cf9a), rock = new THREE.Color(0x8a7f72), green = new THREE.Color(0x5f8f4e), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + 0.22 * Math.sin(a * 3 + radius) + 0.12 * Math.sin(a * 7 + height) + (rnd() - 0.5) * 0.1;
    const t = (y + height / 2) / height;
    p.setXYZ(i, x * k, y + (t > 0.6 ? (rnd() - 0.3) * height * 0.25 : 0), z * k);
    c.copy(sand).lerp(t > 0.7 ? green : rock, Math.min(1, Math.max(0, (t - 0.18) * 1.9))); col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b;
  }
  g.translate(0, height / 2 - 0.6, 0); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
}

export class Scenery {
  constructor(scene, sea) {
    this.scene = scene; this.sea = sea; this.kit = new Map(); this.course = null; this.group = new THREE.Group(); scene.add(this.group);
    this.gateState = []; this.buoys = null; this.lamps = null; this.edges = null; this.ramps = []; this.sails = []; this.next = -1;
    this.buoyGeo = buoyGeometry(); this.lampGeo = new THREE.SphereGeometry(0.42, 10, 8);
    this.buoyMat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 });
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: true });
    // the beacon on the next gate: a slender shaft of light that fades out toward its top
    this.beamMat = new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Vector3(1.0, 0.82, 0.35) }, uAmt: { value: 0.5 } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying float vH; void main() { vH = position.y / 18.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uCol; uniform float uAmt; varying float vH; void main() { float a = pow(1.0 - clamp(vH, 0.0, 1.0), 1.6) * uAmt; gl_FragColor = vec4(uCol * 2.2 * a, a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}' });
    this._o = [0, 0, 0];
    // made once and shared by every course (review r3, T-05); what a course makes for itself is listed in this.owned and freed
    // when another course is set
    this.beamGeo = new THREE.CylinderGeometry(0.1, 0.34, 18, 8, 1, true); this.beamGeo.translate(0, 9, 0);
    this.edgeGeo = new THREE.SphereGeometry(0.8, 8, 6); this.edgeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    this.rampTex = chevronTexture(); this.rampSideMat = new THREE.MeshStandardMaterial({ color: 0x22303f, roughness: 0.6, metalness: 0.2 });
    this.deckMat = new THREE.MeshStandardMaterial({ map: this.rampTex, roughness: 0.5, emissive: 0xffffff, emissiveMap: this.rampTex, emissiveIntensity: 0.55, side: THREE.DoubleSide });
    this.poleGeo = new THREE.CylinderGeometry(0.5, 0.7, 12, 10); this.poleMat = new THREE.MeshStandardMaterial({ color: 0xe9edf2, roughness: 0.35, metalness: 0.4 });
    this.bannerMat = new THREE.MeshBasicMaterial({ map: checkerTexture(), side: THREE.DoubleSide });
    this.islandMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
    this.hillMat = new THREE.MeshBasicMaterial({ fog: false, side: THREE.DoubleSide });
    this.owned = []; this.builds = 0;
  }
  // the kit: one glb with a root object per model; keep each model's meshes with their matrix relative to the model's root
  async load(url) {
    try {
      const gltf = await new GLTFLoader().loadAsync(url);
      gltf.scene.updateMatrixWorld(true);
      for (const root of gltf.scene.children) {
        const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), parts = [], box = new THREE.Box3();
        root.traverse((o) => {
          if (!o.isMesh) return;
          // The kit's palette materials come out of the converter as "blend" (their palette picture has an alpha channel), which
          // three.js draws without depth, twice, with a program lookup every frame. Nothing in the kit is see-through: make them solid.
          for (const mt of Array.isArray(o.material) ? o.material : [o.material]) { mt.transparent = false; mt.depthWrite = true; mt.forceSinglePass = true; mt.alphaTest = 0; }
          const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld); parts.push({ geometry: o.geometry, material: o.material, matrix: m }); box.union(new THREE.Box3().setFromBufferAttribute(o.geometry.attributes.position).applyMatrix4(m));
        });
        if (parts.length) this.kit.set(root.name, { parts, box, size: box.getSize(new THREE.Vector3()) });
      }
    } catch (e) { console.warn('scenery kit not loaded: ' + (e && e.message)); }
    return this.kit.size;
  }
  // instances of a kit model: list of { x, y, z, ry, s } (s = scale so that the model's largest side is `size` metres)
  kitInstances(name, list, size, parent = this.group) {
    const K = this.kit.get(name); if (!K || !list.length) return [];
    const k0 = size / Math.max(K.size.x, K.size.y, K.size.z), out = [];
    for (const part of K.parts) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
      list.forEach((p, i) => { const s = k0 * (p.s || 1); M4.compose(V.set(p.x, p.y || 0, p.z), Q.setFromEuler(E.set(0, p.ry || 0, 0)), ONE.clone().multiplyScalar(s)); M4.multiply(part.matrix); im.setMatrixAt(i, M4); });
      im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; parent.add(im); out.push(im); this.owned.push(im);
    }
    return out;
  }
  setWorld(w, sunDir) {
    this.hillMat.color.setRGB(w.horizon[0] * 0.62 + w.zenith[0] * 0.3, w.horizon[1] * 0.62 + w.zenith[1] * 0.3, w.horizon[2] * 0.62 + w.zenith[2] * 0.3);
    this.world = w;
  }
  setCourse(c) {
    if (c === this.course && this.buoys) { this.resetGates(); return; }   // the same course again (a retry, back from a race): keep what is built
    this.course = c; this.builds++;
    const arena = this.arena = !!(c.def && c.def.arena);   // the rescue level: a ring around an island, no gates, no gantry; the inside is the level's own
    for (const x of this.owned) x.dispose();                              // the last course's own geometry and instance buffers
    this.owned.length = 0;
    this.group.clear(); this.ramps = []; this.sails = [];
    const o = this._o, rnd = mulberry(0x51ab + c.N), own = (x) => { this.owned.push(x); return x; };
    // ---- gate buoys (two per gate) with a lamp each, and a beacon pair for the next gate ----
    const n = c.gates.length * 2;
    this.buoys = own(new THREE.InstancedMesh(this.buoyGeo, this.buoyMat, n)); this.lamps = own(new THREE.InstancedMesh(this.lampGeo, this.lampMat, n));
    this.buoyXZ = new Float32Array(n * 2);
    c.gates.forEach((g, i) => { [g.lo, g.hi].forEach((lat, k) => { pointInto(c, g.s, lat, o); this.buoyXZ[4 * i + 2 * k] = o[0]; this.buoyXZ[4 * i + 2 * k + 1] = o[1]; }); });
    this.buoys.frustumCulled = false; this.lamps.frustumCulled = false; this.buoys.visible = this.lamps.visible = !arena; this.group.add(this.buoys, this.lamps);
    this.gateState = c.gates.map(() => 0); this.paintGates();
    this.beams = [new THREE.Mesh(this.beamGeo, this.beamMat), new THREE.Mesh(this.beamGeo, this.beamMat)];
    for (const b of this.beams) { b.frustumCulled = false; b.renderOrder = 4; this.group.add(b); }
    // ---- edge markers every 40 m on both sides ----
    const ex = [];
    for (let s = 0; s < c.len; s += 40) for (const lat of arena ? [-c.halfWidth] : [-c.halfWidth, c.halfWidth]) { pointInto(c, s, lat, o); ex.push(o[0], o[1]); }
    this.edgeXZ = Float32Array.from(ex);
    this.edges = own(new THREE.InstancedMesh(this.edgeGeo, this.edgeMat, ex.length / 2));
    this.edges.frustumCulled = false; this.group.add(this.edges);
    for (let i = 0; i < ex.length / 2; i++) this.edges.setColorAt(i, i % 4 < 2 ? COL.edge : COL.miss);
    // ---- ramps: a wedge with chevrons, floating ----
    for (const r of c.ramps) {
      const sh = new THREE.Shape(); sh.moveTo(0, -0.5); sh.lineTo(r.len, -0.5); sh.lineTo(r.len, r.height); sh.lineTo(0, 0.02); sh.closePath();
      const side = own(new THREE.ExtrudeGeometry(sh, { depth: 2 * r.halfW, bevelEnabled: false })); side.translate(0, 0, -r.halfW); side.rotateY(-Math.PI / 2);   // length along +z
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(side, this.rampSideMat));
      // the deck: one quad from the low edge (z = 0) to the high edge (z = len), the texture's top at the high edge
      const deck = own(new THREE.BufferGeometry());
      deck.setAttribute('position', new THREE.Float32BufferAttribute([-r.halfW, 0.05, 0, r.halfW, 0.05, 0, r.halfW, r.height + 0.03, r.len, -r.halfW, r.height + 0.03, r.len], 3));
      deck.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); deck.setIndex([0, 2, 1, 0, 3, 2]); deck.computeVertexNormals();
      grp.add(new THREE.Mesh(deck, this.deckMat));
      pointInto(c, r.s, r.lat, o); grp.position.set(o[0], 0, o[1]); grp.rotation.y = -o[2];
      this.group.add(grp); this.ramps.push({ grp, x: o[0], z: o[1] });
    }
    // ---- the start and finish gantry ----
    const gan = new THREE.Group(), gw = Math.min(c.halfWidth - 6, 22); gan.visible = !arena;
    for (const lat of [-gw, gw]) { pointInto(c, 0, lat, o); const p = new THREE.Mesh(this.poleGeo, this.poleMat); p.position.set(o[0], 5.5, o[1]); gan.add(p); }
    pointInto(c, 0, 0, o);
    const ban = new THREE.Mesh(own(new THREE.PlaneGeometry(2 * gw, 2.4)), this.bannerMat);
    ban.position.set(o[0], 10.3, o[1]); ban.rotation.y = -o[2]; gan.add(ban);
    this.group.add(gan);
    // ---- the world around the course: islands outside the lane, never closer than the lane's edge plus a margin ----
    const clear = (x, z, margin) => { for (let i = 0; i < c.N; i += 6) if ((c.X[i] - x) ** 2 + (c.Z[i] - z) ** 2 < (c.halfWidth + margin) ** 2) return false; return true; };
    const want = { islands: 11, liner: 1, cargo: 1, tug: 1, sails: 5, towers: 1, ...((c.def && c.def.scenery) || {}) };
    const isl = [], palms = [], rocks = [];
    for (let tries = 0; tries < 500 && isl.length < want.islands; tries++) {
      const s = rnd() * c.len, sg = rnd() < 0.5 ? -1 : 1, lat = (arena ? -1 : sg) * (c.halfWidth + 30 + rnd() * 120), rad = 12 + rnd() * 24;
      pointInto(c, s, lat, o); const x = o[0], z = o[1];
      if (!clear(x, z, rad + 14) || isl.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < (q.rad + rad + 20) ** 2)) continue;
      const h = 3 + rnd() * 5; isl.push({ x, z, rad, h });
      const m = new THREE.Mesh(own(islandGeometry(rnd, rad, h)), this.islandMat);
      m.position.set(x, 0, z); m.rotation.y = rnd() * 6.28; this.group.add(m);
      const np = 2 + Math.floor(rnd() * 5);
      for (let k = 0; k < np; k++) { const a = rnd() * 6.28, d = rad * (0.15 + 0.4 * rnd()); palms.push({ x: x + Math.cos(a) * d, y: h * 0.55, z: z + Math.sin(a) * d, ry: rnd() * 6.28, s: 0.75 + rnd() * 0.6 }); }
      for (let k = 0; k < 3; k++) { const a = rnd() * 6.28, d = rad * (0.8 + 0.3 * rnd()); rocks.push({ x: x + Math.cos(a) * d, y: -0.3, z: z + Math.sin(a) * d, ry: rnd() * 6.28, s: 0.6 + rnd() * 0.9 }); }
    }
    this.kitInstances('pk_palm-detailed-bend', palms.filter((_, i) => i % 2 === 0), 8);
    this.kitInstances('pk_palm-detailed-straight', palms.filter((_, i) => i % 2 === 1), 8.5);
    this.kitInstances('pk_rocks-a', rocks.filter((_, i) => i % 3 === 0), 5);
    this.kitInstances('pk_rocks-b', rocks.filter((_, i) => i % 3 === 1), 5);
    this.kitInstances('nk_rock_largeA', rocks.filter((_, i) => i % 3 === 2), 4.5);
    // towers (lighthouses) on the largest islands
    const byRad = [...isl].sort((a, b) => b.rad - a.rad).slice(0, want.towers);
    this.kitInstances('pk_tower-complete-large', byRad.map((q) => ({ x: q.x, y: q.h * 0.75, z: q.z, ry: 0 })), 15);
    // anchored ships and sails, far enough from the lane to be landmarks, never in it
    const far = (minD, maxD) => { for (let k = 0; k < 80; k++) { const s = rnd() * c.len, sg = rnd() < 0.5 ? -1 : 1, lat = (arena ? -1 : sg) * (c.halfWidth + minD + rnd() * (maxD - minD)); pointInto(c, s, lat, o); if (clear(o[0], o[1], minD * 0.8) && !isl.some((q) => (q.x - o[0]) ** 2 + (q.z - o[1]) ** 2 < (q.rad + 30) ** 2)) return { x: o[0], z: o[1], ry: rnd() * 6.28 }; } return null; };
    const many = (n, minD, maxD, y) => { const out = []; for (let k = 0; k < n; k++) { const p = far(minD, maxD); if (p) out.push({ ...p, y }); } return out; };
    this.kitInstances('wc_ship-ocean-liner', many(want.liner, 220, 420, -1.5), 170);
    this.kitInstances('wc_ship-cargo-a', many(want.cargo, 110, 300, -1), 90);
    this.kitInstances('wc_boat-tug-a', many(want.tug, 70, 160, -0.4), 16);
    const sl = many(want.sails, 60, 220, -0.2);
    this.sails = [...this.kitInstances('wc_boat-sail-a', sl.filter((_, i) => i % 2 === 0), 11), ...this.kitInstances('wc_boat-sail-b', sl.filter((_, i) => i % 2 === 1), 11)];
    // far hills: a ring of low silhouettes in the haze
    let cx = 0, cz = 0; for (let i = 0; i < c.N; i += 10) { cx += c.X[i]; cz += c.Z[i]; } cx /= Math.ceil(c.N / 10); cz /= Math.ceil(c.N / 10);
    const hp = [], hi = [], R = 2600, seg = 120;
    for (let i = 0; i <= seg; i++) { const a = (i / seg) * 6.2832, hgt = 30 + 150 * Math.max(0, Math.sin(a * 2.3 + 1) * 0.5 + Math.sin(a * 5.1) * 0.35 + Math.sin(a * 11.7 + 2) * 0.15 + 0.15); hp.push(Math.cos(a) * R, -5, Math.sin(a) * R, Math.cos(a) * R, hgt, Math.sin(a) * R); if (i < seg) { const k = 2 * i; hi.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
    const hg = own(new THREE.BufferGeometry()); hg.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3)); hg.setIndex(hi);
    const hills = new THREE.Mesh(hg, this.hillMat); hills.position.set(cx, 0, cz); hills.frustumCulled = false; hills.renderOrder = 9; this.group.add(hills);
    if (this.world) this.setWorld(this.world);
  }
  setRace() { this.resetGates(); this.next = -1; }
  // ---- gate colours: only when something changes (F1 finding RENDER-09) ----
  markGate(i, ok) { this.gateState[i] = ok ? 1 : 2; this.paintGates(); }
  resetGates() { this.gateState.fill(0); this.paintGates(); }
  paintGates() {
    const c = this.course; if (!c || !this.buoys) return;
    c.gates.forEach((g, i) => {
      const st = this.gateState[i], col = st === 1 ? COL.ok : st === 2 ? COL.miss : COL[g.kind] || COL.gate;
      this.buoys.setColorAt(2 * i, col); this.buoys.setColorAt(2 * i + 1, col);
      V.set(col.r, col.g, col.b).multiplyScalar(st ? 1.2 : 2.6);   // an open gate's lamps are bright enough to bloom
      this.lamps.setColorAt(2 * i, new THREE.Color(V.x, V.y, V.z)); this.lamps.setColorAt(2 * i + 1, new THREE.Color(V.x, V.y, V.z));
    });
    this.buoys.instanceColor.needsUpdate = true; this.lamps.instanceColor.needsUpdate = true;
  }
  // every frame: float what is near the camera on the waves, move the beacon to the focus boat's next gate
  update(race, t, camera, me, dt) {
    const c = this.course; if (!c || !this.buoys) return;
    const wv = race.waves, sea = this.sea, bx = this.buoyXZ, n = bx.length / 2;
    for (let i = 0; i < n; i++) {
      const x = bx[2 * i], z = bx[2 * i + 1], f = sea.fadeAt(x, z), y = f > 0.01 ? W.heightFast(wv, x, z, t, 2) * f : 0;
      M4.makeTranslation(x, y, z); this.buoys.setMatrixAt(i, M4);
      M4.makeTranslation(x, y + 3.5, z); this.lamps.setMatrixAt(i, M4);
    }
    this.buoys.instanceMatrix.needsUpdate = true; this.lamps.instanceMatrix.needsUpdate = true;
    const ex = this.edgeXZ, ne = ex.length / 2;
    for (let i = 0; i < ne; i++) { const x = ex[2 * i], z = ex[2 * i + 1], f = sea.fadeAt(x, z); M4.makeTranslation(x, (f > 0.01 ? W.heightFast(wv, x, z, t, 2) * f : 0) + 0.2, z); this.edges.setMatrixAt(i, M4); }
    this.edges.instanceMatrix.needsUpdate = true;
    for (const r of this.ramps) { const f = sea.fadeAt(r.x, r.z); r.grp.position.y = (f > 0.01 ? W.heightFast(wv, r.x, r.z, t, 2) * f : 0) - 0.05; }
    const ng = me && !me.finished ? me.nextGate : -1;
    for (let k = 0; k < 2; k++) {
      const b = this.beams[k]; b.visible = ng >= 0 && !this.arena;
      if (ng >= 0) { const x = bx[4 * ng + 2 * k], z = bx[4 * ng + 2 * k + 1]; b.position.set(x, 0, z); }
    }
    this.beamMat.uniforms.uAmt.value = 0.42 + 0.16 * Math.sin(t * 7);
  }
}
