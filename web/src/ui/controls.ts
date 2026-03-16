export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export function makeModule(title: string, className: string) {
  const mod = el("div", `module ${className}`);
  const header = el("div", "module-header");
  header.textContent = title;
  const body = el("div", "module-body");
  mod.append(header, body);
  return { mod, body };
}

export function setKnobText(target: HTMLElement, v: number) {
  target.textContent = v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

export type Knob = { 
  wrap: HTMLDivElement; 
  input: { value: string; addEventListener: (event: string, cb: () => void) => void }; 
  right: HTMLSpanElement; 
  setValue: (v: number) => void;
};

export function makeKnob(label: string, min: number, max: number, step: number, value: number): Knob {
  const isMini = label === "";
  const wrap = el("div", "control knob-control" + (isMini ? " mini-knob" : ""));
  let right: HTMLSpanElement = el("span"); // dummy for mini
  
  if (!isMini) {
    const lab = el("label");
    const left = el("span");
    left.textContent = label;
    right = el("span");
    right.textContent = String(value);
    lab.append(left, right);
    wrap.append(lab);
  }

  const knobWrap = el("div", "knob-wrap");
  const knobSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  knobSvg.setAttribute("viewBox", "0 0 40 40");
  knobSvg.setAttribute("class", "knob-svg");
  
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", "20");
  circle.setAttribute("cy", "20");
  circle.setAttribute("r", "16");
  circle.setAttribute("class", "knob-bg");
  
  const indicator = document.createElementNS("http://www.w3.org/2000/svg", "line");
  indicator.setAttribute("x1", "20");
  indicator.setAttribute("y1", "20");
  indicator.setAttribute("x2", "20");
  indicator.setAttribute("y2", "6");
  indicator.setAttribute("class", "knob-indicator");

  knobSvg.append(circle, indicator);
  knobWrap.append(knobSvg);

  let currentVal = value;
  const listeners: (() => void)[] = [];

  const pseudoInput = {
    get value() { return String(currentVal); },
    set value(v: string) { 
      currentVal = Number(v);
      updateVisuals();
    },
    addEventListener(event: string, cb: () => void) {
      if (event === "input") listeners.push(cb);
    }
  };

  function updateVisuals() {
    const pct = (currentVal - min) / (max - min);
    const angle = -135 + pct * 270;
    indicator.setAttribute("transform", `rotate(${angle} 20 20)`);
  }

  updateVisuals();

  let isDragging = false;
  let startY = 0;
  let startVal = 0;

  knobSvg.addEventListener("pointerdown", (e) => {
    isDragging = true;
    startY = e.clientY;
    startVal = currentVal;
    knobSvg.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  knobSvg.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const deltaY = startY - e.clientY; // up is positive
    const range = max - min;
    
    // 150px drag = full range
    const sensitivity = range / 150;
    let newVal = startVal + deltaY * sensitivity;
    
    // snap to step
    newVal = Math.round(newVal / step) * step;
    newVal = Math.max(min, Math.min(max, newVal));

    if (newVal !== currentVal) {
      currentVal = newVal;
      updateVisuals();
      for (const cb of listeners) cb();
    }
    e.preventDefault();
  });

  knobSvg.addEventListener("pointerup", (e) => {
    isDragging = false;
    knobSvg.releasePointerCapture(e.pointerId);
  });
  knobSvg.addEventListener("pointercancel", (e) => {
    isDragging = false;
    knobSvg.releasePointerCapture(e.pointerId);
  });

  wrap.append(knobWrap);

  return { wrap, input: pseudoInput, right, setValue: (v: number) => { currentVal = v; updateVisuals(); } };
}

export function makeSelect(label: string, options: { value: string; label: string }[], value: string) {
  const wrap = el("div", "control");
  const lab = el("label");
  const left = el("span");
  left.textContent = label;
  const right = el("span");
  right.textContent = value;
  lab.append(left, right);
  const select = document.createElement("select");
  for (const o of options) {
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    select.append(opt);
  }
  select.value = value;
  wrap.append(lab, select);
  return { wrap, select, right };
}
