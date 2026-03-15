import { defineConfig } from "vite";
import { execSync } from "child_process";

const commitLog = execSync('git log -1 --format="%h - %s"').toString().trim();

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

