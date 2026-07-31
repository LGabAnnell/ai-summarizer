/**
 * DeepSeek Provider Implementation
 * Implements the AIProvider interface for DeepSeek's API
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

// DeepSeek API configuration
const DEEPSEEK_CONFIG: AIProviderConfig = {
  name: 'deepseek',
  endpoint: 'https://api.deepseek.com/v1/chat/completions',
  authHeader: 'Authorization',
  useBearerToken: true,
  defaultModel: 'deepseek-chat',
  availableModels: [
    'deepseek-chat',
    'deepseek-coder',
  ],
  supportsStreaming: true,
};

/**
 * DeepSeek Provider Implementation
 * Uses OpenAI-compatible format
 */
export class DeepSeekProvider implements AIProvider {
  readonly config = DEEPSEEK_CONFIG;
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

    // Build the request body (OpenAI-compatible format)
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
      // DeepSeek API response format (OpenAI-compatible)
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
        throw new Error(response.error.message || 'Unknown DeepSeek API error');
      }

      throw new Error('Invalid DeepSeek API response format');
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

    // Validate API key format (DeepSeek keys typically start with sk- and have minimum length)
    const apiKeyFormat = validateApiKeyFormat(apiKey, ['sk-']);
    const apiKeyLength = validateApiKeyLength(apiKey, 30);
    if (!apiKeyFormat.valid && !apiKeyLength.valid) {
      return { valid: false, error: 'Invalid DeepSeek API key format' };
    }

    // Validate model
    const modelCheck = validateModel(settings?.model, this.config.availableModels, 'DeepSeek');
    if (!modelCheck.valid) return modelCheck;

    // Validate temperature
    const tempCheck = validateTemperature(settings?.temperature, 0, 1);
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
 * Create a new DeepSeek provider instance
 */
export function createDeepSeekProvider(apiKey: string): DeepSeekProvider {
  return new DeepSeekProvider(apiKey);
}
