import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { execSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let commitLog = "unknown";
try {
  commitLog = execSync('git log -1 --format="%h - %s"', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch (e) {
  console.warn("Could not get git commit log:", e);
}

function rustPlugin() {
  return {
    name: 'rust-wasm',
    buildStart() {
      const isRelease = process.env.NODE_ENV === 'production';
      const cargoArgs = ["build", "-p", "synth_wasm", "--target", "wasm32-unknown-unknown"];
      if (isRelease) cargoArgs.push("--release");

      const repoRoot = path.resolve(__dirname, "..");
      console.log(`Compiling Rust Wasm (${isRelease ? 'release' : 'debug'})...`);
      execFileSync("cargo", cargoArgs, { cwd: repoRoot, stdio: "inherit" });

      const profile = isRelease ? "release" : "debug";
      const wasmIn = path.join(
        repoRoot,
        "target",
        "wasm32-unknown-unknown",
        profile,
        "synth_wasm.wasm"
      );
      const wasmOutDir = path.join(repoRoot, "web", "public", "wasm");
      fs.mkdirSync(wasmOutDir, { recursive: true });
      const wasmOut = path.join(wasmOutDir, "synth.wasm");
      fs.copyFileSync(wasmIn, wasmOut);
    },
    handleHotUpdate({ file, server }: any) {
      if (file.endsWith('.rs') || file.endsWith('Cargo.toml')) {
        console.log(`Rust file changed: ${file}`);
        // triggering buildStart will rerun cargo
        // but maybe we just manually exec here and full reload
        const cargoArgs = ["build", "-p", "synth_wasm", "--target", "wasm32-unknown-unknown"];
        const repoRoot = path.resolve(__dirname, "..");
        execFileSync("cargo", cargoArgs, { cwd: repoRoot, stdio: "inherit" });
        const wasmIn = path.join(repoRoot, "target", "wasm32-unknown-unknown", "debug", "synth_wasm.wasm");
        const wasmOut = path.join(repoRoot, "web", "public", "wasm", "synth.wasm");
        fs.copyFileSync(wasmIn, wasmOut);
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    }
  };
}

export default defineConfig({
  base: "./",
  build: {
    target: "es2022"
  },
  define: {
    __COMMIT_LOG__: JSON.stringify(commitLog)
  },
  plugins: [preact(), rustPlugin()],
  worker: {
    format: "es"
  }
});
