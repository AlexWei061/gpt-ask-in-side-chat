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

  it("opens only after the explicit action is clicked", () => {
    const onAsk = vi.fn();
    const controller = new SelectionController(document, onAsk);
    controller.destroy();
    expect(onAsk).not.toHaveBeenCalled();
  });
});
