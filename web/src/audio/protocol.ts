export * from "./params";
export type { SynthParamId } from "./params";

export enum ModSource {
  Lfo1 = 0,
  Lfo2 = 1,
  FiltEnv = 2,
}

export enum ModDest {
  Cutoff = 0,
  Pitch = 1,
  OscMix = 2,
}

export type ControlMsg =
  | { type: "noteOn"; note: number; velocity: number }
  | { type: "noteOff"; note: number }
  | { type: "param"; id: SynthParamId; value: number }
  | { type: "addMod"; source: ModSource; dest: ModDest; amount: number }
  | { type: "removeMod"; source: ModSource; dest: ModDest };

export type InitMsg = { type: "initWasm"; bytes: ArrayBuffer };

export type TempoMsg = { type: "tempo"; bpm: number };

export type ArpPattern = "up" | "down" | "updown" | "random" | "asPlayed";

// steps: length 16; 0=OFF/REST, 1=ON/GATE
export type ArpMsg = {
  type: "arp";
  enabled: boolean;
  octaves: number;
  pattern: ArpPattern;
  steps: number[];
};

export type DrumId = "kick" | "snare" | "ch" | "oh";

export type DrumSamplesMsg = {
  type: "drumSamples";
  sr: number;
  samples: { id: DrumId; pcm: Float32Array }[];
};

export type DrumMsg = {
  type: "drums";
  enabled: boolean;
  patterns: Record<DrumId, number[]>;
  params: Record<DrumId, { level: number; tune: number; decay: number }>;
};

export type MixMsg = {
  type: "mix";
  master: number;
  synth: number;
  drums: number;
  sendSynth: number;
  sendDrums: number;
};

export type FxMsg = {
  type: "fx";
  drive: number;
  delay: { enabled: boolean; beats: number; feedback: number; return: number };
  reverb: { enabled: boolean; decay: number; damp: number; return: number };
};

export type InMsg = InitMsg | ControlMsg | TempoMsg | ArpMsg | DrumSamplesMsg | DrumMsg | MixMsg | FxMsg;

export type WorkletStatsMsg = {
  type: "stats";
  loadPct: number;
  wasmPct: number;
  jsPct: number;
};

export type WorkletStatusMsg = { type: "ready" } | { type: "error"; message: string } | WorkletStatsMsg;
