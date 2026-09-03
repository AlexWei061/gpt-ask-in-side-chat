import { describe, expect, it } from "vitest";
import { isRuntimeRequest, isStreamClientMessage } from "../src/shared/protocol";

describe("runtime protocol guards", () => {
  it("accepts a valid history load request", () => {
    expect(isRuntimeRequest({ type: "history:load", conversationId: "abc" })).toBe(true);
  });
  it("rejects arbitrary fetch-shaped messages", () => {
    expect(isRuntimeRequest({ type: "fetch", url: "https://attacker.invalid" })).toBe(false);
  });
  it("accepts only typed stream start and abort messages", () => {
    expect(isStreamClientMessage({ type: "abort", requestId: "r1" })).toBe(true);
    expect(isStreamClientMessage({ type: "abort" })).toBe(false);
  });
  it("accepts bounded UI preferences only", () => {
    expect(isRuntimeRequest({ type: "ui:get" })).toBe(true);
    expect(isRuntimeRequest({ type: "ui:set-width", width: 420 })).toBe(true);
    expect(isRuntimeRequest({ type: "ui:set-width", width: 1200 })).toBe(false);
  });
});
