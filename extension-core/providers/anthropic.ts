/**
 * Anthropic Claude Provider Implementation
 * Implements the AIProvider interface for Anthropic's Messages API
 */

import type { AIProvider, AIProviderConfig, AIProviderRequest, AIProviderResponse } from './provider.model';
import { SUMMARY_PROMPTS } from './summary-prompts';
import {
  estimateTokenCount,
  buildBaseHeaders,
  addAuthHeader,
  buildUserMessage,
  getSystemPrompt as getSystemPromptUtil,
  getTokenCount as getTokenCountUtil,
  validateRequiredApiKey,
  validateApiKeyFormat,
  validateModel,
  validateTemperature,
  validateMaxTokens,
  type ValidationResult,
} from './provider.utils';

// Anthropic API configuration
const ANTHROPIC_CONFIG: AIProviderConfig = {
  name: 'anthropic',
  endpoint: 'https://api.anthropic.com/v1/messages',
  authHeader: 'x-api-key',
  useBearerToken: false,
  defaultModel: 'claude-3-sonnet-20240229',
  availableModels: [
    'claude-3-5-sonnet-20250620',
    'claude-3-haiku-20240307',
    'claude-3-sonnet-20240229',
    'claude-3-opus-20240229',
    'claude-2-1',
    'claude-2',
    'claude-instant-1-2',
    'claude-instant-1',
  ],
  supportsStreaming: true,
};

// Anthropic uses different message roles
const ANTHROPIC_ROLES = {
  system: 'system',
  user: 'user',
  assistant: 'assistant',
};

/**
 * Anthropic Claude Provider Implementation
 * Uses the Messages API (Claude 3)
 */
export class AnthropicProvider implements AIProvider {
  readonly config = ANTHROPIC_CONFIG;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Build the API request for summarization
   * Anthropic uses the Messages API with a different payload structure
   */
  buildRequest(
    articleText: string,
    title?: string,
    settings?: Record<string, any>
  ): AIProviderRequest {
    const {
      model = this.config.defaultModel,
      temperature = 0.7,
      maxTokens = 500,
      summaryStyle = 'concise',
      customPrompt,
    } = settings || {};

    // Get the system prompt
    const systemPrompt = getSystemPromptUtil(summaryStyle, customPrompt);

    // Build the user message with context
    const userMessage = buildUserMessage(articleText, title);

    // Anthropic Messages API expects this structure
    const body = {
      model,
      messages: [
        {
          role: ANTHROPIC_ROLES.system,
          content: systemPrompt,
        },
        {
          role: ANTHROPIC_ROLES.user,
          content: userMessage,
        },
      ],
      max_tokens: maxTokens,
      temperature,
      // Additional Claude-specific parameters
      top_p: 0.9,
      top_k: 5,
    };

    // Build headers
    const headers = {
      ...buildBaseHeaders(),
      'anthropic-version': '2023-06-01', // Required for Messages API
    };

    // Add authorization header
    addAuthHeader(headers, this.apiKey, this.config.authHeader!, this.config.useBearerToken!);

    return {
      url: this.config.endpoint,
      method: 'POST',
      headers,
      body,
    };
  }

  /**
   * Parse the API response to extract the summary
   * Anthropic Messages API has a different response format
   */
  parseResponse(response: any): AIProviderResponse {
    try {
      // Anthropic Messages API response format
      if (response.content && response.content.length > 0) {
        const content = response.content[0];
        
        // Content can be text or other types
        if (content.type === 'text') {
          return {
            summary: content.text,
            rawResponse: response,
            tokenCount: response.usage?.input_tokens + response.usage?.output_tokens,
            truncated: false,
          };
        }
        
        // Fallback to first content block
        if (Array.isArray(response.content)) {
          for (const block of response.content) {
            if (block.type === 'text' && block.text) {
              return {
                summary: block.text,
                rawResponse: response,
                tokenCount: response.usage?.input_tokens + response.usage?.output_tokens,
                truncated: false,
              };
            }
          }
        }
      }

      // Handle error responses
      if (response.error) {
        throw new Error(response.error.message || 'Unknown Anthropic API error');
      }

      throw new Error('Invalid Anthropic API response format');
    } catch (error) {
      return {
        summary: '',
        rawResponse: response,
        truncated: false,
      };
    }
  }

  /**
   * Validate the provider configuration
   */
  validateConfig(apiKey: string, settings?: Record<string, any>): ValidationResult {
    // Validate API key is required
    const apiKeyCheck = validateRequiredApiKey(apiKey);
    if (!apiKeyCheck.valid) return apiKeyCheck;

    // Validate API key format (Anthropic keys start with sk_)
    const apiKeyFormat = validateApiKeyFormat(apiKey, ['sk_']);
    if (!apiKeyFormat.valid) {
      return { valid: false, error: 'Invalid Anthropic API key format. Expected to start with sk_' };
    }

    // Validate model
    const modelCheck = validateModel(settings?.model, this.config.availableModels, 'Anthropic');
    if (!modelCheck.valid) return modelCheck;

    // Validate temperature
    const tempCheck = validateTemperature(settings?.temperature, 0, 1);
    if (!tempCheck.valid) return tempCheck;

    // Validate maxTokens (Claude has a max limit of 4096)
    const maxTokensCheck = validateMaxTokens(settings?.maxTokens, 4096);
    if (!maxTokensCheck.valid) return maxTokensCheck;

    return { valid: true };
  }

  /**
   * Get the estimated token count for the request
   */
  getTokenCount(articleText: string): number {
    // Estimate tokens for the article text plus prompt tokens
    const systemPrompt = getSystemPromptUtil('concise');
    return getTokenCountUtil(articleText, systemPrompt, estimateTokenCount);
  }

  /**
   * Get the system prompt for summarization
   */
  getSystemPrompt(style?: string, customPrompt?: string): string {
    return getSystemPromptUtil(style, customPrompt);
  }

  /**
   * Update the API key
   */
  updateApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }
}

/**
 * Create a new Anthropic provider instance
 */
export function createAnthropicProvider(apiKey: string): AnthropicProvider {
  return new AnthropicProvider(apiKey);
}
