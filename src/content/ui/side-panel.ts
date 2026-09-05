import type { QuoteReference, SideMessage, WindowGeometry } from "../../shared/types";
import { renderMarkdown } from "./markdown";
import { sidePanelStyles } from "./styles";

export type PanelSend = { question: string; quote?: QuoteReference; compressOldContext: boolean };
export type PanelContextSummary = { capturedMessages: number; endpointOrigin: string; model: string; contextWindowTokens: number; approximateTokens?: number };
export type PanelError = { message: string; retryable: boolean; diagnostic?: string };
export interface SidePanelOptions {
  onSend: (payload: PanelSend) => void;
  onClear?: () => void;
  onSettingsClose?: () => void;
  onGeometryChange?: (geometry: WindowGeometry) => void;
}

type PanelMode = "hidden" | "minimized" | "expanded";
type PointerInteraction = {
  kind: "drag" | "resize" | "bar";
  startX: number;
  startY: number;
  geometry: WindowGeometry;
};

const DEFAULT_GEOMETRY: WindowGeometry = { width: 420, height: 560, right: 20, bottom: 20 };
const MIN_WIDTH = 340;
const MIN_HEIGHT = 360;
const VIEWPORT_MARGIN = 12;

export class SidePanel {
  private readonly host: HTMLElement;
  private readonly root: ShadowRoot;
  private geometry = { ...DEFAULT_GEOMETRY };
  private mode: PanelMode = "hidden";
  private interaction: PointerInteraction | null = null;
  private barDragged = false;
  private settingsOpen = false;
  private conversationId: string | null = null;
  private messages: SideMessage[] = [];
  private quote: QuoteReference | null = null;
  private draft = "";
  private error: PanelError | null = null;
  private lastSubmission: PanelSend | null = null;
  private contextSummary: PanelContextSummary | null = null;
  private busy = false;
  private accepted = false;
  private stream = "";
  private notice = "";
  private streamFrame: number | null = null;
  private missingResolver: ((files: File[] | null | undefined) => void) | null = null;
  private missingDialog: HTMLDialogElement | null = null;

  constructor(private readonly document: Document, private readonly options: SidePanelOptions) {
    this.host = document.createElement("aside");
    this.host.dataset.sideChatHost = "true";
    this.host.setAttribute("aria-label", "侧边对话");
    this.root = this.host.attachShadow({ mode: "open" });
    document.documentElement.append(this.host);
    document.defaultView?.addEventListener("resize", this.viewportResize);
    this.render();
  }

  setGeometry(geometry: WindowGeometry): void {
    this.geometry = this.clampGeometry(geometry);
    this.syncGeometry();
  }

  setConversation(id: string | null, messages: SideMessage[]): void {
    this.conversationId = id;
    this.messages = messages;
    this.quote = null;
    this.draft = "";
    this.error = null;
    this.notice = "";
    this.lastSubmission = null;
    this.contextSummary = null;
    this.busy = false;
    this.accepted = false;
    this.stream = "";
    this.mode = "hidden";
    this.render();
  }

  setMessages(messages: SideMessage[], restoreVisibility = false): void {
    this.messages = messages;
    this.stream = "";
    if (restoreVisibility && this.mode === "hidden") this.mode = messages.length > 0 ? "minimized" : "hidden";
    this.render();
  }

  open(quote: QuoteReference, contextSummary?: PanelContextSummary): void {
    if (this.busy) return;
    this.mode = "expanded";
    this.geometry = this.clampGeometry(this.geometry);
    this.quote = quote;
    this.contextSummary = contextSummary ?? this.contextSummary;
    this.error = null;
    this.notice = "";
    this.stream = "";
    this.lastSubmission = null;
    this.render();
    this.scrollToLatest();
    this.root.querySelector<HTMLTextAreaElement>("textarea")?.focus();
  }

  minimize(): void {
    if (this.mode !== "expanded") return;
    this.mode = "minimized";
    this.render();
    this.animateMode(true);
  }

  setContextSummary(contextSummary: PanelContextSummary): void {
    this.contextSummary = contextSummary;
    this.render();
  }

