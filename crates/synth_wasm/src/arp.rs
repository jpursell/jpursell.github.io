#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArpPattern {
    Up,
    Down,
    UpDown,
    Random,
    AsPlayed,
}

impl ArpPattern {
    pub fn from_u32(v: u32) -> Self {
        match v {
            0 => ArpPattern::Up,
            1 => ArpPattern::Down,
            2 => ArpPattern::UpDown,
            3 => ArpPattern::Random,
            4 => ArpPattern::AsPlayed,
            _ => ArpPattern::Up,
        }
    }
}

pub struct ArpState {
    pub enabled: bool,
    pub octaves: u32,
    pub pattern: ArpPattern,
    pub steps: [u8; 16],

    held: Vec<(u8, f32)>, // (note, velocity)
    as_played: Vec<u8>,
    note_idx: usize,
    updown_dir: i32,
    pub current_note: Option<u8>,
    rng: u32,
}

impl ArpState {
    pub fn new() -> Self {
        Self {
            enabled: false,
            octaves: 1,
            pattern: ArpPattern::Up,
            steps: [1; 16],
            held: Vec::new(),
            as_played: Vec::new(),
            note_idx: 0,
            updown_dir: 1,
            current_note: None,
            rng: 0xC0FFEE,
        }
    }

    pub fn note_on(&mut self, note: u8, velocity: f32) {
        if !self.held.iter().any(|(n, _)| *n == note) {
            self.held.push((note, velocity));
        }
        if !self.as_played.contains(&note) {
            self.as_played.push(note);
        }
    }

    pub fn note_off(&mut self, note: u8) {
        self.held.retain(|(n, _)| *n != note);
        self.as_played.retain(|n| *n != note);

        if self.held.is_empty() {
            self.note_idx = 0;
            self.updown_dir = 1;
            // We keep current_note so process_transport_step can turn it off.
        }
    }

    pub fn next_rand_int(&mut self, max: u32) -> u32 {
        self.rng = self.rng.wrapping_mul(1664525).wrapping_add(1013904223);
        if max <= 1 {
            0
        } else {
            self.rng % max
        }
    }

    pub fn build_sequence(&self) -> Vec<(u8, f32)> {
        let oct = self.octaves.clamp(1, 4);

        let base: Vec<(u8, f32)> = if self.pattern == ArpPattern::AsPlayed {
            let mut b = Vec::new();
            for &n in &self.as_played {
                if let Some(&(hn, v)) = self.held.iter().find(|(hn, _)| *hn == n) {
                    b.push((hn, v));
                }
            }
            b
        } else {
            let mut b = self.held.clone();
            b.sort_by_key(|(n, _)| *n);
            b
        };

        if base.is_empty() {
            return Vec::new();
        }

        let mut expanded = Vec::new();
        for o in 0..oct {
            for (n, v) in &base {
                let note = n.saturating_add((o * 12) as u8);
                if note > 127 {
                    continue;
                }
                expanded.push((note, *v));
            }
        }

        match self.pattern {
            ArpPattern::Down => expanded.sort_by(|a, b| b.0.cmp(&a.0)),
            ArpPattern::AsPlayed => {} // Keep as is
            _ => expanded.sort_by_key(|a| a.0),
        }

        expanded
    }

    pub fn tick(&mut self, step_idx: usize) -> Option<(u8, f32)> {
        if !self.enabled {
            return None;
        }

        let idx = step_idx & 15;
        let seq = self.build_sequence();

        if seq.is_empty() || self.steps[idx] == 0 {
            return None;
        }

        let next = if seq.len() == 1 {
            seq[0]
        } else if self.pattern == ArpPattern::Random {
            let r = self.next_rand_int(seq.len() as u32) as usize;
            seq[r]
        } else {
            if self.note_idx >= seq.len() {
                self.note_idx = 0;
            }

            if self.pattern == ArpPattern::UpDown {
                let n = seq[self.note_idx];
                if self.updown_dir == 1 {
                    if self.note_idx >= seq.len() - 1 {
                        self.updown_dir = -1;
                        self.note_idx = self.note_idx.saturating_sub(1);
                    } else {
                        self.note_idx += 1;
                    }
                } else {
                    if self.note_idx == 0 {
                        self.updown_dir = 1;
                        self.note_idx = (seq.len() - 1).min(self.note_idx + 1);
                    } else {
                        self.note_idx -= 1;
                    }
                }
                n
            } else {
                let n = seq[self.note_idx % seq.len()];
                self.note_idx = (self.note_idx + 1) % seq.len();
                n
            }
        };

        Some(next)
    }

    pub fn reset_voice(&mut self) {
        self.current_note = None;
        self.note_idx = 0;
        self.updown_dir = 1;
    }
}
