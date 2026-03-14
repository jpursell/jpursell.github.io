import type {
  ArpMsg,
  ArpPattern,
  DrumId,
  DrumMsg,
  DrumSamplesMsg,
  FxMsg,
  InMsg,
  MixMsg,
  TempoMsg,
  WorkletStatusMsg
} from "./protocol";

const MAX_BLOCK = 128;

type WasmExports = {
  memory: WebAssembly.Memory;
  init: (sr: number) => void;
  note_on: (note: number, velocity: number) => void;
  note_off: (note: number) => void;
  set_param: (paramId: number, value: number) => void;
  render: (frames: number) => number;
};

type StepType = 0 | 1; // 0=OFF/REST, 1=ON/GATE

type ArpState = {
  enabled: boolean;
  octaves: number;
  pattern: ArpPattern;
  steps: StepType[];
};

type DrumParams = { level: number; tune: number; decay: number };

type DrumVoice = {
  pcm: Float32Array;
  pos: number;
  rate: number;
  gain: number;
  decayCoef: number;
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v | 0));
}

function normalizeSteps(steps: number[] | undefined): StepType[] {
  const out: StepType[] = new Array(16);
  for (let i = 0; i < 16; i++) {
    const v = steps?.[i] ?? 1;
    out[i] = (v === 0 ? 0 : 1) as StepType;
  }
  return out;
}

function stepSamplesF(bpm: number, sr: number): number {
  const b = Math.max(40, Math.min(240, bpm || 120));
  // 16th notes
  return (sr * 60) / b / 4;
}

function drumIds(): DrumId[] {
  return ["kick", "snare", "ch", "oh"];
}

function defaultDrumPatterns(): Record<DrumId, StepType[]> {
  const empty = new Array(16).fill(0) as StepType[];
  return { kick: empty.slice(), snare: empty.slice(), ch: empty.slice(), oh: empty.slice() };
}

function defaultDrumParams(): Record<DrumId, DrumParams> {
  return {
    kick: { level: 0.9, tune: 0, decay: 0.5 },
    snare: { level: 0.75, tune: 0, decay: 0.5 },
    ch: { level: 0.5, tune: 0, decay: 0.35 },
    oh: { level: 0.5, tune: 0, decay: 0.6 }
  };
}

function softclip(x: number): number {
  const a = Math.abs(x);
  return x / (1 + a);
}

class TempoDelay {
  private buf: Float32Array;
  private write = 0;

  constructor(maxSeconds: number) {
    const n = Math.max(8, Math.ceil(sampleRate * maxSeconds));
    this.buf = new Float32Array(n);
  }

  clear(): void {
    this.buf.fill(0);
    this.write = 0;
  }

