import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";
import { ChatGptPageAdapter } from "../src/content/page-adapter";

describe("ChatGptPageAdapter", () => {
  beforeEach(async () => { document.body.innerHTML = await readFile("test/fixtures/chatgpt-page.html", "utf8"); });

  it("extracts every ordered role with code, table, and links", () => {
    const result = new ChatGptPageAdapter(document).extractConversation();
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toMatchObject({ index: 0, role: "user", content: "Explain this API." });
    expect(result.messages[1]?.content).toBe([
      "Use a service worker.",
      "```ts",
      "const safe = true;",
      "```",
      "| Key | Value |",
      "| --- | --- |",
      "| mode | safe |",
      "Docs",
    ].join("\n"));
    expect(result.messages[1]?.links).toEqual([{ label: "Docs", href: "https://example.com/docs" }]);
    expect(result.certain).toBe(true);
  });

  it("marks extraction uncertain when roles are missing", () => {
    document.querySelectorAll("article")[1]?.removeAttribute("data-message-author-role");
    expect(new ChatGptPageAdapter(document).extractConversation().certain).toBe(false);
  });

  it("preserves visible block boundaries while skipping hidden content", () => {
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><div class="markdown">
      <p>First paragraph.</p><p>Second paragraph.</p>
      <ul><li>First item</li><li>Second item<br>continued</li></ul>
      <span hidden>Hidden attribute</span><span style="display: none">Hidden display</span>
      <span style="visibility: hidden">Hidden visibility</span><span aria-hidden="true">Hidden aria</span>
      <span>Visible.</span>
    </div></article></main>`;

    expect(new ChatGptPageAdapter(document).extractConversation().messages[0]?.content).toBe([
      "First paragraph.",
      "Second paragraph.",
      "First item",
      "Second item",
      "continued",
      "Visible.",
    ].join("\n"));
  });

  it("uses a safe code fence and escapes table syntax", () => {
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><div class="markdown">
      <pre><code class="language-ts">const fence = \"\`\`\`\";</code></pre>
      <table><tbody><tr><td>Pipe|header</td><td>Line<br>break</td></tr><tr><td>A|B</td><td>ok</td></tr></tbody></table>
    </div></article></main>`;

    expect(new ChatGptPageAdapter(document).extractConversation().messages[0]?.content).toBe([
      "````ts",
      "const fence = \"\`\`\`\";",
      "````",
      "| Pipe\\|header | Line break |",
      "| --- | --- |",
      "| A\\|B | ok |",
    ].join("\n"));
  });

  it("escapes backslashes before table pipes", () => {
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><div class="markdown">
      <table><tbody><tr><td>Value</td></tr><tr><td>A\\|B</td></tr></tbody></table>
    </div></article></main>`;

    expect(new ChatGptPageAdapter(document).extractConversation().messages[0]?.content).toBe([
      "| Value |",
      "| --- |",
      String.raw`| A\\\|B |`,
    ].join("\n"));
  });

  it("excludes hidden table structure and collects visible table links", () => {
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><div class="markdown">
      <table><tbody>
        <tr><td>Header</td><td hidden>Secret header</td></tr>
        <tr hidden><td>Secret row</td></tr>
        <tr><td>Value</td><td style="display: none">Secret cell</td></tr>
        <tr><td><a href="https://example.com/table">Table Docs</a></td></tr>
      </tbody></table>
    </div></article></main>`;

    const message = new ChatGptPageAdapter(document).extractConversation().messages[0];
    expect(message?.content).toBe(["| Header |", "| --- |", "| Value |", "| Table Docs |"].join("\n"));
    expect(message?.links).toEqual([{ label: "Table Docs", href: "https://example.com/table" }]);
  });

  it("marks hidden message roots and ancestors uncertain", () => {
    const hiddenCases = [
      `<article data-message-author-role="assistant"><div class="markdown" hidden>Hidden root</div></article>`,
      `<div hidden><article data-message-author-role="assistant"><div class="markdown">Hidden ancestor</div></article></div>`,
      `<article data-message-author-role="assistant" hidden><div class="markdown">Hidden article</div></article>`,
    ];

    for (const markup of hiddenCases) {
      document.body.innerHTML = `<main>${markup}</main>`;
      expect(new ChatGptPageAdapter(document).extractConversation()).toEqual({ messages: [], certain: false });
    }
  });

  it("skips hidden code descendants without changing the visible code", () => {
    document.body.innerHTML = `<main><article data-message-author-role="assistant"><div class="markdown">
      <pre><code class="language-ts">const shown = true;<span hidden>const secret = true;</span></code></pre>
    </div></article></main>`;

    expect(new ChatGptPageAdapter(document).extractConversation().messages[0]?.content).toBe([
      "```ts",
      "const shown = true;",
      "```",
    ].join("\n"));
  });

  it("marks an empty conversation uncertain", () => {
    document.body.innerHTML = "<main></main>";
    expect(new ChatGptPageAdapter(document).extractConversation()).toEqual({ messages: [], certain: false });
  });

  it("reads only valid conversation URLs", () => {
    const adapter = new ChatGptPageAdapter(document);
    expect(adapter.getConversationId("https://chatgpt.com/c/conversation-123")).toBe("conversation-123");
    expect(adapter.getConversationId("https://chatgpt.com/share/conversation-123")).toBeNull();
    expect(adapter.getConversationId("not a URL")).toBeNull();
  });

  it("finds the containing message from elements and text nodes", () => {
    const adapter = new ChatGptPageAdapter(document);
    const paragraph = document.querySelector("article p");
    expect(adapter.findMessageElement(paragraph)).toBe(document.querySelector("article"));
    expect(adapter.findMessageElement(paragraph?.firstChild ?? null)).toBe(document.querySelector("article"));
    expect(adapter.findMessageElement(null)).toBeNull();
  });

  it("extracts from one captured ordered message list", () => {
    document.body.innerHTML = `<main><article data-message-author-role="user">first</article><article data-message-author-role="assistant">second</article></main>`;
    const adapter = new ChatGptPageAdapter(document); const captured = adapter.getMessageElements();
    expect(adapter.extractConversation(captured).messages).toMatchObject([{ index: 0, content: "first" }, { index: 1, content: "second" }]);
  });
});
