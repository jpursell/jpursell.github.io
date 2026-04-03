#[derive(Clone, Copy)]
pub enum ScaleType {
    Chromatic,
    Major,
    Minor,
    MajorPentatonic,
    MinorPentatonic,
    Dorian,
    Mixolydian,
    Lydian,
}

impl ScaleType {
    pub fn from_u32(v: u32) -> Self {
        match v {
            1 => Self::Major,
            2 => Self::Minor,
            3 => Self::MajorPentatonic,
            4 => Self::MinorPentatonic,
            5 => Self::Dorian,
            6 => Self::Mixolydian,
            7 => Self::Lydian,
            _ => Self::Chromatic,
        }
    }

    pub fn intervals(&self) -> &'static [u8] {
        match self {
            Self::Chromatic => &[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
            Self::Major => &[0, 2, 4, 5, 7, 9, 11],
            Self::Minor => &[0, 2, 3, 5, 7, 8, 10],
            Self::MajorPentatonic => &[0, 2, 4, 7, 9],
            Self::MinorPentatonic => &[0, 3, 5, 7, 10],
            Self::Dorian => &[0, 2, 3, 5, 7, 9, 10],
            Self::Mixolydian => &[0, 2, 4, 5, 7, 9, 10],
            Self::Lydian => &[0, 2, 4, 6, 7, 9, 11],
        }
    }
}

pub struct Scale {
    pub root_note: u8, // 0 = C, 1 = C#, ... 11 = B
    pub scale_type: ScaleType,
}

impl Scale {
    pub fn new() -> Self {
        Self {
            root_note: 0,
            scale_type: ScaleType::MinorPentatonic,
        }
    }

    pub fn get_note(&self, index: i32) -> u8 {
        let intervals = self.scale_type.intervals();
        let num_notes = intervals.len() as i32;
        
        let mut octave = index / num_notes;
        let mut rem = index % num_notes;
        if rem < 0 {
            rem += num_notes;
            octave -= 1;
        }

        // Base midi note (C2 = 36)
        let base = 36 + self.root_note as i32 + (octave * 12);
        let note = base + intervals[rem as usize] as i32;
        
        note.clamp(0, 127) as u8
    }
}
