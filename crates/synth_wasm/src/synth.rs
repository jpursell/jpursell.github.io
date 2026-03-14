use crate::dsp::{env::Envelope, ladder::LadderLp, osc::{Oscillator, Waveform}};

#[derive(Debug)]
pub struct Synth {
    sr: f32,
    freq: f32,
    osc: Oscillator,
    env: Envelope,
    filter: LadderLp,
    cutoff_base_hz: f32,
    filter_env_amt_oct: f32,
    velocity: f32,
    volume: f32,
}

impl Synth {
    pub fn new(sr: f32) -> Self {
        let sr = sr.max(8_000.0);
        let mut filter = LadderLp::new(sr);
        filter.set_resonance(0.2);
        Self {
            sr,
            freq: 440.0,
            osc: Oscillator::new(),
            env: Envelope::new(),
            filter,
            cutoff_base_hz: 2_000.0,
            filter_env_amt_oct: 2.0,
            velocity: 0.8,
            volume: 0.5,
        }
    }

    pub fn note_on(&mut self, note: u8, velocity: f32) {
        self.freq = midi_note_to_hz(note);
        self.velocity = velocity.clamp(0.0, 1.0);
        self.env.note_on();
    }

    pub fn note_off(&mut self, _note: u8) {
        self.env.note_off();
    }

    pub fn set_param(&mut self, param_id: u32, value: f32) {
        match param_id {
            0 => self.osc.set_waveform(Waveform::from_u32(value.round() as u32)),
            1 => {
                // Cutoff: expect [0..1] from UI, map to ~[60..12k] log-ish
                let v = value.clamp(0.0, 1.0);
                let min_hz: f32 = 60.0;
                let max_hz: f32 = 12_000.0;
                let hz = min_hz * (max_hz / min_hz).powf(v);
                self.cutoff_base_hz = hz;
            }
            2 => self.env.attack_s = value.clamp(0.001, 2.0),
            3 => self.env.release_s = value.clamp(0.005, 3.0),
            4 => self.volume = value.clamp(0.0, 1.0),
            5 => self.filter.set_resonance(value.clamp(0.0, 1.0)),
            6 => self.env.decay_s = value.clamp(0.005, 3.0),
            7 => self.env.sustain = value.clamp(0.0, 1.0),
            8 => self.filter_env_amt_oct = value.clamp(0.0, 1.0) * 4.0,
            _ => {}
        }
    }

    pub fn render_into(&mut self, out: &mut [f32]) {
        for s in out.iter_mut() {
            let env_level = self.env.next_level(self.sr);
            let osc = self.osc.next_sample(self.freq, self.sr);

            let x = osc * env_level * self.velocity * self.volume;

            let cutoff = (self.cutoff_base_hz * (2.0_f32).powf(self.filter_env_amt_oct * env_level))
                .min(self.sr * 0.45);

            *s = self.filter.process(x, cutoff);
        }
    }
}

fn midi_note_to_hz(note: u8) -> f32 {
    let n = note as f32;
    440.0 * 2.0_f32.powf((n - 69.0) / 12.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_is_finite_with_high_resonance_and_env() {
        let mut s = Synth::new(48_000.0);
        s.set_param(1, 0.35); // cutoff
        s.set_param(5, 1.0); // resonance
        s.set_param(8, 1.0); // env amt
        s.note_on(69, 1.0);

        let mut out = [0.0_f32; 256];
        s.render_into(&mut out);
        assert!(out.iter().all(|v| v.is_finite()));
    }
}
