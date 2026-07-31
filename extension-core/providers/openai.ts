/**
 * OpenAI Provider Implementation
 * Implements the AIProvider interface for OpenAI's API
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

// OpenAI API configuration
const OPENAI_CONFIG: AIProviderConfig = {
  name: 'openai',
  endpoint: 'https://api.openai.com/v1/chat/completions',
  authHeader: 'Authorization',
  useBearerToken: true,
  defaultModel: 'gpt-3.5-turbo',
  availableModels: [
    'gpt-4o-mini',
    'gpt-4o',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-16k',
    'gpt-3.5-turbo-instruct',
  ],
  supportsStreaming: true,
};

/**
 * OpenAI Provider Implementation
 */
export class OpenAIProvider implements AIProvider {
  readonly config = OPENAI_CONFIG;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Build the API request for summarization
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

    // Build the messages array
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
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
    };

    // Build headers
    const headers = buildBaseHeaders();

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
   */
  parseResponse(response: any): AIProviderResponse {
    try {
      // OpenAI API response format
      if (response.choices && response.choices.length > 0) {
        const firstChoice = response.choices[0];
        
        if (firstChoice.message && firstChoice.message.content) {
          return {
            summary: firstChoice.message.content,
            rawResponse: response,
            tokenCount: response.usage?.total_tokens,
            truncated: false,
          };
        }
        
        // Fallback for different response formats
        if (firstChoice.text) {
          return {
            summary: firstChoice.text,
            rawResponse: response,
            tokenCount: response.usage?.total_tokens,
            truncated: false,
          };
        }
      }

      // Handle error responses
      if (response.error) {
        throw new Error(response.error.message || 'Unknown OpenAI API error');
      }

      throw new Error('Invalid OpenAI API response format');
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

    // Validate API key format (OpenAI keys start with sk-)
    const apiKeyFormat = validateApiKeyFormat(apiKey, ['sk-']);
    if (!apiKeyFormat.valid) {
      return { valid: false, error: 'Invalid OpenAI API key format. Expected to start with sk-' };
    }

    // Validate model
    const modelCheck = validateModel(settings?.model, this.config.availableModels, 'OpenAI');
    if (!modelCheck.valid) return modelCheck;

    // Validate temperature (OpenAI supports 0-2 range)
    const tempCheck = validateTemperature(settings?.temperature, 0, 2);
    if (!tempCheck.valid) return tempCheck;

    // Validate maxTokens
    const maxTokensCheck = validateMaxTokens(settings?.maxTokens);
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
 * Create a new OpenAI provider instance
 */
export function createOpenAIProvider(apiKey: string): OpenAIProvider {
  return new OpenAIProvider(apiKey);
}
