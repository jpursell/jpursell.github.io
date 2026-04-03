import { AudioEngine } from "../audio/engine";
import { el } from "./controls";

export class SequencerUi {
  public wrap: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private engine: AudioEngine;
  private trackId: number = 0;
  
  // Track specific steps
  private trackSteps: Record<number, boolean[][]> = {};
  
  private numSteps = 16;
  private numScaleNotes = 14;

  constructor(engine: AudioEngine) {
    this.engine = engine;
    this.wrap = el("div", "module sequencer");
    this.wrap.style.flexDirection = "column";

    const h2 = el("h2");
    h2.textContent = "Grid Sequencer";

    this.canvas = document.createElement("canvas");
    this.canvas.width = 600;
    this.canvas.height = 300;
    this.canvas.style.cursor = "crosshair";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "auto";
    this.canvas.style.aspectRatio = "2 / 1";
    this.canvas.style.backgroundColor = "var(--bg-d)";
    this.canvas.style.border = "1px solid var(--border)";
    this.canvas.style.touchAction = "none";
    
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("No 2d context");
    this.ctx = ctx;

    this.initSteps(0);
    this.initSteps(1);

    let isDown = false;
    this.canvas.addEventListener("pointerdown", (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      isDown = true;
      this.toggleStep(e, false);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (isDown) this.toggleStep(e, true);
    });
    const up = () => { isDown = false; };
    this.canvas.addEventListener("pointerup", up);
    this.canvas.addEventListener("pointercancel", up);
    this.canvas.addEventListener("pointerleave", up);

    this.wrap.append(h2, this.canvas);
    this.draw();
  }

  private initSteps(trackId: number) {
    if (!this.trackSteps[trackId]) {
      this.trackSteps[trackId] = [];
      for (let i = 0; i < this.numSteps; i++) {
        this.trackSteps[trackId].push(new Array(this.numScaleNotes).fill(false));
      }
    }
  }

  public setTrackId(id: number) {
    this.trackId = id;
    this.initSteps(id);
    this.draw();
  }

  private toggleStep(e: PointerEvent, setOnly = false) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const stepW = rect.width / this.numSteps;
    const stepH = rect.height / this.numScaleNotes;

    const stepIdx = Math.floor(x / stepW);
    const noteIdx = Math.floor(y / stepH);

    if (stepIdx >= 0 && stepIdx < this.numSteps && noteIdx >= 0 && noteIdx < this.numScaleNotes) {
      const actualNoteIdx = this.numScaleNotes - 1 - noteIdx; // 0 is bottom
      const steps = this.trackSteps[this.trackId];
      if (setOnly) {
         if (!steps[stepIdx][actualNoteIdx]) {
           steps[stepIdx][actualNoteIdx] = true;
           this.engine.setGridStep(this.trackId, stepIdx, true, actualNoteIdx, 1.0);
         }
      } else {
         steps[stepIdx][actualNoteIdx] = !steps[stepIdx][actualNoteIdx];
         this.engine.setGridStep(this.trackId, stepIdx, steps[stepIdx][actualNoteIdx], actualNoteIdx, 1.0);
      }
      this.draw();
    }
  }

  private draw() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);

    const stepW = w / this.numSteps;
    const stepH = h / this.numScaleNotes;

    this.ctx.strokeStyle = "#2a3644";
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    for (let i = 1; i < this.numSteps; i++) {
      this.ctx.moveTo(i * stepW, 0);
      this.ctx.lineTo(i * stepW, h);
    }
    for (let j = 1; j < this.numScaleNotes; j++) {
      this.ctx.moveTo(0, j * stepH);
      this.ctx.lineTo(w, j * stepH);
    }
    this.ctx.stroke();

    // highlight beats
    this.ctx.strokeStyle = "#3b4b5e";
    this.ctx.beginPath();
    for (let i = 0; i < this.numSteps; i += 4) {
        if (i===0) continue;
        this.ctx.moveTo(i * stepW, 0);
        this.ctx.lineTo(i * stepW, h);
    }
    this.ctx.stroke();

    const steps = this.trackSteps[this.trackId];
    if (!steps) return;

    this.ctx.fillStyle = this.trackId === 0 ? "#55aaff" : "#ff55aa";
    for (let i = 0; i < this.numSteps; i++) {
      for (let j = 0; j < this.numScaleNotes; j++) {
        if (steps[i][j]) {
          const y = h - (j + 1) * stepH;
          this.ctx.fillRect(i * stepW + 1, y + 1, stepW - 2, stepH - 2);
        }
      }
    }
  }
}
