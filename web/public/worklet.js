// AudioWorkletProcessor entrypoint.
// Generated from src/audio/worklet.ts; do not edit by hand.


// src/audio/worklet.ts
var MAX_BLOCK = 128;
function arpPatternToId(p) {
  switch (p) {
    case "up":
      return 0;
    case "down":
      return 1;
    case "updown":
      return 2;
    case "random":
      return 3;
    case "asPlayed":
      return 4;
    default:
      return 0;
  }
}
function drumIds() {
  return ["kick", "snare", "ch", "oh"];
}
var SynthProcessor = class extends AudioWorkletProcessor {
  exports = null;
  ready = false;
  wasmMemView = null;
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
    if (msg.type === "tempo") {
      ex.set_tempo(msg.bpm);
      return;
    }
    if (msg.type === "drumSamples") {
      const ptr = ex.get_sample_transfer_ptr();
      if (!ptr) return;
      const mem = new Float32Array(ex.memory.buffer);
      const ids = drumIds();
      for (const s of msg.samples) {
        const dIdx = ids.indexOf(s.id);
        if (dIdx < 0) continue;
        mem.set(s.pcm, ptr >> 2);
        ex.set_drum_sample(msg.trackId, dIdx, ptr, s.pcm.length, msg.sr || sampleRate);
      }
      return;
    }
    if (msg.type === "drums") {
      ex.set_drums_enabled(msg.trackId, !!msg.enabled);
      const ids = drumIds();
      for (let i = 0; i < 4; i++) {
        const id = ids[i];
        const pat = msg.patterns?.[id];
        if (pat) {
          for (let s = 0; s < 16; s++) {
            ex.set_drum_pattern(msg.trackId, i, s, pat[s] ? 1 : 0);
          }
        }
        const p = msg.params?.[id];
        if (p) {
          ex.set_drum_params(msg.trackId, i, p.level, Number(p.tune) || 0, p.decay);
        }
      }
      return;
    }
    if (msg.type === "mix") {
      ex.set_mix(msg.master, msg.synth, msg.drums, msg.sendSynth, msg.sendDrums);
      return;
    }
    if (msg.type === "fx") {
      ex.set_fx(
        msg.drive,
        !!msg.delay?.enabled,
        Number(msg.delay?.beats) || 0.5,
        Number(msg.delay?.feedback) || 0,
        Number(msg.delay?.return) || 0,
        !!msg.reverb?.enabled,
        Number(msg.reverb?.decay) || 0,
        Number(msg.reverb?.damp) || 0,
        Number(msg.reverb?.return) || 0
      );
      return;
    }
    if (msg.type === "scale") {
      ex.set_scale(msg.rootNote, msg.scaleType);
      return;
    }
    if (msg.type === "gridStep") {
      ex.set_grid_step(msg.trackId, msg.step, msg.active, msg.scaleIndex, msg.velocity);
      return;
    }
    if (msg.type === "gridSteps") {
      ex.set_grid_steps(msg.trackId, msg.numSteps);
      return;
    }
    if (msg.type === "record") {
      ex.set_recording(msg.enabled);
      return;
    }
    if (msg.type === "arp") {
      ex.set_arp(msg.trackId, !!msg.enabled, msg.octaves, arpPatternToId(msg.pattern));
      if (msg.steps) {
        for (let i = 0; i < 16; i++) {
          ex.set_arp_step(msg.trackId, i, msg.steps[i] ? 1 : 0);
        }
      }
      return;
    }
    if (msg.type === "noteOn") {
      ex.note_on(msg.trackId, msg.note, msg.velocity);
      return;
    }
    if (msg.type === "noteOnScale") {
      ex.note_on_scale(msg.trackId, msg.scaleIndex, msg.velocity);
      return;
    }
    if (msg.type === "noteOffScale") {
      ex.note_off_scale(msg.trackId, msg.scaleIndex);
      return;
    }
    if (msg.type === "noteOff") {
      ex.note_off(msg.trackId, msg.note);
      return;
    }
    if (msg.type === "param") {
      ex.set_param(msg.trackId, msg.id, msg.value);
      return;
    }
    if (msg.type === "addMod") {
      ex.add_mod_routing?.(msg.trackId, msg.source, msg.dest, msg.amount);
      return;
    }
    if (msg.type === "removeMod") {
      ex.remove_mod_routing?.(msg.trackId, msg.source, msg.dest);
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
};
registerProcessor("synth-processor", SynthProcessor);
