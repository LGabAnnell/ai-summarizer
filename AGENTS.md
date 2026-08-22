# AGENTS.md - Article Summarizer Browser Extension

This file provides guidance for coding agents working in this repository.

---

## 1. Repository Purpose & Main Functionality

**What it does:** Firefox Manifest V3 browser extension that extracts article content from web pages and sends it to configurable AI providers for summarization.

**Core Flow:**
```
User clicks extension -> Content script extracts article (Readability.js) -> 
Background service worker calls AI API -> Summary displayed in popup/sidebar
```

**Key Features:**
- Article extraction via Mozilla Readability.js with fallback
- Multiple AI providers: Mistral, OpenAI, Anthropic, Qwen (DashScope), DeepSeek, Custom endpoints
- Configurable summary styles: concise, detailed, bullet_points, custom
- Request caching (7-day TTL by default) to avoid duplicate API calls
- History tracking in sidebar with search and filtering
- Theme support (light/dark) in sidebar
- Privacy-focused: API keys stored locally, no telemetry

---

## 2. Technology Stack

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| **Framework** | Angular | v22 | Popup, Options, Sidebar UIs |
| **Language** | TypeScript | ~6.0 | All source code |
| **Build Tool** | Angular CLI | ^22.0.0 | Angular project builds |
| **Bundler** | esbuild | ^0.28.1 | Extension core (background, content) |
| **Package Manager** | npm | v9+ | Dependency management |
| **Extension API** | Firefox WebExtensions | Manifest V3 | Browser extension runtime |
| **Polyfill** | webextension-polyfill | ^0.12.0 | Chrome-like API for Firefox |
| **Markdown** | marked | ^18.0.7 | Render markdown in summaries |
| **Reactivity** | RxJS | ^7.8.0 | State management in Angular |
| **Article Extraction** | @mozilla/readability | ^0.6.0 | Content extraction library |

---

## 3. Project Structure

```
article-summarizer/
├── extension-core/                    # Non-Angular extension core (TypeScript, esbuild)
│   ├── background.ts                  # Service worker: orchestrates messaging, caching, AI calls
│   ├── content/
│   │   └── content.ts                # Injected into pages: extracts article via Readability.js
│   ├── providers/
│   │   ├── index.ts                  # Provider factory and utilities
│   │   ├── provider.model.ts         # AIProvider interface and types
│   │   ├── base-provider.ts           # Base class with common logic
│   │   ├── openai-compatible-provider.ts
│   │   ├── summary-prompts.ts         # System prompts for different styles
│   │   ├── provider.utils.ts          # Validation helpers
│   │   ├── mistral.ts                # Mistral provider implementation
│   │   ├── openai.ts                 # OpenAI provider implementation
│   │   ├── anthropic.ts              # Anthropic provider implementation
│   │   ├── qwen.ts                   # Qwen (DashScope) provider
│   │   ├── deepseek.ts               # DeepSeek provider
│   │   └── custom.ts                 # Custom OpenAI-compatible endpoint
│   └── vendor/                       # Vendored libraries
│       └── readability.js            # Mozilla Readability.js
├── projects/                          # Angular workspace
│   ├── popup/                        # Popup UI application
│   │   └── src/app/app.component.ts  # Main popup component with states
│   ├── options/                       # Options page application
│   │   └── src/app/app.component.ts  # Settings form
│   ├── sidebar/                       # Sidebar panel application
│   │   └── src/app/app.component.ts  # History, theme, summarization UI
│   └── shared/                        # Shared Angular library
│       └── src/lib/
│           ├── models/
│           │   ├── settings.model.ts  # ExtensionSettings, ProviderType, PROVIDER_MODELS
│           │   └── summary.model.ts   # SummaryState, SummaryResult, ArticleData, HistoryItem
│           ├── services/
│           │   ├── messaging.service.ts # Wrapper for browser.runtime messaging
│           │   ├── settings.service.ts  # Manages browser.storage for settings
│           │   ├── summary.service.ts   # Manages summarization state
│           │   ├── history.service.ts   # Manages history storage
│           │   └── theme.service.ts     # Manages theme preferences
│           ├── pipes/markdown.pipe.ts # Converts markdown to HTML
│           └── public-api.ts
├── builds/                           # Build scripts
│   ├── build-extension.ts            # esbuild config for background.ts + content.ts
│   └── package-dist.ts               # Assembles final dist/ folder
├── icons/                            # Extension icons (SVG)
├── manifest.json                     # Firefox extension manifest (Manifest V3)
├── package.json                      # Root dependencies and npm scripts
├── angular.json                      # Angular workspace configuration
└── tsconfig.json                     # Root TypeScript config
```

