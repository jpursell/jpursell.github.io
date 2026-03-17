pub struct CombFilter {
    buffer: Vec<f32>,
    write_ptr: usize,
    pub time_s: f32,
    pub feedback: f32,
    pub mix: f32,
    sr: f32,
}

impl CombFilter {
    pub fn new(sr: f32) -> Self {
        // Max 100ms delay line
        let capacity = (sr * 0.1).ceil() as usize;
        let buffer = vec![0.0; capacity.max(2048)];
        Self {
            buffer,
            write_ptr: 0,
            time_s: 0.01,
            feedback: 0.8,
            mix: 0.0,
            sr,
        }
    }

    #[inline]
    pub fn process(&mut self, input: f32) -> f32 {
        if self.mix <= 0.001 {
            return input;
        }

        let max_samples = self.buffer.len() as f32;
        let delay_samples = (self.time_s * self.sr).clamp(1.0, max_samples - 1.0);
        
        // Linear interpolation for read pointer
        let read_idx = self.write_ptr as f32 - delay_samples;
        let read_idx = if read_idx < 0.0 { read_idx + max_samples } else { read_idx };
        
        let i_read = read_idx.floor() as usize;
        let frac = read_idx - i_read as f32;
        let next_i = (i_read + 1) % self.buffer.len();
        
        let delayed = self.buffer[i_read] * (1.0 - frac) + self.buffer[next_i] * frac;
        
        let out = input + delayed * self.feedback;
        
        self.buffer[self.write_ptr] = out;
        self.write_ptr = (self.write_ptr + 1) % self.buffer.len();
        
        // Mix out
        input * (1.0 - self.mix) + delayed * self.mix
    }
}
