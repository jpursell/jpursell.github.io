use crate::track::{Track, Instrument};
use crate::params::*;
use crate::dsp::osc::Waveform;
use crate::dsp::lfo::LfoShape;
use crate::drums::DrumId;
use crate::voice::{ModSource, ModDest, ModRouting};
use crate::fx::softclip;
use crate::scale::{Scale, ScaleType};
use crate::mixer::Mixer;

pub struct Synth {
    sr: f32,
    pub tracks: Vec<Track>,
    pub scale: Scale,
    pub mixer: Mixer,

    pub tempo_bpm: f32,
    pub step_idx: usize,
    pub samples_until_step: f32,
    pub step_rem_acc: f32,

    pub is_recording: bool,

    tmp_track: [f32; 128],
}

impl Synth {
    pub fn new(sr: f32) -> Self {
        let sr = sr.max(8_000.0);
        let mut tracks = Vec::new();
        tracks.push(Track::new_synth(sr));
        tracks.push(Track::new_drums(sr));

        Self {
            sr,
            tracks,
            scale: Scale::new(),
            mixer: Mixer::new(sr),

            tempo_bpm: 120.0,
            step_idx: 0,
            samples_until_step: 0.0,
            step_rem_acc: 0.0,

            is_recording: false,

            tmp_track: [0.0; 128],
        }
    }

    pub fn note_on(&mut self, track_id: u32, note: u8, velocity: f32) {
        if let Some(t) = self.tracks.get_mut(track_id as usize) {
            t.note_on(note, velocity);
        }
    }

    pub fn note_on_scale(&mut self, track_id: u32, scale_index: i32, velocity: f32) {
        let note = self.scale.get_note(scale_index);
        
        if self.is_recording {
            if let Some(t) = self.tracks.get_mut(track_id as usize) {
                let seq_idx = self.step_idx % t.sequencer.num_steps as usize;
                let s = &mut t.sequencer.steps[seq_idx];
                s.active = true;
                s.scale_index = scale_index;
                s.velocity = velocity;
            }
        }

        if let Some(t) = self.tracks.get_mut(track_id as usize) {
            t.note_on(note, velocity);
            t.sequencer.current_note = Some(note);
        }
    }

    pub fn note_off_scale(&mut self, track_id: u32, scale_index: i32) {
        let note = self.scale.get_note(scale_index);
        if let Some(t) = self.tracks.get_mut(track_id as usize) {
            t.note_off(note);
        }
    }

    pub fn note_off(&mut self, track_id: u32, note: u8) {
        if let Some(t) = self.tracks.get_mut(track_id as usize) {
            t.note_off(note);
        }
    }

    pub fn add_mod_routing(&mut self, track_id: u32, source: u32, dest: u32, amount: f32) {
        if let Some(t) = self.tracks.get_mut(track_id as usize) {
            if let Instrument::Synth(v) = &mut t.instrument {
                if let (Ok(s), Ok(d)) = (ModSource::try_from(source), ModDest::try_from(dest)) {
                    for route in v.mod_matrix.iter_mut().flatten() {
                        if route.source == s && route.dest == d {
                            route.amount = amount;
                            return;
                        }
                    }
                    for m in v.mod_matrix.iter_mut() {
                        if m.is_none() {
                            *m = Some(ModRouting { source: s, dest: d, amount });
                            break;
                        }
                    }
                }
            }
        }
    }

    pub fn remove_mod_routing(&mut self, track_id: u32, source: u32, dest: u32) {
        if let Some(t) = self.tracks.get_mut(track_id as usize) {
            if let Instrument::Synth(v) = &mut t.instrument {
                if let (Ok(s), Ok(d)) = (ModSource::try_from(source), ModDest::try_from(dest)) {
                    for m in v.mod_matrix.iter_mut() {
                        if let Some(route) = m {
                            if route.source == s && route.dest == d {
                                *m = None;
                            }
                        }
                    }
                }
            }
        }
    }

