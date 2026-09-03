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
  signal?: AbortSignal;
  onDelta: (content: string) => void;
};

function responseError(status: number): ExtensionError {
  if (status === 401 || status === 403) {
    return new ExtensionError("AUTHENTICATION_FAILED", "Authentication with the AI provider failed.");
  }
  if (status === 429) {
    return new ExtensionError("RATE_LIMITED", "The AI provider rate limit was reached.", true);
  }
  return new ExtensionError("NETWORK_FAILED", `The AI provider returned HTTP status ${status}.`, status >= 500);
}

function processFrame(frame: string, onDelta: (content: string) => void): string {
  const dataLine = frame.split(/\r?\n/).find((line) => line.startsWith("data:"));
  if (!dataLine) return "";

  const data = dataLine.slice("data:".length).trimStart();
  if (!data || data === "[DONE]") return "";

  let event: unknown;
  try {
    event = JSON.parse(data);
  } catch {
    throw new ExtensionError("PROTOCOL_FAILED", "The AI provider sent an invalid streaming response.", true);
  }

  const content = (event as { choices?: Array<{ delta?: { content?: unknown } }> })
    .choices?.[0]?.delta?.content;
  if (typeof content !== "string") return "";

  onDelta(content);
  return content;
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
      signal: signal ?? null,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ExtensionError("NETWORK_FAILED", "Could not reach the AI provider.", true);
  }

  if (!response.ok) throw responseError(response.status);
  if (!response.body) {
    throw new ExtensionError("PROTOCOL_FAILED", "The AI provider returned no streaming response body.", true);
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let complete = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    let boundary: RegExpMatchArray | null;
    while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
      const boundaryIndex = boundary.index ?? 0;
      const frame = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + boundary[0].length);
      complete += processFrame(frame, onDelta);
    }

    if (done) return complete;
  }
}
