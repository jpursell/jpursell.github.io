pub struct Shaper {
    pub amount: f32,
}

impl Shaper {
    pub fn new() -> Self {
        Self { amount: 0.0 }
    }

    #[inline]
    pub fn process(&self, input: f32) -> f32 {
        if self.amount <= 0.001 {
            return input;
        }
        
        // Drive goes from 1.0 to 9.0
        let drive = 1.0 + self.amount * 8.0;
        let folded = (input * drive * std::f32::consts::PI * 0.5).sin();
        
        let wet_mix = self.amount;
        input * (1.0 - wet_mix) + folded * wet_mix
    }
}
