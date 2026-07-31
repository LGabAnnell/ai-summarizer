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
   - Node.js (v18+)
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
   ```

4. **Load in Firefox**:
   - Open `about:debugging` in Firefox
   - Click "Load Temporary Add-on"
   - Select the `dist` folder from your project

### Production Build

1. **Build for production**:
   ```bash
   npm run build
   ```

2. **Package the extension**:
   ```bash
   npm install -g web-ext
   web-ext build
   ```

3. **Load the packaged extension in Firefox**:
   - The packaged extension will be in the `web-ext-artifacts` folder
   - In Firefox, go to `about:addons` and load the `.zip` file

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

1. Navigate to any article or webpage
2. Click the extension icon in the Firefox toolbar
3. Click "Summarize Article"
4. The summary will appear in the popup
5. Click "Copy" to copy the summary to your clipboard

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
│   ├── popup/               # Popup UI application
│   ├── options/             # Options page application
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
