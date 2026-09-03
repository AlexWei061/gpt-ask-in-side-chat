import type { MainMessage } from "../shared/types";

export function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/[ \t\f\v]+\n/g, "\n").trim();
}

export function serializeTable(table: HTMLTableElement): string {
  const rows = Array.from(table.rows, (row) =>
    Array.from(row.cells, (cell) => normalizeText(cell.innerText)),
  );
  const width = rows[0]?.length ?? 0;

  if (width === 0 || rows.some((row) => row.length !== width)) {
    return rows.map((row) => row.join("\t")).join("\n");
  }

  return [
    `| ${rows[0]?.join(" | ")} |`,
    `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
    ...rows.slice(1).map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function replaceWithText(element: Element, text: string): void {
  element.replaceWith(element.ownerDocument.createTextNode(`\n${text}\n`));
}

export function serializeMessage(root: Element): Pick<MainMessage, "content" | "links"> {
  const clone = root.cloneNode(true) as Element;
  clone.querySelectorAll("button, [aria-hidden='true'], script, style").forEach((element) => element.remove());

  const links = Array.from(clone.querySelectorAll<HTMLAnchorElement>("a[href]"), (anchor) => ({
    label: normalizeText(anchor.innerText),
    href: anchor.href,
  }));

  clone.querySelectorAll("pre").forEach((pre) => {
    const code = pre.querySelector("code");
    const language = Array.from(code?.classList ?? []).find((className) => className.startsWith("language-"))?.slice("language-".length) ?? "";
    const contentElement = (code ?? pre) as HTMLElement;
    replaceWithText(pre, `\`\`\`${language}\n${normalizeText(contentElement.innerText)}\n\`\`\``);
  });
  clone.querySelectorAll("table").forEach((table) => replaceWithText(table, serializeTable(table)));

  return { content: normalizeText((clone as HTMLElement).innerText), links };
}
