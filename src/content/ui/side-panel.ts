import type { QuoteReference, SideMessage } from "../../shared/types";
import { sidePanelStyles } from "./styles";
import { renderMarkdown } from "./markdown";

export type PanelSend = { question: string; quote: QuoteReference; compressOldContext: boolean };
export type PanelContextSummary = { capturedMessages: number; endpointOrigin: string; model: string; contextWindowTokens: number; approximateTokens?: number };
export type PanelError = { message: string; retryable: boolean; diagnostic?: string };
export interface SidePanelOptions { onSend: (payload: PanelSend) => void; onClear?: () => void; onResize?: (width: number) => void; }

export class SidePanel {
  private readonly host: HTMLElement; private readonly root: ShadowRoot; private width = 420;
  private originalMargin: { value: string; priority: string } | null = null; private conversationId: string | null = null; private messages: SideMessage[] = [];
  private quote: QuoteReference | null = null; private draft = ""; private error: PanelError | null = null; private lastSubmission: PanelSend | null = null;
  private contextSummary: PanelContextSummary | null = null;
  private busy = false; private accepted = false; private stream = ""; private resizing = false; private openState = false; private notice = ""; private streamFrame: number | null = null;
  private missingResolver: ((files: File[] | null | undefined) => void) | null = null; private missingDialog: HTMLDialogElement | null = null;
  constructor(private readonly document: Document, private readonly options: SidePanelOptions) {
    this.host = document.createElement("aside"); this.host.dataset.sideChatHost = "true"; this.host.setAttribute("aria-label", "侧边对话"); this.root = this.host.attachShadow({ mode: "open" });
    document.documentElement.append(this.host); this.host.style.display = "none"; document.defaultView?.addEventListener("resize", this.viewportResize); this.render();
  }
  setWidth(width: number): void { this.width = this.clamp(width); this.syncWidth(); this.applyMargin(); }
  setConversation(id: string | null, messages: SideMessage[]): void { this.conversationId = id; this.messages = messages; this.quote = null; this.draft = ""; this.error = null; this.notice = ""; this.lastSubmission = null; this.contextSummary = null; this.busy = false; this.accepted = false; this.stream = ""; this.render(); this.syncOpenState(); }
  setMessages(messages: SideMessage[]): void { this.messages = messages; this.stream = ""; this.render(); }
  open(quote: QuoteReference, contextSummary?: PanelContextSummary): void { if (this.busy) return; this.openState = true; this.quote = quote; this.contextSummary = contextSummary ?? this.contextSummary; this.error = null; this.notice = ""; this.stream = ""; this.lastSubmission = null; if (this.originalMargin === null) this.originalMargin = { value: this.document.body.style.getPropertyValue("margin-right"), priority: this.document.body.style.getPropertyPriority("margin-right") }; this.applyMargin(); this.render(); this.syncOpenState(); this.root.querySelector<HTMLTextAreaElement>("textarea")?.focus(); }
  setContextSummary(contextSummary: PanelContextSummary): void { this.contextSummary = contextSummary; this.render(); }
  setExtractionError(capturedMessages: number, hasConversationId: boolean): void { this.quote = null; this.contextSummary = this.contextSummary ? { ...this.contextSummary, capturedMessages } : null; this.setError({ message: `无法确认已完整读取当前页面中的对话（发现 ${capturedMessages} 条消息）。`, retryable: true, diagnostic: JSON.stringify({ capturedMessageCount: capturedMessages, stableConversationId: hasConversationId, pageSupported: false }, null, 2) }); }
  close(): void { this.openState = false; this.quote = null; this.restoreMargin(); this.render(); this.syncOpenState(); }
  setError(error: PanelError | null): void { this.error = error; this.notice = ""; this.busy = false; this.accepted = false; this.render(); }
  setNotice(message: string): void { this.notice = message; this.render(); }
  resetRequest(): void { this.busy = false; this.accepted = false; this.stream = ""; this.error = null; this.lastSubmission = null; this.render(); }
  setAccepted(approximateTokens?: number): void { this.accepted = true; this.busy = true; this.draft = ""; this.error = null; if (this.contextSummary && approximateTokens !== undefined) this.contextSummary = { ...this.contextSummary, approximateTokens }; this.render(); }
  setBusy(busy: boolean): void { this.busy = busy; this.render(); }
  appendDelta(delta: string): void { this.stream += delta; if (this.streamFrame !== null) return; const view = this.document.defaultView; if (!view) { this.updateStream(); return; } let fired = false; let frame: number | null = null; frame = view.requestAnimationFrame(() => { fired = true; if (this.streamFrame === frame) this.streamFrame = null; this.updateStream(); }); this.streamFrame = fired ? null : frame; }
  complete(messages: SideMessage[]): void { this.messages = messages; this.stream = ""; this.busy = false; this.accepted = false; this.error = null; this.lastSubmission = null; this.render(); }
  destroy(): void { this.closeMissingResolver(undefined); this.cancelStreamFrame(); this.document.removeEventListener("pointermove", this.move); this.document.removeEventListener("pointerup", this.up); this.document.removeEventListener("pointercancel", this.up); this.document.defaultView?.removeEventListener("blur", this.up); this.document.defaultView?.removeEventListener("resize", this.viewportResize); this.restoreMargin(); this.host.remove(); }
  resolveMissingAttachments(names: string[]): Promise<File[] | null | undefined> {
    this.closeMissingResolver(undefined);
    return new Promise((resolve) => {
      this.missingResolver = resolve;
      const dialog = this.document.createElement("dialog"); dialog.setAttribute("aria-label", "重新选择缺失附件"); dialog.dataset.missingAttachments = "true";
      const title = this.document.createElement("h2"); title.textContent = "重新选择缺失附件";
      const explanation = this.document.createElement("p"); explanation.textContent = "请重新选择全部缺失文件，也可以跳过这些文件继续。";
      const list = this.document.createElement("ul"); for (const name of names) { const item = this.document.createElement("li"); item.textContent = name; list.append(item); }
      const input = this.document.createElement("input"); input.type = "file"; input.multiple = names.length > 1; input.setAttribute("aria-label", "缺失的附件文件");
      const error = this.document.createElement("p"); error.setAttribute("role", "alert");
      const reselect = this.button("重新选择文件", "reselect-files", () => { const files = Array.from(input.files ?? []); if (files.length !== names.length) { error.textContent = `请选择 ${names.length} 个文件。`; return; } this.closeMissingResolver(files); });
      const skip = this.button("跳过这些文件继续", "continue-without-files", () => this.closeMissingResolver(null));
      dialog.addEventListener("cancel", (event) => { event.preventDefault(); this.closeMissingResolver(undefined); });
      dialog.append(title, explanation, list, input, error, reselect, skip); this.root.append(dialog); this.missingDialog = dialog;
      try { dialog.showModal(); } catch { dialog.setAttribute("open", ""); }
    });
  }
  private closeMissingResolver(files: File[] | null | undefined): void { const resolve = this.missingResolver; this.missingResolver = null; const dialog = this.missingDialog; this.missingDialog = null; try { dialog?.close(); } catch { /* absent dialog support */ } dialog?.remove(); resolve?.(files); }
  private syncOpenState(): void { this.host.style.display = this.openState ? "" : "none"; if (this.openState) this.applyMargin(); }
  private applyMargin(): void { if (this.openState) this.document.body.style.setProperty("margin-right", `${this.width}px`, "important"); }
  private restoreMargin(): void { if (this.originalMargin !== null) { if (this.originalMargin.value) this.document.body.style.setProperty("margin-right", this.originalMargin.value, this.originalMargin.priority); else this.document.body.style.removeProperty("margin-right"); this.originalMargin = null; } }
  private cancelStreamFrame(): void { if (this.streamFrame !== null) this.document.defaultView?.cancelAnimationFrame(this.streamFrame); this.streamFrame = null; }
  private updateStream(): void { const list = this.root.querySelector<HTMLElement>(".messages"); if (!list) return; let node = list.querySelector<HTMLElement>("[data-stream-message]"); if (!node) { node = this.message({ id: "stream", role: "assistant", content: "", status: "incomplete", createdAt: "" }); node.dataset.streamMessage = "true"; list.append(node); } const content = node.querySelector<HTMLElement>(".message-content")!; content.innerHTML = renderMarkdown(this.stream, this.document); list.scrollTop = list.scrollHeight; }
  private clamp(width: number): number { const max = Math.min(960, Math.max(320, Math.floor((this.document.defaultView?.innerWidth ?? 1920) / 2))); return Math.max(320, Math.min(max, Math.round(width))); }
  private syncWidth(): void { const panel = this.root.querySelector<HTMLElement>(".panel"); panel?.style.setProperty("--side-chat-width", `${this.width}px`); this.root.querySelector<HTMLElement>("[data-resize-handle]")?.setAttribute("aria-valuenow", String(this.width)); }
  private render(): void {
    this.closeMissingResolver(undefined);
    this.cancelStreamFrame();
    this.root.innerHTML = ""; const style = this.document.createElement("style"); style.textContent = sidePanelStyles;
    const katexStyle = this.document.createElement("link"); katexStyle.rel = "stylesheet"; katexStyle.dataset.katexStyle = "true"; katexStyle.href = typeof chrome !== "undefined" && chrome.runtime?.getURL ? chrome.runtime.getURL("katex/katex.min.css") : "katex/katex.min.css";
    this.root.append(style, katexStyle);
    const panel = this.document.createElement("section"); panel.className = "panel"; panel.style.setProperty("--side-chat-width", `${this.width}px`);
    const resize = this.document.createElement("div"); resize.className = "resize"; resize.dataset.resizeHandle = "true"; resize.setAttribute("aria-label", "调整侧边对话宽度"); resize.setAttribute("role", "separator"); resize.setAttribute("aria-orientation", "vertical"); resize.setAttribute("aria-valuemin", "320"); resize.setAttribute("aria-valuemax", String(this.clamp(960))); resize.setAttribute("aria-valuenow", String(this.width)); resize.tabIndex = 0; resize.addEventListener("pointerdown", this.down); resize.addEventListener("keydown", this.keyResize); panel.append(resize);
    const header = this.document.createElement("header"); const title = this.document.createElement("strong"); title.textContent = "侧边对话"; header.append(title);
    header.append(this.button("清空", "clear", () => { if (this.document.defaultView?.confirm?.("确认清空当前侧边对话记录吗？") ?? true) this.options.onClear?.(); })); header.append(this.button("关闭", "close", () => this.close())); panel.append(header);
    if (this.contextSummary) { const summary = this.document.createElement("div"); summary.className = "context-summary"; const limit = this.contextSummary.contextWindowTokens > 0 ? this.contextSummary.contextWindowTokens.toLocaleString("en-US") : "尚未配置"; const approximate = this.contextSummary.approximateTokens === undefined ? "发送时计算" : this.contextSummary.approximateTokens.toLocaleString("en-US"); summary.textContent = `已读取 ${this.contextSummary.capturedMessages} 条消息 · 目标：${this.contextSummary.endpointOrigin} · 模型：${this.contextSummary.model} · 预计词元：${approximate} / ${limit}`; panel.append(summary); }
    const list = this.document.createElement("div"); list.className = "messages"; list.setAttribute("role", "log"); list.setAttribute("aria-live", "polite"); if (this.quote) { const preview = this.document.createElement("div"); preview.className = "message user"; const quoted = this.document.createElement("div"); quoted.className = "quote"; quoted.textContent = this.quote.text; preview.append(quoted); list.append(preview); } for (const message of this.messages) list.append(this.message(message)); if (this.stream) { const stream = this.message({ id:"stream", role:"assistant", content:this.stream, status:"incomplete", createdAt:"" }); stream.dataset.streamMessage = "true"; list.append(stream); } panel.append(list);
    const status = this.document.createElement("div"); status.className = "status"; status.setAttribute("aria-live", "polite"); if (this.error) { status.setAttribute("role", "alert"); status.textContent = this.error.message; if (this.error.diagnostic) { const diagnostic = this.error.diagnostic; status.append(this.button("复制诊断信息", "copy-diagnostics", () => { void this.document.defaultView?.navigator.clipboard?.writeText(diagnostic).then(() => this.setNotice("诊断信息已复制。"), () => this.setNotice("无法复制诊断信息。")); })); } if (this.error.retryable && this.lastSubmission) status.append(this.button("重试", "retry", () => this.send(this.lastSubmission!))); } else if (this.notice) status.textContent = this.notice; else if (this.busy) status.textContent = "正在生成……"; panel.append(status);
    const form = this.document.createElement("form"); const textarea = this.document.createElement("textarea"); textarea.setAttribute("aria-label", "侧边对话问题"); textarea.placeholder = "针对所选内容提问……"; textarea.value = this.draft; textarea.disabled = !this.quote || !this.conversationId || this.busy; textarea.addEventListener("input", () => { this.draft = textarea.value; const send = form.querySelector<HTMLButtonElement>("[data-action=send]"); if (send) send.disabled = !this.canSend(); });
    const controls = this.document.createElement("div"); controls.className = "controls"; const label = this.document.createElement("label"); const checkbox = this.document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = this.lastSubmission?.compressOldContext ?? false; label.append(checkbox, " 仅在需要时压缩旧上下文；压缩后仅保留摘要，不保留原文。"); const send = this.button("↑", "send", () => {}, true, "发送"); send.disabled = !this.canSend(); controls.append(label); const composer = this.document.createElement("div"); composer.className = "composer"; composer.append(textarea, send); form.append(composer, controls);
    form.addEventListener("submit", (event) => { event.preventDefault(); const question = this.draft.trim(); if (!question || !this.quote || !this.conversationId || this.busy) return; this.send({ question, quote: this.quote, compressOldContext: checkbox.checked }); }); panel.append(form); this.root.append(panel);
  }
  private canSend(): boolean { return Boolean(this.draft.trim() && this.quote && this.conversationId && !this.busy); }
  private button(text: string, action: string, click: () => void, submit = false, label = text): HTMLButtonElement { const button = this.document.createElement("button"); button.type = submit ? "submit" : "button"; button.dataset.action = action; button.setAttribute("aria-label", label); button.title = label; button.textContent = text; button.addEventListener("click", click); return button; }
  private message(message: SideMessage): HTMLElement { const box = this.document.createElement("article"); box.className = `message ${message.role}`; if (message.quote) { const quote = this.document.createElement("div"); quote.className="quote"; quote.textContent=message.quote.text; box.append(quote); } const content = this.document.createElement("div"); content.className = "message-content"; content.innerHTML = renderMarkdown(message.content, this.document); box.append(content); if (message.status === "incomplete") { const marker = this.document.createElement("div"); marker.className="incomplete"; marker.textContent="未完成"; box.append(marker); } return box; }
  private send(payload: PanelSend): void { if (this.busy) return; this.lastSubmission = payload; this.error = null; this.notice = ""; this.stream = ""; this.busy = true; this.options.onSend(payload); this.render(); }
  private readonly down = (event: PointerEvent): void => { event.preventDefault(); this.resizing = true; this.document.addEventListener("pointermove", this.move); this.document.addEventListener("pointerup", this.up); this.document.addEventListener("pointercancel", this.up); this.document.defaultView?.addEventListener("blur", this.up); };
  private readonly move = (event: PointerEvent): void => { if (!this.resizing) return; this.width = this.clamp((this.document.defaultView?.innerWidth ?? 0) - event.clientX); this.syncWidth(); this.applyMargin(); };
  private readonly up = (): void => { if (!this.resizing) return; this.resizing=false; this.document.removeEventListener("pointermove", this.move); this.document.removeEventListener("pointerup", this.up); this.document.removeEventListener("pointercancel", this.up); this.document.defaultView?.removeEventListener("blur", this.up); this.options.onResize?.(this.width); };
  private readonly keyResize = (event: KeyboardEvent): void => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); this.width = this.clamp(this.width + (event.key === "ArrowLeft" ? 16 : -16)); this.syncWidth(); this.applyMargin(); this.options.onResize?.(this.width); };
  private readonly viewportResize = (): void => { this.width = this.clamp(this.width); this.syncWidth(); this.applyMargin(); };
}
