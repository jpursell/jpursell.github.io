// AudioWorkletProcessor entrypoint.
// Generated from src/audio/worklet.ts; do not edit by hand.


// src/audio/worklet.ts
var MAX_BLOCK = 128;
function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}
function clampInt(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v | 0));
}
function normalizeSteps(steps) {
  const out = new Array(16);
  for (let i = 0; i < 16; i++) {
    const v = steps?.[i] ?? 1;
    out[i] = v === 0 ? 0 : 1;
  }
  return out;
}
function stepSamplesF(bpm, sr) {
  const b = Math.max(40, Math.min(240, bpm || 120));
  return sr * 60 / b / 4;
}
function drumIds() {
  return ["kick", "snare", "ch", "oh"];
}
function defaultDrumPatterns() {
  const empty = new Array(16).fill(0);
  return { kick: empty.slice(), snare: empty.slice(), ch: empty.slice(), oh: empty.slice() };
}
function defaultDrumParams() {
  return {
    kick: { level: 0.9, tune: 0, decay: 0.5 },
    snare: { level: 0.75, tune: 0, decay: 0.5 },
    ch: { level: 0.5, tune: 0, decay: 0.35 },
    oh: { level: 0.5, tune: 0, decay: 0.6 }
  };
}
function softclip(x) {
  const a = Math.abs(x);
  return x / (1 + a);
}
var TempoDelay = class {
  buf;
  write = 0;
  constructor(maxSeconds) {
    const n = Math.max(8, Math.ceil(sampleRate * maxSeconds));
    this.buf = new Float32Array(n);
  }
  clear() {
    this.buf.fill(0);
    this.write = 0;
  }
  process(x, enabled, delaySamples, feedback) {
    if (!enabled) {
      this.buf[this.write] = 0;
      this.write = (this.write + 1) % this.buf.length;
      return 0;
    }
    const len = this.buf.length;
    const ds = Math.max(1, Math.min(len - 1, delaySamples | 0));
    const read = this.write - ds;
    const readIdx = read < 0 ? read + len : read;
    const y = this.buf[readIdx];
    this.buf[this.write] = x + y * feedback;
    this.write = (this.write + 1) % len;
    return y;
  }
};
var Comb = class {
  buf;
  idx = 0;
  filterStore = 0;
  constructor(len) {
    this.buf = new Float32Array(Math.max(8, len | 0));
  }
  clear() {
    this.buf.fill(0);
    this.idx = 0;
    this.filterStore = 0;
  }
  process(x, feedback, damp) {
    const y = this.buf[this.idx];
    const d = damp;
    this.filterStore = y * (1 - d) + this.filterStore * d;
    this.buf[this.idx] = x + this.filterStore * feedback;
    this.idx++;
    if (this.idx >= this.buf.length) this.idx = 0;
    return y;
  }
};
var Allpass = class {
  buf;
  idx = 0;
  fb;
  constructor(len, feedback = 0.5) {
    this.buf = new Float32Array(Math.max(8, len | 0));
    this.fb = feedback;
  }
  clear() {
    this.buf.fill(0);
    this.idx = 0;
  }
  process(x) {
    const y = this.buf[this.idx];
    const out = -x + y;
    this.buf[this.idx] = x + y * this.fb;
    this.idx++;
    if (this.idx >= this.buf.length) this.idx = 0;
    return out;
  }
};
var SchroederReverb = class {
  combs;
  allpasses;
  constructor() {
    const scale = sampleRate / 44100;
    const combLens = [1116, 1188, 1277, 1356].map((n) => Math.round(n * scale));
    const apLens = [556, 441].map((n) => Math.round(n * scale));
    this.combs = combLens.map((n) => new Comb(n));
    this.allpasses = apLens.map((n) => new Allpass(n, 0.5));
  }
  clear() {
    for (const c of this.combs) c.clear();
    for (const a of this.allpasses) a.clear();
  }
  process(x, enabled, decay01, damp01) {
    if (!enabled) return 0;
    const decay = clamp01(decay01);
    const damp = clamp01(damp01);
    const feedback = Math.min(0.98, 0.4 + decay * 0.55);
    const d = 0.05 + damp * 0.85;
    let y = 0;
    for (const c of this.combs) y += c.process(x, feedback, d);
    y *= 0.25;
    for (const a of this.allpasses) y = a.process(y);
    return y;
  }
};
var SynthProcessor = class extends AudioWorkletProcessor {
  exports = null;
  ready = false;
  tempoBpm = 120;
  stepIdx = 0;
  samplesUntilStep = 0;
  stepBase = 0;
  stepRem = 0;
  stepRemAcc = 0;
  // Track held notes always, so toggling arp on while holding notes works.
  held = /* @__PURE__ */ new Map();
  // note -> velocity
  asPlayed = [];
  arp = {
    enabled: false,
    octaves: 1,
    pattern: "up",
    steps: new Array(16).fill(1)
  };
  noteIdx = 0;
  updownDir = 1;
  currentNote = null;
  rng = 12648430;
  drumsEnabled = false;
  drumPatterns = defaultDrumPatterns();
  drumParams = defaultDrumParams();
  drumSamples = {};
  drumSrcToOut = 1;
  drumVoices = [];
  mix = {
    master: 0.9,
    synth: 1,
    drums: 1,
    sendSynth: 0.25,
    sendDrums: 0.1
  };
  fx = {
    drive: 0.2,
    delay: { enabled: true, beats: 0.5, feedback: 0.35, return: 0.25 },
    reverb: { enabled: true, decay: 0.45, damp: 0.4, return: 0.18 }
  };
  delay = new TempoDelay(3.6);
  reverb = new SchroederReverb();
  tmpSynth = new Float32Array(MAX_BLOCK);
  tmpDrums = new Float32Array(MAX_BLOCK);
  constructor(_options) {
    super();
    this.port.onmessage = (ev) => void this.onMsg(ev.data);
  }
  transportEnabled() {
    return this.arp.enabled || this.drumsEnabled;
  }
  reseedStepTiming(resetPhase) {
    const f = stepSamplesF(this.tempoBpm, sampleRate);
    this.stepBase = Math.max(1, Math.floor(f));
    this.stepRem = f - this.stepBase;
    if (resetPhase) {
      this.stepRemAcc = 0;
      this.samplesUntilStep = 0;
      this.stepIdx = 0;
    }
  }
  stepIntervalSamples() {
    let n = this.stepBase;
    this.stepRemAcc += this.stepRem;
    if (this.stepRemAcc >= 1) {
      n += 1;
      this.stepRemAcc -= 1;
    }
    return n;
  }
  stopVoice() {
    const ex = this.exports;
    if (!ex) return;
    if (this.currentNote != null) {
      ex.note_off(this.currentNote);
      this.currentNote = null;
    }
  }
  noteOnHeld(note, velocity) {
    this.held.set(note, velocity);
    if (!this.asPlayed.includes(note)) this.asPlayed.push(note);
  }
  noteOffHeld(note) {
    this.held.delete(note);
    const idx = this.asPlayed.indexOf(note);
    if (idx >= 0) this.asPlayed.splice(idx, 1);
    if (this.held.size === 0) {
      this.stopVoice();
      this.noteIdx = 0;
      this.updownDir = 1;
    }
  }
  nextRandInt(max) {
    this.rng = this.rng * 1664525 + 1013904223 >>> 0;
    return max <= 1 ? 0 : this.rng % max;
  }
  buildSequence() {
    const oct = clampInt(this.arp.octaves, 1, 4);
    let base;
    if (this.arp.pattern === "asPlayed") {
      base = this.asPlayed.slice();
    } else {
      base = Array.from(this.held.keys()).sort((a, b) => a - b);
    }
    if (base.length === 0) return [];
    const expanded = [];
    for (let o = 0; o < oct; o++) {
      for (const n of base) {
        const note = n + o * 12;
        if (note < 0 || note > 127) continue;
        const velocity = this.held.get(n) ?? 0.85;
        expanded.push({ note, velocity });
      }
    }
    if (this.arp.pattern === "down") {
      expanded.sort((a, b) => b.note - a.note);
    } else if (this.arp.pattern !== "asPlayed") {
      expanded.sort((a, b) => a.note - b.note);
    }
    return expanded;
  }
  chooseNextNote(seq) {
    if (seq.length === 1) return seq[0];
    if (this.arp.pattern === "random") {
      return seq[this.nextRandInt(seq.length)];
    }
    if (this.noteIdx >= seq.length) this.noteIdx = 0;
    if (this.arp.pattern === "updown") {
      const idx = this.noteIdx;
      const n2 = seq[idx];
      if (this.updownDir === 1) {
        if (this.noteIdx >= seq.length - 1) {
          this.updownDir = -1;
          this.noteIdx = Math.max(0, this.noteIdx - 1);
        } else {
          this.noteIdx++;
        }
      } else {
        if (this.noteIdx <= 0) {
          this.updownDir = 1;
          this.noteIdx = Math.min(seq.length - 1, this.noteIdx + 1);
        } else {
          this.noteIdx--;
        }
      }
      return n2;
    }
    const n = seq[this.noteIdx % seq.length];
    this.noteIdx = (this.noteIdx + 1) % seq.length;
    return n;
  }
  triggerDrum(id) {
    const pcm = this.drumSamples[id];
    if (!pcm) return;
    const p = this.drumParams[id];
    const level = clamp01(p.level);
    if (level <= 0) return;
    const tune = Math.max(-24, Math.min(24, p.tune || 0));
    const rate = this.drumSrcToOut * Math.pow(2, tune / 12);
    const d01 = clamp01(p.decay);
    const tauS = 0.03 + d01 * (1.5 - 0.03);
    const decayCoef = Math.exp(-1 / (tauS * sampleRate));
    this.drumVoices.push({ pcm, pos: 0, rate, gain: level, decayCoef });
  }
  processTransportStep() {
    const ex = this.exports;
    if (!ex) return;
    const idx = this.stepIdx & 15;
    if (this.arp.enabled) {
      const seq = this.buildSequence();
      if (seq.length === 0) {
        this.stopVoice();
      } else {
        const step = this.arp.steps[idx] ?? 1;
        if (step === 0) {
          this.stopVoice();
        } else {
          const next = this.chooseNextNote(seq);
          if (this.currentNote != null) ex.note_off(this.currentNote);
          ex.note_on(next.note, next.velocity);
          this.currentNote = next.note;
        }
      }
    }
    if (this.drumsEnabled) {
      for (const id of drumIds()) {
        if ((this.drumPatterns[id][idx] ?? 0) === 1) this.triggerDrum(id);
      }
    }
    this.stepIdx = this.stepIdx + 1 & 15;
  }
  mixDrumsInto(dst, offset, n) {
    if (this.drumVoices.length === 0) return;
    for (const v of this.drumVoices) {
      const pcm = v.pcm;
      const len = pcm.length;
      let pos = v.pos;
      let gain = v.gain;
      const rate = v.rate;
      const decayCoef = v.decayCoef;
      for (let i = 0; i < n; i++) {
        const ip = pos | 0;
        if (ip >= len) break;
        const frac = pos - ip;
        const s0 = pcm[ip];
        const s1 = ip + 1 < len ? pcm[ip + 1] : s0;
        const s = s0 + (s1 - s0) * frac;
        dst[offset + i] += s * gain;
        gain *= decayCoef;
        pos += rate;
        if (gain < 1e-5) break;
      }
      v.pos = pos;
      v.gain = gain;
    }
    this.drumVoices = this.drumVoices.filter((v) => (v.pos | 0) < v.pcm.length && v.gain >= 1e-5);
  }
  applyTempo(msg) {
    this.tempoBpm = Math.max(40, Math.min(240, msg.bpm || 120));
    this.reseedStepTiming(false);
    this.stepRemAcc = 0;
    this.samplesUntilStep = 0;
  }
  applyArp(msg) {
    const prev = this.transportEnabled();
    const wasEnabled = this.arp.enabled;
    this.arp.enabled = !!msg.enabled;
    this.arp.octaves = clampInt(msg.octaves, 1, 4);
    this.arp.pattern = msg.pattern;
    this.arp.steps = normalizeSteps(msg.steps);
    if (!wasEnabled && this.arp.enabled) {
      this.stopVoice();
      this.noteIdx = 0;
      this.updownDir = 1;
    }
    if (wasEnabled && !this.arp.enabled) {
      this.stopVoice();
    }
    if (!prev && this.transportEnabled()) {
      this.reseedStepTiming(true);
    }
    if (prev && !this.transportEnabled()) {
      this.samplesUntilStep = 0;
      this.stepIdx = 0;
    }
  }
  applyDrumSamples(msg) {
    this.drumSrcToOut = (msg.sr || sampleRate) / sampleRate;
    for (const s of msg.samples) {
      this.drumSamples[s.id] = s.pcm;
    }
  }
  applyDrums(msg) {
    const prev = this.transportEnabled();
    this.drumsEnabled = !!msg.enabled;
    for (const id of drumIds()) {
      const pat = msg.patterns?.[id];
      this.drumPatterns[id] = normalizeSteps(pat);
      const p = msg.params?.[id];
      if (p) {
        this.drumParams[id] = {
          level: clamp01(p.level),
          tune: Math.max(-24, Math.min(24, Number(p.tune) || 0)),
          decay: clamp01(p.decay)
        };
      }
    }
    if (!this.drumsEnabled) this.drumVoices = [];
    if (!prev && this.transportEnabled()) {
      this.reseedStepTiming(true);
    }
    if (prev && !this.transportEnabled()) {
      this.samplesUntilStep = 0;
      this.stepIdx = 0;
      this.drumVoices = [];
      this.stopVoice();
    }
  }
  applyMix(msg) {
    this.mix = {
      master: clamp01(msg.master),
      synth: clamp01(msg.synth),
      drums: clamp01(msg.drums),
      sendSynth: clamp01(msg.sendSynth),
      sendDrums: clamp01(msg.sendDrums)
    };
  }
  applyFx(msg) {
    const wasDelayEnabled = this.fx.delay.enabled;
    this.fx.drive = clamp01(msg.drive);
    this.fx.delay = {
      enabled: !!msg.delay?.enabled,
      beats: Math.max(0.25, Math.min(2, Number(msg.delay?.beats) || 0.5)),
      feedback: Math.max(0, Math.min(0.95, Number(msg.delay?.feedback) || 0)),
      return: clamp01(Number(msg.delay?.return) || 0)
    };
    this.fx.reverb = {
      enabled: !!msg.reverb?.enabled,
      decay: clamp01(Number(msg.reverb?.decay) || 0),
      damp: clamp01(Number(msg.reverb?.damp) || 0),
      return: clamp01(Number(msg.reverb?.return) || 0)
    };
    if (wasDelayEnabled && !this.fx.delay.enabled) this.delay.clear();
    if (!wasDelayEnabled && this.fx.delay.enabled) {
      this.delay.clear();
    }
  }
  async onMsg(msg) {
    if (msg.type === "initWasm") {
      try {
        const { instance } = await WebAssembly.instantiate(msg.bytes, {});
        const ex2 = instance.exports;
        if (!ex2?.memory || !ex2?.render || !ex2?.init) throw new Error("Wasm exports missing required functions");
        ex2.init(sampleRate);
        this.exports = ex2;
        this.ready = true;
        this.reseedStepTiming(true);
        this.port.postMessage({ type: "ready" });
      } catch (e) {
        this.ready = false;
        this.exports = null;
        const message = e instanceof Error ? e.stack || e.message : String(e);
        this.port.postMessage({ type: "error", message });
      }
      return;
    }
    const ex = this.exports;
    if (!this.ready || !ex) return;
    if (msg.type === "tempo") {
      this.applyTempo(msg);
      return;
    }
    if (msg.type === "drumSamples") {
      this.applyDrumSamples(msg);
      return;
    }
    if (msg.type === "drums") {
      this.applyDrums(msg);
      return;
    }
    if (msg.type === "mix") {
      this.applyMix(msg);
      return;
    }
    if (msg.type === "fx") {
      this.applyFx(msg);
      return;
    }
    if (msg.type === "arp") {
      this.applyArp(msg);
      return;
    }
    if (msg.type === "noteOn") {
      this.noteOnHeld(msg.note, msg.velocity);
      if (!this.arp.enabled) ex.note_on(msg.note, msg.velocity);
      return;
    }
    if (msg.type === "noteOff") {
      this.noteOffHeld(msg.note);
      if (!this.arp.enabled) ex.note_off(msg.note);
      return;
    }
    if (msg.type === "param") {
      ex.set_param(msg.id, msg.value);
      return;
    }
  }
  process(_inputs, outputs) {
    const out = outputs[0]?.[0];
    if (!out) return true;
    const ex = this.exports;
    if (!this.ready || !ex) {
      out.fill(0);
      return true;
    }
    const frames = out.length;
    let offset = 0;
    while (offset < frames) {
      if (this.transportEnabled()) {
        while (this.samplesUntilStep <= 0) {
          this.processTransportStep();
          this.samplesUntilStep += this.stepIntervalSamples();
        }
      }
      const remaining = frames - offset;
      let n = Math.min(MAX_BLOCK, remaining);
      if (this.transportEnabled()) {
        n = Math.min(n, Math.max(1, this.samplesUntilStep));
      }
      const ptr = ex.render(n);
      if (!ptr) {
        out.fill(0);
        return true;
      }
      const block = new Float32Array(ex.memory.buffer, ptr, n);
      this.tmpSynth.set(block, 0);
      this.tmpDrums.fill(0, 0, n);
      this.mixDrumsInto(this.tmpDrums, 0, n);
      const delaySamples = Math.round(sampleRate * (60 / Math.max(1, this.tempoBpm)) * this.fx.delay.beats);
      const m = this.mix;
      const fx = this.fx;
      const drive = fx.drive;
      const pregain = 1 + drive * 12;
      const driveTrim = 1 / softclip(pregain);
      const delayFb = fx.delay.feedback;
      const delayRet = fx.delay.return;
      const revRet = fx.reverb.return;
      for (let i = 0; i < n; i++) {
        let s = this.tmpSynth[i];
        if (drive > 1e-4) {
          s = softclip(s * pregain) * driveTrim;
        }
        s *= m.synth;
        const d = this.tmpDrums[i] * m.drums;
        const dry = s + d;
        const sendIn = s * m.sendSynth + d * m.sendDrums;
        const delayOut = this.delay.process(sendIn, fx.delay.enabled, delaySamples, delayFb) * delayRet;
        const reverbOut = this.reverb.process(sendIn, fx.reverb.enabled, fx.reverb.decay, fx.reverb.damp) * revRet;
        let y = (dry + delayOut + reverbOut) * m.master;
        y = softclip(y);
        out[offset + i] = y;
      }
      offset += n;
      if (this.transportEnabled()) {
        this.samplesUntilStep -= n;
      }
    }
    return true;
  }
};
registerProcessor("synth-processor", SynthProcessor);
