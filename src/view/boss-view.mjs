// boss-view.mjs: what the boss level (sim/boss.mjs) looks like: the dragon with the temples on its back (assets/models/
// dragon-world.glb, the owner's model, see assets/SOURCES.md), the six crystals along its flanks (the open one bright under a beam
// of light, the others dim), the boss on the roof of the highest temple (one of the crew, twenty metres tall, turning toward the
// yacht; beaten, he leaps into the sea), his fire in the air with a ring on the water where it will land, the cannon's shells
// and its lock ring.
// Written 2026-11-15 by the yacht project session. NOT_ASSESSED on a phone.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as W from '../sim/waves.mjs?v=91fc8c31';
import { DRAGON, BOSS } from '../sim/boss.mjs?v=91fc8c31';
import { crewClip, tick } from './people.mjs?v=91fc8c31';

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(), E = new THREE.Euler(), C = new THREE.Color();
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const SEA_Y = 0.88, BOSS_H = 20;      // where the sea stands in the model's own units (its flat ocean was at -0.88); the boss's height in metres

export class BossView {
  constructor(scene, sea, spray, people) {
    this.scene = scene; this.sea = sea; this.spray = spray; this.people = people;
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    this.boss = null; this.ready = false; this.built = false; this.loading = null; this.t = 0; this.flash = 0; this.figure = null; this.figureId = null; this.throwT = 0; this.fall = null;
  }
  // the dragon's model, fetched the first time the level is started
  load(base = './assets/') {
    if (!this.loading) this.loading = new GLTFLoader().loadAsync(base + 'models/dragon-world.glb').then((g) => {
      g.scene.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; const m = o.material; m.envMapIntensity = 0.8; if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0) m.emissiveIntensity = 2.2; } });   // lanterns and road edges glow
      this.world = g.scene; this.ready = true; return true;
    }).catch((e) => { console.warn('dragon world not loaded: ' + (e && e.message)); this.loading = null; return false; });
    return this.loading;
  }
  build(boss) {
    const G = this.group, S = DRAGON.scale;
    this.world.scale.setScalar(S); this.world.position.set(0, SEA_Y * S, 0); G.add(this.world);
    this.crystals = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), boss.crystals.length); this.crystals.frustumCulled = false; G.add(this.crystals);
    const beamGeo = new THREE.CylinderGeometry(0.5, 2.2, 70, 10, 1, true); beamGeo.translate(0, 35, 0);
    this.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.35, 1.9), transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); this.beam.frustumCulled = false; this.beam.renderOrder = 4; G.add(this.beam);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.22, 6, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.35, 0.2), transparent: true, opacity: 0.9, depthWrite: false })); this.ring.rotation.x = Math.PI / 2; this.ring.frustumCulled = false; this.ring.renderOrder = 4; G.add(this.ring);
    this.shells = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 2.4, 0.6) }), boss.shells.length); this.shells.frustumCulled = false; G.add(this.shells);
    this.muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4, 1.5), transparent: true, opacity: 0.9, depthWrite: false })); this.muzzle.visible = false; G.add(this.muzzle);
    // fire: a ball in the air and, on the water, a ring that closes as the fire comes down
    const n = boss.fires.length;
    this.balls = new THREE.InstancedMesh(new THREE.SphereGeometry(2.4, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 2.2, 0.4) }), n); this.balls.frustumCulled = false; G.add(this.balls);
    this.marks = []; this.fills = [];
    for (let i = 0; i < n; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(BOSS.fireR - 0.7, BOSS.fireR, 44), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 0.25, 0.12), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
      const fill = new THREE.Mesh(new THREE.CircleGeometry(BOSS.fireR, 44), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.2, 0.1), transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
      for (const m of [ring, fill]) { m.rotation.x = -Math.PI / 2; m.frustumCulled = false; m.renderOrder = 3; m.visible = false; G.add(m); }
      this.marks.push(ring); this.fills.push(fill);
    }
    this.built = true;
  }
  // the fight to show (or null), and which of the crew is the boss this time; the promise: his model has arrived
  setBoss(boss, id = null) {
    this.boss = boss && this.ready ? boss : null; this.group.visible = !!this.boss;
    if (this.boss && !this.built) this.build(boss);
    const want = this.boss ? id : null;
    if (this.figure && this.figureId !== want) { this.people.free(this.figure); this.figure = null; }
    this.figureId = want; this.flash = 0; this.fall = null;
    if (this.figure) this.stand(this.figure);
    if (!want || this.figure) return Promise.resolve(true);
    return this.people.load(want).then((src) => {
      if (!src || this.figureId !== want || this.figure) return;
      const one = this.people.make(want, BOSS_H); this.stand(one); this.group.add(one.hold); this.figure = one;
    });
  }
  // the boss on his place: the roof of the highest temple on the dragon's back
  stand(one) { one.hold.position.set(DRAGON.boss.x, DRAGON.boss.y, DRAGON.boss.z); one.hold.rotation.set(0, 0, 0); one.hold.visible = true; }
  seaY(wv, x, z, t) { const f = this.sea.fadeAt(x, z); return f > 0.01 ? W.heightFast(wv, x, z, t, 2) * f : 0; }
  onEvent(e, stage) {
    if (!this.boss) return;
    const sp = this.spray;
    switch (e.type) {
      case 'shot': this.flash = 0.06; stage.cam.shake = Math.max(stage.cam.shake, 0.08); break;
      case 'splash': sp.emit(e.x, 0.2, e.z, 0, 0, 12, 4.5, 1.6, 0, 0.3); break;
      case 'crystal': sp.emit(e.x, 1, e.z, 0, 0, e.broken ? 90 : 14, e.broken ? 9 : 5, e.broken ? 6 : 2.5, 0, 1); if (e.broken) { stage.fx.bloomPulse = 1; stage.fx.flash = 0.2; stage.fx.flashCol = [0.9, 0.5, 1]; stage.cam.shake = Math.max(stage.cam.shake, 0.4); } break;
      case 'throw': this.throwT = 0.9; break;
      case 'fire': sp.emit(e.x, 0.3, e.z, 0, 0, 130, 10, 6.5, 0, 2.5); if (e.hit) { stage.cam.shake = Math.max(stage.cam.shake, 1); stage.fx.flash = 0.3; stage.fx.flashCol = [1, 0.2, 0.08]; } break;
      case 'aground': stage.cam.shake = Math.max(stage.cam.shake, Math.min(0.8, 0.2 + 0.08 * e.v)); break;
      // beaten: he leaps off the dragon's back, to the side the yacht is on, and lands in the sea
      case 'bossEnd': if (e.won) { stage.fx.bloomPulse = 1; stage.fx.flash = 0.3; stage.fx.flashCol = [1, 0.86, 0.55]; this.fall = { vy: 10, vz: (this.boss.me.z >= 0 ? 1 : -1) * 18 }; } break;
      default: break;
    }
  }
  // one frame. dt: seconds of picture time; t: simulation time (the sea's); boat: the stage's pose of the player's yacht
  update(dt, t, camera, boat) {
    const B = this.boss; if (!B) return;
    this.t += dt; const tt = this.t, wv = B.race.waves, open = B.openCrystal, T = B.race.lapT;
    // ---- crystals: the open one bright and restless, a hit one white for a moment, the others dim, a broken one gone ----
    for (const c of B.crystals) {
      const isOpen = c === open, hit = T - c.hitT < 0.12, k = !c.on ? 0 : isOpen ? 1 + 0.08 * Math.sin(tt * 9) : 0.7;
      M4.compose(V.set(c.x, this.seaY(wv, c.x, c.z, t) + 3.5 + (isOpen ? 0.5 * Math.sin(tt * 3) : 0), c.z), Q.setFromEuler(E.set(0, tt * (isOpen ? 1.6 : 0.3) + c.i, 0)), SC.set(3.6 * k, 8.5 * k, 3.6 * k));
      this.crystals.setMatrixAt(c.i, M4);
      this.crystals.setColorAt(c.i, hit ? C.setRGB(5, 5, 5) : isOpen ? C.setRGB(3.2, 0.7, 3.8) : C.setRGB(0.3, 0.1, 0.38));
    }
    this.crystals.instanceMatrix.needsUpdate = true; if (this.crystals.instanceColor) this.crystals.instanceColor.needsUpdate = true;
    this.beam.visible = !!open; if (open) { this.beam.position.set(open.x, 0, open.z); this.beam.material.opacity = 0.26 + 0.1 * Math.sin(tt * 6); }
    const lk = B.lock >= 0 ? B.crystals[B.lock] : null; this.ring.visible = !!lk;
    if (lk) { this.ring.position.set(lk.x, this.seaY(wv, lk.x, lk.z, t) + 0.6, lk.z); this.ring.scale.setScalar(1 + 0.1 * Math.sin(tt * 14)); this.ring.rotation.z = tt * 2.4; }
    // ---- shells and the muzzle ----
    B.shells.forEach((sh, i) => {
      if (!sh.on) { M4.makeScale(0, 0, 0); this.shells.setMatrixAt(i, M4); return; }
      const p = clamp(sh.t / sh.life, 0, 1), hh = Math.atan2(-sh.vx, sh.vz);
      Q.setFromEuler(E.set(0, -hh - Math.PI / 2, 0)); M4.compose(V.set(sh.x, 1.9 * (1 - p) + 0.35 + 1.2 * 4 * p * (1 - p) + 3 * p, sh.z), Q, SC.set(7, 1, 1)); this.shells.setMatrixAt(i, M4);
    });
    this.shells.instanceMatrix.needsUpdate = true;
    this.flash = Math.max(0, this.flash - dt); this.muzzle.visible = this.flash > 0 && !!boat;
    if (this.muzzle.visible) { this.muzzle.position.set(boat.x - Math.sin(boat.h) * 5.3, boat.y + 1.5, boat.z + Math.cos(boat.h) * 5.3); this.muzzle.scale.setScalar(0.7 + 14 * this.flash); }
    // ---- fire: from the boss's hand in an arc to its place on the water; the ring there closes and brightens ----
    const hx = DRAGON.boss.x, hy = DRAGON.boss.y + BOSS_H * 0.8, hz = DRAGON.boss.z;
    B.fires.forEach((f, i) => {
      const ring = this.marks[i], fill = this.fills[i];
      ring.visible = fill.visible = f.on;
      if (!f.on) { M4.makeScale(0, 0, 0); this.balls.setMatrixAt(i, M4); return; }
      // the ring lies flat, above the highest water under it (a first version at the height of its middle was half under the waves)
      const R = BOSS.fireR, p = clamp(f.t / BOSS.fireS, 0, 1);
      const y0 = Math.max(this.seaY(wv, f.x, f.z, t), this.seaY(wv, f.x + R, f.z, t), this.seaY(wv, f.x - R, f.z, t), this.seaY(wv, f.x, f.z + R, t), this.seaY(wv, f.x, f.z - R, t)) + 0.35;
      M4.compose(V.set(hx + (f.x - hx) * p, hy + (y0 - hy) * p + 60 * p * (1 - p), hz + (f.z - hz) * p), Q.identity(), SC.setScalar(1 + 0.25 * Math.sin(tt * 30 + i)));
      this.balls.setMatrixAt(i, M4);
      ring.position.set(f.x, y0, f.z); fill.position.set(f.x, y0 - 0.05, f.z); fill.scale.setScalar(Math.max(0.05, p));
      ring.material.opacity = 0.55 + 0.4 * Math.abs(Math.sin(tt * (6 + 14 * p))); fill.material.opacity = 0.14 + 0.3 * p;
    });
    this.balls.instanceMatrix.needsUpdate = true;
    // ---- the boss: he turns toward the yacht; a throw is a burst of his run clip ----
    const one = this.figure;
    const F = this.fall;
    if (one && F) {
      const p = one.hold.position; F.vy -= 26 * dt; p.y += F.vy * dt; p.z += F.vz * dt; one.hold.rotation.x += 1.7 * dt * Math.sign(F.vz);
      if (p.y < -BOSS_H * 0.4 && one.hold.visible) { one.hold.visible = false; this.spray.emit(p.x, 0.5, p.z, 0, 0, 160, 12, 9, 0, 3); }
      crewClip(one, 'run', 1.6); tick(one, dt, 1);
    } else if (one) {
      const h = boat ? Math.atan2(-(boat.x - DRAGON.boss.x), boat.z - DRAGON.boss.z) : 0; one.hold.rotation.set(0, -h, 0);
      this.throwT = Math.max(0, this.throwT - dt);
      crewClip(one, this.throwT > 0 && !B.over ? 'run' : 'idle', this.throwT > 0 ? 1.6 : 1); tick(one, dt, 1);
    }
  }
}
