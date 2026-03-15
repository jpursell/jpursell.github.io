import { AudioEngine } from "../audio/engine";
import { el, makeKnob, setKnobText } from "./controls";

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
    this.wrap = el("div", "fx");

    const fxDriveRow = el("div", "row one");
    const fxDriveSl = makeKnob("Drive", 0, 1, 0.001, this.fxDrive);
    fxDriveRow.append(fxDriveSl.wrap);
    this.wrap.append(fxDriveRow);

    const delayBar = el("div", "btnbar");
    const delayBtn = el("button", "btn");
    delayBtn.textContent = this.delayEnabled ? "Delay: On" : "Delay: Off";
    delayBar.append(delayBtn);
    this.wrap.append(delayBar);

    const delayRow1 = el("div", "row");
    const delayTimeSl = makeKnob("Time (beats)", 0.25, 2.0, 0.01, this.delayBeats);
    const delayFbSl = makeKnob("Feedback", 0, 0.95, 0.001, this.delayFeedback);
    delayRow1.append(delayTimeSl.wrap, delayFbSl.wrap);
    this.wrap.append(delayRow1);

    const delayRow2 = el("div", "row one");
    const delayRetSl = makeKnob("Return", 0, 1, 0.001, this.delayReturn);
    delayRow2.append(delayRetSl.wrap);
    this.wrap.append(delayRow2);

    const revBar = el("div", "btnbar");
    const revBtn = el("button", "btn");
    revBtn.textContent = this.reverbEnabled ? "Reverb: On" : "Reverb: Off";
    revBar.append(revBtn);
    this.wrap.append(revBar);

    const revRow1 = el("div", "row");
    const revDecaySl = makeKnob("Decay", 0, 1, 0.001, this.reverbDecay);
    const revDampSl = makeKnob("Damp", 0, 1, 0.001, this.reverbDamp);
    revRow1.append(revDecaySl.wrap, revDampSl.wrap);
    this.wrap.append(revRow1);

    const revRow2 = el("div", "row one");
    const revRetSl = makeKnob("Return", 0, 1, 0.001, this.reverbReturn);
    revRow2.append(revRetSl.wrap);
    this.wrap.append(revRow2);

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
