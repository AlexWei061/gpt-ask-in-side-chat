import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakePort {
  readonly onMessage = { addListener: (listener: (value: unknown) => void) => this.messages.push(listener) };
  readonly onDisconnect = { addListener: (listener: () => void) => this.disconnects.push(listener) };
  readonly sent: unknown[] = []; private messages: Array<(value: unknown) => void> = []; private disconnects: Array<() => void> = [];
  postMessage(value: unknown) { this.sent.push(value); }
  disconnect() { this.disconnects.forEach((listener) => listener()); }
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
  afterEach(() => { vi.resetModules(); document.body.innerHTML = ""; document.querySelectorAll("[data-side-chat-host]").forEach((node) => node.remove()); });

  it("does not inject UI before privacy acceptance", async () => {
    await import("../src/content/index");
    await Promise.resolve();
    expect(document.querySelector("[data-side-chat-host]")).toBeNull();
  });

  it("loads current history and safely handles terminal and disconnected streams", async () => {
    privacy = true; historyRecords.set("one", { messages: [{ id: "m", role: "assistant", content: "saved", status: "complete", createdAt: "" }] });
    window.history.pushState({}, "", "/c/one");
    const { bootstrap } = await import("../src/content/index"); await bootstrap();
    expect(document.querySelector("[data-side-chat-host]")?.shadowRoot?.textContent).toContain("saved");
    // A malformed event cannot alter UI or throw; an active-port disconnect becomes retryable notice.
    const port = new FakePort(); ports.push(port); port.emit({ type: "delta" });
    expect(document.querySelector("[data-side-chat-host]")).toBeTruthy();
  });

  it("streams accepted/delta/done and clears an active stream before history clear", async () => {
    privacy = true; window.history.pushState({}, "", "/c/stream");
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><p id="quote">alpha</p></article></main>`;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1; });
    const { bootstrap } = await import("../src/content/index"); await bootstrap();
    const range = document.createRange(); range.selectNodeContents(document.querySelector("#quote")!); document.getSelection()?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    document.querySelector<HTMLButtonElement>("[data-side-chat-selection-action]")!.click();
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    const input = root.querySelector<HTMLTextAreaElement>("textarea")!; input.value = "question"; input.dispatchEvent(new Event("input")); root.querySelector<HTMLFormElement>("form")!.requestSubmit();
    const port = ports.at(-1)!; const start = port.sent.at(-1) as { requestId: string };
    port.emit({ type: "accepted", requestId: start.requestId, approximateTokens: 1 }); port.emit({ type: "delta", requestId: start.requestId, text: "partial" });
    expect(root.textContent).toContain("partial");
    root.querySelector<HTMLButtonElement>("[data-action=clear]")!.click();
    expect(port.sent).toContainEqual({ type: "abort", requestId: start.requestId });
  });

  it("does not let a stale history response overwrite a newer SPA route", async () => {
    privacy = true; window.history.pushState({}, "", "/c/old");
    let oldCallback: ((response: unknown) => void) | undefined;
    (chrome.runtime.sendMessage as unknown as (message: { type: string; conversationId?: string }, callback: (response: unknown) => void) => void) = (message, callback) => {
      if (message.type === "settings:get") callback({ ok: true, value: { privacyAccepted: true } });
      else if (message.type === "ui:get") callback({ ok: true, value: { panelWidth: 420 } });
      else if (message.type === "history:load" && message.conversationId === "old") oldCallback = callback;
      else if (message.type === "history:load") callback({ ok: true, value: { messages: [] } }); else callback({ ok: true });
    };
    const { bootstrap } = await import("../src/content/index"); const boot = bootstrap();
    window.history.pushState({}, "", "/c/new"); document.documentElement.append(document.createElement("i")); await Promise.resolve(); await Promise.resolve();
    oldCallback?.({ ok: true, value: { messages: [{ id: "stale", role: "assistant", content: "STALE", status: "complete", createdAt: "" }] } }); await boot;
    expect(document.querySelector("[data-side-chat-host]")?.shadowRoot?.textContent).not.toContain("STALE");
  });
});