---

## 4. Architectural Decisions & Patterns

### 4.1 Separation of Concerns
- **Extension Core (plain TS):** `extension-core/` - background service worker and content scripts. No Angular. Built with esbuild.
- **Angular Apps:** `projects/popup/`, `projects/options/`, `projects/sidebar/` - UI components. Built with Angular CLI.
- **Shared Library:** `projects/shared/` - Common models, services, pipes. Used by all Angular apps.

### 4.2 Provider Pattern
All AI providers implement the `AIProvider` interface:

```typescript
interface AIProvider {
  config: AIProviderConfig
  buildRequest(articleText: string, title?: string, settings?: any): AIProviderRequest
  parseResponse(response: any): AIProviderResponse
  getTokenCount(articleText: string): number
  getSystemPrompt(style?: string, customPrompt?: string): string
  fetchModels(apiKey: string): Promise<string[]>
}
```

Provider hierarchy:
- `base-provider.ts` - Common validation and logic
- `openai-compatible-provider.ts` - Shared logic for OpenAI-compatible APIs
- Individual providers (Mistral, OpenAI, Qwen, DeepSeek, Custom) extend the above
- `anthropic.ts` - Anthropic-specific implementation (different API schema)

### 4.3 Messaging Architecture
```
popup/sidebar <-> MessagingService <-> browser.runtime.sendMessage <-> background.js
content.js <-> browser.runtime.sendMessage <-> background.js
```

Key message types: `EXTRACT_AND_SUMMARIZE`, `SUMMARIZE`, `GET_SETTINGS`, `SAVE_SETTINGS`, `TEST_PROVIDER`, `REFRESH_MODELS`, `CLEAR_CACHE`.

### 4.4 State Management
- **Angular Signals:** Used for reactive state in components
- **RxJS Observables:** Used for async operations in services
- **Service Pattern:** Shared services expose state via signals; components subscribe

### 4.5 Caching Strategy
- Cache key: `summary_cache_` + base64(URL + provider + model + prompt + style)
- Storage: `browser.storage.local`
- TTL: Configurable (default 7 days)
- Automatic cache invalidation on expiration

### 4.6 Build Pipeline
```
npm run build
├── npm run build:shared       # ng build shared
├── npm run build:popup        # ng build popup --configuration production
├── npm run build:options      # ng build options --configuration production
├── npm run build:sidebar      # ng build sidebar --configuration production
└── npm run build:extension    # esbuild background.ts + content.ts, then package-dist.ts
```

---

## 5. Build & Dependency Configurations

### 5.1 Angular Workspace (`angular.json`)
- 4 projects: `popup`, `options`, `sidebar` (apps), `shared` (library)
- Each app has production, development, debug configurations
- Build output paths: `dist/popup/`, `dist/options/`, `dist/sidebar/`
- Shared library built with `ng-packagr`

### 5.2 esbuild Config (`builds/build-extension.ts`)
- Target: ES2022, browser platform
- Bundle: true, Format: ESM
- Entry points:
  - `extension-core/background.ts` -> `dist/background.js`
  - `extension-core/content/content.ts` -> `dist/content.js`

### 5.3 TypeScript Config (`tsconfig.json`)
- Target: ES2022, Module: ES2022
- Strict mode enabled
- Path aliases: `@shared/*` -> `projects/shared/src/*`
- Module resolution: `bundler`

### 5.4 Manifest V3 (`manifest.json`)
- Service worker: `background.js`
- Content scripts: `content.js` (matches all URLs)
- Action popup: `popup/index.html`
- Sidebar panel: `sidebar/index.html`
- Options UI: `options/index.html` (opens in tab)
- Permissions: `activeTab`, `scripting`, `storage`, `<all_urls>`

### 5.5 Key Dependencies
| Package | Purpose |
|---------|---------|
| `@angular/*` | v22 - Framework for UI apps |
| `webextension-polyfill` | Polyfill for Firefox WebExtensions API |
| `@mozilla/readability` | Article extraction library |
| `marked` | Markdown parsing |
| `esbuild` | Bundler for extension core |
| `web-ext` | Extension packaging tool |
| `typescript` | ~6.0 - TypeScript compiler |
| `rxjs` | ^7.8 - Reactive extensions |

---

## 6. Agent Guidelines

### 6.1 General Rules

**DO:**
- Follow Angular standalone component style (no NgModule)
- Use Signals for state management in components
- Use RxJS Observables for async operations in services
- Place shared types in `projects/shared/src/lib/models/`
- Place shared services in `projects/shared/src/lib/services/`
- Extend `OpenAICompatibleProvider` for OpenAI-compatible APIs
- Use `browser.runtime.sendMessage` for cross-context communication
- Always handle errors and provide user feedback
- Use `MarkdownPipe` for rendering markdown safely

