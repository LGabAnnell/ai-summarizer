/**
 * Firefox ML Provider Implementation
 * Uses Firefox's built-in ML runtime (browser.trial.ml) for local, offline summarization
 * No API key required, uses local Firefox ML runtime
 */

import type {
  AIProvider,
  AIProviderConfig,
  AIProviderRequest,
  AIProviderResponse,
  ProviderSettings,
} from './provider.model';
import {
  buildBaseHeaders,
  estimateTokenCount,
  getSystemPrompt as getSystemPromptUtil,
  getTokenCount as getTokenCountUtil,
} from './provider.utils';
import {AIRequestSettings} from '@shared/lib/models/settings.model';
import {SummaryStyle} from './summary-prompts';

// Firefox ML API configuration
const FIREFOX_ML_CONFIG: AIProviderConfig = {
  name: 'firefox-ml',
  endpoint: '', // No HTTP endpoint - uses browser.trial.ml API
  authHeader: '', // No authentication required
  useBearerToken: false, // No authentication required
  defaultModel: 'Xenova/distilbart-cnn-6-6',
  availableModels: [
    'Xenova/distilbart-cnn-6-6',
    'Xenova/distilbart-cnn-12-6',
  ],
  supportsStreaming: false, // Firefox ML API doesn't support streaming yet
};

/**
 * Firefox ML Provider Implementation
 * Uses browser.trial.ml API for local summarization
 */
export class FirefoxMLProvider implements AIProvider {
  readonly config = FIREFOX_ML_CONFIG;

  constructor(_: string) {
  }

  /**
   * Build the API request for Firefox ML
   * Note: Firefox ML uses browser.trial.ml API, not HTTP requests
   * This method returns a minimal request structure for compatibility
   */
  buildRequest(
    articleText: string,
    title?: string,
    settings?: AIRequestSettings,
  ): AIProviderRequest {
    // Firefox ML doesn't use HTTP requests, but we return a minimal structure
    // for compatibility with the provider interface
    return {
      url: '', // No URL for Firefox ML
      method: 'POST',
      headers: buildBaseHeaders(),
      body: {
        text: articleText,
        title: title,
        model: settings?.model ?? this.config.defaultModel,
        // Firefox ML summarization parameters
        max_length: settings?.maxTokens ?? 500,
        min_length: 30,
        do_sample: settings?.temperature ? settings.temperature > 0 : false,
        temperature: settings?.temperature ?? 0.7,
      },
    };
  }

  /**
   * Parse the Firefox ML response
   * The response from browser.trial.ml.runEngine() contains the generated summary
   */
  parseResponse(response: unknown): AIProviderResponse {
    // Handle Firefox ML response format
    if (response && Array.isArray(response) && response.length > 0) {
      const firstResult = response[0] as unknown;

      // Firefox ML summarization returns text directly
      if (typeof firstResult === 'string') {
        return {
          summary: firstResult,
          rawResponse: response,
          tokenCount: this.getTokenCount(firstResult),
        };
      }

      // Handle object response format
      if (firstResult && typeof firstResult === 'object') {
        const resultRecord = firstResult as Record<string, unknown>;
        // Try to extract summary from different possible fields
        const possibleFields = ['generated_text', 'summary', 'text', 'output', 'result'];
        for (const field of possibleFields) {
          if (resultRecord[field] && typeof resultRecord[field] === 'string') {
            return {
              summary: resultRecord[field],
              rawResponse: response,
              tokenCount: this.getTokenCount(resultRecord[field]),
            };
          }
        }
      }
    }

    // Fallback: try to extract any string from the response
    if (response && typeof response === 'object') {
      const responseRecord = response as Record<string, unknown>;
      for (const key in responseRecord) {
        const value: unknown = responseRecord[key];
        if (typeof value === 'string' && value.length > 0) {
          return {
            summary: value,
            rawResponse: response,
            tokenCount: this.getTokenCount(value),
          };
        }
      }
    }

    // If no summary found, return empty response
    return {
      summary: '',
      rawResponse: response,
      tokenCount: 0,
    };
  }

  /**
   * Get the estimated token count for the request
   */
  getTokenCount(articleText: string): number {
    const systemPrompt = getSystemPromptUtil('concise');
    return getTokenCountUtil(articleText, systemPrompt, estimateTokenCount);
  }

  /**
   * Get the system prompt for summarization
   */
  getSystemPrompt(style?: SummaryStyle, customPrompt?: string): string {
    return getSystemPromptUtil(style, customPrompt);
  }

  /**
   * Fetch available models - Firefox ML has a fixed list of summarization models
   */
  async fetchModels(_: string): Promise<string[]> {
    // Firefox ML summarization models are fixed
    // In the future, this could use browser.trial.ml.listEngines() if available
    return this.config.availableModels ?? [];
  }
}

/**
 * Create a new Firefox ML provider instance
 */
export function createFirefoxMLProvider(apiKey: string): FirefoxMLProvider {
  return new FirefoxMLProvider(apiKey);
}

/**
 * Create a Firefox ML provider from settings
 */
export function createFirefoxMLProviderFromSettings(settings: ProviderSettings): FirefoxMLProvider {
  return new FirefoxMLProvider(settings.apiKey || '');
}