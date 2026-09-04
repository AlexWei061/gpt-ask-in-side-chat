# Chinese ChatGPT-Style Side Panel and Math Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render common Markdown LaTeX in the side chat, restyle the panel to match ChatGPT web, and translate every user-visible extension surface into Chinese.

**Architecture:** Keep `marked` and DOMPurify as the untrusted Markdown boundary, extract math before Markdown parsing, then insert only local KaTeX output after sanitization. Keep the existing `SidePanel` state machine and Shadow DOM, changing only its presentation and copy; package KaTeX CSS/fonts as extension-owned static assets without adding network permissions.

**Tech Stack:** TypeScript, Chrome MV3, Shadow DOM, marked, DOMPurify, KaTeX 0.18.x, Vitest, Playwright, esbuild.

---

## File map

- Create `src/content/ui/math.ts`: protect code regions, identify math delimiters, and replace sanitized markers with trusted local KaTeX DOM.
- Modify `src/content/ui/markdown.ts`: preserve the current sanitizer and invoke the math pipeline around it.
- Modify `src/content/ui/side-panel.ts`: add the KaTeX stylesheet link, Chinese copy, ChatGPT-like composer/message markup, and accessible Chinese labels.
- Modify `src/content/ui/styles.ts`: implement the approved A visual direction and math overflow styles.
- Modify `src/shared/i18n.ts`: make selection/composer/extraction copy consistently Chinese.
- Modify `src/options/index.ts`, `public/options.html`, and `src/options/styles.css`: translate and visually align the settings page.
- Modify `src/content/index.ts`, `src/content/attachments.ts`, `src/background/provider.ts`, `src/background/chat-service.ts`, `src/background/index.ts`, `src/background/settings.ts`, and `src/background/permissions.ts`: translate user-visible runtime failures while preserving non-visible model prompts.
- Modify `scripts/build.mjs`, `scripts/package.mjs`, and `public/manifest.json`: package KaTeX CSS/fonts and declare only those static files as ChatGPT-accessible.
- Modify focused unit/E2E tests under `test/` and `e2e/side-chat.spec.ts`.

### Task 1: Add delimiter-safe KaTeX rendering

**Files:**
- Create: `src/content/ui/math.ts`
- Modify: `src/content/ui/markdown.ts`
- Test: `test/side-panel.test.ts`

- [ ] **Step 1: Write failing formula-rendering tests**

Add focused tests to `test/side-panel.test.ts` before installing or importing KaTeX:

```ts
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
  expect(html).not.toMatch(/onerror|<script/i);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run test/side-panel.test.ts
```

Expected: the new tests fail because no `.katex`, `.katex-display`, or `.math-fallback` nodes exist; the existing sanitization tests remain green.

- [ ] **Step 3: Install the local renderer**

Run:

```bash
npm install katex@^0.18.5
```

Expected: `package.json` and `package-lock.json` add `katex`; no CDN URL or runtime network loader is introduced.

- [ ] **Step 4: Implement the math boundary**

Create `src/content/ui/math.ts` with a small, testable pipeline:

