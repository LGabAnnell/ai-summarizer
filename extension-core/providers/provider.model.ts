/**
 * AI Provider Interface for Article Summarizer
 * Defines the contract that all AI providers must implement
 */
import {AIRequestSettings} from '@shared/lib/models/settings.model';

export interface AIProviderConfig {
  /** Provider name (e.g., 'mistral', 'openai', 'anthropic') */
  name: string;
  /** API endpoint URL */
  endpoint: string;
  /** Models API endpoint URL for fetching available models */
  modelsEndpoint?: string;
  /** Authentication header name (e.g., 'Authorization', 'x-api-key') */
  authHeader?: string;
  /** Default model for this provider */
  defaultModel?: string;
  /** Available models for this provider */
  availableModels?: string[];
  /** Whether this provider supports streaming */
  supportsStreaming?: boolean;
  /** Whether to use Bearer token authentication */
  useBearerToken?: boolean;
}

export interface AIProviderRequest {
  /** API endpoint URL */
  url: string;
  /** HTTP method */
  method: string;
  /** Request headers */
  headers: Record<string, string>;
  /** Request body */
  body?: Record<string, unknown>;
}

export interface AIProviderResponse {
  /** Extracted summary text */
  summary: string;
  /** Raw response from the API (for debugging) */
  rawResponse?: unknown;
  /** Number of tokens used */
  tokenCount?: number;
  /** Whether the response was truncated */
  truncated?: boolean;
}

export interface AIProvider {
  /** Provider configuration */
  config: AIProviderConfig;

  /**
   * Build the API request for summarization
   * @param articleText - The article text to summarize
   * @param title - The article title (optional, for context)
   * @param settings - Additional settings (model, temperature, etc.)
   */
  buildRequest(
    articleText: string,
    title?: string,
    settings?: AIRequestSettings
  ): AIProviderRequest;

  /**
   * Parse the API response to extract the summary
   * @param response - The raw API response
   */
  parseResponse(response: unknown): AIProviderResponse;

  /**
   * Get the estimated token count for the request
   * @param articleText - The article text
   */
  getTokenCount(articleText: string): number;

  /**
   * Get the system prompt for summarization
   * @param style - Summary style (e.g., 'concise', 'detailed', 'bullet_points')
   * @param customPrompt - Custom prompt override
   */
  getSystemPrompt(style?: string, customPrompt?: string): string;

  /**
   * Fetch available models from the provider's API
   * @param apiKey - The API key for authentication
   * @returns Promise with array of model IDs
   */
  fetchModels(apiKey: string): Promise<string[]>;
}

/**
 * Provider types supported by the extension
 */
export type ProviderType = 'mistral' | 'openai' | 'anthropic' | 'qwen' | 'deepseek' | 'custom' | 'firefox-ml';

/**
 * Settings for a specific provider
 */
export interface ProviderSettings {
  /** Provider type */
  provider: ProviderType;
  /** API key for authentication */
  apiKey: string;
  /** Model to use */
  model: string;
  /** Custom endpoint URL (for 'custom' provider) */
  customEndpoint?: string;
  /** Summary style */
  summaryStyle?: 'concise' | 'detailed' | 'bullet_points' | 'custom';
  /** Custom system prompt */
  customPrompt?: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Sampling temperature (0-1) */
  temperature?: number;
}
