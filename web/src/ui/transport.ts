import { AudioEngine } from "../audio/engine";
import { el, makeKnob, setKnobText, makeModule } from "./controls";

export class TransportUi {
  public wrap: HTMLElement;
  public tempoBpm = 120;
  public isRecording = false;
  
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

    const recBtn = el("button", "btn");
    recBtn.style.marginTop = "8px";
    recBtn.style.width = "100%";
    recBtn.textContent = "Record [OFF]";
    recBtn.style.backgroundColor = "var(--bg)";
    
    recBtn.addEventListener("click", () => {
        this.isRecording = !this.isRecording;
        recBtn.textContent = this.isRecording ? "Record [ON]" : "Record [OFF]";
        recBtn.style.backgroundColor = this.isRecording ? "rgba(255, 60, 60, 0.4)" : "var(--bg)";
        this.engine.setRecording(this.isRecording);
    });

    body.append(recBtn);
  }

  public pushTempo() {
    this.engine.setTempo(this.tempoBpm);
  }
}
