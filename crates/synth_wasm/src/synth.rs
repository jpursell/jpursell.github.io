use crate::dsp::{env::Envelope, ladder::LadderLp, osc::{Oscillator, Waveform}};

#[derive(Debug)]
pub struct Synth {
    sr: f32,

    note: i32,
    current_freq: f32,
    target_freq: f32,
    glide_s: f32,

    osc1: Oscillator,
    osc2: Oscillator,
    osc_mix: f32,
    osc2_semitones: f32,
    detune_cents: f32,

    noise_level: f32,
    rng: u32,

    amp_env: Envelope,
    filt_env: Envelope,

    filter: LadderLp,
    cutoff_base_hz: f32,
    resonance: f32,
    keytrack: f32,
    filter_env_amt_oct: f32,

    velocity: f32,
    volume: f32,
}

impl Synth {
    pub fn new(sr: f32) -> Self {
        let sr = sr.max(8_000.0);
        let mut filter = LadderLp::new(sr);
        filter.set_resonance(0.2);

        Self {
            sr,
            note: 69,
            current_freq: 440.0,
            target_freq: 440.0,
            glide_s: 0.0,

            osc1: Oscillator::new(),
            osc2: Oscillator::new(),
            osc_mix: 0.35,
            osc2_semitones: 0.0,
            detune_cents: 0.0,

            noise_level: 0.0,
            rng: 0x1234_5678,

            amp_env: Envelope::new(),
            filt_env: Envelope::new(),

            filter,
            cutoff_base_hz: 2_000.0,
            resonance: 0.2,
            keytrack: 0.0,
            filter_env_amt_oct: 2.0,

            velocity: 0.8,
            volume: 0.5,
        }
    }

    pub fn note_on(&mut self, note: u8, velocity: f32) {
        self.note = note as i32;
        self.target_freq = midi_note_to_hz(note);
        if self.glide_s <= 0.000_5 {
            self.current_freq = self.target_freq;
        }

        self.velocity = velocity.clamp(0.0, 1.0);
        self.amp_env.note_on();
        self.filt_env.note_on();
    }

    pub fn note_off(&mut self, _note: u8) {
        self.amp_env.note_off();
        self.filt_env.note_off();
    }

    pub fn set_param(&mut self, param_id: u32, value: f32) {
        match param_id {
            // Existing
            0 => self.osc1.set_waveform(Waveform::from_u32(value.round() as u32)),
            1 => {
                // Cutoff: expect [0..1] from UI, map to ~[60..12k] log-ish
                let v = value.clamp(0.0, 1.0);
                let min_hz: f32 = 60.0;
                let max_hz: f32 = 12_000.0;
                let hz = min_hz * (max_hz / min_hz).powf(v);
                self.cutoff_base_hz = hz;
            }
            2 => self.amp_env.attack_s = value.clamp(0.001, 2.0),
            3 => self.amp_env.release_s = value.clamp(0.005, 3.0),
            4 => self.volume = value.clamp(0.0, 1.0),
            5 => {
                self.resonance = value.clamp(0.0, 1.0);
                self.filter.set_resonance(self.resonance);
            }
            6 => self.amp_env.decay_s = value.clamp(0.005, 3.0),
            7 => self.amp_env.sustain = value.clamp(0.0, 1.0),
            8 => self.filter_env_amt_oct = value.clamp(0.0, 1.0) * 4.0,

            // New (MiniMoog-ish)
            9 => self.osc2.set_waveform(Waveform::from_u32(value.round() as u32)),
            10 => self.osc_mix = value.clamp(0.0, 1.0),
            11 => self.detune_cents = value.clamp(-100.0, 100.0),
            12 => self.osc2_semitones = value.clamp(-24.0, 24.0),
            13 => self.glide_s = value.clamp(0.0, 1.0),
            14 => self.keytrack = value.clamp(0.0, 1.0),
            15 => self.noise_level = value.clamp(0.0, 1.0),

            // Filter envelope ADSR
            16 => self.filt_env.attack_s = value.clamp(0.001, 2.0),
            17 => self.filt_env.decay_s = value.clamp(0.005, 3.0),
            18 => self.filt_env.sustain = value.clamp(0.0, 1.0),
            19 => self.filt_env.release_s = value.clamp(0.005, 3.0),

            _ => {}
        }
    }

    pub fn render_into(&mut self, out: &mut [f32]) {
        let sr = self.sr;
        let glide_alpha = if self.glide_s <= 0.000_5 {
            1.0
        } else {
            1.0 - (-1.0 / (self.glide_s * sr)).exp()
        };

        for s in out.iter_mut() {
            // Glide toward target
            self.current_freq += glide_alpha * (self.target_freq - self.current_freq);

            let amp = self.amp_env.next_level(sr);
            let fe = self.filt_env.next_level(sr);

            let osc1 = self.osc1.next_sample(self.current_freq, sr);

            let detune_semitones = self.osc2_semitones + (self.detune_cents / 100.0);
            let osc2_freq = self.current_freq * (2.0_f32).powf(detune_semitones / 12.0);
            let osc2 = self.osc2.next_sample(osc2_freq, sr);

            let mix = (1.0 - self.osc_mix) * osc1 + self.osc_mix * osc2;
            let noise = self.noise_level * 0.25 * self.next_noise();

            let x = (mix + noise) * amp * self.velocity * self.volume;

            let key_oct = (self.note as f32 - 69.0) / 12.0;
            let key_factor = (2.0_f32).powf(self.keytrack * key_oct);

            let cutoff = (self.cutoff_base_hz * key_factor * (2.0_f32).powf(self.filter_env_amt_oct * fe))
                .min(sr * 0.45);

            *s = self.filter.process(x, cutoff);
        }
    }

    #[inline]
    fn next_noise(&mut self) -> f32 {
        // Simple LCG; good enough for synth noise.
        self.rng = self.rng.wrapping_mul(1664525).wrapping_add(1013904223);
        let bits = (self.rng >> 9) & 0x007F_FFFF;
        let u01 = bits as f32 / 8_388_607.0;
        u01 * 2.0 - 1.0
    }
}

fn midi_note_to_hz(note: u8) -> f32 {
    let n = note as f32;
    440.0 * 2.0_f32.powf((n - 69.0) / 12.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_is_finite_under_extremes() {
        let mut s = Synth::new(48_000.0);
        s.set_param(1, 0.35);
        s.set_param(5, 1.0);
        s.set_param(8, 1.0);
        s.set_param(10, 1.0);
        s.set_param(11, 50.0);
        s.set_param(12, 12.0);
        s.set_param(14, 1.0);
        s.set_param(15, 1.0);
        s.note_on(69, 1.0);

        let mut out = [0.0_f32; 512];
        s.render_into(&mut out);
        assert!(out.iter().all(|v| v.is_finite()));
    }
}
