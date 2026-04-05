use crate::fx::{TempoDelay, SchroederReverb, softclip};

pub struct Mixer {
    pub master_vol: f32,

    pub drive: f32,
    
    pub delay: TempoDelay,
    pub delay_enabled: bool,
    pub delay_beats: f32,
    pub delay_feedback: f32,
    pub delay_return: f32,
    
    pub reverb: SchroederReverb,
    pub reverb_enabled: bool,
    pub reverb_decay: f32,
    pub reverb_damp: f32,
    pub reverb_return: f32,

    tmp_mix: [f32; 128],
    tmp_send: [f32; 128],
    tmp_delay_out: [f32; 128],
    tmp_reverb_out: [f32; 128],
}

impl Mixer {
    pub fn new(sr: f32) -> Self {
        Self {
            master_vol: 0.9,
            drive: 0.2,
            delay: TempoDelay::new(sr, 3.6),
            delay_enabled: true,
            delay_beats: 0.5,
            delay_feedback: 0.35,
            delay_return: 0.25,
            reverb: SchroederReverb::new(sr),
            reverb_enabled: true,
            reverb_decay: 0.45,
            reverb_damp: 0.4,
            reverb_return: 0.18,
            tmp_mix: [0.0; 128],
            tmp_send: [0.0; 128],
            tmp_delay_out: [0.0; 128],
            tmp_reverb_out: [0.0; 128],
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn set_fx(&mut self, drive: f32,
                   delay_enabled: bool, delay_beats: f32, delay_feedback: f32, delay_return: f32,
                   reverb_enabled: bool, reverb_decay: f32, reverb_damp: f32, reverb_return: f32) {
        self.drive = drive.clamp(0.0, 1.0);

        let was_delay = self.delay_enabled;
        self.delay_enabled = delay_enabled;
        self.delay_beats = delay_beats.clamp(0.25, 2.0);
        self.delay_feedback = delay_feedback.clamp(0.0, 0.95);
        self.delay_return = delay_return.clamp(0.0, 1.0);

        if was_delay && !delay_enabled {
            self.delay.clear();
        }

        self.reverb_enabled = reverb_enabled;
        self.reverb_decay = reverb_decay.clamp(0.0, 1.0);
        self.reverb_damp = reverb_damp.clamp(0.0, 1.0);
        self.reverb_return = reverb_return.clamp(0.0, 1.0);
    }

    pub fn begin_block(&mut self, n: usize) {
        self.tmp_mix[..n].fill(0.0);
        self.tmp_send[..n].fill(0.0);
    }

    pub fn add_track(&mut self, track_out: &[f32], vol: f32, send: f32, n: usize) {
        for i in 0..n {
            let s = track_out[i];
            self.tmp_mix[i] += s * vol;
            self.tmp_send[i] += s * send;
        }
    }

    pub fn finish_block(&mut self, out: &mut [f32], offset: usize, n: usize, sr: f32, tempo_bpm: f32) {
        let delay_samples = sr * (60.0 / tempo_bpm.max(1.0)) * self.delay_beats;

        self.delay.process_block(&self.tmp_send[..n], &mut self.tmp_delay_out[..n], self.delay_enabled, delay_samples, self.delay_feedback);
        self.reverb.process_block(&self.tmp_send[..n], &mut self.tmp_reverb_out[..n], self.reverb_enabled, self.reverb_decay, self.reverb_damp);

        for i in 0..n {
            let dry = self.tmp_mix[i];
            let del = self.tmp_delay_out[i] * self.delay_return;
            let rev = self.tmp_reverb_out[i] * self.reverb_return;

            let mut y = (dry + del + rev) * self.master_vol;
            y = softclip(y);
            out[offset + i] = y;
        }
    }
}
