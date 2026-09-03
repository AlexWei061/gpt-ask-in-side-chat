import { describe, expect, it } from "vitest";
import { normalizeBaseUrl, permissionPattern } from "../src/background/permissions";
import { clampPanelWidth, publicSettings } from "../src/background/settings";

describe("provider settings", () => {
  it("allows HTTPS and local HTTP only", () => {
    expect(normalizeBaseUrl("https://api.example.com/v1/")).toBe("https://api.example.com/v1");
    expect(normalizeBaseUrl("http://localhost:11434/v1")).toBe("http://localhost:11434/v1");
    expect(() => normalizeBaseUrl("http://api.example.com/v1")).toThrow(/HTTPS/);
  });

  it("requests only the normalized provider origin", () => {
    expect(permissionPattern("https://api.example.com/v1")).toBe("https://api.example.com/*");
  });

  it("never returns the API key in public settings", () => {
    expect(publicSettings({
      config: {
        baseUrl: "https://api.example.com/v1",
        model: "model-a",
        contextWindowTokens: 128000,
        supportsImages: false,
      },
      privacyAccepted: true,
      apiKey: "secret",
    })).toEqual({
      config: {
        baseUrl: "https://api.example.com/v1",
        model: "model-a",
        contextWindowTokens: 128000,
        supportsImages: false,
      },
      privacyAccepted: true,
      hasSessionKey: true,
    });
  });

  it("keeps the docked panel width inside the supported range", () => {
    expect(clampPanelWidth(100)).toBe(320);
    expect(clampPanelWidth(420.4)).toBe(420);
    expect(clampPanelWidth(1200)).toBe(960);
  });
});
