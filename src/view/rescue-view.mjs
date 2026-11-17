// rescue-view.mjs: what the rescue level (sim/rescue.mjs) looks like: the island with its beach, the ship's gangway, the llamas
// (twelve copies of one rigged model, each with its own clips: idle on the gangway, a hop into the sea, paddling, a walk up the
// sand), the sharks (made in code), the cannon's shells and its lock ring, and the emperor riding his llama along the shore.
// The models: assets/models/llama-anim.glb (clips Idle, Walk, Trot, Hop) and emperor.glb (the owner's characters, made with
// Tripo from his sheets; see assets/SOURCES.md). Written 2026-11-15 by the yacht project session; the animated llama came the
// same day from the owner's Friendly Fighters site (research/A1-friendly-fighters of the project). NOT_ASSESSED on a phone.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';
import * as W from '../sim/waves.mjs?v=7d4a3824';
import { ARENA, SHIP, RESCUE, A, S } from '../sim/rescue.mjs?v=7d4a3824';
import { crewClip, lightClip, tick } from './people.mjs?v=7d4a3824';

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(), E = new THREE.Euler(), C = new THREE.Color();
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const LLAMA_H = 2.6, CREW_H = 2.4, MOUNT_H = 4.4, SHARK_L = 5.6, PATH_R = 29, GANG_Y = 3.3;
const LLAMA_CLIPS = { deck: 'Idle', jump: 'Hop', swim: 'Trot', beach: 'Walk' }, CREW_CLIPS = { deck: 'idle', jump: 'run', swim: 'run', beach: 'walk' };
const MAX_SHARKS = 24;   // room for the sharks of any level: the meshes are made once, at the first mission (Hard has 19)

// ---------- the island: a round shore (the simulation's circle) with a lumpy inside ----------
// the beach (radius 30 to 40) is a plain cone, high enough to stay dry above the waves; only the inside is lumpy
const PROFILE = [[0, 7.6], [8, 7.0], [16, 5.6], [23, 4.0], [29, 2.7], [34, 1.7], [37.5, 0.85], [40, 0], [43, -0.9], [48, -2.4]];
function lump(a, r) { return 1 + (0.3 * Math.sin(3 * a + 0.7) + 0.18 * Math.sin(5 * a + 2.1)) * clamp(r / 14, 0, 1) * clamp((30 - r) / 8, 0, 1); }
export function islandY(x, z) {
  const I = ARENA.island, dx = x - I.x, dz = z - I.z, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
  let y = PROFILE[PROFILE.length - 1][1];
  for (let i = 1; i < PROFILE.length; i++) if (r <= PROFILE[i][0]) { const p = PROFILE[i - 1], q = PROFILE[i], f = (r - p[0]) / (q[0] - p[0]); y = p[1] + (q[1] - p[1]) * f; break; }
  return y > 0 ? y * lump(a, r) : y;
}
function islandGeometry() {
  const I = ARENA.island, rings = [0, 4, 8, 12, 16, 20, 23, 26, 29, 32, 34, 36, 37.5, 39, 40, 41.5, 43, 48], seg = 36, pos = [], col = [], idx = [];
  const sand = new THREE.Color(0xe9d3a0), wet = new THREE.Color(0xb89f72), green = new THREE.Color(0x6a9a4f), dry = new THREE.Color(0x9aa35a), c = new THREE.Color();
  rings.forEach((r, ri) => { for (let k = 0; k < seg; k++) {
    const a = (k / seg) * 2 * Math.PI + (ri % 2) * (Math.PI / seg), x = Math.cos(a) * r, z = Math.sin(a) * r, y = islandY(I.x + x, I.z + z);
    pos.push(x, y, z);
    if (y < 0.3) c.copy(wet); else if (y < 2.6) c.copy(wet).lerp(sand, clamp((y - 0.3) / 0.6, 0, 1)); else c.copy(sand).lerp(k % 3 ? green : dry, clamp((y - 2.6) / 1.0, 0, 1));
    col.push(c.r, c.g, c.b);
  } });
  for (let ri = 0; ri < rings.length - 1; ri++) for (let k = 0; k < seg; k++) { const a = ri * seg + k, b = ri * seg + ((k + 1) % seg), d = a + seg, e = b + seg; if (ri % 2) idx.push(a, b, d, b, e, d); else idx.push(a, b, e, a, e, d); }   // wound so that the faces look up
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// ---------- a shark, nose toward +x, about one unit long: body, dorsal fin, tail, two side fins ----------
function sharkGeometry() {
  const parts = [], top = new THREE.Color(0x3c4b5a), belly = new THREE.Color(0xdfe5e8), c = new THREE.Color();
  const paint = (g, f) => { const p = g.attributes.position, col = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { f(p.getX(i), p.getY(i), p.getZ(i), c); col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g.toNonIndexed(); };
  const body = new THREE.SphereGeometry(0.5, 12, 8), bp = body.attributes.position;
  for (let i = 0; i < bp.count; i++) { const x = bp.getX(i) * 1.0, t = x + 0.5, thick = Math.pow(Math.sin(Math.PI * clamp(0.08 + 0.92 * t, 0, 1)), 0.7) * (0.45 + 0.55 * t); bp.setXYZ(i, x, bp.getY(i) * 0.26 * thick * 1.25, bp.getZ(i) * 0.24 * thick * 1.25); }
  parts.push(paint(body, (x, y, z, o) => o.copy(belly).lerp(top, clamp(y * 14 + 0.55, 0, 1))));
  const fin = (pts, zHalf) => { const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]); sh.closePath(); const g = new THREE.ExtrudeGeometry(sh, { depth: 2 * zHalf, bevelEnabled: false }); g.translate(0, 0, -zHalf); return g; };
  parts.push(paint(fin([[-0.06, 0.06], [0.2, 0.06], [-0.1, 0.36]], 0.018), (x, y, z, o) => o.copy(top)));                   // dorsal fin
  parts.push(paint(fin([[-0.42, 0], [-0.62, 0.24], [-0.52, 0], [-0.6, -0.15]], 0.012), (x, y, z, o) => o.copy(top)));       // tail
  for (const k of [-1, 1]) { const g = fin([[0.05, 0], [0.2, 0], [-0.02, -0.2]], 0.01); g.rotateX(k * 1.15); g.translate(0, -0.03, k * 0.08); parts.push(paint(g, (x, y, z, o) => o.copy(top))); }
  for (const g of parts) { g.deleteAttribute('uv'); }
  const out = mergeGeometries(parts, false); out.computeVertexNormals(); return out;
}

