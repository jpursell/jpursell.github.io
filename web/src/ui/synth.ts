import { AudioEngine } from "../audio/engine";
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
  PARAM_WAVEFORM,
  ModSource,
  ModDest
} from "../audio/protocol";
import { el, makeKnob, setKnobText, type Knob } from "./controls";

function makeJack(type: "input" | "output", label: string, dataId: number, hasAmount = false) {
  const wrap = el("div", "jack-wrap");
  const l = el("div", "jack-label");
  l.textContent = label;
  const j = el("div", `jack ${type}`);
  j.dataset.type = type;
  j.dataset.id = String(dataId);
  
  let amtKnob: Knob | undefined;
  if (hasAmount && type === "input") {
    amtKnob = makeKnob("", 0, 1, 0.01, 0.5);
    wrap.append(amtKnob.wrap);
  }
  
  wrap.append(j, l);
  return { wrap, jack: j, amtKnob };
}

function makeModule(title: string, className: string) {
  const mod = el("div", `module ${className}`);
  const header = el("div", "module-header");
  header.textContent = title;
  const body = el("div", "module-body");
  mod.append(header, body);
  return { mod, body };
}

export class SynthUi {
  public controlsWrap: HTMLElement;
  public advancedWrap: HTMLElement;
  
  public waveform: 0 | 1 = 0;
  public osc2Waveform: 0 | 1 = 0;

  public cutoff!: Knob;
  public resonance!: Knob;
  public envAmt!: Knob;
  public volume!: Knob;
  public attack!: Knob;
  public decay!: Knob;
  public sustain!: Knob;
  public release!: Knob;
  public oscMix!: Knob;
  public detune!: Knob;
  public osc2Semi!: Knob;
  public noise!: Knob;
  public glide!: Knob;
  public keytrack!: Knob;
  public fAtk!: Knob;
  public fDec!: Knob;
  public fSus!: Knob;
  public fRel!: Knob;

  public lfo1Rate!: Knob;
  public lfo2Rate!: Knob;
  public lfo1Shape!: Knob;
  public lfo2Shape!: Knob;

  public waveBtn: HTMLButtonElement;
  public osc2WaveBtn: HTMLButtonElement;

  private jacks: HTMLElement[] = [];
  private inputAmtKnobs: Map<number, Knob> = new Map();
  private patchSvg!: SVGSVGElement;
  private patchPreview!: SVGPathElement;
  private activeConnections: { source: number, dest: number, path: SVGPathElement }[] = [];

  constructor(private engine: AudioEngine) {
    this.controlsWrap = el("div", "controls");
    this.advancedWrap = el("div", "controls"); // we can put everything in one big grid now

    this.waveBtn = el("button", "btn");
    this.waveBtn.textContent = "Osc1: Saw";
    this.osc2WaveBtn = el("button", "btn");
    this.osc2WaveBtn.textContent = "Osc2: Saw";

    this.buildControls();
    this.wireListeners();
    this.setupPatchSystem();
  }

