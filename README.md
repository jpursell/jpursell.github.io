# jpursell.github.io

This repo hosts a small static synth you can play with your thumbs.

## Local dev

Prereqs: Rust + Node.js.

```bash
cd web
npm install
npm run dev
```

The Rust DSP engine is compiled to WebAssembly and copied to `web/public/wasm/synth.wasm` as part of the `npm` scripts.

## Deploy

GitHub Actions builds the Wasm + Vite bundle and deploys `web/dist` to GitHub Pages.
