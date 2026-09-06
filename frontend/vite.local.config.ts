import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import { cpSync, renameSync, writeFileSync } from "node:fs";

export default defineConfig({
  plugins: [
    vue({ template: { transformAssetUrls: false } }),
    {
      name: "local-assets",
      generateBundle(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type !== "chunk") continue;
          for (const id of Object.keys(output.modules)) {
            if (
              /useAuth|wasm-parser|indexdb-storage|proto-converters|@ffmpeg/.test(
                id,
              )
            ) {
              this.error(
                `Local build must not depend on cloud/auth/WASM modules: ${id}`,
              );
            }
          }
        }
      },
      writeBundle() {
        const out = resolve(__dirname, "../web/localdist");
        renameSync(resolve(out, "local.html"), resolve(out, "index.html"));
        writeFileSync(resolve(out, ".gitkeep"), "");
        for (const dir of ["map", "weapons", "utility", "icons", "logo"])
          cpSync(resolve(__dirname, "public", dir), resolve(out, dir), {
            recursive: true,
          });
      },
    },
  ],
  publicDir: false,
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  build: {
    outDir: "../web/localdist",
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, "local.html") },
  },
});
