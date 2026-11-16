// people.mjs: the crew. Twelve rigged figures (assets/models/people/f01.glb to f14.glb, 3,500 triangles each, clips idle, walk and
// run), loaded only when a race or a mission needs one, so a visitor never downloads the whole cast. They are models of real
// people who agreed to be in these games (the owner's words of 2026-11-15, <local>); the game names
// nobody: a figure is a code here and "crew" on the screen. Roles rotate: in a rescue mission three of them swim among the
// llamas, in a race three sail the rival yachts. Written 2026-11-15 by the yacht project session. NOT_ASSESSED on a phone.
// At a helm everybody sits in the same position (the owner's words of 2026-11-15 23:12): the "sit" clip is made here, in code,
// from each figure's idle clip (research step A2, fact A2-04: thighs, calves and arms turned about their own z axis).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';

export const OWNER = 'f01';                                                                    // at the player's own helm
export const CREW = ['f02', 'f03', 'f06', 'f07', 'f08', 'f09', 'f10', 'f11', 'f12', 'f13', 'f14'];   // the others, in turn
// who plays this time: `count` codes for round n (the number of missions or races played before this one); offset shifts one
// role's turn against another's, so the first race's rivals are not the first mission's swimmers
// the seat: joint, radians about the joint's own z axis, laid over the idle clip (found with pictures, research A2: p1, p2)
export const SEAT = [['L_Thigh', 1.45], ['R_Thigh', 1.45], ['L_Calf', -1.5], ['R_Calf', -1.5], ['L_Upperarm', 1.25], ['R_Upperarm', 1.25], ['L_Forearm', 0.8], ['R_Forearm', 0.8]];
// a "sit" clip from an idle clip: the same tracks, with every key of the seat's joints turned by the seat's angle, so the
// figure still breathes and sways. Null when the clip has none of those joints (another rig)
export function seatClip(idle) {
  const q = new THREE.Quaternion(), r = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1); let turned = 0;
  const tracks = idle.tracks.map((t) => {
    const c = t.clone(), s = SEAT.find(([j]) => t.name === j + '.quaternion'); if (!s) return c;
    r.setFromAxisAngle(Z, s[1]); turned++;
    for (let i = 0; i < c.values.length; i += 4) { q.fromArray(c.values, i).multiply(r).toArray(c.values, i); }
    return c;
  });
  return turned ? new THREE.AnimationClip('sit', idle.duration, tracks) : null;
}
export function crewFor(n, count, offset = 0) { const out = []; for (let k = 0; k < count; k++) out.push(CREW[((n * count + offset + k) % CREW.length + CREW.length) % CREW.length]); return out; }

export class People {
  constructor(base = './assets/') { this.base = base; this.src = new Map(); this.pending = new Map(); this.failed = new Set(); this.keep = null; this.loader = new GLTFLoader(); }
  // the model of one figure; the promise gives null when the file does not arrive (the game goes on without that figure)
  load(id) {
    if (this.src.has(id)) return Promise.resolve(this.src.get(id));
    if (this.pending.has(id)) return this.pending.get(id);
    const p = this.loader.loadAsync(`${this.base}models/people/${id}.glb`).then((g) => {
      g.scene.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.material.envMapIntensity = 1; o.material.metalness = 0; o.material.roughness = 0.85; } });
      g.scene.updateMatrixWorld(true); const box = new THREE.Box3();
      g.scene.traverse((o) => { if (o.isSkinnedMesh) { o.computeBoundingBox(); box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
      for (const c of g.animations) lightClip(c);
      const idle = g.animations.find((c) => c.name === 'idle'), sit = idle ? seatClip(idle) : null; if (sit) g.animations.push(sit);
      const s = { id, scene: g.scene, clips: g.animations, height: box.max.y - box.min.y, minY: box.min.y };
      if (this.keep && !this.keep.has(id)) { disposeModel(s.scene); return null; }      // no longer wanted by the time it arrived
      this.src.set(id, s); return s;
    }).catch((e) => { this.failed.add(id); console.warn(`crew model ${id} not loaded: ${e && e.message}`); return null; }).finally(() => this.pending.delete(id));
    this.pending.set(id, p); return p;
  }
  // one figure, `height` metres tall, feet at the holder's origin, looking along the holder's +z (the models look along +x).
  // null until its model has arrived
  make(id, height) {
    const S0 = this.src.get(id); if (!S0) return null;
    const root = cloneRig(S0.scene), k = height / S0.height, hold = new THREE.Group();
    root.scale.setScalar(k); root.position.y = -S0.minY * k; root.rotation.y = -Math.PI / 2; hold.add(root); hold.rotation.order = 'YXZ';
    root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    const mixer = new THREE.AnimationMixer(root), act = {}; for (const c of S0.clips) act[c.name] = mixer.clipAction(c);
    return { id, hold, root, mixer, act, clip: '', until: 0, n: 0, acc: 0, skip: 0 };
  }
  // a figure that leaves the picture: its skeleton holds a texture of its own on the graphics card, which must be given back
  // (twelve race starts grew the card's textures by one a figure before this: the smoke test's memory check)
  free(one) { if (!one) return; one.mixer.stopAllAction(); one.hold.removeFromParent(); one.root.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.dispose(); }); }
  // the models to keep: every other one is given back to the graphics card, so the whole cast is never held at once
  keepOnly(ids) { this.keep = new Set(ids); for (const [id, s] of this.src) if (!this.keep.has(id)) { disposeModel(s.scene); this.src.delete(id); } }
}
function disposeModel(root) { root.traverse((o) => { if (!o.isMesh) return; o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) { for (const v of Object.values(m)) if (v && v.isTexture) v.dispose(); m.dispose(); } if (o.skeleton) o.skeleton.dispose(); }); }
// A clip as the rig needs it: the turn of every joint, and the place of the hips only. The files carry place and size tracks
// for all 78 joints, three times the work a frame for nothing that shows (the smoke test's slow-processor check fell behind).
// (the hips: the joint whose height changes most over the clip, which is what lifts a hop)
export function lightClip(clip) {
  let hips = null, best = -1;
  for (const t of clip.tracks) { if (!t.name.endsWith('.position')) continue; const v = t.values; let lo = Infinity, hi = -Infinity; for (let i = 1; i < v.length; i += 3) { if (v[i] < lo) lo = v[i]; if (v[i] > hi) hi = v[i]; } if (hi - lo > best) { best = hi - lo; hips = t; } }
  clip.tracks = clip.tracks.filter((t) => t.name.endsWith('.quaternion') || t === hips); return clip;
}
// advance a figure's clip every `every` frames (with the time of the frames skipped): far figures move in coarser steps
export function tick(one, dt, every = 1) { one.acc += dt; one.skip = (one.skip + 1) % every; if (one.skip === 0) { one.mixer.update(one.acc); one.acc = 0; } }
// the clip a figure plays, changed with a short blend. The idle clip is the first four seconds of a longer one, so it runs
// there and back instead of jumping to its start
export function crewClip(one, name, speed = 1) {
  const a = one.act[name]; if (!a) return;
  if (one.clip !== name) {
    const old = one.act[one.clip]; if (old) old.fadeOut(0.2);
    a.reset(); a.setLoop(name === 'idle' || name === 'sit' ? THREE.LoopPingPong : THREE.LoopRepeat, Infinity); a.fadeIn(0.2).play(); a.time = (one.n * 0.61) % a.getClip().duration; one.clip = name;
  }
  a.timeScale = speed;
}
