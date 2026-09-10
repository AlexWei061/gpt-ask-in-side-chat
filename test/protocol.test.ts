import { describe, expect, it } from "vitest";
import { isPublicSettings, isRuntimeRequest, isSendPayload, isStreamClientMessage } from "../src/shared/protocol";
import { t } from "../src/shared/i18n";

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
    expect(isStreamClientMessage({ type: "abort", requestId: "" })).toBe(false);
    expect(isStreamClientMessage({ type: "start", requestId: "r2", payload: validPayload() })).toBe(true);
    expect(isStreamClientMessage({ type: "start", requestId: "r2", payload: { ...validPayload(), sideMessages: [] } })).toBe(false);
    expect(isStreamClientMessage({ type: "start", requestId: "r2", payload: { ...validPayload(), attachments: [{ kind: "image", name: "x", sourceMessageIndex: 0 }] } })).toBe(false);
    expect(isStreamClientMessage({ type: "start", requestId: "r3", payload: "invalid" })).toBe(false);
    expect(isStreamClientMessage({ type: "start", requestId: "r4" })).toBe(false);
  });
  it("accepts bounded UI preferences only", () => {
    expect(isRuntimeRequest({ type: "ui:get" })).toBe(true);
    expect(isRuntimeRequest({ type: "ui:set-geometry", geometry: { width: 420, height: 560, right: 20, bottom: 20 } })).toBe(true);
    expect(isRuntimeRequest({ type: "ui:set-geometry", geometry: { width: 420, height: 560, right: 20 } })).toBe(false);
    expect(isRuntimeRequest({ type: "ui:set-geometry", geometry: { width: 420, height: 560, right: -1, bottom: 20 } })).toBe(false);
    expect(isRuntimeRequest({ type: "ui:set-geometry", geometry: { width: 420, height: 560, right: 20, bottom: 20, extra: true } })).toBe(false);
    expect(isRuntimeRequest({ type: "ui:set-width", width: 420 })).toBe(false);
  });
  it("accepts only exact zero-payload runtime requests", () => {
    for (const type of ["settings:get", "ui:get", "history:clear-all"]) {
      expect(isRuntimeRequest({ type })).toBe(true);
      expect(isRuntimeRequest({ type, url: "https://attacker.invalid" })).toBe(false);
    }
  });
  it("accepts only complete provider configuration when saving settings", () => {
    const config = { baseUrl: "https://api.example.com/v1", model: "model-a", contextWindowTokens: 4096, supportsImages: false };
    expect(isRuntimeRequest({ type: "settings:save", name: "API A", config, privacyAccepted: true })).toBe(true);
    expect(isRuntimeRequest({ type: "settings:save", name: "API A", config: {}, privacyAccepted: true })).toBe(false);
    expect(isRuntimeRequest({ type: "settings:save", name: "API A", config: { ...config, model: " " }, privacyAccepted: true })).toBe(false);
    expect(isRuntimeRequest({ type: "settings:save", name: "API A", config: { ...config, contextWindowTokens: 1.5 }, privacyAccepted: true })).toBe(false);
    expect(isRuntimeRequest({ type: "settings:save", name: "API A", config: { ...config, supportsImages: "yes" }, privacyAccepted: true })).toBe(false);
    expect(isRuntimeRequest({ type: "settings:save", name: "API A", config: { ...config, extra: true }, privacyAccepted: true })).toBe(false);
  });
});

function validPayload() {
  return {
    conversationId: "conversation-1",
    mainMessages: [{ index: 0, role: "user", content: "hello", links: [{ label: "site", href: "https://example.com" }] }],
    quote: { text: "hello", sourceRole: "user", sourceMessageIndex: 0 },
    question: "What does it mean?",
    attachments: [{ kind: "text", name: "note.txt", sourceMessageIndex: 0, text: "note" }],
    compressOldContext: false,
  };
}