**DON'T:**
- Add Angular to extension-core (background/content scripts)
- Use `innerHTML` without sanitization
- Store API keys anywhere but `browser.storage.local`
- Add telemetry or analytics
- Commit to `dist/` (it's gitignored)
- Assume Chrome APIs work in Firefox (use `webextension-polyfill`)

### 6.2 Adding a New AI Provider

1. Create new file: `extension-core/providers/[provider-name].ts`
2. Extend `OpenAICompatibleProvider` (or `BaseProvider` for non-OAI APIs)
3. Implement required methods: `buildRequest`, `parseResponse`
4. Export provider class and factory function
5. Update `extension-core/providers/index.ts`:
   - Import new provider
   - Add to `createProvider` switch statement
   - Add to `getAvailableProviderTypes()`
   - Add to `getProviderDisplayNames()`
   - Add to `getDefaultModel()`
   - Add to `getAvailableModels()`
6. Update `projects/shared/src/lib/models/settings.model.ts`:
   - Add provider to `ProviderType` union type
   - Add to `PROVIDER_MODELS` map
   - Add to `PROVIDER_CONFIGS` map

### 6.3 Adding a New UI Feature

1. Add to `projects/shared/` if reusable across popup/options/sidebar
2. Use standalone Angular components
3. Use Signals for local state
4. Use existing services (`MessagingService`, `SettingsService`, etc.)
5. Add styles in component's `styles` array or in project's `styles.scss`

### 6.4 Build & Test Commands

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run build` | Full production build |
| `npm run build:debug` | Full debug build with source maps |
| `npm run build:popup` | Build popup only |
| `npm run build:options` | Build options only |
| `npm run build:sidebar` | Build sidebar only |
| `npm run build:shared` | Build shared library only |
| `npm run build:extension` | Build extension core (esbuild) |
| `npm run watch` | Watch mode for development |
| `npm run test` | Run Angular tests |
| `npm run lint` | Lint all projects |
| `npm run package` | Package with `web-ext build` |
| `npm run run` | Run with `web-ext run` |

### 6.5 Debugging Tips

- Load extension in Firefox: `about:debugging` -> "Load Temporary Add-on" -> select `dist/` folder
- Background script errors: `about:debugging#/runtime/this-firefox` -> "Inspect"
- Content script errors: Check the page's browser console
- Popup/sidebar errors: Right-click inside popup/sidebar -> Inspect
- All API calls must route through the background script (CORS restrictions)

### 6.6 Common Pitfalls

1. **CORS issues:** Background script can fetch any URL, but popup cannot. All API calls must go through background.
2. **Message timing:** Ensure `return true` in message listeners for async responses.
3. **Storage limits:** `browser.storage.local` has ~5MB limit (per origin). Cache entries should be pruned.
4. **Content script injection:** Use `scripting.executeScript` dynamically for better privacy.
5. **Angular zone issues:** Some browser extension APIs may trigger outside NgZone. Use `NgZone.run()` if needed.
6. **Firefox vs Chrome:** Use `webextension-polyfill` to normalize API differences.

### 6.7 File Modifications Checklist

When modifying code:
- [ ] Update corresponding tests if they exist
- [ ] Verify TypeScript compiles without errors (`npm run build`)
- [ ] Check Angular lint passes (`npm run lint`)
- [ ] Test in Firefox with `npm run build && load dist/`
- [ ] Clear cache if testing caching behavior
- [ ] Test with multiple providers
- [ ] Verify error states display properly


# Angular and typescript rules

You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.
## TypeScript Best Practices
- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain
## Angular Best Practices
- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Do NOT set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly. `OnPush` is the default in Angular v22+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
   - `NgOptimizedImage` does not work for inline base64 images.
### Components
- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `model()` for two-way bound properties with `[(prop)]` syntax instead of pairing `input()` with `output()`
- Use `computed()` for derived state
- Use `linkedSignal()` for state derived from multiple reactive sources that must stay synchronized
- Prefer inline templates for small components
- Prefer Signal Forms (`@angular/forms/signals`) for new forms. They are stable in Angular v22+ and provide signal-based state, type-safe field access, and schema-based validation
- When not using Signal Forms, prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.
## State Management
- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead
## Templates
- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.
## Services
- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Prefer the `@Service` decorator over `@Injectable({providedIn: 'root'})` for new singleton services (Angular v22+)
- Use the `inject()` function instead of constructor injection