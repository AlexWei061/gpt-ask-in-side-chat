import type { RuntimeResponse, StreamServerMessage } from "../shared/protocol";
import type { ProviderConfig, SideChatRecord } from "../shared/types";
import type { ExtensionErrorCode } from "../shared/errors";
import { ChatGptPageAdapter } from "./page-adapter";
import { extractAttachmentDescriptors, prepareFile, type AttachmentDescriptor } from "./attachments";
import { SelectionController } from "./selection";
import { SidePanel, type PanelSend } from "./ui/side-panel";

type PublicSettings = { privacyAccepted: boolean; config: ProviderConfig | null };
type UiPreferences = { panelWidth: number };

function request<T>(message: unknown, valid: (value: unknown) => value is T = ((_: unknown): _ is T => true)): Promise<T> {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage(message, (response: unknown) => {
    const generic = () => reject(new Error("The extension could not contact its background service."));
    if (chrome.runtime.lastError || !response || typeof response !== "object" || typeof (response as { ok?: unknown }).ok !== "boolean") return generic();
    const result = response as RuntimeResponse<T>;
    if (!result.ok) return isRuntimeError(result.error) ? reject(new Error(result.error.message)) : generic();
    return valid(result.value) ? resolve(result.value) : generic();
  }));
}

const BOOTSTRAP_KEY = "__sideChatBootstrapPromise";
export function bootstrap(): Promise<void> {
  const state = document as Document & { [BOOTSTRAP_KEY]?: Promise<void> };
  if (state[BOOTSTRAP_KEY]) return state[BOOTSTRAP_KEY];
  const promise = bootstrapImpl().catch((error) => { delete state[BOOTSTRAP_KEY]; throw error; });
  state[BOOTSTRAP_KEY] = promise;
  return promise;
}
async function bootstrapImpl(): Promise<void> {
  const publicSettings = await request<PublicSettings>({ type: "settings:get" }, isSettings);
  if (!publicSettings.privacyAccepted) { delete (document as Document & { [BOOTSTRAP_KEY]?: Promise<void> })[BOOTSTRAP_KEY]; return; }
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
    onSend: (submission) => { void start(submission); },
    onResize: (width) => { void request({ type: "ui:set-width", width }).catch(() => panel.setNotice("Could not save panel width.")); },
    onClear: () => clear(),
  });
  const selection = new SelectionController(document, (quote) => panel.open(quote));
  async function loadConversation(): Promise<void> {
    const token = ++generation; disconnectStream();
    const conversationId = adapter.getConversationId(); panel.setConversation(conversationId, []);
    if (!conversationId) return;
    try {
      const record = await request<SideChatRecord | null>({ type: "history:load", conversationId }, (value): value is SideChatRecord | null => value === null || (isSideChatRecord(value) && value.conversationId === conversationId));
      if (!disposed && token === generation && adapter.getConversationId() === conversationId) panel.setMessages(record?.messages ?? []);
    } catch { if (!disposed && token === generation) panel.setNotice("Could not load side-chat history."); }
  }
  async function clear(): Promise<void> {
    const token = ++generation; const id = adapter.getConversationId(); if (!id) return;
    disconnectStream(); panel.resetRequest();
    try { await request({ type: "history:clear", conversationId: id }); if (!disposed && token === generation && adapter.getConversationId() === id) panel.setMessages([]); }
    catch { if (!disposed && token === generation && adapter.getConversationId() === id) panel.setNotice("Could not clear side-chat history."); }
  }
  async function start(submission: PanelSend): Promise<void> {
    const token = ++generation;
    const conversationId = adapter.getConversationId(); const elements = adapter.getMessageElements(); const extraction = adapter.extractConversation(elements);
    if (!conversationId || !extraction.certain || extraction.messages.length === 0) { panel.setError({ message: "The complete visible conversation could not be verified.", retryable: true }); return; }
    const descriptors = extractAttachmentDescriptors(elements);
    let attachments: import("../shared/types").PreparedAttachment[] = [];
    if (descriptors.length > 0) {
      try {
        attachments = await resolveAttachments(descriptors, publicSettings.config?.supportsImages === true, panel);
      } catch (error) {
        if (!disposed && token === generation) panel.setError({ message: error instanceof Error ? error.message : "An attachment could not be prepared.", retryable: true });
        return;
      }
    }
    if (disposed || token !== generation || adapter.getConversationId() !== conversationId) { panel.resetRequest(); return; }
    disconnectStream(); const requestId = crypto.randomUUID(); let port: chrome.runtime.Port;
    try { port = chrome.runtime.connect({ name: "side-chat-stream" }); } catch { panel.setError({ message: "Could not start the side-chat request.", retryable: true }); return; }
    stream = { port, requestId, conversationId };
    try { port.onMessage.addListener((raw: unknown) => {
      const candidate = raw as { requestId?: unknown; type?: unknown } | null;
      if (!stream || stream.port !== port || candidate?.requestId !== stream.requestId) return;
      if (!isStreamEvent(raw)) { panel.setError({ message: "The side-chat response was invalid.", retryable: true }); disconnectStream(false); return; }
      const event = raw;
      if (event.type === "accepted") panel.setAccepted();
      else if (event.type === "delta") panel.appendDelta(event.text);
      else if (event.type === "done") { if (event.record.conversationId === stream.conversationId) panel.complete(event.record.messages); else panel.setError({ message: "The side-chat response was invalid.", retryable: true }); disconnectStream(false); }
      else if (event.type === "error") { panel.setError({ message: event.error.message, retryable: event.error.retryable }); disconnectStream(false); }
    });
    port.onDisconnect.addListener(() => { if (stream?.port === port) { stream = null; panel.setError({ message: "The side-chat connection closed unexpectedly.", retryable: true }); } });
    port.postMessage({ type: "start", requestId, payload: { conversationId, mainMessages: extraction.messages, quote: submission.quote, question: submission.question, attachments, compressOldContext: submission.compressOldContext } }); }
    catch { panel.setError({ message: "Could not start the side-chat request.", retryable: true }); disconnectStream(false); }
  }
  try { panel.setWidth((await request<UiPreferences>({ type: "ui:get" }, isUi)).panelWidth); } catch { panel.setError({ message: "Could not load panel preferences.", retryable: false }); }
  let url = document.location.href;
  const checkNavigation = () => { if (document.location.href !== url) { url = document.location.href; void loadConversation(); } };
  const observer = new MutationObserver(checkNavigation); observer.observe(document.documentElement, { childList: true, subtree: true });
  document.defaultView?.addEventListener("popstate", checkNavigation);
  const pagehide = (event: PageTransitionEvent) => { if (event.persisted) { generation += 1; disconnectStream(); panel.resetRequest(); return; } disposed = true; observer.disconnect(); document.defaultView?.removeEventListener("popstate", checkNavigation); document.defaultView?.removeEventListener("pagehide", pagehide); document.defaultView?.removeEventListener("pageshow", pageshow); disconnectStream(); selection.destroy(); panel.destroy(); delete (document as Document & { [BOOTSTRAP_KEY]?: Promise<void> })[BOOTSTRAP_KEY]; };
  const pageshow = (event: PageTransitionEvent) => { if (event.persisted) void loadConversation(); };
  document.defaultView?.addEventListener("pagehide", pagehide); document.defaultView?.addEventListener("pageshow", pageshow);
  await loadConversation();
}

