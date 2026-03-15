import type {
  ArpMsg,
  ControlMsg,
  DrumId,
  DrumMsg,
  DrumSamplesMsg,
  FxMsg,
  InitMsg,
  MixMsg,
  SynthParamId,
  TempoMsg,
  WorkletStatusMsg,
  ModSource,
  ModDest
} from "./protocol";

type Msg = ControlMsg | TempoMsg | ArpMsg | DrumMsg | DrumSamplesMsg | MixMsg | FxMsg;

type DecodedDrum = { id: DrumId; pcm: Float32Array };

async function decodeWavToMonoPcm(ctx: AudioContext, url: string): Promise<Float32Array> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch sample: ${resp.status} ${resp.statusText}`);
  const bytes = await resp.arrayBuffer();
  const buf = await ctx.decodeAudioData(bytes);

  const n = buf.length;
  const ch = buf.numberOfChannels;
  if (ch <= 1) return buf.getChannelData(0).slice();

  const out = new Float32Array(n);
  for (let c = 0; c < ch; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += data[i];
  }
  const inv = 1 / ch;
  for (let i = 0; i < n; i++) out[i] *= inv;
  return out;
}

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

    // Decode drum samples on the main thread and transfer PCM to the worklet.
    const drumBase = new URL("samples/tr505/", window.location.href).toString();
    const drums: DecodedDrum[] = [
      { id: "kick", pcm: await decodeWavToMonoPcm(ctx, `${drumBase}kick.wav`) },
      { id: "snare", pcm: await decodeWavToMonoPcm(ctx, `${drumBase}snare.wav`) },
      { id: "ch", pcm: await decodeWavToMonoPcm(ctx, `${drumBase}ch.wav`) },
      { id: "oh", pcm: await decodeWavToMonoPcm(ctx, `${drumBase}oh.wav`) }
    ];

    const samplesMsg: DrumSamplesMsg = { type: "drumSamples", sr: ctx.sampleRate, samples: drums };
    node.port.postMessage(
      samplesMsg,
      drums.map((d) => d.pcm.buffer)
    );

    // One-time default mix + fx state (UI can override after start).
    const mix: MixMsg = {
      type: "mix",
      master: 0.9,
      synth: 1.0,
      drums: 1.0,
      sendSynth: 0.25,
      sendDrums: 0.1
    };
    const fx: FxMsg = {
      type: "fx",
      drive: 0.2,
      delay: { enabled: true, beats: 0.5, feedback: 0.35, return: 0.25 },
      reverb: { enabled: true, decay: 0.45, damp: 0.4, return: 0.18 }
    };
    node.port.postMessage(mix);
    node.port.postMessage(fx);

    node.connect(ctx.destination);
    await ctx.resume();

    this.ctx = ctx;
    this.node = node;
    this.started = true;
  }

  setParam(id: SynthParamId, value: number): void {
    this.post({ type: "param", id, value });
  }

  addModulation(source: ModSource, dest: ModDest, amount: number): void {
    this.post({ type: "addMod", source, dest, amount });
  }

  removeModulation(source: ModSource, dest: ModDest): void {
    this.post({ type: "removeMod", source, dest });
  }

  noteOn(note: number, velocity: number): void {
    this.post({ type: "noteOn", note, velocity });
  }

  noteOff(note: number): void {
    this.post({ type: "noteOff", note });
  }

  setTempo(bpm: number): void {
    this.post({ type: "tempo", bpm });
  }

  setArp(config: Omit<ArpMsg, "type">): void {
    this.post({ type: "arp", ...config });
  }

  setDrums(config: Omit<DrumMsg, "type">): void {
    this.post({ type: "drums", ...config });
  }

  setMix(config: Omit<MixMsg, "type">): void {
    this.post({ type: "mix", ...config });
  }

  setFx(config: Omit<FxMsg, "type">): void {
    this.post({ type: "fx", ...config });
  }

  private post(msg: Msg): void {
    if (!this.node) return;
    this.node.port.postMessage(msg);
  }
}
