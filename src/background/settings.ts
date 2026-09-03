import type { ProviderConfig } from "../shared/types";

const CONFIG_KEY = "provider-config";
const PRIVACY_KEY = "privacy-accepted";
const API_KEY = "provider-api-key";
const PANEL_WIDTH_KEY = "panel-width";

type InternalSettings = {
  config: ProviderConfig | null;
  privacyAccepted: boolean;
  apiKey: string | null;
};

export async function restrictStorageAccess(): Promise<void> {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
}

export async function loadInternalSettings(): Promise<InternalSettings> {
  const local = await chrome.storage.local.get([CONFIG_KEY, PRIVACY_KEY]);
  const session = await chrome.storage.session.get(API_KEY);
  return {
    config: (local[CONFIG_KEY] as ProviderConfig | undefined) ?? null,
    privacyAccepted: local[PRIVACY_KEY] === true,
    apiKey: (session[API_KEY] as string | undefined) ?? null,
  };
}

export function publicSettings(settings: InternalSettings): {
  config: ProviderConfig | null;
  privacyAccepted: boolean;
  hasSessionKey: boolean;
} {
  return {
    config: settings.config,
    privacyAccepted: settings.privacyAccepted,
    hasSessionKey: Boolean(settings.apiKey),
  };
}

export async function saveProviderConfig(
  config: ProviderConfig,
  privacyAccepted: boolean,
): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_KEY]: config, [PRIVACY_KEY]: privacyAccepted });
}

export async function setSessionKey(apiKey: string): Promise<void> {
  await chrome.storage.session.set({ [API_KEY]: apiKey });
}

export async function forgetSessionKey(): Promise<void> {
  await chrome.storage.session.remove(API_KEY);
}

export function clampPanelWidth(width: number): number {
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
