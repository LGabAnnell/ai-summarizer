/**
 * AI Provider Interface for Article Summarizer
 * Defines the contract that all AI providers must implement
 */

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
  body?: any;
}

export interface AIProviderResponse {
  /** Extracted summary text */
  summary: string;
  /** Raw response from the API (for debugging) */
  rawResponse?: any;
  /** Number of tokens used */
  tokenCount?: number;
  /** Whether the response was truncated */
  truncated?: boolean;
}


// Mistral provider settings type
export interface AIProviderSettings {
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
  endpoint?: string;
  customEndpoint?: string;
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
    settings?: Record<string, any>
  ): AIProviderRequest;

  /**
   * Parse the API response to extract the summary
   * @param response - The raw API response
   */
  parseResponse(response: any): AIProviderResponse;

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

/**
 * Factory function to create the appropriate provider instance
 */
export function createProvider(providerType: ProviderType): AIProvider {
  switch (providerType) {
    case 'mistral':
      // Import and return Mistral provider
      // Note: Dynamic imports will be used in the actual implementation
      return null as any; // Placeholder
    case 'openai':
      return null as any; // Placeholder
    case 'anthropic':
      return null as any; // Placeholder
    case 'qwen':
      return null as any; // Placeholder
    case 'deepseek':
      return null as any; // Placeholder
    case 'custom':
      return null as any; // Placeholder
    case 'firefox-ml':
      return null as any; // Placeholder
    default:
      throw new Error(`Unknown provider type: ${providerType}`);
  }
}
