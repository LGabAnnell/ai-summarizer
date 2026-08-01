/**
 * Anthropic Claude Provider Implementation
 * Extends BaseProvider — implements Messages API body shape and response parsing.
 */

import type {AIProviderConfig, AIProviderResponse, AIProviderSettings} from './provider.model';
import { BaseProvider } from './base-provider';
import {
  buildUserMessage,
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
  modelsEndpoint: 'https://api.anthropic.com/v1/models',
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
export class AnthropicProvider extends BaseProvider {
  override readonly config = ANTHROPIC_CONFIG;

  constructor(apiKey: string) {
    super(apiKey);
  }

  protected override getExtraHeaders(): Record<string, string> {
    return { 'anthropic-version': '2023-06-01' };
  }

  /** Build the request body — Anthropic Messages API format. */
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

    return {
      model,
      messages: [
        { role: ANTHROPIC_ROLES.system, content: systemPrompt },
        { role: ANTHROPIC_ROLES.user, content: userMessage },
      ],
      max_tokens: maxTokens,
      temperature,
      top_p: 0.9,
      top_k: 5,
    };
  }

  /** Parse the response — Anthropic Messages API format. */
  parseResponseBody(response: any): AIProviderResponse {
    try {
      if (response.content && response.content.length > 0) {
        const content = response.content[0];

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

  validateConfig(apiKey: string, settings?: AIProviderSettings): ValidationResult {
    const apiKeyCheck = validateRequiredApiKey(apiKey);
    if (!apiKeyCheck.valid) return apiKeyCheck;

    const apiKeyFormat = validateApiKeyFormat(apiKey, ['sk_']);
    if (!apiKeyFormat.valid) {
      return { valid: false, error: 'Invalid Anthropic API key format. Expected to start with sk_' };
    }

    const modelCheck = validateModel(settings?.model, this.config.availableModels, 'Anthropic');
    if (!modelCheck.valid) return modelCheck;

    const tempCheck = validateTemperature(settings?.temperature, 0, 1);
    if (!tempCheck.valid) return tempCheck;

    const maxTokensCheck = validateMaxTokens(settings?.maxTokens, 4096);
    if (!maxTokensCheck.valid) return maxTokensCheck;

    return { valid: true };
  }

  /**
   * Fetch available models from Anthropic API.
   * @param apiKey - The API key for authentication
   * @returns Promise with array of model IDs
   */
  async fetchModels(apiKey: string): Promise<string[]> {
    const modelsEndpoint = this.config.modelsEndpoint;
    
    if (!modelsEndpoint) {
      // Fallback to hardcoded models if no models endpoint is configured
      return this.config.availableModels || [];
    }

    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      
      // Add authentication header for Anthropic (x-api-key without Bearer)
      if (this.config.authHeader) {
        headers[this.config.authHeader] = apiKey;
      }

      const response = await fetch(modelsEndpoint, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        // If API call fails, fall back to hardcoded models
        console.warn(`Failed to fetch models from ${modelsEndpoint}: ${response.status} ${response.statusText}`);
        return this.config.availableModels || [];
      }

      const data = await response.json();
      
      // Handle Anthropic response format: { data: [{ id: string, ... }] }
      if (data.data && Array.isArray(data.data)) {
        return data.data.map((model: any) => model.id).filter((id: string) => typeof id === 'string');
      }
      
      // Handle alternative format
      if (Array.isArray(data)) {
        return data.map((model: any) => model.id).filter((id: string) => typeof id === 'string');
      }

      console.warn('Unexpected models API response format from Anthropic', data);
      return this.config.availableModels || [];
    } catch (error) {
      console.error('Error fetching Anthropic models:', error);
      // Fall back to hardcoded models on any error
      return this.config.availableModels || [];
    }
  }
}

/**
 * Create a new Anthropic provider instance
 */
export function createAnthropicProvider(apiKey: string): AnthropicProvider {
  return new AnthropicProvider(apiKey);
}
