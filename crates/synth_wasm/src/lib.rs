#![allow(clippy::missing_safety_doc)]
#![allow(static_mut_refs)]

mod dsp;
mod events;
mod params;
mod synth;
mod voice;
mod arp;
mod drums;
mod fx;
mod mixer;
mod track;
mod scale;

use events::{Event, EventIter};
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
    with_synth_mut(|s| {
        for event in EventIter::new(events) {
            match event {
                Event::NoteOn { track_id, note, velocity } => s.note_on(track_id, note, velocity),
                Event::NoteOff { track_id, note } => s.note_off(track_id, note),
                Event::NoteOnScale { track_id, scale_index, velocity } => s.note_on_scale(track_id, scale_index, velocity),
                Event::NoteOffScale { track_id, scale_index } => s.note_off_scale(track_id, scale_index),
                Event::SetParam { track_id, param_id, value } => s.set_param(track_id, param_id, value),
                Event::SetTempo { bpm } => s.set_tempo(bpm),
                Event::SetArp { track_id, enabled, octaves, pattern } => s.set_arp(track_id, enabled, octaves, pattern),
                Event::SetArpStep { track_id, idx, value } => s.set_arp_step(track_id, idx, value),
                Event::SetDrumsEnabled { track_id, enabled } => s.set_drums_enabled(track_id, enabled),
                Event::SetDrumPattern { track_id, drum_idx, step_idx, value } => s.set_drum_pattern(track_id, drum_idx, step_idx, value),
                Event::SetDrumParams { track_id, drum_idx, level, tune, decay } => s.set_drum_params(track_id, drum_idx, level, tune, decay),
                Event::SetMix { master, synth, drums, send_synth, send_drums } => s.set_mix(master, synth, drums, send_synth, send_drums),
                Event::SetFx { drive, del_en, del_beats, del_fb, del_ret, rev_en, rev_dec, rev_damp, rev_ret } => s.set_fx(drive, del_en, del_beats, del_fb, del_ret, rev_en, rev_dec, rev_damp, rev_ret),
                Event::SetScale { root_note, scale_type } => s.set_scale(root_note, scale_type),
                Event::SetGridStep { track_id, step, active, scale_index, velocity } => s.set_grid_step(track_id, step, active, scale_index, velocity),
                Event::SetGridSteps { track_id, num_steps } => s.set_grid_steps(track_id, num_steps),
                Event::SetRecording { enabled } => s.set_recording(enabled),
                Event::AddModRouting { track_id, source, dest, amount } => s.add_mod_routing(track_id, source, dest, amount),
                Event::RemoveModRouting { track_id, source, dest } => s.remove_mod_routing(track_id, source, dest),
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