v# Firefox Extension Specification: Article Summarizer

## 1. Overview

**Name:** Article Summarizer (working title)
**Platform:** Firefox (Manifest V3, using the WebExtensions API)
**Purpose:** Extract the readable article content from the current page and send it to an AI API of the user's choosing to generate a summary, displayed to the user.

**Core user flow:**
1. User navigates to an article page.
2. User clicks the extension toolbar icon (or a keyboard shortcut / context-menu item).
3. Extension extracts the main article text from the page.
4. Extension sends the text to the configured AI provider's API.
5. Extension displays the summary in a popup or side panel.

---

## 2. Architecture

### 2.1 Components

| Component | Responsibility |
|---|---|
| **Content script** (`content.js`) | Injected into the page; extracts article text using a readability algorithm. |
| **Background service worker** (`background.js`) | Orchestrates messaging, calls the AI API, manages caching/rate-limiting. |
| **Popup UI** (`popup.html` / `popup.js`) | Triggers summarization, displays results, shows loading/error states. |
| **Options page** (`options.html` / `options.js`) | Lets user configure AI provider, API key, model, prompt template, summary length/style. |
| **Storage layer** | `browser.storage.local` for cached summaries; `browser.storage.sync` (optional) or `local` for settings — see §6 on API key storage. |

### 2.2 Data flow

```
Page DOM
   │  (Readability extraction)
   ▼
content.js  ──message──▶  background.js  ──HTTPS──▶  AI Provider API
                                │
                                ▼
                          popup.js (render summary)
```

Content scripts don't call external APIs directly (CSP and permission hygiene); all network calls happen in the background service worker.

### 2.3 Tech Stack & Build System

- **UI framework:** Angular (standalone components, latest LTS) for the **popup** and **options page** — both are self-contained Angular apps sharing common services/models from a shared library.
- **Background service worker & content script:** plain TypeScript, **not** Angular — a service worker and a content script have no DOM to render into and don't benefit from a component framework; pulling in Angular's runtime there would only add bundle size and startup latency for no UI benefit. They're built as lightweight TS → JS bundles instead.
- **Build tooling:** Angular CLI (`@angular/cli`) handles the popup/options builds; a small **esbuild** (or Angular CLI's underlying esbuild builder, wired to a second entry point) handles `background.ts` and `content.ts`. A root-level script (`npm run build`) runs both and copies everything into a single `dist/` extension package alongside `manifest.json`, icons, and vendored libraries (Readability.js).
- **Why not one Angular build for everything:** Manifest V3 service workers must be a single classic or module script with no `document`/`window` assumptions baked in by the framework's bootstrap process — keeping it Angular-free avoids fighting the service worker environment. Popup and options *do* have a DOM (they're regular extension pages), so Angular is a natural fit there for componentized settings forms, reactive forms validation on API keys, etc.
- **State/messaging bridge:** Angular services in `popup`/`options` wrap `browser.runtime.sendMessage` / `browser.storage` calls behind injectable Angular services (e.g., `SettingsService`, `SummaryService`), so components stay declarative and the messaging/storage plumbing is testable in isolation.
- **Testing:** Karma/Jasmine (Angular CLI default) or Jest for unit tests on components/services; manual/`web-ext run` for extension-level integration testing.

---

## 3. Article Extraction

- Use **Mozilla's Readability.js** (the same library Firefox Reader View uses) bundled into the content script. This is a natural fit since it's already the Firefox-native approach and is well-tested against real-world article markup.
- Extraction steps:
  1. Clone the current `document`.
  2. Run `new Readability(documentClone).parse()`.
  3. Result gives `{ title, byline, content (HTML), textContent, excerpt, length }`.
  4. Use `textContent` (plain text) as the payload sent for summarization; keep `title` for context and display.
- **Fallback:** if Readability fails to find an article (e.g., `parse()` returns null — common on non-article pages like search results or SPAs), fall back to:
  - Largest `<article>` or `<main>` block, or
  - Show the user an error state: "Couldn't detect article content on this page."
- **Truncation:** Many AI APIs have context limits. Truncate `textContent` to a configurable max character count (default: ~15,000 characters ≈ ~4,000 tokens) before sending, and warn the user if truncation occurred.

---

## 4. AI Provider Integration

### 4.1 Supported providers (configurable)

Design this as a pluggable adapter pattern so new providers are easy to add:

```js
// providers/anthropic.js, providers/openai.js, providers/custom.js
export interface AIProvider {
  id: string;
  name: string;
  endpoint(config): string;
  buildRequest(text, title, config): RequestInit;
  parseResponse(json): string; // returns summary text
}
```

