import { t } from "../shared/i18n";
import type { QuoteReference } from "../shared/types";
import { ChatGptPageAdapter } from "./page-adapter";

export function quoteFromRange(range: Range, adapter: ChatGptPageAdapter): QuoteReference | null {
  const startMessage = adapter.findMessageElement(range.startContainer);
  const endMessage = adapter.findMessageElement(range.endContainer);
  const text = range.toString().trim();

  if (!startMessage || startMessage !== endMessage || !text) return null;

  const sourceRole = startMessage.getAttribute("data-message-author-role");
  if (sourceRole !== "user" && sourceRole !== "assistant") return null;

  const extraction = adapter.extractConversation();
  if (!extraction.certain) return null;

  const candidates = Array.from(startMessage.ownerDocument.querySelectorAll<HTMLElement>("main article"));
  const sourceMessageIndex = candidates.indexOf(startMessage as HTMLElement);
  const message = extraction.messages[sourceMessageIndex];
  if (!message || message.index !== sourceMessageIndex || message.role !== sourceRole) return null;

  return { text, sourceRole, sourceMessageIndex };
}

export class SelectionController {
  private readonly adapter: ChatGptPageAdapter;
  private readonly button: HTMLButtonElement;

  constructor(private readonly document: Document, private readonly onAsk: (quote: QuoteReference) => void) {
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
      border: "0",
      borderRadius: "999px",
      padding: "8px 12px",
      font: "inherit",
      cursor: "pointer",
    });
    document.body.append(this.button);

    document.addEventListener("selectionchange", this.handleSelectionChange);
    document.addEventListener("scroll", this.hide, true);
    document.addEventListener("keydown", this.handleKeydown);
    this.button.addEventListener("mousedown", this.handleMouseDown);
    this.button.addEventListener("click", this.handleClick);
  }

  destroy(): void {
    this.document.removeEventListener("selectionchange", this.handleSelectionChange);
    this.document.removeEventListener("scroll", this.hide, true);
    this.document.removeEventListener("keydown", this.handleKeydown);
    this.button.removeEventListener("mousedown", this.handleMouseDown);
    this.button.removeEventListener("click", this.handleClick);
    this.button.remove();
  }

  private readonly handleSelectionChange = (): void => {
    const range = this.currentRange();
    if (!range || !quoteFromRange(range, this.adapter)) {
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
  };

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") this.hide();
  };

  private readonly handleMouseDown = (event: MouseEvent): void => {
    event.preventDefault();
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
    this.button.style.display = "none";
  };
}
