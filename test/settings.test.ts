import { beforeEach, describe, expect, it, vi } from "vitest";
import { chatCompletionsUrl, normalizeBaseUrl, permissionPattern } from "../src/background/permissions";
import {
  deleteProviderProfile, forgetSessionKey, loadInternalSettings, loadPublicSettings, loadUiPreferences,
  normalizeWindowGeometry, saveProviderProfile, saveWindowGeometry, selectProviderProfile, setSessionKey,
} from "../src/background/settings";
import type { ProviderConfig } from "../src/shared/types";

function createStorageMock() {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: vi.fn(async (keys: string | string[]) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).flatMap((key) => key in data ? [[key, structuredClone(data[key])]] : []))),
    set: vi.fn(async (values: Record<string, unknown>) => Object.assign(data, structuredClone(values))),
    remove: vi.fn(async (keys: string | string[]) => { for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]; }),
    setAccessLevel: vi.fn(async () => undefined),
  };
}
let local: ReturnType<typeof createStorageMock>;
const config: ProviderConfig = { baseUrl: "https://api.example.com/v1", model: "model-a", contextWindowTokens: 128000, supportsImages: false };
const save = (name: string, apiKey?: string) => saveProviderProfile({ name, config, privacyAccepted: true, ...(apiKey === undefined ? {} : { apiKey }) });

beforeEach(() => {
  local = createStorageMock();
  Object.defineProperty(globalThis, "chrome", { configurable: true, value: { storage: { local } } });
});

