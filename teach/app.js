(() => {
  "use strict";
  const T = window.TEACH;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STORAGE_KEY = "side-chat-teach-v1";
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { /* Reading remains available without storage. */ }
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = {};
  const completed = new Set(Array.isArray(saved.completed) ? saved.completed.filter((id) => T.chapters.some((c) => c.id === id)) : []);
  const answers = {};
  let current = T.chapters[0];
  let traceStep = 0;
  let activeLab = 0;
  let toastTimer;
  let sourcePath = "src/shared/types.ts";
  let foundLine = -1;
  let previousSearch = "";
  const date = new Date(window.TEACH_SOURCES.capturedAt).toLocaleString("zh-CN", { hour12: false });
  $("#snapshot-date").textContent = `源码快照 · ${date}`;
  $("#course-progress").max = T.chapters.length;

  function toast(text) {
    clearTimeout(toastTimer);
    $("#toast").textContent = text;
    toastTimer = setTimeout(() => { $("#toast").textContent = ""; }, 3500);
  }
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ completed: [...completed], diagnosis: saved.diagnosis || "" }));
      return true;
    } catch {
      toast("浏览器未允许本地存储，本次页面仍可正常学习。笔记可下载保存。");
      return false;
    }
  }
  function navigation() {
    const query = $("#lesson-search").value.trim().toLowerCase();
    const matches = T.chapters.filter((c) => `${c.title} ${c.short} ${c.keywords} ${c.body.replace(/<[^>]+>/g, " ")}`.toLowerCase().includes(query));
    $("#lesson-nav").innerHTML = matches.length ? matches.map((c) => {
      const index = T.chapters.indexOf(c);
      return `<a href="#${c.id}" ${c.id === current.id ? 'aria-current="page"' : ""}><span class="nav-number">${String(index).padStart(2, "0")}</span><span>${c.short}</span>${completed.has(c.id) ? '<span class="nav-check" aria-label="已自测通过">✓</span>' : ""}</a>`;
    }).join("") : '<p class="nav-empty">没有找到相关课程。试试“异步”“流”或清空搜索。</p>';
    $("#progress-label").textContent = `${completed.size} / ${T.chapters.length}`;
    $("#course-progress").value = completed.size;
    $("#course-progress").textContent = `${completed.size} / ${T.chapters.length}`;
  }
  function render() {
    const id = location.hash.slice(1);
    current = T.chapters.find((c) => c.id === id) || T.chapters[0];
    const index = T.chapters.indexOf(current);
    document.title = `${current.short} · 读懂你的项目`;
    $("#lesson").innerHTML = `<header class="lesson-heading"><div class="lesson-meta"><span class="eyebrow">${current.tag}</span><span class="pill">${current.time}</span></div><h1>${current.title}</h1><p class="lede">${current.intro}</p><div class="goal"><strong>本课过关标准</strong>${current.goal}</div></header><article class="content">${current.body}</article><section class="lesson-end"><label class="finish-toggle"><input id="mark-complete" type="checkbox" ${completed.has(current.id) ? "checked" : ""}><span><strong>我已按本课标准完成自测</strong><br><small class="muted">这是自己的学习记录；仅浏览完页面不等于掌握。</small></span></label><div class="button-row">${index ? `<a class="secondary" href="#${T.chapters[index - 1].id}">← ${T.chapters[index - 1].short}</a>` : '<span class="muted">按自己的节奏，一次完成一课。</span>'}${index < T.chapters.length - 1 ? `<a class="primary" href="#${T.chapters[index + 1].id}">下一课：${T.chapters[index + 1].short} →</a>` : '<a class="primary" href="#debug">回到故障实验室 →</a>'}</div></section>`;
    navigation();
    $("#mark-complete").addEventListener("change", (event) => {
      if (event.target.checked) completed.add(current.id); else completed.delete(current.id);
      persist(); navigation();
    });
    $$('[data-quiz]').forEach((el) => {
      const answer = answers[el.dataset.quiz];
      if (answer !== undefined) showAnswer(el, answer);
    });
    if (current.id === "architecture") renderArchitecture(0);
    if (current.id === "trace") {
      traceStep = 0; renderTrace();
      $("#trace-prev").addEventListener("click", () => { traceStep--; renderTrace(); });
      $("#trace-next").addEventListener("click", () => { traceStep++; renderTrace(); });
    }
    if (current.id === "async") $("#run-race").addEventListener("click", runRace);
    if (current.id === "data") {
      $("#token-text").addEventListener("input", renderTokens);
      $("#token-window").addEventListener("input", renderTokens);
      renderTokens();
    }
    if (current.id === "debug") { activeLab = 0; renderLab(); }
    if (current.id === "graduate") {
      $("#diagnosis").value = typeof saved.diagnosis === "string" ? saved.diagnosis : "";
      $("#save-diagnosis").addEventListener("click", () => {
        saved.diagnosis = $("#diagnosis").value;
        if (persist()) toast("诊断草稿已保存在此浏览器。");
      });
      $("#download-diagnosis").addEventListener("click", () => {
        const text = `# 我的侧边对话助手诊断笔记\n\n${$("#diagnosis").value}\n`;
        const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url; link.download = "侧边对话助手-诊断笔记.md"; document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
    }
  }
  function showAnswer(element, index) {
    const q = T.quizzes[element.dataset.quiz];
    if (!q || !Number.isInteger(index) || index < 0 || index >= q.options.length) return;
    answers[element.dataset.quiz] = index;
    $$(".quiz-option", element).forEach((button, i) => button.setAttribute("aria-pressed", String(i === index)));
    const feedback = $(".feedback", element);
    feedback.className = `feedback${index === q.answer ? " correct" : ""}`;
    feedback.textContent = `${index === q.answer ? "✓ " : "再想一步："}${q.explanations[index]}`;
  }
  function renderArchitecture(index) {
    $("#architecture-map").innerHTML = T.architecture.map((item, i) => `<button class="${i === index ? "active" : ""}" data-architecture="${i}" aria-pressed="${i === index}"><span class="eyebrow">${item.caption}</span><strong>${item.name}</strong><span>${item.subtitle}</span></button>`).join("");
    $("#architecture-detail").innerHTML = T.architecture[index].body;
  }
  function renderTrace() {
    traceStep = Math.max(0, Math.min(T.trace.length - 1, traceStep));
    const step = T.trace[traceStep];
    $("#trace-nodes").innerHTML = T.trace.map((item, index) => `<button class="trace-node ${index === traceStep ? "active" : ""}" data-trace="${index}" aria-pressed="${index === traceStep}"><span>0${index + 1}</span>${item.title}</button>`).join("");
    $("#trace-info").innerHTML = `<span class="eyebrow">${step.place}</span><h3>${step.title}</h3><p>${step.text}</p><pre>${T.esc(step.data)}</pre>${T.source(step.path, step.find, "去源码看这一站")}`;
    $("#trace-count").textContent = `${traceStep + 1} / ${T.trace.length}`;
    $("#trace-prev").disabled = traceStep === 0;
    $("#trace-next").disabled = traceStep === T.trace.length - 1;
  }
  function runRace() {
    const guard = $("#race-guard").value === "guard";
    let generation = 0;
    let shown = "空";
    const aToken = ++generation;
    const bToken = ++generation;
    const events = [`① A 开始读取：token=${aToken}, generation=${aToken}`, `② 切到 B：token=${bToken}, generation=${generation}`];
    if (!guard || bToken === generation) shown = "B 的历史";
    events.push(`③ B 先返回：${bToken} === ${generation}，显示 ${shown}`);
    if (!guard || aToken === generation) shown = "A 的历史";
    events.push(guard ? `④ A 后返回：${aToken} !== ${generation}，丢弃过期结果` : "④ A 后返回：没有校验，直接覆盖当前界面");
    events.push(`\n最终：${shown} ${guard ? "✓ 符合预期" : "✗ 已被旧结果污染"}`);
    $("#race-output").textContent = events.join("\n");
  }
  function estimateTokens(value) {
    let tokens = 0;
    for (const character of value) tokens += character.codePointAt(0) > 0x7f ? 1 : 0.25;
    return Math.ceil(tokens);
  }
  function renderTokens() {
    const value = $("#token-text").value;
    const windowTokens = Number($("#token-window").value);
    const tokens = estimateTokens(value);
    const valid = Number.isInteger(windowTokens) && windowTokens >= 1024 && windowTokens <= 10000000;
    const budget = valid ? Math.floor(windowTokens * 0.9) : null;
    const remainder = valid ? budget - tokens : null;
    $("#token-stats").innerHTML = [[tokens, "文本估算 T"], [budget ?? "—", "90% 预算 B"], [remainder ?? "—", "剩余额度 B − T"]].map(([number, label]) => `<div class="stat"><strong>${number}</strong><span>${label}</span></div>`).join("");
    $("#token-meter").style.width = valid ? `${Math.min(100, tokens / budget * 100)}%` : "0%";
    $("#token-meter").style.background = valid && tokens > budget ? "#af4928" : "#275fce";
    $("#token-result").textContent = !valid ? "请输入 1024–10000000 的整数窗口大小。" : tokens > budget ? `拒绝：${tokens} > ${budget}，触发 CONTEXT_OVERFLOW。` : `允许：${tokens} ≤ ${budget}${tokens === budget ? "，等号恰好通过边界" : ""}。`;
  }
  function simulateLab(id, choice) {
    if (id === "delta") {
      let stored = ""; let temporary = "";
      for (const delta of ["Hello", " world"]) {
        temporary += delta;
        if (choice === 1) stored += delta; else stored = delta;
      }
      return { pass: stored === "Hello world", log: `输入 deltas = ["Hello", " world"]\n临时 UI = ${JSON.stringify(temporary)}\n后台变量 / 保存内容 = ${JSON.stringify(stored)}\ndone 后 UI = ${JSON.stringify(stored)}\n期望保存内容 = "Hello world"` };
    }
    if (id === "null") {
      const parse = (values) => {
        let result = "";
        for (const value of values) {
          if (choice === 1 && (value === null || value === undefined)) continue;
          if (choice === 2) { result += String(value); continue; }
          if (typeof value !== "string") throw new Error("PROTOCOL_FAILED");
          result += value;
        }
        return result;
      };
      let output;
      try { output = parse([null, "OK"]); } catch (error) { output = error.message; }
      let rejectedNumber = false;
      try { parse([7]); } catch { rejectedNumber = true; }
      return { pass: output === "OK" && rejectedNumber, log: `输入内容帧：[null, "OK"]\n可见结果：${JSON.stringify(output)}\n期望："OK"\n相邻输入：content = 7\n是否仍被拒绝：${rejectedNumber ? "是" : "否"}` };
    }
    const started = ["A"];
    const controller = new AbortController();
    const log = ["A 已进入业务逻辑；B 已排队，尚未取消。"];
    if (choice === 2) { controller.signal.throwIfAborted(); log.push("排队前检查：未取消，通过。"); }
    controller.abort();
    log.push("等待期间：B 取消。随后 A 完成。");
    try {
      if (choice === 1) controller.signal.throwIfAborted();
      started.push("B"); log.push("B 的 then 执行并进入 sendOnce ✗");
    } catch { log.push("B 的 then 执行，在 sendOnce 前退出 ✓"); }
    log.push(`进入业务逻辑的任务：${started.join(", ")}\n期望：只有 A`);
    return { pass: started.length === 1, log: log.join("\n") };
  }
  function renderLab() {
    const lab = T.labs[activeLab];
    $("#lab-tabs").innerHTML = T.labs.map((item, index) => `<button data-lab="${index}" class="${index === activeLab ? "active" : ""}" aria-pressed="${index === activeLab}">${item.label}</button>`).join("");
    $("#lab-panel").innerHTML = `<span class="number-tag">人为故障 · ${activeLab + 1} / ${T.labs.length}</span><h3>${lab.title}</h3><p>${lab.symptom}</p>${T.code(lab.broken, "人为破坏的教学片段")}${T.note("要维护的不变量", lab.invariant)}<label class="field">选择代码处理方式<select id="lab-patch">${lab.options.map((option, index) => `<option value="${index}">${option}</option>`).join("")}</select></label><div class="button-row"><button id="run-lab" class="primary">运行教学输入</button><span class="muted">不会执行或修改扩展项目</span></div><div id="lab-result" class="lab-result" aria-live="polite"></div>${T.reveal("运行后再看：定位证据与最小修复", `<p>${lab.explain}</p><p><strong>验收目标：</strong>${lab.expected}</p><div class="source-row">${T.source(lab.path, lab.find, "正确实现的位置")}${T.source(lab.test, lab.testFind, "相关项目测试")}</div>${T.code(lab.assertion, "断言思路 · 结合真实测试文件使用")}${T.code(lab.command, "项目测试命令 · 本页不会自动执行")}`)}`;
    $("#run-lab").addEventListener("click", () => {
      const result = simulateLab(lab.id, Number($("#lab-patch").value));
      $("#lab-result").innerHTML = `<div class="feedback ${result.pass ? "correct" : ""}">${result.pass ? "✓ PASS：这组教学输入满足不变量。" : "✗ FAIL：观察输出第一次偏离的位置。"}</div><pre class="terminal">${T.esc(result.log)}</pre><p class="muted">这是缩小模型的结果，不代表项目的 Vitest / Chrome 验证已经执行。</p>`;
    });
  }

  const paths = Object.keys(window.TEACH_SOURCES.files).sort();
  $("#source-file").innerHTML = paths.map((path) => `<option value="${T.esc(path)}">${T.esc(path)}</option>`).join("");
  function renderSource(find = "", advance = false) {
    const file = window.TEACH_SOURCES.files[sourcePath];
    if (!file) return;
    const lines = file.text.split("\n");
    const matches = find ? lines.map((line, index) => line.toLowerCase().includes(find.toLowerCase()) ? index : -1).filter((i) => i !== -1) : [];
    foundLine = advance && previousSearch === find ? (matches.find((i) => i > foundLine) ?? matches[0] ?? -1) : (matches[0] ?? -1);
    previousSearch = find;
    $("#source-title").textContent = sourcePath;
    $("#source-meta").textContent = `${lines.length} 行 · SHA-256 ${file.sha256.slice(0, 16)}… · ${date}${find ? ` · ${matches.length ? `${matches.length} 处匹配，当前 L${foundLine + 1}` : "未找到此文本；可按函数名重新查找"}` : ""}`;
    $("#source-code").innerHTML = lines.map((line, index) => `<span class="source-line ${index === foundLine ? "highlight" : ""}" id="source-line-${index + 1}"><span class="line-no">${index + 1}</span>${T.esc(line) || " "}</span>`).join("");
    const match = $(".source-line.highlight");
    if (match?.scrollIntoView) match.scrollIntoView({ block: "center" });
    else if (foundLine < 0) $(".source-scroll").scrollTop = 0;
  }
  function openSource(path = sourcePath, find = "") {
    if (!window.TEACH_SOURCES.files[path]) { toast("此文件不在课程快照中。"); return; }
    sourcePath = path;
    $("#source-file").value = path;
    $("#source-search").value = find;
    const dialog = $("#source-dialog");
    if (!dialog.open) dialog.showModal();
    renderSource(find);
  }
  $("#browse-source").addEventListener("click", () => openSource());
  $("#close-source").addEventListener("click", () => $("#source-dialog").close());
  $("#source-file").addEventListener("change", (event) => {
    sourcePath = event.target.value; previousSearch = ""; foundLine = -1;
    $("#source-search").value = ""; renderSource();
  });
  const findNext = () => renderSource($("#source-search").value.trim(), true);
  $("#source-find").addEventListener("click", findNext);
  $("#source-search").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); findNext(); } });
  $("#lesson-search").addEventListener("input", navigation);
  $("#print-lesson").addEventListener("click", () => window.print());
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const ref = event.target.closest("[data-source]");
    if (ref) { openSource(ref.dataset.source, ref.dataset.find || ""); return; }
    const answer = event.target.closest("[data-answer]");
    if (answer) { showAnswer(answer.closest("[data-quiz]"), Number(answer.dataset.answer)); return; }
    const node = event.target.closest("[data-trace]");
    if (node) { traceStep = Number(node.dataset.trace); renderTrace(); return; }
    const architecture = event.target.closest("[data-architecture]");
    if (architecture) { renderArchitecture(Number(architecture.dataset.architecture)); return; }
    const lab = event.target.closest("[data-lab]");
    if (lab) { activeLab = Number(lab.dataset.lab); renderLab(); return; }
    const token = event.target.closest("[data-token-example]");
    if (token) {
      $("#token-window").value = "1024";
      $("#token-text").value = token.dataset.tokenExample === "mixed" ? "test测" : "中".repeat(token.dataset.tokenExample === "boundary" ? 921 : 922);
      renderTokens();
    }
  });
  window.addEventListener("hashchange", () => {
    render();
    $("#lesson").focus({ preventScroll: true });
    window.scrollTo(0, 0);
  });
  // Expose only deterministic teaching models for the offline checks.
  window.TEACH_MODELS = { estimateTokens, simulateLab };
  render();
})();
