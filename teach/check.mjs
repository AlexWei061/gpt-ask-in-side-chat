// Offline checks for the teaching site. Uses existing project dev dependencies.
// Does not build the extension or write outside teach.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Window } from "happy-dom";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const html = await readFile(path.join(here, "index.html"), "utf8");
const scripts = await Promise.all(["source-data.js", "curriculum.js", "app.js"].map((file) => readFile(path.join(here, file), "utf8")));
const window = new Window({ url: "http://teach.local/", settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
const errors = [];
window.addEventListener("error", (event) => errors.push(event.message));
const $ = (selector) => window.document.querySelector(selector);
const $$ = (selector) => [...window.document.querySelectorAll(selector)];
const input = (selector, value) => { $(selector).value = value; $(selector).dispatchEvent(new window.Event("input", { bubbles: true })); };
function route(id) {
  window.history.replaceState(null, "", `#${id}`);
  window.dispatchEvent(new window.HashChangeEvent("hashchange"));
}
function refs(container) {
  for (const ref of container.querySelectorAll("[data-source]")) {
    const file = window.TEACH_SOURCES.files[ref.dataset.source];
    assert.ok(file, `Unknown source file: ${ref.dataset.source}`);
    assert.ok(!ref.dataset.find || file.text.includes(ref.dataset.find), `Missing anchor: ${ref.dataset.source} → ${ref.dataset.find}`);
  }
}
async function importSource(relative) {
  const result = await build({ entryPoints: [path.join(root, relative)], bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent" });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

try {
  window.document.write(html);
  scripts.forEach((script) => window.eval(script));
  const T = window.TEACH;
  assert.equal(T.chapters.length, 10);
  assert.equal(new Set(T.chapters.map((chapter) => chapter.id)).size, 10);
  const allIds = new Set(T.chapters.map((chapter) => chapter.id));
  for (const chapter of T.chapters) {
    route(chapter.id);
    assert.equal($("h1").textContent, chapter.title);
    assert.equal($$("#lesson-nav [aria-current=page]").length, 1);
    refs($("#lesson"));
    for (const link of $$("#lesson a[href^='#']")) assert.ok(allIds.has(link.hash.slice(1)), `Invalid lesson route ${link.hash}`);
    for (const quiz of $$("[data-quiz]")) {
      const q = T.quizzes[quiz.dataset.quiz];
      assert.equal(q.options.length, q.explanations.length);
      const buttons = [...quiz.querySelectorAll("[data-answer]")];
      buttons.forEach((button, index) => {
        button.click();
        assert.equal(quiz.querySelector(".feedback").classList.contains("correct"), index === q.answer);
        assert.equal(button.getAttribute("aria-pressed"), "true");
      });
    }
  }
  console.log("✓ All 10 lessons, source anchors, routes and quiz feedback");

  route("architecture");
  for (let i = 0; i < T.architecture.length; i++) { $(`[data-architecture='${i}']`).click(); refs($("#architecture-detail")); }
  route("trace");
  assert.ok($("#trace-prev").disabled);
  for (let i = 0; i < T.trace.length; i++) {
    assert.equal($("#trace-count").textContent, `${i + 1} / 8`);
    refs($("#trace-info"));
    if (i < T.trace.length - 1) $("#trace-next").click();
  }
  assert.ok($("#trace-next").disabled);
  $("#trace-prev").click(); assert.equal($("#trace-count").textContent, "7 / 8");

  route("debug");
  for (let index = 0; index < T.labs.length; index++) {
    $(`[data-lab='${index}']`).click(); refs($("#lab-panel"));
    const lab = T.labs[index];
    for (let choice = 0; choice < lab.options.length; choice++) {
      $("#lab-patch").value = String(choice); $("#run-lab").click();
      assert.equal($("#lab-result .feedback").classList.contains("correct"), choice === lab.correct);
    }
  }
  route("async"); $("#run-race").click(); assert.match($("#race-output").textContent, /最终：B 的历史 ✓/);
  $("#race-guard").value = "none"; $("#run-race").click(); assert.match($("#race-output").textContent, /最终：A 的历史 ✗/);
  route("data"); assert.match($("#token-stats").textContent, /2文本估算/);
  $("[data-token-example='boundary']").click(); assert.match($("#token-result").textContent, /921 ≤ 921/);
  $("[data-token-example='overflow']").click(); assert.match($("#token-result").textContent, /922 > 921/);
  input("#token-window", "0"); assert.match($("#token-result").textContent, /请输入/);
  input("#token-window", "1024.5"); assert.match($("#token-result").textContent, /请输入/);
  console.log("✓ 8 trace steps, 3 architecture views, 9 lab branches, race ordering and token boundaries");

  route("start"); $("#mark-complete").click();
  assert.match($("#progress-label").textContent, /^1 \/ 10$/);
  assert.deepEqual(JSON.parse(window.localStorage.getItem("side-chat-teach-v1")).completed, ["start"]);
  route("run"); route("start"); assert.ok($("#mark-complete").checked);
  input("#lesson-search", "SSE"); assert.ok($$("#lesson-nav a").length > 0);
  input("#lesson-search", "no-such-lesson-xyz"); assert.equal($$("#lesson-nav a").length, 0);
  input("#lesson-search", ""); assert.equal($$("#lesson-nav a").length, 10);
  $("#browse-source").click(); assert.ok($("#source-dialog").open);
  $("#source-search").value = "interface"; $("#source-find").click(); assert.ok($(".source-line.highlight"));
  const first = $(".source-line.highlight").id; $("#source-find").click(); assert.notEqual($(".source-line.highlight").id, first);
  $("#source-search").value = "not-present-xyz"; $("#source-find").click(); assert.match($("#source-meta").textContent, /未找到/);
  $("#close-source").click(); assert.ok(!$("#source-dialog").open);
  route("graduate"); $("#diagnosis").value = "<script>私人草稿</script>\n我的判断"; $("#save-diagnosis").click();
  route("start"); route("graduate"); assert.equal($("#diagnosis").value, "<script>私人草稿</script>\n我的判断");
  assert.equal($$("#lesson script").length, 0);
  console.log("✓ Search, local progress, diagnosis persistence and escaped source viewer");

  // Compare the teaching formula against the actual TypeScript implementation.
  const budget = await importSource("src/background/context-budget.ts");
  for (const value of ["", "test", "test测", "🙂a", "\n\t", "中".repeat(921), "中".repeat(922)]) {
    assert.equal(window.TEACH_MODELS.estimateTokens(value), budget.estimateTokens(value));
  }
  assert.doesNotThrow(() => budget.assertWithinBudget(921, 1024));
  assert.throws(() => budget.assertWithinBudget(922, 1024), (error) => error.code === "CONTEXT_OVERFLOW");

  // Check the teaching examples against the real service and stream parser, entirely offline.
  const { ChatService } = await importSource("src/background/chat-service.ts");
  const settings = { privacyAccepted: true, config: { baseUrl: "https://provider.example/v1", model: "teaching-only", contextWindowTokens: 10000, supportsImages: false }, apiKey: "fake-for-offline-test" };
  const payload = { conversationId: "teach-test", mainMessages: [{ index: 0, role: "user", content: "问题", links: [] }], question: "解释", attachments: [], compressOldContext: false };
  let record = null;
  const service = new ChatService({ history: { get: async () => record, put: async (next) => { record = next; } }, loadSettings: async () => settings, hasHostPermission: async () => true, stream: async ({ onDelta }) => { onDelta("Hello"); onDelta(" world"); return "Hello world"; } });
  const result = await service.send(payload, new AbortController().signal, () => {});
  assert.equal(result.messages.at(-1).content, "Hello world");
  assert.equal(record.messages.at(-1).content, "Hello world");

  const { streamChatCompletion } = await importSource("src/background/provider.ts");
  const events = [];
  const streamResult = await streamChatCompletion({ fetcher: async () => new Response('data: {"choices":[{"delta":{"content":null}}]}\n\ndata: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n'), url: "https://provider.example/v1/chat/completions", apiKey: "fake-for-offline-test", model: "teaching-only", messages: [], signal: new AbortController().signal, onDelta: (text) => events.push(text) });
  assert.equal(streamResult, "OK"); assert.deepEqual(events, ["OK"]);

  let releaseFirst;
  let calls = 0;
  let notifyStarted;
  const firstStarted = new Promise((resolve) => { notifyStarted = resolve; });
  const queued = new ChatService({ history: { get: async () => null, put: async () => {} }, loadSettings: async () => settings, hasHostPermission: async () => true, stream: async ({ onDelta }) => { calls++; notifyStarted(); await new Promise((resolve) => { releaseFirst = resolve; }); onDelta("A"); return "A"; } });
  const a = queued.send(payload, new AbortController().signal, () => {});
  await firstStarted;
  const cancelB = new AbortController();
  const b = queued.send(payload, cancelB.signal, () => {});
  const rejected = assert.rejects(b);
  cancelB.abort(); releaseFirst();
  await a; await rejected; assert.equal(calls, 1);
  console.log("✓ Real source agrees: token estimator, multi-delta saving, nullable frames, cancelled queued request");

  for (const [name, file] of Object.entries(window.TEACH_SOURCES.files)) {
    const text = await readFile(path.join(root, name), "utf8");
    assert.equal(createHash("sha256").update(text).digest("hex"), file.sha256, `Source snapshot drifted: ${name}; run node teach/update-sources.mjs`);
  }
  assert.deepEqual(errors, []);
  console.log(`✓ ${Object.keys(window.TEACH_SOURCES.files).length} source snapshots match the current working tree`);
  console.log("Teaching checks passed. The deliberately broken learner exercise is excluded; no extension build or browser E2E was run.");
} finally {
  await window.happyDOM.close();
}