Providers to support:
- **Anthropic** (Claude API — `/v1/messages`)
- **OpenAI** (Chat Completions or Responses API)
- **Mistral** (Mistral La Plateforme API — `/v1/chat/completions`, OpenAI-compatible schema)
- **Qwen** (Alibaba Cloud DashScope / Qwen API — either its native endpoint or its OpenAI-compatible mode)
- **DeepSeek** (DeepSeek API — `/v1/chat/completions`, OpenAI-compatible schema)
- **Custom/OpenAI-compatible endpoint** (for local models via Ollama, LM Studio, etc., or any other provider using an OpenAI-compatible schema)

Note: Mistral, OpenAI, Qwen, and DeepSeek all expose OpenAI-compatible chat completion endpoints, so once the **Mistral** adapter is built as the reference implementation (first provider, per the build order in §10), the OpenAI/Qwen/DeepSeek adapters can largely reuse its request/response shape with a different base URL, auth header, and model list — only Anthropic needs a genuinely distinct adapter (different message envelope, auth header, and response shape).

### 4.2 Options page fields

- Provider selector (dropdown)
- API key (password-masked input)
- Model name (text input or dropdown populated per-provider, e.g. `claude-sonnet-4-6`, `gpt-4o`)
- Custom endpoint URL (shown only when "Custom" provider selected)
- Summary style: length (short / medium / long), tone (neutral / bullet points / ELI5), language
- Optional: custom system prompt override

### 4.3 Request construction

Background worker builds a prompt like:

```
Summarize the following article in {length} {style}.
Title: {title}
Article:
{textContent}
```

Send via `fetch()` from the background service worker (not content script) to the provider's endpoint, with the user's API key in the appropriate header (`x-api-key` for Anthropic, `Authorization: Bearer` for OpenAI, etc.).

### 4.4 Error handling

- Invalid/missing API key → prompt user to check Options.
- Rate limit / 429 → show retry-after message.
- Network failure → show retry button.
- Provider-specific error payloads → parsed and surfaced in plain language.

---

## 5. Permissions (manifest.json)

Keep permissions minimal and justify each (Firefox reviewers and users both scrutinize this):

```json
{
  "manifest_version": 3,
  "name": "Article Summarizer",
  "permissions": [
    "activeTab",
    "storage",
    "scripting"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "optional_host_permissions": [],
  "background": {
    "scripts": ["background.js"],
    "type": "module"
  },
  "action": {
    "default_popup": "popup/index.html"
  },
  "options_ui": {
    "page": "options/index.html",
    "open_in_tab": true
  }
}
```

This `manifest.json` lives at the workspace root during development and is copied into `dist/` by the packaging step, with paths already matching the Angular build output locations.

Notes:
- Use `activeTab` + on-demand `scripting.executeScript` rather than a persistent `content_scripts` match-all injection — this only runs extraction when the user actually invokes the extension, which is both more private and avoids unnecessary CSP/performance overhead on every page load.
- `<all_urls>` in `host_permissions` is needed for the background worker to call arbitrary AI API endpoints (especially with the "custom endpoint" option) — but this should be scoped down to the specific provider domains if the custom-endpoint feature is dropped, since that meaningfully reduces the review/trust footprint.
- No `tabs` permission needed if you only work with `activeTab`.

---

## 6. Security & Privacy Considerations

- **API key storage:** `browser.storage.local` is unencrypted on disk (readable by anything with filesystem access to the profile). This is standard practice for browser extensions but should be disclosed to the user in the options page and README. Do **not** use `storage.sync` for API keys (syncs across devices via Mozilla account infrastructure — larger exposure surface).
- **No third-party telemetry.** Article text is sent only to the provider endpoint the user explicitly configured — nowhere else. State this clearly in a privacy policy, since it's a reasonable thing for users to want confirmed.
- **CSP:** Since content scripts don't make network calls, no `connect-src` relaxation is needed there. Background worker's `fetch` targets are inherently dynamic (user-chosen endpoints), which is a reason to keep the codebase auditable and open-source if possible, so users can verify no data exfiltration.
- **Input sanitization:** When rendering the AI's response in the popup, treat it as plain text (use `textContent`, not `innerHTML`) unless you intentionally support Markdown rendering — in which case sanitize with a library like DOMPurify before rendering any HTML.
- **Rate limiting / cost control:** Consider a local cache keyed by URL + content hash so re-opening the popup on the same article doesn't re-trigger a paid API call. Optionally show estimated token/cost count before sending (nice-to-have).

---

## 7. UI/UX

