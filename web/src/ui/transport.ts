import { AudioEngine } from "../audio/engine";
import { el, makeKnob, setKnobText } from "./controls";

export class TransportUi {
  public wrap: HTMLElement;
  public tempoBpm = 120;
  
  constructor(private engine: AudioEngine) {
    this.wrap = el("div", "transport");
    const transportRow = el("div", "row one");
    const tempo = makeKnob("Tempo (BPM)", 40, 240, 1, this.tempoBpm);
    transportRow.append(tempo.wrap);
    this.wrap.append(transportRow);

    tempo.input.addEventListener("input", () => {
      const v = Number(tempo.input.value);
      setKnobText(tempo.right, v);
      this.tempoBpm = v;
      this.pushTempo();
    });

    setKnobText(tempo.right, Number(tempo.input.value));
  }

  public pushTempo() {
    this.engine.setTempo(this.tempoBpm);
  }
}
