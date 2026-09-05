import { afterEach, describe, expect, it, vi } from "vitest";
import { SidePanel } from "../src/content/ui/side-panel";
import { renderMarkdown } from "../src/content/ui/markdown";
import type { QuoteReference, SideMessage } from "../src/shared/types";

const quote: QuoteReference = { text: "selected words", sourceRole: "assistant", sourceMessageIndex: 0 };
const messages: SideMessage[] = [{ id: "one", role: "assistant", content: "**saved**", status: "incomplete", createdAt: "2026-01-01" }];

describe("side panel", () => {
  afterEach(() => { document.querySelectorAll("[data-side-chat-host]").forEach((node) => node.remove()); document.body.innerHTML = ""; document.body.style.marginRight = ""; vi.restoreAllMocks(); });

  it("opens a quote without sending, then submits the exact explicit payload", () => {
    const onSend = vi.fn();
    const panel = new SidePanel(document, { onSend });
    const host = document.querySelector<HTMLElement>("[data-side-chat-host]")!;
    expect(host.style.display).toBe("none");
    panel.setConversation("conversation", []);
    panel.open(quote);
    expect(host.style.display).toBe("");
    const root = host.shadowRoot!;
    expect(root.textContent).toContain("selected words");
    expect(onSend).not.toHaveBeenCalled();
    const textarea = root.querySelector<HTMLTextAreaElement>("textarea")!;
    textarea.value = "  What does this mean?  ";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    root.querySelector<HTMLFormElement>("form")!.requestSubmit();
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith({ question: "What does this mean?", quote, compressOldContext: false });
    panel.destroy();
  });

  it("allows a follow-up without selecting text after restoring history", () => {
    const onSend = vi.fn();
    const panel = new SidePanel(document, { onSend });
    panel.setConversation("c", []);
    panel.setMessages(messages, true);
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    root.querySelector<HTMLButtonElement>("[data-action=restore]")!.click();
    const input = root.querySelector<HTMLTextAreaElement>("textarea")!;
    expect(input.disabled).toBe(false);
    expect(root.querySelector<HTMLButtonElement>("[data-action=send]")!.disabled).toBe(true);
    input.value = "  能再举个例子吗？  ";
    input.dispatchEvent(new Event("input"));
    expect(root.querySelector<HTMLButtonElement>("[data-action=send]")!.disabled).toBe(false);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    expect(onSend).toHaveBeenCalledWith({ question: "能再举个例子吗？", compressOldContext: false });
    expect(root.querySelector("[data-pending-message] .quote")).toBeNull();
    expect(root.querySelector<HTMLTextAreaElement>("textarea")!.disabled).toBe(true);
    panel.destroy();
  });

  it("consumes a quote after completion and allows an unquoted follow-up and retry", () => {
    const onSend = vi.fn();
    const panel = new SidePanel(document, { onSend });
    panel.setConversation("c", []); panel.open(quote);
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    const input = root.querySelector<HTMLTextAreaElement>("textarea")!;
    input.value = "解释一下"; input.dispatchEvent(new Event("input"));
    root.querySelector<HTMLFormElement>("form")!.requestSubmit();
    panel.setAccepted();
    panel.complete([
      { id: "u", role: "user", content: "解释一下", quote, status: "complete", createdAt: "" },
      ...messages,
    ]);
    expect(root.querySelector("[data-active-quote]")).toBeNull();
    expect(root.querySelector(".message.user .quote")).not.toBeNull();
    const followUp = root.querySelector<HTMLTextAreaElement>("textarea")!;
    expect(followUp.disabled).toBe(false);
    followUp.value = "继续解释"; followUp.dispatchEvent(new Event("input"));
    root.querySelector<HTMLButtonElement>("[data-action=send]")!.click();
    expect(onSend).toHaveBeenLastCalledWith({ question: "继续解释", compressOldContext: false });
    panel.setError({ message: "连接中断", retryable: true });
    root.querySelector<HTMLButtonElement>("[data-action=retry]")!.click();
    expect(onSend).toHaveBeenLastCalledWith({ question: "继续解释", compressOldContext: false });
    expect(onSend).toHaveBeenCalledTimes(3);
    panel.destroy();
  });

  it("loads the packaged KaTeX stylesheet inside the shadow root", () => {
    const panel = new SidePanel(document, { onSend: vi.fn() });
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    expect(root.querySelector<HTMLLinkElement>('link[data-katex-style]')?.href)
      .toContain("katex/katex.min.css");
    panel.destroy();
  });

  it("sends with Enter but leaves Shift+Enter and IME confirmation alone", () => {
    const onSend = vi.fn(); const panel = new SidePanel(document, { onSend });
    panel.setConversation("c", []); panel.open(quote);
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    const input = root.querySelector<HTMLTextAreaElement>("textarea")!;
    input.value = "我的问题"; input.dispatchEvent(new Event("input"));
    for (const modifiers of [{ shiftKey: true }, { isComposing: true }, { keyCode: 229 }]) {
      const event = new KeyboardEvent("keydown", { key: "Enter", cancelable: true, ...modifiers });
      input.dispatchEvent(event); expect(event.defaultPrevented).toBe(false);
    }
    expect(onSend).not.toHaveBeenCalled();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ question: "我的问题" }));
    panel.destroy();
  });

  it("minimizes at the same top-left corner and animates both directions", () => {
    const panel = new SidePanel(document, { onSend: vi.fn() });
    panel.setConversation("c", []); panel.open(quote);
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    const expanded = root.querySelector<HTMLElement>(".panel")!;
    const position = { left: expanded.style.left, top: expanded.style.top };
    panel.minimize();
    const bar = root.querySelector<HTMLElement>("[data-minimized-bar]")!;
    expect({ left: bar.style.left, top: bar.style.top }).toEqual(position);
    bar.click();
    const restored = root.querySelector<HTMLElement>(".panel")!;
    expect({ left: restored.style.left, top: restored.style.top }).toEqual(position);
    panel.destroy();
  });

  it("uses Chinese ChatGPT-style message and composer structure", () => {
    const panel = new SidePanel(document, { onSend: vi.fn() });
    panel.setConversation("c", [
      { id: "u", role: "user", content: "什么是鞅？", status: "complete", createdAt: "" },
      { id: "a", role: "assistant", content: "公平的动态预测。", status: "complete", createdAt: "" },
    ]);
    panel.open(quote, { capturedMessages: 5, endpointOrigin: "https://api.deepseek.com", model: "deepseek-v4-flash", contextWindowTokens: 1_000_000 });
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    expect(root.textContent).toContain("侧边对话");
    expect(root.textContent).toContain("已读取 5 条消息");
    expect(root.querySelector(".message.user > .message-content")).toBeTruthy();
    expect(root.querySelector(".message.assistant > .message-content")).toBeTruthy();
    expect(root.querySelector(".composer")).toBeTruthy();
    expect(root.querySelector("textarea")?.getAttribute("placeholder")).toBe("针对所选内容提问……");
    expect(root.querySelector("[data-action=send]")?.getAttribute("aria-label")).toBe("发送");
    expect(root.textContent).not.toMatch(/Side chat|Clear|Close|Send|Generating|Incomplete/);
    panel.destroy();
  });

  it("keeps stored turns chronological and shows each question before its quote", () => {
    const panel = new SidePanel(document, { onSend: vi.fn() });
    panel.setConversation("c", [
      { id: "u1", role: "user", content: "第一个问题", quote: { ...quote, text: "第一个引用" }, status: "complete", createdAt: "" },
      { id: "a1", role: "assistant", content: "第一个回答", status: "complete", createdAt: "" },
      { id: "u2", role: "user", content: "第二个问题", quote: { ...quote, text: "第二个引用" }, status: "complete", createdAt: "" },
      { id: "a2", role: "assistant", content: "第二个回答", status: "complete", createdAt: "" },
    ]);
    panel.open(quote);
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    const rendered = Array.from(root.querySelectorAll<HTMLElement>(".messages > .message"));
    expect(rendered.map((node) => node.textContent?.replace(/\s+/g, ""))).toEqual([
      "第一个问题引用内容第一个引用",
      "第一个回答",
      "第二个问题引用内容第二个引用",
      "第二个回答",
    ]);
    expect(Array.from(rendered[0]!.children).map((node) => node.className)).toEqual(["message-content", "quote"]);
    panel.destroy();
  });

  it("keeps a fresh quote by the composer and shows the submitted question immediately", () => {
    const panel = new SidePanel(document, { onSend: vi.fn() });
    panel.setConversation("c", [
      { id: "u", role: "user", content: "之前的问题", status: "complete", createdAt: "" },
      { id: "a", role: "assistant", content: "之前的回答", status: "complete", createdAt: "" },
    ]);
    panel.open(quote);
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    expect(root.querySelector(".messages")!.textContent).not.toContain("selected words");
    expect(root.querySelector("[data-active-quote]")?.textContent).toContain("selected words");
    expect(root.querySelector(".messages")!.compareDocumentPosition(root.querySelector("[data-active-quote]")!))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(root.querySelector("textarea")?.getAttribute("aria-describedby"))
      .toBe(root.querySelector("[data-active-quote]")?.id);

    const textarea = root.querySelector<HTMLTextAreaElement>("textarea")!;
    textarea.value = "现在的问题";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    root.querySelector<HTMLFormElement>("form")!.requestSubmit();

    const rendered = Array.from(root.querySelectorAll<HTMLElement>(".messages > .message"));
    expect(rendered.map((node) => node.textContent?.replace(/\s+/g, ""))).toEqual([
      "之前的问题",
      "之前的回答",
      "现在的问题引用内容selectedwords",
    ]);
    expect(root.querySelector("[data-active-quote]")).toBeNull();
    panel.setAccepted();
    expect(root.querySelector(".messages > .message:last-child")?.textContent?.replace(/\s+/g, ""))
      .toBe("现在的问题引用内容selectedwords");
    panel.destroy();
  });

  it("shows one current question and quote through streaming, retry, and completion", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1; });
    const onSend = vi.fn();
    const panel = new SidePanel(document, { onSend });
    const previous: SideMessage[] = [
      { id: "u1", role: "user", content: "旧问题", status: "complete", createdAt: "" },
      { id: "a1", role: "assistant", content: "旧回答", status: "complete", createdAt: "" },
    ];
    panel.setConversation("c", previous);
    panel.open(quote);
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    const countCurrent = () => Array.from(root.querySelectorAll(".messages .message.user .message-content"))
      .filter((node) => node.textContent?.includes("当前问题")).length;
    const countQuote = () => Array.from(root.querySelectorAll(".messages .quote-content"))
      .filter((node) => node.textContent === quote.text).length;
    const input = root.querySelector<HTMLTextAreaElement>("textarea")!;
    input.value = "当前问题";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    root.querySelector<HTMLFormElement>("form")!.requestSubmit();
    expect(countCurrent()).toBe(1); expect(countQuote()).toBe(1);

    panel.setAccepted();
    panel.appendDelta("旧的局部回答");
    expect(countCurrent()).toBe(1); expect(countQuote()).toBe(1);
    panel.setError({ message: "连接中断", retryable: true });
    expect(countCurrent()).toBe(1); expect(countQuote()).toBe(1);
    root.querySelector<HTMLButtonElement>("[data-action=retry]")!.click();
    expect(root.textContent).not.toContain("旧的局部回答");
    panel.appendDelta("最终回答");

    panel.complete([
      ...previous,
      { id: "u2", role: "user", content: "当前问题", quote, status: "complete", createdAt: "" },
      { id: "a2", role: "assistant", content: "最终回答", status: "complete", createdAt: "" },
    ]);
    expect(countCurrent()).toBe(1); expect(countQuote()).toBe(1);
    expect(root.querySelector("[data-pending-message]")).toBeNull();
    expect(Array.from(root.querySelectorAll<HTMLElement>(".messages > .message")).slice(-2).map((node) => node.textContent?.replace(/\s+/g, "")))
      .toEqual(["当前问题引用内容selectedwords", "最终回答"]);
    expect(onSend).toHaveBeenCalledTimes(2);
    panel.destroy();
  });

  it("shows the captured boundary, destination, model, limit, and accepted token estimate", () => {
    const panel = new SidePanel(document, { onSend: vi.fn() });
    panel.setConversation("conversation", []);
    panel.open(quote, { capturedMessages: 7, endpointOrigin: "https://api.example.com", model: "model-a", contextWindowTokens: 128000 });
    let text = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.textContent ?? "";
    expect(text).toContain("已读取 7 条消息"); expect(text).toContain("https://api.example.com"); expect(text).toContain("model-a"); expect(text).toContain("128,000");
    panel.setAccepted(2345);
    text = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.textContent ?? "";
    expect(text).toContain("2,345");
    panel.destroy();
  });

  it("offers content-free diagnostics for an uncertain extraction", () => {
    const panel = new SidePanel(document, { onSend: vi.fn() });
    panel.setConversation("conversation", []); panel.open(quote);
    panel.setExtractionError(2, true);
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    expect(root.textContent).toContain("2 条消息"); expect(root.querySelector("[data-action=copy-diagnostics]")).toBeTruthy();
    expect(root.textContent).not.toContain("selected words");
    panel.destroy();
  });

  it("hides on conversation change, then exposes loaded history as a minimized bar", () => {
    const panel = new SidePanel(document, { onSend: vi.fn() });
    panel.setConversation("one", messages); panel.open(quote); panel.setError({ message: "old error", retryable: true });
    panel.setConversation("two", []);
    const host = document.querySelector<HTMLElement>("[data-side-chat-host]")!;
    expect(host.style.display).toBe("none");
    panel.setMessages(messages, true);
    expect(host.style.display).toBe("");
    expect(host.shadowRoot!.querySelector("[data-minimized-bar]")?.textContent).toContain("侧边对话");
    expect(host.shadowRoot!.querySelector(".panel")).toBeNull();
    host.shadowRoot!.querySelector<HTMLButtonElement>("[data-minimized-bar]")!.click();
    expect(host.shadowRoot!.querySelector(".panel")?.textContent).toContain("saved");
    expect(host.shadowRoot!.textContent).not.toContain("old error");
    panel.destroy();
  });

  it("does not hide a newly opened draft when history finishes loading", () => {
    const panel = new SidePanel(document, { onSend: vi.fn() });
    panel.setConversation("c", []); panel.open(quote);
    panel.setMessages([], true);
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    expect(root.querySelector("textarea")).toBeTruthy();
    panel.minimize(); panel.setMessages([], true);
    expect(root.querySelector("[data-minimized-bar]")).toBeTruthy();
    panel.destroy();
  });

  it("sanitizes rendered markdown and safe-links it", () => {
    const html = renderMarkdown("[bad](javascript:alert(1)) <img onerror=alert(1)><iframe></iframe><video></video><svg><a></a></svg><form><input autofocus><button>bad</button></form>", document);
    expect(html).not.toMatch(/javascript:|onerror|iframe|video|svg|form|input|button|autofocus/i);
  });

  it("keeps safe links but strips media, SVG, and form controls", () => {
    const html = renderMarkdown("[safe](https://example.com) <video></video><svg></svg><form><input autofocus><button>x</button></form>", document);
    expect(html).toContain('target="_blank"'); expect(html).toContain('rel="noopener noreferrer"'); expect(html).not.toMatch(/video|svg|form|input|button|autofocus/i);
  });

  it("renders inline and display LaTeX with all supported delimiters", () => {
    const html = renderMarkdown([
      String.raw`inline \(x^2\) and $y_1$`,
      String.raw`\[\mathbb E[X\mid\mathcal F]\]`,
      String.raw`$$\sum_{i=1}^n i$$`,
    ].join("\n\n"), document);
    const holder = document.createElement("div");
    holder.innerHTML = html;
    expect(holder.querySelectorAll(".katex")).toHaveLength(4);
    expect(holder.querySelectorAll(".katex-display")).toHaveLength(2);
    expect(holder.textContent).toContain("E");
  });

  it("leaves math delimiters in code and incomplete formulas as text", () => {
    const html = renderMarkdown([
      "`\\(not math\\)`",
      "```txt\n\\[still not math\\]\n```",
      String.raw`unfinished \[x + 1`,
    ].join("\n\n"), document);
    const holder = document.createElement("div");
    holder.innerHTML = html;
    expect(holder.querySelectorAll(".katex")).toHaveLength(0);
    expect(holder.textContent).toContain(String.raw`\(not math\)`);
    expect(holder.textContent).toContain(String.raw`\[still not math\]`);
    expect(holder.textContent).toContain(String.raw`unfinished \[x + 1`);
  });

  it("falls back to escaped source for invalid LaTeX without weakening HTML sanitizing", () => {
    const html = renderMarkdown(String.raw`\[\definitelyUnknown{<img src=x onerror=alert(1)>}\]`, document);
    const holder = document.createElement("div");
    holder.innerHTML = html;
    expect(holder.querySelector(".math-fallback")).toBeTruthy();
    expect(holder.querySelector("img")).toBeNull();
    expect(holder.querySelector("[onerror], script")).toBeNull();
    expect(holder.textContent).toContain(String.raw`\definitelyUnknown{<img src=x onerror=alert(1)>}`);
  });

  it("keeps unfinished code fences and marker-like user text verbatim", () => {
    const holder = document.createElement("div");
    holder.innerHTML = renderMarkdown("SIDECHATCODE0TOKEN SIDECHATFORMULA0TOKEN\n\n```tex\n$raw$\n\\[raw\\]", document);
    expect(holder.querySelector(".katex")).toBeNull();
    expect(holder.textContent).toContain("SIDECHATCODE0TOKEN SIDECHATFORMULA0TOKEN");
    expect(holder.querySelector("pre code")?.textContent).toContain("$raw$");
    expect(holder.querySelector("pre code")?.textContent).toContain(String.raw`\[raw\]`);
  });

  it("does not treat multiline code spans or indented code as math", () => {
    const holder = document.createElement("div");
    holder.innerHTML = renderMarkdown("``line one\n$raw$ and `tick`\nline three``\n\n    \\[raw\\]\n    $raw$", document);
    expect(holder.querySelector(".katex")).toBeNull();
    expect(holder.querySelectorAll("code")).toHaveLength(2);
    expect(holder.textContent).not.toContain("SIDECHAT");
    expect(holder.textContent).toContain("$raw$");
  });

  it("keeps draft before acceptance and retries the original payload once", () => {
    const onSend = vi.fn();
    const panel = new SidePanel(document, { onSend });
    panel.setConversation("c", []); panel.open(quote);
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    const textarea = root.querySelector<HTMLTextAreaElement>("textarea")!;
    textarea.value = "draft"; textarea.dispatchEvent(new Event("input", { bubbles: true }));
    root.querySelector<HTMLFormElement>("form")!.requestSubmit();
    expect(textarea.value).toBe("draft");
    panel.setError({ message: "try again", retryable: true });
    root.querySelector<HTMLButtonElement>("[data-action=retry]")!.click();
    expect(onSend).toHaveBeenLastCalledWith({ question: "draft", quote, compressOldContext: false });
    expect(onSend).toHaveBeenCalledTimes(2);
    panel.destroy();
  });

  it("does not replace an active quote, but clears stale retry when a new quote opens", () => {
    const quoteB = { ...quote, text: "second" }; const onSend = vi.fn(); const panel = new SidePanel(document, { onSend }); panel.setConversation("c", []); panel.open(quote);
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!; const input = root.querySelector<HTMLTextAreaElement>("textarea")!; input.value = "ask"; input.dispatchEvent(new Event("input")); root.querySelector<HTMLFormElement>("form")!.requestSubmit(); panel.open(quoteB); expect(root.textContent).toContain("selected words");
    panel.setError({ message: "retry", retryable: true }); root.querySelector<HTMLButtonElement>("[data-action=retry]")!.click(); expect(onSend).toHaveBeenLastCalledWith(expect.objectContaining({ quote })); panel.setError({ message: "retry", retryable: true }); panel.open(quoteB); expect(root.textContent).toContain("second"); expect(root.querySelector("[data-action=retry]")).toBeNull(); panel.destroy();
  });

  it("replaces partial streaming output when retry starts", () => {
    const panel = new SidePanel(document, { onSend: vi.fn() });
    panel.setConversation("c", []); panel.open(quote);
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    const input = root.querySelector<HTMLTextAreaElement>("textarea")!; input.value = "retry me"; input.dispatchEvent(new Event("input")); root.querySelector<HTMLFormElement>("form")!.requestSubmit();
    panel.appendDelta("old partial");
    panel.setError({ message: "retry", retryable: true });
    document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.querySelector<HTMLButtonElement>("[data-action=retry]")!.click();
    expect(document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.textContent).not.toContain("old partial");
    panel.destroy();
  });

  it("handles separately synchronous animation-frame deltas", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1; });
    const panel = new SidePanel(document, { onSend: vi.fn() }); panel.setConversation("c", []); panel.open(quote); panel.appendDelta("A"); panel.appendDelta("B");
    expect(document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.textContent).toContain("AB"); panel.destroy();
  });

  it("preserves focused textarea across coalesced streaming updates", () => {
    let frame: FrameRequestCallback | undefined; const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frame = callback; return 7; });
    const panel = new SidePanel(document, { onSend: vi.fn() }); panel.setConversation("c", []); panel.open(quote); const textarea = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.querySelector<HTMLTextAreaElement>("textarea")!; textarea.focus(); panel.appendDelta("A"); panel.appendDelta("B");
    expect(raf).toHaveBeenCalledTimes(1); expect(document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.querySelector("textarea")).toBe(textarea); frame?.(0); expect(document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.textContent).toContain("AB"); panel.destroy();
  });

  it("minimizes without changing the page margin, then restores the same window state", () => {
    document.body.style.marginRight = "17px";
    const panel = new SidePanel(document, { onSend: vi.fn() });
    panel.setConversation("c", messages); panel.open(quote);
    const host = document.querySelector<HTMLElement>("[data-side-chat-host]")!;
    const draft = host.shadowRoot!.querySelector<HTMLTextAreaElement>("textarea")!; draft.value = "保留草稿"; draft.dispatchEvent(new Event("input"));
    expect(host.shadowRoot!.textContent).toContain("未完成");
    expect(document.body.style.marginRight).toBe("17px");
    host.shadowRoot!.querySelector<HTMLButtonElement>("[data-action=minimize]")!.click();
    expect(host.style.display).toBe("");
    expect(host.shadowRoot!.querySelector(".panel")).toBeNull();
    expect(host.shadowRoot!.querySelector("[data-minimized-bar]")).toBeTruthy();
    expect(document.body.style.marginRight).toBe("17px");
    host.shadowRoot!.querySelector<HTMLButtonElement>("[data-minimized-bar]")!.click();
    expect(host.shadowRoot!.textContent).toContain("未完成");
    expect(host.shadowRoot!.textContent).toContain("selected words");
    expect(host.shadowRoot!.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe("保留草稿");
    panel.destroy();
  });

  it("does not mutate an absent or important page margin", () => {
    const panel = new SidePanel(document, { onSend: vi.fn() }); panel.setConversation("c", []); panel.open(quote); expect(document.body.style.getPropertyValue("margin-right")).toBe("");
    panel.minimize(); document.body.style.setProperty("margin-right", "17px", "important"); panel.open(quote); panel.minimize(); expect(document.body.style.getPropertyValue("margin-right")).toBe("17px"); expect(document.body.style.getPropertyPriority("margin-right")).toBe("important"); panel.destroy();
  });

  it("resizes from the bottom-right while preserving the top-left corner", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 }); Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
    const onGeometryChange = vi.fn(); const panel = new SidePanel(document, { onSend: vi.fn(), onGeometryChange });
    panel.setGeometry({ width: 420, height: 560, right: 40, bottom: 30 });
    panel.setConversation("c", []); panel.open(quote);
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    root.querySelector<HTMLElement>("[data-resize-handle]")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 100, clientY: 100 }));
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: 50, clientY: 60 }));
    document.dispatchEvent(new PointerEvent("pointerup", { clientX: 50, clientY: 60 }));
    expect(onGeometryChange).toHaveBeenCalledTimes(1);
    expect(onGeometryChange).toHaveBeenCalledWith({ width: 370, height: 520, right: 90, bottom: 70 });
    panel.destroy();
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: 0, clientY: 0 }));
    expect(onGeometryChange).toHaveBeenCalledTimes(1);
  });

  it("reclamps the whole geometry on viewport shrink and ends pointercancel once", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1800 }); Object.defineProperty(window, "innerHeight", { configurable: true, value: 1200 }); const onGeometryChange = vi.fn(); const panel = new SidePanel(document, { onSend: vi.fn(), onGeometryChange }); panel.setGeometry({ width: 900, height: 900, right: 200, bottom: 150 }); panel.setConversation("c", []); panel.open(quote);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 700 }); Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 }); window.dispatchEvent(new Event("resize")); const handle = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.querySelector<HTMLElement>("[data-resize-handle]")!; expect(handle.getAttribute("aria-valuenow")).toBe("676"); expect(handle.getAttribute("aria-valuetext")).toContain("576");
    handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 300, clientY: 100 })); document.dispatchEvent(new PointerEvent("pointercancel")); document.dispatchEvent(new PointerEvent("pointermove", { clientX: 0, clientY: 0 })); expect(onGeometryChange).toHaveBeenCalledTimes(1); panel.destroy();
  });

  it("resizes width and height with keyboard-accessible separator controls", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 }); Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
    const onGeometryChange = vi.fn(); const panel = new SidePanel(document, { onSend: vi.fn(), onGeometryChange });
    panel.setConversation("c", []); panel.open(quote);
    const handle = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.querySelector<HTMLElement>("[data-resize-handle]")!;
    expect(handle.getAttribute("role")).toBe("separator");
    expect(handle.tabIndex).toBe(0);
    handle.focus(); const initial = handle.getAttribute("aria-valuenow");
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.activeElement).toBe(handle);
    expect(handle.getAttribute("aria-valuenow")).not.toBe(initial);
    expect(handle.getAttribute("aria-valuetext")).toContain("544");
    expect(onGeometryChange).toHaveBeenCalledTimes(2);
    panel.destroy();
  });

  it("drags the floating window by its title bar and persists the final position", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 }); Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
    const onGeometryChange = vi.fn(); const panel = new SidePanel(document, { onSend: vi.fn(), onGeometryChange }); panel.setGeometry({ width: 420, height: 560, right: 100, bottom: 80 }); panel.setConversation("c", []); panel.open(quote);
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    root.querySelector<HTMLElement>("[data-drag-handle]")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 100, clientY: 100 }));
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: 140, clientY: 130 }));
    document.dispatchEvent(new PointerEvent("pointerup", { clientX: 140, clientY: 130 }));
    expect(onGeometryChange).toHaveBeenCalledWith({ width: 420, height: 560, right: 60, bottom: 50 });
    const floating = root.querySelector<HTMLElement>(".panel")!;
    expect(floating.style.getPropertyValue("--side-chat-right")).toBe("60px");
    expect(floating.style.getPropertyValue("--side-chat-bottom")).toBe("50px");
    panel.destroy();
  });

  it("drags the minimized bar without restoring, then restores on a fresh click", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 }); Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
    const onGeometryChange = vi.fn(); const panel = new SidePanel(document, { onSend: vi.fn(), onGeometryChange });
    panel.setGeometry({ width: 420, height: 560, right: 100, bottom: 80 }); panel.open(quote); panel.minimize();
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    const bar = root.querySelector<HTMLElement>("[data-minimized-bar]")!;
    bar.firstElementChild!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 700, clientY: 280 }));
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: 740, clientY: 310 }));
    document.dispatchEvent(new PointerEvent("pointerup"));
    bar.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(root.querySelector(".panel")).toBeNull();
    expect(bar.style.left).toBe("720px"); expect(bar.style.top).toBe("290px");
    expect(onGeometryChange).toHaveBeenCalledWith({ width: 420, height: 560, right: 60, bottom: 50 });
    bar.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 740, clientY: 310 }));
    document.dispatchEvent(new PointerEvent("pointerup"));
    bar.click();
    expect(root.querySelector<HTMLElement>(".panel")!.style.left).toBe("720px");
    panel.destroy();
  });

  it("uses the bar dimensions at viewport edges and clamps the expanded window on restore", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 }); Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
    const panel = new SidePanel(document, { onSend: vi.fn() }); panel.open(quote); panel.minimize();
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    const bar = root.querySelector<HTMLElement>("[data-minimized-bar]")!;
    bar.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 100, clientY: 100 }));
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: 2000, clientY: 2000 }));
    document.dispatchEvent(new PointerEvent("pointerup"));
    expect(bar.style.left).toBe("1008px"); expect(bar.style.top).toBe("844px");
    window.dispatchEvent(new Event("resize"));
    expect(bar.style.left).toBe("1008px"); expect(bar.style.top).toBe("844px");
    bar.click();
    const expanded = root.querySelector<HTMLElement>(".panel")!;
    expect(expanded.style.left).toBe("768px"); expect(expanded.style.top).toBe("328px");
    panel.destroy();
  });

  it("opens embedded settings and returns to the unchanged conversation", () => {
    vi.spyOn(HTMLIFrameElement.prototype, "src", "set").mockImplementation(function (this: HTMLIFrameElement, value: string) { this.dataset.testSrc = value; });
    const onSettingsClose = vi.fn();
    const panel = new SidePanel(document, { onSend: vi.fn(), onSettingsClose }); panel.open(quote);
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    root.querySelector<HTMLButtonElement>("[data-action=settings]")!.click();
    expect(root.querySelector("iframe")?.dataset.testSrc).toContain("options.html?embedded=1");
    root.querySelector<HTMLButtonElement>("[data-action=settings]")!.click();
    expect(root.querySelector("iframe")).toBeNull();
    expect(root.querySelector("[data-active-quote]")?.textContent).toContain(quote.text);
    expect(onSettingsClose).toHaveBeenCalledOnce(); panel.destroy();
  });

  it("keeps generation running while minimized and updates the bar when complete", () => {
    const panel = new SidePanel(document, { onSend: vi.fn() }); panel.setConversation("c", []); panel.open(quote); panel.setBusy(true); panel.appendDelta("局部回答"); panel.minimize();
    const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
    expect(root.querySelector("[data-minimized-bar]")?.textContent).toContain("正在生成…");
    root.querySelector<HTMLButtonElement>("[data-minimized-bar]")!.click();
    expect(root.querySelector(".panel")?.textContent).toContain("局部回答");
    panel.minimize();
    panel.complete(messages);
    expect(root.querySelector("[data-minimized-bar]")?.textContent).toContain("侧边对话");
    root.querySelector<HTMLButtonElement>("[data-minimized-bar]")!.click();
    expect(root.querySelector(".panel")?.textContent).toContain("saved");
    panel.destroy();
  });

  it("clears old conversation state when switched", () => {
    const panel = new SidePanel(document, { onSend: vi.fn() });
    panel.setConversation("one", messages); panel.open(quote);
    panel.setError({ message: "old", retryable: true });
    panel.setConversation(null, []);
    const host = document.querySelector<HTMLElement>("[data-side-chat-host]")!; const root = host.shadowRoot!;
    expect(host.style.display).toBe("none");
    expect(root.textContent).not.toContain("saved");
    expect(root.querySelector(".status")).toBeNull();
    expect(root.querySelector("form")).toBeNull();
    panel.destroy();
  });

  it("requires an exact reselected file count or explicitly continues without missing files", async () => {
    const panel = new SidePanel(document, { onSend: vi.fn() });
    const pending = panel.resolveMissingAttachments(["<img src=x>", "two.txt"]);
    const dialog = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.querySelector<HTMLDialogElement>("dialog")!;
    expect(dialog.textContent).toContain("<img src=x>");
    const input = dialog.querySelector<HTMLInputElement>("input[type=file]")!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["one"], "one.txt")] });
    dialog.querySelector<HTMLButtonElement>("[data-action=reselect-files]")!.click();
    expect(dialog.textContent).toContain("请选择 2 个文件");
    dialog.querySelector<HTMLButtonElement>("[data-action=continue-without-files]")!.click();
    await expect(pending).resolves.toBeNull();
    panel.destroy();
  });

  it("resolves a pending missing-file dialog on cancel and destroy", async () => {
    const panel = new SidePanel(document, { onSend: vi.fn() });
    const pending = panel.resolveMissingAttachments(["one.txt"]);
    const dialog = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.querySelector<HTMLDialogElement>("dialog")!;
    dialog.dispatchEvent(new Event("cancel"));
    await expect(pending).resolves.toBeUndefined();
    const pendingDestroy = panel.resolveMissingAttachments(["two.txt"]); panel.destroy();
    await expect(pendingDestroy).resolves.toBeUndefined();
  });

  it("returns an exact successful reselection and cancels a replaced resolver", async () => {
    const panel = new SidePanel(document, { onSend: vi.fn() });
    const replaced = panel.resolveMissingAttachments(["old.txt"]);
    const selected = panel.resolveMissingAttachments(["one.txt", "two.txt"]);
    await expect(replaced).resolves.toBeUndefined();
    const dialog = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.querySelector<HTMLDialogElement>("dialog")!;
    const files = [new File(["one"], "one.txt"), new File(["two"], "two.txt")];
    Object.defineProperty(dialog.querySelector<HTMLInputElement>("input[type=file]")!, "files", { configurable: true, value: files });
    dialog.querySelector<HTMLButtonElement>("[data-action=reselect-files]")!.click();
    await expect(selected).resolves.toEqual(files);
    panel.destroy();
  });

  it("settles a pending missing-file resolver when normal state rendering replaces the dialog", async () => {
    const panel = new SidePanel(document, { onSend: vi.fn() });
    const pending = panel.resolveMissingAttachments(["one.txt"]);
    panel.setConversation("other", []);
    await expect(pending).resolves.toBeUndefined();
    expect(document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!.querySelector("dialog")).toBeNull();
    panel.destroy();
  });
});
