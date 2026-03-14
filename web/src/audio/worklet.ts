import type { InMsg, WorkletStatusMsg } from "./protocol";


type WasmExports = {
  memory: WebAssembly.Memory;
  init: (sr: number) => void;
  note_on: (note: number, velocity: number) => void;
  note_off: (note: number) => void;
  set_param: (paramId: number, value: number) => void;
  render: (frames: number) => number;
};

class SynthProcessor extends AudioWorkletProcessor {
  private exports: WasmExports | null = null;
  private ready = false;

  constructor(_options: AudioWorkletNodeOptions) {
    super();
    this.port.onmessage = (ev) => void this.onMsg(ev.data as InMsg);
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

    if (msg.type === "noteOn") ex.note_on(msg.note, msg.velocity);
    if (msg.type === "noteOff") ex.note_off(msg.note);
    if (msg.type === "param") ex.set_param(msg.id, msg.value);
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
      const n = Math.min(128, frames - offset);
      const ptr = ex.render(n);
      if (!ptr) {
        out.fill(0);
        return true;
      }
      const block = new Float32Array(ex.memory.buffer, ptr, n);
      out.set(block, offset);
      offset += n;
    }
    return true;
  }
}

registerProcessor("synth-processor", SynthProcessor);




