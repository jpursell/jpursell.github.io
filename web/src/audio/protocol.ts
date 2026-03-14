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

export type SynthParamId =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19;

export type ControlMsg =
  | { type: "noteOn"; note: number; velocity: number }
  | { type: "noteOff"; note: number }
  | { type: "param"; id: SynthParamId; value: number };

export type InitMsg = { type: "initWasm"; bytes: ArrayBuffer };

export type InMsg = InitMsg | ControlMsg;

export type WorkletStatusMsg = { type: "ready" } | { type: "error"; message: string };
