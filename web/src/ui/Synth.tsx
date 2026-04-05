import { h, Fragment } from "preact";
import { useSignal, useComputed, effect, signal, Signal } from "@preact/signals";
import { useRef, useEffect, useState } from "preact/hooks";
import * as P from "../audio/protocol";
import { synthParams, activeTrackId, connections, Connection } from "./state";
import { Module, Knob } from "./controls";

function Jack({ 
  type, 
  label, 
  id, 
  amountSignal,
  onJackMouseDown
}: { 
  type: "input" | "output"; 
  label: string; 
  id: number; 
  amountSignal?: Signal<number>;
  onJackMouseDown: (el: HTMLElement, type: "input" | "output", id: number) => void;
}) {
  const jackRef = useRef<HTMLDivElement>(null);
  
  return (
    <div class="jack-wrap">
      {amountSignal && (
        <Knob label="" min={0} max={1} step={0.01} value={amountSignal} />
      )}
      <div 
        ref={jackRef}
        class={`jack ${type}`} 
        data-type={type} 
        data-id={id}
        onPointerDown={(e) => {
          onJackMouseDown(jackRef.current!, type, id);
          e.preventDefault();
          e.stopPropagation();
        }}
      />
      <div class="jack-label">{label}</div>
    </div>
  );
}

