import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import devtools from "solid-devtools/vite";
import path from "path";
import tsconfigPaths from "vite-tsconfig-paths";
//import tailwindcss from '@tailwindcss/vite'; // Optional: remove if unnecessary

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    //tailwindcss(), // ⚠️ Optional — Tailwind works without this
    devtools(),
    solid(),
  ],
  server: {
    port: 3000,
  },
  build: {
    target: "esnext",
    //sourcemap: mode === 'development'
  },
  optimizeDeps: {
    include: ["@codemirror/state", "**/*.module.scss"],
  },
  css: {
    modules: {},
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
    },
  },
});

//export default defineConfig({
//  plugins: [
//    tsconfigPaths(),
//    solid(),
//    tailwindcss(), // ⚠️ Optional — Tailwind works without this
//  ],
//  build: {
//    target: 'esnext',
//  },
//  server: {
//    port: 3000,
//  },
//});
//

//import solid from 'vite-plugin-solid';
//import { defineConfig } from "vite"
//
//export default defineConfig({
//  plugins: [solid()],
//  resolve: {
//    alias: {
//      "~": path.resolve(__dirname, "./src")
//    }
//  }
//})
