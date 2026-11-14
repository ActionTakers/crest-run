// boats.mjs: the yacht as the game shows it. One model (assets/models/yacht-b04.glb: the owner's flybridge yacht, made from his own
// turnaround picture with Tripo and re-baked to 11,998 triangles; see assets/SOURCES.md) serves the player and the rivals; a
// livery colour tints the white parts of the hull in the shader, so every boat shares one geometry and one program.
// Written 2026-11-13 by the yacht project session.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const LIVERIES = {
  pearl: { label: 'Pearl', color: [1.0, 1.0, 1.0], amount: 0.0, accent: 0xf2b84b },
  gold: { label: 'Gold rush', color: [1.0, 0.72, 0.25], amount: 0.85, accent: 0xffd36b },
  navy: { label: 'Midnight', color: [0.10, 0.22, 0.55], amount: 0.92, accent: 0x5fa8ff },
  coral: { label: 'Coral', color: [1.0, 0.30, 0.26], amount: 0.9, accent: 0xff7a6b },
  mint: { label: 'Mint', color: [0.25, 0.85, 0.70], amount: 0.85, accent: 0x7dffd8 },
  violet: { label: 'Violet', color: [0.55, 0.32, 0.95], amount: 0.88, accent: 0xb48cff },
};
export const LIVERY_KEYS = Object.keys(LIVERIES);

// Loads the model once and returns a template: a group with the bow toward +z, the middle of the hull at the origin and the
// waterline at y = 0, scaled to `length` metres. keel = how deep the hull sits, as a share of the length.
export async function loadYacht(url, { length = 10.5, keel = 0.058 } = {}) {
  const t0 = performance.now();
  const gltf = await new GLTFLoader().loadAsync(url);
  const inner = gltf.scene; let tris = 0;
  inner.traverse((o) => { if (o.isMesh) { tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; o.frustumCulled = true; } });
  const box = new THREE.Box3().setFromObject(inner), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  const k = length / size.x;                       // the model's length runs along x, the bow at +x
  inner.position.set(-mid.x, -box.min.y - keel * size.x, -mid.z);
  const turn = new THREE.Group(); turn.add(inner); turn.rotation.y = -Math.PI / 2; turn.scale.setScalar(k);   // +x becomes +z
  const template = new THREE.Group(); template.add(turn);
  return { template, triangles: Math.round(tris), ms: Math.round(performance.now() - t0), length, beam: size.z * k, height: size.y * k };
}

const TINT_PARS = 'uniform vec3 uLivery; uniform float uLiveryAmt;\n';
const TINT_MAIN = `
  { // tint the white parts of the hull (bright and without colour); wood, glass and dark trim keep their own colour
    float lo = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b)), hi = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
    float white = smoothstep(0.42, 0.78, lo) * (1.0 - smoothstep(0.06, 0.22, hi - lo));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uLivery, white * uLiveryAmt);
  }
`;
export class BoatVisual {
  constructor(yacht, liveryKey = 'pearl') {
    this.group = yacht.template.clone(true);
    this.livery = { uLivery: { value: new THREE.Vector3(1, 1, 1) }, uLiveryAmt: { value: 0 } };
    this.materials = [];
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material.clone(); o.material = m; this.materials.push(m);
      m.envMapIntensity = 1.15;
      // One program for a solid and a fading boat (review r3, T-11): the material is always in the blended pass, drawn in a single
      // pass. Switching `transparent` during a race would need a new program the first time a rival comes close (a compile in the
      // middle of a race), and a double-sided blended material is otherwise drawn twice with a program lookup every frame
      // (three.js 0.186 renderObject). The model's textures have no alpha channel (tools/glb-info.mjs), so opacity 1 is solid.
      m.transparent = true; m.forceSinglePass = true; m.opacity = 1; m.depthWrite = true;
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uLivery = this.livery.uLivery; shader.uniforms.uLiveryAmt = this.livery.uLiveryAmt;
        shader.fragmentShader = TINT_PARS + shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + TINT_MAIN);
      };
      m.customProgramCacheKey = () => 'yacht-livery';   // one program for every boat
    });
    this.setLivery(liveryKey);
  }
  setLivery(key) { const L = LIVERIES[key] || LIVERIES.pearl; this.liveryKey = key; this.livery.uLivery.value.fromArray(L.color); this.livery.uLiveryAmt.value = L.amount; }
  // pose from the simulation: y is the height of the boat's origin; draft is how far that origin sits above the waterline
  setPose(x, y, z, h, pitch, roll, draft) { this.group.position.set(x, y - draft, z); this.group.rotation.set(-pitch, -h, roll, 'YXZ'); }
  // 1 = solid; below that the boat fades (no depth written, so what lies behind it still shows); near 0 it is not drawn at all
  setOpacity(a) { if (a === this.opacity) return; this.opacity = a; const solid = a >= 0.99; for (const m of this.materials) { m.opacity = a; m.depthWrite = solid; } this.group.visible = a > 0.02; }
}
