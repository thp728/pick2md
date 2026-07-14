import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

const watch = process.argv.includes("--watch");

mkdirSync("dist", { recursive: true });
copyFileSync("manifest.json", "dist/manifest.json");

const options = {
  entryPoints: ["src/background.ts", "src/content.ts"],
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome110",
  sourcemap: true,
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(options);
  console.log("Build complete: dist/");
}
