import { AudioEngine } from "../audio/engine";
import { el, makeSlider, setSliderText } from "./controls";

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
    const mixMasterSl = makeSlider("Master", 0, 1, 0.001, this.mixMaster);
    const mixSynthSl = makeSlider("Synth", 0, 1, 0.001, this.mixSynth);
    mixRow1.append(mixMasterSl.wrap, mixSynthSl.wrap);

    const mixRow2 = el("div", "row");
    const mixDrumsSl = makeSlider("Drums", 0, 1, 0.001, this.mixDrums);
    const sendSynthSl = makeSlider("FX Send (Synth)", 0, 1, 0.001, this.sendSynth);
    mixRow2.append(mixDrumsSl.wrap, sendSynthSl.wrap);

    const mixRow3 = el("div", "row one");
    const sendDrumsSl = makeSlider("FX Send (Drums)", 0, 1, 0.001, this.sendDrums);
    mixRow3.append(sendDrumsSl.wrap);

    this.wrap.append(mixRow1, mixRow2, mixRow3);

    mixMasterSl.input.addEventListener("input", () => {
      const v = Number(mixMasterSl.input.value);
      setSliderText(mixMasterSl.right, v);
      this.mixMaster = v;
      this.pushMix();
    });

    mixSynthSl.input.addEventListener("input", () => {
      const v = Number(mixSynthSl.input.value);
      setSliderText(mixSynthSl.right, v);
      this.mixSynth = v;
      this.pushMix();
    });

    mixDrumsSl.input.addEventListener("input", () => {
      const v = Number(mixDrumsSl.input.value);
      setSliderText(mixDrumsSl.right, v);
      this.mixDrums = v;
      this.pushMix();
    });

    sendSynthSl.input.addEventListener("input", () => {
      const v = Number(sendSynthSl.input.value);
      setSliderText(sendSynthSl.right, v);
      this.sendSynth = v;
      this.pushMix();
    });

    sendDrumsSl.input.addEventListener("input", () => {
      const v = Number(sendDrumsSl.input.value);
      setSliderText(sendDrumsSl.right, v);
      this.sendDrums = v;
      this.pushMix();
    });

    setSliderText(mixMasterSl.right, Number(mixMasterSl.input.value));
    setSliderText(mixSynthSl.right, Number(mixSynthSl.input.value));
    setSliderText(mixDrumsSl.right, Number(mixDrumsSl.input.value));
    setSliderText(sendSynthSl.right, Number(sendSynthSl.input.value));
    setSliderText(sendDrumsSl.right, Number(sendDrumsSl.input.value));
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
