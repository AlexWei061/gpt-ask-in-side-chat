import type { ProviderConfig } from "../shared/types";
import { normalizeBaseUrl } from "./permissions";

const CONFIG_KEY = "provider-config";
const PRIVACY_KEY = "privacy-accepted";
const API_KEY = "provider-api-key";
const PANEL_WIDTH_KEY = "panel-width";
const MAX_CONTEXT_WINDOW_TOKENS = 10_000_000;

type SessionKey = {
  apiKey: string;
  providerOrigin: string;
};

export type InternalSettings = {
  config: ProviderConfig | null;
  privacyAccepted: boolean;
  apiKey: string | null;
};

export function normalizeProviderConfig(value: unknown): ProviderConfig {
  if (!value || typeof value !== "object") {
    throw new Error("Provider configuration is invalid.");
  }
  const config = value as Record<string, unknown>;
  if (typeof config.model !== "string" || !config.model.trim()) {
    throw new Error("Provider model is required.");
  }
  if (
    typeof config.contextWindowTokens !== "number"
    || !Number.isFinite(config.contextWindowTokens)
    || !Number.isInteger(config.contextWindowTokens)
    || config.contextWindowTokens < 1024
    || config.contextWindowTokens > MAX_CONTEXT_WINDOW_TOKENS
  ) {
    throw new Error("Provider context window must be an integer between 1024 and 10000000.");
  }
  if (typeof config.supportsImages !== "boolean") {
    throw new Error("Provider image support must be a boolean.");
  }
  if (typeof config.baseUrl !== "string") {
    throw new Error("Provider base URL is required.");
  }
  return {
    baseUrl: normalizeBaseUrl(config.baseUrl),
    model: config.model.trim(),
    contextWindowTokens: config.contextWindowTokens,
    supportsImages: config.supportsImages,
  };
}

function providerOrigin(config: ProviderConfig): string {
  return new URL(config.baseUrl).origin;
}

function readSessionKey(value: unknown, config: ProviderConfig | null): string | null {
  if (!value || typeof value !== "object" || !config) return null;
  const sessionKey = value as Partial<SessionKey>;
  if (
    typeof sessionKey.apiKey !== "string"
    || !sessionKey.apiKey
    || typeof sessionKey.providerOrigin !== "string"
    || sessionKey.providerOrigin !== providerOrigin(config)
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
    throw new Error("Provider API key is required.");
  }
  const local = await chrome.storage.local.get(CONFIG_KEY);
  const config = normalizeProviderConfig(local[CONFIG_KEY]);
  await chrome.storage.session.set({
    [API_KEY]: { apiKey: trimmedKey, providerOrigin: providerOrigin(config) },
  });
}

export async function forgetSessionKey(): Promise<void> {
  await chrome.storage.session.remove(API_KEY);
}

export function clampPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return 420;
  return Math.max(320, Math.min(960, Math.round(width)));
}

export async function loadUiPreferences(): Promise<{ panelWidth: number }> {
  const stored = await chrome.storage.local.get(PANEL_WIDTH_KEY);
  const width = stored[PANEL_WIDTH_KEY];
  return { panelWidth: clampPanelWidth(typeof width === "number" ? width : 420) };
}

export async function savePanelWidth(width: number): Promise<void> {
  await chrome.storage.local.set({ [PANEL_WIDTH_KEY]: clampPanelWidth(width) });
}
