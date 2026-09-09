import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("API key survives reloads and refreshed pages can chat until the key is forgotten", async () => {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "side-chat-key-e2e-"));
  const authorizations: Array<string | undefined> = [];
  let context: BrowserContext | undefined;

  async function launch(): Promise<BrowserContext> {
    const browserContext = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${path.resolve("dist")}`,
        `--load-extension=${path.resolve("dist")}`,
      ],
    });
    await browserContext.route("https://api.example.test/v1/chat/completions", async (route) => {
      authorizations.push(route.request().headers().authorization);
      await route.fulfill({
        contentType: "text/event-stream",
        body: 'data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n',
      });
    });
    await browserContext.route("https://chatgpt.com/c/key-reload", (route) => route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><main>
        <article data-message-author-role="user"><p>Explain this API.</p></article>
        <article data-message-author-role="assistant"><p>Use a service worker.</p></article>
      </main>`,
    }));
    return browserContext;
  }

  async function openOptions(browserContext: BrowserContext, optionsUrl: string): Promise<Page> {
    const existingPage = browserContext.pages().find((page) => page.url() === optionsUrl);
    const page = existingPage ?? await browserContext.newPage();
    if (!existingPage) await page.goto(optionsUrl);
    await page.waitForLoadState();
    await expect(page.locator("#api-key")).toHaveValue("");
    return page;
  }

  async function expectSavedKey(page: Page): Promise<void> {
    await expect(page.locator("#model")).toHaveValue("test-model");
    await expect(page.locator("#api-key")).toHaveAttribute("placeholder", "已设置密钥，留空即可保留");
    const previousRequests = authorizations.length;
    await page.getByRole("button", { name: "测试连接", exact: true }).click();
    await expect(page.locator("#status")).toContainText("连接成功");
    expect(authorizations.slice(previousRequests)).toEqual(["Bearer test-key"]);
  }

  try {
    context = await launch();
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const optionsUrl = `chrome-extension://${new URL(worker.url()).host}/options.html`;
    await expect.poll(() => context?.pages().some((page) => page.url() === optionsUrl)).toBe(true);
    let optionsPage = await openOptions(context, optionsUrl);
    await optionsPage.locator("#privacy").check();
    await optionsPage.locator("#base-url").fill("https://api.example.test/v1");
    await optionsPage.locator("#model").fill("test-model");
    await optionsPage.locator("#context-window").fill("128000");
    await optionsPage.locator("#api-key").fill("test-key");
    // The E2E build pre-grants this mock origin, without contacting a real provider.
    await optionsPage.getByRole("button", { name: "保存并授权接口访问" }).click();
    await expect(optionsPage.locator("#status")).toContainText("设置已保存");
    await expectSavedKey(optionsPage);
    await optionsPage.close();

    const chatPage = await context.newPage();
    const pageErrors: string[] = [];
    chatPage.on("pageerror", (error) => pageErrors.push(error.message));
    await chatPage.goto("https://chatgpt.com/c/key-reload");
    const panel = chatPage.locator("[data-side-chat-host]");
    await expect(panel.getByRole("button", { name: "打开侧边对话" })).toBeVisible();

    // Command-line loading bypasses this setting, but Chromium requires it when reloading unpacked extensions.
    const extensionsPage = await context.newPage();
    await extensionsPage.goto("chrome://extensions/");
    await extensionsPage.locator("#devMode").click();
    await expect(extensionsPage.locator("#devMode")).toHaveAttribute("aria-pressed", "true");
    await extensionsPage.close();
    const reloadedWorker = context.waitForEvent("serviceworker", {
      predicate: (candidate) => candidate !== worker && candidate.url() === worker.url(),
      timeout: 10_000,
    });
    await worker.evaluate(() => { setTimeout(() => chrome.runtime.reload(), 0); });
    await reloadedWorker;

    const requestsBeforeRefresh = authorizations.length;
    // Chromium may discard stale content-script callbacks, so the old page need not remain interactive.
    await panel.getByRole("button", { name: "打开侧边对话" }).click();
    expect(pageErrors).toEqual([]);
    expect(authorizations).toHaveLength(requestsBeforeRefresh);

    await chatPage.reload();
    await panel.getByRole("button", { name: "打开侧边对话" }).click();
    await panel.locator("textarea").fill("Does the saved key still work after reloading?");
    await panel.getByRole("button", { name: "发送", exact: true }).click();
    await expect(panel.locator(".message.assistant")).toContainText("OK");
    await expect(panel.locator("textarea")).toBeEnabled();
    expect(pageErrors).toEqual([]);
    expect(authorizations.slice(requestsBeforeRefresh)).toEqual(["Bearer test-key"]);

    optionsPage = await openOptions(context, optionsUrl);
    await expectSavedKey(optionsPage);

    await context.close();
    context = await launch();
    optionsPage = await openOptions(context, optionsUrl);
    await expectSavedKey(optionsPage);

    optionsPage.once("dialog", (dialog) => dialog.accept());
    await optionsPage.locator("#forget").click();
    await expect(optionsPage.locator("#status")).toContainText("已忘记");
    await context.close();
    context = await launch();
    optionsPage = await openOptions(context, optionsUrl);
    await expect(optionsPage.locator("#model")).toHaveValue("test-model");
    await expect(optionsPage.locator("#api-key")).not.toHaveAttribute("placeholder", "已设置密钥，留空即可保留");
    await optionsPage.getByRole("button", { name: "测试连接", exact: true }).click();
    await expect(optionsPage.locator("#status")).toHaveAttribute("data-kind", "error");
    await expect(optionsPage.locator("#status")).toContainText("API 密钥");
    expect(authorizations).toEqual(["Bearer test-key", "Bearer test-key", "Bearer test-key", "Bearer test-key"]);
  } finally {
    await context?.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
