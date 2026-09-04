// pdfjs-dist exposes its browser module without a TypeScript export map.
// @ts-expect-error bundled browser module has no declaration file
import * as pdfjs from "pdfjs-dist/build/pdf.mjs";
import { ExtensionError } from "../shared/errors";
import type { PreparedAttachment } from "../shared/types";
import { isVisible } from "./extractor";

export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export interface AttachmentDescriptor { name: string; sourceMessageIndex: number; url: string | null; }
type PdfParser = (file: File) => Promise<string>;

const chromeRuntime = globalThis.chrome?.runtime;
if (chromeRuntime?.getURL) pdfjs.GlobalWorkerOptions.workerSrc = chromeRuntime.getURL("pdf.worker.min.mjs");

function failed(): ExtensionError { return new ExtensionError("ATTACHMENT_FAILED", "This attachment could not be read locally.", true); }
function validName(name: string): boolean { return Boolean(name.trim() && name.trim().length <= 255 && !/[\0/\\]/.test(name)); }
function textFile(file: File): boolean { return file.type.startsWith("text/") || ["application/json", "application/csv"].includes(file.type) || /\.(?:txt|md|markdown|json|csv|ts|tsx|js|jsx|py|java|c|cc|cpp|h|hpp|cs|go|rs|rb|php|html?|css|xml|yaml|yml|sql|sh|zsh)$/i.test(file.name); }
function pdfFile(file: File): boolean { return file.type === "application/pdf" || /\.pdf$/i.test(file.name); }

export async function extractPdf(file: File): Promise<string> {
  let task: ReturnType<typeof pdfjs.getDocument> | undefined;
  let document: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]> | undefined;
  try {
    task = pdfjs.getDocument({ data: await file.arrayBuffer() });
    document = await task.promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      try { pages.push((await page.getTextContent()).items.map((item: unknown) => item && typeof item === "object" && "str" in item && typeof item.str === "string" ? item.str : "").join(" ").trim()); }
      finally { page.cleanup?.(); }
    }
    return pages.join("\n").trim();
  } catch { throw failed(); }
  finally { try { await document?.destroy?.(); } catch { /* best effort */ } try { await task?.destroy?.(); } catch { /* best effort */ } }
}

async function dataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(failed()); reader.onabort = () => reject(failed());
    reader.onload = () => typeof reader.result === "string" && reader.result ? resolve(reader.result) : reject(failed());
    reader.readAsDataURL(file);
  });
}

export async function prepareFile(file: File, sourceMessageIndex: number, supportsImages: boolean, pdfParser: PdfParser = extractPdf): Promise<PreparedAttachment> {
  if (!Number.isInteger(sourceMessageIndex) || sourceMessageIndex < 0 || !validName(file.name) || file.size > ATTACHMENT_MAX_BYTES) throw failed();
  try {
    if (file.type.startsWith("image/")) {
      if (!supportsImages) throw failed();
      return { kind: "image", name: file.name, sourceMessageIndex, dataUrl: await dataUrl(file) };
    }
    if (pdfFile(file)) {
      const text = await pdfParser(file);
      if (!text.trim()) throw failed();
      return { kind: "text", name: file.name, sourceMessageIndex, text };
    }
    if (textFile(file)) return { kind: "text", name: file.name, sourceMessageIndex, text: await file.text() };
  } catch (error) { if (error instanceof ExtensionError) throw error; throw failed(); }
  throw failed();
}

function nodeName(node: Element): string | null {
  const anchor = node instanceof HTMLAnchorElement ? node : node.querySelector<HTMLAnchorElement>("a[download]");
  const name = anchor?.getAttribute("download") || anchor?.textContent || node.getAttribute("data-filename") || node.textContent;
  const trimmed = name?.trim() ?? "";
  return validName(trimmed) ? trimmed : null;
}

export function extractAttachmentDescriptors(elements: Element[]): AttachmentDescriptor[] {
  const descriptors: AttachmentDescriptor[] = [];
  const seen = new Set<string>();
  elements.forEach((message, sourceMessageIndex) => {
    const nodes = [message, ...Array.from(message.querySelectorAll("a[download], [data-testid*='attachment']"))];
    for (const node of nodes) {
      if (!isVisible(node)) continue;
      const anchor = node instanceof HTMLAnchorElement && node.hasAttribute("download") ? node : node.querySelector<HTMLAnchorElement>("a[download]");
      if (!anchor && !node.getAttribute("data-testid")?.toLowerCase().includes("attachment")) continue;
      const name = nodeName(node); if (!name) continue;
      const url = anchor?.href || null;
      const key = `${sourceMessageIndex}\u0000${url ?? ""}\u0000${name}`;
      if (seen.has(key)) continue;
      seen.add(key); descriptors.push({ name, sourceMessageIndex, url });
    }
  });
  return descriptors;
}
