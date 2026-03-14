export const PARAM_WAVEFORM = 0 as const;
export const PARAM_CUTOFF = 1 as const;
export const PARAM_ATTACK = 2 as const;
export const PARAM_RELEASE = 3 as const;
export const PARAM_VOLUME = 4 as const;

export type SynthParamId = 0 | 1 | 2 | 3 | 4;

export type ControlMsg =
  | { type: "noteOn"; note: number; velocity: number }
  | { type: "noteOff"; note: number }
  | { type: "param"; id: SynthParamId; value: number };

export type InitMsg = { type: "initWasm"; bytes: ArrayBuffer };

export type InMsg = InitMsg | ControlMsg;

export type WorkletStatusMsg = { type: "ready" } | { type: "error"; message: string };
