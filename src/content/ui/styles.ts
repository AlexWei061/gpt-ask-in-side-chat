export const sidePanelStyles = `
:host { all:initial; color:#ececec; font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif; color-scheme:dark; }
* { box-sizing:border-box; }
.panel { position:fixed; right:var(--side-chat-right,20px); bottom:var(--side-chat-bottom,20px); width:var(--side-chat-width,420px); height:var(--side-chat-height,560px); max-width:calc(100vw - 24px); max-height:calc(100vh - 24px); background:#212121; border:1px solid #ffffff1a; border-radius:16px; display:flex; flex-direction:column; z-index:2147483646; box-shadow:0 18px 60px #0009,0 2px 10px #0007; overflow:hidden; }
.panel { right:auto; bottom:auto; }
.resize { position:absolute; inset:auto 0 0 auto; width:20px; height:20px; z-index:2; cursor:nwse-resize; }
.resize::after { content:""; position:absolute; right:5px; bottom:5px; width:8px; height:8px; border-right:2px solid #777; border-bottom:2px solid #777; border-radius:0 0 3px 0; }
header { display:flex; align-items:center; gap:6px; min-height:52px; padding:0 10px 0 14px; border-bottom:1px solid #ffffff12; cursor:grab; user-select:none; }
header:active { cursor:grabbing; }
header strong { flex:1; font-size:16px; font-weight:600; }
button { font:inherit; color:inherit; background:transparent; border:0; border-radius:9px; padding:6px 9px; cursor:pointer; }
button:hover { background:#ffffff12; } button:disabled,textarea:disabled { opacity:.45; cursor:not-allowed; }
button:focus-visible,.resize:focus-visible { outline:2px solid #10a37f; outline-offset:2px; }
.minimized-bar { position:fixed; z-index:2147483646; width:180px; height:44px; padding:0 14px; display:flex; align-items:center; justify-content:space-between; gap:12px; color:#ececec; background:#212121; border:1px solid #ffffff26; border-radius:12px; box-shadow:0 4px 16px #0004; font-weight:500; overflow:hidden; white-space:nowrap; }
.minimized-bar:hover { background:#3a3a3a; }
.minimized-bar { cursor:grab; touch-action:none; user-select:none; }
.minimized-bar:active { cursor:grabbing; }
.minimized-bar span:last-child { color:#999; font-size:18px; }
.context-summary { padding:9px 14px; border-bottom:1px solid #ffffff0d; color:#9b9b9b; font-size:11px; overflow-wrap:anywhere; }
.messages { flex:1; min-height:0; overflow:auto; padding:20px 16px; scrollbar-width:thin; scrollbar-color:#555 transparent; }
.message { margin:0 0 22px; padding:0; background:transparent; overflow-wrap:anywhere; }
.message.user { display:flex; flex-direction:column; align-items:flex-end; gap:7px; }
.message.user > .message-content { max-width:88%; padding:9px 13px; background:#303030; border-radius:18px 18px 4px 18px; }
.message.assistant > .message-content { padding:0 4px; }
.message-content { min-width:0; max-width:100%; }
.message-content > :first-child { margin-top:0; } .message-content > :last-child { margin-bottom:0; }
.message-content p { margin:0 0 1em; }
.message-content h1,.message-content h2,.message-content h3 { font-size:1.12em; line-height:1.5; margin:1.4em 0 .65em; }
.message-content ul,.message-content ol { padding-left:1.6em; }
.message-content pre { max-width:100%; overflow:auto; padding:12px; border-radius:10px; background:#171717; }
.message-content code { font-size:.9em; } .message-content :not(pre) > code { padding:2px 4px; background:#ffffff0d; border-radius:4px; }
.message-content blockquote { margin:12px 0; border-left:3px solid #666; padding-left:12px; color:#ccc; }
.message-content table { display:block; max-width:100%; overflow:auto; border-collapse:collapse; }
.message-content td,.message-content th { border:1px solid #ffffff26; padding:6px 10px; }
.quote { align-self:stretch; white-space:pre-wrap; border-left:3px solid #10a37f; background:#ffffff09; border-radius:2px 9px 9px 2px; padding:8px 10px; font-size:12px; color:#b4b4b4; }
.quote-label { display:block; margin-bottom:3px; color:#8e8e8e; font-size:11px; }
.active-quote { flex-shrink:0; max-height:132px; margin:8px 16px 0; overflow:auto; }
.incomplete { margin-top:5px; color:#d7b874; font-size:12px; }
.math-display { max-width:100%; overflow-x:auto; overflow-y:hidden; padding:8px 0; }
.math-display .katex-display { margin:.35em 0; } .math-display .katex-display > .katex { text-align:left; }
.math-fallback { white-space:pre-wrap; font-family:monospace; }
.status { padding:0 16px 6px; color:#a8a8a8; font-size:12px; } .status[role=alert] { color:#ff9b9b; } .status:empty { display:none; } .status button { margin-left:6px; }
form { flex-shrink:0; margin:0; padding:10px 12px 13px; }
.composer { display:flex; align-items:flex-end; gap:8px; padding:7px 7px 7px 12px; background:#303030; border:1px solid #ffffff12; border-radius:24px; }
.composer:focus-within { border-color:#ffffff40; }
.composer textarea { flex:1; min-width:0; width:100%; min-height:54px; max-height:180px; padding:6px 2px; resize:vertical; color:#ececec; border:0; background:transparent; outline:0; font:inherit; }
.composer textarea::placeholder { color:#9b9b9b; }
.composer [data-action=send] { flex-shrink:0; width:32px; height:32px; padding:0; border-radius:50%; color:#212121; background:#fff; font-size:22px; line-height:32px; }
.controls { margin:7px 4px 0; color:#a8a8a8; }
.controls label { display:flex; align-items:flex-start; gap:5px; font-size:11px; line-height:1.5; }
.controls input { accent-color:#10a37f; margin:2px 0; flex-shrink:0; }
a { color:#8ab4f8; }
dialog { max-width:calc(100% - 32px); padding:22px; border:1px solid #ffffff26; border-radius:16px; color:#ececec; background:#2f2f2f; font:inherit; }
dialog h2 { font-size:17px; } dialog::backdrop { background:#0008; }
`;
