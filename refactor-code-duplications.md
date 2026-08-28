# Plan: Fix Code Duplications

## Summary

Seven groups of duplication across 9 files. Fixes range from extracting shared helpers (production code) to consolidating redundant tests (spec files) to merging near-identical functions (build script). No behavior changes — pure refactor.

---

## Group A — Provider model-response parsing
**Files:** `extension-core/providers/anthropic.ts:168-175`, `extension-core/providers/openai-compatible-provider.ts:141-151`

Both providers parse the fetched models list with identical logic:
```ts
if (data.data && Array.isArray(data.data)) {
  return data.data.map((m: { id: string }) => m.id).filter((id: string) => typeof id === 'string');
}
if (Array.isArray(data)) {
  return data.map((m: { id: string }) => m.id).filter((id: string) => typeof id === 'string');
}
```

**Fix:** Add a shared helper to `extension-core/providers/provider.utils.ts`:
```ts
export function parseModelsResponse(data: unknown): string[] {
  if (data && typeof data === 'object' && 'data' in data && Array.isArray((data as any).data)) {
    return (data as any).data.map((m: { id: string }) => m.id).filter((id: string) => typeof id === 'string');
  }
  if (Array.isArray(data)) {
    return data.map((m: { id: string }) => m.id).filter((id: string) => typeof id === 'string');
  }
  return [];
}
```
- `openai-compatible-provider.ts`: replace lines 143-151 with `const models = parseModelsResponse(data); if (models.length) return models;` then keep the `console.warn` + fallback.
- `anthropic.ts`: replace lines 168-175 the same way.

Note: `anthropic.ts` extends `BaseProvider` (not `OpenAICompatibleProvider`), so it can't inherit the method — the shared util is the correct layer.

---

## Group B — MessagingService response unwrapping
**File:** `projects/shared/src/lib/services/messaging.service.ts:229-240, 289-301, 320-331`

Three methods (`notifyMLPermissionGranted`, `checkMLAvailability`, `clearMLCache`) repeat this `map` block:
```ts
map(response => {
  let result: T;
  if (response.data && typeof response.data === 'object') {
    result = response.data as T;
  } else {
    result = response as unknown as T;
  }
  return { /* shape fields */ };
})
```

**Fix:** Add a private helper to `MessagingService`:
```ts
private extractData<T>(response: MessageResponse<T>): T {
  if (response.data && typeof response.data === 'object') {
    return response.data as T;
  }
  return response as unknown as T;
}
```
Replace the repeated `let result; if (...) ... else ...` blocks with `const result = this.extractData<T>(response);` in all three methods. The per-method return-shape mapping stays (it differs per method).

---

## Group C — ClassificationService delegates to MessagingService
**File:** `projects/shared/src/lib/services/classification.service.ts:202-214, 239-250, 341-363`

`ClassificationService` re-implements `checkMLAvailability`, `clearMLCache`, and `onModelDownloadProgress` that already exist identically in `MessagingService` (which it already injects). The re-implementations add a redundant `typeof browser === 'undefined'` guard that `MessagingService` already performs internally.

**Fix:** Replace the three method bodies with delegation:
```ts
checkMLAvailability() {
  return this.messagingService.checkMLAvailability();
}
clearMLCache() {
  return this.messagingService.clearMLCache();
}
onModelDownloadProgress() {
  return this.messagingService.onModelDownloadProgress();
}
```
Remove the now-unused `browser` import and `of`/`throwError`/`map`/`catchError` imports from `classification.service.ts` if they become unused (verify with `npm run build:debug`). Keep `classifyText`, `classifyArticle`, `getMLSettings`, `saveMLSettings`, `isMLEnabled`, `enableML`, `disableML` — these are not duplicated.

---

## Group D — package-dist.ts folder copy functions
**File:** `builds/package-dist.ts:110-127, 131-148`

`copyFolderContents` and `copyFolderRecursiveSync` are identical except that the former delegates subdirectories to the latter. Both: ensure target dir, read source, iterate, recurse dirs / copy files.

**Fix:** Delete `copyFolderContents` (lines 108-128). Update the call site at line 64 to call `copyFolderRecursiveSync(browserPath, destPath)` directly. Keep `copyFolderRecursiveSync` as the single recursive implementation. No other call sites exist.

---

## Group E — header.component.spec.ts mock ThemeService factory
**File:** `projects/shared/src/lib/components/header/header.component.spec.ts:96-107, 112-123, 128-139, 144-155, 160-171, 176-187`

The same mock `ThemeService` object literal is built 6 times, differing only in `isDarkTheme`'s return value (`vi.fn(() => false)` vs `vi.fn(() => true)`).

**Fix:** Add a helper near the top of the `describe` block:
```ts
function createMockThemeService(isDark: boolean): ThemeService {
  return {
    isDarkTheme: vi.fn(() => isDark),
    theme: { asReadonly: () => ({}) } as any,
    systemTheme: { asReadonly: () => ({}) } as any,
    effectiveTheme: { asReadonly: () => ({}) } as any,
  } as unknown as ThemeService;
}
```
Replace each of the 6 inline literals with `createMockThemeService(false)` / `createMockThemeService(true)`. The existing `beforeEach` `mockThemeService` can also use `createMockThemeService(false)`.

---

## Group F — Redundant "disabled attribute" tests in button specs
**Files:** `copy-button.component.spec.ts:157-164`, `summarize-button.component.spec.ts:155-162`

Each spec has two tests covering the disabled input:
- "should disable button when disabled is true" (copy:58-64, summarize:57-63) — checks `button.disabled` truthy.
- "should have disabled attribute when disabled" (copy:157-164, summarize:155-162) — checks `hasAttribute('disabled')` + `button.disabled`.

The later test is a strict superset of the earlier. They are also cross-file duplicates of each other.

**Fix:** Remove the less-thorough earlier duplicate (copy:58-64, summarize:57-63) and keep the more thorough later test (which checks both the attribute and the property). Move the kept test into the "Input Bindings" describe block if desired for logical grouping, or leave it in "Template Rendering". Cross-file similarity between the two component specs is acceptable — each spec stays self-contained.

---

## Group G — summary-header.component.spec.ts structure assertions
**File:** `projects/shared/src/lib/components/summary-header/summary-header.component.spec.ts:221-229, 238-246`

Two tests repeat the `.summary-header` + `.summary-title` query-and-truthy-check pattern:
- 221-229: header truthy, title truthy, actions truthy, copyButton truthy.
- 238-246: header truthy, title truthy, actions null.

**Fix:** Extract a small helper inside the `describe`:
```ts
function queryHeaderElements() {
  return {
    header: fixture.debugElement.query(By.css('.summary-header')),
    title: fixture.debugElement.query(By.css('.summary-title')),
    actions: fixture.debugElement.query(By.css('.summary-actions')),
  };
}
```
Use it in both tests to remove the repeated query lines. The assertions themselves stay (they differ: one expects actions truthy, the other null).

---

## Verification

After all edits:
1. `npm run build:debug` — confirms TypeScript compiles (catches unused imports in classification.service.ts).
2. `npm run lint` — confirms lint passes.
3. `npm run test` — confirms all spec changes pass (Groups E, F, G).
4. Manual: confirm no behavior change in provider model fetching (Group A) — covered by existing provider tests if present; otherwise trust the type-checked refactor.

## Out of scope
- No new shared test-utility files across component specs (Group F cross-file similarity is intentionally left; each spec remains self-contained per repo convention).
- No changes to `MessagingService` public API surface — only internal helper extraction.
