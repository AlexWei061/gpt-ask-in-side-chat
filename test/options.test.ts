import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const savedConfig = { baseUrl: "https://api.example.com/v1", model: "model-a", contextWindowTokens: 128000, supportsImages: true };

function installChrome(settings: unknown, permission = true) {
  const sendMessage = vi.fn((message: { type: string }, callback: (response: unknown) => void) => {
    if (message.type === "settings:get") callback({ ok: true, value: settings });
    else callback({ ok: true });
  });
  const request = vi.fn(async () => permission);
  Object.defineProperty(globalThis, "chrome", { configurable: true, value: { runtime: { sendMessage, lastError: null }, permissions: { request } } });
  return { sendMessage, request };
}

async function loadOptions(): Promise<void> {
  await import("../src/options/index");
  await vi.waitFor(() => expect(document.querySelector<HTMLInputElement>("#base-url")).toBeTruthy());
}

beforeEach(() => { document.head.innerHTML = ""; document.body.innerHTML = '<main id="app"></main>'; });
afterEach(() => { vi.resetModules(); });

describe("options onboarding", () => {
  it("loads saved non-secret settings without exposing the session key", async () => {
    installChrome({ config: savedConfig, privacyAccepted: true, hasSessionKey: true });
    await loadOptions();
    expect(document.querySelector<HTMLInputElement>("#base-url")?.value).toBe(savedConfig.baseUrl);
    expect(document.querySelector<HTMLInputElement>("#model")?.value).toBe(savedConfig.model);
    expect(document.querySelector<HTMLInputElement>("#context-window")?.value).toBe("128000");
    expect(document.querySelector<HTMLInputElement>("#images")?.checked).toBe(true);
    expect(document.querySelector<HTMLInputElement>("#privacy")?.checked).toBe(true);
    expect(document.querySelector<HTMLInputElement>("#api-key")?.value).toBe("");
    expect(document.querySelector<HTMLInputElement>("#api-key")?.placeholder).toMatch(/already set/i);
  });

  it("requests only the normalized endpoint origin, saves settings, and keeps an existing blank key", async () => {
    const chromeMock = installChrome({ config: savedConfig, privacyAccepted: true, hasSessionKey: true });
    await loadOptions();
    document.querySelector<HTMLInputElement>("#base-url")!.value = "https://api.example.com/v1/";
    document.querySelector<HTMLFormElement>("#settings")!.requestSubmit();
    await vi.waitFor(() => expect(chromeMock.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "settings:save", config: savedConfig, privacyAccepted: true }), expect.any(Function)));
    expect(chromeMock.request).toHaveBeenCalledWith({ origins: ["https://api.example.com/*"] });
    expect(chromeMock.sendMessage.mock.calls.some(([value]) => value.type === "key:set")).toBe(false);
    expect(document.querySelector("#status")?.textContent).toMatch(/saved/i);
  });

  it("does not save before disclosure acceptance or when endpoint permission is denied", async () => {
    const chromeMock = installChrome({ config: null, privacyAccepted: false, hasSessionKey: false }, false);
    await loadOptions();
    document.querySelector<HTMLInputElement>("#base-url")!.value = "https://api.example.com/v1";
    document.querySelector<HTMLInputElement>("#model")!.value = "model";
    document.querySelector<HTMLInputElement>("#context-window")!.value = "4096";
    document.querySelector<HTMLFormElement>("#settings")!.requestSubmit();
    await vi.waitFor(() => expect(document.querySelector("#status")?.textContent).toMatch(/disclosure/i));
    expect(chromeMock.request).not.toHaveBeenCalled();
    document.querySelector<HTMLInputElement>("#privacy")!.checked = true;
    document.querySelector<HTMLFormElement>("#settings")!.requestSubmit();
    await vi.waitFor(() => expect(chromeMock.request).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(document.querySelector("#status")?.textContent).toMatch(/not granted/i));
    expect(chromeMock.sendMessage.mock.calls.some(([value]) => value.type === "settings:save")).toBe(false);
  });

  it("sets a newly entered key and exposes test, forget, and clear-all controls", async () => {
    const chromeMock = installChrome({ config: savedConfig, privacyAccepted: true, hasSessionKey: false });
    Object.defineProperty(window, "confirm", { configurable: true, value: vi.fn(() => true) });
    await loadOptions();
    document.querySelector<HTMLInputElement>("#api-key")!.value = "secret";
    document.querySelector<HTMLFormElement>("#settings")!.requestSubmit();
    await vi.waitFor(() => expect(chromeMock.sendMessage).toHaveBeenCalledWith({ type: "key:set", apiKey: "secret" }, expect.any(Function)));
    document.querySelector<HTMLButtonElement>("#test")!.click();
    await vi.waitFor(() => expect(chromeMock.sendMessage).toHaveBeenCalledWith({ type: "provider:test" }, expect.any(Function)));
    await vi.waitFor(() => expect(document.querySelector("#status")?.textContent).toMatch(/connection succeeded/i));
    document.querySelector<HTMLButtonElement>("#forget")!.click();
    await vi.waitFor(() => expect(chromeMock.sendMessage).toHaveBeenCalledWith({ type: "key:forget" }, expect.any(Function)));
    await vi.waitFor(() => expect(document.querySelector("#status")?.textContent).toMatch(/forgotten/i));
    document.querySelector<HTMLButtonElement>("#clear")!.click();
    await vi.waitFor(() => expect(chromeMock.sendMessage).toHaveBeenCalledWith({ type: "history:clear-all" }, expect.any(Function)));
  });
});
