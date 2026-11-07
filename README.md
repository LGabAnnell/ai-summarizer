# Article Summarizer - Firefox Extension

A Firefox Manifest V3 extension that extracts article content using Mozilla's Readability.js and sends it to configurable AI providers for summarization.

## Features

- **Article Extraction**: Uses Mozilla's Readability.js to extract clean article content from any webpage
- **Multiple AI Providers**: Supports Mistral, OpenAI, Anthropic, Qwen (DashScope), DeepSeek, and custom OpenAI-compatible endpoints
- **Customizable Summaries**: Choose summary style (concise, detailed, bullet points) or use custom prompts
- **Caching**: Cache summaries to avoid unnecessary API calls
- **Secure**: API keys are stored locally and never sent to third parties
- **Privacy-Focused**: No telemetry, no data collection

## Installation

### Development Setup

1. **Prerequisites**:
   - Node.js 22.23.1 (or another version supported by Angular 22)
   - npm (v9+)
   - Firefox browser

2. **Clone and install dependencies**:
   ```bash
   cd article-summarizer
   npm install
   ```

3. **Build the extension**:
   ```bash
   npm run build
   # Or include source maps for debugging:
   npm run build:debug
   ```

4. **Load in Firefox**:
   - Open `about:debugging` in Firefox
   - Click "Load Temporary Add-on"
   - Select the `dist` folder from your project

### Production Build

Run `npm run package` to build and package the extension as `ai-summarizer.zip`.
The archive is unsigned; standard Firefox requires Mozilla signing for permanent installation.
For development, load the built extension temporarily through `about:debugging`.

## CI and releases

GitHub Actions runs lint, all Angular and extension-core tests, and a production build on pull requests and pushes to `main`. A pushed `vMAJOR.MINOR.PATCH` tag runs the same checks, creates a GitHub Release with generated notes and unsigned extension and source ZIPs, and submits the extension and source archive to Firefox Add-ons (AMO). The GitHub Release and AMO submission are independent jobs after validation.

Before the first automated submission:

