import katex from "katex";

type Formula = {
  marker: string;
  source: string;
  tex: string;
  displayMode: boolean;
};

// Protect unfinished fences too: streamed code must remain code before its closing fence arrives.
const CODE = /^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)[\s\S]*?(?:^ {0,3}\1[ \t]*(?=\n|$)|(?![\s\S]))|^(?:(?: {4}|\t)[^\n]*(?:\n|$))+|(`+)(?:(?!\2)[\s\S])*?\2(?!`)/gm;
const BLOCK = /\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$/g;
const INLINE = /\\\(([^\n]*?)\\\)|(?<!\\)\$(?!\$)([^$\n]+?)(?<!\\)\$/g;

export function extractMath(markdown: string): { markdown: string; formulas: Formula[] } {
  let prefix = "SIDECHAT";
  while (markdown.includes(prefix)) prefix += "X";
  const code: string[] = [];
  const codeMarker = (index: number) => `${prefix}CODE${index}TOKEN`;
  let source = markdown.replace(CODE, (value) => {
    const marker = codeMarker(code.length);
    code.push(value);
    return marker;
  });

  const formulas: Formula[] = [];
  const save = (whole: string, tex: string, displayMode: boolean) => {
    const marker = `${prefix}FORMULA${formulas.length}TOKEN`;
    formulas.push({ marker, source: whole, tex: tex.trim(), displayMode });
    return displayMode ? `\n\n${marker}\n\n` : marker;
  };

  source = source.replace(BLOCK, (whole, bracket, dollar) => save(whole, bracket ?? dollar, true));
  source = source.replace(INLINE, (whole, bracket, dollar) => save(whole, bracket ?? dollar, false));
  source = source
    .replaceAll("\\[", "&#92;[")
    .replaceAll("\\]", "&#92;]")
    .replaceAll("\\(", "&#92;(")
    .replaceAll("\\)", "&#92;)");
  source = source.replace(new RegExp(`${prefix}CODE(\\d+)TOKEN`, "g"), (_whole, index) => code[Number(index)] ?? "");
  return { markdown: source, formulas };
}

export function insertMath(holder: HTMLElement, formulas: Formula[], document: Document): void {
  if (!formulas.length) return;
  const byMarker = new Map(formulas.map((formula) => [formula.marker, formula]));
  const matcher = new RegExp(formulas.map((formula) => formula.marker).join("|"), "g");
  const showText = document.defaultView?.NodeFilter.SHOW_TEXT ?? 4;
  const walker = document.createTreeWalker(holder, showText);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  for (const node of nodes) {
    if (node.parentElement?.closest("pre, code")) continue;
    const matches = [...node.data.matchAll(matcher)];
    if (!matches.length) continue;
    const only = matches.length === 1 ? byMarker.get(matches[0]![0]) : undefined;
    if (only?.displayMode && node.parentElement?.tagName === "P" && node.data.trim() === only.marker) {
      node.parentElement.replaceWith(renderFormula(only, document));
      continue;
    }

    const fragment = document.createDocumentFragment();
    let offset = 0;
    for (const match of matches) {
      const index = match.index ?? 0;
      fragment.append(node.data.slice(offset, index));
      const formula = byMarker.get(match[0]);
      if (formula) fragment.append(renderFormula(formula, document));
      offset = index + match[0].length;
    }
    fragment.append(node.data.slice(offset));
    node.replaceWith(fragment);
  }
}

function renderFormula(formula: Formula, document: Document): HTMLElement {
  const wrapper = document.createElement(formula.displayMode ? "div" : "span");
  wrapper.className = formula.displayMode ? "math-display" : "math-inline";
  try {
    wrapper.innerHTML = katex.renderToString(formula.tex, {
      displayMode: formula.displayMode,
      throwOnError: true,
      strict: "ignore",
      trust: false,
    });
  } catch {
    wrapper.classList.add("math-fallback");
    wrapper.textContent = formula.source;
  }
  return wrapper;
}
