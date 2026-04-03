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
  
  public onStats?: (loadPct: number, wasmPct: number, jsPct: number) => void;

  async start(): Promise<void> {
    if (this.started) return;

    const ctx = new AudioContext({ latencyHint: "balanced" });
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
      let isResolved = false;
      const t = globalThis.setTimeout(() => reject(new Error("AudioWorklet init timed out")), 8000);
      node.port.onmessage = (ev) => {
        const msg = ev.data as WorkletStatusMsg;
        if (msg?.type === "ready") {
          if (!isResolved) {
            globalThis.clearTimeout(t);
            isResolved = true;
            resolve();
          }
        } else if (msg?.type === "error") {
          if (!isResolved) {
            globalThis.clearTimeout(t);
            reject(new Error(msg.message));
          }
        } else if (msg?.type === "stats") {
          this.onStats?.(msg.loadPct, msg.wasmPct, msg.jsPct);
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

    const samplesMsg: DrumSamplesMsg = { type: "drumSamples", trackId: 1, sr: ctx.sampleRate, samples: drums };
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

  setParam(id: SynthParamId, value: number, trackId: number = 0): void {
    this.post({ type: "param", trackId, id, value });
  }

  addModulation(source: ModSource, dest: ModDest, amount: number, trackId: number = 0): void {
    this.post({ type: "addMod", trackId, source, dest, amount });
  }

  removeModulation(source: ModSource, dest: ModDest, trackId: number = 0): void {
    this.post({ type: "removeMod", trackId, source, dest });
  }

  noteOn(note: number, velocity: number, trackId: number = 0): void {
    this.post({ type: "noteOn", trackId, note, velocity });
  }

  noteOnScale(scaleIndex: number, velocity: number, trackId: number = 0): void {
    this.post({ type: "noteOnScale", trackId, scaleIndex, velocity });
  }

  noteOffScale(scaleIndex: number, trackId: number = 0): void {
    this.post({ type: "noteOffScale", trackId, scaleIndex });
  }

  noteOff(note: number, trackId: number = 0): void {
    this.post({ type: "noteOff", trackId, note });
  }

  setTempo(bpm: number): void {
    this.post({ type: "tempo", bpm });
  }

  setArp(config: Omit<ArpMsg, "type" | "trackId">, trackId: number = 0): void {
    this.post({ type: "arp", trackId, ...config });
  }

  setDrums(config: Omit<DrumMsg, "type" | "trackId">, trackId: number = 1): void {
    this.post({ type: "drums", trackId, ...config });
  }

  setMix(config: Omit<MixMsg, "type">): void {
    this.post({ type: "mix", ...config });
  }

  setFx(config: Omit<FxMsg, "type">): void {
    this.post({ type: "fx", ...config });
  }

  setScale(rootNote: number, scaleType: number): void {
    this.post({ type: "scale", rootNote, scaleType });
  }

  setGridStep(trackId: number, step: number, active: boolean, scaleIndex: number, velocity: number = 1.0): void {
    this.post({ type: "gridStep", trackId, step, active, scaleIndex, velocity });
  }

  setGridSteps(trackId: number, numSteps: number): void {
    this.post({ type: "gridSteps", trackId, numSteps });
  }

  setRecording(enabled: boolean): void {
    this.post({ type: "record", enabled });
  }

  private post(msg: Msg | { type: "scale" | "gridStep" | "gridSteps" | "record" } & any): void {
    if (!this.node) return;
    this.node.port.postMessage(msg);
  }
}
