import { describe, expect, it } from "vitest";
import { ExtensionError } from "../src/shared/errors";
import { assertWithinBudget, estimateTokens, partitionForCompression } from "../src/background/context-budget";

describe("context budget", () => {
  it("estimates non-ASCII text as more tokens than equivalent ASCII text", () => {
    expect(estimateTokens("测试测试")).toBeGreaterThan(estimateTokens("test"));
  });

  it("rejects approximate usage above ninety percent of the context window", () => {
    expect(() => assertWithinBudget(901, 1000)).toThrow(expect.objectContaining({ code: "CONTEXT_OVERFLOW" }));
    try {
      assertWithinBudget(901, 1000);
    } catch (error) {
      expect(error).toBeInstanceOf(ExtensionError);
    }
  });

  it("partitions sequential strings without reordering or dropping content", () => {
    const parts = ["a".repeat(40), "b".repeat(40), "c".repeat(40)];

    expect(partitionForCompression(parts, 15).flat()).toEqual(parts);
  });
});
