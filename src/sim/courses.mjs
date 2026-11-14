// courses.mjs: race courses as data plus the builder that turns a course definition into arrays the simulation and the view share.
// Pure (no DOM, no three.js). The builder is the course part of shared/boat-sim.mjs from <local> (commit 26df76d,
// written 2026-11-08 by session g-50; original in vendor/spikes/boat-sim.mjs), generalised 2026-11-13 by the yacht project session:
// any control loop, several slalom sections, extra gates, ramps with a sideways offset, a racing line that also runs over ramps.
// World: metres; x and z on the water, y up. Heading h: forward (-sin h, cos h), right (-cos h, -sin h). Lateral offsets: + = right.
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

function catmull(p0, p1, p2, p3, n, out) {   // centripetal Catmull-Rom between p1 and p2
  const tj = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) || 1e-6;
  const t0 = 0, t1 = t0 + tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
  for (let k = 0; k < n; k++) {
    const t = t1 + ((t2 - t1) * k) / n;
    const L = (a, b, ta, tb) => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
    const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
    out.push(L(L(A1, A2, t0, t2), L(A2, A3, t1, t3), t1, t2));
  }
}

// def: { key, name, control: [[x, z], ...] (a closed loop; s = 0 is the first point, which must start a straight), scale,
//   halfWidth, gateWidth, slaloms: [{ from, count, spacing, offset, width, flip }], extraGates: [{ s, lat, width }],
//   ramps: [{ s, len, height, halfW, lat, onLine }], cornerGates (default true) }
export function buildCourse(def) {
  const { control, scale = 1, halfWidth = 28, gateWidth = 20, slaloms = [], extraGates = [], ramps = [], cornerGates = true } = def;
  const CONTROL = control.map(([x, z]) => [x * scale, z * scale]);
  const raw = [], n = CONTROL.length;
  for (let i = 0; i < n; i++) catmull(CONTROL[(i - 1 + n) % n], CONTROL[i], CONTROL[(i + 1) % n], CONTROL[(i + 2) % n], 200, raw);
  let len = 0; const cum = [0];
  for (let i = 1; i <= raw.length; i++) { const a = raw[i - 1], b = raw[i % raw.length]; len += Math.hypot(b[0] - a[0], b[1] - a[1]); cum.push(len); }
  const N = Math.round(len), step = len / N, X = new Float64Array(N), Z = new Float64Array(N);
  let j = 0;
  for (let k = 0; k < N; k++) {
    const s = (k * step) % len;
    if (k === 0 || cum[j] > s) j = 0;
    while (cum[j + 1] < s) j++;
    const f = (s - cum[j]) / (cum[j + 1] - cum[j]), a = raw[j], b = raw[(j + 1) % raw.length];
    X[k] = a[0] + (b[0] - a[0]) * f; Z[k] = a[1] + (b[1] - a[1]) * f;
  }
  const H = new Float64Array(N), K = new Float64Array(N);
  for (let i = 0; i < N; i++) { const a = (i - 1 + N) % N, b = (i + 1) % N; H[i] = Math.atan2(-(X[b] - X[a]), Z[b] - Z[a]); }
  for (let i = 0; i < N; i++) K[i] = wrapA(H[(i + 3) % N] - H[(i - 3 + N) % N]) / (6 * step);   // curvature, + = right turn
  const c = { key: def.key || 'course', name: def.name || 'Course', N, step, len, X, Z, H, K, halfWidth, def };
  // corners: stretches tighter than 110 m radius
  c.corners = []; let cur = null;
  for (let i = 0; i < N; i++) {
    const on = Math.abs(K[i]) > 1 / 110;
    if (on && !cur) cur = { a: i * step, minR: Infinity, dir: K[i] > 0 ? 'right' : 'left' };
    if (cur) cur.minR = Math.min(cur.minR, 1 / Math.max(1e-9, Math.abs(K[i])));
    if (!on && cur) { cur.b = i * step; c.corners.push(cur); cur = null; }
  }
  if (cur) { cur.b = len; c.corners.push(cur); }
  // gates: slalom sections (narrow, alternating sides), one wide gate at the tightest point of each corner, extra gates by hand
  c.gates = [];
  for (const sl of slaloms) for (let k = 0; k < sl.count; k++) {
    const o = (k % 2 === 0 ? -1 : 1) * (sl.flip ? -1 : 1) * sl.offset;
    // the racing line passes 3.5 m inside the gate's inner buoy: a safe line for the computer; a player who cuts closer than
    // 2.2 m scores a 'perfect' pass. inner = the buoy on the racing line's side
    c.gates.push({ s: sl.from + k * sl.spacing, lo: o - sl.width / 2, hi: o + sl.width / 2, kind: 'slalom', inner: o < 0 ? 'hi' : 'lo', line: Math.sign(o) * (Math.abs(o) - sl.width / 2 + 3.5) });
  }
  if (cornerGates) for (const z of c.corners) {
    let best = z.a, kmax = 0;
    for (let s = z.a; s < z.b; s += step) { const v = Math.abs(K[Math.floor(s / step) % N]); if (v > kmax) { kmax = v; best = s; } }
    c.gates.push({ s: Math.round(best), lo: -gateWidth / 2, hi: gateWidth / 2, kind: 'corner', inner: z.dir === 'right' ? 'hi' : 'lo', line: 0 });
  }
  for (const g of extraGates) c.gates.push({ s: g.s, lo: g.lat - g.width / 2, hi: g.lat + g.width / 2, kind: 'gate', inner: 'both', line: g.lat });
  c.gates.sort((a, b) => a.s - b.s);
  c.gates.forEach((g, i) => { g.i = i; });
  if (!c.gates.length) throw new Error('a course needs at least one gate');
  c.ramps = ramps.map((r) => ({ len: 12, height: 2.6, halfW: 4.5, lat: 0, onLine: true, ...r }));
  // the racing line: the centre line shifted through each anchor (gates, and ramps that lie on the line), cosine blend between
  const anchors = c.gates.map((g) => ({ s: g.s, o: g.line }));
  // a ramp on the line holds the line straight from 40 m before it to 50 m after it: the run-up, the flight and the landing
  for (const r of c.ramps) if (r.onLine) for (const d of [-40, -18, 0, r.len, r.len + 50]) anchors.push({ s: (((r.s + d) % len) + len) % len, o: r.lat });
  anchors.sort((a, b) => a.s - b.s);
  c.lineOff = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const s = i * step; let a = anchors[anchors.length - 1], b = anchors[0];
    for (let k = 0; k < anchors.length; k++) if (anchors[k].s > s) { b = anchors[k]; a = anchors[(k - 1 + anchors.length) % anchors.length]; break; }
    let span = b.s - a.s; if (span <= 0) span += len; let d = s - a.s; if (d < 0) d += len;
    const f = clamp(d / span, 0, 1), w = 0.5 - 0.5 * Math.cos(Math.PI * f);
    c.lineOff[i] = a.o + (b.o - a.o) * w;
  }
  return c;
}

