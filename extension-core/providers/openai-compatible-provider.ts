/**
 * OpenAI-Compatible Provider — shared implementation for providers using
 * the OpenAI chat completions API format (mistral, openai, deepseek).
 */

import { BaseProvider } from './base-provider';
import type { AIProviderResponse } from './provider.model';
import type { ValidationResult } from './provider.utils';
import { buildUserMessage } from './provider.utils';

export abstract class OpenAICompatibleProvider extends BaseProvider {
  // ── Concrete methods (shared body shape + response parsing) ─────────

  /** Build the request body — standard OpenAI chat completions format. */
  buildRequestBody(
    articleText: string,
    title?: string,
    settings?: Record<string, any>
  ): Record<string, any> {
    const {
      model = this.config.defaultModel,
      temperature = 0.7,
      maxTokens = 500,
      summaryStyle = 'concise',
      customPrompt,
    } = settings || {};

    const systemPrompt = this.getSystemPrompt(summaryStyle, customPrompt);
    const userMessage = buildUserMessage(articleText, title);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userMessage },
    ];

    return {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      top_p: 0.9,
      ...this.getExtraBodyParams(),
    };
  }

  /** Parse the response — standard OpenAI choices format. */
  parseResponseBody(response: any): AIProviderResponse {
    try {
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

      if (response.error) {
        throw new Error(
          response.error.message || `Unknown ${this.config.name} API error`
        );
      }

      throw new Error(`Invalid ${this.config.name} API response format`);
    } catch (error) {
      return {
        summary: '',
        rawResponse: response,
        truncated: false,
      };
    }
  }

  // ── Abstract hook (provider-specific body params) ───────────────────

  /**
   * Override to add provider-specific body parameters.
   * e.g., Mistral adds `random_seed`, OpenAI adds penalties.
   */
  protected abstract getExtraBodyParams(): Record<string, any>;
}
