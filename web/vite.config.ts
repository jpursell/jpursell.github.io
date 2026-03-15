import { defineConfig } from "vite";
import { execSync } from "child_process";

let commitLog = "unknown";
try {
  commitLog = execSync('git log -1 --format="%h - %s"', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch (e) {
  console.warn("Could not get git commit log:", e);
}

export default defineConfig({
  // Works for both user pages and project pages without hardcoding repo name.
  base: "./",
  build: {
    target: "es2022"
  },
  define: {
    __COMMIT_LOG__: JSON.stringify(commitLog)
  }
});

