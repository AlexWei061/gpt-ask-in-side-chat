import { ZipArchive } from "archiver";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const katexDirectory = path.dirname(require.resolve("katex/dist/katex.min.css"));
const katexFonts = (await readdir(path.join(katexDirectory, "fonts")))
  .filter((file) => file.endsWith(".woff2"));
const expectedFiles = [
  "background.js", "content.js", "icons/icon-16.png", "icons/icon-32.png", "icons/icon-48.png", "icons/icon-128.png",
  "katex/LICENSE", "katex/katex.min.css", ...katexFonts.map((font) => `katex/fonts/${font}`),
  "manifest.json", "options.html", "options.js", "pdf.worker.min.mjs",
].sort();

async function filesUnder(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? filesUnder(path.join(directory, entry.name), `${prefix}${entry.name}/`)
    : Promise.resolve([`${prefix}${entry.name}`])));
  return files.flat().sort();
}

const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
if (typeof manifest.version !== "string" || !/^\d+(?:\.\d+){0,3}$/.test(manifest.version)) throw new Error("Release manifest version is invalid.");
const files = await filesUnder("dist");
if (JSON.stringify(files) !== JSON.stringify(expectedFiles)) throw new Error(`Unexpected production files: ${files.join(", ")}`);
if ("host_permissions" in manifest) throw new Error("The production package contains the E2E-only host permission.");
if (files.some((file) => file.endsWith(".map"))) throw new Error("Source maps must not be included in the release package.");
for (const file of files.filter((name) => /\.(?:js|json|html)$/.test(name))) {
  const text = await readFile(path.join("dist", file), "utf8");
  if (text.includes("test-key") || text.includes("api.example.test")) throw new Error(`Test data found in dist/${file}.`);
}

await mkdir("release", { recursive: true });
const target = `release/side-chat-companion-${manifest.version}.zip`;
const output = createWriteStream(target);
const archive = new ZipArchive({ zlib: { level: 9 } });
const completed = new Promise((resolve, reject) => {
  output.once("close", resolve); output.once("error", reject); archive.once("error", reject);
});
archive.pipe(output);
archive.directory("dist", false);
await archive.finalize();
await completed;
console.log(`Created ${target} (${archive.pointer()} bytes)`);