export function at(c, s) {   // centre line point, heading, curvature and line offset at arc length s (wrapped)
  const u = ((((s / c.step) % c.N) + c.N) % c.N), i = Math.floor(u) % c.N, k = (i + 1) % c.N, f = u - Math.floor(u);
  return { x: c.X[i] + (c.X[k] - c.X[i]) * f, z: c.Z[i] + (c.Z[k] - c.Z[i]) * f, h: c.H[i] + wrapA(c.H[k] - c.H[i]) * f,
    k: c.K[i] + (c.K[k] - c.K[i]) * f, off: c.lineOff[i] + (c.lineOff[k] - c.lineOff[i]) * f };
}
export function pointAt(c, s, lat) { const p = at(c, s); return { x: p.x - Math.cos(p.h) * lat, z: p.z - Math.sin(p.h) * lat, h: p.h }; }
// the same point without creating an object: out[0] = x, out[1] = z, out[2] = heading
export function pointInto(c, s, lat, out) {
  const u = ((((s / c.step) % c.N) + c.N) % c.N), i = Math.floor(u) % c.N, k = (i + 1) % c.N, f = u - Math.floor(u);
  const h = c.H[i] + wrapA(c.H[k] - c.H[i]) * f;
  out[0] = c.X[i] + (c.X[k] - c.X[i]) * f - Math.cos(h) * lat; out[1] = c.Z[i] + (c.Z[k] - c.Z[i]) * f - Math.sin(h) * lat; out[2] = h;
}
export const lineOffAt = (c, s) => c.lineOff[Math.floor((((s / c.step) % c.N) + c.N) % c.N)];
export const wrapS = (c, d) => { if (d > c.len / 2) d -= c.len; if (d < -c.len / 2) d += c.len; return d; };
// nearest centre-line sample near a hint (a window, so a boat never jumps to another part of the loop). out[0] = s, out[1] = lat
export function projectInto(c, x, z, hintS, out, win = 60) {
  let bi = 0, bd = Infinity;
  if (hintS === null) { for (let i = 0; i < c.N; i++) { const d = (c.X[i] - x) ** 2 + (c.Z[i] - z) ** 2; if (d < bd) { bd = d; bi = i; } } }
  else {
    const h = Math.round(hintS / c.step), w = Math.round(win / c.step);
    for (let o = -w; o <= w; o++) { const i = (((h + o) % c.N) + c.N) % c.N, d = (c.X[i] - x) ** 2 + (c.Z[i] - z) ** 2; if (d < bd) { bd = d; bi = i; } }
  }
  const h = c.H[bi], fx = -Math.sin(h), fz = Math.cos(h), dx = x - c.X[bi], dz = z - c.Z[bi];
  const along = clamp(dx * fx + dz * fz, -c.step, c.step), s = (((bi * c.step + along) % c.len) + c.len) % c.len;
  const u = s / c.step, i = Math.floor(u) % c.N, k = (i + 1) % c.N, f = u - Math.floor(u);
  const px = c.X[i] + (c.X[k] - c.X[i]) * f, pz = c.Z[i] + (c.Z[k] - c.Z[i]) * f, ph = c.H[i] + wrapA(c.H[k] - c.H[i]) * f;
  out[0] = s; out[1] = (x - px) * -Math.cos(ph) + (z - pz) * -Math.sin(ph);
}
export function project(c, x, z, hintS = null, win = 60) { const o = [0, 0]; projectInto(c, x, z, hintS, o, win); return { s: o[0], lat: o[1] }; }

