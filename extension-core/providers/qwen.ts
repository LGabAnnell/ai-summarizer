/**
 * Qwen (DashScope) Provider Implementation
 * Extends BaseProvider — implements DashScope body shape and response parsing.
 */

import type { AIProviderConfig, AIProviderResponse } from './provider.model';
import { BaseProvider } from './base-provider';
import {
  buildUserMessage,
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
export class QwenProvider extends BaseProvider {
  readonly config = QWEN_CONFIG;

  constructor(apiKey: string) {
    super(apiKey);
  }

  /** Build the request body — DashScope format (parameters wrapper). */
  buildRequestBody(
    articleText: string,
    title?: string,
    settings?: Record<string, any>
  ): Record<string, any> {
    const {
      model = this.config.defaultModel,
      temperature = 0.7,
      maxTokens = 500,
      summaryStyle = 'concise',
      customPrompt,
    } = settings || {};

    const systemPrompt = this.getSystemPrompt(summaryStyle, customPrompt);
    const userMessage = buildUserMessage(articleText, title);

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    return {
      model,
      messages,
      parameters: {
        temperature,
        max_tokens: maxTokens,
        top_p: 0.9,
        repetition_penalty: 1.0,
      },
    };
  }

  /** Parse the response — DashScope format. */
  parseResponseBody(response: any): AIProviderResponse {
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

  validateConfig(apiKey: string, settings?: Record<string, any>): ValidationResult {
    const apiKeyCheck = validateRequiredApiKey(apiKey);
    if (!apiKeyCheck.valid) return apiKeyCheck;

    const apiKeyLength = validateApiKeyLength(apiKey, 30);
    if (!apiKeyLength.valid) {
      return { valid: false, error: 'Invalid DashScope API key format. Key seems too short.' };
    }

    const modelCheck = validateModel(settings?.model, this.config.availableModels, 'Qwen');
    if (!modelCheck.valid) return modelCheck;

    const tempCheck = validateTemperature(settings?.temperature, 0, 1);
    if (!tempCheck.valid) return tempCheck;

    const maxTokensCheck = validateMaxTokens(settings?.maxTokens);
    if (!maxTokensCheck.valid) return maxTokensCheck;

    return { valid: true };
  }
}

/**
 * Create a new Qwen provider instance
 */
export function createQwenProvider(apiKey: string): QwenProvider {
  return new QwenProvider(apiKey);
}
