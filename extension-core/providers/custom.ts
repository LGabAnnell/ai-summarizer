/**
 * Custom Provider Implementation
 * Extends OpenAI-compatible provider — only the endpoint URL is user-configurable.
 */

import type {AIProviderConfig} from './provider.model';
import {OpenAICompatibleProvider} from './openai-compatible-provider';

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
      endpoint: endpoint ?? '',
      authHeader: 'Authorization',
      useBearerToken: true,
      defaultModel: '',
      availableModels: [],
      supportsStreaming: false,
    };
  }

  protected getExtraBodyParams(): Record<string, never> {
    return {};
  }
}

/**
 * Create a new Custom provider instance
 */
export function createCustomProvider(apiKey: string, endpoint?: string): CustomProvider {
  return new CustomProvider(apiKey, endpoint);
}
