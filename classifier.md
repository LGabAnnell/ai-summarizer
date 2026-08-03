# Spec: In-Browser Text Classification via `browser.trial.ml`

## 1. Summary

Add local text classification to the extension using Firefox's built-in AI runtime (`browser.trial.ml`), which wraps Transformers.js + ONNX Runtime internally. Inference runs in the background script; results are sent to the front-end module over the existing messaging channel. No model files or WASM binaries need to be bundled — Firefox downloads and caches them via its own runtime.

**Non-goals:** cross-browser support (this API is Firefox-only), streaming/token-level output, training or fine-tuning in-browser.

## 2. Background & Constraints

- The API lives under `browser.trial.ml`, not the stable `browser` namespace. Per Mozilla, it is "virtually guaranteed to change" across Firefox versions — treat it as unstable, not a long-term commitment.
- Enabled by default on **Nightly**. On **Beta/Release**, users (or the extension's install flow) must flip `extensions.ml.enabled` to `true` in `about:config`. As of the current stable channel (Firefox 153/154, Aug 2026), it has not graduated out of trial status — confirm this hasn't changed before shipping, since the flag requirement materially affects distribution.
- Requires the `trialML` **optional** permission — this is a post-install, user-granted permission (like host permissions), not a manifest-only one. You must call the permissions API to prompt for it; it cannot be silently assumed granted.
- First `createEngine()` call for a given model triggers a **model download** (cached in browser storage, shared across origins/extensions using the same model). This can take a while on first run — must be handled asynchronously with visible progress, not treated as instant.
- Runs in an isolated process, not your background script's thread — so it won't block the UI, but it also means you're making async calls across a process boundary and should handle failure/timeout paths.

## 3. Architecture

```
Front-end module                 Background script                 Firefox AI runtime
─────────────────                ─────────────────                 ───────────────────
 user action        ── msg ──►    receives classify request
 (e.g. click,                     checks/requests trialML perm
  text input)                     checks engine initialized?
                                     no → createEngine() ──────────►  downloads/loads model
                                          (progress events) ◄────────  onProgress callbacks
                                     yes → runEngine(text) ─────────►  runs inference
                                   ◄─────────────────────────────────  returns label/score
 renders result      ◄─ msg ──    sends result back
```

Key decision: **engine lifecycle lives entirely in background.js**, not in the front-end. The front-end only ever sends "classify this text" and receives a result/error — it should have no knowledge of `browser.trial.ml` at all. This keeps the experimental API surface isolated to one file, which matters given how likely it is to change.

## 4. Manifest Changes

```json
{
  "optional_permissions": ["trialML"],
  "background": {
    "scripts": ["background.js"]
  }
}
```

Note: `trialML` goes under `optional_permissions`, not `permissions` — it must be requested at runtime, ideally triggered by a clear user action (e.g. "Enable AI classification" button), not on install.

## 5. Background Script: Required Pieces

### 5.1 Permission gate
- Function to check if `trialML` is currently granted (`browser.permissions.contains`).
- Function to request it (`browser.permissions.request`) — must be called from a user gesture (e.g. triggered by a message that originated from a button click in the front-end), since permission prompts require user activation.
- Front-end needs a way to know permission state so it can show "enable AI features" UI rather than silently failing.
- Add a button to the options component to trigger the permission request.

### 5.2 Engine lifecycle management
- Lazy-init: don't call `createEngine()` until the first classification request arrives.
- Cache the engine/initialization promise (not just a boolean flag) so concurrent classify requests during startup don't trigger duplicate `createEngine()` calls — await the same in-flight promise.
- Decide and pin: **model hub** (`huggingface` vs `mozilla`) and **specific model ID** for `taskName: "text-classification"`. Don't rely on the default model silently — pin an explicit `modelId` so behavior doesn't shift under you if Firefox changes defaults.
- Register `browser.trial.ml.onProgress` listener before calling `createEngine()`, and relay progress events to the front-end (e.g. "Downloading model: 42%") so first-run doesn't look frozen.

### 5.3 Classification call
- Wrap `runEngine({ args: [text] })` with:
    - Input validation (empty string, length caps — long text may need truncation depending on model's max token length).
    - Timeout handling.
    - Try/catch around both `createEngine` and `runEngine` — model download can fail (network, storage quota), and the trial API's error shapes aren't fully documented, so don't assume a specific error object shape.
- Return normalized shape to front-end regardless of underlying model's raw output format, e.g.:
  ```js
  { ok: true, label: "POSITIVE", score: 0.98 }
  // or
  { ok: false, error: "MODEL_DOWNLOAD_FAILED" }
  ```

### 5.4 Message contract (background ↔ front-end)

Extend your existing messaging channel with a small set of message types:

| Direction | Type | Payload | Purpose |
|---|---|---|---|
| FE → BG | `CLASSIFY_TEXT` | `{ text: string }` | Request classification |
| BG → FE | `CLASSIFY_RESULT` | `{ ok, label?, score?, error? }` | Result or error |
| BG → FE | `MODEL_DOWNLOAD_PROGRESS` | `{ progress: number }` | First-run download status |
| FE → BG | `REQUEST_ML_PERMISSION` | — | Triggered by user gesture in FE |
| BG → FE | `ML_PERMISSION_STATUS` | `{ granted: boolean }` | So FE can gate UI |

### 5.5 Cleanup
- Expose a way to call `browser.trial.ml.deleteCachedModels()` (e.g. from an options page "clear AI model cache" button) — note it deletes **all** cached models, not a single one, so surface that clearly in the UI copy if you use more than one model/task.

## 6. Front-End Module Changes

- Add a thin client function, e.g. `classifyText(text): Promise<Result>`, that wraps sending `CLASSIFY_TEXT` and awaiting `CLASSIFY_RESULT` — front-end code calls this and never touches `browser.trial.ml` directly.
- Add UI states: not-permitted (show enable button) → downloading (show progress) → ready (instant classify) → error (retry option).
- Gate any feature that depends on classification behind a permission check on load, so the UI doesn't silently no-op.

## 7. Model to use

- Use the "text-classification" feature, e.g.
```
  // 2. Create the engine, may trigger downloads.
await browser.trial.ml.createEngine({
  modelHub: "mozilla",
  taskName: "text-classification",
});
```