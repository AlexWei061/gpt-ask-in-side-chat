import { chromium, expect, test, type BrowserContext } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("multiple API profiles retain separate keys, switch across pages, and preserve the conversation", async () => {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "side-chat-multi-api-"));
  let context: BrowserContext | undefined;
  const requests: Array<{ path: string; model: string; authorization?: string; messages: unknown[] }> = [];
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium", headless: true, viewport: { width: 1280, height: 900 },
      args: [`--disable-extensions-except=${path.resolve("dist")}`, `--load-extension=${path.resolve("dist")}`],
    });
    await context.route("https://chatgpt.com/c/multi-api*", (route) => route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>多 API 测试</title></head><body><main>
        <article data-message-author-role="user"><p>解释一下流式响应。</p></article>
        <article data-message-author-role="assistant"><p>流式响应会逐步返回回答内容。</p></article>
      </main></body></html>`,
    }));
    await context.route("https://api.example.test/**/chat/completions", async (route) => {
      const body = route.request().postDataJSON() as { model: string; messages: unknown[] };
      const authorization = route.request().headers().authorization;
      requests.push({ path: new URL(route.request().url()).pathname, ...body, ...(authorization ? { authorization } : {}) });
      await route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify({ choices: [{ delta: { content: `来自 ${body.model} 的回答。` } }] })}\n\ndata: [DONE]\n\n` });
    });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const optionsUrl = `chrome-extension://${new URL(worker.url()).host}/options.html`;
    await expect.poll(() => context!.pages().some((page) => page.url() === optionsUrl)).toBe(true);
    const options = context.pages().find((page) => page.url() === optionsUrl)!;
    await options.locator("#profile-name").fill("日常使用");
    await options.locator("#base-url").fill("https://api.example.test/standard/v1");
    await options.locator("#model").fill("model-standard");
    await options.locator("#context-window").fill("128000");
    await options.locator("#api-key").fill("key-standard");
    await options.locator("#privacy").check();
    await options.getByRole("button", { name: "保存并授权接口访问" }).click();
    await expect(options.locator("#status")).toContainText("设置已保存");
    const firstId = await options.locator(".profile-row").getAttribute("data-profile-id");
    expect(firstId).toBeTruthy();
    await options.getByRole("button", { name: "新增配置", exact: true }).click();
    await options.locator("#profile-name").fill("深度思考");
    await options.locator("#base-url").fill("https://api.example.test/reasoning/v1");
    await options.locator("#model").fill("model-reasoning");
    await options.locator("#api-key").fill("key-reasoning");
    await options.getByRole("button", { name: "保存并授权接口访问" }).click();
    await expect(options.locator("#status")).toContainText("设置已保存");
    await expect(options.locator(".profile-row")).toHaveCount(2);
    const secondId = await options.locator(".profile-row").nth(1).getAttribute("data-profile-id");
    expect(secondId).toBeTruthy();
    await expect(options.locator(".profile-row").first()).toContainText("使用中");
    await expect(options.locator("#api-key")).toHaveValue("");
    await options.getByRole("button", { name: "测试连接", exact: true }).click();
    await expect(options.locator("#status")).toContainText("连接成功");
    expect(requests.at(-1)).toMatchObject({ path: "/reasoning/v1/chat/completions", authorization: "Bearer key-reasoning", model: "model-reasoning" });
    await options.locator("#profile-name").fill("深度思考（未保存草稿）");

    const pages = [await context.newPage(), await context.newPage()];
    for (const [index, page] of pages.entries()) {
      await page.goto(`https://chatgpt.com/c/multi-api-${index}`);
      await page.locator("[data-side-chat-host]").getByRole("button", { name: "打开侧边对话" }).click();
    }
    const page = pages[0]!;
    const panel = page.locator("[data-side-chat-host]");
    const otherPanel = pages[1]!.locator("[data-side-chat-host]");
    await expect(panel.locator("[data-provider-select]")).toHaveValue(firstId!);
    await panel.locator("textarea").fill("请继续解释这段内容。");
    await panel.locator(".controls input").check();
    await panel.getByRole("combobox", { name: "切换 API 配置" }).selectOption(secondId!);
    await expect(otherPanel.locator("[data-provider-select]")).toHaveValue(secondId!);
    await expect(options.locator(".profile-row").nth(1)).toContainText("使用中");
    await expect(options.locator("#profile-name")).toHaveValue("深度思考（未保存草稿）");
    await expect(panel.locator("textarea")).toHaveValue("请继续解释这段内容。");
    await expect(panel.locator(".controls input")).toBeChecked();
    await panel.locator("textarea").press("Enter");
    await expect(panel.locator(".message.assistant")).toContainText("来自 model-reasoning 的回答。");
    expect(requests.at(-1)).toMatchObject({ path: "/reasoning/v1/chat/completions", authorization: "Bearer key-reasoning", model: "model-reasoning" });

    await panel.getByRole("combobox", { name: "切换 API 配置" }).selectOption(firstId!);
    await expect(otherPanel.locator("[data-provider-select]")).toHaveValue(firstId!);
    await expect(options.locator(".profile-row").first()).toContainText("使用中");
    await expect(options.locator("#profile-name")).toHaveValue("深度思考（未保存草稿）");
    await panel.locator("textarea").fill("换个 API，继续当前对话。");
    await panel.locator("textarea").press("Enter");
    await expect(panel.locator(".message.assistant")).toHaveCount(2);
    expect(requests.at(-1)).toMatchObject({ path: "/standard/v1/chat/completions", authorization: "Bearer key-standard", model: "model-standard" });
    expect(JSON.stringify(requests.at(-1)!.messages)).toContain("来自 model-reasoning 的回答。");

    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((value) => { document.documentElement.className = value; }, theme);
      await expect(panel).toHaveAttribute("data-side-chat-theme", theme);
      await panel.locator(".panel").screenshot({ path: test.info().outputPath(`multi-api-${theme}.png`), animations: "disabled" });
    }
    await panel.getByRole("button", { name: "设置", exact: true }).click();
    const embedded = panel.frameLocator("iframe");
    await expect(embedded.locator(".profile-row")).toHaveCount(2);
    await expect(embedded.locator("#profile-name")).toHaveValue("日常使用");
    await expect.poll(() => embedded.locator("html").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await panel.locator(".panel").screenshot({ path: test.info().outputPath("multi-api-embedded.png"), animations: "disabled" });
    await panel.getByRole("button", { name: "返回对话" }).click();
    await page.setViewportSize({ width: 364, height: 384 });
    await expect.poll(() => panel.locator(".panel").evaluate((element) => element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(panel.getByRole("combobox", { name: "切换 API 配置" })).toBeInViewport({ ratio: 1 });
    await expect(panel.getByRole("button", { name: "发送", exact: true })).toBeInViewport({ ratio: 1 });
    await panel.locator(".panel").screenshot({ path: test.info().outputPath("multi-api-compact.png"), animations: "disabled" });
    await page.reload();
    await panel.getByRole("button", { name: "打开侧边对话" }).click();
    await expect(panel.locator("[data-provider-select]")).toHaveValue(firstId!);
    await expect(panel.locator(".message.assistant")).toHaveCount(2);

    await options.reload();
    await expect(options.locator(".profile-row")).toHaveCount(2);
    await expect(options.locator("#api-key")).toHaveAttribute("placeholder", "已设置密钥，留空即可保留");
    await options.getByRole("button", { name: "编辑配置 深度思考" }).click();
    await expect(options.locator("#api-key")).toHaveValue("");
    await options.getByRole("button", { name: "测试连接", exact: true }).click();
    await expect(options.locator("#status")).toContainText("连接成功");
    expect(requests.at(-1)?.authorization).toBe("Bearer key-reasoning");
    options.once("dialog", (dialog) => dialog.accept());
    await options.getByRole("button", { name: "删除此配置" }).click();
    await expect(options.locator(".profile-row")).toHaveCount(1);
    await expect(otherPanel.locator("[data-provider-select] option")).toHaveCount(1);
    await options.getByRole("button", { name: "测试连接", exact: true }).click();
    await expect(options.locator("#status")).toContainText("连接成功");
    expect(requests.at(-1)?.authorization).toBe("Bearer key-standard");
  } finally {
    await context?.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
