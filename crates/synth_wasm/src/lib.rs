#![allow(clippy::missing_safety_doc)]
#![allow(static_mut_refs)]

mod dsp;
mod params;
mod synth;
mod voice;
mod arp;
mod drums;
mod fx;

use synth::Synth;

const MAX_FRAMES: usize = 128;
const MAX_SAMPLE_TRANSFER: usize = 1024 * 512; // 512k samples (~12MB)

static mut SYNTH: Option<Synth> = None;
static mut OUT_BUF: Option<Vec<f32>> = None;
static mut SAMPLE_TRANSFER_BUF: Option<Vec<f32>> = None;

#[inline]
unsafe fn with_synth_mut<R>(f: impl FnOnce(&mut Synth) -> R) -> Option<R> {
    SYNTH.as_mut().map(f)
}

/// Initialize synth and preallocate the audio buffer.
#[no_mangle]
pub unsafe extern "C" fn init(sample_rate: f32) {
    SYNTH = Some(Synth::new(sample_rate));
    let mut v = Vec::with_capacity(MAX_FRAMES);
    v.resize(MAX_FRAMES, 0.0);
    OUT_BUF = Some(v);

    let mut stb = Vec::with_capacity(MAX_SAMPLE_TRANSFER);
    stb.resize(MAX_SAMPLE_TRANSFER, 0.0);
    SAMPLE_TRANSFER_BUF = Some(stb);
}

#[no_mangle]
pub unsafe extern "C" fn get_sample_transfer_ptr() -> *mut f32 {
    SAMPLE_TRANSFER_BUF.as_mut().map(|v| v.as_mut_ptr()).unwrap_or(core::ptr::null_mut())
}

#[no_mangle]
pub unsafe extern "C" fn note_on(note: u8, velocity: f32) {
    let _ = with_synth_mut(|s| s.note_on(note, velocity));
}

#[no_mangle]
pub unsafe extern "C" fn note_off(note: u8) {
    let _ = with_synth_mut(|s| s.note_off(note));
}

#[no_mangle]
pub unsafe extern "C" fn set_param(param_id: u32, value: f32) {
    let _ = with_synth_mut(|s| s.set_param(param_id, value));
}

#[no_mangle]
pub unsafe extern "C" fn add_mod_routing(source: u32, dest: u32, amount: f32) {
    let _ = with_synth_mut(|s| s.add_mod_routing(source, dest, amount));
}

#[no_mangle]
pub unsafe extern "C" fn remove_mod_routing(source: u32, dest: u32) {
    let _ = with_synth_mut(|s| s.remove_mod_routing(source, dest));
}

#[no_mangle]
pub unsafe extern "C" fn set_tempo(bpm: f32) {
    let _ = with_synth_mut(|s| s.set_tempo(bpm));
}

#[no_mangle]
pub unsafe extern "C" fn set_arp(enabled: bool, octaves: u32, pattern: u32) {
    let _ = with_synth_mut(|s| s.set_arp(enabled, octaves, pattern));
}

#[no_mangle]
pub unsafe extern "C" fn set_arp_step(idx: usize, value: u8) {
    let _ = with_synth_mut(|s| s.set_arp_step(idx, value));
}

#[no_mangle]
pub unsafe extern "C" fn set_drums_enabled(enabled: bool) {
    let _ = with_synth_mut(|s| s.set_drums_enabled(enabled));
}

#[no_mangle]
pub unsafe extern "C" fn set_drum_pattern(drum_idx: u32, step_idx: u32, value: u8) {
    let _ = with_synth_mut(|s| s.set_drum_pattern(drum_idx, step_idx, value));
}

#[no_mangle]
pub unsafe extern "C" fn set_drum_params(drum_idx: u32, level: f32, tune: f32, decay: f32) {
    let _ = with_synth_mut(|s| s.set_drum_params(drum_idx, level, tune, decay));
}

#[no_mangle]
pub unsafe extern "C" fn set_drum_sample(drum_idx: u32, ptr: *const f32, len: usize, sr: f32) {
    let _ = with_synth_mut(|s| {
        let samples = std::slice::from_raw_parts(ptr, len).to_vec();
        s.set_drum_sample(drum_idx, samples, sr);
    });
}

#[no_mangle]
pub unsafe extern "C" fn set_mix(master: f32, synth: f32, drums: f32, send_synth: f32, send_drums: f32) {
    let _ = with_synth_mut(|s| s.set_mix(master, synth, drums, send_synth, send_drums));
}

#[no_mangle]
pub unsafe extern "C" fn set_fx(
    drive: f32,
    delay_enabled: bool,
    delay_beats: f32,
    delay_feedback: f32,
    delay_return: f32,
    reverb_enabled: bool,
    reverb_decay: f32,
    reverb_damp: f32,
    reverb_return: f32,
) {
    let _ = with_synth_mut(|s| {
        s.set_fx(
            drive,
            delay_enabled,
            delay_beats,
            delay_feedback,
            delay_return,
            reverb_enabled,
            reverb_decay,
            reverb_damp,
            reverb_return,
        )
    });
}

/// Render `frames` samples into the internal buffer and return a pointer to it.
/// The returned pointer stays valid until the next call to `render`.
#[no_mangle]
pub unsafe extern "C" fn render(frames: usize) -> *const f32 {
    let frames = frames.clamp(1, MAX_FRAMES);
    let (Some(s), Some(buf)) = (SYNTH.as_mut(), OUT_BUF.as_mut()) else {
        return core::ptr::null();
    };
    s.render_into(&mut buf[..frames]);
    buf.as_ptr()
}
