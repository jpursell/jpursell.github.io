#[derive(Debug, Clone, Copy, PartialEq)]
pub enum LfoShape {
    Triangle,
    Square,
    Saw,
    SampleAndHold,
}

#[derive(Debug)]
pub struct Lfo {
    pub shape: LfoShape,
    pub rate_hz: f32,
    pub phase: f32,
    pub out: f32,
}

impl Lfo {
    pub fn new() -> Self {
        Self {
            shape: LfoShape::Triangle,
            rate_hz: 1.0,
            phase: 0.0,
            out: 0.0,
        }
    }

    pub fn set_shape(&mut self, shape: LfoShape) {
        self.shape = shape;
    }

    pub fn set_rate(&mut self, rate_hz: f32) {
        self.rate_hz = rate_hz.clamp(0.01, 100.0);
    }

    pub fn process(&mut self, sr: f32) -> f32 {
        let phase_inc = self.rate_hz / sr;
        self.phase += phase_inc;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }

        self.out = match self.shape {
            LfoShape::Triangle => {
                let p = self.phase * 2.0;
                if p < 1.0 {
                    p * 2.0 - 1.0
                } else {
                    (2.0 - p) * 2.0 - 1.0
                }
            }
            LfoShape::Square => {
                if self.phase < 0.5 {
                    1.0
                } else {
                    -1.0
                }
            }
            LfoShape::Saw => {
                self.phase * 2.0 - 1.0
            }
            LfoShape::SampleAndHold => {
                // Simplified S&H: we just need to detect when phase wraps around
                // But for now, returning 0.0 to keep it simple, or we can use a basic random
                // Not strictly needed right now unless we want to implement a PRNG
                0.0 
            }
        };

        self.out
    }
}
