import { AudioEngine } from "../audio/engine";
import { el } from "./controls";

export class XyPadUi {
  public wrap: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private engine: AudioEngine;
  private trackId: number = 0;
  
  private activePointers = new Map<number, {x: number, y: number, note: number}>();
  private numScaleNotes = 14;

  constructor(engine: AudioEngine) {
    this.engine = engine;
    this.wrap = el("div", "module xy-pad");
    this.wrap.style.flexDirection = "column";

    const h2 = el("h2");
    h2.textContent = "XY Pad";

    this.canvas = document.createElement("canvas");
    this.canvas.width = 300;
    this.canvas.height = 300;
    this.canvas.style.cursor = "crosshair";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "auto";
    this.canvas.style.aspectRatio = "1 / 1";
    this.canvas.style.backgroundColor = "#000";
    this.canvas.style.border = "1px solid var(--border)";
    this.canvas.style.touchAction = "none";
    this.canvas.style.borderRadius = "4px";
    
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("No 2d context");
    this.ctx = ctx;

    this.canvas.addEventListener("pointerdown", this.onDown.bind(this));
    this.canvas.addEventListener("pointermove", this.onMove.bind(this));
    this.canvas.addEventListener("pointerup", this.onUp.bind(this));
    this.canvas.addEventListener("pointercancel", this.onUp.bind(this));
    this.canvas.addEventListener("pointerleave", this.onUp.bind(this));

    this.wrap.append(h2, this.canvas);
    this.draw();
  }

  public setTrackId(id: number) {
    this.trackId = id;
    this.activePointers.clear();
    this.draw();
  }

  private updatePointer(e: PointerEvent): {nx: number, ny: number} {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const nx = rect.width > 0 ? Math.max(0, Math.min(1, x / rect.width)) : 0;
    const ny = rect.height > 0 ? Math.max(0, Math.min(1, 1 - (y / rect.height))) : 0;
    
    return {nx, ny};
  }

  private onDown(e: PointerEvent) {
    this.canvas.setPointerCapture(e.pointerId);
    const {nx, ny} = this.updatePointer(e);
    
    const scaleIndex = Math.floor(nx * this.numScaleNotes);
    this.engine.setParam(1, ny, this.trackId); // ParamId 1 is Cutoff (synth only)
    this.engine.noteOnScale(scaleIndex, 1.0, this.trackId);
    
    this.activePointers.set(e.pointerId, { x: nx, y: ny, note: scaleIndex });
    this.draw();
  }

  private onMove(e: PointerEvent) {
    if (!this.activePointers.has(e.pointerId)) return;
    
    const p = this.activePointers.get(e.pointerId)!;
    const {nx, ny} = this.updatePointer(e);
    const scaleIndex = Math.floor(nx * this.numScaleNotes);
    
    this.engine.setParam(1, ny, this.trackId);
    
    if (scaleIndex !== p.note) {
        this.engine.noteOffScale(p.note, this.trackId);
        this.engine.noteOnScale(scaleIndex, 1.0, this.trackId);
        p.note = scaleIndex;
    }
    
    p.x = nx;
    p.y = ny;
    this.draw();
  }

  private onUp(e: PointerEvent) {
    if (this.activePointers.has(e.pointerId)) {
        const p = this.activePointers.get(e.pointerId)!;
        this.engine.noteOffScale(p.note, this.trackId);
        this.activePointers.delete(e.pointerId);
        this.draw();
    }
  }

  private draw() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    this.ctx.fillStyle = "#111820";
    this.ctx.fillRect(0, 0, w, h);
    
    this.ctx.strokeStyle = "#3b4b5e";
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    for (let i = 1; i < this.numScaleNotes; i++) {
        const x = (i / this.numScaleNotes) * w;
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, h);
    }
    this.ctx.stroke();

    for (const p of this.activePointers.values()) {
        const px = p.x * w;
        const py = (1 - p.y) * h;
        
        const grad = this.ctx.createRadialGradient(px, py, 0, px, py, 40);
        grad.addColorStop(0, this.trackId === 0 ? "rgba(85, 170, 255, 0.8)" : "rgba(255, 85, 170, 0.8)");
        grad.addColorStop(1, "rgba(85, 170, 255, 0)");
        
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(px - 40, py - 40, 80, 80);
        
        this.ctx.fillStyle = "#fff";
        this.ctx.beginPath();
        this.ctx.arc(px, py, 5, 0, Math.PI * 2);
        this.ctx.fill();
    }
  }
}
