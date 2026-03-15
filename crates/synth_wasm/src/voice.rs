use crate::dsp::{env::Envelope, ladder::LadderLp, osc::Oscillator, lfo::Lfo};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModSource {
    Lfo1 = 0,
    Lfo2 = 1,
    FiltEnv = 2,
}

impl TryFrom<u32> for ModSource {
    type Error = ();
    fn try_from(v: u32) -> Result<Self, Self::Error> {
        match v {
            0 => Ok(ModSource::Lfo1),
            1 => Ok(ModSource::Lfo2),
            2 => Ok(ModSource::FiltEnv),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModDest {
    Cutoff = 0,
    Pitch = 1,
    OscMix = 2,
}

impl TryFrom<u32> for ModDest {
    type Error = ();
    fn try_from(v: u32) -> Result<Self, Self::Error> {
        match v {
            0 => Ok(ModDest::Cutoff),
            1 => Ok(ModDest::Pitch),
            2 => Ok(ModDest::OscMix),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ModRouting {
    pub source: ModSource,
    pub dest: ModDest,
    pub amount: f32,
}

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

    pub lfo1: Lfo,
    pub lfo2: Lfo,
    pub mod_matrix: [Option<ModRouting>; 8],
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

            lfo1: Lfo::new(),
            lfo2: Lfo::new(),
            mod_matrix: [None; 8],
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

        let lfo1_val = self.lfo1.process(sr);
        let lfo2_val = self.lfo2.process(sr);

        let mut mod_cutoff = 0.0;
        let mut mod_pitch = 0.0;
        let mut mod_oscmix = 0.0;

        for m in &self.mod_matrix {
            if let Some(route) = m {
                let val = match route.source {
                    ModSource::Lfo1 => lfo1_val,
                    ModSource::Lfo2 => lfo2_val,
                    ModSource::FiltEnv => fe,
                };
                let out = val * route.amount;
                match route.dest {
                    ModDest::Cutoff => mod_cutoff += out,
                    ModDest::Pitch => mod_pitch += out,
                    ModDest::OscMix => mod_oscmix += out,
                }
            }
        }

        let modded_freq = self.current_freq * (2.0_f32).powf(mod_pitch * 2.0); // +/- 2 octaves max range

        let osc1 = self.osc1.next_sample(modded_freq, sr);

        let detune_semitones = self.osc2_semitones + (self.detune_cents / 100.0);
        let osc2_freq = modded_freq * (2.0_f32).powf(detune_semitones / 12.0);
        let osc2 = self.osc2.next_sample(osc2_freq, sr);

        let final_mix = (self.osc_mix + mod_oscmix).clamp(0.0, 1.0);
        let mix = (1.0 - final_mix) * osc1 + final_mix * osc2;
        let noise = self.noise_level * 0.25 * self.next_noise();

        let x = (mix + noise) * amp * self.velocity * global_volume;

        let key_oct = (self.note as f32 - 69.0) / 12.0;
        let key_factor = (2.0_f32).powf(self.keytrack * key_oct);

        // Filter cutoff logic
        let env_mod = self.filter_env_amt_oct * fe;
        // The mod_cutoff is an octave offset (-4.0 to +4.0 maybe)
        let total_mod = env_mod + (mod_cutoff * 4.0); 

        let cutoff = (self.cutoff_base_hz * key_factor * (2.0_f32).powf(total_mod))
            .clamp(20.0, sr * 0.45);

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
