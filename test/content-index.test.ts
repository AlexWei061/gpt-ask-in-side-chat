import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicSettings } from "../src/shared/types";

const profiles = [
  { id: "api-a", name: "日常使用", config: { baseUrl: "https://a.example.com/v1", model: "model-a", contextWindowTokens: 128000, supportsImages: false }, hasSessionKey: true },
  { id: "api-b", name: "深度思考", config: { baseUrl: "https://b.example.com/v1", model: "model-b", contextWindowTokens: 64000, supportsImages: true }, hasSessionKey: true },
];
function savedSettings(activeProviderId = "api-a", privacyAccepted = true): PublicSettings {
  return { profiles, activeProviderId, privacyAccepted, config: profiles.find((profile) => profile.id === activeProviderId)!.config, hasSessionKey: true };
}

class FakePort {
  readonly onMessage = { addListener: (listener: (value: unknown) => void) => this.messages.push(listener) };
  readonly onDisconnect = { addListener: (listener: () => void) => this.disconnects.push(listener) };
  readonly sent: unknown[] = []; private messages: Array<(value: unknown) => void> = []; private disconnects: Array<() => void> = [];
  disconnectCount = 0;
  postMessage(value: unknown) { this.sent.push(value); }
  disconnect() { this.disconnectCount += 1; this.disconnects.forEach((listener) => listener()); }
  emit(value: unknown) { this.messages.forEach((listener) => listener(value)); }
}

function sideRecord(conversationId: string, content: string) {
  return {
    schemaVersion: 1 as const,
    conversationId,
    updatedAt: "2026-01-01T00:00:00.000Z",
    messages: [{ id: `${conversationId}-message`, role: "assistant" as const, content, status: "complete" as const, createdAt: "2026-01-01T00:00:00.000Z" }],
  };
}

function transition(type: "pagehide" | "pageshow", persisted: boolean): PageTransitionEvent {
  const event = new Event(type);
  Object.defineProperty(event, "persisted", { value: persisted });
  return event as PageTransitionEvent;
}

function installSelectableMessage(): void {
  document.body.innerHTML = `<main><article data-message-author-role="assistant"><p id="quote">alpha</p></article></main>`;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1; });
}

function openAndSubmit(question: string): ShadowRoot {
  const selection = document.getSelection();
  selection?.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(document.querySelector("#quote")!);
  selection?.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
  document.querySelector<HTMLButtonElement>("[data-side-chat-selection-action]")!.click();
  const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
  const input = root.querySelector<HTMLTextAreaElement>("textarea")!;
  input.value = question;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  root.querySelector<HTMLFormElement>("form")!.requestSubmit();
  return root;
}

async function approveAllAttachments(root: ShadowRoot): Promise<void> {
  await vi.waitFor(() => expect(root.querySelector("[data-attachment-consent]")).toBeTruthy());
  root.querySelectorAll<HTMLInputElement>("dialog input[type=checkbox]").forEach((input) => { input.checked = true; });
  root.querySelector<HTMLButtonElement>("[data-action=confirm-attachments]")!.click();
}

