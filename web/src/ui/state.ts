import { signal, effect } from "@preact/signals";
import { AudioEngine } from "../audio/engine";
import * as P from "../audio/protocol";

export const activeTrackId = signal(0);
export const bpm = signal(120);

export const synthParams = {
  [P.PARAM_WAVEFORM]: signal(0),
  [P.PARAM_CUTOFF]: signal(0.45),
  [P.PARAM_ATTACK]: signal(0.01),
  [P.PARAM_RELEASE]: signal(0.15),
  [P.PARAM_VOLUME]: signal(0.7),
  [P.PARAM_RESONANCE]: signal(0.2),
  [P.PARAM_DECAY]: signal(0.12),
  [P.PARAM_SUSTAIN]: signal(0.6),
  [P.PARAM_FILTER_ENV_AMT]: signal(0.5),
  [P.PARAM_OSC2_WAVEFORM]: signal(0),
  [P.PARAM_OSC_MIX]: signal(0.35),
  [P.PARAM_DETUNE_CENTS]: signal(0),
  [P.PARAM_OSC2_SEMITONES]: signal(0),
  [P.PARAM_GLIDE]: signal(0),
  [P.PARAM_KEYTRACK]: signal(0),
  [P.PARAM_NOISE]: signal(0),
  [P.PARAM_FILT_ATTACK]: signal(0.005),
  [P.PARAM_FILT_DECAY]: signal(0.12),
  [P.PARAM_FILT_SUSTAIN]: signal(0),
  [P.PARAM_FILT_RELEASE]: signal(0.15),
  [P.PARAM_LFO1_RATE]: signal(1),
  [P.PARAM_LFO1_SHAPE]: signal(0),
  [P.PARAM_LFO2_RATE]: signal(1),
  [P.PARAM_LFO2_SHAPE]: signal(0),
  [P.PARAM_OSC_FM]: signal(0),
  [P.PARAM_SHAPER_AMT]: signal(0),
  [P.PARAM_FILTER_TYPE]: signal(0),
  [P.PARAM_COMB_TIME]: signal(0.01),
  [P.PARAM_COMB_FEEDBACK]: signal(0.8),
  [P.PARAM_COMB_MIX]: signal(0),
};

export const mixerState = {
  master: signal(0.9),
  synth: signal(1.0),
  drums: signal(1.0),
  sendSynth: signal(0.25),
  sendDrums: signal(0.1),
};

export const fxState = {
  drive: signal(0.2),
  delay: {
    enabled: signal(true),
    beats: signal(0.5),
    feedback: signal(0.35),
    return: signal(0.25),
  },
  reverb: {
    enabled: signal(true),
    decay: signal(0.45),
    damp: signal(0.4),
    return: signal(0.18),
  },
};

export const arpState = {
  enabled: signal(false),
  octaves: signal(1),
  pattern: signal<P.ArpPattern>("up"),
  steps: signal([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
};

export const transportState = {
  playing: signal(false),
  recording: signal(false),
};

export const scaleState = {
  root: signal(0),
  type: signal(4), // Minor Pentatonic default
};

export const inputView = signal<"kbd" | "seq" | "xy">("kbd");
export const octaveShift = signal(0);
export const audioReady = signal(false);

const INITIAL_STEPS = 16;
const MAX_NOTES = 14;

function createEmptyGrid(rows: number) {
  return Array.from({ length: INITIAL_STEPS }, () => new Array(rows).fill(false));
}

export const sequencerState = {
  tracks: {
    0: signal<boolean[][]>(createEmptyGrid(MAX_NOTES)),
    1: signal<boolean[][]>(createEmptyGrid(4)),
  }
};

export interface Connection {
  source: P.ModSource;
  dest: P.ModDest;
  amount: number;
}
export const connections = signal<Connection[]>([]);

export function setupAudioSync(engine: AudioEngine) {
  // Sync synth params
  for (const [idStr, sig] of Object.entries(synthParams)) {
    const id = Number(idStr) as P.SynthParamId;
    effect(() => {
      engine.setParam(id, sig.value, activeTrackId.peek());
    });
  }

  // Sync modulation connections
  let lastConnections: Connection[] = [];
  effect(() => {
    const current = connections.value;
    const trackId = activeTrackId.value;
    // removed
    for (const c of lastConnections) {
      if (!current.find(curr => curr.source === c.source && curr.dest === c.dest)) {
        engine.removeModulation(c.source, c.dest, trackId);
      }
    }
    // added or changed
    for (const c of current) {
      engine.addModulation(c.source, c.dest, c.amount, trackId);
    }
    lastConnections = [...current];
  });

  // Sync mixer
  effect(() => {
    engine.setMix({
      master: mixerState.master.value,
      synth: mixerState.synth.value,
      drums: mixerState.drums.value,
      sendSynth: mixerState.sendSynth.value,
      sendDrums: mixerState.sendDrums.value,
    });
  });

  // Sync FX
  effect(() => {
    engine.setFx({
      drive: fxState.drive.value,
      delay: {
        enabled: fxState.delay.enabled.value,
        beats: fxState.delay.beats.value,
        feedback: fxState.delay.feedback.value,
        return: fxState.delay.return.value,
      },
      reverb: {
        enabled: fxState.reverb.enabled.value,
        decay: fxState.reverb.decay.value,
        damp: fxState.reverb.damp.value,
        return: fxState.reverb.return.value,
      },
    });
  });

  // Sync Arp
  effect(() => {
    engine.setArp({
      enabled: arpState.enabled.value,
      octaves: arpState.octaves.value,
      pattern: arpState.pattern.value,
      steps: arpState.steps.value,
    }, activeTrackId.peek());
  });

  // Sync BPM
  effect(() => {
    engine.setTempo(bpm.value);
  });

  // Sync Recording
  effect(() => {
    engine.setRecording(transportState.recording.value);
  });

  // Sync Scale
  effect(() => {
    engine.setScale(scaleState.root.value, scaleState.type.value);
  });
}
