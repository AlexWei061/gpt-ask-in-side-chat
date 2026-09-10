import "fake-indexeddb/auto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const stream = vi.fn();
vi.mock("../src/background/provider", async (importOriginal) => ({ ...(await importOriginal<typeof import("../src/background/provider")>()), streamChatCompletion: stream }));

type Listener<T> = { listener?: T; addListener: (listener: T) => void };
const installed: Listener<(details: { reason: string }) => void> = { addListener(listener) { this.listener = listener; } };
const clicked: Listener<() => void> = { addListener(listener) { this.listener = listener; } };
const message: Listener<(request: unknown, sender: unknown, respond: (value: unknown) => void) => boolean> = { addListener(listener) { this.listener = listener; } };
const connect: Listener<(port: FakePort) => void> = { addListener(listener) { this.listener = listener; } };

class FakePort {
  readonly onMessage: Listener<(value: unknown) => void> = { addListener(listener) { this.listener = listener; } };
  readonly onDisconnect: Listener<() => void> = { addListener(listener) { this.listener = listener; } };
  readonly posted: unknown[] = [];
  constructor(readonly name: string) {}
  postMessage(value: unknown) { this.posted.push(value); }
}

function deferred() {
  let resolve: (() => void) | undefined;
  return { promise: new Promise<void>((done) => { resolve = done; }), resolve: () => resolve?.() };
}

const optionsSender = { url: "chrome-extension://test/options.html?embedded=1" };
const openOptionsPage = vi.fn(async () => {});
const localGet = vi.fn(async (..._keys: unknown[]): Promise<Record<string, unknown>> => { throw new Error("storage failed"); });
Object.assign(globalThis, {
  chrome: {
    runtime: { onInstalled: installed, onMessage: message, onConnect: connect, openOptionsPage, getPlatformInfo: vi.fn(async () => ({})), getURL: (path: string) => `chrome-extension://test/${path}` },
    action: { onClicked: clicked },
    storage: {
      local: { get: localGet, set: vi.fn(), remove: vi.fn(), setAccessLevel: vi.fn() },
    },
    permissions: { contains: vi.fn(async () => true) },
    tabs: { query: vi.fn(async () => [{ id: 1 }, { id: 2 }]), sendMessage: vi.fn(async () => undefined) },
  },
});

const payload = { conversationId: "c1", mainMessages: [{ index: 0, role: "user" as const, content: "q", links: [] }], quote: { text: "q", sourceRole: "user" as const, sourceMessageIndex: 0 }, question: "question", attachments: [], compressOldContext: false };

let historyStore: import("../src/background/history-store").HistoryStore;
beforeAll(async () => { ({ historyStore } = await import("../src/background/index")); });
afterAll(async () => { await historyStore.close(); });

