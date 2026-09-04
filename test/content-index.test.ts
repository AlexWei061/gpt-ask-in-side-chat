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

describe("content bootstrap", () => {
  let ports: FakePort[]; let historyRecords = new Map<string, unknown>(); let privacy = false;
  beforeEach(() => {
    ports = []; historyRecords = new Map(); privacy = false; document.body.innerHTML = ""; document.querySelectorAll("[data-side-chat-host]").forEach((node) => node.remove());
    Object.defineProperty(globalThis, "chrome", { configurable: true, value: { runtime: {
      sendMessage: (message: { type: string; conversationId?: string }, callback: (response: unknown) => void) => {
        if (message.type === "settings:get") callback({ ok: true, value: { privacyAccepted: privacy } });
        else if (message.type === "ui:get") callback({ ok: true, value: { panelWidth: 420 } });
        else if (message.type === "history:load") callback({ ok: true, value: historyRecords.get(message.conversationId!) ?? null });
        else callback({ ok: true });
      }, lastError: null, connect: () => { const port = new FakePort(); ports.push(port); return port; },
    } } });
  });
  afterEach(() => { window.dispatchEvent(new Event("pagehide")); vi.resetModules(); document.body.innerHTML = ""; document.querySelectorAll("[data-side-chat-host]").forEach((node) => node.remove()); });

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

  it("shows a usable retry after an unexpected disconnect from the real request port", async () => {
    privacy = true; window.history.pushState({}, "", "/c/disconnect");
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><p id="quote">alpha</p></article></main>`;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1; });
    const { bootstrapPromise } = await import("../src/content/index"); await bootstrapPromise;
    const range = document.createRange(); range.selectNodeContents(document.querySelector("#quote")!); document.getSelection()?.addRange(range); document.dispatchEvent(new Event("selectionchange")); document.querySelector<HTMLButtonElement>("[data-side-chat-selection-action]")!.click();
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!; const input = root.querySelector<HTMLTextAreaElement>("textarea")!; input.value = "again"; input.dispatchEvent(new Event("input")); root.querySelector<HTMLFormElement>("form")!.requestSubmit();
    const port = ports.at(-1)!; port.disconnect();
    expect(root.textContent).toContain("connection closed unexpectedly"); expect(root.querySelector<HTMLButtonElement>("[data-action=retry]")).toBeTruthy(); expect(root.querySelector<HTMLTextAreaElement>("textarea")!.disabled).toBe(false);
    root.querySelector<HTMLButtonElement>("[data-action=retry]")!.click();
    expect(ports).toHaveLength(2);
  });

  it("aborts, disconnects, and clears the real active stream before showing empty history", async () => {
    privacy = true; window.history.pushState({}, "", "/c/clear");
    let clearCompleted = false;
    (chrome.runtime.sendMessage as unknown as (message: { type: string; conversationId?: string }, callback: (response: unknown) => void) => void) = (message, callback) => {
      if (message.type === "settings:get") callback({ ok: true, value: { privacyAccepted: true } }); else if (message.type === "ui:get") callback({ ok: true, value: { panelWidth: 420 } }); else if (message.type === "history:load") callback({ ok: true, value: null }); else if (message.type === "history:clear") { clearCompleted = true; callback({ ok: true }); } else callback({ ok: true });
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
      if (message.type === "settings:get") callback({ ok: true, value: { privacyAccepted: true } });
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
});
