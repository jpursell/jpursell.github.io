use crate::voice::Voice;
use crate::params::*;
use crate::dsp::osc::Waveform;

#[derive(Debug)]
pub struct Synth {
    sr: f32,
    pub volume: f32,
    pub voice: Voice,
}

impl Synth {
    pub fn new(sr: f32) -> Self {
        let sr = sr.max(8_000.0);
        Self {
            sr,
            volume: 0.5,
            voice: Voice::new(sr),
        }
    }

    pub fn note_on(&mut self, note: u8, velocity: f32) {
        self.voice.note_on(note, velocity);
    }

    pub fn note_off(&mut self, note: u8) {
        self.voice.note_off(note);
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
                ParamId::Volume => self.volume = value.clamp(0.0, 1.0),
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
            }
        }
    }

    pub fn render_into(&mut self, out: &mut [f32]) {
        for s in out.iter_mut() {
            *s = self.voice.render(self.sr, self.volume);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_is_finite_under_extremes() {
        let mut s = Synth::new(48_000.0);
        s.set_param(ParamId::Cutoff as u32, 0.35);
        s.set_param(ParamId::Resonance as u32, 1.0);
        s.set_param(ParamId::FilterEnvAmt as u32, 1.0);
        s.set_param(ParamId::OscMix as u32, 1.0);
        s.set_param(ParamId::DetuneCents as u32, 50.0);
        s.set_param(ParamId::Osc2Semitones as u32, 12.0);
        s.set_param(ParamId::Keytrack as u32, 1.0);
        s.set_param(ParamId::Noise as u32, 1.0);
        s.note_on(69, 1.0);

        let mut out = [0.0_f32; 512];
        s.render_into(&mut out);
        assert!(out.iter().all(|v| v.is_finite()));
    }
}
