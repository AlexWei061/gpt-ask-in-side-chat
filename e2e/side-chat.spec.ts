import { chromium, expect, test, type BrowserContext } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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
      .replaceAll("<article", "<div")
      .replaceAll("</article>", "</div>");
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
    await expect(optionsPage.getByText(/发送侧边问题时，扩展会读取这些消息/)).toBeVisible();
    await optionsPage.screenshot({ animations: "disabled", path: test.info().outputPath("chinese-settings.png"), fullPage: true });
    for (const theme of ["dark", "light"] as const) {
      await optionsPage.emulateMedia({ colorScheme: theme });
      await expect(optionsPage.locator("html")).toHaveAttribute("data-side-chat-theme", theme);
      await optionsPage.screenshot({ animations: "disabled", path: test.info().outputPath(`settings-${theme}.png`), fullPage: true });
    }
    await optionsPage.close();
    await worker.evaluate(async () => {
      const config = { baseUrl: "https://api.example.test/v1", model: "test-model", contextWindowTokens: 128000, supportsImages: false };
      await chrome.storage.local.set({ "privacy-accepted": true, "provider-config": config });
      await chrome.storage.session.set({ "provider-api-key": { apiKey: "test-key", providerBaseUrl: config.baseUrl } });
    });

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
