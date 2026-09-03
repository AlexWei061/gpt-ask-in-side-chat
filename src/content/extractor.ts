import type { MainMessage } from "../shared/types";

const HIDDEN_TAGS = new Set(["BUTTON", "SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);
const BLOCK_TAGS = new Set(["P", "DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "ASIDE", "MAIN", "UL", "OL", "LI", "DL", "DT", "DD", "H1", "H2", "H3", "H4", "H5", "H6", "FIGURE", "FIGCAPTION", "BLOCKQUOTE", "HR"]);

export function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/[ \t\f\v]+\n/g, "\n").trim();
}

class TextWriter {
  private value = "";

  write(text: string): void {
    let normalized = text.replace(/\u00a0/g, " ").replace(/[\t\r\n ]+/g, " ");
    if (!normalized.trim()) return;
    if (this.value.endsWith("\n")) normalized = normalized.trimStart();
    this.value += normalized;
  }

  break(): void {
    this.value = this.value.replace(/[ \t]+$/, "");
    if (this.value && !this.value.endsWith("\n")) this.value += "\n";
  }

  writeLiteral(text: string): void {
    this.value = this.value.replace(/[ \t]+$/, "");
    this.value += text;
  }

  toString(): string {
    return normalizeText(this.value);
  }
}

export function isVisible(element: Element): boolean {
  for (let current: Element | null = element; current; current = current.parentElement) {
    if (HIDDEN_TAGS.has(current.tagName) || current.hasAttribute("hidden") || current.getAttribute("aria-hidden") === "true") return false;
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (style?.display === "none" || style?.visibility === "hidden") return false;
  }
  return true;
}

function codeFence(code: string): string {
  const longestRun = Math.max(0, ...Array.from(code.matchAll(/`+/g), (match) => match[0].length));
  return "`".repeat(Math.max(3, longestRun + 1));
}

function visibleCodeText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE || !isVisible(node as Element)) return "";
  if ((node as Element).tagName === "BR") return "\n";
  return Array.from(node.childNodes, visibleCodeText).join("");
}

function writeCode(pre: Element, writer: TextWriter): void {
  const code = pre.querySelector("code");
  const language = Array.from(code?.classList ?? []).find((className) => className.startsWith("language-"))?.slice("language-".length) ?? "";
  const content = normalizeText(visibleCodeText(code ?? pre));
  const fence = codeFence(content);
  writer.writeLiteral(`${fence}${language}\n${content}\n${fence}`);
  writer.break();
}

function visibleText(root: HTMLElement): string {
  const writer = new TextWriter();
  for (const child of root.childNodes) writeNode(child, writer, false, []);
  return writer.toString();
}

function tableCellText(cell: HTMLTableCellElement): string {
  return visibleText(cell).replace(/\s*\n\s*/g, " ").replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

function collectTableLinks(root: Element, links: MainMessage["links"]): void {
  if (!isVisible(root)) return;
  if (root instanceof HTMLAnchorElement && root.hasAttribute("href")) links.push({ label: visibleText(root), href: root.href });
  for (const child of root.children) collectTableLinks(child, links);
}

export function serializeTable(table: HTMLTableElement, links?: MainMessage["links"]): string {
  if (links) collectTableLinks(table, links);
  const rows = Array.from(table.rows)
    .filter(isVisible)
    .map((row) => Array.from(row.cells).filter(isVisible).map(tableCellText));
  const width = rows[0]?.length ?? 0;

  if (width === 0 || rows.some((row) => row.length !== width)) return rows.map((row) => row.join("\t")).join("\n");

  return [
    `| ${rows[0]?.join(" | ")} |`,
    `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
    ...rows.slice(1).map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function writeNode(node: Node, writer: TextWriter, collectLinks: boolean, links: MainMessage["links"]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    writer.write(node.textContent ?? "");
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const element = node as HTMLElement;
  if (!isVisible(element)) return;
  if (element.tagName === "BR") {
    writer.break();
    return;
  }
  if (element.tagName === "PRE") {
    writeCode(element, writer);
    return;
  }
  if (element.tagName === "TABLE") {
    writer.writeLiteral(serializeTable(element as HTMLTableElement, collectLinks ? links : undefined));
    writer.break();
    return;
  }
  if (collectLinks && element instanceof HTMLAnchorElement && element.hasAttribute("href")) {
    links.push({ label: visibleText(element), href: element.href });
  }

  for (const child of element.childNodes) writeNode(child, writer, collectLinks, links);
  if (BLOCK_TAGS.has(element.tagName)) writer.break();
}

export function serializeMessage(root: HTMLElement): Pick<MainMessage, "content" | "links"> {
  if (!isVisible(root)) return { content: "", links: [] };
  const links: MainMessage["links"] = [];
  const writer = new TextWriter();
  for (const child of root.childNodes) writeNode(child, writer, true, links);
  return { content: writer.toString(), links };
}
