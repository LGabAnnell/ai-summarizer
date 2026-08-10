/**
 * Background Service Worker for Article Summarizer Extension
 * Handles communication between popup, content scripts, and AI providers
 */

// Import provider factory
import {createProvider} from './providers';
import browser from 'webextension-polyfill';
import {ArticleData} from '@shared/lib/models/article.model';
import {CachedSummaryData, Message, SummarizeResponse} from '@shared/lib/models/summary.model';

// Import ML services
import {ClassificationResult, textClassifierService} from './ml/text-classifier.service';
import {mlPermissionService} from './ml/ml-permission.service';
import {MLEngineConfig, mlEngineManager} from './ml/ml-engine-manager';
import {ProviderType} from "@shared/lib/models/settings.model";
import {Provider} from "@angular/core";

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
};

/**
 * Generate a cache key for a given article and settings
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
 * Get cached summary for an article
 */
async function getCachedSummary(article: ArticleData, settings: Partial<ExtensionSettings>): Promise<string | null> {
  const cacheKey = generateCacheKey(article, settings);
  const result = await browser.storage.local.get(cacheKey) as Record<string, CachedSummaryData>;

  if (result[cacheKey]) {
    const cached = result[cacheKey];

    // Check if cache has expired
    if (cached.timestamp && Date.now() - cached.timestamp < (settings.cacheTTL ?? 7) * 24 * 60 * 60 * 1000) {
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
async function cacheSummary(
  article: ArticleData,
  settings: Partial<ExtensionSettings>,
  summary: string,
): Promise<void> {
  const cacheKey = generateCacheKey(article, settings);
  await browser.storage.local.set({
    [cacheKey]: {
      summary,
      timestamp: Date.now(),
      url: article.url,
      provider: settings.provider ?? 'mistral',
      model: settings.model ?? 'mistral-tiny',
    },
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

/**
 * Send message to a specific tab's content script
 */
async function sendMessageToTab(tabId: number, message: Message): Promise<unknown> {
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
  const tabs = await browser.tabs.query({active: true, currentWindow: true});

  if (tabs.length === 0 || !tabs[0].id) {
    throw new Error('No active tab found');
  }

  const tabId = tabs[0].id;

  // Inject content script if not already injected
  try {
    await browser.scripting.executeScript({
      target: {tabId},
      files: ['content.js'],
    });
  } catch (error) {
    console.log('Content script may already be injected:', error);
  }

  // Send extraction request
  const response = await sendMessageToTab(tabId, {type: 'EXTRACT_ARTICLE'}) as {
    success: boolean;
    data?: ArticleData;
    error?: string;
  };

  if (response?.success && response.data) {
    return response.data as ArticleData;
  }

  throw new Error(response?.error ?? 'Failed to extract article');
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
            console.log('Background: Running classification on cached summary...');
            const classification = await textClassifierService.classifyText(
              cachedSummary,
              {
                timeout: settings.mlTimeout,
                modelHub: settings.mlModelHub,
                // NOTE: NOT passing modelId - using task-based approach
              },
            );

            if (classification.ok) {
              classificationResult = classification;
              console.log('Background: Classification completed for cached summary:', classificationResult);
            } else {
              console.warn('Background: Classification failed for cached summary:', classification.error);
            }
          } catch (classificationError) {
            console.error('Background: Classification error for cached summary:', classificationError);
          }
        }

        return {
          type: 'SUMMARIZE_RESPONSE',
          summary: cachedSummary,
          success: true,
          cached: true,
          classification: classificationResult?.ok ? {
            label: classificationResult.label,
            score: classificationResult.score,
            modelId: classificationResult.modelId,
            inferenceTime: classificationResult.inferenceTime,
            ok: classificationResult.ok,
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

    // Cache the result
    if (settings.cacheEnabled) {
      await cacheSummary(article, settings, result.summary ?? '');
    }

    // Run classification if ML is enabled
    let classificationResult: ClassificationResult | undefined = undefined;

    if (settings.mlEnabled) {
      try {
        console.log('Background: Running classification on summary...');
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
          console.log('Background: Classification completed:', classificationResult);
        } else {
          // Classification failed but we still return the summary
          console.warn('Background: Classification failed:', classification.error);
          classificationResult = classification;
        }
      } catch (classificationError) {
        console.error('Background: Classification error:', classificationError);
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
        label: classificationResult.label,
        score: classificationResult.score,
        modelId: classificationResult.modelId,
        inferenceTime: classificationResult.inferenceTime,
        ok: classificationResult.ok,
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
        throw new Error(errorJson.error?.message || errorJson.message || `HTTP ${response.status}`);
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

        if (summary && summary.trim()) {
          // Clean up the summary by removing any trailing special tokens
          // Firefox ML models may add their own stop tokens
          summary = summary.trim();

          // Remove common tokens that models might add
          const cleanupPatterns = [
            /\n+$/, // Remove trailing newlines
            /<\/s>$/, // Remove end-of-sequence tokens
            /<s>$/, // Remove start tokens if at end
            /\[\/INST\]$/, // Remove instruction end tokens
          ];

          for (const pattern of cleanupPatterns) {
            summary = summary.replace(pattern, '');
          }

          summary = summary.trim();

          console.log('Firefox ML: Successfully generated summary:', `${summary.substring(0, 200)  }...`);

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
    const models = await provider.fetchModels(apiKey);

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
async function testProviderConnection(providerType: string, apiKey: string): Promise<{
  valid: boolean;
  error?: string
}> {
  try {
    // Firefox ML doesn't require an API key
    if (providerType === 'firefox-ml') {
      // Check permission
      const hasPermission = await browser.permissions.contains({permissions: ['trialML']});
      if (!hasPermission) {
        return {
          valid: false,
          error: 'trialML permission is required for Firefox ML. Please grant permission in extension settings.',
        };
      }

      return {valid: true};
    }

    return {valid: true};
  } catch (error) {
    return {
      valid: false,
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
async function handleClassifyText(request: ClassifyTextRequest): Promise<ClassificationResult & { type: string }> {
  try {
    console.log('Background: Handling CLASSIFY_TEXT request');

    // Check if ML is enabled in settings
    const settings = await getSettings();
    if (settings.mlEnabled === false) {
      console.log('Background: ML is disabled in settings');
      return {
        type: 'CLASSIFY_RESULT',
        ok: false,
        error: 'ML classification is disabled. Enable in Options page.',
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
      ...result,
    };
  } catch (error) {
    console.error('Background: Classification failed:', error);
    return {
      type: 'CLASSIFY_RESULT',
      ok: false,
      error: `Classification error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Handle GET_ML_PERMISSION_STATUS request
 */
async function handleGetMLPermissionStatus(): Promise<{ type: string; granted: boolean }> {
  try {
    const granted = await mlPermissionService.checkPermission();
    console.log('Background: ML permission status:', granted);
    return {
      type: 'ML_PERMISSION_STATUS',
      granted,
    };
  } catch (error) {
    console.error('Background: Error checking ML permission:', error);
    return {
      type: 'ML_PERMISSION_STATUS',
      granted: false,
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
async function handleClearMLCache(): Promise<{ type: string; success: boolean; error?: string }> {
  try {
    console.log('Background: Clearing ML model cache...');
    const result = await textClassifierService.clearCache();

    if (result.success) {
      console.log('Background: ML cache cleared successfully');
      return {
        type: 'CLEAR_ML_CACHE_RESPONSE',
        success: true,
      };
    } else {
      console.log('Background: ML cache clear failed:', result.error);
      return {
        type: 'CLEAR_ML_CACHE_RESPONSE',
        success: false,
        error: result.error,
      };
    }
  } catch (error) {
    console.error('Background: Error clearing ML cache:', error);
    return {
      type: 'CLEAR_ML_CACHE_RESPONSE',
      success: false,
      error: `Cache clear failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Handle CHECK_ML_AVAILABILITY request
 */
async function handleCheckMLAvailability(): Promise<{
  type: string;
  available: boolean;
  apiAvailable: boolean;
  permissionGranted: boolean;
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
      available,
      apiAvailable,
      permissionGranted,
    };
  } catch (error) {
    console.error('Background: Error checking ML availability:', error);
    return {
      type: 'ML_AVAILABILITY_RESPONSE',
      available: false,
      apiAvailable: false,
      permissionGranted: false,
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

    browser.trial.ml.onProgress.addListener((progressEvent: any) => {
      console.log('Background: ML progress event received:', progressEvent);

      // Broadcast progress to all connected front-ends
      const progressMessage = {
        type: 'MODEL_DOWNLOAD_PROGRESS',
        progress: Math.round(progressEvent.progress * 100) || 0,
        modelId: progressEvent.modelId || 'unknown',
        status: progressEvent.status || 'downloading',
        message: progressEvent.message,
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

// Set up keyboard shortcut command listener for sidebar toggle
browser.commands.onCommand.addListener((command) => {
  if (command === 'toggle-sidebar') {
    browser.sidebarAction.toggle();
  }
});

console.log('Article Summarizer background service worker loaded');
