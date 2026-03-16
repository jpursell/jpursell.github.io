import { AudioEngine } from "../audio/engine";
import { type ArpPattern } from "../audio/protocol";
import { el, makeSelect, makeKnob, makeModule } from "./controls";

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
    const { mod, body } = makeModule("Arpeggiator", "arp");
    this.wrap = mod;
    
    const arpBar = el("div", "btnbar");
    arpBar.style.gridColumn = "1 / -1";
    const arpBtn = el("button", "btn");
    arpBtn.textContent = "Arp: Off";
    arpBar.append(arpBtn);
    
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

    const arpLegend = el("div", "arpLegend");
    arpLegend.textContent = "Steps: Off / On";
    arpLegend.style.gridColumn = "1 / -1";
    arpLegend.style.textAlign = "center";
    arpLegend.style.fontSize = "11px";
    arpLegend.style.marginTop = "8px";

    const arpGrid = el("div", "stepGrid");
    arpGrid.style.gridColumn = "1 / -1";
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
    
    body.append(arpBar, this.arpOct.wrap, arpPat.wrap, arpLegend, arpGrid);

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
