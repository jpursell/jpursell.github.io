import { h, Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useSignal, useComputed, effect } from "@preact/signals";
import { AudioEngine } from "./audio/engine";
import { 
  activeTrackId, 
  audioReady, 
  octaveShift, 
  inputView,
  setupAudioSync,
  synthParams,
  mixerState,
  fxState,
  arpState,
  bpm,
  transportState,
  scaleState
} from "./ui/state";

import { Synth } from "./ui/Synth";
import { Arp } from "./ui/Arp";
import { Mixer } from "./ui/Mixer";
import { Fx } from "./ui/Fx";
import { Track } from "./ui/Track";
import { Transport } from "./ui/Transport";
import { Keyboard } from "./ui/Keyboard";
import { Sequencer } from "./ui/Sequencer";
import { XyPad } from "./ui/XyPad";

declare const __COMMIT_LOG__: string;

function isProbablyPhone(): boolean {
  const ud = (navigator as any).userAgentData as undefined | { mobile?: boolean };
  if (ud && typeof ud.mobile === "boolean") return ud.mobile;
  return /iPhone|iPod|Android.*Mobile|Windows Phone/i.test(navigator.userAgent);
}

interface Props {
  engine: AudioEngine;
}

export function App({ engine }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isPhone] = useState(isProbablyPhone());
  const perfWidgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setupAudioSync(engine);
    
    engine.onStats = (loadPct, wasmPct, jsPct) => {
      if (perfWidgetRef.current) {
        const load = Math.round(loadPct * 100);
        const wasm = Math.round(wasmPct * 100);
        const js = Math.round(jsPct * 100);
        perfWidgetRef.current.textContent = `Load: ${load}% (W:${wasm}% J:${js}%)`;
        perfWidgetRef.current.classList.toggle("danger", load > 80);
      }
    };
  }, [engine]);

  const startAudio = async () => {
    setError(null);
    try {
      await engine.start();
      audioReady.value = true;

      // One-shot ping to confirm audio is alive.
      engine.noteOn(69, 0.85);
      window.setTimeout(() => engine.noteOff(69), 180);
    } catch (e) {
      const msg = e instanceof Error ? (e.stack || e.message) : String(e);
      setError(`Audio failed to start.\n${msg}\n\n` +
        "Tip: the Rust build step creates `web/public/wasm/synth.wasm`. Run `npm run dev` from `web/`.");
      audioReady.value = false;
    }
  };

  return (
    <Fragment>
      <div class="top">
        <div class="title">
          <h1>Thumb Synth</h1>
          <div>
            <div class="hint">
              {isPhone
                ? "Tap Start, then play the keyboard with your thumbs."
                : "Click Start, then play: A W S E D F T G Y H U J K (Z/X octave)."}
            </div>
            <div class="version" style={{ fontSize: "10px", color: "var(--muted)", marginTop: "4px", textAlign: "right" }}>
              Build: {__COMMIT_LOG__}
            </div>
          </div>
        </div>

        <div class="main-controls">
          <div class="btnbar">
            <button 
              class="btn primary" 
              onClick={startAudio} 
              disabled={audioReady.value}
            >
              Start Audio
            </button>
            <div class="octave">
              Octave:
              <button class="btn" onClick={() => octaveShift.value = Math.max(-2, octaveShift.value - 1)}>-</button>
              <span>{octaveShift.value}</span>
              <button class="btn" onClick={() => octaveShift.value = Math.min(2, octaveShift.value + 1)}>+</button>
            </div>
            <div ref={perfWidgetRef} class="perf-widget">Load: --%</div>
          </div>

          <div class="controls">
            <Synth />
            <Arp />
            <Mixer />
            <Fx />
          </div>
        </div>
      </div>

      <div class="spacer" />

      <div class="bottom-panel">
        <div class="bottom-controls-row">
          <Track />
          <Transport />
          
          <div class="module">
            <div class="module-header">Input View</div>
            <div class="module-body" style={{ display: "flex", flexDirection: "column" }}>
              <button 
                class="btn" 
                style={{ backgroundColor: inputView.value === "kbd" ? "rgba(242, 193, 78, 0.4)" : "" }}
                onClick={() => inputView.value = "kbd"}
              >
                Keyboard
              </button>
              <button 
                class="btn" 
                style={{ backgroundColor: inputView.value === "seq" ? "rgba(242, 193, 78, 0.4)" : "" }}
                onClick={() => inputView.value = "seq"}
              >
                Sequencer
              </button>
              <button 
                class="btn" 
                style={{ backgroundColor: inputView.value === "xy" ? "rgba(242, 193, 78, 0.4)" : "" }}
                onClick={() => inputView.value = "xy"}
              >
                XY Pad
              </button>
            </div>
          </div>
        </div>

        <div class="input-area">
          <div style={{ display: inputView.value === "kbd" ? "block" : "none", flex: 1, minHeight: 0 }}>
            <Keyboard engine={engine} />
          </div>
          <div style={{ display: inputView.value === "seq" ? "flex" : "none", width: "100%", flex: 1, minHeight: 0 }}>
            <Sequencer engine={engine} />
          </div>
          <div style={{ display: inputView.value === "xy" ? "flex" : "none", width: "100%", flex: 1, minHeight: 0 }}>
            <XyPad engine={engine} />
          </div>
        </div>
      </div>

      {!audioReady.value && (
        <div class="overlay">
          <div class="card">
            <h2>Start Audio</h2>
            <p>
              {isPhone
                ? "Mobile browsers require a tap before audio can start. After starting, play the keyboard. Slide for gliss."
                : "Browsers require a click before audio can start. After starting, use the keys (A...K) or the on-screen keyboard."}
            </p>
            <button class="btn primary" onClick={startAudio}>
              {isPhone ? "Tap to Start" : "Click to Start"}
            </button>
            {error && <div class="err" style={{ whiteSpace: "pre-wrap" }}>{error}</div>}
          </div>
        </div>
      )}
    </Fragment>
  );
}
