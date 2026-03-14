use core::f32::consts::PI;

#[derive(Clone, Copy, Debug)]
pub struct OnePoleLp {
    cutoff_hz: f32,
    alpha: f32,
    state: f32,
}

impl OnePoleLp {
    pub fn new(sr: f32) -> Self {
        let mut f = Self {
            cutoff_hz: 2_000.0,
            alpha: 0.0,
            state: 0.0,
        };
        f.set_cutoff(sr, f.cutoff_hz);
        f
    }

    pub fn set_cutoff(&mut self, sr: f32, cutoff_hz: f32) {
        self.cutoff_hz = cutoff_hz;
        let cutoff = cutoff_hz.clamp(20.0, 20_000.0).min(sr * 0.45);
        // One-pole lowpass: alpha = 1 - exp(-2*pi*fc/sr)
        let a = 1.0 - (-2.0 * PI * cutoff / sr).exp();
        self.alpha = a.clamp(0.0, 1.0);
    }

    pub fn process(&mut self, x: f32) -> f32 {
        self.state += self.alpha * (x - self.state);
        self.state
    }
}
