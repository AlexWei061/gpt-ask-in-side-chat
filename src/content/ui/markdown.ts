import DOMPurify from "dompurify";
import { marked } from "marked";

export function renderMarkdown(markdown: string, document: Document): string {
  const html = DOMPurify.sanitize(marked.parse(markdown, { async: false }) as string, {
    FORBID_TAGS: ["style", "iframe", "object", "embed", "script", "img"],
    FORBID_ATTR: ["style"],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
  const holder = document.createElement("div");
  holder.innerHTML = html;
  holder.querySelectorAll("style, iframe, object, embed, script, img").forEach((node) => node.remove());
  holder.querySelectorAll("*").forEach((node) => {
    for (const attribute of [...node.attributes]) {
      if (/^on/i.test(attribute.name) || attribute.name === "style") node.removeAttribute(attribute.name);
    }
  });
  holder.querySelectorAll("a").forEach((link) => {
    const href = link.getAttribute("href") ?? "";
    if (!/^(https?:|mailto:)/i.test(href)) link.removeAttribute("href");
    else { link.target = "_blank"; link.rel = "noopener noreferrer"; }
  });
  return holder.innerHTML;
}
