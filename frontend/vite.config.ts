import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Em produção o app é servido em rmichelon79.github.io/orcamento-sopra/.
// No dev (command !== "build") fica no root.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/orcamento-sopra/" : "/",
  plugins: [react()],
}));
