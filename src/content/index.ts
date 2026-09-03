import type { RuntimeResponse, StreamServerMessage } from "../shared/protocol";
import type { SideChatRecord } from "../shared/types";
import type { ExtensionErrorCode } from "../shared/errors";
import { ChatGptPageAdapter } from "./page-adapter";
import { SelectionController } from "./selection";
import { SidePanel, type PanelSend } from "./ui/side-panel";

type PublicSettings = { privacyAccepted: boolean };
type UiPreferences = { panelWidth: number };

function request<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage(message, (response: unknown) => {
    const result = response as RuntimeResponse<T> | undefined;
    if (chrome.runtime.lastError || !result || typeof result !== "object" || typeof result.ok !== "boolean") return reject(new Error("The extension could not contact its background service."));
    if (!result.ok) return reject(new Error(result.error.message));
    resolve(result.value as T);
  }));
}

export async function bootstrap(): Promise<void> {
  if (!(await request<PublicSettings>({ type: "settings:get" })).privacyAccepted) return;
  const adapter = new ChatGptPageAdapter(document);
  let stream: { port: chrome.runtime.Port; requestId: string; conversationId: string } | null = null;
  let generation = 0;
  let disposed = false;
  const disconnectStream = (abort = true) => {
    const active = stream;
    if (!active) return;
    stream = null;
    if (abort) try { active.port.postMessage({ type: "abort", requestId: active.requestId }); } catch { /* disconnected */ }
    try { active.port.disconnect(); } catch { /* disconnected */ }
  };
  const panel = new SidePanel(document, {
    onSend: (submission) => start(submission),
    onResize: (width) => { void request({ type: "ui:set-width", width }).catch(() => panel.setNotice("Could not save panel width.")); },
    onClear: () => clear(),
  });
  const selection = new SelectionController(document, (quote) => panel.open(quote));
  async function loadConversation(): Promise<void> {
    const token = ++generation; disconnectStream();
    const conversationId = adapter.getConversationId(); panel.setConversation(conversationId, []);
    if (!conversationId) return;
    try {
      const record = await request<SideChatRecord | null>({ type: "history:load", conversationId });
      if (!disposed && token === generation && adapter.getConversationId() === conversationId) panel.setMessages(record?.messages ?? []);
    } catch { if (!disposed && token === generation) panel.setNotice("Could not load side-chat history."); }
  }
  async function clear(): Promise<void> {
    const id = adapter.getConversationId(); if (!id) return;
    disconnectStream(); panel.resetRequest();
    try { await request({ type: "history:clear", conversationId: id }); if (adapter.getConversationId() === id) panel.setMessages([]); }
    catch { panel.setNotice("Could not clear side-chat history."); }
  }
  function start(submission: PanelSend): void {
    const conversationId = adapter.getConversationId(); const extraction = adapter.extractConversation();
    if (!conversationId || !extraction.certain || extraction.messages.length === 0) { panel.setError({ message: "The complete visible conversation could not be verified.", retryable: true }); return; }
    disconnectStream(); const requestId = crypto.randomUUID(); const port = chrome.runtime.connect({ name: "side-chat-stream" }); stream = { port, requestId, conversationId };
    port.onMessage.addListener((raw: unknown) => {
      if (!isStreamEvent(raw)) return;
      const event = raw;
      if (!stream || stream.port !== port || event.requestId !== stream.requestId) return;
      if (event.type === "accepted") panel.setAccepted();
      else if (event.type === "delta") panel.appendDelta(event.text);
      else if (event.type === "done" && event.record.conversationId === stream.conversationId) { panel.complete(event.record.messages); disconnectStream(false); }
      else if (event.type === "error") { panel.setError({ message: event.error.message, retryable: event.error.retryable }); disconnectStream(false); }
    });
    port.onDisconnect.addListener(() => { if (stream?.port === port) { stream = null; panel.setError({ message: "The side-chat connection closed unexpectedly.", retryable: true }); } });
    try { port.postMessage({ type: "start", requestId, payload: { conversationId, mainMessages: extraction.messages, quote: submission.quote, question: submission.question, attachments: [], compressOldContext: submission.compressOldContext } }); }
    catch { panel.setError({ message: "Could not start the side-chat request.", retryable: true }); disconnectStream(false); }
  }
  try { panel.setWidth((await request<UiPreferences>({ type: "ui:get" })).panelWidth); } catch { panel.setError({ message: "Could not load panel preferences.", retryable: false }); }
  let url = document.location.href;
  const checkNavigation = () => { if (document.location.href !== url) { url = document.location.href; void loadConversation(); } };
  const observer = new MutationObserver(checkNavigation); observer.observe(document.documentElement, { childList: true, subtree: true });
  document.defaultView?.addEventListener("popstate", checkNavigation);
  document.defaultView?.addEventListener("pagehide", () => { disposed = true; observer.disconnect(); document.defaultView?.removeEventListener("popstate", checkNavigation); disconnectStream(); selection.destroy(); panel.destroy(); }, { once: true });
  await loadConversation();
}

