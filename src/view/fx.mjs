// fx.mjs: what a moving hull does to the water: a V-shaped wake ribbon and spray. Based on shared/water-view.mjs of
// <local> (commit 26df76d, an earlier session); rewritten 2026-11-13 by the yacht project session with typed arrays
// and no per-frame allocation (F1 findings RENDER-06 and RENDER-07), a glow for the boost and bursts for landings.
import * as THREE from 'three';
import { SEA_POINT_GLSL } from './sea.mjs?v=ecb8b720';

// A wake: a ribbon behind a boat, rebuilt each frame from the boat's recent track (a ring of positions every dtw seconds).
export class Wake {
  constructor(scene, seaU, { n = 90, dtw = 0.08, stern = 4.4, spread = 0.2, maxHalf = 13 } = {}) {
    Object.assign(this, { n, dtw, stern, spread, maxHalf });
    this.tx = new Float32Array(n); this.tz = new Float32Array(n); this.th = new Float32Array(n); this.tu = new Float32Array(n); this.tt = new Float32Array(n);
    this.count = 0; this.head = -1; this.lastT = -Infinity;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 9);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const aw = new Float32Array(n * 6), idx = [];
    for (let i = 0; i < n; i++) { const a = 3 * i, b = a + 3, gg = i / (n - 1); aw.set([-1, gg, 0, gg, 1, gg], 6 * i); if (i < n - 1) idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2); }
    g.setAttribute('aw', new THREE.BufferAttribute(aw, 2)); g.setIndex(idx);
    this.U = { uTime: seaU.uTime, uCamPos: seaU.uCamPos, uFade: seaU.uFade, uWA: seaU.uWA, uWB: seaU.uWB, uWaveCount: seaU.uWaveCount, tFoam: seaU.tFoam,
      uFoamCol: seaU.uFoamCol, uSunDir: seaU.uSunDir, uStrength: { value: 1 }, uGlow: { value: 0 }, uGlowCol: { value: new THREE.Vector3(1.0, 0.75, 0.35) } };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: this.U, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      vertexShader: `${SEA_POINT_GLSL}\nuniform vec3 uCamPos; uniform vec2 uFade; attribute vec2 aw; varying vec2 vAw; varying vec3 vWorld;
void main() { vec3 pos, nrm; float jac; float fade = 1.0 - smoothstep(uFade.x, uFade.y, length(position.xz - uCamPos.xz));
  seaPoint(position.xz, fade, pos, nrm, jac); pos += nrm * 0.06; vAw = aw; vWorld = pos; gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0); }`,
      fragmentShader: `uniform sampler2D tFoam; uniform float uStrength; uniform float uGlow; uniform vec3 uGlowCol; uniform vec3 uFoamCol; varying vec2 vAw; varying vec3 vWorld;
void main() { float s = abs(vAw.x), age = vAw.y;
  float n = texture2D(tFoam, vWorld.xz / 3.1).r * 0.62 + texture2D(tFoam, vWorld.xz / 8.7 + 0.37).r * 0.38;
  float arms = smoothstep(0.60, 0.86, s) * smoothstep(1.0, 0.9, s) * pow(1.0 - age, 2.0);
  float churn = smoothstep(0.8, 0.05, s) * (1.0 - smoothstep(0.0, 0.2, age));   // churned water behind the stern
  float body = clamp(arms * 0.75 + churn, 0.0, 1.0);
  // foam, not paint: the noise cuts the ribbon into patches that thin out as the wake ages
  float a = smoothstep(0.42, 0.78, n + body * 0.8 - 0.3) * body * uStrength;
  vec3 col = uFoamCol * 0.9 + uGlowCol * uGlow * (churn * 3.0 + arms * 1.2);     // the boost lights the wake up (it blooms)
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`,
    }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; scene.add(this.mesh);
  }
  reset() { this.count = 0; this.head = -1; this.lastT = -Infinity; }
  // x, z, h (heading, forward = (-sin h, cos h)), u (speed), t (seconds), glow 0..1
  update(x, z, h, u, t, glow = 0) {
    const n = this.n; u = Math.max(0, u);
    if (t - this.lastT >= this.dtw || this.count === 0) { this.head = (this.head + 1) % n; if (this.count < n) this.count++; this.lastT = t; this.tt[this.head] = t; }
    const hd = this.head; this.tx[hd] = x; this.tz[hd] = z; this.th[hd] = h; this.tu[hd] = u;
    const a = this.pos, last = this.count - 1;
    for (let i = 0; i < n; i++) {
      const k = (hd - Math.min(i, last) + n) % n, ph = this.th[k], fx = -Math.sin(ph), fz = Math.cos(ph), rx = -Math.cos(ph), rz = -Math.sin(ph);
      const sx = this.tx[k] - fx * this.stern, sz = this.tz[k] - fz * this.stern, hw = i > last ? 0 : Math.min(this.maxHalf, 0.9 + this.spread * (t - this.tt[k]) * this.tu[k]), o = 9 * i;
      a[o] = sx - rx * hw; a[o + 1] = 0; a[o + 2] = sz - rz * hw; a[o + 3] = sx; a[o + 4] = 0; a[o + 5] = sz; a[o + 6] = sx + rx * hw; a[o + 7] = 0; a[o + 8] = sz + rz * hw;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.U.uStrength.value = Math.min(1, u / 10); this.U.uGlow.value = glow;
  }
}