  private buildControls() {
    // OSCILLATORS
    const mOsc = makeModule("Complex Osc", "osc");
    this.oscMix = makeKnob("Mix", 0, 1, 0.001, 0.35);
    this.detune = makeKnob("Detune", -50, 50, 0.1, 0);
    this.osc2Semi = makeKnob("Osc2 Semi", -24, 24, 1, 0);
    this.noise = makeKnob("Noise", 0, 1, 0.001, 0);
    this.glide = makeKnob("Glide", 0, 0.75, 0.001, 0);
    
    const jMixIn = makeJack("input", "Mix CV", ModDest.OscMix, true);
    const jPitchIn = makeJack("input", "Pitch CV", ModDest.Pitch, true);
    this.jacks.push(jMixIn.jack, jPitchIn.jack);
    if (jMixIn.amtKnob) this.inputAmtKnobs.set(ModDest.OscMix, jMixIn.amtKnob);
    if (jPitchIn.amtKnob) this.inputAmtKnobs.set(ModDest.Pitch, jPitchIn.amtKnob);

    mOsc.body.append(
      this.waveBtn, this.osc2WaveBtn,
      this.oscMix.wrap, this.detune.wrap,
      this.osc2Semi.wrap, this.noise.wrap,
      this.glide.wrap,
      jMixIn.wrap, jPitchIn.wrap
    );

    // FILTER
    const mFilt = makeModule("Filter", "filter");
    this.cutoff = makeKnob("Cutoff", 0, 1, 0.001, 0.45);
    this.resonance = makeKnob("Resonance", 0, 1, 0.001, 0.2);
    this.envAmt = makeKnob("Env Amt", 0, 1, 0.001, 0.5);
    this.keytrack = makeKnob("Keytrack", 0, 1, 0.001, 0);
    
    const jCutoffIn = makeJack("input", "Cutoff CV", ModDest.Cutoff, true);
    this.jacks.push(jCutoffIn.jack);
    if (jCutoffIn.amtKnob) this.inputAmtKnobs.set(ModDest.Cutoff, jCutoffIn.amtKnob);

    mFilt.body.append(
      this.cutoff.wrap, this.resonance.wrap,
      this.envAmt.wrap, this.keytrack.wrap,
      jCutoffIn.wrap
    );

    // ENVELOPES
    const mEnv = makeModule("Envelopes", "env");
    this.attack = makeKnob("Amp A", 0.001, 2.0, 0.001, 0.01);
    this.decay = makeKnob("Amp D", 0.005, 3.0, 0.001, 0.12);
    this.sustain = makeKnob("Amp S", 0, 1, 0.001, 0.6);
    this.release = makeKnob("Amp R", 0.005, 3.0, 0.001, 0.15);
    
    this.fAtk = makeKnob("Filt A", 0.001, 2.0, 0.001, 0.005);
    this.fDec = makeKnob("Filt D", 0.005, 3.0, 0.001, 0.12);
    this.fSus = makeKnob("Filt S", 0, 1, 0.001, 0);
    this.fRel = makeKnob("Filt R", 0.005, 3.0, 0.001, 0.15);

    const jFiltEnvOut = makeJack("output", "F.Env Out", ModSource.FiltEnv);
    this.jacks.push(jFiltEnvOut.jack);

    mEnv.body.append(
      this.attack.wrap, this.fAtk.wrap,
      this.decay.wrap, this.fDec.wrap,
      this.sustain.wrap, this.fSus.wrap,
      this.release.wrap, this.fRel.wrap,
      jFiltEnvOut.wrap
    );

    // LFOs
    const mLfo = makeModule("Modulation", "lfo");
    this.lfo1Rate = makeKnob("LFO1 Hz", 0.01, 100, 0.01, 1);
    this.lfo1Shape = makeKnob("L1 Shape", 0, 3, 1, 0);
    this.lfo2Rate = makeKnob("LFO2 Hz", 0.01, 100, 0.01, 1);
    this.lfo2Shape = makeKnob("L2 Shape", 0, 3, 1, 0);

    const jLfo1Out = makeJack("output", "LFO1 Out", ModSource.Lfo1);
    const jLfo2Out = makeJack("output", "LFO2 Out", ModSource.Lfo2);
    this.jacks.push(jLfo1Out.jack, jLfo2Out.jack);

    mLfo.body.append(
      this.lfo1Rate.wrap, this.lfo2Rate.wrap,
      this.lfo1Shape.wrap, this.lfo2Shape.wrap,
      jLfo1Out.wrap, jLfo2Out.wrap
    );

    // OUTPUT MIX
    const mMix = makeModule("Output", "mix");
    this.volume = makeKnob("Master", 0, 1, 0.001, 0.55);
    mMix.body.append(this.volume.wrap);

    this.controlsWrap.append(mOsc.mod, mFilt.mod, mEnv.mod, mLfo.mod, mMix.mod);
  }

