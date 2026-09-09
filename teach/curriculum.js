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
      <ol><li>你在 ChatGPT 已有对话里选中一段文字，扩展显示“在侧栏中提问”。</li><li>点击后打开浮窗；输入并提交问题时，扩展读取页面已有主对话和相关附件。</li><li>Chrome 中的扩展后台把主对话、引用、侧聊历史与新问题组合，发给你配置的 AI 服务商。</li><li>答案分段回到浮窗，侧聊记录按原 ChatGPT 对话 ID 保存到本机。</li></ol>
      ${note("第一次就要分清", "本项目是 Chrome 扩展，主要使用原生 TypeScript 和 DOM API。没有 React/Vue，也没有仓库自建的远程后端。background 是浏览器中的后台服务；外部 AI 服务商是另一方。浮窗由页面里的 Shadow DOM 实现。")}
      <h2>换一个阅读单位：一次用户动作</h2>
      ${code("竞赛程序：输入 → main() → 计算 → 输出 → 结束\n\n这个扩展：浏览器加载入口 → 注册事件 → 等待\n                         ├─ 选区变化 → 显示按钮\n                         ├─ 点击提交 → 等网络 → 分段显示\n                         └─ 切换对话 → 取消旧请求 → 读新历史", "控制流的差别")}
      <p>不要从最大文件的第一行硬读到最后。先找一个动作，再沿着它经过的函数和数据前进。读一个函数时，写下五项：<strong>输入、输出、读取的状态、修改的状态、可能失败的地方</strong>。这就像先列出一道题的条件和结论。</p>
      <h2>按能力过关，不按翻页数过关</h2>
      ${table(["阶段", "课程", "能独立做到才算过关"], [["建立坐标", "01–03：运行、语言、架构", "能重新加载扩展；能解释一段 TS；能选对调试窗口。"], ["跟踪一次执行", "04–06：链路、异步、请求", "给一条消息标明来源和去向；解释旧结果为什么被丢弃。"], ["维护项目", "07–09：调试、练习、毕业", "先构造反例，再做最小修复，用测试与真实浏览器验收。"]])}
      <p>建议分 6–8 次学习，每次 40–60 分钟，给实验留出时间。这里的时长只是安排参考；不需要先学完整前端课程，也不用先背完所有语法。卡住时回到第 02 课查表达式。</p>
      ${quiz("start", "用户只点了“在侧栏中提问”，还没提交问题。这时应该发生什么？", ["立刻调用 AI 服务商", "打开浮窗并保留引用，等待提交", "创建一个新的 ChatGPT 主对话"], 1, ["看 SidePanel.open：它更新引用和可见状态。网络请求由提交回调触发。", "正确。划词打开与发送问题是两个事件，分开追踪才能正确定位 bug。", "侧聊是扩展自己的记录，并不会因此创建 ChatGPT 主对话。"])}
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
      ${table(["文件 / 目录", "职责与阅读时机"], [[source("src/content/extractor.ts", "serializeMessage"), "把 DOM 子树序列化为文字，保留代码、表格、链接；读页面提取时再深入。"], [source("src/content/attachments.ts", "prepareFile"), "提取附件描述，准备文本、PDF 或图片；附件失败时查看。"], [source("src/background/permissions.ts", "normalizeBaseUrl"), "校验 Base URL、生成主机授权模式、拼请求地址。"], [source("src/background/crypto.ts", "encryptJson"), "历史数据的加解密。通常先看存储调用者，不必先学实现细节。"], [source("src/shared/i18n.ts", "export"), "保存部分通用中文文案；其它文案可能直接写在组件中，先搜索文字或 key 确认位置。"], ["<code>docs/</code>", "设计、发布和隐私说明；帮助理解意图，但遇到矛盾要核对当前代码和测试。"], [source("e2e/side-chat.spec.ts", "test("), "把多层接到一起的浏览器测试；理解单层后再读。"]])}
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
      ${note("accepted 并不表示 API 已成功", "accepted 在配置、权限、上下文等前置检查后发出，正式回答的 fetch 在它之后；若需要摘要压缩，摘要请求会在 accepted 之前发生。done 则要等流正常结束并且历史保存成功，才能发回完整记录。把这两个时点分清，日志才有诊断价值。")}
      <h2>3 个标识，各自回答不同问题</h2>
      ${table(["标识", "回答的问题", "例子"], [["<code>conversationId</code>", "属于哪段 ChatGPT 对话？", "A 对话与 B 对话的历史分开保存。"], ["<code>requestId</code>", "这是哪一次请求的事件？", "旧请求的 delta 不应拼进新请求。"], ["<code>generation</code>", "页面逻辑是否已经进入了下一代？", "等待 A 历史时切到 B；A 的晚到结果失效。"]])}
      ${quiz("trace", "已经显示 accepted，接着出现 401。这两件事矛盾吗？", ["矛盾，accepted 代表 HTTP 200", "不矛盾，accepted 是扩展前置检查通过", "401 只能来自页面提取"], 1, ["accepted 不是服务商返回的 HTTP 状态，是本地业务事件。", "正确。先前置检查，再调用服务商；服务商仍可能拒绝密钥。", "401 通常是服务商身份验证失败，provider 将其映射成对应错误码。"])}
      <h2>练习：只记形状，不记所有字段</h2><p>合上源码，口述这条链：<strong>Range → QuoteReference → PanelSend → SendPayload → 模型 messages → SSE 帧 → delta → SideChatRecord</strong>。卡在哪个箭头，就打开那一站的函数，而不是重新通读全仓库。</p>
      <p class="muted">扩展通信机制：<a href="https://developer.chrome.com/docs/extensions/develop/concepts/messaging" target="_blank" rel="noopener noreferrer">Chrome 官方 Message passing</a>。</p>`
    }
  ];

  chapters.push(
    {
      id: "async", title: "程序与时间：异步和状态", short: "异步、竞态与取消", tag: "05 / TIME & STATE", time: "50–70 分钟", keywords: "异步 await async Promise 事件循环 闭包 状态机 竞态 race generation abort 队列 finally 单线程",
      intro: "算法题经常给你一个确定的输入序列。界面程序还要处理：A 比 B 先开始，却比 B 晚结束。许多难复现的 bug 就藏在这个顺序里。",
      goal: "用时间线解释 await、旧结果过滤、同对话排队与取消，而不是只会背定义。",
      body: `<h2>await 暂停当前函数，不冻结整个浏览器</h2>
      ${code('async function load() {\n  console.log("A：开始");\n  await Promise.resolve();\n  console.log("B：恢复");\n}\nload();\nconsole.log("C：调用者继续");', "教学实验 · 先预测输出顺序")}
      ${quiz("await", "上面的输出顺序是什么？", ["A → B → C", "A → C → B", "C → A → B"], 1, ["即使 Promise 已成功，await 后的继续执行也要等待当前同步代码结束。", "正确。调用 async 函数时先同步运行到 await；调用者继续，之后才恢复函数。", "async 不意味着函数体立即整体排到后台；A 会在当前调用里先输出。"])}
      <p><code>async</code> 函数总是返回 Promise。Promise 可处于 pending（待定）、fulfilled（成功）或 rejected（失败）；<code>await</code> 成功时取结果，失败时抛出异常。Promise 的继续执行通过任务调度安排，不等于新开一个线程。</p>
      <p>把浏览器事件循环想成调度员：先执行当前这段同步代码，再处理后续待执行的回调。你注册的 <code>.then(fn)</code> 与 <code>addEventListener(..., fn)</code> 是“到时请执行 fn”，不是“已经执行过 fn”。不要把所有异步写法机械理解成并行。</p>
      <h2>实验：切到 B 后，A 的历史才回来</h2>
      <div class="card"><p>点击运行，对比是否校验 generation。这里固定完成顺序为 <strong>B 先完成、A 后完成</strong>，模拟的是项目 loadConversation 的旧结果保护；不访问真实历史。</p><label class="field">旧结果处理<select id="race-guard"><option value="guard">检查 token 与 generation（当前项目的思路）</option><option value="none">直接接受每一个返回结果（人为故障）</option></select></label><div class="button-row"><button id="run-race" class="primary">按这个顺序运行</button></div><div id="race-output" class="race-log" aria-live="polite">等待运行。先预测：最后浮窗显示 A 还是 B？</div></div>
      ${snippet("src/content/index.ts", "async function loadConversation", 10)}
      <p>把 generation 看作一个单调递增的“世代编号”。开始任务时用局部 <code>token</code> 记下编号；异步结果回来时，只接受仍属于当前世代且当前 conversation ID 一致的结果。<code>disposed</code> 还防止页面已销毁后的更新。这些判断是在保护<strong>界面状态属于当前对话</strong>这一不变量。</p>
      <h2>单线程为什么还需要排队？</h2>
      ${code("A 读历史 [旧消息] → await 网络 ─────→ 写 [旧消息, A]\nB 读历史 [旧消息] → await 网络 ───────────→ 写 [旧消息, B]\n\n后一次写入把 A 覆盖了。问题是异步读改写交错，不要求两个线程。\n解决思路：同一对话 A 完成后 B 才开始读；不同对话各排各的队。", "竞态反例 · 时间向右")}
      ${snippet("src/background/chat-service.ts", "async send(payload:", 11)}
      <p><code>tails</code> 是 Map：key 是 conversationId，value 是该对话队尾的 Promise。<code>previous.catch(() => {})</code> 让上一轮失败不至于永久卡住队列；随后才执行本轮。队尾清理还要确认它仍是当前队尾，避免旧任务清理掉后继任务。</p>
      <h2>取消是信号，不是时间倒流</h2>
      <p><code>AbortController.abort()</code> 标记 signal 已取消，并通知支持它的操作。它不会撤回已经发生的副作用，也不会自动从 Promise 链里删掉排队回调。因此排到自己时，还要 <code>signal.throwIfAborted()</code>。本项目在切换对话、离开页面、清空历史时会取消请求，没有必要假设存在一个“停止生成”按钮。</p>
      ${note("清空历史要保证时序", "后台先 abort 正在进行的任务，等待它们结束并完成 finally，再删除历史。若先删除，晚到的 finally 可能把记录重新写回来。维护清空逻辑时，用时间线验证，不要只看有没有 delete 调用。")}
      ${source("src/background/index.ts", "async function clearConversation", "核对 abort → 等待 → 删除")}
      <h2>try / catch / finally 是副作用的边界</h2>
      <p><code>try</code> 放可能失败的操作，<code>catch</code> 处理失败，<code>finally</code> 在这段执行离开时做收尾。本项目在流式阶段的 finally 保存已收到的非空回答；异常时仍标为 incomplete。配置、权限、预算失败在这个 try 之前，不会因此新增聊天消息。</p>
      ${quiz("async", "清空历史时，为什么先等被取消的任务结束，再删除？", ["为了故意让按钮慢一点", "防止在途任务的 finally 把历史又写回来", "因为 IndexedDB 不能删除单条记录"], 1, ["等待有明确的数据一致性目的，不是人为延时。", "正确。取消和写入结束不是同一个瞬间，要处理晚到的保存副作用。", "HistoryStore.delete 能按 conversationId 删除；问题是并发时序。"])}
      <p class="muted">语义参考：<a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function" target="_blank" rel="noopener noreferrer">MDN async function</a>。队列与 generation 是这个项目自己的实现策略。</p>`
    },
    {
      id: "data", title: "数据怎样进来、发出和留下", short: "上下文、流与存储", tag: "06 / DATA & BOUNDARIES", time: "50–70 分钟", keywords: "token 词元 预算 context 压缩 request-builder SSE 流 缓冲 UTF8 JSON 网络 storage 密钥 历史 加密 Markdown 数学 KaTeX 安全 DOMPurify",
      intro: "这一课把工程逻辑还原成你熟悉的函数：输入经过哪些变换，受哪些约束，哪些数据会跨越边界。",
      goal: "算清一个预算例子，解释网络 chunk 不等于消息，并说出配置、密钥、历史的不同存储位置。",
      body: `<h2>请求构造是一个数据变换函数</h2>
      ${code("输入：主对话 + 附件 + 侧聊历史 + 当前引用 + 当前问题\n                         ↓ buildChatMessages\n输出：\n[\n  system：回答规则与引用边界,\n  user：主对话 JSON / 摘要 + 附件,\n  ...历史侧聊消息,\n  user：{ selectedQuote, question }\n]", "当前项目的组装顺序 · 示意，不是完整 JSON")}
      <p>文本附件放进上下文 JSON；图片附件使用 image_url 内容块。历史里未完成的 assistant 消息会加上“未完成片段”的说明，历史 user 引用也会保留。<code>buildChatMessages</code> 本身主要负责组装，不负责读取页面或发网络请求。</p>
      ${source("src/background/request-builder.ts", "export function buildChatMessages", "逐行读请求构造")}
      <h2>动手算：词元估算与预算</h2>
      <p>这个项目使用简单估计：<strong>T = ceil(ASCII 字符数 × 0.25 + 非 ASCII 码点数)</strong>。预算 <strong>B = floor(窗口大小 × 0.9)</strong>；只有 T &gt; B 才拒绝，等号允许。你可以直接用临界点构造测试。</p>
      <div class="card"><div class="field-grid"><label class="field">待估算的文本<textarea id="token-text">test测</textarea></label><label class="field">模型上下文窗口<input id="token-window" type="number" min="1024" max="10000000" step="1" value="1024"><small class="muted">真实设置允许 1024–10000000 的整数</small></label></div><div id="token-stats" class="stat-grid"></div><div class="meter" aria-hidden="true"><div id="token-meter"></div></div><output id="token-result" aria-live="polite"></output><div class="button-row"><button class="secondary" data-token-example="boundary">填入刚好到边界的文本</button><button class="secondary" data-token-example="overflow">再多一个字符</button><button class="secondary" data-token-example="mixed">还原 test测</button></div><p class="muted">实验只估算输入框文本。真实发送估算的是 JSON.stringify(messages)，包含 system、结构字符、附件与历史；这里不是实际请求费用计算器。</p></div>
      ${snippet("src/background/context-budget.ts", "export function assertWithinBudget", 10)}
      ${note("估算不是官方 tokenizer", "这套权重是项目的启发式规则，不是模型精确分词器。预留 10% 也不能数学保证任意模型、输出长度或多模态请求必定被服务商接受。遇到服务商拒绝，仍要看真实错误。", "warn")}
      <h2>“压缩旧上下文”究竟压缩什么</h2>
      <p>只有初始预算超限，且用户允许压缩时，ChatService 才会调用压缩逻辑。虽然字段叫 compressOldContext，当前代码实际遍历<strong>所有捕获的主对话消息</strong>，分块请求摘要，再以摘要替换请求中的主对话部分。它不删除 ChatGPT 原文，也不删除本地侧聊历史。</p>
      <p>摘要请求也受预算限制；压缩后会再次检查总预算。压缩会增加服务商调用，摘要还可能丢细节，因此并不是一个保证成功的无损算法。</p>
      ${source("src/background/chat-service.ts", "private async compress", "看分块摘要实现")}
      <h2>流式响应：先拼字节，再拼事件，再取文字</h2>
      ${code('网络块 1：data: {"choices":[{"del\n网络块 2：ta":{"content":"你好"}}]}\n\n\n\n正确读取：bytes → TextDecoder → buffer → 完整 SSE 帧 → JSON\n                                                 ↓\n                                      choices[0].delta.content\n\n结束标记（此接口约定）：data: [DONE]', "SSE 边界示意 · 网络可以在任意位置分块")}
      <p>一次 <code>reader.read()</code> 可能只拿到半个事件，也可能拿到多个事件。UTF-8 的一个字符也可能跨多个字节块，所以需要流式 TextDecoder；buffer 留住不完整事件，遇到空行边界后再解析。<code>[DONE]</code> 是本项目服务商协议的结束标记，不是所有 SSE 都使用的标准标记。</p>
      <p>某些合法帧不含可见文字，例如 content 为 null；解析器应忽略它们。HTTP 200 只说明请求成功到达这一步，后续流还可能断开、格式错误，或者没有正常结束。</p>
      <div class="source-row">${source("src/background/provider.ts", "const decoder = new TextDecoder", "buffer 与事件边界")}${source("test/provider.test.ts", "one byte at a time", "查看跨字节流测试")}</div>
      <h2>三个数据抽屉，不同生命周期</h2>
      ${table(["数据", "保存在哪里", "维护时的判断"], [["服务商配置、使用说明同意、浮窗位置", "<code>chrome.storage.local</code>", "持久化设置。窗口位置还会规范化和限制范围。"], ["API 密钥", "<code>chrome.storage.session</code>", "内存中的扩展会话数据。浏览器重启，以及扩展禁用、重载、更新会清空。"], ["侧聊记录", "扩展的 <code>IndexedDB</code>", "按 conversationId 保存加密 JSON；不依赖当前浮窗一直存在。"]])}
      <p>公开配置响应只提供 hasSessionKey，不返回密钥本身。密钥与完整规范化 Base URL 绑定，包括路径；改模型名不使它失效，换服务端点可能使它失效。输入框不回填已存密钥，也是当前设计。</p>
      ${note("理解加密的实际边界", "历史使用 AES-GCM，加密密钥也存放在同一个本地 IndexedDB 的 meta 表。它不是云端账户同步或基于用户密码的端到端加密，不能宣称有本机访问权限的人绝对读不到。")}
      <div class="source-row">${source("src/background/settings.ts", "export function publicSettings", "公开设置排除密钥")}${source("src/background/history-store.ts", "private async loadOrCreateHistoryKey", "历史密钥存放位置")}</div>
      <h2>公式与 Markdown：不要绕过净化</h2>
      <p>模型回复是外部输入。项目先保护代码区并提取公式，再用 marked 解析 Markdown、DOMPurify 净化 HTML、限制链接，最后插入 KaTeX 结果。数学公式解析失败时回退为原文。修“公式显示不出来”时，不能以删除净化逻辑作为捷径。</p>
      ${source("src/content/ui/markdown.ts", "export function renderMarkdown", "查看实际渲染流水线")}
      ${quiz("data", "Chrome 重新加载扩展后，模型配置还在，但提示缺少 API key。第一判断是什么？", ["IndexedDB 加密必然坏了", "先核对 session 密钥的生命周期，这是可能的预期行为", "把密钥打印到页面 Console 排查"], 1, ["配置和密钥使用不同存储，与历史解密不是同一条链。", "正确。先根据存储设计判断预期，再排查；不要把生命周期差异当成同一个存储 bug。", "日志不需要暴露密钥。看 hasSessionKey、端点绑定与错误码即可。"])}
      <p class="muted">机制来源：<a href="https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events" target="_blank" rel="noopener noreferrer">MDN SSE</a>、<a href="https://developer.chrome.com/docs/extensions/reference/api/storage" target="_blank" rel="noopener noreferrer">Chrome storage 生命周期</a>。具体估算、压缩和存储策略来自当前代码。</p>`
    },
    {
      id: "debug", title: "像构造反例一样修 bug", short: "故障实验室", tag: "07 / DEBUG LAB", time: "60–90 分钟", keywords: "bug 调试 复现 测试 断点 DevTools 控制台 日志 故障 lab 回归 += null abort 401 429",
      intro: "不要从“感觉哪里不对”直接跳到改代码。先定义预期，再找最小反例，逐层观察数据，最后只修导致偏差的那一处。",
      goal: "完成三个教学故障，说明每个失败输入、最小修复和测试的证据边界。",
      body: `<h2>你的调试模板</h2>
      ${code("1. 预期：给定输入 x，应出现结果 y。\n2. 实际：结果是 z，在哪个环境、什么顺序下出现？\n3. 复现：把复杂操作缩减成最少步骤 / 固定测试输入。\n4. 假设：列 2–3 个可能原因，每个配一个可否定的观察。\n5. 定位：找出数据第一次偏离预期的位置。\n6. 修复：只改根因，保留相邻边界与已有保护。\n7. 验证：原反例通过 + 相邻边界 + 相关回归 + 浏览器操作。", "把调试写成一个可检查的论证")}
      <h2>故障实验室：先看失败，再选择修复</h2>
      <p>以下三个案例都<strong>人为破坏了一处逻辑</strong>，用于训练；不代表当前项目存在这些 bug。运行的是本页中的缩小模型，不调用服务商，也不会改动真实扩展。终端里的项目测试需要你另行运行。</p>
      <div class="lab-tabs" id="lab-tabs" aria-label="选择教学故障"></div><div id="lab-panel" class="card"></div>
      <h2>如何读一个测试：安排 → 操作 → 断言</h2>
      ${snippet("test/context-budget.test.ts", 'it("allows the ninety-percent', 11)}
      <p><code>it</code> 给一个用例命名；<code>expect</code> 写结论。<code>expect(() => f()).toThrow()</code> 传函数给测试框架，让它调用并捕获异常。不能先执行 f() 再交结果，否则异常会在断言前发生。</p>
      <p><code>vi.fn()</code> 可以记录调用，也可以替代外部依赖。在 ChatService 测试中，假的 stream 主动回调两个 delta，就能稳定复现累加错误，不必真实付费问一次模型。<strong>Mock 的价值是控制输入和时序；边界是它不能证明真实网络一定按模拟行为工作。</strong></p>
      <h2>断点与日志，放在能区分假设的地方</h2><p><strong>跟做一次：</strong>打开扩展 service worker 的 Sources，在后台收到 start 后创建 AbortController 的语句处打断点。提交一个测试问题，暂停时查看 message.type、requestId、payload.conversationId；单步跟到 chatService.send，判断接下来是在排队、前置检查还是已开始网络请求。继续执行后清除断点。这次真实请求会使用你自己的服务商配置。</p>
      ${table(["观察目标", "去哪里", "先观察什么"], [["选区、提取、浮窗", "ChatGPT 页面 DevTools；选对 content script 上下文", "是否进入回调；extraction.certain；消息数量；当前 ID。"], ["模型请求、SSE、保存", "扩展管理页 → service worker 检查视图", "请求状态码；delta 长度；done 记录；异常堆栈。"], ["设置、授权", "设置页的 DevTools；内嵌时选对应 iframe", "表单值；权限结果；hasSessionKey。"], ["扩展加载失败", "chrome://extensions 错误区", "manifest 路径、权限、产物是否存在。"]])}
      <p>在 Sources 找对应产物中的函数名，必要时格式化后打断点；当前构建没有 source map，不能保证看到原 .ts 文件。暂停后看局部变量和调用栈，跨异步边界则用 requestId 关联日志。临时日志只记录必要元信息，如 type、长度、ID；不要打印密钥或整段私人对话。</p>
      ${note("调试器也会影响实验", "打开 service worker DevTools 会使后台保持活跃。怀疑休眠 / 生命周期问题时，要关掉检查窗口再复测。否则你的观察工具改变了被观察的条件。")}
      <h2>快速分流：先知道失败在哪一层</h2>
      ${table(["现象", "先检验的假设"], [["划词没有按钮", "是否同意说明并刷新？是否同一条 user/assistant 消息？页面角色标记是否仍可识别？"], ["提示提取不确定", "看 page-adapter 的 candidates 与 certain；不要粗暴放宽到全部 div。"], ["PERMISSION_REQUIRED / KEY_REQUIRED", "区分未同意、未配置、未授权、无有效 session key。"], ["401 / 403", "服务商验证失败：检查端点与密钥绑定。"], ["429", "服务商频率或额度限制，不一定是 UI 发送坏了。"], ["200 后 PROTOCOL_FAILED", "检查 SSE 帧、null 内容、异常类型、是否收到 [DONE]。"], ["刷新后记录异常", "先比较 done record 与 HistoryStore 写入，再查加载和显示。"]])}
      ${quiz("debug", "一段 delta 的测试通过了，能证明多段累加正确吗？", ["能，单段与多段是同一类型", "不能，赋值和累加在只有一段时恰好结果相同", "只有真实 API 才能测多段"], 1, ["输入类型相同不代表覆盖了不同执行路径；循环次数会改变反例。", "正确。单段无法区分 = 与 +=，两段就是更有辨识力的测试。", "用假的 stream 连续调用 onDelta 两次，就能离线测试。"])}
      <p class="muted">调试窗口和生命周期行为参考：<a href="https://developer.chrome.com/docs/extensions/get-started/tutorial/debug" target="_blank" rel="noopener noreferrer">Chrome 官方 Debug extensions</a>。</p>`
    },
    {
      id: "maintain", title: "从会看，走到敢改", short: "分级维护实战", tag: "08 / MAINTENANCE", time: "分 3 次练习", keywords: "维护 改代码 git diff commit 回滚 实战 文件 练习 test 红绿 测试任务 i18n DOM selector",
      intro: "维护能力来自一轮轮小闭环。先完成一个可撤回、可验证的改动，再碰协议、存储和异步链路。",
      goal: "独立完成 teach 中的练习文件，写出失败原因与验证结果；为一次真实改动列清文件范围。",
      body: `<h2>练习 A · 真正动手改一行（只在 teach 内）</h2>
      <div class="card"><span class="number-tag">入门 · 字符串不变量</span><h3>修复流式文本的累加</h3><p>打开 <code>teach/labs/delta-exercise.mjs</code>。文件里故意把累加写成覆盖，有两个可直接运行的断言。先运行，看到两段输入失败，再自己修改函数。</p>
      ${code('cd "/Users/alex/Alex/chrome-extension/gpt-ask-in-side-chat"\nnode teach/labs/delta-exercise.mjs', "无需额外依赖 · 练习初始失败是预期现象")}
      <p>先写下：输入 ["Hello", " world"]，目标输出 "Hello world"；正确不变量是第 k 次后保存 δ₁ + … + δₖ。修好后再试空数组、空片段、三个中文片段。不要删除断言让程序“通过”。</p>
      ${reveal("做完再看：验收与最小答案", "<p>把循环里的 <code>answer = delta</code> 改为 <code>answer += delta</code>。两条断言都通过，终端输出通过提示。随后应能解释为什么一个片段的测试抓不到覆盖错误。这个缩小模型只证明拼接逻辑；项目中还要检查 done 与持久化记录。</p>")}</div>
      <h2>练习 B · 用已有测试理解页面变化（先只读）</h2>
      <div class="card"><span class="number-tag">中级 · DOM 与选择器</span><h3>ChatGPT 的消息容器换了标签，就必须改插件吗？</h3><p>假设一条消息从 <code>&lt;article data-message-author-role="assistant"&gt;</code> 变成 <code>&lt;section data-message-author-role="assistant"&gt;</code>，仍在 main 中。先读当前选择器，预测它是否已覆盖这种结构。不要一看到“网页改版”就重写提取器。</p><div class="source-row">${source("src/content/page-adapter.ts", "MAIN_MESSAGE_CANDIDATE_SELECTOR", "查看候选节点选择器")}${source("test/extractor.test.ts", "describe", "查看提取测试与 fixture")}</div>
      ${reveal("预测后看：为什么可能不用改？", "<p>候选选择器包含 <code>main [data-message-author-role]</code>，所以保留角色属性的 section 仍可能被找到。但提取还要求角色合法、可见、内容非空且候选数量一致。验收应包含正常 section、未知角色、隐藏消息和嵌套重复候选，不能只测试一个新标签。</p>")}
      <p>进阶时，在隔离副本添加 fixture 与测试，再决定是否要动 selector。若当前逻辑已经通过新例子，结论就是“无需改实现，只补证据”，这也是维护。</p></div>
      <h2>练习 C · 为一次真实的小改动列范围</h2>
      <div class="card"><span class="number-tag">应用 · 文案改动的完整闭环</span><h3>把一个按钮文案改得更清楚</h3><p>这是你之后可选的真实维护任务，课程不会自动替你修改。本练习选 askInSideChat：先在 i18n 找这个 key，再查引用它的组件与测试；只改对应文案以及依赖旧文案的必要断言。不要趁机换 UI 框架或重写样式。</p>
      ${code('rg -n "askInSideChat|在侧栏中提问" src test e2e\nnpm run test:run -- test/selection.test.ts test/side-panel.test.ts\nnpm run typecheck\nnpm run build', "未来实际维护时 · 在项目根目录执行")}
      <p>验收：选区按钮出现、点击仍只是打开浮窗、提交行为不变；新文案不遮挡、键盘交互正常。最后按第 01 课重新加载扩展，必要时运行涉及的 E2E。</p></div>
      <h2>Git 的最小生存包</h2>
      <p>Git 的 commit 是一次可回到的版本快照，不是“把文件传到服务器”；push 才涉及远程。工作区是当前文件，暂存区是下次提交的集合。你的仓库制作课程时已有未提交修改，所以不要用整体还原来撤销一个小实验。</p>
      ${code('git status --short\ngit diff -- path/to/the-file\ngit diff --check\n\n# 仅在自己确认文件范围后，把具体文件加入暂存区\ngit add path/to/the-file\ngit diff --cached\ngit commit -m "说明这次具体改了什么"', "命令模板 · path/to/the-file 要换成实际路径")}
      <p>最稳妥的撤回方式是退回你刚刚改的那几行，再检查 diff。不要为了清理一个实验使用 <code>git reset --hard</code> 或 <code>git clean -fd</code>。如果一个文件同时有别人或你先前的工作，提交前先分辨哪些行属于本次任务。</p>
      <h2>不要从“测试绿了”跳到“问题绝对不存在”</h2>
      <p>一条单测给出一个反例被修复的证据；相邻边界和回归测试扩大证据范围；浏览器操作验证真实环境。它们都不是全域证明。写结果时说清楚你实际跑了什么、观察到什么，未验证的部分也具体说明。</p>
      ${quiz("maintain", "新增页面结构用例在当前代码下已经通过，下一步最合理的是？", ["为了体现工作量还是重写 selector", "保留有价值的测试证据，确认无需改实现", "删除旧测试以简化项目"], 1, ["没有失败证据的重写增加风险，不是修复。", "正确。最小有效改动有时只是增加一个回归用例，甚至只记录验证结论。", "旧测试可能保护其它结构与边界，不能因为新用例通过就删除。"])}
      ${checklist(["能独立运行并修好 teach/labs/delta-exercise.mjs。", "能给一次改动列出最少相关文件，而不是按目录全改。", "能区分单测、类型检查、构建和 E2E 各证明了什么。", "能从 git diff 判断是否带入了无关改动。"])} `
    },
    {
      id: "graduate", title: "第一次独立接手一个 bug", short: "毕业挑战与速查", tag: "09 / TAKE OWNERSHIP", time: "60–90 分钟", keywords: "毕业 自测 速查 词典 AI 提示词 学习计划 独立 bug 报告 checklist 来源 更新 快照",
      intro: "课程的终点不是记住文件名，而是遇到新问题时，知道如何建立证据、缩小范围，并验证自己的修复。用一个没有标准操作顺序的挑战检查它。",
      goal: "不看解析，完成一份包含复现、假设、证据、修复范围和验证的 bug 报告。",
      body: `<h2>毕业挑战：切换对话后，偶尔出现上个对话的历史</h2>
      <div class="card"><span class="number-tag">假设性报告 · 当前项目已有防护，并非已确认缺陷</span><p>用户说：“我在 A 对话里打开侧聊，马上切换到 B；偶尔 B 的浮窗里会出现 A 的记录。再刷新一次又好了。”你不能靠不停手点“碰运气”，需要把完成顺序固定下来。</p><ol><li>先选执行环境和入口文件，写出两个候选根因。</li><li>画 A 开始读取 → 切到 B → B 返回 → A 返回的时间线。</li><li>找出使晚到结果失效的判断；解释每个条件检查什么。</li><li>设计一个可控 Promise 测试，使 B 先 resolve，A 后 resolve。</li><li>断言最终界面仍属于 B；再考虑 A 失败、页面销毁的相邻场景。</li></ol><label class="field">先写你的诊断草稿<textarea id="diagnosis" rows="9" placeholder="预期：&#10;实际：&#10;最小复现：&#10;候选根因与排除证据：&#10;相关函数 / 判断：&#10;最小修复：&#10;验证："></textarea></label><div class="button-row"><button id="save-diagnosis" class="primary">保存到此浏览器</button><button id="download-diagnosis" class="secondary">下载诊断笔记 .md</button></div><p class="muted">草稿只保存到本浏览器；不能访问扩展历史。下载可把你的思路留作复盘。浏览器禁用存储时仍可下载。</p></div>
      ${reveal("完成草稿后：对照排查路径", `<p>从 content/index.ts 的 loadConversation 开始。它先递增 generation，用 token 记录本轮，清空显示并加载该 conversationId。返回后检查 disposed、token 与 generation、当前 conversation ID。候选假设包括：旧结果未过滤，或历史读取时用了错误 ID。用输入 ID 和返回后条件分别排除。</p><p>故障测试应固定 A/B 的 resolve 顺序，断言 B 的消息没有被 A 替换。若当前实现已通过，就没有证据要求改实现；可以人为删除保护条件在隔离副本验证测试确实能抓到它。不要把“写了测试”误当成“发现了真实 bug”。</p>${source("src/content/index.ts", "async function loadConversation", "对照真实保护逻辑")}`)}
      <h2>掌握程度：需要输出证据</h2>
      ${table(["能力", "合格证据"], [["识别运行环境", "能把一个 fetch 错误定位到后台检查视图，解释原因。"], ["读 TS", "把 SendPayload 译成中文，说清可选字段与运行时验证。"], ["跟链路", "独立画出 5 个运行站点，标注请求和回包方向。"], ["理解异步", "用固定时序解释过期结果，指出检查应放在 await 之后。"], ["修小 bug", "练习初始失败 → 最小修改 → 测试通过，能解释反例。"], ["控制范围", "diff 只含相关变更；验证命令和未验证项说得准确。"]])}
      <p>前三项能独立完成，说明你开始能读项目；六项都能拿出证据，才适合独立接小型维护任务。协议、数据迁移和安全逻辑仍应更谨慎地补测试与复核。进度勾选只是自我记录，不是自动能力认证。</p>
      <h2>以后如何让 AI 帮你，而不替你跳过思考</h2>
      ${code("先只读，不改文件。请围绕这个症状定位调用链。\n\n我的复现步骤：……\n预期 / 实际：……\n已验证的假设：……\n允许修改的范围：……\n\n请先给出：\n1. 根因候选及各自的证据 / 反证；\n2. 能稳定复现的最小测试；\n3. 最小修复范围和相邻风险。\n\n实施后说明实际执行的验证；不要把未跑的测试说成通过。\n对我不熟悉的语法，用 C++ 或 Python 类比，并说明差别。", "可以复用的协作提示词")}
      <p>先自己预测一个结果，再问 AI；让它给出能定位的函数和测试，不只是口头结论。遇到“重写整套架构”的建议，先问：哪个最小反例说明现在必须重写？</p>
      <h2>随用随查的小词典</h2>
      <dl class="glossary">${[["DOM", "浏览器里的页面对象树；此项目读取主对话、创建浮窗都靠它。"], ["content script", "运行在网页关联的隔离 JS 环境中的扩展脚本，可读改页面 DOM。"], ["service worker", "由浏览器调度的扩展后台；本项目的请求、权限与存储入口。"], ["Port", "扩展环境间的消息通道，用于持续传 accepted / delta / done。"], ["Promise / await", "未来结果的对象 / 暂停当前异步函数等待它；不是线程命令。"], ["竞态", "结果依赖异步操作完成顺序。先发生不保证先完成。"], ["不变量", "各状态转移后应一直成立的性质，如界面只展示当前对话的记录。"], ["Mock", "测试中可控的替代依赖，如主动返回固定 delta 的假服务商。"], ["回归测试", "防止已修好的行为以后又坏掉的测试。"], ["SSE / delta", "有边界的流式事件格式 / 一次增加的文本，不一定是完整回答。"], ["构建 / 类型检查", "生成浏览器产物 / 提前检查类型；在本项目是两个命令。"], ["副作用", "修改外界或共享状态，如写数据库、发请求、改变 DOM。"]].map(([word, meaning]) => `<div><dt>${word}</dt><dd>${meaning}</dd></div>`).join("")}</dl>
      <h2>这本教材的依据和更新方式</h2>
      <p>源码按钮打开的是当前工作区制作时的只读快照，包含当时已有的未提交修改。文件查看器显示采集时间、行号和哈希；可查整个文件，但不会编辑它。教材文字基于 <strong>2026-09-06</strong> 的实现。更新源码快照不会自动重写课程结论，改变行为后应核对对应章节。</p>
      ${code("node teach/update-sources.mjs\nnode teach/check.mjs", "更新快照并检查教材 · 只写 teach/source-data.js")}
      <p>刷新浏览器后读取新快照。完整操作见 <code>teach/README.md</code>。本网站不读取你的密钥或真实对话，不调用模型接口；课程中的网络数据都是教学示例。</p>
      <ul class="sources-list"><li><a href="https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts" target="_blank" rel="noopener noreferrer">Chrome：Content scripts</a> · 环境隔离与 DOM 能力</li><li><a href="https://developer.chrome.com/docs/extensions/develop/concepts/messaging" target="_blank" rel="noopener noreferrer">Chrome：Message passing</a> · 单次消息与长连接</li><li><a href="https://developer.chrome.com/docs/extensions/get-started/tutorial/debug" target="_blank" rel="noopener noreferrer">Chrome：Debug extensions</a> · 调试入口与检查工具</li><li><a href="https://developer.chrome.com/docs/extensions/reference/api/storage" target="_blank" rel="noopener noreferrer">Chrome：Storage</a> · 存储生命周期</li><li><a href="https://www.typescriptlang.org/docs/handbook/2/everyday-types.html" target="_blank" rel="noopener noreferrer">TypeScript：Everyday Types</a> · 类型与断言</li><li><a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function" target="_blank" rel="noopener noreferrer">MDN：async function</a> · 异步语义</li><li><a href="https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events" target="_blank" rel="noopener noreferrer">MDN：SSE</a> · 事件帧格式</li></ul>`
    }
  );
  const architecture = [
    { name: "页面脚本", caption: "content", subtitle: "读页面 · 显示浮窗", body: `<h3>把用户动作变成结构化数据</h3><p>入口是 content/index.ts。SelectionController 监听选区；ChatGptPageAdapter 找主对话节点；SidePanel 创建浮窗并报告提交。这里处理 DOM、附件和临时 UI 状态，把任务经 Port 交给后台。</p><p>排查划词、提取与浮窗，打开 ChatGPT 页 DevTools，确认脚本上下文。页面脚本与宿主网页 JS 变量相互隔离，但操作的是页面 DOM。</p>${source("src/content/index.ts", "export function bootstrap", "打开页面入口")}` },
    { name: "扩展后台", caption: "background", subtitle: "权限 · 模型请求 · 历史", body: `<h3>协调有副作用的工作</h3><p>入口是 background/index.ts。接收协议消息，检查设置和授权，把发送交给 ChatService；Provider 处理网络，HistoryStore 处理本地历史。这里的“后台”在你的 Chrome 里，不是部署到云上的服务器。</p><p>不能用 document 操作页面；需要传消息让页面更新。持久数据写存储，因为 service worker 不保证一直运行。</p>${source("src/background/index.ts", "export const historyStore", "打开后台入口")}` },
    { name: "设置页面", caption: "options", subtitle: "表单 · 配置 · 授权", body: `<h3>管理模型配置与使用许可</h3><p>入口是 options/index.ts，由 options.html 加载。它有自己的 DOM，收集 Base URL、模型、上下文窗口、图片能力与密钥，申请所需主机访问权限，并通过消息保存设置。</p><p>配置错误从这里观察输入，再到后台看验证与存储。密钥框不回填已有值，只显示是否已设置。</p>${source("src/options/index.ts", "async function", "打开设置入口")}` }
  ];
  const trace = [
    { title: "选区 → 引用", place: "页面 / selection.ts", text: "quoteFromRange 检查选区首尾属于同一消息、文本非空、角色明确，再生成有来源信息的引用。此时没有网络请求。", data: '{ text: "为什么可以交换极限与积分？",\n  sourceRole: "assistant", sourceMessageIndex: 1 }', path: "src/content/selection.ts", find: "export function quoteFromRange" },
    { title: "打开 → 提交", place: "页面 / SidePanel", text: "点击在侧栏中提问打开浮窗。用户输入问题并提交后，send 设置忙碌状态，调用 onSend，把问题、引用、压缩选项交给页面控制器。", data: '{ question: "用一个反例说明", quote: { ... },\n  compressOldContext: false }', path: "src/content/ui/side-panel.ts", find: "private send(payload" },
    { title: "提取 → 发送任务", place: "页面 / content/index.ts", text: "重新读取 /c/... 对话 ID、当前 DOM 中消息和附件。certain 只检查当前 DOM 候选的一致性，不证明服务器完整历史已加载。验证后创建 Port，发送 start。示例省略号表示省略字段，不是合法 JSON。", data: '{ type: "start", requestId: "r1", payload: {\n  conversationId: "c1", mainMessages: [...],\n  question: "用一个反例说明", quote: {...},\n  attachments: [], compressOldContext: false } }', path: "src/content/index.ts", find: "async function start(submission" },
    { title: "校验 → 排队", place: "后台 / index + ChatService", text: "后台检查端口名和实际数据。为任务创建取消信号；ChatService 按 conversationId 排队，轮到时检查取消状态，再读配置、密钥、权限与历史。", data: 'isStreamClientMessage(message)\n→ chatService.send(payload, signal, onEvent)\n→ tails.get(conversationId) → sendOnce(...)', path: "src/background/index.ts", find: "chrome.runtime.onConnect" },
    { title: "组装 → accepted", place: "后台 / ChatService", text: "构造模型 messages 并检查估算预算；必要且允许时做摘要再检查。发出 accepted，表示扩展接受任务。接下来才开始此次回答的网络请求。", data: '{ type: "accepted", requestId: "r1",\n  approximateTokens: 384 /* 仅为示例 */ }', path: "src/background/chat-service.ts", find: 'onEvent({ type: "accepted"' },
    { title: "POST → SSE", place: "后台 ↔ 外部服务商", text: "Provider 发 POST，读取响应字节，用 TextDecoder 和 buffer 还原 SSE 事件，然后取可见的 delta.content。网络块不保证在事件边界切开。", data: 'POST <Base URL>/chat/completions\n{ model, messages, stream: true }\n\ndata: {"choices":[{"delta":{"content":"考虑"}}]}', path: "src/background/provider.ts", find: "export async function streamChatCompletion" },
    { title: "delta → 显示", place: "后台 → 页面", text: "后台把文字累加进 assistant.content，再通过端口发 delta。页面检查 requestId 和端口，调用 appendDelta；临时文本经过 Markdown 与公式处理后显示。", data: '{ type: "delta", requestId: "r1", text: "考虑" }\n{ type: "delta", requestId: "r1", text: "如下反例…" }', path: "src/background/chat-service.ts", find: "assistant.content += text" },
    { title: "保存 → done", place: "后台 → 存储 → 页面", text: "遇到 [DONE] 后 Provider 返回。ChatService 确认回复非空，再标记 complete，在 finally 保存历史，成功后后台发 done。页面使用正式记录替换临时文字；失败且非空的片段会以 incomplete 保存。", data: '{ type: "done", requestId: "r1", record: {\n  conversationId: "c1", messages: [...] } }', path: "src/background/chat-service.ts", find: 'assistant.status = "complete"' }
  ];
  const labs = [
    { id: "delta", label: "01 · 结束后丢字", title: "中途完整，结束后只剩最后一段", symptom: "输入两个增量 Hello 和 world，临时 UI 正常累加，但后台错误覆盖。done 用正式记录替换界面后暴露问题。", invariant: "第 k 次回调后：answer = δ₁ + … + δₖ。", broken: 'onDelta: (text) => {\n  assistant.content = text; // 人为故障\n  onEvent({ type: "delta", text });\n}', options: ["保留 =（先观察失败）", "改为 +=，累加每个增量", "只在前端多渲染一次"], correct: 1, expected: "持久化与 done 中都是 Hello world", explain: "两个 delta 证明模型给齐了文字；临时 UI 也完整，首次偏离发生在后台保存变量。最小修复是 +=。只改前端会被下一次 done / 刷新覆盖。现有基本成功用例只有一段，需增加多段断言。", path: "src/background/chat-service.ts", find: "assistant.content += text", test: "test/chat-service.test.ts", testFind: "function createService", command: "npm run test:run -- test/chat-service.test.ts", assertion: 'stream: async ({ onDelta }) => {\n  onDelta("Hello"); onDelta(" world");\n  return "Hello world";\n}\n// 使用现有 createService helper 构造服务并 send 后：\nexpect(record.messages.at(-1)?.content).toBe("Hello world");\nexpect(history.record?.messages.at(-1)?.content).toBe("Hello world");' },
    { id: "null", label: "02 · 200 仍报错", title: "合法空内容帧被误判成坏协议", symptom: "教学输入依次是 content: null、content: 'OK'、[DONE]。删除 null/undefined 分支后，第一帧就抛错，后面的可见文字没机会到达。", invariant: "忽略 null / undefined；只接受字符串；非法类型仍拒绝。", broken: 'const content = delta.content;\n// 人为删掉了 null / undefined 分支\nif (typeof content !== "string") throw protocolError();', options: ["直接检查 string（先观察失败）", "恢复 null/undefined 分支，再检查 string", "把所有 content 都 String() 化"], correct: 1, expected: "返回 OK；只发一次可见 delta；数字 7 仍被拒绝", explain: "HTTP 200 与内容帧是否合法是不同层。null 可以是合法的无可见内容帧；但数字 7 仍是错误类型。不能简单删除校验，也不要把非可见字段当答案。这里缩小模型只检查内容字段，真实 provider 还负责 SSE 边界与结束标记。", path: "src/background/provider.ts", find: "if (content === undefined || content === null)", test: "test/provider.test.ts", testFind: "nullable DeepSeek", command: 'npm run test:run -- test/provider.test.ts -t "nullable DeepSeek"', assertion: 'expect(result).toBe("OK");\nexpect(onDelta).toHaveBeenCalledOnce();\nexpect(onDelta).toHaveBeenCalledWith("OK");\n// 相邻边界：content 为数字 / 对象仍应报协议错误。' },
    { id: "abort", label: "03 · 取消仍执行", title: "取消了 B，它为什么还从队列启动？", symptom: "同一对话 A 正在执行，B 在其后排队。B 等待时已取消，A 完成后 B 的 then 回调仍会被调度。", invariant: "已取消的排队任务，不进入 sendOnce，不新增业务副作用。", broken: 'const run = previous.catch(() => {}).then(() => {\n  // 人为删掉 signal.throwIfAborted();\n  return this.sendOnce(payload, signal, onEvent);\n});', options: ["不检查取消（先观察失败）", "在 then 内、sendOnce 前 throwIfAborted", "排队注册之前检查一次就够了"], correct: 1, expected: "B 在轮到自己时退出；进入业务逻辑的任务只有 A", explain: "Promise 回调不会因为取消信号自动消失。排队前 B 尚未取消，检查太早无效；轮到它时才是关键。真实 fetch 可能拒绝已取消信号，但 sendOnce 的读取与 finally 写入等副作用已经可能发生。最小修复是恢复入口检查。", path: "src/background/chat-service.ts", find: "signal.throwIfAborted();", test: "test/chat-service.test.ts", testFind: "already aborted before its turn", command: 'npm run test:run -- test/chat-service.test.ts -t "already aborted before its turn"', assertion: '// 让 A 暂停，提交 B，然后在 A 完成前取消 B\nsecondController.abort();\n// 完成 A，等待 B 拒绝后：\nexpect(stream).toHaveBeenCalledOnce();\n// 历史只能包含 A 的问题和回答，不能凭空多出 B。' }
  ];
  window.TEACH = { esc, source, code, snippet, note, table, reveal, quiz, checklist, chapters, quizzes, architecture, trace, labs };
})();
