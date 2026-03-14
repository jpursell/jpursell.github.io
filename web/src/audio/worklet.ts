import type { ArpMsg, ArpPattern, InMsg, WorkletStatusMsg } from "./protocol";

const MAX_BLOCK = 128;

type WasmExports = {
  memory: WebAssembly.Memory;
  init: (sr: number) => void;
  note_on: (note: number, velocity: number) => void;
  note_off: (note: number) => void;
  set_param: (paramId: number, value: number) => void;
  render: (frames: number) => number;
};

type StepType = 0 | 1 | 2; // 0=REST, 1=GATE, 2=TIE

type ArpState = {
  enabled: boolean;
  bpm: number;
  octaves: number;
  pattern: ArpPattern;
  steps: StepType[];
};

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v | 0));
}

function normalizeSteps(steps: number[] | undefined): StepType[] {
  const out: StepType[] = new Array(16);
  for (let i = 0; i < 16; i++) {
    const v = steps?.[i] ?? 1;
    out[i] = (v === 2 ? 2 : v === 0 ? 0 : 1) as StepType;
  }
  return out;
}

function stepSamplesF(bpm: number, sr: number): number {
  const b = Math.max(20, Math.min(400, bpm || 120));
  // 16th notes
  return (sr * 60) / b / 4;
}

class SynthProcessor extends AudioWorkletProcessor {
  private exports: WasmExports | null = null;
  private ready = false;

  // Track held notes always, so toggling arp on while holding notes works.
  private held = new Map<number, number>(); // note -> velocity
  private asPlayed: number[] = [];

  private arp: ArpState = {
    enabled: false,
    bpm: 120,
    octaves: 1,
    pattern: "up",
    steps: new Array(16).fill(1) as StepType[]
  };

  private stepIdx = 0;
  private noteIdx = 0;
  private updownDir: 1 | -1 = 1;

  private samplesUntilStep = 0;
  private stepBase = 0;
  private stepRem = 0;
  private stepRemAcc = 0;

  private currentNote: number | null = null;
  private rng = 0xC0FFEE;

  constructor(_options: AudioWorkletNodeOptions) {
    super();
    this.port.onmessage = (ev) => void this.onMsg(ev.data as InMsg);
  }

  private reseedStepTiming(): void {
    const f = stepSamplesF(this.arp.bpm, sampleRate);
    this.stepBase = Math.max(1, Math.floor(f));
    this.stepRem = f - this.stepBase;
    // Reset counters so changes take effect quickly and predictably.
    this.stepRemAcc = 0;
    this.samplesUntilStep = 0;
  }

  private resetArpCounters(): void {
    this.stepIdx = 0;
    this.noteIdx = 0;
    this.updownDir = 1;
    this.samplesUntilStep = 0;
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
    } else {
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

      // advance for next gate
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

  private stepIntervalSamples(): number {
    let n = this.stepBase;
    this.stepRemAcc += this.stepRem;
    if (this.stepRemAcc >= 1.0) {
      n += 1;
      this.stepRemAcc -= 1.0;
    }
    return n;
  }

  private processStep(): void {
    const ex = this.exports;
    if (!ex) return;

    const seq = this.buildSequence();

    if (seq.length === 0) {
      this.stopVoice();
      return;
    }

    const step = this.arp.steps[this.stepIdx] ?? 1;

    if (step === 0) {
      // REST
      this.stopVoice();
    } else if (step === 2) {
      // TIE
      // do nothing
    } else {
      // GATE
      const next = this.chooseNextNote(seq);
      if (this.currentNote != null) ex.note_off(this.currentNote);
      ex.note_on(next.note, next.velocity);
      this.currentNote = next.note;
    }

    this.stepIdx = (this.stepIdx + 1) % 16;
  }

  private applyArp(msg: ArpMsg): void {
    const wasEnabled = this.arp.enabled;

    this.arp.enabled = !!msg.enabled;
    this.arp.bpm = Math.max(40, Math.min(240, msg.bpm || 120));
    this.arp.octaves = clampInt(msg.octaves, 1, 4);
    this.arp.pattern = msg.pattern;
    this.arp.steps = normalizeSteps(msg.steps);

    this.reseedStepTiming();

    if (!wasEnabled && this.arp.enabled) {
      // entering arp mode: stop any currently sounding note so arp takes over cleanly
      this.stopVoice();
      this.resetArpCounters();
    }

    if (wasEnabled && !this.arp.enabled) {
      // leaving arp mode: stop arp note
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
        this.reseedStepTiming();
        this.port.postMessage({ type: "ready" } as WorkletStatusMsg);
      } catch (e) {
        this.ready = false;
        this.exports = null;
        const message = e instanceof Error ? (e.stack || e.message) : String(e);
        this.port.postMessage({ type: "error", message } as WorkletStatusMsg);
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
      // Drive arp events at sample-accurate step boundaries.
      if (this.arp.enabled) {
        // If no held notes, ensure voice is off.
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
}

registerProcessor("synth-processor", SynthProcessor);


