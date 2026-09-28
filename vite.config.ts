import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: { alias: [{ find: /^paper$/, replacement: "paper/dist/paper-core" }] },
  build: { license: { fileName: "third-party-licenses.md" } }
});
