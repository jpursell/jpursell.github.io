use crate::dsp::{env::Envelope, ladder::LadderLp, osc::Oscillator};

#[derive(Debug)]
pub struct Voice {
    pub note: i32,
    pub current_freq: f32,
    pub target_freq: f32,
    pub glide_s: f32,

    pub osc1: Oscillator,
    pub osc2: Oscillator,
    pub osc_mix: f32,
    pub osc2_semitones: f32,
    pub detune_cents: f32,

    pub noise_level: f32,
    rng: u32,

    pub amp_env: Envelope,
    pub filt_env: Envelope,

    pub filter: LadderLp,
    pub cutoff_base_hz: f32,
    pub keytrack: f32,
    pub filter_env_amt_oct: f32,

    pub velocity: f32,
}

impl Voice {
    pub fn new(sr: f32) -> Self {
        let mut filter = LadderLp::new(sr);
        filter.set_resonance(0.2);

        Self {
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
            keytrack: 0.0,
            filter_env_amt_oct: 2.0,

            velocity: 0.8,
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

    pub fn render(&mut self, sr: f32, global_volume: f32) -> f32 {
        let glide_alpha = if self.glide_s <= 0.000_5 {
            1.0
        } else {
            1.0 - (-1.0 / (self.glide_s * sr)).exp()
        };

        self.current_freq += glide_alpha * (self.target_freq - self.current_freq);

        let amp = self.amp_env.next_level(sr);
        let fe = self.filt_env.next_level(sr);

        let osc1 = self.osc1.next_sample(self.current_freq, sr);

        let detune_semitones = self.osc2_semitones + (self.detune_cents / 100.0);
        let osc2_freq = self.current_freq * (2.0_f32).powf(detune_semitones / 12.0);
        let osc2 = self.osc2.next_sample(osc2_freq, sr);

        let mix = (1.0 - self.osc_mix) * osc1 + self.osc_mix * osc2;
        let noise = self.noise_level * 0.25 * self.next_noise();

        let x = (mix + noise) * amp * self.velocity * global_volume;

        let key_oct = (self.note as f32 - 69.0) / 12.0;
        let key_factor = (2.0_f32).powf(self.keytrack * key_oct);

        let cutoff = (self.cutoff_base_hz * key_factor * (2.0_f32).powf(self.filter_env_amt_oct * fe))
            .min(sr * 0.45);

        self.filter.process(x, cutoff)
    }

    #[inline]
    fn next_noise(&mut self) -> f32 {
        self.rng = self.rng.wrapping_mul(1664525).wrapping_add(1013904223);
        let bits = (self.rng >> 9) & 0x007F_FFFF;
        let u01 = bits as f32 / 8_388_607.0;
        u01 * 2.0 - 1.0
    }
}

pub fn midi_note_to_hz(note: u8) -> f32 {
    let n = note as f32;
    440.0 * 2.0_f32.powf((n - 69.0) / 12.0)
}
