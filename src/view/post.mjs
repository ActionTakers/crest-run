// post.mjs: the picture pipeline. The scene is drawn into a half-float target at a render scale (so the resolution can follow the
// phone's frame rate without touching the page layout), a small bloom chain picks up the sun glitter and spray, and one final pass
// adds bloom, speed streaks, a radial blur for the boost, tone mapping, saturation, vignette and a flash. Without half-float
// targets the scene is drawn straight to the screen with the renderer's own tone mapping (the low tier).
// Written 2026-11-13 by the yacht project session. No three.js add-ons: each pass is one triangle.
import * as THREE from 'three';

const TRI = new THREE.BufferGeometry();
TRI.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
TRI.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
const CAM = new THREE.Camera();
const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const pass = (fragmentShader, uniforms, extra = {}) => { const m = new THREE.Mesh(TRI, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false, ...extra })); m.frustumCulled = false; return m; };

const DOWN_FS = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThr; varying vec2 vUv;
void main() {
  vec3 c = (texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
          + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb) * 0.25;
  if (uThr > 0.0) {   // the first step keeps only what is brighter than the threshold (soft knee), and tames single hot pixels
    float br = max(c.r, max(c.g, c.b)), knee = uThr * 0.5;
    float soft = clamp(br - uThr + knee, 0.0, 2.0 * knee); soft = soft * soft / (4.0 * knee + 1e-4);
    c *= max(soft, br - uThr) / max(br, 1e-4);
    c = min(c, vec3(24.0));
  }
  gl_FragColor = vec4(c, 1.0);
}`;
const UP_FS = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
void main() {
  vec3 c = (texture2D(tSrc, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, -0.5)).rgb
          + texture2D(tSrc, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, 0.5)).rgb) * 0.25;
  gl_FragColor = vec4(c, 1.0);
}`;
const FINAL_FS = /* glsl */ `
uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tNoise;
uniform float uBloom; uniform float uExposure; uniform float uTime; uniform float uSpeed; uniform float uBlur; uniform float uFlash;
uniform float uVig; uniform float uSat; uniform float uAspect; uniform vec3 uFlashCol;
varying vec2 vUv;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec2 d = vUv - 0.5;
  vec3 col;
  if (uBlur > 0.002) {   // boost: the picture stretches away from the centre, with a slight colour split
    vec2 o = d * uBlur * 0.011;
    vec3 a = texture2D(tScene, vUv).rgb, b = texture2D(tScene, vUv - o).rgb, c = texture2D(tScene, vUv - 2.0 * o).rgb, e = texture2D(tScene, vUv - 3.0 * o).rgb;
    col = a * 0.4 + b * 0.3 + c * 0.2 + e * 0.1;
    col.r = mix(col.r, c.r, 0.2); col.b = mix(col.b, a.b, 0.2);
  } else col = texture2D(tScene, vUv).rgb;
  col += texture2D(tBloom, vUv).rgb * uBloom;
  float r = length(d * vec2(uAspect, 1.0)) / (0.5 * uAspect);
  if (uSpeed > 0.002) {   // streaks that run outward at the edges of the screen
    float a = atan(d.y, d.x * uAspect);
    float s = texture2D(tNoise, vec2(a * 1.6, r * 0.22 - uTime * 1.7)).r;
    col += vec3(0.85, 0.93, 1.0) * smoothstep(0.62, 0.88, s) * smoothstep(0.5, 1.05, r) * uSpeed * 0.5;
  }
  col = aces(col * uExposure);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  col *= 1.0 - uVig * smoothstep(0.55, 1.25, r);
  col = mix(col, uFlashCol, uFlash);
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;   // dither: no bands in the sky
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class Post {
  constructor(renderer, noiseTexture) {
    this.r = renderer;
    this.hdr = renderer.extensions.has('EXT_color_buffer_half_float') || renderer.extensions.has('EXT_color_buffer_float');
    this.enabled = this.hdr; this.msaa = 0; this.scale = 1; this.levels = 3; this.first = 4;
    this.w = 2; this.h = 2; this.sw = 2; this.sh = 2;
    this.rtScene = null; this.chain = [];
    this.down = pass(DOWN_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThr: { value: 0 } });
    this.up = pass(UP_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } }, { blending: THREE.AdditiveBlending, transparent: true });
    this.final = pass(FINAL_FS, { tScene: { value: null }, tBloom: { value: null }, tNoise: { value: noiseTexture }, uBloom: { value: 0.5 }, uExposure: { value: 1 },
      uTime: { value: 0 }, uSpeed: { value: 0 }, uBlur: { value: 0 }, uFlash: { value: 0 }, uVig: { value: 0.3 }, uSat: { value: 1.08 }, uAspect: { value: 2 },
      uFlashCol: { value: new THREE.Vector3(1, 1, 1) } });
    this.fx = { bloom: 0.55, threshold: 1.0, exposure: 1, speed: 0, blur: 0, flash: 0, vignette: 0.3, sat: 1.08, time: 0 };
    this.build();
  }
  // quality: msaa samples of the scene target (0, 2 or 4), first = the bloom's first level as a divisor of the scene size (2 or 4)
  setQuality({ enabled = true, msaa = 0, first = 4 } = {}) { this.enabled = enabled && this.hdr; if (msaa !== this.msaa || first !== this.first) { this.msaa = msaa; this.first = first; this.build(); } }
  setSize(w, h) { if (w !== this.w || h !== this.h) { this.w = w; this.h = h; this.build(); } }
  setScale(s) { if (Math.abs(s - this.scale) > 1e-3) { this.scale = s; this.build(); } }
  build() {
    const sw = Math.max(2, Math.round(this.w * this.scale)), sh = Math.max(2, Math.round(this.h * this.scale));
    this.sw = sw; this.sh = sh;
    if (this.rtScene) this.rtScene.dispose();
    for (const t of this.chain) t.dispose();
    this.chain = [];
    if (!this.hdr) { this.rtScene = null; return; }
    this.rtScene = new THREE.WebGLRenderTarget(sw, sh, { type: THREE.HalfFloatType, depthBuffer: true, samples: this.msaa, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    let div = this.first;
    for (let i = 0; i < this.levels; i++, div *= 2) this.chain.push(new THREE.WebGLRenderTarget(Math.max(2, Math.round(sw / div)), Math.max(2, Math.round(sh / div)),
      { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }));
  }
  render(scene, camera) {
    const r = this.r, fx = this.fx;
    if (!this.enabled || !this.rtScene) { r.setRenderTarget(null); r.render(scene, camera); return; }
    r.setRenderTarget(this.rtScene); r.render(scene, camera);
    // bloom: down the chain (the first step thresholds), then back up, adding each level into the one above
    let src = this.rtScene.texture, sw = this.sw, sh = this.sh;
    const D = this.down.material.uniforms, U = this.up.material.uniforms;
    for (let i = 0; i < this.chain.length; i++) {
      D.tSrc.value = src; D.uTexel.value.set(1 / sw, 1 / sh); D.uThr.value = i === 0 ? fx.threshold : 0;
      r.setRenderTarget(this.chain[i]); r.render(this.down, CAM);
      src = this.chain[i].texture; sw = this.chain[i].width; sh = this.chain[i].height;
    }
    const auto = r.autoClear; r.autoClear = false;
    for (let i = this.chain.length - 1; i > 0; i--) {
      U.tSrc.value = this.chain[i].texture; U.uTexel.value.set(1 / this.chain[i].width, 1 / this.chain[i].height);
      r.setRenderTarget(this.chain[i - 1]); r.render(this.up, CAM);
    }
    r.autoClear = auto;
    const F = this.final.material.uniforms;
    F.tScene.value = this.rtScene.texture; F.tBloom.value = this.chain[0].texture; F.uBloom.value = fx.bloom; F.uExposure.value = fx.exposure;
    F.uTime.value = fx.time; F.uSpeed.value = fx.speed; F.uBlur.value = fx.blur; F.uFlash.value = fx.flash; F.uVig.value = fx.vignette; F.uSat.value = fx.sat;
    F.uAspect.value = this.w / this.h;
    r.setRenderTarget(null); r.render(this.final, CAM);
  }
}
