// stage.mjs: everything the player sees in 3D: renderer and picture pipeline, sky, sea, boats with wakes and spray, the course's
// buoys, gates, ramps and scenery, and the chase camera. The simulation (sim/race-sim.mjs) decides what happens; the stage only
// shows it, interpolated between the last two physics steps so the picture is smooth at any frame rate.
// Written 2026-11-13 by the yacht project session.
import * as THREE from 'three';
import * as W from '../sim/waves.mjs?v=f12e6f3c';
import { pointInto, wrapA } from '../sim/courses.mjs?v=f12e6f3c';
import { Sky, WORLDS, makeNoiseTexture } from './sky.mjs?v=f12e6f3c';
import { Sea } from './sea.mjs?v=f12e6f3c';
import { Post } from './post.mjs?v=f12e6f3c';
import { Wake, Spray } from './fx.mjs?v=f12e6f3c';
import { loadYacht, BoatVisual } from './boats.mjs?v=f12e6f3c';
import { Scenery } from './scenery.mjs?v=f12e6f3c';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const ease = (dt, tau) => 1 - Math.exp(-dt / tau);

// Quality tiers. post: the bloom pipeline (needs half-float targets); msaa: samples of the scene target; first: the bloom's first
// level (a divisor of the scene size); seg: the sea grid; maxDpr caps the device pixel ratio. NOT_ASSESSED on a phone.
export const TIERS = {
  low: { post: false, msaa: 0, first: 4, seg: 96, foam: false, spray: 0.4, maxDpr: 1.5, rivalWakes: false },
  mid: { post: true, msaa: 0, first: 4, seg: 128, foam: true, spray: 0.8, maxDpr: 2, rivalWakes: true },
  high: { post: true, msaa: 4, first: 2, seg: 160, foam: true, spray: 1, maxDpr: 2, rivalWakes: true },
};
// Cameras. back/up: where the camera sits behind the boat; look/lookUp: the point it looks at ahead; fov0 + fovK at top speed;
// roll: how much it leans with the hull; lead: how far it looks into a turn.
export const CAMS = {
  chase: { label: 'Chase', back: 12.5, up: 4.3, look: 9, lookUp: 1.6, fov0: 60, fovK: 9, roll: 0, lead: 0.2 },
  high: { label: 'High', back: 17, up: 8.2, look: 14, lookUp: 0.6, fov0: 56, fovK: 5, roll: 0, lead: 0.4 },
  low: { label: 'Low', back: 9.5, up: 2.5, look: 10, lookUp: 1.8, fov0: 68, fovK: 14, roll: 0.3, lead: 0.15 },
};

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
    r.info.autoReset = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 2, 0.5, 6000);
    this.look = new THREE.Vector3();
    this.sky = new Sky(r, this.scene);
    this.sea = new Sea(r, this.scene, this.sky, { seg: 128, radius: 300, fade: [120, 290] });
    this.post = new Post(r, makeNoiseTexture({ seed: 31, terms: 36, fmin: 2, fmax: 20, slope: 0.8, power: 1.2 }));
    this.spray = new Spray(this.scene, { n: 1600 });
    this.hemi = new THREE.HemisphereLight(0xbcd8ff, 0x0b2a3a, 1); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2); this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.scene.fog = new THREE.FogExp2(0xffffff, 0.002);
    this.scenery = new Scenery(this.scene, this.sea);
    this.boats = [];           // { vis, wake, y, pitch, roll, x, z, h } per race boat
    this.yacht = null; this.world = null; this.worldKey = null; this.course = null; this.race = null;
    this.tierKey = 'mid'; this.tier = TIERS.mid; this.dpr = 1; this.cssW = 2; this.cssH = 2; this.scale = 1;
    this.cam = { key: 'chase', h: null, y: 0, fov: 60, shake: 0, drop: 0, dip: 0, motion: 1, orbit: 0, mode: 'chase', t: 0 };
    this.fx = { flash: 0, flashCol: [1, 1, 1], bloomPulse: 0, speed: 0, blur: 0 };
    this.time = 0; this.focus = 0;
    this._v = new THREE.Vector3(); this._o = [0, 0, 0];
    this.stats = { calls: 0, triangles: 0 };
  }
  async load(base = './assets/') {
    this.yacht = await loadYacht(base + 'models/yacht-b04.glb');
    await this.scenery.load(base + 'models/kit.glb');
    return { yacht: { triangles: this.yacht.triangles, ms: this.yacht.ms } };
  }
  // ---------- settings ----------
  setTier(key) {
    this.tierKey = TIERS[key] ? key : 'mid'; const T = this.tier = TIERS[this.tierKey];
    this.post.setQuality({ enabled: T.post, msaa: T.msaa, first: T.first });
    this.sea.setGrid(T.seg); this.sea.setQuality({ nmap: true, foam: T.foam });
    this.applySize();
    for (let i = 0; i < this.boats.length; i++) this.boats[i].wake.mesh.visible = i === this.focus || T.rivalWakes;
  }
  resize(cssW, cssH, dpr) { this.cssW = Math.max(2, cssW); this.cssH = Math.max(2, cssH); this.dpr = dpr || 1; this.applySize(); }
  // scale: the render scale the frame-rate governor chose (1 = full resolution of this tier)
  setScale(s) { const v = clamp(s, 0.4, 1); if (v === this.scale) return; this.scale = v; this.applySize(); }
  applySize() {
    const T = this.tier, pr = Math.min(this.dpr, T.maxDpr), post = this.post.enabled;
    // with the pipeline the page's canvas keeps its size and only the scene target scales; without it the canvas itself scales
    this.renderer.setPixelRatio(post ? pr : pr * this.scale);
    this.renderer.setSize(this.cssW, this.cssH, false);
    const v = this.renderer.getDrawingBufferSize(this._v2 || (this._v2 = new THREE.Vector2()));
    this.post.setSize(v.x, v.y); this.post.setScale(post ? this.scale : 1);
    this.camera.aspect = this.cssW / this.cssH; this.camera.updateProjectionMatrix();
    this.bufferH = post ? this.post.sh : v.y;
  }
  renderSize() { return this.post.enabled ? `${this.post.sw}x${this.post.sh}` : `${this._v2 ? this._v2.x : 0}x${this._v2 ? this._v2.y : 0}`; }
  setWorld(key) {
    const w = WORLDS[key] || WORLDS.sunset; this.world = w; this.worldKey = WORLDS[key] ? key : 'sunset';
    this.sky.setWorld(w); this.sea.setWorld(w);
    const s = this.sky.sunDir;
    this.sun.color.setRGB(w.sunCol[0], w.sunCol[1], w.sunCol[2]); this.sun.intensity = w.light;
    this.hemi.color.setRGB(w.zenith[0] * 2 + 0.3, w.zenith[1] * 2 + 0.3, w.zenith[2] * 2 + 0.3); this.hemi.groundColor.setRGB(w.deep[0] * 4, w.deep[1] * 4, w.deep[2] * 4); this.hemi.intensity = w.ambient;
    this.scene.fog.color.setRGB(w.horizon[0], w.horizon[1], w.horizon[2]); this.scene.fog.density = w.fog * 1.45;
    this.renderer.toneMappingExposure = w.exposure; this.post.fx.exposure = w.exposure;
    this.spray.U.uCol.value.fromArray(w.foam);
    this.scenery.setWorld(w, s);
  }
  setCourse(course) { this.course = course; this.scenery.setCourse(course); }
  // one visual per race boat; liveries: a livery key per boat; focus: the boat the camera follows
  setRace(race, liveries, focus = 0) {
    this.race = race; this.focus = focus;
    while (this.boats.length < race.boats.length) {
      const vis = new BoatVisual(this.yacht), wake = new Wake(this.scene, this.sea.U, { n: this.boats.length === 0 ? 120 : 80, stern: this.yacht.length * 0.44 });
      this.scene.add(vis.group); this.boats.push({ vis, wake, x: 0, y: 0, z: 0, h: 0, pitch: 0, roll: 0, u: 0 });
    }
    this.boats.forEach((B, i) => {
      const on = i < race.boats.length; B.vis.group.visible = on; B.wake.mesh.visible = on && (i === focus || this.tier.rivalWakes); B.wake.reset();
      if (on) B.vis.setLivery(liveries[i] || 'pearl');
    });
    this.sea.setWaves(race.waves); this.scenery.setRace(race);
    this.cam.h = null; this.cam.shake = 0; this.cam.drop = 0; this.cam.dip = 0;
  }
  // the ghost of a time trial: one more yacht, see-through, without wake or spray, posed from its own simulation
  setGhost(race) {
    this.ghost = race || null;
    if (race && !this.ghostVis) { this.ghostVis = new BoatVisual(this.yacht, 'mint'); this.ghostVis.setOpacity(0.36); this.scene.add(this.ghostVis.group); }
    if (this.ghostVis) this.ghostVis.group.visible = !!race;
  }
  setCamera(key, motion = 1) { if (CAMS[key]) this.cam.key = key; this.cam.motion = motion; }
  setCameraMode(mode) { if (this.cam.mode !== mode) { this.cam.mode = mode; this.cam.t = 0; } }
  // ---------- events from the simulation: flashes, bursts, gate colours ----------
  onEvent(e) {
    const race = this.race, me = e.i === this.focus;
    if (e.type === 'gate' || e.type === 'miss') { if (me) this.scenery.markGate(e.gate, e.type === 'gate'); }
    if (e.type === 'lap' && me) this.scenery.resetGates();
    if (e.type === 'land') {
      const b = race.boats[e.i], B = this.boats[e.i];
      this.spray.emit(b.x, b.y, b.z, b.h, b.u, me ? (e.clean ? 150 : 110) : 50, 6.5, 5.5, 0, b.P.beam * 0.5);
      if (me) { this.cam.dip = Math.min(1, e.impact / 10); this.cam.shake = Math.max(this.cam.shake, e.clean ? 0.35 : 0.8); if (e.clean) { this.fx.flash = 0.22; this.fx.flashCol = [1, 0.86, 0.55]; this.fx.bloomPulse = 1; } }
    }
    if (e.type === 'launch' && me) { this.cam.drop = 1; this.fx.bloomPulse = Math.max(this.fx.bloomPulse, 0.6); }
    if (e.type === 'boostOn' && me) { this.fx.flash = Math.max(this.fx.flash, 0.12); this.fx.flashCol = [1, 0.9, 0.7]; this.cam.shake = Math.max(this.cam.shake, 0.3); }
    if (e.type === 'contact' && (me || e.j === this.focus)) this.cam.shake = Math.max(this.cam.shake, Math.min(0.7, 0.15 + 0.15 * (e.v || 0)));   // a rub barely shakes the camera
    if (e.type === 'miss' && me) { this.fx.flash = 0.2; this.fx.flashCol = [1, 0.15, 0.1]; }
  }
  // ---------- one frame: alpha = how far the picture is between the last two physics steps; dt = real seconds since the last
  // frame (camera easing); tSim = simulation time for the sea ----------
  update(alpha, dt, tSim) {
    const race = this.race; if (!race) return;
    this.time += dt;
    const R = race.boats, sea = this.sea, wv = race.waves;
    for (let i = 0; i < R.length; i++) {
      const b = R[i], B = this.boats[i], P = b.P;
      B.x = b.px + (b.x - b.px) * alpha; B.z = b.pz + (b.z - b.pz) * alpha; B.y = b.py + (b.y - b.py) * alpha;
      B.h = b.ph + wrapA(b.h - b.ph) * alpha; B.pitch = b.ppitch + (b.pitch - b.ppitch) * alpha; B.roll = b.proll + (b.roll - b.proll) * alpha; B.u = b.u;
      // far from the camera the shader flattens the sea: lower the boat by the part of the wave that is no longer drawn
      const f = sea.fadeAt(B.x, B.z), yv = B.y - (1 - f) * (Number.isNaN(b.hull) ? 0 : b.hull);
      B.vis.setPose(B.x, yv, B.z, B.h, B.pitch * (0.3 + 0.7 * f), B.roll * (0.3 + 0.7 * f), P.draft);
    }
    if (this.ghost && this.ghostVis) {
      const b = this.ghost.boats[0];
      this.ghostVis.setPose(b.px + (b.x - b.px) * alpha, b.py + (b.y - b.py) * alpha, b.pz + (b.z - b.pz) * alpha, b.ph + wrapA(b.h - b.ph) * alpha, b.pitch, b.roll, b.P.draft);
    }
    const me = R[this.focus], M = this.boats[this.focus];
    this.placeCamera(me, M, dt);
    // a rival between the camera and the player's boat fades out instead of filling the screen
    for (let i = 0; i < R.length; i++) if (i !== this.focus) { const B = this.boats[i], d = Math.hypot(B.x - this.camera.position.x, B.z - this.camera.position.z); B.vis.setOpacity(this.cam.mode === 'orbit' ? 1 : smooth(3.5, 6.5, d)); }
    sea.update(this.camera, tSim); this.sky.update(this.camera, this.time);
    const T = this.tier;
    for (let i = 0; i < R.length; i++) {
      const b = R[i], B = this.boats[i];
      if (B.wake.mesh.visible) B.wake.update(B.x, B.z, B.h, b.air ? 0 : B.u, tSim, b.boostLv);
      const near = i === this.focus ? 1 : 0.5;
      this.spray.trail(i, B.x, B.y, B.z, B.h, B.u * (1 + 0.5 * b.boostLv), b.air, dt, T.spray * near, b.P.length * 0.26, b.P.beam * 0.46);
    }
    this.spray.update(dt, this.camera, this.bufferH || 600);
    this.scenery.update(race, tSim, this.camera, me, dt);
    // picture effects
    const fx = this.post.fx, F = this.fx, top = me.P.top, k = clamp(me.u / top, 0, 1.4), mo = this.cam.motion;
    F.flash = Math.max(0, F.flash - dt * 1.6); F.bloomPulse = Math.max(0, F.bloomPulse - dt * 1.4);
    fx.time = this.time; fx.flash = F.flash; this.post.final.material.uniforms.uFlashCol.value.fromArray(F.flashCol);
    fx.speed += ((smooth(0.82, 1.25, k) * 0.55 + me.boostLv * 0.6) * mo - fx.speed) * ease(dt, 0.2);
    fx.blur += (me.boostLv * mo - fx.blur) * ease(dt, 0.15);
    fx.bloom = 0.5 + 0.35 * me.boostLv + 0.5 * F.bloomPulse;
    fx.threshold = 1.0; fx.vignette = 0.28 + 0.18 * me.boostLv;
  }
  placeCamera(b, B, dt) {
    const cam = this.camera, C = CAMS[this.cam.key] || CAMS.chase, S = this.cam, P = b.P, mo = S.motion;
    S.t += dt;
    if (S.mode === 'orbit') {   // title and results: a slow circle around the boat
      S.orbit += dt * 0.16;
      const rad = 19, hgt = 4.2 + Math.sin(S.orbit * 0.7) * 1.2;
      cam.position.set(B.x + Math.sin(S.orbit) * rad, Math.max(1.6, B.y + hgt), B.z + Math.cos(S.orbit) * rad);
      this.look.set(B.x, B.y + 1.6, B.z); cam.up.set(0, 1, 0); cam.lookAt(this.look);
      if (Math.abs(cam.fov - 42) > 0.05) { cam.fov = 42; cam.updateProjectionMatrix(); }
      S.h = null; return;
    }
    // the camera looks mostly along the hull and 40 % toward the direction of travel, so a slide shows without going side-on
    const hv = Math.abs(b.u) > 2 ? B.h + 0.4 * wrapA(Math.atan2(-b.vx, b.vz) - B.h) : B.h;
    if (S.h === null) { S.h = hv; S.y = B.y; S.fov = C.fov0; }
    S.h = wrapA(S.h + wrapA(hv - S.h) * ease(dt, 0.18));
    S.y += (B.y - S.y) * ease(dt, b.air ? 0.25 : 0.5);                     // steady camera height; it follows a jump a little faster
    S.drop += ((b.air && b.rampAir ? 1 : 0) - S.drop) * ease(dt, b.air ? 0.25 : 0.5);   // the camera drops low during a ramp jump
    S.dip = Math.max(0, S.dip - dt * 3.2); S.shake = Math.max(0, S.shake - dt * 2.4);
    const drop = S.drop * mo, back = C.back * (1 - 0.18 * drop) * (1 - 0.06 * b.boostLv), up = C.up * (1 - 0.5 * drop) - 0.5 * S.dip * mo;
    const fx = -Math.sin(S.h), fz = Math.cos(S.h), lh = S.h + C.lead * clamp(b.r, -1.2, 1.2);
    const sh = S.shake * mo * 0.22, t = this.time;
    cam.position.set(B.x - fx * back + Math.sin(t * 47) * sh, Math.max(1.0, S.y + up + Math.sin(t * 61) * sh * 0.7), B.z - fz * back + Math.cos(t * 53) * sh);
    this.look.set(B.x - Math.sin(lh) * C.look, S.y + C.lookUp + (B.y - S.y) * 0.6, B.z + Math.cos(lh) * C.look);
    cam.up.set(0, 1, 0); cam.lookAt(this.look);
    if (C.roll) cam.rotateZ(-C.roll * B.roll * mo);
    const fov = C.fov0 + (C.fovK * clamp(b.u / P.top, 0, 1.25) + 7 * b.boostLv + 5 * drop) * (0.4 + 0.6 * mo);
    S.fov += (fov - S.fov) * ease(dt, 0.3);
    if (Math.abs(cam.fov - S.fov) > 0.05) { cam.fov = S.fov; cam.updateProjectionMatrix(); }
  }
  render() {
    const info = this.renderer.info; info.reset();
    this.post.render(this.scene, this.camera);
    this.stats.calls = info.render.calls; this.stats.triangles = info.render.triangles;
  }
}
