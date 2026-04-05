import { h } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { activeTrackId } from "./state";
import { AudioEngine } from "../audio/engine";

interface Props {
  engine: AudioEngine;
}

export function XyPad({ engine }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackId = activeTrackId.value;
  const activePointers = useRef(new Map<number, { x: number, y: number, note: number }>());
  const numScaleNotes = 14;

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = "#111820";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "#3b4b5e";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < numScaleNotes; i++) {
      const x = (i / numScaleNotes) * w;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    ctx.stroke();

    for (const p of activePointers.current.values()) {
      const px = p.x * w;
      const py = (1 - p.y) * h;

      const grad = ctx.createRadialGradient(px, py, 0, px, py, 40);
      grad.addColorStop(0, trackId === 0 ? "rgba(85, 170, 255, 0.8)" : "rgba(255, 85, 170, 0.8)");
      grad.addColorStop(1, "rgba(85, 170, 255, 0)");

      ctx.fillStyle = grad;
      ctx.fillRect(px - 40, py - 40, 80, 80);

      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const updatePointer = (e: PointerEvent): { nx: number, ny: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { nx: 0, ny: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const nx = rect.width > 0 ? Math.max(0, Math.min(1, x / rect.width)) : 0;
    const ny = rect.height > 0 ? Math.max(0, Math.min(1, 1 - (y / rect.height))) : 0;

    return { nx, ny };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const { nx, ny } = updatePointer(e);

      const scaleIndex = Math.floor(nx * numScaleNotes);
      engine.setParam(1, ny, trackId); // ParamId 1 is Cutoff
      engine.noteOnScale(scaleIndex, 1.0, trackId);

      activePointers.current.set(e.pointerId, { x: nx, y: ny, note: scaleIndex });
      draw();
    };

    const onMove = (e: PointerEvent) => {
      if (!activePointers.current.has(e.pointerId)) return;

      const p = activePointers.current.get(e.pointerId)!;
      const { nx, ny } = updatePointer(e);
      const scaleIndex = Math.floor(nx * numScaleNotes);

      engine.setParam(1, ny, trackId);

      if (scaleIndex !== p.note) {
        engine.noteOffScale(p.note, trackId);
        engine.noteOnScale(scaleIndex, 1.0, trackId);
        p.note = scaleIndex;
      }

      p.x = nx;
      p.y = ny;
      draw();
    };

    const onUp = (e: PointerEvent) => {
      if (activePointers.current.has(e.pointerId)) {
        const p = activePointers.current.get(e.pointerId)!;
        engine.noteOffScale(p.note, trackId);
        activePointers.current.delete(e.pointerId);
        draw();
      }
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onUp);

    const ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        
        const { width, height } = entry.contentRect;
        const w = Math.floor(width);
        const h = Math.floor(height);

        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
            draw();
        }
    });
    ro.observe(canvas);

    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onUp);
      ro.disconnect();
    };
  }, [trackId]);

  useEffect(() => {
    activePointers.current.clear();
    draw();
  }, [trackId]);

  return (
    <div class="module xy-pad" style={{ flexDirection: "column", height: "100%", flex: 1 }}>
      <div class="module-header" style={{ background: "#444" }}>XY Pad</div>
      <div style={{ flex: 1, minHeight: 0, padding: "10px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <canvas
          ref={canvasRef}
          style={{
            cursor: "crosshair",
            height: "100%",
            width: "auto",
            aspectRatio: "1 / 1",
            backgroundColor: "#000",
            border: "1px solid rgba(255,255,255,0.1)",
            touchAction: "none",
            borderRadius: "4px",
            display: "block"
          }}
        />
      </div>
    </div>
  );
}
