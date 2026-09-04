# Chrome Web Store Listing Draft

## Product details

- Name: Side Chat Companion
- Category: Productivity
- Language: English
- Short description: Ask about selected ChatGPT text in a private, persistent side chat using your own model endpoint.

## Detailed description

Select text in a ChatGPT message and choose “Ask in side chat” to open a docked companion panel. Ask follow-up questions without leaving the conversation, and keep one encrypted local side-chat history for each ChatGPT conversation.

Side Chat Companion uses the OpenAI-compatible model endpoint and API key that you configure. Each request includes the messages currently visible in the conversation so the model has the relevant context. Text, PDF, and explicitly approved image attachments can be prepared locally. The extension warns instead of silently dropping context when a request is too large.

Privacy is built into the workflow: the extension developer operates no backend, receives no conversation data or API keys, and collects no analytics. Your API key stays in Chrome session storage. Side-chat history is encrypted and stored locally. Data is sent only when you press Send and goes directly to the provider endpoint you approved.

This independent extension is not affiliated with or endorsed by OpenAI.

## Privacy dashboard answers

- Single purpose: Let users ask a separate configured AI model questions about selected text and visible context in their current ChatGPT conversation.
- `storage` justification: Store provider settings and panel width, keep the API key for the Chrome session, and keep AES-GCM-encrypted side-chat history locally.
- `chatgpt.com` site access justification: Detect selected message text, count visible messages when the user opens the side chat, read the visible conversation when the user submits a side-chat question, and render the docked panel.
- Optional provider-origin access justification: Send the user-approved request directly to the one model API origin the user configures. Permission is requested at save time for that origin.
- Remote code: No. All executable JavaScript and the PDF worker ship in the extension. Provider responses are treated as data and sanitized before display.
- Data categories to disclose: website content, personal communications, user-provided content/attachments, and authentication information.
- Limited-use certification: Data is used and transferred only to provide the disclosed single purpose; not for advertising, sale, lending, unrelated profiling, or developer human review.

## Reviewer instructions

1. Open the extension settings and read/accept the prominent data disclosure.
2. Enter the supplied temporary OpenAI-compatible endpoint, model name, context window, and review API key; save and grant access.
3. Click **Test connection**.
4. Open the supplied ChatGPT test conversation, select text in a user or assistant message, and click **Ask in side chat**.
5. Submit a question, reload the page, select text again, and confirm the side history remains.

Before submission, replace this section with working temporary reviewer credentials and a reproducible conversation URL or test account instructions.
