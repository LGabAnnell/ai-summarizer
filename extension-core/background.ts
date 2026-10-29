/**
 * Background Service Worker for Article Summarizer Extension
 * Handles communication between popup, content scripts, and AI providers
 */

// Import provider factory
import {createProvider} from './providers';
import browser from 'webextension-polyfill';
import {setupSidebarShortcut} from './sidebar-shortcut';
import {ArticleData} from '@shared/lib/models/article.model';
import {Message, SetThemeRequest, SummarizeResponse, ClassifyWithAgentRequest} from '@shared/lib/models/summary.model';

// Import ML services
import {ClassificationResult, textClassifierService} from './ml/text-classifier.service';
import {mlPermissionService} from './ml/ml-permission.service';
import {MLEngineConfig, mlEngineManager} from './ml/ml-engine-manager';
import {ProviderType} from '@shared/lib/models/settings.model';

// ML-related types for message handling
export interface ClassifyTextRequest {
  type: 'CLASSIFY_TEXT';
  text: string;
  modelId?: string;
  timeout?: number;
}

export interface GetMLPermissionStatusRequest {
  type: 'GET_ML_PERMISSION_STATUS';
}

export interface NotifyMLPermissionGrantedRequest {
  type: 'NOTIFY_ML_PERMISSION_GRANTED';
}

export interface ClearMLCacheRequest {
  type: 'CLEAR_ML_CACHE';
}

export interface CheckMLAvailabilityRequest {
  type: 'CHECK_ML_AVAILABILITY';
}

// Cache configuration
const CACHE_PREFIX = 'summary_cache_';
// const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

// Settings type
export interface ExtensionSettings {
  mlTimeout: number;
  provider: ProviderType;
  apiKey: string;
  model: string;
  customEndpoint?: string;
  summaryStyle?: SummaryPrompt;
  customPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  cacheEnabled?: boolean;
  cacheTTL?: number;
  // ML settings
  mlEnabled?: boolean;
  mlModelHub?: 'mozilla' | 'huggingface';
  mlModelId?: string;
  // Mistral Agent Classification Settings
  mistralAgentId?: string;
  mistralAgentVersion?: string;
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
  // ML settings (disabled by default)
  mlEnabled: false,
  mlModelHub: 'mozilla',
  mlModelId: 'distilbert-base-uncased-finetuned-sst-2-english',
  mlTimeout: 720000,
  // Mistral Agent Classification Settings (both start blank)
  mistralAgentId: '',
  mistralAgentVersion: '',
};

/**
 * Generate a cache key for a given article and settings
 * Note: Agent ID and version are NOT included in the cache key to keep summary caching
 * independent of classification settings. Classification will be re-run if agent settings change.
 */
function generateCacheKey(article: ArticleData, settings: Partial<ExtensionSettings>): string {
  const keyParts = [
    article.url,
    settings.provider ?? 'mistral',
    settings.model ?? 'mistral-tiny',
    settings.customPrompt ?? '',
    settings.summaryStyle ?? 'concise',
  ].join('|');

  return CACHE_PREFIX + btoa(encodeURIComponent(keyParts));
}

/**
 * Interface for cached summary data with agent classification
 */
interface CachedSummaryWithAgent {
  summary: string;
  timestamp: number;
  url: string;
  provider: string;
  model: string;
  agentLabels?: string[];
  agentId?: string;
  agentVersion?: string;
}

/**
 * Get cached summary for an article
 * Returns cached data including agent labels if available
 * Note: Agent labels are stored with the cache but the cache key is independent of agent settings
 */
async function getCachedSummary(
  article: ArticleData,
  settings: Partial<ExtensionSettings>,
): Promise<{summary: string; agentLabels?: string[]} | null> {
  const cacheKey = generateCacheKey(article, settings);
  const result = await browser.storage.local.get(cacheKey) as Record<string, CachedSummaryWithAgent>;

  if (result[cacheKey]) {
    const cached = result[cacheKey];

    // Check if cache has expired
    if (cached.timestamp && Date.now() - cached.timestamp < (settings.cacheTTL ?? 7) * 24 * 60 * 60 * 1000) {
      return {
        summary: cached.summary,
        agentLabels: cached.agentLabels,
      };
    } else {
      // Cache expired, remove it
      await browser.storage.local.remove(cacheKey);
    }
  }

  return null;
}

