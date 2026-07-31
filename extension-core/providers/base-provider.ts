/**
 * Base Provider — abstract class extracting shared logic from all AI providers.
 *
 * Concrete providers only need to implement:
 *  - buildRequestBody()  (body shape is provider-specific)
 *  - parseResponseBody() (response format is provider-specific)
 *  - validateConfig()    (key format rules differ per provider)
 */

import type {
  AIProvider,
  AIProviderConfig,
  AIProviderRequest,
  AIProviderResponse,
} from './provider.model';
import {
  estimateTokenCount,
  buildBaseHeaders,
  addAuthHeader,
  getSystemPrompt as getSystemPromptUtil,
  getTokenCount as getTokenCountUtil,
  type ValidationResult,
} from './provider.utils';

export abstract class BaseProvider implements AIProvider {
  abstract readonly config: AIProviderConfig;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // ── Abstract methods (provider-specific) ────────────────────────────

  /** Build the request body — shape varies by provider API. */
  abstract buildRequestBody(
    articleText: string,
    title?: string,
    settings?: Record<string, any>
  ): Record<string, any>;

  /** Parse the response body — format varies by provider API. */
  abstract parseResponseBody(response: any): AIProviderResponse;

  /** Validate provider configuration (key format, model, etc.). */
  abstract validateConfig(
    apiKey: string,
    settings?: Record<string, any>
  ): ValidationResult;

  /**
   * Override to add provider-specific headers (e.g., anthropic-version).
   * Returns an empty object by default.
   */
  protected getExtraHeaders(): Record<string, string> {
    return {};
  }

  // ── Concrete methods (shared across all providers) ──────────────────

  /**
   * Build the full API request (headers + auth + body).
   */
  buildRequest(
    articleText: string,
    title?: string,
    settings?: Record<string, any>
  ): AIProviderRequest {
    const headers = {
      ...buildBaseHeaders(),
      ...this.getExtraHeaders(),
    };
    addAuthHeader(
      headers,
      this.apiKey,
      this.config.authHeader!,
      this.config.useBearerToken!
    );
    return {
      url: this.config.endpoint,
      method: 'POST',
      headers,
      body: this.buildRequestBody(articleText, title, settings),
    };
  }

  /** Parse the API response to extract the summary. */
  parseResponse(response: any): AIProviderResponse {
    return this.parseResponseBody(response);
  }

  /** Get the estimated token count for the request. */
  getTokenCount(articleText: string): number {
    const systemPrompt = getSystemPromptUtil('concise');
    return getTokenCountUtil(articleText, systemPrompt, estimateTokenCount);
  }

  /** Get the system prompt for summarization. */
  getSystemPrompt(style?: string, customPrompt?: string): string {
    return getSystemPromptUtil(style, customPrompt);
  }

  /** Update the API key. */
  updateApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }
}
