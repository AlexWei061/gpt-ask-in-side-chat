import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("release manifest", () => {
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
});
