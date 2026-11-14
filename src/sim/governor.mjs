// governor.mjs: keeps the frame rate by changing the render scale (and, when that is not enough, the quality tier). Pure logic:
// it is fed the time between frames and answers with a scale and a tier. A browser frame can only be seen as "on time" or "late"
// (frame times snap to the screen's refresh), so the governor counts late frames against the refresh it measured at the start; it
// cannot see spare capacity, so it steps up by trial and backs off for longer each time a trial fails (review finding F07).
// A phone in Low Power Mode shows 30 frames a second however light the picture is (research F2-limits-04, -05): measure() reports
// that, and the governor then holds 30. The mode can be switched during play: RefreshWatch sees frames that sit steadily on another
// usual rate and asks for the display to be measured again (review r3, T-02). In the 'auto' setting the tier that was dropped is
// tried again after a long calm stretch, with the same back-off as the picture size (T-03).
// Tests: tests/progress.test.mjs (governor part). Written 2026-11-13 by the yacht project session.
const TIER_ORDER = ['low', 'mid', 'high'];
export const REFRESH_STEPS = [8.33, 11.11, 16.67, 33.33];   // 120, 90, 60 and 30 frames a second

// The refresh interval seen in a list of frame gaps (ms): the median, snapped to a usual display rate when within 12 %.
export function measureRefresh(deltas) {
  const d = deltas.filter((x) => x > 2 && x < 200).sort((a, b) => a - b);
  if (d.length < 10) return { interval: 16.67, snapped: false, n: d.length };
  const med = d[d.length >> 1];
  for (const r of REFRESH_STEPS) if (Math.abs(med - r) / r < 0.12) return { interval: r, snapped: true, n: d.length, median: med };
  return { interval: med, snapped: false, n: d.length, median: med };
}

export class Governor {
  // interval: the display's frame time (ms) measured with a light picture; auto: may the tier change; tier: the starting tier
  constructor({ interval = 16.67, tier = 'mid', auto = true, scale = 1, minScale = 0.5, step = 0.1 } = {}) {
    Object.assign(this, { interval, tier, auto, scale, minScale, step });
    this.maxTier = tier;       // 'auto' never tries a tier above the one it started with
    this.tierWait = 20;        // seconds of calm at the full picture before a dropped tier is tried again
    this.win = []; this.late = 0; this.cool = 0; this.calm = 0; this.wait = 6; this.trial = 0; this.trialFrom = null;
    this.changes = [];   // [seconds, scale, tier, why] for the test card
    this.t = 0;
  }
  setInterval(ms) { this.interval = ms; this.win.length = 0; this.late = 0; }
  // one frame took dMs; returns true when scale or tier changed
  frame(dMs) {
    const dt = Math.min(0.25, dMs / 1000); this.t += dt;
    if (!(dMs > 0) || dMs > 250) return false;                       // a pause or a tab switch says nothing about the load
    const missed = Math.max(0, Math.round(dMs / this.interval) - 1) > 0 ? 1 : 0;
    this.win.push(missed); this.late += missed; if (this.win.length > 90) this.late -= this.win.shift();
    this.cool = Math.max(0, this.cool - dt);
    if (this.trial > 0) {   // a step up is on trial: any late frame in the first 2 s sends it back and doubles the wait
      this.trial -= dt;
      if (missed && this.late >= 3) {
        const tierTrial = this.trialFrom.tier !== this.tier;
        this.set(this.trialFrom.scale, this.trialFrom.tier, 'trial failed'); this.trial = 0;
        if (tierTrial) this.tierWait = Math.min(240, this.tierWait * 2); else this.wait = Math.min(60, this.wait * 2);
        this.calm = 0; this.cool = 1; return true;
      }
      if (this.trial <= 0) { if (this.trialFrom.tier !== this.tier) this.tierWait = Math.max(20, this.tierWait * 0.75); else this.wait = Math.max(6, this.wait * 0.75); this.trialFrom = null; }
    }
    if (this.cool > 0 || this.win.length < 45) return false;
    const share = this.late / this.win.length;
    if (share > 0.08) {   // too many late frames: a smaller picture first, a lighter tier when the picture is at its smallest
      this.calm = 0;
      if (this.scale > this.minScale + 1e-6) return this.set(Math.max(this.minScale, +(this.scale - this.step).toFixed(2)), this.tier, 'late frames');
      const i = TIER_ORDER.indexOf(this.tier);
      if (this.auto && i > 0) return this.set(0.8, TIER_ORDER[i - 1], 'late frames at the smallest picture');
      return false;
    }
    if (share === 0) this.calm += dt; else this.calm = 0;
    if (this.calm >= this.wait && this.scale < 1 - 1e-6) {   // calm for long enough: try a larger picture
      this.trialFrom = { scale: this.scale, tier: this.tier }; this.trial = 2; this.calm = 0;
      return this.set(Math.min(1, +(this.scale + this.step).toFixed(2)), this.tier, 'trial');
    }
    // the full picture has been calm for a long stretch on a tier below the starting one: try the next tier up (auto only)
    const ti = TIER_ORDER.indexOf(this.tier);
    if (this.auto && this.calm >= this.tierWait && this.scale >= 1 - 1e-6 && ti >= 0 && ti < TIER_ORDER.indexOf(this.maxTier)) {
      this.trialFrom = { scale: this.scale, tier: this.tier }; this.trial = 3; this.calm = 0;
      return this.set(this.scale, TIER_ORDER[ti + 1], 'tier trial');
    }
    return false;
  }
  set(scale, tier, why) {
    this.scale = scale; this.tier = tier; this.win.length = 0; this.late = 0; this.cool = Math.max(this.cool, 1);
    this.changes.push([+this.t.toFixed(1), scale, tier, why]); if (this.changes.length > 40) this.changes.shift();
    return true;
  }
}

// Watches the gaps between frames for a display that changed its rate. feed(dMs) answers null (nothing to do), 'probe' (the last
// `hold` frames sat steadily on a slower usual rate: measure the display again with a small picture, because a steady 33 ms can
// also be an overloaded phone) or { interval } (frames arrive faster than the interval in use, which only a faster display can
// do). It asks at most once every `every` seconds of play and allocates nothing.
export class RefreshWatch {
  constructor({ interval = 16.67, hold = 60, every = 20 } = {}) {
    this.interval = interval; this.hold = hold; this.every = every;
    this.ring = new Float32Array(hold); this.k = 0; this.n = 0; this.since = Infinity; this.tick = 0;
  }
  setInterval(ms) { this.interval = ms; this.n = 0; }
  feed(dMs) {
    this.since += Math.min(0.25, Math.max(0, dMs) / 1000);
    if (!(dMs > 2) || dMs > 250) { this.n = 0; return null; }           // a pause or a tab switch: start the window again
    this.ring[this.k] = dMs; this.k = (this.k + 1) % this.hold; if (this.n < this.hold) this.n++;
    if (this.n < this.hold || this.since < this.every || ++this.tick % 20) return null;
    for (let s = 0; s < REFRESH_STEPS.length; s++) {
      const r = REFRESH_STEPS[s]; if (Math.abs(r - this.interval) / this.interval < 0.2) continue;
      let c = 0; for (let i = 0; i < this.hold; i++) if (Math.abs(this.ring[i] - r) / r < 0.12) c++;
      if (c >= 0.8 * this.hold) { this.since = 0; this.n = 0; return r < this.interval ? { interval: r } : 'probe'; }
    }
    return null;
  }
}
