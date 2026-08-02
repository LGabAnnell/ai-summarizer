/**
 * Background Service Worker for Article Summarizer Extension
 * Handles communication between popup, content scripts, and AI providers
 */

// Import provider factory
import { createProvider, getAvailableProviderTypes } from './providers';
import browser from 'webextension-polyfill';
import {ArticleData} from "@shared/lib/models/article.model";
import {CachedSummaryData, Message, SummarizeResponse} from "@shared/lib/models/summary.model";

// Cache configuration
const CACHE_PREFIX = 'summary_cache_';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

// Settings type
export interface ExtensionSettings {
  provider: string;
  apiKey: string;
  model: string;
  customEndpoint?: string;
  summaryStyle?: string;
  customPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  cacheEnabled?: boolean;
  cacheTTL?: number;
}

// Default settings
const DEFAULT_SETTINGS: ExtensionSettings = {
  provider: 'mistral',
  apiKey: '',
  model: 'mistral-tiny',
  summaryStyle: 'concise',
  customPrompt: '',
  maxTokens: 500,
  temperature: 0.7,
  cacheEnabled: true,
  cacheTTL: 7,
};

/**
 * Generate a cache key for a given article and settings
 */
function generateCacheKey(article: ArticleData, settings: Partial<ExtensionSettings>): string {
  const keyParts = [
    article.url,
    settings.provider || 'mistral',
    settings.model || 'mistral-tiny',
    settings.customPrompt || '',
    settings.summaryStyle || 'concise',
  ].join('|');
  
  return CACHE_PREFIX + btoa(encodeURIComponent(keyParts));
}

/**
 * Get cached summary for an article
 */
async function getCachedSummary(article: ArticleData, settings: Partial<ExtensionSettings>): Promise<string | null> {
  const cacheKey = generateCacheKey(article, settings);
  const result = await browser.storage.local.get(cacheKey) as Record<string, CachedSummaryData>;
  
  if (result[cacheKey]) {
    const cached = result[cacheKey];
    
    // Check if cache has expired
    if (cached.timestamp && Date.now() - cached.timestamp < (settings.cacheTTL || 7) * 24 * 60 * 60 * 1000) {
      return cached.summary;
    } else {
      // Cache expired, remove it
      await browser.storage.local.remove(cacheKey);
    }
  }
  
  return null;
}

/**
 * Cache a summary
 */
async function cacheSummary(article: ArticleData, settings: Partial<ExtensionSettings>, summary: string): Promise<void> {
  const cacheKey = generateCacheKey(article, settings);
  await browser.storage.local.set({
    [cacheKey]: {
      summary,
      timestamp: Date.now(),
      url: article.url,
      provider: settings.provider || 'mistral',
      model: settings.model || 'mistral-tiny',
    },
  });
}

/**
 * Get extension settings from storage
 */
async function getSettings(): Promise<ExtensionSettings> {
  const result = await browser.storage.local.get('extension_settings') as { extension_settings?: ExtensionSettings };;
  return { ...DEFAULT_SETTINGS, ...result.extension_settings };
}

/**
 * Save extension settings to storage
 */
async function saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  await browser.storage.local.set({
    extension_settings: settings,
  });
}

/**
 * Send message to a specific tab's content script
 */
async function sendMessageToTab(tabId: number, message: Message): Promise<any> {
  try {
    return await browser.tabs.sendMessage(tabId, message);
  } catch (error) {
    console.error('Error sending message to tab:', error);
    return null;
  }
}

/**
 * Extract article from the active tab
 */
async function extractArticleFromActiveTab(): Promise<ArticleData | null> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  
  if (tabs.length === 0 || !tabs[0].id) {
    throw new Error('No active tab found');
  }
  
  const tabId = tabs[0].id;
  
  // Inject content script if not already injected
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
  } catch (error) {
    console.log('Content script may already be injected:', error);
  }
  
  // Send extraction request
  const response = await sendMessageToTab(tabId, { type: 'EXTRACT_ARTICLE' });
  
  if (response && response.success && response.data) {
    return response.data as ArticleData;
  }
  
  throw new Error(response?.error || 'Failed to extract article');
}