export function Synth() {
  const patchSvgRef = useRef<SVGSVGElement>(null);
  const [dragInfo, setDragInfo] = useState<{ x1: number, y1: number, x2: number, y2: number, active: boolean } | null>(null);
  const activeSource = useRef<{ el: HTMLElement, id: number } | null>(null);

  // Signals for input modulation amounts
  const mixCvAmt = useSignal(0.5);
  const pitchCvAmt = useSignal(0.5);
  const cutoffCvAmt = useSignal(0.5);

  const getAmtSignal = (destId: P.ModDest) => {
    if (destId === P.ModDest.OscMix) return mixCvAmt;
    if (destId === P.ModDest.Pitch) return pitchCvAmt;
    if (destId === P.ModDest.Cutoff) return cutoffCvAmt;
    return null;
  };

  // Update connections when amount signals change
  useEffect(() => {
    return effect(() => {
      const current = connections.value;
      let changed = false;
      const next = current.map(c => {
        const amtSig = getAmtSignal(c.dest);
        if (amtSig && amtSig.value !== c.amount) {
          changed = true;
          return { ...c, amount: amtSig.value };
        }
        return c;
      });
      if (changed) {
        connections.value = next;
      }
    });
  }, []);

  const getCenter = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  const onJackMouseDown = (el: HTMLElement, type: "input" | "output", id: number) => {
    if (type === "output") {
      activeSource.current = { el, id };
      const pos = getCenter(el);
      setDragInfo({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y, active: true });
    } else {
      // Disconnect
      connections.value = connections.value.filter(c => c.dest !== id);
    }
  };

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!dragInfo?.active) return;
      setDragInfo(prev => prev ? { ...prev, x2: e.clientX, y2: e.clientY } : null);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!dragInfo?.active) return;
      
      const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
      const jack = target?.closest('.jack') as HTMLElement;

      if (jack && jack.dataset.type === "input") {
        const destId = Number(jack.dataset.id) as P.ModDest;
        const sourceId = activeSource.current!.id as P.ModSource;
        const amtSig = getAmtSignal(destId);

        connections.value = [
          ...connections.value.filter(c => c.dest !== destId),
          { source: sourceId, dest: destId, amount: amtSig?.value ?? 1.0 }
        ];
      }

      setDragInfo(null);
      activeSource.current = null;
    };

    if (dragInfo?.active) {
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    }

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [dragInfo?.active]);

  const drawCurve = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const droop = Math.min(60, Math.max(30, dx * 0.25 + dy * 0.25));
    return `M ${x1} ${y1} C ${x1} ${y1 + droop}, ${x2} ${y2 + droop}, ${x2} ${y2}`;
  };

  const [renderTick, setRenderTick] = useState(0);
  useEffect(() => {
    const handleResize = () => setRenderTick(t => t + 1);
    window.addEventListener("resize", handleResize);
    const topEl = document.querySelector('.top');
    topEl?.addEventListener('scroll', handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      topEl?.removeEventListener('scroll', handleResize);
    };
  }, []);

  return (
    <Fragment>
      <Module title="Complex Osc" className="osc">
        <button 
          class="btn" 
          onClick={() => synthParams[P.PARAM_WAVEFORM].value = synthParams[P.PARAM_WAVEFORM].value === 0 ? 1 : 0}
        >
          {synthParams[P.PARAM_WAVEFORM].value === 0 ? "Osc1: Saw" : "Osc1: Square"}
        </button>
        <button 
          class="btn" 
          onClick={() => synthParams[P.PARAM_OSC2_WAVEFORM].value = synthParams[P.PARAM_OSC2_WAVEFORM].value === 0 ? 1 : 0}
        >
          {synthParams[P.PARAM_OSC2_WAVEFORM].value === 0 ? "Osc2: Saw" : "Osc2: Square"}
        </button>
        <Knob label="Mix" min={0} max={1} step={0.001} value={synthParams[P.PARAM_OSC_MIX]} />
        <Knob label="Detune" min={-50} max={50} step={0.1} value={synthParams[P.PARAM_DETUNE_CENTS]} />
        <Knob label="Osc2 Semi" min={-24} max={24} step={1} value={synthParams[P.PARAM_OSC2_SEMITONES]} />
        <Knob label="Osc FM" min={0} max={1} step={0.001} value={synthParams[P.PARAM_OSC_FM]} />
        <Knob label="Noise" min={0} max={1} step={0.001} value={synthParams[P.PARAM_NOISE]} />
        <Knob label="Glide" min={0} max={0.75} step={0.001} value={synthParams[P.PARAM_GLIDE]} />
        <Knob label="Shaper" min={0} max={1} step={0.001} value={synthParams[P.PARAM_SHAPER_AMT]} />
        
        <Jack type="input" label="Mix CV" id={P.ModDest.OscMix} amountSignal={mixCvAmt} onJackMouseDown={onJackMouseDown} />
        <Jack type="input" label="Pitch CV" id={P.ModDest.Pitch} amountSignal={pitchCvAmt} onJackMouseDown={onJackMouseDown} />
      </Module>

      <Module title="Filter" className="filter">
        <button 
          class="btn" 
          onClick={() => synthParams[P.PARAM_FILTER_TYPE].value = synthParams[P.PARAM_FILTER_TYPE].value === 0 ? 1 : 0}
        >
          {synthParams[P.PARAM_FILTER_TYPE].value === 0 ? "Filter: Ladder" : "Filter: LPG"}
        </button>
        <Knob label="Cutoff" min={0} max={1} step={0.001} value={synthParams[P.PARAM_CUTOFF]} />
        <Knob label="Resonance" min={0} max={1} step={0.001} value={synthParams[P.PARAM_RESONANCE]} />
        <Knob label="Env Amt" min={0} max={1} step={0.001} value={synthParams[P.PARAM_FILTER_ENV_AMT]} />
        <Knob label="Keytrack" min={0} max={1} step={0.001} value={synthParams[P.PARAM_KEYTRACK]} />
        
        <Jack type="input" label="Cutoff CV" id={P.ModDest.Cutoff} amountSignal={cutoffCvAmt} onJackMouseDown={onJackMouseDown} />
      </Module>

      <Module title="Comb Delay" className="comb">
        <Knob label="Time" min={0.001} max={0.05} step={0.001} value={synthParams[P.PARAM_COMB_TIME]} />
        <Knob label="Feedback" min={0} max={0.99} step={0.001} value={synthParams[P.PARAM_COMB_FEEDBACK]} />
        <Knob label="Mix" min={0} max={1} step={0.001} value={synthParams[P.PARAM_COMB_MIX]} />
      </Module>

      <Module title="Envelopes" className="env">
        <Knob label="Amp A" min={0.001} max={2.0} step={0.001} value={synthParams[P.PARAM_ATTACK]} />
        <Knob label="Filt A" min={0.001} max={2.0} step={0.001} value={synthParams[P.PARAM_FILT_ATTACK]} />
        <Knob label="Amp D" min={0.005} max={3.0} step={0.001} value={synthParams[P.PARAM_DECAY]} />
        <Knob label="Filt D" min={0.005} max={3.0} step={0.001} value={synthParams[P.PARAM_FILT_DECAY]} />
        <Knob label="Amp S" min={0} max={1} step={0.001} value={synthParams[P.PARAM_SUSTAIN]} />
        <Knob label="Filt S" min={0} max={1} step={0.001} value={synthParams[P.PARAM_FILT_SUSTAIN]} />
        <Knob label="Amp R" min={0.005} max={3.0} step={0.001} value={synthParams[P.PARAM_RELEASE]} />
        <Knob label="Filt R" min={0.005} max={3.0} step={0.001} value={synthParams[P.PARAM_FILT_RELEASE]} />
        
        <Jack type="output" label="F.Env Out" id={P.ModSource.FiltEnv} onJackMouseDown={onJackMouseDown} />
      </Module>

      <Module title="Modulation" className="lfo">
        <Knob label="LFO1 Hz" min={0.01} max={100} step={0.01} value={synthParams[P.PARAM_LFO1_RATE]} />
        <Knob label="LFO2 Hz" min={0.01} max={100} step={0.01} value={synthParams[P.PARAM_LFO2_RATE]} />
        <Knob label="L1 Shape" min={0} max={3} step={1} value={synthParams[P.PARAM_LFO1_SHAPE]} />
        <Knob label="L2 Shape" min={0} max={3} step={1} value={synthParams[P.PARAM_LFO2_SHAPE]} />

        <Jack type="output" label="LFO1 Out" id={P.ModSource.Lfo1} onJackMouseDown={onJackMouseDown} />
        <Jack type="output" label="LFO2 Out" id={P.ModSource.Lfo2} onJackMouseDown={onJackMouseDown} />
      </Module>

      <svg id="patch-svg" ref={patchSvgRef}>
        {dragInfo?.active && (
          <path 
            class="patch-cable preview" 
            d={drawCurve(dragInfo.x1, dragInfo.y1, dragInfo.x2, dragInfo.y2)} 
          />
        )}
        {connections.value.map(conn => {
          const srcEl = document.querySelector(`.jack.output[data-id="${conn.source}"]`) as HTMLElement;
          const dstEl = document.querySelector(`.jack.input[data-id="${conn.dest}"]`) as HTMLElement;
          if (!srcEl || !dstEl) return null;
          const p1 = getCenter(srcEl);
          const p2 = getCenter(dstEl);
          return (
            <path 
              class="patch-cable" 
              d={drawCurve(p1.x, p1.y, p2.x, p2.y)} 
              key={`${conn.source}-${conn.dest}`}
            />
          );
        })}
      </svg>
    </Fragment>
  );
}
