use crate::voice::{Voice, ModSource, ModDest, ModRouting};
use crate::params::*;
use crate::dsp::osc::Waveform;
use crate::dsp::lfo::LfoShape;
use crate::arp::{ArpState, ArpPattern};
use crate::drums::{DrumMachine, DrumId};
use crate::fx::{TempoDelay, SchroederReverb, softclip};

pub struct Synth {
    sr: f32,
    pub voice: Voice,

    pub arp: ArpState,
    pub drums: DrumMachine,
    pub delay: TempoDelay,
    pub reverb: SchroederReverb,

    pub tempo_bpm: f32,
    pub step_idx: usize,
    pub samples_until_step: f32,
    pub step_rem_acc: f32,

    pub master_vol: f32,
    pub synth_vol: f32,
    pub drums_vol: f32,
    pub send_synth: f32,
    pub send_drums: f32,

    pub drive: f32,
    pub delay_enabled: bool,
    pub delay_beats: f32,
    pub delay_feedback: f32,
    pub delay_return: f32,
    pub reverb_enabled: bool,
    pub reverb_decay: f32,
    pub reverb_damp: f32,
    pub reverb_return: f32,

    tmp_synth: [f32; 128],
    tmp_drums: [f32; 128],
    tmp_send: [f32; 128],
    tmp_delay_out: [f32; 128],
    tmp_reverb_out: [f32; 128],
}

impl Synth {
    pub fn new(sr: f32) -> Self {
        let sr = sr.max(8_000.0);
        Self {
            sr,
            voice: Voice::new(sr),
            arp: ArpState::new(),
            drums: DrumMachine::new(sr),
            delay: TempoDelay::new(sr, 3.6),
            reverb: SchroederReverb::new(sr),

            tempo_bpm: 120.0,
            step_idx: 0,
            samples_until_step: 0.0,
            step_rem_acc: 0.0,

            master_vol: 0.9,
            synth_vol: 1.0,
            drums_vol: 1.0,
            send_synth: 0.25,
            send_drums: 0.1,

            drive: 0.2,
            delay_enabled: true,
            delay_beats: 0.5,
            delay_feedback: 0.35,
            delay_return: 0.25,
            reverb_enabled: true,
            reverb_decay: 0.45,
            reverb_damp: 0.4,
            reverb_return: 0.18,

            tmp_synth: [0.0; 128],
            tmp_drums: [0.0; 128],
            tmp_send: [0.0; 128],
            tmp_delay_out: [0.0; 128],
            tmp_reverb_out: [0.0; 128],
        }
    }

    pub fn note_on(&mut self, note: u8, velocity: f32) {
        self.arp.note_on(note, velocity);
        if !self.arp.enabled {
            self.voice.note_on(note, velocity);
        }
    }

    pub fn note_off(&mut self, note: u8) {
        self.arp.note_off(note);
        if !self.arp.enabled {
            self.voice.note_off(note);
        }
    }

    pub fn add_mod_routing(&mut self, source: u32, dest: u32, amount: f32) {
        if let (Ok(s), Ok(d)) = (ModSource::try_from(source), ModDest::try_from(dest)) {
            for m in self.voice.mod_matrix.iter_mut() {
                if let Some(route) = m {
                    if route.source == s && route.dest == d {
                        route.amount = amount;
                        return;
                    }
                }
            }
            for m in self.voice.mod_matrix.iter_mut() {
                if m.is_none() {
                    *m = Some(ModRouting { source: s, dest: d, amount });
                    break;
                }
            }
        }
    }

    pub fn remove_mod_routing(&mut self, source: u32, dest: u32) {
        if let (Ok(s), Ok(d)) = (ModSource::try_from(source), ModDest::try_from(dest)) {
            for m in self.voice.mod_matrix.iter_mut() {
                if let Some(route) = m {
                    if route.source == s && route.dest == d {
                        *m = None;
                    }
                }
            }
        }
    }