export const bootstrapPromise = bootstrap().catch(() => { console.warn("Side chat could not start."); });

function safeAttachmentUrl(value: string, origin: string): URL | null {
  try {
    const url = new URL(value, origin);
    if (url.protocol === "blob:") return url;
    if (url.protocol !== "https:") return null;
    return url;
  } catch { return null; }
}

async function fetchAttachment(descriptor: AttachmentDescriptor, origin: string): Promise<File | null> {
  if (!descriptor.url) return null;
  const url = safeAttachmentUrl(descriptor.url, origin); if (!url) return null;
  const sameOrigin = url.origin === origin;
  const response = await fetch(url, { credentials: sameOrigin ? "same-origin" : "omit" });
  if (!response.ok) return null;
  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > 20 * 1024 * 1024) return null;
  const blob = await response.blob();
  if (blob.size > 20 * 1024 * 1024) return null;
  return new File([blob], descriptor.name, { type: blob.type });
}

async function resolveAttachments(descriptors: AttachmentDescriptor[], supportsImages: boolean, panel: SidePanel) {
  const prepared = [] as import("../shared/types").PreparedAttachment[];
  const missing: AttachmentDescriptor[] = [];
  for (const descriptor of descriptors) {
    let file: File | null;
    try { file = await fetchAttachment(descriptor, document.location.origin); } catch { file = null; }
    if (!file) { missing.push(descriptor); continue; }
    prepared.push(await prepareFile(file, descriptor.sourceMessageIndex, supportsImages));
  }
  if (missing.length === 0) return prepared;
  const replacements = await panel.resolveMissingAttachments(missing.map((descriptor) => descriptor.name));
  if (replacements === null) return prepared;
  if (replacements.length !== missing.length) throw new Error("The missing attachment selection was incomplete.");
  for (const [index, file] of replacements.entries()) prepared.push(await prepareFile(file, missing[index]!.sourceMessageIndex, supportsImages));
  return prepared;
}

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
function isRuntimeError(value: unknown): value is { code: ExtensionErrorCode; message: string; retryable?: boolean } {
  return Boolean(value
    && typeof value === "object"
    && isErrorCode((value as { code?: unknown }).code)
    && typeof (value as { message?: unknown }).message === "string"
    && (!("retryable" in value) || typeof (value as { retryable?: unknown }).retryable === "boolean"));
}
function isSettings(value: unknown): value is PublicSettings {
  const config = (value as Partial<PublicSettings> | null)?.config;
  return Boolean(value && typeof value === "object" && typeof (value as PublicSettings).privacyAccepted === "boolean" && (config === undefined || config === null || Boolean(config && typeof config === "object" && typeof config.supportsImages === "boolean" && typeof config.baseUrl === "string" && typeof config.model === "string" && typeof config.contextWindowTokens === "number")));
}
function isUi(value: unknown): value is UiPreferences { return Boolean(value && typeof value === "object" && typeof (value as UiPreferences).panelWidth === "number" && Number.isFinite((value as UiPreferences).panelWidth)); }
function isQuote(value: unknown): boolean { return Boolean(value && typeof value === "object" && typeof (value as { text?: unknown }).text === "string" && ((value as { sourceRole?: unknown }).sourceRole === "user" || (value as { sourceRole?: unknown }).sourceRole === "assistant") && Number.isInteger((value as { sourceMessageIndex?: unknown }).sourceMessageIndex) && (value as { sourceMessageIndex: number }).sourceMessageIndex >= 0); }
function isSideChatRecord(value: unknown): value is SideChatRecord {
  if (!value || typeof value !== "object") return false; const record = value as SideChatRecord;
  return record.schemaVersion === 1 && typeof record.conversationId === "string" && record.conversationId.length > 0 && typeof record.updatedAt === "string" && Array.isArray(record.messages) && record.messages.every((message) => Boolean(message && typeof message === "object" && typeof message.id === "string" && (message.role === "user" || message.role === "assistant") && typeof message.content === "string" && (message.status === "complete" || message.status === "incomplete") && typeof message.createdAt === "string" && (message.quote === undefined || isQuote(message.quote))));
}
