import { h } from "preact";
import { mixerState } from "./state";
import { Module, Knob } from "./controls";

export function Mixer() {
  return (
    <Module title="Mixer" className="mixer">
      <Knob label="Master" min={0} max={1} step={0.001} value={mixerState.master} />
      <Knob label="Synth" min={0} max={1} step={0.001} value={mixerState.synth} />
      <Knob label="Drums" min={0} max={1} step={0.001} value={mixerState.drums} />
      <Knob label="FX Send (Synth)" min={0} max={1} step={0.001} value={mixerState.sendSynth} />
      <Knob label="FX Send (Drums)" min={0} max={1} step={0.001} value={mixerState.sendDrums} />
    </Module>
  );
}
