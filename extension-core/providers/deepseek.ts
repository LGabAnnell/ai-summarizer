/**
 * DeepSeek Provider Implementation
 * Extends OpenAI-compatible provider — only overrides body params and validation.
 */

import type {AIProviderConfig, AIProviderSettings} from './provider.model';
import { OpenAICompatibleProvider } from './openai-compatible-provider';
import {
  type ValidationResult,
  validateApiKeyFormat,
  validateApiKeyLength,
  validateMaxTokens,
  validateModel,
  validateRequiredApiKey,
  validateTemperature,
} from './provider.utils';

// DeepSeek API configuration
const DEEPSEEK_CONFIG: AIProviderConfig = {
  name: 'deepseek',
  endpoint: 'https://api.deepseek.com/v1/chat/completions',
  modelsEndpoint: 'https://api.deepseek.com/v1/models',
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
export class DeepSeekProvider extends OpenAICompatibleProvider {
  override readonly config = DEEPSEEK_CONFIG;

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
    const apiKeyLength = validateApiKeyLength(apiKey, 30);
    if (!apiKeyFormat.valid && !apiKeyLength.valid) {
      return { valid: false, error: 'Invalid DeepSeek API key format' };
    }

    const modelCheck = validateModel(settings?.model, this.config.availableModels, 'DeepSeek');
    if (!modelCheck.valid) return modelCheck;

    const tempCheck = validateTemperature(settings?.temperature, 0, 1);
    if (!tempCheck.valid) return tempCheck;

    const maxTokensCheck = validateMaxTokens(settings?.maxTokens);
    if (!maxTokensCheck.valid) return maxTokensCheck;

    return { valid: true };
  }
}

/**
 * Create a new DeepSeek provider instance
 */
export function createDeepSeekProvider(apiKey: string): DeepSeekProvider {
  return new DeepSeekProvider(apiKey);
}
