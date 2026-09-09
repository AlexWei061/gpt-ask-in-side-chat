import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function configureProvider(optionsPage: Page, model = "test-model"): Promise<void> {
  await optionsPage.locator("#privacy").check();
  await optionsPage.locator("#base-url").fill("https://api.example.test/v1");
  await optionsPage.locator("#model").fill(model);
  await optionsPage.locator("#context-window").fill("128000");
  await optionsPage.locator("#api-key").fill("test-key");
  // The E2E build pre-grants this origin; Chrome's native permission prompt still needs manual testing.
  await optionsPage.getByRole("button", { name: "保存并授权接口访问" }).click();
  await expect(optionsPage.locator("#status")).toContainText("设置已保存");
  await optionsPage.getByRole("button", { name: "测试连接", exact: true }).click();
  await expect(optionsPage.locator("#status")).toContainText("连接成功");
}

test("side chat starts minimized, accepts replaceable selections, and restores quoted history with unquoted follow-ups", async () => {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "side-chat-e2e-"));
  let context: BrowserContext | undefined;
  let providerRequest: unknown;

  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${path.resolve("dist")}`,
        `--load-extension=${path.resolve("dist")}`,
      ],
    });
    const fixture = (await readFile("test/fixtures/chatgpt-page.html", "utf8"))
      .replaceAll("<article ", "<article><div ")
      .replaceAll("</article>", "</div></article>");
    await context.route("https://chatgpt.com/", (route) => route.fulfill({ contentType: "text/html", body: "<main><h1>New chat</h1></main>" }));
    await context.route("https://chatgpt.com/c/demo", (route) => route.fulfill({ contentType: "text/html", body: fixture }));
    await context.route("https://api.example.test/v1/chat/completions", async (route) => {
      providerRequest = route.request().postDataJSON();
      const answer = String.raw`Side answer：鞅是一个随信息更新的公平预测过程。

已知时刻 \(s\) 的信息，对未来的期望等于现在的值：

\[
\mathbb E[M_t\mid\mathcal F_s]
=
M_s,\qquad s\le t
\]