  private wireListeners() {
    this.cutoff.input.addEventListener("input", () => {
      const v = Number(this.cutoff.input.value);
      setKnobText(this.cutoff.right, v);
      this.engine.setParam(PARAM_CUTOFF, v);
    });
    this.resonance.input.addEventListener("input", () => {
      const v = Number(this.resonance.input.value);
      setKnobText(this.resonance.right, v);
      this.engine.setParam(PARAM_RESONANCE, v);
    });
    this.envAmt.input.addEventListener("input", () => {
      const v = Number(this.envAmt.input.value);
      setKnobText(this.envAmt.right, v);
      this.engine.setParam(PARAM_FILTER_ENV_AMT, v);
    });
    this.volume.input.addEventListener("input", () => {
      const v = Number(this.volume.input.value);
      setKnobText(this.volume.right, v);
      this.engine.setParam(PARAM_VOLUME, v);
    });
    this.attack.input.addEventListener("input", () => {
      const v = Number(this.attack.input.value);
      setKnobText(this.attack.right, v);
      this.engine.setParam(PARAM_ATTACK, v);
    });
    this.decay.input.addEventListener("input", () => {
      const v = Number(this.decay.input.value);
      setKnobText(this.decay.right, v);
      this.engine.setParam(PARAM_DECAY, v);
    });
    this.sustain.input.addEventListener("input", () => {
      const v = Number(this.sustain.input.value);
      setKnobText(this.sustain.right, v);
      this.engine.setParam(PARAM_SUSTAIN, v);
    });
    this.release.input.addEventListener("input", () => {
      const v = Number(this.release.input.value);
      setKnobText(this.release.right, v);
      this.engine.setParam(PARAM_RELEASE, v);
    });

    this.oscMix.input.addEventListener("input", () => {
      const v = Number(this.oscMix.input.value);
      setKnobText(this.oscMix.right, v);
      this.engine.setParam(PARAM_OSC_MIX, v);
    });
    this.detune.input.addEventListener("input", () => {
      const v = Number(this.detune.input.value);
      setKnobText(this.detune.right, v);
      this.engine.setParam(PARAM_DETUNE_CENTS, v);
    });
    this.osc2Semi.input.addEventListener("input", () => {
      const v = Number(this.osc2Semi.input.value);
      setKnobText(this.osc2Semi.right, v);
      this.engine.setParam(PARAM_OSC2_SEMITONES, v);
    });
    this.noise.input.addEventListener("input", () => {
      const v = Number(this.noise.input.value);
      setKnobText(this.noise.right, v);
      this.engine.setParam(PARAM_NOISE, v);
    });
    this.glide.input.addEventListener("input", () => {
      const v = Number(this.glide.input.value);
      setKnobText(this.glide.right, v);
      this.engine.setParam(PARAM_GLIDE, v);
    });
    this.keytrack.input.addEventListener("input", () => {
      const v = Number(this.keytrack.input.value);
      setKnobText(this.keytrack.right, v);
      this.engine.setParam(PARAM_KEYTRACK, v);
    });
    this.fAtk.input.addEventListener("input", () => {
      const v = Number(this.fAtk.input.value);
      setKnobText(this.fAtk.right, v);
      this.engine.setParam(PARAM_FILT_ATTACK, v);
    });
    this.fDec.input.addEventListener("input", () => {
      const v = Number(this.fDec.input.value);
      setKnobText(this.fDec.right, v);
      this.engine.setParam(PARAM_FILT_DECAY, v);
    });
    this.fSus.input.addEventListener("input", () => {
      const v = Number(this.fSus.input.value);
      setKnobText(this.fSus.right, v);
      this.engine.setParam(PARAM_FILT_SUSTAIN, v);
    });
    this.fRel.input.addEventListener("input", () => {
      const v = Number(this.fRel.input.value);
      setKnobText(this.fRel.right, v);
      this.engine.setParam(PARAM_FILT_RELEASE, v);
    });

    this.lfo1Rate.input.addEventListener("input", () => {
      const v = Number(this.lfo1Rate.input.value);
      setKnobText(this.lfo1Rate.right, v);
      this.engine.setParam(20, v); // PARAM_LFO1_RATE
    });
    this.lfo1Shape.input.addEventListener("input", () => {
      const v = Number(this.lfo1Shape.input.value);
      setKnobText(this.lfo1Shape.right, v);
      this.engine.setParam(21, v); // PARAM_LFO1_SHAPE
    });
    this.lfo2Rate.input.addEventListener("input", () => {
      const v = Number(this.lfo2Rate.input.value);
      setKnobText(this.lfo2Rate.right, v);
      this.engine.setParam(22, v); // PARAM_LFO2_RATE
    });
    this.lfo2Shape.input.addEventListener("input", () => {
      const v = Number(this.lfo2Shape.input.value);
      setKnobText(this.lfo2Shape.right, v);
      this.engine.setParam(23, v); // PARAM_LFO2_SHAPE
    });

    this.waveBtn.addEventListener("click", () => {
      this.waveform = this.waveform === 0 ? 1 : 0;
      this.waveBtn.textContent = this.waveform === 0 ? "Osc1: Saw" : "Osc1: Square";
      this.engine.setParam(PARAM_WAVEFORM, this.waveform);
    });

    this.osc2WaveBtn.addEventListener("click", () => {
      this.osc2Waveform = this.osc2Waveform === 0 ? 1 : 0;
      this.osc2WaveBtn.textContent = this.osc2Waveform === 0 ? "Osc2: Saw" : "Osc2: Square";
      this.engine.setParam(PARAM_OSC2_WAVEFORM, this.osc2Waveform);
    });
  }