    pub fn set_param(&mut self, param_id: u32, value: f32) {
        if let Ok(param) = ParamId::try_from(param_id) {
            match param {
                ParamId::Waveform => self.voice.osc1.set_waveform(Waveform::from_u32(value.round() as u32)),
                ParamId::Cutoff => {
                    let v = value.clamp(0.0, 1.0);
                    let min_hz: f32 = 60.0;
                    let max_hz: f32 = 12_000.0;
                    self.voice.cutoff_base_hz = min_hz * (max_hz / min_hz).powf(v);
                }
                ParamId::Attack => self.voice.amp_env.attack_s = value.clamp(0.001, 2.0),
                ParamId::Release => self.voice.amp_env.release_s = value.clamp(0.005, 3.0),
                ParamId::Volume => self.synth_vol = value.clamp(0.0, 1.0),
                ParamId::Resonance => self.voice.filter.set_resonance(value.clamp(0.0, 1.0)),
                ParamId::Decay => self.voice.amp_env.decay_s = value.clamp(0.005, 3.0),
                ParamId::Sustain => self.voice.amp_env.sustain = value.clamp(0.0, 1.0),
                ParamId::FilterEnvAmt => self.voice.filter_env_amt_oct = value.clamp(0.0, 1.0) * 4.0,

                ParamId::Osc2Waveform => self.voice.osc2.set_waveform(Waveform::from_u32(value.round() as u32)),
                ParamId::OscMix => self.voice.osc_mix = value.clamp(0.0, 1.0),
                ParamId::DetuneCents => self.voice.detune_cents = value.clamp(-100.0, 100.0),
                ParamId::Osc2Semitones => self.voice.osc2_semitones = value.clamp(-24.0, 24.0),
                ParamId::Glide => self.voice.glide_s = value.clamp(0.0, 1.0),
                ParamId::Keytrack => self.voice.keytrack = value.clamp(0.0, 1.0),
                ParamId::Noise => self.voice.noise_level = value.clamp(0.0, 1.0),

                ParamId::FiltAttack => self.voice.filt_env.attack_s = value.clamp(0.001, 2.0),
                ParamId::FiltDecay => self.voice.filt_env.decay_s = value.clamp(0.005, 3.0),
                ParamId::FiltSustain => self.voice.filt_env.sustain = value.clamp(0.0, 1.0),
                ParamId::FiltRelease => self.voice.filt_env.release_s = value.clamp(0.005, 3.0),
                
                ParamId::Lfo1Rate => self.voice.lfo1.set_rate(value),
                ParamId::Lfo1Shape => {
                    let s = match value.round() as u32 {
                        1 => LfoShape::Square,
                        2 => LfoShape::Saw,
                        3 => LfoShape::SampleAndHold,
                        _ => LfoShape::Triangle,
                    };
                    self.voice.lfo1.set_shape(s);
                },
                ParamId::Lfo2Rate => self.voice.lfo2.set_rate(value),
                ParamId::Lfo2Shape => {
                    let s = match value.round() as u32 {
                        1 => LfoShape::Square,
                        2 => LfoShape::Saw,
                        3 => LfoShape::SampleAndHold,
                        _ => LfoShape::Triangle,
                    };
                    self.voice.lfo2.set_shape(s);
                },
                ParamId::OscFm => self.voice.osc_fm = value.clamp(0.0, 1.0),
                ParamId::ShaperAmt => self.voice.shaper.amount = value.clamp(0.0, 1.0),
                ParamId::FilterType => self.voice.filter_type = value.clamp(0.0, 1.0),
                ParamId::CombTime => self.voice.comb.time_s = value.clamp(0.001, 0.05), // 1ms to 50ms
                ParamId::CombFeedback => self.voice.comb.feedback = value.clamp(0.0, 0.99),
                ParamId::CombMix => self.voice.comb.mix = value.clamp(0.0, 1.0),
            }
        }
    }

    pub fn set_tempo(&mut self, bpm: f32) {
        self.tempo_bpm = bpm.clamp(40.0, 240.0);
        self.step_rem_acc = 0.0;
        self.samples_until_step = 0.0;
    }

    pub fn set_arp(&mut self, enabled: bool, octaves: u32, pattern: u32) {
        let was_enabled = self.arp.enabled;
        self.arp.enabled = enabled;
        self.arp.octaves = octaves;
        self.arp.pattern = ArpPattern::from_u32(pattern);
        
        if !was_enabled && enabled {
            if let Some(n) = self.arp.current_note {
                self.voice.note_off(n);
            }
            self.arp.reset_voice();
            self.step_rem_acc = 0.0;
            self.samples_until_step = 0.0;
            self.step_idx = 0;
        }
        if was_enabled && !enabled {
            if let Some(n) = self.arp.current_note {
                self.voice.note_off(n);
            }
            self.arp.current_note = None;
        }
    }

    pub fn set_arp_step(&mut self, idx: usize, value: u8) {
        if idx < 16 {
            self.arp.steps[idx] = value;
        }
    }

    pub fn set_drums_enabled(&mut self, enabled: bool) {
        self.drums.enabled = enabled;
        if !enabled {
            self.drums.clear_voices();
        } else {
            self.step_rem_acc = 0.0;
            self.samples_until_step = 0.0;
            self.step_idx = 0;
        }
    }

    pub fn set_drum_pattern(&mut self, drum_idx: u32, step_idx: u32, value: u8) {
        if drum_idx < 4 && step_idx < 16 {
            self.drums.patterns[drum_idx as usize][step_idx as usize] = value;
        }
    }

    pub fn set_drum_params(&mut self, drum_idx: u32, level: f32, tune: f32, decay: f32) {
        if drum_idx < 4 {
            let p = &mut self.drums.params[drum_idx as usize];
            p.level = level;
            p.tune = tune;
            p.decay = decay;
        }
    }

    pub fn set_drum_sample(&mut self, drum_idx: u32, samples: Vec<f32>, sr: f32) {
        if let Some(id) = DrumId::from_u32(drum_idx) {
            self.drums.drum_src_to_out = sr / self.sr;
            self.drums.samples[id as usize] = Some(samples);
        }
    }

