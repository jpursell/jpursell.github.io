pub struct TempoDelay {
    buf: Vec<f32>,
    write: usize,
}

impl TempoDelay {
    pub fn new(sample_rate: f32, max_seconds: f32) -> Self {
        let n = (sample_rate * max_seconds).ceil() as usize;
        let n = n.max(8);
        Self {
            buf: vec![0.0; n],
            write: 0,
        }
    }

    pub fn clear(&mut self) {
        self.buf.fill(0.0);
        self.write = 0;
    }

    pub fn process_block(&mut self, input: &[f32], output: &mut [f32], enabled: bool, delay_samples: f32, feedback: f32) {
        let n = input.len();
        if !enabled {
            for sample in output.iter_mut().take(n) {
                self.buf[self.write] = 0.0;
                self.write = (self.write + 1) % self.buf.len();
                *sample = 0.0;
            }
            return;
        }

        let len = self.buf.len();
        let ds = (delay_samples as usize).clamp(1, len - 1);
        let mut read = if self.write >= ds {
            self.write - ds
        } else {
            self.write + len - ds
        };

        for i in 0..n {
            let x = input[i];
            let y = self.buf[read];
            self.buf[self.write] = x + y * feedback;
            output[i] = y;

            self.write = (self.write + 1) % len;
            read = (read + 1) % len;
        }
    }
}

pub struct Comb {
    buf: Vec<f32>,
    idx: usize,
    filter_store: f32,
}

impl Comb {
    pub fn new(len: usize) -> Self {
        Self {
            buf: vec![0.0; len.max(8)],
            idx: 0,
            filter_store: 0.0,
        }
    }

    pub fn process_block(&mut self, input: &[f32], output: &mut [f32], feedback: f32, damp: f32) {
        let len = self.buf.len();
        for (x, sample) in input.iter().zip(output.iter_mut()) {
            let y = self.buf[self.idx];
            self.filter_store = y * (1.0 - damp) + self.filter_store * damp;
            self.buf[self.idx] = *x + self.filter_store * feedback;
            *sample += y;
            self.idx = (self.idx + 1) % len;
        }
    }
}

pub struct Allpass {
    buf: Vec<f32>,
    idx: usize,
    fb: f32,
}

impl Allpass {
    pub fn new(len: usize, feedback: f32) -> Self {
        Self {
            buf: vec![0.0; len.max(8)],
            idx: 0,
            fb: feedback,
        }
    }

    pub fn process_block(&mut self, data: &mut [f32]) {
        let len = self.buf.len();
        for sample in data.iter_mut() {
            let x = *sample;
            let y = self.buf[self.idx];
            let out = -x + y;
            self.buf[self.idx] = x + y * self.fb;
            *sample = out;
            self.idx = (self.idx + 1) % len;
        }
    }
}

pub struct SchroederReverb {
    combs: Vec<Comb>,
    allpasses: Vec<Allpass>,
}

impl SchroederReverb {
    pub fn new(sample_rate: f32) -> Self {
        let scale = sample_rate / 44100.0;
        let comb_lens = [1116, 1188, 1277, 1356];
        let ap_lens = [556, 441];

        Self {
            combs: comb_lens.iter().map(|&n| Comb::new((n as f32 * scale).round() as usize)).collect(),
            allpasses: ap_lens.iter().map(|&n| Allpass::new((n as f32 * scale).round() as usize, 0.5)).collect(),
        }
    }

    pub fn process_block(&mut self, input: &[f32], output: &mut [f32], enabled: bool, decay01: f32, damp01: f32) {
        let n = input.len();
        if !enabled {
            output[..n].fill(0.0);
            return;
        }

        let decay = decay01.clamp(0.0, 1.0);
        let damp = damp01.clamp(0.0, 1.0);

        let feedback = (0.4 + decay * 0.55).min(0.98);
        let d = 0.05 + damp * 0.85;

        output[..n].fill(0.0);

        for c in &mut self.combs {
            c.process_block(input, output, feedback, d);
        }

        for sample in output.iter_mut().take(n) {
            *sample *= 0.25;
        }

        for a in &mut self.allpasses {
            a.process_block(output);
        }
    }
}

pub fn softclip(x: f32) -> f32 {
    let a = x.abs();
    x / (1.0 + a)
}
