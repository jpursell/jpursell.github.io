import { AudioEngine } from "../audio/engine";
import { type ArpPattern } from "../audio/protocol";
import { el, makeSelect, makeKnob } from "./controls";

function renderBinaryStep(v: number, btn: HTMLButtonElement) {
  const on = (v | 0) === 1;
  btn.classList.toggle("on", on);
  btn.classList.toggle("off", !on);
  btn.textContent = on ? "●" : "·";
}

export class ArpUi {
  public wrap: HTMLElement;

  private arpEnabled = false;
  private arpOctaves = 1;
  private arpPattern: ArpPattern = "up";
  private arpSteps: number[] = new Array(16).fill(1);

  private arpOct: ReturnType<typeof makeKnob>;

  constructor(private engine: AudioEngine) {
    this.wrap = el("div", "arp");
    
    const arpBar = el("div", "btnbar");
    const arpBtn = el("button", "btn");
    arpBtn.textContent = "Arp: Off";
    arpBar.append(arpBtn);
    this.wrap.append(arpBar);

    const arpRow1 = el("div", "row");
    this.arpOct = makeKnob("Arp Oct", 1, 4, 1, 1);
    const arpPat = makeSelect(
      "Pattern",
      [
        { value: "up", label: "Up" },
        { value: "down", label: "Down" },
        { value: "updown", label: "UpDown" },
        { value: "random", label: "Random" },
        { value: "asPlayed", label: "As Played" }
      ],
      "up"
    );
    arpRow1.append(this.arpOct.wrap, arpPat.wrap);
    this.wrap.append(arpRow1);

    const arpLegend = el("div", "arpLegend");
    arpLegend.textContent = "Steps: Off / On";
    this.wrap.append(arpLegend);

    const arpGrid = el("div", "stepGrid");
    for (let i = 0; i < 16; i++) {
      const b = el("button", "stepBtn") as HTMLButtonElement;
      b.type = "button";
      renderBinaryStep(this.arpSteps[i], b);
      b.addEventListener("click", () => {
        this.arpSteps[i] = this.arpSteps[i] === 1 ? 0 : 1;
        renderBinaryStep(this.arpSteps[i], b);
        this.pushArp();
      });
      arpGrid.append(b);
    }
    this.wrap.append(arpGrid);

    arpBtn.addEventListener("click", () => {
      this.arpEnabled = !this.arpEnabled;
      arpBtn.textContent = this.arpEnabled ? "Arp: On" : "Arp: Off";
      this.pushArp();
    });

    this.arpOct.input.addEventListener("input", () => {
      const v = Number(this.arpOct.input.value);
      this.arpOct.right.textContent = String(v | 0);
      this.arpOctaves = v | 0;
      this.pushArp();
    });

    arpPat.select.addEventListener("change", () => {
      this.arpPattern = arpPat.select.value as ArpPattern;
      arpPat.right.textContent = arpPat.select.value;
      this.pushArp();
    });

    this.arpOct.right.textContent = String(Number(this.arpOct.input.value) | 0);
  }

  public pushArp() {
    this.engine.setArp({ 
      enabled: this.arpEnabled, 
      octaves: this.arpOctaves, 
      pattern: this.arpPattern, 
      steps: this.arpSteps.slice() 
    });
  }
}
