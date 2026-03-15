import { AudioEngine } from "../audio/engine";
import { type DrumId } from "../audio/protocol";
import { el, makeKnob, setKnobText } from "./controls";

function renderBinaryStep(v: number, btn: HTMLButtonElement) {
  const on = (v | 0) === 1;
  btn.classList.toggle("on", on);
  btn.classList.toggle("off", !on);
  btn.textContent = on ? "●" : "·";
}

export class DrumsUi {
  public wrap: HTMLElement;

  private drumsEnabled = false;
  private drumEdit: DrumId = "kick";
  private drumPatterns: Record<DrumId, number[]> = {
    kick: new Array(16).fill(0),
    snare: new Array(16).fill(0),
    ch: new Array(16).fill(0),
    oh: new Array(16).fill(0)
  };
  private drumParams: Record<DrumId, { level: number; tune: number; decay: number }> = {
    kick: { level: 0.9, tune: 0, decay: 0.5 },
    snare: { level: 0.75, tune: 0, decay: 0.5 },
    ch: { level: 0.5, tune: 0, decay: 0.35 },
    oh: { level: 0.5, tune: 0, decay: 0.6 }
  };

  private chanBtns: Record<DrumId, HTMLButtonElement> = {} as any;
  private drumLevel: ReturnType<typeof makeKnob>;
  private drumTune: ReturnType<typeof makeKnob>;
  private drumDecay: ReturnType<typeof makeKnob>;
  private drumStepBtns: HTMLButtonElement[] = [];

  constructor(private engine: AudioEngine) {
    this.wrap = el("div", "drums");
    
    const drumsBar = el("div", "btnbar");
    const drumsBtn = el("button", "btn");
    drumsBtn.textContent = "Drums: Off";
    drumsBar.append(drumsBtn);
    this.wrap.append(drumsBar);

    const chanBar = el("div", "chanBar");
    const makeChanBtn = (id: DrumId, label: string) => {
      const b = el("button", "btn chanBtn") as HTMLButtonElement;
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => {
        this.drumEdit = id;
        this.syncDrumUi();
      });
      chanBar.append(b);
      this.chanBtns[id] = b;
      return b;
    };
    makeChanBtn("kick", "Kick");
    makeChanBtn("snare", "Snare");
    makeChanBtn("ch", "CH");
    makeChanBtn("oh", "OH");
    this.wrap.append(chanBar);

    const drumGrid = el("div", "stepGrid");
    for (let i = 0; i < 16; i++) {
      const b = el("button", "stepBtn") as HTMLButtonElement;
      b.type = "button";
      b.addEventListener("click", () => {
        const steps = this.drumPatterns[this.drumEdit];
        steps[i] = steps[i] === 1 ? 0 : 1;
        renderBinaryStep(steps[i], b);
        this.pushDrums();
      });
      this.drumStepBtns.push(b);
      drumGrid.append(b);
    }
    this.wrap.append(drumGrid);

    const drumRow1 = el("div", "row");
    this.drumLevel = makeKnob("Level", 0, 1, 0.001, this.drumParams.kick.level);
    this.drumTune = makeKnob("Tune (st)", -12, 12, 1, this.drumParams.kick.tune);
    this.drumTune.right.textContent = String(this.drumParams.kick.tune);
    drumRow1.append(this.drumLevel.wrap, this.drumTune.wrap);
    this.wrap.append(drumRow1);

    const drumRow2 = el("div", "row one");
    this.drumDecay = makeKnob("Decay", 0, 1, 0.001, this.drumParams.kick.decay);
    drumRow2.append(this.drumDecay.wrap);
    this.wrap.append(drumRow2);

    drumsBtn.addEventListener("click", () => {
      this.drumsEnabled = !this.drumsEnabled;
      drumsBtn.textContent = this.drumsEnabled ? "Drums: On" : "Drums: Off";
      this.pushDrums();
    });

    this.drumLevel.input.addEventListener("input", () => {
      const v = Number(this.drumLevel.input.value);
      setKnobText(this.drumLevel.right, v);
      this.drumParams[this.drumEdit].level = v;
      this.pushDrums();
    });

    this.drumTune.input.addEventListener("input", () => {
      const v = Number(this.drumTune.input.value) | 0;
      this.drumTune.right.textContent = String(v);
      this.drumParams[this.drumEdit].tune = v;
      this.pushDrums();
    });

    this.drumDecay.input.addEventListener("input", () => {
      const v = Number(this.drumDecay.input.value);
      setKnobText(this.drumDecay.right, v);
      this.drumParams[this.drumEdit].decay = v;
      this.pushDrums();
    });

    this.syncDrumUi();
  }

  private syncDrumUi() {
    this.chanBtns.kick.classList.toggle("active", this.drumEdit === "kick");
    this.chanBtns.snare.classList.toggle("active", this.drumEdit === "snare");
    this.chanBtns.ch.classList.toggle("active", this.drumEdit === "ch");
    this.chanBtns.oh.classList.toggle("active", this.drumEdit === "oh");

    const p = this.drumParams[this.drumEdit];
    this.drumLevel.input.value = String(p.level);
    setKnobText(this.drumLevel.right, p.level);

    this.drumTune.input.value = String(p.tune);
    this.drumTune.right.textContent = String(p.tune | 0);

    this.drumDecay.input.value = String(p.decay);
    setKnobText(this.drumDecay.right, p.decay);

    const steps = this.drumPatterns[this.drumEdit];
    for (let i = 0; i < 16; i++) renderBinaryStep(steps[i], this.drumStepBtns[i]);
  }

  public pushDrums() {
    this.engine.setDrums({
      enabled: this.drumsEnabled,
      patterns: {
        kick: this.drumPatterns.kick.slice(),
        snare: this.drumPatterns.snare.slice(),
        ch: this.drumPatterns.ch.slice(),
        oh: this.drumPatterns.oh.slice()
      },
      params: {
        kick: { ...this.drumParams.kick },
        snare: { ...this.drumParams.snare },
        ch: { ...this.drumParams.ch },
        oh: { ...this.drumParams.oh }
      }
    });
  }
}
