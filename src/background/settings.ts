import type { ProviderConfig, PublicSettings, WindowGeometry } from "../shared/types";
import { normalizeBaseUrl } from "./permissions";

const PROFILES_KEY = "provider-profiles";
const CONFIG_KEY = "provider-config";
const PRIVACY_KEY = "privacy-accepted";
const API_KEY = "provider-api-key";
const PANEL_WIDTH_KEY = "panel-width";
const WINDOW_GEOMETRY_KEY = "window-geometry";
const MAX_CONTEXT_WINDOW_TOKENS = 10_000_000;
const DEFAULT_WINDOW_GEOMETRY: WindowGeometry = { width: 420, height: 560, right: 20, bottom: 20 };

type StoredKey = { apiKey: string; providerBaseUrl: string };
type StoredProfile = { id: string; name: string; config: ProviderConfig; key: StoredKey | null };
type StoredSettings = { schemaVersion: 1; profiles: StoredProfile[]; activeProviderId: string | null; privacyAccepted: boolean };
let settingsTail: Promise<void> = Promise.resolve();

function serializeSettings<T>(action: () => Promise<T>): Promise<T> {
  const pending = settingsTail.then(action);
  settingsTail = pending.then(() => undefined, () => undefined);
  return pending;
}

export type InternalSettings = {
  config: ProviderConfig | null;
  privacyAccepted: boolean;
  apiKey: string | null;
};

export function normalizeProviderConfig(value: unknown): ProviderConfig {
  if (!value || typeof value !== "object") {
    throw new Error("模型服务商配置无效。");
  }
  const config = value as Record<string, unknown>;
  if (typeof config.model !== "string" || !config.model.trim()) {
    throw new Error("请输入模型名称。");
  }
  if (
    typeof config.contextWindowTokens !== "number"
    || !Number.isFinite(config.contextWindowTokens)
    || !Number.isInteger(config.contextWindowTokens)
    || config.contextWindowTokens < 1024
    || config.contextWindowTokens > MAX_CONTEXT_WINDOW_TOKENS
  ) {
    throw new Error("上下文窗口必须是 1024 到 10000000 之间的整数。");
  }
  if (typeof config.supportsImages !== "boolean") {
    throw new Error("模型图片支持选项必须为是或否。");
  }
  if (typeof config.baseUrl !== "string") {
    throw new Error("请输入接口地址（Base URL）。");
  }
  return {
    baseUrl: normalizeBaseUrl(config.baseUrl),
    model: config.model.trim(),
    contextWindowTokens: config.contextWindowTokens,
    supportsImages: config.supportsImages,
  };
}

function readStoredKey(value: unknown, config: ProviderConfig | null): string | null {
  if (!value || typeof value !== "object" || !config) return null;
  const storedKey = value as Partial<StoredKey>;
  if (
    typeof storedKey.apiKey !== "string"
    || !storedKey.apiKey.trim()
    || typeof storedKey.providerBaseUrl !== "string"
    || storedKey.providerBaseUrl !== config.baseUrl
  ) {
    return null;
  }
  return storedKey.apiKey;
}

export async function restrictStorageAccess(): Promise<void> {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
}

function publicSettings(settings: StoredSettings): PublicSettings {
  const profiles = settings.profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    config: normalizeProviderConfig(profile.config),
    hasSessionKey: Boolean(readStoredKey(profile.key, profile.config)),
  }));
  const active = profiles.find((profile) => profile.id === settings.activeProviderId);
  return {
    profiles,
    activeProviderId: active?.id ?? null,
    config: active?.config ?? null,
    privacyAccepted: settings.privacyAccepted,
    hasSessionKey: active?.hasSessionKey ?? false,
  };
}

function normalizeStoredSettings(value: unknown): StoredSettings {
  if (!value || typeof value !== "object") throw new Error("无法读取 API 配置列表。");
  const stored = value as Partial<StoredSettings>;
  if (stored.schemaVersion !== 1 || !Array.isArray(stored.profiles) || typeof stored.privacyAccepted !== "boolean") throw new Error("无法读取 API 配置列表。");
  const profiles = stored.profiles.map((profile) => {
    if (!profile || typeof profile.id !== "string" || !profile.id.trim() || profile.id.length > 128
      || typeof profile.name !== "string" || !profile.name.trim() || profile.name.trim().length > 80) throw new Error("API 配置无效。");
    const config = normalizeProviderConfig(profile.config);
    const apiKey = readStoredKey(profile.key, config);
    return { id: profile.id, name: profile.name.trim(), config, key: apiKey === null ? null : { apiKey, providerBaseUrl: config.baseUrl } };
  });
  if (new Set(profiles.map((profile) => profile.id)).size !== profiles.length
    || (profiles.length === 0 ? stored.activeProviderId !== null : !profiles.some((profile) => profile.id === stored.activeProviderId))) throw new Error("当前 API 配置无效。");
  return { schemaVersion: 1, profiles, activeProviderId: stored.activeProviderId ?? null, privacyAccepted: stored.privacyAccepted };
}

async function readSettings(): Promise<StoredSettings> {
  const local = await chrome.storage.local.get([PROFILES_KEY, CONFIG_KEY, PRIVACY_KEY, API_KEY]);
  if (local[PROFILES_KEY] !== undefined) return normalizeStoredSettings(local[PROFILES_KEY]);
  let config: ProviderConfig | null = null;
  try { config = normalizeProviderConfig(local[CONFIG_KEY]); } catch { /* legacy configuration can be incomplete */ }
  const apiKey = readStoredKey(local[API_KEY], config);
  const settings: StoredSettings = {
    schemaVersion: 1,
    profiles: config ? [{ id: "legacy-provider", name: "默认 API", config, key: apiKey === null ? null : { apiKey, providerBaseUrl: config.baseUrl } }] : [],
    activeProviderId: config ? "legacy-provider" : null,
    privacyAccepted: local[PRIVACY_KEY] === true,
  };
  if (config) {
    await writeSettings(settings);
    await chrome.storage.local.remove([CONFIG_KEY, PRIVACY_KEY, API_KEY]);
  }
  return settings;
}

