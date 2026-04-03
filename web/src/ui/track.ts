import { AudioEngine } from "../audio/engine";
import { el } from "./controls";

export class TrackUi {
  public wrap: HTMLElement;
  private engine: AudioEngine;
  
  public activeTrackId = 0;
  public onTrackChange: ((id: number) => void) | null = null;
  public onScaleChange: ((rootNote: number, scaleType: number) => void) | null = null;

  constructor(engine: AudioEngine) {
    this.engine = engine;
    this.wrap = el("div", "module track");
    
    const h2 = el("h2");
    h2.textContent = "Track Selection";
    
    const trackSelect = document.createElement("select");
    const opt0 = document.createElement("option");
    opt0.value = "0";
    opt0.textContent = "Track 1: Synth";
    const opt1 = document.createElement("option");
    opt1.value = "1";
    opt1.textContent = "Track 2: Drums";
    trackSelect.append(opt0, opt1);
    
    trackSelect.addEventListener("change", () => {
      this.activeTrackId = parseInt(trackSelect.value, 10);
      if (this.onTrackChange) this.onTrackChange(this.activeTrackId);
    });

    const scaleWrap = el("div", "scale-wrap");
    scaleWrap.style.marginTop = "8px";
    
    const scaleRoot = document.createElement("select");
    ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].forEach((n, i) => {
        const opt = document.createElement("option");
        opt.value = i.toString();
        opt.textContent = n;
        scaleRoot.append(opt);
    });

    const scaleType = document.createElement("select");
    ["Chromatic", "Major", "Minor", "Major Pentatonic", "Minor Pentatonic", "Dorian", "Mixolydian", "Lydian"].forEach((n, i) => {
        const opt = document.createElement("option");
        opt.value = i.toString();
        opt.textContent = n;
        scaleType.append(opt);
    });
    scaleType.value = "4"; // Minor Pentatonic default

    const applyScale = () => {
        const root = parseInt(scaleRoot.value, 10);
        const type = parseInt(scaleType.value, 10);
        this.engine.setScale(root, type);
        if (this.onScaleChange) this.onScaleChange(root, type);
    };

    scaleRoot.addEventListener("change", applyScale);
    scaleType.addEventListener("change", applyScale);

    scaleWrap.append(scaleRoot, scaleType);
    this.wrap.append(h2, trackSelect, scaleWrap);
  }
}
