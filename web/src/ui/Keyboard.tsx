import { h } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { activeTrackId, octaveShift, audioReady } from "./state";
import { AudioEngine } from "../audio/engine";

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

interface Props {
  engine: AudioEngine;
}

export function Keyboard({ engine }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackId = activeTrackId.value;
  const shift = octaveShift.value;
  
  const dprRef = useRef(1);
  const keysRef = useRef<KeyRect[]>([]);
  const activeRef = useRef(new Map<number, number>()); // pointerId -> note
  const externalActiveRef = useRef(new Set<number>());
  const octaves = 2;

  const getBaseNote = () => 60 + shift * 12;

  const layout = (canvas: HTMLCanvasElement) => {
    const w = canvas.width;
    const h = canvas.height;
    keysRef.current = [];

    const whiteCount = octaves * 7;
    const whiteW = w / whiteCount;
    const whiteH = h;
    const baseNote = getBaseNote();

    for (let o = 0; o < octaves; o++) {
      for (let i = 0; i < 7; i++) {
        const note = baseNote + o * 12 + WHITE_STEPS[i];
        const x = (o * 7 + i) * whiteW;
        keysRef.current.push({ note, x, y: 0, w: whiteW, h: whiteH, black: false });
      }
    }

    const blackW = whiteW * 0.62;
    const blackH = h * 0.62;
    for (let o = 0; o < octaves; o++) {
      const baseX = o * 7 * whiteW;
      const centers = [
        baseX + 1 * whiteW,
        baseX + 2 * whiteW,
        baseX + 4 * whiteW,
        baseX + 5 * whiteW,
        baseX + 6 * whiteW
      ];
      for (let i = 0; i < BLACK_STEPS.length; i++) {
        const note = baseNote + o * 12 + BLACK_STEPS[i];
        const x = centers[i] - blackW / 2;
        keysRef.current.push({ note, x, y: 0, w: blackW, h: blackH, black: true });
      }
    }
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const dpr = dprRef.current;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = "rgba(255,255,255,0.03)";
    for (let i = 0; i < 14; i++) {
      ctx.fillRect(0, (i / 14) * h, w, 1);
    }

    const activeNotes = new Set(activeRef.current.values());
    for (const n of externalActiveRef.current) activeNotes.add(n);

    for (const k of keysRef.current.filter((x) => !x.black)) {
      const isActive = activeNotes.has(k.note);
      ctx.fillStyle = isActive ? "rgba(242,193,78,0.22)" : "rgba(255,255,255,0.10)";
      ctx.fillRect(k.x, k.y, k.w, k.h);
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1 * dpr;
      ctx.strokeRect(k.x + 0.5, k.y + 0.5, k.w - 1, k.h - 1);
    }

    for (const k of keysRef.current.filter((x) => x.black)) {
      const isActive = activeNotes.has(k.note);
      ctx.fillStyle = isActive ? "rgba(109,211,206,0.40)" : "rgba(0,0,0,0.55)";
      ctx.fillRect(k.x, k.y, k.w, k.h);
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.lineWidth = 1 * dpr;
      ctx.strokeRect(k.x + 0.5, k.y + 0.5, k.w - 1, k.h - 1);
    }

    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.font = `${12 * dpr}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Arial`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("Multi-touch keyboard (2 octaves)", 10 * dpr, h - 10);
  };

  const velocityFromY = (e: PointerEvent): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0.85;
    const rect = canvas.getBoundingClientRect();
    const y01 = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return 0.55 + 0.45 * y01;
  };

  const hitTest = (e: PointerEvent): number | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * dprRef.current;
    const y = (e.clientY - rect.top) * dprRef.current;

    for (const k of keysRef.current.filter((z) => z.black)) {
      if (x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h) return k.note;
    }
    for (const k of keysRef.current.filter((z) => !z.black)) {
      if (x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h) return k.note;
    }
    return null;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const note = hitTest(e);
      if (note == null) return;
      const velocity = velocityFromY(e);
      activeRef.current.set(e.pointerId, note);
      draw();
      engine.noteOn(note, velocity, trackId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!activeRef.current.has(e.pointerId)) return;
      const prev = activeRef.current.get(e.pointerId)!;
      const note = hitTest(e);
      if (note == null || note === prev) return;
      const velocity = velocityFromY(e);
      activeRef.current.set(e.pointerId, note);
      draw();
      engine.noteOff(prev, trackId);
      engine.noteOn(note, velocity, trackId);
    };

    const onPointerUp = (e: PointerEvent) => {
      const note = activeRef.current.get(e.pointerId);
      if (note == null) return;
      activeRef.current.delete(e.pointerId);
      draw();
      engine.noteOff(note, trackId);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      
      const { width, height } = entry.contentRect;
      const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
      const w = Math.floor(width * dpr);
      const h = Math.floor(height * dpr);

      if (canvas.width !== w || canvas.height !== h) {
        dprRef.current = dpr;
        canvas.width = w;
        canvas.height = h;
        layout(canvas);
        draw();
      }
    });
    ro.observe(canvas);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      ro.disconnect();
    };
  }, [trackId, shift]);

  // Typing keyboard integration
  useEffect(() => {
    if (!audioReady.value) return;

    const NOTE_KEYS = ["a", "w", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j", "k"];
    let heldKeys: string[] = [];
    let currentKey: string | null = null;
    let currentNote: number | null = null;

    const getNoteForKey = (key: string) => {
        const idx = NOTE_KEYS.indexOf(key);
        if (idx < 0) return null;
        return getBaseNote() + idx;
    };

    const stop = () => {
        if (currentNote != null) {
            engine.noteOff(currentNote, activeTrackId.peek());
            externalActiveRef.current.delete(currentNote);
        }
        heldKeys = [];
        currentKey = null;
        currentNote = null;
        draw();
    };

    const onKeyDown = (e: KeyboardEvent) => {
        if (!audioReady.value) return;
        if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;

        const target = e.target as HTMLElement;
        if (target.isContentEditable || ["TEXTAREA", "SELECT"].includes(target.tagName)) return;
        if (target.tagName === "INPUT" && (target as HTMLInputElement).type !== "range") return;

        const key = e.key.toLowerCase();
        if (key === "z") {
            e.preventDefault();
            octaveShift.value = Math.max(-2, octaveShift.peek() - 1);
            return;
        }
        if (key === "x") {
            e.preventDefault();
            octaveShift.value = Math.min(2, octaveShift.peek() + 1);
            return;
        }

        const note = getNoteForKey(key);
        if (note == null) return;

        e.preventDefault();
        if (heldKeys.includes(key)) return;
        heldKeys.push(key);

        if (currentNote != null) {
            engine.noteOff(currentNote, activeTrackId.peek());
            externalActiveRef.current.delete(currentNote);
        }

        currentKey = key;
        currentNote = note;
        externalActiveRef.current.add(note);
        engine.noteOn(note, 0.85, activeTrackId.peek());
        draw();
    };

    const onKeyUp = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        const note = getNoteForKey(key);
        if (note == null) return;

        e.preventDefault();
        const idx = heldKeys.lastIndexOf(key);
        if (idx >= 0) heldKeys.splice(idx, 1);

        if (currentKey !== key) return;

        if (currentNote != null) {
            engine.noteOff(currentNote, activeTrackId.peek());
            externalActiveRef.current.delete(currentNote);
        }

        const nextKey = heldKeys.length ? heldKeys[heldKeys.length - 1] : null;
        const nextNote = nextKey ? getNoteForKey(nextKey) : null;

        if (nextKey && nextNote != null) {
            currentKey = nextKey;
            currentNote = nextNote;
            externalActiveRef.current.add(nextNote);
            engine.noteOn(nextNote, 0.85, activeTrackId.peek());
        } else {
            currentKey = null;
            currentNote = null;
        }
        draw();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", stop);
    
    return () => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        window.removeEventListener("blur", stop);
        stop();
    };
  }, [audioReady.value, shift]); // Re-bind if shift changes to update baseNote in closures

  useEffect(() => {
    layout(canvasRef.current!);
    draw();
  }, [trackId, shift]);

  return (
    <div class="keyboardWrap">
      <canvas
        ref={canvasRef}
        id="keyboard"
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}
