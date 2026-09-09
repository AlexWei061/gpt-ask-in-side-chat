import { t } from "../shared/i18n";
import type { QuoteReference } from "../shared/types";
import { ChatGptPageAdapter } from "./page-adapter";
import { watchPageTheme } from "../shared/theme";

export function quoteFromRange(range: Range, adapter: ChatGptPageAdapter): QuoteReference | null {
  const touchesEditable = [range.startContainer, range.endContainer].some((node) => {
    const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
    return element?.closest('input, textarea, [contenteditable]:not([contenteditable="false"])');
  });
  if (touchesEditable) return null;

  const startMessage = adapter.findMessageElement(range.startContainer);
  const endMessage = adapter.findMessageElement(range.endContainer);
  const text = range.toString().trim();

  if (!startMessage || startMessage !== endMessage || !text) return null;

  const sourceRole = startMessage.getAttribute("data-message-author-role");
  if (sourceRole !== "user" && sourceRole !== "assistant") return null;

  const extraction = adapter.extractConversation();
  if (!extraction.certain) return null;

  const candidates = adapter.getMessageElements();
  const sourceMessageIndex = candidates.indexOf(startMessage as HTMLElement);
  const message = extraction.messages[sourceMessageIndex];
  if (!message || message.index !== sourceMessageIndex || message.role !== sourceRole) return null;

  return { text, sourceRole, sourceMessageIndex };
}

export class SelectionController {
  private readonly adapter: ChatGptPageAdapter;
  private readonly button: HTMLButtonElement;
  private readonly stopTheme: () => void;
  private frameId: number | null = null;

  constructor(
    private readonly document: Document,
    private readonly onAsk: (quote: QuoteReference) => void,
    private readonly onSelect?: (quote: QuoteReference) => boolean,
  ) {
    this.adapter = new ChatGptPageAdapter(document);
    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.textContent = t("askInSideChat");
    this.button.dataset.sideChatSelectionAction = "true";
    Object.assign(this.button.style, {
      position: "fixed",
      zIndex: "2147483647",
      display: "none",
      background: "#202123",
      color: "#fff",
      border: "1px solid #dde3df",
      borderRadius: "10px",
      padding: "8px 13px",
      maxWidth: "calc(100vw - 16px)",
      boxSizing: "border-box",
      font: '500 13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif',
      cursor: "pointer",
    });
    document.body.append(this.button);
    this.stopTheme = watchPageTheme(document, (theme) => Object.assign(this.button.style, theme === "dark" ? {
      background: "#2b2b2b", color: "#ececec", borderColor: "#474747", boxShadow: "0 4px 16px #0004", colorScheme: "dark",
    } : {
      background: "#fff", color: "#187659", borderColor: "#dde3df", boxShadow: "0 4px 16px #17251d20", colorScheme: "light",
    }));

    document.addEventListener("selectionchange", this.handleSelectionChange);
    document.addEventListener("scroll", this.hide, true);
    document.addEventListener("keydown", this.handleKeydown);
    document.addEventListener("mousedown", this.handleDocumentMouseDown);
    document.defaultView?.addEventListener("resize", this.hide);
    document.defaultView?.visualViewport?.addEventListener("resize", this.hide);
    this.button.addEventListener("mousedown", this.handleMouseDown);
    this.button.addEventListener("click", this.handleClick);
  }

  destroy(): void {
    this.stopTheme();
    this.document.removeEventListener("selectionchange", this.handleSelectionChange);
    this.document.removeEventListener("scroll", this.hide, true);
    this.document.removeEventListener("keydown", this.handleKeydown);
    this.document.removeEventListener("mousedown", this.handleDocumentMouseDown);
    this.document.defaultView?.removeEventListener("resize", this.hide);
    this.document.defaultView?.visualViewport?.removeEventListener("resize", this.hide);
    this.button.removeEventListener("mousedown", this.handleMouseDown);
    this.button.removeEventListener("click", this.handleClick);
    this.hide();
    this.button.remove();
  }

  private readonly handleSelectionChange = (): void => {
    if (this.frameId !== null) return;
    const view = this.document.defaultView;
    if (!view) {
      this.refreshSelection();
      return;
    }
    let refreshed = false;
    let frameId: number | null = null;
    frameId = view.requestAnimationFrame(() => {
      refreshed = true;
      if (this.frameId !== frameId) return;
      this.frameId = null;
      this.refreshSelection();
    });
    this.frameId = refreshed ? null : frameId;
  };

  private refreshSelection(): void {
    const range = this.currentRange();
    const quote = range ? quoteFromRange(range, this.adapter) : null;
    if (!range || !quote || this.onSelect?.(quote)) {
      this.hide();
      return;
    }

    const rect = range.getBoundingClientRect();
    const viewportWidth = this.document.defaultView?.innerWidth ?? this.document.documentElement.clientWidth;
    const viewportHeight = this.document.defaultView?.innerHeight ?? this.document.documentElement.clientHeight;
    const previousVisibility = this.button.style.visibility;
    this.button.style.visibility = "hidden";
    this.button.style.display = "block";
    const buttonRect = this.button.getBoundingClientRect();
    const buttonWidth = buttonRect.width || this.button.offsetWidth || 160;
    const buttonHeight = buttonRect.height || this.button.offsetHeight || 36;
    const left = Math.max(8, Math.min(rect.left, viewportWidth - buttonWidth - 8));
    const top = Math.max(8, Math.min(rect.bottom + 8, viewportHeight - buttonHeight - 8));
    this.button.style.left = `${left}px`;
    this.button.style.top = `${top}px`;
    this.button.style.visibility = previousVisibility;
  }

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") this.hide();
  };

  private readonly handleMouseDown = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly handleDocumentMouseDown = (event: MouseEvent): void => {
    if (!event.composedPath().includes(this.button)) this.hide();
  };

  private readonly handleClick = (): void => {
    const range = this.currentRange();
    const quote = range ? quoteFromRange(range, this.adapter) : null;
    this.document.getSelection()?.removeAllRanges();
    this.hide();
    if (quote) this.onAsk(quote);
  };

  private currentRange(): Range | null {
    const selection = this.document.getSelection();
    return selection && selection.rangeCount === 1 && !selection.isCollapsed ? selection.getRangeAt(0) : null;
  }

  private readonly hide = (): void => {
    if (this.frameId !== null) this.document.defaultView?.cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.button.style.display = "none";
  };
}
