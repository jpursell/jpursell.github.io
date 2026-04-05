pub enum Event {
    NoteOn { track_id: u32, note: u8, velocity: f32 },
    NoteOff { track_id: u32, note: u8 },
    NoteOnScale { track_id: u32, scale_index: i32, velocity: f32 },
    NoteOffScale { track_id: u32, scale_index: i32 },
    SetParam { track_id: u32, param_id: u32, value: f32 },
    SetTempo { bpm: f32 },
    SetArp { track_id: u32, enabled: bool, octaves: u32, pattern: u32 },
    SetArpStep { track_id: u32, idx: usize, value: u8 },
    SetDrumsEnabled { track_id: u32, enabled: bool },
    SetDrumPattern { track_id: u32, drum_idx: u32, step_idx: u32, value: u8 },
    SetDrumParams { track_id: u32, drum_idx: u32, level: f32, tune: f32, decay: f32 },
    SetMix { master: f32, synth: f32, drums: f32, send_synth: f32, send_drums: f32 },
    SetFx { drive: f32, del_en: bool, del_beats: f32, del_fb: f32, del_ret: f32, rev_en: bool, rev_dec: f32, rev_damp: f32, rev_ret: f32 },
    SetScale { root_note: u32, scale_type: u32 },
    SetGridStep { track_id: u32, step: u32, active: bool, scale_index: u32, velocity: f32 },
    SetGridSteps { track_id: u32, num_steps: u32 },
    SetRecording { enabled: bool },
    AddModRouting { track_id: u32, source: u32, dest: u32, amount: f32 },
    RemoveModRouting { track_id: u32, source: u32, dest: u32 },
}

pub struct EventIter<'a> {
    data: &'a [f32],
    index: usize,
}

impl<'a> EventIter<'a> {
    pub fn new(data: &'a [f32]) -> Self {
        Self { data, index: 0 }
    }
}

impl<'a> Iterator for EventIter<'a> {
    type Item = Event;

    fn next(&mut self) -> Option<Self::Item> {
        if self.index >= self.data.len() {
            return None;
        }

        let event_id = self.data[self.index] as u32;
        self.index += 1;

        let res = match event_id {
            1 => {
                let e = Event::NoteOn {
                    track_id: self.data[self.index] as u32,
                    note: self.data[self.index + 1] as u8,
                    velocity: self.data[self.index + 2],
                };
                self.index += 3;
                Some(e)
            }
            2 => {
                let e = Event::NoteOff {
                    track_id: self.data[self.index] as u32,
                    note: self.data[self.index + 1] as u8,
                };
                self.index += 2;
                Some(e)
            }
            3 => {
                let e = Event::NoteOnScale {
                    track_id: self.data[self.index] as u32,
                    scale_index: self.data[self.index + 1] as i32,
                    velocity: self.data[self.index + 2],
                };
                self.index += 3;
                Some(e)
            }
            4 => {
                let e = Event::NoteOffScale {
                    track_id: self.data[self.index] as u32,
                    scale_index: self.data[self.index + 1] as i32,
                };
                self.index += 2;
                Some(e)
            }
            5 => {
                let e = Event::SetParam {
                    track_id: self.data[self.index] as u32,
                    param_id: self.data[self.index + 1] as u32,
                    value: self.data[self.index + 2],
                };
                self.index += 3;
                Some(e)
            }
            6 => {
                let e = Event::SetTempo {
                    bpm: self.data[self.index],
                };
                self.index += 1;
                Some(e)
            }
            7 => {
                let e = Event::SetArp {
                    track_id: self.data[self.index] as u32,
                    enabled: self.data[self.index + 1] > 0.5,
                    octaves: self.data[self.index + 2] as u32,
                    pattern: self.data[self.index + 3] as u32,
                };
                self.index += 4;
                Some(e)
            }
            8 => {
                let e = Event::SetArpStep {
                    track_id: self.data[self.index] as u32,
                    idx: self.data[self.index + 1] as usize,
                    value: self.data[self.index + 2] as u8,
                };
                self.index += 3;
                Some(e)
            }
            9 => {
                let e = Event::SetDrumsEnabled {
                    track_id: self.data[self.index] as u32,
                    enabled: self.data[self.index + 1] > 0.5,
                };
                self.index += 2;
                Some(e)
            }
            10 => {
                let e = Event::SetDrumPattern {
                    track_id: self.data[self.index] as u32,
                    drum_idx: self.data[self.index + 1] as u32,
                    step_idx: self.data[self.index + 2] as u32,
                    value: self.data[self.index + 3] as u8,
                };
                self.index += 4;
                Some(e)
            }
            11 => {
                let e = Event::SetDrumParams {
                    track_id: self.data[self.index] as u32,
                    drum_idx: self.data[self.index + 1] as u32,
                    level: self.data[self.index + 2],
                    tune: self.data[self.index + 3],
                    decay: self.data[self.index + 4],
                };
                self.index += 5;
                Some(e)
            }
            12 => {
                let e = Event::SetMix {
                    master: self.data[self.index],
                    synth: self.data[self.index + 1],
                    drums: self.data[self.index + 2],
                    send_synth: self.data[self.index + 3],
                    send_drums: self.data[self.index + 4],
                };
                self.index += 5;
                Some(e)
            }
            13 => {
                let e = Event::SetFx {
                    drive: self.data[self.index],
                    del_en: self.data[self.index + 1] > 0.5,
                    del_beats: self.data[self.index + 2],
                    del_fb: self.data[self.index + 3],
                    del_ret: self.data[self.index + 4],
                    rev_en: self.data[self.index + 5] > 0.5,
                    rev_dec: self.data[self.index + 6],
                    rev_damp: self.data[self.index + 7],
                    rev_ret: self.data[self.index + 8],
                };
                self.index += 9;
                Some(e)
            }
            14 => {
                let e = Event::SetScale {
                    root_note: self.data[self.index] as u32,
                    scale_type: self.data[self.index + 1] as u32,
                };
                self.index += 2;
                Some(e)
            }
            15 => {
                let e = Event::SetGridStep {
                    track_id: self.data[self.index] as u32,
                    step: self.data[self.index + 1] as u32,
                    active: self.data[self.index + 2] > 0.5,
                    scale_index: self.data[self.index + 3] as u32,
                    velocity: self.data[self.index + 4],
                };
                self.index += 5;
                Some(e)
            }
            16 => {
                let e = Event::SetGridSteps {
                    track_id: self.data[self.index] as u32,
                    num_steps: self.data[self.index + 1] as u32,
                };
                self.index += 2;
                Some(e)
            }
            17 => {
                let e = Event::SetRecording {
                    enabled: self.data[self.index] > 0.5,
                };
                self.index += 1;
                Some(e)
            }
            18 => {
                let e = Event::AddModRouting {
                    track_id: self.data[self.index] as u32,
                    source: self.data[self.index + 1] as u32,
                    dest: self.data[self.index + 2] as u32,
                    amount: self.data[self.index + 3],
                };
                self.index += 4;
                Some(e)
            }
            19 => {
                let e = Event::RemoveModRouting {
                    track_id: self.data[self.index] as u32,
                    source: self.data[self.index + 1] as u32,
                    dest: self.data[self.index + 2] as u32,
                };
                self.index += 3;
                Some(e)
            }
            _ => None,
        };

        if res.is_none() {
            // fast forward to end to stop iteration
            self.index = self.data.len();
        }
        res
    }
}
