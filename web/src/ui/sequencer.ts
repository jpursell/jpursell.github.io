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
    this.wrap.style.height = "100%";

    const h2 = el("h2");
    h2.textContent = "Grid Sequencer";

    this.canvas = document.createElement("canvas");
    this.canvas.width = 600;
    this.canvas.height = 300;
    this.canvas.style.cursor = "crosshair";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.minHeight = "200px";
    this.canvas.style.backgroundColor = "#0a0f14";
    this.canvas.style.touchAction = "none";
    this.canvas.style.borderRadius = "4px";
    this.canvas.style.marginTop = "10px";
    
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

    const ro = new ResizeObserver(() => {
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
            this.draw();
        }
    });
    ro.observe(this.canvas);

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

  private getRows() {
      return this.trackId === 0 ? this.numScaleNotes : 4;
  }

  private getLeftMargin() {
      return this.trackId === 0 ? 0 : 80;
  }

  private toggleStep(e: PointerEvent, setOnly = false) {
    const rect = this.canvas.getBoundingClientRect();
    const rows = this.getRows();
    const leftMargin = this.getLeftMargin();
    
    const x = e.clientX - rect.left - leftMargin;
    const y = e.clientY - rect.top;

    if (x < 0) return;

    const gridW = rect.width - leftMargin;
    const stepW = gridW / this.numSteps;
    const stepH = rect.height / rows;

    const stepIdx = Math.floor(x / stepW);
    const rowIdx = Math.floor(y / stepH);

    if (stepIdx >= 0 && stepIdx < this.numSteps && rowIdx >= 0 && rowIdx < rows) {
      const actualNoteIdx = rows - 1 - rowIdx; // 0 is bottom
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

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
      this.ctx.beginPath();
      this.ctx.moveTo(x + r, y);
      this.ctx.lineTo(x + w - r, y);
      this.ctx.arcTo(x + w, y, x + w, y + r, r);
      this.ctx.lineTo(x + w, y + h - r);
      this.ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      this.ctx.lineTo(x + r, y + h);
      this.ctx.arcTo(x, y + h, x, y + h - r, r);
      this.ctx.lineTo(x, y + r);
      this.ctx.arcTo(x, y, x + r, y, r);
      this.ctx.closePath();
  }

  private draw() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;

    this.ctx.clearRect(0, 0, w, h);
    this.ctx.fillStyle = "#0a0f14";
    this.ctx.fillRect(0, 0, w, h);

    const rows = this.getRows();
    const leftMargin = this.getLeftMargin();
    const gridW = w - leftMargin;

    const stepW = gridW / this.numSteps;
    const stepH = h / rows;

    const steps = this.trackSteps[this.trackId];
    if (!steps) return;

    const drumLabels = ["Kick", "Snare", "HiHat", "Open Hat"];
    const drumColors = ["#8b966a", "#a84242", "#517a94", "#4d82b8"]; // using variables roughly

    for (let r = 0; r < rows; r++) {
        const actualNoteIdx = rows - 1 - r;
        const y = r * stepH;

        if (this.trackId === 0) {
            if (actualNoteIdx === 0 || actualNoteIdx === 7) {
                this.ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
                this.ctx.fillRect(leftMargin, y, gridW, stepH);
            }
        } else {
            this.ctx.fillStyle = drumColors[actualNoteIdx] || "#fff";
            this.ctx.font = "bold 12px sans-serif";
            this.ctx.textAlign = "right";
            this.ctx.textBaseline = "middle";
            this.ctx.fillText(drumLabels[actualNoteIdx] || `Drum ${actualNoteIdx}`, leftMargin - 15, y + stepH / 2);
        }
    }

    this.ctx.strokeStyle = "#2a3644";
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    for (let i = 1; i < this.numSteps; i++) {
        const x = leftMargin + i * stepW;
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, h);
    }
    for (let j = 1; j < rows; j++) {
        this.ctx.moveTo(leftMargin, j * stepH);
        this.ctx.lineTo(w, j * stepH);
    }
    this.ctx.stroke();

    this.ctx.strokeStyle = "#3b4b5e";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    for (let i = 0; i < this.numSteps; i += 4) {
        if (i===0) continue;
        const x = leftMargin + i * stepW;
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, h);
    }
    this.ctx.stroke();

    const padX = stepW * 0.15;
    const padY = stepH * 0.15;

    for (let i = 0; i < this.numSteps; i++) {
      for (let actualNoteIdx = 0; actualNoteIdx < rows; actualNoteIdx++) {
        const r = rows - 1 - actualNoteIdx;
        const x = leftMargin + i * stepW;
        const y = r * stepH;

        if (steps[i][actualNoteIdx]) {
            if (this.trackId === 0) {
                this.ctx.fillStyle = "#f2c14e"; // synth color
            } else {
                this.ctx.fillStyle = drumColors[actualNoteIdx] || "#fff";
            }
            this.roundRect(x + padX, y + padY, stepW - padX*2, stepH - padY*2, 4);
            this.ctx.fill();
        } else {
            if (this.trackId === 1) {
               this.ctx.fillStyle = "rgba(255,255,255,0.03)";
               this.roundRect(x + padX, y + padY, stepW - padX*2, stepH - padY*2, 4);
               this.ctx.fill();
               this.ctx.strokeStyle = "rgba(255,255,255,0.1)";
               this.ctx.lineWidth = 1;
               this.ctx.stroke();
            }
        }
      }
    }
  }
}