describe("content bootstrap", () => {
  let ports: FakePort[]; let historyRecords = new Map<string, unknown>(); let privacy = false;
  let currentSettings: PublicSettings;
  let settingsListeners: Set<(message: unknown) => void>;
  beforeEach(() => {
    ports = []; historyRecords = new Map(); privacy = false; currentSettings = savedSettings(); settingsListeners = new Set(); window.history.replaceState({}, "", "/"); document.body.innerHTML = ""; document.querySelectorAll("[data-side-chat-host]").forEach((node) => node.remove());
    Object.defineProperty(globalThis, "chrome", { configurable: true, value: { runtime: {
      onMessage: { addListener: (listener: (message: unknown) => void) => settingsListeners.add(listener), removeListener: (listener: (message: unknown) => void) => settingsListeners.delete(listener) },
      sendMessage: (message: { type: string; conversationId?: string; profileId?: string }, callback: (response: unknown) => void) => {
        if (message.type === "settings:get") callback({ ok: true, value: { ...currentSettings, privacyAccepted: privacy } });
        else if (message.type === "settings:select") { currentSettings = savedSettings(message.profileId, privacy); callback({ ok: true, value: currentSettings }); }
        else if (message.type === "ui:get") callback({ ok: true, value: { windowGeometry: { width: 420, height: 560, right: 20, bottom: 20 } } });
        else if (message.type === "history:load") callback({ ok: true, value: historyRecords.get(message.conversationId!) ?? null });
        else callback({ ok: true });
      }, lastError: null, connect: () => { const port = new FakePort(); ports.push(port); return port; },
    } } });
  });
  afterEach(() => { window.dispatchEvent(new Event("pagehide")); vi.unstubAllGlobals(); vi.resetModules(); document.body.innerHTML = ""; document.querySelectorAll("[data-side-chat-host]").forEach((node) => node.remove()); });

  it("does not inject UI before privacy acceptance", async () => {
    await import("../src/content/index");
    await Promise.resolve();
    expect(document.querySelector("[data-side-chat-host]")).toBeNull();
  });

  it("switches the next send while retaining the draft, quote, and compression choice", async () => {
    privacy = true; window.history.pushState({}, "", "/c/switch"); installSelectableMessage();
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    root.querySelector<HTMLButtonElement>("[data-minimized-bar]")!.click();
    const range = document.createRange(); range.selectNodeContents(document.querySelector("#quote")!);
    document.getSelection()?.addRange(range); document.dispatchEvent(new Event("selectionchange"));
    const input = root.querySelector<HTMLTextAreaElement>("textarea")!;
    input.value = "keep my draft"; input.dispatchEvent(new Event("input"));
    root.querySelector<HTMLInputElement>(".controls input")!.checked = true;
    const picker = root.querySelector<HTMLSelectElement>("[data-provider-select]")!;
    picker.value = "api-b"; picker.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(root.querySelector(".context-summary")?.textContent).toContain("https://b.example.com"));
    expect(root.querySelector("textarea")).toBe(input);
    expect(input.value).toBe("keep my draft");
    expect(root.querySelector("[data-active-quote]")?.textContent).toContain("alpha");
    expect(root.querySelector<HTMLInputElement>(".controls input")!.checked).toBe(true);
    root.querySelector<HTMLFormElement>("form")!.requestSubmit();
    await vi.waitFor(() => expect(ports).toHaveLength(1));
    expect(ports[0]!.sent[0]).toMatchObject({ payload: { providerId: "api-b", providerConfig: profiles[1]!.config, question: "keep my draft", compressOldContext: true } });
  });

  it("updates the shared selection during a stream without redirecting or interrupting it", async () => {
    privacy = true; window.history.pushState({}, "", "/c/switch-stream"); installSelectableMessage();
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    const root = openAndSubmit("first question");
    const first = ports[0]!;
    const start = first.sent[0] as { requestId: string };
    first.emit({ type: "accepted", requestId: start.requestId, approximateTokens: 20 });
    first.emit({ type: "delta", requestId: start.requestId, text: "partial from A" });
    currentSettings = savedSettings("api-b");
    settingsListeners.forEach((listener) => listener({ type: "settings:changed" }));
    await vi.waitFor(() => expect(root.querySelector<HTMLSelectElement>("[data-provider-select]")!.value).toBe("api-b"));
    expect(root.querySelector(".context-summary")?.textContent).toContain("https://a.example.com");
    expect(root.textContent).toContain("partial from A");
    expect(first.disconnectCount).toBe(0);
    expect(first.sent).toHaveLength(1);
    first.emit({ type: "done", requestId: start.requestId, record: sideRecord("switch-stream", "answer from A") });
    expect(root.querySelector(".context-summary")?.textContent).toContain("https://b.example.com");
    openAndSubmit("second question");
    expect(ports[1]!.sent[0]).toMatchObject({ payload: { providerId: "api-b" } });
    expect(root.textContent).toContain("answer from A");
  });

  it("keeps the chosen endpoint and consent dialog when another page switches API during attachment approval", async () => {
    privacy = true; window.history.pushState({}, "", "/c/switch-consent");
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><p id="quote">alpha</p><a download="one.txt" href="https://files.example/one">one.txt</a></article></main>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Blob(["approved"], { type: "text/plain" }), { status: 200 })));
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    const root = openAndSubmit("with attachment");
    const dialog = root.querySelector<HTMLDialogElement>("[data-attachment-consent]")!;
    expect(dialog).toBeTruthy();
    dialog.querySelector<HTMLInputElement>("input")!.checked = true;
    currentSettings = savedSettings("api-b");
    settingsListeners.forEach((listener) => listener({ type: "settings:changed" }));
    await vi.waitFor(() => expect(root.querySelector<HTMLSelectElement>("[data-provider-select]")!.value).toBe("api-b"));
    expect(root.querySelector("[data-attachment-consent]")).toBe(dialog);
    expect(dialog.textContent).toContain("https://a.example.com");
    expect(dialog.querySelector<HTMLInputElement>("input")!.checked).toBe(true);
    dialog.querySelector<HTMLButtonElement>("[data-action=confirm-attachments]")!.click();
    await vi.waitFor(() => expect(ports).toHaveLength(1));
    expect(ports[0]!.sent[0]).toMatchObject({ payload: { providerId: "api-a", providerConfig: profiles[0]!.config, attachments: [{ text: "approved" }] } });
  });

  it("waits for a pending switch before sending and removes change listeners on teardown", async () => {
    privacy = true; window.history.pushState({}, "", "/c/pending-switch"); installSelectableMessage();
    const original = chrome.runtime.sendMessage;
    let completeSwitch!: (response: unknown) => void;
    chrome.runtime.sendMessage = ((message: { type: string }, callback: (response: unknown) => void) => {
      if (message.type === "settings:select") completeSwitch = callback;
      else original(message, callback);
    }) as typeof chrome.runtime.sendMessage;
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    root.querySelector<HTMLButtonElement>("[data-minimized-bar]")!.click();
    const picker = root.querySelector<HTMLSelectElement>("[data-provider-select]")!;
    picker.value = "api-b"; picker.dispatchEvent(new Event("change"));
    openAndSubmit("after switch");
    await vi.waitFor(() => expect(completeSwitch).toBeTypeOf("function"));
    expect(ports).toHaveLength(0);
    completeSwitch({ ok: true, value: savedSettings("api-b") });
    await vi.waitFor(() => expect(ports).toHaveLength(1));
    expect(ports[0]!.sent[0]).toMatchObject({ payload: { providerId: "api-b" } });
    expect(settingsListeners.size).toBe(1);
    window.dispatchEvent(new Event("pagehide"));
    expect(settingsListeners.size).toBe(0);
  });

  it("blocks a send when all API configurations have been deleted", async () => {
    privacy = true; window.history.pushState({}, "", "/c/no-api"); installSelectableMessage();
    currentSettings = { profiles: [], activeProviderId: null, config: null, privacyAccepted: true, hasSessionKey: false };
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    const root = openAndSubmit("question");
    expect(ports).toHaveLength(0);
    expect(root.textContent).toContain("添加并选择 API 配置");
    expect(root.querySelector<HTMLTextAreaElement>("textarea")!.disabled).toBe(false);
  });

  it("does not send to the old API when a switch fails while submission is waiting", async () => {
    privacy = true; window.history.pushState({}, "", "/c/failed-switch"); installSelectableMessage();
    const original = chrome.runtime.sendMessage;
    let completeSwitch!: (response: unknown) => void;
    chrome.runtime.sendMessage = ((message: { type: string }, callback: (response: unknown) => void) => {
      if (message.type === "settings:select") completeSwitch = callback;
      else original(message, callback);
    }) as typeof chrome.runtime.sendMessage;
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    root.querySelector<HTMLButtonElement>("[data-minimized-bar]")!.click();
    const picker = root.querySelector<HTMLSelectElement>("[data-provider-select]")!;
    picker.value = "api-b"; picker.dispatchEvent(new Event("change"));
    openAndSubmit("only send after switching");
    await vi.waitFor(() => expect(completeSwitch).toBeTypeOf("function"));
    completeSwitch({ ok: false, error: { code: "STORAGE_FAILED", message: "save failed" } });
    await vi.waitFor(() => expect(root.querySelector<HTMLTextAreaElement>("textarea")!.disabled).toBe(false));
    expect(ports).toHaveLength(0);
    expect(root.textContent).toContain("本次问题未发送");
    expect(root.textContent).toContain("only send after switching");
    expect(root.querySelector<HTMLSelectElement>("[data-provider-select]")!.value).toBe("api-a");
    root.querySelector<HTMLButtonElement>("[data-action=retry]")!.click();
    expect(ports[0]!.sent[0]).toMatchObject({ payload: { providerId: "api-a", question: "only send after switching" } });
  });

  it("shows an empty bar on the new-chat page and captures selections directly after opening", async () => {
    privacy = true;
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    expect(root.querySelector("[data-minimized-bar]")).toBeTruthy();
    root.querySelector<HTMLButtonElement>("[data-minimized-bar]")!.click();
    expect(root.querySelector<HTMLTextAreaElement>("textarea")!.disabled).toBe(true);
    window.history.pushState({}, "", "/c/new");
    document.body.insertAdjacentHTML("afterbegin", `<main><article data-message-author-role="assistant"><p id="quote">alpha</p></article></main>`);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1; });
    await vi.waitFor(() => expect(root.querySelector("[data-minimized-bar]")).toBeTruthy());
    root.querySelector<HTMLButtonElement>("[data-minimized-bar]")!.click();
    expect(root.querySelector(".context-summary")?.textContent).toContain("页面消息：1 条");
    const select = () => {
      document.getSelection()?.removeAllRanges();
      const range = document.createRange(); range.selectNodeContents(document.querySelector("#quote")!);
      document.getSelection()?.addRange(range); document.dispatchEvent(new Event("selectionchange"));
    };
    select();
    expect(root.querySelector("[data-active-quote] .quote-content")?.textContent).toBe("alpha");
    expect(document.querySelector<HTMLButtonElement>("[data-side-chat-selection-action]")!.style.display).toBe("none");
    expect(document.getSelection()?.toString()).toBe("alpha");
    expect(ports).toHaveLength(0);
    root.querySelector<HTMLButtonElement>("[data-action=clear-quote]")!.click();
    expect(root.querySelector("[data-active-quote]")).toBeNull();
    select();
    expect(root.querySelector("[data-active-quote] .quote-content")?.textContent).toBe("alpha");
    document.querySelector("#quote")!.textContent = "beta"; select();
    const input = root.querySelector<HTMLTextAreaElement>("textarea")!;
    input.value = "explain"; input.dispatchEvent(new Event("input"));
    root.querySelector<HTMLFormElement>("form")!.requestSubmit();
    expect(ports[0]!.sent[0]).toMatchObject({ type: "start", payload: { conversationId: "new", question: "explain", quote: { text: "beta", sourceRole: "assistant", sourceMessageIndex: 0 } } });
  });

  it("rejects malformed settings envelopes without installing UI", async () => {
    privacy = true;
    (chrome.runtime.sendMessage as unknown as (message: { type: string }, callback: (response: unknown) => void) => void) = (_message, callback) => callback({ ok: false, error: { code: "NOPE" } });
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    expect(document.querySelector("[data-side-chat-host]")).toBeNull();
  });

  it("fails closed when public provider configuration is missing or malformed", async () => {
    privacy = true;
    (chrome.runtime.sendMessage as unknown as (message: { type: string }, callback: (response: unknown) => void) => void) = (_message, callback) => callback({ ok: true, value: { privacyAccepted: true, config: { baseUrl: "https://api.example.com", model: "", contextWindowTokens: 1.5, supportsImages: "yes" } } });
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    expect(document.querySelector("[data-side-chat-host]")).toBeNull();
  });

  it("settles safely for malformed UI and history values", async () => {
    privacy = true;
    (chrome.runtime.sendMessage as unknown as (message: { type: string }, callback: (response: unknown) => void) => void) = (message, callback) => {
      if (message.type === "settings:get") callback({ ok: true, value: savedSettings() }); else if (message.type === "ui:get") callback({ ok: true, value: { windowGeometry: { width: "bad", height: 560, right: 20, bottom: 20 } } }); else if (message.type === "history:load") callback({ ok: true, value: { schemaVersion: 1, conversationId: "wrong", updatedAt: "", messages: [] } }); else callback({ ok: false, error: { code: "NETWORK_FAILED", message: "x", retryable: "bad" } });
    };
    window.history.pushState({}, "", "/c/value"); const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    expect(document.querySelector("[data-side-chat-host]")).toBeTruthy(); expect(document.querySelector("[data-side-chat-host]")?.shadowRoot?.textContent).not.toContain("wrong");
  });

  it("loads current history", async () => {
    privacy = true; historyRecords.set("one", { schemaVersion: 1, conversationId: "one", updatedAt: "", messages: [{ id: "m", role: "assistant", content: "saved", status: "complete", createdAt: "" }] });
    window.history.pushState({}, "", "/c/one");
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    const host = document.querySelector<HTMLElement>("[data-side-chat-host]")!;
    expect(host.shadowRoot?.querySelector("[data-minimized-bar]")).toBeTruthy();
    expect(host.shadowRoot?.textContent).not.toContain("saved");
    host.shadowRoot?.querySelector<HTMLButtonElement>("[data-minimized-bar]")?.click();
    expect(host.shadowRoot?.textContent).toContain("saved");
  });

  it("persists the final floating-window geometry after resizing", async () => {
    privacy = true; window.history.pushState({}, "", "/c/geometry"); installSelectableMessage();
    const sent: unknown[] = [];
    (chrome.runtime.sendMessage as unknown as (message: { type: string; conversationId?: string }, callback: (response: unknown) => void) => void) = (message, callback) => {
      sent.push(message);
      if (message.type === "settings:get") callback({ ok: true, value: savedSettings() });
      else if (message.type === "ui:get") callback({ ok: true, value: { windowGeometry: { width: 420, height: 560, right: 20, bottom: 20 } } });
      else if (message.type === "history:load") callback({ ok: true, value: null });
      else callback({ ok: true });
    };
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    const root = openAndSubmit("geometry question");
    const handle = root.querySelector<HTMLElement>("[data-resize-handle]")!;
    handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 100, clientY: 100 }));
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: 84, clientY: 84 }));
    document.dispatchEvent(new PointerEvent("pointerup", { clientX: 84, clientY: 84 }));
    expect(sent).toContainEqual({ type: "ui:set-geometry", geometry: { width: 404, height: 544, right: 36, bottom: 36 } });
  });

  it("renders a valid terminal record from the real form port", async () => {
    privacy = true; window.history.pushState({}, "", "/c/stream");
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><p id="quote">alpha</p></article></main>`;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1; });
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    const range = document.createRange(); range.selectNodeContents(document.querySelector("#quote")!); document.getSelection()?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    document.querySelector<HTMLButtonElement>("[data-side-chat-selection-action]")!.click();
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    const input = root.querySelector<HTMLTextAreaElement>("textarea")!; input.value = "question"; input.dispatchEvent(new Event("input")); root.querySelector<HTMLFormElement>("form")!.requestSubmit();
    const port = ports.at(-1)!; const start = port.sent.at(-1) as { requestId: string };
    port.emit({ type: "accepted", requestId: start.requestId, approximateTokens: 1 }); port.emit({ type: "delta", requestId: start.requestId, text: "partial" });
    expect(root.textContent).toContain("partial");
    port.emit({ type: "done", requestId: start.requestId, record: { schemaVersion: 1, conversationId: "stream", updatedAt: "", messages: [{ id: "final", role: "assistant", content: "final answer", status: "complete", createdAt: "" }] } });
    expect(root.textContent).toContain("final answer");
    expect(port.disconnectCount).toBe(1);
    port.emit({ type: "delta", requestId: start.requestId, text: "ignored" });
    port.emit({ type: "error", requestId: start.requestId, error: { code: "NETWORK_FAILED", message: "ignored", retryable: true } });
    expect(root.textContent).not.toContain("ignored");
  });

  it("does not read attachments before consent and sends only selected files", async () => {
    privacy = true; window.history.pushState({}, "", "/c/consent");
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><p id="quote">alpha</p><a download="one.txt" href="https://files.example/one">one.txt</a><a download="two.txt" href="https://files.example/two">two.txt</a></article></main>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Blob(["approved text"], { type: "text/plain" }), { status: 200 })));
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    const root = openAndSubmit("question");
    await vi.waitFor(() => expect(root.querySelector("[data-attachment-consent]")).toBeTruthy());
    expect(fetch).not.toHaveBeenCalled(); expect(ports).toHaveLength(0);
    const choices = root.querySelectorAll<HTMLInputElement>("dialog input[type=checkbox]");
    expect([...choices].every((input) => !input.checked)).toBe(true);
    choices[1]!.checked = true;
    root.querySelector<HTMLButtonElement>("[data-action=confirm-attachments]")!.click();
    await vi.waitFor(() => expect(ports).toHaveLength(1));
    expect(fetch).toHaveBeenCalledOnce();
    expect(String(vi.mocked(fetch).mock.calls[0]![0])).toBe("https://files.example/two");
    expect(ports[0]!.sent[0]).toMatchObject({ payload: { attachments: [{ name: "two.txt", text: "approved text" }] } });
  });

  it("stops generation without clearing history and ignores late stream events", async () => {
    privacy = true; window.history.pushState({}, "", "/c/stop"); installSelectableMessage();
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    const root = openAndSubmit("keep question");
    const requestId = (ports[0]!.sent[0] as { requestId: string }).requestId;
    ports[0]!.emit({ type: "accepted", requestId, approximateTokens: 10 });
    ports[0]!.emit({ type: "delta", requestId, text: "partial answer" });
    root.querySelector<HTMLButtonElement>("[data-action=stop]")!.click();
    expect(ports[0]!.sent).toContainEqual({ type: "abort", requestId });
    expect(ports[0]!.disconnectCount).toBe(1);
    expect(root.textContent).toContain("partial answer");
    expect(root.textContent).toContain("已停止");
    expect(root.querySelector<HTMLTextAreaElement>("textarea")!.disabled).toBe(false);
    ports[0]!.emit({ type: "delta", requestId, text: "must be ignored" });
    expect(root.textContent).not.toContain("must be ignored");
    openAndSubmit("new question");
    expect(root.textContent).toContain("partial answer");
    expect(root.textContent).toContain("keep question");
    expect(root.querySelector("[data-pending-message]")!.textContent).toContain("new question");
  });

  it("cancels consent without downloading files or sending a model request", async () => {
    privacy = true; window.history.pushState({}, "", "/c/cancel-consent");
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><p id="quote">alpha</p><a download="private.txt" href="https://files.example/private">private.txt</a></article></main>`;
    vi.stubGlobal("fetch", vi.fn());
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    const root = openAndSubmit("question");
    await vi.waitFor(() => expect(root.querySelector("[data-attachment-consent]")).toBeTruthy());
    root.querySelector<HTMLDialogElement>("dialog")!.dispatchEvent(new Event("cancel"));
    await vi.waitFor(() => expect(root.querySelector<HTMLTextAreaElement>("textarea")!.disabled).toBe(false));
    expect(fetch).not.toHaveBeenCalled(); expect(ports).toHaveLength(0);
  });

  it("prompts for a fetched attachment that fails local preparation, then explicitly skips it", async () => {
    privacy = true; window.history.pushState({}, "", "/c/attachment");
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><p id="quote">alpha</p><a download="empty.pdf" href="https://chatgpt.com/file">empty.pdf</a></article></main>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Blob(["x"], { type: "application/pdf" }), { status: 200 })));
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    const root = openAndSubmit("question");
    await approveAllAttachments(root);
    await vi.waitFor(() => expect(root.querySelector("[data-missing-attachments]")).toBeTruthy());
    root.querySelector<HTMLButtonElement>("[data-action=continue-without-files]")!.click();
    await vi.waitFor(() => expect(ports).toHaveLength(1));
    expect((ports[0]!.sent[0] as { payload: { attachments: unknown[] } }).payload.attachments).toEqual([]);
  });

  it("does not send when the missing-attachment dialog is canceled", async () => {
    privacy = true; window.history.pushState({}, "", "/c/attachment-cancel");
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><p id="quote">alpha</p><a download="empty.pdf" href="https://chatgpt.com/file">empty.pdf</a></article></main>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Blob(["x"], { type: "application/pdf" }), { status: 200 })));
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    const root = openAndSubmit("question");
    await approveAllAttachments(root);
    await vi.waitFor(() => expect(root.querySelector("[data-missing-attachments]")).toBeTruthy());
    root.querySelector<HTMLDialogElement>("dialog")!.dispatchEvent(new Event("cancel"));
    await vi.waitFor(() => expect(root.textContent).toContain("未发送请求"));
    expect(ports).toHaveLength(0);
    expect(root.querySelector<HTMLTextAreaElement>("textarea")!.disabled).toBe(false);
  });

  it("uses credentials only for same-origin attachment downloads", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(new Blob(["text"], { type: "text/plain" }), { status: 200 }));
    const { bootstrapPromise, fetchAttachment } = await import("../src/content/index"); await bootstrapPromise;
    await fetchAttachment({ name: "same.txt", sourceMessageIndex: 0, url: "https://chatgpt.com/same" }, "https://chatgpt.com", fetcher as typeof fetch);
    await fetchAttachment({ name: "cross.txt", sourceMessageIndex: 0, url: "https://files.example/cross" }, "https://chatgpt.com", fetcher as typeof fetch);
    expect(fetcher.mock.calls[0]?.[1]).toEqual({ credentials: "same-origin" });
    expect(fetcher.mock.calls[1]?.[1]).toEqual({ credentials: "omit" });
  });

  it("keeps readable attachments and maps reselected files to the missing message indexes", async () => {
    privacy = true; window.history.pushState({}, "", "/c/reselect");
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><p id="quote">alpha</p><a download="read.txt" href="https://files.example/read">read.txt</a></article><article data-message-author-role="user"><p>beta</p><div data-testid="attachment" data-filename="missing.txt">missing.txt</div></article></main>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Blob(["readable"], { type: "text/plain" }), { status: 200 })));
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    const root = openAndSubmit("question");
    await approveAllAttachments(root);
    await vi.waitFor(() => expect(root.querySelector("[data-missing-attachments]")).toBeTruthy());
    const input = root.querySelector<HTMLInputElement>("dialog input[type=file]")!;
    const replacement = new File(["replacement"], "missing.txt", { type: "text/plain" });
    Object.defineProperty(input, "files", { configurable: true, value: [replacement] });
    root.querySelector<HTMLButtonElement>("[data-action=reselect-files]")!.click();
    await vi.waitFor(() => expect(ports).toHaveLength(1));
    expect((ports[0]!.sent[0] as { payload: { attachments: unknown[] } }).payload.attachments).toEqual([
      { kind: "text", name: "read.txt", sourceMessageIndex: 0, text: "readable" },
      { kind: "text", name: "missing.txt", sourceMessageIndex: 1, text: "replacement" },
    ]);
  });

  it("does not start a request when navigation wins during attachment preparation", async () => {
    privacy = true; window.history.pushState({}, "", "/c/attachment-old");
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><p id="quote">alpha</p><a download="slow.txt" href="https://files.example/slow">slow.txt</a></article></main>`;
    let resolveFetch!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; })));
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    const root = openAndSubmit("question");
    await approveAllAttachments(root);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    window.history.pushState({}, "", "/c/attachment-new"); document.documentElement.append(document.createElement("i"));
    await Promise.resolve(); await Promise.resolve();
    resolveFetch(new Response(new Blob(["late"], { type: "text/plain" }), { status: 200 }));
    await vi.waitFor(() => expect(root.querySelector("[data-minimized-bar]")).toBeTruthy());
    expect(root.querySelector("textarea")).toBeNull();
    expect(ports).toHaveLength(0);
  });

  it("aborts attachment downloads on stop and does not reset a newer request", async () => {
    privacy = true; window.history.pushState({}, "", "/c/stop-download");
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><p id="quote">alpha</p><a download="slow.txt" href="https://files.example/slow">slow.txt</a></article></main>`;
    let resolveFetch!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; })));
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    const root = openAndSubmit("old question");
    await approveAllAttachments(root);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const signal = vi.mocked(fetch).mock.calls[0]![1]!.signal!;
    root.querySelector<HTMLButtonElement>("[data-action=stop]")!.click();
    expect(signal.aborted).toBe(true);
    document.querySelector("a[download]")!.remove();
    openAndSubmit("new question");
    expect(ports).toHaveLength(1);
    resolveFetch(new Response(new Blob(["late"], { type: "text/plain" }), { status: 200 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.querySelector<HTMLTextAreaElement>("textarea")!.disabled).toBe(true);
    expect(root.querySelector("[data-action=stop]")).toBeTruthy();
    expect(ports).toHaveLength(1);
  });

  it("shows a usable retry after an unexpected disconnect from the real request port", async () => {
    privacy = true; window.history.pushState({}, "", "/c/disconnect");
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><p id="quote">alpha</p></article></main>`;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1; });
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    const range = document.createRange(); range.selectNodeContents(document.querySelector("#quote")!); document.getSelection()?.addRange(range); document.dispatchEvent(new Event("selectionchange")); document.querySelector<HTMLButtonElement>("[data-side-chat-selection-action]")!.click();
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!; const input = root.querySelector<HTMLTextAreaElement>("textarea")!; input.value = "again"; input.dispatchEvent(new Event("input")); root.querySelector<HTMLFormElement>("form")!.requestSubmit();
    const port = ports.at(-1)!; port.disconnect();
    expect(root.textContent).toContain("侧边对话连接意外中断"); expect(root.querySelector<HTMLButtonElement>("[data-action=retry]")).toBeTruthy(); expect(root.querySelector<HTMLTextAreaElement>("textarea")!.disabled).toBe(false);
    root.querySelector<HTMLButtonElement>("[data-action=retry]")!.click();
    expect(ports).toHaveLength(2);
  });

  it("aborts, disconnects, and clears the real active stream before showing empty history", async () => {
    privacy = true; window.history.pushState({}, "", "/c/clear");
    let clearCompleted = false;
    (chrome.runtime.sendMessage as unknown as (message: { type: string; conversationId?: string }, callback: (response: unknown) => void) => void) = (message, callback) => {
      if (message.type === "settings:get") callback({ ok: true, value: savedSettings() }); else if (message.type === "ui:get") callback({ ok: true, value: { windowGeometry: { width: 420, height: 560, right: 20, bottom: 20 } } }); else if (message.type === "history:load") callback({ ok: true, value: null }); else if (message.type === "history:clear") { clearCompleted = true; callback({ ok: true }); } else callback({ ok: true });
    };
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><p id="quote">alpha</p></article></main>`; vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1; }); Object.defineProperty(window, "confirm", { configurable: true, value: () => true });
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    const range = document.createRange(); range.selectNodeContents(document.querySelector("#quote")!); document.getSelection()?.addRange(range); document.dispatchEvent(new Event("selectionchange")); document.querySelector<HTMLButtonElement>("[data-side-chat-selection-action]")!.click();
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!; const input = root.querySelector<HTMLTextAreaElement>("textarea")!; input.value = "clear me"; input.dispatchEvent(new Event("input")); root.querySelector<HTMLFormElement>("form")!.requestSubmit(); const port = ports.at(-1)!; const start = port.sent.at(-1) as { requestId: string };
    port.emit({ type: "accepted", requestId: start.requestId, approximateTokens: 1 }); port.emit({ type: "delta", requestId: start.requestId, text: "partial" }); root.querySelector<HTMLButtonElement>("[data-action=clear]")!.click(); await Promise.resolve();
    expect(clearCompleted).toBe(true); expect(port.sent).toContainEqual({ type: "abort", requestId: start.requestId }); expect(port.disconnectCount).toBe(1); expect(root.textContent).not.toContain("partial"); expect(root.querySelector<HTMLTextAreaElement>("textarea")!.disabled).toBe(false);
    port.emit({ type: "delta", requestId: start.requestId, text: "late" }); expect(root.textContent).not.toContain("late");
  });

  it("does not let a stale history response overwrite a newer SPA route", async () => {
    privacy = true; window.history.pushState({}, "", "/c/old");
    let oldCallback: ((response: unknown) => void) | undefined;
    (chrome.runtime.sendMessage as unknown as (message: { type: string; conversationId?: string }, callback: (response: unknown) => void) => void) = (message, callback) => {
      if (message.type === "settings:get") callback({ ok: true, value: savedSettings() });
      else if (message.type === "ui:get") callback({ ok: true, value: { windowGeometry: { width: 420, height: 560, right: 20, bottom: 20 } } });
      else if (message.type === "history:load" && message.conversationId === "old") oldCallback = callback;
      else if (message.type === "history:load") callback({ ok: true, value: { schemaVersion: 1, conversationId: "new", updatedAt: "", messages: [{ id: "new", role: "assistant", content: "NEW", status: "complete", createdAt: "" }] } }); else callback({ ok: true });
    };
    const { bootstrapPromise: boot } = await import("../src/content/index");
    window.history.pushState({}, "", "/c/new"); document.documentElement.append(document.createElement("i")); await Promise.resolve(); await Promise.resolve();
    oldCallback?.({ ok: true, value: { schemaVersion: 1, conversationId: "old", updatedAt: "", messages: [{ id: "stale", role: "assistant", content: "STALE", status: "complete", createdAt: "" }] } }); await boot;
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    expect(root.textContent).not.toContain("STALE");
    expect(root.querySelector("[data-minimized-bar]")).toBeTruthy();
    root.querySelector<HTMLButtonElement>("[data-minimized-bar]")!.click();
    expect(root.textContent).toContain("NEW");
  });

  it("does not let a delayed same-conversation history load overwrite an active stream", async () => {
    privacy = true;
    window.history.pushState({}, "", "/c/delayed-send");
    installSelectableMessage();
    let loadCallback: ((response: unknown) => void) | undefined;
    (chrome.runtime.sendMessage as unknown as (message: { type: string }, callback: (response: unknown) => void) => void) = (message, callback) => {
      if (message.type === "settings:get") callback({ ok: true, value: savedSettings() });
      else if (message.type === "ui:get") callback({ ok: true, value: { windowGeometry: { width: 420, height: 560, right: 20, bottom: 20 } } });
      else if (message.type === "history:load") loadCallback = callback;
      else callback({ ok: true });
    };
    const { bootstrapPromise } = await import("../src/content/index");
    await vi.waitFor(() => expect(loadCallback).toBeTypeOf("function"));
    const root = openAndSubmit("question");
    const port = ports.at(-1)!;
    const start = port.sent.at(-1) as { requestId: string };
    port.emit({ type: "accepted", requestId: start.requestId, approximateTokens: 1 });
    port.emit({ type: "delta", requestId: start.requestId, text: "LIVE PARTIAL" });
    loadCallback?.({ ok: true, value: sideRecord("delayed-send", "OLD HISTORY") });
    await bootstrapPromise;
    expect(root.textContent).toContain("LIVE PARTIAL");
    expect(root.textContent).not.toContain("OLD HISTORY");
  });

  it("does not let a delayed history load resurrect a cleared conversation", async () => {
    privacy = true;
    window.history.pushState({}, "", "/c/delayed-clear");
    installSelectableMessage();
    Object.defineProperty(window, "confirm", { configurable: true, value: () => true });
    let loadCallback: ((response: unknown) => void) | undefined;
    (chrome.runtime.sendMessage as unknown as (message: { type: string }, callback: (response: unknown) => void) => void) = (message, callback) => {
      if (message.type === "settings:get") callback({ ok: true, value: savedSettings() });
      else if (message.type === "ui:get") callback({ ok: true, value: { windowGeometry: { width: 420, height: 560, right: 20, bottom: 20 } } });
      else if (message.type === "history:load") loadCallback = callback;
      else callback({ ok: true });
    };
    const { bootstrapPromise } = await import("../src/content/index");
    await vi.waitFor(() => expect(loadCallback).toBeTypeOf("function"));
    const selection = document.getSelection();
    selection?.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("#quote")!);
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    document.querySelector<HTMLButtonElement>("[data-side-chat-selection-action]")!.click();
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    root.querySelector<HTMLButtonElement>("[data-action=clear]")!.click();
    await Promise.resolve();
    loadCallback?.({ ok: true, value: sideRecord("delayed-clear", "RESURRECTED") });
    await bootstrapPromise;
    expect(root.textContent).not.toContain("RESURRECTED");
  });

  it("terminates malformed current events but ignores malformed events from an old port", async () => {
    privacy = true;
    window.history.pushState({}, "", "/c/protocol");
    installSelectableMessage();
    const { bootstrapPromise } = await import("../src/content/index");
    await bootstrapPromise;
    const root = openAndSubmit("retry protocol");
    const first = ports.at(-1)!;
    const firstStart = first.sent.at(-1) as { requestId: string };
    first.emit({ type: "error", requestId: firstStart.requestId, error: { code: "NETWORK_FAILED", message: "missing retryable" } });
    expect(root.textContent).toContain("侧边对话响应无效");
    expect(root.querySelector("[data-action=retry]")).toBeTruthy();
    expect(first.disconnectCount).toBe(1);

    root.querySelector<HTMLButtonElement>("[data-action=retry]")!.click();
    const second = ports.at(-1)!;
    const secondStart = second.sent.at(-1) as { requestId: string };
    first.emit({ type: 123, requestId: secondStart.requestId });
    expect(second.disconnectCount).toBe(0);
    second.emit({ type: "done", requestId: secondStart.requestId, record: sideRecord("other-conversation", "WRONG") });
    expect(root.textContent).toContain("侧边对话响应无效");
    expect(root.textContent).not.toContain("WRONG");
    expect(second.disconnectCount).toBe(1);
  });

  it("recovers when the first runtime port connection throws synchronously", async () => {
    privacy = true;
    window.history.pushState({}, "", "/c/connect");
    installSelectableMessage();
    const connect = vi.fn()
      .mockImplementationOnce(() => { throw new Error("extension reloaded"); })
      .mockImplementation(() => { const port = new FakePort(); ports.push(port); return port; });
    chrome.runtime.connect = connect as typeof chrome.runtime.connect;
    const { bootstrapPromise } = await import("../src/content/index");
    await bootstrapPromise;
    const root = openAndSubmit("connect again");
    expect(root.textContent).toContain("无法启动");
    expect(root.querySelector("[data-action=retry]")).toBeTruthy();
    root.querySelector<HTMLButtonElement>("[data-action=retry]")!.click();
    expect(connect).toHaveBeenCalledTimes(2);
    expect(ports).toHaveLength(1);
  });

  it("keeps one singleton and restores it across BFCache and permanent lifecycle events", async () => {
    privacy = true;
    window.history.pushState({}, "", "/c/cache");
    installSelectableMessage();
    const module = await import("../src/content/index");
    await module.bootstrapPromise;
    const first = module.bootstrap();
    const second = module.bootstrap();
    expect(first).toBe(second);
    await Promise.all([first, second]);
    expect(document.querySelectorAll("[data-side-chat-host]")).toHaveLength(1);
    expect(document.querySelectorAll("[data-side-chat-selection-action]")).toHaveLength(1);

    const root = openAndSubmit("cache question");
    const port = ports.at(-1)!;
    const start = port.sent.at(-1) as { requestId: string };
    port.emit({ type: "accepted", requestId: start.requestId, approximateTokens: 1 });
    port.emit({ type: "delta", requestId: start.requestId, text: "TRANSIENT" });
    window.dispatchEvent(transition("pagehide", true));
    expect(port.sent).toContainEqual({ type: "abort", requestId: start.requestId });
    expect(document.querySelectorAll("[data-side-chat-host]")).toHaveLength(1);
    expect(root.textContent).not.toContain("TRANSIENT");

    historyRecords.set("cache", sideRecord("cache", "RESTORED"));
    window.dispatchEvent(transition("pageshow", true));
    await vi.waitFor(() => expect(root.querySelector("[data-minimized-bar]")).toBeTruthy());
    root.querySelector<HTMLButtonElement>("[data-minimized-bar]")!.click();
    expect(root.textContent).toContain("RESTORED");
    window.dispatchEvent(transition("pagehide", false));
    expect(document.querySelector("[data-side-chat-host]")).toBeNull();
    await module.bootstrap();
    expect(document.querySelectorAll("[data-side-chat-host]")).toHaveLength(1);
  });
});
