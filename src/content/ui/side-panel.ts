import type { QuoteReference, SideMessage } from "../../shared/types";
import { sidePanelStyles } from "./styles";
import { renderMarkdown } from "./markdown";

export type PanelSend = { question: string; quote: QuoteReference; compressOldContext: boolean };
export type PanelError = { message: string; retryable: boolean };
export interface SidePanelOptions { onSend: (payload: PanelSend) => void; onClear?: () => void; onResize?: (width: number) => void; }

export class SidePanel {
  private readonly host: HTMLElement; private readonly root: ShadowRoot; private width = 420;
  private originalMargin: string | null = null; private conversationId: string | null = null; private messages: SideMessage[] = [];
  private quote: QuoteReference | null = null; private draft = ""; private error: PanelError | null = null; private lastSubmission: PanelSend | null = null;
  private busy = false; private accepted = false; private stream = ""; private resizing = false; private openState = false; private notice = "";
  constructor(private readonly document: Document, private readonly options: SidePanelOptions) {
    this.host = document.createElement("aside"); this.host.dataset.sideChatHost = "true"; this.root = this.host.attachShadow({ mode: "open" });
    document.documentElement.append(this.host); this.host.style.display = "none"; this.render();
  }
  setWidth(width: number): void { this.width = this.clamp(width); this.render(); this.applyMargin(); }
  setConversation(id: string | null, messages: SideMessage[]): void { this.conversationId = id; this.messages = messages; this.quote = null; this.draft = ""; this.error = null; this.notice = ""; this.lastSubmission = null; this.busy = false; this.accepted = false; this.stream = ""; this.render(); this.syncOpenState(); }
  setMessages(messages: SideMessage[]): void { this.messages = messages; this.stream = ""; this.render(); }
  open(quote: QuoteReference): void { this.openState = true; this.quote = quote; if (this.originalMargin === null) this.originalMargin = this.document.body.style.marginRight; this.applyMargin(); this.render(); this.syncOpenState(); this.root.querySelector<HTMLTextAreaElement>("textarea")?.focus(); }
  close(): void { this.openState = false; this.quote = null; this.restoreMargin(); this.render(); this.syncOpenState(); }
  setError(error: PanelError | null): void { this.error = error; this.notice = ""; this.busy = false; this.accepted = false; this.render(); }
  setNotice(message: string): void { this.notice = message; this.render(); }
  resetRequest(): void { this.busy = false; this.accepted = false; this.stream = ""; this.error = null; this.lastSubmission = null; this.render(); }
  setAccepted(): void { this.accepted = true; this.busy = true; this.draft = ""; this.error = null; this.render(); }
  setBusy(busy: boolean): void { this.busy = busy; this.render(); }
  appendDelta(delta: string): void { this.stream += delta; this.render(); const list = this.root.querySelector<HTMLElement>(".messages"); if (list) list.scrollTop = list.scrollHeight; }
  complete(messages: SideMessage[]): void { this.messages = messages; this.stream = ""; this.busy = false; this.accepted = false; this.error = null; this.lastSubmission = null; this.render(); }
  destroy(): void { this.document.removeEventListener("pointermove", this.move); this.document.removeEventListener("pointerup", this.up); this.restoreMargin(); this.host.remove(); }
  private syncOpenState(): void { this.host.style.display = this.openState ? "" : "none"; if (this.openState) this.applyMargin(); }
  private applyMargin(): void { if (this.openState) this.document.body.style.marginRight = `${this.width}px`; }
  private restoreMargin(): void { if (this.originalMargin !== null) { this.document.body.style.marginRight = this.originalMargin; this.originalMargin = null; } }
  private clamp(width: number): number { const max = Math.min(960, Math.max(320, Math.floor((this.document.defaultView?.innerWidth ?? 1920) / 2))); return Math.max(320, Math.min(max, Math.round(width))); }
  private render(): void {
    this.root.innerHTML = ""; const style = this.document.createElement("style"); style.textContent = sidePanelStyles; this.root.append(style);
    const panel = this.document.createElement("section"); panel.className = "panel"; panel.style.setProperty("--side-chat-width", `${this.width}px`);
    const resize = this.document.createElement("div"); resize.className = "resize"; resize.dataset.resizeHandle = "true"; resize.setAttribute("aria-label", "Resize side chat"); resize.setAttribute("role", "separator"); resize.setAttribute("aria-orientation", "vertical"); resize.setAttribute("aria-valuemin", "320"); resize.setAttribute("aria-valuemax", String(this.clamp(960))); resize.setAttribute("aria-valuenow", String(this.width)); resize.tabIndex = 0; resize.addEventListener("pointerdown", this.down); resize.addEventListener("keydown", this.keyResize); panel.append(resize);
    const header = this.document.createElement("header"); const title = this.document.createElement("strong"); title.textContent = "Side chat"; header.append(title);
    header.append(this.button("Clear", "clear", () => { if (this.document.defaultView?.confirm?.("Clear side-chat history?") ?? true) this.options.onClear?.(); })); header.append(this.button("Close", "close", () => this.close())); panel.append(header);
    const list = this.document.createElement("main"); list.className = "messages"; if (this.quote) { const preview = this.document.createElement("div"); preview.className = "message user"; const quoted = this.document.createElement("div"); quoted.className = "quote"; quoted.textContent = this.quote.text; preview.append(quoted); list.append(preview); } for (const message of this.messages) list.append(this.message(message)); if (this.stream) list.append(this.message({ id:"stream", role:"assistant", content:this.stream, status:"incomplete", createdAt:"" })); panel.append(list);
    const status = this.document.createElement("div"); status.className = "status"; if (this.error) { status.textContent = this.error.message; if (this.error.retryable && this.lastSubmission) status.append(this.button("Retry", "retry", () => this.send(this.lastSubmission!))); } else if (this.notice) status.textContent = this.notice; else if (this.busy) status.textContent = "Generating…"; panel.append(status);
    const form = this.document.createElement("form"); const textarea = this.document.createElement("textarea"); textarea.placeholder = "Ask about this selection…"; textarea.value = this.draft; textarea.disabled = !this.quote || !this.conversationId || this.busy; textarea.addEventListener("input", () => { this.draft = textarea.value; }); form.append(textarea);
    const controls = this.document.createElement("div"); controls.className = "controls"; const label = this.document.createElement("label"); const checkbox = this.document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = this.lastSubmission?.compressOldContext ?? false; label.append(checkbox, " Compress old context only if needed; it becomes summarized, non-verbatim."); controls.append(label, this.button("Send", "send", () => {}, true)); form.append(controls);
    form.addEventListener("submit", (event) => { event.preventDefault(); const question = this.draft.trim(); if (!question || !this.quote || !this.conversationId || this.busy) return; this.send({ question, quote: this.quote, compressOldContext: checkbox.checked }); }); panel.append(form); this.root.append(panel);
  }
  private button(text: string, action: string, click: () => void, submit = false): HTMLButtonElement { const button = this.document.createElement("button"); button.type = submit ? "submit" : "button"; button.dataset.action = action; button.setAttribute("aria-label", text); button.textContent = text; button.addEventListener("click", click); return button; }
  private message(message: SideMessage): HTMLElement { const box = this.document.createElement("article"); box.className = `message ${message.role}`; if (message.quote) { const quote = this.document.createElement("div"); quote.className="quote"; quote.textContent=message.quote.text; box.append(quote); } const content = this.document.createElement("div"); content.innerHTML = renderMarkdown(message.content, this.document); box.append(content); if (message.status === "incomplete") { const marker = this.document.createElement("div"); marker.className="incomplete"; marker.textContent="Incomplete"; box.append(marker); } return box; }
  private send(payload: PanelSend): void { if (this.busy) return; this.lastSubmission = payload; this.error = null; this.notice = ""; this.stream = ""; this.busy = true; this.options.onSend(payload); this.render(); }
  private readonly down = (event: PointerEvent): void => { event.preventDefault(); this.resizing = true; this.document.addEventListener("pointermove", this.move); this.document.addEventListener("pointerup", this.up); };
  private readonly move = (event: PointerEvent): void => { if (!this.resizing) return; this.width = this.clamp((this.document.defaultView?.innerWidth ?? 0) - event.clientX); this.render(); this.applyMargin(); };
  private readonly up = (): void => { if (!this.resizing) return; this.resizing=false; this.document.removeEventListener("pointermove", this.move); this.document.removeEventListener("pointerup", this.up); this.options.onResize?.(this.width); };
  private readonly keyResize = (event: KeyboardEvent): void => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); this.width = this.clamp(this.width + (event.key === "ArrowLeft" ? 16 : -16)); this.render(); this.applyMargin(); this.options.onResize?.(this.width); };
}
