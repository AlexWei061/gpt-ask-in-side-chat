import { describe, expect, it, vi } from "vitest";
import { ChatService, type ChatServiceDependencies } from "../src/background/chat-service";
import { ExtensionError } from "../src/shared/errors";
import type { SendPayload, SideChatRecord } from "../src/shared/types";

const config = { baseUrl: "https://api.example.com/v1", model: "model-a", contextWindowTokens: 4096, supportsImages: false };
const payload: SendPayload = {
  conversationId: "conversation-1",
  mainMessages: [{ index: 0, role: "user", content: "main context", links: [] }],
  quote: { text: "main context", sourceRole: "user", sourceMessageIndex: 0 },
  question: "What does this mean?",
  attachments: [],
  compressOldContext: false,
};

class MemoryHistory {
  record: SideChatRecord | null = null;
  async get(): Promise<SideChatRecord | null> { return this.record; }
  async put(record: SideChatRecord): Promise<void> { this.record = record; }
}

function createService(overrides: Partial<ChatServiceDependencies> = {}) {
  const history = new MemoryHistory();
  const stream = vi.fn(async ({ onDelta }: Parameters<ChatServiceDependencies["stream"]>[0]) => {
    onDelta("Hello");
    return "Hello";
  });
  return {
    history,
    stream,
    service: new ChatService({
      history,
      loadSettings: async () => ({ config, privacyAccepted: true, apiKey: "key" }),
      stream,
      ...overrides,
    }),
  };
}

function errorCode(error: unknown): string | undefined {
  return error instanceof ExtensionError ? error.code : undefined;
}

describe("ChatService", () => {
  it("emits accepted and deltas then persists a successful exchange", async () => {
    const { service, history } = createService();
    const events: unknown[] = [];

    const record = await service.send(payload, new AbortController().signal, (event) => events.push(event));

    expect(events).toEqual([expect.objectContaining({ type: "accepted" }), { type: "delta", text: "Hello" }]);
    expect(record.messages.map(({ role, content, status }) => ({ role, content, status }))).toEqual([
      { role: "user", content: payload.question, status: "complete" },
      { role: "assistant", content: "Hello", status: "complete" },
    ]);
    expect(history.record).toEqual(record);
  });

  it("persists partial assistant text as incomplete when the stream fails", async () => {
    const failure = new Error("connection lost");
    const { service, history } = createService({ stream: async ({ onDelta }) => { onDelta("Partial"); throw failure; } });

    await expect(service.send(payload, new AbortController().signal, () => {})).rejects.toBe(failure);
    expect(history.record?.messages.at(-1)).toMatchObject({ role: "assistant", content: "Partial", status: "incomplete" });
  });

  it.each([
    [{ config, privacyAccepted: false, apiKey: "key" }, "PERMISSION_REQUIRED"],
    [{ config: null, privacyAccepted: true, apiKey: "key" }, "PERMISSION_REQUIRED"],
    [{ config, privacyAccepted: true, apiKey: null }, "KEY_REQUIRED"],
  ] as const)("rejects unavailable settings with %s", async (settings, code) => {
    const { service } = createService({ loadSettings: async () => settings });
    const error = await service.send(payload, new AbortController().signal, () => {}).catch((reason: unknown) => reason);
    expect(errorCode(error)).toBe(code);
  });

  it("rejects images when the configured provider cannot accept them", async () => {
    const { service } = createService();
    const error = await service.send({ ...payload, attachments: [{ kind: "image", name: "a.png", sourceMessageIndex: 0, dataUrl: "data:image/png;base64,AA" }] }, new AbortController().signal, () => {}).catch((reason: unknown) => reason);
    expect(errorCode(error)).toBe("ATTACHMENT_FAILED");
  });

  it("uses persisted history rather than client-supplied history", async () => {
    const previous: SideChatRecord = { schemaVersion: 1, conversationId: payload.conversationId, messages: [{ id: "old", role: "assistant", content: "persisted", status: "complete", createdAt: new Date(0).toISOString() }], updatedAt: new Date(0).toISOString() };
    const { service, stream, history } = createService();
    // The public payload type intentionally has no sideMessages field.
    history.record = previous;
    await service.send(payload, new AbortController().signal, () => {});
    expect(JSON.stringify(stream.mock.calls[0]?.[0].messages)).toContain("persisted");
  });

  it("does not stream an overflow unless compression was explicitly requested", async () => {
    const { service, stream } = createService({ loadSettings: async () => ({ config: { ...config, contextWindowTokens: 1024 }, privacyAccepted: true, apiKey: "key" }) });
    const error = await service.send({ ...payload, mainMessages: [{ index: 0, role: "user", content: "x".repeat(5_000), links: [] }] }, new AbortController().signal, () => {}).catch((reason: unknown) => reason);
    expect(errorCode(error)).toBe("CONTEXT_OVERFLOW");
    expect(stream).not.toHaveBeenCalled();
  });

  it("compresses on explicit overflow, rechecks budget, and accepts a zero-delta completion", async () => {
    const stream = vi.fn(async ({ messages }: Parameters<ChatServiceDependencies["stream"]>[0]) =>
      JSON.stringify(messages).includes("faithful summary") ? "Completed without delta" : "faithful summary",
    );
    const { service, history } = createService({ stream, loadSettings: async () => ({ config: { ...config, contextWindowTokens: 1024 }, privacyAccepted: true, apiKey: "key" }) });
    const record = await service.send({ ...payload, mainMessages: [{ index: 0, role: "user", content: "x".repeat(5_000), links: [] }], compressOldContext: true }, new AbortController().signal, () => {});
    expect(stream).toHaveBeenCalledTimes(2);
    expect(record.messages.at(-1)).toMatchObject({ content: "Completed without delta", status: "complete" });
    expect(history.record).toEqual(record);
  });

  it("passes the abort signal through and avoids saving an empty assistant", async () => {
    const controller = new AbortController();
    const abort = new Error("aborted");
    const abortedStream = vi.fn(async ({ signal }: Parameters<ChatServiceDependencies["stream"]>[0]) => { expect(signal).toBe(controller.signal); throw abort; });
    const { service, history } = createService({ stream: abortedStream });
    await expect(service.send(payload, controller.signal, () => {})).rejects.toBe(abort);
    expect(abortedStream).toHaveBeenCalledOnce();
    expect(history.record?.messages).toHaveLength(1);
  });
});
