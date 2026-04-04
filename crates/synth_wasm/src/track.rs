use crate::voice::Voice;
use crate::drums::{DrumMachine, DrumId};
use crate::arp::{ArpState, ArpPattern};

pub enum Instrument {
    Synth(Voice),
    Drums(DrumMachine),
}

#[derive(Clone, Copy)]
pub struct GridStep {
    pub active: bool,
    pub scale_index: i32,
    pub velocity: f32,
}

pub struct Sequencer {
    pub steps: [GridStep; 64],
    pub num_steps: u32,
    pub current_note: Option<u8>,
}

impl Sequencer {
    pub fn new() -> Self {
        Self {
            steps: [GridStep { active: false, scale_index: 0, velocity: 1.0 }; 64],
            num_steps: 16,
            current_note: None,
        }
    }
}

pub struct Track {
    pub instrument: Instrument,
    pub arp: ArpState,
    pub sequencer: Sequencer,
    pub volume: f32,
    pub send_amount: f32,
    pub enabled: bool,
}

impl Track {
    pub fn new_synth(sr: f32) -> Self {
        Self {
            instrument: Instrument::Synth(Voice::new(sr)),
            arp: ArpState::new(),
            sequencer: Sequencer::new(),
            volume: 1.0,
            send_amount: 0.25,
            enabled: true,
        }
    }

    pub fn new_drums(sr: f32) -> Self {
        let mut d = DrumMachine::new(sr);
        d.enabled = true;
        Self {
            instrument: Instrument::Drums(d),
            arp: ArpState::new(),
            sequencer: Sequencer::new(),
            volume: 1.0,
            send_amount: 0.1,
            enabled: true,
        }
    }

    pub fn note_on(&mut self, note: u8, velocity: f32) {
        if !self.enabled { return; }
        self.arp.note_on(note, velocity);
        if !self.arp.enabled {
            match &mut self.instrument {
                Instrument::Synth(v) => v.note_on(note, velocity),
                Instrument::Drums(d) => {
                    if let Some(id) = DrumId::from_u32((note as u32) % 4) {
                        d.trigger_drum(id);
                    }
                }
            }
        }
    }

    pub fn note_off(&mut self, note: u8) {
        self.arp.note_off(note);
        if !self.arp.enabled {
            match &mut self.instrument {
                Instrument::Synth(v) => v.note_off(note),
                Instrument::Drums(_) => {} // Drums are one-shot, no note-off needed
            }
        }
    }

    pub fn set_arp(&mut self, enabled: bool, octaves: u32, pattern: u32) {
        let was_enabled = self.arp.enabled;
        self.arp.enabled = enabled;
        self.arp.octaves = octaves;
        self.arp.pattern = ArpPattern::from_u32(pattern);
        
        if !was_enabled && enabled {
            if let Some(n) = self.arp.current_note {
                if let Instrument::Synth(v) = &mut self.instrument {
                    v.note_off(n);
                }
            }
            self.arp.reset_voice();
        }
        if was_enabled && !enabled {
            if let Some(n) = self.arp.current_note {
                if let Instrument::Synth(v) = &mut self.instrument {
                    v.note_off(n);
                }
            }
            self.arp.current_note = None;
        }
    }
}
