/**
 * Provider exports and factory functions
 */

export * from './provider.model';
export * from './summary-prompts';
export * from './provider.utils';
export * from './base-provider';
export * from './openai-compatible-provider';
export * from './mistral';
export * from './openai';
export * from './anthropic';
export * from './qwen';
export * from './deepseek';
export * from './custom';
export * from './firefox-ml';

import type { AIProvider, ProviderType } from './provider.model';
import { MistralProvider, createMistralProvider } from './mistral';
import { OpenAIProvider, createOpenAIProvider } from './openai';
import { AnthropicProvider, createAnthropicProvider } from './anthropic';
import { QwenProvider, createQwenProvider } from './qwen';
import { DeepSeekProvider, createDeepSeekProvider } from './deepseek';
import { CustomProvider, createCustomProvider } from './custom';
import { FirefoxMLProvider, createFirefoxMLProvider } from './firefox-ml';

/**
 * Provider factory to create the appropriate provider instance
 * @param providerType - The type of provider to create
 * @param apiKey - The API key for authentication
 * @param settings - Additional provider-specific settings
 */
export function createProvider(
  providerType: ProviderType,
  apiKey: string,
  settings?: { endpoint?: string, customEndpoint?: string },
): AIProvider {
  switch (providerType) {
  case 'mistral':
    return createMistralProvider(apiKey);
  case 'openai':
    return createOpenAIProvider(apiKey);
  case 'anthropic':
    return createAnthropicProvider(apiKey);
  case 'qwen':
    return createQwenProvider(apiKey);
  case 'deepseek':
    return createDeepSeekProvider(apiKey);
  case 'custom':
    // For custom provider, get endpoint from settings
    const endpoint = settings?.endpoint || settings?.customEndpoint;
    return createCustomProvider(apiKey, endpoint);
  case 'firefox-ml':
    // Firefox ML provider doesn't need API key or endpoint
    return createFirefoxMLProvider(apiKey);
  default:
    throw new Error(`Unknown provider type: ${providerType}`);
  }
}

/**
 * Get all available provider types
 */
export function getAvailableProviderTypes(): ProviderType[] {
  return ['mistral', 'openai', 'anthropic', 'qwen', 'deepseek', 'custom', 'firefox-ml'];
}

/**
 * Get provider display names
 */
export function getProviderDisplayNames(): Record<ProviderType, string> {
  return {
    mistral: 'Mistral',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    qwen: 'Qwen (DashScope)',
    deepseek: 'DeepSeek',
    custom: 'Custom',
    'firefox-ml': 'Firefox ML (Local)',
  };
}

/**
 * Get default model for a provider type
 */
export function getDefaultModel(providerType: ProviderType): string {
  const models: Record<ProviderType, string> = {
    mistral: 'mistral-tiny',
    openai: 'gpt-3.5-turbo',
    anthropic: 'claude-3-sonnet-20240229',
    qwen: 'qwen-plus',
    deepseek: 'deepseek-chat',
    custom: '',
    'firefox-ml': 'Xenova/distilbart-cnn-6-6',
  };
  return models[providerType];
}

/**
 * Get available models for a provider type
 */
export function getAvailableModels(providerType: ProviderType): string[] {
  const models: Record<ProviderType, string[]> = {
    mistral: [
      'mistral-tiny',
      'mistral-small',
      'mistral-medium',
      'mistral-large',
      'codestral-latest',
    ],
    openai: [
      'gpt-4o-mini',
      'gpt-4o',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
      'gpt-3.5-turbo-16k',
      'gpt-3.5-turbo-instruct',
    ],
    anthropic: [
      'claude-3-5-sonnet-20250620',
      'claude-3-haiku-20240307',
      'claude-3-sonnet-20240229',
      'claude-3-opus-20240229',
      'claude-2-1',
      'claude-2',
      'claude-instant-1-2',
      'claude-instant-1',
    ],
    qwen: [
      'qwen2-7b-instruct',
      'qwen2-72b-instruct',
      'qwen-plus',
      'qwen-turbo',
      'qwen-max',
      'qwen-7b-chat',
      'qwen-14b-chat',
      'qwen-72b-chat',
    ],
    deepseek: [
      'deepseek-chat',
      'deepseek-coder',
    ],
    custom: [], // Custom provider models are user-defined
    'firefox-ml': [
      'Xenova/distilbart-cnn-6-6',
      'Xenova/distilbart-cnn-12-6',
    ],
  };
  return models[providerType];
}
