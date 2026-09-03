export const sidePanelStyles = `
:host { all: initial; color: #ececf1; font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
* { box-sizing: border-box; }
.panel { position: fixed; inset: 0 0 0 auto; width: var(--side-chat-width, 420px); background: #202123; border-left: 1px solid #4a4b52; display: flex; flex-direction: column; z-index: 2147483646; box-shadow: -4px 0 16px #0005; }
.resize { position: absolute; inset: 0 auto 0 -5px; width: 10px; cursor: col-resize; }
header { display:flex; align-items:center; gap:8px; padding:10px 12px; border-bottom:1px solid #4a4b52; }
header strong { flex:1; } button { font: inherit; color: inherit; background:#343541; border:1px solid #565869; border-radius:6px; padding:6px 9px; cursor:pointer; } button:disabled, textarea:disabled { opacity:.55; cursor:not-allowed; }
.messages { flex:1; overflow:auto; padding:12px; } .message { margin:0 0 12px; padding:9px; background:#2a2b32; border-radius:8px; overflow-wrap:anywhere; } .message.user { background:#343541; } .quote { white-space:pre-wrap; border-left:3px solid #10a37f; padding-left:8px; margin-bottom:7px; } .incomplete { color:#f9c74f; font-size:12px; }
.status { min-height:0; padding:0 12px; color:#ff9b9b; } .status:empty { display:none; } .status button { margin-left:8px; }
form { border-top:1px solid #4a4b52; padding:10px 12px; } textarea { width:100%; min-height:72px; resize:vertical; color:#ececf1; background:#343541; border:1px solid #565869; border-radius:7px; padding:8px; font:inherit; } .controls { display:flex; align-items:center; gap:8px; margin-top:8px; } .controls label { flex:1; font-size:12px; } a { color:#7ab7ff; }
`;