async function writeSettings(settings: StoredSettings): Promise<void> {
  await restrictStorageAccess();
  await chrome.storage.local.set({ [PROFILES_KEY]: settings });
}

function findProfile(settings: StoredSettings, profileId?: string): StoredProfile | undefined {
  const profile = settings.profiles.find((candidate) => candidate.id === (profileId ?? settings.activeProviderId));
  if (profileId !== undefined && !profile) throw new Error("该 API 配置已不存在，请重新选择。");
  return profile;
}

export function loadPublicSettings(): Promise<PublicSettings> {
  return serializeSettings(async () => publicSettings(await readSettings()));
}

export function loadInternalSettings(profileId?: string): Promise<InternalSettings> {
  return serializeSettings(async () => {
    const settings = await readSettings();
    const profile = findProfile(settings, profileId);
    return { config: profile?.config ?? null, privacyAccepted: settings.privacyAccepted, apiKey: profile ? readStoredKey(profile.key, profile.config) : null };
  });
}

export function saveProviderProfile(input: {
  profileId?: string;
  name: string;
  config: ProviderConfig;
  privacyAccepted: boolean;
  apiKey?: string;
}): Promise<PublicSettings> {
  return serializeSettings(async () => {
    const config = normalizeProviderConfig(input.config);
    const name = input.name.trim();
    if (!name || name.length > 80) throw new Error("请输入 1 到 80 个字符的 API 名称。");
    const settings = await readSettings();
    let profile = input.profileId === undefined ? undefined : findProfile(settings, input.profileId);
    const apiKey = input.apiKey?.trim() ? input.apiKey : null;
    if (profile) {
      if (profile.config.baseUrl !== config.baseUrl) profile.key = null;
      profile.name = name;
      profile.config = config;
    } else {
      profile = { id: crypto.randomUUID(), name, config, key: null };
      settings.profiles.push(profile);
      if (settings.activeProviderId === null) settings.activeProviderId = profile.id;
    }
    if (apiKey !== null) profile.key = { apiKey, providerBaseUrl: config.baseUrl };
    settings.privacyAccepted = input.privacyAccepted;
    await writeSettings(settings);
    return publicSettings(settings);
  });
}

export function selectProviderProfile(profileId: string): Promise<PublicSettings> {
  return serializeSettings(async () => {
    const settings = await readSettings();
    findProfile(settings, profileId);
    settings.activeProviderId = profileId;
    await writeSettings(settings);
    return publicSettings(settings);
  });
}

export function deleteProviderProfile(profileId: string): Promise<PublicSettings> {
  return serializeSettings(async () => {
    const settings = await readSettings();
    findProfile(settings, profileId);
    settings.profiles = settings.profiles.filter((profile) => profile.id !== profileId);
    if (settings.activeProviderId === profileId) settings.activeProviderId = settings.profiles[0]?.id ?? null;
    await writeSettings(settings);
    return publicSettings(settings);
  });
}

export function setSessionKey(apiKey: string, profileId: string): Promise<PublicSettings> {
  return serializeSettings(async () => {
    if (!apiKey.trim()) throw new Error("请输入 API 密钥。");
    const settings = await readSettings();
    const profile = findProfile(settings, profileId)!;
    profile.key = { apiKey, providerBaseUrl: profile.config.baseUrl };
    await writeSettings(settings);
    return publicSettings(settings);
  });
}

export function forgetSessionKey(profileId: string): Promise<PublicSettings> {
  return serializeSettings(async () => {
    const settings = await readSettings();
    findProfile(settings, profileId)!.key = null;
    await writeSettings(settings);
    return publicSettings(settings);
  });
}

function normalizedNumber(value: unknown, fallback: number, minimum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(4096, Math.round(value)))
    : fallback;
}

export function normalizeWindowGeometry(value: unknown, legacyWidth?: unknown): WindowGeometry {
  const geometry = value && typeof value === "object" ? value as Partial<Record<keyof WindowGeometry, unknown>> : {};
  const fallbackWidth = normalizedNumber(legacyWidth, DEFAULT_WINDOW_GEOMETRY.width, 340);
  return {
    width: normalizedNumber(geometry.width, fallbackWidth, 340),
    height: normalizedNumber(geometry.height, DEFAULT_WINDOW_GEOMETRY.height, 360),
    right: normalizedNumber(geometry.right, DEFAULT_WINDOW_GEOMETRY.right, 12),
    bottom: normalizedNumber(geometry.bottom, DEFAULT_WINDOW_GEOMETRY.bottom, 12),
  };
}

export async function loadUiPreferences(): Promise<{ windowGeometry: WindowGeometry }> {
  const stored = await chrome.storage.local.get([WINDOW_GEOMETRY_KEY, PANEL_WIDTH_KEY]);
  return { windowGeometry: normalizeWindowGeometry(stored[WINDOW_GEOMETRY_KEY], stored[PANEL_WIDTH_KEY]) };
}

export async function saveWindowGeometry(geometry: WindowGeometry): Promise<void> {
  await chrome.storage.local.set({ [WINDOW_GEOMETRY_KEY]: normalizeWindowGeometry(geometry) });
}
