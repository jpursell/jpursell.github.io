#![allow(clippy::missing_safety_doc)]
#![allow(static_mut_refs)]

mod dsp;
mod params;
mod synth;
mod voice;
mod arp;
mod drums;
mod fx;
mod track;
mod scale;

use synth::Synth;

const MAX_FRAMES: usize = 128;
const MAX_TRANSFER: usize = 1024 * 512; // 512k samples (~12MB)

static mut SYNTH: Option<Synth> = None;
static mut OUT_BUF: Vec<f32> = Vec::new();
static mut TRANSFER_BUF: Vec<f32> = Vec::new();

#[inline]
unsafe fn with_synth_mut<R>(f: impl FnOnce(&mut Synth) -> R) -> Option<R> {
    SYNTH.as_mut().map(f)
}

/// Initialize synth and preallocate buffers.
#[no_mangle]
pub unsafe extern "C" fn init(sample_rate: f32) {
    SYNTH = Some(Synth::new(sample_rate));
    
    OUT_BUF = vec![0.0; MAX_FRAMES];
    TRANSFER_BUF = vec![0.0; MAX_TRANSFER];
}

#[no_mangle]
pub unsafe extern "C" fn get_transfer_ptr() -> *mut f32 {
    TRANSFER_BUF.as_mut_ptr()
}

#[no_mangle]
pub unsafe extern "C" fn set_drum_sample(track_id: u32, drum_idx: u32, ptr: *const f32, len: usize, sr: f32) {
    let _ = with_synth_mut(|s| {
        let samples = std::slice::from_raw_parts(ptr, len).to_vec();
        s.set_drum_sample(track_id, drum_idx, samples, sr);
    });
}

