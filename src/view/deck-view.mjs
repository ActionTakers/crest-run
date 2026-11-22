// deck-view.mjs: what is seen of the level on the deck (sim/deck.mjs, "Iron Hawk"): the helicopter, its rockets, the lane of its
// pass lit on the water, the megalodon (swimming at the surface with its fin out while it circles, leaping when it is called), the gun in the player's
// hands, the bullets' lines and sparks, and the camera at the gunner's eyes. The helicopter, the megalodon and the gun are
// models (assets/models/deck/hawk.glb, megalodon.glb, gun.glb: made by the model service from pictures made from words, then
// worked on in Blender; assets/SOURCES.md): the owner's words of 2026-11-17 05:12:50, "made by tripo, finetuned by blender".
// The shapes drawn in code below (makeHeli, makeMeg, makeGun) are shown only when a model file does not arrive. What spins,
// glows and flies as light is code: effects. What the research step A8 asks of the picture: the boss's own body announces its attack and the
// place is lit (T18: the nose dips, the gun pod glows, a lane on the water); nothing drawn hides the target (T23: the
// eyes sit above the mast, the stagger bar clears the rotor, chips rise off the hull); the great moment is the leap (T25). NOT_ASSESSED on a phone or in a headset.
// Written 2026-11-17 by the yacht project session.
import * as THREE from 'three';
import * as W from '../sim/waves.mjs?v=4881be4d';
import { HAWK, DECK, aimDir } from '../sim/deck.mjs?v=4881be4d';
import { deckRange, damageChip, laneLook, passCountdown, threatEdge, impactRing, HULL_NEUTRAL, HULL_NEUTRAL_DARK, DECK_EYE, STAGGER_LIFT, chipWorldScale } from '../ui/deck-hud.mjs?v=4881be4d';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Parts, at, bar } from './jukung.mjs?v=4881be4d';

