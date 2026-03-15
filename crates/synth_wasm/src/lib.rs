#![allow(clippy::missing_safety_doc)]
#![allow(static_mut_refs)]

mod dsp;
mod params;
mod synth;
mod voice;

use synth::Synth;

const MAX_FRAMES: usize = 128;

static mut SYNTH: Option<Synth> = None;
static mut OUT_BUF: Option<Vec<f32>> = None;

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
