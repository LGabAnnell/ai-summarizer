/**
 * Custom Provider Implementation
 * Extends OpenAI-compatible provider — only the endpoint URL is user-configurable.
 */

import type {AIProviderConfig, AIProviderSettings} from './provider.model';
import { OpenAICompatibleProvider } from './openai-compatible-provider';
import {
  type ValidationResult,
  validateMaxTokens,
  validateRequiredApiKey,
  validateTemperature,
  validateUrl,
} from './provider.utils';

/**
 * Custom Provider Implementation
 * Allows users to connect to any OpenAI-compatible API endpoint.
 * The endpoint URL is supplied by the user via settings.customEndpoint.
 */
export class CustomProvider extends OpenAICompatibleProvider {
  override readonly config: AIProviderConfig;

  constructor(apiKey: string, endpoint?: string) {
    super(apiKey);
    this.config = {
      name: 'custom',
      endpoint: endpoint || '',
      authHeader: 'Authorization',
      useBearerToken: true,
      defaultModel: '',
      availableModels: [],
      supportsStreaming: false,
    };
  }

  protected getExtraBodyParams(): Record<string, any> {
    return {};
  }

  validateConfig(apiKey: string, settings?: AIProviderSettings): ValidationResult {
    const apiKeyCheck = validateRequiredApiKey(apiKey);
    if (!apiKeyCheck.valid) return apiKeyCheck;

    const endpointCheck = validateUrl(settings?.customEndpoint);
    if (!endpointCheck.valid) return endpointCheck;

    const tempCheck = validateTemperature(settings?.temperature, 0, 1);
    if (!tempCheck.valid) return tempCheck;

    const maxTokensCheck = validateMaxTokens(settings?.maxTokens);
    if (!maxTokensCheck.valid) return maxTokensCheck;

    return { valid: true };
  }
}

/**
 * Create a new Custom provider instance
 */
export function createCustomProvider(apiKey: string, endpoint?: string): CustomProvider {
  return new CustomProvider(apiKey, endpoint);
}
