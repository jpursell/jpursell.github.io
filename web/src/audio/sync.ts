import { effect } from "@preact/signals";
import { AudioEngine } from "./engine";
import * as P from "./protocol";
import {
  activeTrackId,
  synthParams,
  connections,
  mixerState,
  fxState,
  arpState,
  bpm,
  transportState,
  scaleState,
  Connection
} from "../ui/state";

export function createAudioSync(engine: AudioEngine) {
  const disposers: Array<() => void> = [];

  // Sync synth params
  for (const [idStr, sig] of Object.entries(synthParams)) {
    const id = Number(idStr) as P.SynthParamId;
    disposers.push(
      effect(() => {
        engine.setParam(id, sig.value, activeTrackId.peek());
      })
    );
  }

  // Sync modulation connections
  let lastConnections: Connection[] = [];
  disposers.push(
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
    })
  );

  // Sync mixer
  disposers.push(
    effect(() => {
      engine.setMix({
        master: mixerState.master.value,
        synth: mixerState.synth.value,
        drums: mixerState.drums.value,
        sendSynth: mixerState.sendSynth.value,
        sendDrums: mixerState.sendDrums.value,
      });
    })
  );

  // Sync FX
  disposers.push(
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
    })
  );

  // Sync Arp
  disposers.push(
    effect(() => {
      engine.setArp({
        enabled: arpState.enabled.value,
        octaves: arpState.octaves.value,
        pattern: arpState.pattern.value,
        steps: arpState.steps.value,
      }, activeTrackId.peek());
    })
  );

  // Sync BPM
  disposers.push(
    effect(() => {
      engine.setTempo(bpm.value);
    })
  );

  // Sync Recording
  disposers.push(
    effect(() => {
      engine.setRecording(transportState.recording.value);
    })
  );

  // Sync Scale
  disposers.push(
    effect(() => {
      engine.setScale(scaleState.root.value, scaleState.type.value);
    })
  );

  return () => {
    disposers.forEach(dispose => dispose());
  };
}