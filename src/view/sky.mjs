// sky.mjs: one procedural sky for everything that needs it: the visible dome, the horizon haze of the sea, and an environment
// cube map that lights the boats and gives the sea its reflection colour. A "world" is a set of numbers (sun, colours, clouds, fog).
// No downloads: the cloud noise is made in the page. Written 2026-11-13 by the yacht project session.
import * as THREE from 'three';

const DEG = Math.PI / 180;
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// A tileable noise texture from a sum of whole-number sine waves (so it repeats without a seam). slope shapes the spectrum.
export function makeNoiseTexture({ size = 256, seed = 3, terms = 40, fmin = 1, fmax = 18, slope = 1.2, power = 1 } = {}) {
  const r = mulberry(seed), T = [];
  while (T.length < terms) {
    const m = Math.round((r() * 2 - 1) * fmax), k = Math.round((r() * 2 - 1) * fmax), f = Math.hypot(m, k);
    if (f < fmin || f > fmax) continue;
    T.push({ m, k, a: 1 / f ** slope, p: r() * 6.2832 });
  }
  const h = new Float32Array(size * size); let lo = 1e9, hi = -1e9;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    let s = 0; for (const t of T) s += t.a * Math.sin(6.2832 * (t.m * i / size + t.k * j / size) + t.p);
    h[j * size + i] = s; if (s < lo) lo = s; if (s > hi) hi = s;
  }
  const data = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) data[i] = Math.round(255 * Math.pow((h[i] - lo) / (hi - lo), power));
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true; tex.needsUpdate = true; return tex;
}

// Worlds: every number that sets a mood. Colours are linear RGB; the sun's strength reaches the bloom through the sea's glitter.
export const WORLDS = {
  sunset: { label: 'Golden hour', sunAz: 16, sunEl: 8, sunCol: [1.0, 0.60, 0.28], sunPow: 6.0, zenith: [0.045, 0.12, 0.36], horizon: [1.0, 0.54, 0.22],
    haze: [1.0, 0.50, 0.20], cloud: [0.50, 0.30, 0.55, 0.004], cloudLit: [1.0, 0.70, 0.50], cloudShade: [0.26, 0.17, 0.30],
    deep: [0.006, 0.034, 0.060], scatter: [0.0, 0.21, 0.22], foam: [1.0, 0.92, 0.84], fog: 0.0015, exposure: 0.92, light: 2.8, ambient: 1.0 },
  noon: { label: 'Tropical noon', sunAz: 150, sunEl: 52, sunCol: [1.0, 0.96, 0.88], sunPow: 3.2, zenith: [0.035, 0.20, 0.62], horizon: [0.50, 0.74, 0.92],
    haze: [0.85, 0.92, 1.0], cloud: [0.42, 0.22, 0.42, 0.003], cloudLit: [1.0, 1.0, 1.0], cloudShade: [0.52, 0.60, 0.74],
    deep: [0.005, 0.070, 0.130], scatter: [0.01, 0.44, 0.42], foam: [1.0, 1.0, 1.0], fog: 0.0011, exposure: 0.85, light: 3.2, ambient: 1.3 },
  // the bay of the rescue voyages at first light (0.8.0): the sun low over the sea, the land behind the boat
  dawn: { label: 'First light', sunAz: 8, sunEl: 7, sunCol: [1.0, 0.74, 0.44], sunPow: 5.5, zenith: [0.09, 0.19, 0.45], horizon: [1.0, 0.72, 0.48],
    haze: [1.0, 0.68, 0.46], cloud: [0.44, 0.26, 0.5, 0.003], cloudLit: [1.0, 0.82, 0.68], cloudShade: [0.36, 0.3, 0.44],
    deep: [0.008, 0.05, 0.085], scatter: [0.02, 0.33, 0.34], foam: [1.0, 0.95, 0.9], fog: 0.0010, exposure: 0.95, light: 2.6, ambient: 1.15 },
  // the third voyage begins as the sun goes down behind the volcano (0.8.0)
  agung: { label: 'Under the volcano', sunAz: 187, sunEl: 5, sunCol: [1.0, 0.5, 0.26], sunPow: 6.5, zenith: [0.03, 0.06, 0.2], horizon: [1.0, 0.46, 0.2],
    haze: [1.0, 0.42, 0.2], cloud: [0.5, 0.3, 0.52, 0.004], cloudLit: [1.0, 0.56, 0.4], cloudShade: [0.14, 0.1, 0.22],
    deep: [0.006, 0.02, 0.05], scatter: [0.02, 0.14, 0.2], foam: [1.0, 0.86, 0.8], fog: 0.0014, exposure: 0.98, light: 2.3, ambient: 0.85 },
  // the squall of the second voyage and the night of the third (0.8.0)
  squall: { label: 'Squall', sunAz: 150, sunEl: 30, sunCol: [0.75, 0.8, 0.86], sunPow: 1.2, zenith: [0.05, 0.07, 0.1], horizon: [0.3, 0.36, 0.42],
    haze: [0.36, 0.42, 0.48], cloud: [0.72, 0.4, 0.6, 0.012], cloudLit: [0.55, 0.6, 0.66], cloudShade: [0.1, 0.12, 0.16],
    deep: [0.004, 0.022, 0.034], scatter: [0.02, 0.16, 0.18], foam: [0.9, 0.95, 1.0], fog: 0.0030, exposure: 0.9, light: 1.3, ambient: 0.95 },
  night: { label: 'Night', sunAz: 200, sunEl: 24, sunCol: [0.55, 0.66, 0.92], sunPow: 1.0, zenith: [0.004, 0.008, 0.03], horizon: [0.03, 0.05, 0.11],
    haze: [0.04, 0.06, 0.12], cloud: [0.5, 0.3, 0.5, 0.004], cloudLit: [0.16, 0.2, 0.3], cloudShade: [0.01, 0.012, 0.03],
    deep: [0.001, 0.004, 0.012], scatter: [0.004, 0.03, 0.06], foam: [0.6, 0.7, 0.9], fog: 0.0020, exposure: 1.1, light: 0.55, ambient: 0.5 },
  dusk: { label: 'Neon dusk', sunAz: 12, sunEl: 3, sunCol: [1.0, 0.36, 0.30], sunPow: 7.0, zenith: [0.012, 0.014, 0.085], horizon: [0.95, 0.30, 0.26],
    haze: [1.0, 0.34, 0.30], cloud: [0.46, 0.32, 0.50, 0.005], cloudLit: [1.0, 0.44, 0.46], cloudShade: [0.05, 0.04, 0.13],
    deep: [0.006, 0.010, 0.040], scatter: [0.02, 0.10, 0.26], foam: [0.95, 0.82, 0.95], fog: 0.0017, exposure: 1.05, light: 2.0, ambient: 0.75 },
};