  setExtractionError(capturedMessages: number, hasConversationId: boolean): void {
    this.quote = null;
    this.contextSummary = this.contextSummary ? { ...this.contextSummary, capturedMessages } : null;
    this.setError({
      message: `无法确认已完整读取当前页面中的对话（发现 ${capturedMessages} 条消息）。`,
      retryable: true,
      diagnostic: JSON.stringify({ capturedMessageCount: capturedMessages, stableConversationId: hasConversationId, pageSupported: false }, null, 2),
    });
  }

  setError(error: PanelError | null): void {
    this.error = error;
    this.notice = "";
    this.busy = false;
    this.accepted = false;
    this.render();
    this.scrollToLatest();
  }

  setNotice(message: string): void {
    this.notice = message;
    this.render();
  }

  resetRequest(): void {
    this.busy = false;
    this.accepted = false;
    this.stream = "";
    this.error = null;
    this.lastSubmission = null;
    this.render();
  }

  setAccepted(approximateTokens?: number): void {
    this.accepted = true;
    this.busy = true;
    this.draft = "";
    this.error = null;
    if (this.contextSummary && approximateTokens !== undefined) this.contextSummary = { ...this.contextSummary, approximateTokens };
    this.render();
    this.scrollToLatest();
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.render();
  }

  appendDelta(delta: string): void {
    this.stream += delta;
    if (this.streamFrame !== null) return;
    const view = this.document.defaultView;
    if (!view) {
      this.updateStream();
      return;
    }
    let fired = false;
    let frame: number | null = null;
    frame = view.requestAnimationFrame(() => {
      fired = true;
      if (this.streamFrame === frame) this.streamFrame = null;
      this.updateStream();
    });
    this.streamFrame = fired ? null : frame;
  }

  complete(messages: SideMessage[]): void {
    this.messages = messages;
    this.quote = null;
    this.stream = "";
    this.busy = false;
    this.accepted = false;
    this.error = null;
    this.lastSubmission = null;
    this.render();
    this.scrollToLatest();
  }

  destroy(): void {
    this.closeMissingResolver(undefined);
    this.cancelStreamFrame();
    this.endInteraction(false);
    this.document.defaultView?.removeEventListener("resize", this.viewportResize);
    this.host.remove();
  }