// A speed for every metre of the racing line: the corner speed a boat with handling P can hold at `skill`, smoothed by what it can
// gain by accelerating and lose by braking. Used by computer-steered boats and by the reference driver.
export function speedProfile(c, P, skill = 1) {
  const N = c.N, R = new Float64Array(N), stretch = new Float64Array(N), vmax = new Float64Array(N), px = new Float64Array(N), pz = new Float64Array(N), o = [0, 0, 0];
  for (let i = 0; i < N; i++) { pointInto(c, i * c.step, c.lineOff[i], o); px[i] = o[0]; pz[i] = o[1]; }
  const hd = new Float64Array(N);
  for (let i = 0; i < N; i++) { const a = (i - 1 + N) % N, b = (i + 1) % N; stretch[i] = Math.hypot(px[b] - px[a], pz[b] - pz[a]) / (2 * c.step); hd[i] = Math.atan2(-(px[b] - px[a]), pz[b] - pz[a]); }
  for (let i = 0; i < N; i++) { const k = Math.abs(wrapA(hd[(i + 5) % N] - hd[(i - 5 + N) % N])) / (10 * c.step * stretch[i]); R[i] = 1 / Math.max(1e-6, k); }
  // the share of its yaw rate a boat can hold through a corner without sliding off the line: less for a tune with less grip
  const DEG = Math.PI / 180, vTop = P.top * skill, hold = 0.92 * Math.min(1, 0.55 + 0.45 * ((P.grip || 3.3) / 3.3)), wr = P.turnRate * DEG * hold * skill;
  for (let i = 0; i < N; i++) vmax[i] = Math.min(vTop, Math.max(6, R[i] * wr));
  const acc = (v) => Math.max(0.2, P.accel * (1 - (v / P.top) ** 2)), dec = 8;
  const v = Float64Array.from(vmax);
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < N; i++) { const k = (i + 1) % N; v[k] = Math.min(v[k], Math.sqrt(v[i] ** 2 + 2 * acc(v[i]) * c.step * stretch[i])); }
    for (let i = N - 1; i >= 0; i--) { const k = (i + 1) % N; v[i] = Math.min(v[i], Math.sqrt(v[k] ** 2 + 2 * dec * c.step * stretch[i])); }
  }
  return { v, stretch, R };
}

