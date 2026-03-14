import type { ArpMsg, ArpPattern, DrumId, DrumMsg, DrumSamplesMsg, InMsg, TempoMsg, WorkletStatusMsg } from "./protocol";

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

  private mixDrums(out: Float32Array, offset: number, n: number): void {
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
      out.set(block, offset);

      this.mixDrums(out, offset, n);

      offset += n;

      if (this.transportEnabled()) {
        this.samplesUntilStep -= n;
      }
    }

    return true;
  }
}

registerProcessor("synth-processor", SynthProcessor);
