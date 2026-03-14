use core::f32::consts::PI;

#[derive(Clone, Copy, Debug)]
pub struct LadderLp {
    sr: f32,
    resonance: f32, // [0..1]
    drive: f32,
    last_out: f32,
    z1: f32,
    z2: f32,
    z3: f32,
    z4: f32,
}

impl LadderLp {
    pub fn new(sr: f32) -> Self {
        Self {
            sr,
            resonance: 0.0,
            drive: 1.6,
            last_out: 0.0,
            z1: 0.0,
            z2: 0.0,
            z3: 0.0,
            z4: 0.0,
        }
    }

    pub fn set_resonance(&mut self, v01: f32) {
        self.resonance = v01.clamp(0.0, 1.0);
    }

    #[inline]
    fn tpt_onepole(x: f32, z: &mut f32, g: f32) -> f32 {
        // Zavalishin TPT one-pole integrator form.
        let v = (x - *z) * g;
        let y = v + *z;
        *z = y + v;
        y
    }

    pub fn process(&mut self, x: f32, cutoff_hz: f32) -> f32 {
        let fc = cutoff_hz.clamp(20.0, 20_000.0).min(self.sr * 0.45);

        // TPT coefficient.
        let g = (PI * fc / self.sr).tan();
        let g = (g / (1.0 + g)).clamp(0.0, 1.0);

        // Resonance feedback. Allow near/self-oscillation.
        let k = (4.0 * self.resonance).clamp(0.0, 4.0);

        let u = (self.drive * (x - k * self.last_out)).tanh();

        let y1 = Self::tpt_onepole(u, &mut self.z1, g);
        let y2 = Self::tpt_onepole(y1, &mut self.z2, g);
        let y3 = Self::tpt_onepole(y2, &mut self.z3, g);
        let y4 = Self::tpt_onepole(y3, &mut self.z4, g);

        self.last_out = y4;
        y4
    }
}
