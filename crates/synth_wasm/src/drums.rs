pub enum DrumId {
    Kick = 0,
    Snare = 1,
    CH = 2,
    OH = 3,
}

impl DrumId {
    pub fn from_u32(v: u32) -> Option<Self> {
        match v {
            0 => Some(DrumId::Kick),
            1 => Some(DrumId::Snare),
            2 => Some(DrumId::CH),
            3 => Some(DrumId::OH),
            _ => None,
        }
    }
}

pub struct DrumParams {
    pub level: f32,
    pub tune: f32,
    pub decay: f32,
}

pub struct DrumVoice {
    sample_idx: usize,
    pos: f32,
    rate: f32,
    gain: f32,
    decay_coef: f32,
}

pub struct DrumMachine {
    pub enabled: bool,
    pub patterns: [[u8; 16]; 4],
    pub params: [DrumParams; 4],
    pub samples: [Option<Vec<f32>>; 4],
    pub drum_src_to_out: f32,
    voices: Vec<DrumVoice>,
    sample_rate: f32,
}

impl DrumMachine {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            enabled: false,
            patterns: [[0; 16]; 4],
            params: [
                DrumParams { level: 0.9, tune: 0.0, decay: 0.5 },
                DrumParams { level: 0.75, tune: 0.0, decay: 0.5 },
                DrumParams { level: 0.5, tune: 0.0, decay: 0.35 },
                DrumParams { level: 0.5, tune: 0.0, decay: 0.6 },
            ],
            samples: [None, None, None, None],
            drum_src_to_out: 1.0,
            voices: Vec::new(),
            sample_rate,
        }
    }

    pub fn trigger_drum(&mut self, id: DrumId) {
        let idx = id as usize;
        if self.samples[idx].is_none() { return; }
        
        let p = &self.params[idx];
        let level = p.level.clamp(0.0, 1.0);
        if level <= 0.0001 { return; }
        
        let tune = p.tune.clamp(-24.0, 24.0);
        let rate = self.drum_src_to_out * 2.0f32.powf(tune / 12.0);
        
        let d01 = p.decay.clamp(0.0, 1.0);
        let tau_s = 0.03 + d01 * (1.5 - 0.03);
        let decay_coef = (-1.0 / (tau_s * self.sample_rate)).exp();
        
        self.voices.push(DrumVoice {
            sample_idx: idx,
            pos: 0.0,
            rate,
            gain: level,
            decay_coef,
        });
    }

    pub fn tick(&mut self, step_idx: usize) {
        if !self.enabled { return; }
        let idx = step_idx & 15;
        for i in 0..4 {
            if self.patterns[i][idx] == 1 {
                if let Some(id) = DrumId::from_u32(i as u32) {
                    self.trigger_drum(id);
                }
            }
        }
    }

    pub fn mix_into(&mut self, dst: &mut [f32]) {
        if self.voices.is_empty() { return; }

        for v in &mut self.voices {
            let Some(pcm) = &self.samples[v.sample_idx] else { continue };
            let len = pcm.len();
            
            for sample in dst.iter_mut() {
                let ip = v.pos as usize;
                if ip >= len { break; }

                let frac = v.pos - ip as f32;
                let s0 = pcm[ip];
                let s1 = if ip + 1 < len { pcm[ip + 1] } else { s0 };
                let s = s0 + (s1 - s0) * frac;

                *sample += s * v.gain;

                v.gain *= v.decay_coef;
                v.pos += v.rate;

                if v.gain < 1e-5 { break; }
            }
        }

        // Cull finished voices
        self.voices.retain(|v| {
            if let Some(pcm) = &self.samples[v.sample_idx] {
                 (v.pos as usize) < pcm.len() && v.gain >= 1e-5
            } else {
                false
            }
        });
    }
    
    pub fn clear_voices(&mut self) {
        self.voices.clear();
    }
}
