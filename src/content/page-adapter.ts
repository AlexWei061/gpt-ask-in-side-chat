import { isVisible, serializeMessage } from "./extractor";
import type { ChatRole, MainMessage } from "../shared/types";

export const MESSAGE_SELECTOR = "article[data-message-author-role]";

export interface ExtractionResult {
  messages: MainMessage[];
  certain: boolean;
}

export class ChatGptPageAdapter {
  constructor(private readonly document: Document) {}

  getConversationId(url = this.document.location.href): string | null {
    try {
      return new URL(url).pathname.match(/^\/c\/([^/]+)/)?.[1] ?? null;
    } catch {
      return null;
    }
  }

  findMessageElement(node: Node | null): Element | null {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node as Element : node?.parentElement;
    return element?.closest(MESSAGE_SELECTOR) ?? null;
  }

  extractConversation(): ExtractionResult {
    const candidates = Array.from(this.document.querySelectorAll<HTMLElement>("main article"));
    const messages: MainMessage[] = [];
    let certain = candidates.length > 0;

    for (const article of candidates) {
      const role = article.getAttribute("data-message-author-role");
      if (role !== "user" && role !== "assistant") {
        certain = false;
        continue;
      }

      const root = article.querySelector<HTMLElement>(".markdown") ?? article;
      if (!isVisible(article) || !isVisible(root)) {
        certain = false;
        continue;
      }

      const serialized = serializeMessage(root);
      if (!serialized.content) certain = false;
      messages.push({ index: messages.length, role: role as ChatRole, ...serialized });
    }

    return { messages, certain: certain && messages.length === candidates.length };
  }
}
