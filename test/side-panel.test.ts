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
    const host = document.querySelector<HTMLElement>("[data-side-chat-host]")!;
    expect(host.style.display).toBe("none");
    panel.setConversation("conversation", []);
    panel.open(quote);
    expect(host.style.display).toBe("");
    const root = host.shadowRoot!;
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

  it("shows the captured boundary, destination, model, limit, and accepted token estimate", () => {
    const panel = new SidePanel(document, { onSend: vi.fn() });
    panel.setConversation("conversation", []);
    panel.open(quote, { capturedMessages: 7, endpointOrigin: "https://api.example.com", model: "model-a", contextWindowTokens: 128000 });
    let text = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.textContent ?? "";
    expect(text).toContain("7 captured messages"); expect(text).toContain("https://api.example.com"); expect(text).toContain("model-a"); expect(text).toContain("128,000");
    panel.setAccepted(2345);
    text = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.textContent ?? "";
    expect(text).toContain("2,345");
    panel.destroy();
  });

  it("offers content-free diagnostics for an uncertain extraction", () => {
    const panel = new SidePanel(document, { onSend: vi.fn() });
    panel.setConversation("conversation", []); panel.open(quote);
    panel.setExtractionError(2, true);
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    expect(root.textContent).toContain("2 messages"); expect(root.querySelector("[data-action=copy-diagnostics]")).toBeTruthy();
    expect(root.textContent).not.toContain("selected words");
    panel.destroy();
  });

  it("stays open but clears ephemeral state when the conversation changes", () => {
    const panel = new SidePanel(document, { onSend: vi.fn() });
    panel.setConversation("one", messages); panel.open(quote); panel.setError({ message: "old error", retryable: true });
    panel.setConversation("two", []);
    const host = document.querySelector<HTMLElement>("[data-side-chat-host]")!;
    expect(host.style.display).toBe("");
    expect(host.shadowRoot!.querySelector(".quote")).toBeNull();
    expect(host.shadowRoot!.querySelector(".status")!.textContent).not.toContain("old error");
    panel.destroy();
  });

  it("sanitizes rendered markdown and safe-links it", () => {
    const html = renderMarkdown("[bad](javascript:alert(1)) <img onerror=alert(1)><iframe></iframe><video></video><svg><a></a></svg><form><input autofocus><button>bad</button></form>", document);
    expect(html).not.toMatch(/javascript:|onerror|iframe|video|svg|form|input|button|autofocus/i);
  });

  it("keeps safe links but strips media, SVG, and form controls", () => {
    const html = renderMarkdown("[safe](https://example.com) <video></video><svg></svg><form><input autofocus><button>x</button></form>", document);
    expect(html).toContain('target="_blank"'); expect(html).toContain('rel="noopener noreferrer"'); expect(html).not.toMatch(/video|svg|form|input|button|autofocus/i);
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

  it("does not replace an active quote, but clears stale retry when a new quote opens", () => {
    const quoteB = { ...quote, text: "second" }; const onSend = vi.fn(); const panel = new SidePanel(document, { onSend }); panel.setConversation("c", []); panel.open(quote);
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!; const input = root.querySelector<HTMLTextAreaElement>("textarea")!; input.value = "ask"; input.dispatchEvent(new Event("input")); root.querySelector<HTMLFormElement>("form")!.requestSubmit(); panel.open(quoteB); expect(root.textContent).toContain("selected words");
    panel.setError({ message: "retry", retryable: true }); root.querySelector<HTMLButtonElement>("[data-action=retry]")!.click(); expect(onSend).toHaveBeenLastCalledWith(expect.objectContaining({ quote })); panel.setError({ message: "retry", retryable: true }); panel.open(quoteB); expect(root.textContent).toContain("second"); expect(root.querySelector("[data-action=retry]")).toBeNull(); panel.destroy();
  });

  it("replaces partial streaming output when retry starts", () => {
    const panel = new SidePanel(document, { onSend: vi.fn() });
    panel.setConversation("c", []); panel.open(quote);
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    const input = root.querySelector<HTMLTextAreaElement>("textarea")!; input.value = "retry me"; input.dispatchEvent(new Event("input")); root.querySelector<HTMLFormElement>("form")!.requestSubmit();
    panel.appendDelta("old partial");
    panel.setError({ message: "retry", retryable: true });
    document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.querySelector<HTMLButtonElement>("[data-action=retry]")!.click();
    expect(document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.textContent).not.toContain("old partial");
    panel.destroy();
  });

  it("handles separately synchronous animation-frame deltas", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1; });
    const panel = new SidePanel(document, { onSend: vi.fn() }); panel.setConversation("c", []); panel.open(quote); panel.appendDelta("A"); panel.appendDelta("B");
    expect(document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.textContent).toContain("AB"); panel.destroy();
  });

  it("preserves focused textarea across coalesced streaming updates", () => {
    let frame: FrameRequestCallback | undefined; const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frame = callback; return 7; });
    const panel = new SidePanel(document, { onSend: vi.fn() }); panel.setConversation("c", []); panel.open(quote); const textarea = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.querySelector<HTMLTextAreaElement>("textarea")!; textarea.focus(); panel.appendDelta("A"); panel.appendDelta("B");
    expect(raf).toHaveBeenCalledTimes(1); expect(document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.querySelector("textarea")).toBe(textarea); frame?.(0); expect(document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.textContent).toContain("AB"); panel.destroy();
  });

  it("shows incomplete history and restores the original body margin when closed", () => {
    document.body.style.marginRight = "17px";
    const panel = new SidePanel(document, { onSend: vi.fn() });
    panel.setConversation("c", messages); panel.open(quote);
    const host = document.querySelector<HTMLElement>("[data-side-chat-host]")!;
    expect(host.shadowRoot!.textContent).toContain("Incomplete");
    expect(document.body.style.marginRight).toBe("420px");
    host.shadowRoot!.querySelector<HTMLButtonElement>("[data-action=close]")!.click();
    expect(host.style.display).toBe("none");
    expect(document.body.style.marginRight).toBe("17px");
    panel.destroy();
  });

  it("restores absent and important inline margins exactly", () => {
    const panel = new SidePanel(document, { onSend: vi.fn() }); panel.setConversation("c", []); panel.open(quote); expect(document.body.style.getPropertyPriority("margin-right")).toBe("important"); panel.close(); expect(document.body.style.getPropertyValue("margin-right")).toBe("");
    document.body.style.setProperty("margin-right", "17px", "important"); panel.open(quote); panel.close(); expect(document.body.style.getPropertyValue("margin-right")).toBe("17px"); expect(document.body.style.getPropertyPriority("margin-right")).toBe("important"); panel.destroy();
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

  it("reclamps on viewport shrink and ends a pointercancel drag once", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1800 }); const onResize = vi.fn(); const panel = new SidePanel(document, { onSend: vi.fn(), onResize }); panel.setWidth(900); panel.setConversation("c", []); panel.open(quote);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 700 }); window.dispatchEvent(new Event("resize")); const handle = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.querySelector<HTMLElement>("[data-resize-handle]")!; expect(handle.getAttribute("aria-valuenow")).toBe("350");
    handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 300 })); document.dispatchEvent(new PointerEvent("pointercancel")); document.dispatchEvent(new PointerEvent("pointermove", { clientX: 0 })); expect(onResize).toHaveBeenCalledTimes(1); panel.destroy();
  });

  it("resizes with keyboard-accessible separator controls", () => {
    const onResize = vi.fn(); const panel = new SidePanel(document, { onSend: vi.fn(), onResize });
    panel.setConversation("c", []); panel.open(quote);
    const handle = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.querySelector<HTMLElement>("[data-resize-handle]")!;
    expect(handle.getAttribute("role")).toBe("separator");
    expect(handle.tabIndex).toBe(0);
    handle.focus(); const initial = handle.getAttribute("aria-valuenow");
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.activeElement).toBe(handle);
    expect(handle.getAttribute("aria-valuenow")).not.toBe(initial);
    expect(onResize).toHaveBeenCalledTimes(2);
    panel.destroy();
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

  it("requires an exact reselected file count or explicitly continues without missing files", async () => {
    const panel = new SidePanel(document, { onSend: vi.fn() });
    const pending = panel.resolveMissingAttachments(["<img src=x>", "two.txt"]);
    const dialog = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.querySelector<HTMLDialogElement>("dialog")!;
    expect(dialog.textContent).toContain("<img src=x>");
    const input = dialog.querySelector<HTMLInputElement>("input[type=file]")!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["one"], "one.txt")] });
    dialog.querySelector<HTMLButtonElement>("[data-action=reselect-files]")!.click();
    expect(dialog.textContent).toContain("Select exactly 2 files");
    dialog.querySelector<HTMLButtonElement>("[data-action=continue-without-files]")!.click();
    await expect(pending).resolves.toBeNull();
    panel.destroy();
  });

  it("resolves a pending missing-file dialog on cancel and destroy", async () => {
    const panel = new SidePanel(document, { onSend: vi.fn() });
    const pending = panel.resolveMissingAttachments(["one.txt"]);
    const dialog = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.querySelector<HTMLDialogElement>("dialog")!;
    dialog.dispatchEvent(new Event("cancel"));
    await expect(pending).resolves.toBeUndefined();
    const pendingDestroy = panel.resolveMissingAttachments(["two.txt"]); panel.destroy();
    await expect(pendingDestroy).resolves.toBeUndefined();
  });

  it("returns an exact successful reselection and cancels a replaced resolver", async () => {
    const panel = new SidePanel(document, { onSend: vi.fn() });
    const replaced = panel.resolveMissingAttachments(["old.txt"]);
    const selected = panel.resolveMissingAttachments(["one.txt", "two.txt"]);
    await expect(replaced).resolves.toBeUndefined();
    const dialog = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.querySelector<HTMLDialogElement>("dialog")!;
    const files = [new File(["one"], "one.txt"), new File(["two"], "two.txt")];
    Object.defineProperty(dialog.querySelector<HTMLInputElement>("input[type=file]")!, "files", { configurable: true, value: files });
    dialog.querySelector<HTMLButtonElement>("[data-action=reselect-files]")!.click();
    await expect(selected).resolves.toEqual(files);
    panel.destroy();
  });

  it("settles a pending missing-file resolver when normal state rendering replaces the dialog", async () => {
    const panel = new SidePanel(document, { onSend: vi.fn() });
    const pending = panel.resolveMissingAttachments(["one.txt"]);
    panel.setConversation("other", []);
    await expect(pending).resolves.toBeUndefined();
    expect(document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.querySelector("dialog")).toBeNull();
    panel.destroy();
  });
});
