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
  get_transfer_ptr: () => number;
  process_events: (ptr: number, len: number) => void;
  set_drum_sample: (trackId: number, drumIdx: number, ptr: number, len: number, sr: number) => void;
  render: (frames: number) => number;
};

function arpPatternToId(p: ArpPattern): number {
  switch (p) {
    case "up": return 0;
    case "down": return 1;
    case "updown": return 2;
    case "random": return 3;
    case "asPlayed": return 4;
    default: return 0;
  }
}

function drumIds(): DrumId[] {
  return ["kick", "snare", "ch", "oh"];
}

class SynthProcessor extends AudioWorkletProcessor {
  private exports: WasmExports | null = null;
  private ready = false;
  private wasmMemView: Float32Array | null = null;

  constructor(_options: AudioWorkletNodeOptions) {
    super();
    this.port.onmessage = (ev) => void this.onMsg(ev.data as InMsg);
  }

  private pushEvents(events: number[]): void {
    const ex = this.exports;
    if (!ex || !this.ready) return;
    const ptr = ex.get_transfer_ptr();
    if (!this.wasmMemView || this.wasmMemView.buffer !== ex.memory.buffer) {
        this.wasmMemView = new Float32Array(ex.memory.buffer);
    }
    this.wasmMemView.set(events, ptr >> 2);
    ex.process_events(ptr, events.length);
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
        this.wasmMemView = new Float32Array(ex.memory.buffer);
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
      this.pushEvents([6, msg.bpm]);
      return;
    }

    if (msg.type === "drumSamples") {
      const ptr = ex.get_transfer_ptr();
      if (!ptr) return;
      const mem = new Float32Array(ex.memory.buffer);
      const ids = drumIds();
      for (const s of msg.samples) {
        const dIdx = ids.indexOf(s.id);
        if (dIdx < 0) continue;
        // Copy to transfer buffer
        mem.set(s.pcm, ptr >> 2);
        ex.set_drum_sample(msg.trackId, dIdx, ptr, s.pcm.length, msg.sr || sampleRate);
      }
      return;
    }

    if (msg.type === "drums") {
      const events: number[] = [];
      events.push(9, msg.trackId, msg.enabled ? 1 : 0);
      const ids = drumIds();
      for (let i = 0; i < 4; i++) {
        const id = ids[i];
        const pat = msg.patterns?.[id];
        if (pat) {
          for (let s = 0; s < 16; s++) {
            events.push(10, msg.trackId, i, s, pat[s] ? 1 : 0);
          }
        }
        const p = msg.params?.[id];
        if (p) {
          events.push(11, msg.trackId, i, p.level, Number(p.tune) || 0, p.decay);
        }
      }
      this.pushEvents(events);
      return;
    }

    if (msg.type === "mix") {
      this.pushEvents([12, msg.master, msg.synth, msg.drums, msg.sendSynth, msg.sendDrums]);
      return;
    }

    if (msg.type === "fx") {
      this.pushEvents([
        13,
        msg.drive,
        msg.delay?.enabled ? 1 : 0,
        Number(msg.delay?.beats) || 0.5,
        Number(msg.delay?.feedback) || 0,
        Number(msg.delay?.return) || 0,
        msg.reverb?.enabled ? 1 : 0,
        Number(msg.reverb?.decay) || 0,
        Number(msg.reverb?.damp) || 0,
        Number(msg.reverb?.return) || 0
      ]);
      return;
    }

    if (msg.type === "scale") {
      this.pushEvents([14, msg.rootNote, msg.scaleType]);
      return;
    }

    if (msg.type === "gridStep") {
      this.pushEvents([15, msg.trackId, msg.step, msg.active ? 1 : 0, msg.scaleIndex, msg.velocity]);
      return;
    }

    if (msg.type === "gridSteps") {
      this.pushEvents([16, msg.trackId, msg.numSteps]);
      return;
    }

    if (msg.type === "record") {
      this.pushEvents([17, msg.enabled ? 1 : 0]);
      return;
    }

    if (msg.type === "arp") {
      const events: number[] = [7, msg.trackId, msg.enabled ? 1 : 0, msg.octaves, arpPatternToId(msg.pattern)];
      if (msg.steps) {
        for (let i = 0; i < 16; i++) {
          events.push(8, msg.trackId, i, msg.steps[i] ? 1 : 0);
        }
      }
      this.pushEvents(events);
      return;
    }

    if (msg.type === "noteOn") {
      this.pushEvents([1, msg.trackId, msg.note, msg.velocity]);
      return;
    }

    if (msg.type === "noteOnScale") {
      this.pushEvents([3, msg.trackId, msg.scaleIndex, msg.velocity]);
      return;
    }

    if (msg.type === "noteOffScale") {
      this.pushEvents([4, msg.trackId, msg.scaleIndex]);
      return;
    }

    if (msg.type === "noteOff") {
      this.pushEvents([2, msg.trackId, msg.note]);
      return;
    }

    if (msg.type === "param") {
      this.pushEvents([5, msg.trackId, msg.id, msg.value]);
      return;
    }

    if (msg.type === "addMod") {
      this.pushEvents([18, msg.trackId, msg.source, msg.dest, msg.amount]);
      return;
    }

    if (msg.type === "removeMod") {
      this.pushEvents([19, msg.trackId, msg.source, msg.dest]);
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

    if (!this.wasmMemView || this.wasmMemView.buffer !== ex.memory.buffer) {
      this.wasmMemView = new Float32Array(ex.memory.buffer);
    }

    while (offset < frames) {
      const n = Math.min(MAX_BLOCK, frames - offset);
      const ptr = ex.render(n);
      
      if (!ptr) {
        out.fill(0, offset, offset + n);
      } else {
        const ptrF32 = ptr >> 2;
        out.set(this.wasmMemView.subarray(ptrF32, ptrF32 + n), offset);
      }

      offset += n;
    }

    return true;
  }
}

registerProcessor("synth-processor", SynthProcessor);
