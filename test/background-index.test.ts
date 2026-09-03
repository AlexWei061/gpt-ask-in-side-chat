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

const openOptionsPage = vi.fn(async () => {});
const localGet = vi.fn(async (..._keys: unknown[]): Promise<Record<string, unknown>> => { throw new Error("storage failed"); });
Object.assign(globalThis, {
  chrome: {
    runtime: { onInstalled: installed, onMessage: message, onConnect: connect, openOptionsPage },
    action: { onClicked: clicked },
    storage: {
      local: { get: localGet, set: vi.fn(), setAccessLevel: vi.fn() },
      session: { get: vi.fn(async (..._keys: unknown[]): Promise<Record<string, unknown>> => ({})), set: vi.fn(), remove: vi.fn(), setAccessLevel: vi.fn() },
    },
  },
});

const payload = { conversationId: "c1", mainMessages: [], quote: { text: "q", sourceRole: "user", sourceMessageIndex: 0 }, question: "question", attachments: [], compressOldContext: false };
const tick = () => new Promise((resolve) => setTimeout(resolve, 25));

let historyStore: { close: () => Promise<void> };
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

    const pending = new Promise<string>(() => {});
    stream.mockImplementation(() => pending);
    localGet.mockResolvedValueOnce({ "provider-config": { baseUrl: "https://api.example.com/v1", model: "model", contextWindowTokens: 4096, supportsImages: false }, "privacy-accepted": true });
    (globalThis.chrome.storage.session.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ "provider-api-key": { apiKey: "key", providerBaseUrl: "https://api.example.com/v1" } });
    const first = new FakePort("side-chat-stream");
    const second = new FakePort("side-chat-stream");
    connect.listener?.(first);
    connect.listener?.(second);
    first.onMessage.listener?.({ type: "start", requestId: "r1", payload });
    first.onMessage.listener?.({ type: "start", requestId: "r1", payload });
    await tick();
    expect(stream).toHaveBeenCalledOnce();
    second.onMessage.listener?.({ type: "abort", requestId: "r1" });
    expect(stream.mock.calls[0]?.[0].signal.aborted).toBe(false);
    first.onDisconnect.listener?.();
    expect(stream.mock.calls[0]?.[0].signal.aborted).toBe(true);
  });

  it("normalizes unknown runtime failures as storage failures", async () => {
    const response = vi.fn();
    expect(message.listener?.({ type: "settings:get" }, {}, response)).toBe(true);
    await tick();
    expect(response).toHaveBeenCalledWith({ ok: false, error: { code: "STORAGE_FAILED", message: "The extension could not complete the request.", retryable: false } });
  });

  it("normalizes unknown stream failures as retryable network failures", async () => {
    localGet.mockResolvedValueOnce({ "provider-config": { baseUrl: "https://api.example.com/v1", model: "model", contextWindowTokens: 4096, supportsImages: false }, "privacy-accepted": true });
    const sessionGet = (globalThis.chrome.storage.session.get as ReturnType<typeof vi.fn>);
    sessionGet.mockResolvedValueOnce({ "provider-api-key": { apiKey: "key", providerBaseUrl: "https://api.example.com/v1" } });
    stream.mockRejectedValueOnce(new Error("socket lost"));
    const port = new FakePort("side-chat-stream");
    connect.listener?.(port);
    port.onMessage.listener?.({ type: "start", requestId: "network", payload });
    await tick();
    expect(port.posted.at(-1)).toMatchObject({ type: "error", error: { code: "NETWORK_FAILED", retryable: true } });
  });
});
