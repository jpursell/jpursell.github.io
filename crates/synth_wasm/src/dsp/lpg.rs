pub struct Lpg {
    sr: f32,
    state: f32,
    env_smooth: f32,
}

impl Lpg {
    pub fn new(sr: f32) -> Self {
        Self {
            sr,
            state: 0.0,
            env_smooth: 0.0,
        }
    }

    #[inline]
    pub fn process(&mut self, input: f32, env: f32, cutoff_base_hz: f32) -> f32 {
        // Vactrol sluggishness: fast attack, slow release for the CV
        let attack_coef = (-1.0 / (0.005 * self.sr)).exp();
        let decay_coef = (-1.0 / (0.150 * self.sr)).exp();
        
        let coef = if env > self.env_smooth { attack_coef } else { decay_coef };
        self.env_smooth = self.env_smooth * coef + env * (1.0 - coef);
        
        // 1-pole LP filter cutoff frequency driven by the smoothed envelope
        let min_hz = 40.0;
        let max_hz = cutoff_base_hz.max(min_hz);
        let fc = min_hz + self.env_smooth * (max_hz - min_hz);
        
        // Simple 1-pole LP
        let alpha = 1.0 - (-2.0 * std::f32::consts::PI * fc / self.sr).exp();
        self.state = self.state + alpha * (input - self.state);
        
        // LPG is both a filter and a VCA
        self.state * self.env_smooth
    }
}
