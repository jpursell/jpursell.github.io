#[repr(u32)]
#[derive(Clone, Copy, Debug)]
pub enum Waveform {
    Saw = 0,
    Square = 1,
}

impl Waveform {
    pub fn from_u32(v: u32) -> Self {
        match v {
            1 => Waveform::Square,
            _ => Waveform::Saw,
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Oscillator {
    pub phase: f32,
    pub waveform: Waveform,
}

impl Oscillator {
    pub fn new() -> Self {
        Self {
            phase: 0.0,
            waveform: Waveform::Saw,
        }
    }

    pub fn set_waveform(&mut self, waveform: Waveform) {
        self.waveform = waveform;
    }

    pub fn next_sample(&mut self, freq_hz: f32, sr: f32) -> f32 {
        let freq = freq_hz.max(0.0);
        let dt = (freq / sr).clamp(0.0, 0.49);

        self.phase += dt;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }

        match self.waveform {
            Waveform::Saw => {
                let t = self.phase;
                let mut y = 2.0 * t - 1.0;
                y -= poly_blep(t, dt);
                y
            }
            Waveform::Square => {
                let t = self.phase;
                let pw = 0.5;
                let mut y = if t < pw { 1.0 } else { -1.0 };
                y += poly_blep(t, dt);
                let t2 = (t - pw + 1.0) % 1.0;
                y -= poly_blep(t2, dt);
                y
            }
        }
    }
}

#[inline]
pub(crate) fn poly_blep(t: f32, dt: f32) -> f32 {
    // Polynomial band-limited step (PolyBLEP).
    // t: phase in [0,1), dt: phase increment per sample.
    if dt <= 0.0 {
        return 0.0;
    }
    if t < dt {
        let x = t / dt;
        return x + x - x * x - 1.0;
    }
    if t > 1.0 - dt {
        let x = (t - 1.0) / dt;
        return x * x + x + x + 1.0;
    }
    0.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn poly_blep_basic_values() {
        let dt = 0.1;
        assert!((poly_blep(0.0, dt) + 1.0).abs() < 1e-6);
        assert!(poly_blep(dt, dt).abs() < 1e-6);
        assert!((poly_blep(0.05, dt) + 0.25).abs() < 1e-6);
        assert!((poly_blep(0.95, dt) - 0.25).abs() < 1e-6);
        assert_eq!(poly_blep(0.5, dt), 0.0);
        assert_eq!(poly_blep(0.5, 0.0), 0.0);
    }
}
