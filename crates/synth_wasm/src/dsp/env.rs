#[derive(Clone, Copy, Debug)]
enum EnvState {
    Idle,
    Attack,
    Decay,
    Sustain,
    Release,
}

#[derive(Clone, Copy, Debug)]
pub struct Envelope {
    state: EnvState,
    level: f32,
    pub attack_s: f32,
    pub decay_s: f32,
    pub sustain: f32,
    pub release_s: f32,
}

impl Envelope {
    pub fn new() -> Self {
        Self {
            state: EnvState::Idle,
            level: 0.0,
            attack_s: 0.01,
            decay_s: 0.12,
            sustain: 0.6,
            release_s: 0.15,
        }
    }

    pub fn note_on(&mut self) {
        self.state = EnvState::Attack;
    }

    pub fn note_off(&mut self) {
        if !matches!(self.state, EnvState::Idle) {
            self.state = EnvState::Release;
        }
    }

    pub fn next_level(&mut self, sr: f32) -> f32 {
        let attack_inc = 1.0 / (self.attack_s * sr).max(1.0);
        let sustain = self.sustain.clamp(0.0, 1.0);
        let decay_dec = (1.0 - sustain) / (self.decay_s * sr).max(1.0);

        match self.state {
            EnvState::Idle => {
                self.level = 0.0;
            }
            EnvState::Attack => {
                self.level += attack_inc;
                if self.level >= 1.0 {
                    self.level = 1.0;
                    self.state = EnvState::Decay;
                }
            }
            EnvState::Decay => {
                self.level -= decay_dec;
                if self.level <= sustain {
                    self.level = sustain;
                    self.state = EnvState::Sustain;
                }
            }
            EnvState::Sustain => {
                self.level = sustain;
            }
            EnvState::Release => {
                let release_dec = self.level / (self.release_s * sr).max(1.0);
                self.level -= release_dec;
                if self.level <= 0.0 {
                    self.level = 0.0;
                    self.state = EnvState::Idle;
                }
            }
        }

        self.level
    }
}
