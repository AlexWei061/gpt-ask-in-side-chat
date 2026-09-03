import { describe, expect, it } from "vitest";
import { buildChatMessages } from "../src/background/request-builder";

describe("buildChatMessages", () => {
  it("includes main context, side history, and the current question in order", () => {
    const messages = buildChatMessages({
      mainMessages: [{ index: 0, role: "user", content: "Main prompt", links: [] }],
      sideMessages: [{
        id: "s1", role: "assistant", content: "Earlier answer", status: "complete", createdAt: new Date(0).toISOString(),
      }],
      quote: { text: "Main", sourceRole: "user", sourceMessageIndex: 0 },
      question: "Why?",
      attachments: [],
      compressedSummary: null,
    });

    expect(messages.map((message) => message.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(messages[1]!.content).toContain("Main prompt");
    expect(messages[3]!.content).toContain("Why?");
  });

  it("replaces old main and side context with an explicit compressed summary", () => {
    const messages = buildChatMessages({
      mainMessages: [{ index: 0, role: "user", content: "old main", links: [] }],
      sideMessages: [{
        id: "s1", role: "assistant", content: "old side", status: "complete", createdAt: new Date(0).toISOString(),
      }],
      quote: { text: "Current quote", sourceRole: "user", sourceMessageIndex: 0 },
      question: "Current question",
      attachments: [],
      compressedSummary: "faithful summary",
    });
    const serialized = JSON.stringify(messages);

    expect(serialized).toContain("faithful summary");
    expect(serialized).not.toContain("old main");
    expect(serialized).not.toContain("old side");
  });
});
