import { h, ComponentChild } from "preact";
import { Signal } from "@preact/signals";
import { useRef, useState, useEffect } from "preact/hooks";

export function Module({ title, className, children }: { title: string; className: string; children: ComponentChild }) {
  return (
    <div class={`module ${className}`}>
      <div class="module-header">{title}</div>
      <div class="module-body">{children}</div>
    </div>
  );
}

export function Knob({ 
  label, 
  min, 
  max, 
  step, 
  value 
}: { 
  label: string; 
  min: number; 
  max: number; 
  step: number; 
  value: Signal<number> 
}) {
  const isMini = label === "";
  const knobSvgRef = useRef<SVGSVGElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ y: 0, val: 0 });

  const onPointerDown = (e: PointerEvent) => {
    setIsDragging(true);
    dragStart.current = { y: e.clientY, val: value.value };
    knobSvgRef.current?.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!isDragging) return;
    const deltaY = dragStart.current.y - e.clientY;
    const range = max - min;
    const sensitivity = range / 150;
    let newVal = dragStart.current.val + deltaY * sensitivity;
    newVal = Math.round(newVal / step) * step;
    newVal = Math.max(min, Math.min(max, newVal));
    if (newVal !== value.value) {
      value.value = newVal;
    }
    e.preventDefault();
  };

  const onPointerUp = (e: PointerEvent) => {
    setIsDragging(false);
    knobSvgRef.current?.releasePointerCapture(e.pointerId);
  };

  const pct = (value.value - min) / (max - min);
  const angle = -135 + pct * 270;

  return (
    <div class={`control knob-control${isMini ? " mini-knob" : ""}`}>
      {!isMini && (
        <label>
          <span>{label}</span>
          <span>{value.value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}</span>
        </label>
      )}
      <div class="knob-wrap">
        <svg
          ref={knobSvgRef}
          viewBox="0 0 40 40"
          class="knob-svg"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <circle cx="20" cy="20" r="16" class="knob-bg" />
          <line
            x1="20"
            y1="20"
            x2="20"
            y2="6"
            class="knob-indicator"
            transform={`rotate(${angle} 20 20)`}
          />
        </svg>
      </div>
    </div>
  );
}

export function Select({
  label,
  options,
  value,
}: {
  label: string;
  options: { value: string | number; label: string }[];
  value: Signal<any>;
}) {
  return (
    <div class="control">
      <label>
        <span>{label}</span>
        <span>{value.value}</span>
      </label>
      <select
        value={value.value}
        onChange={(e) => (value.value = (e.target as HTMLSelectElement).value)}
      >
        {options.map((o) => (
          <option value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
