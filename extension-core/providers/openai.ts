/**
 * OpenAI Provider Implementation
 * Extends OpenAI-compatible provider — only overrides body params and validation.
 */

import type {AIProviderConfig, AIProviderSettings} from './provider.model';
import { OpenAICompatibleProvider } from './openai-compatible-provider';
import {
  type ValidationResult,
  validateApiKeyFormat,
  validateMaxTokens,
  validateModel,
  validateRequiredApiKey,
  validateTemperature,
} from './provider.utils';

// OpenAI API configuration
const OPENAI_CONFIG: AIProviderConfig = {
  name: 'openai',
  endpoint: 'https://api.openai.com/v1/chat/completions',
  modelsEndpoint: 'https://api.openai.com/v1/models',
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
export class OpenAIProvider extends OpenAICompatibleProvider {
  override readonly config = OPENAI_CONFIG;

  constructor(apiKey: string) {
    super(apiKey);
  }

  protected getExtraBodyParams(): Record<string, any> {
    return { frequency_penalty: 0.0, presence_penalty: 0.0 };
  }

  validateConfig(apiKey: string, settings?: AIProviderSettings): ValidationResult {
    const apiKeyCheck = validateRequiredApiKey(apiKey);
    if (!apiKeyCheck.valid) return apiKeyCheck;

    const apiKeyFormat = validateApiKeyFormat(apiKey, ['sk-']);
    if (!apiKeyFormat.valid) {
      return { valid: false, error: 'Invalid OpenAI API key format. Expected to start with sk-' };
    }

    const modelCheck = validateModel(settings?.model, this.config.availableModels, 'OpenAI');
    if (!modelCheck.valid) return modelCheck;

    // OpenAI supports 0-2 range
    const tempCheck = validateTemperature(settings?.temperature, 0, 2);
    if (!tempCheck.valid) return tempCheck;

    const maxTokensCheck = validateMaxTokens(settings?.maxTokens);
    if (!maxTokensCheck.valid) return maxTokensCheck;

    return { valid: true };
  }
}

/**
 * Create a new OpenAI provider instance
 */
export function createOpenAIProvider(apiKey: string): OpenAIProvider {
  return new OpenAIProvider(apiKey);
}
