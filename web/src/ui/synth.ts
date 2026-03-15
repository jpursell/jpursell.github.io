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
  PARAM_WAVEFORM
} from "../audio/protocol";
import { el, makeSlider, setSliderText, type Slider } from "./controls";

export class SynthUi {
  public controlsWrap: HTMLElement;
  public advancedWrap: HTMLElement;
  
  public waveform: 0 | 1 = 0;
  public osc2Waveform: 0 | 1 = 0;

  // Sliders to keep a reference to
  public cutoff!: Slider;
  public resonance!: Slider;
  public envAmt!: Slider;
  public volume!: Slider;
  public attack!: Slider;
  public decay!: Slider;
  public sustain!: Slider;
  public release!: Slider;
  public oscMix!: Slider;
  public detune!: Slider;
  public osc2Semi!: Slider;
  public noise!: Slider;
  public glide!: Slider;
  public keytrack!: Slider;
  public fAtk!: Slider;
  public fDec!: Slider;
  public fSus!: Slider;
  public fRel!: Slider;

  public waveBtn: HTMLButtonElement;
  public osc2WaveBtn: HTMLButtonElement;

  constructor(private engine: AudioEngine) {
    this.controlsWrap = el("div");
    this.advancedWrap = el("div");

    this.waveBtn = el("button", "btn");
    this.waveBtn.textContent = "Osc1: Saw";
    this.osc2WaveBtn = el("button", "btn");
    this.osc2WaveBtn.textContent = "Osc2: Saw";

    this.buildMainControls();
    this.buildAdvancedControls();

    this.wireListeners();
  }

  private buildMainControls() {
    const row1 = el("div", "row");
    this.cutoff = makeSlider("Cutoff", 0, 1, 0.001, 0.45);
    this.resonance = makeSlider("Resonance", 0, 1, 0.001, 0.2);
    row1.append(this.cutoff.wrap, this.resonance.wrap);

    const row2 = el("div", "row");
    this.envAmt = makeSlider("Env Amt", 0, 1, 0.001, 0.5);
    this.volume = makeSlider("Volume", 0, 1, 0.001, 0.55);
    row2.append(this.envAmt.wrap, this.volume.wrap);

    const row3 = el("div", "row");
    this.attack = makeSlider("Attack (s)", 0.001, 2.0, 0.001, 0.01);
    this.decay = makeSlider("Decay (s)", 0.005, 3.0, 0.001, 0.12);
    row3.append(this.attack.wrap, this.decay.wrap);

    const row4 = el("div", "row");
    this.sustain = makeSlider("Sustain", 0, 1, 0.001, 0.6);
    this.release = makeSlider("Release (s)", 0.005, 3.0, 0.001, 0.15);
    row4.append(this.sustain.wrap, this.release.wrap);

    this.controlsWrap.append(row1, row2, row3, row4);
  }

  private buildAdvancedControls() {
    const advBar = el("div", "btnbar");
    advBar.append(this.osc2WaveBtn);
    this.advancedWrap.append(advBar);

    const row5 = el("div", "row");
    this.oscMix = makeSlider("Osc Mix", 0, 1, 0.001, 0.35);
    this.detune = makeSlider("Detune (c)", -50, 50, 0.1, 0);
    row5.append(this.oscMix.wrap, this.detune.wrap);

    const row6 = el("div", "row");
    this.osc2Semi = makeSlider("Osc2 Semi", -24, 24, 1, 0);
    this.noise = makeSlider("Noise", 0, 1, 0.001, 0);
    row6.append(this.osc2Semi.wrap, this.noise.wrap);

    const row7 = el("div", "row");
    this.glide = makeSlider("Glide (s)", 0, 0.75, 0.001, 0);
    this.keytrack = makeSlider("Keytrack", 0, 1, 0.001, 0);
    row7.append(this.glide.wrap, this.keytrack.wrap);

    const row8 = el("div", "row");
    this.fAtk = makeSlider("F.Attack (s)", 0.001, 2.0, 0.001, 0.005);
    this.fDec = makeSlider("F.Decay (s)", 0.005, 3.0, 0.001, 0.12);
    row8.append(this.fAtk.wrap, this.fDec.wrap);

    const row9 = el("div", "row");
    this.fSus = makeSlider("F.Sustain", 0, 1, 0.001, 0);
    this.fRel = makeSlider("F.Release (s)", 0.005, 3.0, 0.001, 0.15);
    row9.append(this.fSus.wrap, this.fRel.wrap);

    this.advancedWrap.append(row5, row6, row7, row8, row9);
  }

