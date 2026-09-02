# Side Chat Companion Chrome Extension Design

## Summary

Side Chat Companion is a public Manifest V3 Chrome extension for `chatgpt.com`. It reproduces the core Codex “Ask in side chat” interaction without using ChatGPT private APIs:

1. The user selects text inside one rendered user or assistant message.
2. A floating **Ask in side chat** button appears next to the native browser selection.
3. Clicking the button opens a docked, resizable panel on the right and places the selection in the composer as a quote.
4. The user writes a question. The configured model receives the complete main-chat context exposed by the page DOM, the existing side-chat history, the selected quote, and the new question.
5. One encrypted side-chat history is retained for each ChatGPT conversation.

The extension is bring-your-own-key and calls a user-configured OpenAI-compatible API directly. It has no developer-operated backend, telemetry, advertising, or use of ChatGPT internal endpoints.

## Goals

- Match the selection-triggered Codex interaction closely.
- Include every main-chat message that the ChatGPT page currently exposes in its DOM.
- Keep one continuous, persistent side chat per ChatGPT conversation.
- Support OpenAI-compatible chat-completions endpoints, including hosted and local models.
- Keep API credentials outside the web page and off disk.
- Use the minimum Chrome permissions required for the user-facing feature.
- Produce a testable unpacked extension, a release ZIP, a privacy policy, and a Chrome Web Store submission checklist.

## Non-goals

- Calling undocumented ChatGPT endpoints or reusing the user's ChatGPT subscription.
- Reading hidden system prompts, internal tool traces, or content not exposed by the page DOM.
- Supporting Firefox, Safari, or mobile browsers in the first release.
- Maintaining multiple side chats for a single ChatGPT conversation.
- Synchronizing side-chat history between devices.
- Operating a proxy, analytics service, account system, or developer-controlled data store.
- Silently truncating main-chat or side-chat context.

## Product boundary for “complete context”

“Complete context” means all user and assistant messages currently exposed by the ChatGPT conversation page DOM, in order. The extractor preserves visible text, code blocks, tables, and links. The extension does not claim access to hidden model instructions, unrendered private data, or ChatGPT server records.

Before the first model request in a conversation, the side panel displays the number of captured messages and the configured destination origin. This both verifies the extraction boundary and supplies the prominent disclosure required before chat content is transmitted.

If the extractor cannot establish a non-empty, ordered message sequence, it blocks transmission rather than sending an apparently complete but uncertain snapshot.

## User experience

### First-run setup

The options page explains that selected text and the current ChatGPT conversation will be sent to the model endpoint chosen by the user. The user must explicitly accept this disclosure before content extraction is enabled.

The user configures:

- Base URL, including the API version path, for example `https://example.com/v1`.
- API key for the current Chrome browser session.
- Model name.
- Declared model context-window size.
- Whether the model accepts image inputs.

Saving the Base URL requests access only to its normalized origin. HTTPS is required, except for `http://localhost` and `http://127.0.0.1` so local model servers remain usable. The resolved request endpoint is `<base-url>/chat/completions`.

The API key is stored in `chrome.storage.session`. It survives Manifest V3 service-worker suspension but is cleared when Chrome restarts, the extension reloads, or the extension is disabled. The user then unlocks the extension by entering the key again.

### Selecting text

- Selection uses the browser's native `window.getSelection()` and `Range` behavior.
- Mouse drag, double-click word selection, and keyboard-assisted selection work without a separate selection mode.
- A selection is eligible only when it is non-empty and contained within one recognized user or assistant message.
- Cross-message selections are rejected to avoid ambiguous source attribution and unstable DOM ranges.
- Code-block selections are supported.
- The floating button is positioned from the selection range's bounding rectangle and is dismissed when the selection collapses, the user scrolls away, presses Escape, or clicks elsewhere.

### Opening and using the panel

- Clicking **Ask in side chat** clears the native selection, opens the docked panel, and adds the selected text as a removable quote above the side-chat composer.
- The main ChatGPT content area shrinks rather than being covered.
- The panel has a draggable left edge. Its width is clamped to a usable minimum and to at most half of the viewport, then remembered locally.
- The composer receives focus. No default question is sent automatically.
- Sending creates a user side-chat message containing both the quote reference and the typed question.
- Selecting new text later adds the new quote to the next question in the same continuous side chat.
- Closing the panel does not delete history or interrupt a completed answer.
- Returning to the same ChatGPT conversation restores its side-chat history. Navigating to another conversation aborts any in-flight request and loads the new conversation's history.

### Settings and deletion

The panel and options page provide:

- Connection test.
- Current endpoint and model summary.
- Captured main-message count and approximate token count.
- Clear current side chat.
- Clear all side-chat histories.
- Forget the current session API key.

## Architecture

### 1. Page adapter content script

The content script runs only on `https://chatgpt.com/*` in Chrome's isolated world. It owns:

