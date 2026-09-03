import { describe, expect, it, vi } from "vitest";
import { ExtensionError } from "../src/shared/errors";
import { streamChatCompletion } from "../src/background/provider";

function sseResponse(text: string, status = 200): Response {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

const messages = [{ role: "user" as const, content: "Say hello" }];

describe("streamChatCompletion", () => {
  it("returns streamed text, reports deltas, and authenticates the request", async () => {
    const onDelta = vi.fn();
    const fetcher = vi.fn(async () => sseResponse(
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n' +
      "data: [DONE]\n\n",
    ));

    await expect(streamChatCompletion({
      fetcher,
      url: "https://api.example.com/v1/chat/completions",
      apiKey: "secret",
      model: "model-a",
      messages,
      onDelta,
    })).resolves.toBe("Hello world");

    expect(onDelta.mock.calls.map(([delta]) => delta)).toEqual(["Hello", " world"]);
    expect(fetcher).toHaveBeenCalledWith("https://api.example.com/v1/chat/completions", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer secret" }),
    }));
  });

  it("maps a rate limit response without exposing its body", async () => {
    const fetcher = vi.fn(async () => sseResponse("provider-private-detail", 429));

    const error = await streamChatCompletion({
      fetcher,
      url: "https://api.example.com/v1/chat/completions",
      apiKey: "secret",
      model: "model-a",
      messages,
      onDelta: vi.fn(),
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ExtensionError);
    expect(error).toMatchObject({ code: "RATE_LIMITED", retryable: true });
    expect((error as Error).message).not.toContain("provider-private-detail");
  });
});