    pub fn set_param(&mut self, track_id: u32, param_id: u32, value: f32) {
        if let Some(t) = self.tracks.get_mut(track_id as usize) {
            if let Instrument::Synth(v) = &mut t.instrument {
                if let Ok(param) = ParamId::try_from(param_id) {
                    match param {
                        ParamId::Waveform => v.osc1.set_waveform(Waveform::from_u32(value.round() as u32)),
                        ParamId::Cutoff => {
                            let v_val = value.clamp(0.0, 1.0);
                            let min_hz: f32 = 60.0;
                            let max_hz: f32 = 12_000.0;
                            v.cutoff_base_hz = min_hz * (max_hz / min_hz).powf(v_val);
                        }
                        ParamId::Attack => v.amp_env.attack_s = value.clamp(0.001, 2.0),
                        ParamId::Release => v.amp_env.release_s = value.clamp(0.005, 3.0),
                        ParamId::Volume => t.volume = value.clamp(0.0, 1.0),
                        ParamId::Resonance => v.filter.set_resonance(value.clamp(0.0, 1.0)),
                        ParamId::Decay => v.amp_env.decay_s = value.clamp(0.005, 3.0),
                        ParamId::Sustain => v.amp_env.sustain = value.clamp(0.0, 1.0),
                        ParamId::FilterEnvAmt => v.filter_env_amt_oct = value.clamp(0.0, 1.0) * 4.0,

                        ParamId::Osc2Waveform => v.osc2.set_waveform(Waveform::from_u32(value.round() as u32)),
                        ParamId::OscMix => v.osc_mix = value.clamp(0.0, 1.0),
                        ParamId::DetuneCents => v.detune_cents = value.clamp(-100.0, 100.0),
                        ParamId::Osc2Semitones => v.osc2_semitones = value.clamp(-24.0, 24.0),
                        ParamId::Glide => v.glide_s = value.clamp(0.0, 1.0),
                        ParamId::Keytrack => v.keytrack = value.clamp(0.0, 1.0),
                        ParamId::Noise => v.noise_level = value.clamp(0.0, 1.0),

                        ParamId::FiltAttack => v.filt_env.attack_s = value.clamp(0.001, 2.0),
                        ParamId::FiltDecay => v.filt_env.decay_s = value.clamp(0.005, 3.0),
                        ParamId::FiltSustain => v.filt_env.sustain = value.clamp(0.0, 1.0),
                        ParamId::FiltRelease => v.filt_env.release_s = value.clamp(0.005, 3.0),

                        ParamId::Lfo1Rate => v.lfo1.set_rate(value),
                        ParamId::Lfo1Shape => {
                            let s = match value.round() as u32 {
                                1 => LfoShape::Square,
                                2 => LfoShape::Saw,
                                3 => LfoShape::SampleAndHold,
                                _ => LfoShape::Triangle,
                            };
                            v.lfo1.set_shape(s);
                        },
                        ParamId::Lfo2Rate => v.lfo2.set_rate(value),
                        ParamId::Lfo2Shape => {
                            let s = match value.round() as u32 {
                                1 => LfoShape::Square,
                                2 => LfoShape::Saw,
                                3 => LfoShape::SampleAndHold,
                                _ => LfoShape::Triangle,
                            };
                            v.lfo2.set_shape(s);
                        },
                        ParamId::OscFm => v.osc_fm = value.clamp(0.0, 1.0),
                        ParamId::ShaperAmt => v.shaper.amount = value.clamp(0.0, 1.0),
                        ParamId::FilterType => v.filter_type = value.clamp(0.0, 1.0),
                        ParamId::CombTime => v.comb.time_s = value.clamp(0.001, 0.05),
                        ParamId::CombFeedback => v.comb.feedback = value.clamp(0.0, 0.99),
                        ParamId::CombMix => v.comb.mix = value.clamp(0.0, 1.0),
                    }
                }
            } else if let Instrument::Drums(d) = &mut t.instrument {
                if let Ok(param) = ParamId::try_from(param_id) {
                    if let ParamId::Cutoff = param {
                        for p in &mut d.params {
                            p.decay = value.clamp(0.01, 1.0);
                        }
                    }
                }
            }
        }
    }

    pub fn set_tempo(&mut self, bpm: f32) {
        self.tempo_bpm = bpm.clamp(40.0, 240.0);
        self.step_rem_acc = 0.0;
        self.samples_until_step = 0.0;
    }

