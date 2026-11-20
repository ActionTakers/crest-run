// jukung-model.mjs: the player's boat as Kiki's Monkey King jukung (v1.4.2), not the boat drawn in code.
// glTF is Y-up, metres, pivot on the waterline, bow toward +Z. COLOR_0 is a cloth pin mask: it is stripped so the
// sail keeps its baked albedo. The sail and ribbon stay in their bind pose (this build has no cloth). The lucky bird
// sits on SOCK_MAST_TIP and loops its idle clip. ?boat=mk loads the MonkeyKing sail; anything else is the sun sail.
// Written 2026-11-20.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const JUKUNG_URL = {
  sun: 'models/boats/jukung-a.glb',
  mk: 'models/boats/jukung-mk.glb',
};
export const BIRD_URL = 'models/boats/lucky-bird.glb';
const TILLER_MAX = 35 * Math.PI / 180;
const clips = new WeakMap();

export function jukungVariant(value) {
  const v = String(value || '').toLowerCase();
  return v === 'mk' || v === 'c' || v === 'monkeyking' ? 'mk' : 'sun';
}

// COLOR_0 / _PINWEIGHT are pin masks. Three.js would multiply COLOR_0 into the albedo and the sail would go black.
function stripPinColor(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry;
    if (geo) {
      if (geo.getAttribute('color')) geo.deleteAttribute('color');
      if (geo.getAttribute('_PINWEIGHT')) geo.deleteAttribute('_PINWEIGHT');
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (m) m.vertexColors = false;
    if (o.isSkinnedMesh) o.frustumCulled = false;
  });
}

function vec(o, fallback) {
  return o ? { x: o.position.x, y: o.position.y, z: o.position.z } : fallback;
}

export async function loadMonkeykingBoat(base, variant = 'sun') {
  const t0 = performance.now();
  const loader = new GLTFLoader();
  const which = jukungVariant(variant);
  const [boatGltf, birdGltf] = await Promise.all([
    loader.loadAsync(base + JUKUNG_URL[which]),
    loader.loadAsync(base + BIRD_URL),
  ]);
  const inner = boatGltf.scene;
  stripPinColor(inner);
  stripPinColor(birdGltf.scene);

  const hinge = inner.getObjectByName('SOCK_TILLER_HINGE');
  const tillerMesh = inner.getObjectByName('MK_tiller_LOD0') || inner.getObjectByName('MK_tiller_LOD2');
  if (hinge && tillerMesh) {
    const pivot = new THREE.Group();
    pivot.name = 'jk-tiller';
    pivot.position.copy(hinge.position);
    inner.add(pivot);
    pivot.attach(tillerMesh); // hinge stays the pivot; quantization may have moved the mesh node
  }

  const tip = inner.getObjectByName('SOCK_MAST_TIP');
  const birdPivot = new THREE.Group();
  birdPivot.name = 'jk-bird';
  if (tip) birdPivot.position.copy(tip.position);
  birdGltf.scene.name = 'jk-bird-arm';
  birdPivot.add(birdGltf.scene); // identity rotation: the bird's feet are on its own origin, forward +Z
  inner.add(birdPivot);

  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  let tris = 0;
  inner.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });

  const sockets = {
    seat: vec(inner.getObjectByName('SOCK_SEAT'), { x: 0, y: 0.58, z: -3.016 }),
    eye: vec(inner.getObjectByName('SOCK_SEAT_EYE'), { x: 0, y: 1.434, z: -2.662 }),
    mastTip: vec(tip, { x: -1.551, y: 10.55, z: -0.771 }),
    // foredeck, just off the sail (the cloth hangs to -x). y is the lookout's hip height.
    bow: { x: 0.12, y: 0.68, z: 3.35 },
  };
  const template = new THREE.Group();
  template.name = 'jukung-model';
  template.userData.monkeyking = true;
  template.userData.sockets = sockets;
  template.add(inner);
  const clip = birdGltf.animations.find((c) => c.name === 'idle') || birdGltf.animations[0] || null;
  if (clip) clips.set(template, clip);

  return {
    template, triangles: Math.round(tris), ms: Math.round(performance.now() - t0),
    length: size.z, beam: size.x, height: size.y, paint: false, monkeyking: true, variant: which,
    sockets, floatX: 2.9, wakeStern: Math.abs(box.min.z) * 0.96,
    // chase cameras were framed on the shorter boat; sit this much further aft of a 4 m stern
    cameraAft: Math.max(0, Math.abs(box.min.z) - 4.15),
  };
}

// One played copy. The template's clip is shared; the mixer belongs to this clone's bird.
export function bindMonkeykingBoat(group, model) {
  if (!model || !model.monkeyking) return;
  const clip = clips.get(model.template);
  const bird = group.getObjectByName('jk-bird-arm');
  if (clip && bird && !group.userData.birdMixer) {
    const mixer = new THREE.AnimationMixer(bird);
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    group.userData.birdMixer = mixer;
  }
  group.userData.tiller = group.getObjectByName('jk-tiller') || null;
  group.userData.monkeyking = true;
}

// s: { dt seconds, steer -1..1 (positive = to starboard) }
export function tickMonkeykingBoat(group, s) {
  const mixer = group.userData.birdMixer;
  if (mixer && s.dt) mixer.update(s.dt);
  const tiller = group.userData.tiller;
  if (tiller) {
    const steer = s.steer < -1 ? -1 : s.steer > 1 ? 1 : (s.steer || 0);
    tiller.rotation.y = -steer * TILLER_MAX;
  }
}
