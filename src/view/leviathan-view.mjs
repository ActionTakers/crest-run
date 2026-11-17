// leviathan-view.mjs: what the second boss level (sim/leviathan.mjs) looks like. The beast is made in code, no model file: a
// chain of twenty body segments along its circle, glowing spots on its flanks, back fins, a head with two eyes and a crest, a
// tail fluke, and the three lures on its back (its weak points: bright while it is up, gold while it lies stunned). Every attack
// is marked on the water before it lands (research A3, teaching T5): a ring for each spout, a larger ring under the yacht for
// the breach (violet while it follows, red once it stays), the maelstrom in the middle from phase two, a ring that closes on
// the head while it casts the Tide Wall and a wave that runs out from it when the cast is not broken. NOT_ASSESSED on a phone.
// Written 2026-11-15 by the yacht project session. A model from the owner's own sheet can replace the body later.
import * as THREE from 'three';
import * as W from '../sim/waves.mjs?v=55436194';
import { LEVI, FIGHT } from '../sim/leviathan.mjs?v=55436194';

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(), E = new THREE.Euler(0, 0, 0, 'YXZ'), C = new THREE.Color(), P = {};
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const N = 20, radius = (u) => 5.2 * (1 - 0.82 * u ** 1.3) + 0.8 * Math.sin(Math.PI * u);      // segment i of N: u = i / (N - 1)
function swirlTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.translate(128, 128); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineCap = 'round';
  for (let arm = 0; arm < 5; arm++) { g.beginPath(); for (let k = 0; k <= 60; k++) { const r = 10 + 115 * (k / 60), a = arm * 1.2566 + 3.6 * (k / 60); g.lineWidth = 1 + 5 * (k / 60); if (k) g.lineTo(Math.cos(a) * r, Math.sin(a) * r); else g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class LeviathanView {
  constructor(scene, sea, spray) {
    this.scene = scene; this.sea = sea; this.spray = spray;
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    this.levi = null; this.built = false; this.t = 0; this.flash = 0; this.hitT = -9; this.wave = -1; this.rise = -1; this.riseAt = [0, 0];
  }
  build(L) {
    const G = this.group, flat = (m) => { m.frustumCulled = false; G.add(m); return m; };
    const skin = new THREE.MeshStandardMaterial({ color: 0x0e2a66, roughness: 0.5, metalness: 0.15, emissive: 0x06163a, emissiveIntensity: 0.6 });
    this.body = flat(new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), skin, N));
    this.glow = flat(new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 6, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 2.4, 3.2) }), N * 2));
    this.fins = flat(new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 4), new THREE.MeshStandardMaterial({ color: 0x2a5fb8, roughness: 0.4, emissive: 0x123a8a, emissiveIntensity: 0.8 }), 9));
    this.lures = flat(new THREE.InstancedMesh(new THREE.SphereGeometry(1.7, 12, 9), new THREE.MeshBasicMaterial({ color: 0xffffff }), LEVI.spots.length));
    this.eyes = flat(new THREE.InstancedMesh(new THREE.SphereGeometry(0.75, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.5, 2.6) }), 2));
    this.fluke = flat(new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), skin, 2));
    this.crest = flat(new THREE.Mesh(new THREE.ConeGeometry(1.2, 6, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.2, 0.5) })));
    // the head that breaks the surface under the yacht in a breach
    this.riser = new THREE.Group(); const rh = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), skin); rh.scale.set(5.2, 12, 5.2);
    const re = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), this.eyes.material), re2 = re.clone(); re.position.set(3.1, 6.5, 3.1); re2.position.set(-3.1, 6.5, 3.1);
    this.riser.add(rh, re, re2); this.riser.visible = false; G.add(this.riser);
    this.ring = flat(new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.2, 6, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.35, 0.2), transparent: true, opacity: 0.9, depthWrite: false }))); this.ring.rotation.x = Math.PI / 2; this.ring.renderOrder = 4;
    this.shells = flat(new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 2.4, 0.6) }), L.shells.length));
    this.muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4, 1.5), transparent: true, opacity: 0.9, depthWrite: false })); this.muzzle.visible = false; G.add(this.muzzle);
    // marks on the water: a ring and a disc that fills for each spout, a larger pair for the breach
    const mark = (r, col) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.7, r, 44), new THREE.MeshBasicMaterial({ color: new THREE.Color(...col), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
      const fill = new THREE.Mesh(new THREE.CircleGeometry(r, 44), new THREE.MeshBasicMaterial({ color: new THREE.Color(col[0] * 0.6, col[1] * 0.6, col[2] * 0.6), transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
      for (const m of [ring, fill]) { m.rotation.x = -Math.PI / 2; m.frustumCulled = false; m.renderOrder = 3; m.visible = false; G.add(m); }
      return { ring, fill };
    };
    this.marks = L.marks.map(() => mark(FIGHT.spout.r, [0.4, 1.8, 3.4]));
    this.bmark = mark(FIGHT.breach.r, [2.2, 0.5, 3.2]);
    // the maelstrom, the cast's ring round the head, the wave of the Tide Wall
    this.swirl = flat(new THREE.Mesh(new THREE.CircleGeometry(72, 48), new THREE.MeshBasicMaterial({ map: swirlTexture(), color: new THREE.Color(1.3, 1.6, 1.9), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))); this.swirl.rotation.x = -Math.PI / 2; this.swirl.renderOrder = 2;
    this.core = flat(new THREE.Mesh(new THREE.CircleGeometry(FIGHT.pull.coreR, 40), new THREE.MeshBasicMaterial({ color: 0x020812, transparent: true, opacity: 0, depthWrite: false }))); this.core.rotation.x = -Math.PI / 2; this.core.renderOrder = 2;
    const torus = (col) => { const m = flat(new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(...col), transparent: true, opacity: 0.9, depthWrite: false }))); m.rotation.x = Math.PI / 2; m.visible = false; m.renderOrder = 4; return m; };
    this.castRing = torus([3.4, 2.4, 0.5]); this.waveRing = torus([1.2, 2.6, 3.6]);
    this.built = true;
  }
  // the fight to show, or null
  setLevi(L) { this.levi = L || null; this.group.visible = !!this.levi; if (this.levi && !this.built) this.build(L); this.flash = 0; this.wave = -1; this.rise = -1; }
  seaY(wv, x, z, t) { const f = this.sea.fadeAt(x, z); return f > 0.01 ? W.heightFast(wv, x, z, t, 2) * f : 0; }
  onEvent(e, stage) {
    const L = this.levi; if (!L) return; const sp = this.spray;
    switch (e.type) {
      case 'shot': this.flash = 0.06; stage.cam.shake = Math.max(stage.cam.shake, 0.08); break;
      case 'splash': sp.emit(e.x, 0.2, e.z, 0, 0, 12, 4.5, 1.6, 0, 0.3); break;
      case 'lure': this.hitT = this.t; sp.emit(e.x, 1.5, e.z, 0, 0, 10, 5, 2.5, 0, 1); break;
      case 'spout': sp.emit(e.x, 0.3, e.z, 0, 0, 150, 15, 5, 0, 2.5); if (e.hit) { stage.cam.shake = Math.max(stage.cam.shake, 1); stage.fx.flash = 0.25; stage.fx.flashCol = [0.5, 0.8, 1]; } break;
      case 'breach': this.rise = 0; this.riseAt = [e.x, e.z]; sp.emit(e.x, 0.3, e.z, 0, 0, 260, 16, 11, 0, 4); stage.cam.shake = Math.max(stage.cam.shake, e.hit ? 1.2 : 0.5); if (e.hit) { stage.fx.flash = 0.3; stage.fx.flashCol = [0.6, 0.4, 1]; } break;
      case 'stun': stage.fx.bloomPulse = 1; stage.cam.shake = Math.max(stage.cam.shake, 0.3); break;
      case 'ramLevi': sp.emit(e.x, 1, e.z, 0, 0, 200, 12, 9, 0, 3); stage.fx.bloomPulse = 1; stage.fx.flash = 0.25; stage.fx.flashCol = [1, 0.86, 0.5]; stage.cam.shake = Math.max(stage.cam.shake, 1); break;
      case 'phase': stage.fx.bloomPulse = 1; stage.fx.flash = 0.2; stage.fx.flashCol = [0.5, 0.7, 1]; stage.cam.shake = Math.max(stage.cam.shake, 0.6); break;
      case 'tide': this.wave = 0; stage.cam.shake = Math.max(stage.cam.shake, 1.2); stage.fx.flash = 0.35; stage.fx.flashCol = [0.4, 0.7, 1]; break;
      case 'castBreak': stage.fx.bloomPulse = 1; stage.fx.flash = 0.25; stage.fx.flashCol = [1, 0.9, 0.5]; break;
      case 'aground': stage.cam.shake = Math.max(stage.cam.shake, Math.min(0.8, 0.2 + 0.08 * e.v)); break;
      case 'leviEnd': if (e.won) { stage.fx.bloomPulse = 1; stage.fx.flash = 0.35; stage.fx.flashCol = [1, 0.86, 0.55]; } break;
      default: break;
    }
  }
  // one frame. dt: seconds of picture time; t: simulation time (the sea's); boat: the stage's pose of the player's yacht
  update(dt, t, camera, boat) {
    const L = this.levi; if (!L) return;
    this.t += dt; const tt = this.t, wv = L.race.waves, up = L.up, stun = L.st === 'stun', cast = L.st === 'cast', sink = L.over && L.won ? clamp((tt - (this.endAt ?? (this.endAt = tt))) / 3, 0, 1) : (this.endAt = undefined, 0);
    const deep = (1 - up) * 10 + sink * 14, roll = stun ? 0.55 : 0;
    // ---- the body: segments along its circle, a slow wave down its length; stunned it lies on its side ----
    let gi = 0, fi = 0;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), r = radius(u); L.at(u * LEVI.len, P);
      const y = this.seaY(wv, P.x, P.z, t) - r * 0.3 - deep + (stun ? 0.5 * Math.sin(tt * 2 + i) : 1.0 * Math.sin(tt * 1.7 - u * 5.5)) * up, yaw = Math.atan2(P.tx, P.tz);
      Q.setFromEuler(E.set(0, yaw, roll)); M4.compose(V.set(P.x, y, P.z), Q, SC.set(r, r * 0.86, r * 1.35)); this.body.setMatrixAt(i, M4);
      const nx = P.tz, nz = -P.tx;                                         // to its right
      for (const side of [-1, 1]) { M4.makeTranslation(P.x + nx * side * r * 0.86, y + r * 0.28, P.z + nz * side * r * 0.86); this.glow.setMatrixAt(gi++, M4); }
      if (i >= 2 && i <= 18 && i % 2 === 0 && fi < 9) { Q.setFromEuler(E.set(-0.5, yaw, roll)); M4.compose(V.set(P.x, y + r * 0.86 + 1.1, P.z), Q, SC.set(0.5, 3.4 * (r / 5.2) + 0.8, 2.2)); this.fins.setMatrixAt(fi++, M4); }
      if (i === 0) {                                                       // the head: eyes and crest
        for (const side of [-1, 1]) { M4.makeTranslation(P.x + nx * side * 3.6 + P.tx * 3.2, y + 1.6, P.z + nz * side * 3.6 + P.tz * 3.2); this.eyes.setMatrixAt(side < 0 ? 0 : 1, M4); }
        this.crest.position.set(P.x + P.tx * 1.5, y + r * 0.86 + 2.4, P.z + P.tz * 1.5); this.crest.rotation.set(-0.35, yaw, 0, 'YXZ'); this.head = [P.x, y, P.z];
      }
      if (i === N - 1) for (const side of [-1, 1]) { Q.setFromEuler(E.set(0, yaw + side * 0.6, 0)); M4.compose(V.set(P.x - P.tx * 2.2 + nx * side * 2.4, y + 0.6, P.z - P.tz * 2.2 + nz * side * 2.4), Q, SC.set(1.3, 0.35, 3.4)); this.fluke.setMatrixAt(side < 0 ? 0 : 1, M4); }
    }
    for (const m of [this.body, this.glow, this.fins, this.eyes, this.fluke]) m.instanceMatrix.needsUpdate = true;
    // ---- the lures: bright while it is up, white for a moment when hit, gold while it lies stunned, faster while it casts ----
    const open = L.exposed, flashHit = tt - this.hitT < 0.1;
    LEVI.spots.forEach((s, i) => {
      L.at(s, P); const r = radius(s / LEVI.len), k = open ? 1 + 0.12 * Math.sin(tt * (cast ? 16 : 7) + i) : 0.6;
      M4.compose(V.set(P.x, this.seaY(wv, P.x, P.z, t) + r * 0.7 - deep + 1.9, P.z), Q.identity(), SC.setScalar(k)); this.lures.setMatrixAt(i, M4);
      this.lures.setColorAt(i, flashHit ? C.setRGB(6, 6, 6) : stun ? C.setRGB(4.2, 3.0, 0.5) : open ? C.setRGB(3.6, 0.8, 3.2) : C.setRGB(0.25, 0.1, 0.3));
    });
    this.lures.instanceMatrix.needsUpdate = true; if (this.lures.instanceColor) this.lures.instanceColor.needsUpdate = true;
    const lk = L.lock >= 0 ? L.at(LEVI.spots[L.lock], P) : null; this.ring.visible = !!lk;
    if (lk) { this.ring.position.set(lk.x, this.seaY(wv, lk.x, lk.z, t) + radius(LEVI.spots[L.lock] / LEVI.len) * 0.7 + 1.9, lk.z); this.ring.scale.setScalar(1 + 0.1 * Math.sin(tt * 14)); this.ring.rotation.z = tt * 2.4; }
    // ---- shells and the muzzle ----
    L.shells.forEach((sh, i) => {
      if (!sh.on) { M4.makeScale(0, 0, 0); this.shells.setMatrixAt(i, M4); return; }
      const p = clamp(sh.t / sh.life, 0, 1), hh = Math.atan2(-sh.vx, sh.vz);
      Q.setFromEuler(E.set(0, -hh - Math.PI / 2, 0)); M4.compose(V.set(sh.x, 1.9 * (1 - p) + 0.35 + 1.2 * 4 * p * (1 - p) + 3 * p, sh.z), Q, SC.set(7, 1, 1)); this.shells.setMatrixAt(i, M4);
    });
    this.shells.instanceMatrix.needsUpdate = true;
    this.flash = Math.max(0, this.flash - dt); this.muzzle.visible = this.flash > 0 && !!boat;
    if (this.muzzle.visible) { this.muzzle.position.set(boat.x - Math.sin(boat.h) * 5.3, boat.y + 1.5, boat.z + Math.cos(boat.h) * 5.3); this.muzzle.scale.setScalar(0.7 + 14 * this.flash); }
    // ---- marks: each lies flat above the highest water under it; the disc fills as the moment comes ----
    const lay = (m, x, z, r, p, on) => {
      m.ring.visible = m.fill.visible = on; if (!on) return;
      const y0 = Math.max(this.seaY(wv, x, z, t), this.seaY(wv, x + r, z, t), this.seaY(wv, x - r, z, t), this.seaY(wv, x, z + r, t), this.seaY(wv, x, z - r, t)) + 0.35;
      m.ring.position.set(x, y0, z); m.fill.position.set(x, y0 - 0.05, z); m.fill.scale.setScalar(Math.max(0.05, p));
      m.ring.material.opacity = 0.55 + 0.4 * Math.abs(Math.sin(tt * (6 + 14 * p))); m.fill.material.opacity = 0.14 + 0.3 * p;
    };
    L.marks.forEach((k, i) => lay(this.marks[i], k.x, k.z, FIGHT.spout.r, k.on ? clamp(k.t / k.land, 0, 1) : 0, k.on));
    const q = L.breach, bt = FIGHT.breach.followS + FIGHT.breach.lockS;
    lay(this.bmark, q.x, q.z, FIGHT.breach.r, q.on ? clamp(q.t / bt, 0, 1) : 0, q.on);
    if (q.on) this.bmark.ring.material.color.setRGB(q.locked ? 3.6 : 2.2, q.locked ? 0.3 : 0.5, q.locked ? 0.2 : 3.2);
    // ---- the head that breaks the surface in a breach ----
    if (this.rise >= 0) { this.rise += dt / 1.4; const p = this.rise; this.riser.visible = p < 1; this.riser.position.set(this.riseAt[0], -10 + 22 * Math.sin(Math.PI * clamp(p, 0, 1)), this.riseAt[1]); if (p >= 1) this.rise = -1; } else this.riser.visible = false;
    // ---- the maelstrom from phase two; the cast's ring closing on the head; the Tide Wall's wave running out ----
    const mael = clamp((L.phase >= 2 ? 1 : 0) - sink, 0, 1); this.swirl.material.opacity += (0.5 * mael - this.swirl.material.opacity) * Math.min(1, dt * 1.5); this.core.material.opacity = this.swirl.material.opacity * 1.3;
    this.swirl.position.y = 0.9; this.core.position.y = 0.95; this.swirl.rotation.z = -tt * 0.5;
    const H = this.head || [0, 0, 0];
    this.castRing.visible = cast; if (cast) { const left = L.castLeft / FIGHT.cast.castS; this.castRing.position.set(H[0], 2.2, H[2]); this.castRing.scale.setScalar(6 + 26 * left); this.castRing.material.opacity = 0.5 + 0.4 * Math.abs(Math.sin(tt * 9)); }
    if (this.wave >= 0) { this.wave += dt / 1.6; this.waveRing.visible = this.wave < 1; this.waveRing.position.set(H[0], 1.6, H[2]); this.waveRing.scale.setScalar(8 + 230 * this.wave); this.waveRing.material.opacity = 0.9 * (1 - this.wave); if (this.wave >= 1) this.wave = -1; } else this.waveRing.visible = false;
  }
}
