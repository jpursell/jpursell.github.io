import { AudioEngine } from "./audio/engine";
import { PARAM_ATTACK, PARAM_CUTOFF, PARAM_RELEASE, PARAM_VOLUME, PARAM_WAVEFORM } from "./audio/protocol";
import { ThumbKeyboard, type KeyEvent } from "./ui/keyboard";
import { TypingKeyboard } from "./ui/typing_keyboard";

function isProbablyPhone(): boolean {
  const ud = (navigator as any).userAgentData as undefined | { mobile?: boolean };
  if (ud && typeof ud.mobile === "boolean") return ud.mobile;
  return /iPhone|iPod|Android.*Mobile|Windows Phone/i.test(navigator.userAgent);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function setSliderText(target: HTMLElement, v: number) {
  target.textContent = v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app");

const engine = new AudioEngine();
const isPhone = isProbablyPhone();

const top = el("div", "top");
const title = el("div", "title");
const h1 = el("h1");
h1.textContent = "Thumb Synth";
const hint = el("div", "hint");
hint.textContent = isPhone ? "Tap Start, then play the keyboard with your thumbs." : "Click Start, then play: A W S E D F T G Y H U J K (Z/X octave).";
title.append(h1, hint);
top.append(title);

const controls = el("div", "controls");
const btnbar = el("div", "btnbar");

const startBtn = el("button", "btn primary");
startBtn.textContent = "Start Audio";
const waveBtn = el("button", "btn");
waveBtn.textContent = "Wave: Saw";
const octaveWrap = el("div", "octave");
octaveWrap.textContent = "Octave:";
const octDown = el("button", "btn");
octDown.textContent = "-";
const octUp = el("button", "btn");
octUp.textContent = "+";
const octLabel = el("span");
octLabel.textContent = "0";
octaveWrap.append(octDown, octLabel, octUp);
btnbar.append(startBtn, waveBtn, octaveWrap);
controls.append(btnbar);

function makeSlider(label: string, min: number, max: number, step: number, value: number) {
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

const row1 = el("div", "row");
const cutoff = makeSlider("Cutoff", 0, 1, 0.001, 0.45);
const volume = makeSlider("Volume", 0, 1, 0.001, 0.55);
row1.append(cutoff.wrap, volume.wrap);

const row2 = el("div", "row");
const attack = makeSlider("Attack (s)", 0.001, 2.0, 0.001, 0.01);
const release = makeSlider("Release (s)", 0.005, 3.0, 0.001, 0.15);
row2.append(attack.wrap, release.wrap);

controls.append(row1, row2);
top.append(controls);

const keyboardWrap = el("div", "keyboardWrap");
const canvas = document.createElement("canvas");
canvas.id = "keyboard";
keyboardWrap.append(canvas);

app.append(top, el("div"), keyboardWrap);

let waveform: 0 | 1 = 0;
let octaveShift = 0;
let audioReady = false;

cutoff.input.addEventListener("input", () => {
  const v = Number(cutoff.input.value);
  setSliderText(cutoff.right, v);
  engine.setParam(PARAM_CUTOFF, v);
});
volume.input.addEventListener("input", () => {
  const v = Number(volume.input.value);
  setSliderText(volume.right, v);
  engine.setParam(PARAM_VOLUME, v);
});
attack.input.addEventListener("input", () => {
  const v = Number(attack.input.value);
  setSliderText(attack.right, v);
  engine.setParam(PARAM_ATTACK, v);
});
release.input.addEventListener("input", () => {
  const v = Number(release.input.value);
  setSliderText(release.right, v);
  engine.setParam(PARAM_RELEASE, v);
});

waveBtn.addEventListener("click", () => {
  waveform = waveform === 0 ? 1 : 0;
  waveBtn.textContent = waveform === 0 ? "Wave: Saw" : "Wave: Square";
  engine.setParam(PARAM_WAVEFORM, waveform);
});

const keyboard = new ThumbKeyboard(canvas, (ev: KeyEvent) => {
  if (ev.type === "down") {
    engine.noteOn(ev.note, ev.velocity);
  } else if (ev.type === "up") {
    engine.noteOff(ev.note);
  } else if (ev.type === "move") {
    engine.noteOff(ev.from);
    engine.noteOn(ev.to, ev.velocity);
  }
});

let typing: TypingKeyboard | null = null;

function setOctave(n: number) {
  octaveShift = Math.max(-2, Math.min(2, n | 0));
  octLabel.textContent = String(octaveShift);
  keyboard.setOctaveShift(octaveShift);
  typing?.syncBaseNote();
}
octDown.addEventListener("click", () => setOctave(octaveShift - 1));
octUp.addEventListener("click", () => setOctave(octaveShift + 1));

if (!isPhone) {
  typing = new TypingKeyboard({
    enabled: () => audioReady,
    getBaseNote: () => 60 + octaveShift * 12,
    noteOn: (note, velocity) => engine.noteOn(note, velocity),
    noteOff: (note) => engine.noteOff(note),
    octaveDelta: (d) => setOctave(octaveShift + d)
  });
}


const overlay = el("div", "overlay");
const card = el("div", "card");
const h2 = el("h2");
h2.textContent = "Start Audio";
const p = el("p");
p.textContent = isPhone ? "Mobile browsers require a tap before audio can start. After starting, play the keyboard. Slide for gliss." : "Browsers require a click before audio can start. After starting, use the keys (A…K) or the on-screen keyboard.";
const start2 = el("button", "btn primary");
start2.textContent = isPhone ? "Tap to Start" : "Click to Start";
const err = el("div", "err");
card.append(h2, p, start2, err);
overlay.append(card);
document.body.append(overlay);

async function startAudio() {
  err.textContent = "";
  startBtn.disabled = true;
  start2.disabled = true;

  try {
    await engine.start();
    audioReady = true;
    engine.setParam(PARAM_WAVEFORM, waveform);
    engine.setParam(PARAM_CUTOFF, Number(cutoff.input.value));
    engine.setParam(PARAM_ATTACK, Number(attack.input.value));
    engine.setParam(PARAM_RELEASE, Number(release.input.value));
    engine.setParam(PARAM_VOLUME, Number(volume.input.value));

    // One-shot ping to confirm audio is alive.
    engine.noteOn(69, 0.85);
    window.setTimeout(() => engine.noteOff(69), 180);

    overlay.remove();
  } catch (e) {
    const msg = e instanceof Error ? (e.stack || e.message) : String(e);
    err.textContent =
      `Audio failed to start.\n${msg}\n\n` +
      "Tip: the Rust build step creates `web/public/wasm/synth.wasm`. Run `npm run dev` from `web/`.";
    audioReady = false;
    startBtn.disabled = false;
    start2.disabled = false;
  }
}

startBtn.addEventListener("click", () => void startAudio());
start2.addEventListener("click", () => void startAudio());

setSliderText(cutoff.right, Number(cutoff.input.value));
setSliderText(volume.right, Number(volume.input.value));
setSliderText(attack.right, Number(attack.input.value));
setSliderText(release.right, Number(release.input.value));
setOctave(0);

