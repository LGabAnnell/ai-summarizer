# Code Review

## High

**projects/shared/src/lib/services/settings.service.ts:140-145** — `testCurrentProvider` drops the error message when a connection test fails.
The background now returns `{success: true, data: {valid: false}, error: result.error}` when the underlying model refresh fails, but the `map` only returns `{valid: response.data.valid}`, discarding `response.error`. The component (`app.component.ts:219`) checks `if (!result.valid && result.error)` to display the reason, so the user sees "failed" with no explanation. Fix: `return {valid: response.data.valid, error: response.error};`.

## Medium

**projects/options/src/app/app.component.ts:72** — `modelsError` creates a new `computed()` signal on every evaluation.
`getModelsErrorSignal(this.currentProvider())()` instantiates a fresh computed each time the outer computed runs — an anti-pattern (no reuse, potential Angular warnings). `modelsLoading` on the line above reads the signal directly via `isModelsLoading`, so be consistent: `modelsError = computed(() => this.settingsService.getModelsError(this.currentProvider()))`. `getModelsError` reads the underlying `_modelsCache` signal, so dependencies are still tracked.

**projects/shared/src/lib/services/settings.service.ts:166-178** — `refreshModels` writes the error twice on the "response not success" path.
The `map` branch calls `updateCachedModels(provider, [], errorMsg)` then throws; `catchError` catches that throw and calls `updateCachedModels(provider, [], errorMessage)` again. Two state updates and two `saveToStorage` writes for one failure. Set the error in one place (either the `map` throw or `catchError`, not both).

## Low

**projects/options/src/app/app.component.ts:1** — `Signal` imported but never used as a type annotation in this file. Remove it.

**projects/options/src/app/app.component.ts:64** — `ModelService` injected but never referenced (`this.modelService` has zero usages). Remove the injection and the `ModelService` import on line 9.

**extension-core/background.ts:670** — `console.log('Background: Provider test result:', result)` left in production code. Remove the debug log.

---

Note: This is a static review only. The build and tests were not run.