/**
 * Cache a summary with optional agent labels
 */
async function cacheSummary(
  article: ArticleData,
  settings: Partial<ExtensionSettings>,
  summary: string,
  agentLabels?: string[],
): Promise<void> {
  const cacheKey = generateCacheKey(article, settings);
  const cacheData: CachedSummaryWithAgent = {
    summary,
    timestamp: Date.now(),
    url: article.url,
    provider: settings.provider ?? 'mistral',
    model: settings.model ?? 'mistral-tiny',
  };

  // Only include agent classification if we have valid labels
  if (agentLabels && agentLabels.length > 0) {
    cacheData.agentLabels = agentLabels;
    cacheData.agentId = settings.mistralAgentId;
    cacheData.agentVersion = settings.mistralAgentVersion;
  }

  await browser.storage.local.set({
    [cacheKey]: cacheData,
  });
}

/**
 * Get extension settings from storage
 */
async function getSettings(): Promise<ExtensionSettings> {
  const result = await browser.storage.local.get('extension_settings') as { extension_settings?: ExtensionSettings };
  return {...DEFAULT_SETTINGS, ...result.extension_settings};
}

/**
 * Save extension settings to storage
 */
async function saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  await browser.storage.local.set({
    extension_settings: settings,
  });
}

class TabExtractionError extends Error {
  constructor(message: string, readonly tabId: number, readonly tabUrl?: string, options?: ErrorOptions) {
    super(message, options);
  }
}

/**
 * Extract article from the active tab
 */
async function extractArticleFromActiveTab(requestedTabId?: number): Promise<ArticleData | null> {
  const tabs = requestedTabId === undefined
    ? await browser.tabs.query({active: true, currentWindow: true})
    : [{id: requestedTabId}];

  const targetTab = tabs[0];
  if (targetTab?.id === undefined) {
    throw new Error('No active tab found');
  }

  const tabId = targetTab.id;
  let tabUrl = 'url' in targetTab ? targetTab.url : undefined;
  if (!tabUrl) {
    try {
      tabUrl = (await browser.tabs.get(tabId)).url;
    } catch {
      // Tab metadata is only used to distinguish Firefox's restricted pages.
    }
  }

  type ExtractResponse = {success: boolean; data?: ArticleData; error?: string};
  let response: ExtractResponse;

  // The manifest loads the content script at document_idle. On the first click it
  // may not have registered its message listener yet, so inject it on demand.
  try {
    response = await browser.tabs.sendMessage(tabId, {type: 'EXTRACT_ARTICLE'}) as ExtractResponse;
  } catch {
    try {
      await browser.scripting.executeScript({target: {tabId}, files: ['content.js']});
    } catch (error) {
      throw new TabExtractionError(
        `Could not access this page: ${error instanceof Error ? error.message : String(error)}`,
        tabId,
        tabUrl,
        {cause: error},
      );
    }

    // A newly injected script can take a moment to register its listener.
    try {
      response = await browser.tabs.sendMessage(tabId, {type: 'EXTRACT_ARTICLE'}) as ExtractResponse;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 150));
      response = await browser.tabs.sendMessage(tabId, {type: 'EXTRACT_ARTICLE'}) as ExtractResponse;
    }
  }

  if (response?.success && response.data) {
    return response.data;
  }

  throw new Error(response?.error ?? 'Failed to extract article');
}

function isRestrictedPage(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ['about:', 'chrome:', 'moz-extension:', 'resource:', 'view-source:'].includes(parsed.protocol)
      || parsed.hostname === 'addons.mozilla.org';
  } catch {
    return false;
  }
}

/**
 * Handle summarization request
 */
