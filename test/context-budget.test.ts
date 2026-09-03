import { describe, expect, it } from "vitest";
import { ExtensionError } from "../src/shared/errors";
import { assertWithinBudget, estimateTokens, partitionForCompression } from "../src/background/context-budget";

describe("context budget", () => {
  it("uses one token per non-ASCII code point and rounds ASCII quarters up", () => {
    expect(estimateTokens("test")).toBe(1);
    expect(estimateTokens("测试测试")).toBe(4);
    expect(estimateTokens("test测")).toBe(2);
  });

  it("allows the ninety-percent context boundary and rejects overflow", () => {
    expect(() => assertWithinBudget(900, 1000)).not.toThrow();
    expect(() => assertWithinBudget(901, 1000)).toThrow(expect.objectContaining({ code: "CONTEXT_OVERFLOW" }));
    try {
      assertWithinBudget(901, 1000);
    } catch (error) {
      expect(error).toBeInstanceOf(ExtensionError);
    }
  });

  it("splits before a sequential item would overflow the compression budget", () => {
    const parts = ["a".repeat(40), "b".repeat(40), "c".repeat(40)];

    expect(partitionForCompression(parts, 15)).toEqual(parts.map((part) => [part]));
    expect(partitionForCompression(parts, 15).flat()).toEqual(parts);
  });

  it("keeps an oversized item as its own compression chunk", () => {
    const oversized = "a".repeat(80);

    expect(partitionForCompression([oversized, "b".repeat(40)], 15)).toEqual([[oversized], ["b".repeat(40)]]);
  });
});