#[no_mangle]
pub unsafe extern "C" fn process_events(ptr: *const f32, len: usize) {
    let events = std::slice::from_raw_parts(ptr, len);
    let mut i = 0;
    with_synth_mut(|s| {
        while i < len {
            let event_id = events[i] as u32;
            i += 1;
            match event_id {
                1 => { // note_on(track_id, note, velocity)
                    let track_id = events[i] as u32;
                    let note = events[i+1] as u8;
                    let velocity = events[i+2];
                    s.note_on(track_id, note, velocity);
                    i += 3;
                }
                2 => { // note_off(track_id, note)
                    let track_id = events[i] as u32;
                    let note = events[i+1] as u8;
                    s.note_off(track_id, note);
                    i += 2;
                }
                3 => { // note_on_scale(track_id, scale_index, velocity)
                    let track_id = events[i] as u32;
                    let scale_index = events[i+1] as i32;
                    let velocity = events[i+2];
                    s.note_on_scale(track_id, scale_index, velocity);
                    i += 3;
                }
                4 => { // note_off_scale(track_id, scale_index)
                    let track_id = events[i] as u32;
                    let scale_index = events[i+1] as i32;
                    s.note_off_scale(track_id, scale_index);
                    i += 2;
                }
                5 => { // set_param(track_id, param_id, value)
                    let track_id = events[i] as u32;
                    let param_id = events[i+1] as u32;
                    let value = events[i+2];
                    s.set_param(track_id, param_id, value);
                    i += 3;
                }
                6 => { // set_tempo(bpm)
                    let bpm = events[i];
                    s.set_tempo(bpm);
                    i += 1;
                }
                7 => { // set_arp(track_id, enabled, octaves, pattern)
                    let track_id = events[i] as u32;
                    let enabled = events[i+1] > 0.5;
                    let octaves = events[i+2] as u32;
                    let pattern = events[i+3] as u32;
                    s.set_arp(track_id, enabled, octaves, pattern);
                    i += 4;
                }
                8 => { // set_arp_step(track_id, idx, value)
                    let track_id = events[i] as u32;
                    let idx = events[i+1] as usize;
                    let value = events[i+2] as u8;
                    s.set_arp_step(track_id, idx, value);
                    i += 3;
                }
                9 => { // set_drums_enabled(track_id, enabled)
                    let track_id = events[i] as u32;
                    let enabled = events[i+1] > 0.5;
                    s.set_drums_enabled(track_id, enabled);
                    i += 2;
                }
                10 => { // set_drum_pattern(track_id, drum_idx, step_idx, value)
                    let track_id = events[i] as u32;
                    let drum_idx = events[i+1] as u32;
                    let step_idx = events[i+2] as u32;
                    let value = events[i+3] as u8;
                    s.set_drum_pattern(track_id, drum_idx, step_idx, value);
                    i += 4;
                }
                11 => { // set_drum_params(track_id, drum_idx, level, tune, decay)
                    let track_id = events[i] as u32;
                    let drum_idx = events[i+1] as u32;
                    let level = events[i+2];
                    let tune = events[i+3];
                    let decay = events[i+4];
                    s.set_drum_params(track_id, drum_idx, level, tune, decay);
                    i += 5;
                }
                12 => { // set_mix(master, synth, drums, send_synth, send_drums)
                    let master = events[i];
                    let synth = events[i+1];
                    let drums = events[i+2];
                    let send_synth = events[i+3];
                    let send_drums = events[i+4];
                    s.set_mix(master, synth, drums, send_synth, send_drums);
                    i += 5;
                }
                13 => { // set_fx(drive, del_en, del_beats, del_fb, del_ret, rev_en, rev_dec, rev_damp, rev_ret)
                    let drive = events[i];
                    let del_en = events[i+1] > 0.5;
                    let del_beats = events[i+2];
                    let del_fb = events[i+3];
                    let del_ret = events[i+4];
                    let rev_en = events[i+5] > 0.5;
                    let rev_dec = events[i+6];
                    let rev_damp = events[i+7];
                    let rev_ret = events[i+8];
                    s.set_fx(drive, del_en, del_beats, del_fb, del_ret, rev_en, rev_dec, rev_damp, rev_ret);
                    i += 9;
                }
                14 => { // set_scale(root_note, scale_type)
                    let root_note = events[i] as u32;
                    let scale_type = events[i+1] as u32;
                    s.set_scale(root_note, scale_type);
                    i += 2;
                }
                15 => { // set_grid_step(track_id, step, active, scale_index, velocity)
                    let track_id = events[i] as u32;
                    let step = events[i+1] as u32;
                    let active = events[i+2] > 0.5;
                    let scale_index = events[i+3] as u32;
                    let velocity = events[i+4];
                    s.set_grid_step(track_id, step, active, scale_index, velocity);
                    i += 5;
                }
                16 => { // set_grid_steps(track_id, num_steps)
                    let track_id = events[i] as u32;
                    let num_steps = events[i+1] as u32;
                    s.set_grid_steps(track_id, num_steps);
                    i += 2;
                }
                17 => { // set_recording(enabled)
                    let enabled = events[i] > 0.5;
                    s.set_recording(enabled);
                    i += 1;
                }
                18 => { // add_mod_routing(track_id, source, dest, amount)
                    let track_id = events[i] as u32;
                    let source = events[i+1] as u32;
                    let dest = events[i+2] as u32;
                    let amount = events[i+3];
                    s.add_mod_routing(track_id, source, dest, amount);
                    i += 4;
                }
                19 => { // remove_mod_routing(track_id, source, dest)
                    let track_id = events[i] as u32;
                    let source = events[i+1] as u32;
                    let dest = events[i+2] as u32;
                    s.remove_mod_routing(track_id, source, dest);
                    i += 3;
                }
                _ => break,
            }
        }
    });
}

/// Render `frames` samples into the internal buffer and return a pointer to it.
/// The returned pointer stays valid until the next call to `render`.
#[no_mangle]
pub unsafe extern "C" fn render(frames: usize) -> *const f32 {
    let frames = frames.clamp(1, MAX_FRAMES);
    let (Some(s), buf) = (SYNTH.as_mut(), &mut OUT_BUF) else {
        return core::ptr::null();
    };
    s.render_into(&mut buf[..frames]);
    buf.as_ptr()
}
