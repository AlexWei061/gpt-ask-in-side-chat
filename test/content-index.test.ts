import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("content bootstrap", () => {
  let ports: FakePort[]; let historyRecords = new Map<string, unknown>(); let privacy = false;
  beforeEach(() => {
    ports = []; historyRecords = new Map(); privacy = false; window.history.replaceState({}, "", "/"); document.body.innerHTML = ""; document.querySelectorAll("[data-side-chat-host]").forEach((node) => node.remove());
    Object.defineProperty(globalThis, "chrome", { configurable: true, value: { runtime: {
      sendMessage: (message: { type: string; conversationId?: string }, callback: (response: unknown) => void) => {
        if (message.type === "settings:get") callback({ ok: true, value: { privacyAccepted: privacy, config: null } });
        else if (message.type === "ui:get") callback({ ok: true, value: { panelWidth: 420 } });
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
      if (message.type === "settings:get") callback({ ok: true, value: { privacyAccepted: true, config: null } }); else if (message.type === "ui:get") callback({ ok: true, value: { panelWidth: "bad" } }); else if (message.type === "history:load") callback({ ok: true, value: { schemaVersion: 1, conversationId: "wrong", updatedAt: "", messages: [] } }); else callback({ ok: false, error: { code: "NETWORK_FAILED", message: "x", retryable: "bad" } });
    };
    window.history.pushState({}, "", "/c/value"); const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    expect(document.querySelector("[data-side-chat-host]")).toBeTruthy(); expect(document.querySelector("[data-side-chat-host]")?.shadowRoot?.textContent).not.toContain("wrong");
  });

  it("loads current history", async () => {
    privacy = true; historyRecords.set("one", { schemaVersion: 1, conversationId: "one", updatedAt: "", messages: [{ id: "m", role: "assistant", content: "saved", status: "complete", createdAt: "" }] });
    window.history.pushState({}, "", "/c/one");
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    expect(document.querySelector("[data-side-chat-host]")?.shadowRoot?.textContent).toContain("saved");
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

  it("prompts for a fetched attachment that fails local preparation, then explicitly skips it", async () => {
    privacy = true; window.history.pushState({}, "", "/c/attachment");
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><p id="quote">alpha</p><a download="empty.pdf" href="https://chatgpt.com/file">empty.pdf</a></article></main>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Blob(["x"], { type: "application/pdf" }), { status: 200 })));
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    const root = openAndSubmit("question");
    await vi.waitFor(() => expect(root.querySelector("dialog")).toBeTruthy());
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
    await vi.waitFor(() => expect(root.querySelector("dialog")).toBeTruthy());
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
    await vi.waitFor(() => expect(root.querySelector("dialog")).toBeTruthy());
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
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    window.history.pushState({}, "", "/c/attachment-new"); document.documentElement.append(document.createElement("i"));
    await Promise.resolve(); await Promise.resolve();
    resolveFetch(new Response(new Blob(["late"], { type: "text/plain" }), { status: 200 }));
    await vi.waitFor(() => expect(root.querySelector<HTMLTextAreaElement>("textarea")?.disabled).toBe(true));
    expect(ports).toHaveLength(0);
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
      if (message.type === "settings:get") callback({ ok: true, value: { privacyAccepted: true, config: null } }); else if (message.type === "ui:get") callback({ ok: true, value: { panelWidth: 420 } }); else if (message.type === "history:load") callback({ ok: true, value: null }); else if (message.type === "history:clear") { clearCompleted = true; callback({ ok: true }); } else callback({ ok: true });
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
      if (message.type === "settings:get") callback({ ok: true, value: { privacyAccepted: true, config: null } });
      else if (message.type === "ui:get") callback({ ok: true, value: { panelWidth: 420 } });
      else if (message.type === "history:load" && message.conversationId === "old") oldCallback = callback;
      else if (message.type === "history:load") callback({ ok: true, value: { schemaVersion: 1, conversationId: "new", updatedAt: "", messages: [{ id: "new", role: "assistant", content: "NEW", status: "complete", createdAt: "" }] } }); else callback({ ok: true });
    };
    const { bootstrapPromise: boot } = await import("../src/content/index");
    window.history.pushState({}, "", "/c/new"); document.documentElement.append(document.createElement("i")); await Promise.resolve(); await Promise.resolve();
    oldCallback?.({ ok: true, value: { schemaVersion: 1, conversationId: "old", updatedAt: "", messages: [{ id: "stale", role: "assistant", content: "STALE", status: "complete", createdAt: "" }] } }); await boot;
    expect(document.querySelector("[data-side-chat-host]")?.shadowRoot?.textContent).not.toContain("STALE");
    expect(document.querySelector("[data-side-chat-host]")?.shadowRoot?.textContent).toContain("NEW");
  });

  it("does not let a delayed same-conversation history load overwrite an active stream", async () => {
    privacy = true;
    window.history.pushState({}, "", "/c/delayed-send");
    installSelectableMessage();
    let loadCallback: ((response: unknown) => void) | undefined;
    (chrome.runtime.sendMessage as unknown as (message: { type: string }, callback: (response: unknown) => void) => void) = (message, callback) => {
      if (message.type === "settings:get") callback({ ok: true, value: { privacyAccepted: true, config: null } });
      else if (message.type === "ui:get") callback({ ok: true, value: { panelWidth: 420 } });
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
      if (message.type === "settings:get") callback({ ok: true, value: { privacyAccepted: true, config: null } });
      else if (message.type === "ui:get") callback({ ok: true, value: { panelWidth: 420 } });
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
    await vi.waitFor(() => expect(root.textContent).toContain("RESTORED"));
    window.dispatchEvent(transition("pagehide", false));
    expect(document.querySelector("[data-side-chat-host]")).toBeNull();
    await module.bootstrap();
    expect(document.querySelectorAll("[data-side-chat-host]")).toHaveLength(1);
  });
});
