# Side Chat Companion Privacy Policy

Last updated: September 4, 2026

Side Chat Companion has one purpose: let you ask a separate AI model questions about text selected in your current ChatGPT conversation while keeping one local side-chat history for that conversation.

## Data handled

The extension handles the following only to provide that feature. It counts visible messages when you open the side chat, and reads their contents when you submit a question:

- Messages and links visible in the current ChatGPT conversation when you submit a side-chat question.
- The text you select, your side-chat question, and the model response.
- Files shown in the conversation that the extension can read, or replacement files that you explicitly select. Supported files are processed locally before submission.
- The API key and model endpoint that you provide.

The extension does not collect unrelated browsing activity, analytics, advertising identifiers, or telemetry.

## How data is used and shared

When you submit a question, the extension sends the relevant conversation data directly from your browser to the model API endpoint you configured. This transfer is necessary to generate the side-chat answer. The extension developer does not operate a server for this product and does not receive your conversation, attachments, API key, side-chat history, or model response.

Your chosen model provider receives and processes submitted data under its own terms and privacy policy. Use only an endpoint and provider you trust. The developer does not sell data, use it for advertising or credit decisions, or permit human review of it.

## Storage and security

The API key is kept only in Chrome session storage, bound to the configured endpoint, and is not displayed again after saving. Side-chat histories are encrypted with AES-GCM and stored in extension-owned IndexedDB on your device. The extension contains no remote executable code. Provider traffic must use HTTPS, except for an explicitly configured loopback endpoint on `localhost` or `127.0.0.1`.

Local side-chat history remains until you clear the current history, clear all histories, or remove the extension. The API key is cleared when Chrome's extension session storage is cleared. A model provider may retain submitted data according to its own policy; the extension developer cannot delete data held by that provider.

## Your controls

You can forget the session API key and clear all encrypted side-chat histories from the extension settings. You can clear one conversation's side-chat history from its floating window. You may skip any attachment the extension cannot read.

For support or privacy requests, use the support contact published with the Chrome Web Store listing.

## Limited Use

The extension's use and transfer of user data is limited to providing its single user-facing side-chat purpose. User data is not used or transferred for personalized advertising, retargeting, unrelated profiling, sale to data brokers, or other unrelated purposes.