    pub fn set_recording(&mut self, enabled: bool) {
        self.is_recording = enabled;
    }

    pub fn set_scale(&mut self, root_note: u32, scale_type: u32) {
        self.scale.root_note = (root_note % 12) as u8;
        self.scale.scale_type = ScaleType::from_u32(scale_type);
    }

    pub fn set_grid_step(&mut self, track_id: u32, step: u32, active: bool, scale_index: u32, velocity: f32) {
        if let Some(t) = self.tracks.get_mut(track_id as usize) {
            if step < 64 {
                let s = &mut t.sequencer.steps[step as usize];
                s.active = active;
                s.scale_index = scale_index as i32;
                s.velocity = velocity;
            }
            if let Instrument::Drums(d) = &mut t.instrument {
                if step < 16 {
                    let drum_idx = scale_index % 4;
                    d.patterns[drum_idx as usize][step as usize] = if active { 1 } else { 0 };
                }
            }
        }
    }

    pub fn set_grid_steps(&mut self, track_id: u32, num_steps: u32) {
        if let Some(t) = self.tracks.get_mut(track_id as usize) {
            t.sequencer.num_steps = num_steps.clamp(1, 64);
        }
    }

    pub fn set_arp(&mut self, track_id: u32, enabled: bool, octaves: u32, pattern: u32) {
        if let Some(t) = self.tracks.get_mut(track_id as usize) {
            t.set_arp(enabled, octaves, pattern);
            
            // To emulate old behavior, reset transport logic if any arp is enabled
            if enabled {
                self.step_rem_acc = 0.0;
                self.samples_until_step = 0.0;
                self.step_idx = 0;
            }
        }
    }

    pub fn set_arp_step(&mut self, track_id: u32, idx: usize, value: u8) {
        if let Some(t) = self.tracks.get_mut(track_id as usize) {
            if idx < 16 {
                t.arp.steps[idx] = value;
            }
        }
    }

    pub fn set_drums_enabled(&mut self, track_id: u32, enabled: bool) {
        if let Some(t) = self.tracks.get_mut(track_id as usize) {
            t.enabled = enabled;
            if let Instrument::Drums(d) = &mut t.instrument {
                d.enabled = enabled;
                if !enabled {
                    d.clear_voices();
                } else {
                    self.step_rem_acc = 0.0;
                    self.samples_until_step = 0.0;
                    self.step_idx = 0;
                }
            }
        }
    }

    pub fn set_drum_pattern(&mut self, track_id: u32, drum_idx: u32, step_idx: u32, value: u8) {
        if let Some(t) = self.tracks.get_mut(track_id as usize) {
            if let Instrument::Drums(d) = &mut t.instrument {
                if drum_idx < 4 && step_idx < 16 {
                    d.patterns[drum_idx as usize][step_idx as usize] = value;
                }
            }
        }
    }

    pub fn set_drum_params(&mut self, track_id: u32, drum_idx: u32, level: f32, tune: f32, decay: f32) {
        if let Some(t) = self.tracks.get_mut(track_id as usize) {
            if let Instrument::Drums(d) = &mut t.instrument {
                if drum_idx < 4 {
                    let p = &mut d.params[drum_idx as usize];
                    p.level = level;
                    p.tune = tune;
                    p.decay = decay;
                }
            }
        }
    }

    pub fn set_drum_sample(&mut self, track_id: u32, drum_idx: u32, samples: Vec<f32>, sr: f32) {
        if let Some(t) = self.tracks.get_mut(track_id as usize) {
            if let Instrument::Drums(d) = &mut t.instrument {
                if let Some(id) = DrumId::from_u32(drum_idx) {
                    d.drum_src_to_out = sr / self.sr;
                    d.samples[id as usize] = Some(samples);
                }
            }
        }
    }