    pub fn set_mix(&mut self, master: f32, synth: f32, drums: f32, send_synth: f32, send_drums: f32) {
        self.master_vol = master.clamp(0.0, 1.0);
        self.synth_vol = synth.clamp(0.0, 1.0);
        self.drums_vol = drums.clamp(0.0, 1.0);
        self.send_synth = send_synth.clamp(0.0, 1.0);
        self.send_drums = send_drums.clamp(0.0, 1.0);
    }

    pub fn set_fx(&mut self, drive: f32, 
                   delay_enabled: bool, delay_beats: f32, delay_feedback: f32, delay_return: f32,
                   reverb_enabled: bool, reverb_decay: f32, reverb_damp: f32, reverb_return: f32) {
        self.drive = drive.clamp(0.0, 1.0);
        
        let was_delay = self.delay_enabled;
        self.delay_enabled = delay_enabled;
        self.delay_beats = delay_beats.clamp(0.25, 2.0);
        self.delay_feedback = delay_feedback.clamp(0.0, 0.95);
        self.delay_return = delay_return.clamp(0.0, 1.0);
        
        if was_delay && !delay_enabled {
            self.delay.clear();
        }

        self.reverb_enabled = reverb_enabled;
        self.reverb_decay = reverb_decay.clamp(0.0, 1.0);
        self.reverb_damp = reverb_damp.clamp(0.0, 1.0);
        self.reverb_return = reverb_return.clamp(0.0, 1.0);
    }

    fn transport_enabled(&self) -> bool {
        self.arp.enabled || self.drums.enabled
    }

    fn process_transport_step(&mut self) {
        let idx = self.step_idx & 15;
        
        // Arp tick
        if self.arp.enabled {
            if let Some(next) = self.arp.tick(idx) {
                if let Some(n) = self.arp.current_note {
                    if n != next.0 {
                        self.voice.note_off(n);
                    }
                }
                self.voice.note_on(next.0, next.1);
                self.arp.current_note = Some(next.0);
            } else {
                if let Some(n) = self.arp.current_note {
                    self.voice.note_off(n);
                    self.arp.current_note = None;
                }
            }
        }

        // Drum tick
        self.drums.tick(idx);
        
        self.step_idx = (self.step_idx + 1) & 15;
    }

    pub fn render_into(&mut self, out: &mut [f32]) {
        let frames = out.len();
        let mut offset = 0;
        
        while offset < frames {
            if self.transport_enabled() {
                while self.samples_until_step <= 0.0 {
                    self.process_transport_step();
                    
                    let f = (self.sr * 60.0) / self.tempo_bpm.max(40.0) / 4.0;
                    let step_base = f.floor();
                    let step_rem = f - step_base;
                    
                    let mut n = step_base;
                    self.step_rem_acc += step_rem;
                    if self.step_rem_acc >= 1.0 {
                        n += 1.0;
                        self.step_rem_acc -= 1.0;
                    }
                    self.samples_until_step += n;
                }
            }
            
            let remaining = frames - offset;
            let mut n = 128.min(remaining);
            
            if self.transport_enabled() {
                n = n.min(self.samples_until_step.ceil() as usize).max(1);
            }
            
            // Render Synth
            for i in 0..n {
                self.tmp_synth[i] = self.voice.render(self.sr, 1.0);
            }
            
            // Render Drums
            self.tmp_drums[..n].fill(0.0);
            self.drums.mix_into(&mut self.tmp_drums[..n]);
            
            // FX
            let delay_samples = self.sr * (60.0 / self.tempo_bpm.max(1.0)) * self.delay_beats;
            
            let pregain = 1.0 + self.drive * 12.0;
            let drive_trim = 1.0 / softclip(pregain);
            
            for i in 0..n {
                let mut s = self.tmp_synth[i];
                if self.drive > 0.0001 {
                    s = softclip(s * pregain) * drive_trim;
                }
                s *= self.synth_vol;
                
                let d = self.tmp_drums[i] * self.drums_vol;
                
                self.tmp_synth[i] = s + d;
                self.tmp_send[i] = s * self.send_synth + d * self.send_drums;
            }
            
            self.delay.process_block(&self.tmp_send[..n], &mut self.tmp_delay_out[..n], self.delay_enabled, delay_samples, self.delay_feedback);
            self.reverb.process_block(&self.tmp_send[..n], &mut self.tmp_reverb_out[..n], self.reverb_enabled, self.reverb_decay, self.reverb_damp);
            
            for i in 0..n {
                let dry = self.tmp_synth[i];
                let del = self.tmp_delay_out[i] * self.delay_return;
                let rev = self.tmp_reverb_out[i] * self.reverb_return;
                
                let mut y = (dry + del + rev) * self.master_vol;
                y = softclip(y);
                out[offset + i] = y;
            }
            
            offset += n;
            if self.transport_enabled() {
                self.samples_until_step -= n as f32;
            }
        }
    }
}
