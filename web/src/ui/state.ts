import { AudioEngine } from "../audio/engine";
import { SynthParamId } from "../audio/protocol";
import { Knob, setKnobText } from "./controls";

export class ParamStore {
  private boundKnobs: { knob: Knob; paramId: SynthParamId }[] = [];

  constructor(private engine: AudioEngine) {}

  public bindKnob(knob: Knob, paramId: SynthParamId) {
    knob.input.addEventListener("input", () => {
      const v = Number(knob.input.value);
      if (knob.right) {
        setKnobText(knob.right, v);
      }
      this.engine.setParam(paramId, v);
    });
    this.boundKnobs.push({ knob, paramId });
  }

  public pushAll() {
    for (const { knob, paramId } of this.boundKnobs) {
      this.engine.setParam(paramId, Number(knob.input.value));
    }
  }

  public initAll() {
    for (const { knob } of this.boundKnobs) {
      if (knob.right) {
        setKnobText(knob.right, Number(knob.input.value));
      }
    }
  }
}
