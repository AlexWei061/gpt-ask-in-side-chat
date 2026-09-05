import { build } from "esbuild";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const pdfWorker = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
const katexCss = require.resolve("katex/dist/katex.min.css");
const katexFonts = path.join(path.dirname(katexCss), "fonts");
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await build({ entryPoints: ["src/background/index.ts"], outfile: "dist/background.js", bundle: true, format: "esm", target: "chrome122" });
await build({ entryPoints: { content: "src/content/index.ts", options: "src/options/index.ts" }, outdir: "dist", bundle: true, format: "iife", target: "chrome122", loader: { ".css": "text" } });
const manifest = JSON.parse(await readFile("public/manifest.json", "utf8"));
if (process.env.SIDECHAT_E2E === "1") manifest.host_permissions = ["https://api.example.test/*"];
await writeFile("dist/manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
await cp("public/options.html", "dist/options.html");
await cp("public/icons", "dist/icons", { recursive: true });
await cp(pdfWorker, path.join("dist", "pdf.worker.min.mjs"));
await mkdir(path.join("dist", "katex", "fonts"), { recursive: true });
await cp(katexCss, path.join("dist", "katex", "katex.min.css"));
for (const font of (await readdir(katexFonts)).filter((file) => file.endsWith(".woff2"))) {
  await cp(path.join(katexFonts, font), path.join("dist", "katex", "fonts", font));
}
