export const PARAM_WAVEFORM = 0 as const;
export const PARAM_CUTOFF = 1 as const;
export const PARAM_ATTACK = 2 as const;
export const PARAM_RELEASE = 3 as const;
export const PARAM_VOLUME = 4 as const;
export const PARAM_RESONANCE = 5 as const;
export const PARAM_DECAY = 6 as const;
export const PARAM_SUSTAIN = 7 as const;
export const PARAM_FILTER_ENV_AMT = 8 as const;

export const PARAM_OSC2_WAVEFORM = 9 as const;
export const PARAM_OSC_MIX = 10 as const;
export const PARAM_DETUNE_CENTS = 11 as const;
export const PARAM_OSC2_SEMITONES = 12 as const;
export const PARAM_GLIDE = 13 as const;
export const PARAM_KEYTRACK = 14 as const;
export const PARAM_NOISE = 15 as const;

export const PARAM_FILT_ATTACK = 16 as const;
export const PARAM_FILT_DECAY = 17 as const;
export const PARAM_FILT_SUSTAIN = 18 as const;
export const PARAM_FILT_RELEASE = 19 as const;

export const PARAM_LFO1_RATE = 20 as const;
export const PARAM_LFO1_SHAPE = 21 as const;
export const PARAM_LFO2_RATE = 22 as const;
export const PARAM_LFO2_SHAPE = 23 as const;

export type SynthParamId =
  | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23;

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

export type WorkletStatusMsg = { type: "ready" } | { type: "error"; message: string };
