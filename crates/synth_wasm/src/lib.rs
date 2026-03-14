#![allow(clippy::missing_safety_doc)]
#![allow(static_mut_refs)]

use core::f32::consts::PI;

const MAX_FRAMES: usize = 128;

#[repr(u32)]
#[derive(Clone, Copy, Debug)]
enum Waveform {
    Saw = 0,
    Square = 1,
}

impl Waveform {
    fn from_u32(v: u32) -> Self {
        match v {
            1 => Waveform::Square,
            _ => Waveform::Saw,
        }
    }
}

#[derive(Clone, Copy, Debug)]
enum EnvState {
    Idle,
    Attack,
    Sustain,
    Release,
}

#[derive(Debug)]
struct Synth {
    sr: f32,
    phase: f32,
    freq: f32,
    waveform: Waveform,
    cutoff_hz: f32,
    lp_alpha: f32,
    lp_state: f32,
    env_state: EnvState,
    env_level: f32,
    attack_s: f32,
    release_s: f32,
    velocity: f32,
    volume: f32,
}

impl Synth {
    fn new(sr: f32) -> Self {
        let mut s = Self {
            sr: sr.max(8_000.0),
            phase: 0.0,
            freq: 440.0,
            waveform: Waveform::Saw,
            cutoff_hz: 2_000.0,
            lp_alpha: 0.0,
            lp_state: 0.0,
            env_state: EnvState::Idle,
            env_level: 0.0,
            attack_s: 0.01,
            release_s: 0.15,
            velocity: 0.8,
            volume: 0.5,
        };
        s.recalc_filter();
        s
    }

    fn recalc_filter(&mut self) {
        let cutoff = self.cutoff_hz.clamp(20.0, 20_000.0).min(self.sr * 0.45);
        // One-pole lowpass: alpha = 1 - exp(-2*pi*fc/sr)
        let a = 1.0 - (-2.0 * PI * cutoff / self.sr).exp();
        self.lp_alpha = a.clamp(0.0, 1.0);
    }

    fn note_on(&mut self, note: u8, velocity: f32) {
        self.freq = midi_note_to_hz(note);
        self.velocity = velocity.clamp(0.0, 1.0);
        self.env_state = EnvState::Attack;
    }

    fn note_off(&mut self, _note: u8) {
        self.env_state = EnvState::Release;
    }

    fn set_param(&mut self, param_id: u32, value: f32) {
        match param_id {
            0 => self.waveform = Waveform::from_u32(value.round() as u32),
            1 => {
                // Cutoff: expect [0..1] from UI, map to ~[60..12k] log-ish
                let v = value.clamp(0.0, 1.0);
                let min_hz: f32 = 60.0;
                let max_hz: f32 = 12_000.0;
                let hz = min_hz * (max_hz / min_hz).powf(v);
                self.cutoff_hz = hz;
                self.recalc_filter();
            }
            2 => self.attack_s = value.clamp(0.001, 2.0),
            3 => self.release_s = value.clamp(0.005, 3.0),
            4 => self.volume = value.clamp(0.0, 1.0),
            _ => {}
        }
    }

    fn render_into(&mut self, out: &mut [f32]) {
        let frames = out.len();
        let sr = self.sr;
        let freq = self.freq.max(0.0);
        let phase_inc = (freq / sr).clamp(0.0, 0.49);

        let attack_inc = 1.0 / (self.attack_s * sr).max(1.0);
        let release_dec = 1.0 / (self.release_s * sr).max(1.0);

        for i in 0..frames {
            // Envelope
            match self.env_state {
                EnvState::Idle => {
                    self.env_level = 0.0;
                }
                EnvState::Attack => {
                    self.env_level += attack_inc;
                    if self.env_level >= 1.0 {
                        self.env_level = 1.0;
                        self.env_state = EnvState::Sustain;
                    }
                }
                EnvState::Sustain => {
                    self.env_level = 1.0;
                }
                EnvState::Release => {
                    self.env_level -= release_dec;
                    if self.env_level <= 0.0 {
                        self.env_level = 0.0;
                        self.env_state = EnvState::Idle;
                    }
                }
            }

            // Oscillator
            self.phase += phase_inc;
            if self.phase >= 1.0 {
                self.phase -= 1.0;
            }
            let osc = match self.waveform {
                Waveform::Saw => {
                    // PolyBLEP band-limited saw
                    let t = self.phase;
                    let mut y = 2.0 * t - 1.0;
                    y -= poly_blep(t, phase_inc);
                    y
                }
                Waveform::Square => {
                    // PolyBLEP band-limited square (50% duty)
                    let t = self.phase;
                    let pw = 0.5;
                    let mut y = if t < pw { 1.0 } else { -1.0 };
                    y += poly_blep(t, phase_inc);
                    let t2 = (t - pw + 1.0) % 1.0;
                    y -= poly_blep(t2, phase_inc);
                    y
                }
            };

            // Amp + filter
            let x = osc * self.env_level * self.velocity * self.volume;
            self.lp_state += self.lp_alpha * (x - self.lp_state);
            out[i] = self.lp_state;
        }
    }
}


#[inline]
fn poly_blep(t: f32, dt: f32) -> f32 {
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

fn midi_note_to_hz(note: u8) -> f32 {
    let n = note as f32;
    440.0 * 2.0_f32.powf((n - 69.0) / 12.0)
}

static mut SYNTH: Option<Synth> = None;
static mut OUT_BUF: Option<Vec<f32>> = None;

/// Initialize synth and preallocate the audio buffer.
#[no_mangle]
pub unsafe extern "C" fn init(sample_rate: f32) {
    SYNTH = Some(Synth::new(sample_rate));
    let mut v = Vec::with_capacity(MAX_FRAMES);
    v.resize(MAX_FRAMES, 0.0);
    OUT_BUF = Some(v);
}

#[no_mangle]
pub unsafe extern "C" fn note_on(note: u8, velocity: f32) {
    if let Some(s) = SYNTH.as_mut() {
        s.note_on(note, velocity);
    }
}

#[no_mangle]
pub unsafe extern "C" fn note_off(note: u8) {
    if let Some(s) = SYNTH.as_mut() {
        s.note_off(note);
    }
}

#[no_mangle]
pub unsafe extern "C" fn set_param(param_id: u32, value: f32) {
    if let Some(s) = SYNTH.as_mut() {
        s.set_param(param_id, value);
    }
}

/// Render `frames` samples into the internal buffer and return a pointer to it.
/// The returned pointer stays valid until the next call to `render`.
#[no_mangle]
pub unsafe extern "C" fn render(frames: usize) -> *const f32 {
    let frames = frames.min(MAX_FRAMES).max(1);
    let (Some(s), Some(buf)) = (SYNTH.as_mut(), OUT_BUF.as_mut()) else {
        return core::ptr::null();
    };
    s.render_into(&mut buf[..frames]);
    buf.as_ptr()
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

    #[test]
    fn render_is_finite() {
        let mut s = Synth::new(48_000.0);
        s.note_on(69, 1.0);
        let mut out = [0.0_f32; 128];
        s.render_into(&mut out);
        assert!(out.iter().all(|v| v.is_finite()));
    }
}
