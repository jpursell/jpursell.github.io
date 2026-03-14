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
  mixDrums(out, offset, n) {
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
        out[offset + i] += s * gain;
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
      out.set(block, offset);
      this.mixDrums(out, offset, n);
      offset += n;
      if (this.transportEnabled()) {
        this.samplesUntilStep -= n;
      }
    }
    return true;
  }
};
registerProcessor("synth-processor", SynthProcessor);
