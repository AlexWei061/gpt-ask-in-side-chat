import type { RuntimeResponse, StreamServerMessage } from "../shared/protocol";
import type { SideChatRecord } from "../shared/types";
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

async function bootstrap(): Promise<void> {
  if (!(await request<PublicSettings>({ type: "settings:get" })).privacyAccepted) return;
  const adapter = new ChatGptPageAdapter(document);
  let stream: { port: chrome.runtime.Port; requestId: string } | null = null;
  let generation = 0;
  let disposed = false;
  const disconnectStream = () => {
    if (!stream) return;
    try { stream.port.postMessage({ type: "abort", requestId: stream.requestId }); } catch { /* disconnected */ }
    try { stream.port.disconnect(); } catch { /* disconnected */ }
    stream = null;
  };
  const panel = new SidePanel(document, {
    onSend: (submission) => start(submission),
    onResize: (width) => { void request({ type: "ui:set-width", width }).catch(() => panel.setError({ message: "Could not save panel width.", retryable: false })); },
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
    } catch { if (!disposed && token === generation) panel.setError({ message: "Could not load side-chat history.", retryable: true }); }
  }
  async function clear(): Promise<void> {
    const id = adapter.getConversationId(); if (!id) return;
    try { await request({ type: "history:clear", conversationId: id }); if (adapter.getConversationId() === id) panel.setMessages([]); }
    catch { panel.setError({ message: "Could not clear side-chat history.", retryable: true }); }
  }
  function start(submission: PanelSend): void {
    const conversationId = adapter.getConversationId(); const extraction = adapter.extractConversation();
    if (!conversationId || !extraction.certain || extraction.messages.length === 0) { panel.setError({ message: "The complete visible conversation could not be verified.", retryable: true }); return; }
    disconnectStream(); const requestId = crypto.randomUUID(); const port = chrome.runtime.connect({ name: "side-chat-stream" }); stream = { port, requestId };
    port.onMessage.addListener((raw: unknown) => {
      const event = raw as StreamServerMessage;
      if (!stream || event.requestId !== stream.requestId) return;
      if (event.type === "accepted") panel.setAccepted();
      else if (event.type === "delta") panel.appendDelta(event.text);
      else if (event.type === "done") { panel.complete(event.record.messages); disconnectStream(); }
      else if (event.type === "error") { panel.setError({ message: event.error.message, retryable: event.error.retryable }); disconnectStream(); }
    });
    port.onDisconnect.addListener(() => { if (stream?.port === port) stream = null; });
    try { port.postMessage({ type: "start", requestId, payload: { conversationId, mainMessages: extraction.messages, quote: submission.quote, question: submission.question, attachments: [], compressOldContext: submission.compressOldContext } }); }
    catch { panel.setError({ message: "Could not start the side-chat request.", retryable: true }); disconnectStream(); }
  }
  try { panel.setWidth((await request<UiPreferences>({ type: "ui:get" })).panelWidth); } catch { panel.setError({ message: "Could not load panel preferences.", retryable: false }); }
  await loadConversation();
  let url = document.location.href;
  const checkNavigation = () => { if (document.location.href !== url) { url = document.location.href; void loadConversation(); } };
  const observer = new MutationObserver(checkNavigation); observer.observe(document.documentElement, { childList: true, subtree: true });
  document.defaultView?.addEventListener("popstate", checkNavigation);
  document.defaultView?.addEventListener("pagehide", () => { disposed = true; observer.disconnect(); disconnectStream(); selection.destroy(); panel.destroy(); }, { once: true });
}

void bootstrap().catch(() => { console.warn("Side chat could not start."); });