const C = { hull: HULL_NEUTRAL, hullD: HULL_NEUTRAL_DARK, glass: 0x9fd6ea, metal: 0x2a2e33, steel: 0x646c74, red: 0xb3262b, grey: 0x60717e, greyD: 0x43515d, belly: 0xe8edf0, gum: 0x7a2630, tooth: 0xf5f2e8, black: 0x0c0e10 };
// the three models: the file of each, and how long it is made along its own z (the nose, the muzzle), metres
export const MODELS = { hawk: ['models/deck/hawk.glb', 14], meg: ['models/deck/megalodon.glb', 24], gun: ['models/deck/gun.glb', 1.5] };
// a loaded model in a holder of its own: as long as asked along z, its middle at the holder's origin; half: its half sizes
function fit(scene, len) {
  scene.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(scene), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3()), k = len / Math.max(1e-6, size.z), g = new THREE.Group();
  scene.scale.multiplyScalar(k); scene.position.sub(mid.multiplyScalar(k)); g.add(scene); g.userData.half = size.multiplyScalar(k / 2); g.userData.model = true;
  g.traverse((m) => { m.frustumCulled = false; if (m.isMesh && m.material) { m.material.envMapIntensity = 1; } }); return g;
}
// (a model with a skeleton and a clip keeps its clips: the megalodon swims)
const MEG = { len: 24, r: 3.0, jawAt: 0.2 };                     // the megalodon: its length and greatest half-thickness, metres; where its jaw hinges (share of the length from the nose)
const megR = (t) => MEG.r * Math.pow(Math.sin(Math.PI * Math.pow(clamp(t, 0, 1), 0.68)), 0.85) + 0.1;
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const std = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2, ...o });
const glow = (r, g, b, o = {}) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), transparent: true, depthWrite: false, ...o });
// gold against the blue-grey airframe. The body is painted neutral; the rims stay gold.
const GOLD = new THREE.Color(1.15, 0.76, 0.22);
const FRESNEL_VS = 'varying vec3 vN; varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }';
const FRESNEL_FS = 'uniform vec3 uColor; varying vec3 vN; varying vec3 vW; void main() { float f = pow(1.0 - abs(dot(normalize(vN), normalize(cameraPosition - vW))), 2.1); gl_FragColor = vec4(uColor, f * 0.92); }';
function fresnelShell(radius) {
  const mat = new THREE.ShaderMaterial({ uniforms: { uColor: { value: GOLD.clone() } }, vertexShader: FRESNEL_VS, fragmentShader: FRESNEL_FS, transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), mat); mesh.frustumCulled = false; return mesh;
}
function goldRim(radius, tube = 0.14) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 28), new THREE.MeshBasicMaterial({ color: GOLD, toneMapped: false }));
  mesh.frustumCulled = false; return mesh;
}
function textCanvas(w, h) { const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; return canvas; }
function textSprite(w, h) {
  const canvas = textCanvas(w, h), tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  const sprite = new THREE.Sprite(mat); sprite.frustumCulled = false; sprite.userData.canvas = canvas; sprite.userData.tex = tex; return sprite;
}
function paintPlate(sprite, text, { size = 64, color = '#ffc24a', w = 256, h = 128 } = {}) {
  const canvas = sprite.userData.canvas, ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(6, 16, 28, 0.72)'; roundRect(ctx, 8, h * 0.18, w - 16, h * 0.64, 18); ctx.fill();
  ctx.font = `900 ${size}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(4, 10, 16, 0.95)'; ctx.strokeText(text, w / 2, h / 2);
  ctx.fillStyle = color; ctx.fillText(text, w / 2, h / 2); sprite.userData.tex.needsUpdate = true;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawThreatIcon(ctx, remain) {
  const s = 64, c = s / 2, r = 24; ctx.clearRect(0, 0, s, s);
  ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.strokeStyle = '#7ec8ff'; ctx.lineWidth = 4; ctx.stroke();
  ctx.beginPath(); const a0 = -Math.PI / 2; ctx.arc(c, c, r, a0, a0 + Math.max(0.02, remain) * Math.PI * 2);
  ctx.strokeStyle = '#ffc24a'; ctx.lineWidth = 5; ctx.stroke();
  ctx.fillStyle = '#ffc24a'; ctx.beginPath();
  ctx.moveTo(c, 8); ctx.lineTo(c + 9, 26); ctx.lineTo(c + 3.5, 26); ctx.lineTo(c + 3.5, 42); ctx.lineTo(c - 3.5, 42); ctx.lineTo(c - 3.5, 26); ctx.lineTo(c - 9, 26); ctx.closePath(); ctx.fill();
}
function prefersStill() { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; }
// The loaded helicopter keeps its shape. Its khaki paint is replaced so the body reads blue-grey and the gold rims stay the weak spots.
function tintHull(root) {
  root.traverse((m) => {
    if (!m.isMesh || !m.material) return;
    const list = Array.isArray(m.material) ? m.material : [m.material];
    const next = list.map((mat) => {
      if (!mat || !mat.color) return mat;
      const c = mat.color;
      if (c.b > c.r + 0.12 && c.b > c.g + 0.05 && !mat.map) return mat;
      const copy = mat.clone();
      copy.color.setHex(HULL_NEUTRAL);
      copy.map = null;
      if (copy.emissive) { copy.emissive.setHex(0x1c2630); copy.emissiveIntensity = 0.18; }
      if (copy.emissiveMap) copy.emissiveMap = null;
      copy.metalness = Math.min(copy.metalness == null ? 0.25 : copy.metalness, 0.35);
      copy.roughness = Math.max(copy.roughness == null ? 0.62 : copy.roughness, 0.55);
      copy.needsUpdate = true;
      return copy;
    });
    m.material = Array.isArray(m.material) ? next : next[0];
  });
}

// the helicopter: nose along +z, about 13 m long; its rotor, tail rotor and gun pod are parts of their own
function makeHeli() {
  const g = new THREE.Group(), b = new Parts(), S = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
  b.add(S(1), (i, x, y) => (y < -0.45 ? C.hullD : C.hull), at(0, 0, 0.6, 1.5, 1.45, 3.6));
  b.add(S(1, 12, 8), C.glass, at(0, 0.38, 3.05, 1.12, 0.92, 1.45)); b.add(S(1, 10, 8), C.hullD, at(0, 1.45, -0.2, 0.9, 0.6, 1.7));
  b.add(bar([0, 0.3, -2.2], [0, 0.9, -8.3], 0.32), C.hull); b.add(new THREE.BoxGeometry(0.14, 1.9, 1.1), C.hull, at(0, 1.7, -8.2, 1, 1, 1, 0.35));
  b.add(new THREE.BoxGeometry(2.6, 0.1, 0.7), C.hullD, at(0, 0.95, -7.3)); b.add(bar([0, 1.6, 0.2], [0, 2.55, 0.2], 0.14), C.steel);
  b.add(new THREE.BoxGeometry(4.8, 0.14, 0.9), C.hullD, at(0, -0.25, 0.4));
  for (const s of [-1, 1]) { b.add(new THREE.CylinderGeometry(0.32, 0.32, 1.7, 8), C.metal, at(s * 2.15, -0.55, 0.5, 1, 1, 1, Math.PI / 2)); b.add(bar([s * 1.1, -1.8, -1.7], [s * 1.1, -1.8, 2.1], 0.07), C.steel); b.add(bar([s * 0.9, -1.0, -1.0], [s * 1.1, -1.8, -1.0], 0.06), C.steel); b.add(bar([s * 0.9, -1.0, 1.4], [s * 1.1, -1.8, 1.4], 0.06), C.steel); }
  b.add(new THREE.BoxGeometry(0.55, 0.5, 1.5), C.metal, at(0, -1.7, 3.0)); b.add(bar([0, -1.75, 3.6], [0, -1.8, 5.0], 0.09), C.black);
  g.add(b.mesh(std(), 'hawk-body'));
  g.traverse((m) => { m.frustumCulled = false; }); return g;
}
// what spins and glows on the helicopter, whichever body it has: the blur of the rotor with two blades, the tail rotor, and
// the light at its gun pod that announces a pass. top, tail: where the rotor and the tail rotor sit ([x, y, z], metres)
function heliEffects(g, top = [0, 2.6, 0.2], tail = [0.4, 1.75, -8.4]) {
  const rotor = new THREE.Group(); rotor.name = 'hawk-rotor'; rotor.position.set(...top);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(6.5, 28), glow(0.08, 0.09, 0.1, { opacity: 0.2, side: THREE.DoubleSide })); disc.rotation.x = -Math.PI / 2; rotor.add(disc);
  for (const a of [0, Math.PI / 2]) { const bl = new THREE.Mesh(new THREE.BoxGeometry(12.8, 0.05, 0.34), new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 0.6 })); bl.rotation.y = a; rotor.add(bl); }
  g.add(rotor);
  const tr = new THREE.Mesh(new THREE.CircleGeometry(1.15, 16), glow(1.15, 0.76, 0.22, { opacity: 0.78, side: THREE.DoubleSide, toneMapped: false })); tr.name = 'hawk-tail'; tr.rotation.y = Math.PI / 2; tr.position.set(...tail); g.add(tr);
  tr.add(goldRim(1.28, 0.11)); tr.add(fresnelShell(1.35));
  const pl = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), glow(1.7, 1.15, 0.35, { opacity: 0.92, blending: THREE.AdditiveBlending, toneMapped: false })); pl.name = 'hawk-pod'; pl.position.set(0, -DECK.pod.down, DECK.pod.ahead); g.add(pl);
  const podRim = goldRim(1.45, 0.13); pl.add(podRim); pl.add(fresnelShell(1.7));
  g.traverse((m) => { m.frustumCulled = false; }); return g;
}
// the megalodon: nose along +z; grey above, pale below; the lower jaw is a part of its own that swings on a hinge
function makeMeg() {
  const g = new THREE.Group(), b = new Parts(), L = MEG.len, NS = 22, NR = 12, pos = [], idx = [];
  for (let i = 0; i <= NS; i++) { const t = i / NS, r = megR(t), z = L * (0.5 - t);
    for (let k = 0; k < NR; k++) { const a = (k / NR) * 2 * Math.PI, s = Math.sin(a); let y = r * s; if (t < MEG.jawAt && s < 0) y = Math.max(y, -0.18 * r);   // the roof of the mouth: the underside of the head is flat
      pos.push(r * 0.92 * Math.cos(a), y, z); } }
  for (let i = 0; i < NS; i++) for (let k = 0; k < NR; k++) { const a = i * NR + k, c = i * NR + (k + 1) % NR, d = a + NR, e = c + NR; idx.push(a, d, c, c, d, e); }
  const body = new THREE.BufferGeometry(); body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); body.setIndex(idx); body.computeVertexNormals();
  b.add(body, (i, x, y, z) => { const r = megR(0.5 - z / L), k = y / r; return k > 0.12 ? C.grey : k < -0.3 ? C.belly : C.greyD; });
  const fin = (h, w, m) => b.add(new THREE.ConeGeometry(w, h, 4), C.greyD, m);
  fin(3.8, 1.5, at(0, MEG.r + 1.2, 1.2, 0.16, 1, 1, 0.45)); fin(5.4, 1.5, at(0, 1.9, -L / 2 - 0.6, 0.15, 1, 1, 0.75)); fin(4.2, 1.3, at(0, -1.5, -L / 2 - 0.3, 0.15, 1, 1, Math.PI - 0.8));
  for (const s of [-1, 1]) { fin(4.6, 1.5, at(s * 3.4, -1.3, 3.4, 1, 1, 0.16, 0.5, 0, -s * 1.9)); b.add(new THREE.SphereGeometry(0.22, 8, 6), C.black, at(s * 1.75, 0.75, 9.3)); }
  const hz = L * (0.5 - MEG.jawAt), tooth = (parts, x, y, z, up) => parts.add(new THREE.ConeGeometry(0.17, 0.62, 4), C.tooth, at(x, y, z, 1, 1, 1, up ? 0 : Math.PI));
  for (let k = 0; k < 15; k++) { const f = -0.15 * Math.PI + (k / 14) * 1.3 * Math.PI; tooth(b, 1.75 * Math.cos(f), -0.55, hz + 2.2 + 2.1 * Math.sin(f), false); }
  g.add(b.mesh(std({ roughness: 0.42, metalness: 0.05 }), 'meg-body'));
  const jaw = new THREE.Group(); jaw.name = 'meg-jaw'; jaw.position.set(0, -0.45, hz); const j = new Parts();
  j.add(new THREE.SphereGeometry(1, 12, 6, 0, 2 * Math.PI, Math.PI / 2, Math.PI / 2), C.belly, at(0, 0, 2.3, 2.0, 1.5, 2.35));
  j.add(new THREE.CircleGeometry(1, 16), C.gum, at(0, 0.02, 2.3, 1.9, 2.25, 1, -Math.PI / 2));
  for (let k = 0; k < 15; k++) { const f = -0.15 * Math.PI + (k / 14) * 1.3 * Math.PI; tooth(j, 1.8 * Math.cos(f), 0.3, 2.3 + 2.15 * Math.sin(f), true); }
  jaw.add(j.mesh(std({ roughness: 0.5, metalness: 0, side: THREE.DoubleSide }), 'meg-jaw-mesh')); g.add(jaw);
  g.traverse((m) => { m.frustumCulled = false; }); return g;
}
// the gun: a heavy two-handed one, seen from behind; its muzzle is 1.35 m ahead of its grip
function makeGun() {
  const g = new THREE.Group(), b = new Parts();
  b.add(new THREE.BoxGeometry(0.16, 0.2, 0.62), C.metal, at(0, 0, 0.1)); b.add(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 10), C.steel, at(0, 0.02, 0.62, 1, 1, 1, Math.PI / 2));
  b.add(new THREE.CylinderGeometry(0.034, 0.034, 0.72, 8), C.black, at(0, 0.02, 1.0, 1, 1, 1, Math.PI / 2)); b.add(new THREE.BoxGeometry(0.1, 0.3, 0.16), C.black, at(0, -0.24, 0.08, 1, 1, 1, 0.2));
  b.add(new THREE.BoxGeometry(0.06, 0.2, 0.1), C.steel, at(0, -0.17, -0.2, 1, 1, 1, -0.3)); b.add(new THREE.BoxGeometry(0.07, 0.16, 0.08), C.steel, at(0, -0.16, 0.5, 1, 1, 1, 0.1));
  b.add(new THREE.BoxGeometry(0.03, 0.06, 0.03), C.steel, at(0, 0.13, 0.36)); b.add(new THREE.BoxGeometry(0.12, 0.12, 0.34), C.metal, at(0, 0.02, -0.36));
  g.add(b.mesh(std({ roughness: 0.45, metalness: 0.6 }), 'deck-gun'));
  g.traverse((m) => { m.frustumCulled = false; }); return g;
}

export class DeckView {
  constructor(scene, sea, spray, base = './assets/') {
    this.scene = scene; this.sea = sea; this.spray = spray; this.base = base; this.loader = new GLTFLoader(); this.models = null; this.loading = null;
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    this.hand = null;                                      // in the headset: the controller that holds the gun (the stage sets it)
    this.motion = 1;                                       // camera motion: 1 full, 0.4 calm (stage.mjs)
    this.deck = null; this.built = false; this.t = 0; this.vay = 0; this.vap = 0.12; this.kick = 0; this.flashT = 0; this.hitT = -9; this.wave = -1; this.waveAt = [0, 0]; this.held = false;
    this._o = new THREE.Object3D(); this._v = new THREE.Vector3(); this._m = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._M = new THREE.Matrix4();
    this._fwd = new THREE.Vector3(); this._right = new THREE.Vector3(); this._up = new THREE.Vector3(); this.rangeText = ''; this.countN = 0;
  }
  build(F) {
    const G = this.group, flat = (m) => { m.frustumCulled = false; G.add(m); return m; };
    // three holders; what stands in each comes with dress(): the model, or the shape of code if its file did not arrive
    this.heli = new THREE.Group(); G.add(this.heli); this.meg = new THREE.Group(); this.meg.visible = false; G.add(this.meg); this.jaw = null; this.fx = null;
    this.gun = new THREE.Group(); G.add(this.gun);
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), glow(6, 4, 1.4, { opacity: 0.9, blending: THREE.AdditiveBlending })); this.flash.frustumCulled = false; this.flash.renderOrder = 11; this.flash.position.set(0, 0.02, 1.42); this.flash.visible = false; this.gun.add(this.flash);
    const n = F.rockets.length;
    this.rockets = flat(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.26, 1.7, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: C.steel, roughness: 0.4, metalness: 0.5 }), n));
    this.flames = flat(new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 8, 6), glow(5, 2.6, 0.7, { opacity: 0.95, blending: THREE.AdditiveBlending }), n));
    this.rings = flat(new THREE.InstancedMesh(new THREE.TorusGeometry(1.9, 0.07, 5, 26), glow(3.4, 0.4, 0.25, { opacity: 0.9 }), n)); this.rings.renderOrder = 6;
    this.tracers = flat(new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, 0.04, 1).translate(0, 0, 0.5), glow(5, 4, 1.6, { opacity: 0.85, blending: THREE.AdditiveBlending }), 16)); this.tr = []; for (let i = 0; i < 16; i++) this.tr.push({ t: 9, life: 0.07, a: new THREE.Vector3(), b: new THREE.Vector3(), w: 1 });
    this.sparks = flat(new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 8, 6), glow(6, 3.4, 1, { opacity: 0.9, blending: THREE.AdditiveBlending }), 10)); this.sp = []; for (let i = 0; i < 10; i++) this.sp.push({ t: 9, life: 0.14, p: new THREE.Vector3(), s: 1 });
    this.lane = flat(new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), glow(2.1, 1.45, 0.4, { opacity: 0.62, side: THREE.DoubleSide, toneMapped: false }))); this.lane.renderOrder = 3; this.lane.visible = false;
    this.laneEdges = [-1, 1].map((side) => { const edge = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), glow(2.4, 1.7, 0.45, { opacity: 0.72, side: THREE.DoubleSide, toneMapped: false })); edge.position.x = side * 0.54; edge.scale.set(0.09, 1, 1); edge.renderOrder = 4; edge.frustumCulled = false; this.lane.add(edge); return edge; });
    this.shadow = flat(new THREE.Mesh(new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x020a14, transparent: true, opacity: 0, depthWrite: false }))); this.shadow.renderOrder = 2; this.shadow.visible = false;
    this.waveRing = flat(new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 6, 64).rotateX(Math.PI / 2), glow(1.4, 2.6, 3.4, { opacity: 0.9 }))); this.waveRing.visible = false;
    this.beam = flat(new THREE.Mesh(new THREE.ConeGeometry(1, 1, 18, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2), glow(2.2, 1.45, 0.4, { opacity: 0.12, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }))); this.beam.visible = false;
    // stagger, in the world above the helicopter: a gold bar on a blue track, the same reading as the HUD
    this.stagBar = new THREE.Group(); this.stagBar.name = 'hawk-stagger'; this.stagBar.renderOrder = 6;
    this.stagBg = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.6), new THREE.MeshBasicMaterial({ color: 0x16304a, transparent: true, opacity: 0.92, depthWrite: false, toneMapped: false }));
    const fillGeo = new THREE.PlaneGeometry(11.2, 1.85); fillGeo.translate(5.6, 0, 0.02);
    this.stagFill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0xffc24a, depthWrite: false, toneMapped: false }));
    this.stagFill.position.set(-5.6, 0, 0.05); this.stagBg.frustumCulled = false; this.stagFill.frustumCulled = false;
    this.stagBar.add(this.stagBg); this.stagBar.add(this.stagFill); G.add(this.stagBar);
    this.countMark = textSprite(256, 128); this.countMark.visible = false; this.countMark.renderOrder = 7; G.add(this.countMark);
    this.chips = []; for (let i = 0; i < 8; i++) { const s = textSprite(256, 128); s.visible = false; s.userData.t = 9; s.userData.life = 0.7; G.add(s); this.chips.push(s); }
    this.rangeLabel = textSprite(512, 128); this.rangeLabel.visible = false; this.rangeLabel.position.set(0, 0.34, 0.28); this.rangeLabel.scale.set(0.42, 0.105, 1); this.gun.add(this.rangeLabel);
    this.gunSight = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc24a, toneMapped: false })); this.gunSight.position.set(0, 0.1, 0.92); this.gunSight.visible = false; this.gun.add(this.gunSight);
    this.threats = []; this.threatHolder = new THREE.Group(); this.threatHolder.name = 'hawk-threats'; G.add(this.threatHolder);
    for (let i = 0; i < n; i++) {
      const canvas = textCanvas(64, 64), tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
      const s = new THREE.Sprite(mat); s.visible = false; s.frustumCulled = false; s.scale.set(0.18, 0.18, 1); this.threatHolder.add(s);
      this.threats.push({ canvas, tex, sprite: s, bucket: -1 });
    }
    this.built = true; this.dress();
  }
  // the three model files; the promise: all three have arrived or failed (a film waits for it, a player does not)
  load() {
    if (!this.loading) this.loading = Promise.all(Object.entries(MODELS).map(([k, [file, len]]) => this.loader.loadAsync(this.base + file).then((g) => { const m = fit(g.scene, len); m.userData.clips = g.animations || []; return m; }, (e) => { console.warn(`deck model ${k} not loaded: ${e && e.message}`); return false; })))
      .then(([hawk, meg, gun]) => { this.models = { hawk, meg, gun }; this.dress(); });
    return this.loading;
  }
  // puts into each holder what is there to show: nothing while the files are on their way; then the model, or the shape of code
  dress() {
    if (!this.built || !this.models || this.dressed) return; this.dressed = true; const M = this.models;
    const hawk = M.hawk || makeHeli(), H = hawk.userData.half; if (M.hawk) tintHull(hawk); this.heli.add(hawk);
    this.fx = heliEffects(new THREE.Group(), H ? [0, H.y + 0.15, 0.06 * H.z] : undefined, H ? [0.45, 0.62 * H.y, -0.93 * H.z] : undefined); this.heli.add(this.fx);
    this.rotor = this.fx.getObjectByName('hawk-rotor'); this.tailRotor = this.fx.getObjectByName('hawk-tail'); this.pod = this.fx.getObjectByName('hawk-pod');
    const meg = M.meg || makeMeg(); this.meg.add(meg); this.jaw = meg.getObjectByName('meg-jaw') || null; this.megHalf = meg.userData.half || new THREE.Vector3(MEG.r, MEG.r, MEG.len / 2);
    const clip = (meg.userData.clips || [])[0]; this.mixer = clip ? new THREE.AnimationMixer(meg) : null; if (clip) this.mixer.clipAction(clip).play();          // its swimming move, round and round
    const gun = M.gun || makeGun(), g = gun.userData.half; if (g) gun.position.set(0, 0.1 - g.y, 1.05 - g.z); this.gun.add(gun); this.flash.position.set(0, g ? 0.1 - g.y : 0.02, g ? 1.1 : 1.42);
    this.gun.traverse((m) => { m.renderOrder = 10; });
  }
  // the fight to show, or null
  // (the promise: its models have arrived)
  setDeck(F) { this.deck = F || null; this.group.visible = !!this.deck; if (!this.deck) return Promise.resolve(); if (!this.built) this.build(F); this.t = 0; this.kick = 0; this.wave = -1; this.held = false; this.vay = F.input.ay; this.vap = F.input.ap; this.heli.visible = true; this.countN = 0; this.rangeText = ''; for (const q of this.tr) q.t = 9; for (const q of this.sp) q.t = 9; if (this.chips) for (const s of this.chips) { s.userData.t = 9; s.visible = false; } return this.load(); }
  seaY(wv, x, z, t) { const f = this.sea.fadeAt(x, z); return f > 0.01 ? W.heightFast(wv, x, z, t, 2) * f : 0; }
  muzzle(out) { this.gun.updateMatrixWorld(true); return out.copy(this.flash.position).applyMatrix4(this.gun.matrixWorld); }
  spark(x, y, z, s = 1, life = 0.14) { const q = this.sp.reduce((a, c) => (c.t > a.t ? c : a)); q.t = 0; q.life = life; q.s = s; q.p.set(x, y, z); }
  chipAt(e) {
    const F = this.deck; if (!F || !this.chips) return;
    const g = F.gunAt(), dist = Math.hypot(e.x - g.x, e.y - g.y, e.z - g.z), chip = damageChip(F, e.hit, dist);
    if (!chip) return;
    const s = this.chips.reduce((a, c) => (c.userData.t > a.userData.t ? c : a));
    s.userData.t = 0; s.userData.life = 0.9; s.userData.weak = chip.weak; s.userData.baseY = e.y + 3.2; s.position.set(e.x, s.userData.baseY, e.z); s.visible = true;
    const sc = chipWorldScale(chip.weak, 40); s.scale.set(sc.x, sc.y, 1);
    paintPlate(s, chip.text, { size: chip.weak ? 78 : 52, color: chip.gold ? '#ffc24a' : '#f4f7fb' });
  }
  // off-screen rockets: edge position and a ring that closes as impact nears. The page paints these; the headset draws them on the gun's view.
  threatMarkers(camera) {
    const F = this.deck, out = []; if (!F || !camera) return out;
    camera.updateMatrixWorld(true);
    camera.getWorldDirection(this._fwd);
    const c = camera.position;
    for (const q of F.rockets) {
      if (!q.on) continue;
      const behind = (q.x - c.x) * this._fwd.x + (q.y - c.y) * this._fwd.y + (q.z - c.z) * this._fwd.z <= 0.4;
      this._v.set(q.x, q.y, q.z).project(camera);
      const edge = threatEdge({ x: this._v.x, y: this._v.y, behind });
      if (!edge.off) continue;
      out.push({ ...edge, ...impactRing(q.t, q.T) });
    }
    return out;
  }
  // where the helicopter sits on this camera, for the HAWK edge tag
  hawkScreen(camera) {
    const F = this.deck; if (!F || !camera) return null;
    camera.updateMatrixWorld(true);
    camera.getWorldDirection(this._fwd);
    const c = camera.position;
    const behind = (F.x - c.x) * this._fwd.x + (F.y - c.y) * this._fwd.y + (F.z - c.z) * this._fwd.z <= 0.4;
    this._v.set(F.x, F.y, F.z).project(camera);
    return { x: this._v.x, y: this._v.y, behind };
  }
  line(x, y, z, w = 1, life = 0.07) { const q = this.tr.reduce((a, c) => (c.t / c.life > a.t / a.life ? c : a)); q.t = 0; q.life = life; q.w = w; this.muzzle(q.a); q.b.set(x, y, z); }
  onEvent(e, stage) {
    const F = this.deck; if (!F) return; const sp = this.spray, shake = (v) => { stage.cam.shake = Math.max(stage.cam.shake, v); };
    switch (e.type) {
      case 'dShot': this.line(e.x, e.y, e.z); this.kick = 1; this.flashT = 0.045; if (e.hit) { this.spark(e.x, e.y, e.z, e.hit === 'body' ? 0.4 : 0.75); this.chipAt(e); } break;
      case 'dRocketDown': this.spark(e.x, e.y, e.z, 3, 0.3); stage.fx.flash = Math.max(stage.fx.flash, 0.08); stage.fx.flashCol = [1, 0.8, 0.5]; break;
      case 'dRocketHit': sp.emit(e.x, 0.3, e.z, 0, 0, 70, 9, 5, 0, 2); if (e.hit) { shake(0.9); stage.fx.flash = 0.25; stage.fx.flashCol = [1, 0.3, 0.2]; } break;
      case 'dStrafe': shake(e.hit ? 1.1 : 0.3); if (e.hit) { stage.fx.flash = 0.3; stage.fx.flashCol = [1, 0.3, 0.2]; } break;
      case 'dBroken': stage.fx.bloomPulse = 1; stage.fx.flash = 0.2; stage.fx.flashCol = [1, 0.9, 0.5]; this.spark(F.x, F.y - 1.5, F.z, 2.2, 0.3); break;
      case 'dStun': stage.fx.bloomPulse = 1; shake(0.3); this.spark(F.x, F.y, F.z, 2.8, 0.35); break;
      case 'dHalf': stage.fx.bloomPulse = 1; stage.fx.flash = 0.22; stage.fx.flashCol = [0.5, 0.7, 1]; shake(0.6); break;
      case 'dFlare': { const d = aimDir(F.me.h, F.input.ay, F.input.ap), g = F.gunAt(); this.line(g.x + d.x * 140, g.y + d.y * 140, g.z + d.z * 140, 4, 0.5); stage.fx.flash = Math.max(stage.fx.flash, 0.12); stage.fx.flashCol = [1, 0.35, 0.3]; break; }
      case 'dBite': case 'dDevour': sp.emit(e.x, 0.3, e.z, 0, 0, 320, 18, 12, 0, 5); shake(1.4); stage.fx.flash = 0.35; stage.fx.flashCol = [0.6, 0.85, 1]; this.spark(F.x, F.y, F.z, 3.2, 0.4); this.wave = 0; this.waveAt = [e.x, e.z]; this.held = e.type === 'dDevour'; break;
      case 'dBreachMiss': sp.emit(e.x, 0.3, e.z, 0, 0, 220, 15, 10, 0, 4); shake(0.5); this.wave = 0; this.waveAt = [e.x, e.z]; break;
      case 'dCall': sp.emit(F.breach.x, 0.2, F.breach.z, 0, 0, 40, 5, 6, 0, 3); break;
      case 'dEnd': if (e.won) { stage.fx.bloomPulse = 1; stage.fx.flash = 0.35; stage.fx.flashCol = [1, 0.86, 0.55]; } break;
      default: break;
    }
  }
  // the camera at the gunner's eyes, raised and stepped aside so the mast and the sail do not cover the hawk (T23)
  placeCamera(cam, B, dt, look) {
    const F = this.deck, I = F.input, k = 1 - Math.exp(-dt / 0.04), fx = -Math.sin(B.h), fz = Math.cos(B.h);
    this.vay = wrapA(this.vay + wrapA(I.ay - this.vay) * k); this.vap += (I.ap - this.vap) * k;
    cam.position.set(B.x + fx * HAWK.gun.ahead + Math.cos(B.h) * DECK_EYE.side, B.y + HAWK.gun.up + DECK_EYE.up, B.z + fz * HAWK.gun.ahead + Math.sin(B.h) * DECK_EYE.side);
    const d = aimDir(B.h, this.vay, this.vap); look.set(cam.position.x + d.x * 50, cam.position.y + d.y * 50, cam.position.z + d.z * 50); cam.up.set(0, 1, 0); cam.lookAt(look); cam.rotateZ(-0.25 * B.roll);
    if (Math.abs(cam.fov - 64) > 0.05 || cam.near !== 0.12) { cam.fov = 64; cam.near = 0.12; cam.updateProjectionMatrix(); }
  }
  // the headset's rig: the player's feet on the foredeck, facing the bow; it travels and turns with the boat, and rides only a
  // third of the waves' rise and fall (a standing player's eyes come out near the gunner's 3 m)
  placeRig(rig, B, dt) {
    const fx = -Math.sin(B.h), fz = Math.cos(B.h); rig.position.set(B.x + fx * HAWK.gun.ahead + Math.cos(B.h) * DECK_EYE.side, 0.35 * B.y + HAWK.gun.up - 1.6 + DECK_EYE.up * 0.45, B.z + fz * HAWK.gun.ahead + Math.sin(B.h) * DECK_EYE.side); rig.rotation.set(0, Math.PI - B.h, 0); rig.updateMatrixWorld(true);
  }
  // one frame. dt: seconds of picture time; t: simulation time (the sea's); boat: the stage's pose of the player's boat
  update(dt, t, camera, boat) {
    const F = this.deck; if (!F) return; this.t += dt;
    const wv = F.race.waves, T = this.t, o = this._o, D = DECK, q = F.breach, M = this._M;
    // the helicopter (in the megalodon's jaws after the last leap)
    const hy = Math.atan2(F.nx, F.nz), stun = F.st === 'stun' || F.st === 'crip', ann = F.st === 'aim' || (F.st === 'pass' && !F.struck && !F.broken);
    if (!this.held) { this.heli.position.set(F.x, F.y + (stun ? 0.5 * Math.sin(T * 9) : 0), F.z); this.heli.rotation.set(F.st === 'aim' || F.st === 'pass' ? 0.26 : stun ? 0.1 * Math.sin(T * 5) : 0.08, hy, F.st === 'orbit' || F.st === 'climb' ? -0.3 * F.dir : stun ? 0.25 * Math.sin(T * 3.3) : 0, 'YXZ'); }
    const still = prefersStill() || this.motion < 0.999;
    if (this.fx) { this.rotor.rotation.y += dt * (stun ? 14 : 38); this.tailRotor.rotation.x += dt * 50; this.pod.scale.setScalar(1); this.pod.material.opacity = !still && ann ? 0.84 + 0.14 * Math.sin(T * 2.2) : 0.92; }
    // the lane of the pass, lit on the water, and the beam from the helicopter to the boat
    this.lane.visible = ann; this.beam.visible = ann;
    if (ann) { this.lane.position.set(boat.x, this.seaY(wv, boat.x, boat.z, t) + 0.12, boat.z); this.lane.rotation.y = hy; this.lane.scale.set(9, 1, 240);
      const look = laneLook(T, still); this.lane.material.opacity = look.lane; for (const edge of this.laneEdges) edge.material.opacity = look.edge;
      const P = F.part('pod', {}); this.beam.position.set(P.x, P.y, P.z); this.beam.lookAt(boat.x, boat.y + 1, boat.z); const len = Math.hypot(P.x - boat.x, P.y - boat.y, P.z - boat.z); this.beam.scale.set(len * 0.09, len * 0.09, len); }
    // rockets: each with its flame and a ring that faces the camera, so that it is seen against any sky
    F.rockets.forEach((r, i) => {
      if (!r.on) { M.makeScale(0, 0, 0); this.rockets.setMatrixAt(i, M); this.flames.setMatrixAt(i, M); this.rings.setMatrixAt(i, M); return; }
      o.position.set(r.x, r.y, r.z); o.lookAt(boat.x, boat.y + 1.6, boat.z); o.scale.setScalar(1); o.updateMatrix(); this.rockets.setMatrixAt(i, o.matrix);
      o.translateZ(-1.1); o.scale.setScalar(0.8 + 0.3 * Math.sin(T * 40 + i)); o.updateMatrix(); this.flames.setMatrixAt(i, o.matrix);
      o.position.set(r.x, r.y, r.z); o.quaternion.copy(camera.quaternion); o.scale.setScalar(1 + 0.15 * Math.sin(T * 8 + i)); o.updateMatrix(); this.rings.setMatrixAt(i, o.matrix);
    });
    this.rockets.instanceMatrix.needsUpdate = true; this.flames.instanceMatrix.needsUpdate = true; this.rings.instanceMatrix.needsUpdate = true;
    // the megalodon: a fin that circles the boat in the second half; its whole body when it leaps
    const t0 = 0.25, t1 = 2 * D.breachS - t0, u = q.on ? clamp((q.t - t0) / (t1 - t0), 0, 1) : -1, leaping = q.on && q.t > t0 && u < 1;
    const swims = F.half === 2 && !leaping && !F.over && !(q.on && q.t <= t0);        // it circles the boat at the surface, its fin out of the water
    this.meg.visible = leaping || swims; if (this.mixer && this.meg.visible) this.mixer.update(dt * (leaping ? 2.2 : 1));
    if (swims) { const a = F.fin, x = boat.x + Math.cos(a) * 38, z = boat.z + Math.sin(a) * 38; this.meg.position.set(x, this.seaY(wv, x, z, t) - this.megHalf.y + 3.3 + 0.35 * Math.sin(T * 1.3), z); this.meg.rotation.set(0.03 * Math.sin(T * 0.9), -a, 0, 'YXZ'); }
    this.shadow.visible = q.on && q.t <= t0 + 0.3; if (this.shadow.visible) { this.shadow.position.set(q.x, this.seaY(wv, q.x, q.z, t) + 0.1, q.z); this.shadow.scale.setScalar(4 + 26 * q.t); this.shadow.material.opacity = Math.min(0.55, 1.6 * q.t); }
    if (leaping) {
      const top = (q.called ? Math.max(8, F.y) : 15) - 10.5, s = Math.sin(Math.PI * u), pitch = u < 0.5 ? 1.5 - 0.7 * u : 1.15 - 4.2 * (u - 0.5), yaw = Math.atan2(boat.x - q.x, boat.z - q.z) + 1.2;
      this.meg.position.set(q.x, -12 + (top + 12) * s, q.z); this.meg.rotation.set(-pitch, yaw, 0.3 * Math.sin(u * 3), 'YXZ');
      if (this.jaw) this.jaw.rotation.x = u < 0.46 ? 0.75 * Math.min(1, u * 5) : Math.max(0.04, 0.75 - 12 * (u - 0.46));   // (the model's jaws stand open)
      if (this.held) { this.meg.updateMatrixWorld(true); this._v.set(0, -0.2, MEG.len * 0.43).applyMatrix4(this.meg.matrixWorld); this.heli.position.copy(this._v); this.heli.rotation.set(-pitch + 0.6, yaw + 1.3, 0.9, 'YXZ'); }
    } else if (this.held && (!q.on || u >= 1)) { this.heli.visible = false; }
    // the ring of the splash
    if (this.wave >= 0) { this.wave += dt; const r = 6 + 60 * this.wave; this.waveRing.visible = this.wave < 1.6; this.waveRing.position.set(this.waveAt[0], this.seaY(wv, this.waveAt[0], this.waveAt[1], t) + 0.25, this.waveAt[1]); this.waveRing.scale.set(r, 1, r); this.waveRing.material.opacity = Math.max(0, 0.9 * (1 - this.wave / 1.6)); if (this.wave >= 1.6) this.wave = -1; } else this.waveRing.visible = false;
    // the gun in the player's hands: low and to the right of the eyes, along the camera; it kicks, and dips while it is reloaded
    this.kick = Math.max(0, this.kick - dt * 14); this.flashT -= dt; this.flash.visible = this.flashT > 0;
    const dip = F.reload > 0 ? Math.sin(Math.PI * clamp(1 - F.reload / F.gun.reloadS, 0, 1)) : 0, show = !F.over;
    this.gun.visible = show;
    if (this.hand) {       // in the headset the gun is in the hand: along the controller, its grip at the hand
      this.hand.updateWorldMatrix(true, false); this.hand.matrixWorld.decompose(this.gun.position, this.gun.quaternion, this._s); this.gun.rotateY(Math.PI); this.gun.rotateX(0.4 * dip - 0.03 * this.kick); this.gun.translateZ(-0.12 - 0.04 * this.kick);
    } else {
      this.gun.quaternion.copy(camera.quaternion); this.gun.rotateY(Math.PI); this.gun.rotateX(0.55 * dip - 0.03 * this.kick);
      this._v.set(0.26, -0.3 - 0.12 * dip, -0.42 + 0.05 * this.kick).applyQuaternion(camera.quaternion); this.gun.position.copy(camera.position).add(this._v);
    }
    // the bullets' lines and the sparks where they land
    this.tr.forEach((L, i) => { L.t += dt; if (L.t >= L.life) { M.makeScale(0, 0, 0); this.tracers.setMatrixAt(i, M); return; } o.position.copy(L.a); o.lookAt(L.b); o.scale.set(L.w, L.w, L.a.distanceTo(L.b)); o.updateMatrix(); this.tracers.setMatrixAt(i, o.matrix); });
    this.sp.forEach((S, i) => { S.t += dt; if (S.t >= S.life) { M.makeScale(0, 0, 0); this.sparks.setMatrixAt(i, M); return; } const k = S.s * (0.5 + 1.2 * S.t / S.life); o.position.copy(S.p); o.quaternion.identity(); o.scale.setScalar(k); o.updateMatrix(); this.sparks.setMatrixAt(i, o.matrix); });
    this.tracers.instanceMatrix.needsUpdate = true; this.sparks.instanceMatrix.needsUpdate = true;
    // stagger above the helicopter, a damage chip rising off a hit, the pass countdown on the lane
    const stunOnly = F.st === 'stun', ratio = stunOnly ? Math.max(0, 1 - F.t / D.stunS) : Math.min(1, Math.max(0, F.stag / D.stagger));
    this.stagBar.visible = this.heli.visible && !F.over;
    if (this.stagBar.visible) {
      const dist = Math.max(16, camera.position.distanceTo(this.heli.position)), k = Math.min(3.4, Math.max(1.65, dist / 46));
      this.stagBar.position.set(this.heli.position.x, this.heli.position.y + STAGGER_LIFT, this.heli.position.z);
      this.stagBar.scale.setScalar(k); this.stagBar.quaternion.copy(camera.quaternion);
      this.stagFill.scale.x = Math.max(0.001, ratio); this.stagFill.material.color.setHex(stunOnly ? 0xfff6d8 : 0xffc24a);
    }
    const cd = passCountdown(F); this.countMark.visible = ann && cd.n > 0;
    if (this.countMark.visible) {
      if (this.countN !== cd.n) { this.countN = cd.n; paintPlate(this.countMark, cd.label, { size: 92, color: '#ffc24a' }); }
      const dx = F.x - boat.x, dz = F.z - boat.z, len = Math.hypot(dx, dz) || 1, px = boat.x + dx / len * 34, pz = boat.z + dz / len * 34;
      this.countMark.position.set(px, this.seaY(wv, px, pz, t) + 6.5, pz);
      const ck = Math.max(0.6, camera.position.distanceTo(this.countMark.position) / 28); this.countMark.scale.set(3.4 * ck, 1.7 * ck, 1);
    } else this.countN = 0;
    for (const s of this.chips) {
      if (s.userData.t >= s.userData.life) { s.visible = false; continue; }
      s.userData.t += dt; s.visible = true; s.position.y = (s.userData.baseY || s.position.y) + s.userData.t * 4.5;
      const sc = chipWorldScale(!!s.userData.weak, Math.max(12, camera.position.distanceTo(s.position))); s.scale.set(sc.x, sc.y, 1);
      s.material.opacity = Math.max(0, 1 - s.userData.t / s.userData.life);
    }
    const range = deckRange(F), inVr = !!this.hand;
    this.gunSight.visible = inVr && show; if (this.gunSight.visible) this.gunSight.material.color.set(range.far ? 0x9aa3ab : 0xffc24a);
    this.rangeLabel.visible = inVr && !!range.far && show;
    if (this.rangeLabel.visible && this.rangeText !== range.label) { this.rangeText = range.label; paintPlate(this.rangeLabel, range.label, { size: 52, color: '#d5dbe2', w: 512, h: 128 }); }
    if (!this.rangeLabel.visible) this.rangeText = '';
    this.placeThreats(camera);
  }
  // in the headset the HTML arrows are not in view, so the same markers sit at the edge of the lens
  placeThreats(camera) {
    if (!this.threats) return;
    if (!this.hand) { for (const slot of this.threats) slot.sprite.visible = false; return; }
    const marks = this.threatMarkers(camera), dist = 1.35;
    camera.getWorldDirection(this._fwd); this._right.crossVectors(this._fwd, camera.up).normalize();
    if (this._right.lengthSq() < 1e-6) this._right.set(1, 0, 0);
    this._up.crossVectors(this._right, this._fwd).normalize();
    const halfH = Math.tan((camera.fov || 64) * Math.PI / 360) * dist, halfW = halfH * Math.max(0.6, camera.aspect || 1);
    for (let i = 0; i < this.threats.length; i++) {
      const slot = this.threats[i], m = marks[i];
      if (!m) { slot.sprite.visible = false; continue; }
      const bucket = Math.round(m.remain * 16);
      if (slot.bucket !== bucket) { slot.bucket = bucket; drawThreatIcon(slot.canvas.getContext('2d'), m.remain); slot.tex.needsUpdate = true; }
      const nx = (m.left / 100) * 2 - 1, ny = -((m.top / 100) * 2 - 1);
      slot.sprite.position.copy(camera.position).addScaledVector(this._fwd, dist).addScaledVector(this._right, nx * halfW).addScaledVector(this._up, ny * halfH);
      slot.sprite.material.rotation = -m.angle * Math.PI / 180; slot.sprite.visible = true;
    }
  }
}