  process(x: number, enabled: boolean, delaySamples: number, feedback: number): number {
    if (!enabled) {
      // write zeros so re-enabling doesn't resurrect old echoes
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
}

class Comb {
  private buf: Float32Array;
  private idx = 0;
  private filterStore = 0;

  constructor(len: number) {
    this.buf = new Float32Array(Math.max(8, len | 0));
  }

  clear(): void {
    this.buf.fill(0);
    this.idx = 0;
    this.filterStore = 0;
  }

  process(x: number, feedback: number, damp: number): number {
    const y = this.buf[this.idx];

    // 1-pole lowpass in feedback path
    const d = damp;
    this.filterStore = y * (1 - d) + this.filterStore * d;

    this.buf[this.idx] = x + this.filterStore * feedback;
    this.idx++;
    if (this.idx >= this.buf.length) this.idx = 0;

    return y;
  }
}

class Allpass {
  private buf: Float32Array;
  private idx = 0;
  private fb: number;

  constructor(len: number, feedback = 0.5) {
    this.buf = new Float32Array(Math.max(8, len | 0));
    this.fb = feedback;
  }

  clear(): void {
    this.buf.fill(0);
    this.idx = 0;
  }

  process(x: number): number {
    const y = this.buf[this.idx];
    const out = -x + y;
    this.buf[this.idx] = x + y * this.fb;
    this.idx++;
    if (this.idx >= this.buf.length) this.idx = 0;
    return out;
  }
}

class SchroederReverb {
  private combs: Comb[];
  private allpasses: Allpass[];

  constructor() {
    const scale = sampleRate / 44100;

    // Freeverb-ish lengths (scaled).
    const combLens = [1116, 1188, 1277, 1356].map((n) => Math.round(n * scale));
    const apLens = [556, 441].map((n) => Math.round(n * scale));

    this.combs = combLens.map((n) => new Comb(n));
    this.allpasses = apLens.map((n) => new Allpass(n, 0.5));
  }

  clear(): void {
    for (const c of this.combs) c.clear();
    for (const a of this.allpasses) a.clear();
  }

  process(x: number, enabled: boolean, decay01: number, damp01: number): number {
    if (!enabled) return 0;

    const decay = clamp01(decay01);
    const damp = clamp01(damp01);

    // Map to stable ranges.
    const feedback = Math.min(0.98, 0.4 + decay * 0.55);
    const d = 0.05 + damp * 0.85;

    let y = 0;
    for (const c of this.combs) y += c.process(x, feedback, d);
    y *= 0.25;

    for (const a of this.allpasses) y = a.process(y);

    return y;
  }
}

class SynthProcessor extends AudioWorkletProcessor {
  private exports: WasmExports | null = null;
  private ready = false;

  private tempoBpm = 120;

  private stepIdx = 0;
  private samplesUntilStep = 0;
  private stepBase = 0;
  private stepRem = 0;
  private stepRemAcc = 0;

  // Track held notes always, so toggling arp on while holding notes works.
  private held = new Map<number, number>(); // note -> velocity
  private asPlayed: number[] = [];

  private arp: ArpState = {
    enabled: false,
    octaves: 1,
    pattern: "up",
    steps: new Array(16).fill(1) as StepType[]
  };

  private noteIdx = 0;
  private updownDir: 1 | -1 = 1;
  private currentNote: number | null = null;
  private rng = 0xC0FFEE;

  private drumsEnabled = false;
  private drumPatterns: Record<DrumId, StepType[]> = defaultDrumPatterns();
  private drumParams: Record<DrumId, DrumParams> = defaultDrumParams();
  private drumSamples: Partial<Record<DrumId, Float32Array>> = {};
  private drumSrcToOut = 1;
  private drumVoices: DrumVoice[] = [];

  private mix: Omit<MixMsg, "type"> = {
    master: 0.9,
    synth: 1,
    drums: 1,
    sendSynth: 0.25,
    sendDrums: 0.1
  };

  private fx: Omit<FxMsg, "type"> = {
    drive: 0.2,
    delay: { enabled: true, beats: 0.5, feedback: 0.35, return: 0.25 },
    reverb: { enabled: true, decay: 0.45, damp: 0.4, return: 0.18 }
  };

  private delay = new TempoDelay(3.6);
  private reverb = new SchroederReverb();

  private tmpSynth = new Float32Array(MAX_BLOCK);
  private tmpDrums = new Float32Array(MAX_BLOCK);

  constructor(_options: AudioWorkletNodeOptions) {
    super();
    this.port.onmessage = (ev) => void this.onMsg(ev.data as InMsg);
  }

  private transportEnabled(): boolean {
    return this.arp.enabled || this.drumsEnabled;
  }

  private reseedStepTiming(resetPhase: boolean): void {
    const f = stepSamplesF(this.tempoBpm, sampleRate);
    this.stepBase = Math.max(1, Math.floor(f));
    this.stepRem = f - this.stepBase;

    if (resetPhase) {
      this.stepRemAcc = 0;
      this.samplesUntilStep = 0;
      this.stepIdx = 0;
    }
  }

  private stepIntervalSamples(): number {
    let n = this.stepBase;
    this.stepRemAcc += this.stepRem;
    if (this.stepRemAcc >= 1.0) {
      n += 1;
      this.stepRemAcc -= 1.0;
    }
    return n;
  }

  private stopVoice(): void {
    const ex = this.exports;
    if (!ex) return;
    if (this.currentNote != null) {
      ex.note_off(this.currentNote);
      this.currentNote = null;
    }
  }

  private noteOnHeld(note: number, velocity: number): void {
    this.held.set(note, velocity);
    if (!this.asPlayed.includes(note)) this.asPlayed.push(note);
  }

  private noteOffHeld(note: number): void {
    this.held.delete(note);
    const idx = this.asPlayed.indexOf(note);
    if (idx >= 0) this.asPlayed.splice(idx, 1);

    if (this.held.size === 0) {
      this.stopVoice();
      this.noteIdx = 0;
      this.updownDir = 1;
    }
  }

  private nextRandInt(max: number): number {
    this.rng = (this.rng * 1664525 + 1013904223) >>> 0;
    return max <= 1 ? 0 : this.rng % max;
  }

  private buildSequence(): { note: number; velocity: number }[] {
    const oct = clampInt(this.arp.octaves, 1, 4);

    let base: number[];
    if (this.arp.pattern === "asPlayed") {
      base = this.asPlayed.slice();
    } else {
      base = Array.from(this.held.keys()).sort((a, b) => a - b);
    }

    if (base.length === 0) return [];

    const expanded: { note: number; velocity: number }[] = [];
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

  private chooseNextNote(seq: { note: number; velocity: number }[]): { note: number; velocity: number } {
    if (seq.length === 1) return seq[0];

    if (this.arp.pattern === "random") {
      return seq[this.nextRandInt(seq.length)];
    }

    // Keep index in range if the chord changes.
    if (this.noteIdx >= seq.length) this.noteIdx = 0;

    if (this.arp.pattern === "updown") {
      const idx = this.noteIdx;
      const n = seq[idx];

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

      return n;
    }

    const n = seq[this.noteIdx % seq.length];
    this.noteIdx = (this.noteIdx + 1) % seq.length;
    return n;
  }

  private triggerDrum(id: DrumId): void {
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

  private processTransportStep(): void {
    const ex = this.exports;
    if (!ex) return;

    const idx = this.stepIdx & 15;

    // Arp tick
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

    // Drum tick
    if (this.drumsEnabled) {
      for (const id of drumIds()) {
        if ((this.drumPatterns[id][idx] ?? 0) === 1) this.triggerDrum(id);
      }
    }

    this.stepIdx = (this.stepIdx + 1) & 15;
  }

  private mixDrumsInto(dst: Float32Array, offset: number, n: number): void {
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

    // Cull finished voices.
    this.drumVoices = this.drumVoices.filter((v) => (v.pos | 0) < v.pcm.length && v.gain >= 1e-5);
  }

  private applyTempo(msg: TempoMsg): void {
    this.tempoBpm = Math.max(40, Math.min(240, msg.bpm || 120));
    this.reseedStepTiming(false);
    // Apply quickly and predictably.
    this.stepRemAcc = 0;
    this.samplesUntilStep = 0;
  }

  private applyArp(msg: ArpMsg): void {
    const prev = this.transportEnabled();
    const wasEnabled = this.arp.enabled;

    this.arp.enabled = !!msg.enabled;
    this.arp.octaves = clampInt(msg.octaves, 1, 4);
    this.arp.pattern = msg.pattern;
    this.arp.steps = normalizeSteps(msg.steps);

    if (!wasEnabled && this.arp.enabled) {
      // entering arp mode: stop any currently sounding note so arp takes over cleanly
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

  private applyDrumSamples(msg: DrumSamplesMsg): void {
    this.drumSrcToOut = (msg.sr || sampleRate) / sampleRate;
    for (const s of msg.samples) {
      this.drumSamples[s.id] = s.pcm;
    }
  }

  private applyDrums(msg: DrumMsg): void {
    const prev = this.transportEnabled();

    this.drumsEnabled = !!msg.enabled;

    for (const id of drumIds()) {
      const pat = msg.patterns?.[id];
      this.drumPatterns[id] = normalizeSteps(pat) as StepType[];

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

  private applyMix(msg: MixMsg): void {
    this.mix = {
      master: clamp01(msg.master),
      synth: clamp01(msg.synth),
      drums: clamp01(msg.drums),
      sendSynth: clamp01(msg.sendSynth),
      sendDrums: clamp01(msg.sendDrums)
    };
  }

  private applyFx(msg: FxMsg): void {
    const wasDelayEnabled = this.fx.delay.enabled;

    this.fx.drive = clamp01(msg.drive);
    this.fx.delay = {
      enabled: !!msg.delay?.enabled,
      beats: Math.max(0.25, Math.min(2.0, Number(msg.delay?.beats) || 0.5)),
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
      // keep existing buffer cleared so it starts clean
      this.delay.clear();
    }
  }

  private async onMsg(msg: InMsg): Promise<void> {
    if (msg.type === "initWasm") {
      try {
        const { instance } = await WebAssembly.instantiate(msg.bytes, {});
        const ex = instance.exports as any as WasmExports;
        if (!ex?.memory || !ex?.render || !ex?.init) throw new Error("Wasm exports missing required functions");
        ex.init(sampleRate);
        this.exports = ex;
        this.ready = true;
        this.reseedStepTiming(true);
        this.port.postMessage({ type: "ready" } as WorkletStatusMsg);
      } catch (e) {
        this.ready = false;
        this.exports = null;
        const message = e instanceof Error ? e.stack || e.message : String(e);
        this.port.postMessage({ type: "error", message } as WorkletStatusMsg);
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

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
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

      // Compute delay in samples for current tempo.
      const delaySamples = Math.round(sampleRate * (60 / Math.max(1, this.tempoBpm)) * this.fx.delay.beats);

      const m = this.mix;
      const fx = this.fx;

      // Precompute drive scalar trims.
      const drive = fx.drive;
      const pregain = 1 + drive * 12;
      const driveTrim = 1 / softclip(pregain);

      const delayFb = fx.delay.feedback;
      const delayRet = fx.delay.return;
      const revRet = fx.reverb.return;

      for (let i = 0; i < n; i++) {
        let s = this.tmpSynth[i];
        if (drive > 0.0001) {
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
}

registerProcessor("synth-processor", SynthProcessor);
