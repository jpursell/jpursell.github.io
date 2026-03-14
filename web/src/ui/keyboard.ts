export type KeyEvent =
  | { type: "down"; pointerId: number; note: number; velocity: number }
  | { type: "up"; pointerId: number; note: number }
  | { type: "move"; pointerId: number; from: number; to: number; velocity: number };

type KeyRect = {
  note: number;
  x: number;
  y: number;
  w: number;
  h: number;
  black: boolean;
};

const WHITE_STEPS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_STEPS = [1, 3, 6, 8, 10];

export class ThumbKeyboard {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private onEvent: (ev: KeyEvent) => void;

  private dpr = 1;
  private keys: KeyRect[] = [];
  private active = new Map<number, number>(); // pointerId -> note
  private externalActive = new Set<number>();
  private baseNote = 60; // C4
  private octaves = 2;

  constructor(canvas: HTMLCanvasElement, onEvent: (ev: KeyEvent) => void) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D not available");
    this.canvas = canvas;
    this.ctx = ctx;
    this.onEvent = onEvent;

    canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    canvas.addEventListener("pointerup", (e) => this.onPointerUp(e));
    canvas.addEventListener("pointercancel", (e) => this.onPointerUp(e));

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas);
    this.resize();
  }

  setOctaveShift(shift: number): void {
    const s = Math.max(-2, Math.min(2, shift | 0));
    this.baseNote = 60 + s * 12;
    this.layout();
    this.draw();
  }

  setExternalActive(note: number, active: boolean): void {
    if (active) {
      this.externalActive.add(note);
    } else {
      this.externalActive.delete(note);
    }
    this.draw();
  }

  clearExternalActive(): void {
    this.externalActive.clear();
    this.draw();
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    this.canvas.width = Math.max(1, Math.floor(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this.dpr));
    this.layout();
    this.draw();
  }

  private layout(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.keys = [];

    const whiteCount = this.octaves * 7;
    const whiteW = w / whiteCount;
    const whiteH = h;

    for (let o = 0; o < this.octaves; o++) {
      for (let i = 0; i < 7; i++) {
        const note = this.baseNote + o * 12 + WHITE_STEPS[i];
        const x = (o * 7 + i) * whiteW;
        this.keys.push({ note, x, y: 0, w: whiteW, h: whiteH, black: false });
      }
    }

    const blackW = whiteW * 0.62;
    const blackH = h * 0.62;
    for (let o = 0; o < this.octaves; o++) {
      const baseX = o * 7 * whiteW;
      const centers = [
        baseX + 1 * whiteW,
        baseX + 2 * whiteW,
        baseX + 4 * whiteW,
        baseX + 5 * whiteW,
        baseX + 6 * whiteW
      ];
      for (let i = 0; i < BLACK_STEPS.length; i++) {
        const note = this.baseNote + o * 12 + BLACK_STEPS[i];
        const x = centers[i] - blackW / 2;
        this.keys.push({ note, x, y: 0, w: blackW, h: blackH, black: true });
      }
    }
  }

  private draw(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = "rgba(255,255,255,0.03)";
    for (let i = 0; i < 14; i++) {
      ctx.fillRect(0, (i / 14) * h, w, 1);
    }

    const activeNotes = new Set(this.active.values());
    for (const n of this.externalActive) activeNotes.add(n);

    for (const k of this.keys.filter((x) => !x.black)) {
      const isActive = activeNotes.has(k.note);
      ctx.fillStyle = isActive ? "rgba(242,193,78,0.22)" : "rgba(255,255,255,0.10)";
      ctx.fillRect(k.x, k.y, k.w, k.h);
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1 * this.dpr;
      ctx.strokeRect(k.x + 0.5, k.y + 0.5, k.w - 1, k.h - 1);
    }

    for (const k of this.keys.filter((x) => x.black)) {
      const isActive = activeNotes.has(k.note);
      ctx.fillStyle = isActive ? "rgba(109,211,206,0.40)" : "rgba(0,0,0,0.55)";
      ctx.fillRect(k.x, k.y, k.w, k.h);
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.lineWidth = 1 * this.dpr;
      ctx.strokeRect(k.x + 0.5, k.y + 0.5, k.w - 1, k.h - 1);
    }

    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.font = `${12 * this.dpr}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Arial`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("Multi-touch keyboard (2 octaves)", 10 * this.dpr, (h - 10) * this.dpr);
  }

  private onPointerDown(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    const note = this.hitTest(e);
    if (note == null) return;
    const velocity = this.velocityFromY(e);
    this.active.set(e.pointerId, note);
    this.draw();
    this.onEvent({ type: "down", pointerId: e.pointerId, note, velocity });
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.active.has(e.pointerId)) return;
    const prev = this.active.get(e.pointerId)!;
    const note = this.hitTest(e);
    if (note == null || note === prev) return;
    const velocity = this.velocityFromY(e);
    this.active.set(e.pointerId, note);
    this.draw();
    this.onEvent({ type: "move", pointerId: e.pointerId, from: prev, to: note, velocity });
  }

  private onPointerUp(e: PointerEvent): void {
    const note = this.active.get(e.pointerId);
    if (note == null) return;
    this.active.delete(e.pointerId);
    this.draw();
    this.onEvent({ type: "up", pointerId: e.pointerId, note });
  }

  private velocityFromY(e: PointerEvent): number {
    const rect = this.canvas.getBoundingClientRect();
    const y01 = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return 0.55 + 0.45 * y01;
  }

  private hitTest(e: PointerEvent): number | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * this.dpr;
    const y = (e.clientY - rect.top) * this.dpr;

    for (const k of this.keys.filter((z) => z.black)) {
      if (x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h) return k.note;
    }
    for (const k of this.keys.filter((z) => !z.black)) {
      if (x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h) return k.note;
    }
    return null;
  }
}


