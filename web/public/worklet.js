// AudioWorkletProcessor entrypoint.
// Generated from src/audio/worklet.ts; do not edit by hand.


// src/audio/worklet.ts
var MAX_BLOCK = 128;
function clampInt(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v | 0));
}
function normalizeSteps(steps) {
  const out = new Array(16);
  for (let i = 0; i < 16; i++) {
    const v = steps?.[i] ?? 1;
    out[i] = v === 2 ? 2 : v === 0 ? 0 : 1;
  }
  return out;
}
function stepSamplesF(bpm, sr) {
  const b = Math.max(20, Math.min(400, bpm || 120));
  return sr * 60 / b / 4;
}
var SynthProcessor = class extends AudioWorkletProcessor {
  exports = null;
  ready = false;
  // Track held notes always, so toggling arp on while holding notes works.
  held = /* @__PURE__ */ new Map();
  // note -> velocity
  asPlayed = [];
  arp = {
    enabled: false,
    bpm: 120,
    octaves: 1,
    pattern: "up",
    steps: new Array(16).fill(1)
  };
  stepIdx = 0;
  noteIdx = 0;
  updownDir = 1;
  samplesUntilStep = 0;
  stepBase = 0;
  stepRem = 0;
  stepRemAcc = 0;
  currentNote = null;
  rng = 12648430;
  constructor(_options) {
    super();
    this.port.onmessage = (ev) => void this.onMsg(ev.data);
  }
  reseedStepTiming() {
    const f = stepSamplesF(this.arp.bpm, sampleRate);
    this.stepBase = Math.max(1, Math.floor(f));
    this.stepRem = f - this.stepBase;
    this.stepRemAcc = 0;
    this.samplesUntilStep = 0;
  }
  resetArpCounters() {
    this.stepIdx = 0;
    this.noteIdx = 0;
    this.updownDir = 1;
    this.samplesUntilStep = 0;
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
    } else {
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
  stepIntervalSamples() {
    let n = this.stepBase;
    this.stepRemAcc += this.stepRem;
    if (this.stepRemAcc >= 1) {
      n += 1;
      this.stepRemAcc -= 1;
    }
    return n;
  }
  processStep() {
    const ex = this.exports;
    if (!ex) return;
    const seq = this.buildSequence();
    if (seq.length === 0) {
      this.stopVoice();
      return;
    }
    const step = this.arp.steps[this.stepIdx] ?? 1;
    if (step === 0) {
      this.stopVoice();
    } else if (step === 2) {
    } else {
      const next = this.chooseNextNote(seq);
      if (this.currentNote != null) ex.note_off(this.currentNote);
      ex.note_on(next.note, next.velocity);
      this.currentNote = next.note;
    }
    this.stepIdx = (this.stepIdx + 1) % 16;
  }
  applyArp(msg) {
    const wasEnabled = this.arp.enabled;
    this.arp.enabled = !!msg.enabled;
    this.arp.bpm = Math.max(40, Math.min(240, msg.bpm || 120));
    this.arp.octaves = clampInt(msg.octaves, 1, 4);
    this.arp.pattern = msg.pattern;
    this.arp.steps = normalizeSteps(msg.steps);
    this.reseedStepTiming();
    if (!wasEnabled && this.arp.enabled) {
      this.stopVoice();
      this.resetArpCounters();
    }
    if (wasEnabled && !this.arp.enabled) {
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
        this.reseedStepTiming();
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
      if (this.arp.enabled) {
        if (this.held.size === 0) {
          this.stopVoice();
          this.samplesUntilStep = 0;
        }
        while (this.held.size > 0 && this.samplesUntilStep <= 0) {
          this.processStep();
          this.samplesUntilStep += this.stepIntervalSamples();
        }
      }
      const remaining = frames - offset;
      let n = Math.min(MAX_BLOCK, remaining);
      if (this.arp.enabled && this.held.size > 0) {
        n = Math.min(n, Math.max(1, this.samplesUntilStep));
      }
      const ptr = ex.render(n);
      if (!ptr) {
        out.fill(0);
        return true;
      }
      const block = new Float32Array(ex.memory.buffer, ptr, n);
      out.set(block, offset);
      offset += n;
      if (this.arp.enabled && this.held.size > 0) {
        this.samplesUntilStep -= n;
      }
    }
    return true;
  }
};
registerProcessor("synth-processor", SynthProcessor);