describe("provider settings", () => {
  it("allows HTTPS and local HTTP only and normalizes provider origins", () => {
    expect(normalizeBaseUrl("https://api.example.com/v1/")).toBe("https://api.example.com/v1");
    expect(normalizeBaseUrl("http://localhost:11434/v1")).toBe("http://localhost:11434/v1");
    expect(() => normalizeBaseUrl("http://api.example.com/v1")).toThrow(/HTTPS/);
    expect(permissionPattern("https://api.example.com/v1")).toBe("https://api.example.com/*");
    expect(() => normalizeBaseUrl("https://key:secret@api.example.com/v1")).toThrow(/凭据/);
    expect(chatCompletionsUrl("https://api.example.com/v1///")).toBe("https://api.example.com/v1/chat/completions");
  });

  it("starts empty and activates only the first new profile", async () => {
    await expect(loadPublicSettings()).resolves.toEqual({ profiles: [], activeProviderId: null, config: null, privacyAccepted: false, hasSessionKey: false });
    const first = await save("A", "key-a");
    const second = await save("B", "key-b");
    expect(second.activeProviderId).toBe(first.activeProviderId);
    expect(second.profiles.map((profile) => profile.name)).toEqual(["A", "B"]);
    expect(second.profiles.every((profile) => profile.hasSessionKey)).toBe(true);
    expect(JSON.stringify(second)).not.toContain("key-a");
    expect(JSON.stringify(second)).not.toContain("apiKey");
  });

  it("migrates the legacy provider and matching endpoint key once, preserving privacy and UI", async () => {
    Object.assign(local.data, { "provider-config": { ...config, apiKey: "must-not-leak" }, "provider-api-key": { apiKey: "legacy-secret", providerBaseUrl: config.baseUrl }, "privacy-accepted": true, "panel-width": 700 });
    const settings = await loadPublicSettings();
    expect(settings).toMatchObject({ activeProviderId: "legacy-provider", config, privacyAccepted: true, hasSessionKey: true });
    expect(settings.profiles).toEqual([{ id: "legacy-provider", name: "默认 API", config, hasSessionKey: true }]);
    await expect(loadInternalSettings()).resolves.toEqual({ config, privacyAccepted: true, apiKey: "legacy-secret" });
    expect(local.set).toHaveBeenCalledOnce();
    expect(local.data).not.toHaveProperty("provider-config");
    expect(local.data).not.toHaveProperty("provider-api-key");
    expect(local.data["panel-width"]).toBe(700);
    expect(JSON.stringify(settings)).not.toContain("secret");
    expect(JSON.stringify(settings)).not.toContain("must-not-leak");
    expect(local.set.mock.invocationCallOrder[0]).toBeLessThan(local.remove.mock.invocationCallOrder[0]!);
  });

  it("does not migrate a key bound to another endpoint or an invalid legacy config", async () => {
    Object.assign(local.data, { "provider-config": config, "provider-api-key": { apiKey: "secret", providerBaseUrl: "https://other.example.com/v1" } });
    await expect(loadInternalSettings()).resolves.toMatchObject({ config, apiKey: null });
    delete local.data["provider-profiles"];
    local.data["provider-config"] = { ...config, model: " " };
    await expect(loadInternalSettings()).resolves.toMatchObject({ config: null, apiKey: null });
  });

  it("preserves legacy data when migration cannot save", async () => {
    local.data["provider-config"] = config;
    local.data["provider-api-key"] = { apiKey: "secret", providerBaseUrl: config.baseUrl };
    local.set.mockRejectedValueOnce(new Error("local unavailable"));
    await expect(loadPublicSettings()).rejects.toThrow("local unavailable");
    expect(local.data["provider-config"]).toEqual(config);
    expect(local.data["provider-api-key"]).toBeDefined();
    expect(local.remove).not.toHaveBeenCalled();
  });

  it("does not revive legacy settings when the new store is malformed or intentionally empty", async () => {
    local.data["provider-config"] = config;
    local.data["provider-profiles"] = {};
    await expect(loadPublicSettings()).rejects.toThrow();
    local.data["provider-profiles"] = { schemaVersion: 1, profiles: [], activeProviderId: null, privacyAccepted: true };
    await expect(loadPublicSettings()).resolves.toMatchObject({ profiles: [], activeProviderId: null });
  });

  it("isolates different keys for profiles using the same endpoint and survives module reload", async () => {
    const a = (await save("A", " key-a ")).activeProviderId!;
    const b = (await save("B", "key-b")).profiles[1]!.id;
    await selectProviderProfile(b);
    await expect(loadInternalSettings()).resolves.toEqual({ config, privacyAccepted: true, apiKey: "key-b" });
    await expect(loadInternalSettings(a)).resolves.toEqual({ config, privacyAccepted: true, apiKey: " key-a " });
    vi.resetModules();
    const reloaded = await import("../src/background/settings");
    await expect(reloaded.loadInternalSettings()).resolves.toEqual({ config, privacyAccepted: true, apiKey: "key-b" });
  });

  it("keeps a key for model edits and blank input, but permanently clears it when the full endpoint changes", async () => {
    const id = (await save("A", "secret")).activeProviderId!;
    const modelConfig = { ...config, model: "revised" };
    await saveProviderProfile({ profileId: id, name: "Renamed", config: modelConfig, privacyAccepted: true, apiKey: " " });
    await expect(loadInternalSettings(id)).resolves.toMatchObject({ config: modelConfig, apiKey: "secret" });
    await saveProviderProfile({ profileId: id, name: "Renamed", config: { ...config, baseUrl: "https://api.example.com/other/v1" }, privacyAccepted: true });
    await expect(loadInternalSettings(id)).resolves.toMatchObject({ apiKey: null });
    await saveProviderProfile({ profileId: id, name: "Renamed", config, privacyAccepted: true });
    await expect(loadInternalSettings(id)).resolves.toMatchObject({ apiKey: null });
  });

  it("can atomically save a changed endpoint with its new key", async () => {
    const id = (await save("A", "old")).activeProviderId!;
    const changed = { ...config, baseUrl: "https://b.example.com/v1" };
    await saveProviderProfile({ profileId: id, name: "B", config: changed, privacyAccepted: true, apiKey: "new" });
    await expect(loadInternalSettings()).resolves.toEqual({ config: changed, privacyAccepted: true, apiKey: "new" });
  });

  it("forgets only the requested profile key and preserves UI and other keys", async () => {
    const a = (await save("A", "key-a")).activeProviderId!;
    const b = (await save("B", "key-b")).profiles[1]!.id;
    await saveWindowGeometry({ width: 500, height: 600, right: 20, bottom: 20 });
    await forgetSessionKey(a);
    await expect(loadInternalSettings(a)).resolves.toMatchObject({ config, apiKey: null });
    await expect(loadInternalSettings(b)).resolves.toMatchObject({ apiKey: "key-b" });
    await expect(loadUiPreferences()).resolves.toEqual({ windowGeometry: { width: 500, height: 600, right: 20, bottom: 20 } });
  });

  it("rejects missing profile IDs instead of silently targeting the active profile", async () => {
    await save("A", "key-a");
    await expect(selectProviderProfile("missing")).rejects.toThrow(/不存在/);
    await expect(deleteProviderProfile("missing")).rejects.toThrow(/不存在/);
    await expect(loadInternalSettings("missing")).rejects.toThrow(/不存在/);
    await expect(setSessionKey("secret", "missing")).rejects.toThrow(/不存在/);
    await expect(forgetSessionKey("missing")).rejects.toThrow(/不存在/);
    await expect(saveProviderProfile({ profileId: "missing", name: "B", config, privacyAccepted: true })).rejects.toThrow(/不存在/);
    expect((await loadPublicSettings()).profiles).toHaveLength(1);
  });

  it("deletes a nonactive profile without switching and selects the first survivor when deleting current", async () => {
    const a = (await save("A")).activeProviderId!;
    const b = (await save("B")).profiles[1]!.id;
    const c = (await save("C")).profiles[2]!.id;
    expect((await deleteProviderProfile(b)).activeProviderId).toBe(a);
    expect((await deleteProviderProfile(a)).activeProviderId).toBe(c);
    await expect(deleteProviderProfile(c)).resolves.toMatchObject({ profiles: [], activeProviderId: null, config: null, hasSessionKey: false });
  });

  it("serializes simultaneous additions and key changes without losing profiles", async () => {
    await Promise.all([save("A", "a"), save("B", "b"), save("C", "c")]);
    const settings = await loadPublicSettings();
    expect(settings.profiles.map((profile) => profile.name)).toEqual(["A", "B", "C"]);
    await Promise.all(settings.profiles.map((profile) => setSessionKey(profile.name, profile.id)));
    expect((await Promise.all(settings.profiles.map((profile) => loadInternalSettings(profile.id)))).map((setting) => setting.apiKey)).toEqual(["A", "B", "C"]);
  });

  it("restricts access before writing secrets and refuses to save if restriction fails", async () => {
    await save("A", "secret");
    expect(local.setAccessLevel).toHaveBeenCalledWith({ accessLevel: "TRUSTED_CONTEXTS" });
    expect(local.setAccessLevel.mock.invocationCallOrder[0]).toBeLessThan(local.set.mock.invocationCallOrder[0]!);
    const before = structuredClone(local.data);
    local.setAccessLevel.mockRejectedValueOnce(new Error("access restriction failed"));
    await expect(save("B", "secret-b")).rejects.toThrow("access restriction failed");
    expect(local.data).toEqual(before);
  });

  it("validates profile fields and preserves nonblank opaque key input", async () => {
    await expect(save(" ")).rejects.toThrow(/API 名称/);
    const id = (await save("A")).activeProviderId!;
    await expect(setSessionKey(" \t ", id)).rejects.toThrow(/API 密钥/);
    await setSessionKey(" secret ", id);
    await expect(loadInternalSettings(id)).resolves.toMatchObject({ apiKey: " secret " });
    await expect(saveProviderProfile({ name: "B", config: { ...config, contextWindowTokens: 1 }, privacyAccepted: true })).rejects.toThrow(/上下文窗口/);
  });

  it("normalizes, loads and saves global floating geometry including legacy width", async () => {
    expect(normalizeWindowGeometry({ width: 500.4, height: 640.4, right: 32.4, bottom: 24.4 })).toEqual({ width: 500, height: 640, right: 32, bottom: 24 });
    expect(normalizeWindowGeometry({ width: 100, height: Infinity, right: -1, bottom: "bad" })).toEqual({ width: 340, height: 560, right: 12, bottom: 20 });
    expect(normalizeWindowGeometry(null)).toEqual({ width: 420, height: 560, right: 20, bottom: 20 });
    local.data["panel-width"] = 700;
    await expect(loadUiPreferences()).resolves.toEqual({ windowGeometry: { width: 700, height: 560, right: 20, bottom: 20 } });
    await saveWindowGeometry({ width: 510.7, height: 619.6, right: 31.5, bottom: 23.5 });
    expect(local.data["window-geometry"]).toEqual({ width: 511, height: 620, right: 32, bottom: 24 });
  });
});
