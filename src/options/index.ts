// The extension build loads CSS imports as text.
// @ts-expect-error CSS text has no TypeScript declaration
import styles from "./styles.css";
import type { ProviderConfig } from "../shared/types";
import type { RuntimeResponse } from "../shared/protocol";
import { normalizeProviderConfig } from "../background/settings";
import { permissionPattern } from "../background/permissions";

type PublicSettings = { config: ProviderConfig | null; privacyAccepted: boolean; hasSessionKey: boolean };

document.head.append(Object.assign(document.createElement("style"), { textContent: styles }));
const appElement = document.querySelector<HTMLElement>("#app");
if (!appElement) throw new Error("The settings page could not be initialized.");
const app = appElement;
app.innerHTML = `
  <h1>Side Chat Companion</h1>
  <section class="disclosure" aria-labelledby="disclosure-title">
    <h2 id="disclosure-title">Before you continue</h2>
    <p>When you open the side chat, this extension counts messages visible in the current ChatGPT conversation. When you send a side-chat question, it reads and sends those messages, your selected quote, your question, and any attachments you explicitly approve directly to the model endpoint you configure.</p>
    <p>The extension developer has no backend for this product and does not receive your conversations, API key, side-chat history, or analytics. Your model provider processes submitted data under its own terms and privacy policy.</p>
    <label class="check"><input id="privacy" type="checkbox"> I understand and agree to this data use.</label>
  </section>
  <form id="settings">
    <label>Base URL <input id="base-url" type="url" required placeholder="https://provider.example/v1"></label>
    <label>Model <input id="model" required></label>
    <label>Context window (tokens) <input id="context-window" type="number" min="1024" max="10000000" step="1" required></label>
    <label class="check"><input id="images" type="checkbox"> Model supports image input</label>
    <label>API key for this Chrome session <input id="api-key" type="password" autocomplete="off" spellcheck="false"></label>
    <div class="actions"><button type="submit">Save and grant endpoint access</button><button id="test" type="button">Test connection</button></div>
  </form>
  <section class="data-controls" aria-labelledby="data-title">
    <h2 id="data-title">Local data controls</h2>
    <p>The API key stays in Chrome session storage. Side-chat histories are encrypted and stored locally in this browser.</p>
    <div class="actions"><button id="forget" type="button">Forget session API key</button><button id="clear" class="danger" type="button">Clear all side-chat histories</button></div>
  </section>
  <p id="status" role="status" aria-live="polite"></p>`;

const form = required<HTMLFormElement>("#settings");
const privacy = required<HTMLInputElement>("#privacy");
const baseUrl = required<HTMLInputElement>("#base-url");
const model = required<HTMLInputElement>("#model");
const contextWindow = required<HTMLInputElement>("#context-window");
const images = required<HTMLInputElement>("#images");
const apiKey = required<HTMLInputElement>("#api-key");
const status = required<HTMLElement>("#status");
let hasSessionKey = false;
let loadedBaseUrl: string | null = null;

function required<T extends Element>(selector: string): T {
  const element = app.querySelector<T>(selector);
  if (!element) throw new Error(`Missing settings control: ${selector}`);
  return element;
}

function isPublicSettings(value: unknown): value is PublicSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as Partial<PublicSettings>;
  if (typeof settings.privacyAccepted !== "boolean" || typeof settings.hasSessionKey !== "boolean") return false;
  if (settings.config === null) return true;
  try { normalizeProviderConfig(settings.config); return true; } catch { return false; }
}

function send<T = undefined>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage(message, (response: unknown) => {
    if (chrome.runtime.lastError || !response || typeof response !== "object" || typeof (response as { ok?: unknown }).ok !== "boolean") {
      reject(new Error("The extension could not contact its background service.")); return;
    }
    const result = response as RuntimeResponse<T>;
    if (!result.ok) { reject(new Error(result.error.message)); return; }
    resolve(result.value as T);
  }));
}