/**
 * Handle summarization request
 */
async function handleSummarize(article: ArticleData, providerOverride?: string): Promise<SummarizeResponse> {
  try {
    // Get settings
    const settings = await getSettings();
    
    // Use provider override if specified
    const provider = providerOverride || settings.provider;
    
    // Check cache first
    if (settings.cacheEnabled) {
      const cachedSummary = await getCachedSummary(article, { 
        provider, 
        model: settings.model, 
        customPrompt: settings.customPrompt,
        summaryStyle: settings.summaryStyle 
      });
      
      if (cachedSummary) {
        return {
          type: 'SUMMARIZE_RESPONSE',
          summary: cachedSummary,
          success: true,
          cached: true,
        };
      }
    }
    
    // Call the actual AI provider API
    const result = await callProviderAPI(article, settings);
    
    if (result.error) {
      return {
        type: 'SUMMARIZE_RESPONSE',
        error: result.error,
        success: false,
      };
    }
    
    // Cache the result
    if (settings.cacheEnabled) {
      await cacheSummary(article, settings, result.summary || '');
    }
    
    return {
      type: 'SUMMARIZE_RESPONSE',
      summary: result.summary,
      success: true,
      cached: false,
      tokenCount: result.tokenCount,
    };
  } catch (error) {
    return {
      type: 'SUMMARIZE_RESPONSE',
      error: `Summarization error: ${error instanceof Error ? error.message : String(error)}`,
      success: false,
    };
  }
}

/**
 * Call the AI provider API to get a summary
 */
