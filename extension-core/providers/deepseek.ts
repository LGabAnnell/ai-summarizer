/**
 * DeepSeek Provider Implementation
 * Extends OpenAI-compatible provider — only overrides body params and validation.
 */

import type {AIProviderConfig} from './provider.model';
import {OpenAICompatibleProvider} from './openai-compatible-provider';

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
    return {frequency_penalty: 0.0, presence_penalty: 0.0};
  }
}

/**
 * Create a new DeepSeek provider instance
 */
export function createDeepSeekProvider(apiKey: string): DeepSeekProvider {
  return new DeepSeekProvider(apiKey);
}
