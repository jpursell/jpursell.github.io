import { h } from "preact";
import { bpm, transportState } from "./state";
import { Module, Knob } from "./controls";

export function Transport() {
  const toggleRecording = () => {
    transportState.recording.value = !transportState.recording.value;
  };

  return (
    <Module title="Transport" className="transport">
      <Knob 
        label="Tempo (BPM)" 
        min={40} 
        max={240} 
        step={1} 
        value={bpm} 
      />

      <button 
        class="btn"
        style={{ 
          marginTop: "8px", 
          width: "100%",
          backgroundColor: transportState.recording.value ? "rgba(255, 60, 60, 0.4)" : "var(--bg)"
        }}
        onClick={toggleRecording}
      >
        {transportState.recording.value ? "Record [ON]" : "Record [OFF]"}
      </button>
    </Module>
  );
}
