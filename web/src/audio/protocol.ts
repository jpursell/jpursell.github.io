export * from "./params";
import type { SynthParamId } from "./params";
export type { SynthParamId };

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
  | { type: "noteOn"; trackId: number; note: number; velocity: number }
  | {type: "noteOnScale"; trackId: number; scaleIndex: number; velocity: number}
  | {type: "noteOffScale"; trackId: number; scaleIndex: number}
  | {type: "noteOff"; trackId: number; note: number}
  | { type: "param"; trackId: number; id: SynthParamId; value: number }
  | { type: "addMod"; trackId: number; source: ModSource; dest: ModDest; amount: number }
  | { type: "removeMod"; trackId: number; source: ModSource; dest: ModDest };

export type InitMsg = { type: "initWasm"; bytes: ArrayBuffer };

export type TempoMsg = { type: "tempo"; bpm: number };

export type ArpPattern = "up" | "down" | "updown" | "random" | "asPlayed";

// steps: length 16; 0=OFF/REST, 1=ON/GATE
export type ArpMsg = {
  type: "arp";
  trackId: number;
  enabled: boolean;
  octaves: number;
  pattern: ArpPattern;
  steps: number[];
};

export type DrumId = "kick" | "snare" | "ch" | "oh";

export type DrumSamplesMsg = {
  type: "drumSamples";
  trackId: number;
  sr: number;
  samples: { id: DrumId; pcm: Float32Array }[];
};

export type DrumMsg = {
  type: "drums";
  trackId: number;
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

export type ScaleMsg = {
  type: "scale";
  rootNote: number;
  scaleType: number;
};

export type GridStepMsg = {
  type: "gridStep";
  trackId: number;
  step: number;
  active: boolean;
  scaleIndex: number;
  velocity: number;
};

export type GridStepsMsg = {
  type: "gridSteps";
  trackId: number;
  numSteps: number;
};

export type RecordMsg = { type: "record"; enabled: boolean };

export type InMsg = InitMsg | ControlMsg | TempoMsg | ArpMsg | DrumSamplesMsg | DrumMsg | MixMsg | FxMsg | ScaleMsg | GridStepMsg | GridStepsMsg | RecordMsg;

export type WorkletStatsMsg = {
  type: "stats";
  loadPct: number;
  wasmPct: number;
  jsPct: number;
};

export type WorkletStatusMsg = { type: "ready" } | { type: "error"; message: string } | WorkletStatsMsg;
