export const sidePanelStyles = `
:host {
  all:initial;
  --panel-bg:#fff; --panel-soft:#f5f6f5; --panel-input:#f5f6f5;
  --panel-text:#202824; --panel-muted:#66716b; --panel-line:#dde3df;
  --panel-accent:#187659; --panel-accent-soft:#edf7f1; --panel-on-accent:#fff;
  --panel-error:#b13636; --panel-error-bg:#fff2f0; --panel-code:#edf0ed;
  --panel-shadow:0 20px 70px #17251d24,0 3px 12px #17251d12;
  color:var(--panel-text); color-scheme:light;
  font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;
  -webkit-font-smoothing:antialiased;
}
:host([data-side-chat-theme=dark]) {
  --panel-bg:#212121; --panel-soft:#1b1b1b; --panel-input:#2f2f2f;
  --panel-text:#ececec; --panel-muted:#a3a3a3; --panel-line:#3d3d3d;
  --panel-accent:#ececec; --panel-accent-soft:#2b2b2b; --panel-on-accent:#212121;
  --panel-error:#ffaaa4; --panel-error-bg:#3d2928; --panel-code:#171717;
  --panel-shadow:0 20px 70px #0006,0 3px 12px #0003;
  color-scheme:dark;
}
* { box-sizing:border-box; }
.panel { container:side-chat / size; position:fixed; width:var(--side-chat-width,420px); height:var(--side-chat-height,560px); max-width:calc(100vw - 24px); max-height:calc(100vh - 24px); background:var(--panel-bg); border:1px solid var(--panel-line); border-radius:16px; display:flex; flex-direction:column; z-index:2147483646; box-shadow:var(--panel-shadow); overflow:hidden; }
.resize { position:absolute; inset:auto 0 0 auto; width:20px; height:20px; z-index:2; cursor:nwse-resize; }
.resize::after { content:""; position:absolute; right:5px; bottom:5px; width:7px; height:7px; border-right:2px solid var(--panel-muted); border-bottom:2px solid var(--panel-muted); opacity:.55; border-radius:0 0 3px 0; }
header { display:flex; align-items:center; gap:6px; flex-shrink:0; min-height:68px; padding:12px 12px 12px 18px; border-bottom:1px solid var(--panel-line); cursor:grab; user-select:none; }
header:active { cursor:grabbing; }
.panel-mark { flex-shrink:0; width:34px; height:34px; padding:7px; margin-right:4px; color:var(--panel-accent); background:var(--panel-accent-soft); border:1px solid var(--panel-line); border-radius:10px; }
.panel-heading { flex:1; min-width:0; }
header strong { display:block; font-size:15px; font-weight:650; letter-spacing:.02em; }
.panel-caption { display:block; color:var(--panel-muted); font-size:11px; }
button { font:inherit; color:inherit; background:transparent; border:1px solid transparent; border-radius:8px; padding:6px 9px; cursor:pointer; transition:background .15s,border-color .15s,color .15s; }
button:hover { background:var(--panel-input); border-color:var(--panel-line); }
button:disabled,textarea:disabled { opacity:.45; cursor:not-allowed; }
button:focus-visible,.resize:focus-visible { outline:2px solid var(--panel-accent); outline-offset:2px; }
.icon-button { flex-shrink:0; display:grid; place-items:center; width:32px; height:32px; padding:6px; color:var(--panel-muted); }
.icon-button svg { width:18px; height:18px; }
[data-action=clear]:hover { color:var(--panel-error); background:var(--panel-error-bg); }
.minimized-bar { position:fixed; z-index:2147483646; width:180px; height:44px; padding:0 14px; display:flex; align-items:center; justify-content:space-between; gap:12px; color:var(--panel-text); background:var(--panel-bg); border:1px solid var(--panel-line); border-radius:12px; box-shadow:var(--panel-shadow); font-weight:500; overflow:hidden; white-space:nowrap; cursor:grab; touch-action:none; user-select:none; }
.minimized-bar:hover { background:var(--panel-accent-soft); }
.minimized-bar:active { cursor:grabbing; }
.minimized-bar span:first-child::before { content:""; display:inline-block; width:7px; height:7px; margin-right:9px; border-radius:50%; background:var(--panel-accent); }
.minimized-bar span:last-child { color:var(--panel-muted); font-size:18px; }
.context-summary { flex-shrink:1; min-height:42px; max-height:140px; overflow:auto; padding:10px 18px; border-bottom:1px solid var(--panel-line); background:var(--panel-soft); color:var(--panel-muted); font-size:11px; line-height:1.65; overflow-wrap:anywhere; }
.context-overview { display:flex; align-items:center; flex-wrap:wrap; gap:5px 10px; margin-bottom:5px; font-size:11px; }
.model-name { min-width:0; max-width:100%; padding:1px 7px; border:1px solid var(--panel-line); border-radius:5px; color:var(--panel-text); background:var(--panel-bg); font-size:12px; font-weight:600; }
.messages { flex:1; min-height:40px; overflow:auto; overscroll-behavior:contain; padding:20px 18px; scrollbar-width:thin; scrollbar-color:var(--panel-line) transparent; }
.empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100%; padding:12px 8px; text-align:center; color:var(--panel-muted); }
.empty-state svg { width:32px; height:32px; padding:5px; margin-bottom:9px; color:var(--panel-accent); }
.empty-state strong { color:var(--panel-text); font-size:14px; font-weight:600; }
.empty-state p { max-width:235px; margin:7px 0 0; font-size:12px; }
.message { margin:0 0 22px; padding:0; background:transparent; overflow-wrap:anywhere; }
.message:last-child { margin-bottom:0; }
.message.user { display:flex; flex-direction:column; align-items:flex-end; gap:8px; }
.message.user > .message-content { max-width:88%; padding:10px 14px; background:var(--panel-input); border:1px solid var(--panel-line); border-radius:14px 14px 4px 14px; }
.message.assistant > .message-content { padding:0 2px; }
.message-content { min-width:0; max-width:100%; }
.message-content > :first-child { margin-top:0; } .message-content > :last-child { margin-bottom:0; }
.message-content p { margin:0 0 1em; }
.message-content h1,.message-content h2,.message-content h3 { font-size:1.12em; line-height:1.5; margin:1.4em 0 .65em; }
.message-content ul,.message-content ol { padding-left:1.6em; }
.message-content pre { max-width:100%; overflow:auto; padding:13px; border:1px solid var(--panel-line); border-radius:10px; background:var(--panel-code); }
.message-content code { font-size:.9em; } .message-content :not(pre) > code { padding:2px 5px; background:var(--panel-code); border-radius:4px; }
.message-content blockquote { margin:12px 0; border-left:3px solid var(--panel-line); padding-left:12px; color:var(--panel-muted); }
.message-content table { display:block; max-width:100%; overflow:auto; border-collapse:collapse; }
.message-content td,.message-content th { border:1px solid var(--panel-line); padding:6px 10px; }
.quote { align-self:stretch; white-space:pre-wrap; border-left:3px solid var(--panel-accent); background:var(--panel-accent-soft); border-radius:2px 9px 9px 2px; padding:9px 12px; font-size:12px; color:var(--panel-text); }
.quote-label { display:block; margin-bottom:4px; color:var(--panel-accent); font-size:11px; font-weight:600; letter-spacing:.03em; }
.active-quote { flex-shrink:1; min-height:40px; max-height:112px; margin:10px 16px 0; overflow:auto; scrollbar-width:thin; overflow-wrap:anywhere; }
.active-quote .quote-label { position:sticky; top:-9px; display:flex; align-items:center; justify-content:space-between; gap:8px; background:var(--panel-accent-soft); }
[data-action=clear-quote] { flex-shrink:0; width:22px; height:22px; padding:0; font-size:18px; line-height:1; }
.incomplete { margin-top:6px; color:var(--panel-muted); font-size:12px; }
.math-display { max-width:100%; overflow-x:auto; overflow-y:hidden; padding:8px 0; }
.math-display .katex-display { margin:.35em 0; } .math-display .katex-display > .katex { text-align:left; }
.math-fallback { white-space:pre-wrap; font-family:monospace; }
.status { flex-shrink:1; min-height:36px; max-height:104px; overflow:auto; margin:0 16px; padding:8px 10px; border-radius:8px; background:var(--panel-soft); color:var(--panel-muted); font-size:12px; overflow-wrap:anywhere; }
.status[role=alert] { color:var(--panel-error); background:var(--panel-error-bg); }
.status:empty { display:none; } .status button { margin-left:6px; text-decoration:underline; text-underline-offset:3px; }
form { flex-shrink:0; margin:0; padding:10px 16px 14px; }
.composer { display:flex; align-items:flex-end; gap:8px; padding:9px 9px 9px 13px; background:var(--panel-input); border:1px solid var(--panel-line); border-radius:14px; transition:border-color .15s,box-shadow .15s; }
.composer:focus-within { border-color:var(--panel-accent); box-shadow:0 0 0 2px var(--panel-accent-soft); }
.composer textarea { flex:1; min-width:0; width:100%; min-height:52px; max-height:min(180px,24cqh); padding:3px 0; resize:vertical; color:var(--panel-text); border:0; background:transparent; outline:0; font:inherit; }
.composer textarea::placeholder { color:var(--panel-muted); }
.composer [data-action=send] { width:34px; height:34px; padding:7px; border-radius:10px; color:var(--panel-on-accent); background:var(--panel-accent); }
.composer [data-action=send]:disabled { opacity:1; background:var(--panel-line); color:var(--panel-muted); }
.composer [data-action=send]:enabled:hover { filter:brightness(1.08); }
.composer-hint { margin:6px 2px 0; color:var(--panel-muted); text-align:right; font-size:11px; }
.controls { margin:8px 2px 0; color:var(--panel-muted); }
.controls label { display:flex; align-items:flex-start; gap:6px; font-size:11px; line-height:1.5; cursor:pointer; }
.controls input { accent-color:var(--panel-accent); margin:2px 0; flex-shrink:0; }
a { color:var(--panel-accent); text-underline-offset:3px; }
dialog { max-width:calc(100% - 32px); max-height:calc(100% - 32px); overflow:auto; padding:22px; border:1px solid var(--panel-line); border-radius:16px; color:var(--panel-text); background:var(--panel-bg); box-shadow:var(--panel-shadow); font:inherit; }
dialog h2 { margin-top:0; font-size:17px; } dialog::backdrop { background:#0006; }
dialog button { margin-top:10px; border-color:var(--panel-line); background:var(--panel-input); }
dialog input { max-width:100%; } dialog [role=alert] { color:var(--panel-error); }
@media (prefers-reduced-motion:reduce) { button,.composer { transition:none; } }
@container side-chat (max-height:460px) {
  header { min-height:56px; padding-top:8px; padding-bottom:8px; }
  .panel-caption,.composer-hint { display:none; }
  .context-summary { max-height:72px; padding-top:6px; padding-bottom:6px; }
  .active-quote { min-height:32px; max-height:56px; }
  .status { min-height:32px; max-height:64px; }
  .composer textarea { height:38px; min-height:38px; max-height:38px; resize:none; }
  .messages { min-height:24px; padding-top:12px; padding-bottom:12px; }
}
`;