function setBusy(busy: boolean): void {
  for (const control of app.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button")) control.disabled = busy;
}

function show(message: string, kind: "success" | "error" = "success"): void {
  status.textContent = message;
  status.dataset.kind = kind;
}

async function run(action: () => Promise<void>): Promise<void> {
  setBusy(true);
  try { await action(); } catch (error) { show(error instanceof Error ? error.message : "The operation failed.", "error"); }
  finally { setBusy(false); }
}

async function removeUnusedEndpointPermissions(currentPattern: string): Promise<boolean> {
  const permissions = await chrome.permissions.getAll();
  const staleOrigins = (permissions.origins ?? []).filter((origin) => origin !== currentPattern && origin !== "https://chatgpt.com/*");
  const results = await Promise.all(staleOrigins.map((origin) => chrome.permissions.remove({ origins: [origin] })));
  return results.every(Boolean);
}

async function initialize(): Promise<void> {
  const settings = await send<PublicSettings>({ type: "settings:get" });
  if (!isPublicSettings(settings)) throw new Error("Saved provider settings could not be read.");
  privacy.checked = settings.privacyAccepted;
  hasSessionKey = settings.hasSessionKey;
  if (settings.config) {
    const config = normalizeProviderConfig(settings.config);
    baseUrl.value = config.baseUrl; model.value = config.model; contextWindow.value = String(config.contextWindowTokens); images.checked = config.supportsImages;
    loadedBaseUrl = config.baseUrl;
  }
  apiKey.value = "";
  apiKey.placeholder = hasSessionKey ? "A key is already set; leave blank to keep it" : "Enter a key for this Chrome session";
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void run(async () => {
    if (!privacy.checked) throw new Error("Accept the privacy disclosure before saving.");
    const config = normalizeProviderConfig({ baseUrl: baseUrl.value, model: model.value, contextWindowTokens: Number(contextWindow.value), supportsImages: images.checked });
    const newPattern = permissionPattern(config.baseUrl);
    const granted = await chrome.permissions.request({ origins: [newPattern] });
    if (!granted) throw new Error("Endpoint permission was not granted.");
    await send({ type: "settings:save", config, privacyAccepted: true });
    const enteredKey = apiKey.value.trim();
    if (enteredKey) { await send({ type: "key:set", apiKey: enteredKey }); hasSessionKey = true; apiKey.value = ""; }
    else if (loadedBaseUrl !== null && loadedBaseUrl !== config.baseUrl) hasSessionKey = false;
    loadedBaseUrl = config.baseUrl;
    apiKey.placeholder = hasSessionKey ? "A key is already set; leave blank to keep it" : "Enter a key for this Chrome session";
    const removedOldPermission = await removeUnusedEndpointPermissions(newPattern);
    if (!removedOldPermission) show("Settings saved, but the previous endpoint permission could not be removed.", "error");
    else show(hasSessionKey ? "Settings saved for this Chrome session." : "Settings saved. Enter an API key before testing or asking.");
  });
});

required<HTMLButtonElement>("#test").addEventListener("click", () => void run(async () => { await send({ type: "provider:test" }); show("Connection succeeded."); }));
required<HTMLButtonElement>("#forget").addEventListener("click", () => {
  if (!(document.defaultView?.confirm("Forget the API key for this Chrome session?") ?? true)) return;
  void run(async () => { await send({ type: "key:forget" }); hasSessionKey = false; apiKey.value = ""; apiKey.placeholder = "Enter a key for this Chrome session"; show("Session API key forgotten."); });
});
required<HTMLButtonElement>("#clear").addEventListener("click", () => {
  if (!(document.defaultView?.confirm("Delete every locally stored side-chat history?") ?? true)) return;
  void run(async () => { await send({ type: "history:clear-all" }); show("All side-chat histories cleared."); });
});

void initialize().catch((error: unknown) => show(error instanceof Error ? error.message : "Settings could not be loaded.", "error"));
