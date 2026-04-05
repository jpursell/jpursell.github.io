import { h } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { activeTrackId, sequencerState } from "./state";
import { AudioEngine } from "../audio/engine";

interface Props {
  engine: AudioEngine;
}

export function Sequencer({ engine }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackId = activeTrackId.value;
  const numSteps = 16;

  const getRows = () => (trackId === 0 ? 14 : 4);
  const getLeftMargin = () => (trackId === 0 ? 0 : 80);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    if (w === 0 || h === 0) return;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0a0f14";
    ctx.fillRect(0, 0, w, h);

    const rows = getRows();
    const leftMargin = getLeftMargin();
    const gridW = w - leftMargin;

    const stepW = gridW / numSteps;
    const stepH = h / rows;

    const steps = sequencerState.tracks[trackId as keyof typeof sequencerState.tracks].value;

    const drumLabels = ["Kick", "Snare", "HiHat", "Open Hat"];
    const drumColors = ["#8b966a", "#a84242", "#517a94", "#4d82b8"];

    for (let r = 0; r < rows; r++) {
      const actualNoteIdx = rows - 1 - r;
      const y = r * stepH;

      if (trackId === 0) {
        if (actualNoteIdx === 0 || actualNoteIdx === 7) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
          ctx.fillRect(leftMargin, y, gridW, stepH);
        }
      } else {
        ctx.fillStyle = drumColors[actualNoteIdx] || "#fff";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(drumLabels[actualNoteIdx] || `Drum ${actualNoteIdx}`, leftMargin - 15, y + stepH / 2);
      }
    }

    ctx.strokeStyle = "#2a3644";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < numSteps; i++) {
      const x = leftMargin + i * stepW;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let j = 1; j < rows; j++) {
      ctx.moveTo(leftMargin, j * stepH);
      ctx.lineTo(w, j * stepH);
    }
    ctx.stroke();

    ctx.strokeStyle = "#3b4b5e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < numSteps; i += 4) {
      if (i === 0) continue;
      const x = leftMargin + i * stepW;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    ctx.stroke();

    const padX = stepW * 0.15;
    const padY = stepH * 0.15;

    for (let i = 0; i < numSteps; i++) {
      for (let actualNoteIdx = 0; actualNoteIdx < rows; actualNoteIdx++) {
        const r = rows - 1 - actualNoteIdx;
        const x = leftMargin + i * stepW;
        const y = r * stepH;

        if (steps[i][actualNoteIdx]) {
          if (trackId === 0) {
            ctx.fillStyle = "#f2c14e"; // synth color
          } else {
            ctx.fillStyle = drumColors[actualNoteIdx] || "#fff";
          }
          roundRect(ctx, x + padX, y + padY, stepW - padX * 2, stepH - padY * 2, 4);
          ctx.fill();
        } else if (trackId === 1) {
          ctx.fillStyle = "rgba(255,255,255,0.03)";
          roundRect(ctx, x + padX, y + padY, stepW - padX * 2, stepH - padY * 2, 4);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.1)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  };

  const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  };

  const toggleStep = (e: PointerEvent, setOnly = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const rows = getRows();
    const leftMargin = getLeftMargin();

    const x = e.clientX - rect.left - leftMargin;
    const y = e.clientY - rect.top;

    if (x < 0) return;

    const gridW = rect.width - leftMargin;
    const stepW = gridW / numSteps;
    const stepH = rect.height / rows;

    const stepIdx = Math.floor(x / stepW);
    const rowIdx = Math.floor(y / stepH);

    if (stepIdx >= 0 && stepIdx < numSteps && rowIdx >= 0 && rowIdx < rows) {
      const actualNoteIdx = rows - 1 - rowIdx;
      const trackSig = sequencerState.tracks[trackId as keyof typeof sequencerState.tracks];
      const steps = [...trackSig.value];
      steps[stepIdx] = [...steps[stepIdx]];

      if (setOnly) {
        if (!steps[stepIdx][actualNoteIdx]) {
          steps[stepIdx][actualNoteIdx] = true;
          trackSig.value = steps;
          engine.setGridStep(trackId, stepIdx, true, actualNoteIdx, 1.0);
        }
      } else {
        steps[stepIdx][actualNoteIdx] = !steps[stepIdx][actualNoteIdx];
        trackSig.value = steps;
        engine.setGridStep(trackId, stepIdx, steps[stepIdx][actualNoteIdx], actualNoteIdx, 1.0);
      }
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let isDown = false;
    const onPointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      isDown = true;
      toggleStep(e, false);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (isDown) toggleStep(e, true);
    };
    const onPointerUp = () => {
      isDown = false;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);

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
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerUp);
      ro.disconnect();
    };
  }, [trackId]);

  useEffect(() => {
    draw();
  }, [trackId, sequencerState.tracks[0].value, sequencerState.tracks[1].value]);

  return (
    <div class="module sequencer" style={{ flexDirection: "column", height: "100%", flex: 1 }}>
      <div class="module-header" style={{ background: "#444" }}>Grid Sequencer</div>
      <div style={{ flex: 1, minHeight: 0, padding: "10px", display: "flex", flexDirection: "column" }}>
        <canvas
          ref={canvasRef}
          style={{
            cursor: "crosshair",
            width: "100%",
            height: "100%",
            backgroundColor: "#0a0f14",
            touchAction: "none",
            borderRadius: "4px",
            display: "block"
          }}
        />
      </div>
    </div>
  );
}
