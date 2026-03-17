// AUTO-GENERATED FILE. DO NOT EDIT.
// Run `node scripts/generate-params.mjs` to update.

#[repr(u32)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ParamId {
    Waveform = 0,
    Cutoff = 1,
    Attack = 2,
    Release = 3,
    Volume = 4,
    Resonance = 5,
    Decay = 6,
    Sustain = 7,
    FilterEnvAmt = 8,
    Osc2Waveform = 9,
    OscMix = 10,
    DetuneCents = 11,
    Osc2Semitones = 12,
    Glide = 13,
    Keytrack = 14,
    Noise = 15,
    FiltAttack = 16,
    FiltDecay = 17,
    FiltSustain = 18,
    FiltRelease = 19,
    Lfo1Rate = 20,
    Lfo1Shape = 21,
    Lfo2Rate = 22,
    Lfo2Shape = 23,
    OscFm = 24,
    ShaperAmt = 25,
    FilterType = 26,
    CombTime = 27,
    CombFeedback = 28,
    CombMix = 29,
}

impl TryFrom<u32> for ParamId {
    type Error = ();

    fn try_from(v: u32) -> Result<Self, Self::Error> {
        match v {
            0 => Ok(ParamId::Waveform),
            1 => Ok(ParamId::Cutoff),
            2 => Ok(ParamId::Attack),
            3 => Ok(ParamId::Release),
            4 => Ok(ParamId::Volume),
            5 => Ok(ParamId::Resonance),
            6 => Ok(ParamId::Decay),
            7 => Ok(ParamId::Sustain),
            8 => Ok(ParamId::FilterEnvAmt),
            9 => Ok(ParamId::Osc2Waveform),
            10 => Ok(ParamId::OscMix),
            11 => Ok(ParamId::DetuneCents),
            12 => Ok(ParamId::Osc2Semitones),
            13 => Ok(ParamId::Glide),
            14 => Ok(ParamId::Keytrack),
            15 => Ok(ParamId::Noise),
            16 => Ok(ParamId::FiltAttack),
            17 => Ok(ParamId::FiltDecay),
            18 => Ok(ParamId::FiltSustain),
            19 => Ok(ParamId::FiltRelease),
            20 => Ok(ParamId::Lfo1Rate),
            21 => Ok(ParamId::Lfo1Shape),
            22 => Ok(ParamId::Lfo2Rate),
            23 => Ok(ParamId::Lfo2Shape),
            24 => Ok(ParamId::OscFm),
            25 => Ok(ParamId::ShaperAmt),
            26 => Ok(ParamId::FilterType),
            27 => Ok(ParamId::CombTime),
            28 => Ok(ParamId::CombFeedback),
            29 => Ok(ParamId::CombMix),
            _ => Err(()),
        }
    }
}
