/**
 * Mistral AI Provider Implementation
 * Extends OpenAI-compatible provider — only overrides body params and validation.
 */

import type {AIProviderConfig, AIProviderSettings, ProviderSettings} from './provider.model';
import { OpenAICompatibleProvider } from './openai-compatible-provider';
import {
  type ValidationResult,
  validateApiKeyFormat,
  validateMaxTokens,
  validateModel,
  validateRequiredApiKey,
  validateTemperature,
} from './provider.utils';

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
    return { random_seed: 42 };
  }

  validateConfig(apiKey: string, settings?: AIProviderSettings): ValidationResult {
    const apiKeyCheck = validateRequiredApiKey(apiKey);
    if (!apiKeyCheck.valid) return apiKeyCheck;

    const apiKeyFormat = validateApiKeyFormat(apiKey, ['sk-', 'mx-']);
    if (!apiKeyFormat.valid) {
      return { valid: false, error: 'Invalid Mistral API key format. Expected to start with sk- or mx-' };
    }

    const modelCheck = validateModel(settings?.model, this.config.availableModels, 'Mistral');
    if (!modelCheck.valid) return modelCheck;

    const tempCheck = validateTemperature(settings?.temperature, 0, 1);
    if (!tempCheck.valid) return tempCheck;

    const maxTokensCheck = validateMaxTokens(settings?.maxTokens);
    if (!maxTokensCheck.valid) return maxTokensCheck;

    return { valid: true };
  }
}

/**
 * Create a new Mistral provider instance
 */
export function createMistralProvider(apiKey: string): MistralProvider {
  return new MistralProvider(apiKey);
}

/**
 * Create a Mistral provider from settings
 */
export function createMistralProviderFromSettings(settings: ProviderSettings): MistralProvider {
  return new MistralProvider(settings.apiKey);
}
