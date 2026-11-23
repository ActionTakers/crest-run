// sea.mjs: the water of the game. A camera-centred grid with Gerstner waves (the same waves the boats float on, sim/waves.mjs),
// detail normals, foam where crests pinch, light scattered through crests, sun glitter, a reflection of the sky's environment cube
// and haze toward the horizon. Based on shared/water-view.mjs of <local> (commit 26df76d, an earlier session); rewritten
// 2026-11-13 by the yacht project session: environment reflection instead of a sky formula per pixel, world colours, no per-frame
// allocation. Browser only (imports 'three' through the page's import map).
import * as THREE from 'three';
import * as W from '../sim/waves.mjs?v=03fa7436';
import { SKY_GLSL, makeNoiseTexture } from './sky.mjs?v=03fa7436';

function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function makeNormalTexture(N = 256) {   // a tileable normal map from whole-number sine waves (repeats without a seam)
  const r = mulberry(11), T = [];
  while (T.length < 26) { const m = Math.round((r() * 2 - 1) * 14), k = Math.round((r() * 2 - 1) * 14), f = Math.hypot(m, k); if (f < 2 || f > 14) continue; T.push({ m, k, a: 1 / f ** 1.4, p: r() * 6.2832 }); }
  const data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let du = 0, dv = 0;
    for (const t of T) { const c = t.a * Math.cos(6.2832 * (t.m * i / N + t.k * j / N) + t.p) * 6.2832; du += c * t.m; dv += c * t.k; }
    let nx = -du * 0.012, ny = -dv * 0.012, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = 4 * (j * N + i); data[o] = nx * 127.5 + 127.5; data[o + 1] = ny * 127.5 + 127.5; data[o + 2] = nz * 127.5 + 127.5; data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true; tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true; return tex;
}

