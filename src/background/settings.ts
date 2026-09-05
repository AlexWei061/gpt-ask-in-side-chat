import type { ProviderConfig, WindowGeometry } from "../shared/types";
import { normalizeBaseUrl } from "./permissions";

const CONFIG_KEY = "provider-config";
const PRIVACY_KEY = "privacy-accepted";
const API_KEY = "provider-api-key";
const PANEL_WIDTH_KEY = "panel-width";
const WINDOW_GEOMETRY_KEY = "window-geometry";
const MAX_CONTEXT_WINDOW_TOKENS = 10_000_000;
const DEFAULT_WINDOW_GEOMETRY: WindowGeometry = { width: 420, height: 560, right: 20, bottom: 20 };

type SessionKey = {
  apiKey: string;
  providerBaseUrl: string;
};

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

function readSessionKey(value: unknown, config: ProviderConfig | null): string | null {
  if (!value || typeof value !== "object" || !config) return null;
  const sessionKey = value as Partial<SessionKey>;
  if (
    typeof sessionKey.apiKey !== "string"
    || !sessionKey.apiKey.trim()
    || typeof sessionKey.providerBaseUrl !== "string"
    || sessionKey.providerBaseUrl !== config.baseUrl
  ) {
    return null;
  }
  return sessionKey.apiKey;
}

export async function restrictStorageAccess(): Promise<void> {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
}

export async function loadInternalSettings(): Promise<InternalSettings> {
  const local = await chrome.storage.local.get([CONFIG_KEY, PRIVACY_KEY]);
  const session = await chrome.storage.session.get(API_KEY);
  let config: ProviderConfig | null = null;
  try {
    config = normalizeProviderConfig(local[CONFIG_KEY]);
  } catch {
    config = null;
  }
  return {
    config,
    privacyAccepted: local[PRIVACY_KEY] === true,
    apiKey: readSessionKey(session[API_KEY], config),
  };
}

export function publicSettings(settings: InternalSettings): {
  config: ProviderConfig | null;
  privacyAccepted: boolean;
  hasSessionKey: boolean;
} {
  return {
    config: settings.config && {
      baseUrl: settings.config.baseUrl,
      model: settings.config.model,
      contextWindowTokens: settings.config.contextWindowTokens,
      supportsImages: settings.config.supportsImages,
    },
    privacyAccepted: settings.privacyAccepted,
    hasSessionKey: Boolean(settings.apiKey),
  };
}

export async function saveProviderConfig(
  config: ProviderConfig,
  privacyAccepted: boolean,
): Promise<void> {
  const normalizedConfig = normalizeProviderConfig(config);
  await chrome.storage.local.set({ [CONFIG_KEY]: normalizedConfig, [PRIVACY_KEY]: privacyAccepted });
}

export async function setSessionKey(apiKey: string): Promise<void> {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    throw new Error("请输入 API 密钥。");
  }
  const local = await chrome.storage.local.get(CONFIG_KEY);
  const config = normalizeProviderConfig(local[CONFIG_KEY]);
  await chrome.storage.session.set({
    [API_KEY]: { apiKey, providerBaseUrl: config.baseUrl },
  });
}

export async function forgetSessionKey(): Promise<void> {
  await chrome.storage.session.remove(API_KEY);
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