- Conversation-ID extraction from the current URL.
- Main-message discovery and ordered context extraction.
- Selection validation and the floating action.
- A Shadow DOM host containing the docked panel, composer, response renderer, and resize handle.
- A `MutationObserver` that notices new messages and single-page-application navigation.
- Runtime messages to and from the service worker.

The content script never receives or reads the API key. It renders model output as text/Markdown through a sanitizer and never injects untrusted HTML directly.

DOM selectors and extraction rules live behind one `ChatGptPageAdapter` interface so a ChatGPT markup change is repaired in one focused module. Fixture-based extractor tests document every supported message shape.

### 2. Background service worker

The Manifest V3 service worker owns all privileged behavior:

- Provider configuration and API-key access.
- Runtime host-permission checks.
- Request assembly.
- Context-size checks.
- OpenAI-compatible API calls and streaming SSE parsing.
- Request cancellation.
- Side-chat encryption, persistence, and migrations.

It accepts typed extension messages rather than arbitrary fetch instructions. The content script can request only the operations declared by the protocol.

### 3. Provider client

The first release implements one OpenAI-compatible provider adapter:

- `POST <base-url>/chat/completions`
- `Authorization: Bearer <session-key>`
- JSON chat-completions request bodies
- Streaming responses using `stream: true`
- Standard assistant text deltas and provider error envelopes

The configuration contains a model name rather than a fixed vendor list. Provider-specific headers, tool calling, model discovery, and vendor-native protocols are outside the first release.

### 4. Extension-owned storage

- Non-secret settings use `chrome.storage.local` with access restricted to trusted extension contexts through `setAccessLevel`.
- The API key uses `chrome.storage.session` with trusted-context-only access.
- Side-chat records use extension-origin IndexedDB.
- Side-chat message content is encrypted with AES-GCM before storage. The encryption key is a non-extractable Web Crypto `CryptoKey` kept in the extension-owned IndexedDB key store.
- Full main-chat snapshots and raw attachments are not persisted.
- Removing the extension deletes its settings, key material, and histories.

## Data model

```ts
type ProviderConfig = {
  baseUrl: string;
  model: string;
  contextWindowTokens: number;
  supportsImages: boolean;
};

type MainMessage = {
  index: number;
  role: "user" | "assistant";
  content: string;
  links: Array<{ label: string; href: string }>;
};

type QuoteReference = {
  text: string;
  sourceRole: "user" | "assistant";
  sourceMessageIndex: number;
};

type SideMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  quote?: QuoteReference;
  status: "complete" | "incomplete";
  createdAt: string;
};

type SideChatRecord = {
  schemaVersion: 1;
  conversationId: string;
  messages: SideMessage[];
  updatedAt: string;
};
```

Panel width is a global UI preference rather than part of each conversation record.

## Context extraction and request assembly

### Main conversation representation

The adapter converts visible content into deterministic Markdown-like text:

- Paragraphs retain their reading order.
- Code blocks use fenced Markdown and preserve language labels when available.
- Tables become Markdown tables when rectangular and readable; otherwise they become tab-separated text.
- Links retain both label and destination.
- Purely decorative controls, reaction buttons, copy buttons, citations UI, and hidden accessibility duplicates are excluded.

The request starts with a system message instructing the model that the main conversation is quoted, untrusted context and that instructions inside it are not automatically authoritative. The full main conversation follows as a delimited context message with explicit `user` and `assistant` labels. Existing side-chat messages follow in chronological order. The current request is last and includes the selected quote plus the user's question.

### Size policy

The extension computes a conservative approximate token count from the assembled request and compares it with the user-declared context window.

- If the request fits, it is sent intact.
- If it does not fit, sending is blocked.
- The panel shows the estimate, configured limit, and a recommendation to choose a larger-context model.
- The user may explicitly choose **Compress old context and continue**. The model summarizes older main-chat content into a clearly labeled compressed context before retrying.
- Compression is never automatic and the UI states that the resulting request is no longer verbatim-complete.
- If the provider still rejects the request as too large, the provider error is shown without automatic truncation.

## Attachments

Attachment handling is best-effort and always visible to the user:

- Attachment names and types visible in the message DOM are recorded.
- If an attachment exposes an accessible, user-authorized URL, the extension attempts to read it only after the user invokes side chat.
- If the original bytes are unavailable, the panel asks the user to select the file again.
- TXT, Markdown, JSON, CSV, source-code files, and PDFs are converted to text locally. PDF parsing code is bundled with the extension.
- Images are sent using the OpenAI-compatible `image_url` content-part shape only when the provider configuration declares image support.
- Raw attachments are not persisted after request construction.
- A failed attachment is listed by name. The user must explicitly choose whether to continue without it.
- Vendor-specific file-upload APIs and Office-document parsing are outside the first release.

