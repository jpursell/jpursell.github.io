import { defineConfig } from "vite";

export default defineConfig({
  // Works for both user pages and project pages without hardcoding repo name.
  base: "./",
  build: {
    target: "es2022"
  }
});

