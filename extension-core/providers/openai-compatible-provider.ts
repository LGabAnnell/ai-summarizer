/**
 * OpenAI-Compatible Provider — shared implementation for providers using
 * the OpenAI chat completions API format (mistral, openai, deepseek).
 */

import {BaseProvider} from './base-provider';
import type {AIProviderConfig, AIProviderResponse} from './provider.model';
import {buildUserMessage} from './provider.utils';

export abstract class OpenAICompatibleProvider extends BaseProvider {
  // ── Concrete methods (shared body shape + response parsing) ─────────

  /** Build the request body — standard OpenAI chat completions format. */
  buildRequestBody(
    articleText: string,
    title?: string,
    settings?: Record<string, any>,
  ): Record<string, any> {
    const {
      model = this.config.defaultModel,
      temperature = 0.7,
      maxTokens = 500,
      summaryStyle = 'concise',
      customPrompt,
    } = settings ?? {};

    const systemPrompt = this.getSystemPrompt(summaryStyle, customPrompt);
    const userMessage = buildUserMessage(articleText, title);

    const messages = [
      {role: 'system' as const, content: systemPrompt},
      {role: 'user' as const, content: userMessage},
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

        if (firstChoice.message?.content) {
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
          response.error.message ?? `Unknown ${this.config.name} API error`,
        );
      }

      throw new Error(`Invalid ${this.config.name} API response format`);
    } catch {
      return {
        summary: '',
        rawResponse: response,
        truncated: false,
      };
    }
  }

  // ── Concrete methods (shared model fetching) ───────────────────────

  /**
   * Fetch available models from the provider's API.
   * OpenAI-compatible providers use /v1/models endpoint.
   * @param apiKey - The API key for authentication
   * @returns Promise with array of model IDs
   */
  async fetchModels(apiKey: string): Promise<string[]> {
    const modelsEndpoint = (this.config as AIProviderConfig).modelsEndpoint;

    if (!modelsEndpoint) {
      // Fallback to hardcoded models if no models endpoint is configured
      return this.config.availableModels ?? [];
    }

    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      // Add authentication header
      if (this.config.authHeader && this.config.useBearerToken) {
        headers[this.config.authHeader] = `Bearer ${apiKey}`;
      } else if (this.config.authHeader) {
        headers[this.config.authHeader] = apiKey;
      }

      const response = await fetch(modelsEndpoint, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message ?? errorJson.message ?? errorMessage;
        } catch {
          if (errorText) {
            errorMessage = `${errorMessage}: ${errorText}`;
          }
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      // Handle OpenAI/Mistral/DeepSeek response format: { data: [{ id: string, ... }] }
      if (data.data && Array.isArray(data.data)) {
        return data.data.map((model: any) => model.id).filter((id: string) => typeof id === 'string');
      }

      // Handle alternative format where models are directly in the response
      if (Array.isArray(data)) {
        return data.map((model: any) => model.id).filter((id: string) => typeof id === 'string');
      }

      console.warn('Unexpected models API response format', data);
      return this.config.availableModels ?? [];
    } catch (error) {
      console.error('Error fetching models:', error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  // ── Abstract hook (provider-specific body params) ───────────────────

  /**
   * Override to add provider-specific body parameters.
   * e.g., Mistral adds `random_seed`, OpenAI adds penalties.
   */
  protected abstract getExtraBodyParams(): Record<string, any>;
}
