import { describe, expect, it, vi } from "vitest";
import { SelectionController, quoteFromRange } from "../src/content/selection";
import { ChatGptPageAdapter } from "../src/content/page-adapter";

describe("selection", () => {
  it("creates a quote only inside one message", () => {
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><p id="a">alpha beta</p></article><article data-message-author-role="user"><p id="b">gamma</p></article></main>`;
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("#a")!);
    expect(quoteFromRange(range, new ChatGptPageAdapter(document))).toEqual({ text: "alpha beta", sourceRole: "assistant", sourceMessageIndex: 0 });
    range.setEnd(document.querySelector("#b")!.firstChild!, 5);
    expect(quoteFromRange(range, new ChatGptPageAdapter(document))).toBeNull();
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

  it("opens only after the explicit action is clicked", () => {
    const onAsk = vi.fn();
    const controller = new SelectionController(document, onAsk);
    controller.destroy();
    expect(onAsk).not.toHaveBeenCalled();
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
});
