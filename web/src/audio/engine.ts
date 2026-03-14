import type { ArpMsg, ControlMsg, InitMsg, SynthParamId, WorkletStatusMsg } from "./protocol";

type Msg = ControlMsg | ArpMsg;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private started = false;

  async start(): Promise<void> {
    if (this.started) return;

    const ctx = new AudioContext({ latencyHint: "interactive" });
    const workletUrl = new URL("worklet.js", window.location.href);

    await ctx.audioWorklet.addModule(workletUrl.toString());

    const node = new AudioWorkletNode(ctx, "synth-processor", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: {}
    });

    // Some browsers restrict what you can do inside AudioWorkletGlobalScope.
    // Fetch Wasm on the main thread and transfer the bytes into the worklet.
    const wasmUrl = new URL("wasm/synth.wasm", window.location.href).toString();
    const resp = await fetch(wasmUrl);
    if (!resp.ok) throw new Error(`Failed to fetch wasm: ${resp.status} ${resp.statusText}`);
    const bytes = await resp.arrayBuffer();

    await new Promise<void>((resolve, reject) => {
      const t = globalThis.setTimeout(() => reject(new Error("AudioWorklet init timed out")), 8000);
      node.port.onmessage = (ev) => {
        const msg = ev.data as WorkletStatusMsg;
        if (msg?.type === "ready") {
          globalThis.clearTimeout(t);
          resolve();
          return;
        }
        if (msg?.type === "error") {
          globalThis.clearTimeout(t);
          reject(new Error(msg.message));
        }
      };

      const init: InitMsg = { type: "initWasm", bytes };
      node.port.postMessage(init);
    });

    node.connect(ctx.destination);
    await ctx.resume();

    this.ctx = ctx;
    this.node = node;
    this.started = true;
  }

  setParam(id: SynthParamId, value: number): void {
    this.post({ type: "param", id, value });
  }

  noteOn(note: number, velocity: number): void {
    this.post({ type: "noteOn", note, velocity });
  }

  noteOff(note: number): void {
    this.post({ type: "noteOff", note });
  }


  setArp(config: Omit<ArpMsg, "type">): void {
    this.post({ type: "arp", ...config });
  }  private post(msg: Msg): void {
    if (!this.node) return;
    this.node.port.postMessage(msg);
  }
}