### Popup (Angular app, `projects/popup`)
- `AppComponent` hosts a "Summarize this page" button
- `LoadingStateComponent` / `SummaryViewComponent` swap in based on state: idle → loading (spinner) → result (summary text, copy button) → error (message + retry)
- `SummaryService` (shared lib) handles messaging to the background worker and exposes an Angular signal/observable the components subscribe to
- Small footer link to Options (`browser.runtime.openOptionsPage()`)

### Options page (Angular app, `projects/options`)
- `ProviderFormComponent`: provider/model/key configuration (§4.2) using Angular Reactive Forms, with validators on required fields and an async validator for the "Test connection" check
- `CacheSettingsComponent`: toggle for local summary caching, with a "clear cache" button
- `SettingsService` (shared lib) wraps `browser.storage.local` reads/writes so both apps stay in sync on the same settings shape

### Optional enhancements (v2+)
- Context-menu item: "Summarize this article" (right-click)
- Keyboard shortcut (`commands` API)
- Side panel (Firefox's `sidebarAction`) for a persistent summary view instead of a popup that closes on focus loss
- Streaming display of the summary as tokens arrive (if provider supports SSE streaming)

---

## 8. File Structure

Angular workspace with multiple projects (popup app, options app) plus a shared library, and a non-Angular `extension-core` folder for the service worker/content script:

```
article-summarizer/
├── angular.json                    # Angular workspace config (2 app projects + 1 lib)
├── package.json
├── tsconfig.json
├── build/
│   ├── build-extension.ts          # esbuild config for background.ts + content.ts
│   └── package-dist.ts             # copies manifest.json, icons, vendored libs into dist/
├── manifest.json
├── icons/
│   ├── icon-48.png
│   └── icon-96.png
├── extension-core/                 # NOT Angular — plain TS, esbuild-bundled
│   ├── background.ts
│   ├── content/
│   │   ├── content.ts
│   │   └── readability.ts          # vendored Mozilla Readability library
│   └── providers/
│       ├── anthropic.ts
│       ├── openai.ts
│       ├── mistral.ts
│       ├── qwen.ts
│       ├── deepseek.ts
│       └── custom.ts
├── projects/
│   ├── popup/                      # Angular app
│   │   └── src/
│   │       ├── app/
│   │       │   ├── app.component.ts
│   │       │   ├── summary-view/
│   │       │   └── loading-state/
│   │       ├── index.html
│   │       └── main.ts
│   ├── options/                    # Angular app
│   │   └── src/
│   │       ├── app/
│   │       │   ├── app.component.ts
│   │       │   ├── provider-form/
│   │       │   └── cache-settings/
│   │       ├── index.html
│   │       └── main.ts
│   └── shared/                     # Angular library: services/models used by both apps
│       └── src/
│           ├── services/
│           │   ├── settings.service.ts
│           │   ├── summary.service.ts
│           │   └── messaging.service.ts
│           └── models/
│               └── provider.model.ts
└── dist/                           # build output — the actual loadable extension
    ├── manifest.json
    ├── background.js
    ├── content.js
    ├── popup/index.html + bundle
    ├── options/index.html + bundle
    └── icons/
```

`npm run build` runs the Angular CLI builds for `popup` and `options`, runs the esbuild step for `extension-core`, and assembles everything into `dist/` — that `dist/` folder is what gets loaded via `about:debugging` (temporary add-on) or packaged with `web-ext build`.

---

## 9. Open Questions for You

- Should summaries be cached indefinitely, or expire after N days?
- Do you want streaming output (tokens appear progressively) or a single completed response?
- Is a context-menu / right-click trigger important, or is toolbar-click-only sufficient for v1?
- Should local/self-hosted models (Ollama, LM Studio) be exposed as a distinct provider option, or just left to the generic "Custom" endpoint?

---

## 10. Suggested Build Order (MVP → polish)

1. Scaffold the Angular workspace (`ng new` with `popup`, `options`, and `shared` projects) and the `extension-core` esbuild pipeline; get a "hello world" `dist/` loading as a temporary add-on in Firefox with the manifest wired to both.
2. `activeTab` extraction with Readability in `content.ts`, messaged up to a stubbed `background.ts`.
3. Background worker with a single hardcoded provider (**Mistral** — used as the test/reference provider since it's a clean OpenAI-compatible schema to validate the adapter pattern against) to validate the end-to-end flow, rendered in the popup's `SummaryViewComponent`.
4. Options app: `ProviderFormComponent` for API key + provider/model selection, backed by `SettingsService`.
5. Add the remaining providers (OpenAI, Qwen, DeepSeek reuse the OpenAI-compatible request shape almost directly; Anthropic needs its own adapter for message envelope/auth/response shape).
6. Error states, caching, and truncation warnings.
7. Polish: context menu, keyboard shortcut, streaming, side panel.