// The straights of a course (for placing ramps and for the AI's boost): stretches at least minLen long with radius above minR.
export function straights(c, minLen = 60, minR = 260) {
  const out = []; let a = null;
  for (let i = 0; i <= c.N; i++) {
    const ok = i < c.N && Math.abs(c.K[i]) < 1 / minR;
    if (ok && a === null) a = i;
    if (!ok && a !== null) { if ((i - a) * c.step >= minLen) out.push({ a: a * c.step, b: i * c.step, len: (i - a) * c.step }); a = null; }
  }
  return out;
}

// ---------- the courses ----------
// Sunset Bay: north along the start straight, west along the top, south through an S-bend, east along the bottom, north again.
// (Right turns go toward -x: seen from behind a boat that faces +z, screen right is -x.)
const BAY = [[0, 0], [0, 230], [-40, 310], [-130, 350], [-250, 350], [-330, 310], [-350, 220], [-300, 150], [-320, 70], [-380, 0],
  [-380, -90], [-300, -170], [-180, -190], [-60, -170], [0, -90]];
const HARBOUR = [[0, -60], [0, 160], [-30, 240], [-110, 270], [-190, 230], [-200, 150], [-150, 90], [-170, 20], [-260, -30],
  [-270, -130], [-200, -190], [-100, -190], [-30, -140]];
const OPEN = [[0, 0], [0, 300], [-60, 400], [-180, 440], [-320, 400], [-400, 300], [-400, 150], [-340, 60], [-380, -40], [-380, -200],
  [-300, -290], [-150, -300], [-40, -250], [0, -150]];
export const COURSE_DEFS = {
  bay: { key: 'bay', name: 'Sunset Bay', world: 'sunset', sea: { count: 5, seed: 7, amp: 0.40 }, laps: 2, control: BAY, scale: 0.75, halfWidth: 28, gateWidth: 20,
    // each straight: a gate, a ramp with a straight landing zone, a gate that sets up the next corner
    extraGates: [{ s: 40, lat: 0, width: 14 }, { s: 188, lat: 5, width: 11 }, { s: 408, lat: 5, width: 11 }, { s: 1046, lat: 5, width: 11 }],
    ramps: [{ s: 82 }, { s: 298 }, { s: 945 }], scenery: { islands: 11, liner: 1, cargo: 1, tug: 1, sails: 5, towers: 1 },
    medals: { gold: 99.7, silver: 104.6, bronze: 112.4 } },   // time trial: the reference driver's 97.78 s (cruise) + 2, 7 and 15 %
  // Harbour Rush: the twisty loop of the S3 feel lab (tested there with the reference driver): nine corners in a row, then two
  // ramps back to back across the finish line
  harbour: { key: 'harbour', name: 'Harbour Rush', world: 'dusk', sea: { count: 5, seed: 11, amp: 0.32 }, laps: 2, control: HARBOUR, scale: 0.85, halfWidth: 28, gateWidth: 20,
    extraGates: [{ s: 150, lat: 5, width: 11 }, { s: 652, lat: -4, width: 11 }, { s: 915, lat: 4, width: 11 }],
    ramps: [{ s: 70 }, { s: 1086 }], scenery: { islands: 5, liner: 2, cargo: 4, tug: 3, sails: 2, towers: 3 },
    medals: { gold: 89.5, silver: 93.9, bronze: 100.9 } },    // reference 87.71 s
  // Open Water: long and fast on a bigger sea, sweeping bends, a kink, three ramps
  open: { key: 'open', name: 'Open Water', world: 'noon', sea: { count: 5, seed: 23, amp: 0.55 }, laps: 2, control: OPEN, scale: 0.8, halfWidth: 30, gateWidth: 22,
    slaloms: [{ from: 570, count: 2, spacing: 45, offset: 6, width: 11 }, { from: 695, count: 2, spacing: 45, offset: 6, width: 11, flip: true }, { from: 1500, count: 2, spacing: 50, offset: 6, width: 11 }],
    extraGates: [{ s: 60, lat: 0, width: 14 }, { s: 1340, lat: 5, width: 11 }],
    ramps: [{ s: 110 }, { s: 470 }, { s: 985 }, { s: 1250 }], scenery: { islands: 14, liner: 1, cargo: 1, tug: 1, sails: 8, towers: 2 },
    medals: { gold: 135.7, silver: 142.3, bronze: 153.0 } },  // reference 133.03 s
};
export const COURSE_KEYS = Object.keys(COURSE_DEFS);
const built = new Map();
export function getCourse(key) { if (!built.has(key)) built.set(key, buildCourse(COURSE_DEFS[key])); return built.get(key); }