export const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uHaze;
uniform vec4 uCloud; uniform vec3 uCloudLit; uniform vec3 uCloudShade; uniform float uSkyTime; uniform sampler2D tNoise;
// gradient and sun glow: no sun disc and no clouds, so it is cheap enough for the sea's fog
vec3 skyBase(vec3 d) {
  float y = max(d.y, 0.0), t = pow(1.0 - y, 4.0);
  vec3 c = mix(uZenith, uHorizon, t);
  float sd = max(dot(d, uSunDir), 0.0);
  c += uHaze * (pow(sd, 5.0) * 0.55 * (0.3 + 0.7 * t) + pow(sd, 40.0) * 0.6);
  return c;
}
vec4 skyClouds(vec3 d) {
  if (d.y < 0.015) return vec4(0.0);
  vec2 p = d.xz / (d.y + 0.14) * uCloud.z + uSkyTime * uCloud.w * vec2(1.0, 0.4);
  float n = texture2D(tNoise, p).r * 0.5333 + texture2D(tNoise, p * 2.03 + 0.13).r * 0.2667 + texture2D(tNoise, p * 4.01 + 0.71).r * 0.1333 + texture2D(tNoise, p * 8.07 + 0.37).r * 0.0667;
  float edge = 1.0 - uCloud.x, a = smoothstep(edge, edge + uCloud.y, n) * smoothstep(0.015, 0.16, d.y);
  float sd = max(dot(d, uSunDir), 0.0), dens = clamp((n - edge) * 3.0, 0.0, 1.0);
  vec3 col = mix(uCloudLit * (0.75 + 0.7 * pow(sd, 3.0)), uCloudShade, dens * 0.8);
  col += uSunCol * pow(sd, 20.0) * (1.0 - dens) * 1.6;   // the bright rim of a cloud in front of the sun
  return vec4(col, a);
}
vec3 skyColor(vec3 d, float disc) {
  vec3 c = skyBase(d); vec4 cl = skyClouds(d); c = mix(c, cl.rgb, cl.a);
  float sd = max(dot(d, uSunDir), 0.0);
  c += uSunCol * smoothstep(0.99955, 0.99985, sd) * 60.0 * disc * (1.0 - 0.92 * cl.a);
  return c;
}
`;

const DOME_VS = 'varying vec3 vDir; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vDir = w.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * w; gl_Position.z = gl_Position.w; }';
const DOME_FS = `${SKY_GLSL}
uniform float uDisc; uniform vec3 uBelow; varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  vec3 c = skyColor(d, uDisc);
  // below the horizon (seen only by the environment cube): the sea's own dark colour, so hulls reflect water from below
  c = mix(c, uBelow, smoothstep(0.0, -0.12, d.y) * (1.0 - uDisc));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor(renderer, scene) {
    this.renderer = renderer; this.scene = scene; this.world = null;
    this.U = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Vector3(1, 1, 1) }, uZenith: { value: new THREE.Vector3() },
      uHorizon: { value: new THREE.Vector3() }, uHaze: { value: new THREE.Vector3() }, uCloud: { value: new THREE.Vector4(0.4, 0.3, 0.5, 0.004) },
      uCloudLit: { value: new THREE.Vector3(1, 1, 1) }, uCloudShade: { value: new THREE.Vector3(0.4, 0.4, 0.5) }, uSkyTime: { value: 0 },
      tNoise: { value: makeNoiseTexture({ seed: 17, terms: 46, fmin: 1, fmax: 14, slope: 1.35, power: 1.0 }) },
    };
    const mat = (disc) => new THREE.ShaderMaterial({ uniforms: { ...this.U, uDisc: { value: disc }, uBelow: { value: new THREE.Vector3() } },
      vertexShader: DOME_VS, fragmentShader: DOME_FS, side: THREE.BackSide, depthWrite: false });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), mat(1));
    this.dome.frustumCulled = false; this.dome.renderOrder = 10; scene.add(this.dome);
    // the environment: the same sky without the sun disc, rendered into a small cube map when the world changes
    this.envScene = new THREE.Scene();
    this.envDome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat(0)); this.envScene.add(this.envDome);
    this.cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this.cubeCam = new THREE.CubeCamera(0.1, 100, this.cubeRT);
    this.pmrem = new THREE.PMREMGenerator(renderer); this.envMap = null; this.envRT = null; this.bakes = 0;
    this.sunDir = this.U.uSunDir.value;
  }
  setWorld(w) {
    if (w === this.world && this.envMap) return;    // the same world: nothing to bake again (review r3, T-04)
    this.world = w;
    const az = w.sunAz * DEG, el = w.sunEl * DEG, U = this.U;
    U.uSunDir.value.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
    U.uSunCol.value.fromArray(w.sunCol); U.uZenith.value.fromArray(w.zenith); U.uHorizon.value.fromArray(w.horizon); U.uHaze.value.fromArray(w.haze);
    U.uCloud.value.fromArray(w.cloud); U.uCloudLit.value.fromArray(w.cloudLit); U.uCloudShade.value.fromArray(w.cloudShade);
    this.envDome.material.uniforms.uBelow.value.fromArray(w.deep).multiplyScalar(2.2);
    this.bakeEnvironment();
  }
  // the cube map for the sea's reflections and, filtered, the light on the boats (scene.environment)
  bakeEnvironment() {
    const r = this.renderer, tm = r.toneMapping; r.toneMapping = THREE.NoToneMapping;
    this.cubeCam.update(r, this.envScene);
    // keep the filtered target itself: only its own dispose() frees the GPU memory (disposing the texture alone leaks the target)
    const old = this.envRT; this.envRT = this.pmrem.fromCubemap(this.cubeRT.texture); this.envMap = this.envRT.texture;
    this.scene.environment = this.envMap; r.toneMapping = tm; this.bakes++;
    if (old) old.dispose();
  }
  update(camera, t) { this.U.uSkyTime.value = t; this.dome.position.copy(camera.position); }
  horizonColor(out = new THREE.Color()) { const w = this.world; return out.setRGB(w.horizon[0], w.horizon[1], w.horizon[2]); }
}
