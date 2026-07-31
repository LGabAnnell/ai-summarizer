/**
 * Qwen (DashScope) Provider Implementation
 * Implements the AIProvider interface for Alibaba Cloud's DashScope API
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
  validateApiKeyLength,
  validateModel,
  validateTemperature,
  validateMaxTokens,
  type ValidationResult,
} from './provider.utils';

// Qwen API configuration
const QWEN_CONFIG: AIProviderConfig = {
  name: 'qwen',
  endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
  authHeader: 'Authorization',
  useBearerToken: true,
  defaultModel: 'qwen-plus',
  availableModels: [
    'qwen2-7b-instruct',
    'qwen2-72b-instruct',
    'qwen-plus',
    'qwen-turbo',
    'qwen-max',
    'qwen-7b-chat',
    'qwen-14b-chat',
    'qwen-72b-chat',
  ],
  supportsStreaming: true,
};

/**
 * Qwen Provider Implementation
 * Uses DashScope API with OpenAI-compatible format
 */
export class QwenProvider implements AIProvider {
  readonly config = QWEN_CONFIG;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Build the API request for summarization
   * Qwen uses OpenAI-compatible format
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

    // Build the request body (DashScope format)
    const body = {
      model,
      messages,
      parameters: {
        temperature,
        max_tokens: maxTokens,
        top_p: 0.9,
        repetition_penalty: 1.0,
      },
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
      // Qwen API response format
      if (response.output && response.output.choices && response.output.choices.length > 0) {
        const firstChoice = response.output.choices[0];
        
        if (firstChoice.message && firstChoice.message.content) {
          return {
            summary: firstChoice.message.content,
            rawResponse: response,
            tokenCount: response.usage?.input_tokens + response.usage?.output_tokens,
            truncated: false,
          };
        }
      }

      // Alternative response format
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
      }

      // Handle error responses
      if (response.error) {
        throw new Error(response.error.message || 'Unknown Qwen API error');
      }

      throw new Error('Invalid Qwen API response format');
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

    // Validate API key format (DashScope keys are typically long strings)
    const apiKeyLength = validateApiKeyLength(apiKey, 30);
    if (!apiKeyLength.valid) {
      return { valid: false, error: 'Invalid DashScope API key format. Key seems too short.' };
    }

    // Validate model
    const modelCheck = validateModel(settings?.model, this.config.availableModels, 'Qwen');
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
 * Create a new Qwen provider instance
 */
export function createQwenProvider(apiKey: string): QwenProvider {
  return new QwenProvider(apiKey);
}
