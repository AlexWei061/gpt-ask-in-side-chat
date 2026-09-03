import type { ExtensionErrorCode } from "./errors";
import type { ProviderConfig, SendPayload, SideChatRecord } from "./types";

export type RuntimeRequest =
  | { type: "settings:get" }
  | { type: "settings:save"; config: ProviderConfig; privacyAccepted: boolean }
  | { type: "key:set"; apiKey: string }
  | { type: "key:forget" }
  | { type: "ui:get" }
  | { type: "ui:set-width"; width: number }
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
    case "settings:get": case "key:forget": case "ui:get": case "history:clear-all": return true;
    case "key:set": return isNonEmptyString(value.apiKey);
    case "ui:set-width": return typeof value.width === "number" && Number.isFinite(value.width) && value.width >= 320 && value.width <= 960;
    case "history:load": case "history:clear": return isNonEmptyString(value.conversationId);
    case "settings:save": return isObject(value.config) && typeof value.privacyAccepted === "boolean";
    default: return false;
  }
}

export function isStreamClientMessage(value: unknown): value is StreamClientMessage {
  if (!isObject(value) || typeof value.type !== "string" || typeof value.requestId !== "string") return false;
  return value.type === "abort" || (value.type === "start" && isObject(value.payload));
}
