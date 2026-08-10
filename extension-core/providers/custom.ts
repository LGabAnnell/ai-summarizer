/**
 * Custom Provider Implementation
 * Implements the AIProvider interface for user-defined custom endpoints
 */

import type {
  AIProvider,
  AIProviderConfig,
  AIProviderRequest,
  AIProviderResponse,
} from './provider.model';
import type { SummaryStyle } from './summary-prompts';
import { SUMMARY_PROMPTS } from './summary-prompts';
import {
  type ValidationResult,
  addAuthHeader,
  buildBaseHeaders,
  buildUserMessage,
  estimateTokenCount,
  getSystemPrompt as getSystemPromptUtil,
  getTokenCount as getTokenCountUtil,
  validateMaxTokens,
  validateRequiredApiKey,
  validateTemperature,
  validateUrl,
} from './provider.utils';

// Default configuration for custom provider
const CUSTOM_CONFIG: AIProviderConfig = {
  name: 'custom',
  endpoint: '',
  authHeader: 'Authorization',
  useBearerToken: true,
  defaultModel: '',
  availableModels: [],
  supportsStreaming: false,
};

// Default summary prompt for custom provider
const DEFAULT_CUSTOM_PROMPT = 'You are a helpful assistant that summarizes articles. Provide a clear and concise summary of the article content.';

/**
 * Custom Provider Implementation
 * Allows users to connect to any OpenAI-compatible API endpoint
 */
export class CustomProvider implements AIProvider {
  readonly config: AIProviderConfig;
  private apiKey: string;
  private endpoint: string;

  constructor(apiKey: string, endpoint?: string) {
    this.apiKey = apiKey;
    this.endpoint = endpoint || '';
    
    // Create custom config with provided endpoint
    this.config = {
      ...CUSTOM_CONFIG,
      endpoint: this.endpoint,
    };
  }

  /**
   * Build the API request for summarization
   * Uses OpenAI-compatible format by default
   */
  buildRequest(
    articleText: string,
    title?: string,
    settings?: Record<string, any>,
  ): AIProviderRequest {
    const {
      model = '',
      temperature = 0.7,
      maxTokens = 500,
      summaryStyle = 'concise',
      customPrompt,
      // Custom provider specific settings
      requestFormat = 'openai', // 'openai' or 'custom'
      customBody,
    } = settings || {};

    // Get the system prompt
    const systemPrompt = getSystemPromptUtil(summaryStyle, customPrompt);

    // Build the user message with context
    const userMessage = buildUserMessage(articleText, title);

    // Use custom body if provided
    if (customBody && requestFormat === 'custom') {
      // For custom request format, use the provided body
      // This allows advanced users to define their own request structure
      return {
        url: this.config.endpoint,
        method: 'POST',
        headers: this.buildHeaders(settings),
        body: customBody,
      };
    }

    // Default: OpenAI-compatible format
    const messages = [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: userMessage,
      },
    ];

    // Build the request body
    const body = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      top_p: 0.9,
    };

    return {
      url: this.config.endpoint,
      method: 'POST',
      headers: this.buildHeaders(settings),
      body,
    };
  }

  /**
   * Build request headers
   */
  private buildHeaders(settings?: Record<string, any>): Record<string, string> {
    const {
      authHeader = 'Authorization',
      useBearerToken = true,
      customHeaders = {},
    } = settings || {};

    const headers = {
      ...buildBaseHeaders(),
      ...customHeaders,
    };

    // Add authorization header
    addAuthHeader(headers, this.apiKey, authHeader, useBearerToken);

    return headers;
  }

  /**
   * Parse the API response to extract the summary
   * Tries multiple response formats
   */
  parseResponse(response: any): AIProviderResponse {
    try {
      // Try OpenAI-compatible format first
      if (response.choices && response.choices.length > 0) {
        const firstChoice = response.choices[0];
        
        if (firstChoice.message?.content) {
          return {
            summary: firstChoice.message.content,
            rawResponse: response,
            tokenCount: response.usage?.total_tokens,
            truncated: false,
          };
        }
        
        if (firstChoice.text) {
          return {
            summary: firstChoice.text,
            rawResponse: response,
            tokenCount: response.usage?.total_tokens,
            truncated: false,
          };
        }
      }

      // Try content field (some custom APIs)
      if (response.content) {
        return {
          summary: response.content,
          rawResponse: response,
          truncated: false,
        };
      }

      // Try output field (some custom APIs)
      if (response.output) {
        return {
          summary: response.output,
          rawResponse: response,
          truncated: false,
        };
      }

      // Try message.content (some custom APIs)
      if (response.message?.content) {
        return {
          summary: response.message.content,
          rawResponse: response,
          truncated: false,
        };
      }

      // Handle error responses
      if (response.error) {
        throw new Error(response.error.message || 'Unknown API error');
      }

      throw new Error('Invalid API response format');
    } catch (error) {
      return {
        summary: '',
        rawResponse: response,
        truncated: false,
      };
    }
  }

  /**
   * Get the estimated token count for the request
   */
  getTokenCount(articleText: string): number {
    // Estimate tokens for the article text plus prompt tokens
    const systemPrompt = this.getSystemPrompt('concise');
    return getTokenCountUtil(articleText, systemPrompt, estimateTokenCount);
  }

  /**
   * Get the system prompt for summarization
   */
  getSystemPrompt(style?: SummaryStyle, customPrompt?: string): string {
    // Use custom prompt if provided
    if (customPrompt && customPrompt.trim() !== '') {
      return customPrompt;
    }

    // For custom provider, use default prompt if no style specified
    if (!style || style === 'custom') {
      return DEFAULT_CUSTOM_PROMPT;
    }

    // Use common summary prompts for standard styles
    return SUMMARY_PROMPTS[style] || DEFAULT_CUSTOM_PROMPT;
  }

  /**
   * Update the API key
   */
  updateApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Fetch available models from the custom endpoint.
   * For custom providers, this tries to use a /v1/models endpoint relative to the custom endpoint.
   * @param apiKey - The API key for authentication
   * @returns Promise with array of model IDs
   */
  async fetchModels(apiKey: string): Promise<string[]> {
    // Custom providers don't have a predefined models endpoint
    // They could potentially support it if the user provides one, but for now
    // we'll return the available models from config or empty array
    return this.config.availableModels || [];
  }
}

/**
 * Create a new Custom provider instance
 */
export function createCustomProvider(apiKey: string, endpoint?: string): CustomProvider {
  return new CustomProvider(apiKey, endpoint);
}