**直观理解**：新的信息可以改变预测，但在信息到来之前，预测不会自行偏移。`;
      await route.fulfill({
        contentType: "text/event-stream",
        body: 'data: {"choices":[{"delta":{"content":null,"reasoning_content":"private reasoning"}}]}\n\n' +
          `data: ${JSON.stringify({ choices: [{ delta: { content: answer, reasoning_content: null } }] })}\n\n` +
          'data: {"choices":[{"delta":{"content":null},"finish_reason":"stop"}]}\n\n' +
          "data: [DONE]\n\n",
      });
    });

    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).host;
    const optionsUrl = `chrome-extension://${extensionId}/options.html`;
    await expect.poll(() => context?.pages().some((candidate) => candidate.url() === optionsUrl)).toBe(true);
    const optionsPage = context.pages().find((candidate) => candidate.url() === optionsUrl)!;
    await optionsPage.waitForLoadState();
    await expect(optionsPage.getByRole("heading", { name: "使用前说明" })).toBeVisible();
    await expect(optionsPage.getByText(/划词时仅在本地检查来源并读取选中文字/)).toBeVisible();
    await optionsPage.screenshot({ animations: "disabled", path: test.info().outputPath("chinese-settings.png"), fullPage: true });
    for (const theme of ["dark", "light"] as const) {
      await optionsPage.emulateMedia({ colorScheme: theme });
      await expect(optionsPage.locator("html")).toHaveAttribute("data-side-chat-theme", theme);
      await optionsPage.screenshot({ animations: "disabled", path: test.info().outputPath(`settings-${theme}.png`), fullPage: true });
    }
    await configureProvider(optionsPage);
    await optionsPage.close();

    const page = await context.newPage();
    const panel = page.locator("[data-side-chat-host]");
    await page.goto("https://chatgpt.com/");
    await expect(panel.getByRole("button", { name: "打开侧边对话" })).toBeVisible();
    await expect(panel.locator(".panel")).toHaveCount(0);
    await panel.getByRole("button", { name: "打开侧边对话" }).click();
    await expect(panel.locator("textarea")).toBeVisible();
    await expect(panel.locator("textarea")).toBeDisabled();
    await expect(panel.getByRole("button", { name: "发送", exact: true })).toBeDisabled();
    await panel.getByRole("button", { name: "设置", exact: true }).click();
    await expect(panel.frameLocator("iframe").locator("#model")).toHaveValue("test-model");
    await panel.getByRole("button", { name: "返回对话" }).click();
    await expect(panel.getByRole("button", { name: "发送", exact: true })).toBeDisabled();

    await page.goto("https://chatgpt.com/c/demo");
    await page.emulateMedia({ colorScheme: "light" });
    await page.evaluate(() => document.documentElement.classList.add("light"));
    const pageMarginRight = await page.locator("body").evaluate((element) => getComputedStyle(element).marginRight);
    await expect(panel.getByRole("button", { name: "打开侧边对话" })).toBeVisible();
    await expect(panel.locator(".panel")).toHaveCount(0);
    await panel.getByRole("button", { name: "打开侧边对话" }).click();
    await expect(panel.locator("textarea")).toBeEnabled();
    await expect(panel.locator(".message")).toHaveCount(0);
    await expect(panel.locator("[data-active-quote]")).toHaveCount(0);
    const selectedText = page.locator("[data-message-author-role=assistant] p").first();
    await selectedText.selectText();

    await expect(panel.locator("textarea")).toBeVisible();
    await expect(panel.locator(".panel")).toHaveCSS("position", "fixed");
    await expect(panel.locator(".panel")).toHaveCSS("border-radius", "16px");
    await expect(page.locator("body")).toHaveCSS("margin-right", pageMarginRight);
    await expect(panel.locator("[data-active-quote]")).toContainText("Use a service worker.");
    await expect(page.getByRole("button", { name: "在侧栏中提问" })).toHaveCount(0);
    await panel.locator(".panel").screenshot({ animations: "disabled", path: test.info().outputPath("empty-panel-light.png") });
    await panel.locator("textarea").fill("Why?");
    await panel.getByRole("checkbox").check();
    await panel.getByRole("button", { name: "清除引用", exact: true }).click();
    await expect(panel.locator("[data-active-quote]")).toHaveCount(0);
    await expect(panel.locator("textarea")).toHaveValue("Why?");
    await expect(panel.getByRole("checkbox")).toBeChecked();
    await selectedText.selectText();
    await expect(panel.locator("[data-active-quote]")).toContainText("Use a service worker.");
    await page.locator("[data-message-author-role=user] p").selectText();
    await expect(panel.locator("[data-active-quote]")).toContainText("Explain this API.");
    await expect(panel.locator("[data-active-quote]")).not.toContainText("Use a service worker.");
    await selectedText.selectText();
    await expect(panel.locator("[data-active-quote]")).toContainText("Use a service worker.");
    await expect(panel.locator("textarea")).toHaveValue("Why?");
    await expect(panel.getByRole("checkbox")).toBeChecked();
    await expect(panel.getByRole("button", { name: "清除引用", exact: true })).toHaveAttribute("data-action", "clear-quote");
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((value) => {
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(value);
      }, theme);
      await expect(panel).toHaveAttribute("data-side-chat-theme", theme);
      await expect(panel.getByRole("button", { name: "清除引用", exact: true })).toBeVisible();
      await panel.locator("[data-active-quote]").screenshot({ animations: "disabled", path: test.info().outputPath(`active-quote-${theme}.png`) });
    }
    await page.evaluate(() => document.documentElement.classList.replace("dark", "light"));
    await panel.getByRole("button", { name: "设置", exact: true }).click();
    const embedded = panel.frameLocator("iframe");
    await expect(embedded.locator("#model")).toHaveValue("test-model");
    await embedded.locator("#model").fill("updated-model");
    await embedded.locator("#api-key").fill("updated-key");
    await page.evaluate(() => document.documentElement.classList.replace("light", "dark"));
    await expect(panel).toHaveAttribute("data-side-chat-theme", "dark");
    await expect(panel.locator(".panel")).toHaveCSS("background-color", "rgb(33, 33, 33)");
    await expect(embedded.locator("html")).toHaveAttribute("data-side-chat-theme", "dark");
    await expect(embedded.locator("#model")).toHaveValue("updated-model");
    await expect(embedded.locator("#api-key")).toHaveValue("updated-key");
    await panel.locator(".panel").screenshot({ animations: "disabled", path: test.info().outputPath("embedded-settings-dark.png") });
    await embedded.getByRole("button", { name: "保存并授权接口访问" }).click();
    await expect(embedded.locator("#status")).toContainText("设置已保存");
    await panel.getByRole("button", { name: "返回对话" }).click();
    await expect(panel).toContainText("updated-model");
    await panel.locator("textarea").fill("Why?");
    await page.evaluate(() => document.documentElement.classList.replace("dark", "light"));
    await expect(panel).toHaveAttribute("data-side-chat-theme", "light");
    await expect(panel.locator("textarea")).toHaveValue("Why?");
    await panel.locator("textarea").press("Enter");
    await expect(panel).toContainText("Side answer");
    await expect(panel.locator(".message.user .message-content")).toContainText("Why?");
    await expect(panel.locator(".katex")).toHaveCount(2);
    await expect(panel.locator(".katex-display")).toHaveCount(1);
    await expect(panel.locator(".katex").first()).toHaveCSS("font-family", /KaTeX_Main/);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ animations: "disabled", path: test.info().outputPath("chinese-math-panel.png"), fullPage: true });
    await panel.locator(".panel").screenshot({ animations: "disabled", path: test.info().outputPath("panel-light.png") });
    await page.evaluate(() => document.documentElement.classList.replace("light", "dark"));
    await expect(panel).toHaveAttribute("data-side-chat-theme", "dark");
    await panel.locator(".panel").screenshot({ animations: "disabled", path: test.info().outputPath("panel-dark.png") });
    const serializedRequest = JSON.stringify(providerRequest);
    expect((providerRequest as { model: string }).model).toBe("updated-model");
    expect(serializedRequest).toContain("Explain this API.");
    expect(serializedRequest).toContain("Use a service worker.");
    expect(serializedRequest).toContain("Why?");
    expect(JSON.parse((providerRequest as { messages: Array<{ content: string }> }).messages.at(-1)!.content)).toEqual({
      selectedQuote: { text: "Use a service worker.", sourceRole: "assistant", sourceMessageIndex: 1 },
      question: "Why?",
    });

    const beforeMinimize = await panel.locator(".panel").boundingBox();
    await panel.getByRole("button", { name: "最小化侧边对话" }).click();
    await panel.locator("[data-minimized-bar]").evaluate(async (element) => { await Promise.all(element.getAnimations().map((animation) => animation.finished)); });
    const minimized = await panel.locator("[data-minimized-bar]").boundingBox();
    expect(minimized?.x).toBe(beforeMinimize?.x);
    expect(minimized?.y).toBe(beforeMinimize?.y);
    expect(minimized?.width).toBe(180);
    await expect(panel.getByRole("button", { name: "打开侧边对话" })).toBeVisible();
    await expect(panel.locator(".panel")).toHaveCount(0);
    await selectedText.selectText();
    await page.getByRole("button", { name: "在侧栏中提问" }).click();
    await expect(panel.locator("[data-active-quote]")).toContainText("Use a service worker.");
    await panel.getByRole("button", { name: "清除引用", exact: true }).click();
    await expect(panel.locator(".message.user").first().locator(".quote")).toContainText("Use a service worker.");
    await panel.getByRole("button", { name: "最小化侧边对话" }).click();

    await page.reload();
    await expect(panel.getByRole("button", { name: "打开侧边对话" })).toBeVisible();
    await panel.getByRole("button", { name: "打开侧边对话" }).click();
    await expect(panel).toContainText("Side answer");
    await expect(panel.locator(".katex")).toHaveCount(2);
    await expect(panel.locator("textarea")).toBeEnabled();
    await page.locator("[data-message-author-role=user] p").selectText();
    await expect(panel.locator("[data-active-quote]")).toContainText("Explain this API.");
    await panel.getByRole("button", { name: "清除引用", exact: true }).click();
    await expect(panel.locator("[data-active-quote]")).toHaveCount(0);
    await expect(panel.locator(".message.user").first().locator(".quote")).toContainText("Use a service worker.");
    for (const [index, question] of ["Can you give an example?", "Explain the example further."].entries()) {
      await panel.locator("textarea").fill(question);
      await panel.locator("textarea").press("Enter");
      await expect(panel.locator(".message.assistant")).toHaveCount(index + 2);
      await expect(panel.locator("textarea")).toBeEnabled();
      await expect(panel.locator(".message.user").last()).toContainText(question);
      await expect(panel.locator(".message.user").last().locator(".quote")).toHaveCount(0);
      const sent = providerRequest as { messages: Array<{ role: string; content: string }> };
      expect(JSON.parse(sent.messages.at(-1)!.content)).toEqual({ question });
      expect(JSON.parse(sent.messages[2]!.content)).toMatchObject({
        selectedQuote: { text: "Use a service worker." }, question: "Why?",
      });
      expect(sent.messages[3]!.content).toContain("Side answer");
    }

    await page.setViewportSize({ width: 364, height: 384 });
    const compactPanel = panel.locator(".panel");
    await expect.poll(() => compactPanel.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight;
    })).toBe(true);
    const sendBox = await panel.getByRole("button", { name: "发送", exact: true }).boundingBox();
    expect(sendBox).not.toBeNull();
    expect(sendBox!.x + sendBox!.width).toBeLessThanOrEqual(364);
    expect(sendBox!.y + sendBox!.height).toBeLessThanOrEqual(384);
    expect(await compactPanel.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
    await compactPanel.screenshot({ animations: "disabled", path: test.info().outputPath("panel-compact.png") });

    await selectedText.evaluate((element) => { element.textContent = "这是一段需要完整理解的长引用内容。".repeat(25); });
    await selectedText.selectText();
    await expect(panel.locator("[data-active-quote]")).toBeVisible();
    await panel.locator("textarea").evaluate((element) => { element.style.height = "180px"; });
    expect(await compactPanel.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
    const bounds = await compactPanel.boundingBox();
    const controls = await panel.locator(".controls").boundingBox();
    expect(controls!.y + controls!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
    await compactPanel.screenshot({ animations: "disabled", path: test.info().outputPath("panel-compact-long-quote.png") });
    const activeQuote = panel.locator("[data-active-quote]");
    await activeQuote.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect.poll(() => activeQuote.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    const clearQuote = panel.getByRole("button", { name: "清除引用", exact: true });
    await expect(clearQuote).toBeInViewport({ ratio: 1 });
    await compactPanel.screenshot({ animations: "disabled", path: test.info().outputPath("panel-compact-long-quote-scrolled.png") });
    await clearQuote.click();
    await expect(activeQuote).toHaveCount(0);
    await expect(panel.locator(".message.user").first().locator(".quote")).toContainText("Use a service worker.");
  } finally {
    try { await context?.close(); }
    finally { await rm(userDataDir, { recursive: true, force: true }); }
  }
});

test("attachments require per-send approval and an interrupted stream preserves partial history", async () => {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "side-chat-consent-e2e-"));
  let context: BrowserContext | undefined;
  const downloadedFiles: string[] = [];
  const providerRequests: unknown[] = [];

  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: [
        `--disable-extensions-except=${path.resolve("dist")}`,
        `--load-extension=${path.resolve("dist")}`,
      ],
    });
    // Synthetic page and provider responses for regression tests and draft store demonstrations.
    await context.route("https://chatgpt.com/c/attachments-demo", (route) => route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>侧边对话功能演示</title>
      <style>
        * { box-sizing:border-box; }
        body { margin:0; background:#f3f5f4; color:#25302a; font:14px/1.8 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif; }
        main { width:min(680px,calc(100% - 64px)); margin:48px 32px; padding:28px; background:#fff; border:1px solid #dde3df; border-radius:16px; }
        h1 { margin:0 0 16px; font-size:22px; line-height:1.5; }
        main > p { margin:0 0 24px; padding:10px 14px; border-radius:8px; background:#eef3f0; color:#506057; }
        article { margin-top:20px; padding-top:16px; border-top:1px solid #e4e9e6; }
        article p { margin:0 0 12px; }
        a[download] { display:inline-block; margin:0 10px 0 0; padding:5px 10px; border:1px solid #dde3df; border-radius:7px; color:#3d6650; text-decoration:none; }
      </style></head><body><main>
        <h1>侧边对话功能演示</h1><p>以下内容与接口回答均为演示数据。</p>
        <article><div data-message-author-role="user"><p>我整理了两份笔记，想进一步理解流式响应。</p>
          <a download="学习笔记.txt" href="/files/approved.txt">学习笔记.txt</a>
          <a download="私人草稿.txt" href="/files/unapproved.txt">私人草稿.txt</a>
        </div></article>
        <article><div data-message-author-role="assistant"><p>流式响应会逐步返回内容，让你更早看到回答。可以选中这段话，在侧边对话中继续提问。</p></div></article>
      </main></body></html>`,
    }));
    await context.route("https://chatgpt.com/files/*.txt", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      downloadedFiles.push(pathname);
      await route.fulfill({ contentType: "text/plain", body: pathname.endsWith("/approved.txt") ? "学习笔记内容：流式响应会分批返回文本，适合逐步展示较长回答。" : "私人草稿内容：这是未获批准读取的测试文件。" });
    });
    await context.route("https://api.example.test/v1/chat/completions", async (route) => {
      providerRequests.push(route.request().postDataJSON());
      await route.fulfill({
        contentType: "text/event-stream",
        body: `data: ${JSON.stringify({ choices: [{ delta: { content: "流式响应会把回答分成连续的小段返回。\n\n这样你可以先阅读已经生成的内容，等待时也能看到进度；需要调整问题时，可以停止生成后继续提问。" } }] })}\n\ndata: [DONE]\n\n`,
      });
    });

    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const optionsUrl = `chrome-extension://${new URL(worker.url()).host}/options.html`;
    await expect.poll(() => context?.pages().some((candidate) => candidate.url() === optionsUrl)).toBe(true);
    const optionsPage = context.pages().find((candidate) => candidate.url() === optionsUrl)!;
    await configureProvider(optionsPage, "demo-model");
    const policyPagePromise = context.waitForEvent("page");
    await optionsPage.getByRole("link", { name: "阅读完整隐私政策" }).click();
    const policyPage = await policyPagePromise;
    await expect(policyPage).toHaveTitle("隐私政策 · 侧边对话助手");
    await expect(policyPage.getByRole("heading", { name: "侧边对话助手隐私政策", exact: true })).toBeVisible();
    await expect(policyPage.getByText(/未选择附件的文件内容不会被读取或发送/)).toBeVisible();
    await policyPage.close();
    await optionsPage.emulateMedia({ colorScheme: "light" });
    await expect(optionsPage.locator("#api-key")).toHaveValue("");
    await optionsPage.locator(".disclosure").scrollIntoViewIfNeeded();
    await optionsPage.screenshot({ animations: "disabled", path: test.info().outputPath("store-settings-disclosure.png") });
    providerRequests.length = 0;

    const page = await context.newPage();
    await page.goto("https://chatgpt.com/c/attachments-demo");
    const panel = page.locator("[data-side-chat-host]");
    await panel.getByRole("button", { name: "打开侧边对话" }).click();
    const consent = panel.locator("dialog[data-attachment-consent]");
    await panel.locator("textarea").fill("先不发送，我再确认一下。");
    await panel.locator("textarea").press("Enter");
    await expect(consent).toBeVisible();
    await expect(consent.getByRole("checkbox")).toHaveCount(2);
    await expect(consent.getByRole("checkbox").nth(0)).not.toBeChecked();
    await expect(consent.getByRole("checkbox").nth(1)).not.toBeChecked();
    expect(downloadedFiles).toEqual([]);
    expect(providerRequests).toHaveLength(0);
    await consent.locator("[data-action=cancel-attachments]").click();
    await expect(consent).toHaveCount(0);
    await expect(panel.locator("textarea")).toBeEnabled();
    expect(downloadedFiles).toEqual([]);
    expect(providerRequests).toHaveLength(0);

    await panel.locator("textarea").fill("不读取附件，简单说明流式响应是什么。");
    await panel.locator("textarea").press("Enter");
    await expect(consent).toBeVisible();
    await consent.locator("[data-action=confirm-attachments]").click();
    await expect(panel.locator(".message.assistant")).toHaveCount(1);
    await expect(panel.locator("textarea")).toBeEnabled();
    expect(downloadedFiles).toEqual([]);
    expect(providerRequests).toHaveLength(1);
    expect(JSON.stringify(providerRequests[0])).not.toContain("学习笔记内容：");
    expect(JSON.stringify(providerRequests[0])).not.toContain("私人草稿内容：");

    await panel.locator("textarea").fill("根据学习笔记，解释流式响应的作用。");
    await panel.locator("textarea").press("Enter");
    await expect(consent).toBeVisible();
    await expect(consent.getByRole("checkbox").nth(0)).not.toBeChecked();
    await expect(consent.getByRole("checkbox").nth(1)).not.toBeChecked();
    await consent.getByRole("checkbox", { name: "学习笔记.txt", exact: true }).check();
    expect(downloadedFiles).toEqual([]);
    expect(providerRequests).toHaveLength(1);
    await consent.screenshot({ animations: "disabled", path: test.info().outputPath("attachment-consent.png") });
    await page.screenshot({ animations: "disabled", path: test.info().outputPath("store-attachment-consent.png") });
    await consent.locator("[data-action=confirm-attachments]").click();
    await expect(panel.locator(".message.assistant")).toHaveCount(2);
    await expect(panel.locator("textarea")).toBeEnabled();
    expect(downloadedFiles).toEqual(["/files/approved.txt"]);
    expect(providerRequests).toHaveLength(2);
    expect(JSON.stringify(providerRequests[1])).toContain("学习笔记内容：");
    expect(JSON.stringify(providerRequests[1])).not.toContain("私人草稿内容：");
    await page.screenshot({ animations: "disabled", path: test.info().outputPath("store-side-chat-answer.png") });

    // route.fulfill buffers the response. Mock only transport here so the browser receives
    // a partial SSE frame and exercises the actual Port, abort, parser, and encrypted history paths.
    await worker.evaluate(() => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url !== "https://api.example.test/v1/chat/completions") return originalFetch(input, init);
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "流式响应会先返回一部分内容，" } }] })}\n\n`));
            init?.signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
          },
        }), { headers: { "Content-Type": "text/event-stream" } });
      };
    });
    await panel.locator("textarea").fill("请详细解释，我会在中途停止生成。");
    await panel.locator("textarea").press("Enter");
    await expect(consent).toBeVisible();
    await expect(consent.getByRole("checkbox").nth(0)).not.toBeChecked();
    await consent.locator("[data-action=confirm-attachments]").click();
    await expect(panel.locator(".message.assistant").last()).toContainText("流式响应会先返回一部分内容，");
    await expect(panel.locator("textarea")).toBeDisabled();
    await panel.getByRole("button", { name: "停止生成", exact: true }).click();
    await expect(panel).toContainText("已停止");
    await expect(panel.locator("textarea")).toBeEnabled();
    await expect(panel.locator(".message.assistant").last()).toContainText("流式响应会先返回一部分内容，");
    await expect.poll(() => optionsPage.evaluate(async () => {
      const response = await chrome.runtime.sendMessage({ type: "history:load", conversationId: "attachments-demo" });
      return response.ok ? response.value?.messages.at(-1)?.status : null;
    })).toBe("incomplete");
    await page.reload();
    await panel.getByRole("button", { name: "打开侧边对话" }).click();
    await expect(panel.locator(".message.assistant")).toHaveCount(3);
    await expect(panel.locator(".message.assistant").last()).toContainText("流式响应会先返回一部分内容，");
    await expect(panel.locator(".message.assistant").last().locator(".incomplete")).toHaveText("未完成");
    await expect(panel.locator("textarea")).toBeEnabled();
    expect(downloadedFiles).toEqual(["/files/approved.txt"]);
  } finally {
    try { await context?.close(); }
    finally { await rm(userDataDir, { recursive: true, force: true }); }
  }
});
