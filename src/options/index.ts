// The extension build loads CSS imports as text.
// @ts-expect-error CSS text has no TypeScript declaration
import styles from "./styles.css";
import type { PublicProviderProfile, PublicSettings } from "../shared/types";
import { isPublicSettings, type RuntimeResponse } from "../shared/protocol";
import { normalizeProviderConfig } from "../background/settings";
import { permissionPattern } from "../background/permissions";
import { followTheme } from "../shared/theme";

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
  <section class="settings-card profile-picker" aria-labelledby="profiles-title">
    <div class="profile-heading"><div><h2 id="profiles-title">API 配置</h2><p>保存多个接口，在侧边对话中随时切换。</p></div><button id="add-profile" type="button">新增配置</button></div>
    <div id="profile-list" class="profile-list"></div>
  </section>
  <form id="settings">
    <section class="settings-card" aria-labelledby="connection-title">
      <div class="section-heading"><h2 id="connection-title">新增配置</h2><p id="editing-hint">需自备模型接口和 API 密钥，调用可能产生服务商费用。</p></div>
      <div class="fields">
        <label>配置名称 <input id="profile-name" required maxlength="80" placeholder="例如：日常问答、代码助手"></label>
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
        <p>先保存并授权，再测试连接。测试会发送一条简短提示，也可能产生调用费用。每个配置的 API 密钥独立保存在本机，扩展重新加载或 Chrome 重启后仍保留。保存已有配置不会切换当前使用的接口。</p>
      </details>
    </section>
    <section class="settings-card disclosure" aria-labelledby="disclosure-title">
      <h2 id="disclosure-title">使用前说明</h2>
      <p>使用侧边对话时，扩展会统计当前 ChatGPT 页面中的消息节点；划词时仅在本地检查来源并读取选中文字。发送侧边问题时，扩展会读取页面可访问的对话，并将它们、所选引文、问题、侧边历史以及你逐次勾选确认的附件，直接发送到你配置的模型接口。</p>
      <p>本扩展没有开发者后端，不会向开发者发送你的对话、API 密钥、侧边对话记录或使用统计。你选择的模型服务商将按其条款和隐私政策处理提交的数据。</p>
      <p>测试连接会向同一接口发送固定测试提示；如果你启用旧上下文压缩，超限时还会向该接口发送额外的压缩请求。<a href="privacy.html" target="_blank" rel="noopener">阅读完整隐私政策</a></p>
      <label class="check consent"><input id="privacy" type="checkbox"> 我已了解并同意上述数据使用方式。</label>
    </section>
    <div class="actions form-actions"><button type="submit">保存并授权接口访问</button><button id="test" type="button" title="测试当前编辑的配置">测试连接</button><button id="delete-profile" class="danger" type="button">删除此配置</button></div>
  </form>
  <section class="settings-card data-controls" aria-labelledby="data-title">
    <h2 id="data-title">本地数据管理</h2>
    <p>API 密钥保存在本机，扩展重新加载或 Chrome 重启后仍保留。下方按钮仅移除当前编辑配置的密钥。侧边对话记录加密保存在当前浏览器本地。</p>
    <div class="actions"><button id="forget" type="button">忘记此配置的 API 密钥</button><button id="clear" class="danger" type="button">清空全部侧边对话记录</button></div>
  </section>
  <p class="usage-hint">配置完成后，刷新已有 ChatGPT 页面，打开一个已保存的对话，选中文字即可提问。首次使用也可点击页面上的「侧边对话」浮条。暂不支持分享页等非 /c/ 路径。</p>
  <p id="status" role="status" aria-live="polite"></p>`;

const form = required<HTMLFormElement>("#settings");
const privacy = required<HTMLInputElement>("#privacy");
const profileName = required<HTMLInputElement>("#profile-name");
const profileList = required<HTMLElement>("#profile-list");
const baseUrl = required<HTMLInputElement>("#base-url");
const model = required<HTMLInputElement>("#model");
const contextWindow = required<HTMLInputElement>("#context-window");
const images = required<HTMLInputElement>("#images");
const apiKey = required<HTMLInputElement>("#api-key");
const status = required<HTMLElement>("#status");
let settings: PublicSettings = { profiles: [], activeProviderId: null, config: null, privacyAccepted: false, hasSessionKey: false };
let editingId: string | null = null;
let savedDraft = "";
let busy = false;
let refreshPending = false;

function required<T extends Element>(selector: string): T {
  const element = app.querySelector<T>(selector);
  if (!element) throw new Error(`缺少设置控件：${selector}`);
  return element;
}

function checkedSettings(value: unknown): PublicSettings {
  if (!isPublicSettings(value)) throw new Error("无法读取已保存的模型设置。");
  return value;
}

function draft(): string {
  return JSON.stringify([profileName.value, baseUrl.value, model.value, contextWindow.value, images.checked, privacy.checked, apiKey.value]);
}

function hasUnsavedChanges(): boolean { return draft() !== savedDraft; }

function editedProfile(): PublicProviderProfile | undefined {
  return settings.profiles.find((profile) => profile.id === editingId);
}

function renderProfiles(): void {
  profileList.replaceChildren();
  if (settings.profiles.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-profiles";
    empty.textContent = "还没有 API 配置，请在下方添加第一个配置。";
    profileList.append(empty);
  }
  for (const profile of settings.profiles) {
    const row = document.createElement("div");
    row.className = "profile-row";
    row.dataset.profileId = profile.id;
    row.classList.toggle("is-editing", profile.id === editingId);
    const details = document.createElement("div");
    details.className = "profile-details";
    const heading = document.createElement("div");
    heading.className = "profile-title";
    const name = document.createElement("strong");
    name.textContent = profile.name;
    heading.append(name);
    if (profile.id === settings.activeProviderId) {
      const badge = document.createElement("span");
      badge.className = "profile-badge";
      badge.textContent = "使用中";
      heading.append(badge);
    }
    const description = document.createElement("p");
    description.textContent = `${profile.config.model} · ${profile.hasSessionKey ? new URL(profile.config.baseUrl).host : "未配置密钥"}`;
    description.title = profile.config.baseUrl;
    details.append(heading, description);
    const actions = document.createElement("div");
    actions.className = "actions profile-actions";
    const select = document.createElement("button");
    select.type = "button";
    select.dataset.action = "select";
    select.textContent = "使用";
    select.setAttribute("aria-label", `使用配置 ${profile.name}`);
    select.disabled = busy || profile.id === settings.activeProviderId;
    select.addEventListener("click", () => void run(async () => {
      settings = checkedSettings(await send({ type: "settings:select", profileId: profile.id }));
      renderProfiles();
      show(`已切换到「${profile.name}」，后续提问将使用此配置。`);
    }));
    const edit = document.createElement("button");
    edit.type = "button";
    edit.dataset.action = "edit";
    edit.textContent = "编辑";
    edit.setAttribute("aria-label", `编辑配置 ${profile.name}`);
    edit.disabled = busy;
    edit.addEventListener("click", () => {
      if (editingId === profile.id || !allowDiscard()) return;
      loadEditor(profile);
      profileName.focus();
    });
    actions.append(select, edit);
    row.append(details, actions);
    profileList.append(row);
  }
}

function loadEditor(profile?: PublicProviderProfile, clearStatus = true): void {
  editingId = profile?.id ?? null;
  profileName.value = profile?.name ?? (settings.profiles.length ? "新配置" : "默认配置");
  baseUrl.value = profile?.config.baseUrl ?? "";
  model.value = profile?.config.model ?? "";
  contextWindow.value = profile ? String(profile.config.contextWindowTokens) : "128000";
  images.checked = profile?.config.supportsImages ?? false;
  privacy.checked = settings.privacyAccepted;
  apiKey.value = "";
  apiKey.placeholder = profile?.hasSessionKey ? "已设置密钥，留空即可保留" : "请输入 API 密钥";
  required<HTMLElement>("#connection-title").textContent = profile ? "编辑配置" : "新增配置";
  required<HTMLElement>("#editing-hint").textContent = profile ? `正在编辑「${profile.name}」。保存不会切换当前使用的配置。` : "首个配置保存后会自动启用；后续新增配置可通过「使用」切换。";
  savedDraft = draft();
  if (clearStatus) show("");
  renderProfiles();
  setBusy(busy);
}

function allowDiscard(): boolean {
  return !hasUnsavedChanges() || (document.defaultView?.confirm("当前配置有未保存的修改，确认放弃并切换编辑吗？") ?? false);
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

function setBusy(value: boolean): void {
  busy = value;
  for (const control of app.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button")) control.disabled = busy;
  required<HTMLButtonElement>("#delete-profile").disabled = busy || !editedProfile();
  required<HTMLButtonElement>("#forget").disabled = busy || !editedProfile()?.hasSessionKey;
  for (const row of profileList.querySelectorAll<HTMLElement>(".profile-row")) {
    const select = row.querySelector<HTMLButtonElement>('[data-action="select"]');
    if (select) select.disabled = busy || row.dataset.profileId === settings.activeProviderId;
  }
}

function show(message: string, kind: "success" | "error" = "success"): void {
  status.textContent = message;
  status.dataset.kind = kind;
}

async function run(action: () => Promise<void>): Promise<void> {
  setBusy(true);
  try { await action(); } catch (error) { show(error instanceof Error ? error.message : "操作失败。", "error"); }
  finally {
    while (refreshPending) {
      refreshPending = false;
      try { await refreshPublicSettings(); }
      catch (error) { show(error instanceof Error ? error.message : "无法刷新设置。", "error"); }
    }
    setBusy(false);
  }
}

async function refreshPublicSettings(): Promise<void> {
  const preserveDraft = hasUnsavedChanges();
  settings = checkedSettings(await send({ type: "settings:get" }));
  const profile = editedProfile();
  if (!preserveDraft && profile) loadEditor(profile, false);
  else { renderProfiles(); setBusy(busy); }
}

async function removeUnusedEndpointPermissions(): Promise<boolean> {
  const permissions = await chrome.permissions.getAll();
  await refreshPublicSettings();
  const retainedOrigins = new Set(settings.profiles.map((profile) => permissionPattern(profile.config.baseUrl)));
  retainedOrigins.add("https://chatgpt.com/*");
  const staleOrigins = (permissions.origins ?? []).filter((origin) => !retainedOrigins.has(origin));
  const results = await Promise.all(staleOrigins.map((origin) => chrome.permissions.remove({ origins: [origin] })));
  return results.every(Boolean);
}

async function initialize(): Promise<void> {
  settings = checkedSettings(await send({ type: "settings:get" }));
  loadEditor(settings.profiles.find((profile) => profile.id === settings.activeProviderId));
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void run(async () => {
    if (!privacy.checked) throw new Error("请先阅读并同意使用说明再保存。");
    const name = profileName.value.trim();
    if (!name) throw new Error("请输入配置名称。");
    const config = normalizeProviderConfig({ baseUrl: baseUrl.value, model: model.value, contextWindowTokens: Number(contextWindow.value), supportsImages: images.checked });
    const newPattern = permissionPattern(config.baseUrl);
    const granted = await chrome.permissions.request({ origins: [newPattern] });
    if (!granted) throw new Error("未获得接口访问权限。");
    const enteredKey = apiKey.value.trim();
    settings = checkedSettings(await send({ type: "settings:save", ...(editingId ? { profileId: editingId } : {}), name, config, privacyAccepted: true, ...(enteredKey ? { apiKey: enteredKey } : {}) }));
    // The background appends a newly created profile before returning the saved list.
    const savedProfile = editingId ? settings.profiles.find((profile) => profile.id === editingId) : settings.profiles.at(-1);
    if (!savedProfile) throw new Error("无法读取刚保存的配置，请重新打开设置。");
    loadEditor(savedProfile);
    const removedOldPermission = await removeUnusedEndpointPermissions();
    if (!removedOldPermission) show("设置已保存，但无法移除旧接口的访问权限。", "error");
    else show(savedProfile.hasSessionKey ? "设置已保存，API 密钥会保留在本机。可测试此配置，通过「使用」切换接口。" : "设置已保存，尚未配置密钥。请先输入 API 密钥，再测试连接或提问。");
  });
});

required<HTMLButtonElement>("#add-profile").addEventListener("click", () => {
  if (!allowDiscard()) return;
  loadEditor();
  profileName.focus();
});
required<HTMLButtonElement>("#test").addEventListener("click", () => void run(async () => {
  if (!editingId || hasUnsavedChanges()) throw new Error("请先保存当前配置，再测试连接。");
  const name = editedProfile()?.name;
  await send({ type: "provider:test", profileId: editingId });
  show(`「${name}」连接成功。`);
}));
required<HTMLButtonElement>("#delete-profile").addEventListener("click", () => {
  const profile = editedProfile();
  if (!profile || !(document.defaultView?.confirm(`确认删除「${profile.name}」及其本机保存的 API 密钥吗？${hasUnsavedChanges() ? "未保存的修改也会丢失。" : ""}`) ?? false)) return;
  void run(async () => {
    settings = checkedSettings(await send({ type: "settings:delete", profileId: profile.id }));
    loadEditor(settings.profiles.find((item) => item.id === settings.activeProviderId));
    const removedOldPermission = await removeUnusedEndpointPermissions();
    show(removedOldPermission ? `已删除「${profile.name}」。` : "配置已删除，但无法移除旧接口的访问权限。", removedOldPermission ? "success" : "error");
  });
});
required<HTMLButtonElement>("#forget").addEventListener("click", () => {
  const profile = editedProfile();
  if (!profile) return;
  if (hasUnsavedChanges()) { show("请先保存当前修改，再移除此配置的密钥。", "error"); return; }
  if (!(document.defaultView?.confirm(`确认移除「${profile.name}」在本机保存的 API 密钥吗？`) ?? false)) return;
  void run(async () => {
    settings = checkedSettings(await send({ type: "key:forget", profileId: profile.id }));
    loadEditor(settings.profiles.find((item) => item.id === profile.id));
    show(`已忘记「${profile.name}」在本机保存的 API 密钥。`);
  });
});
required<HTMLButtonElement>("#clear").addEventListener("click", () => {
  if (!(document.defaultView?.confirm("确认删除本地保存的全部侧边对话记录吗？") ?? false)) return;
  void run(async () => { await send({ type: "history:clear-all" }); show("全部侧边对话记录已清空。"); });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !("provider-profiles" in changes)) return;
  if (busy) refreshPending = true;
  else void run(refreshPublicSettings);
});

void run(initialize);
