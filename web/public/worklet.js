// AudioWorkletProcessor entrypoint.
// Generated from src/audio/worklet.ts; do not edit by hand.


// src/audio/worklet.ts
var SynthProcessor = class extends AudioWorkletProcessor {
  exports = null;
  ready = false;
  constructor(_options) {
    super();
    this.port.onmessage = (ev) => void this.onMsg(ev.data);
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
    if (msg.type === "noteOn") ex.note_on(msg.note, msg.velocity);
    if (msg.type === "noteOff") ex.note_off(msg.note);
    if (msg.type === "param") ex.set_param(msg.id, msg.value);
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
};
registerProcessor("synth-processor", SynthProcessor);
