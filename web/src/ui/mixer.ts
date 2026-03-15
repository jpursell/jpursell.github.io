import { AudioEngine } from "../audio/engine";
import { el, makeKnob, setKnobText } from "./controls";

export class MixerUi {
  public wrap: HTMLElement;

  private mixMaster = 0.9;
  private mixSynth = 1.0;
  private mixDrums = 1.0;
  private sendSynth = 0.25;
  private sendDrums = 0.1;

  constructor(private engine: AudioEngine) {
    this.wrap = el("div", "mixer");
    
    const mixRow1 = el("div", "row");
    const mixMasterSl = makeKnob("Master", 0, 1, 0.001, this.mixMaster);
    const mixSynthSl = makeKnob("Synth", 0, 1, 0.001, this.mixSynth);
    mixRow1.append(mixMasterSl.wrap, mixSynthSl.wrap);

    const mixRow2 = el("div", "row");
    const mixDrumsSl = makeKnob("Drums", 0, 1, 0.001, this.mixDrums);
    const sendSynthSl = makeKnob("FX Send (Synth)", 0, 1, 0.001, this.sendSynth);
    mixRow2.append(mixDrumsSl.wrap, sendSynthSl.wrap);

    const mixRow3 = el("div", "row one");
    const sendDrumsSl = makeKnob("FX Send (Drums)", 0, 1, 0.001, this.sendDrums);
    mixRow3.append(sendDrumsSl.wrap);

    this.wrap.append(mixRow1, mixRow2, mixRow3);

    mixMasterSl.input.addEventListener("input", () => {
      const v = Number(mixMasterSl.input.value);
      setKnobText(mixMasterSl.right, v);
      this.mixMaster = v;
      this.pushMix();
    });

    mixSynthSl.input.addEventListener("input", () => {
      const v = Number(mixSynthSl.input.value);
      setKnobText(mixSynthSl.right, v);
      this.mixSynth = v;
      this.pushMix();
    });

    mixDrumsSl.input.addEventListener("input", () => {
      const v = Number(mixDrumsSl.input.value);
      setKnobText(mixDrumsSl.right, v);
      this.mixDrums = v;
      this.pushMix();
    });

    sendSynthSl.input.addEventListener("input", () => {
      const v = Number(sendSynthSl.input.value);
      setKnobText(sendSynthSl.right, v);
      this.sendSynth = v;
      this.pushMix();
    });

    sendDrumsSl.input.addEventListener("input", () => {
      const v = Number(sendDrumsSl.input.value);
      setKnobText(sendDrumsSl.right, v);
      this.sendDrums = v;
      this.pushMix();
    });

    setKnobText(mixMasterSl.right, Number(mixMasterSl.input.value));
    setKnobText(mixSynthSl.right, Number(mixSynthSl.input.value));
    setKnobText(mixDrumsSl.right, Number(mixDrumsSl.input.value));
    setKnobText(sendSynthSl.right, Number(sendSynthSl.input.value));
    setKnobText(sendDrumsSl.right, Number(sendDrumsSl.input.value));
  }

  public pushMix() {
    this.engine.setMix({ 
      master: this.mixMaster, 
      synth: this.mixSynth, 
      drums: this.mixDrums, 
      sendSynth: this.sendSynth, 
      sendDrums: this.sendDrums 
    });
  }
}
