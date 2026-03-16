import { AudioEngine } from "../audio/engine";
import { el, makeKnob, setKnobText, makeModule } from "./controls";

export class FxUi {
  public wrap: HTMLElement;

  private fxDrive = 0.2;
  private delayEnabled = true;
  private delayBeats = 0.5;
  private delayFeedback = 0.35;
  private delayReturn = 0.25;
  private reverbEnabled = true;
  private reverbDecay = 0.45;
  private reverbDamp = 0.4;
  private reverbReturn = 0.18;

  constructor(private engine: AudioEngine) {
    const { mod, body } = makeModule("Effects", "fx");
    this.wrap = mod;

    const fxDriveSl = makeKnob("Drive", 0, 1, 0.001, this.fxDrive);

    const delayBar = el("div", "btnbar");
    delayBar.style.gridColumn = "1 / -1";
    const delayBtn = el("button", "btn");
    delayBtn.textContent = this.delayEnabled ? "Delay: On" : "Delay: Off";
    delayBar.append(delayBtn);

    const delayTimeSl = makeKnob("Time (beats)", 0.25, 2.0, 0.01, this.delayBeats);
    const delayFbSl = makeKnob("Feedback", 0, 0.95, 0.001, this.delayFeedback);
    const delayRetSl = makeKnob("Dly Ret", 0, 1, 0.001, this.delayReturn);

    const revBar = el("div", "btnbar");
    revBar.style.gridColumn = "1 / -1";
    const revBtn = el("button", "btn");
    revBtn.textContent = this.reverbEnabled ? "Reverb: On" : "Reverb: Off";
    revBar.append(revBtn);

    const revDecaySl = makeKnob("Decay", 0, 1, 0.001, this.reverbDecay);
    const revDampSl = makeKnob("Damp", 0, 1, 0.001, this.reverbDamp);
    const revRetSl = makeKnob("Rev Ret", 0, 1, 0.001, this.reverbReturn);

    body.append(
      fxDriveSl.wrap,
      delayBar,
      delayTimeSl.wrap, delayFbSl.wrap, delayRetSl.wrap,
      revBar,
      revDecaySl.wrap, revDampSl.wrap, revRetSl.wrap
    );

    fxDriveSl.input.addEventListener("input", () => {
      const v = Number(fxDriveSl.input.value);
      setKnobText(fxDriveSl.right, v);
      this.fxDrive = v;
      this.pushFx();
    });

    delayBtn.addEventListener("click", () => {
      this.delayEnabled = !this.delayEnabled;
      delayBtn.textContent = this.delayEnabled ? "Delay: On" : "Delay: Off";
      this.pushFx();
    });

    delayTimeSl.input.addEventListener("input", () => {
      const v = Number(delayTimeSl.input.value);
      setKnobText(delayTimeSl.right, v);
      this.delayBeats = v;
      this.pushFx();
    });

    delayFbSl.input.addEventListener("input", () => {
      const v = Number(delayFbSl.input.value);
      setKnobText(delayFbSl.right, v);
      this.delayFeedback = v;
      this.pushFx();
    });

    delayRetSl.input.addEventListener("input", () => {
      const v = Number(delayRetSl.input.value);
      setKnobText(delayRetSl.right, v);
      this.delayReturn = v;
      this.pushFx();
    });

    revBtn.addEventListener("click", () => {
      this.reverbEnabled = !this.reverbEnabled;
      revBtn.textContent = this.reverbEnabled ? "Reverb: On" : "Reverb: Off";
      this.pushFx();
    });

    revDecaySl.input.addEventListener("input", () => {
      const v = Number(revDecaySl.input.value);
      setKnobText(revDecaySl.right, v);
      this.reverbDecay = v;
      this.pushFx();
    });

    revDampSl.input.addEventListener("input", () => {
      const v = Number(revDampSl.input.value);
      setKnobText(revDampSl.right, v);
      this.reverbDamp = v;
      this.pushFx();
    });

    revRetSl.input.addEventListener("input", () => {
      const v = Number(revRetSl.input.value);
      setKnobText(revRetSl.right, v);
      this.reverbReturn = v;
      this.pushFx();
    });

    setKnobText(fxDriveSl.right, Number(fxDriveSl.input.value));
    setKnobText(delayTimeSl.right, Number(delayTimeSl.input.value));
    setKnobText(delayFbSl.right, Number(delayFbSl.input.value));
    setKnobText(delayRetSl.right, Number(delayRetSl.input.value));
    setKnobText(revDecaySl.right, Number(revDecaySl.input.value));
    setKnobText(revDampSl.right, Number(revDampSl.input.value));
    setKnobText(revRetSl.right, Number(revRetSl.input.value));
  }

  public pushFx() {
    this.engine.setFx({
      drive: this.fxDrive,
      delay: { enabled: this.delayEnabled, beats: this.delayBeats, feedback: this.delayFeedback, return: this.delayReturn },
      reverb: { enabled: this.reverbEnabled, decay: this.reverbDecay, damp: this.reverbDamp, return: this.reverbReturn }
    });
  }
}
