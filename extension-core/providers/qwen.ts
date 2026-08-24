/**
 * Qwen (DashScope) Provider Implementation
 * Extends BaseProvider — implements DashScope body shape and response parsing.
 */

import type {AIProviderConfig, AIProviderResponse} from './provider.model';
import {BaseProvider} from './base-provider';
import {buildUserMessage} from './provider.utils';
import {AIRequestSettings} from '@shared/lib/models/settings.model';

// Qwen API configuration
const QWEN_CONFIG: AIProviderConfig = {
  name: 'qwen',
  endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
  modelsEndpoint: 'https://dashscope.aliyuncs.com/api/v1/models',
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
    settings?: AIRequestSettings,
  ): Record<string, unknown> {
    const {
      model = this.config.defaultModel,
      temperature = 0.7,
      maxTokens = 500,
      summaryStyle = 'concise',
      customPrompt,
    } = settings ?? {};

    const systemPrompt = this.getSystemPrompt(summaryStyle, customPrompt);
    const userMessage = buildUserMessage(articleText, title);

    const messages = [
      {role: 'system', content: systemPrompt},
      {role: 'user', content: userMessage},
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
  parseResponseBody(response: unknown): AIProviderResponse {
    const castResponse = response as {
      output?: {choices?: {message?: {content?: string}}[]};
      choices?: {message?: {content?: string}}[];
      usage?: {input_tokens?: number; output_tokens?: number; total_tokens?: number};
      error?: {message?: string};
    };
    try {
      // Qwen API response format
      if (castResponse.output?.choices && castResponse.output.choices.length > 0) {
        const firstChoice = castResponse.output.choices[0];

        if (firstChoice.message?.content) {
          return {
            summary: firstChoice.message.content,
            rawResponse: response,
            // @ts-expect-error undefined + undefined don't care
            tokenCount: castResponse.usage?.input_tokens + castResponse.usage?.output_tokens,
            truncated: false,
          };
        }
      }

      // Alternative castResponse format
      if (castResponse.choices && castResponse.choices.length > 0) {
        const firstChoice = castResponse.choices[0];
        if (firstChoice.message?.content) {
          return {
            summary: firstChoice.message.content,
            rawResponse: response,
            tokenCount: castResponse.usage?.total_tokens,
            truncated: false,
          };
        }
      }

      if (castResponse.error) {
        throw new Error(castResponse.error.message ?? 'Unknown Qwen API error');
      }

      throw new Error('Invalid Qwen API response format');
    } catch {
      return {
        summary: '',
        rawResponse: response,
        truncated: false,
      };
    }
  }

  /**
   * Fetch available models from DashScope API.
   * @param apiKey - The API key for authentication
   * @returns Promise with array of model IDs
   */
  async fetchModels(apiKey: string): Promise<string[]> {
    const modelsEndpoint = this.config.modelsEndpoint;

    if (!modelsEndpoint) {
      // Fallback to hardcoded models if no models endpoint is configured
      return this.config.availableModels ?? [];
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add authentication header for DashScope
      if (this.config.authHeader && this.config.useBearerToken) {
        headers[this.config.authHeader] = `Bearer ${apiKey}`;
      } else if (this.config.authHeader) {
        headers[this.config.authHeader] = apiKey;
      }

      const response = await fetch(modelsEndpoint, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        // If API call fails, fall back to hardcoded models
        console.warn(`Failed to fetch models from ${modelsEndpoint}: ${response.status} ${response.statusText}`);
        return this.config.availableModels ?? [];
      }

      const data = await response.json();

      // Handle DashScope response format
      if (data.data && Array.isArray(data.data)) {
        return data.data.map((model: unknown) => (model as { id: string }).id).filter((id: string) => typeof id === 'string');
      }

      // Handle alternative format where models are directly in the response
      if (Array.isArray(data)) {
        return data.map((model: unknown) => (model as { id: string }).id).filter((id: string) => typeof id === 'string');
      }

      console.warn('Unexpected models API response format from DashScope', data);
      return this.config.availableModels ?? [];
    } catch (error) {
      console.error('Error fetching Qwen models:', error);
      // Fall back to hardcoded models on any error
      return this.config.availableModels ?? [];
    }
  }
}

/**
 * Create a new Qwen provider instance
 */
export function createQwenProvider(apiKey: string): QwenProvider {
  return new QwenProvider(apiKey);
}
