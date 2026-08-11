import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS === "true" ? "/nightfold/" : "/",
  server: {
    open: true,
  },
  build: {
    target: "es2022",
    outDir: "dist",
  },
});
