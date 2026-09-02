import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
const run = promisify(execFile);

describe("release manifest", () => {
  beforeAll(async () => { await run(process.execPath, ["scripts/build.mjs"]); });
  it("uses MV3 and the minimum fixed permissions", async () => {
    const manifest = JSON.parse(await readFile("public/manifest.json", "utf8"));

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(["storage"]);
    expect(manifest.content_scripts[0].matches).toEqual(["https://chatgpt.com/*"]);
    expect(manifest.optional_host_permissions).toEqual([
      "https://*/*",
      "http://localhost/*",
      "http://127.0.0.1/*",
    ]);
    expect(manifest).not.toHaveProperty("host_permissions");
  });

  it("emits the bundles referenced by the manifest", async () => {
    const files = ["background.js", "content.js", "options.js", "manifest.json", "options.html", "pdf.worker.min.mjs", "icons/icon-16.png", "icons/icon-32.png", "icons/icon-48.png", "icons/icon-128.png"];
    const present = await Promise.all(
      files.map(async (file) => {
        try {
          await readFile(`dist/${file}`);
          return file;
        } catch {
          return null;
        }
      }),
    );

    expect(present).toEqual(files);
  });
});
