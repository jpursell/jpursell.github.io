// AudioWorkletProcessor entrypoint.
// Kept as plain JS in /public so Vite and GitHub Pages can serve it without TS transpilation.

class SynthProcessor extends AudioWorkletProcessor {
  constructor(_options) {
    super();
    this._exports = null;
    this._ready = false;
    this.port.onmessage = (ev) => void this._onMsg(ev.data);
  }

  async _onMsg(msg) {
    if (msg && msg.type === "initWasm") {
      try {
        const bytes = msg.bytes;
        const input = bytes instanceof ArrayBuffer ? bytes : bytes?.buffer;
        if (!(input instanceof ArrayBuffer)) throw new Error("initWasm missing ArrayBuffer bytes");

        const { instance } = await WebAssembly.instantiate(input, {});
        const ex = instance.exports;
        if (!ex || !ex.memory || !ex.render || !ex.init) throw new Error("Wasm exports missing required functions");

        ex.init(sampleRate);
        this._exports = ex;
        this._ready = true;
        this.port.postMessage({ type: "ready" });
      } catch (e) {
        this._exports = null;
        this._ready = false;
        const message = e && e.stack ? String(e.stack) : String(e);
        this.port.postMessage({ type: "error", message });
      }
      return;
    }

    const ex = this._exports;
    if (!this._ready || !ex || !msg) return;

    if (msg.type === "noteOn") ex.note_on(msg.note, msg.velocity);
    if (msg.type === "noteOff") ex.note_off(msg.note);
    if (msg.type === "param") ex.set_param(msg.id, msg.value);
  }

  process(_inputs, outputs) {
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;

    const ex = this._exports;
    if (!this._ready || !ex) {
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
