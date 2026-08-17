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

import type {AIProvider, ProviderType} from './provider.model';
import {createMistralProvider} from './mistral';
import {createOpenAIProvider} from './openai';
import {createAnthropicProvider} from './anthropic';
import {createQwenProvider} from './qwen';
import {createDeepSeekProvider} from './deepseek';
import {createCustomProvider} from './custom';
import {createFirefoxMLProvider} from './firefox-ml';

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