// controls.mjs: the player's hands. Tilt (the phone held like a steering wheel, sim/tilt-input.mjs, signal B) with the thumbs on
// the screen: right half = boost (hold), left half = brake and slide (hold). Touch steering when there is no motion data or the
// player prefers it: the left thumb slides left and right, the right thumb boosts, no brake (review finding F05). Keys for a desk.
// Covers the tilt edge cases of the F1 analysis: a permission prompt that answers late or never (INPUT-04), sensor events that arrive late
// (INPUT-03: offered, never switched silently), a phone lying flat (INPUT-11), a recentre that does not jump (INPUT-10).
// Written 2026-11-13 by the yacht project session.
import { TiltInput } from '../sim/tilt-input.mjs?v=d21bc96f';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const now = () => performance.now();

export class Controls {
  constructor() {
    this.tilt = new TiltInput({ noDataMs: 1000 });
    this.mode = 'none';            // 'tilt', 'touch' or 'keys' once started
    this.prefer = 'auto';          // the player's setting: 'auto', 'tilt' or 'touch'
    this.steer = 0; this.brake = 0; this.boost = 0;
    this.perm = null; this.asking = false; this.started = false; this.flat = false; this.lostAt = null; this.tiltSeen = false;
    this.blend = 0; this.out = 0;
    this.t = { steerId: null, x0: 0, target: 0, value: 0, boost: new Set(), brake: new Set(), w: 800, range: 70 };
    this.k = { left: false, right: false, boost: false, brake: false, used: false, value: 0 };
    this.onChange = () => {};      // called when the mode changes by itself (data lost, late data)
    this.recentres = 0;
  }
  // Inside a tap handler: ask for motion access (one prompt grants motion and orientation on iPhone, S1-01). The answer is waited
  // for as long as the player takes: a 4 s limit once sent a slow reader of the prompt to touch steering for good (the outside
  // critic's test of 2026-11-14). `asking` is true until the answer is in: the screen says so and offers touch steering meanwhile,
  // which also covers a prompt that never answers (INPUT-04). The sensors are listened to from the answer on.
  start() {
    this.asking = true; this.perm = null;
    const answered = (perm) => {
      this.perm = perm; this.asking = false;
      if (!this.started) { this.tilt.attach(window); this.tilt.start(now()); this.started = true; }
      const refused = [perm.motion, perm.orientation].some((v) => v === 'denied' || String(v).startsWith('error'));
      if (refused || this.prefer === 'touch') this.mode = 'touch';
      return perm;
    };
    let ask; try { ask = TiltInput.requestPermission(window); } catch (e) { ask = Promise.reject(e); }
    return ask.then(answered, () => answered({ motion: 'error', orientation: 'error' }));
  }
  // 'asking' (the motion question is still open), 'waiting' (no event yet, under a second), 'tilt' (data flows) or 'touch' (no
  // data came, or refused)
  sensorState() {
    if (this.asking) return 'asking';
    if (!this.started) return 'waiting';
    const src = this.tilt.checkNoData(now());
    if (src === 'tilt') { this.tiltSeen = true; return this.mode === 'touch' ? 'touch' : 'tilt'; }
    if (this.mode === 'touch' || src === 'touch-auto') { this.mode = 'touch'; return 'touch'; }
    return 'waiting';
  }
  tiltAvailable() { return this.tilt.source === 'tilt' && ![this.perm && this.perm.motion, this.perm && this.perm.orientation].includes('denied'); }
  // sensor events are arriving right now (within half a second) and a straight-ahead pose exists: tilt can be switched back on
  tiltFresh(th = now()) { const last = Math.max(this.tilt.mot ? this.tilt.mot.th : 0, this.tilt.ori ? this.tilt.ori.th : 0); return this.tiltAvailable() && !!this.tilt.cal && th - last < 500; }
  calibrate(loose = false) { const r = this.tilt.calibrate(now(), 'calibrate', loose ? 6 : this.tilt.o.stillDeg); if (r.ok) { this.mode = 'tilt'; this.flat = false; } return r; }
  recentre() { const r = this.tilt.recentre(now()); if (r.ok) { this.blend = 0.2; this.recentres++; } return r; }
  setMode(m) { if (m === 'tilt' && !(this.tiltAvailable() && this.tilt.cal)) return false; this.mode = m; this.t.target = 0; this.t.steerId = null; return true; }
  setOptions({ maxDeg, invert }) { this.tilt.setOptions({ maxDeg, invert }); }
  // ---- pointer events of the play layer (w = its width in CSS px) ----
  down(id, x, w) {
    const T = this.t; T.w = w;
    if (x >= w * 0.5) { T.boost.add(id); return 'boost'; }
    if (this.mode === 'tilt') { T.brake.add(id); return 'brake'; }
    if (T.steerId === null) { T.steerId = id; T.x0 = x; T.target = 0; return 'steer'; }
    return null;
  }
  move(id, x) { const T = this.t; if (id === T.steerId) { T.target = clamp((x - T.x0) / T.range, -1, 1); const over = Math.abs(x - T.x0) - T.range; if (over > 0) T.x0 += Math.sign(x - T.x0) * over; } }
  up(id) { const T = this.t; T.boost.delete(id); T.brake.delete(id); if (id === T.steerId) { T.steerId = null; T.target = 0; } }
  releaseAll() { const T = this.t; T.boost.clear(); T.brake.clear(); T.steerId = null; T.target = 0; this.k.left = this.k.right = this.k.boost = this.k.brake = false; }
  key(code, down) {
    const K = this.k;
    if (code === 'ArrowLeft' || code === 'KeyA') K.left = down; else if (code === 'ArrowRight' || code === 'KeyD') K.right = down;
    else if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') K.boost = down; else if (code === 'ArrowDown' || code === 'KeyS' || code === 'ShiftLeft') K.brake = down; else return false;
    if (down && !K.used) { K.used = true; if (this.mode === 'none' || this.mode === 'touch') { this.mode = 'keys'; this.onChange('keys'); } }
    return true;
  }
  // once per frame: th = the frame's time (ms), dt in seconds
  sample(th, dt) {
    const T = this.t, K = this.k; let v = 0;
    if (this.mode === 'tilt') {
      const st = this.tilt.steer(th);
      if (st.source === 'no data') { this.flat = true; v = this.out * Math.max(0, 1 - 6 * dt); }      // the phone lies flat: ease to straight, the screen says so
      else if (String(st.source).startsWith('tilt')) { this.flat = false; v = st.value; }
      // sensor events stopped for a second and a half: touch takes over, and the game is told
      const lastEv = Math.max(this.tilt.mot ? this.tilt.mot.th : 0, this.tilt.ori ? this.tilt.ori.th : 0);
      if (th - lastEv > 1500) { this.mode = 'touch'; this.lostAt = th; this.onChange('touch-lost'); }
    } else if (this.mode === 'touch') {
      const rate = T.target === 0 ? 9 : 6.5;
      T.value += clamp(T.target - T.value, -rate * dt, rate * dt); v = T.value;
    } else if (this.mode === 'keys') {
      const tg = (K.right ? 1 : 0) - (K.left ? 1 : 0), rate = tg === 0 ? 7 : 4.5;
      K.value += clamp(tg - K.value, -rate * dt, rate * dt); v = K.value;
    }
    if (this.blend > 0) { this.blend = Math.max(0, this.blend - dt); v = this.out + (v - this.out) * (1 - this.blend / 0.2); }   // after a recentre: ease, no jump
    this.out = this.steer = clamp(v, -1, 1);
    this.boost = T.boost.size > 0 || K.boost ? 1 : 0;
    this.brake = (this.mode === 'tilt' && T.brake.size > 0) || K.brake ? 1 : 0;
  }
  info() {
    const I = this.tilt.info(), r = this.tilt.rates();
    return { mode: this.mode, prefer: this.prefer, perm: this.perm, flat: this.flat, recentres: this.recentres, tilt: I, rates: r, maxDeg: this.tilt.o.maxDeg, invert: this.tilt.o.invert };
  }
}