    pub fn set_mix(&mut self, master: f32, synth: f32, drums: f32, send_synth: f32, send_drums: f32) {
        self.mixer.master_vol = master.clamp(0.0, 1.0);
        if let Some(t) = self.tracks.get_mut(0) {
            t.volume = synth.clamp(0.0, 1.0);
            t.send_amount = send_synth.clamp(0.0, 1.0);
        }
        if let Some(t) = self.tracks.get_mut(1) {
            t.volume = drums.clamp(0.0, 1.0);
            t.send_amount = send_drums.clamp(0.0, 1.0);
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn set_fx(&mut self, drive: f32,
                   delay_enabled: bool, delay_beats: f32, delay_feedback: f32, delay_return: f32,
                   reverb_enabled: bool, reverb_decay: f32, reverb_damp: f32, reverb_return: f32) {
        self.mixer.set_fx(drive, delay_enabled, delay_beats, delay_feedback, delay_return, reverb_enabled, reverb_decay, reverb_damp, reverb_return);
    }

    fn transport_enabled(&self) -> bool {
        self.tracks.iter().any(|t| t.enabled && (t.arp.enabled || matches!(t.instrument, Instrument::Drums(_)) || t.sequencer.steps.iter().any(|s| s.active)))
    }

    fn process_transport_step(&mut self) {
        for track in self.tracks.iter_mut() {
            if !track.enabled { continue; }
            
            let mut seq_tick = false;
            let mut seq_note = None;
            let mut seq_vel = 0.0;
            
            let seq_idx = self.step_idx % track.sequencer.num_steps as usize;
            let step = &track.sequencer.steps[seq_idx];
            if step.active {
                seq_tick = true;
                seq_note = Some(self.scale.get_note(step.scale_index));
                seq_vel = step.velocity;
            }

            if seq_tick {
                if let Some(n) = track.sequencer.current_note {
                    if Some(n) != seq_note {
                        if let Instrument::Synth(v) = &mut track.instrument {
                            v.note_off(n);
                        }
                    }
                }
                if let Some(n) = seq_note {
                    if let Instrument::Synth(v) = &mut track.instrument {
                        v.note_on(n, seq_vel);
                    }
                    track.sequencer.current_note = Some(n);
                }
            } else if let Some(n) = track.sequencer.current_note {
                 if let Instrument::Synth(v) = &mut track.instrument {
                     v.note_off(n);
                 }
                 track.sequencer.current_note = None;
            }

            let arp_idx = self.step_idx & 15;
            
            // Arp tick
            if track.arp.enabled {
                if let Some(next) = track.arp.tick(arp_idx) {
                    if let Some(n) = track.arp.current_note {
                        if n != next.0 {
                            if let Instrument::Synth(v) = &mut track.instrument {
                                v.note_off(n);
                            }
                        }
                    }
                    if let Instrument::Synth(v) = &mut track.instrument {
                        v.note_on(next.0, next.1);
                    }
                    track.arp.current_note = Some(next.0);
                } else if let Some(n) = track.arp.current_note {
                    if let Instrument::Synth(v) = &mut track.instrument {
                        v.note_off(n);
                    }
                    track.arp.current_note = None;
                }
            }

            // Drum tick
            if let Instrument::Drums(d) = &mut track.instrument {
                d.tick(arp_idx);
            }
        }

        self.step_idx = self.step_idx.wrapping_add(1);
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

            self.mixer.begin_block(n);

            let pregain = 1.0 + self.mixer.drive * 12.0;
            let drive_trim = 1.0 / softclip(pregain);

            for track in self.tracks.iter_mut() {
                if !track.enabled { continue; }
                self.tmp_track[..n].fill(0.0);

                match &mut track.instrument {
                    Instrument::Synth(v) => {
                        for i in 0..n {
                            self.tmp_track[i] = v.render(self.sr, 1.0);
                        }
                        if self.mixer.drive > 0.0001 {
                            for i in 0..n {
                                self.tmp_track[i] = softclip(self.tmp_track[i] * pregain) * drive_trim;
                            }
                        }
                    }
                    Instrument::Drums(d) => {
                        d.mix_into(&mut self.tmp_track[..n]);
                    }
                }

                self.mixer.add_track(&self.tmp_track[..n], track.volume, track.send_amount, n);
            }

            self.mixer.finish_block(out, offset, n, self.sr, self.tempo_bpm);

            offset += n;
            if self.transport_enabled() {
                self.samples_until_step -= n as f32;
            }
        }
    }
}
