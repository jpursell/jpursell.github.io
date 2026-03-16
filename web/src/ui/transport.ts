import { AudioEngine } from "../audio/engine";
import { el, makeKnob, setKnobText, makeModule } from "./controls";

export class TransportUi {
  public wrap: HTMLElement;
  public tempoBpm = 120;
  
  constructor(private engine: AudioEngine) {
    const { mod, body } = makeModule("Transport", "transport");
    this.wrap = mod;
    const tempo = makeKnob("Tempo (BPM)", 40, 240, 1, this.tempoBpm);
    body.append(tempo.wrap);

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
