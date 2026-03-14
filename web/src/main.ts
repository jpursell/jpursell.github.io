import { AudioEngine } from "./audio/engine";
import {
  PARAM_ATTACK,
  PARAM_CUTOFF,
  PARAM_DECAY,
  PARAM_DETUNE_CENTS,
  PARAM_FILT_ATTACK,
  PARAM_FILT_DECAY,
  PARAM_FILT_RELEASE,
  PARAM_FILT_SUSTAIN,
  PARAM_FILTER_ENV_AMT,
  PARAM_GLIDE,
  PARAM_KEYTRACK,
  PARAM_NOISE,
  PARAM_OSC2_SEMITONES,
  PARAM_OSC2_WAVEFORM,
  PARAM_OSC_MIX,
  PARAM_RELEASE,
  PARAM_RESONANCE,
  PARAM_SUSTAIN,
  PARAM_VOLUME,
  PARAM_WAVEFORM
} from "./audio/protocol";
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
hint.textContent = isPhone
  ? "Tap Start, then play the keyboard with your thumbs."
  : "Click Start, then play: A W S E D F T G Y H U J K (Z/X octave).";
title.append(h1, hint);
top.append(title);

const controls = el("div", "controls");
const btnbar = el("div", "btnbar");

const startBtn = el("button", "btn primary");
startBtn.textContent = "Start Audio";

const waveBtn = el("button", "btn");
waveBtn.textContent = "Osc1: Saw";

const advBtn = el("button", "btn");
advBtn.textContent = "Advanced";

const octaveWrap = el("div", "octave");
octaveWrap.textContent = "Octave:";
const octDown = el("button", "btn");
octDown.textContent = "-";
const octUp = el("button", "btn");
octUp.textContent = "+";
const octLabel = el("span");
octLabel.textContent = "0";
octaveWrap.append(octDown, octLabel, octUp);

btnbar.append(startBtn, waveBtn, advBtn, octaveWrap);
controls.append(btnbar);

