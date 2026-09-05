import type { ExtensionErrorCode } from "./errors";
import type { MainMessage, PreparedAttachment, ProviderConfig, QuoteReference, SendPayload, SideChatRecord, WindowGeometry } from "./types";

export type RuntimeRequest =
  | { type: "settings:get" }
  | { type: "settings:save"; config: ProviderConfig; privacyAccepted: boolean }
  | { type: "key:set"; apiKey: string }
  | { type: "key:forget" }
  | { type: "provider:test" }
  | { type: "ui:get" }
  | { type: "ui:set-geometry"; geometry: WindowGeometry }
  | { type: "history:load"; conversationId: string }
  | { type: "history:clear"; conversationId: string }
  | { type: "history:clear-all" };

export type RuntimeResponse<T = unknown> =
  | { ok: true; value?: T }
  | { ok: false; error: { code: ExtensionErrorCode; message: string } };

export type StreamClientMessage =
  | { type: "start"; requestId: string; payload: SendPayload }
  | { type: "abort"; requestId: string };

export type StreamServerMessage =
  | { type: "accepted"; requestId: string; approximateTokens: number }
  | { type: "delta"; requestId: string; text: string }
  | { type: "done"; requestId: string; record: SideChatRecord }
  | { type: "error"; requestId: string; error: { code: ExtensionErrorCode; message: string; retryable: boolean } };

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isRuntimeRequest(value: unknown): value is RuntimeRequest {
  if (!isObject(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "settings:get": case "key:forget": case "provider:test": case "ui:get": case "history:clear-all": return Object.keys(value).length === 1;
    case "key:set": return hasOnlyKeys(value, ["type", "apiKey"]) && isNonEmptyString(value.apiKey);
    case "ui:set-geometry": return hasOnlyKeys(value, ["type", "geometry"]) && isWindowGeometry(value.geometry);
    case "history:load": case "history:clear": return hasOnlyKeys(value, ["type", "conversationId"]) && isNonEmptyString(value.conversationId);
    case "settings:save": return hasOnlyKeys(value, ["type", "config", "privacyAccepted"]) && isProviderConfig(value.config) && typeof value.privacyAccepted === "boolean";
    default: return false;
  }
}

function isWindowGeometry(value: unknown): value is WindowGeometry {
  if (!isObject(value) || !hasOnlyKeys(value, ["width", "height", "right", "bottom"]) || Object.keys(value).length !== 4) return false;
  return [value.width, value.height, value.right, value.bottom].every((part) => typeof part === "number" && Number.isFinite(part) && Number.isInteger(part) && part >= 0 && part <= 4096);
}

export function isStreamClientMessage(value: unknown): value is StreamClientMessage {
  if (!isObject(value) || typeof value.type !== "string" || !isNonEmptyString(value.requestId)) return false;
  return value.type === "abort" || (value.type === "start" && isSendPayload(value.payload));
}

export function isSendPayload(value: unknown): value is SendPayload {
  if (!isObject(value) || !hasOnlyKeys(value, ["conversationId", "mainMessages", "quote", "question", "attachments", "compressOldContext"])) return false;
  if (!isNonEmptyString(value.conversationId)
    || !Array.isArray(value.mainMessages) || value.mainMessages.length === 0 || !value.mainMessages.every(isMainMessage)
    || (value.quote !== undefined && !isQuoteReference(value.quote))
    || typeof value.question !== "string" || value.question.trim().length === 0
    || !Array.isArray(value.attachments) || !value.attachments.every(isPreparedAttachment)
    || typeof value.compressOldContext !== "boolean") return false;
  const mainMessages = value.mainMessages as MainMessage[];
  const quote = value.quote as QuoteReference | undefined;
  const attachments = value.attachments as PreparedAttachment[];
  return mainMessages.every((message, index) => message.index === index && message.content.trim().length > 0)
    && (quote === undefined || (mainMessages[quote.sourceMessageIndex]?.role === quote.sourceRole && quote.text.trim().length > 0))
    && attachments.every((attachment) => attachment.sourceMessageIndex < mainMessages.length)
    ;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isMainMessage(value: unknown): value is MainMessage {
  return isObject(value)
    && hasOnlyKeys(value, ["index", "role", "content", "links"])
    && typeof value.index === "number" && Number.isInteger(value.index) && value.index >= 0
    && (value.role === "user" || value.role === "assistant")
    && typeof value.content === "string"
    && Array.isArray(value.links)
    && value.links.every((link) => isObject(link) && hasOnlyKeys(link, ["label", "href"]) && typeof link.label === "string" && typeof link.href === "string");
}

function isQuoteReference(value: unknown): value is QuoteReference {
  return isObject(value)
    && hasOnlyKeys(value, ["text", "sourceRole", "sourceMessageIndex"])
    && typeof value.text === "string"
    && (value.sourceRole === "user" || value.sourceRole === "assistant")
    && typeof value.sourceMessageIndex === "number" && Number.isInteger(value.sourceMessageIndex) && value.sourceMessageIndex >= 0;
}

function isPreparedAttachment(value: unknown): value is PreparedAttachment {
  if (!isObject(value) || typeof value.name !== "string" || typeof value.sourceMessageIndex !== "number" || !Number.isInteger(value.sourceMessageIndex) || value.sourceMessageIndex < 0) return false;
  if (value.kind === "text") return hasOnlyKeys(value, ["kind", "name", "sourceMessageIndex", "text"]) && typeof value.text === "string";
  return value.kind === "image" && hasOnlyKeys(value, ["kind", "name", "sourceMessageIndex", "dataUrl"]) && typeof value.dataUrl === "string" && /^data:image\/[a-z0-9.+-]+;base64,(?=.+)(?:[a-z0-9+/]{4})*(?:[a-z0-9+/]{2}==|[a-z0-9+/]{3}=)?$/i.test(value.dataUrl);
}

export function isProviderConfig(value: unknown): value is ProviderConfig {
  return isObject(value)
    && hasOnlyKeys(value, ["baseUrl", "model", "contextWindowTokens", "supportsImages"])
    && typeof value.baseUrl === "string" && value.baseUrl.trim().length > 0
    && typeof value.model === "string" && value.model.trim().length > 0
    && typeof value.contextWindowTokens === "number" && Number.isFinite(value.contextWindowTokens) && Number.isInteger(value.contextWindowTokens) && value.contextWindowTokens > 0
    && typeof value.supportsImages === "boolean";
}
