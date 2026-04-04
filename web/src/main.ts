import { AudioEngine } from "./audio/engine";
import { ThumbKeyboard, type KeyEvent } from "./ui/keyboard";
import { TypingKeyboard } from "./ui/typing_keyboard";

import { el } from "./ui/controls";
import { SynthUi } from "./ui/synth";
import { TransportUi } from "./ui/transport";
import { ArpUi } from "./ui/arp";
import { MixerUi } from "./ui/mixer";
import { FxUi } from "./ui/fx";
import { TrackUi } from "./ui/track";
import { SequencerUi } from "./ui/sequencer";
import { XyPadUi } from "./ui/xy_pad";

function isProbablyPhone(): boolean {
  const ud = (navigator as any).userAgentData as undefined | { mobile?: boolean };
  if (ud && typeof ud.mobile === "boolean") return ud.mobile;
  return /iPhone|iPod|Android.*Mobile|Windows Phone/i.test(navigator.userAgent);
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app");

const engine = new AudioEngine();
const isPhone = isProbablyPhone();

let activeTrackId = 0;

const top = el("div", "top");
const title = el("div", "title");
const h1 = el("h1");
h1.textContent = "Thumb Synth";
const hint = el("div", "hint");
hint.textContent = isPhone
  ? "Tap Start, then play the keyboard with your thumbs."
  : "Click Start, then play: A W S E D F T G Y H U J K (Z/X octave).";

const version = el("div", "version");
version.textContent = `Build: ${__COMMIT_LOG__}`;
version.style.fontSize = "10px";
version.style.color = "var(--muted)";
version.style.marginTop = "4px";
version.style.textAlign = "right";

const hintContainer = el("div");
hintContainer.append(hint, version);

title.append(h1, hintContainer);
top.append(title);

const controls = el("div", "main-controls");
const btnbar = el("div", "btnbar");

const startBtn = el("button", "btn primary");
startBtn.textContent = "Start Audio";

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

const perfWidget = el("div", "perf-widget");
perfWidget.textContent = "Load: --%";
engine.onStats = (loadPct, wasmPct, jsPct) => {
  const load = Math.round(loadPct * 100);
  const wasm = Math.round(wasmPct * 100);
  const js = Math.round(jsPct * 100);
  perfWidget.textContent = `Load: ${load}% (W:${wasm}% J:${js}%)`;
  perfWidget.classList.toggle("danger", load > 80);
};

btnbar.append(startBtn, octaveWrap, perfWidget);
controls.append(btnbar);

const transportUi = new TransportUi(engine);
const arpUi = new ArpUi(engine);
const mixerUi = new MixerUi(engine);
const fxUi = new FxUi(engine);
const trackUi = new TrackUi(engine);
const seqUi = new SequencerUi(engine);
const xyPadUi = new XyPadUi(engine);

trackUi.onTrackChange = (id) => {
    activeTrackId = id;
    seqUi.setTrackId(id);
    xyPadUi.setTrackId(id);
};

const grid = el("div", "controls");
grid.append(
  ...synthUi.modules,
  arpUi.wrap,
  mixerUi.wrap,
  fxUi.wrap
);

controls.append(btnbar, grid);
top.append(controls);

const bottomPanel = el("div", "bottom-panel");
const bottomControlsRow = el("div", "bottom-controls-row");

const inputModule = el("div", "module");
const inputHeader = el("div", "module-header");
inputHeader.textContent = "Input View";
const inputSelector = el("div", "module-body");
inputSelector.style.display = "flex";
inputSelector.style.flexDirection = "column";

const kbdBtn = el("button", "btn");
kbdBtn.textContent = "Keyboard";
const seqBtn = el("button", "btn");
seqBtn.textContent = "Sequencer";
const xyBtn = el("button", "btn");
xyBtn.textContent = "XY Pad";

inputSelector.append(kbdBtn, seqBtn, xyBtn);
inputModule.append(inputHeader, inputSelector);

bottomControlsRow.append(trackUi.wrap, transportUi.wrap, inputModule);

const inputArea = el("div", "input-area");

const keyboardWrap = el("div", "keyboardWrap");
const canvas = document.createElement("canvas");
canvas.id = "keyboard";
keyboardWrap.append(canvas);

inputArea.append(keyboardWrap, seqUi.wrap, xyPadUi.wrap);

const updateInputView = (view: "kbd" | "seq" | "xy") => {
    kbdBtn.style.backgroundColor = view === "kbd" ? "rgba(242, 193, 78, 0.4)" : "";
    seqBtn.style.backgroundColor = view === "seq" ? "rgba(242, 193, 78, 0.4)" : "";
    xyBtn.style.backgroundColor = view === "xy" ? "rgba(242, 193, 78, 0.4)" : "";

    keyboardWrap.style.display = view === "kbd" ? "block" : "none";
    seqUi.wrap.style.display = view === "seq" ? "flex" : "none";
    xyPadUi.wrap.style.display = view === "xy" ? "flex" : "none";
};

kbdBtn.addEventListener("click", () => updateInputView("kbd"));
seqBtn.addEventListener("click", () => updateInputView("seq"));
xyBtn.addEventListener("click", () => updateInputView("xy"));
updateInputView("kbd");

bottomPanel.append(bottomControlsRow, inputArea);

const spacer = el("div", "spacer");
app.replaceChildren(top, spacer, bottomPanel);
top.addEventListener("scroll", () => synthUi.updateAllPaths());

let audioReady = false;

function setOctave(n: number) {
  octaveShift = Math.max(-2, Math.min(2, n | 0));
  octLabel.textContent = String(octaveShift);
  keyboard.setOctaveShift(octaveShift);
  typing?.syncBaseNote();
}

octDown.addEventListener("click", () => setOctave(octaveShift - 1));
octUp.addEventListener("click", () => setOctave(octaveShift + 1));

const keyboard = new ThumbKeyboard(canvas, (ev: KeyEvent) => {
  if (ev.type === "down") {
    engine.noteOn(ev.note, ev.velocity, activeTrackId);
  } else if (ev.type === "up") {
    engine.noteOff(ev.note, activeTrackId);
  } else if (ev.type === "move") {
    engine.noteOff(ev.from, activeTrackId);
    engine.noteOn(ev.to, ev.velocity, activeTrackId);
  }
});

let typing: TypingKeyboard | null = null;
if (!isPhone) {
  typing = new TypingKeyboard({
    enabled: () => audioReady,
    getBaseNote: () => 60 + octaveShift * 12,
    noteOn: (note, velocity) => {
      keyboard.setExternalActive(note, true);
      engine.noteOn(note, velocity, activeTrackId);
    },
    noteOff: (note) => {
      keyboard.setExternalActive(note, false);
      engine.noteOff(note, activeTrackId);
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
  : "Browsers require a click before audio can start. After starting, use the keys (A...K) or the on-screen keyboard.";
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