describe("send payload guard", () => {
  it("allows an omitted quote while still validating supplied quotes and context", () => {
    const { quote, ...followUp } = validPayload();
    expect(isSendPayload(followUp)).toBe(true);
    expect(isStreamClientMessage({ type: "start", requestId: "follow-up", payload: followUp })).toBe(true);
    expect(isSendPayload({ ...followUp, question: " " })).toBe(false);
    expect(isSendPayload({ ...followUp, mainMessages: [] })).toBe(false);
    for (const invalid of [null, {}, { ...quote, text: " " }, { ...quote, sourceMessageIndex: 9 }]) {
      expect(isSendPayload({ ...followUp, quote: invalid })).toBe(false);
    }
  });

  it("requires validated nested request context and rejects extra client history", () => {
    expect(isSendPayload(validPayload())).toBe(true);
    expect(isSendPayload({ ...validPayload(), conversationId: "" })).toBe(false);
    expect(isSendPayload({ ...validPayload(), mainMessages: [{ index: -1, role: "user", content: "x", links: [] }] })).toBe(false);
    expect(isSendPayload({ ...validPayload(), quote: { text: "x", sourceRole: "system", sourceMessageIndex: 0 } })).toBe(false);
    expect(isSendPayload({ ...validPayload(), question: " \n " })).toBe(false);
    expect(isSendPayload({ ...validPayload(), attachments: [{ kind: "text", name: "x", sourceMessageIndex: 0 }] })).toBe(false);
    expect(isSendPayload({ ...validPayload(), sideMessages: [] })).toBe(false);
    expect(isSendPayload({ ...validPayload(), mainMessages: [] })).toBe(false);
    expect(isSendPayload({ ...validPayload(), mainMessages: [{ ...validPayload().mainMessages[0], index: 2 }] })).toBe(false);
    expect(isSendPayload({ ...validPayload(), quote: { ...validPayload().quote, sourceMessageIndex: 1 } })).toBe(false);
    expect(isSendPayload({ ...validPayload(), quote: { ...validPayload().quote, sourceRole: "assistant" } })).toBe(false);
    expect(isSendPayload({ ...validPayload(), attachments: [{ ...validPayload().attachments[0], sourceMessageIndex: 2 }] })).toBe(false);
    expect(isSendPayload({ ...validPayload(), attachments: [{ kind: "image", name: "x", sourceMessageIndex: 0, dataUrl: "https://example.com/x.png" }] })).toBe(false);
    expect(isSendPayload({ ...validPayload(), mainMessages: [{ ...validPayload().mainMessages[0], content: "  " }] })).toBe(false);
    expect(isSendPayload({ ...validPayload(), quote: { ...validPayload().quote, text: " " } })).toBe(false);
    expect(isSendPayload({ ...validPayload(), attachments: [{ kind: "image", name: "x", sourceMessageIndex: 0, dataUrl: "data:image/png;base64," }] })).toBe(false);
  });
});

describe("copy", () => {
  it("provides the composer placeholder", () => {
    expect(t("composerPlaceholder", "en-US")).toBe("针对所选内容提问……");
    expect(t("composerPlaceholder", "zh-CN")).toBe("针对所选内容提问……");
  });
});


describe("multiple API protocol", () => {
  const config = { baseUrl: "https://api.example.com/v1", model: "a", contextWindowTokens: 4096, supportsImages: false };
  const profile = { id: "a", name: "API A", config, hasSessionKey: true };
  const settings = { profiles: [profile], activeProviderId: "a", config, privacyAccepted: true, hasSessionKey: true };

  it("requires explicit IDs for profile operations and rejects extra key fields", () => {
    for (const type of ["settings:select", "settings:delete", "key:forget", "provider:test"]) {
      expect(isRuntimeRequest({ type, profileId: "a" })).toBe(true);
      expect(isRuntimeRequest({ type })).toBe(false);
      expect(isRuntimeRequest({ type, profileId: " " })).toBe(false);
      expect(isRuntimeRequest({ type, profileId: "a", apiKey: "unexpected" })).toBe(false);
    }
    expect(isRuntimeRequest({ type: "key:set", profileId: "a", apiKey: "secret" })).toBe(true);
    expect(isRuntimeRequest({ type: "key:set", apiKey: "secret" })).toBe(false);
  });

  it("accepts named atomic profile saves, including blank keys and optional IDs", () => {
    const request = { type: "settings:save", name: "A", config, privacyAccepted: true };
    expect(isRuntimeRequest(request)).toBe(true);
    expect(isRuntimeRequest({ ...request, profileId: "a", apiKey: "" })).toBe(true);
    expect(isRuntimeRequest({ ...request, name: " " })).toBe(false);
    expect(isRuntimeRequest({ ...request, name: "x".repeat(81) })).toBe(false);
    expect(isRuntimeRequest({ ...request, profileId: "" })).toBe(false);
    expect(isRuntimeRequest({ ...request, apiKey: null })).toBe(false);
  });

  it("validates active-profile consistency and rejects secret-bearing public responses", () => {
    expect(isPublicSettings(settings)).toBe(true);
    expect(isPublicSettings({ profiles: [], activeProviderId: null, config: null, privacyAccepted: false, hasSessionKey: false })).toBe(true);
    expect(isPublicSettings({ ...settings, activeProviderId: "unknown" })).toBe(false);
    expect(isPublicSettings({ ...settings, profiles: [profile, profile] })).toBe(false);
    expect(isPublicSettings({ ...settings, hasSessionKey: false })).toBe(false);
    expect(isPublicSettings({ ...settings, config: { ...config, model: "b" } })).toBe(false);
    expect(isPublicSettings({ ...settings, profiles: [{ ...profile, apiKey: "secret" }] })).toBe(false);
    expect(isPublicSettings({ ...settings, apiKey: "secret" })).toBe(false);
  });

  it("accepts a request-bound provider ID and config, but rejects unbound or invalid config", () => {
    expect(isSendPayload({ ...validPayload(), providerId: "a", providerConfig: config })).toBe(true);
    expect(isSendPayload({ ...validPayload(), providerId: "a" })).toBe(true);
    expect(isSendPayload({ ...validPayload(), providerId: "" })).toBe(false);
    expect(isSendPayload({ ...validPayload(), providerConfig: config })).toBe(false);
    expect(isSendPayload({ ...validPayload(), providerId: "a", providerConfig: { ...config, apiKey: "secret" } })).toBe(false);
  });
});
