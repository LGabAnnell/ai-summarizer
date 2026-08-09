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
 * Validation result type
 */
export type ValidationResult = { valid: boolean; error?: string };

/**
 * Validate that API key is required and not empty
 */
export function validateRequiredApiKey(apiKey: string): ValidationResult {
  if (!apiKey || apiKey.trim() === '') {
    return { valid: false, error: 'API key is required' };
  }
  return { valid: true };
}

/**
 * Validate API key format against expected prefixes
 */
export function validateApiKeyFormat(
  apiKey: string,
  expectedPrefixes: string[],
): ValidationResult {
  for (const prefix of expectedPrefixes) {
    if (apiKey.startsWith(prefix)) {
      return { valid: true };
    }
  }
  return { valid: false, error: `Invalid API key format. Expected to start with one of: ${expectedPrefixes.join(', ')}` };
}

/**
 * Validate API key minimum length
 */
export function validateApiKeyLength(apiKey: string, minLength: number = 30): ValidationResult {
  if (apiKey.length < minLength) {
    return { valid: false, error: `Invalid API key format. Key seems too short (minimum ${minLength} characters).` };
  }
  return { valid: true };
}

/**
 * Validate model is in the list of available models
 */
export function validateModel(
  model: string | undefined,
  availableModels: string[] | undefined,
  providerName: string,
): ValidationResult {
  if (model && availableModels && !availableModels.includes(model)) {
    return { valid: false, error: `Invalid model: ${model}. Available models: ${availableModels.join(', ')}` };
  }
  return { valid: true };
}

/**
 * Validate temperature is a number within specified range
 */
export function validateTemperature(
  temperature: number | undefined,
  min: number = 0,
  max: number = 1,
): ValidationResult {
  if (temperature !== undefined) {
    if (typeof temperature !== 'number' || temperature < min || temperature > max) {
      return { valid: false, error: `Temperature must be a number between ${min} and ${max}` };
    }
  }
  return { valid: true };
}

/**
 * Validate maxTokens is a positive number
 */
export function validateMaxTokens(
  maxTokens: number | undefined,
  maxLimit?: number,
): ValidationResult {
  if (maxTokens !== undefined) {
    if (typeof maxTokens !== 'number' || maxTokens <= 0) {
      return { valid: false, error: 'maxTokens must be a positive number' };
    }
    if (maxLimit && maxTokens > maxLimit) {
      return { valid: false, error: `maxTokens must be a positive number (max ${maxLimit})` };
    }
  }
  return { valid: true };
}

/**
 * Validate a URL string
 */
export function validateUrl(url: string | undefined): ValidationResult {
  if (!url || url.trim() === '') {
    return { valid: false, error: 'URL is required' };
  }
  try {
    new URL(url);
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}