describe("background listeners", () => {
  it("opens options for installation but not extension updates", () => {
    installed.listener?.({ reason: "update" });
    expect(openOptionsPage).not.toHaveBeenCalled();
    installed.listener?.({ reason: "install" });
    expect(openOptionsPage).toHaveBeenCalledOnce();
  });

  it("ignores wrong ports, ignores duplicate starts, isolates aborts, and aborts on disconnect", async () => {
    const wrong = new FakePort("other");
    connect.listener?.(wrong);
    expect(wrong.onMessage.listener).toBeUndefined();

    let rejectPending: ((reason: unknown) => void) | undefined;
    stream.mockImplementation(({ signal }) => new Promise<string>((_resolve, reject) => {
      rejectPending = reject;
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    localGet.mockResolvedValueOnce({ "provider-config": { baseUrl: "https://api.example.com/v1", model: "model", contextWindowTokens: 4096, supportsImages: false }, "privacy-accepted": true, "provider-api-key": { apiKey: "key", providerBaseUrl: "https://api.example.com/v1" } });
    const first = new FakePort("side-chat-stream");
    const second = new FakePort("side-chat-stream");
    connect.listener?.(first);
    connect.listener?.(second);
    first.onMessage.listener?.({ type: "start", requestId: "r1", payload });
    first.onMessage.listener?.({ type: "start", requestId: "r1", payload });
    await vi.waitFor(() => expect(stream).toHaveBeenCalledOnce());
    second.onMessage.listener?.({ type: "abort", requestId: "r1" });
    expect(stream.mock.calls[0]?.[0].signal.aborted).toBe(false);
    first.onDisconnect.listener?.();
    expect(stream.mock.calls[0]?.[0].signal.aborted).toBe(true);
    await vi.waitFor(() => expect(first.posted).toHaveLength(1));
    expect(rejectPending).toBeDefined();
  });

  it("normalizes unknown runtime failures as storage failures", async () => {
    const response = vi.fn();
    localGet.mockRejectedValueOnce(new Error("storage failed"));
    expect(message.listener?.({ type: "settings:get" }, {}, response)).toBe(true);
    await vi.waitFor(() => expect(response).toHaveBeenCalledWith({ ok: false, error: { code: "STORAGE_FAILED", message: "扩展无法完成请求。", retryable: false } }));
  });

  it("loads legacy window width and persists normalized floating geometry", async () => {
    localGet.mockResolvedValueOnce({ "panel-width": 650 });
    const loadResponse = vi.fn();
    message.listener?.({ type: "ui:get" }, {}, loadResponse);
    await vi.waitFor(() => expect(loadResponse).toHaveBeenCalledWith({ ok: true, value: { windowGeometry: { width: 650, height: 560, right: 20, bottom: 20 } } }));

    const localSet = globalThis.chrome.storage.local.set as ReturnType<typeof vi.fn>;
    localSet.mockClear();
    const saveResponse = vi.fn();
    message.listener?.({ type: "ui:set-geometry", geometry: { width: 100, height: 200, right: 0, bottom: 0 } }, {}, saveResponse);
    await vi.waitFor(() => expect(saveResponse).toHaveBeenCalledWith({ ok: true, value: { windowGeometry: { width: 340, height: 360, right: 12, bottom: 12 } } }));
    expect(localSet).toHaveBeenCalledWith({ "window-geometry": { width: 340, height: 360, right: 12, bottom: 12 } });
  });

  it("tests only the saved provider endpoint with the saved provider-bound key", async () => {
    localGet.mockResolvedValueOnce({ "provider-config": { baseUrl: "https://api.example.com/v1", model: "model", contextWindowTokens: 4096, supportsImages: false }, "privacy-accepted": true, "provider-api-key": { apiKey: "saved-key", providerBaseUrl: "https://api.example.com/v1" } });
    stream.mockResolvedValueOnce("OK");
    const response = vi.fn();
    expect(message.listener?.({ type: "provider:test", profileId: "legacy-provider" }, optionsSender, response)).toBe(true);
    await vi.waitFor(() => expect(response).toHaveBeenCalledWith({ ok: true }));
    expect(stream).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://api.example.com/v1/chat/completions",
      apiKey: "saved-key",
      model: "model",
      messages: [{ role: "user", content: "Reply with OK." }],
    }));
  });

  it("refuses a provider test until disclosure, config, and a saved key are present", async () => {
    localGet.mockResolvedValueOnce({ "provider-config": { baseUrl: "https://api.example.com/v1", model: "model", contextWindowTokens: 4096, supportsImages: false }, "privacy-accepted": false });
    const response = vi.fn();
    message.listener?.({ type: "provider:test", profileId: "legacy-provider" }, optionsSender, response);
    await vi.waitFor(() => expect(response).toHaveBeenCalledWith({ ok: false, error: expect.objectContaining({ code: "PERMISSION_REQUIRED" }) }));
    expect(stream).not.toHaveBeenCalled();
  });

  it("reports a missing runtime host permission before contacting the provider", async () => {
    localGet.mockResolvedValueOnce({ "provider-config": { baseUrl: "https://api.example.com/v1", model: "model", contextWindowTokens: 4096, supportsImages: false }, "privacy-accepted": true, "provider-api-key": { apiKey: "saved-key", providerBaseUrl: "https://api.example.com/v1" } });
    (globalThis.chrome.permissions.contains as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    const response = vi.fn(); message.listener?.({ type: "provider:test", profileId: "legacy-provider" }, optionsSender, response);
    await vi.waitFor(() => expect(response).toHaveBeenCalledWith({ ok: false, error: expect.objectContaining({ code: "PERMISSION_REQUIRED" }) }));
    expect(stream).not.toHaveBeenCalled();
  });

  it("aborts and settles active work before clearing its conversation", async () => {
    stream.mockImplementation(({ signal }) => new Promise<string>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    localGet.mockResolvedValueOnce({ "provider-config": { baseUrl: "https://api.example.com/v1", model: "model", contextWindowTokens: 4096, supportsImages: false }, "privacy-accepted": true, "provider-api-key": { apiKey: "key", providerBaseUrl: "https://api.example.com/v1" } });
    const port = new FakePort("side-chat-stream");
    connect.listener?.(port);
    port.onMessage.listener?.({ type: "start", requestId: "clear", payload: { ...payload, conversationId: "clear-me" } });
    await vi.waitFor(() => expect(stream).toHaveBeenCalled());
    const response = vi.fn();
    message.listener?.({ type: "history:clear", conversationId: "clear-me" }, {}, response);
    await vi.waitFor(() => expect(stream.mock.calls.at(-1)?.[0].signal.aborted).toBe(true));
    await vi.waitFor(() => expect(response).toHaveBeenCalledWith({ ok: true }));
  });

  it("keeps a conversation blocked until overlapping clears both settle", async () => {
    const first = deferred();
    const second = deferred();
    const remove = vi.spyOn(historyStore, "delete").mockImplementationOnce(async () => first.promise).mockImplementationOnce(async () => second.promise);
    const firstResponse = vi.fn();
    const secondResponse = vi.fn();
    message.listener?.({ type: "history:clear", conversationId: "overlap" }, {}, firstResponse);
    message.listener?.({ type: "history:clear", conversationId: "overlap" }, {}, secondResponse);
    await vi.waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
    const blocked = new FakePort("side-chat-stream");
    connect.listener?.(blocked);
    blocked.onMessage.listener?.({ type: "start", requestId: "blocked-one", payload: { ...payload, conversationId: "overlap" } });
    expect(blocked.posted.at(-1)).toMatchObject({ type: "error", error: { code: "STORAGE_FAILED" } });
    first.resolve();
    await vi.waitFor(() => expect(firstResponse).toHaveBeenCalledWith({ ok: true }));
    const stillBlocked = new FakePort("side-chat-stream");
    connect.listener?.(stillBlocked);
    stillBlocked.onMessage.listener?.({ type: "start", requestId: "blocked-two", payload: { ...payload, conversationId: "overlap" } });
    expect(stillBlocked.posted.at(-1)).toMatchObject({ type: "error", error: { code: "STORAGE_FAILED" } });
    second.resolve();
    await vi.waitFor(() => expect(secondResponse).toHaveBeenCalledWith({ ok: true }));
    remove.mockRestore();
  });

  it("keeps all conversations blocked until overlapping clear-all operations settle", async () => {
    const first = deferred();
    const second = deferred();
    const clear = vi.spyOn(historyStore, "clear").mockImplementationOnce(async () => first.promise).mockImplementationOnce(async () => second.promise);
    const firstResponse = vi.fn();
    const secondResponse = vi.fn();
    message.listener?.({ type: "history:clear-all" }, {}, firstResponse);
    message.listener?.({ type: "history:clear-all" }, {}, secondResponse);
    await vi.waitFor(() => expect(clear).toHaveBeenCalledTimes(2));
    first.resolve();
    await vi.waitFor(() => expect(firstResponse).toHaveBeenCalledWith({ ok: true }));
    const blocked = new FakePort("side-chat-stream");
    connect.listener?.(blocked);
    blocked.onMessage.listener?.({ type: "start", requestId: "blocked-all", payload: { ...payload, conversationId: "any" } });
    expect(blocked.posted.at(-1)).toMatchObject({ type: "error", error: { code: "STORAGE_FAILED" } });
    second.resolve();
    await vi.waitFor(() => expect(secondResponse).toHaveBeenCalledWith({ ok: true }));
    clear.mockRestore();
  });

  it("normalizes unknown stream failures as retryable network failures", async () => {
    localGet.mockResolvedValueOnce({ "provider-config": { baseUrl: "https://api.example.com/v1", model: "model", contextWindowTokens: 4096, supportsImages: false }, "privacy-accepted": true, "provider-api-key": { apiKey: "key", providerBaseUrl: "https://api.example.com/v1" } });
    stream.mockRejectedValueOnce(new Error("socket lost"));
    const port = new FakePort("side-chat-stream");
    connect.listener?.(port);
    port.onMessage.listener?.({ type: "start", requestId: "network", payload });
    await vi.waitFor(() => expect(port.posted.at(-1)).toMatchObject({ type: "error", error: { code: "NETWORK_FAILED", retryable: true } }));
  });

  it("keeps the service worker active while a model request is pending", async () => {
    vi.useFakeTimers();
    try {
      const getPlatformInfo = globalThis.chrome.runtime.getPlatformInfo as ReturnType<typeof vi.fn>;
      stream.mockImplementationOnce(({ signal }) => new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      }));
      localGet.mockResolvedValueOnce({ "provider-config": { baseUrl: "https://api.example.com/v1", model: "model", contextWindowTokens: 4096, supportsImages: false }, "privacy-accepted": true, "provider-api-key": { apiKey: "key", providerBaseUrl: "https://api.example.com/v1" } });
      const port = new FakePort("side-chat-stream");
      connect.listener?.(port);
      port.onMessage.listener?.({ type: "start", requestId: "slow", payload: { ...payload, conversationId: "slow-worker" } });

      await vi.advanceTimersByTimeAsync(0);
      expect(stream).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(25_000);
      expect(getPlatformInfo).toHaveBeenCalledOnce();

      port.onDisconnect.listener?.();
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("profile runtime routing", () => {
  const config = { baseUrl: "https://api.example.com/v1", model: "a", contextWindowTokens: 4096, supportsImages: false };
  const profiles = [
    { id: "a", name: "API A", config, key: { apiKey: "secret-a", providerBaseUrl: config.baseUrl } },
    { id: "b", name: "API B", config: { ...config, model: "b" }, key: { apiKey: "secret-b", providerBaseUrl: config.baseUrl } },
  ];
  const stored = () => ({ "provider-profiles": { schemaVersion: 1, profiles, activeProviderId: "a", privacyAccepted: true } });

  it("permits content selection and broadcasts only an invalidation signal", async () => {
    localGet.mockResolvedValueOnce(stored());
    const response = vi.fn();
    message.listener?.({ type: "settings:select", profileId: "b" }, { url: "https://chatgpt.com/c/abc" }, response);
    await vi.waitFor(() => expect(response).toHaveBeenCalledWith({ ok: true, value: expect.objectContaining({ activeProviderId: "b", config: { ...config, model: "b" } }) }));
    await vi.waitFor(() => expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, { type: "settings:changed" }));
    expect(JSON.stringify(response.mock.calls)).not.toContain("secret");
    expect(JSON.stringify((chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mock.calls)).not.toContain("secret");
  });

  it("restricts save, delete, key changes and provider testing to the options document", () => {
    for (const request of [
      { type: "settings:save", name: "API", config, privacyAccepted: true },
      { type: "settings:delete", profileId: "a" },
      { type: "key:set", profileId: "a", apiKey: "secret" },
      { type: "key:forget", profileId: "a" },
      { type: "provider:test", profileId: "a" },
    ]) {
      const response = vi.fn();
      message.listener?.(request, { url: "https://chatgpt.com/c/abc" }, response);
      expect(response).toHaveBeenCalledWith({ ok: false, error: expect.objectContaining({ code: "PERMISSION_REQUIRED" }) });
    }
    expect(localGet).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
  });

  it("tests the requested inactive profile with its own key", async () => {
    localGet.mockResolvedValueOnce(stored());
    stream.mockResolvedValueOnce("OK");
    const response = vi.fn();
    message.listener?.({ type: "provider:test", profileId: "b" }, optionsSender, response);
    await vi.waitFor(() => expect(response).toHaveBeenCalledWith({ ok: true }));
    expect(stream).toHaveBeenCalledWith(expect.objectContaining({ model: "b", apiKey: "secret-b" }));
  });

  it("returns saved profiles from an options mutation and invalidates existing content views", async () => {
    localGet.mockResolvedValueOnce(stored());
    const response = vi.fn();
    message.listener?.({ type: "settings:save", profileId: "b", name: "Renamed", config, privacyAccepted: true, apiKey: "replacement" }, optionsSender, response);
    await vi.waitFor(() => expect(response).toHaveBeenCalledWith({ ok: true, value: expect.objectContaining({ activeProviderId: "a", profiles: expect.arrayContaining([expect.objectContaining({ id: "b", name: "Renamed", hasSessionKey: true })]) }) }));
    await vi.waitFor(() => expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(2, { type: "settings:changed" }));
    expect(JSON.stringify(response.mock.calls)).not.toContain("replacement");
  });
});
