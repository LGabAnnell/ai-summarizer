/**
 * Provider Utility Functions
 * Common utilities used across all AI provider implementations
 */

import {SUMMARY_PROMPTS, SummaryStyle} from './summary-prompts';

/**
 * Estimate token count for a given text
 * Simple approximation: 4 characters per token
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Build base headers common to all providers
 */
export function buildBaseHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

/**
 * Add authorization header to headers object
 */
export function addAuthHeader(
  headers: Record<string, string>,
  apiKey: string,
  authHeader: string,
  useBearerToken: boolean,
): void {
  if (apiKey && authHeader) {
    if (useBearerToken) {
      headers[authHeader] = `Bearer ${apiKey}`;
    } else {
      headers[authHeader] = apiKey;
    }
  }
}

/**
 * Build the user message with context
 */
export function buildUserMessage(articleText: string, title?: string): string {
  if (title) {
    return `Please summarize the following article titled "${title}":\n\n${articleText}`;
  }
  return `Please summarize the following article:\n\n${articleText}`;
}

/**
 * Get the system prompt for summarization
 */
export function getSystemPrompt(style?: SummaryStyle, customPrompt?: string): string {
  // Use custom prompt if provided
  if (customPrompt && customPrompt.trim() !== '') {
    return customPrompt;
  }

  // Use style-specific prompt or default to concise
  return SUMMARY_PROMPTS[style ?? 'concise'] || SUMMARY_PROMPTS.concise;
}

/**
 * Get the estimated token count for the request
 */
export function getTokenCount(
  articleText: string,
  systemPrompt: string,
  estimateFn: (text: string) => number = estimateTokenCount,
): number {
  // Estimate tokens for the article text plus prompt tokens
  const promptTokens = estimateFn(systemPrompt);
  const articleTokens = estimateFn(articleText);
  return promptTokens + articleTokens;
}

/**
 * Parse models response from provider API
 * Handles both { data: [{ id: string }] } and [{ id: string }] formats
 */
export function parseModelsResponse(data: unknown): string[] {
  if (Array.isArray(data)) {
    return data.map((m: { id: string }) => m.id).filter((id) => typeof id === 'string');
  }

  if (data && typeof data === 'object' && 'data' in data && Array.isArray(data.data)) {
    return data.data.map((m: { id: string }) => m.id).filter((id) => typeof id === 'string');
  }

  return [];
}