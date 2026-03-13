import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const args = new Set(process.argv.slice(2));
const release = args.has("--release");

function run(cmd, cmdArgs, cwd) {
  execFileSync(cmd, cmdArgs, { cwd, stdio: "inherit" });
}

const cargoArgs = ["build", "-p", "synth_wasm", "--target", "wasm32-unknown-unknown"];
if (release) cargoArgs.push("--release");

run("cargo", cargoArgs, repoRoot);

const profile = release ? "release" : "debug";
const wasmIn = path.join(
  repoRoot,
  "target",
  "wasm32-unknown-unknown",
  profile,
  "synth_wasm.wasm"
);
const wasmOutDir = path.join(repoRoot, "web", "public", "wasm");
mkdirSync(wasmOutDir, { recursive: true });
const wasmOut = path.join(wasmOutDir, "synth.wasm");
copyFileSync(wasmIn, wasmOut);


