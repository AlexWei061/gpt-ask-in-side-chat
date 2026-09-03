import { afterEach, describe, expect, it, vi } from "vitest";
import { SidePanel } from "../src/content/ui/side-panel";
import { renderMarkdown } from "../src/content/ui/markdown";
import type { QuoteReference, SideMessage } from "../src/shared/types";

const quote: QuoteReference = { text: "selected words", sourceRole: "assistant", sourceMessageIndex: 0 };
const messages: SideMessage[] = [{ id: "one", role: "assistant", content: "**saved**", status: "incomplete", createdAt: "2026-01-01" }];

describe("side panel", () => {
  afterEach(() => { document.querySelectorAll("[data-side-chat-host]").forEach((node) => node.remove()); document.body.innerHTML = ""; document.body.style.marginRight = ""; vi.restoreAllMocks(); });

  it("opens a quote without sending, then submits the exact explicit payload", () => {
    const onSend = vi.fn();
    const panel = new SidePanel(document, { onSend });
    panel.setConversation("conversation", []);
    panel.open(quote);
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    expect(root.textContent).toContain("selected words");
    expect(onSend).not.toHaveBeenCalled();
    const textarea = root.querySelector<HTMLTextAreaElement>("textarea")!;
    textarea.value = "  What does this mean?  ";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    root.querySelector<HTMLFormElement>("form")!.requestSubmit();
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith({ question: "What does this mean?", quote, compressOldContext: false });
    panel.destroy();
  });

  it("sanitizes rendered markdown and safe-links it", () => {
    const html = renderMarkdown("[bad](javascript:alert(1)) <img onerror=alert(1)><iframe></iframe>", document);
    expect(html).not.toMatch(/javascript:|onerror|iframe/i);
  });

  it("keeps draft before acceptance and retries the original payload once", () => {
    const onSend = vi.fn();
    const panel = new SidePanel(document, { onSend });
    panel.setConversation("c", []); panel.open(quote);
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    const textarea = root.querySelector<HTMLTextAreaElement>("textarea")!;
    textarea.value = "draft"; textarea.dispatchEvent(new Event("input", { bubbles: true }));
    root.querySelector<HTMLFormElement>("form")!.requestSubmit();
    expect(textarea.value).toBe("draft");
    panel.setError({ message: "try again", retryable: true });
    root.querySelector<HTMLButtonElement>("[data-action=retry]")!.click();
    expect(onSend).toHaveBeenLastCalledWith({ question: "draft", quote, compressOldContext: false });
    expect(onSend).toHaveBeenCalledTimes(2);
    panel.destroy();
  });

  it("shows incomplete history and restores the original body margin when closed", () => {
    document.body.style.marginRight = "17px";
    const panel = new SidePanel(document, { onSend: vi.fn() });
    panel.setConversation("c", messages); panel.open(quote);
    const host = document.querySelector<HTMLElement>("[data-side-chat-host]")!;
    expect(host.shadowRoot!.textContent).toContain("Incomplete");
    expect(document.body.style.marginRight).toBe("420px");
    host.shadowRoot!.querySelector<HTMLButtonElement>("[data-action=close]")!.click();
    expect(document.body.style.marginRight).toBe("17px");
    panel.destroy();
  });

  it("resizes once on pointerup and cleans pointer listeners on destroy", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    const onResize = vi.fn(); const panel = new SidePanel(document, { onSend: vi.fn(), onResize });
    panel.setConversation("c", []); panel.open(quote);
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    root.querySelector<HTMLElement>("[data-resize-handle]")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 780 }));
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: 700 }));
    document.dispatchEvent(new PointerEvent("pointerup", { clientX: 700 }));
    expect(onResize).toHaveBeenCalledTimes(1);
    panel.destroy();
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: 600 }));
    expect(onResize).toHaveBeenCalledTimes(1);
  });

  it("clears old conversation state when switched", () => {
    const panel = new SidePanel(document, { onSend: vi.fn() });
    panel.setConversation("one", messages); panel.open(quote);
    panel.setError({ message: "old", retryable: true });
    panel.setConversation(null, []);
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    expect(root.textContent).not.toContain("saved");
    expect(root.querySelector(".status")!.textContent).not.toContain("old");
    root.querySelector<HTMLFormElement>("form")!.requestSubmit();
    expect(root.querySelector<HTMLTextAreaElement>("textarea")!.disabled).toBe(true);
    panel.destroy();
  });
});