export const bootstrapPromise = bootstrap().catch(() => { console.warn("Side chat could not start."); });

function isStreamEvent(value: unknown): value is StreamServerMessage {
  if (!value || typeof value !== "object") return false;
  const event = value as { type?: unknown; requestId?: unknown; text?: unknown; record?: unknown; error?: unknown };
  if (typeof event.requestId !== "string" || !event.requestId || typeof event.type !== "string") return false;
  if (event.type === "accepted") return typeof (event as { approximateTokens?: unknown }).approximateTokens === "number" && Number.isFinite((event as { approximateTokens: number }).approximateTokens) && Number.isInteger((event as { approximateTokens: number }).approximateTokens) && (event as { approximateTokens: number }).approximateTokens >= 0;
  if (event.type === "delta") return typeof event.text === "string";
  if (event.type === "done") return isSideChatRecord(event.record);
  if (event.type === "error") return Boolean(event.error && typeof event.error === "object" && isErrorCode((event.error as { code?: unknown }).code) && typeof (event.error as { message?: unknown }).message === "string" && typeof (event.error as { retryable?: unknown }).retryable === "boolean");
  return false;
}

function isErrorCode(value: unknown): value is ExtensionErrorCode { return typeof value === "string" && ["EXTRACTION_UNCERTAIN", "KEY_REQUIRED", "PERMISSION_REQUIRED", "AUTHENTICATION_FAILED", "RATE_LIMITED", "CONTEXT_OVERFLOW", "ATTACHMENT_FAILED", "NETWORK_FAILED", "PROTOCOL_FAILED", "STORAGE_FAILED"].includes(value); }
function isQuote(value: unknown): boolean { return Boolean(value && typeof value === "object" && typeof (value as { text?: unknown }).text === "string" && ((value as { sourceRole?: unknown }).sourceRole === "user" || (value as { sourceRole?: unknown }).sourceRole === "assistant") && Number.isInteger((value as { sourceMessageIndex?: unknown }).sourceMessageIndex) && (value as { sourceMessageIndex: number }).sourceMessageIndex >= 0); }
function isSideChatRecord(value: unknown): value is SideChatRecord {
  if (!value || typeof value !== "object") return false; const record = value as SideChatRecord;
  return record.schemaVersion === 1 && typeof record.conversationId === "string" && record.conversationId.length > 0 && typeof record.updatedAt === "string" && Array.isArray(record.messages) && record.messages.every((message) => Boolean(message && typeof message === "object" && typeof message.id === "string" && (message.role === "user" || message.role === "assistant") && typeof message.content === "string" && (message.status === "complete" || message.status === "incomplete") && typeof message.createdAt === "string" && (message.quote === undefined || isQuote(message.quote))));
}
