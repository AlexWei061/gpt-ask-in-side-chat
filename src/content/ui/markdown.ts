import DOMPurify from "dompurify";
import { marked } from "marked";

export function renderMarkdown(markdown: string, document: Document): string {
  const html = DOMPurify.sanitize(marked.parse(markdown, { async: false }) as string, {
    ALLOWED_TAGS: ["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "ul", "ol", "li", "pre", "code", "em", "strong", "del", "br", "hr", "table", "thead", "tbody", "tr", "th", "td", "a"],
    ALLOWED_ATTR: ["href", "title"],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
  const holder = document.createElement("div");
  holder.innerHTML = html;
  holder.querySelectorAll("style, iframe, object, embed, script, img, video, audio, svg, math, form, input, button").forEach((node) => node.remove());
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
