import { chromium, expect, test, type BrowserContext } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("selection opens a docked side chat whose history survives reload", async () => {
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
    const fixture = await readFile("test/fixtures/chatgpt-page.html", "utf8");
    await context.route("https://chatgpt.com/c/demo", (route) => route.fulfill({ contentType: "text/html", body: fixture }));
    await context.route("https://api.example.test/v1/chat/completions", async (route) => {
      providerRequest = route.request().postDataJSON();
      await route.fulfill({
        contentType: "text/event-stream",
        body: 'data: {"choices":[{"delta":{"content":null,"reasoning_content":"private reasoning"}}]}\n\n' +
          'data: {"choices":[{"delta":{"content":"Side answer","reasoning_content":null}}]}\n\n' +
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
    await expect(optionsPage.getByRole("heading", { name: "Before you continue" })).toBeVisible();
    await expect(optionsPage.getByText(/When you send a side-chat question, it reads and sends those messages/)).toBeVisible();
    await optionsPage.close();
    await worker.evaluate(async () => {
      const config = { baseUrl: "https://api.example.test/v1", model: "test-model", contextWindowTokens: 128000, supportsImages: false };
      await chrome.storage.local.set({ "privacy-accepted": true, "provider-config": config });
      await chrome.storage.session.set({ "provider-api-key": { apiKey: "test-key", providerBaseUrl: config.baseUrl } });
    });

    const page = await context.newPage();
    await page.goto("https://chatgpt.com/c/demo");
    const selectedText = page.locator("article[data-message-author-role=assistant] p").first();
    await selectedText.selectText();
    await page.getByRole("button", { name: "Ask in side chat" }).click();

    const panel = page.locator("[data-side-chat-host]");
    await expect(panel.locator("textarea")).toBeVisible();
    await expect(panel).toContainText("Use a service worker.");
    await panel.locator("textarea").fill("Why?");
    await panel.getByRole("button", { name: "Send" }).click();
    await expect(panel).toContainText("Side answer");
    const serializedRequest = JSON.stringify(providerRequest);
    expect(serializedRequest).toContain("Explain this API.");
    expect(serializedRequest).toContain("Use a service worker.");
    expect(serializedRequest).toContain("Why?");

    await page.reload();
    await selectedText.selectText();
    await page.getByRole("button", { name: "Ask in side chat" }).click();
    await expect(panel).toContainText("Side answer");
  } finally {
    try { await context?.close(); }
    finally { await rm(userDataDir, { recursive: true, force: true }); }
  }
});