  private setupPatchSystem() {
    this.patchSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.patchSvg.id = "patch-svg";
    document.body.append(this.patchSvg);

    this.patchPreview = document.createElementNS("http://www.w3.org/2000/svg", "path");
    this.patchPreview.classList.add("patch-cable", "preview");
    this.patchPreview.style.display = "none";
    this.patchSvg.append(this.patchPreview);

    let activeSource: HTMLElement | null = null;

    const drawCurve = (path: SVGPathElement, x1: number, y1: number, x2: number, y2: number) => {
      const dx = Math.abs(x2 - x1);
      const dy = Math.abs(y2 - y1);
      // Droop effect
      const droop = Math.min(200, Math.max(50, dx * 0.5 + dy * 0.5));
      path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${y1 + droop}, ${x2} ${y2 + droop}, ${x2} ${y2}`);
    };

    const getCenter = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };

    const updateAllPaths = () => {
      for (const conn of this.activeConnections) {
        const srcJack = this.jacks.find(j => j.dataset.type === "output" && Number(j.dataset.id) === conn.source);
        const dstJack = this.jacks.find(j => j.dataset.type === "input" && Number(j.dataset.id) === conn.dest);
        if (srcJack && dstJack) {
          const p1 = getCenter(srcJack);
          const p2 = getCenter(dstJack);
          drawCurve(conn.path, p1.x, p1.y, p2.x, p2.y);
        }
      }
    };

    window.addEventListener("resize", updateAllPaths);
    const topEl = document.querySelector('.top') as HTMLElement;
    if (topEl) {
      topEl.addEventListener("scroll", updateAllPaths);
    }

    let autoScrollRaf: number | null = null;
    let lastClientX = 0;
    let lastClientY = 0;

    const autoScrollLoop = () => {
      if (!activeSource || !topEl) return;

      const rect = topEl.getBoundingClientRect();
      const threshold = 50;
      const maxSpeed = 15;
      let dy = 0;

      if (lastClientY > rect.bottom - threshold) {
        dy = maxSpeed * (1 - Math.max(0, rect.bottom - lastClientY) / threshold);
      } else if (lastClientY < rect.top + threshold) {
        dy = -maxSpeed * (1 - Math.max(0, lastClientY - rect.top) / threshold);
      }

      if (dy !== 0) {
        topEl.scrollBy({ top: dy });
        const p1 = getCenter(activeSource);
        drawCurve(this.patchPreview, p1.x, p1.y, lastClientX, lastClientY);
      }
      
      autoScrollRaf = requestAnimationFrame(autoScrollLoop);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!activeSource) return;
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      const p1 = getCenter(activeSource);
      drawCurve(this.patchPreview, p1.x, p1.y, e.clientX, e.clientY);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!activeSource) return;
      if (autoScrollRaf) {
        cancelAnimationFrame(autoScrollRaf);
        autoScrollRaf = null;
      }
      this.patchPreview.style.display = "none";
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);

      const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
      const jack = target?.closest('.jack') as HTMLElement;

      if (jack && jack.dataset.type === "input") {
        const sourceId = Number(activeSource.dataset.id);
        const destId = Number(jack.dataset.id);

        // Remove existing connection for this dest if any
        const existingIdx = this.activeConnections.findIndex(c => c.dest === destId);
        if (existingIdx >= 0) {
          this.activeConnections[existingIdx].path.remove();
          this.activeConnections.splice(existingIdx, 1);
        }

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.classList.add("patch-cable");
        this.patchSvg.append(path);

        this.activeConnections.push({ source: sourceId, dest: destId, path });
        updateAllPaths();

        const amt = Number(this.inputAmtKnobs.get(destId)?.input.value ?? 1.0);
        this.engine.addModulation(sourceId as ModSource, destId as ModDest, amt);
      }

      activeSource = null;
    };

    // Live update when turning amount knobs
    for (const [destId, knob] of this.inputAmtKnobs) {
      knob.input.addEventListener("input", () => {
        const conn = this.activeConnections.find(c => c.dest === destId);
        if (conn) {
          const amt = Number(knob.input.value);
          this.engine.addModulation(conn.source as ModSource, conn.dest as ModDest, amt);
        }
      });
    }

    for (const j of this.jacks) {
      j.addEventListener("pointerdown", (e) => {
        if (j.dataset.type === "output") {
          activeSource = j;
          lastClientX = e.clientX;
          lastClientY = e.clientY;
          this.patchPreview.style.display = "block";
          const p1 = getCenter(activeSource);
          drawCurve(this.patchPreview, p1.x, p1.y, e.clientX, e.clientY);
          window.addEventListener("pointermove", onPointerMove);
          window.addEventListener("pointerup", onPointerUp);
          
          if (autoScrollRaf) cancelAnimationFrame(autoScrollRaf);
          autoScrollRaf = requestAnimationFrame(autoScrollLoop);
        } else if (j.dataset.type === "input") {
          // Disconnect if clicking input
          const destId = Number(j.dataset.id);
          const existingIdx = this.activeConnections.findIndex(c => c.dest === destId);
          if (existingIdx >= 0) {
            const conn = this.activeConnections[existingIdx];
            conn.path.remove();
            this.engine.removeModulation(conn.source as ModSource, conn.dest as ModDest);
            this.activeConnections.splice(existingIdx, 1);
          }
        }
        e.preventDefault();
        e.stopPropagation();
      });
    }
    
    // Update initially to clear positions just in case
    setTimeout(updateAllPaths, 100);
  }

  public initParams() {
    setKnobText(this.cutoff.right, Number(this.cutoff.input.value));
    setKnobText(this.resonance.right, Number(this.resonance.input.value));
    setKnobText(this.envAmt.right, Number(this.envAmt.input.value));
    setKnobText(this.volume.right, Number(this.volume.input.value));
    setKnobText(this.attack.right, Number(this.attack.input.value));
    setKnobText(this.decay.right, Number(this.decay.input.value));
    setKnobText(this.sustain.right, Number(this.sustain.input.value));
    setKnobText(this.release.right, Number(this.release.input.value));

    setKnobText(this.oscMix.right, Number(this.oscMix.input.value));
    setKnobText(this.detune.right, Number(this.detune.input.value));
    setKnobText(this.osc2Semi.right, Number(this.osc2Semi.input.value));
    setKnobText(this.noise.right, Number(this.noise.input.value));
    setKnobText(this.glide.right, Number(this.glide.input.value));
    setKnobText(this.keytrack.right, Number(this.keytrack.input.value));
    setKnobText(this.fAtk.right, Number(this.fAtk.input.value));
    setKnobText(this.fDec.right, Number(this.fDec.input.value));
    setKnobText(this.fSus.right, Number(this.fSus.input.value));
    setKnobText(this.fRel.right, Number(this.fRel.input.value));
    setKnobText(this.lfo1Rate.right, Number(this.lfo1Rate.input.value));
    setKnobText(this.lfo1Shape.right, Number(this.lfo1Shape.input.value));
    setKnobText(this.lfo2Rate.right, Number(this.lfo2Rate.input.value));
    setKnobText(this.lfo2Shape.right, Number(this.lfo2Shape.input.value));
  }

  public pushAll() {
    this.engine.setParam(PARAM_WAVEFORM, this.waveform);
    this.engine.setParam(PARAM_OSC2_WAVEFORM, this.osc2Waveform);
    this.engine.setParam(PARAM_CUTOFF, Number(this.cutoff.input.value));
    this.engine.setParam(PARAM_RESONANCE, Number(this.resonance.input.value));
    this.engine.setParam(PARAM_FILTER_ENV_AMT, Number(this.envAmt.input.value));
    this.engine.setParam(PARAM_VOLUME, Number(this.volume.input.value));
    this.engine.setParam(PARAM_ATTACK, Number(this.attack.input.value));
    this.engine.setParam(PARAM_DECAY, Number(this.decay.input.value));
    this.engine.setParam(PARAM_SUSTAIN, Number(this.sustain.input.value));
    this.engine.setParam(PARAM_RELEASE, Number(this.release.input.value));
    this.engine.setParam(PARAM_OSC_MIX, Number(this.oscMix.input.value));
    this.engine.setParam(PARAM_DETUNE_CENTS, Number(this.detune.input.value));
    this.engine.setParam(PARAM_OSC2_SEMITONES, Number(this.osc2Semi.input.value));
    this.engine.setParam(PARAM_NOISE, Number(this.noise.input.value));
    this.engine.setParam(PARAM_GLIDE, Number(this.glide.input.value));
    this.engine.setParam(PARAM_KEYTRACK, Number(this.keytrack.input.value));
    this.engine.setParam(PARAM_FILT_ATTACK, Number(this.fAtk.input.value));
    this.engine.setParam(PARAM_FILT_DECAY, Number(this.fDec.input.value));
    this.engine.setParam(PARAM_FILT_SUSTAIN, Number(this.fSus.input.value));
    this.engine.setParam(PARAM_FILT_RELEASE, Number(this.fRel.input.value));
    this.engine.setParam(20, Number(this.lfo1Rate.input.value)); // PARAM_LFO1_RATE
    this.engine.setParam(21, Number(this.lfo1Shape.input.value)); // PARAM_LFO1_SHAPE
    this.engine.setParam(22, Number(this.lfo2Rate.input.value)); // PARAM_LFO2_RATE
    this.engine.setParam(23, Number(this.lfo2Shape.input.value)); // PARAM_LFO2_SHAPE
  }
}
