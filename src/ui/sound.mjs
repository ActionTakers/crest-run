// sound.mjs: every sound of the game, made in the page with Web Audio (no audio files): the engine and the water rush that follow
// the boat, effects for gates, landings, the boost and the countdown, and a small music loop whose layers follow the race.
// Sources: Web Audio is muted by the iPhone's silent switch unless the audio session is 'playback' (R7-audio-02); the context is
// 'interrupted' after the page was left and must be resumed (F2-limits-09). NOT_ASSESSED on his phone: the S1 sound test was void.
// Written 2026-11-13 by the yacht project session.
const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);                    // MIDI number to Hz
const CHORDS = [   // A minor, F, C, G: root (bass), three pad notes, per bar
  { root: 33, pad: [57, 60, 64] }, { root: 29, pad: [57, 60, 65] }, { root: 36, pad: [55, 60, 64] }, { root: 31, pad: [55, 59, 62] },
];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1, 2, 1, 0, 2];
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];                          // the gate chime climbs this scale with the chain
// the mix: the three buses and the gain after the compressor. Set from offline renders (tools/film-capture.mjs writes sound.json;
// tools/sound-bands.mjs gives the bands): loud enough, never clipped, the middle band at least as strong as the low one.
const BUS = { eng: 0.5, sfx: 0.8, mus: 0.42 }, OUT_GAIN = 1.5;