  private wireListeners() {
    this.cutoff.input.addEventListener("input", () => {
      const v = Number(this.cutoff.input.value);
      setSliderText(this.cutoff.right, v);
      this.engine.setParam(PARAM_CUTOFF, v);
    });
    this.resonance.input.addEventListener("input", () => {
      const v = Number(this.resonance.input.value);
      setSliderText(this.resonance.right, v);
      this.engine.setParam(PARAM_RESONANCE, v);
    });
    this.envAmt.input.addEventListener("input", () => {
      const v = Number(this.envAmt.input.value);
      setSliderText(this.envAmt.right, v);
      this.engine.setParam(PARAM_FILTER_ENV_AMT, v);
    });
    this.volume.input.addEventListener("input", () => {
      const v = Number(this.volume.input.value);
      setSliderText(this.volume.right, v);
      this.engine.setParam(PARAM_VOLUME, v);
    });
    this.attack.input.addEventListener("input", () => {
      const v = Number(this.attack.input.value);
      setSliderText(this.attack.right, v);
      this.engine.setParam(PARAM_ATTACK, v);
    });
    this.decay.input.addEventListener("input", () => {
      const v = Number(this.decay.input.value);
      setSliderText(this.decay.right, v);
      this.engine.setParam(PARAM_DECAY, v);
    });
    this.sustain.input.addEventListener("input", () => {
      const v = Number(this.sustain.input.value);
      setSliderText(this.sustain.right, v);
      this.engine.setParam(PARAM_SUSTAIN, v);
    });
    this.release.input.addEventListener("input", () => {
      const v = Number(this.release.input.value);
      setSliderText(this.release.right, v);
      this.engine.setParam(PARAM_RELEASE, v);
    });

    this.oscMix.input.addEventListener("input", () => {
      const v = Number(this.oscMix.input.value);
      setSliderText(this.oscMix.right, v);
      this.engine.setParam(PARAM_OSC_MIX, v);
    });
    this.detune.input.addEventListener("input", () => {
      const v = Number(this.detune.input.value);
      setSliderText(this.detune.right, v);
      this.engine.setParam(PARAM_DETUNE_CENTS, v);
    });
    this.osc2Semi.input.addEventListener("input", () => {
      const v = Number(this.osc2Semi.input.value);
      setSliderText(this.osc2Semi.right, v);
      this.engine.setParam(PARAM_OSC2_SEMITONES, v);
    });
    this.noise.input.addEventListener("input", () => {
      const v = Number(this.noise.input.value);
      setSliderText(this.noise.right, v);
      this.engine.setParam(PARAM_NOISE, v);
    });
    this.glide.input.addEventListener("input", () => {
      const v = Number(this.glide.input.value);
      setSliderText(this.glide.right, v);
      this.engine.setParam(PARAM_GLIDE, v);
    });
    this.keytrack.input.addEventListener("input", () => {
      const v = Number(this.keytrack.input.value);
      setSliderText(this.keytrack.right, v);
      this.engine.setParam(PARAM_KEYTRACK, v);
    });
    this.fAtk.input.addEventListener("input", () => {
      const v = Number(this.fAtk.input.value);
      setSliderText(this.fAtk.right, v);
      this.engine.setParam(PARAM_FILT_ATTACK, v);
    });
    this.fDec.input.addEventListener("input", () => {
      const v = Number(this.fDec.input.value);
      setSliderText(this.fDec.right, v);
      this.engine.setParam(PARAM_FILT_DECAY, v);
    });
    this.fSus.input.addEventListener("input", () => {
      const v = Number(this.fSus.input.value);
      setSliderText(this.fSus.right, v);
      this.engine.setParam(PARAM_FILT_SUSTAIN, v);
    });
    this.fRel.input.addEventListener("input", () => {
      const v = Number(this.fRel.input.value);
      setSliderText(this.fRel.right, v);
      this.engine.setParam(PARAM_FILT_RELEASE, v);
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

  public initParams() {
    setSliderText(this.cutoff.right, Number(this.cutoff.input.value));
    setSliderText(this.resonance.right, Number(this.resonance.input.value));
    setSliderText(this.envAmt.right, Number(this.envAmt.input.value));
    setSliderText(this.volume.right, Number(this.volume.input.value));
    setSliderText(this.attack.right, Number(this.attack.input.value));
    setSliderText(this.decay.right, Number(this.decay.input.value));
    setSliderText(this.sustain.right, Number(this.sustain.input.value));
    setSliderText(this.release.right, Number(this.release.input.value));

    setSliderText(this.oscMix.right, Number(this.oscMix.input.value));
    setSliderText(this.detune.right, Number(this.detune.input.value));
    setSliderText(this.osc2Semi.right, Number(this.osc2Semi.input.value));
    setSliderText(this.noise.right, Number(this.noise.input.value));
    setSliderText(this.glide.right, Number(this.glide.input.value));
    setSliderText(this.keytrack.right, Number(this.keytrack.input.value));
    setSliderText(this.fAtk.right, Number(this.fAtk.input.value));
    setSliderText(this.fDec.right, Number(this.fDec.input.value));
    setSliderText(this.fSus.right, Number(this.fSus.input.value));
    setSliderText(this.fRel.right, Number(this.fRel.input.value));
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
  }
}