export class RescueView {
  constructor(scene, sea, spray, scenery, people) {
    this.scene = scene; this.sea = sea; this.spray = spray; this.scenery = scenery; this.people = people;
    this.crewIds = [null, null, null]; this.crewRigs = [null, null, null];      // this mission's three of the crew: codes, and their figures once loaded
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    this.rescue = null; this.ready = false; this.built = false; this.t = 0; this.flash = 0; this.cheer = null;
    this.emp = { a: ARENA.ship.a, dir: 1, h: 0, ph: 0, v: 0 };
  }
  async load(base = './assets/') {
    const L = new GLTFLoader(), [lg, eg] = await Promise.all([L.loadAsync(base + 'models/llama-anim.glb'), L.loadAsync(base + 'models/emperor.glb')]);
    for (const g of [lg, eg]) g.scene.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.material.envMapIntensity = 1; o.material.metalness = 0; o.material.metalnessMap = null; o.material.roughness = 0.85; } });
    // the llama: nose toward +z, feet at y = 0; its height in its own units from the mesh's box as it stands
    lg.scene.updateMatrixWorld(true); const box = new THREE.Box3();
    lg.scene.traverse((o) => { if (o.isSkinnedMesh) { o.computeBoundingBox(); box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
    for (const c of lg.animations) lightClip(c);
    this.llamaSrc = { scene: lg.scene, clips: lg.animations, height: box.max.y - box.min.y, minY: box.min.y };
    this.emperor = eg.scene; this.clips = eg.animations; this.mixer = new THREE.AnimationMixer(eg.scene);
    this.act = {}; for (const c of this.clips) this.act[c.name] = this.mixer.clipAction(c);
    this.ready = true; return true;
  }
  // everything of the arena, made once
  build(rescue) {
    const G = this.group, I = ARENA.island;
    const island = new THREE.Mesh(islandGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })); island.position.set(I.x, 0, I.z); G.add(island);
    const kit = (name, list, size) => {   // instances of a kit model (as scenery.kitInstances, but these stay for good)
      const K = this.scenery.kit.get(name); if (!K || !list.length) return null;
      const k0 = size / Math.max(K.size.x, K.size.y, K.size.z);
      for (const part of K.parts) { const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        list.forEach((p, i) => { M4.compose(V.set(p.x, p.y || 0, p.z), Q.setFromEuler(E.set(0, p.ry || 0, 0)), SC.setScalar(k0 * (p.s || 1))); M4.multiply(part.matrix); im.setMatrixAt(i, M4); });
        im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; G.add(im); }
      return { K, k0 };
    };
    const at = (ang, r) => ({ x: I.x + Math.cos(ang) * r, z: I.z + Math.sin(ang) * r });
    const palms = [[0.3, 9], [1.4, 15], [2.5, 8], [3.3, 17], [4.2, 12], [5.1, 18], [5.9, 6], [0.9, 20], [2.0, 21]].map(([a, r], i) => { const p = at(a, r); return { ...p, y: islandY(p.x, p.z) - 0.2, ry: a * 3, s: 0.85 + 0.3 * ((i * 7) % 5) / 5 }; });
    kit('pk_palm-detailed-bend', palms.filter((_, i) => i % 2 === 0), 9); kit('pk_palm-detailed-straight', palms.filter((_, i) => i % 2 === 1), 9.5);
    const rocks = [[3.4, 38], [4.0, 40], [4.9, 39], [5.7, 38], [0.2, 40], [2.9, 39]].map(([a, r], i) => { const p = at(a, r); return { ...p, y: -0.4, ry: a * 5, s: 0.7 + 0.5 * (i % 3) / 2 }; });
    kit('pk_rocks-a', rocks.filter((_, i) => i % 2 === 0), 6); kit('pk_rocks-b', rocks.filter((_, i) => i % 2 === 1), 6);
    kit('pk_tower-complete-large', [{ x: I.x, y: islandY(I.x, I.z) - 0.5, z: I.z, ry: 0 }], 16);
    // the ship, its long side toward the island, and the gangway the llamas wait on
    const K = this.scenery.kit.get('wc_ship-cargo-a'); let half = 7;
    if (K) { const longX = K.size.x >= K.size.z, k0 = SHIP.len / Math.max(K.size.x, K.size.y, K.size.z); half = (longX ? K.size.z : K.size.x) * k0 / 2;
      kit('wc_ship-cargo-a', [{ x: SHIP.x, y: -1, z: SHIP.z, ry: longX ? Math.atan2(-SHIP.az, SHIP.ax) : Math.atan2(SHIP.ax, SHIP.az) }], SHIP.len); }
    this.gangOff = half + 2.3 - (SHIP.beam / 2 - 1.6);       // from the simulation's deck line out to the gangway
    const n = rescue.total, gl = n * 4.6 + 4;
    const gang = new THREE.Mesh(new THREE.BoxGeometry(gl, 0.45, 4.4), new THREE.MeshStandardMaterial({ color: 0x9a6a3a, roughness: 0.9 }));
    gang.position.set(SHIP.x + SHIP.nx * (half + 2.2), GANG_Y - 0.25, SHIP.z + SHIP.nz * (half + 2.2)); gang.rotation.y = Math.atan2(-SHIP.az, SHIP.ax); G.add(gang);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(gl, 0.18, 0.18), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6 }));
    rail.position.set(SHIP.x + SHIP.nx * (half + 0.2), GANG_Y + 1.5, SHIP.z + SHIP.nz * (half + 0.2)); rail.rotation.y = gang.rotation.y; G.add(rail);
    // the llamas: a rigged copy each, with its own clips; their markers (a small light above each swimmer)
    this.llamaRigs = []; for (let i = 0; i < n; i++) { const one = this.makeLlama(LLAMA_H); G.add(one.hold); this.llamaRigs.push(one); }
    this.marks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.24, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), n); this.marks.frustumCulled = false; G.add(this.marks);
    // the sharks and the lock ring
    this.sharks = new THREE.InstancedMesh(sharkGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, flatShading: true, side: THREE.DoubleSide }), MAX_SHARKS); this.sharks.frustumCulled = false; G.add(this.sharks);
    this.smarks = new THREE.InstancedMesh(new THREE.ConeGeometry(0.42, 0.9, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.6, 0.3, 0.2) }), MAX_SHARKS); this.smarks.frustumCulled = false; G.add(this.smarks);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.13, 6, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.35, 0.2), transparent: true, opacity: 0.9, depthWrite: false })); this.ring.rotation.x = Math.PI / 2; this.ring.frustumCulled = false; this.ring.renderOrder = 4; G.add(this.ring);
    // shells and the flash at the muzzle
    this.shells = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 2.4, 0.6) }), rescue.shells.length); this.shells.frustumCulled = false; G.add(this.shells);
    this.muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4, 1.5), transparent: true, opacity: 0.9, depthWrite: false })); this.muzzle.visible = false; G.add(this.muzzle);
    // the emperor on his llama
    const rider = this.rider = new THREE.Group(); G.add(rider);
    this.mountRig = this.makeLlama(MOUNT_H); rider.add(this.mountRig.hold);
    // the rider group looks along +z, as the llama does; the emperor's model has its nose toward -x, so he is turned a quarter
    const ew = this.riderSeat = new THREE.Group(); ew.add(this.emperor); ew.scale.setScalar(MOUNT_H * 0.8); ew.rotation.y = Math.PI / 2; ew.position.set(0, 0.345 * MOUNT_H, 0.02 * MOUNT_H); rider.add(ew);
    this.play('sit', true);
    this.built = true;
  }
  // one llama: a copy of the rigged model, 'height' metres tall, in a holder that the frame loop places and turns
  makeLlama(height) {
    const S0 = this.llamaSrc, root = cloneRig(S0.scene), k = height / S0.height, hold = new THREE.Group();
    root.scale.setScalar(k); root.position.y = -S0.minY * k; hold.add(root); hold.rotation.order = 'YXZ';
    root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    const mixer = new THREE.AnimationMixer(root), act = {}; for (const c of S0.clips) act[c.name] = mixer.clipAction(c);
    return { hold, root, mixer, act, clip: '', until: 0, n: this.llamaRigs ? this.llamaRigs.length : 0, acc: 0, skip: 0 };
  }
  // the clip a llama plays: changed with a short blend; speed: how fast it runs; once: play it through and hold the last pose
  llamaClip(one, name, speed = 1, once = false) {
    const a = one.act[name]; if (!a) return;
    if (one.clip !== name) {
      const old = one.act[one.clip]; if (old) old.fadeOut(0.18);
      a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity); a.clampWhenFinished = once; a.fadeIn(0.18).play();
      if (!once) a.time = (one.n * 0.37) % a.getClip().duration;          // not all in step
      one.clip = name;
    }
    a.timeScale = speed;
  }
  play(name, loop) {
    const a = this.act && this.act[name]; if (!a) return;
    if (this.cur && this.cur !== a) this.cur.fadeOut(0.3);
    a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1); a.clampWhenFinished = !loop; a.fadeIn(0.3).play(); this.cur = a; this.curName = name; this.curT = 0; this.curLen = a.getClip().duration; this.curLoop = loop;
  }
  // this mission's three of the crew (codes of view/people.mjs). A figure appears when its model has arrived; until then
  // a llama swims in its place
  setCrew(ids) {
    const waits = [];
    for (let k = 0; k < 3; k++) {
      const id = ids[k] || null, rig = this.crewRigs[k];
      if (rig && this.crewIds[k] === id) { rig.mixer.stopAllAction(); rig.clip = ''; rig.hold.visible = true; continue; }
      if (rig) this.people.free(rig);
      this.crewRigs[k] = null; this.crewIds[k] = id; if (!id || !this.people) continue;
      waits.push(this.people.load(id).then((src) => { if (!src || this.crewIds[k] !== id || this.crewRigs[k]) return; const one = this.people.make(id, CREW_H); one.n = k; this.group.add(one.hold); this.crewRigs[k] = one; }));
    }
    return Promise.all(waits);
  }
  setRescue(rescue, crew = []) {
    this.rescue = rescue && this.ready ? rescue : null; this.group.visible = !!this.rescue;
    if (this.rescue && !this.built) this.build(rescue);
    const crewReady = this.rescue ? this.setCrew(crew) : this.setCrew([]);
    if (this.rescue) this.sharks.count = this.smarks.count = Math.min(MAX_SHARKS, rescue.sharks.length);   // this mission's sharks: 10, 15 or 19
    if (this.rescue) for (const one of this.llamaRigs) { one.mixer.stopAllAction(); one.clip = ''; one.until = 0; one.hold.visible = true; }
    if (this.rescue) { this.emp.a = ARENA.ship.a - 0.5; this.emp.dir = 1; this.flash = 0; if (this.curName !== 'sit') this.play('sit', true); }
    return crewReady;
  }
  seaY(wv, x, z, t) { const f = this.sea.fadeAt(x, z); return f > 0.01 ? W.heightFast(wv, x, z, t, 2) * f : 0; }
  // effects for what the simulation reports; stage: for the camera shake and the picture flash
  onEvent(e, stage) {
    if (!this.rescue) return;
    const sp = this.spray, y = 0.2;
    switch (e.type) {
      case 'splashIn': sp.emit(e.x, y, e.z, 0, 0, 46, 5.5, 3.2, 0, 0.6); break;
      case 'shot': this.flash = 0.06; stage.cam.shake = Math.max(stage.cam.shake, 0.08); break;
      case 'splash': sp.emit(e.x, y, e.z, 0, 0, 12, 4.5, 1.6, 0, 0.3); break;
      case 'hit': sp.emit(e.x, y, e.z, 0, 0, e.dead ? 60 : 26, e.dead ? 7 : 5, 3, 0, 0.8); if (e.dead) { stage.fx.bloomPulse = Math.max(stage.fx.bloomPulse, 0.5); } break;
      case 'ram': sp.emit(e.x, y, e.z, 0, 0, 110, 8, 5, 0, 1.2); stage.cam.shake = Math.max(stage.cam.shake, 0.85); stage.fx.flash = 0.16; stage.fx.flashCol = [1, 1, 1]; break;
      case 'grab': sp.emit(e.x, y, e.z, 0, 0, 40, 4, 3.5, 0, 0.8); break;
      case 'freed': sp.emit(e.x, y, e.z, 0, 0, 20, 4, 2, 0, 0.5); break;
      case 'lostA': stage.fx.flash = 0.24; stage.fx.flashCol = [1, 0.15, 0.1]; this.cheer = 'angry_01'; break;
      case 'saved': stage.fx.flash = Math.max(stage.fx.flash, 0.1); stage.fx.flashCol = [1, 0.86, 0.55]; stage.fx.bloomPulse = Math.max(stage.fx.bloomPulse, 0.7); this.cheer = 'cast_a_spell'; break;
      case 'aground': stage.cam.shake = Math.max(stage.cam.shake, Math.min(0.8, 0.2 + 0.08 * e.v)); break;
      default: break;
    }
  }
  // one frame. dt: seconds of picture time; t: simulation time (the sea's); boat: the stage's pose of the player's yacht
  update(dt, t, camera, boat) {
    const R = this.rescue; if (!R) return;
    this.t += dt;
    const wv = R.race.waves, I = ARENA.island, tt = this.t;
    // ---- llamas ----
    const off = this.gangOff, hop = this.llamaRigs[0].act.Hop, hopS = hop ? hop.getClip().duration : 1.4;
    for (const a of R.llamas) {
      // a llama, or one of the crew once that model has arrived (until then the llama of that place stands in)
      const crew = a.kind === 'person' ? this.crewRigs[a.who] : null, one = crew || this.llamaRigs[a.i];
      if (crew) this.llamaRigs[a.i].hold.visible = false;
      const s = crew ? CREW_H : LLAMA_H, sink = crew ? 0.76 : 0.5, K = crew ? CREW_CLIPS : LLAMA_CLIPS, clip = crew ? crewClip : (o, n, v, once) => this.llamaClip(o, n, v, once);
      let x = a.x, z = a.z, y = 0, h = a.h, pitch = 0, roll = 0, show = true, mark = 0;
      if (a.st === A.deck) { x += SHIP.nx * off; z += SHIP.nz * off; y = GANG_Y; clip(one, K.deck); }
      else if (a.st === A.jump) { const p = clamp(a.t / RESCUE.jumpS, 0, 1), sx = a.x0 + SHIP.nx * off, sz = a.z0 + SHIP.nz * off; x = sx + (a.x1 - sx) * p; z = sz + (a.z1 - sz) * p; y = GANG_Y * (1 - p) - sink * s * p + 11 * p * (1 - p); pitch = (crew ? -0.3 : -0.9) * p; clip(one, K.jump, crew ? 1.3 : hopS / RESCUE.jumpS, true); }
      else if (a.st === A.swim) { const f = a.follow ? 5.2 : 3.1; y = this.seaY(wv, x, z, t) - sink * s + (crew ? 0.035 : 0.09) * s * Math.sin(tt * f + a.i * 2.1); pitch = (crew ? 0.14 : 0.2) + 0.06 * Math.sin(tt * f + a.i); roll = 0.1 * Math.sin(tt * f * 0.5 + a.i * 1.3); mark = a.follow ? 2 : 1; clip(one, K.swim, (a.follow ? 1.3 : 0.8) * (crew ? 0.75 : 1)); }
      else if (a.st === A.grab) { const p = clamp(a.t / RESCUE.grabS, 0, 1); y = this.seaY(wv, x, z, t) - (sink + (crew ? 0.2 : 0.45) * p) * s; roll = (crew ? 0.35 : 0.6) * Math.sin(tt * 19); pitch = crew ? 0.25 : 0.5; mark = 3; clip(one, K.swim, crew ? 2 : 2.6); }
      else if (a.st === A.beach) { const sea0 = this.seaY(wv, x, z, t) - sink * s; y = Math.max(sea0, islandY(x, z) - 0.05); clip(one, K.beach, crew ? 1.25 : 1.45); }
      else if (a.st === A.safe) {
        y = islandY(x, z) - 0.05; h = Math.atan2(-(SHIP.x - x), SHIP.z - z) + 0.5 * Math.sin(a.i * 3.3);
        // on the sand: idle; a llama also hops for joy now and then (each in its own time)
        if (crew) clip(one, K.deck);
        else if (tt >= one.until) { if (one.until === 0 || one.clip === 'Hop') { this.llamaClip(one, 'Idle'); one.until = tt + 2 + ((a.i * 2.7) % 5); } else { this.llamaClip(one, 'Hop', 1, true); one.until = tt + hopS; } }
      } else show = false;
      if (a.st !== A.safe) one.until = 0;
      one.hold.visible = show;
      // near the camera a figure moves every frame, further off every third (twelve llamas and three of the crew)
      if (show) { one.hold.position.set(x, y, z); one.hold.rotation.set(-pitch, -h, roll); tick(one, dt, (x - camera.position.x) ** 2 + (z - camera.position.z) ** 2 < 3600 ? 1 : 3); }
      // the marker: gold over a swimmer, green over one that follows the yacht, red and fast over one in a shark's jaws
      const my = y + s * 1.05 + 0.55 + 0.12 * Math.sin(tt * 4 + a.i), ms = mark === 0 ? 0 : mark === 3 ? 1.5 + 0.5 * Math.sin(tt * 22) : 1;
      M4.compose(V.set(x, my, z), Q.setFromEuler(E.set(0, tt * 2 + a.i, 0)), SC.setScalar(ms)); this.marks.setMatrixAt(a.i, M4);
      this.marks.setColorAt(a.i, mark === 2 ? C.setRGB(0.5, 3.0, 1.2) : mark === 3 ? C.setRGB(4, 0.3, 0.2) : C.setRGB(3.2, 2.2, 0.5));
    }
    this.marks.instanceMatrix.needsUpdate = true; if (this.marks.instanceColor) this.marks.instanceColor.needsUpdate = true;
    // ---- sharks ----
    for (const q of R.sharks) {
      let k = SHARK_L, y = 0, pitch = 0, roll = 0, yaw = 0.12 * Math.sin(tt * 7 + q.i);
      const sy = this.seaY(wv, q.x, q.z, t);
      let mk = 1;                                  // the marker over a shark that still hunts: a red point, restless when it is about to bite
      if (q.st === S.hunt) y = sy - 0.5;
      else if (q.st === S.lunge) { const p = clamp(q.t / RESCUE.lungeS, 0, 1); y = sy - 0.5 + 0.7 * p; pitch = 0.4 * p; mk = 1.5 + 0.5 * Math.sin(tt * 24); }
      else if (q.st === S.bite) { y = sy - 0.2; roll = 0.5 * Math.sin(tt * 17); yaw = 0.35 * Math.sin(tt * 13); mk = 1.5 + 0.5 * Math.sin(tt * 24); }
      else if (q.st === S.stun) { y = sy - 0.3; roll = 1.3; }
      else if (q.st === S.flee) { y = sy - 0.9; mk = 0; }
      else if (q.st === S.dead) { const p = clamp(q.t / RESCUE.sinkS, 0, 1); y = sy - 0.3 - 2.6 * p * p; roll = Math.min(Math.PI, q.t * 4); mk = 0; }
      else { k = 0; mk = 0; }
      M4.compose(V.set(q.x, sy + 3.4 + 0.2 * Math.sin(tt * 5 + q.i), q.z), Q.setFromEuler(E.set(Math.PI, tt * 2.5 + q.i, 0)), SC.setScalar(mk)); this.smarks.setMatrixAt(q.i, M4);
      // far from the camera a marker-sized fin would vanish: the ring and the display's arrow point at sharks instead
      Q.setFromEuler(E.set(roll, -q.h - Math.PI / 2 + yaw, pitch, 'YZX'));
      M4.compose(V.set(q.x, y, q.z), Q, SC.setScalar(k)); this.sharks.setMatrixAt(q.i, M4);
      if (k && q.st !== S.dead && q.st !== S.stun) this.spray.trail(4 + (q.i % 12), q.x, sy, q.z, q.h, Math.max(q.v, q.st === S.bite ? 9 : 0) * 1.1, false, dt, 0.35, 0.4, 0.25);
    }
    this.sharks.instanceMatrix.needsUpdate = true; this.smarks.instanceMatrix.needsUpdate = true;
    // ---- the lock ring ----
    const lk = R.lock >= 0 ? R.sharks[R.lock] : null; this.ring.visible = !!lk;
    if (lk) { const p = 1 + 0.12 * Math.sin(tt * 14); this.ring.position.set(lk.x, this.seaY(wv, lk.x, lk.z, t) + 0.5, lk.z); this.ring.scale.setScalar(p); this.ring.rotation.z = tt * 2.4; }
    // ---- shells and the muzzle ----
    R.shells.forEach((sh, i) => {
      if (!sh.on) { M4.makeScale(0, 0, 0); this.shells.setMatrixAt(i, M4); return; }
      const p = clamp(sh.t / sh.life, 0, 1), hh = Math.atan2(-sh.vx, sh.vz);
      Q.setFromEuler(E.set(0, -hh - Math.PI / 2, 0)); M4.compose(V.set(sh.x, 1.9 * (1 - p) + 0.35 + 1.2 * 4 * p * (1 - p), sh.z), Q, SC.set(7, 1, 1)); this.shells.setMatrixAt(i, M4);
    });
    this.shells.instanceMatrix.needsUpdate = true;
    this.flash = Math.max(0, this.flash - dt); this.muzzle.visible = this.flash > 0 && !!boat;
    if (this.muzzle.visible) { this.muzzle.position.set(boat.x - Math.sin(boat.h) * 5.3, boat.y + 1.5, boat.z + Math.cos(boat.h) * 5.3); this.muzzle.scale.setScalar(0.7 + 14 * this.flash); }
    // ---- the emperor: back and forth along the shore that faces the ship; he cheers a llama on the sand and rages at a loss ----
    const Em = this.emp, lim = 1.15, vmax = 2.1;
    if (this.cheer && this.curName === 'sit') { this.play(this.cheer, false); } this.cheer = null;
    if (this.curName !== 'sit') { this.curT += dt; if (this.curT >= this.curLen - 0.35) this.play('sit', true); }
    const walking = this.curName === 'sit';
    Em.v += ((walking ? vmax : 0) - Em.v) * (1 - Math.exp(-dt / 0.5));
    Em.a += Em.dir * (Em.v / PATH_R) * dt;
    if (Em.a > ARENA.ship.a + lim) Em.dir = -1; else if (Em.a < ARENA.ship.a - lim) Em.dir = 1;
    const ex = I.x + Math.cos(Em.a) * PATH_R, ez = I.z + Math.sin(Em.a) * PATH_R, hw = Em.dir > 0 ? Em.a : Em.a + Math.PI;   // heading along the path
    let dh = hw - Em.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI; Em.h += clamp(dh, -1.8 * dt, 1.8 * dt);
    this.rider.position.set(ex, islandY(ex, ez), ez); this.rider.rotation.y = -Em.h;
    // the mount: its walk clip at the pace of its steps (about 3 m a cycle at this size), idle while the emperor cheers or rages
    if (Em.v > 0.25) this.llamaClip(this.mountRig, 'Walk', Em.v / 3); else this.llamaClip(this.mountRig, 'Idle');
    tick(this.mountRig, dt, 2);
    this.mixer.update(dt);
  }
}
