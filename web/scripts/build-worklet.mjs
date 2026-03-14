import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");

const entry = path.join(webRoot, "src", "audio", "worklet.ts");
const outFile = path.join(webRoot, "public", "worklet.js");

await build({
  entryPoints: [entry],
  outfile: outFile,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  sourcemap: false,
  minify: false,
  legalComments: "none",
  banner: {
    js:
      "// AudioWorkletProcessor entrypoint.\n" +
      "// Generated from src/audio/worklet.ts; do not edit by hand.\n"
  }
});
