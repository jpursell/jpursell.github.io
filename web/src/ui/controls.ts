export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export function setSliderText(target: HTMLElement, v: number) {
  target.textContent = v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

export type Slider = { wrap: HTMLDivElement; input: HTMLInputElement; right: HTMLSpanElement };

export function makeSlider(label: string, min: number, max: number, step: number, value: number): Slider {
  const wrap = el("div", "control");
  const lab = el("label");
  const left = el("span");
  left.textContent = label;
  const right = el("span");
  right.textContent = String(value);
  lab.append(left, right);
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  wrap.append(lab, input);
  return { wrap, input, right };
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
