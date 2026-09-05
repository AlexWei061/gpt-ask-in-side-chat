# Chrome Web Store Release Checklist

## Account and listing

- [ ] Register the publisher account, pay the one-time registration fee, and enable two-step verification.
- [ ] Confirm the public publisher name and support contact.
- [ ] Use the product details and reviewer flow in `docs/chrome-web-store-listing.md`.
- [ ] Provide the 128×128 icon, at least one 1280×800 screenshot, a 440×280 small promo tile, and any other assets currently required by the Developer Dashboard.
- [ ] Host `docs/privacy-policy.md` at a public HTTPS URL and enter that URL in the Privacy tab.
- [ ] Provide temporary reviewer endpoint credentials and remove/revoke them after review.
- [ ] Select the intended visibility and regions. Public, unlisted, and private items all undergo policy review.

## Privacy and permissions

- [ ] State the extension's narrow single purpose exactly as drafted.
- [ ] Disclose website content, personal communications, user-provided content/attachments, and authentication information consistently in the listing, Privacy tab, and hosted policy.
- [ ] Certify that all handled data is strictly necessary for the single purpose and is not used for advertising, sale, lending, unrelated profiling, or developer human review.
- [ ] Justify `storage`, the `chatgpt.com` content script, and the runtime optional provider-origin permission.
- [ ] Select **No remote code**; model responses are data, and all JavaScript plus `pdf.worker.min.mjs` are packaged locally.
- [ ] Confirm the prominent in-product disclosure appears before any conversation data is handled and requires affirmative consent.

## Automated release checks

- [ ] Run `npm run verify`.
- [ ] Run `npm run e2e` with the Playwright-bundled Chromium required for extension automation.
- [ ] Run `npm run package`.
- [ ] Confirm `unzip -l release/side-chat-companion-0.1.0.zip` places `manifest.json` at the ZIP root and contains only production files.
- [ ] Confirm `rg -n "test-key|api\\.example\\.test" dist release` has no matches.
- [ ] Confirm `find dist release -name '*.map' -print` prints nothing.
- [ ] Run `git diff --check`.

## Manual browser smoke test

- [ ] Load `dist/` as an unpacked extension in the current stable Chrome release.
- [ ] Test selection in a user message, assistant message, code block, and after an SPA conversation change.
- [ ] Confirm the captured-message count matches the DOM-visible conversation.
- [ ] Test a valid key, invalid key, 429 response, offline mode, abort, and context overflow.
- [ ] Test visible text/PDF/image attachments, inaccessible-attachment reselect, and explicit skip.
- [ ] Restart Chrome and confirm encrypted side history remains while the session API key must be re-entered.
- [ ] Clear one history and all histories; verify no unrelated conversation is removed.
- [ ] Record Chrome version, ChatGPT URL, provider origin, model, and test date.
- [ ] Capture store screenshots showing selection, the floating window or minimized bar, and the endpoint disclosure without real private conversations or keys.

## Submission gate

- [ ] Rebuild the final ZIP after every code or manifest change; uploaded versions must increase monotonically.
- [ ] Verify the hosted privacy-policy URL, final listing assets, reviewer credentials, and publisher account.
- [ ] Upload and submit only after the publisher explicitly authorizes the final package and visibility.

Current official references: [Prepare your extension](https://developer.chrome.com/docs/webstore/prepare), [Privacy practices](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), [Store listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing), and [2026 policy update](https://developer.chrome.com/blog/cws-policy-updates-2026).
