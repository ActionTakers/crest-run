// dash.mjs: a display inside the cockpit, for the view from the helm (0.7.0): speed, boost and place on a small panel in front
// of the seated driver, fixed to the boat. The flat display over the picture stays for a screen; a headset will not show
// that one, so this is the first piece of the headset step. The panel is a picture drawn in code (no file), redrawn only when
// a value changes. Written 2026-11-16 by the yacht project session. NOT_ASSESSED on a phone or in a headset.
import * as THREE from 'three';

export class Dash {
  constructor() {
    this.canvas = document.createElement('canvas'); this.canvas.width = 512; this.canvas.height = 192; this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.18), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.mesh.renderOrder = 30; this.mesh.visible = false; this.mesh.frustumCulled = false; this.key = ''; this.values = null;
  }
  // values: { speed: '93', unit: 'km/h', boost: 0 to 1, place: '3/4' }
  set(v) {
    const key = `${v.speed}|${v.unit}|${Math.round(40 * v.boost)}|${v.place}`; if (key === this.key) return; this.key = key; this.values = v;
    const g = this.g, W = 512, H = 192; g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(6,18,31,0.82)'; g.beginPath(); g.roundRect(4, 4, W - 8, H - 8, 26); g.fill(); g.strokeStyle = 'rgba(120,220,255,0.9)'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#ffffff'; g.textBaseline = 'alphabetic'; g.textAlign = 'right'; g.font = 'italic 900 104px system-ui, sans-serif'; g.fillText(String(v.speed), 300, 118);
    g.textAlign = 'left'; g.font = '800 34px system-ui, sans-serif'; g.fillStyle = '#9fe0ff'; g.fillText(String(v.unit), 312, 116);
    g.textAlign = 'right'; g.font = 'italic 900 52px system-ui, sans-serif'; g.fillStyle = '#ffc24a'; g.fillText(String(v.place || ''), W - 28, 76);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.roundRect(28, 140, W - 56, 24, 12); g.fill();
    g.fillStyle = '#ffc24a'; g.beginPath(); g.roundRect(28, 140, Math.max(24, (W - 56) * Math.max(0, Math.min(1, v.boost))), 24, 12); g.fill();
    this.tex.needsUpdate = true;
  }
}
