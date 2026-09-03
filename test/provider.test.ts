import { describe, expect, it, vi } from "vitest";
import { ExtensionError } from "../src/shared/errors";
import { streamChatCompletion, type StreamArgs } from "../src/background/provider";

function sseResponse(text: string, status = 200): Response {
  return new Response(text, { status, headers: { "Content-Type": "text/event-stream" } });
}

function streamResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}

function args(overrides: Partial<StreamArgs> = {}): StreamArgs {
  return {
    fetcher: vi.fn(async () => sseResponse("data: [DONE]\n\n")),
    url: "https://api.example.com/v1/chat/completions",
    apiKey: "secret",
    model: "model-a",
    messages: [{ role: "user", content: "Say hello" }],
    signal: new AbortController().signal,
    onDelta: vi.fn(),
    ...overrides,
  };
}

function errorCode(error: unknown): string | undefined {
  return error instanceof ExtensionError ? error.code : undefined;
}

describe("streamChatCompletion", () => {
  it("returns streamed text, reports deltas, and authenticates the request", async () => {
    const onDelta = vi.fn();
    const fetcher = vi.fn(async () => sseResponse(
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n' +
      "data: [DONE]\n\n",
    ));

    await expect(streamChatCompletion(args({ fetcher, onDelta }))).resolves.toBe("Hello world");
    expect(onDelta.mock.calls.map(([delta]) => delta)).toEqual(["Hello", " world"]);
    expect(fetcher).toHaveBeenCalledWith("https://api.example.com/v1/chat/completions", expect.objectContaining({
      method: "POST", headers: expect.objectContaining({ Authorization: "Bearer secret" }),
    }));
  });

  it("maps a rate limit response without exposing its body", async () => {
    const error = await streamChatCompletion(args({
      fetcher: vi.fn(async () => sseResponse("provider-private-detail", 429)),
    })).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ExtensionError);
    expect(error).toMatchObject({ code: "RATE_LIMITED", retryable: true });
    expect((error as Error).message).not.toContain("provider-private-detail");
  });

  it("stops at DONE, cancels an open transport, and ignores trailing frames", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n' +
          "data: [DONE]\n\n" + 'data: {"choices":[{"delta":{"content":" ignored"}}]}\n\n',
        ));
      },
      cancel,
    });
    const onDelta = vi.fn();
    await expect(streamChatCompletion(args({ fetcher: vi.fn(async () => streamResponse(stream)), onDelta })))
      .resolves.toBe("Hello");
    expect(onDelta).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it.each(["", "not an SSE response", 'data: {"choices":[{"delta":{"content":"partial"}}]}'])(
    "rejects EOF without DONE for %j", async (body) => {
      const error = await streamChatCompletion(args({ fetcher: vi.fn(async () => sseResponse(body)) }))
        .catch((reason: unknown) => reason);
      expect(errorCode(error)).toBe("PROTOCOL_FAILED");
      expect((error as Error).message).not.toContain("partial");
    },
  );

  it("parses all data lines with CR, LF, and CRLF separators while ignoring SSE metadata", async () => {
    const onDelta = vi.fn();
    const body = ": comment\r" + "event: message\r" + "id: 1\r" +
      'data: {"choices":[{"delta":\rdata: {"content":"Hello"}}]}\r\rdata: [DONE]\n\n';
    await expect(streamChatCompletion(args({ fetcher: vi.fn(async () => sseResponse(body)), onDelta })))
      .resolves.toBe("Hello");
    expect(onDelta).toHaveBeenCalledWith("Hello");
  });

  it("maps a reader failure to a retryable network error and releases the reader", async () => {
    const stream = new ReadableStream<Uint8Array>({ pull: () => Promise.reject(new Error("socket lost")) });
    const error = await streamChatCompletion(args({ fetcher: vi.fn(async () => streamResponse(stream)) }))
      .catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code: "NETWORK_FAILED", retryable: true });
    expect(stream.locked).toBe(false);
  });

  it("preserves an onDelta exception while cancelling and releasing the reader", async () => {
    const callbackError = new Error("render failed");
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'));
      },
      cancel,
    });
    const error = await streamChatCompletion(args({
      fetcher: vi.fn(async () => streamResponse(stream)),
      onDelta: () => { throw callbackError; },
    })).catch((reason: unknown) => reason);
    expect(error).toBe(callbackError);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
  });

  it("decodes a UTF-8 SSE response split one byte at a time", async () => {
    const bytes = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hé"}}]}\n\ndata: [DONE]\n\n');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    });
    await expect(streamChatCompletion(args({ fetcher: vi.fn(async () => streamResponse(stream)) }))).resolves.toBe("hé");
  });

  it("preserves an aborted reader error", async () => {
    const controller = new AbortController();
    const abortError = new Error("request aborted");
    const stream = new ReadableStream<Uint8Array>({ pull: () => Promise.reject(abortError) });
    controller.abort();
    const error = await streamChatCompletion(args({
      fetcher: vi.fn(async () => streamResponse(stream)), signal: controller.signal,
    })).catch((reason: unknown) => reason);
    expect(error).toBe(abortError);
    expect(stream.locked).toBe(false);
  });

  it("allows role, finish, and usage chunks before DONE", async () => {
    const body = 'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n' +
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
      'data: {"usage":{"total_tokens":1}}\n\n' + "data: [DONE]\n\n";
    await expect(streamChatCompletion(args({ fetcher: vi.fn(async () => sseResponse(body)) }))).resolves.toBe("");
  });

  it("rejects a successful response without a readable body", async () => {
    const response = { ok: true, status: 200, body: null } as unknown as Response;
    const error = await streamChatCompletion(args({ fetcher: vi.fn(async () => response) }))
      .catch((reason: unknown) => reason);
    expect(errorCode(error)).toBe("PROTOCOL_FAILED");
  });

  it("rejects malformed provider envelopes without exposing payloads", async () => {
    const error = await streamChatCompletion(args({
      fetcher: vi.fn(async () => sseResponse('data: {"error":{"message":"private payload"}}\n\n')),
    })).catch((reason: unknown) => reason);
    expect(errorCode(error)).toBe("PROTOCOL_FAILED");
    expect((error as Error).message).not.toContain("private payload");
  });

  it("rejects a non-string delta content", async () => {
    const error = await streamChatCompletion(args({
      fetcher: vi.fn(async () => sseResponse('data: {"choices":[{"delta":{"content":7}}]}\n\n')),
    })).catch((reason: unknown) => reason);
    expect(errorCode(error)).toBe("PROTOCOL_FAILED");
  });

  it("retries request timeouts", async () => {
    const error = await streamChatCompletion(args({ fetcher: vi.fn(async () => sseResponse("", 408)) }))
      .catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code: "NETWORK_FAILED", retryable: true });
  });
});
