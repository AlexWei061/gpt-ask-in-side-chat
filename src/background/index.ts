import { ChatService } from "./chat-service";
import { HistoryStore } from "./history-store";
import { streamChatCompletion } from "./provider";
import {
  clampPanelWidth,
  forgetSessionKey,
  loadInternalSettings,
  loadUiPreferences,
  publicSettings,
  restrictStorageAccess,
  savePanelWidth,
  saveProviderConfig,
  setSessionKey,
} from "./settings";
import { ExtensionError, type ExtensionErrorCode } from "../shared/errors";
import { isRuntimeRequest, isStreamClientMessage, type RuntimeRequest, type RuntimeResponse, type StreamServerMessage } from "../shared/protocol";

const history = new HistoryStore();
const chatService = new ChatService({
  history,
  loadSettings: loadInternalSettings,
  stream: (args) => streamChatCompletion({ ...args, fetcher: fetch }),
});

void restrictStorageAccess();

chrome.runtime.onInstalled.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((request: unknown, _sender, sendResponse) => {
  if (!isRuntimeRequest(request)) return false;
  void handleRuntimeRequest(request).then(sendResponse);
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "side-chat-stream") return;
  const controllers = new Map<string, AbortController>();

  port.onMessage.addListener((message: unknown) => {
    if (!isStreamClientMessage(message)) return;
    if (message.type === "abort") {
      controllers.get(message.requestId)?.abort();
      return;
    }
    if (controllers.has(message.requestId)) return;

    const controller = new AbortController();
    controllers.set(message.requestId, controller);
    void chatService.send(message.payload, controller.signal, (event) => {
      if (event.type === "accepted") post(port, { type: "accepted", requestId: message.requestId, approximateTokens: event.approximateTokens });
      else post(port, { type: "delta", requestId: message.requestId, text: event.text });
    }).then(
      (record) => post(port, { type: "done", requestId: message.requestId, record }),
      (error: unknown) => post(port, { type: "error", requestId: message.requestId, error: normalizeError(error) }),
    ).finally(() => {
      controllers.delete(message.requestId);
    });
  });

  port.onDisconnect.addListener(() => {
    for (const controller of controllers.values()) controller.abort();
    controllers.clear();
  });
});

async function handleRuntimeRequest(request: RuntimeRequest): Promise<RuntimeResponse> {
  try {
    switch (request.type) {
      case "settings:get": return { ok: true, value: publicSettings(await loadInternalSettings()) };
      case "settings:save": {
        await saveProviderConfig(request.config, request.privacyAccepted);
        return { ok: true };
      }
      case "key:set": await setSessionKey(request.apiKey); return { ok: true };
      case "key:forget": await forgetSessionKey(); return { ok: true };
      case "ui:get": return { ok: true, value: await loadUiPreferences() };
      case "ui:set-width": {
        const width = clampPanelWidth(request.width);
        await savePanelWidth(width);
        return { ok: true, value: { panelWidth: width } };
      }
      case "history:load": return { ok: true, value: await history.get(request.conversationId) };
      case "history:clear": await history.delete(request.conversationId); return { ok: true };
      case "history:clear-all": await history.clear(); return { ok: true };
      default: return { ok: false, error: { code: "STORAGE_FAILED", message: "Unsupported runtime request." } };
    }
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

function post(port: chrome.runtime.Port, message: StreamServerMessage): void {
  try {
    port.postMessage(message);
  } catch {
    // A disconnected port cannot receive a terminal event.
  }
}

function normalizeError(error: unknown): { code: ExtensionErrorCode; message: string; retryable: boolean } {
  if (error instanceof ExtensionError) return { code: error.code, message: error.message, retryable: error.retryable };
  return { code: "STORAGE_FAILED", message: "The extension could not complete the request.", retryable: false };
}
