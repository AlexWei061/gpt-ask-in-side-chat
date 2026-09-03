import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";
import { ChatGptPageAdapter } from "../src/content/page-adapter";

describe("ChatGptPageAdapter", () => {
  beforeEach(async () => { document.body.innerHTML = await readFile("test/fixtures/chatgpt-page.html", "utf8"); });

  it("extracts every ordered role with code, table, and links", () => {
    const result = new ChatGptPageAdapter(document).extractConversation();
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toMatchObject({ index: 0, role: "user", content: "Explain this API." });
    expect(result.messages[1]?.content).toContain("```ts\nconst safe = true;\n```");
    expect(result.messages[1]?.content).toContain("| Key | Value |");
    expect(result.messages[1]?.content).not.toContain("Copy");
    expect(result.messages[1]?.links).toEqual([{ label: "Docs", href: "https://example.com/docs" }]);
    expect(result.certain).toBe(true);
  });

  it("marks extraction uncertain when roles are missing", () => {
    document.querySelectorAll("article")[1]?.removeAttribute("data-message-author-role");
    expect(new ChatGptPageAdapter(document).extractConversation().certain).toBe(false);
  });
});
