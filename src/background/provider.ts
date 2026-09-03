import { ExtensionError } from "../shared/errors";

export type ChatCompletionContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };

export type ChatCompletionMessage = {
  role: "system" | "user" | "assistant";
  content: string | ChatCompletionContentPart[];
};

export type StreamArgs = {
  fetcher: typeof fetch;
  url: string;
  apiKey: string;
  model: string;
  messages: ChatCompletionMessage[];
  signal: AbortSignal;
  onDelta: (content: string) => void;
};

function responseError(status: number): ExtensionError {
  if (status === 401 || status === 403) {
    return new ExtensionError("AUTHENTICATION_FAILED", "Authentication with the AI provider failed.");
  }
  if (status === 429) {
    return new ExtensionError("RATE_LIMITED", "The AI provider rate limit was reached.", true);
  }
  return new ExtensionError(
    "NETWORK_FAILED",
    `The AI provider returned HTTP status ${status}.`,
    status === 408 || status === 425 || status >= 500,
  );
}

function protocolError(): ExtensionError {
  return new ExtensionError("PROTOCOL_FAILED", "The AI provider sent an invalid streaming response.", true);
}

function lineEndingLength(value: string, index: number, allowTrailingCr = false): number {
  if (value[index] === "\n") return 1;
  if (value[index] !== "\r") return 0;
  if (value[index + 1] === "\n") return 2;
  return index + 1 < value.length || allowTrailingCr ? 1 : 0;
}

function findEventBoundary(value: string): { index: number; length: number } | null {
  for (let index = 0; index < value.length;) {
    const firstLength = lineEndingLength(value, index);
    if (!firstLength) {
      index += 1;
      continue;
    }

    const secondLength = lineEndingLength(value, index + firstLength, true);
    if (secondLength) return { index, length: firstLength + secondLength };
    index += firstLength;
  }
  return null;
}

function processFrame(frame: string, onDelta: (content: string) => void): { content: string; done: boolean } {
  const data = frame
    .split(/\r\n|\r|\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");
  if (!data) return { content: "", done: false };
  if (data === "[DONE]") return { content: "", done: true };

  let event: unknown;
  try {
    event = JSON.parse(data);
  } catch {
    throw protocolError();
  }

  if (!event || typeof event !== "object" || Array.isArray(event) || "error" in event) throw protocolError();
  const choices = (event as { choices?: unknown }).choices;
  if (choices === undefined) return { content: "", done: false };
  if (!Array.isArray(choices) || choices.length === 0) return { content: "", done: false };

  const choice = choices[0];
  if (!choice || typeof choice !== "object" || Array.isArray(choice)) throw protocolError();
  const delta = (choice as { delta?: unknown }).delta;
  if (delta === undefined) return { content: "", done: false };
  if (!delta || typeof delta !== "object" || Array.isArray(delta)) throw protocolError();

  const content = (delta as { content?: unknown }).content;
  if (content === undefined) return { content: "", done: false };
  if (typeof content !== "string") throw protocolError();

  onDelta(content);
  return { content, done: false };
}

export async function streamChatCompletion({
  fetcher,
  url,
  apiKey,
  model,
  messages,
  signal,
  onDelta,
}: StreamArgs): Promise<string> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages, stream: true }),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ExtensionError("NETWORK_FAILED", "Could not reach the AI provider.", true);
  }

  if (!response.ok) {
    try {
      await response.body?.cancel();
    } catch {
      // Keep the status error sanitized even when transport cleanup fails.
    }
    throw responseError(response.status);
  }
  if (!response.body) {
    throw new ExtensionError("PROTOCOL_FAILED", "The AI provider returned no streaming response body.", true);
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let complete = "";
  let readerFinished = false;

  try {
    while (true) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch (error) {
        if (signal.aborted) throw error;
        throw new ExtensionError("NETWORK_FAILED", "The AI provider stream was interrupted.", true);
      }

      if (result.value) buffer += decoder.decode(result.value, { stream: true });
      if (result.done) {
        buffer += decoder.decode();
      }

      let boundary: { index: number; length: number } | null;
      while ((boundary = findEventBoundary(buffer))) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.length);
        const event = processFrame(frame, onDelta);
        complete += event.content;
        if (event.done) return complete;
      }

      if (result.done) {
        readerFinished = true;
        throw protocolError();
      }
    }
  } finally {
    if (!readerFinished) {
      try {
        await reader.cancel();
      } catch {
        // Preserve the original completion or failure reason.
      }
    }
    reader.releaseLock();
  }
}
