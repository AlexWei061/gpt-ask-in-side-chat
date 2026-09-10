import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicProviderProfile, PublicSettings } from "../src/shared/types";

const savedConfig = { baseUrl: "https://api.example.com/v1", model: "model-a", contextWindowTokens: 128000, supportsImages: true };
const profileA: PublicProviderProfile = { id: "a", name: "日常问答", config: savedConfig, hasSessionKey: true };
const profileB: PublicProviderProfile = { id: "b", name: "代码助手", config: { ...savedConfig, baseUrl: "https://code.example.com/v1", model: "model-b" }, hasSessionKey: true };

function publicSettings(profiles: PublicProviderProfile[], activeProviderId = profiles[0]?.id ?? null, privacyAccepted = true): PublicSettings {
  const active = profiles.find((profile) => profile.id === activeProviderId);
  return { profiles, activeProviderId, privacyAccepted, config: active?.config ?? null, hasSessionKey: active?.hasSessionKey ?? false };
}

function installChrome(initialSettings: unknown, permission = true) {
  let settings = structuredClone(initialSettings) as PublicSettings;
  const origins = new Set((settings.profiles ?? []).map((profile) => `${new URL(profile.config.baseUrl).origin}/*`));
  origins.add("https://chatgpt.com/*");
  const sendMessage = vi.fn((message: { type: string; profileId?: string; name?: string; config?: typeof savedConfig; privacyAccepted?: boolean; apiKey?: string }, callback: (response: unknown) => void) => {
    if (message.type === "settings:save") {
      const existing = settings.profiles.find((profile) => profile.id === message.profileId);
      const profile: PublicProviderProfile = {
        id: existing?.id ?? `new-${settings.profiles.length}`,
        name: message.name!,
        config: message.config!,
        hasSessionKey: Boolean(message.apiKey || (existing?.config.baseUrl === message.config?.baseUrl && existing?.hasSessionKey)),
      };
      settings = publicSettings(existing ? settings.profiles.map((item) => item.id === existing.id ? profile : item) : [...settings.profiles, profile], settings.activeProviderId ?? profile.id, message.privacyAccepted);
    } else if (message.type === "settings:select") {
      settings = publicSettings(settings.profiles, message.profileId);
    } else if (message.type === "settings:delete") {
      const profiles = settings.profiles.filter((profile) => profile.id !== message.profileId);
      settings = publicSettings(profiles, settings.activeProviderId === message.profileId ? profiles[0]?.id ?? null : settings.activeProviderId);
    } else if (message.type === "key:forget") {
      settings = publicSettings(settings.profiles.map((profile) => profile.id === message.profileId ? { ...profile, hasSessionKey: false } : profile), settings.activeProviderId);
    }
    callback({ ok: true, value: ["settings:get", "settings:save", "settings:select", "settings:delete", "key:forget"].includes(message.type) ? settings : undefined });
  });
  const request = vi.fn(async ({ origins: requested }: { origins: string[] }) => { if (permission) requested.forEach((origin) => origins.add(origin)); return permission; });
  const remove = vi.fn(async ({ origins: removed }: { origins: string[] }) => { removed.forEach((origin) => origins.delete(origin)); return true; });
  const getAll = vi.fn(async () => ({ origins: [...origins] }));
  let storageListener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void;
  const addListener = vi.fn((listener: typeof storageListener) => { storageListener = listener; });
  function changeSettings(next: PublicSettings): void {
    settings = structuredClone(next);
    storageListener({ "provider-profiles": { newValue: { apiKey: "never-read-event-secrets" } } }, "local");
  }
  Object.defineProperty(globalThis, "chrome", { configurable: true, value: { runtime: { sendMessage, lastError: null }, permissions: { request, remove, getAll }, storage: { onChanged: { addListener } } } });
  return { sendMessage, request, remove, getAll, changeSettings };
}

function input(selector: string): HTMLInputElement { return document.querySelector<HTMLInputElement>(selector)!; }
function button(selector: string): HTMLButtonElement { return document.querySelector<HTMLButtonElement>(selector)!; }
function edit(id: string): void { button(`[data-profile-id="${id}"] [data-action="edit"]`).click(); }
function select(id: string): void { button(`[data-profile-id="${id}"] [data-action="select"]`).click(); }
function submit(): void { document.querySelector<HTMLFormElement>("#settings")!.requestSubmit(); }
async function idle(): Promise<void> { await vi.waitFor(() => expect(button('[type="submit"]').disabled).toBe(false)); }
async function loadOptions(): Promise<void> { await import("../src/options/index"); await idle(); }

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = '<main id="app"></main>';
  Object.defineProperty(window, "confirm", { configurable: true, value: vi.fn(() => true) });
});
afterEach(() => { vi.resetModules(); });