1. Ensure the add-on is already listed on AMO and its ID matches `ai-summarizer@annell.ch` in `manifest.json`. If needed, create the listing in the [Developer Hub](https://addons.mozilla.org/developers/).
2. Generate credentials on the [AMO API credentials page](https://addons.mozilla.org/en-US/developers/addon/api/key/).
3. In GitHub repository **Settings → Secrets and variables → Actions**, add `AMO_JWT_ISSUER` (the JWT issuer) and `AMO_JWT_SECRET` (the JWT secret).

To release, update the version in `manifest.json`, `package.json`, and both root version fields of `package-lock.json` (for example, run `npm version 1.2.3 --no-git-tag-version` and update the manifest). Commit those changes, then run `git tag v1.2.3` and `git push origin v1.2.3`. The workflow rejects mismatched versions.

The submission job does not wait for Mozilla's approval. Check its status in the Developer Hub; Firefox distributes the update after AMO lists it. A successful job means the submission was accepted, not necessarily approved or published.

If validation fails, fix the issue in a new commit and push a new version tag. If the GitHub Release job fails, inspect any existing release and its assets before retrying. If the AMO job fails, check the Developer Hub before retrying: the version may already have been submitted even if the job failed. Do not resubmit an existing version; resolve any outstanding review or rejection with Mozilla, or release a new version as appropriate.

## Configuration

1. **Open the options page**:
   - Click the extension icon in the toolbar
   - Click "Settings" in the footer

2. **Configure AI Provider**:
   - Select your preferred AI provider (Mistral, OpenAI, Anthropic, Qwen, DeepSeek, Custom)
   - Enter your API key
   - Select a model
   - (Optional) For Custom provider, enter your endpoint URL

3. **Summarization Settings**:
   - Choose summary style (concise, detailed, bullet points, or custom)
   - Set temperature (0 = deterministic, 1 = most creative)
   - Set maximum tokens for the summary
   - (Optional) Enter a custom system prompt

4. **Cache Settings**:
   - Enable/disable caching
   - Set cache expiration (in days)
   - Clear cache as needed

## Usage

1. Open an article in Firefox and click the extension icon in the toolbar.
2. The floating panel opens and starts summarizing immediately. Drag its header or use the resize handle to position it; use the arrow keys on either control for keyboard adjustment.
3. Copy the summary or open Settings from the panel. Close it with the close button or Escape.

Closing the panel does not cancel a summary in progress. The result is saved to history and restored when you reopen the panel on the same page. Navigating to another article closes the panel; open it again to summarize the new page. Firefox blocks extensions on some browser pages, its PDF viewer, and protected Mozilla websites; the extension opens an explanation if it cannot access a page.

### Keyboard Shortcuts

- **Ctrl+Alt+S** (Mac: **Control+Shift+S**) opens the floating panel and summarizes the active page.
- **Ctrl+Alt+F** (Mac: **Control+Shift+F**) toggles the sidebar, where you can browse summary history.

To change a shortcut, open `about:addons`, select the gear menu, then choose **Manage Extension Shortcuts**.

## Supported Providers

### Mistral
- Endpoint: `https://api.mistral.ai/v1/chat/completions`
- API Key Format: `sk-...` or `mx-...`
- Models: `mistral-tiny`, `mistral-small`, `mistral-medium`, `mistral-large`, `codestral-latest`

### OpenAI
- Endpoint: `https://api.openai.com/v1/chat/completions`
- API Key Format: `sk-...`
- Models: `gpt-4o-mini`, `gpt-4o`, `gpt-4-turbo`, `gpt-4`, `gpt-3.5-turbo`

### Anthropic
- Endpoint: `https://api.anthropic.com/v1/messages`
- API Key Format: `sk_...`
- Models: `claude-3-5-sonnet-20250620`, `claude-3-haiku-20240307`, `claude-3-sonnet-20240229`, `claude-2-1`

### Qwen (DashScope)
- Endpoint: `https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation`
- Models: `qwen-plus`, `qwen-turbo`, `qwen-max`

### DeepSeek
- Endpoint: `https://api.deepseek.com/v1/chat/completions`
- Models: `deepseek-chat`, `deepseek-coder`

### Custom
- Configure your own OpenAI-compatible endpoint
- Supports any provider with OpenAI-compatible API

## Project Structure

```
article-summarizer/
├── extension-core/          # Extension core functionality
│   ├── background.ts        # Background service worker
│   ├── content/             # Content scripts
│   │   └── content.ts       # Article extraction logic
│   ├── providers/           # AI provider implementations
│   │   ├── index.ts         # Provider factory
│   │   ├── provider.model.ts # Provider interface
│   │   ├── mistral.ts       # Mistral provider
│   │   ├── openai.ts        # OpenAI provider
│   │   ├── anthropic.ts     # Anthropic provider
│   │   ├── qwen.ts          # Qwen provider
│   │   ├── deepseek.ts      # DeepSeek provider
│   │   └── custom.ts        # Custom provider
│   └── vendor/              # Vendored libraries
│       └── readability.js   # Mozilla Readability.js
├── projects/                # Angular workspace
│   ├── panel/               # Floating summary UI application
│   ├── popup/               # Existing popup UI application
│   ├── options/             # Options page application
│   ├── sidebar/             # Sidebar and history application
│   └── shared/              # Shared library
├── builds/                  # Build scripts
│   ├── build-extension.ts   # Extension build script
│   └── package-dist.ts      # Distribution packaging script
├── icons/                   # Extension icons
├── manifest.json            # Firefox extension manifest
├── package.json             # Project dependencies
├── angular.json             # Angular workspace configuration
└── tsconfig.json            # TypeScript configuration
```

## Development

### Adding a New Provider

1. Create a new file in `extension-core/providers/` (e.g., `gemini.ts`)
2. Implement the `AIProvider` interface
3. Export the provider class and factory function
4. Update `extension-core/providers/index.ts` to include the new provider
5. Update the shared settings model to include the new provider type
6. Update the options page to display the new provider

### Testing

- Test with various websites to ensure article extraction works
- Test with different providers and models
- Test error scenarios (invalid API key, network failure, etc.)
- Test caching behavior

## Security & Privacy

- **API Key Storage**: All API keys are stored in `browser.storage.local` and never leave your device
- **No Telemetry**: The extension does not collect any usage data or telemetry
- **No Third-Party Tracking**: No tracking pixels, analytics, or external requests except to your configured AI provider
- **Content Handling**: Article content is only sent to your configured AI provider, never to any other service

## Troubleshooting

### Common Issues

1. **"Could not extract article content"**: 
   - Try a different webpage
   - Some websites may have protection against content extraction
   - Check the browser console for more details

2. **"Invalid API key format"**:
   - Verify your API key is correct
   - Check the expected format for your provider (e.g., `sk-` for Mistral/OpenAI, `sk_` for Anthropic)

3. **"Connection failed"**:
   - Check your internet connection
   - Verify your API key is valid
   - Check if your provider has rate limits or downtime

4. **"No summary returned"**:
   - Try a different model
   - Check if your API key has sufficient credits
   - Some models may have minimum token requirements

### Debugging

- Open the browser console (`Ctrl+Shift+J` or `F12`)
- Check for errors in the console
- Enable debug mode in the extension (if available)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - Feel free to use, modify, and distribute.

## Acknowledgments

- Mozilla's [Readability.js](https://github.com/mozilla/readability) for article extraction
- All AI provider APIs for their amazing services
