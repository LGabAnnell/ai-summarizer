# Background modules

The background entrypoint wires the runtime message listener, ML progress listener, and sidebar shortcut. The modules in this directory hold focused request logic:

- `article-extraction.ts` extracts an article from a target tab.
- `settings.ts` reads and writes extension settings.
- `summary-cache.ts` stores, expires, and clears summary cache entries.
- `provider-client.ts` calls remote providers and refreshes provider models.
- `firefox-ml.ts` summarizes locally with Firefox ML and its background-specific prompts.
- `agent-classification.ts` calls and validates Mistral agent classification.
- `ml-handlers.ts` handles classification, permission, availability, and ML cache messages.
- `summarization.ts` coordinates cache, provider, and classification work.
- `message-router.ts` routes extension messages.
- `ml-progress.ts` registers and broadcasts model download progress.

Modules define functions but do not register runtime listeners during import. Listener registration belongs in the background entrypoint.

Several existing behaviors are deliberately preserved for compatibility: provider overrides affect cache lookup but not a fresh provider call; summary cache lookup omits configured TTL and therefore uses the cache module's seven-day default; saving settings replaces the stored object even when passed partial settings; Firefox ML keeps its own prompt text; and ML progress is relayed to browser tabs, ignoring tabs without the content script.
