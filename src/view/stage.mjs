// stage.mjs: everything the player sees in 3D: renderer and picture pipeline, sky, sea, boats with wakes and spray, the course's
// buoys, gates, ramps and scenery, and the chase camera. The simulation (sim/race-sim.mjs) decides what happens; the stage only
// shows it, interpolated between the last two physics steps so the picture is smooth at any frame rate.
// Written 2026-11-13 by the yacht project session.
import * as THREE from 'three';
import * as W from '../sim/waves.mjs?v=281086e4';
import { pointInto, wrapA } from '../sim/courses.mjs?v=281086e4';
import { Sky, WORLDS, makeNoiseTexture } from './sky.mjs?v=281086e4';
import { Sea } from './sea.mjs?v=281086e4';
import { Post } from './post.mjs?v=281086e4';
import { Wake, Spray } from './fx.mjs?v=281086e4';
import { loadYacht, BoatVisual } from './boats.mjs?v=281086e4';
import { Scenery } from './scenery.mjs?v=281086e4';
import { RescueView } from './rescue-view.mjs?v=281086e4';
import { People, crewClip, tick, JACK, CAST_H, SIT_HIP } from './people.mjs?v=281086e4';
import { BossView } from './boss-view.mjs?v=281086e4';
import { LeviathanView } from './leviathan-view.mjs?v=281086e4';
import { FLEET } from './fleet.mjs?v=281086e4';
import { Dash } from './dash.mjs?v=281086e4';
import { makeJukung, tickJukung } from './jukung.mjs?v=281086e4';
import { BayView } from './bay-view.mjs?v=281086e4';

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
// where a skipper stands on the yacht, as shares of its height (above the waterline) and its length (ahead of the middle)
export const HELM = { y: 0.47, z: -0.02, drop: 0.44 };   // drop: how far a seated skipper is lowered onto the helm seat, metres
export const BOW = { y: 0.6, z: 2.7 };                   // where the jukung's lookout sits: the height of his hips and how far ahead of the middle, metres
export const KING_UP = 0.12;                             // the king's hips over a crew figure's at the same seat, metres
export const CAMS = {
  chase: { label: 'Chase', back: 12.5, up: 4.3, look: 9, lookUp: 1.6, fov0: 60, fovK: 9, roll: 0, lead: 0.2 },
  high: { label: 'High', back: 17, up: 8.2, look: 14, lookUp: 0.6, fov0: 56, fovK: 5, roll: 0, lead: 0.4 },
  low: { label: 'Low', back: 9.5, up: 2.5, look: 10, lookUp: 1.8, fov0: 68, fovK: 14, roll: 0.3, lead: 0.15 },
  // from the driver's own eyes (0.6.0): the camera sits at the seated figure's head; without a figure it is the chase camera
  helm: { label: 'Helm', back: 12.5, up: 4.3, look: 9, lookUp: 1.6, fov0: 60, fovK: 9, roll: 0, lead: 0.2, eye: { fov: 86, ahead: 0.0, up: 0.1, down: 0.5, roll: 0.6, near: 0.12 } },
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
    this.people = new People(); this.skippers = [];        // the crew (view/people.mjs): one at each helm, when its model has arrived
    this.rescueView = new RescueView(this.scene, this.sea, this.spray, this.scenery, this.people); this.rescue = null; this.rescueLoad = null;
    this.bossView = new BossView(this.scene, this.sea, this.spray, this.people); this.boss = null; this.bossId = null;      // the boss level (sim/boss.mjs)
    this.leviView = new LeviathanView(this.scene, this.sea, this.spray); this.levi = null;                                 // the second boss level (sim/leviathan.mjs)
    this.bayView = new BayView(this.scene, this.sea, this.spray, this.scenery); this.voyage = null;                         // the rescue voyages in the bay (sim/voyage.mjs)
    this.boats = [];           // { vis, wake, y, pitch, roll, x, z, h } per race boat
    this.yacht = null; this.world = null; this.worldKey = null; this.course = null; this.race = null;
    this.tierKey = 'mid'; this.tier = TIERS.mid; this.dpr = 1; this.cssW = 2; this.cssH = 2; this.scale = 1;
    this.cam = { key: 'chase', h: null, y: 0, fov: 60, shake: 0, drop: 0, dip: 0, motion: 1, orbit: 0, mode: 'chase', t: 0 };
    this.fx = { flash: 0, flashCol: [1, 1, 1], bloomPulse: 0, speed: 0, blur: 0 };
    this.time = 0; this.focus = 0; this.lookAt = null;   // lookAt: the bearing the jukung's lookout points at (radians from the bow), or null
    this.jack = null; this.jackAt = null; this.jackId = null;   // Little Captain Jack of the voyages and where he is ('bow', 'boat', 'beach'): setJack
    this._v = new THREE.Vector3(); this._o = [0, 0, 0];
    this.stats = { calls: 0, triangles: 0 };
  }
  async load(base = './assets/') {
    this.base = base; this.yacht = await loadYacht(base + 'models/yacht-b04.glb'); this.yacht.key = 'yacht'; this.yacht.paint = true;
    this.dash = new Dash();                                                   // the display inside the cockpit (view/dash.mjs)
    this.fleet = { yacht: this.yacht }; this.fleetLoads = new Map();          // the other boats' models arrive when a race needs them
    await this.scenery.load(base + 'models/kit.glb');
    // the rescue level's models load behind the title screen; a start of that level waits for them (main.mjs)
    this.rescueLoad = this.rescueView.load(base).catch((e) => { console.warn('rescue models not loaded: ' + (e && e.message)); return false; });
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
  resize(cssW, cssH, dpr) {
    const w = Math.max(2, cssW), h = Math.max(2, cssH), d = dpr || 1;
    if (w === this.cssW && h === this.cssH && d === this.dpr) return;      // the same size again: no buffer is rebuilt
    this.cssW = w; this.cssH = h; this.dpr = d; this.applySize();
  }
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
    this.scenery.setWorld(w, s); this.bayView.setWorld(w);
  }
  setCourse(course) { this.course = course; this.scenery.setCourse(course); }
  // one visual per race boat; liveries: a livery key per boat; focus: the boat the camera follows
  setRace(race, liveries, focus = 0) {
    this.race = race; this.focus = focus;
    while (this.boats.length < race.boats.length) {
      const vis = new BoatVisual(this.yacht), wake = new Wake(this.scene, this.sea.U, { n: this.boats.length === 0 ? 120 : 80, stern: this.yacht.length * 0.44 });
      this.scene.add(vis.group); this.boats.push({ vis, wake, key: 'yacht', want: 'yacht', x: 0, y: 0, z: 0, h: 0, pitch: 0, roll: 0, u: 0 });
    }
    this.boats.forEach((B, i) => {
      const on = i < race.boats.length; B.vis.group.visible = on; B.wake.mesh.visible = on && (i === focus || this.tier.rivalWakes); B.wake.reset(); if (B.fw) for (const w of B.fw) { w.reset(); w.mesh.visible = false; }
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
  // the rescue level's creatures (sim/rescue.mjs), or null for a race
  // returns a promise: the crew's models of this mission have arrived (the film waits for it, a player does not)
  setRescue(rescue, crew = []) { this.rescue = rescue || null; this.crewIds = this.rescue ? crew.slice() : []; this.trimPeople(); return this.rescueView.setRescue(this.rescue, crew); }
  trimPeople() { this.people.keepOnly([...(this.skipperIds || []), ...(this.crewIds || []), this.bossId, this.jackId].filter(Boolean)); }
  // the boss level's fight and which of the crew is the boss, or null for none. The dragon's model must have arrived
  // (bossView.load). The promise: the boss's own model has arrived
  // the second boss level's fight, or null for none (its beast is made in code: nothing to load)
  setLevi(levi) { this.levi = levi || null; this.leviView.setLevi(this.levi); }
  // a rescue voyage in the bay, or null for none (everything of it is made in code: nothing to load)
  // (the promise: Little Captain Jack has arrived where this voyage has him; a film waits for it)
  setVoyage(v) { this.voyage = v || null; this.bayView.setVoyage(this.voyage, this.world); if (!this.voyage) this.lookAt = null; return this.setJack(!v ? null : v.key === 'mk1' ? 'bow' : v.key === 'mk3' && !v.jack ? 'beach' : 'boat'); }
  // Little Captain Jack (view/people.mjs): 'bow' = the lookout of the player's jukung, in the round monkey's place (the first
  // voyage); 'boat' = at the helm of his own boat, the first of the bay's other boats (the second voyage, and the third when
  // he comes with it); 'beach' = by his fire (the third, when he keeps it); null = nowhere. Until his model has arrived, and
  // if it never does, the round monkey keeps the lookout and a fisher of round shapes sits in his boat.
  setJack(where = null) {
    this.jackAt = where; this.jackId = where ? JACK : null; this.trimPeople();
    if (!where) { this.bayView.setJack(null); if (this.jack) { this.people.free(this.jack); this.jack = null; } return Promise.resolve(); }
    return this.people.load(JACK).then((src) => { if (!src || this.jackAt !== where) return; if (!this.jack) { this.jack = this.people.make(JACK, CAST_H.jack); this.jack.n = 5; } this.placeJack(); });
  }
  placeJack() {
    const J = this.jack; if (!J) return;
    if (this.jackAt !== 'bow') { this.bayView.setJack(J, this.jackAt); return; }
    this.bayView.setJack(null); const B = this.boats[this.focus]; if (!B) return;
    B.vis.group.add(J.hold); J.hold.position.set(0, BOW.y - (J.act.watch ? J.hip : 0), BOW.z); J.hold.rotation.set(0, 0, 0);
  }
  setBoss(boss, id = null) { this.boss = boss || null; this.bossId = this.boss ? id : null; this.trimPeople(); return this.bossView.setBoss(this.boss, this.bossId); }
  // a skipper at the helm of each yacht: ids[i] = the code of boat i's figure, or null for an empty helm. A figure appears when
  // its model has arrived; a boat that fades (a rival between the camera and the player) hides its skipper
  // ---------- the fleet (view/fleet.mjs): which boat each race boat is ----------
  // the model of one boat; the promise gives null when the file does not arrive (that boat stays a yacht)
  loadBoat(key) {
    if (this.fleet[key]) return Promise.resolve(this.fleet[key]);
    if (!FLEET[key]) return Promise.resolve(null);
    if (FLEET[key].make === 'jukung') { const t = makeJukung(); t.key = key; t.paint = false; this.fleet[key] = t; return Promise.resolve(t); }   // made in code: nothing to wait for
    if (!this.fleetLoads.has(key)) this.fleetLoads.set(key, loadYacht(this.base + 'models/' + FLEET[key].file, { length: FLEET[key].length, keel: FLEET[key].keel })
      .then((t) => { t.key = key; t.paint = FLEET[key].paint; this.fleet[key] = t; return t; }).catch((e) => { console.warn(`boat ${key} not loaded: ${e && e.message}`); this.fleetLoads.delete(key); return null; }));
    return this.fleetLoads.get(key);
  }
  // keys: a fleet key per race boat (missing: the yacht). A boat whose model is still on its way sails as it is until it
  // arrives. The promise: every model asked for has arrived (a film waits for it)
  setBoats(keys = []) {
    const waits = [];
    this.boats.forEach((B, i) => {
      const key = FLEET[keys[i]] ? keys[i] : 'yacht'; B.want = key;
      if (B.key === key) return;
      if (this.fleet[key]) return this.swapBoat(B, key);
      waits.push(this.loadBoat(key).then((t) => { if (t && B.want === key && B.key !== key) this.swapBoat(B, key); }));
    });
    return Promise.all(waits);
  }
  swapBoat(B, key) {
    const old = B.vis, vis = new BoatVisual(this.fleet[key], old.liveryKey);
    vis.group.position.copy(old.group.position); vis.group.rotation.copy(old.group.rotation); vis.group.visible = old.group.visible; if (old.opacity !== undefined) vis.setOpacity(old.opacity);
    this.scene.add(vis.group); this.scene.remove(old.group); old.dispose();
    B.vis = vis; B.key = key; B.wake.stern = this.fleet[key].length * 0.44;
    if (B.skipper) { vis.group.add(B.skipper.hold); this.seat(B, B.skipper); }
    if (this.jack && this.jackAt === 'bow' && B === this.boats[this.focus]) this.placeJack();
  }
  // a seated figure on its boat's seat
  // (the crew: lowered by the seat's drop; the two of the voyages: by their own hips, and the king a little higher, on the helm's thwart)
  seat(B, one) { const T = this.fleet[B.key] || this.yacht, s = FLEET[B.key].seat, own = CAST_H[one.id] !== undefined; one.hold.position.set(0, T.height * s.y + (!one.act.sit ? 0 : own ? SIT_HIP + KING_UP - one.hip : -s.drop), T.length * s.z); }
  setSkippers(ids = []) {
    this.skipperIds = ids.slice(); this.trimPeople(); const waits = [];
    this.boats.forEach((B, i) => {
      const id = ids[i] || null;
      if (B.skipper && B.skipper.id === id) return;
      if (B.skipper) { this.people.free(B.skipper); B.skipper = null; }
      if (!id) return;
      waits.push(this.people.load(id).then((src) => {
        if (!src || this.skipperIds[i] !== id || B.skipper) return;
        const one = this.people.make(id, CAST_H[id] || 1.9); one.n = i; this.seat(B, one); B.vis.group.add(one.hold); B.skipper = one;
      }));
    });
    return Promise.all(waits);       // the film waits for the figures, a player does not
  }
  setCamera(key, motion = 1) { if (CAMS[key]) this.cam.key = key; this.cam.motion = motion; }
  setCameraMode(mode) { if (this.cam.mode !== mode) { this.cam.mode = mode; this.cam.t = 0; } }
  // ---------- events from the simulation: flashes, bursts, gate colours ----------
  onEvent(e) {
    const race = this.race, me = e.i === this.focus;
    if (this.rescue) this.rescueView.onEvent(e, this);
    if (this.boss) this.bossView.onEvent(e, this);
    if (this.levi) this.leviView.onEvent(e, this);
    if (this.voyage) this.bayView.onEvent(e, this);
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
      if (B.key === 'jukung' && B.wake.mesh.visible) {
        if (!B.fw) B.fw = [-1, 1].map(() => new Wake(this.scene, this.sea.U, { n: 44, stern: 2.9, spread: 0.1, maxHalf: 3.2 }));
        const rx = -Math.cos(B.h), rz = -Math.sin(B.h); B.fw.forEach((w, k) => { const s = (k ? 1 : -1) * 2.75; w.mesh.visible = true; w.update(B.x + rx * s, B.z + rz * s, B.h, b.air ? 0 : B.u * 0.8, tSim, 0); });
      } else if (B.fw) for (const w of B.fw) w.mesh.visible = false;
      if (B.key === 'jukung') tickJukung(B.vis.group, { t: this.time + i * 1.7, u: B.u, top: b.P.top, turn: clamp(b.r, -1, 1), look: i === this.focus ? this.lookAt : null, own: !(i === this.focus && this.jack && this.jackAt === 'bow'), see: i === this.focus && !this.relCam && !this.debugCam && this.cam.mode !== 'orbit' && !(CAMS[this.cam.key] || {}).eye ? 0.8 : 1 });   // the sail, and the lookout's arm
      const near = i === this.focus ? 1 : 0.5;
      this.spray.trail(i, B.x, B.y, B.z, B.h, B.u * (1 + 0.5 * b.boostLv), b.air, dt, T.spray * near, b.P.length * 0.26, b.P.beam * 0.46);
    }
    for (let i = 0; i < R.length; i++) { const one = this.boats[i].skipper; if (!one) continue; one.hold.visible = (this.boats[i].vis.opacity === undefined || this.boats[i].vis.opacity > 0.6); if (one.hold.visible) { crewClip(one, one.act.sit ? 'sit' : 'idle'); const B = this.boats[i], far = i !== this.focus && (B.x - this.camera.position.x) ** 2 + (B.z - this.camera.position.z) ** 2 > 2500; tick(one, dt, far ? 8 : 2); } }   // a far rival's skipper moves in coarse steps
    if (this.jack && this.jackAt === 'bow') {     // the little captain on the bow: he turns to what the voyage names and points at it
      const J = this.jack, B = this.boats[this.focus], P = B.vis.group.userData.jk, has = this.lookAt !== null && Number.isFinite(this.lookAt);
      J.hold.visible = B.key === 'jukung' && (B.vis.opacity === undefined || B.vis.opacity > 0.6);
      if (J.hold.visible) { J.hold.rotation.y = P ? P.a * 0.55 : 0; crewClip(J, has && J.act.point ? 'point' : J.act.watch ? 'watch' : 'idle'); tick(J, dt, 1); }
    }
    this.spray.update(dt, this.camera, this.bufferH || 600);
    this.scenery.update(race, tSim, this.camera, me, dt);
    if (this.rescue) this.rescueView.update(dt, tSim, this.camera, M);
    if (this.boss) this.bossView.update(dt, tSim, this.camera, M);
    if (this.levi) this.leviView.update(dt, tSim, this.camera, M);
    if (this.voyage) { this.bayView.update(dt, tSim, this.camera, M); const K = this.voyage.look; this.lookAt = K ? wrapA(Math.atan2(-(K.x - M.x), K.z - M.z) - M.h) : null; }   // the lookout points at what the voyage names
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
    // test and film hook: a fixed camera { pos: [x, y, z], look: [x, y, z], fov }
    if (this.debugCam) { const D = this.debugCam; cam.position.fromArray(D.pos); this.look.fromArray(D.look); cam.up.set(0, 1, 0); cam.lookAt(this.look); if (cam.fov !== (D.fov || 50)) { cam.fov = D.fov || 50; cam.updateProjectionMatrix(); } S.h = null; return; }
    // film hook: a camera that travels with the boat { ahead, right, up (metres from its middle), lookAhead, lookRight, lookUp, fov }
    if (this.relCam) {
      const D = this.relCam, f1 = -Math.sin(B.h), f2 = Math.cos(B.h), r1 = -Math.cos(B.h), r2 = -Math.sin(B.h);
      cam.position.set(B.x + f1 * (D.ahead || 0) + r1 * (D.right || 0), Math.max(0.45, B.y + (D.up || 2)), B.z + f2 * (D.ahead || 0) + r2 * (D.right || 0));
      this.look.set(B.x + f1 * (D.lookAhead || 0) + r1 * (D.lookRight || 0), B.y + (D.lookUp === undefined ? 1.2 : D.lookUp), B.z + f2 * (D.lookAhead || 0) + r2 * (D.lookRight || 0)); cam.up.set(0, 1, 0); cam.lookAt(this.look);
      if (cam.fov !== (D.fov || 45)) { cam.fov = D.fov || 45; cam.updateProjectionMatrix(); } if (cam.near !== 0.3) { cam.near = 0.3; cam.updateProjectionMatrix(); } S.h = null; return;
    }
    if (S.mode === 'orbit') {   // title and results: a slow circle around the boat
      S.orbit += dt * 0.16;
      const rad = 19, hgt = 4.2 + Math.sin(S.orbit * 0.7) * 1.2;
      cam.position.set(B.x + Math.sin(S.orbit) * rad, Math.max(1.6, B.y + hgt), B.z + Math.cos(S.orbit) * rad);
      this.look.set(B.x, B.y + 1.6, B.z); cam.up.set(0, 1, 0); cam.lookAt(this.look);
      if (Math.abs(cam.fov - 42) > 0.05) { cam.fov = 42; cam.updateProjectionMatrix(); }
      S.h = null; return;
    }
    // from the driver's own eyes: at the seated figure's head, looking along the hull and a little down, leaning with the boat
    const own = this.boats[this.focus] && this.boats[this.focus].skipper, eye = C.eye && own ? C.eye : null;
    if (own) { const hb = own.headBone || (own.headBone = own.root.getObjectByName('Head')), k = eye ? 0.001 : 1; if (hb && hb.scale.x !== k) hb.scale.setScalar(k); }   // his own head is not drawn then
    const near = eye ? eye.near : 0.5; if (cam.near !== near) { cam.near = near; cam.updateProjectionMatrix(); }
    this.dash.mesh.visible = !!eye && !!this.dash.values;
    if (eye) {
      own.hold.updateWorldMatrix(true, true); const hb = own.headBone, fx = -Math.sin(B.h), fz = Math.cos(B.h);
      if (hb) hb.getWorldPosition(this._v); else own.hold.getWorldPosition(this._v);
      S.shake = Math.max(0, S.shake - dt * 2.4); S.dip = Math.max(0, S.dip - dt * 3.2);
      // the cockpit display: fixed to the boat, 0.6 m ahead of his eyes and 0.34 m below them, facing him and tilted up
      const boat = own.hold.parent, D = this.dash.mesh; if (D.parent !== boat) boat.add(D);
      this._d = this._d || new THREE.Vector3(); boat.worldToLocal(this._d.copy(this._v)); D.position.set(this._d.x, this._d.y - 0.36, this._d.z + 0.55); D.rotation.set(-0.8, Math.PI, 0, 'YXZ');
      cam.position.set(this._v.x + fx * eye.ahead, this._v.y + eye.up, this._v.z + fz * eye.ahead);
      this.look.set(cam.position.x + fx * 10, cam.position.y - 10 * eye.down, cam.position.z + fz * 10); cam.up.set(0, 1, 0); cam.lookAt(this.look); cam.rotateZ(-eye.roll * B.roll * mo);
      const fovE = eye.fov + 5 * b.boostLv * (0.4 + 0.6 * mo); if (Math.abs(cam.fov - fovE) > 0.05) { cam.fov = fovE; cam.updateProjectionMatrix(); }
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
