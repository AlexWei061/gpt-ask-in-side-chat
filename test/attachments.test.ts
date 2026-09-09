import { describe, expect, it, vi } from "vitest";
import { ATTACHMENT_MAX_BYTES, extractAttachmentDescriptors, extractPdf, prepareFile } from "../src/content/attachments";

const file = (name: string, content: string, type = "text/plain") => new File([content], name, { type });

describe("attachment preparation", () => {
  it("preserves text files exactly", async () => {
    await expect(prepareFile(file("note.txt", "one\n  two"), 3, false)).resolves.toEqual({ kind: "text", name: "note.txt", sourceMessageIndex: 3, text: "one\n  two" });
  });

  it("delegates PDFs to the local parser", async () => {
    const parser = vi.fn().mockResolvedValue("page one\npage two");
    await expect(prepareFile(file("paper.pdf", "bytes", "application/pdf"), 0, false, parser)).resolves.toEqual({ kind: "text", name: "paper.pdf", sourceMessageIndex: 0, text: "page one\npage two" });
    expect(parser).toHaveBeenCalledTimes(1);
  });

  it("extracts PDF pages in order and cleans up pages, document, and loading task", async () => {
    const cleanupOne = vi.fn(); const cleanupTwo = vi.fn(); const destroyDocument = vi.fn(); const destroyTask = vi.fn();
    const loader = vi.fn(() => ({
      promise: Promise.resolve({
        numPages: 2,
        getPage: vi.fn(async (pageNumber: number) => ({
          getTextContent: async () => ({ items: pageNumber === 1 ? [{ str: "page" }, { str: "one" }] : [{ str: "page two" }] }),
          cleanup: pageNumber === 1 ? cleanupOne : cleanupTwo,
        })),
        destroy: destroyDocument,
      }),
      destroy: destroyTask,
    }));

    await expect(extractPdf(file("paper.pdf", "bytes", "application/pdf"), loader)).resolves.toBe("page one\npage two");
    expect(cleanupOne).toHaveBeenCalledOnce(); expect(cleanupTwo).toHaveBeenCalledOnce();
    expect(destroyDocument).toHaveBeenCalledOnce(); expect(destroyTask).toHaveBeenCalledOnce();
  });

  it("rejects unsupported, oversized, empty PDF, and reader failures as attachment errors", async () => {
    const oversized = new File([new Uint8Array(ATTACHMENT_MAX_BYTES + 1)], "large.txt", { type: "text/plain" });
    for (const promise of [
      prepareFile(file("program.exe", "x", "application/octet-stream"), 0, false),
      prepareFile(oversized, 0, false),
      prepareFile(file("empty.pdf", "x", "application/pdf"), 0, false, async () => "  "),
      prepareFile(Object.assign(file("broken.txt", "x"), { text: async () => { throw new Error("local file /secret"); } }), 0, false),
    ]) await expect(promise).rejects.toMatchObject({ code: "ATTACHMENT_FAILED" });
  });

  it("requires a vision provider for images and uses a data URL", async () => {
    const image = file("image.png", "image bytes", "image/png");
    await expect(prepareFile(image, 0, false)).rejects.toMatchObject({ code: "ATTACHMENT_FAILED" });
    await expect(prepareFile(image, 0, true)).resolves.toMatchObject({ kind: "image", name: "image.png", sourceMessageIndex: 0, dataUrl: expect.stringMatching(/^data:image\/png;base64,.+$/) });
    await expect(prepareFile(file("empty.png", "", "image/png"), 0, true)).rejects.toMatchObject({ code: "ATTACHMENT_FAILED" });
  });

  it("does not recover an anchor nested in hidden attachment UI", () => {
    document.body.innerHTML = `<article><div data-testid="attachment"><span hidden><a download="hidden.txt" href="/hidden">hidden.txt</a></span></div><a download="shown.txt" href="/shown">shown.txt</a></article>`;
    expect(extractAttachmentDescriptors(Array.from(document.querySelectorAll("article")))).toEqual([{ name: "shown.txt", sourceMessageIndex: 0, url: "http://localhost:3000/shown" }]);
  });
});

describe("attachment descriptors", () => {
  it("finds sibling attachment cards in single-message articles while preserving message indexes", () => {
    document.body.innerHTML = `<main>
      <article><div data-testid="attachment"><a download="brief.txt" href="/brief">brief.txt</a></div><div data-message-author-role="user"><p>First message</p></div><div data-testid="attachment" data-filename="missing.pdf">missing.pdf</div></article>
      <article><div data-message-author-role="assistant"><p>Second message</p></div><a download="result.txt" href="/result">result.txt</a><div hidden data-testid="attachment" data-filename="hidden.txt">hidden.txt</div></article>
    </main>`;
    expect(extractAttachmentDescriptors(Array.from(document.querySelectorAll("[data-message-author-role]")))).toEqual([
      { name: "brief.txt", sourceMessageIndex: 0, url: "http://localhost:3000/brief" },
      { name: "missing.pdf", sourceMessageIndex: 0, url: null },
      { name: "result.txt", sourceMessageIndex: 1, url: "http://localhost:3000/result" },
    ]);
  });

  it("keeps attachments within their own message when an article contains multiple roles", () => {
    document.body.innerHTML = `<article>
      <div data-testid="attachment" data-filename="unattributed.txt">unattributed.txt</div>
      <div data-message-author-role="user"><a download="question.txt" href="/question">question.txt</a></div>
      <div data-message-author-role="assistant"><a download="answer.txt" href="/answer">answer.txt</a></div>
    </article>`;
    expect(extractAttachmentDescriptors(Array.from(document.querySelectorAll("[data-message-author-role]")))).toEqual([
      { name: "question.txt", sourceMessageIndex: 0, url: "http://localhost:3000/question" },
      { name: "answer.txt", sourceMessageIndex: 1, url: "http://localhost:3000/answer" },
    ]);
  });

  it("does not widen a hidden message or cross a role-bearing article boundary", () => {
    document.body.innerHTML = `<article><a download="hidden-message.txt" href="/hidden-message">hidden-message.txt</a><div hidden data-message-author-role="user">Hidden</div></article>
      <article data-message-author-role="assistant"><a download="outer.txt" href="/outer">outer.txt</a><div id="inner" data-message-author-role="user"><a download="inner.txt" href="/inner">inner.txt</a></div></article>`;
    expect(extractAttachmentDescriptors([document.querySelector("[hidden]")!, document.querySelector("#inner")!])).toEqual([
      { name: "inner.txt", sourceMessageIndex: 1, url: "http://localhost:3000/inner" },
    ]);
  });

  it("uses captured-message indexes, skips hidden nodes, and de-duplicates nested representations", () => {
    document.body.innerHTML = `<article><a download="one.txt" href="/one">One</a><div data-testid="attachment" hidden><a download="hidden.txt" href="/hidden">Hidden</a></div></article><article><div data-testid="attachment"><a download="two.txt" href="/two">Two</a></div></article>`;
    const elements = Array.from(document.querySelectorAll("article"));
    expect(extractAttachmentDescriptors(elements)).toEqual([
      { name: "one.txt", sourceMessageIndex: 0, url: "http://localhost:3000/one" },
      { name: "two.txt", sourceMessageIndex: 1, url: "http://localhost:3000/two" },
    ]);
  });
});
