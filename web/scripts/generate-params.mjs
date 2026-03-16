import fs from 'fs';
import path from 'path';

const paramsPath = path.resolve('params.json');
const params = JSON.parse(fs.readFileSync(paramsPath, 'utf8'));

// 1. Generate TypeScript (web/src/audio/params.ts)
let tsContent = `// AUTO-GENERATED FILE. DO NOT EDIT.
// Run \`node scripts/generate-params.mjs\` to update.

`;

const tsIds = [];
params.forEach((param, i) => {
  const tsName = 'PARAM_' + param.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
  tsContent += `export const ${tsName} = ${i} as const;\n`;
  tsIds.push(i);
});

tsContent += `\nexport type SynthParamId = ${tsIds.join(' | ')};\n`;

fs.writeFileSync(path.resolve('web/src/audio/params.ts'), tsContent);
console.log('Wrote web/src/audio/params.ts');

// 2. Generate Rust (crates/synth_wasm/src/params.rs)
let rsContent = `// AUTO-GENERATED FILE. DO NOT EDIT.
// Run \`node scripts/generate-params.mjs\` to update.

#[repr(u32)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ParamId {
`;

params.forEach((param, i) => {
  rsContent += `    ${param} = ${i},\n`;
});

rsContent += `}

impl TryFrom<u32> for ParamId {
    type Error = ();

    fn try_from(v: u32) -> Result<Self, Self::Error> {
        match v {
`;

params.forEach((param, i) => {
  rsContent += `            ${i} => Ok(ParamId::${param}),\n`;
});

rsContent += `            _ => Err(()),
        }
    }
}
`;

fs.writeFileSync(path.resolve('crates/synth_wasm/src/params.rs'), rsContent);
console.log('Wrote crates/synth_wasm/src/params.rs');