  resolveMissingAttachments(names: string[]): Promise<File[] | null | undefined> {
    this.closeMissingResolver(undefined);
    return new Promise((resolve) => {
      this.missingResolver = resolve;
      const dialog = this.document.createElement("dialog");
      dialog.setAttribute("aria-label", "重新选择缺失附件");
      dialog.dataset.missingAttachments = "true";
      const title = this.document.createElement("h2");
      title.textContent = "重新选择缺失附件";
      const explanation = this.document.createElement("p");
      explanation.textContent = "请重新选择全部缺失文件，也可以跳过这些文件继续。";
      const list = this.document.createElement("ul");
      for (const name of names) {
        const item = this.document.createElement("li");
        item.textContent = name;
        list.append(item);
      }
      const input = this.document.createElement("input");
      input.type = "file";
      input.multiple = names.length > 1;
      input.setAttribute("aria-label", "缺失的附件文件");
      const error = this.document.createElement("p");
      error.setAttribute("role", "alert");
      const reselect = this.button("重新选择文件", "reselect-files", () => {
        const files = Array.from(input.files ?? []);
        if (files.length !== names.length) {
          error.textContent = `请选择 ${names.length} 个文件。`;
          return;
        }
        this.closeMissingResolver(files);
      });
      const skip = this.button("跳过这些文件继续", "continue-without-files", () => this.closeMissingResolver(null));
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        this.closeMissingResolver(undefined);
      });
      dialog.append(title, explanation, list, input, error, reselect, skip);
      this.root.append(dialog);
      this.missingDialog = dialog;
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute("open", "");
      }
    });
  }

  private restore(): void {
    if (this.mode !== "minimized") return;
    this.mode = "expanded";
    this.geometry = this.clampGeometry(this.geometry);
    this.render();
    this.animateMode(false);
    this.scrollToLatest();
  }

  private animateMode(minimized: boolean): void {
    if (this.document.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const element = this.root.querySelector<HTMLElement>(minimized ? "[data-minimized-bar]" : ".panel");
    const small = { width: "180px", height: "44px", borderRadius: "12px" };
    const large = { width: `${this.geometry.width}px`, height: `${this.geometry.height}px`, borderRadius: "16px" };
    element?.animate?.(minimized ? [large, small] : [small, large], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" });
  }

  private closeMissingResolver(files: File[] | null | undefined): void {
    const resolve = this.missingResolver;
    this.missingResolver = null;
    const dialog = this.missingDialog;
    this.missingDialog = null;
    try {
      dialog?.close();
    } catch {
      // Dialog support is absent in some test and browser environments.
    }
    dialog?.remove();
    resolve?.(files);
  }

  private cancelStreamFrame(): void {
    if (this.streamFrame !== null) this.document.defaultView?.cancelAnimationFrame(this.streamFrame);
    this.streamFrame = null;
  }

  private updateStream(): void {
    const list = this.root.querySelector<HTMLElement>(".messages");
    if (!list) return;
    let node = list.querySelector<HTMLElement>("[data-stream-message]");
    if (!node) {
      node = this.message({ id: "stream", role: "assistant", content: "", status: "incomplete", createdAt: "" });
      node.dataset.streamMessage = "true";
      list.append(node);
    }
    const content = node.querySelector<HTMLElement>(".message-content")!;
    content.innerHTML = renderMarkdown(this.stream, this.document);
    list.scrollTop = list.scrollHeight;
  }

  private scrollToLatest(): void {
    const list = this.root.querySelector<HTMLElement>(".messages");
    if (list) list.scrollTop = list.scrollHeight;
  }

  private clampGeometry(value: WindowGeometry, minimized = this.mode === "minimized"): WindowGeometry {
    const viewportWidth = Math.max(24, this.document.defaultView?.innerWidth ?? 1920);
    const viewportHeight = Math.max(24, this.document.defaultView?.innerHeight ?? 1080);
    const maxWidth = viewportWidth - VIEWPORT_MARGIN * 2;
    const maxHeight = viewportHeight - VIEWPORT_MARGIN * 2;
    const minWidth = Math.min(MIN_WIDTH, maxWidth);
    const minHeight = Math.min(MIN_HEIGHT, maxHeight);
    const finite = (candidate: number, fallback: number) => Number.isFinite(candidate) ? Math.round(candidate) : fallback;
    const width = Math.max(minWidth, Math.min(maxWidth, finite(value.width, DEFAULT_GEOMETRY.width)));
    const height = Math.max(minHeight, Math.min(maxHeight, finite(value.height, DEFAULT_GEOMETRY.height)));
    // Offsets retain the expanded dimensions so both modes share the same top-left anchor.
    const visibleWidth = minimized ? Math.min(180, maxWidth) : width;
    const visibleHeight = minimized ? Math.min(44, maxHeight) : height;
    const right = Math.max(VIEWPORT_MARGIN + visibleWidth - width, Math.min(viewportWidth - width - VIEWPORT_MARGIN, finite(value.right, DEFAULT_GEOMETRY.right)));
    const bottom = Math.max(VIEWPORT_MARGIN + visibleHeight - height, Math.min(viewportHeight - height - VIEWPORT_MARGIN, finite(value.bottom, DEFAULT_GEOMETRY.bottom)));
    return { width, height, right, bottom };
  }

  private syncGeometry(): void {
    const bar = this.root.querySelector<HTMLElement>("[data-minimized-bar]");
    if (bar) {
      bar.style.left = `${(this.document.defaultView?.innerWidth ?? 1920) - this.geometry.right - this.geometry.width}px`;
      bar.style.top = `${(this.document.defaultView?.innerHeight ?? 1080) - this.geometry.bottom - this.geometry.height}px`;
    }
    const panel = this.root.querySelector<HTMLElement>(".panel");
    if (panel) {
      panel.style.left = `${(this.document.defaultView?.innerWidth ?? 1920) - this.geometry.right - this.geometry.width}px`;
      panel.style.top = `${(this.document.defaultView?.innerHeight ?? 1080) - this.geometry.bottom - this.geometry.height}px`;
      panel.style.setProperty("--side-chat-width", `${this.geometry.width}px`);
      panel.style.setProperty("--side-chat-height", `${this.geometry.height}px`);
      panel.style.setProperty("--side-chat-right", `${this.geometry.right}px`);
      panel.style.setProperty("--side-chat-bottom", `${this.geometry.bottom}px`);
    }
    const handle = this.root.querySelector<HTMLElement>("[data-resize-handle]");
    handle?.setAttribute("aria-valuenow", String(this.geometry.width));
    handle?.setAttribute("aria-valuetext", `宽 ${this.geometry.width} 像素，高 ${this.geometry.height} 像素`);
  }

  private render(): void {
    this.closeMissingResolver(undefined);
    this.cancelStreamFrame();
    this.root.innerHTML = "";
    const style = this.document.createElement("style");
    style.textContent = sidePanelStyles;
    const katexStyle = this.document.createElement("link");
    katexStyle.rel = "stylesheet";
    katexStyle.dataset.katexStyle = "true";
    katexStyle.href = typeof chrome !== "undefined" && chrome.runtime?.getURL ? chrome.runtime.getURL("katex/katex.min.css") : "katex/katex.min.css";
    this.root.append(style, katexStyle);

    if (this.mode === "hidden") {
      this.host.style.display = "none";
      return;
    }
    this.host.style.display = "";
    if (this.mode === "minimized") {
      const bar = this.button("", "restore", () => this.restore(), false, "打开侧边对话");
      bar.className = "minimized-bar";
      bar.addEventListener("pointerdown", (event) => {
        this.barDragged = false;
        this.startInteraction("bar", event);
      });
      bar.addEventListener("click", (event) => {
        if (!this.barDragged || event.detail === 0) return;
        this.barDragged = false;
        event.preventDefault();
        event.stopImmediatePropagation();
      }, true);
      bar.dataset.minimizedBar = "true";
      bar.style.left = `${(this.document.defaultView?.innerWidth ?? 1920) - this.geometry.right - this.geometry.width}px`;
      bar.style.top = `${(this.document.defaultView?.innerHeight ?? 1080) - this.geometry.bottom - this.geometry.height}px`;
      const label = this.document.createElement("span");
      label.textContent = this.busy ? "正在生成…" : "侧边对话";
      const icon = this.document.createElement("span");
      icon.textContent = "↗"; icon.setAttribute("aria-hidden", "true");
      bar.append(label, icon);
      this.root.append(bar);
      return;
    }

    const panel = this.document.createElement("section");
    panel.className = "panel";
    panel.setAttribute("aria-label", "侧边对话浮窗");
    const resize = this.document.createElement("div");
    resize.className = "resize";
    resize.dataset.resizeHandle = "true";
    resize.setAttribute("aria-label", "调整侧边对话大小");
    resize.setAttribute("role", "separator");
    resize.setAttribute("aria-valuemin", String(MIN_WIDTH));
    resize.setAttribute("aria-valuemax", String(Math.max(MIN_WIDTH, (this.document.defaultView?.innerWidth ?? 1920) - VIEWPORT_MARGIN * 2)));
    resize.tabIndex = 0;
    resize.addEventListener("pointerdown", this.resizeDown);
    resize.addEventListener("keydown", this.keyResize);
    panel.append(resize);

    const header = this.document.createElement("header");
    header.dataset.dragHandle = "true";
    header.addEventListener("pointerdown", this.dragDown);
    const title = this.document.createElement("strong");
    title.textContent = "侧边对话";
    header.append(title);
    header.append(this.button(this.settingsOpen ? "返回对话" : "设置", "settings", () => {
      this.settingsOpen = !this.settingsOpen;
      this.render();
      if (!this.settingsOpen) this.options.onSettingsClose?.();
    }, this.busy));
    header.append(this.button("清空", "clear", () => {
      if (this.document.defaultView?.confirm?.("确认清空当前侧边对话记录吗？") ?? true) this.options.onClear?.();
    }));
    header.append(this.button("—", "minimize", () => this.minimize(), false, "最小化侧边对话"));
    panel.append(header);

    if (this.settingsOpen) {
      const frame = this.document.createElement("iframe");
      frame.title = "模型与 API 设置";
      frame.src = typeof chrome !== "undefined" && chrome.runtime?.getURL ? chrome.runtime.getURL("options.html?embedded=1") : "options.html?embedded=1";
      frame.style.cssText = "width:100%;flex:1;min-height:0;border:0;border-radius:0 0 16px 16px";
      panel.append(frame);
      this.root.append(panel);
      this.syncGeometry();
      return;
    }

    if (this.contextSummary) {
      const summary = this.document.createElement("div");
      summary.className = "context-summary";
      const limit = this.contextSummary.contextWindowTokens > 0 ? this.contextSummary.contextWindowTokens.toLocaleString("en-US") : "尚未配置";
      const approximate = this.contextSummary.approximateTokens === undefined ? "发送时计算" : this.contextSummary.approximateTokens.toLocaleString("en-US");
      summary.textContent = `已读取 ${this.contextSummary.capturedMessages} 条消息 · 目标：${this.contextSummary.endpointOrigin} · 模型：${this.contextSummary.model} · 预计词元：${approximate} / ${limit}`;
      panel.append(summary);
    }

    const list = this.document.createElement("div");
    list.className = "messages";
    list.setAttribute("role", "log");
    list.setAttribute("aria-live", "polite");
    for (const message of this.messages) list.append(this.message(message));
    if (this.lastSubmission) {
      const pending = this.message({ id: "pending", role: "user", content: this.lastSubmission.question, ...(this.lastSubmission.quote ? { quote: this.lastSubmission.quote } : {}), status: "complete", createdAt: "" });
      pending.dataset.pendingMessage = "true";
      list.append(pending);
    }
    if (this.stream) {
      const stream = this.message({ id: "stream", role: "assistant", content: this.stream, status: "incomplete", createdAt: "" });
      stream.dataset.streamMessage = "true";
      list.append(stream);
    }
    panel.append(list);

    const status = this.document.createElement("div");
    status.className = "status";
    status.setAttribute("aria-live", "polite");
    if (this.error) {
      status.setAttribute("role", "alert");
      status.textContent = this.error.message;
      if (this.error.diagnostic) {
        const diagnostic = this.error.diagnostic;
        status.append(this.button("复制诊断信息", "copy-diagnostics", () => {
          void this.document.defaultView?.navigator.clipboard?.writeText(diagnostic).then(
            () => this.setNotice("诊断信息已复制。"),
            () => this.setNotice("无法复制诊断信息。"),
          );
        }));
      }
      if (this.error.retryable && this.lastSubmission) status.append(this.button("重试", "retry", () => this.send(this.lastSubmission!)));
    } else if (this.notice) {
      status.textContent = this.notice;
    } else if (this.busy) {
      status.textContent = "正在生成……";
    }
    panel.append(status);

    if (this.quote && !this.lastSubmission) {
      const activeQuote = this.quoteBlock(this.quote.text);
      activeQuote.id = "side-chat-active-quote";
      activeQuote.classList.add("active-quote");
      activeQuote.dataset.activeQuote = "true";
      panel.append(activeQuote);
    }

    const form = this.document.createElement("form");
    const textarea = this.document.createElement("textarea");
    textarea.setAttribute("aria-label", "侧边对话问题");
    if (this.quote && !this.lastSubmission) textarea.setAttribute("aria-describedby", "side-chat-active-quote");
    textarea.placeholder = this.quote ? "针对所选内容提问……" : "继续追问……";
    textarea.value = this.draft;
    textarea.disabled = !this.conversationId || this.busy;
    textarea.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      if (this.canSend()) form.requestSubmit();
    });
    textarea.addEventListener("input", () => {
      this.draft = textarea.value;
      const send = form.querySelector<HTMLButtonElement>("[data-action=send]");
      if (send) send.disabled = !this.canSend();
    });
    const controls = this.document.createElement("div");
    controls.className = "controls";
    const label = this.document.createElement("label");
    const checkbox = this.document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = this.lastSubmission?.compressOldContext ?? false;
    label.append(checkbox, " 仅在需要时压缩旧上下文；压缩后仅保留摘要，不保留原文。");
    const send = this.button("↑", "send", () => {}, true, "发送");
    send.disabled = !this.canSend();
    controls.append(label);
    const composer = this.document.createElement("div");
    composer.className = "composer";
    composer.append(textarea, send);
    form.append(composer, controls);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const question = this.draft.trim();
      if (!this.canSend()) return;
      this.send({ question, ...(this.quote ? { quote: this.quote } : {}), compressOldContext: checkbox.checked });
    });
    panel.append(form);
    this.root.append(panel);
    this.syncGeometry();
  }

  private canSend(): boolean {
    return Boolean(this.draft.trim() && this.conversationId && !this.busy);
  }

  private button(text: string, action: string, click: () => void, submit = false, label = text): HTMLButtonElement {
    const button = this.document.createElement("button");
    button.type = submit ? "submit" : "button";
    button.dataset.action = action;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.textContent = text;
    button.addEventListener("click", click);
    return button;
  }

  private message(message: SideMessage): HTMLElement {
    const box = this.document.createElement("article");
    box.className = `message ${message.role}`;
    const content = this.document.createElement("div");
    content.className = "message-content";
    content.innerHTML = renderMarkdown(message.content, this.document);
    box.append(content);
    if (message.quote) box.append(this.quoteBlock(message.quote.text));
    if (message.status === "incomplete") {
      const marker = this.document.createElement("div");
      marker.className = "incomplete";
      marker.textContent = "未完成";
      box.append(marker);
    }
    return box;
  }

  private quoteBlock(text: string): HTMLElement {
    const quote = this.document.createElement("div");
    quote.className = "quote";
    const label = this.document.createElement("span");
    label.className = "quote-label";
    label.textContent = "引用内容";
    const content = this.document.createElement("div");
    content.className = "quote-content";
    content.textContent = text;
    quote.append(label, content);
    return quote;
  }

  private send(payload: PanelSend): void {
    if (this.busy) return;
    this.lastSubmission = payload;
    this.error = null;
    this.notice = "";
    this.stream = "";
    this.busy = true;
    this.render();
    this.scrollToLatest();
    this.options.onSend(payload);
  }

  private startInteraction(kind: PointerInteraction["kind"], event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    this.interaction = { kind, startX: event.clientX, startY: event.clientY, geometry: { ...this.geometry } };
    this.document.addEventListener("pointermove", this.pointerMove);
    this.document.addEventListener("pointerup", this.pointerUp);
    this.document.addEventListener("pointercancel", this.pointerUp);
    this.document.defaultView?.addEventListener("blur", this.pointerUp);
  }

  private endInteraction(save: boolean): void {
    if (!this.interaction) return;
    this.interaction = null;
    this.document.removeEventListener("pointermove", this.pointerMove);
    this.document.removeEventListener("pointerup", this.pointerUp);
    this.document.removeEventListener("pointercancel", this.pointerUp);
    this.document.defaultView?.removeEventListener("blur", this.pointerUp);
    if (save) this.options.onGeometryChange?.(this.clampGeometry(this.geometry, false));
  }

  private readonly resizeDown = (event: PointerEvent): void => this.startInteraction("resize", event);
  private readonly dragDown = (event: PointerEvent): void => {
    if ((event.target as Element | null)?.closest?.("button")) return;
    this.startInteraction("drag", event);
  };
  private readonly pointerMove = (event: PointerEvent): void => {
    const interaction = this.interaction;
    if (!interaction) return;
    const deltaX = event.clientX - interaction.startX;
    const deltaY = event.clientY - interaction.startY;
    if (interaction.kind === "bar") {
      if (!this.barDragged && Math.hypot(deltaX, deltaY) < 4) return;
      this.barDragged = true;
    }
    this.geometry = interaction.kind === "resize"
      ? this.resizeGeometry(interaction.geometry, deltaX, deltaY)
      : this.clampGeometry({ ...interaction.geometry, right: interaction.geometry.right - deltaX, bottom: interaction.geometry.bottom - deltaY });
    this.syncGeometry();
  };
  private readonly pointerUp = (): void => this.endInteraction(true);
  private resizeGeometry(start: WindowGeometry, dx: number, dy: number): WindowGeometry {
    const width = Math.max(Math.min(MIN_WIDTH, start.width + start.right - 12), Math.min(start.width + start.right - 12, start.width + dx));
    const height = Math.max(Math.min(MIN_HEIGHT, start.height + start.bottom - 12), Math.min(start.height + start.bottom - 12, start.height + dy));
    return { width, height, right: start.right + start.width - width, bottom: start.bottom + start.height - height };
  }
  private readonly keyResize = (event: KeyboardEvent): void => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    this.geometry = this.resizeGeometry(this.geometry, event.key === "ArrowRight" ? 16 : event.key === "ArrowLeft" ? -16 : 0, event.key === "ArrowDown" ? 16 : event.key === "ArrowUp" ? -16 : 0);
    this.syncGeometry();
    this.options.onGeometryChange?.({ ...this.geometry });
  };
  private readonly viewportResize = (): void => {
    this.geometry = this.clampGeometry(this.geometry);
    this.syncGeometry();
  };
}
