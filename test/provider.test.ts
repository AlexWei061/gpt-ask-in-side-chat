import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  it("ignores nullable DeepSeek thinking deltas and streams only the visible answer", async () => {
    const onDelta = vi.fn();
    const body = 'data: {"choices":[{"delta":{"content":null,"reasoning_content":"private reasoning"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"OK","reasoning_content":null}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":null},"finish_reason":"stop"}]}\n\n' +
      "data: [DONE]\n\n";
    await expect(streamChatCompletion(args({ fetcher: vi.fn(async () => sseResponse(body)), onDelta }))).resolves.toBe("OK");
    expect(onDelta).toHaveBeenCalledOnce();
    expect(onDelta).toHaveBeenCalledWith("OK");
    expect(JSON.stringify(onDelta.mock.calls)).not.toContain("private reasoning");
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

  it("rejects a partial delta at EOF after reporting the partial update", async () => {
    const onDelta = vi.fn();
    const error = await streamChatCompletion(args({
      fetcher: vi.fn(async () => sseResponse('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n')),
      onDelta,
    })).catch((reason: unknown) => reason);
    expect(onDelta).toHaveBeenCalledWith("partial");
    expect(errorCode(error)).toBe("PROTOCOL_FAILED");
  });

  it("parses all data lines with CR, LF, and CRLF separators while ignoring SSE metadata", async () => {
    const onDelta = vi.fn();
    const body = ": comment\r" + "event: message\r" + "id: 1\r" +
      'data: {"choices":[{"delta":\rdata: {"content":"Hello"}}]}\r\rdata: [DONE]\n\n';
    await expect(streamChatCompletion(args({ fetcher: vi.fn(async () => sseResponse(body)), onDelta })))
      .resolves.toBe("Hello");
    expect(onDelta).toHaveBeenCalledWith("Hello");
  });

  it("accepts CRLF and mixed SSE blank-event boundaries", async () => {
    const body = 'data: {"choices":[{"delta":{"content":"A"}}]}\r\n\r\n' +
      'data: {"choices":[{"delta":{"content":"B"}}]}\n\r\n' + "data: [DONE]\r\n\r\n";
    await expect(streamChatCompletion(args({ fetcher: vi.fn(async () => sseResponse(body)) }))).resolves.toBe("AB");
  });

  it("keeps a CRLF multi-data event intact when transport splits after its first line ending", async () => {
    const firstChunk = 'data: {"choices":[{"delta":\r\n';
    const secondChunk = 'data: {"content":"Hello"}}]}\r\n\r\ndata: [DONE]\r\n\r\n';
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(firstChunk));
        controller.enqueue(new TextEncoder().encode(secondChunk));
        controller.close();
      },
    });
    const onDelta = vi.fn();
    await expect(streamChatCompletion(args({ fetcher: vi.fn(async () => streamResponse(stream)), onDelta })))
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
    controller.abort(abortError);
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
      fetcher: vi.fn(async () => sseResponse('data: {"error":{"message":"private payload"}}\n\ndata: [DONE]\n\n')),
    })).catch((reason: unknown) => reason);
    expect(errorCode(error)).toBe("PROTOCOL_FAILED");
    expect((error as Error).message).not.toContain("private payload");
  });

  it.each([
    ["rate_limit_exceeded", "RATE_LIMITED", true],
    ["invalid_api_key", "AUTHENTICATION_FAILED", false],
    ["context_length_exceeded", "CONTEXT_OVERFLOW", false],
    ["provider_failure", "NETWORK_FAILED", false],
  ] as const)("maps a streamed %s provider error envelope without exposing its message", async (providerCode, code, retryable) => {
    const error = await streamChatCompletion(args({
      fetcher: vi.fn(async () => sseResponse(`data: {"error":{"code":"${providerCode}","message":"private detail"}}\n\n`)),
    })).catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code, retryable });
    expect((error as Error).message).not.toContain("private detail");
  });

  it("rejects a non-string delta content", async () => {
    const error = await streamChatCompletion(args({
      fetcher: vi.fn(async () => sseResponse('data: {"choices":[{"delta":{"content":7}}]}\n\ndata: [DONE]\n\n')),
    })).catch((reason: unknown) => reason);
    expect(errorCode(error)).toBe("PROTOCOL_FAILED");
  });

  it("retries request timeouts", async () => {
    const error = await streamChatCompletion(args({ fetcher: vi.fn(async () => sseResponse("", 408)) }))
      .catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code: "NETWORK_FAILED", retryable: true });
  });

  it("cancels a non-OK response body without changing the sanitized status error", async () => {
    const cancel = vi.fn(() => Promise.reject(new Error("private cancellation failure")));
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }), { status: 429 });
    const error = await streamChatCompletion(args({ fetcher: vi.fn(async () => response) }))
      .catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code: "RATE_LIMITED", retryable: true });
    expect((error as Error).message).not.toContain("private cancellation failure");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  describe("network inactivity", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("times out a pending connection and aborts its transport without aborting the caller", async () => {
      const controller = new AbortController();
      const settled = vi.fn();
      const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      }));
      void streamChatCompletion(args({ fetcher, signal: controller.signal })).then(settled, settled);

      await vi.advanceTimersByTimeAsync(59_999);
      expect(settled).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toHaveBeenCalledWith(expect.objectContaining({ code: "NETWORK_FAILED", retryable: true, message: expect.stringContaining("超时") }));
      expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      expect(controller.signal.aborted).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each([false, true])("times out a stalled read after partial content = %s even when transport cleanup hangs", async (partial) => {
      const onDelta = vi.fn();
      const settled = vi.fn();
      const cancel = vi.fn(() => new Promise<void>(() => {}));
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          if (partial) controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'));
        },
        cancel,
      });
      void streamChatCompletion(args({ fetcher: vi.fn(async () => streamResponse(stream)), onDelta })).then(settled, settled);

      await vi.advanceTimersByTimeAsync(59_999);
      expect(settled).not.toHaveBeenCalled();
      expect(onDelta).toHaveBeenCalledTimes(partial ? 1 : 0);
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toHaveBeenCalledWith(expect.objectContaining({ code: "NETWORK_FAILED", retryable: true, message: expect.stringContaining("超时") }));
      expect(cancel).toHaveBeenCalledOnce();
      expect(stream.locked).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("starts a fresh read deadline after a slow connection", async () => {
      let connected!: (response: Response) => void;
      const settled = vi.fn();
      const stream = new ReadableStream<Uint8Array>();
      void streamChatCompletion(args({ fetcher: vi.fn(() => new Promise<Response>((resolve) => { connected = resolve; })) })).then(settled, settled);

      await vi.advanceTimersByTimeAsync(45_000);
      connected(streamResponse(stream));
      await vi.advanceTimersByTimeAsync(59_999);
      expect(settled).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toHaveBeenCalledWith(expect.objectContaining({ code: "NETWORK_FAILED", retryable: true }));
      expect(stream.locked).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("keeps a long stream alive as chunks arrive and clears the deadline at DONE", async () => {
      let source!: ReadableStreamDefaultController<Uint8Array>;
      const controller = new AbortController();
      const stream = new ReadableStream<Uint8Array>({ start(value) { source = value; } });
      const settled = vi.fn();
      const onDelta = vi.fn();
      void streamChatCompletion(args({ fetcher: vi.fn(async () => streamResponse(stream)), signal: controller.signal, onDelta })).then(settled, settled);

      for (const content of [": heartbeat\n\n", 'data: {"choices":[{"delta":{"reasoning_content":"thinking","content":null}}]}\n\n', 'data: {"choices":[{"delta":{"content":"answer"}}]}\n\n']) {
        await vi.advanceTimersByTimeAsync(45_000);
        expect(settled).not.toHaveBeenCalled();
        source.enqueue(new TextEncoder().encode(content));
        await vi.advanceTimersByTimeAsync(0);
      }
      await vi.advanceTimersByTimeAsync(45_000);
      expect(settled).not.toHaveBeenCalled();
      source.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toHaveBeenCalledWith("answer");
      expect(onDelta).toHaveBeenCalledExactlyOnceWith("answer");
      expect(vi.getTimerCount()).toBe(0);
      expect(stream.locked).toBe(false);
    });

    it.each(["connection", "read"])("preserves user cancellation during a pending %s and clears the deadline", async (phase) => {
      const controller = new AbortController();
      const abortError = new DOMException("User stopped the request", "AbortError");
      const settled = vi.fn();
      const stream = new ReadableStream<Uint8Array>();
      const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => phase === "read"
        ? Promise.resolve(streamResponse(stream))
        : new Promise<Response>((_resolve, reject) => { init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true }); }));
      void streamChatCompletion(args({ fetcher, signal: controller.signal })).then(settled, settled);

      await vi.advanceTimersByTimeAsync(5_000);
      controller.abort(abortError);
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toHaveBeenCalledWith(abortError);
      expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      expect(stream.locked).toBe(false);
    });

    it.each(["data: [DONE]\n\n", "data: invalid\n\n"])("does not wait for hanging cleanup after %j", async (body) => {
      const settled = vi.fn();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new TextEncoder().encode(body)); },
        cancel: () => new Promise<void>(() => {}),
      });
      void streamChatCompletion(args({ fetcher: vi.fn(async () => streamResponse(stream)) })).then(settled, settled);
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toHaveBeenCalledOnce();
      expect(settled).toHaveBeenCalledWith(body.includes("DONE") ? "" : expect.objectContaining({ code: "PROTOCOL_FAILED" }));
      expect(stream.locked).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("returns a sanitized HTTP error even when response-body cancellation hangs", async () => {
      const settled = vi.fn();
      const response = new Response(new ReadableStream<Uint8Array>({ cancel: () => new Promise<void>(() => {}) }), { status: 429 });
      void streamChatCompletion(args({ fetcher: vi.fn(async () => response) })).then(settled, settled);
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toHaveBeenCalledWith(expect.objectContaining({ code: "RATE_LIMITED", retryable: true }));
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