// Spray: points thrown from the hull's sides in proportion to speed, plus bursts on landings. Simulated on the CPU in typed arrays;
// one draw call for all boats.
export class Spray {
  constructor(scene, { n = 900 } = {}) {
    this.n = n; this.next = 0;
    this.x = new Float32Array(n); this.y = new Float32Array(n).fill(-100); this.z = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.vz = new Float32Array(n);
    this.age = new Float32Array(n).fill(1); this.life = new Float32Array(n).fill(1);
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.aAge = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAge', new THREE.BufferAttribute(this.aAge, 1).setUsage(THREE.DynamicDrawUsage));
    this.U = { uScale: { value: 400 }, uCol: { value: new THREE.Vector3(1, 1, 1) } };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.U, transparent: true, depthWrite: false,
      // small droplets; points closer than 4 m to the camera fade out (a chase camera sits inside the spray)
      vertexShader: 'uniform float uScale; attribute float aAge; varying float vAge; varying float vNear; void main() { vec4 mv = viewMatrix * vec4(position, 1.0); vAge = aAge; vNear = smoothstep(1.5, 4.0, -mv.z); gl_PointSize = min(30.0, 0.085 * (0.7 + 1.6 * aAge) * uScale / max(-mv.z, 0.5)); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uCol; varying float vAge; varying float vNear; void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(uCol * 1.25, smoothstep(0.5, 0.05, d) * pow(1.0 - min(vAge, 1.0), 1.3) * 0.7 * vNear);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    }));
    this.points.frustumCulled = false; this.points.renderOrder = 3; scene.add(this.points);
    let s = 5; this.rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    this.acc = new Float32Array(16);   // per-boat emission remainders
  }
  // throws `count` droplets from both sides of a hull at (x, y, z) heading h moving at u
  emit(x, y, z, h, u, count, up = 4, out = 3, bow = 1.2, beam = 1.0) {
    const fx = -Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = -Math.sin(h), r = this.rnd;
    for (let k = 0; k < count; k++) {
      const i = this.next; this.next = (this.next + 1) % this.n;
      const side = r() < 0.5 ? -1 : 1, o = out * (0.6 + 0.8 * r()), f = Math.max(0, u) * (0.3 + 0.4 * r());
      this.x[i] = x + fx * bow + rx * side * beam; this.y[i] = y + 0.1; this.z[i] = z + fz * bow + rz * side * beam;
      this.vx[i] = rx * side * o + fx * f; this.vy[i] = up * (0.6 + 0.8 * r()); this.vz[i] = rz * side * o + fz * f;
      this.age[i] = 0; this.life[i] = 0.6 + 0.5 * r();
    }
  }
  // slot: the boat's index (its own emission remainder); rate scales the amount
  trail(slot, x, y, z, h, u, air, dt, rate, bow, beam) {
    if (air || u <= 6) return;
    this.acc[slot] += dt * rate * Math.min(520, u * 17);
    const k = Math.floor(this.acc[slot]); this.acc[slot] -= k;
    if (k > 0) this.emit(x, y, z, h, u, k, 2.5 + u * 0.12, 3, bow, beam);
  }
  update(dt, camera, bufferHeight) {
    const n = this.n, pos = this.pos, aa = this.aAge, drag = 1 - 1.2 * dt;
    for (let i = 0; i < n; i++) {
      if (this.age[i] < 1) {
        this.vy[i] -= 9.81 * dt; this.vx[i] *= drag; this.vz[i] *= drag;
        this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt; this.z[i] += this.vz[i] * dt; this.age[i] += dt / this.life[i];
      }
      const o = 3 * i; pos[o] = this.x[i]; pos[o + 1] = this.age[i] < 1 ? this.y[i] : -100; pos[o + 2] = this.z[i]; aa[i] = Math.min(1, this.age[i]);
    }
    this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.aAge.needsUpdate = true;
    this.U.uScale.value = bufferHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
  }
}
