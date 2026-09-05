/* Course text and read-only source references. No build step or network required. */
(() => {
  const esc = (text) => String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const source = (path, find = "", label = path) => `<button class="source-link" data-source="${esc(path)}" data-find="${esc(find)}">${esc(label)} ↗</button>`;
  const code = (text, label = "教学简化示例", ref = "") => `<div class="codebox"><div class="codebox-top"><span>${esc(label)}</span>${ref}</div><pre><code>${esc(text)}</code></pre></div>`;
  const snippet = (path, find, count = 10) => {
    const lines = window.TEACH_SOURCES.files[path]?.text.split("\n") ?? [];
    const index = lines.findIndex((line) => line.includes(find));
    return code(index < 0 ? "源码锚点已变化，请在源码索引中查找该函数。" : lines.slice(index, index + count).join("\n"), `真实源码 · ${path} · L${index + 1}`, source(path, find, "打开上下文"));
  };
  const note = (title, text, kind = "") => `<aside class="callout ${kind}"><strong>${title}</strong><p>${text}</p></aside>`;
  const table = (headers, rows) => `<div class="table-wrap"><table><thead><tr>${headers.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((x) => `<td>${x}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const reveal = (title, body) => `<details><summary>${title}</summary><div>${body}</div></details>`;
  const quizzes = {};
  const quiz = (id, question, options, answer, explanations) => {
    quizzes[id] = { question, options, answer, explanations };
    return `<section class="quiz" data-quiz="${id}"><div class="quiz-label">先预测，再揭晓</div><h3>${question}</h3><div class="quiz-options">${options.map((option, i) => `<button class="quiz-option" data-answer="${i}" aria-pressed="false">${String.fromCharCode(65 + i)}. ${option}</button>`).join("")}</div><div class="feedback" aria-live="polite"></div></section>`;
  };
  const checklist = (items) => `<ul class="checklist">${items.map((item) => `<li><label><input type="checkbox"> <span>${item}</span></label></li>`).join("")}</ul>`;
  const chapters = [
    {
      id: "start", title: "先建立一张地图", short: "你的起点与路线", tag: "00 / ORIENTATION", time: "20–30 分钟", keywords: "入门 main 学习路线 算法 图 信息学 数学",
      intro: "你已经会分解问题、跟踪变量和构造反例。接下来要补的，是程序与浏览器、网络、时间打交道的方式。我们就用你自己的项目来学。",
      goal: "不看提示，用自己的话解释：这个扩展接收什么、做什么、把结果存在哪里。",
      body: `<div class="grid"><section class="card"><span class="number-tag">已经掌握</span><h3>把程序当作可推理的对象</h3><p>循环、函数、数组、图、复杂度、不变量、边界情况。这些能力仍然有效。例如 DOM 提取接近树遍历，词元预算是线性扫描，异步队列也可以画状态转移。</p></section><section class="card"><span class="number-tag">需要补齐</span><h3>从一次运行，转向持续响应</h3><p>浏览器会不断产生点击、选区、网络完成等事件。你要追踪的不只是调用关系，还包括：<strong>谁在何时、哪个环境里改变了状态。</strong></p></section></div>
      <h2>先用 4 句话描述你的项目</h2>
      <ol><li>你在 ChatGPT 已有对话里选中一段文字，扩展显示“侧边提问”。</li><li>点击后打开浮窗；输入并提交问题时，扩展读取页面已有主对话和相关附件。</li><li>Chrome 中的扩展后台把主对话、引用、侧聊历史与新问题组合，发给你配置的 AI 服务商。</li><li>答案分段回到浮窗，侧聊记录按原 ChatGPT 对话 ID 保存到本机。</li></ol>
      ${note("第一次就要分清", "本项目是 Chrome 扩展，主要使用原生 TypeScript 和 DOM API。没有 React/Vue，也没有仓库自建的远程后端。background 是浏览器中的后台服务；外部 AI 服务商是另一方。浮窗由页面里的 Shadow DOM 实现。")}
      <h2>换一个阅读单位：一次用户动作</h2>
      ${code("竞赛程序：输入 → main() → 计算 → 输出 → 结束\n\n这个扩展：浏览器加载入口 → 注册事件 → 等待\n                         ├─ 选区变化 → 显示按钮\n                         ├─ 点击提交 → 等网络 → 分段显示\n                         └─ 切换对话 → 取消旧请求 → 读新历史", "控制流的差别")}
      <p>不要从最大文件的第一行硬读到最后。先找一个动作，再沿着它经过的函数和数据前进。读一个函数时，写下五项：<strong>输入、输出、读取的状态、修改的状态、可能失败的地方</strong>。这就像先列出一道题的条件和结论。</p>
      <h2>按能力过关，不按翻页数过关</h2>
      ${table(["阶段", "课程", "能独立做到才算过关"], [["建立坐标", "01–03：运行、语言、架构", "能重新加载扩展；能解释一段 TS；能选对调试窗口。"], ["跟踪一次执行", "04–06：链路、异步、请求", "给一条消息标明来源和去向；解释旧结果为什么被丢弃。"], ["维护项目", "07–09：调试、练习、毕业", "先构造反例，再做最小修复，用测试与真实浏览器验收。"]])}
      <p>建议分 6–8 次学习，每次 40–60 分钟，给实验留出时间。这里的时长只是安排参考；不需要先学完整前端课程，也不用先背完所有语法。卡住时回到第 02 课查表达式。</p>
      ${quiz("start", "用户只点了“侧边提问”，还没提交问题。这时应该发生什么？", ["立刻调用 AI 服务商", "打开浮窗并保留引用，等待提交", "创建一个新的 ChatGPT 主对话"], 1, ["看 SidePanel.open：它更新引用和可见状态。网络请求由提交回调触发。", "正确。划词打开与发送问题是两个事件，分开追踪才能正确定位 bug。", "侧聊是扩展自己的记录，并不会因此创建 ChatGPT 主对话。"])}
      <h2>第一段源码，从你熟悉的地方开始</h2>
      ${snippet("src/background/context-budget.ts", "export function estimateTokens", 5)}
      <p>忽略类型标注，它就是：扫描字符串，对字符计权重，再向上取整。这里没有神秘的“前端魔法”。<code>codePointAt(0)!</code> 中的 <code>!</code> 是非空断言；<code>0x7f</code> 是十六进制的 127。第 06 课会把这段做成可操作的实验。</p>
      ${source("src/shared/types.ts", "export interface SendPayload", "先看看单次发送有哪些字段")}`
    },
    {
      id: "run", title: "让修改真正跑起来", short: "运行与开发闭环", tag: "01 / TOOLCHAIN", time: "35–50 分钟", keywords: "npm node 构建 build tsc dist esbuild 安装 扩展 chrome 运行 dev lint source map",
      intro: "第一次维护最容易遇到的假 bug：源码改了，浏览器还在运行旧版本。先打通“修改 → 验证 → 构建 → 重新加载”的闭环。",
      goal: "解释 src 与 dist 的关系，并独立完成一次构建和扩展重新加载。",
      body: `<h2>浏览器不直接执行你的 TypeScript 源文件</h2>
      ${code("你编辑的源码                    esbuild                 Chrome 读取\nsrc/content/index.ts     ─────── 打包 ───────→ dist/content.js\nsrc/background/index.ts  ─────── 打包 ───────→ dist/background.js\nsrc/options/index.ts     ─────── 打包 ───────→ dist/options.js\npublic/manifest.json     ─────── 复制 ───────→ dist/manifest.json", "构建关系 · 一个入口可打包多个被 import 的模块")}
      <p><strong>Node.js</strong> 是运行开发脚本的 JavaScript 环境；<strong>npm</strong> 管理依赖并运行 package.json 中的命令。<strong>TypeScript</strong> 加上类型检查，<strong>esbuild</strong> 去掉类型并打包依赖。你可以把它们分别类比解释器、包管理器、编译检查与链接过程，但产物仍然是 JavaScript。</p>
      <p><code>package.json</code> 声明直接依赖及命令；<code>package-lock.json</code> 记录实际依赖版本；<code>node_modules/</code> 是安装结果。通常不手改后两个，也不把生成的 <code>dist/</code> 当源码维护。</p>
      ${source("scripts/build.mjs", "await build", "核对三个真实打包入口")}
      <h2>第一次准备环境</h2>
      ${code('cd "/Users/alex/Alex/chrome-extension/gpt-ask-in-side-chat"\nnode --version\nnpm --version\n\n# 只在首次安装或需要按锁文件重新安装依赖时执行\nnpm ci\n\n# 检查类型、跑单元测试，然后构建\nnpm run verify', "在项目根目录的终端执行")}
      <p>当前项目声明 Node 版本为 <code>^20.19.0 || >=22.12.0</code>。已有可用依赖时，不必每次重新安装。<code>npm ci</code> 按锁文件安装，会重建 node_modules；它不是“运行项目”。</p>
      <ol><li>在 Chrome 地址栏输入 <code>chrome://extensions</code>，打开“开发者模式”。</li><li>点“加载已解压的扩展程序”，选择本项目的 <strong>dist 文件夹</strong>。</li><li>打开扩展设置，同意说明，填写服务商 Base URL、模型、上下文窗口和 API key，保存并授权。Base URL 形如 <code>https://provider.example/v1</code>，不是完整的 <code>/chat/completions</code> 地址；示例域名不可实际使用。</li><li>测试连接会调用你配置的服务商。随后打开或刷新自己的 <code>https://chatgpt.com/c/...</code> 对话页，选中文字后提交问题。</li></ol>
      ${note("每次改源码之后", "运行 <code>npm run build</code> → 在扩展管理页点击重新加载 → 刷新 ChatGPT 页面。只刷新网页不会重新构建，单独 build 也不会把旧 content script 从页面替换掉。重新加载扩展后，按当前设计通常需要重新输入会话密钥。", "good")}
      <h2>这份项目实际有哪些命令</h2>
      ${table(["命令", "作用", "它不能证明什么"], [["<code>npm run typecheck</code>", "运行 tsc --noEmit，检查类型", "类型正确不代表行为正确。"], ["<code>npm run test:run</code>", "Vitest 跑一次单元测试后退出", "happy-dom 不是完整 Chrome。"], ["<code>npm run build</code>", "删除并重建 dist", "esbuild 成功不等于通过类型检查。"], ["<code>npm run verify</code>", "依次类型检查、单测、构建", "不包含真实浏览器 E2E。"], ["<code>npm run e2e</code>", "构建测试版，Playwright 加载扩展", "测试页面和 API 是固定模拟数据。"], ["<code>npm run package</code>", "普通构建并生成 release 中的 zip", "打包不等于已发布到商店。"]])}
      <p>此项目没有 <code>npm run dev</code>、<code>npm start</code>、<code>npm run lint</code>。不要从别的项目照抄这些命令。<code>npm test</code> 在交互终端通常进入监听模式；一次性检查用 <code>test:run</code>。</p>
      ${note("E2E 后再做一次普通构建", "测试构建会给 dist/manifest.json 加入测试服务商权限。用来手动加载或打包前重新运行 build 或 package。若 Playwright 提示缺浏览器，可在允许联网的环境执行 <code>npx playwright install chromium</code> 后重试。")}
      ${quiz("run", "改了 src/content/ui/styles.ts，页面没变化。第一步应该检查什么？", ["是否 build、重新加载扩展并刷新了页面", "先重写整个浮窗组件", "把改动直接写进 dist/content.js"], 0, ["正确。先排除运行旧产物，这是开发环境问题，不必动业务逻辑。", "没有验证浏览器是否运行新代码，重写组件没有证据。", "下次 build 会覆盖 dist 中的手改内容。修改应留在 src。"])}
      <h2>你今天的第一次验收</h2>
      ${checklist(["在终端找到工作目录，读懂 package.json 的 scripts。", "能说出三个入口产物各由谁加载。", "完成构建与扩展重新加载；或清楚记录阻塞在哪一步。", "知道当前构建未启用 source map，DevTools 不一定直接显示 .ts。"])}
      ${source("package.json", "scripts", "查看真实脚本列表")}`
    },
    {
      id: "language", title: "把 TypeScript 翻译成你会的语言", short: "JS / TS 语法桥梁", tag: "02 / LANGUAGE BRIDGE", time: "50–70 分钟", keywords: "typescript javascript cpp c++ python 语法 const let map filter interface union as unknown 泛型 optional promise DOM CSS HTML 回调 闭包",
      intro: "不用先背一本 JavaScript 语法书。先掌握这个项目里反复出现的表达式，再区分：哪些在运行时做事，哪些只是给类型检查器看的。",
      goal: "把 SendPayload 和 buildChatMessages 中的关键表达式译成中文；解释 as 为什么不是校验。",
      body: `<h2>先会读这 10 种写法</h2>
      ${table(["项目里的写法", "可借用的已有知识", "必须记住的区别"], [["<code>let n = 0; const a = [];</code>", "变量；const 固定绑定", "const 数组仍可 push；固定的是引用绑定，不是深度不可变。"], ["<code>(text) => onEvent(text)</code>", "C++ lambda / Python lambda", "函数是值；交给别人，不代表现在执行。"], ["<code>items.map(f)</code> / <code>filter(p)</code>", "列表推导 / 循环构建新数组", "map 转换每项；filter 只保留判定为真的项。"], ["<code>const { role, content } = msg;</code>", "取 struct 字段 / dict 键", "解构是按属性名取值，不是按位置。"], ["<code>{ ...payload, sideMessages }</code>", "复制字段再添加或覆盖", "浅拷贝；嵌套对象并没有递归复制；后面的同名字段覆盖前面。"], ["<code>record?.messages ?? []</code>", "判空后访问；默认值", "?. 遇 null/undefined 返回 undefined；?? 仅对这两种值兜底，保留 0、false、空串。"], ["<code>quote?: QuoteReference</code>", "可选字段", "可能没有 quote；读取前要考虑 undefined。"], ["<code>import type { X } ...</code>", "跨文件引入类型名", "此导入只供检查；普通 import 则可能引入运行时代码。"], ["<code>Promise&lt;SideChatRecord&gt;</code>", "未来给出 SideChatRecord 的结果", "现在拿到的是 Promise，不是已完成的记录。"], ["<code>as T</code> / <code>value!</code>", "对编译器做类型断言", "不检查、不转换数据，也不能防止运行时 null。"]])}
      <h2>从集合与带标签的并集理解类型</h2>
      ${snippet("src/shared/types.ts", "export type PreparedAttachment", 3)}
      <p>把它看作两个集合的并：文本附件 ∪ 图片附件。<code>kind</code> 是标签。若已经检查 <code>attachment.kind === "text"</code>，TypeScript 就能缩小可能集合，允许读取 <code>text</code> 字段。这叫<strong>类型收窄</strong>。</p>
      ${snippet("src/shared/protocol.ts", "export type RuntimeResponse", 3)}
      <p><code>T</code> 是类型参数，类似 C++ 模板参数：成功时 value 的类型由调用处决定；失败时读 error。<code>interface</code> 像结构约定，不会像 Python dataclass 一样生成构造函数，也不会自动校验浏览器传进来的对象。</p>
      ${code('const data: unknown = JSON.parse(incoming);\n\n// 只告诉编译器相信我；没有改变 data\nconst claimed = data as SendPayload;\n\n// 真正执行逻辑，检查字段和关系\nif (isSendPayload(data)) {\n  // 此分支中，类型检查器也知道它满足 SendPayload\n  console.log(data.conversationId);\n}', "教学简化 · 类型声明与运行时检查")}
      <p>输入输出契约有两层：TypeScript 提前检查你写的调用；<code>isSendPayload</code> 在运行时检查实际收到的对象。它还检查消息序号连续、引用角色与来源一致等关系。数据“形状像”只是第一步，字段之间也要自洽。</p>
      ${source("src/shared/protocol.ts", "export function isSendPayload", "看真正执行的输入检查")}
      ${quiz("types", "JSON 中的 question 实际是数字 7。写 data as SendPayload 后会怎样？", ["自动转成字符串 '7'", "自动抛出类型错误", "运行时还是 7，只有检查器被说服了"], 2, ["as 不是 String()，不会做数据转换。", "类型断言本身不会执行校验；运行时检查需要显式逻辑。", "正确。所以跨环境输入先用 unknown，再检查字段；不要靠 as 给未知数据贴标签。"])}
      <h2>函数作为参数：以后请调用它</h2>
      ${snippet("src/content/index.ts", "const panel = new SidePanel", 4)}
      <p><code>onSend</code> 是属性名，值是一个函数。SidePanel 持有这个函数，在提交发生时调用。它能访问外层的 <code>start</code>、<code>generation</code> 等变量，这种“函数连同周围可用变量”的关系叫<strong>闭包</strong>。闭包捕获的变量会随程序变化，不能一概当成拍下来的常量。</p>
      <p>这里的 <code>void start(submission)</code> 表示调用但不使用返回值，不代表“同步执行完”。它也不会自动吞掉异常；异步错误仍需在恰当位置处理。</p>
      <h2>HTML、DOM、CSS 分别做什么</h2>
      ${code('<!-- HTML：描述结构 -->\n<button class="send">发送</button>\n\n/* CSS：决定表现 */\n.send { color: white; background: #172339; }\n\n// JavaScript：操作 DOM 对象，绑定行为\nconst button = document.querySelector(".send");\nbutton?.addEventListener("click", () => console.log("点击了"));', "教学简化 · 三段分别属于 HTML、CSS、JavaScript")}
      <p>浏览器把 HTML 变成对象树，这棵树叫 <strong>DOM</strong>。元素节点、文本节点是不同节点；<code>querySelector</code> 用 CSS 选择器找节点；<code>textContent</code> 读写文字；<code>addEventListener</code> 注册事件回调。CSS 的 <code>.name</code> 匹配 class，<code>[data-message-author-role]</code> 匹配带该属性的元素。</p>
      <p>你的项目用 <code>document.createElement</code> 动态创建浮窗，没有 JSX。<code>new SidePanel(...)</code> 创建类实例，构造函数建 DOM；实例字段保存界面状态，方法负责改变它。大文件可先读字段与对外方法，再按事件找内部实现。</p>
      ${source("src/content/ui/side-panel.ts", "constructor(private readonly document", "查看浮窗构造函数")}
      ${reveal("补充：JS 与竞赛 C++ 还有哪些容易踩坑的差别？", "<p>普通 number 是浮点数；整数精确范围不是任意大，超大整数另有 BigInt。判断值通常用 ===，避免 == 的隐式转换。对象、数组的 === 比较的是身份，不是内容逐项相等。数组越界常得到 undefined，而不一定立刻报错。对象和数组赋值会共享引用，想复制时要知道浅拷贝的边界。</p>")}
      <p class="muted">补充来源：<a href="https://www.typescriptlang.org/docs/handbook/2/everyday-types.html" target="_blank" rel="noopener noreferrer">TypeScript 官方：Everyday Types</a>。本课中的具体用法以源码快照为准。</p>`
    },
    {
      id: "architecture", title: "三个入口，三个运行环境", short: "架构与源码地图", tag: "03 / ARCHITECTURE", time: "35–50 分钟", keywords: "架构 content background options shared service worker DOM shadow manifest 文件 依赖 设置 索引",
      intro: "同一个仓库不等于同一个运行空间。先给每段代码标出它运行在哪里，就能回答：它可以访问什么，错误应该去哪里看。",
      goal: "从症状定位到 content、background 或 options，再找到对应源码与测试。",
      body: `<h2>点击一个运行环境，查看它负责什么</h2><div id="architecture-map" class="arch"></div><div id="architecture-detail" class="detail-panel" aria-live="polite"></div>
      <p><code>shared/</code> 是共享的类型、协议与错误定义，会被需要它的入口导入；它不是第四个常驻进程。Node.js 构建脚本又是另一个开发环境，<code>node:fs</code> 这样的文件 API 不属于页面里的 JavaScript。</p>
      ${note("后台不常驻，浮窗也不是浏览器原生侧栏", "MV3 后台由 Chrome 调度，不能把内存变量当永久数据库。浮窗实际是页面中的 aside + Shadow DOM：样式隔离有助于减少干扰，但不是数据保密边界。")}
      <h2>入口如何被加载：从 manifest 反查</h2>
      <p>manifest 的 <code>content_scripts.matches</code> 匹配 ChatGPT 页面；<code>background.service_worker</code> 指向 background.js；<code>options_page</code> 指向 options.html，HTML 再加载 options.js。把这个关系与上一课的构建图连起来，就有“浏览器 → 产物 → 源码入口”的完整路径。</p>
      <div class="source-row">${source("public/manifest.json", "content_scripts", "manifest 加载规则")}${source("public/options.html", "script", "设置页加载哪个脚本")}</div>
      <h2>症状 → 文件 → 测试</h2>
      ${table(["你要理解 / 维护什么", "先读", "再看测试"], [["划词按钮不出现", source("src/content/selection.ts", "quoteFromRange"), source("test/selection.test.ts", "describe")], ["主对话提取缺失", source("src/content/page-adapter.ts", "extractConversation"), source("test/extractor.test.ts", "describe")], ["浮窗、拖拽、发送键", source("src/content/ui/side-panel.ts", "export class SidePanel"), source("test/side-panel.test.ts", "describe")], ["Markdown / 公式显示", source("src/content/ui/markdown.ts", "renderMarkdown") + "<br>" + source("src/content/ui/math.ts", "extractMath"), source("test/side-panel.test.ts", "describe")], ["发给模型的上下文", source("src/background/request-builder.ts", "export function buildChatMessages"), source("test/request-builder.test.ts", "describe")], ["断流、状态码、协议解析", source("src/background/provider.ts", "streamChatCompletion"), source("test/provider.test.ts", "describe")], ["重试、排队、保存部分回复", source("src/background/chat-service.ts", "export class ChatService"), source("test/chat-service.test.ts", "describe")], ["密钥、模型、窗口偏好", source("src/background/settings.ts", "loadInternalSettings"), source("test/settings.test.ts", "describe")], ["本地历史读写", source("src/background/history-store.ts", "export class HistoryStore"), source("test/history-store.test.ts", "describe")]])}
      <h2>其余文件，按需打开</h2>
      ${table(["文件 / 目录", "职责与阅读时机"], [[source("src/content/extractor.ts", "serializeMessage"), "把 DOM 子树序列化为文字，保留代码、表格、链接；读页面提取时再深入。"], [source("src/content/attachments.ts", "prepareFile"), "提取附件描述，准备文本、PDF 或图片；附件失败时查看。"], [source("src/background/permissions.ts", "normalizeBaseUrl"), "校验 Base URL、生成主机授权模式、拼请求地址。"], [source("src/background/crypto.ts", "encryptJson"), "历史数据的加解密。通常先看存储调用者，不必先学实现细节。"], [source("src/shared/i18n.ts", "export"), "集中定义中文界面文案；最小文案修改从这里开始。"], ["<code>docs/</code>", "设计、发布和隐私说明；帮助理解意图，但遇到矛盾要核对当前代码和测试。"], [source("e2e/side-chat.spec.ts", "test("), "把多层接到一起的浏览器测试；理解单层后再读。"]])}
      ${quiz("architecture", "后台 provider.ts 的 fetch 失败，你应该优先看哪里？", ["只看 ChatGPT 页面 Network", "扩展 service worker 的 DevTools", "只看 TypeScript 类型提示"], 1, ["这个请求由后台发出，页面 Network 不是对应的执行上下文。", "正确。在扩展管理页打开 service worker 检查视图，观察后台的 Network 和错误。", "类型检查不能观察实际网络状态。"])}
      <p class="muted">运行环境依据：<a href="https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts" target="_blank" rel="noopener noreferrer">Chrome content scripts</a>、<a href="https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics" target="_blank" rel="noopener noreferrer">service worker 基础</a>。</p>`
    },
    {
      id: "trace", title: "沿着一次提问走到底", short: "一次请求的完整旅程", tag: "04 / EXECUTION TRACE", time: "45–60 分钟", keywords: "请求 调用链 payload quote requestId conversationId accepted delta done port SSE 协议 API 消息",
      intro: "选中“为什么可以交换极限与积分？”，输入“用一个反例说明”。现在让这次操作慢下来：每一站只追踪一个数据对象。",
      goal: "不看图，画出页面 → 后台 → 服务商 → 后台 → 页面，并标出 accepted、delta、done 的含义。",
      body: `<div id="request-trace" class="trace"><span class="eyebrow">FOLLOW THE DATA · 逐步跟踪</span><div class="trace-nodes" id="trace-nodes"></div><div class="trace-info" id="trace-info" aria-live="polite"></div><div class="trace-controls"><button id="trace-prev">← 上一步</button><output id="trace-count"></output><button id="trace-next">下一步 →</button></div></div>
      <h2>同样叫“消息”，其实是 3 层对象</h2>
      ${table(["层次", "作用", "关键字段"], [["主对话 / 侧聊记录", "描述内容与来源", "MainMessage、QuoteReference、SideMessage"], ["扩展消息协议", "让两个运行环境协作", "type、requestId、payload / text / record"], ["服务商 HTTP 请求", "按照服务商接口提交任务", "model、messages、stream: true"]])}
      <p><code>SendPayload</code> 并不是直接发给服务商的 JSON。后台先验证它，再通过 <code>buildChatMessages</code> 组装模型 messages。协议中的 <code>requestId</code> 用于扩展内部对齐回包，不是模型对话 ID。</p>
      ${snippet("src/shared/types.ts", "export interface SendPayload", 8)}
      ${snippet("src/shared/protocol.ts", "export type StreamServerMessage", 5)}
      <h2>扩展两端如何“对话”</h2>
      <p>简单的一问一答，如读取设置，用 <code>chrome.runtime.sendMessage</code>；持续产生结果的流式回复，用 <code>chrome.runtime.connect</code> 创建 Port。它们传递可序列化的数据，不是让另一端直接访问本端函数或变量。</p>
      <div class="grid"><div class="card"><h3>页面这一端</h3><p>创建名为 side-chat-stream 的端口，注册 onMessage，再发 start。收到 delta 调 appendDelta；收到 done 用正式记录替换临时显示。</p>${source("src/content/index.ts", 'chrome.runtime.connect({ name: "side-chat-stream" })', "读发送与接收端")}</div><div class="card"><h3>后台这一端</h3><p>监听 onConnect，验证端口名与消息结构，创建 AbortController，把 ChatService 的事件转成端口消息。</p>${source("src/background/index.ts", "chrome.runtime.onConnect", "读后台路由")}</div></div>
      ${note("accepted 并不表示 API 已成功", "accepted 在配置、权限、上下文等前置检查后发出，实际 fetch 在它之后。done 则要等流正常结束并且历史保存成功，才能发回完整记录。把这两个时点分清，日志才有诊断价值。")}
      <h2>3 个标识，各自回答不同问题</h2>
      ${table(["标识", "回答的问题", "例子"], [["<code>conversationId</code>", "属于哪段 ChatGPT 对话？", "A 对话与 B 对话的历史分开保存。"], ["<code>requestId</code>", "这是哪一次请求的事件？", "旧请求的 delta 不应拼进新请求。"], ["<code>generation</code>", "页面逻辑是否已经进入了下一代？", "等待 A 历史时切到 B；A 的晚到结果失效。"]])}
      ${quiz("trace", "已经显示 accepted，接着出现 401。这两件事矛盾吗？", ["矛盾，accepted 代表 HTTP 200", "不矛盾，accepted 是扩展前置检查通过", "401 只能来自页面提取"], 1, ["accepted 不是服务商返回的 HTTP 状态，是本地业务事件。", "正确。先前置检查，再调用服务商；服务商仍可能拒绝密钥。", "401 通常是服务商身份验证失败，provider 将其映射成对应错误码。"])}
      <h2>练习：只记形状，不记所有字段</h2><p>合上源码，口述这条链：<strong>Range → QuoteReference → PanelSend → SendPayload → 模型 messages → SSE 帧 → delta → SideChatRecord</strong>。卡在哪个箭头，就打开那一站的函数，而不是重新通读全仓库。</p>
      <p class="muted">扩展通信机制：<a href="https://developer.chrome.com/docs/extensions/develop/concepts/messaging" target="_blank" rel="noopener noreferrer">Chrome 官方 Message passing</a>。</p>`
    }
  ];

  window.TEACH = { esc, source, code, snippet, note, table, reveal, quiz, checklist, chapters, quizzes };
})();