async function callProviderAPI(
  article: ArticleData,
  settings: ExtensionSettings
): Promise<{ summary: string; tokenCount?: number; error?: string }> {
  try {
    const provider = createProvider(
      settings.provider as any,
      settings.apiKey,
      { endpoint: settings.customEndpoint }
    );

    // Build the request
    const request = provider.buildRequest(
      article.textContent,
      article.title,
      {
        model: settings.model,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        summaryStyle: settings.summaryStyle,
        customPrompt: settings.customPrompt,
      }
    );

    // Make the API call
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error?.message || errorJson.message || `HTTP ${response.status}`);
      } catch {
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
    }

    const responseData = await response.json();
    
    // Parse the response
    const providerResponse = provider.parseResponse(responseData);
    
    if (providerResponse.summary) {
      return {
        summary: providerResponse.summary,
        tokenCount: providerResponse.tokenCount,
      };
    } else {
      throw new Error('No summary returned from provider');
    }
  } catch (error) {
    return {
      summary: '',
      error: `Provider error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Generate a mock summary for testing purposes (fallback)
 */
function generateMockSummary(article: ArticleData): string {
  const lines = [
    `This is a mock summary of "${article.title}".`,
    `The article is ${article.length} characters long.`,
    `In a real implementation, this would be replaced by actual AI-generated summary.`,
  ];
  
  return lines.join(' ');
}

/**
 * Handle GET_SETTINGS request
 */
async function handleGetSettings(): Promise<{ type: string; settings: ExtensionSettings }> {
  const settings = await getSettings();
  return {
    type: 'GET_SETTINGS_RESPONSE',
    settings,
  };
}

/**
 * Handle SAVE_SETTINGS request
 */
async function handleSaveSettings(settings: Partial<ExtensionSettings>): Promise<{ type: string; success: boolean; error?: string }> {
  try {
    // Validate settings
    if (settings.apiKey && typeof settings.apiKey !== 'string') {
      return {
        type: 'SAVE_SETTINGS_RESPONSE',
        success: false,
        error: 'Invalid API key format',
      };
    }
    
    // Save settings
    await saveSettings(settings);
    
    return {
      type: 'SAVE_SETTINGS_RESPONSE',
      success: true,
    };
  } catch (error) {
    return {
      type: 'SAVE_SETTINGS_RESPONSE',
      success: false,
      error: `Failed to save settings: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Handle REFRESH_MODELS request
 */
async function handleRefreshModels(providerType: string, apiKey: string): Promise<{ success: boolean; data?: { models: string[] }; error?: string }> {
  try {
    if (!apiKey || apiKey.trim() === '') {
      return { success: false, error: 'API key is required' };
    }

    // Create provider instance
    const provider = createProvider(providerType as any, apiKey);
    
    // Call the provider's fetchModels method
    const models = await provider.fetchModels(apiKey);
    
    return {
      success: true,
      data: { models },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to refresh models: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Test a provider connection
 */
async function testProviderConnection(providerType: string, apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    if (!apiKey || apiKey.trim() === '') {
      return { valid: false, error: 'API key is required' };
    }

    // For now, just validate the API key format based on provider type
    // In a full implementation, this would make a test API call
    if (providerType === 'mistral') {
      if (!apiKey.startsWith('sk-') && !apiKey.startsWith('mx-')) {
        return { valid: false, error: 'Mistral API key should start with sk- or mx-' };
      }
      return { valid: true };
    }

    if (providerType === 'openai') {
      if (!apiKey.startsWith('sk-')) {
        return { valid: false, error: 'OpenAI API key should start with sk-' };
      }
      return { valid: true };
    }

    if (providerType === 'anthropic') {
      if (!apiKey.startsWith('sk_')) {
        return { valid: false, error: 'Anthropic API key should start with sk_' };
      }
      return { valid: true };
    }

    if (providerType === 'qwen' || providerType === 'deepseek') {
      if (apiKey.length < 30) {
        return { valid: false, error: 'API key seems too short' };
      }
      return { valid: true };
    }

    // For custom provider, just check that it's not empty
    if (providerType === 'custom') {
      return { valid: true };
    }

    return { valid: true };
  } catch (error) {
    return { 
      valid: false, 
      error: `Connection test failed: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}

/**
 * Main message handler
 */
async function handleMessage(request: Message, sender: any): Promise<any> {
  switch (request.type) {
    case 'EXTRACT_AND_SUMMARIZE':
      try {
        const article = await extractArticleFromActiveTab();
        if (!article) {
          return {
            type: 'SUMMARIZE_RESPONSE',
            error: 'Could not extract article content',
            success: false,
          };
        }
        const summaryResponse = await handleSummarize(article);
        // Add article metadata to the response for the sidebar
        return {
          ...summaryResponse,
          title: article.title,
          articleUrl: article.url,
        };
      } catch (error) {
        return {
          type: 'SUMMARIZE_RESPONSE',
          error: `Extraction error: ${error instanceof Error ? error.message : String(error)}`,
          success: false,
        };
      }

    case 'SUMMARIZE':
      return handleSummarize(request.article, request.provider);

    case 'GET_SETTINGS':
      return handleGetSettings();

    case 'SAVE_SETTINGS':
      return handleSaveSettings(request.settings);

    case 'TEST_PROVIDER':
      return testProviderConnection(request.provider, request.apiKey);

    case 'REFRESH_MODELS':
      return handleRefreshModels(request.provider, request.apiKey);

    case 'CLEAR_CACHE':
      try {
        const keys = await browser.storage.local.getKeys();
        const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
        await browser.storage.local.remove(cacheKeys);
        return {
          type: 'CLEAR_CACHE_RESPONSE',
          success: true,
          cleared: cacheKeys.length,
        };
      } catch (error) {
        return {
          type: 'CLEAR_CACHE_RESPONSE',
          success: false,
          error: `Failed to clear cache: ${error}`,
        };
      }

    default:
      return {
        type: 'UNKNOWN_REQUEST',
        error: `Unknown message type: ${request.type}`,
        success: false,
      };
  }
}

// Set up message listener
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request as Message, sender)
    .then(response => sendResponse(response))
    .catch(error => sendResponse({
      type: 'ERROR_RESPONSE',
      error: `Unhandled error: ${error instanceof Error ? error.message : String(error)}`,
      success: false,
    }));
  
  // Return true to indicate we will send a response asynchronously
  return true;
});

console.log('Article Summarizer background service worker loaded');