async function handleSummarize(article: ArticleData, providerOverride?: ProviderType): Promise<SummarizeResponse> {
  try {
    // Get settings
    const settings = await getSettings();

    // Use provider override if specified
    const provider: ProviderType = providerOverride ?? settings.provider;

    // Check cache first
    if (settings.cacheEnabled) {
      const cachedSummary = await getCachedSummary(article, {
        provider,
        model: settings.model,
        customPrompt: settings.customPrompt,
        summaryStyle: settings.summaryStyle,
      });

      if (cachedSummary) {
        // If ML is enabled, run classification on cached summary too
        let classificationResult: ClassificationResult | undefined = undefined;

        if (settings.mlEnabled) {
          try {
            console.log('Background: Running ML classification on cached summary...');
            const classification = await textClassifierService.classifyText(
              cachedSummary.summary,
              {
                timeout: settings.mlTimeout,
                modelHub: settings.mlModelHub,
                // NOTE: NOT passing modelId - using task-based approach
              },
            );

            if (classification.ok) {
              classificationResult = classification;
              console.log('Background: ML classification completed for cached summary:', classificationResult);
            } else {
              console.warn('Background: ML classification failed for cached summary:', classification.error);
            }
          } catch (classificationError) {
            console.error('Background: ML classification error for cached summary:', classificationError);
          }
        }

        return {
          type: 'SUMMARIZE_RESPONSE',
          summary: cachedSummary.summary,
          success: true,
          cached: true,
          // Include cached agent labels if present
          agentLabels: cachedSummary.agentLabels,
          classification: classificationResult?.ok ? {
            label: classificationResult?.label,
            score: classificationResult?.score,
            modelId: classificationResult?.modelId,
            inferenceTime: classificationResult?.inferenceTime,
            ok: classificationResult?.ok,
          } : undefined,
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

    // Cache the result (without agent labels initially)
    if (settings.cacheEnabled) {
      await cacheSummary(article, settings, result.summary ?? '');
    }

    // Run ML classification if ML is enabled
    let classificationResult: ClassificationResult | undefined = undefined;

    if (settings.mlEnabled) {
      try {
        console.log('Background: Running ML classification on summary...');
        // Use task-based classification (no modelId passed per user requirement)
        const classification = await textClassifierService.classifyText(
          result.summary || '',
          {
            timeout: settings.mlTimeout,
            modelHub: settings.mlModelHub,
            // NOTE: NOT passing modelId - using task-based approach
          },
        );

        if (classification.ok) {
          classificationResult = classification;
          console.log('Background: ML classification completed:', classificationResult);
        } else {
          // Classification failed but we still return the summary
          console.warn('Background: ML classification failed:', classification.error);
          classificationResult = classification;
        }
      } catch (classificationError) {
        console.error('Background: ML classification error:', classificationError);
        classificationResult = {
          ok: false,
          error: classificationError instanceof Error ? classificationError.message : 'Classification failed',
        };
      }
    }

    return {
      type: 'SUMMARIZE_RESPONSE',
      summary: result.summary,
      success: true,
      cached: false,
      tokenCount: result.tokenCount,
      classification: classificationResult?.ok ? {
        label: classificationResult?.label,
        score: classificationResult?.score,
        modelId: classificationResult?.modelId,
        inferenceTime: classificationResult?.inferenceTime,
        ok: classificationResult?.ok,
      } : undefined, // Only include if successful
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
  settings: ExtensionSettings,
): Promise<{ summary: string; tokenCount?: number; error?: string }> {
  try {
    // Special handling for Firefox ML provider
    if (settings.provider === 'firefox-ml') {
      return await callFirefoxMLProvider(article, settings);
    }

    const provider = createProvider(
      settings.provider,
      settings.apiKey,
      {endpoint: settings.customEndpoint},
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
      },
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
        throw new Error(errorJson.error?.message ?? errorJson.message ?? `HTTP ${response.status}`);
      } catch (parseError) {
        throw new Error(`HTTP ${response.status}: ${errorText}`, {cause: parseError});
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
 * Call Mistral agent for classification
 * Uses the Conversations API with the configured agent
 */
async function callMistralAgentClassification(
  summary: string,
  agentId: string,
  agentVersion: string,
  apiKey: string,
): Promise<{ labels?: string[]; error?: string }> {
  try {
    // Check that we have valid agent configuration
    if (!agentId || !agentVersion) {
      return { error: 'Agent ID and version are required for classification' };
    }

    if (!apiKey) {
      return { error: 'API key is required for Mistral agent classification' };
    }

    // Build the request for Mistral Conversations API
    // Send inputs as a user message with role and content
    const requestBody = {
      agent_id: agentId,
      agent_version: agentVersion,
      inputs: [
        {
          role: 'user',
          content: summary,
        },
      ],
      store: false,
    };

    // Call Mistral Conversations API
    const response = await fetch('https://api.mistral.ai/v1/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      // 30-second timeout as per requirements
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error?.message ?? errorJson.message ?? `HTTP ${response.status}`);
      } catch (parseError) {
        throw new Error(`HTTP ${response.status}: ${errorText}`, { cause: parseError });
      }
    }

    const responseData = await response.json();

    // Parse the response to extract the final message output
    // Mistral returns outputs through the `outputs` field
    // Each output has a `content` field directly (not message.content)
    if (responseData.outputs && Array.isArray(responseData.outputs) && responseData.outputs.length > 0) {
      // Get the final output
      const finalOutput = responseData.outputs[responseData.outputs.length - 1];
      
      // Check if it's a message output with content
      if (finalOutput.content) {
        try {
          // The content should be the JSON array of labels or a string
          let content = finalOutput.content;
          
          // Handle text chunks - content might be a string that needs parsing
          if (typeof content === 'string') {
            // Try to parse as JSON first
            try {
              content = JSON.parse(content);
            } catch {
              // Not JSON, use as-is
            }
          }
          
          // Now content should be the array of labels or still a string
          let labels: unknown[];
          if (Array.isArray(content)) {
            labels = content;
          } else if (typeof content === 'string') {
            // Try to parse the string as JSON
            try {
              const parsed = JSON.parse(content);
              labels = Array.isArray(parsed) ? parsed : [content];
            } catch {
              // Not JSON, treat as single label (but we need 5)
              labels = [content];
            }
          } else {
            return { error: 'Invalid content format in agent response' };
          }
          
          // Validate that we have exactly 5 nonempty strings
          if (labels.length === 5) {
            const validLabels = labels.filter((label: unknown) => 
              typeof label === 'string' && label.trim() !== '',
            );
            
            if (validLabels.length === 5) {
              return { labels: validLabels as string[] };
            } else {
              return { error: 'Invalid label format: expected 5 nonempty strings' };
            }
          } else {
            return { error: `Invalid label format: expected array of 5 strings, got ${labels.length} items` };
          }
        } catch (parseError) {
          console.error('Failed to parse agent response:', parseError);
          return { error: 'Failed to parse agent response as JSON array' };
        }
      } else {
        return { error: 'No content in final agent output' };
      }
    } else {
      return { error: 'No outputs in agent response' };
    }
  } catch (error) {
    return {
      error: `Agent classification error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Call Firefox ML API for local summarization
 * Uses mlEngineManager abstraction instead of direct browser.trial.ml API calls
 */
async function callFirefoxMLProvider(
  article: ArticleData,
  settings: ExtensionSettings,
): Promise<{ summary: string; tokenCount?: number; error?: string }> {
  try {
    // Check if we have the trialML permission
    const hasPermission = await browser.permissions.contains({permissions: ['trialML']});
    if (!hasPermission) {
      throw new Error('trialML permission is required for Firefox ML. Please grant the permission in the extension options or settings.');
    }

    // Get the model to use
    const model = settings.model ?? 'Xenova/distilbart-cnn-6-6';
    const temperature = settings.temperature ?? 0.7;
    const maxTokens = settings.maxTokens ?? 500;

    // Create summarization prompt with system prompt
    const systemPrompt = getSystemPrompt(settings.summaryStyle, settings.customPrompt);

    // Build the prompt for summarization
    // Firefox ML summarization models typically expect a direct instruction
    const prompt = `${systemPrompt}\n\nArticle: ${article.title || 'Untitled'}\n\n${article.textContent}`;

    console.log('Firefox ML: Creating summarization engine with model:', model);

    try {
      // Configure the summarization engine with task-specific options
      const engineConfig: Partial<MLEngineConfig> = {
        taskName: 'summarization',
        modelHub: 'mozilla',
        modelId: model,
        taskOptions: {
          max_length: maxTokens,
          min_length: 30,
          do_sample: temperature > 0,
          temperature: temperature,
          num_return_sequences: 1,
        },
      };

      // Get or create the engine using mlEngineManager
      const timeout = settings.mlTimeout ?? 720000;
      const result = await mlEngineManager.runEngine(prompt, timeout, engineConfig);

      console.log('Firefox ML: Engine execution completed, result:', result);

      // Handle the result
      // For summarization, the result is typically an array with summary_text in the first element
      if (Array.isArray(result) && result.length > 0) {
        const firstResult = result[0];
        let summary: string = firstResult?.summary_text ?? '';

        if (summary?.trim()) {
          // Clean up the summary by removing any trailing special tokens
          // Firefox ML models may add their own stop tokens
          summary = summary.trim();

          console.log('Firefox ML: Successfully generated summary:', `${summary.substring(0, 200)}...`);

          return {
            summary: summary,
            tokenCount: estimateTokenCount(summary),
          };
        } else {
          throw new Error('Firefox ML returned empty summary');
        }
      } else {
        throw new Error('Firefox ML returned no results');
      }
    } catch (mlError) {
      console.error('Firefox ML: Error during model execution:', mlError);

      // Enhanced error messages for Firefox ML
      const errorMessage = mlError instanceof Error ? mlError.message : String(mlError);

      if (errorMessage.includes('permission') || errorMessage.includes('Permission')) {
        throw new Error(
          'ML permission denied. Please grant trialML permission in extension settings and ensure Firefox ML is enabled in about:config (browser.ml.enable and extensions.ml.enabled must be true).',
          {cause: mlError},
        );
      }

      if (errorMessage.includes('model') || errorMessage.includes('Model')) {
        throw new Error(
          `Model ${model} not available. Firefox ML models need to be downloaded on first use. Check that you have internet connectivity for the initial model download.`,
          {cause: mlError},
        );
      }

      if (errorMessage.includes('unavailable') || errorMessage.includes('not available')) {
        throw new Error(
          'Firefox ML API is not available in this Firefox version. Requires Firefox Nightly or Beta with ML enabled in about:config.',
          {cause: mlError},
        );
      }

      throw new Error(`Firefox ML error: ${errorMessage}`, {cause: mlError});
    }
  } catch (error) {
    return {
      summary: '',
      error: `Firefox ML error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Estimate token count for text (used by Firefox ML)
 */
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

type SummaryPrompt = keyof {
  concise: string;
  detailed: string;
  bullet_points: string;
  custom: string;
}

/**
 * Get system prompt for summarization (moved here to avoid circular dependency)
 */
function getSystemPrompt(style?: SummaryPrompt, customPrompt?: string): string {
  const SUMMARY_PROMPTS: Record<string & SummaryPrompt, string> = {
    concise: 'You are a helpful assistant that summarizes articles. Please provide a concise summary in 2-3 sentences.',
    detailed: 'You are a helpful assistant that summarizes articles. Please provide a detailed summary covering all the main points.',
    bullet_points: 'You are a helpful assistant that summarizes articles. Please provide a bullet-point summary of the key points.',
    custom: '',
  };

  // Use custom prompt if provided
  if (customPrompt && customPrompt.trim() !== '') {
    return customPrompt;
  }

  return SUMMARY_PROMPTS[style ?? 'concise'];
}

/**
 * Handle GET_SETTINGS request
 */
async function handleGetSettings(): Promise<{ type: string; success: boolean; data: ExtensionSettings }> {
  const settings = await getSettings();
  return {
    type: 'GET_SETTINGS_RESPONSE',
    success: true,
    data: settings,
  };
}

/**
 * Handle SAVE_SETTINGS request
 */
async function handleSaveSettings(settings: Partial<ExtensionSettings>): Promise<{
  type: string;
  success: boolean;
  error?: string
}> {
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
async function handleRefreshModels(providerType: ProviderType, apiKey: string): Promise<{
  success: boolean;
  data?: { models: string[] };
  error?: string
}> {
  try {
    // Firefox ML doesn't need API key and has fixed models
    if (providerType === 'firefox-ml') {
      // Return the fixed list of Firefox ML summarization models
      return {
        success: true,
        data: {
          models: [
            'Xenova/distilbart-cnn-6-6',
            'Xenova/distilbart-cnn-12-6',
          ],
        },
      };
    }

    if (!apiKey || apiKey.trim() === '') {
      return {success: false, error: 'API key is required'};
    }

    // Create provider instance
    const provider = createProvider(providerType, apiKey);

    // Call the provider's fetchModels method
    const models = (await provider.fetchModels(apiKey)).sort((a, b) => a.localeCompare(b));

    return {
      success: true,
      data: {models},
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
async function testProviderConnection(providerType: ProviderType, apiKey: string): Promise<{
  type: string;
  success: boolean;
  data?: { valid: boolean };
  error?: string
}> {
  try {
    // Firefox ML doesn't require an API key
    if (providerType === 'firefox-ml') {
      // Check permission
      const hasPermission = await browser.permissions.contains({permissions: ['trialML']});
      if (!hasPermission) {
        return {
          type: 'TEST_PROVIDER_RESPONSE',
          success: false,
          error: 'trialML permission is required for Firefox ML. Please grant permission in extension settings.',
        };
      }

      return {type: 'TEST_PROVIDER_RESPONSE', success: true, data: {valid: true}};
    }

    const result = await handleRefreshModels(providerType, apiKey);
    console.log('Background: Provider test result:', result);
    return {
      type: 'TEST_PROVIDER_RESPONSE',
      success: true,
      data: {valid: result.success},
      error: result.error,
    };
  } catch (error) {
    return {
      type: 'TEST_PROVIDER_RESPONSE',
      success: false,
      error: `Connection test failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// ML Classification Message Handlers
// ============================================================================

/**
 * Handle CLASSIFY_TEXT request
 */
async function handleClassifyText(request: ClassifyTextRequest): Promise<{
  type: string;
  success: boolean;
  data?: ClassificationResult;
  error?: string;
}> {
  try {
    console.log('Background: Handling CLASSIFY_TEXT request');

    // Check if ML is enabled in settings
    const settings = await getSettings();
    if (settings.mlEnabled === false) {
      console.log('Background: ML is disabled in settings');
      return {
        type: 'CLASSIFY_RESULT',
        success: false,
        data: {
          ok: false,
          error: 'ML classification is disabled. Enable in Options page.',
        },
      };
    }

    // Use ML service for classification
    const result = await textClassifierService.classifyText(
      request.text,
      {
        modelId: request.modelId,
        timeout: request.timeout,
        modelHub: settings.mlModelHub,
      },
    );

    console.log('Background: Classification result:', result);
    return {
      type: 'CLASSIFY_RESULT',
      success: true,
      data: result,
    };
  } catch (error) {
    console.error('Background: Classification failed:', error);
    return {
      type: 'CLASSIFY_RESULT',
      success: false,
      data: {
        ok: false,
        error: `Classification error: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

/**
 * Handle GET_ML_PERMISSION_STATUS request
 */
async function handleGetMLPermissionStatus(): Promise<{
  type: string;
  success: boolean;
  data?: { granted: boolean };
  error?: string
}> {
  try {
    const granted = await mlPermissionService.checkPermission();
    console.log('Background: ML permission status:', granted);
    return {
      type: 'ML_PERMISSION_STATUS',
      success: true,
      data: {granted},
    };
  } catch (error) {
    console.error('Background: Error checking ML permission:', error);
    return {
      type: 'ML_PERMISSION_STATUS',
      success: false,
      data: {granted: false},
      error: error instanceof Error ? error.message : 'Error checking ML permission',
    };
  }
}

/**
 * Handle NOTIFY_ML_PERMISSION_GRANTED notification
 * This is called from the UI after the user has granted permission via browser.permissions.request()
 */
async function handleNotifyMLPermissionGranted(): Promise<{ type: string; success: boolean; error?: string }> {
  try {
    console.log('Background.handleNotifyMLPermissionGranted: Received NOTIFY_ML_PERMISSION_GRANTED message');
    console.log('Background.handleNotifyMLPermissionGranted: Calling mlPermissionService.notifyPermissionGranted()');

    // Update the cached permission state in the background script
    mlPermissionService.notifyPermissionGranted();

    console.log('Background: ML permission notification processed successfully');
    return {
      type: 'NOTIFY_ML_PERMISSION_GRANTED_RESPONSE',
      success: true,
    };
  } catch (error) {
    console.error('Background: Error processing ML permission notification:', error);
    return {
      type: 'NOTIFY_ML_PERMISSION_GRANTED_RESPONSE',
      success: false,
      error: `Notification processing failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Handle CLEAR_ML_CACHE request
 */
async function handleClearMLCache(): Promise<{
  type: string;
  success: boolean;
  data?: { success: boolean; error?: string };
  error?: string;
}> {
  try {
    console.log('Background: Clearing ML model cache...');
    const result = await textClassifierService.clearCache();

    if (result.success) {
      console.log('Background: ML cache cleared successfully');
      return {
        type: 'CLEAR_ML_CACHE_RESPONSE',
        success: true,
        data: {success: true},
      };
    } else {
      console.log('Background: ML cache clear failed:', result.error);
      return {
        type: 'CLEAR_ML_CACHE_RESPONSE',
        success: false,
        data: {success: false, error: result.error},
      };
    }
  } catch (error) {
    console.error('Background: Error clearing ML cache:', error);
    return {
      type: 'CLEAR_ML_CACHE_RESPONSE',
      success: false,
      data: {
        success: false,
        error: `Cache clear failed: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

/**
 * Handle CHECK_ML_AVAILABILITY request
 */
async function handleCheckMLAvailability(): Promise<{
  type: string;
  success: boolean;
  data?: { available: boolean; apiAvailable: boolean; permissionGranted: boolean };
  error?: string;
}> {
  try {
    const apiAvailable = mlPermissionService.isAPIAvailable();
    const permissionGranted = await mlPermissionService.checkPermission();
    const available = apiAvailable && permissionGranted;

    console.log('Background: ML availability check:', {
      apiAvailable,
      permissionGranted,
      available,
    });

    return {
      type: 'ML_AVAILABILITY_RESPONSE',
      success: true,
      data: {
        available,
        apiAvailable,
        permissionGranted,
      },
    };
  } catch (error) {
    console.error('Background: Error checking ML availability:', error);
    return {
      type: 'ML_AVAILABILITY_RESPONSE',
      success: false,
      data: {
        available: false,
        apiAvailable: false,
        permissionGranted: false,
      },
      error: error instanceof Error ? error.message : 'Error checking ML availability',
    };
  }
}

/**
 * Handle CLASSIFY_WITH_AGENT request
 */
async function handleClassifyWithAgent(request: ClassifyWithAgentRequest): Promise<{
  type: string;
  success: boolean;
  labels?: string[];
  error?: string;
}> {
  try {
    const settings = await getSettings();
    
    // Only proceed if Mistral is the provider and agent is configured
    if (settings.provider !== 'mistral' || !settings.mistralAgentId || !settings.mistralAgentVersion) {
      return {
        type: 'CLASSIFY_WITH_AGENT_RESPONSE',
        success: false,
        error: 'Mistral agent classification requires Mistral provider with valid agent ID and version',
      };
    }

    const result = await callMistralAgentClassification(
      request.summary,
      request.agentId || settings.mistralAgentId,
      request.agentVersion || settings.mistralAgentVersion,
      settings.apiKey,
    );

    if (result.labels) {
      return {
        type: 'CLASSIFY_WITH_AGENT_RESPONSE',
        success: true,
        labels: result.labels,
      };
    } else {
      return {
        type: 'CLASSIFY_WITH_AGENT_RESPONSE',
        success: false,
        error: result.error ?? 'Agent classification failed',
      };
    }
  } catch (error) {
    console.error('Background: Error in handleClassifyWithAgent:', error);
    return {
      type: 'CLASSIFY_WITH_AGENT_RESPONSE',
      success: false,
      error: error instanceof Error ? error.message : 'Agent classification error',
    };
  }
}

/**
 * Main message handler
 */
async function handleMessage(request: Message): Promise<unknown> {
  switch (request.type) {
    case 'EXTRACT_AND_SUMMARIZE':
      try {
        const article = await extractArticleFromActiveTab(request.tabId);
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
        const message = error instanceof Error ? error.message : String(error);
        const extractionError = error instanceof TabExtractionError ? error : undefined;
        const restricted = isRestrictedPage(extractionError?.tabUrl);
        const hostPermissionError = /missing host permission|host permission|cannot access contents of/i;
        const hasHostPermissionError = hostPermissionError.test(message);
        const needsHostPermission = !restricted && hasHostPermissionError;
        return {
          type: 'SUMMARIZE_RESPONSE',
          error: restricted
            ? 'Firefox does not allow extensions to read this page. Open a regular website and try again.'
            : needsHostPermission
              ? 'Firefox has not granted this extension access to the website. Choose “Grant website access” to allow access on all websites, then retry.'
              : `Extraction error: ${message}`,
          permissionRequired: needsHostPermission,
          tabId: extractionError?.tabId,
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
          data: {cleared: cacheKeys.length},
        };
      } catch (error) {
        return {
          type: 'CLEAR_CACHE_RESPONSE',
          success: false,
          error: `Failed to clear cache: ${error}`,
        };
      }

    // ML Classification cases
    case 'CLASSIFY_TEXT':
      return handleClassifyText(request);

    case 'GET_ML_PERMISSION_STATUS':
      return handleGetMLPermissionStatus();

    case 'NOTIFY_ML_PERMISSION_GRANTED':
      console.log('Background.handleMessage: Processing NOTIFY_ML_PERMISSION_GRANTED case');
      return handleNotifyMLPermissionGranted();

    case 'CLEAR_ML_CACHE':
      return handleClearMLCache();

    case 'CHECK_ML_AVAILABILITY':
      return handleCheckMLAvailability();

    case 'CLASSIFY_WITH_AGENT':
      return handleClassifyWithAgent(request as ClassifyWithAgentRequest);

    case 'SET_THEME': {
      const themeRequest = request as SetThemeRequest;
      // Broadcast the theme change to all extension pages (popup, options, sidebar).
      // runtime.sendMessage does not reach the background itself, so no loop here.
      browser.runtime.sendMessage({type: 'THEME_CHANGED', theme: themeRequest.theme})
        .catch(() => {
          // Some contexts may not be open or may not handle the message; ignore.
        });
      return {type: 'SET_THEME_RESPONSE', success: true};
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
browser.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  handleMessage(request as Message)
    .then(response => sendResponse(response))
    .catch(error => sendResponse({
      type: 'ERROR_RESPONSE',
      error: `Unhandled error: ${error instanceof Error ? error.message : String(error)}`,
      success: false,
    }));

  // Return true to indicate we will send a response asynchronously
  return true;
});

// Set up ML progress event broadcasting
// This sends progress events to all connected front-ends (popup, sidebar, options)
function setupMLProgressBroadcasting(): void {
  try {
    console.log('Background: Setting up ML progress event broadcasting');

    browser.trial.ml.onProgress.addListener((progressEvent: { [p: string]: unknown }) => {
      console.log('Background: ML progress event received:', progressEvent);

      const pEvent = progressEvent as {
        progress: number;
        modelId?: string;
        status?: string;
        message?: string;
      };

      // Broadcast progress to all connected front-ends
      const progressMessage = {
        type: 'MODEL_DOWNLOAD_PROGRESS',
        progress: Math.round(pEvent.progress * 100) || 0,
        modelId: pEvent.modelId ?? 'unknown',
        status: pEvent.status ?? 'downloading',
        message: pEvent.message,
      };

      // Send to all tabs that might be listening
      browser.tabs.query({}).then(tabs => {
        tabs.forEach(tab => {
          if (tab.id) {
            browser.tabs.sendMessage(tab.id, progressMessage).catch(() => {
              // Ignore errors - tab might not have our content script
            });
          }
        });
      });
    });

    console.log('Background: ML progress broadcasting enabled');
  } catch (error) {
    console.error('Background: Error setting up ML progress broadcasting:', error);
  }
}

// Initialize ML progress broadcasting
setupMLProgressBroadcasting();

setupSidebarShortcut(browser);

console.log('Article Summarizer background service worker loaded');
