# Classify sidebar summaries with a Mistral agent

## Summary

After a sidebar summary appears, send its text to a configured Mistral agent and show the five returned labels beside the current summary. Popup summaries will not trigger classification.

## Implementation

- Add editable Mistral agent ID and version fields to Settings. Both start blank; classification runs only when Mistral is the selected provider and both fields are valid. Reuse its locally stored API key.
- Have the sidebar request classification after displaying the summary. The background worker will call `POST /v1/conversations` with the configured `agent_id`, `agent_version`, the summary as a user input, and `store: false`. Parse the final message output as a JSON array of exactly five nonempty strings. The endpoint supports these request fields and returns outputs through `outputs`. [Mistral Conversations API](https://docs.mistral.ai/api/endpoint/beta/conversations)
- Save successful labels with the summary cache, tagged with the agent ID and version. Reuse them on cache hits; reclassify when either agent setting changes. Classification failures will leave the summary visible and show a separate error in the sidebar.
- Keep the existing optional Firefox local classifier and its result separate. Show Mistral labels only beside the sidebar's current summary, not in the popup or history.

## Tests

- Verify the request body, authentication, and parsing of string and text-chunk responses.
- Check fresh and cached summaries, changed agent settings, blank or partial configuration, malformed output, API failure, and a newer summary arriving before an earlier classification finishes.
- Run the extension build and relevant lint checks.

## Assumptions

The agent returns a JSON array of five strings. Each classification is an independent conversation, and the agent request has a 30-second timeout. The supplied agent ID and version 9 may be shown as field examples, but will not be saved as defaults.