type Slider = { wrap: HTMLDivElement; input: HTMLInputElement; right: HTMLSpanElement };
function makeSlider(label: string, min: number, max: number, step: number, value: number): Slider {
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

function makeSelect(label: string, options: { value: string; label: string }[], value: string) {
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


// Main controls (4 rows)
const row1 = el("div", "row");
const cutoff = makeSlider("Cutoff", 0, 1, 0.001, 0.45);
const resonance = makeSlider("Resonance", 0, 1, 0.001, 0.2);
row1.append(cutoff.wrap, resonance.wrap);

const row2 = el("div", "row");
const envAmt = makeSlider("Env Amt", 0, 1, 0.001, 0.5);
const volume = makeSlider("Volume", 0, 1, 0.001, 0.55);
row2.append(envAmt.wrap, volume.wrap);

const row3 = el("div", "row");
const attack = makeSlider("Attack (s)", 0.001, 2.0, 0.001, 0.01);
const decay = makeSlider("Decay (s)", 0.005, 3.0, 0.001, 0.12);
row3.append(attack.wrap, decay.wrap);

const row4 = el("div", "row");
const sustain = makeSlider("Sustain", 0, 1, 0.001, 0.6);
const release = makeSlider("Release (s)", 0.005, 3.0, 0.001, 0.15);
row4.append(sustain.wrap, release.wrap);

controls.append(row1, row2, row3, row4);

// Advanced controls (collapsed)
const advanced = el("div", "advanced");
advanced.hidden = true;

const advBar = el("div", "btnbar");
const osc2WaveBtn = el("button", "btn");
osc2WaveBtn.textContent = "Osc2: Saw";
advBar.append(osc2WaveBtn);
advanced.append(advBar);

const row5 = el("div", "row");
const oscMix = makeSlider("Osc Mix", 0, 1, 0.001, 0.35);
const detune = makeSlider("Detune (c)", -50, 50, 0.1, 0);
row5.append(oscMix.wrap, detune.wrap);

const row6 = el("div", "row");
const osc2Semi = makeSlider("Osc2 Semi", -24, 24, 1, 0);
const noise = makeSlider("Noise", 0, 1, 0.001, 0);
row6.append(osc2Semi.wrap, noise.wrap);

const row7 = el("div", "row");
const glide = makeSlider("Glide (s)", 0, 0.75, 0.001, 0);
const keytrack = makeSlider("Keytrack", 0, 1, 0.001, 0);
row7.append(glide.wrap, keytrack.wrap);

const row8 = el("div", "row");
const fAtk = makeSlider("F.Attack (s)", 0.001, 2.0, 0.001, 0.005);
const fDec = makeSlider("F.Decay (s)", 0.005, 3.0, 0.001, 0.12);
row8.append(fAtk.wrap, fDec.wrap);

const row9 = el("div", "row");
const fSus = makeSlider("F.Sustain", 0, 1, 0.001, 0);
const fRel = makeSlider("F.Release (s)", 0.005, 3.0, 0.001, 0.15);
row9.append(fSus.wrap, fRel.wrap);

advanced.append(row5, row6, row7, row8, row9);

// Arp (Advanced)
let arpEnabled = false;
let arpBpm = 120;
let arpOctaves = 1;
let arpPattern: "up" | "down" | "updown" | "random" | "asPlayed" = "up";
const arpSteps: number[] = new Array(16).fill(1);

function pushArp() {
  engine.setArp({ enabled: arpEnabled, bpm: arpBpm, octaves: arpOctaves, pattern: arpPattern, steps: arpSteps.slice() });
}

const arpWrap = el("div", "arp");
const arpBar = el("div", "btnbar");
const arpBtn = el("button", "btn");
arpBtn.textContent = "Arp: Off";
arpBar.append(arpBtn);
arpWrap.append(arpBar);

const arpRow1 = el("div", "row");
const arpTempo = makeSlider("Tempo (BPM)", 40, 240, 1, 120);
const arpOct = makeSlider("Arp Oct", 1, 4, 1, 1);
arpRow1.append(arpTempo.wrap, arpOct.wrap);
arpWrap.append(arpRow1);

const arpRow2 = el("div", "row");
const arpPat = makeSelect("Pattern", [
  { value: "up", label: "Up" },
  { value: "down", label: "Down" },
  { value: "updown", label: "UpDown" },
  { value: "random", label: "Random" },
  { value: "asPlayed", label: "As Played" }
], "up");
const arpLegend = el("div", "arpLegend");
arpLegend.textContent = "Steps: Rest / Gate / Tie";
arpRow2.append(arpPat.wrap, arpLegend);
arpWrap.append(arpRow2);

const arpGrid = el("div", "arpGrid");
function renderArpStep(i: number, btn: HTMLButtonElement) {
  const v = arpSteps[i] | 0;
  btn.classList.remove("rest", "gate", "tie");
  if (v === 0) { btn.classList.add("rest"); btn.textContent = "·"; }
  else if (v === 2) { btn.classList.add("tie"); btn.textContent = "–"; }
  else { btn.classList.add("gate"); btn.textContent = "●"; }
}
for (let i = 0; i < 16; i++) {
  const b = el("button", "arpStep") as HTMLButtonElement;
  b.type = "button";
  renderArpStep(i, b);
  b.addEventListener("click", () => {
    arpSteps[i] = (arpSteps[i] + 1) % 3;
    renderArpStep(i, b);
    pushArp();
  });
  arpGrid.append(b);
}
arpWrap.append(arpGrid);

arpBtn.addEventListener("click", () => {
  arpEnabled = !arpEnabled;
  arpBtn.textContent = arpEnabled ? "Arp: On" : "Arp: Off";
  pushArp();
});
arpTempo.input.addEventListener("input", () => {
  const v = Number(arpTempo.input.value);
  setSliderText(arpTempo.right, v);
  arpBpm = v;
  pushArp();
});
arpOct.input.addEventListener("input", () => {
  const v = Number(arpOct.input.value);
  setSliderText(arpOct.right, v);
  arpOctaves = v | 0;
  pushArp();
});
arpPat.select.addEventListener("change", () => {
  arpPattern = arpPat.select.value as any;
  arpPat.right.textContent = arpPat.select.value;
  pushArp();
});

setSliderText(arpTempo.right, Number(arpTempo.input.value));
setSliderText(arpOct.right, Number(arpOct.input.value));

advanced.append(arpWrap);
controls.append(advanced);

top.append(controls);

const keyboardWrap = el("div", "keyboardWrap");
const canvas = document.createElement("canvas");
canvas.id = "keyboard";
keyboardWrap.append(canvas);

app.append(top, el("div"), keyboardWrap);

let waveform: 0 | 1 = 0;
let osc2Waveform: 0 | 1 = 0;
let octaveShift = 0;
let audioReady = false;

function setOctave(n: number) {
  octaveShift = Math.max(-2, Math.min(2, n | 0));
  octLabel.textContent = String(octaveShift);
  keyboard.setOctaveShift(octaveShift);
  typing?.syncBaseNote();
}

octDown.addEventListener("click", () => setOctave(octaveShift - 1));
octUp.addEventListener("click", () => setOctave(octaveShift + 1));

advBtn.addEventListener("click", () => {
  const open = document.body.classList.toggle("advanced-open");
  advanced.hidden = !open;
});

cutoff.input.addEventListener("input", () => {
  const v = Number(cutoff.input.value);
  setSliderText(cutoff.right, v);
  engine.setParam(PARAM_CUTOFF, v);
});
resonance.input.addEventListener("input", () => {
  const v = Number(resonance.input.value);
  setSliderText(resonance.right, v);
  engine.setParam(PARAM_RESONANCE, v);
});
envAmt.input.addEventListener("input", () => {
  const v = Number(envAmt.input.value);
  setSliderText(envAmt.right, v);
  engine.setParam(PARAM_FILTER_ENV_AMT, v);
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
decay.input.addEventListener("input", () => {
  const v = Number(decay.input.value);
  setSliderText(decay.right, v);
  engine.setParam(PARAM_DECAY, v);
});
sustain.input.addEventListener("input", () => {
  const v = Number(sustain.input.value);
  setSliderText(sustain.right, v);
  engine.setParam(PARAM_SUSTAIN, v);
});
release.input.addEventListener("input", () => {
  const v = Number(release.input.value);
  setSliderText(release.right, v);
  engine.setParam(PARAM_RELEASE, v);
});

oscMix.input.addEventListener("input", () => {
  const v = Number(oscMix.input.value);
  setSliderText(oscMix.right, v);
  engine.setParam(PARAM_OSC_MIX, v);
});
detune.input.addEventListener("input", () => {
  const v = Number(detune.input.value);
  setSliderText(detune.right, v);
  engine.setParam(PARAM_DETUNE_CENTS, v);
});
osc2Semi.input.addEventListener("input", () => {
  const v = Number(osc2Semi.input.value);
  setSliderText(osc2Semi.right, v);
  engine.setParam(PARAM_OSC2_SEMITONES, v);
});
noise.input.addEventListener("input", () => {
  const v = Number(noise.input.value);
  setSliderText(noise.right, v);
  engine.setParam(PARAM_NOISE, v);
});
glide.input.addEventListener("input", () => {
  const v = Number(glide.input.value);
  setSliderText(glide.right, v);
  engine.setParam(PARAM_GLIDE, v);
});
keytrack.input.addEventListener("input", () => {
  const v = Number(keytrack.input.value);
  setSliderText(keytrack.right, v);
  engine.setParam(PARAM_KEYTRACK, v);
});
fAtk.input.addEventListener("input", () => {
  const v = Number(fAtk.input.value);
  setSliderText(fAtk.right, v);
  engine.setParam(PARAM_FILT_ATTACK, v);
});
fDec.input.addEventListener("input", () => {
  const v = Number(fDec.input.value);
  setSliderText(fDec.right, v);
  engine.setParam(PARAM_FILT_DECAY, v);
});
fSus.input.addEventListener("input", () => {
  const v = Number(fSus.input.value);
  setSliderText(fSus.right, v);
  engine.setParam(PARAM_FILT_SUSTAIN, v);
});
fRel.input.addEventListener("input", () => {
  const v = Number(fRel.input.value);
  setSliderText(fRel.right, v);
  engine.setParam(PARAM_FILT_RELEASE, v);
});

waveBtn.addEventListener("click", () => {
  waveform = waveform === 0 ? 1 : 0;
  waveBtn.textContent = waveform === 0 ? "Osc1: Saw" : "Osc1: Square";
  engine.setParam(PARAM_WAVEFORM, waveform);
});

osc2WaveBtn.addEventListener("click", () => {
  osc2Waveform = osc2Waveform === 0 ? 1 : 0;
  osc2WaveBtn.textContent = osc2Waveform === 0 ? "Osc2: Saw" : "Osc2: Square";
  engine.setParam(PARAM_OSC2_WAVEFORM, osc2Waveform);
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
if (!isPhone) {
  typing = new TypingKeyboard({
    enabled: () => audioReady,
    getBaseNote: () => 60 + octaveShift * 12,
    noteOn: (note, velocity) => {
      keyboard.setExternalActive(note, true);
      engine.noteOn(note, velocity);
    },
    noteOff: (note) => {
      keyboard.setExternalActive(note, false);
      engine.noteOff(note);
    },
    octaveDelta: (d) => setOctave(octaveShift + d)
  });
}

const overlay = el("div", "overlay");
const card = el("div", "card");
const h2 = el("h2");
h2.textContent = "Start Audio";
const p = el("p");
p.textContent = isPhone
  ? "Mobile browsers require a tap before audio can start. After starting, play the keyboard. Slide for gliss."
  : "Browsers require a click before audio can start. After starting, use the keys (A…K) or the on-screen keyboard.";
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
    pushArp();

    engine.setParam(PARAM_WAVEFORM, waveform);
    engine.setParam(PARAM_OSC2_WAVEFORM, osc2Waveform);

    engine.setParam(PARAM_CUTOFF, Number(cutoff.input.value));
    engine.setParam(PARAM_RESONANCE, Number(resonance.input.value));
    engine.setParam(PARAM_FILTER_ENV_AMT, Number(envAmt.input.value));

    engine.setParam(PARAM_VOLUME, Number(volume.input.value));

    engine.setParam(PARAM_ATTACK, Number(attack.input.value));
    engine.setParam(PARAM_DECAY, Number(decay.input.value));
    engine.setParam(PARAM_SUSTAIN, Number(sustain.input.value));
    engine.setParam(PARAM_RELEASE, Number(release.input.value));

    engine.setParam(PARAM_OSC_MIX, Number(oscMix.input.value));
    engine.setParam(PARAM_DETUNE_CENTS, Number(detune.input.value));
    engine.setParam(PARAM_OSC2_SEMITONES, Number(osc2Semi.input.value));
    engine.setParam(PARAM_NOISE, Number(noise.input.value));
    engine.setParam(PARAM_GLIDE, Number(glide.input.value));
    engine.setParam(PARAM_KEYTRACK, Number(keytrack.input.value));

    engine.setParam(PARAM_FILT_ATTACK, Number(fAtk.input.value));
    engine.setParam(PARAM_FILT_DECAY, Number(fDec.input.value));
    engine.setParam(PARAM_FILT_SUSTAIN, Number(fSus.input.value));
    engine.setParam(PARAM_FILT_RELEASE, Number(fRel.input.value));

    // One-shot ping to confirm audio is alive.
    engine.noteOn(69, 0.85);
    window.setTimeout(() => engine.noteOff(69), 180);

    overlay.remove();
  } catch (e) {
    const msg = e instanceof Error ? (e.stack || e.message) : String(e);
    err.textContent = `Audio failed to start.\n${msg}\n\n` +
      "Tip: the Rust build step creates `web/public/wasm/synth.wasm`. Run `npm run dev` from `web/`.";
    audioReady = false;
    startBtn.disabled = false;
    start2.disabled = false;
  }
}

startBtn.addEventListener("click", () => void startAudio());
start2.addEventListener("click", () => void startAudio());

setSliderText(cutoff.right, Number(cutoff.input.value));
setSliderText(resonance.right, Number(resonance.input.value));
setSliderText(envAmt.right, Number(envAmt.input.value));
setSliderText(volume.right, Number(volume.input.value));
setSliderText(attack.right, Number(attack.input.value));
setSliderText(decay.right, Number(decay.input.value));
setSliderText(sustain.right, Number(sustain.input.value));
setSliderText(release.right, Number(release.input.value));

setSliderText(oscMix.right, Number(oscMix.input.value));
setSliderText(detune.right, Number(detune.input.value));
setSliderText(osc2Semi.right, Number(osc2Semi.input.value));
setSliderText(noise.right, Number(noise.input.value));
setSliderText(glide.right, Number(glide.input.value));
setSliderText(keytrack.right, Number(keytrack.input.value));
setSliderText(fAtk.right, Number(fAtk.input.value));
setSliderText(fDec.right, Number(fDec.input.value));
setSliderText(fSus.right, Number(fSus.input.value));
setSliderText(fRel.right, Number(fRel.input.value));

setOctave(0);