describe("multiple API settings", () => {
  it("loads named profiles and only public key status, rendering names as text", async () => {
    const chromeMock = installChrome(publicSettings([profileA, { ...profileB, name: '<img src=x onerror="alert(1)">' }]));
    await loadOptions();
    expect(document.querySelector("h1")?.textContent).toBe("侧边对话助手");
    expect(input("#profile-name").value).toBe(profileA.name);
    expect(input("#base-url").value).toBe(savedConfig.baseUrl);
    expect(input("#model").value).toBe(savedConfig.model);
    expect(input("#context-window").value).toBe("128000");
    expect(input("#images").checked).toBe(true);
    expect(input("#privacy").checked).toBe(true);
    expect(input("#api-key").value).toBe("");
    expect(input("#api-key").placeholder).toMatch(/已设置密钥/);
    expect(document.querySelectorAll(".profile-row")).toHaveLength(2);
    expect(document.querySelector('[data-profile-id="a"] .profile-badge')?.textContent).toBe("使用中");
    expect(document.querySelector("#profile-list img")).toBeNull();
    expect(document.querySelector(".data-controls")?.textContent).toContain("扩展重新加载或 Chrome 重启后仍保留");
    expect(chromeMock.sendMessage).toHaveBeenCalledExactlyOnceWith({ type: "settings:get" }, expect.any(Function));
  });

  it("saves the explicit editing ID with a blank key omitted and keeps all referenced origins", async () => {
    const chromeMock = installChrome(publicSettings([profileA, profileB]));
    await loadOptions();
    edit("b");
    input("#base-url").value = "https://code.example.com/v1/";
    submit();
    await idle();
    expect(chromeMock.sendMessage).toHaveBeenCalledWith({ type: "settings:save", profileId: "b", name: profileB.name, config: profileB.config, privacyAccepted: true }, expect.any(Function));
    expect(chromeMock.request).toHaveBeenCalledWith({ origins: ["https://code.example.com/*"] });
    expect(chromeMock.remove).not.toHaveBeenCalled();
    expect(chromeMock.sendMessage.mock.calls.some(([value]) => value.type === "key:set" || value.type === "settings:select")).toBe(false);
    expect(document.querySelector('[data-profile-id="a"] .profile-badge')).toBeTruthy();
    expect(document.querySelector("#status")?.textContent).toContain("设置已保存");
  });

  it("creates a named keyless profile without changing the active profile", async () => {
    const chromeMock = installChrome(publicSettings([profileA]));
    await loadOptions();
    button("#add-profile").click();
    input("#profile-name").value = "备用接口";
    input("#base-url").value = profileB.config.baseUrl;
    input("#model").value = profileB.config.model;
    submit();
    await idle();
    expect(chromeMock.sendMessage).toHaveBeenCalledWith({ type: "settings:save", name: "备用接口", config: { ...profileB.config, supportsImages: false }, privacyAccepted: true }, expect.any(Function));
    expect(document.querySelector('[data-profile-id="new-1"]')?.textContent).toContain("未配置密钥");
    expect(document.querySelector('[data-profile-id="a"] .profile-badge')).toBeTruthy();
    expect(input("#profile-name").value).toBe("备用接口");
    expect(button("#delete-profile").disabled).toBe(false);
    expect(input("#api-key").placeholder).toBe("请输入 API 密钥");
  });

  it("keeps editing the newly saved profile when another page created one first", async () => {
    const chromeMock = installChrome(publicSettings([profileA]));
    await loadOptions();
    button("#add-profile").click();
    input("#profile-name").value = "本页新增";
    input("#base-url").value = "https://new.example/v1";
    input("#model").value = "new-model";
    let grantPermission!: (granted: boolean) => void;
    chromeMock.request.mockReturnValueOnce(new Promise<boolean>((resolve) => { grantPermission = resolve; }));
    submit();
    chromeMock.changeSettings(publicSettings([profileA, profileB]));
    grantPermission(true);
    await idle();
    expect(document.querySelectorAll(".profile-row")).toHaveLength(3);
    expect(input("#profile-name").value).toBe("本页新增");
    expect(input("#model").value).toBe("new-model");
    expect(document.querySelector(".profile-row.is-editing")?.getAttribute("data-profile-id")).toBe("new-2");
    button("#test").click();
    await idle();
    expect(chromeMock.sendMessage).toHaveBeenCalledWith({ type: "provider:test", profileId: "new-2" }, expect.any(Function));
  });

  it("atomically saves a newly entered key and keeps the secret out of the rendered page", async () => {
    const chromeMock = installChrome(publicSettings([{ ...profileA, hasSessionKey: false }]));
    await loadOptions();
    input("#api-key").value = "  secret  ";
    submit();
    await idle();
    expect(chromeMock.sendMessage).toHaveBeenCalledWith({ type: "settings:save", profileId: "a", name: profileA.name, config: savedConfig, privacyAccepted: true, apiKey: "secret" }, expect.any(Function));
    expect(chromeMock.sendMessage.mock.calls.some(([message]) => message.type === "key:set")).toBe(false);
    expect(input("#api-key").value).toBe("");
    expect(input("#api-key").placeholder).toMatch(/已设置密钥/);
    expect(document.querySelector("#app")?.innerHTML).not.toContain("secret");
  });

  it("selects a saved profile without losing a separate editor draft", async () => {
    const chromeMock = installChrome(publicSettings([profileA, profileB]));
    await loadOptions();
    input("#profile-name").value = "未保存的名字";
    select("b");
    await idle();
    expect(chromeMock.sendMessage).toHaveBeenCalledWith({ type: "settings:select", profileId: "b" }, expect.any(Function));
    expect(input("#profile-name").value).toBe("未保存的名字");
    expect(document.querySelector('[data-profile-id="b"] .profile-badge')).toBeTruthy();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("asks before discarding drafts when editing another profile or adding one", async () => {
    installChrome(publicSettings([profileA, profileB]));
    await loadOptions();
    input("#model").value = "draft-model";
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    edit("b");
    expect(input("#model").value).toBe("draft-model");
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("未保存"));
    edit("b");
    expect(input("#model").value).toBe(profileB.config.model);
    input("#api-key").value = "draft-key";
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    button("#add-profile").click();
    expect(input("#api-key").value).toBe("draft-key");
    button("#add-profile").click();
    expect(input("#api-key").value).toBe("");
    expect(button("#delete-profile").disabled).toBe(true);
  });

  it("tests and forgets the edited profile, regardless of the active profile", async () => {
    const chromeMock = installChrome(publicSettings([profileA, profileB]));
    await loadOptions();
    edit("b");
    button("#test").click();
    await idle();
    expect(chromeMock.sendMessage).toHaveBeenCalledWith({ type: "provider:test", profileId: "b" }, expect.any(Function));
    expect(document.querySelector("#status")?.textContent).toBe("「代码助手」连接成功。");
    button("#forget").click();
    await idle();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("代码助手"));
    expect(chromeMock.sendMessage).toHaveBeenCalledWith({ type: "key:forget", profileId: "b" }, expect.any(Function));
    expect(input("#api-key").placeholder).toBe("请输入 API 密钥");
    expect(document.querySelector('[data-profile-id="a"] .profile-badge')).toBeTruthy();
    button("#clear").click();
    await idle();
    expect(chromeMock.sendMessage).toHaveBeenCalledWith({ type: "history:clear-all" }, expect.any(Function));
  });

  it("requires saving edits before testing or forgetting the stored key", async () => {
    const chromeMock = installChrome(publicSettings([profileA]));
    await loadOptions();
    input("#base-url").value = "https://new.example/v1";
    button("#test").click();
    await idle();
    expect(document.querySelector("#status")?.textContent).toContain("请先保存当前配置");
    button("#forget").click();
    expect(document.querySelector("#status")?.textContent).toContain("请先保存当前修改");
    expect(chromeMock.sendMessage.mock.calls.some(([message]) => message.type === "provider:test" || message.type === "key:forget")).toBe(false);
    button("#add-profile").click();
    button("#test").click();
    await idle();
    expect(document.querySelector("#status")?.textContent).toContain("请先保存当前配置");
  });

  it("deletes only the edited profile after confirmation and retains a shared origin", async () => {
    const sharedProfile = { ...profileB, config: { ...profileB.config, baseUrl: `${savedConfig.baseUrl}/alternate` } };
    const chromeMock = installChrome(publicSettings([profileA, sharedProfile]));
    await loadOptions();
    edit("b");
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    button("#delete-profile").click();
    expect(chromeMock.sendMessage.mock.calls.some(([message]) => message.type === "settings:delete")).toBe(false);
    button("#delete-profile").click();
    await idle();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("代码助手"));
    expect(chromeMock.sendMessage).toHaveBeenCalledWith({ type: "settings:delete", profileId: "b" }, expect.any(Function));
    expect(chromeMock.remove).not.toHaveBeenCalled();
    expect(document.querySelectorAll(".profile-row")).toHaveLength(1);
    expect(input("#profile-name").value).toBe(profileA.name);
    button("#delete-profile").click();
    await idle();
    expect(chromeMock.remove).toHaveBeenCalledWith({ origins: ["https://api.example.com/*"] });
    expect(document.querySelectorAll(".profile-row")).toHaveLength(0);
    expect(input("#profile-name").value).toBe("默认配置");
    expect(button("#delete-profile").disabled).toBe(true);
  });

  it("cleans unused endpoint permissions after edits while preserving the other profiles", async () => {
    const chromeMock = installChrome(publicSettings([profileA, profileB]));
    await loadOptions();
    input("#base-url").value = "https://new.example/v1";
    input("#api-key").value = "new-key";
    submit();
    await idle();
    expect(chromeMock.remove).toHaveBeenCalledExactlyOnceWith({ origins: ["https://api.example.com/*"] });
    expect(chromeMock.request).toHaveBeenCalledWith({ origins: ["https://new.example/*"] });
  });

  it("retries stale endpoint permission cleanup after a transient removal failure", async () => {
    const chromeMock = installChrome(publicSettings([profileA]));
    chromeMock.remove.mockResolvedValueOnce(false);
    await loadOptions();
    input("#base-url").value = "https://new.example/v1";
    submit();
    await idle();
    expect(document.querySelector("#status")?.textContent).toMatch(/无法移除/);
    submit();
    await idle();
    expect(chromeMock.remove).toHaveBeenCalledTimes(2);
    expect(chromeMock.remove).toHaveBeenLastCalledWith({ origins: ["https://api.example.com/*"] });
  });

  it("refreshes a remotely selected profile while preserving editor and new-profile drafts", async () => {
    const chromeMock = installChrome(publicSettings([profileA, profileB]));
    await loadOptions();
    input("#model").value = "draft-model";
    input("#api-key").value = "draft-key";
    chromeMock.changeSettings(publicSettings([profileA, profileB], "b"));
    await idle();
    expect(document.querySelector('[data-profile-id="b"] .profile-badge')).toBeTruthy();
    expect(input("#profile-name").value).toBe(profileA.name);
    expect(input("#model").value).toBe("draft-model");
    expect(input("#api-key").value).toBe("draft-key");
    button("#add-profile").click();
    input("#profile-name").value = "尚未保存的新配置";
    chromeMock.changeSettings(publicSettings([profileA, profileB], "a"));
    await idle();
    expect(document.querySelector('[data-profile-id="a"] .profile-badge')).toBeTruthy();
    expect(input("#profile-name").value).toBe("尚未保存的新配置");
    expect(button("#delete-profile").disabled).toBe(true);
    expect(document.querySelector("#app")?.innerHTML).not.toContain("never-read-event-secrets");
  });

  it("defers external updates during a save and checks fresh profiles before removing permissions", async () => {
    const chromeMock = installChrome(publicSettings([profileA]));
    await loadOptions();
    let grantPermission!: (granted: boolean) => void;
    chromeMock.request.mockReturnValueOnce(new Promise<boolean>((resolve) => { grantPermission = resolve; }));
    input("#model").value = "saved-new-model";
    input("#base-url").value = "https://new.example/v1";
    input("#api-key").value = "new-key";
    submit();
    const callsBeforeChange = chromeMock.sendMessage.mock.calls.length;
    chromeMock.changeSettings(publicSettings([profileA, profileB], "b"));
    chromeMock.getAll.mockImplementationOnce(async () => {
      const savedProfile = { ...profileA, config: { ...savedConfig, model: "saved-new-model", baseUrl: "https://new.example/v1" } };
      chromeMock.changeSettings(publicSettings([savedProfile, profileB, { ...profileA, id: "c", name: "共用旧地址" }], "b"));
      return { origins: ["https://api.example.com/*", "https://chatgpt.com/*"] };
    });
    expect(chromeMock.sendMessage).toHaveBeenCalledTimes(callsBeforeChange);
    expect(input("#model").value).toBe("saved-new-model");
    grantPermission(true);
    await idle();
    expect(chromeMock.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "settings:save", profileId: "a", config: expect.objectContaining({ model: "saved-new-model" }) }), expect.any(Function));
    expect(chromeMock.remove).not.toHaveBeenCalled();
    expect(document.querySelector('[data-profile-id="b"] .profile-badge')).toBeTruthy();
    expect(input("#profile-name").value).toBe(profileA.name);
    expect(input("#model").value).toBe("saved-new-model");
    expect(input("#api-key").value).toBe("");
    expect(document.querySelector("#status")?.textContent).toContain("设置已保存");
  });

  it("does not save before disclosure acceptance or when endpoint permission is denied", async () => {
    const chromeMock = installChrome(publicSettings([], null, false), false);
    await loadOptions();
    input("#base-url").value = savedConfig.baseUrl;
    input("#model").value = "model";
    submit();
    await idle();
    expect(document.querySelector("#status")?.textContent).toMatch(/使用说明/);
    expect(chromeMock.request).not.toHaveBeenCalled();
    input("#privacy").checked = true;
    submit();
    await idle();
    expect(chromeMock.request).toHaveBeenCalledOnce();
    expect(document.querySelector("#status")?.textContent).toMatch(/未获得/);
    expect(chromeMock.sendMessage.mock.calls.some(([value]) => value.type === "settings:save")).toBe(false);
  });
});
