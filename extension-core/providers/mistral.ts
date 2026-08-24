/**
 * Mistral AI Provider Implementation
 * Extends OpenAI-compatible provider — only overrides body params and validation.
 */

import type {AIProviderConfig} from './provider.model';
import {OpenAICompatibleProvider} from './openai-compatible-provider';

// Mistral API configuration
const MISTRAL_CONFIG: AIProviderConfig = {
  name: 'mistral',
  endpoint: 'https://api.mistral.ai/v1/chat/completions',
  modelsEndpoint: 'https://api.mistral.ai/v1/models',
  authHeader: 'Authorization',
  useBearerToken: true,
  defaultModel: 'mistral-tiny',
  availableModels: [
    'mistral-tiny',
    'mistral-small',
    'mistral-medium',
    'mistral-large',
    'mistral-embed',
    'codestral-latest',
  ],
  supportsStreaming: true,
};

/**
 * Mistral AI Provider Implementation
 */
export class MistralProvider extends OpenAICompatibleProvider {
  override readonly config = MISTRAL_CONFIG;

  constructor(apiKey: string) {
    super(apiKey);
  }

  protected getExtraBodyParams(): Record<string, any> {
    return {random_seed: 42};
  }
}

/**
 * Create a new Mistral provider instance
 */
export function createMistralProvider(apiKey: string): MistralProvider {
  return new MistralProvider(apiKey);
}
