/**
 * Base Provider — abstract class extracting shared logic from all AI providers.
 *
 * Concrete providers only need to implement:
 *  - buildRequestBody()  (body shape is provider-specific)
 *  - parseResponseBody() (response format is provider-specific)
 */

import type {AIProvider, AIProviderConfig, AIProviderRequest, AIProviderResponse,} from './provider.model';
import {
  addAuthHeader,
  buildBaseHeaders,
  estimateTokenCount,
  getSystemPrompt as getSystemPromptUtil,
  getTokenCount as getTokenCountUtil,
} from './provider.utils';
import {SummaryStyle} from "./summary-prompts";

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

  /**
   * Fetch available models from the provider's API
   * @param apiKey - The API key for authentication
   * @returns Promise with array of model IDs
   */
  abstract fetchModels(apiKey: string): Promise<string[]>;

  /**
   * Build the full API request (headers + auth + body).
   */
  buildRequest(
    articleText: string,
    title?: string,
    settings?: Record<string, any>,
  ): AIProviderRequest {
    const headers = {
      ...buildBaseHeaders(),
      ...this.getExtraHeaders(),
    };
    addAuthHeader(
      headers,
      this.apiKey,
      this.config.authHeader!,
      this.config.useBearerToken!,
    );
    return {
      url: this.config.endpoint,
      method: 'POST',
      headers,
      body: this.buildRequestBody(articleText, title, settings),
    };
  }

  // ── Concrete methods (shared across all providers) ──────────────────

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
  getSystemPrompt(style?: SummaryStyle, customPrompt?: string): string {
    return getSystemPromptUtil(style, customPrompt);
  }

  /** Update the API key. */
  updateApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Override to add provider-specific headers (e.g., anthropic-version).
   * Returns an empty object by default.
   */
  protected getExtraHeaders(): Record<string, string> {
    return {};
  }
}
