import { ChatService } from "./chat-service";
import { HistoryStore } from "./history-store";
import { streamChatCompletion } from "./provider";
import { chatCompletionsUrl, permissionPattern } from "./permissions";
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

export const historyStore = new HistoryStore();
const chatService = new ChatService({
  history: historyStore,
  loadSettings: loadInternalSettings,
  hasHostPermission: (baseUrl) => chrome.permissions.contains({ origins: [permissionPattern(baseUrl)] }),
  stream: (args) => streamChatCompletion({ ...args, fetcher: fetch }),
});
type ActiveRequest = { controller: AbortController; promise: Promise<unknown> };
const activeRequests = new Map<string, Set<ActiveRequest>>();
const clearingConversations = new Map<string, number>();
const KEEP_ALIVE_INTERVAL_MS = 25_000;
let clearingAll = 0;

void restrictStorageAccess();

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") void chrome.runtime.openOptionsPage();
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
    if (clearingAll > 0 || (clearingConversations.get(message.payload.conversationId) ?? 0) > 0) {
      post(port, { type: "error", requestId: message.requestId, error: { code: "STORAGE_FAILED", message: "正在清空侧边对话记录。", retryable: true } });
      return;
    }

    const controller = new AbortController();
    controllers.set(message.requestId, controller);
    const request = chatService.send(message.payload, controller.signal, (event) => {
      if (event.type === "accepted") post(port, { type: "accepted", requestId: message.requestId, approximateTokens: event.approximateTokens });
      else post(port, { type: "delta", requestId: message.requestId, text: event.text });
    });
    const keepAliveInterval = setInterval(() => { void chrome.runtime.getPlatformInfo(); }, KEEP_ALIVE_INTERVAL_MS);
    const active = { controller, promise: request };
    addActive(message.payload.conversationId, active);
    void request.then(
      (record) => post(port, { type: "done", requestId: message.requestId, record }),
      (error: unknown) => { if (!controller.signal.aborted) post(port, { type: "error", requestId: message.requestId, error: normalizeStreamError(error) }); },
    ).finally(() => {
      clearInterval(keepAliveInterval);
      controllers.delete(message.requestId);
      removeActive(message.payload.conversationId, active);
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
      case "provider:test": await testProviderConnection(); return { ok: true };
      case "ui:get": return { ok: true, value: await loadUiPreferences() };
      case "ui:set-width": {
        const width = clampPanelWidth(request.width);
        await savePanelWidth(width);
        return { ok: true, value: { panelWidth: width } };
      }
      case "history:load": return { ok: true, value: await historyStore.get(request.conversationId) };
      case "history:clear": await clearConversation(request.conversationId); return { ok: true };
      case "history:clear-all": await clearAllConversations(); return { ok: true };
      default: return { ok: false, error: { code: "STORAGE_FAILED", message: "不支持此扩展请求。" } };
    }
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

async function testProviderConnection(): Promise<void> {
  const settings = await loadInternalSettings();
  if (!settings.privacyAccepted) throw new ExtensionError("PERMISSION_REQUIRED", "请先同意使用说明。");
  if (!settings.config) throw new ExtensionError("PERMISSION_REQUIRED", "请先配置模型接口。");
  if (!settings.apiKey) throw new ExtensionError("KEY_REQUIRED", "请输入本次 Chrome 会话的 API 密钥。");
  if (!await chrome.permissions.contains({ origins: [permissionPattern(settings.config.baseUrl)] })) {
    throw new ExtensionError("PERMISSION_REQUIRED", "缺少接口访问权限，请保存设置以重新授权。");
  }
  await streamChatCompletion({
    fetcher: fetch,
    url: chatCompletionsUrl(settings.config.baseUrl),
    apiKey: settings.apiKey,
    model: settings.config.model,
    messages: [{ role: "user", content: "Reply with OK." }],
    signal: new AbortController().signal,
    onDelta: () => undefined,
  });
}

function addActive(conversationId: string, active: ActiveRequest): void {
  const activeForConversation = activeRequests.get(conversationId) ?? new Set<ActiveRequest>();
  activeForConversation.add(active);
  activeRequests.set(conversationId, activeForConversation);
}

function removeActive(conversationId: string, active: ActiveRequest): void {
  const activeForConversation = activeRequests.get(conversationId);
  if (!activeForConversation) return;
  activeForConversation.delete(active);
  if (activeForConversation.size === 0) activeRequests.delete(conversationId);
}

async function clearConversation(conversationId: string): Promise<void> {
  clearingConversations.set(conversationId, (clearingConversations.get(conversationId) ?? 0) + 1);
  try {
    const active = [...(activeRequests.get(conversationId) ?? [])];
    active.forEach(({ controller }) => controller.abort());
    await Promise.allSettled(active.map(({ promise }) => promise));
    await historyStore.delete(conversationId);
  } finally {
    const remaining = (clearingConversations.get(conversationId) ?? 1) - 1;
    if (remaining > 0) clearingConversations.set(conversationId, remaining);
    else clearingConversations.delete(conversationId);
  }
}

async function clearAllConversations(): Promise<void> {
  clearingAll += 1;
  try {
    const active = [...activeRequests.values()].flatMap((requests) => [...requests]);
    active.forEach(({ controller }) => controller.abort());
    await Promise.allSettled(active.map(({ promise }) => promise));
    await historyStore.clear();
  } finally {
    clearingAll -= 1;
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
  return { code: "STORAGE_FAILED", message: "扩展无法完成请求。", retryable: false };
}

function normalizeStreamError(error: unknown): { code: ExtensionErrorCode; message: string; retryable: boolean } {
  if (error instanceof ExtensionError) return { code: error.code, message: error.message, retryable: error.retryable };
  return { code: "NETWORK_FAILED", message: "AI 服务商连接失败。", retryable: true };
}
