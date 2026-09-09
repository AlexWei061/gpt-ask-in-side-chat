// The extension build loads CSS imports as text.
// @ts-expect-error CSS text has no TypeScript declaration
import styles from "./styles.css";
import type { ProviderConfig } from "../shared/types";
import type { RuntimeResponse } from "../shared/protocol";
import { normalizeProviderConfig } from "../background/settings";
import { permissionPattern } from "../background/permissions";
import { followTheme } from "../shared/theme";

type PublicSettings = { config: ProviderConfig | null; privacyAccepted: boolean; hasSessionKey: boolean };

document.head.append(Object.assign(document.createElement("style"), { textContent: styles }));
if (new URLSearchParams(location.search).get("embedded") === "1") document.documentElement.classList.add("embedded");
followTheme(document);
const appElement = document.querySelector<HTMLElement>("#app");
if (!appElement) throw new Error("无法初始化设置页。");
const app = appElement;
app.innerHTML = `
  <header class="page-header">
    <span class="app-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-5l-5 4v-4a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z"/><path d="M8 9h8M8 13h5"/></svg></span>
    <div><h1>侧边对话助手</h1><p>模型与偏好设置</p></div>
  </header>
  <form id="settings">
    <section class="settings-card" aria-labelledby="connection-title">
      <div class="section-heading"><h2 id="connection-title">模型连接</h2><p>需自备模型接口和 API 密钥，调用可能产生服务商费用。</p></div>
      <div class="fields">
        <label>接口地址（Base URL） <input id="base-url" type="url" required placeholder="https://provider.example/v1"></label>
        <div class="field-row">
          <label>模型 <input id="model" required></label>
          <label>上下文窗口（词元） <input id="context-window" type="number" min="1024" max="10000000" step="1" required></label>
        </div>
        <label class="check capability"><input id="images" type="checkbox"> 模型支持图片输入</label>
        <label>API 密钥 <input id="api-key" type="password" autocomplete="off" spellcheck="false"></label>
      </div>
      <details class="setup-help"><summary>这些设置怎么填？</summary>
        <p>在你选择的模型服务商控制台创建 API 密钥，并查阅其接口文档。接口需兼容流式 Chat Completions；地址形如 https://provider.example/v1，扩展会追加 /chat/completions。示例地址不可直接使用。</p>
        <p>模型填写服务商提供的模型 ID；上下文窗口填写该模型支持的词元上限，仅在模型支持图片时勾选图片输入。</p>
        <p>先保存并授权，再测试连接。测试会发送一条简短提示，也可能产生调用费用。API 密钥保存在本机，扩展重新加载或 Chrome 重启后仍保留。</p>
      </details>
    </section>
    <section class="settings-card disclosure" aria-labelledby="disclosure-title">
      <h2 id="disclosure-title">使用前说明</h2>
      <p>使用侧边对话时，扩展会统计当前 ChatGPT 页面中的消息节点；划词时仅在本地检查来源并读取选中文字。发送侧边问题时，扩展会读取页面可访问的对话，并将它们、所选引文、问题、侧边历史以及你逐次勾选确认的附件，直接发送到你配置的模型接口。</p>
      <p>本扩展没有开发者后端，不会向开发者发送你的对话、API 密钥、侧边对话记录或使用统计。你选择的模型服务商将按其条款和隐私政策处理提交的数据。</p>
      <p>测试连接会向同一接口发送固定测试提示；如果你启用旧上下文压缩，超限时还会向该接口发送额外的压缩请求。<a href="privacy.html" target="_blank" rel="noopener">阅读完整隐私政策</a></p>
      <label class="check consent"><input id="privacy" type="checkbox"> 我已了解并同意上述数据使用方式。</label>
    </section>
    <div class="actions form-actions"><button type="submit">保存并授权接口访问</button><button id="test" type="button">测试连接</button></div>
  </form>
  <section class="settings-card data-controls" aria-labelledby="data-title">
    <h2 id="data-title">本地数据管理</h2>
    <p>API 密钥保存在本机，扩展重新加载或 Chrome 重启后仍保留，可点击下方按钮移除。侧边对话记录加密保存在当前浏览器本地。</p>
    <div class="actions"><button id="forget" type="button">忘记已保存的 API 密钥</button><button id="clear" class="danger" type="button">清空全部侧边对话记录</button></div>
  </section>
  <p class="usage-hint">配置完成后，刷新已有 ChatGPT 页面，打开一个已保存的对话，选中文字即可提问。首次使用也可点击页面上的「侧边对话」浮条。暂不支持分享页等非 /c/ 路径。</p>
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
  if (!element) throw new Error(`缺少设置控件：${selector}`);
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
      reject(new Error("扩展无法连接后台服务。")); return;
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
  try { await action(); } catch (error) { show(error instanceof Error ? error.message : "操作失败。", "error"); }
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
  if (!isPublicSettings(settings)) throw new Error("无法读取已保存的模型设置。");
  privacy.checked = settings.privacyAccepted;
  hasSessionKey = settings.hasSessionKey;
  if (settings.config) {
    const config = normalizeProviderConfig(settings.config);
    baseUrl.value = config.baseUrl; model.value = config.model; contextWindow.value = String(config.contextWindowTokens); images.checked = config.supportsImages;
    loadedBaseUrl = config.baseUrl;
  }
  apiKey.value = "";
  apiKey.placeholder = hasSessionKey ? "已设置密钥，留空即可保留" : "请输入 API 密钥";
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void run(async () => {
    if (!privacy.checked) throw new Error("请先阅读并同意使用说明再保存。");
    const config = normalizeProviderConfig({ baseUrl: baseUrl.value, model: model.value, contextWindowTokens: Number(contextWindow.value), supportsImages: images.checked });
    const newPattern = permissionPattern(config.baseUrl);
    const granted = await chrome.permissions.request({ origins: [newPattern] });
    if (!granted) throw new Error("未获得接口访问权限。");
    await send({ type: "settings:save", config, privacyAccepted: true });
    const enteredKey = apiKey.value.trim();
    if (enteredKey) { await send({ type: "key:set", apiKey: enteredKey }); hasSessionKey = true; apiKey.value = ""; }
    else if (loadedBaseUrl !== null && loadedBaseUrl !== config.baseUrl) hasSessionKey = false;
    loadedBaseUrl = config.baseUrl;
    apiKey.placeholder = hasSessionKey ? "已设置密钥，留空即可保留" : "请输入 API 密钥";
    const removedOldPermission = await removeUnusedEndpointPermissions(newPattern);
    if (!removedOldPermission) show("设置已保存，但无法移除旧接口的访问权限。", "error");
    else show(hasSessionKey ? "设置已保存，API 密钥会保留在本机。请测试连接，再刷新已有 ChatGPT 页面开始使用。" : "设置已保存。请先输入 API 密钥，再测试连接或提问。");
  });
});

required<HTMLButtonElement>("#test").addEventListener("click", () => void run(async () => { await send({ type: "provider:test" }); show("连接成功。"); }));
required<HTMLButtonElement>("#forget").addEventListener("click", () => {
  if (!(document.defaultView?.confirm("确认移除本机保存的 API 密钥吗？") ?? true)) return;
  void run(async () => { await send({ type: "key:forget" }); hasSessionKey = false; apiKey.value = ""; apiKey.placeholder = "请输入 API 密钥"; show("已忘记本机保存的 API 密钥。"); });
});
required<HTMLButtonElement>("#clear").addEventListener("click", () => {
  if (!(document.defaultView?.confirm("确认删除本地保存的全部侧边对话记录吗？") ?? true)) return;
  void run(async () => { await send({ type: "history:clear-all" }); show("全部侧边对话记录已清空。"); });
});

void initialize().catch((error: unknown) => show(error instanceof Error ? error.message : "无法加载设置。", "error"));