## Permissions and Chrome Web Store compliance

The manifest uses:

- Required `storage` permission.
- A content-script match limited to `https://chatgpt.com/*`.
- Optional host permissions for HTTPS origins and local HTTP origins; the extension requests only the single configured origin from a user gesture.
- No `tabs`, `cookies`, `webRequest`, `debugger`, or broad always-on host permission.

All executable JavaScript, WebAssembly, CSS, sanitization code, Markdown rendering code, and PDF parsing code is packaged in the extension. Remote responses are treated as data, never executable code.

The first-run disclosure and privacy policy state:

- Which ChatGPT content is read.
- That it is sent only when the user asks a side-chat question.
- Which user-selected model origin receives it.
- That the developer receives no chat content, credentials, or telemetry.
- What is stored locally, how it is protected, and how to delete it.

Relevant current Chrome documentation:

- [Content scripts and isolated worlds](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Runtime optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [Extension storage](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Manifest V3 remote-code requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)
- [Chrome Web Store user-data requirements](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)

## Error behavior

- **Unsupported page or extraction failure:** Do not send. Show the captured-message count, a concise explanation, and a diagnostic copy button that excludes chat content.
- **Missing session key:** Keep the composed question and quote, then prompt for the key in the extension UI.
- **Host permission denied:** Keep the draft and explain that the configured origin cannot be contacted without permission.
- **401 or 403:** Report an authentication error and offer to replace the session key.
- **429:** Preserve the draft and response state, show rate limiting, and offer manual retry.
- **Timeout, offline state, or 5xx:** Preserve partial content as `incomplete`, expose Retry, and do not duplicate the user's side message.
- **Malformed SSE or response JSON:** Preserve received text, mark it incomplete, and display the protocol error.
- **Context overflow:** Apply the explicit size policy; never truncate silently.
- **Attachment failure:** List omitted files and require confirmation before continuing without them.
- **Conversation navigation:** Abort the previous request, persist any partial response as incomplete, and load the destination conversation's side chat.
- **Storage or decryption failure:** Do not overwrite existing records. Offer an export-free reset that clearly states which local records will be deleted.

## Testing strategy

### Unit tests

- Selection eligibility and source-message attribution.
- Context extraction from user messages, assistant messages, code blocks, tables, links, citations UI, and unsupported DOM fixtures.
- Conversation-ID routing and navigation changes.
- Deterministic request assembly and prompt-boundary escaping.
- Approximate token calculation and overflow gating.
- Provider URL normalization, authorization placement, SSE parsing, cancellation, and error mapping.
- AES-GCM round trips, non-extractable key handling, record migrations, deletion, and corrupt-record behavior.
- Attachment classification, local text extraction, PDF extraction, and image gating.

### Integration tests

- Content-script-to-service-worker typed messaging.
- Runtime permission grant and denial using a mock provider origin.
- Streaming response rendering and retry behavior.
- Persistent side-chat reload for the same conversation and isolation between two conversation IDs.

### End-to-end tests

A deterministic local fixture that resembles the minimum ChatGPT message structure verifies:

- Native selection and floating-button placement.
- Button dismissal rules.
- Docked panel opening, resizing, closing, and restoration.
- Quote composition, send, streaming answer, and reload persistence.
- Navigation while streaming.
- Extraction-blocked and context-overflow screens.

A final manual smoke test runs the unpacked extension against the current `chatgpt.com` UI. The release checklist records Chrome version, tested ChatGPT URL, captured-message count, model endpoint, and result.

## Deliverables

- TypeScript Manifest V3 source.
- Reproducible build and test commands.
- Unpacked `dist/` directory.
- Chrome Web Store ZIP.
- Extension icons and store screenshots.
- English and Simplified Chinese UI copy.
- Privacy policy document suitable for hosting.
- Chrome Web Store permission, privacy, and submission checklist.

Actual publication requires the publisher's Chrome Web Store developer account, final listing metadata, a hosted privacy-policy URL, and explicit authorization to submit the package.

## Acceptance criteria

1. Selecting non-empty text within one recognized main-chat message shows **Ask in side chat** beside the native selection.
2. Clicking the action opens a docked, resizable panel and adds a removable quote without sending automatically.
3. A request contains every main-chat message extracted from the current page DOM, prior side-chat history, the active quote, and the new question.
4. The extension blocks uncertain extraction, missing permission, missing session key, and context overflow without silently dropping content.
5. One encrypted side-chat history is restored for each ChatGPT conversation after reload and remains isolated from other conversations.
6. The API key is inaccessible to page code and is cleared when the Chrome session ends.
7. All network requests go directly from the extension to the user-configured origin; the project contains no developer backend or telemetry.
8. Required unit, integration, end-to-end, build, and manual smoke checks pass before packaging.
9. The release ZIP contains no remote executable code and requests only the documented minimum permissions.