// The sea's surface point for a grid point: the ONE place where the drawn sea reads the clock. The water, the wakes and the
// smoke test's probe all call it, so a sea that drifts away from the simulated sea shows up in the probe.
export const SEA_POINT_GLSL = /* glsl */ `
${W.WAVE_GLSL}
uniform float uTime;
void seaPoint(vec2 xz, float fade, out vec3 pos, out vec3 nrm, out float jac) { gerstner(xz, uTime, fade, pos, nrm, jac); }
`;
export const WATER_VS = /* glsl */ `
${SEA_POINT_GLSL}
uniform vec3 uCamPos; uniform vec2 uFade;
varying vec3 vWorld; varying vec3 vNrm; varying float vJac;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vec3 pos = w.xyz, nrm = vec3(0.0, 1.0, 0.0); float jac = 1.0;
#ifdef WAVES
  float fade = 1.0 - smoothstep(uFade.x, uFade.y, length(w.xz - uCamPos.xz));
  seaPoint(w.xz, fade, pos, nrm, jac);
  pos.y += w.y;
#endif
  vWorld = pos; vNrm = nrm; vJac = jac;
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}
`;
export const WATER_FS = /* glsl */ `
${SKY_GLSL}
uniform float uTime; uniform vec3 uCamPos; uniform float uSunPow; uniform float uFogDen;
uniform vec3 uDeep; uniform vec3 uScatter; uniform vec3 uFoamCol;
uniform sampler2D tNormal; uniform sampler2D tFoam; uniform samplerCube tEnv;
varying vec3 vWorld; varying vec3 vNrm; varying float vJac;
void main() {
  vec3 n = normalize(vNrm);
  float dist = length(vWorld.xz - uCamPos.xz), far = smoothstep(30.0, 900.0, dist);
#ifdef NMAP
  vec3 d1 = texture2D(tNormal, vWorld.xz / 7.0 + vec2(uTime * 0.040, uTime * 0.026)).xyz * 2.0 - 1.0;
  vec3 d2 = texture2D(tNormal, vWorld.xz / 19.0 + vec2(-uTime * 0.021, uTime * 0.033)).xyz * 2.0 - 1.0;
  vec2 dxy = (d1.xy + d2.xy) * (0.62 * (1.0 - smoothstep(40.0, 700.0, dist)) + 0.10);
  n = normalize(n + vec3(dxy.x, 0.0, dxy.y));
#endif
  vec3 v = normalize(uCamPos - vWorld);
  float ndv = max(dot(n, v), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  // reflection: the sky's environment cube, never from below the horizon
  vec3 r = reflect(-v, n); r.y = abs(r.y) + 0.03;
  vec3 refl = textureCube(tEnv, r).rgb;
  // the sun on the water: a sharp sparkle near the boat that widens into a glitter path far away
  float ndh = max(dot(n, normalize(v + uSunDir)), 0.0);
  float sun = pow(ndh, mix(360.0, 26.0, far)) * mix(4.5, 0.55, far) + pow(ndh, 9.0) * 0.05;
  // the water's own colour: deep blue, with light coming through the crests when looking toward the sun
  float crest = clamp(vWorld.y * 0.75 + 0.42, 0.0, 1.0);
  float toSun = max(dot(-v, uSunDir) * 0.5 + 0.5, 0.0);
  vec3 body = uDeep + uScatter * crest * (0.22 + 0.78 * toSun * toSun) * (0.55 + 0.45 * (1.0 - ndv));
  vec3 col = mix(body, refl, fres) + uSunCol * sun * uSunPow;
#ifdef FOAM
  float f = texture2D(tFoam, vWorld.xz / 6.5 + vec2(uTime * 0.012, 0.0)).r;
  float foam = smoothstep(0.80, 0.40, vJac) * smoothstep(0.12, 0.62, f + 0.25 * crest);
  float lit = 0.5 + 0.5 * max(dot(n, uSunDir), 0.0);
  col = mix(col, uFoamCol * (0.35 + 0.65 * lit), clamp(foam, 0.0, 1.0) * (1.0 - smoothstep(150.0, 420.0, dist)));
#endif
  // haze: the far sea melts into the sky at the horizon
  float fog = 1.0 - exp(-dist * uFogDen);
  col = mix(col, skyBase(normalize(vec3(-v.x, 0.02, -v.z))), fog);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
function waterGeometry(seg, R) {   // a square grid, denser in the middle, clipped to a disc of radius R
  const n = seg + 1, pos = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let u = (i / seg) * 2 - 1, v = (j / seg) * 2 - 1; u *= 0.25 + 0.75 * u * u; v *= 0.25 + 0.75 * v * v;
    let x = u * R, z = v * R; const r = Math.hypot(x, z); if (r > R) { x *= R / r; z *= R / r; }
    const o = 3 * (j * n + i); pos[o] = x; pos[o + 1] = 0; pos[o + 2] = z;
  }
  const idx = new (n * n > 65535 ? Uint32Array : Uint16Array)(seg * seg * 6); let k = 0;
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

export class Sea {
  // sky: the Sky object (its uniforms and environment cube are shared). seg and radius set the grid; fade = where waves flatten.
  constructor(renderer, scene, sky, { seg = 160, radius = 300, fade = [90, 260] } = {}) {
    Object.assign(this, { renderer, scene, sky, seg, radius });
    this.fade = fade;
    this.U = {
      ...sky.U, uTime: { value: 0 }, uCamPos: { value: new THREE.Vector3() }, uFade: { value: new THREE.Vector2(fade[0], fade[1]) },
      uWA: { value: new Float32Array(4 * W.MAXW) }, uWB: { value: new Float32Array(4 * W.MAXW) }, uWaveCount: { value: 0 },
      tNormal: { value: makeNormalTexture() }, tFoam: { value: makeNoiseTexture({ seed: 23, terms: 30, fmin: 3, fmax: 24, slope: 0.9, power: 1.6 }) },
      tEnv: { value: sky.cubeRT.texture }, uSunPow: { value: 4 }, uFogDen: { value: 0.0015 },
      uDeep: { value: new THREE.Vector3() }, uScatter: { value: new THREE.Vector3() }, uFoamCol: { value: new THREE.Vector3(1, 1, 1) },
    };
    this.waterMat = new THREE.ShaderMaterial({ uniforms: this.U, vertexShader: WATER_VS, fragmentShader: WATER_FS });
    this.skirtMat = new THREE.ShaderMaterial({ uniforms: this.U, vertexShader: WATER_VS, fragmentShader: WATER_FS });
    this.water = new THREE.Mesh(waterGeometry(seg, radius), this.waterMat); this.water.frustumCulled = false; scene.add(this.water);
    this.skirt = new THREE.Mesh(new THREE.RingGeometry(radius - 2, 5000, 96, 1).rotateX(-Math.PI / 2), this.skirtMat); this.skirt.frustumCulled = false; scene.add(this.skirt);
    this.quality = null; this.setQuality({ nmap: true, foam: true });
  }
  setGrid(seg) { if (seg === this.seg) return; this.seg = seg; this.water.geometry.dispose(); this.water.geometry = waterGeometry(seg, this.radius); }
  setWaves(waves) { const u = W.waveUniformArrays(waves); this.U.uWA.value = u.A; this.U.uWB.value = u.B; this.U.uWaveCount.value = u.count; }
  setWorld(w) {
    this.U.uDeep.value.fromArray(w.deep); this.U.uScatter.value.fromArray(w.scatter); this.U.uFoamCol.value.fromArray(w.foam);
    this.U.uSunPow.value = w.sunPow; this.U.uFogDen.value = w.fog;
  }
  setQuality(q) {
    if (this.quality && this.quality.nmap === q.nmap && this.quality.foam === q.foam) return;   // unchanged: no new program
    this.quality = { ...q };
    const d = { WAVES: '' }; if (q.nmap) d.NMAP = ''; if (q.foam) d.FOAM = '';
    this.waterMat.defines = d; this.waterMat.needsUpdate = true;
    this.skirtMat.defines = q.nmap ? { NMAP: '' } : {}; this.skirtMat.needsUpdate = true;
  }
  // how much of the wave height is left at world point (x, z): the shader flattens the sea away from the camera
  fadeAt(x, z) { const c = this.U.uCamPos.value, d = Math.hypot(x - c.x, z - c.z), t = Math.min(1, Math.max(0, (d - this.fade[0]) / (this.fade[1] - this.fade[0]))); return 1 - t * t * (3 - 2 * t); }
  update(camera, t) {
    this.U.uTime.value = t; this.U.uCamPos.value.copy(camera.position);
    const cell = ((2 * this.radius) / this.seg) * 0.25, sx = Math.round(camera.position.x / cell) * cell, sz = Math.round(camera.position.z / cell) * cell;
    this.water.position.set(sx, 0, sz); this.skirt.position.set(sx, -0.03, sz);
  }
  // GPU check for the smoke test: the shader's gerstner() at world grid points, read back (null without float render targets)
  probe(points, t) {
    const n = points.length, r = this.renderer;
    const rt = new THREE.WebGLRenderTarget(n, 1, { type: THREE.FloatType, depthBuffer: false });
    const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), src = new Float32Array(n * 2);
    points.forEach(([x, z], i) => { pos[3 * i] = ((i + 0.5) / n) * 2 - 1; src[2 * i] = x; src[2 * i + 1] = z; });
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSrc', new THREE.BufferAttribute(src, 2));
    const m = new THREE.ShaderMaterial({ uniforms: { uWA: this.U.uWA, uWB: this.U.uWB, uWaveCount: this.U.uWaveCount, uTime: { value: t } }, toneMapped: false,
      vertexShader: `${SEA_POINT_GLSL}\nattribute vec2 aSrc; varying vec4 vOut; void main() { vec3 p, nn; float j; seaPoint(aSrc, 1.0, p, nn, j); vOut = vec4(p, j); gl_PointSize = 1.0; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: 'varying vec4 vOut; void main() { gl_FragColor = vOut; }' });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false;
    const cam = new THREE.Camera(), out = new Float32Array(n * 4), old = r.getRenderTarget();
    try { r.setRenderTarget(rt); r.setClearColor(0, 0); r.clear(); r.render(pts, cam); r.readRenderTargetPixels(rt, 0, 0, n, 1, out); }
    catch { return null; } finally { r.setRenderTarget(old); rt.dispose(); g.dispose(); m.dispose(); }
    return Array.from({ length: n }, (_, i) => [out[4 * i], out[4 * i + 1], out[4 * i + 2], out[4 * i + 3]]);
  }
}
