import { h } from "preact";
import { fxState } from "./state";
import { Module, Knob } from "./controls";

export function Fx() {
  return (
    <Module title="Effects" className="fx">
      <Knob label="Drive" min={0} max={1} step={0.001} value={fxState.drive} />
      
      <div class="btnbar" style={{ gridColumn: "1 / -1" }}>
        <button 
          class="btn" 
          onClick={() => fxState.delay.enabled.value = !fxState.delay.enabled.value}
        >
          {fxState.delay.enabled.value ? "Delay: On" : "Delay: Off"}
        </button>
      </div>
      <Knob label="Time (beats)" min={0.25} max={2.0} step={0.01} value={fxState.delay.beats} />
      <Knob label="Feedback" min={0} max={0.95} step={0.001} value={fxState.delay.feedback} />
      <Knob label="Dly Ret" min={0} max={1} step={0.001} value={fxState.delay.return} />

      <div class="btnbar" style={{ gridColumn: "1 / -1" }}>
        <button 
          class="btn" 
          onClick={() => fxState.reverb.enabled.value = !fxState.reverb.enabled.value}
        >
          {fxState.reverb.enabled.value ? "Reverb: On" : "Reverb: Off"}
        </button>
      </div>
      <Knob label="Decay" min={0} max={1} step={0.001} value={fxState.reverb.decay} />
      <Knob label="Damp" min={0} max={1} step={0.001} value={fxState.reverb.damp} />
      <Knob label="Rev Ret" min={0} max={1} step={0.001} value={fxState.reverb.return} />
    </Module>
  );
}
