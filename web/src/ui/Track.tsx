import { h } from "preact";
import { activeTrackId, scaleState } from "./state";
import { Module } from "./controls";

export function Track() {
  const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const scaleTypes = ["Chromatic", "Major", "Minor", "Major Pentatonic", "Minor Pentatonic", "Dorian", "Mixolydian", "Lydian"];

  return (
    <Module title="Track Selection" className="track">
      <select 
        value={activeTrackId.value} 
        onChange={(e) => activeTrackId.value = parseInt((e.target as HTMLSelectElement).value, 10)}
        class="select"
        style={{ width: "100%" }}
      >
        <option value="0">Track 1: Synth</option>
        <option value="1">Track 2: Drums</option>
      </select>

      <div class="scale-wrap" style={{ marginTop: "8px", display: "flex", gap: "4px" }}>
        <select 
          value={scaleState.root.value} 
          onChange={(e) => scaleState.root.value = parseInt((e.target as HTMLSelectElement).value, 10)}
          class="select"
          style={{ flex: 1 }}
        >
          {notes.map((n, i) => (
            <option key={i} value={i}>{n}</option>
          ))}
        </select>

        <select 
          value={scaleState.type.value} 
          onChange={(e) => scaleState.type.value = parseInt((e.target as HTMLSelectElement).value, 10)}
          class="select"
          style={{ flex: 2 }}
        >
          {scaleTypes.map((n, i) => (
            <option key={i} value={i}>{n}</option>
          ))}
        </select>
      </div>
    </Module>
  );
}