export class Sound {
  constructor() {
    this.ctx = null; this.state = 'not started'; this.session = 'audioSession' in navigator ? 'supported' : 'not supported';
    this.on = true; this.musicOn = true; this.volume = 0.8; this.mode = 'off'; this.timer = null; this.next = 0; this.step = 0; this.bpm = 112; this.bpm0 = 112;   // bpm0: the music's own pace; a boss fight raises bpm by phase, music() puts it back
    this.tones = 0; this.level = 0; this.offline = false;
  }
  // A Sound on an OfflineAudioContext, for rendering a film's sound track: the caller steps it (frame, sfx, schedule) at the
  // times of the film from inside ctx.suspend() callbacks; nothing here uses a timer or waits for a tap.
  static forRender(ctx, levels = {}) { const s = new Sound(); s.ctx = ctx; s.offline = true; s.state = 'offline'; s.build(); s.setLevels(levels); return s; }
  // inside a tap: create or resume the context; 'playback' lets it sound with the silent switch on
  start() {
    try {
      if (navigator.audioSession) { try { navigator.audioSession.type = 'playback'; this.session = 'playback'; } catch (e) { this.session = 'error'; } }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) { this.state = 'no Web Audio'; return false; }
      if (!this.ctx) { this.ctx = new AC({ latencyHint: 'interactive' }); this.build(); this.ctx.onstatechange = () => { this.state = this.ctx.state; }; }
      this.ctx.resume(); this.state = this.ctx.state; return true;
    } catch (e) { this.state = 'error: ' + ((e && e.name) || e); return false; }
  }
  // Called from every tap and key press (main.mjs): a context that was interrupted (a call, another app, a new audio route) only
  // starts again inside a tap, and nothing else would retry it (review r3, T-09).
  resume() { if (this.ctx && !this.offline && this.ctx.state !== 'running') { try { this.ctx.resume(); } catch (e) { /* needs a tap */ } } this.state = this.ctx ? this.ctx.state : this.state; }
  build() {
    const c = this.ctx, G = (v) => { const g = c.createGain(); g.gain.value = v; return g; };
    // master -> compressor (glues the mix) -> output gain -> limiter (no clipping when a landing, the boost and a fanfare meet)
    this.master = G(this.volume); this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 6;
    this.outGain = G(OUT_GAIN); this.limit = c.createDynamicsCompressor(); this.limit.threshold.value = -3; this.limit.knee.value = 0; this.limit.ratio.value = 20; this.limit.attack.value = 0.002; this.limit.release.value = 0.12;
    this.master.connect(this.comp); this.comp.connect(this.outGain); this.outGain.connect(this.limit); this.limit.connect(c.destination);
    this.engBus = G(BUS.eng); this.sfxBus = G(BUS.sfx); this.musBus = G(BUS.mus);
    this.musFilter = c.createBiquadFilter(); this.musFilter.type = 'lowpass'; this.musFilter.frequency.value = 1400; this.musFilter.Q.value = 0.5;
    this.engBus.connect(this.master); this.sfxBus.connect(this.master); this.musFilter.connect(this.musBus); this.musBus.connect(this.master);
    // the engine: two detuned saws, an octave, a third harmonic and a little sub through a low-pass that opens with speed. Most
    // of its energy sits between 300 and 3000 Hz, where a phone's own speaker plays (measured with tools/sound-bands.mjs on an
    // offline render: the first mix had its engine and bass under 200 Hz, 6.7 dB above everything a phone would let through).
    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 500; this.lp.Q.value = 1.6;
    this.engGain = G(0); this.lp.connect(this.engGain); this.engGain.connect(this.engBus);
    const osc = (type, f, g) => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; const gg = G(g); o.connect(gg); gg.connect(this.lp); o.start(); return o; };
    this.o1 = osc('sawtooth', 50, 0.5); this.o2 = osc('sawtooth', 50.6, 0.4); this.o3 = osc('square', 100, 0.26); this.o4 = osc('sine', 25, 0.14); this.o5 = osc('sawtooth', 150, 0.2);
    // white noise for the water rush, the boost and splashes
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), ch = nb.getChannelData(0); let s = 7;
    for (let i = 0; i < ch.length; i++) { s = (1664525 * s + 1013904223) >>> 0; ch[i] = s / 2147483648 - 1; }
    this.noise = nb;
    const loop = (type, f, q) => { const n = c.createBufferSource(); n.buffer = nb; n.loop = true; const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; const g = G(0); n.connect(b); b.connect(g); g.connect(this.engBus); n.start(); return { b, g }; };
    this.water = loop('bandpass', 900, 0.7); this.jet = loop('highpass', 2400, 0.3);
    this.setLevels();
  }
  setLevels({ sound = this.on, music = this.musicOn, volume = this.volume } = {}) {
    this.on = sound; this.musicOn = music; this.volume = volume;
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(sound || music ? volume : 0, t, 0.05);
    this.engBus.gain.setTargetAtTime(sound ? BUS.eng : 0, t, 0.05); this.sfxBus.gain.setTargetAtTime(sound ? BUS.sfx : 0, t, 0.05); this.musBus.gain.setTargetAtTime(music ? BUS.mus : 0, t, 0.05);
  }
  // once per frame. speed: share of top speed (above 1 with the boost); boost 0..1; air; active: a race is running
  frame({ speed = 0, boost = 0, air = false, active = false, sailing = false, wind = 0 } = {}) {
    if (!this.ctx) return; this.state = this.ctx.state;
    const t = this.ctx.currentTime, u = Math.max(0, speed), a = air ? 1.22 : 1, f = (42 + 105 * u + 30 * boost) * a;
    this.o1.frequency.setTargetAtTime(f, t, 0.06); this.o2.frequency.setTargetAtTime(f * 1.012, t, 0.06); this.o3.frequency.setTargetAtTime(f * 2.0, t, 0.06); this.o4.frequency.setTargetAtTime(f * 0.5, t, 0.06); this.o5.frequency.setTargetAtTime(f * 3.0, t, 0.06);
    this.lp.frequency.setTargetAtTime(480 + 2100 * u + 1200 * boost, t, 0.08);
    this.engGain.gain.setTargetAtTime(active && !sailing ? 0.10 + 0.13 * Math.min(1.2, u) + 0.06 * boost : 0, t, 0.1);
    this.water.g.gain.setTargetAtTime(active && !air ? 0.25 * u * u + (sailing ? Math.min(0.045, Math.max(0, wind) * 0.005) : 0) : 0, t, 0.12); this.water.b.frequency.setTargetAtTime(700 + 900 * u, t, 0.2);
    this.jet.g.gain.setTargetAtTime(active && !sailing ? 0.10 * boost : 0, t, 0.08);
    this.musFilter.frequency.setTargetAtTime(this.mode === 'race' ? 1100 + 1800 * Math.min(1.2, u) + 2500 * boost : 1500, t, 0.25);
    this.level = u;
  }
  // ---- effects ----
  tone(f0, t0, dur, type = 'sine', gain = 0.3, f1 = null, bus = this.sfxBus) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(bus); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  burst(t0, dur, type, f0, f1, gain = 0.3, q = 0.8, bus = this.sfxBus) {
    const c = this.ctx, n = c.createBufferSource(), b = c.createBiquadFilter(), g = c.createGain(); n.buffer = this.noise; n.loop = true;
    b.type = type; b.Q.value = q; b.frequency.setValueAtTime(f0, t0); if (f1) b.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    n.connect(b); b.connect(g); g.connect(bus); n.start(t0, (t0 * 0.37) % 1.5); n.stop(t0 + dur + 0.05);
  }
  sfx(name, v = 0) {
    if (!this.ctx || !this.on || (!this.offline && this.ctx.state !== 'running')) return;
    const t = this.ctx.currentTime + 0.005; this.tones++;
    switch (name) {
      case 'count': this.tone(440, t, 0.16, 'square', 0.16); break;
      case 'go': this.tone(880, t, 0.5, 'square', 0.2); this.tone(1320, t, 0.5, 'sine', 0.14); break;
      case 'gate': { const f = NOTE(72 + PENTA[Math.min(PENTA.length - 1, v)]); this.tone(f, t, 0.22, 'triangle', 0.26); this.tone(f * 2, t + 0.02, 0.18, 'sine', 0.1); break; }
      case 'perfect': { const f = NOTE(72 + PENTA[Math.min(PENTA.length - 1, v)]); this.tone(f, t, 0.2, 'triangle', 0.28); this.tone(f * 1.5, t + 0.07, 0.22, 'triangle', 0.22); this.tone(f * 2, t + 0.14, 0.3, 'sine', 0.2); break; }
      case 'miss': this.tone(140, t, 0.34, 'sawtooth', 0.22, 70); break;
      case 'boost': this.burst(t, 0.6, 'bandpass', 500, 4200, 0.3, 0.9); this.tone(180, t, 0.5, 'sawtooth', 0.12, 720); break;
      case 'empty': this.tone(300, t, 0.18, 'square', 0.1, 150); break;
      case 'launch': this.burst(t, 0.45, 'bandpass', 300, 1500, 0.22, 1.2); break;
      case 'land': this.tone(96, t, 0.3, 'sine', 0.5, 38); this.burst(t, 0.7, 'lowpass', 2600, 500, 0.3, 0.5); this.tone(NOTE(84), t + 0.05, 0.3, 'triangle', 0.16); this.tone(NOTE(91), t + 0.13, 0.4, 'triangle', 0.16); break;
      case 'rough': this.tone(80, t, 0.36, 'sine', 0.55, 30); this.burst(t, 0.8, 'lowpass', 1500, 300, 0.36, 0.5); break;
      case 'hop': this.tone(70, t, 0.16, 'sine', 0.2 * Math.min(1, v), 40); break;
      case 'bump': { const k = Math.min(1, 0.3 + (+v || 0) / 4); this.tone(150, t, 0.2, 'square', 0.2 * k, 55); this.burst(t, 0.15, 'bandpass', 900, 400, 0.14 * k, 1); break; }   // v: closing speed in m/s
      case 'draft': this.burst(t, 0.5, 'bandpass', 700, 1400, 0.08, 2); break;
      case 'lap': this.tone(NOTE(76), t, 0.14, 'square', 0.14); this.tone(NOTE(81), t + 0.12, 0.26, 'square', 0.14); break;
      case 'final': for (let k = 0; k < 3; k++) this.tone(NOTE(84), t + k * 0.13, 0.1, 'square', 0.15); break;
      case 'finish': [72, 76, 79, 84, 88].forEach((n, k) => this.tone(NOTE(n), t + k * 0.11, 0.5, 'triangle', 0.24)); break;
      case 'medal': [84, 88, 91, 96].forEach((n, k) => this.tone(NOTE(n), t + k * 0.07, 0.4, 'sine', 0.2)); break;
      case 'placeUp': this.tone(NOTE(79), t, 0.1, 'triangle', 0.2); this.tone(NOTE(86), t + 0.08, 0.2, 'triangle', 0.22); break;
      case 'placeDown': this.tone(NOTE(74), t, 0.1, 'triangle', 0.16); this.tone(NOTE(67), t + 0.08, 0.22, 'triangle', 0.16); break;
      case 'chip': this.tone(NOTE(84 + 2 * Math.min(6, v)), t, 0.16, 'triangle', 0.2); this.tone(NOTE(96 + 2 * Math.min(6, v)), t + 0.03, 0.2, 'sine', 0.1); break;
      case 'click': this.tone(700, t, 0.05, 'square', 0.08); break;
      // the rescue level (2026-11-15; never heard on a phone)
      case 'shot': this.tone(210, t, 0.09, 'square', 0.13, 70); this.burst(t, 0.07, 'bandpass', 2600, 900, 0.16, 0.8); break;
      case 'hit': this.tone(520, t, 0.08, 'triangle', 0.2, 260); this.burst(t, 0.12, 'bandpass', 1400, 600, 0.14, 1); break;
      case 'sunk': this.tone(300, t, 0.4, 'sawtooth', 0.2, 60); this.burst(t, 0.5, 'lowpass', 2200, 400, 0.26, 0.5); this.tone(NOTE(79), t + 0.08, 0.2, 'triangle', 0.16); this.tone(NOTE(86), t + 0.18, 0.3, 'triangle', 0.16); break;
      case 'ram': this.tone(90, t, 0.4, 'sine', 0.55, 34); this.burst(t, 0.6, 'lowpass', 2400, 400, 0.34, 0.5); this.tone(NOTE(84), t + 0.1, 0.3, 'triangle', 0.16); break;
      case 'shark': this.tone(98, t, 0.5, 'sawtooth', 0.2, 92); this.tone(104, t + 0.28, 0.5, 'sawtooth', 0.2, 98); break;
      case 'alarm': this.tone(880, t, 0.1, 'square', 0.12); this.tone(880, t + 0.16, 0.1, 'square', 0.12); break;
      case 'grab': this.tone(160, t, 0.5, 'sawtooth', 0.24, 60); this.burst(t, 0.4, 'lowpass', 1800, 300, 0.25, 0.5); break;
      case 'splash': this.burst(t, 0.45, 'lowpass', 3000, 500, 0.2, 0.5); break;
      case 'jump': this.tone(NOTE(74 + (v % 5) * 2), t, 0.16, 'triangle', 0.12, NOTE(86 + (v % 5) * 2)); break;
      case 'check': this.tone(NOTE(76), t, 0.25, 'triangle', 0.3); this.tone(NOTE(83), t + 0.22, 0.4, 'triangle', 0.3); break;
      default: break;
    }
  }
  // ---- music: 'menu' (pad and a slow arpeggio), 'race' (bass, drums, full arpeggio) or 'off' ----
  music(mode) {
    this.mode = mode; this.bpm = this.bpm0;
    if (mode === 'off' || !this.ctx) { if (this.timer) { clearInterval(this.timer); this.timer = null; } return; }
    if (!this.timer) { this.next = this.ctx.currentTime + 0.12; this.step = 0; this.timer = this.offline ? 'stepped by the caller' : setInterval(() => this.schedule(), 90); }
  }
  schedule() {
    const c = this.ctx; if (!c || (!this.offline && c.state !== 'running') || this.mode === 'off') return;
    if (this.next < c.currentTime) { this.next = c.currentTime + 0.05; }   // the page slept: start again from now
    const d = 60 / this.bpm / 4;
    while (this.next < c.currentTime + 0.3) { if (this.musicOn) this.playStep(this.step, this.next, d); this.next += d; this.step = (this.step + 1) % 64; }
  }
  playStep(step, t, d) {
    const bar = step >> 4, s = step & 15, ch = CHORDS[bar % 4], race = this.mode === 'race', bus = this.musFilter;
    if (s === 0) for (const n of ch.pad) for (const det of [-6, 7]) {   // the pad: two detuned saws per note, a slow swell for the whole bar
      const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = det;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.045, t + d * 4); g.gain.setValueAtTime(0.045, t + d * 12); g.gain.linearRampToValueAtTime(0.0001, t + d * 16.5);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + d * 17);
    }
    if (race || s % 2 === 0) { const n = ch.pad[ARP[s] % 3] + 12 + (race && this.level > 0.95 && s % 4 === 3 ? 12 : 0); this.tone(NOTE(n), t, d * (race ? 1.6 : 3), 'triangle', race ? 0.11 : 0.07, null, bus); }
    if (race) {
      if (s % 2 === 0) this.tone(NOTE(ch.root + 12 + (s % 8 === 6 ? 12 : 0)), t, d * 1.7, 'sawtooth', 0.2, null, bus);             // bass on the eighths (87 to 262 Hz: its overtones carry on a phone)
      if (s % 4 === 0) this.tone(150, t, 0.16, 'sine', 0.5, 42, this.musBus);                                                    // kick on the beat
      if (s % 8 === 4) this.burst(t, 0.14, 'bandpass', 1800, 1200, 0.2, 0.8, this.musBus);                                       // snare on 2 and 4
      if (s % 2 === 1) this.burst(t, 0.04, 'highpass', 7000, null, 0.07, 0.5, this.musBus);                                      // hat off the beat
    }
  }
}