```ts
import katex from "katex";

type Formula = { marker: string; source: string; tex: string; displayMode: boolean };
const CODE = /(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1|`+[^`\n]*`+/g;
const BLOCK = /\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$/g;
const INLINE = /\\\(([^\n]*?)\\\)|(?<!\\)\$(?!\$)([^$\n]+?)(?<!\\)\$/g;

export function extractMath(markdown: string): { markdown: string; formulas: Formula[] } {
  const code: string[] = [];
  const codeMarker = (index: number) => `SIDECHATCODE${index}TOKEN`;
  let source = markdown.replace(CODE, (value) => {
    const marker = codeMarker(code.length);
    code.push(value);
    return marker;
  });
  const formulas: Formula[] = [];
  const save = (whole: string, tex: string, displayMode: boolean) => {
    const marker = `SIDECHATFORMULA${formulas.length}TOKEN`;
    formulas.push({ marker, source: whole, tex: tex.trim(), displayMode });
    return displayMode ? `\n\n${marker}\n\n` : marker;
  };
  source = source.replace(BLOCK, (whole, bracket, dollar) => save(whole, bracket ?? dollar, true));
  source = source.replace(INLINE, (whole, bracket, dollar) => save(whole, bracket ?? dollar, false));
  source = source.replaceAll("\\[", "&#92;[").replaceAll("\\]", "&#92;]")
    .replaceAll("\\(", "&#92;(").replaceAll("\\)", "&#92;)");
  source = source.replace(/SIDECHATCODE(\d+)TOKEN/g, (_whole, index) => code[Number(index)] ?? "");
  return { markdown: source, formulas };
}

export function insertMath(holder: HTMLElement, formulas: Formula[], document: Document): void {
  const byMarker = new Map(formulas.map((formula) => [formula.marker, formula]));
  const matcher = /SIDECHATFORMULA\d+TOKEN/g;
  const showText = document.defaultView?.NodeFilter.SHOW_TEXT ?? 4;
  const walker = document.createTreeWalker(holder, showText);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
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
```

The block-only paragraph branch keeps the returned HTML structurally valid. Keep `trust: false`; never pass raw model HTML directly to KaTeX.

Update `src/content/ui/markdown.ts` so the order is exact:

```ts
const extracted = extractMath(markdown);
const html = DOMPurify.sanitize(marked.parse(extracted.markdown, { async: false }) as string, existingOptions);
const holder = document.createElement("div");
holder.innerHTML = html;
// Keep the existing dangerous-element, event-attribute, style, and URL cleanup here.
insertMath(holder, extracted.formulas, document);
return holder.innerHTML;
```

- [ ] **Step 5: Verify GREEN and commit**

Run:

```bash
npx vitest run test/side-panel.test.ts
npm run typecheck
git diff --check
```

Expected: all side-panel tests pass and TypeScript reports no errors.

Commit only the math/dependency files:

```bash
git add package.json package-lock.json src/content/ui/math.ts src/content/ui/markdown.ts test/side-panel.test.ts
git commit -m "feat: render side-chat math with KaTeX"
```

### Task 2: Package KaTeX CSS and fonts

**Files:**
- Modify: `scripts/build.mjs`
- Modify: `scripts/package.mjs`
- Modify: `public/manifest.json`
- Modify: `src/content/ui/side-panel.ts`
- Test: `test/manifest.test.ts`
- Test: `test/side-panel.test.ts`

- [ ] **Step 1: Write failing asset tests**

Extend `test/manifest.test.ts`:

```ts
it("packages local KaTeX styling and exposes it only on ChatGPT", async () => {
  const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
  await expect(readFile("dist/katex/katex.min.css", "utf8")).resolves.toContain("KaTeX");
  await expect(readFile("dist/katex/fonts/KaTeX_Main-Regular.woff2")).resolves.toBeTruthy();
  expect(manifest.web_accessible_resources).toContainEqual({
    resources: ["pdf.worker.min.mjs", "katex/katex.min.css", "katex/fonts/*.woff2"],
    matches: ["https://chatgpt.com/*"],
  });
});
```

Add to `test/side-panel.test.ts`:

```ts
it("loads the packaged KaTeX stylesheet inside the shadow root", () => {
  const panel = new SidePanel(document, { onSend: vi.fn() });
  const root = document.querySelector<HTMLElement>("[data-side-chat-host]")!.shadowRoot!;
  expect(root.querySelector<HTMLLinkElement>('link[data-katex-style]')?.href)
    .toContain("katex/katex.min.css");
  panel.destroy();
});
```

Give the test Chrome mock a deterministic `runtime.getURL`, such as `(path) => chrome-extension://test/${path}`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npx vitest run test/manifest.test.ts test/side-panel.test.ts
```

Expected: missing CSS/font files, missing manifest entries, and missing Shadow DOM stylesheet link.

- [ ] **Step 3: Copy production assets and load their stylesheet**

In `scripts/build.mjs`, resolve `katex/dist/katex.min.css`, copy it to `dist/katex/katex.min.css`, create `dist/katex/fonts`, and copy only `.woff2` files from `node_modules/katex/dist/fonts`. Import `readdir` from `node:fs/promises`; do not copy source maps, WOFF, or TTF fallbacks.

In `public/manifest.json`, change the existing resource entry to:

```json
{
  "resources": ["pdf.worker.min.mjs", "katex/katex.min.css", "katex/fonts/*.woff2"],
  "matches": ["https://chatgpt.com/*"]
}
```

In `scripts/package.mjs`, derive the exact expected `.woff2` filenames from `node_modules/katex/dist/fonts` and add `katex/katex.min.css` plus `katex/fonts/<name>` to `expectedFiles`. Keep the unexpected-file and source-map checks.

In `SidePanel.render()`, append a stylesheet link after the local component style:

```ts
const katexStyle = this.document.createElement("link");
katexStyle.rel = "stylesheet";
katexStyle.dataset.katexStyle = "true";
katexStyle.href = typeof chrome !== "undefined" && chrome.runtime?.getURL
  ? chrome.runtime.getURL("katex/katex.min.css")
  : "katex/katex.min.css";
this.root.append(style, katexStyle);
```

- [ ] **Step 4: Verify and commit**

Run:

```bash
npx vitest run test/manifest.test.ts test/side-panel.test.ts
npm run build
git diff --check
```

Expected: the tests pass and `dist/katex` contains CSS plus WOFF2 fonts.

Commit:

```bash
git add scripts/build.mjs scripts/package.mjs public/manifest.json src/content/ui/side-panel.ts test/manifest.test.ts test/side-panel.test.ts
git commit -m "build: package local KaTeX assets"
```

### Task 3: Implement the approved ChatGPT-native Chinese side panel

**Files:**
- Modify: `src/content/ui/side-panel.ts`
- Modify: `src/content/ui/styles.ts`
- Modify: `src/shared/i18n.ts`
- Test: `test/side-panel.test.ts`
- Test: `test/protocol.test.ts`

- [ ] **Step 1: Write failing structure and copy tests**

Add one behavior-focused side-panel test:

```ts
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
  expect(root.querySelector<HTMLButtonElement>("[data-action=send]")?.getAttribute("aria-label")).toBe("发送");
  expect(root.textContent).not.toMatch(/Side chat|Clear|Close|Send|Generating|Incomplete/);
  panel.destroy();
});
```

Update `test/protocol.test.ts` to expect the fixed Chinese strings independent of browser language:

```ts
expect(t("askInSideChat", "en-US")).toBe("在侧栏中提问");
expect(t("composerPlaceholder", "zh-CN")).toBe("针对所选内容提问……");
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npx vitest run test/side-panel.test.ts test/protocol.test.ts
```

Expected: English copy and the old card/composer structure make the new assertions fail.

- [ ] **Step 3: Change markup and copy without changing state behavior**

Use these exact Chinese UI strings in `side-panel.ts`:

- `侧边对话`, `清空`, `关闭`, `确认清空当前侧边对话记录吗？`
- `已读取 N 条消息 · 目标：ORIGIN · 模型：MODEL · 预计词元：USED / LIMIT`
- `尚未配置`, `发送时计算`, `正在生成……`, `未完成`
- `复制诊断信息`, `诊断信息已复制。`, `无法复制诊断信息。`, `重试`
- `针对所选内容提问……`, `仅在需要时压缩旧上下文；压缩后仅保留摘要，不保留原文。`, `发送`
- Resize and dialog accessibility labels must also be Chinese.

Give message content `className = "message-content"`. Restructure the form to:

```ts
const composer = this.document.createElement("div");
composer.className = "composer";
composer.append(textarea, send);
form.append(composer, controls);
```

Show the button glyph `↑` while passing `aria-label="发送"`; extend `button()` with an optional aria-label parameter rather than hiding visible text with CSS.

Replace `src/shared/i18n.ts` copy values so the selection action reads `在侧栏中提问` and the composer/extraction messages are always Chinese. Keep the existing function signature so callers and tests do not need a new abstraction.

- [ ] **Step 4: Apply the approved A styling**

In `styles.ts` retain fixed positioning, resize hit area, z-index, disabled states, and accessibility. Change only the presentation:

```css
:host { color:#ececec; font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif; }
.panel { background:#212121; border-left:1px solid #ffffff1a; box-shadow:-8px 0 24px #0006; }
header { height:52px; padding:0 14px; border-bottom:1px solid #ffffff12; }
.context-summary { color:#9b9b9b; border-bottom:1px solid #ffffff0d; }
.messages { padding:16px 14px; }
.message { margin:0 0 18px; padding:0; background:transparent; }
.message.user { display:flex; flex-direction:column; align-items:flex-end; }
.message.user > .message-content { max-width:88%; padding:9px 13px; background:#303030; border-radius:18px 18px 4px 18px; }
.message.assistant > .message-content { padding:0 4px; }
.quote { align-self:stretch; border-left:3px solid #10a37f; background:#ffffff09; border-radius:2px 9px 9px 2px; }
.math-display { overflow-x:auto; overflow-y:hidden; padding:8px 0; }
form { border-top:0; padding:10px 12px 13px; }
.composer { display:flex; align-items:flex-end; gap:8px; padding:7px 7px 7px 12px; background:#303030; border:1px solid #ffffff12; border-radius:24px; }
.composer textarea { min-height:34px; max-height:180px; padding:6px 2px; border:0; background:transparent; outline:0; }
.composer [data-action="send"] { width:32px; height:32px; padding:0; border-radius:50%; color:#212121; background:#fff; }
.controls { margin:7px 4px 0; color:#a8a8a8; }
```

- [ ] **Step 5: Verify behavior and commit**

Run:

```bash
npx vitest run test/side-panel.test.ts test/protocol.test.ts test/selection.test.ts test/content-index.test.ts
npm run typecheck
git diff --check
```

Expected: new UI tests and all existing focus, retry, clear, resize, navigation, and history tests pass.

Commit:

```bash
git add src/content/ui/side-panel.ts src/content/ui/styles.ts src/shared/i18n.ts test/side-panel.test.ts test/protocol.test.ts
git commit -m "feat: adopt Chinese ChatGPT-style side panel"
```

### Task 4: Translate settings and user-visible runtime failures

**Files:**
- Modify: `src/options/index.ts`
- Modify: `src/options/styles.css`
- Modify: `public/options.html`
- Modify: `public/manifest.json`
- Modify: `src/content/index.ts`
- Modify: `src/content/attachments.ts`
- Modify: `src/background/provider.ts`
- Modify: `src/background/chat-service.ts`
- Modify: `src/background/index.ts`
- Modify: `src/background/settings.ts`
- Modify: `src/background/permissions.ts`
- Test: `test/options.test.ts`
- Test: `test/content-index.test.ts`
- Test: `test/provider.test.ts`
- Test: `test/settings.test.ts`
- Test: `test/background-index.test.ts`
- Test: `test/manifest.test.ts`

- [ ] **Step 1: Update tests first to require Chinese output**

Change visible-copy assertions to exact Chinese, including:

```ts
expect(document.querySelector("h1")?.textContent).toBe("侧边对话助手");
expect(document.querySelector("#status")?.textContent).toBe("连接成功。");
expect(document.querySelector<HTMLInputElement>("#api-key")?.placeholder).toContain("已设置密钥");
expect(root.textContent).toContain("侧边对话连接意外中断");
expect(response).toHaveBeenCalledWith({
  ok: false,
  error: { code: "STORAGE_FAILED", message: "扩展无法完成请求。", retryable: false },
});
```

In `test/provider.test.ts` and `test/settings.test.ts`, preserve code/retryability assertions and replace English message regexes with the matching Chinese phrases. In `test/manifest.test.ts`, assert the Chinese manifest name, description, and action title.

- [ ] **Step 2: Run the affected tests and verify RED**

Run:

```bash
npx vitest run test/options.test.ts test/content-index.test.ts test/provider.test.ts test/settings.test.ts test/background-index.test.ts test/manifest.test.ts
```

Expected: failures are only English-versus-Chinese copy mismatches.

- [ ] **Step 3: Translate the options surface**

Use these settings labels and actions in `src/options/index.ts`:

- `侧边对话助手`, `使用前说明`, `我已了解并同意上述数据使用方式。`
- `接口地址（Base URL）`, `模型`, `上下文窗口（词元）`, `模型支持图片输入`
- `本次 Chrome 会话的 API 密钥`, `保存并授权接口访问`, `测试连接`
- `本地数据管理`, `忘记本次会话的 API 密钥`, `清空全部侧边对话记录`

Translate both disclosure paragraphs faithfully without changing their meaning. Translate every status, confirmation, placeholder, initialization, permission, and fallback error. Keep provider origins, model values, API, Base URL and Chrome as written.

Set `public/options.html` title to `侧边对话助手设置`. Update `options/styles.css` only enough to use the same neutral ChatGPT palette (`#212121`, `#2f2f2f`, `#ececec`, `#10a37f`) while retaining the current responsive form layout and clear destructive-button styling.

- [ ] **Step 4: Translate runtime errors without translating model prompts**

Translate all error/notice strings that can reach the side panel or settings page in the listed content/background files. Preserve:

- error codes and retryability;
- HTTP status numbers;
- API/model/Base URL terms;
- `compressionSystemPrompt`, request-builder system prompts, and provider test message `Reply with OK.` because they are sent to the model and are not interface copy;
- diagnostics JSON keys because they are machine-readable support data.

Representative mappings:

```text
Could not start the side-chat request. -> 无法启动侧边对话请求。
The side-chat connection closed unexpectedly. -> 侧边对话连接意外中断。
Could not reach the AI provider. -> 无法连接 AI 服务商。
The AI provider sent an invalid streaming response. -> AI 服务商返回了无效的流式响应。
Set an API key before sending a question. -> 请先设置 API 密钥再发送问题。
Provider context window must be an integer between 1024 and 10000000. -> 上下文窗口必须是 1024 到 10000000 之间的整数。
```

Set `public/manifest.json` visible metadata to:

```json
{
  "name": "侧边对话助手",
  "description": "针对 ChatGPT 对话中的选中内容，在可保留记录的侧栏中继续提问。",
  "action": { "default_title": "侧边对话助手" }
}
```

- [ ] **Step 5: Verify and commit**

Run:

```bash
npx vitest run test/options.test.ts test/content-index.test.ts test/provider.test.ts test/settings.test.ts test/background-index.test.ts test/manifest.test.ts
npm run typecheck
git diff --check
```

Expected: all affected tests pass with no changed protocol behavior.

Commit:

```bash
git add src/options/index.ts src/options/styles.css public/options.html public/manifest.json src/content/index.ts src/content/attachments.ts src/background/provider.ts src/background/chat-service.ts src/background/index.ts src/background/settings.ts src/background/permissions.ts test/options.test.ts test/content-index.test.ts test/provider.test.ts test/settings.test.ts test/background-index.test.ts test/manifest.test.ts
git commit -m "feat: translate extension interface to Chinese"
```

### Task 5: End-to-end and release verification

**Files:**
- Modify: `e2e/side-chat.spec.ts`
- Test: all tests and production package

- [ ] **Step 1: Make E2E require Chinese UI and rendered math**

Update the provider fixture to stream a response containing `String.raw` with both inline and display LaTeX. Change locators to `在侧栏中提问`, `发送`, and the Chinese options heading. After the response, assert:

```ts
await expect(panel.locator(".katex")).toHaveCount(2);
await expect(panel).toContainText("Side answer");
```

Keep the existing provider-request assertions and history-after-reload assertion.

- [ ] **Step 2: Run E2E and verify GREEN**

Run:

```bash
npm run e2e
```

Expected: one Playwright test passes with the loaded MV3 extension, Chinese UI, persisted history, and two rendered formulas.

- [ ] **Step 3: Run the complete release gate**

Run:

```bash
npm run typecheck
npm run test:run
npm run build
git diff --check
npm run package
```

Expected: all tests pass; the final `npm run package` rebuilds production `dist` after E2E and creates `release/side-chat-companion-0.1.0.zip` without E2E-only host permissions.

- [ ] **Step 4: Inspect production artifacts**

Run:

```bash
rg -n "api.example.test|test-key" dist release || true
shasum -a 256 release/side-chat-companion-0.1.0.zip
git status --short
```

Expected: no test endpoint/key is found; the checksum prints; only the pre-existing untracked `.DS_Store` remains plus the intended E2E change before commit.

- [ ] **Step 5: Commit E2E coverage**

```bash
git add e2e/side-chat.spec.ts
git commit -m "test: cover Chinese math side chat end to end"
```

- [ ] **Step 6: Reload and manually verify the real provider**

In `chrome://extensions`, reload the unpacked extension from `/Users/alex/Alex/chrome-extension/gpt-ask-in-side-chat/dist`, then refresh the ChatGPT conversation page so the old content script is replaced. Verify, without changing settings:

1. Select a sentence containing mathematics and open `在侧栏中提问`.
2. Confirm old history loads under the same ChatGPT conversation ID.
3. Send one explicit test question to the already configured DeepSeek endpoint.
4. Confirm the request is accepted, formulas appear as KaTeX, normal Markdown remains readable, and a response lasting over 30 seconds does not lose the service worker.
5. Confirm settings, errors, confirmation dialogs, attachment reselection, and side-panel actions are Chinese.

Do not keep service-worker DevTools open during the long-response check because that would invalidate the lifecycle test.
