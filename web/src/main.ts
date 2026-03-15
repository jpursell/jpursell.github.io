import { AudioEngine } from "./audio/engine";
import { ThumbKeyboard, type KeyEvent } from "./ui/keyboard";
import { TypingKeyboard } from "./ui/typing_keyboard";

import { el } from "./ui/controls";
import { SynthUi } from "./ui/synth";
import { TransportUi } from "./ui/transport";
import { ArpUi } from "./ui/arp";
import { DrumsUi } from "./ui/drums";
import { MixerUi } from "./ui/mixer";
import { FxUi } from "./ui/fx";

function isProbablyPhone(): boolean {
  const ud = (navigator as any).userAgentData as undefined | { mobile?: boolean };
  if (ud && typeof ud.mobile === "boolean") return ud.mobile;
  return /iPhone|iPod|Android.*Mobile|Windows Phone/i.test(navigator.userAgent);
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

const controls = el("div", "main-controls");
const btnbar = el("div", "btnbar");

const startBtn = el("button", "btn primary");
startBtn.textContent = "Start Audio";

const advBtn = el("button", "btn");
advBtn.textContent = "Advanced";

let octaveShift = 0;
const octaveWrap = el("div", "octave");
octaveWrap.textContent = "Octave:";
const octDown = el("button", "btn");
octDown.textContent = "-";
const octUp = el("button", "btn");
octUp.textContent = "+";
const octLabel = el("span");
octLabel.textContent = "0";
octaveWrap.append(octDown, octLabel, octUp);

const synthUi = new SynthUi(engine);
btnbar.append(startBtn, advBtn, octaveWrap);
controls.append(btnbar);
controls.append(synthUi.controlsWrap);

const advanced = el("div", "advanced");
advanced.hidden = true;
advanced.append(synthUi.advancedWrap);

const transportUi = new TransportUi(engine);
const arpUi = new ArpUi(engine);
const drumsUi = new DrumsUi(engine);
const mixerUi = new MixerUi(engine);
const fxUi = new FxUi(engine);

advanced.append(transportUi.wrap, arpUi.wrap, drumsUi.wrap, mixerUi.wrap, fxUi.wrap);
controls.append(advanced);
top.append(controls);

const keyboardWrap = el("div", "keyboardWrap");
const canvas = document.createElement("canvas");
canvas.id = "keyboard";
keyboardWrap.append(canvas);

app.append(top, el("div"), keyboardWrap);

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

    transportUi.pushTempo();
    arpUi.pushArp();
    drumsUi.pushDrums();
    mixerUi.pushMix();
    fxUi.pushFx();
    synthUi.pushAll();

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

synthUi.initParams();
setOctave(0);
