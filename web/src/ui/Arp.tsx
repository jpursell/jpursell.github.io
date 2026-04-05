import { h } from "preact";
import { arpState } from "./state";
import { Module, Knob, Select } from "./controls";

export function Arp() {
  const toggleStep = (i: number) => {
    const next = [...arpState.steps.value];
    next[i] = next[i] === 1 ? 0 : 1;
    arpState.steps.value = next;
  };

  return (
    <Module title="Arpeggiator" className="arp">
      <div class="btnbar" style={{ gridColumn: "1 / -1" }}>
        <button 
          class="btn" 
          onClick={() => arpState.enabled.value = !arpState.enabled.value}
        >
          {arpState.enabled.value ? "Arp: On" : "Arp: Off"}
        </button>
      </div>
      
      <Knob label="Arp Oct" min={1} max={4} step={1} value={arpState.octaves} />
      <Select 
        label="Pattern"
        options={[
          { value: "up", label: "Up" },
          { value: "down", label: "Down" },
          { value: "updown", label: "UpDown" },
          { value: "random", label: "Random" },
          { value: "asPlayed", label: "As Played" }
        ]}
        value={arpState.pattern}
      />

      <div class="arpLegend" style={{ gridColumn: "1 / -1", textAlign: "center", fontSize: "11px", marginTop: "8px" }}>
        Steps: Off / On
      </div>
      
      <div class="stepGrid" style={{ gridColumn: "1 / -1" }}>
        {arpState.steps.value.map((v, i) => (
          <button 
            key={i}
            type="button"
            class={`stepBtn ${v === 1 ? "on" : "off"}`}
            onClick={() => toggleStep(i)}
          >
            {v === 1 ? "●" : "·"}
          </button>
        ))}
      </div>
    </Module>
  );
}
