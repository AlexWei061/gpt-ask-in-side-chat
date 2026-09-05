import { beforeEach, describe, expect, it, vi } from "vitest";
import { chatCompletionsUrl, normalizeBaseUrl, permissionPattern } from "../src/background/permissions";
import {
  forgetSessionKey,
  loadInternalSettings,
  loadUiPreferences,
  normalizeWindowGeometry,
  publicSettings,
  restrictStorageAccess,
  saveProviderConfig,
  saveWindowGeometry,
  setSessionKey,
} from "../src/background/settings";

type StorageMock = {
  data: Record<string, unknown>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  setAccessLevel: ReturnType<typeof vi.fn>;
};

function createStorageMock(): StorageMock {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: vi.fn(async (keys: string | string[]) => {
      const requested = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(requested.flatMap((key) => key in data ? [[key, data[key]]] : []));
    }),
    set: vi.fn(async (values: Record<string, unknown>) => Object.assign(data, values)),
    remove: vi.fn(async (key: string) => { delete data[key]; }),
    setAccessLevel: vi.fn(async () => undefined),
  };
}

let local: StorageMock;
let session: StorageMock;

beforeEach(() => {
  local = createStorageMock();
  session = createStorageMock();
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: { storage: { local, session } },
  });
});

describe("provider settings", () => {
  it("allows HTTPS and local HTTP only", () => {
    expect(normalizeBaseUrl("https://api.example.com/v1/")).toBe("https://api.example.com/v1");
    expect(normalizeBaseUrl("http://localhost:11434/v1")).toBe("http://localhost:11434/v1");
    expect(() => normalizeBaseUrl("http://api.example.com/v1")).toThrow(/HTTPS/);
  });

  it("requests only the normalized provider origin", () => {
    expect(permissionPattern("https://api.example.com/v1")).toBe("https://api.example.com/*");
  });

  it("rejects credentials and removes every trailing path slash", () => {
    expect(() => normalizeBaseUrl("https://key:secret@api.example.com/v1")).toThrow(/凭据/);
    expect(chatCompletionsUrl("https://api.example.com/v1///")).toBe(
      "https://api.example.com/v1/chat/completions",
    );
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

  it("normalizes floating-window geometry and strips malformed values", () => {
    expect(normalizeWindowGeometry({ width: 500.4, height: 640.4, right: 32.4, bottom: 24.4 })).toEqual({ width: 500, height: 640, right: 32, bottom: 24 });
    expect(normalizeWindowGeometry({ width: 100, height: Infinity, right: -1, bottom: "bad" })).toEqual({ width: 340, height: 560, right: 12, bottom: 20 });
    expect(normalizeWindowGeometry(null)).toEqual({ width: 420, height: 560, right: 20, bottom: 20 });
  });

  it("loads saved geometry, or migrates the legacy panel width", async () => {
    local.data["window-geometry"] = { width: 520, height: 610, right: 34, bottom: 28, ignored: true };
    await expect(loadUiPreferences()).resolves.toEqual({ windowGeometry: { width: 520, height: 610, right: 34, bottom: 28 } });

    delete local.data["window-geometry"];
    local.data["panel-width"] = 700;
    await expect(loadUiPreferences()).resolves.toEqual({ windowGeometry: { width: 700, height: 560, right: 20, bottom: 20 } });
  });

  it("saves one normalized global floating-window geometry", async () => {
    await saveWindowGeometry({ width: 510.7, height: 619.6, right: 31.5, bottom: 23.5 });
    expect(local.data["window-geometry"]).toEqual({ width: 511, height: 620, right: 32, bottom: 24 });
  });

  it("fails closed for malformed stored provider configuration", async () => {
    local.data["provider-config"] = { baseUrl: "https://api.example.com", model: " ", contextWindowTokens: 0 };

    await expect(loadInternalSettings()).resolves.toMatchObject({ config: null, apiKey: null });
  });

  it("strips extra stored configuration fields from public settings", () => {
    const config = {
      baseUrl: "https://api.example.com/v1",
      model: "model-a",
      contextWindowTokens: 128000,
      supportsImages: false,
      apiKey: "must-not-leak",
    } as unknown as Parameters<typeof publicSettings>[0]["config"];

    expect(publicSettings({ config, privacyAccepted: true, apiKey: null }).config).toEqual({
      baseUrl: "https://api.example.com/v1",
      model: "model-a",
      contextWindowTokens: 128000,
      supportsImages: false,
    });
  });

  it("binds a session key to its current provider origin", async () => {
    const providerA = {
      baseUrl: "https://a.example.com/v1",
      model: "model-a",
      contextWindowTokens: 128000,
      supportsImages: false,
    };
    const providerB = { ...providerA, baseUrl: "https://b.example.com/v1" };

    await saveProviderConfig(providerA, true);
    await setSessionKey(" key-a ");
    await saveProviderConfig(providerB, true);
    await expect(loadInternalSettings()).resolves.toMatchObject({ config: providerB, apiKey: null });
    await setSessionKey("key-b");
    await expect(loadInternalSettings()).resolves.toMatchObject({ apiKey: "key-b" });
    expect(session.data["provider-api-key"]).toEqual({ apiKey: "key-b", providerBaseUrl: "https://b.example.com/v1" });
  });

  it("binds keys to the complete provider endpoint but not the selected model", async () => {
    const providerA = {
      baseUrl: "https://gateway.example.com/provider-a/v1",
      model: "model-a",
      contextWindowTokens: 128000,
      supportsImages: false,
    };
    const providerB = { ...providerA, baseUrl: "https://gateway.example.com/provider-b/v1" };

    await saveProviderConfig(providerA, true);
    await setSessionKey(" key-a ");
    await saveProviderConfig(providerB, true);
    await expect(loadInternalSettings()).resolves.toMatchObject({ apiKey: null });
    await saveProviderConfig({ ...providerA, model: "model-a-revised" }, true);
    await expect(loadInternalSettings()).resolves.toMatchObject({ apiKey: " key-a " });
  });

  it("rejects blank keys and preserves nonblank opaque key input", async () => {
    await saveProviderConfig({
      baseUrl: "https://api.example.com/v1",
      model: "model-a",
      contextWindowTokens: 128000,
      supportsImages: false,
    }, true);

    await expect(setSessionKey(" \t ")).rejects.toThrow(/请.*API 密钥/);
    await setSessionKey(" secret ");
    await expect(loadInternalSettings()).resolves.toMatchObject({ apiKey: " secret " });
  });

  it("restricts storage and manages only the expected local and session keys", async () => {
    const config = {
      baseUrl: "https://api.example.com/v1",
      model: "model-a",
      contextWindowTokens: 128000,
      supportsImages: false,
    };

    await restrictStorageAccess();
    await saveProviderConfig(config, true);
    await setSessionKey("secret");
    await forgetSessionKey();

    expect(local.setAccessLevel).toHaveBeenCalledWith({ accessLevel: "TRUSTED_CONTEXTS" });
    expect(session.setAccessLevel).toHaveBeenCalledWith({ accessLevel: "TRUSTED_CONTEXTS" });
    expect(local.set).toHaveBeenCalledWith({ "provider-config": config, "privacy-accepted": true });
    expect(session.set).toHaveBeenCalledWith({
      "provider-api-key": { apiKey: "secret", providerBaseUrl: "https://api.example.com/v1" },
    });
    expect(session.remove).toHaveBeenCalledWith("provider-api-key");
  });

  it("propagates storage errors", async () => {
    local.set.mockRejectedValueOnce(new Error("local unavailable"));
    await expect(saveProviderConfig({
      baseUrl: "https://api.example.com",
      model: "model-a",
      contextWindowTokens: 128000,
      supportsImages: false,
    }, true)).rejects.toThrow("local unavailable");
  });
});
