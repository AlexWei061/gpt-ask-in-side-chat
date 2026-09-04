import { afterEach, describe, expect, it, vi } from "vitest";
import { SelectionController, quoteFromRange } from "../src/content/selection";
import { ChatGptPageAdapter } from "../src/content/page-adapter";

describe("selection", () => {
  const originalViewport = { width: window.innerWidth, height: window.innerHeight };
  const originalVisualViewport = Object.getOwnPropertyDescriptor(window, "visualViewport");

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperties(window, {
      innerWidth: { configurable: true, value: originalViewport.width },
      innerHeight: { configurable: true, value: originalViewport.height },
    });
    if (originalVisualViewport) Object.defineProperty(window, "visualViewport", originalVisualViewport);
    else delete (window as { visualViewport?: VisualViewport }).visualViewport;
    document.getSelection()?.removeAllRanges();
    document.body.innerHTML = "";
  });

  it("creates a quote only inside one message", () => {
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><p id="a">alpha beta</p></article><article data-message-author-role="user"><p id="b">gamma</p></article></main>`;
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("#a")!);
    expect(quoteFromRange(range, new ChatGptPageAdapter(document))).toEqual({ text: "alpha beta", sourceRole: "assistant", sourceMessageIndex: 0 });
    range.setEnd(document.querySelector("#b")!.firstChild!, 5);
    expect(quoteFromRange(range, new ChatGptPageAdapter(document))).toBeNull();
  });

  it("creates a quote from ChatGPT div message containers", () => {
    document.body.innerHTML = `<main><div data-message-author-role="assistant"><p id="a">current markup</p></div></main>`;
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("#a")!);

    expect(quoteFromRange(range, new ChatGptPageAdapter(document))).toEqual({ text: "current markup", sourceRole: "assistant", sourceMessageIndex: 0 });
  });

  it("uses the adapter's ordered main-message index", () => {
    document.body.innerHTML = `<article data-message-author-role="assistant"><p>outside</p></article><main><article data-message-author-role="assistant"><p id="a">inside</p></article></main>`;
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("#a")!);

    expect(quoteFromRange(range, new ChatGptPageAdapter(document))).toEqual({ text: "inside", sourceRole: "assistant", sourceMessageIndex: 0 });
  });

  it("fails closed when a preceding message candidate is hidden", () => {
    document.body.innerHTML = `<main><article data-message-author-role="assistant" hidden>hidden</article><article data-message-author-role="assistant"><p id="a">visible</p></article></main>`;
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("#a")!);

    expect(quoteFromRange(range, new ChatGptPageAdapter(document))).toBeNull();
  });

  it("preserves a valid selection until the explicit action sends its quote", () => {
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><p id="a">alpha beta</p></article></main>`;
    const onAsk = vi.fn();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("#a")!);
    document.getSelection()?.addRange(range);
    const controller = new SelectionController(document, onAsk);
    const button = document.querySelector<HTMLButtonElement>("[data-side-chat-selection-action]")!;
    document.dispatchEvent(new Event("selectionchange"));
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(document.getSelection()?.rangeCount).toBe(1);
    button.click();

    expect(onAsk).toHaveBeenCalledWith({ text: "alpha beta", sourceRole: "assistant", sourceMessageIndex: 0 });
    expect(document.getSelection()?.rangeCount).toBe(0);
    expect(button.style.display).toBe("none");
    controller.destroy();
  });

  it("positions the action inside the viewport and hides it for invalid selections", () => {
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><p id="a">alpha beta</p></article></main>`;
    Object.defineProperties(window, {
      innerWidth: { configurable: true, value: 100 },
      innerHeight: { configurable: true, value: 100 },
    });
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("#a")!);
    vi.spyOn(range, "getBoundingClientRect").mockReturnValue(new DOMRect(95, 75, 0, 20));
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    const controller = new SelectionController(document, vi.fn());
    const button = document.querySelector<HTMLButtonElement>("[data-side-chat-selection-action]")!;
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 20, 20));

    document.dispatchEvent(new Event("selectionchange"));
    expect(button.style.left).toBe("72px");
    expect(button.style.top).toBe("72px");

    document.getSelection()?.removeAllRanges();
    document.dispatchEvent(new Event("selectionchange"));
    expect(button.style.display).toBe("none");
    controller.destroy();
  });

  it("hides a visible action after an outside press without sending", () => {
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><p id="a">alpha beta</p></article></main>`;
    const onAsk = vi.fn();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("#a")!);
    document.getSelection()?.addRange(range);
    const controller = new SelectionController(document, onAsk);
    const button = document.querySelector<HTMLButtonElement>("[data-side-chat-selection-action]")!;
    document.dispatchEvent(new Event("selectionchange"));
    expect(button.style.display).toBe("block");

    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(button.style.display).toBe("none");
    expect(onAsk).not.toHaveBeenCalled();
    controller.destroy();
  });

  it("hides a visible action when the window resizes", () => {
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><p id="a">alpha beta</p></article></main>`;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("#a")!);
    document.getSelection()?.addRange(range);
    const controller = new SelectionController(document, vi.fn());
    const button = document.querySelector<HTMLButtonElement>("[data-side-chat-selection-action]")!;
    document.dispatchEvent(new Event("selectionchange"));

    window.dispatchEvent(new Event("resize"));
    expect(button.style.display).toBe("none");
    controller.destroy();
  });

  it("hides on visual viewport resize and removes its listener on destroy", () => {
    const visualViewport = new EventTarget();
    Object.defineProperty(window, "visualViewport", { configurable: true, value: visualViewport });
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><p id="a">alpha beta</p></article></main>`;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("#a")!);
    document.getSelection()?.addRange(range);
    const controller = new SelectionController(document, vi.fn());
    const button = document.querySelector<HTMLButtonElement>("[data-side-chat-selection-action]")!;
    document.dispatchEvent(new Event("selectionchange"));

    visualViewport.dispatchEvent(new Event("resize"));
    expect(button.style.display).toBe("none");
    controller.destroy();
    button.style.display = "block";
    visualViewport.dispatchEvent(new Event("resize"));
    expect(button.style.display).toBe("block");
  });

  it("limits the action width to the viewport", () => {
    const controller = new SelectionController(document, vi.fn());
    const button = document.querySelector<HTMLButtonElement>("[data-side-chat-selection-action]")!;

    expect(button.style.maxWidth).toBe("calc(100vw - 16px)");
    expect(button.style.boxSizing).toBe("border-box");
    controller.destroy();
  });

  it("coalesces immediate selection changes and cancels pending work on destroy", () => {
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><p id="a">alpha beta</p></article></main>`;
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("#a")!);
    document.getSelection()?.addRange(range);
    let refresh: FrameRequestCallback | undefined;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      refresh = callback;
      return 42;
    });
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    const extract = vi.spyOn(ChatGptPageAdapter.prototype, "extractConversation");
    const controller = new SelectionController(document, vi.fn());

    document.dispatchEvent(new Event("selectionchange"));
    document.dispatchEvent(new Event("selectionchange"));
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(extract).not.toHaveBeenCalled();
    refresh?.(0);
    expect(extract).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event("selectionchange"));
    controller.destroy();
    expect(cancel).toHaveBeenCalledWith(42);
  });

  it("does not reshow after an outside dismissal cancels a pending refresh", () => {
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><p id="a">alpha beta</p></article></main>`;
    const onAsk = vi.fn();
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("#a")!);
    document.getSelection()?.addRange(range);
    const controller = new SelectionController(document, onAsk);
    const button = document.querySelector<HTMLButtonElement>("[data-side-chat-selection-action]")!;

    document.dispatchEvent(new Event("selectionchange"));
    callbacks[0]?.(0);
    expect(button.style.display).toBe("block");
    document.dispatchEvent(new Event("selectionchange"));
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    callbacks[1]?.(0);

    expect(button.style.display).toBe("none");
    expect(onAsk).not.toHaveBeenCalled();
    controller.destroy();
  });
});
