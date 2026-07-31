/**
 * Mistral AI Provider Implementation
 * Implements the AIProvider interface for Mistral's API
 */

import type { AIProvider, AIProviderConfig, AIProviderRequest, AIProviderResponse, ProviderSettings } from './provider.model';
import { SUMMARY_PROMPTS, type SummaryStyle } from './summary-prompts';
import {
  estimateTokenCount,
  buildBaseHeaders,
  addAuthHeader,
  buildUserMessage,
  getSystemPrompt as getSystemPromptUtil,
  getTokenCount as getTokenCountUtil,
  validateRequiredApiKey,
  validateApiKeyFormat,
  validateModel,
  validateTemperature,
  validateMaxTokens,
  type ValidationResult,
} from './provider.utils';

// Mistral provider settings type
export interface MistralProviderSettings {
  /** Model to use for completion */
  model?: string;
  /** Sampling temperature (0-1) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Summary style */
  summaryStyle?: string;
  /** Custom system prompt */
  customPrompt?: string;
}

// Mistral API configuration
const MISTRAL_CONFIG: AIProviderConfig = {
  name: 'mistral',
  endpoint: 'https://api.mistral.ai/v1/chat/completions',
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
export class MistralProvider implements AIProvider {
  readonly config = MISTRAL_CONFIG;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Build the API request for summarization
   */
  buildRequest(
    articleText: string,
    title?: string,
    settings?: MistralProviderSettings
  ): AIProviderRequest {
    const {
      model = this.config.defaultModel,
      temperature = 0.7,
      maxTokens = 500,
      summaryStyle = 'concise',
      customPrompt,
    } = settings || {};

    // Get the system prompt
    const systemPrompt = getSystemPromptUtil(summaryStyle, customPrompt);

    // Build the user message with context
    const userMessage = buildUserMessage(articleText, title);

    // Build the messages array
    const messages = [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: userMessage,
      },
    ];

    // Build the request body
    const body = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      top_p: 0.9,
      random_seed: 42,
    };

    // Build headers
    const headers = buildBaseHeaders();

    // Add authorization header
    addAuthHeader(headers, this.apiKey, this.config.authHeader!, this.config.useBearerToken!);

    return {
      url: this.config.endpoint,
      method: 'POST',
      headers,
      body,
    };
  }

  /**
   * Parse the API response to extract the summary
   */
  parseResponse(response: any): AIProviderResponse {
    try {
      // Mistral API response format
      if (response.choices && response.choices.length > 0) {
        const firstChoice = response.choices[0];
        
        if (firstChoice.message && firstChoice.message.content) {
          return {
            summary: firstChoice.message.content,
            rawResponse: response,
            tokenCount: response.usage?.total_tokens,
            truncated: false,
          };
        }
        
        // Fallback for different response formats
        if (firstChoice.text) {
          return {
            summary: firstChoice.text,
            rawResponse: response,
            tokenCount: response.usage?.total_tokens,
            truncated: false,
          };
        }
      }

      // Handle error responses
      if (response.error) {
        throw new Error(response.error.message || 'Unknown Mistral API error');
      }

      throw new Error('Invalid Mistral API response format');
    } catch (error) {
      return {
        summary: '',
        rawResponse: response,
        truncated: false,
      };
    }
  }

  /**
   * Validate the provider configuration
   */
  validateConfig(apiKey: string, settings?: MistralProviderSettings): ValidationResult {
    // Validate API key is required
    const apiKeyCheck = validateRequiredApiKey(apiKey);
    if (!apiKeyCheck.valid) return apiKeyCheck;

    // Validate API key format (Mistral keys are typically in format sk-... or mx-...)
    const apiKeyFormat = validateApiKeyFormat(apiKey, ['sk-', 'mx-']);
    if (!apiKeyFormat.valid) {
      return { valid: false, error: 'Invalid Mistral API key format. Expected to start with sk- or mx-' };
    }

    // Validate model
    const modelCheck = validateModel(settings?.model, this.config.availableModels, 'Mistral');
    if (!modelCheck.valid) return modelCheck;

    // Validate temperature
    const tempCheck = validateTemperature(settings?.temperature, 0, 1);
    if (!tempCheck.valid) return tempCheck;

    // Validate maxTokens
    const maxTokensCheck = validateMaxTokens(settings?.maxTokens);
    if (!maxTokensCheck.valid) return maxTokensCheck;

    return { valid: true };
  }

  /**
   * Get the estimated token count for the request
   */
  getTokenCount(articleText: string): number {
    // Estimate tokens for the article text plus prompt tokens
    const systemPrompt = getSystemPromptUtil('concise');
    return getTokenCountUtil(articleText, systemPrompt, estimateTokenCount);
  }

  /**
   * Get the system prompt for summarization
   */
  getSystemPrompt(style?: SummaryStyle, customPrompt?: string): string {
    return getSystemPromptUtil(style, customPrompt);
  }

  /**
   * Update the API key
   */
  updateApiKey(apiKey: string): void {
    this.apiKey = apiKey;
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
